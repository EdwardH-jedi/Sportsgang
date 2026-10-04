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



it('R4 block completion from previous owner epoch returns stale after A -> B -> A',async()=>{
 await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')]));await store().loadFeed();const blocked=deferred<any>();mockPost.mockReturnValueOnce(blocked.promise);const action=store().blockPartner('target');await store().hydrateFocus('b');await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')]));await store().loadFeed();blocked.resolve({});expect(await action).toBe(false);
});
it('R4 old action finally cannot release a new same-target block guard',async()=>{
 await store().hydrateFocus('a');const old=deferred<any>(),fresh=deferred<any>();mockPost.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
 const oldAction=store().blockPartner('target');await store().hydrateFocus('b');await store().hydrateFocus('a');const newAction=store().blockPartner('target');old.resolve({});await oldAction;
 expect(store().actingOn).toBe('target');fresh.resolve({});await newAction;
});
it('R4 like completion from previous owner epoch must return null after A -> B -> A',async()=>{
 await store().hydrateFocus('a');const held=deferred<any>();mockPost.mockReturnValueOnce(held.promise);const liking=store().recordAction({...card('target'),feedSport:'running'} as any,'like');await store().hydrateFocus('b');await store().hydrateFocus('a');held.resolve({matchCreated:true,matchId:'old-match'});expect(await liking).toBeNull();
});
it('CONTROL block with held next page cannot resurrect blocked target',async()=>{
 await store().hydrateFocus('a');mockGet.mockResolvedValueOnce(page([card('target')],'cursor'));await store().loadFeed();const more=deferred<any>();mockGet.mockReturnValueOnce(more.promise);const paging=store().fetchMore();mockPost.mockResolvedValueOnce({});expect(await store().blockPartner('target')).toBe(true);more.resolve(page([card('target')]));await paging;expect(store().feed.items).toEqual([]);
});
