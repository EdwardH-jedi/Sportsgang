/**
 * Explore state: the Run/Golf focus sport, the Sessions/Partners view and
 * partner filters, plus the partner feed itself.
 *
 * Kept in a store (not component state) so PartnerDetail acts on the same
 * loaded cards and so filters survive detail → back navigation.
 *
 * Feed correctness rules (todo.md Wave 2):
 * - Every load bumps a generation counter; a response from an older
 *   generation (e.g. a slow running response after switching to golf) is
 *   dropped, including its error and loading updates.
 * - fetchMore follows the server's cursor and appends without duplicates.
 * - Card actions use the sport the card was loaded for, never the sport
 *   currently selected.
 * - Request failure is an `error` status, never translated into "no people".
 * - The focus sport is persisted per account and the whole store is reset
 *   on logout (auth.logout → reset()).
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type {
  DiscoveryAction,
  DiscoveryFeedResponse,
  FocusSport,
  PartnerCard,
  RecordActionResponse,
} from '@protin/shared-types';

import { api, BASE_URL } from '../lib/api';
import { isFocusSport } from '../lib/sportPreferences';

export const FEED_PAGE_SIZE = 20;

export type ExploreView = 'sessions' | 'partners';
export type FeedStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A partner card tagged with the sport feed it was loaded from. */
export interface FeedCard extends PartnerCard {
  feedSport: FocusSport;
}

export interface FeedState {
  /** `${sport}|${strictPace}` the items belong to; null before first load. */
  key: string | null;
  sport: FocusSport | null;
  status: FeedStatus;
  items: FeedCard[];
  error: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  viewerSetupRequired: boolean;
  total: number;
  poolLimit: number | null;
}

interface ExploreState {
  ownerId: string | null;
  focusSport: FocusSport;
  focusHydrated: boolean;
  view: ExploreView;
  strictPace: boolean;
  feed: FeedState;
  /** userId with an action in flight (shared by Explore and PartnerDetail). */
  actingOn: string | null;
  hydrateFocus: (userId: string, fallback?: FocusSport | null) => Promise<void>;
  setFocusSport: (sport: FocusSport) => void;
  setView: (view: ExploreView) => void;
  setStrictPace: (value: boolean) => void;
  /** Load page one for the current sport/filter (no-op if already loaded unless forced). */
  loadFeed: (options?: { force?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  recordAction: (card: FeedCard, action: DiscoveryAction) => Promise<RecordActionResponse>;
  reset: () => void;
}

const EMPTY_FEED: FeedState = {
  key: null,
  sport: null,
  status: 'idle',
  items: [],
  error: null,
  nextCursor: null,
  loadingMore: false,
  loadMoreError: null,
  viewerSetupRequired: false,
  total: 0,
  poolLimit: null,
};

const DEFAULT_SPORT: FocusSport = 'running';

// Module-level so it survives store resets: any in-flight response from
// before a reset/switch can never match the current generation again.
let feedGeneration = 0;

export function focusStorageKey(userId: string): string {
  return `sportsgang.focus.${userId}`;
}

export function feedKey(sport: FocusSport, strictPace: boolean): string {
  return `${sport}|${strictPace && sport === 'running' ? 'strict' : 'all'}`;
}

function absolutizeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

function toFeedCard(item: PartnerCard, sport: FocusSport): FeedCard {
  const card: FeedCard = { ...item, feedSport: sport };
  const avatar = absolutizeMediaUrl(item.avatarUrl);
  if (avatar !== undefined) card.avatarUrl = avatar;
  if (item.photoUrls) {
    card.photoUrls = item.photoUrls.map(absolutizeMediaUrl).filter((u): u is string => typeof u === 'string');
  }
  return card;
}

function feedUrl(sport: FocusSport, strictPace: boolean, cursor?: string | null): string {
  const qs = new URLSearchParams({ sport, limit: String(FEED_PAGE_SIZE) });
  if (strictPace && sport === 'running') qs.set('strict_pace', 'true');
  if (cursor) qs.set('cursor', cursor);
  return `/discovery?${qs.toString()}`;
}

function assertFeedShape(data: unknown): asserts data is DiscoveryFeedResponse {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) {
    throw new Error('Unexpected response from the server.');
  }
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  ownerId: null,
  focusSport: DEFAULT_SPORT,
  focusHydrated: false,
  view: 'sessions',
  strictPace: false,
  feed: EMPTY_FEED,
  actingOn: null,

  hydrateFocus: async (userId, fallback) => {
    const { ownerId, focusHydrated } = get();
    if (ownerId === userId && focusHydrated) return;
    if (ownerId !== userId) {
      // Account switch without a logout in between: never carry over state.
      feedGeneration += 1;
      set({ ownerId: userId, focusHydrated: false, view: 'sessions', strictPace: false, feed: EMPTY_FEED, actingOn: null });
    }
    let stored: string | null = null;
    try {
      stored = await SecureStore.getItemAsync(focusStorageKey(userId));
    } catch {
      stored = null;
    }
    if (get().ownerId !== userId) return; // logged out / switched meanwhile
    set({
      focusSport: isFocusSport(stored) ? stored : (fallback ?? DEFAULT_SPORT),
      focusHydrated: true,
    });
  },

  setFocusSport: (sport) => {
    if (get().focusSport === sport) return;
    set({ focusSport: sport });
    const { ownerId } = get();
    if (ownerId) {
      void SecureStore.setItemAsync(focusStorageKey(ownerId), sport).catch(() => {
        // Persistence is best-effort; the in-memory choice still applies.
      });
    }
  },

  setView: (view) => set({ view }),

  setStrictPace: (value) => set({ strictPace: value }),

  loadFeed: async ({ force = false } = {}) => {
    const { focusSport: sport, strictPace, feed } = get();
    const key = feedKey(sport, strictPace);
    if (!force && feed.key === key && feed.status !== 'error' && feed.status !== 'idle') return;

    const generation = ++feedGeneration;
    set({ feed: { ...EMPTY_FEED, key, sport, status: 'loading' }, actingOn: null });
    try {
      const data = await api.get<DiscoveryFeedResponse>(feedUrl(sport, strictPace));
      assertFeedShape(data);
      if (generation !== feedGeneration) return;
      set({
        feed: {
          ...EMPTY_FEED,
          key,
          sport,
          status: 'ready',
          items: data.items.map((item) => toFeedCard(item, sport)),
          nextCursor: data.nextCursor ?? null,
          viewerSetupRequired: !!data.viewerSetupRequired,
          total: data.total,
          poolLimit: data.poolLimit ?? null,
        },
      });
    } catch (err) {
      if (generation !== feedGeneration) return;
      set({ feed: { ...EMPTY_FEED, key, sport, status: 'error', error: message(err, 'Could not load partners.') } });
    }
  },

  fetchMore: async () => {
    const { feed } = get();
    if (feed.status !== 'ready' || !feed.nextCursor || feed.loadingMore || !feed.sport) return;
    const generation = feedGeneration;
    const { sport, key } = feed;
    const strict = get().strictPace;
    set({ feed: { ...feed, loadingMore: true, loadMoreError: null } });
    try {
      const data = await api.get<DiscoveryFeedResponse>(feedUrl(sport, strict, feed.nextCursor));
      assertFeedShape(data);
      if (generation !== feedGeneration || get().feed.key !== key) return;
      const current = get().feed;
      const seen = new Set(current.items.map((c) => c.userId));
      const appended = data.items.filter((item) => !seen.has(item.userId)).map((item) => toFeedCard(item, sport));
      set({
        feed: {
          ...current,
          items: [...current.items, ...appended],
          nextCursor: data.nextCursor ?? null,
          total: data.total,
          loadingMore: false,
        },
      });
    } catch (err) {
      if (generation !== feedGeneration || get().feed.key !== key) return;
      set({ feed: { ...get().feed, loadingMore: false, loadMoreError: message(err, 'Could not load more partners.') } });
    }
  },

  recordAction: async (card, action) => {
    set({ actingOn: card.userId });
    try {
      // Always the sport this card was loaded for — a card left on screen
      // across a sport switch can never record an action for the new sport.
      const result = await api.post<RecordActionResponse>('/discovery/actions', {
        targetUserId: card.userId,
        action,
        sport: card.feedSport,
      });
      const { feed } = get();
      if (feed.sport === card.feedSport) {
        set({ feed: { ...feed, items: feed.items.filter((c) => c.userId !== card.userId) } });
      }
      return result;
    } finally {
      if (get().actingOn === card.userId) set({ actingOn: null });
    }
  },

  reset: () => {
    feedGeneration += 1;
    set({
      ownerId: null,
      focusSport: DEFAULT_SPORT,
      focusHydrated: false,
      view: 'sessions',
      strictPace: false,
      feed: EMPTY_FEED,
      actingOn: null,
    });
  },
}));

/** Card lookup used by PartnerDetail (same loaded data as the feed). */
export function findFeedCard(userId: string, sport: FocusSport): FeedCard | undefined {
  const { feed } = useExploreStore.getState();
  if (feed.sport !== sport) return undefined;
  return feed.items.find((c) => c.userId === userId);
}
