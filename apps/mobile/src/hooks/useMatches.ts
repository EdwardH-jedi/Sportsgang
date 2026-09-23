import { useCallback, useEffect, useState } from 'react';

import { listMatches, type MatchSummary } from '../lib/matches';

interface UseMatchesResult {
  items: MatchSummary[];
  /** True for the initial load and for `refresh()` (full-screen spinner). */
  isLoading: boolean;
  /** True only while a pull-to-refresh started via `pullToRefresh()` runs. */
  isRefreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pullToRefresh: () => Promise<void>;
}

/**
 * The caller's matches (mutual likes) with last-message previews.
 *
 * Two refresh flavours mirror the Matches tab: `refresh` flips the
 * full-screen `isLoading` state (initial load, retry, tab focus) while
 * `pullToRefresh` only drives the RefreshControl spinner so the list stays
 * on screen.
 */
export function useMatches(): UseMatchesResult {
  const [items, setItems] = useState<MatchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listMatches();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await listMatches();
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, isLoading, isRefreshing, error, refresh, pullToRefresh };
}
