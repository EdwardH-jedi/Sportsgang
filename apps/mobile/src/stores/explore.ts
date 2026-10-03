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
 * - Preference changes (review F4/F6): a feed remembers the profile store's
 *   per-sport `preferenceRevision` it was assessed under and is never reused
 *   for another revision. A successful preference change for the feed's
 *   sport also drops it at once and bumps the generation, so an older
 *   in-flight success/error can no longer land. When the viewer no longer
 *   has a pace range, the strict pace filter is switched off rather than
 *   left on (the server would reject it).
 * - Like, pass and block (review R4) run one at a time behind `actingOn`,
 *   checked and set synchronously; a refused or stale action sends nothing
 *   or reports nothing. A successful block bumps the generation, so a first
 *   or next page requested before it can never bring the person back, and
 *   drops the card. The server stays the authority (CONTRACTS.md §8).
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
import { blockUser } from '../lib/safety';
import { isFocusSport } from '../lib/sportPreferences';
import { useProfileStore } from './profile';

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
  /** Viewer preference revision for `sport` that this feed was assessed under. */
  revision: number;
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
  /**
   * userId with an action (like, pass or block) in flight, shared by Explore
   * and PartnerDetail. Checked and set synchronously, so only one action runs
   * at a time however fast the taps are.
   */
  actingOn: string | null;
  hydrateFocus: (userId: string, fallback?: FocusSport | null) => Promise<void>;
  setFocusSport: (sport: FocusSport) => void;
  setView: (view: ExploreView) => void;
  setStrictPace: (value: boolean) => void;
  /** Load page one for the current sport/filter (no-op if already loaded unless forced). */
  loadFeed: (options?: { force?: boolean }) => Promise<void>;
  fetchMore: () => Promise<void>;
  /**
   * Like/pass. Resolves null without a request when another action is in
   * flight, and null when the account changed before the response (the
   * caller must not act on it). Rejects when the request fails.
   */
  recordAction: (card: FeedCard, action: DiscoveryAction) => Promise<RecordActionResponse | null>;
  /**
   * Block (review R4). False without a request when another action is in
   * flight, or when the account changed before the response. On success every
   * in-flight feed page is invalidated and the person leaves the feed.
   * Rejects when the request fails (the card stays).
   */
  blockPartner: (userId: string) => Promise<boolean>;
  reset: () => void;
}

const EMPTY_FEED: FeedState = {
  key: null,
  sport: null,
  revision: 0,
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

function preferenceRevision(sport: FocusSport): number {
  return useProfileStore.getState().preferenceRevision?.[sport] ?? 0;
}

/**
 * Whether the viewer has their own declared running pace range: `false` only
 * when the loaded profile says so (no running row, social without a range,
 * cleared range, legacy row); `null` while the profile is not loaded.
 */
function viewerHasPaceRange(): boolean | null {
  const rows = useProfileStore.getState().sportProfiles;
  if (!rows) return null;
  const running = rows.find((sp) => sp.sport === 'running');
  return running?.runPaceMinSecPerKm != null && running?.runPaceMaxSecPerKm != null;
}

// Registered on the store's first own action rather than at import, so
// modules that import this store without the real profile store (tests that
// mock it) are unaffected. loadFeed re-checks revision and pace capability
// itself, so correctness never depends on when this was registered.
let watchingPreferences = false;

function watchPreferences(): void {
  if (watchingPreferences) return;
  watchingPreferences = true;
  useProfileStore.subscribe((state, prev) => {
    if (state.sportProfiles === prev.sportProfiles && state.preferenceRevision === prev.preferenceRevision) return;
    const explore = useExploreStore.getState();
    const patch: Partial<ExploreState> = {};
    if (explore.strictPace && viewerHasPaceRange() === false) patch.strictPace = false;
    const sport = explore.feed.sport;
    if (sport && (state.preferenceRevision?.[sport] ?? 0) !== explore.feed.revision) {
      feedGeneration += 1;
      patch.feed = EMPTY_FEED;
    }
    if (Object.keys(patch).length > 0) useExploreStore.setState(patch);
  });
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
    watchPreferences();
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

  setStrictPace: (value) => {
    watchPreferences();
    // Turning it off is always allowed; turning it on needs the viewer's own range.
    set({ strictPace: value && viewerHasPaceRange() !== false });
  },

  loadFeed: async ({ force = false } = {}) => {
    watchPreferences();
    if (get().strictPace && viewerHasPaceRange() === false) set({ strictPace: false });
    const { focusSport: sport, strictPace, feed } = get();
    const key = feedKey(sport, strictPace);
    const revision = preferenceRevision(sport);
    if (
      !force &&
      feed.key === key &&
      feed.revision === revision &&
      feed.status !== 'error' &&
      feed.status !== 'idle'
    ) {
      return;
    }

    const generation = ++feedGeneration;
    // actingOn is left alone: a like/pass/block in flight keeps the guard.
    set({ feed: { ...EMPTY_FEED, key, sport, revision, status: 'loading' } });
    try {
      const data = await api.get<DiscoveryFeedResponse>(feedUrl(sport, strictPace));
      assertFeedShape(data);
      if (generation !== feedGeneration) return;
      set({
        feed: {
          ...EMPTY_FEED,
          key,
          sport,
          revision,
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
      set({
        feed: { ...EMPTY_FEED, key, sport, revision, status: 'error', error: message(err, 'Could not load partners.') },
      });
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
    if (get().actingOn !== null) return null;
    const owner = get().ownerId;
    set({ actingOn: card.userId });
    try {
      // Always the sport this card was loaded for — a card left on screen
      // across a sport switch can never record an action for the new sport.
      const result = await api.post<RecordActionResponse>('/discovery/actions', {
        targetUserId: card.userId,
        action,
        sport: card.feedSport,
      });
      if (get().ownerId !== owner) return null;
      const { feed } = get();
      if (feed.sport === card.feedSport) {
        set({ feed: { ...feed, items: feed.items.filter((c) => c.userId !== card.userId) } });
      }
      return result;
    } finally {
      if (get().actingOn === card.userId) set({ actingOn: null });
    }
  },

  blockPartner: async (userId) => {
    if (get().actingOn !== null) return false;
    const owner = get().ownerId;
    set({ actingOn: userId });
    try {
      await blockUser(userId);
      if (get().ownerId !== owner) return false;
      // Any page requested before the block may still list this person:
      // invalidate them all, then drop the card from what is loaded. A first
      // page that was interrupted is asked for again (the server now
      // excludes the person); an interrupted "more" can simply be retried.
      feedGeneration += 1;
      const { feed } = get();
      set({
        feed: { ...feed, items: feed.items.filter((c) => c.userId !== userId), loadingMore: false },
      });
      if (feed.status === 'loading') void get().loadFeed({ force: true });
      return true;
    } finally {
      if (get().actingOn === userId) set({ actingOn: null });
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
