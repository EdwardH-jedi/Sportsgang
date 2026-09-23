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
  /**
   * Background re-fetch (tab focus): no spinner, list stays on screen.
   * Failures are swallowed so a flaky focus refresh never replaces a
   * rendered list with the error view.
   */
  revalidate: () => Promise<void>;
}

/**
 * The caller's matches (mutual likes) with last-message previews.
 *
 * Three refresh flavours mirror the Matches tab: `refresh` flips the
 * full-screen `isLoading` state (initial load, retry), `pullToRefresh` only
 * drives the RefreshControl spinner, and `revalidate` (tab focus) re-fetches
 * silently so the list stays on screen.
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

  const revalidate = useCallback(async () => {
    try {
      const data = await listMatches();
      setItems(data.items);
      setError(null);
    } catch {
      // Keep whatever is on screen; the user can pull to refresh.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    items,
    isLoading,
    isRefreshing,
    error,
    refresh,
    pullToRefresh,
    revalidate,
  };
}
