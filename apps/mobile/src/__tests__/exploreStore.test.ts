/**
 * Explore store — feed correctness (todo.md Wave 2):
 *  - focus sport persisted per account, reset on logout / account switch
 *  - stale responses (slow running after switching to golf) are dropped
 *  - fetchMore follows the cursor and appends without duplicates
 *  - card actions use the card's own sport, never the newly selected one
 *  - request failure is an error state, distinct from "no results"
 */

import * as SecureStore from 'expo-secure-store';

import { api } from '../lib/api';
import { feedKey, findFeedCard, focusStorageKey, useExploreStore, type FeedCard } from '../stores/explore';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockGetItem = SecureStore.getItemAsync as jest.Mock;
const mockSetItem = SecureStore.setItemAsync as jest.Mock;

function card(userId: string, sport = 'running') {
  return {
    userId,
    displayName: userId.toUpperCase(),
    photoUrls: ['/media/a.jpg'],
    sportProfiles: [{ sport, level: 'intermediate' }],
    compatibility: { tier: 'compatible', reasons: [], caveats: [] },
  };
}

function page(items: unknown[], nextCursor: string | null = null, extra: object = {}) {
  return { items, total: items.length, limit: 20, offset: 0, nextCursor, viewerSetupRequired: false, poolLimit: 200, ...extra };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const store = () => useExploreStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItem.mockResolvedValue(null);
  store().reset();
});

describe('focus sport', () => {
  it('defaults to the fallback (first configured sport) and persists changes per account', async () => {
    await store().hydrateFocus('user-1', 'golf');
    expect(mockGetItem).toHaveBeenCalledWith(focusStorageKey('user-1'));
    expect(store().focusSport).toBe('golf');

    store().setFocusSport('running');
    expect(store().focusSport).toBe('running');
    expect(mockSetItem).toHaveBeenCalledWith('sportsgang.focus.user-1', 'running');
  });

  it('restores the stored choice for the same account and ignores junk values', async () => {
    mockGetItem.mockResolvedValueOnce('golf');
    await store().hydrateFocus('user-1', 'running');
    expect(store().focusSport).toBe('golf');

    store().reset();
    mockGetItem.mockResolvedValueOnce('tennis');
    await store().hydrateFocus('user-1', 'running');
    expect(store().focusSport).toBe('running');
  });

  it('does not carry filters or cards across an account switch', async () => {
    await store().hydrateFocus('user-1', 'running');
    store().setStrictPace(true);
    store().setView('partners');
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    expect(store().feed.items).toHaveLength(1);

    await store().hydrateFocus('user-2', 'golf');
    expect(store().ownerId).toBe('user-2');
    expect(store().strictPace).toBe(false);
    expect(store().view).toBe('sessions');
    expect(store().feed.items).toEqual([]);
    expect(store().focusSport).toBe('golf');
  });

  it('reset() (logout) clears everything', async () => {
    await store().hydrateFocus('user-1', 'golf');
    store().reset();
    expect(store().ownerId).toBeNull();
    expect(store().focusHydrated).toBe(false);
    expect(store().feed.status).toBe('idle');
  });
});

describe('loadFeed', () => {
  it('loads page one for the focus sport and tags cards with that sport', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')], 'cur-1'));
    await store().loadFeed();
    expect(mockGet).toHaveBeenCalledWith('/discovery?sport=running&limit=20');
    const { feed } = store();
    expect(feed.status).toBe('ready');
    expect(feed.items[0].feedSport).toBe('running');
    expect(feed.items[0].photoUrls).toEqual(['http://api.test/media/a.jpg']);
    expect(feed.nextCursor).toBe('cur-1');
    expect(feed.key).toBe(feedKey('running', false));
  });

  it('does not refetch an already-loaded feed (detail → back keeps the list)', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    await store().loadFeed();
    expect(mockGet).toHaveBeenCalledTimes(1);
    mockGet.mockResolvedValueOnce(page([]));
    await store().loadFeed({ force: true });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('sends strict_pace only for running', async () => {
    store().setStrictPace(true);
    mockGet.mockResolvedValue(page([]));
    await store().loadFeed();
    expect(mockGet).toHaveBeenLastCalledWith('/discovery?sport=running&limit=20&strict_pace=true');
    store().setFocusSport('golf');
    await store().loadFeed();
    expect(mockGet).toHaveBeenLastCalledWith('/discovery?sport=golf&limit=20');
  });

  it('drops a slow running response that lands after switching to golf', async () => {
    const slowRunning = deferred<unknown>();
    mockGet.mockReturnValueOnce(slowRunning.promise);
    const runningLoad = store().loadFeed();

    store().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([card('g1', 'golf')]));
    await store().loadFeed();
    expect(store().feed.items.map((c) => c.userId)).toEqual(['g1']);

    slowRunning.resolve(page([card('r1'), card('r2')]));
    await runningLoad;
    const { feed } = store();
    expect(feed.sport).toBe('golf');
    expect(feed.items.map((c) => c.userId)).toEqual(['g1']);
    expect(feed.status).toBe('ready');
  });

  it('drops a stale error too (no false failure on the new sport)', async () => {
    const slowRunning = deferred<unknown>();
    mockGet.mockReturnValueOnce(slowRunning.promise);
    const runningLoad = store().loadFeed();
    store().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([]));
    await store().loadFeed();
    slowRunning.reject(new Error('Request timed out.'));
    await runningLoad;
    expect(store().feed.status).toBe('ready');
    expect(store().feed.error).toBeNull();
  });

  it('reports request failure as an error, not as an empty result', async () => {
    mockGet.mockRejectedValueOnce(new Error('Cannot reach the server'));
    await store().loadFeed();
    expect(store().feed.status).toBe('error');
    expect(store().feed.error).toBe('Cannot reach the server');
    expect(store().feed.items).toEqual([]);
    // Retrying after an error is always allowed.
    mockGet.mockResolvedValueOnce(page([]));
    await store().loadFeed();
    expect(store().feed.status).toBe('ready');
  });

  it('treats a malformed response as an error', async () => {
    mockGet.mockResolvedValueOnce({ nope: true });
    await store().loadFeed();
    expect(store().feed.status).toBe('error');
  });

  it('surfaces viewerSetupRequired from the server', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')], null, { viewerSetupRequired: true }));
    await store().loadFeed();
    expect(store().feed.viewerSetupRequired).toBe(true);
  });
});

describe('fetchMore', () => {
  it('requests the next cursor page and appends without duplicates', async () => {
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')], 'cur-1'));
    await store().loadFeed();
    mockGet.mockResolvedValueOnce(page([card('b'), card('c')], null));
    await store().fetchMore();
    expect(mockGet).toHaveBeenLastCalledWith('/discovery?sport=running&limit=20&cursor=cur-1');
    expect(store().feed.items.map((c) => c.userId)).toEqual(['a', 'b', 'c']);
    expect(store().feed.nextCursor).toBeNull();
    // Last page: nothing more is requested.
    await store().fetchMore();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('ignores a page-two response after a sport switch', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')], 'cur-1'));
    await store().loadFeed();
    const slowPage2 = deferred<unknown>();
    mockGet.mockReturnValueOnce(slowPage2.promise);
    const more = store().fetchMore();
    store().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([card('g1', 'golf')]));
    await store().loadFeed();
    slowPage2.resolve(page([card('z')]));
    await more;
    expect(store().feed.items.map((c) => c.userId)).toEqual(['g1']);
  });

  it('keeps loaded cards and records a load-more error separately', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')], 'cur-1'));
    await store().loadFeed();
    mockGet.mockRejectedValueOnce(new Error('offline'));
    await store().fetchMore();
    expect(store().feed.status).toBe('ready');
    expect(store().feed.items).toHaveLength(1);
    expect(store().feed.loadMoreError).toBe('offline');
  });
});

describe('recordAction', () => {
  it('posts with the card sport and removes the card', async () => {
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')]));
    await store().loadFeed();
    mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: true, matchId: 'm1' });
    const result = await store().recordAction(store().feed.items[0], 'like');
    expect(mockPost).toHaveBeenCalledWith('/discovery/actions', { targetUserId: 'a', action: 'like', sport: 'running' });
    expect(result?.matchCreated).toBe(true);
    expect(store().feed.items.map((c) => c.userId)).toEqual(['b']);
    expect(store().actingOn).toBeNull();
  });

  it('a stale card acted on after switching sport still uses its own sport', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    const staleCard = store().feed.items[0];
    store().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([card('g1', 'golf')]));
    await store().loadFeed();

    mockPost.mockResolvedValueOnce({ action: 'pass', matchCreated: false });
    await store().recordAction(staleCard, 'pass');
    expect(mockPost).toHaveBeenCalledWith('/discovery/actions', { targetUserId: 'a', action: 'pass', sport: 'running' });
    // The golf feed is untouched.
    expect(store().feed.items.map((c) => c.userId)).toEqual(['g1']);
  });

  it('keeps the card when the action fails', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    mockPost.mockRejectedValueOnce(new Error('offline'));
    await expect(store().recordAction(store().feed.items[0], 'like')).rejects.toThrow('offline');
    expect(store().feed.items).toHaveLength(1);
    expect(store().actingOn).toBeNull();
  });

  it('findFeedCard only returns cards from the matching sport feed', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    expect(findFeedCard('a', 'running')?.displayName).toBe('A');
    expect(findFeedCard('a', 'golf')).toBeUndefined();
  });
});

describe('blockPartner (review R4)', () => {
  const ids = () => store().feed.items.map((c) => c.userId);

  it('a first page requested before the block cannot bring the person back', async () => {
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')]));
    await store().loadFeed();
    const held = deferred<unknown>();
    mockGet.mockReturnValueOnce(held.promise).mockResolvedValueOnce(page([card('b')]));
    const reload = store().loadFeed({ force: true });
    mockPost.mockResolvedValueOnce({ id: 'k1', blockedId: 'a' });
    expect(await store().blockPartner('a')).toBe(true);
    expect(mockPost).toHaveBeenCalledWith('/blocks/a');
    held.resolve(page([card('a'), card('b')]));
    await reload;
    await Promise.resolve();
    // The interrupted first page was asked for again; the stale one was dropped.
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(store().feed.status).toBe('ready');
    expect(ids()).toEqual(['b']);
  });

  it('a next page requested before the block is dropped and can be fetched again', async () => {
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')], 'c1'));
    await store().loadFeed();
    const held = deferred<unknown>();
    mockGet.mockReturnValueOnce(held.promise);
    const more = store().fetchMore();
    expect(store().feed.loadingMore).toBe(true);
    mockPost.mockResolvedValueOnce({ id: 'k1' });
    await store().blockPartner('a');
    expect(store().feed.loadingMore).toBe(false);
    held.resolve(page([card('a'), card('c')]));
    await more;
    expect(ids()).toEqual(['b']);
    mockGet.mockResolvedValueOnce(page([card('c')]));
    await store().fetchMore();
    expect(ids()).toEqual(['b', 'c']);
  });

  it('like/pass and block never overlap, in either order, and repeated taps send once', async () => {
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')]));
    await store().loadFeed();

    const blocking = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocking.promise);
    const block = store().blockPartner('a');
    expect(await store().blockPartner('a')).toBe(false);
    expect(await store().recordAction(store().feed.items[0], 'like')).toBeNull();
    expect(await store().recordAction(store().feed.items[1], 'pass')).toBeNull();
    // A feed reload meanwhile does not release the guard.
    mockGet.mockResolvedValueOnce(page([card('a'), card('b')]));
    await store().loadFeed({ force: true });
    expect(await store().recordAction(store().feed.items[0], 'like')).toBeNull();
    blocking.resolve({ id: 'k1' });
    expect(await block).toBe(true);
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/blocks/a']);

    const liking = deferred<unknown>();
    mockPost.mockReturnValueOnce(liking.promise);
    const like = store().recordAction(store().feed.items[0], 'like');
    expect(await store().blockPartner('b')).toBe(false);
    liking.resolve({ action: 'like', matchCreated: false });
    expect(await like).toEqual({ action: 'like', matchCreated: false });
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/blocks/a', '/discovery/actions']);
    expect(store().actingOn).toBeNull();
  });

  it('a failed block keeps the card and can be retried', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    mockPost.mockRejectedValueOnce(new Error('offline'));
    await expect(store().blockPartner('a')).rejects.toThrow('offline');
    expect(ids()).toEqual(['a']);
    expect(store().actingOn).toBeNull();
    mockPost.mockResolvedValueOnce({ id: 'k1' });
    expect(await store().blockPartner('a')).toBe(true);
    expect(ids()).toEqual([]);
  });

  it('a block that finishes after an account switch leaves the new account alone', async () => {
    await store().hydrateFocus('user-1');
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    const blocking = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocking.promise);
    const block = store().blockPartner('a');
    await store().hydrateFocus('user-2');
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    blocking.resolve({ id: 'k1' });
    expect(await block).toBe(false);
    expect(ids()).toEqual(['a']);
    expect(store().feed.status).toBe('ready');
  });

  it('a like that finishes after an account switch is not reported', async () => {
    await store().hydrateFocus('user-1');
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    const liking = deferred<unknown>();
    mockPost.mockReturnValueOnce(liking.promise);
    const like = store().recordAction(store().feed.items[0], 'like');
    store().reset();
    liking.resolve({ action: 'like', matchCreated: true, matchId: 'm1' });
    expect(await like).toBeNull();
  });

  it('removes the person from whichever sport feed is loaded', async () => {
    mockGet.mockResolvedValueOnce(page([card('a')]));
    await store().loadFeed();
    store().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([card('a', 'golf'), card('g', 'golf')]));
    await store().loadFeed();
    mockPost.mockResolvedValueOnce({ id: 'k1' });
    await store().blockPartner('a');
    expect(ids()).toEqual(['g']);
  });
});

// ─── Owner epochs and action ownership (review Q05) ─────────────────────────
// Reviewer probes (codex-overnight-store) kept as permanent regressions.

describe('owner epochs and action ownership (review Q05)', () => {
  const ids = () => store().feed.items.map((c) => c.userId);
  // A card held by a screen (the fixture is looser than PartnerCard).
  const target = () => ({ ...card('target'), feedSport: 'running' }) as unknown as FeedCard;

  it('a block from the previous owner epoch returns stale after A -> B -> A', async () => {
    await store().hydrateFocus('a');
    mockGet.mockResolvedValueOnce(page([card('target')]));
    await store().loadFeed();
    const blocked = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocked.promise);
    const action = store().blockPartner('target');
    await store().hydrateFocus('b');
    await store().hydrateFocus('a');
    mockGet.mockResolvedValueOnce(page([card('target')]));
    await store().loadFeed();
    blocked.resolve({});
    expect(await action).toBe(false);
    // The returned owner's freshly loaded feed is left alone.
    expect(ids()).toEqual(['target']);
    expect(store().actingOn).toBeNull();
  });

  it('an old action’s finally cannot release a newer same-target block guard', async () => {
    await store().hydrateFocus('a');
    const old = deferred<unknown>();
    const fresh = deferred<unknown>();
    mockPost.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldAction = store().blockPartner('target');
    await store().hydrateFocus('b');
    await store().hydrateFocus('a');
    const newAction = store().blockPartner('target');
    old.resolve({});
    expect(await oldAction).toBe(false);
    expect(store().actingOn).toBe('target');
    // Still guarded: a repeated tap sends nothing.
    expect(await store().blockPartner('target')).toBe(false);
    expect(mockPost).toHaveBeenCalledTimes(2);
    fresh.resolve({});
    expect(await newAction).toBe(true);
    expect(store().actingOn).toBeNull();
  });

  it('a like from the previous owner epoch resolves null after A -> B -> A', async () => {
    await store().hydrateFocus('a');
    const held = deferred<unknown>();
    mockPost.mockReturnValueOnce(held.promise);
    const liking = store().recordAction(target(), 'like');
    await store().hydrateFocus('b');
    await store().hydrateFocus('a');
    held.resolve({ matchCreated: true, matchId: 'old-match' });
    expect(await liking).toBeNull();
  });

  it.each([
    ['an old like, then a new block', 'like', 'block'],
    ['an old block, then a new like', 'block', 'like'],
  ] as const)('%s on the same target: only the new action releases the guard', async (_name, first, second) => {
    await store().hydrateFocus('a');
    const old = deferred<unknown>();
    const fresh = deferred<unknown>();
    mockPost.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const run = (kind: 'like' | 'block') =>
      kind === 'like' ? store().recordAction(target(), 'like') : store().blockPartner('target');
    const oldAction = run(first);
    await store().hydrateFocus('b');
    await store().hydrateFocus('a');
    const newAction = run(second);
    old.reject(new Error('late failure'));
    await expect(oldAction).rejects.toThrow('late failure');
    expect(store().actingOn).toBe('target');
    expect(await store().recordAction(target(), 'pass')).toBeNull();
    expect(mockPost).toHaveBeenCalledTimes(2);
    fresh.resolve({ action: 'like', matchCreated: false });
    expect(await newAction).toBeTruthy();
    expect(store().actingOn).toBeNull();
  });

  it('an action from before logout cannot release or report after it', async () => {
    await store().hydrateFocus('a');
    const held = deferred<unknown>();
    mockPost.mockReturnValueOnce(held.promise);
    const block = store().blockPartner('target');
    store().reset();
    await store().hydrateFocus('a');
    mockPost.mockResolvedValueOnce({ action: 'pass', matchCreated: false });
    expect(await store().recordAction(target(), 'pass')).toEqual({ action: 'pass', matchCreated: false });
    held.resolve({});
    expect(await block).toBe(false);
    expect(store().actingOn).toBeNull();
  });

  it('a focus read from an earlier epoch of the same account is not applied', async () => {
    const first = deferred<string | null>();
    mockGetItem.mockReturnValueOnce(first.promise);
    const hydrating = store().hydrateFocus('a', 'running');
    await store().hydrateFocus('b', 'running');
    mockGetItem.mockResolvedValueOnce(null);
    await store().hydrateFocus('a', 'running');
    expect(store().focusSport).toBe('running');
    first.resolve('golf');
    await hydrating;
    expect(store().focusSport).toBe('running');
  });

  it('CONTROL a block with a held next page cannot resurrect the blocked person', async () => {
    await store().hydrateFocus('a');
    mockGet.mockResolvedValueOnce(page([card('target')], 'cursor'));
    await store().loadFeed();
    const more = deferred<unknown>();
    mockGet.mockReturnValueOnce(more.promise);
    const paging = store().fetchMore();
    mockPost.mockResolvedValueOnce({});
    expect(await store().blockPartner('target')).toBe(true);
    more.resolve(page([card('target')]));
    await paging;
    expect(store().feed.items).toEqual([]);
  });
});
