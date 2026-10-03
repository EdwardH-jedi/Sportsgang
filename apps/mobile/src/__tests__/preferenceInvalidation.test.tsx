/**
 * Review F4 / F6 — a preference change must reach Explore.
 *
 * Promotes docs/run-golf-v2/review-evidence/cache.acceptance.test.js into
 * the normal suite and extends it. Real profile and explore stores, the real
 * useDiscovery hook and the real ExploreScreen run over a controlled
 * transport (lib/api mocked), so every assertion is about which requests are
 * sent and which server answer the user ends up seeing.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SportProfile, UpsertSportProfileRequest } from '@protin/shared-types';

import { api } from '../lib/api';
import { ExploreScreen } from '../screens/explore/ExploreScreen';
import { useAuthStore } from '../stores/auth';
import { useExploreStore } from '../stores/explore';
import { useProfileStore } from '../stores/profile';

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

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('../hooks/useEvents', () => ({
  useEvents: () => ({
    items: [],
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    loadMore: jest.fn(),
    hasMore: false,
    loadingMore: false,
    loadMoreError: null,
  }),
}));

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void) => ReactActual.useEffect(effect, [effect]),
  };
});

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockDelete = api.delete as jest.Mock;

function runRow(overrides: Partial<SportProfile> = {}): SportProfile {
  return {
    id: 'sp-run',
    userId: 'me',
    sport: 'running',
    level: 'intermediate',
    preferredTimes: ['morning'],
    preferencesVersion: 2,
    golfHandicapTenths: null,
    golfHandicapSource: null,
    golfExperience: null,
    golfPartnerIntents: null,
    golfSimilarityToleranceTenths: null,
    golfPreferredHoles: null,
    runPaceMode: 'match_pace',
    runPaceMinSecPerKm: 330,
    runPaceMaxSecPerKm: 390,
    runDistancesKm: [5],
    runGroupStyle: 'stay_together',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  } as SportProfile;
}

function golfRow(overrides: Partial<SportProfile> = {}): SportProfile {
  return runRow({
    id: 'sp-golf',
    sport: 'golf',
    runPaceMode: null,
    runPaceMinSecPerKm: null,
    runPaceMaxSecPerKm: null,
    runDistancesKm: null,
    runGroupStyle: null,
    golfHandicapSource: 'none',
    golfExperience: 'range',
    golfPartnerIntents: ['learn_from_experienced'],
    ...overrides,
  });
}

function partner(userId: string, reason: string) {
  return {
    userId,
    displayName: userId.toUpperCase(),
    photoUrls: [],
    sportProfiles: [],
    compatibility: { tier: 'compatible', reasons: [{ code: 'pace_overlap', text: reason }], caveats: [] },
  };
}

function page(items: unknown[]) {
  return { items, total: items.length, limit: 20, offset: 0, nextCursor: null, viewerSetupRequired: false, poolLimit: 200 };
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

function upsert(row: SportProfile): Promise<void> {
  mockPost.mockResolvedValueOnce(row);
  const body: UpsertSportProfileRequest = { sport: row.sport, level: row.level } as UpsertSportProfileRequest;
  return useProfileStore.getState().upsertSportProfile(body);
}

const explore = () => useExploreStore.getState();
const feedCalls = () =>
  mockGet.mock.calls.filter(([url]) => String(url).startsWith('/discovery')).map(([url]) => String(url));

beforeEach(() => {
  jest.clearAllMocks();
  // Drop queued one-off answers too, so one failing test cannot feed the next.
  mockGet.mockReset();
  mockPost.mockReset();
  mockDelete.mockReset();
  useExploreStore.getState().reset();
  useProfileStore.getState().reset();
  useAuthStore.setState({ user: { id: 'me', email: 'me@example.com' } as never, token: 't' });
});

// ─── Store level (the promoted acceptance scenarios) ─────────────────────────

describe('a preference change invalidates the feed for that sport', () => {
  it('a saved pace change makes the next load ask the server again and show its new answer', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    mockGet.mockResolvedValueOnce(page([partner('old-fit', 'Old pace overlaps')]));
    await explore().loadFeed();
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['old-fit']);

    await upsert(runRow({ runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 }));
    // Dropped at once: no old card or reason is shown while waiting.
    expect(explore().feed.status).toBe('idle');
    expect(explore().feed.items).toEqual([]);

    mockGet.mockResolvedValueOnce(page([partner('new-fit', 'Pace ranges overlap at 10:00–10:30 /km')]));
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(2);
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['new-fit']);
    expect(explore().feed.items[0].compatibility?.reasons[0].text).toContain('10:00');
  });

  it('creating preferences for a sport that had none invalidates it too', async () => {
    useProfileStore.setState({ sportProfiles: [] });
    mockGet.mockResolvedValueOnce({ ...page([]), viewerSetupRequired: true });
    await explore().loadFeed();
    expect(explore().feed.viewerSetupRequired).toBe(true);
    await upsert(runRow());
    mockGet.mockResolvedValueOnce(page([partner('fit', 'Pace overlaps')]));
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(2);
    expect(explore().feed.viewerSetupRequired).toBe(false);
  });

  it('deleting a sport invalidates that sport only', async () => {
    useProfileStore.setState({ sportProfiles: [runRow(), golfRow()] });
    explore().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(page([partner('golfer', 'Welcomes beginners')]));
    await explore().loadFeed();

    // Removing running leaves the golf feed alone…
    mockDelete.mockResolvedValueOnce(undefined);
    await useProfileStore.getState().deleteSportProfile('running');
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(1);
    expect(explore().feed.status).toBe('ready');

    // …removing golf drops it and the next load asks again.
    mockDelete.mockResolvedValueOnce(undefined);
    await useProfileStore.getState().deleteSportProfile('golf');
    expect(explore().feed.status).toBe('idle');
    mockGet.mockResolvedValueOnce({ ...page([]), viewerSetupRequired: true });
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(2);
  });

  it('a failed save is not a preference change', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    mockGet.mockResolvedValueOnce(page([partner('fit', 'Pace overlaps')]));
    await explore().loadFeed();
    const before = useProfileStore.getState().preferenceRevision.running ?? 0;
    mockPost.mockRejectedValueOnce(new Error('Pace bounds must be both set or both empty'));
    await expect(
      useProfileStore.getState().upsertSportProfile({ sport: 'running', level: 'intermediate' } as never)
    ).rejects.toThrow('Pace bounds');
    expect(useProfileStore.getState().preferenceRevision.running ?? 0).toBe(before);
    expect(useProfileStore.getState().sportProfiles).toEqual([runRow()]);
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(1);
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['fit']);
  });

  it('a re-fetch that returns the same preferences is not a change; a different one is', async () => {
    const answer = (rows: SportProfile[], feed: unknown) => async (url: string) => {
      if (url === '/users/me/profile') return { userId: 'me', displayName: 'Me', photos: [] };
      if (url === '/users/me/identity-preferences') return null;
      if (url === '/users/me/sport-profiles') return rows;
      return feed;
    };
    mockGet.mockImplementation(answer([runRow()], page([partner('fit', 'Pace overlaps')])));
    await useProfileStore.getState().fetchProfile(); // first load: no bump
    await explore().loadFeed();
    await useProfileStore.getState().fetchProfile(); // identical: no bump
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(1);

    mockGet.mockImplementation(answer([runRow({ runPaceMinSecPerKm: 400, runPaceMaxSecPerKm: 450 })], page([])));
    await useProfileStore.getState().fetchProfile(); // edited elsewhere
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(2);
  });

  it('the forced refresh control still re-asks without any preference change', async () => {
    mockGet.mockResolvedValue(page([]));
    await explore().loadFeed();
    await explore().loadFeed({ force: true });
    expect(feedCalls()).toHaveLength(2);
  });
});

describe('older responses cannot restore stale recommendations', () => {
  it('a success from before the change is dropped', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    const slow = deferred<unknown>();
    mockGet.mockReturnValueOnce(slow.promise);
    const firstLoad = explore().loadFeed();
    await upsert(runRow({ runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 }));
    mockGet.mockResolvedValueOnce(page([partner('new-fit', 'New pace')]));
    await explore().loadFeed();
    slow.resolve(page([partner('old-fit', 'Old pace')]));
    await firstLoad;
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['new-fit']);
  });

  it('an error or loading completion from before the change is dropped too', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    const slow = deferred<unknown>();
    mockGet.mockReturnValueOnce(slow.promise);
    const firstLoad = explore().loadFeed();
    await upsert(runRow({ runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 }));
    slow.reject(new Error('Network request failed'));
    await firstLoad;
    // Not an error, not loading: simply waiting for a fresh load.
    expect(explore().feed.status).toBe('idle');
    expect(explore().feed.error).toBeNull();
  });

  it('rapid consecutive saves end on the latest answer only', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    const before = useProfileStore.getState().preferenceRevision.running ?? 0;
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = explore().loadFeed();
    await upsert(runRow({ runPaceMinSecPerKm: 500, runPaceMaxSecPerKm: 560 }));
    const b = explore().loadFeed();
    await upsert(runRow({ runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 }));
    mockGet.mockResolvedValueOnce(page([partner('latest', 'Latest pace')]));
    await explore().loadFeed();
    second.resolve(page([partner('middle', 'Middle pace')]));
    first.resolve(page([partner('oldest', 'Old pace')]));
    await Promise.all([a, b]);
    expect(feedCalls()).toHaveLength(3);
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['latest']);
    expect(useProfileStore.getState().preferenceRevision.running).toBe(before + 2);
  });

  it('logout and a different account never see the first account’s feed', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    await explore().hydrateFocus('me');
    const slow = deferred<unknown>();
    mockGet.mockReturnValueOnce(slow.promise);
    const firstLoad = explore().loadFeed();
    // auth.logout() resets both stores.
    useExploreStore.getState().reset();
    useProfileStore.getState().reset();
    await explore().hydrateFocus('someone-else');
    mockGet.mockResolvedValueOnce(page([partner('theirs', 'Their fit')]));
    await explore().loadFeed();
    slow.resolve(page([partner('mine', 'My fit')]));
    await firstLoad;
    expect(explore().ownerId).toBe('someone-else');
    expect(explore().feed.items.map((c) => c.userId)).toEqual(['theirs']);
  });
});

describe('strict pace follows the viewer’s own pace range (F6)', () => {
  it('clearing the pace range switches the filter off (promoted acceptance case)', async () => {
    explore().setStrictPace(true);
    await upsert(runRow({ runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null }));
    expect(explore().strictPace).toBe(false);
  });

  it('removing running or holding a legacy row leaves general browsing usable', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    explore().setStrictPace(true);
    expect(explore().strictPace).toBe(true);
    mockDelete.mockResolvedValueOnce(undefined);
    await useProfileStore.getState().deleteSportProfile('running');
    expect(explore().strictPace).toBe(false);

    // Legacy, incomplete running row (no v2 pace): the filter cannot be turned on.
    useProfileStore.setState({
      sportProfiles: [
        runRow({ preferencesVersion: null, runPaceMode: null, runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null }),
      ],
    });
    explore().setStrictPace(true);
    expect(explore().strictPace).toBe(false);
  });

  it('never sends a strict request after the capability is gone', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    explore().setStrictPace(true);
    mockGet.mockResolvedValue(page([]));
    await explore().loadFeed();
    expect(feedCalls()[0]).toContain('strict_pace=true');
    await upsert(runRow({ runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null }));
    await explore().loadFeed();
    expect(feedCalls()).toHaveLength(2);
    // General browsing, with no invented pace sent in its place.
    expect(feedCalls()[1]).toBe('/discovery?sport=running&limit=20');
  });

  it('even when the filter got stuck on, loading drops it instead of asking with no range', async () => {
    useProfileStore.setState({ sportProfiles: [runRow({ runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null })] });
    useExploreStore.setState({ strictPace: true });
    mockGet.mockResolvedValue(page([]));
    await explore().loadFeed();
    expect(explore().strictPace).toBe(false);
    expect(feedCalls()).toEqual(['/discovery?sport=running&limit=20']);
  });
});

// ─── Screen + hook level ─────────────────────────────────────────────────────

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

async function renderPartners() {
  const utils = render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ExploreScreen navigation={navigation as any} route={{ key: 'Explore', name: 'Explore' } as any} />
  );
  await waitFor(() => expect(explore().focusHydrated).toBe(true));
  fireEvent.press(utils.getByLabelText('Partners'));
  return utils;
}

describe('Explore partners screen', () => {
  it('shows the new server answer after saving preferences, with one new request', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    mockGet.mockResolvedValueOnce(page([partner('old-fit', 'Old pace overlaps')]));
    const utils = await renderPartners();
    expect(await utils.findByText(/Old pace overlaps/)).toBeTruthy();

    mockGet.mockResolvedValueOnce(page([partner('new-fit', 'New pace overlaps')]));
    await act(async () => {
      await upsert(runRow({ runPaceMinSecPerKm: 600, runPaceMaxSecPerKm: 660 }));
    });
    expect(await utils.findByText(/New pace overlaps/)).toBeTruthy();
    expect(utils.queryByText(/Old pace overlaps/)).toBeNull();
    expect(feedCalls()).toHaveLength(2);
  });

  it('ordinary re-renders and detail → back keep the feed and filters without refetching', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    mockGet.mockResolvedValue(page([partner('fit', 'Pace overlaps')]));
    const utils = await renderPartners();
    await utils.findByText(/Pace overlaps/);
    fireEvent.press(utils.getByLabelText('Matching pace only'));
    await waitFor(() => expect(feedCalls()).toHaveLength(2));
    // Detail → back: the screen re-renders and is focused again.
    utils.rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ExploreScreen navigation={navigation as any} route={{ key: 'Explore', name: 'Explore' } as any} />
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(feedCalls()).toHaveLength(2);
    expect(explore().strictPace).toBe(true);
    expect(explore().view).toBe('partners');
  });

  it('a stuck strict filter is released on screen without a strict request', async () => {
    useProfileStore.setState({ sportProfiles: [runRow({ runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null })] });
    mockGet.mockResolvedValue(page([]));
    const utils = await renderPartners();
    // Force the stuck state the review saw, bypassing the store's own guards.
    await act(async () => {
      useExploreStore.setState({ strictPace: true });
    });
    await waitFor(() => expect(explore().strictPace).toBe(false));
    expect(feedCalls().some((url) => url.includes('strict_pace'))).toBe(false);
    // Unselected and without a range, it cannot be turned back on.
    const chip = utils.getByLabelText('Matching pace only');
    expect(chip.props.accessibilityState?.disabled).toBe(true);
    expect(chip.props.accessibilityState?.checked).toBe(false);
  });

  it('turning the filter off is possible even after the range was removed', async () => {
    useProfileStore.setState({ sportProfiles: [runRow()] });
    mockGet.mockResolvedValue(page([]));
    const utils = await renderPartners();
    fireEvent.press(utils.getByLabelText('Matching pace only'));
    await waitFor(() => expect(explore().strictPace).toBe(true));
    await act(async () => {
      await upsert(runRow({ runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null }));
    });
    await waitFor(() => expect(explore().strictPace).toBe(false));
    const strictCalls = feedCalls().filter((url) => url.includes('strict_pace'));
    expect(strictCalls).toHaveLength(1); // only while the range existed
    expect(feedCalls()[feedCalls().length - 1]).toBe('/discovery?sport=running&limit=20');
    expect(utils.getByText('Add your pace range to use this filter')).toBeTruthy();
  });
});
