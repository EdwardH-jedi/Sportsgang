import { useCallback, useEffect, useRef, useState } from 'react';

import { type CrewListItem, type CrewListQuery, listCrews } from '../lib/crews';

export interface UseCrewsArgs extends CrewListQuery {
  /** Skip fetching (e.g. geo list before a location fix). Default true. */
  enabled?: boolean;
}

export interface UseCrewsResult {
  items: CrewListItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** GET /crews with the given filters; refetches when a filter changes. */
export function useCrews({ enabled = true, ...query }: UseCrewsArgs = {}): UseCrewsResult {
  const [items, setItems] = useState<CrewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable key so a new params object with the same values doesn't refetch.
  const key = JSON.stringify(query);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listCrews(JSON.parse(key) as CrewListQuery);
      if (id !== requestId.current) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Could not load crews.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [enabled, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, total, isLoading, error, refresh };
}
