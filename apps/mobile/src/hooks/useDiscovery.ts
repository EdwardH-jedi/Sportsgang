import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useExploreStore } from '../stores/explore';

export type { FeedCard, FeedState } from '../stores/explore';

/**
 * Partner feed for the current Explore focus sport.
 *
 * Thin wrapper over the explore store: it (re)loads page one whenever the
 * focus sport or the strict-pace filter changes, and otherwise reuses the
 * already-loaded feed (so returning from PartnerDetail keeps the list and
 * scroll position). Pagination, stale-response guarding and sport-scoped
 * actions live in the store — see stores/explore.ts.
 */
export function useDiscovery({ enabled = true }: { enabled?: boolean } = {}) {
  const state = useExploreStore(
    useShallow((s) => ({
      sport: s.focusSport,
      strictPace: s.strictPace,
      feed: s.feed,
      actingOn: s.actingOn,
      loadFeed: s.loadFeed,
      fetchMore: s.fetchMore,
      recordAction: s.recordAction,
      setStrictPace: s.setStrictPace,
    }))
  );
  const { sport, strictPace, loadFeed } = state;

  useEffect(() => {
    if (!enabled) return;
    void loadFeed();
  }, [enabled, sport, strictPace, loadFeed]);

  return {
    sport,
    strictPace,
    setStrictPace: state.setStrictPace,
    feed: state.feed,
    partners: state.feed.items,
    actingOn: state.actingOn,
    refresh: () => loadFeed({ force: true }),
    fetchMore: state.fetchMore,
    recordAction: state.recordAction,
  };
}
