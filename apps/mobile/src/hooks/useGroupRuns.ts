import { useCallback, useEffect, useRef, useState } from 'react';

import { type EventSummary, listEvents } from '../lib/events';
import { type WhenFilter, isActiveRun, timeWindow } from '../lib/groupRuns';
import type { Coords } from '../lib/location';

export interface UseGroupRunsArgs {
  /** Geo filter on the meeting point. Without it the list is not geo-filtered. */
  coords?: Coords | null;
  /** 1–50 km; only applies with coords. */
  radiusKm?: number;
  when?: WhenFilter;
  crewId?: string;
  limit?: number;
  enabled?: boolean;
}

export interface UseGroupRunsResult {
  runs: EventSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Upcoming group runs: GET /events?sport=running with the time window
 * for `when` and, when coords are known, the meeting-point geo filter
 * (which adds `distanceKmFromYou`). Cancelled / completed runs are dropped.
 */
export function useGroupRuns({
  coords = null,
  radiusKm,
  when = 'all',
  crewId,
  limit = 50,
  enabled = true,
}: UseGroupRunsArgs = {}): UseGroupRunsResult {
  const [runs, setRuns] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const lat = coords?.lat;
  const lng = coords?.lng;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const window = timeWindow(when);
      const data = await listEvents({
        sport: 'running',
        limit,
        crewId,
        lat,
        lng,
        radiusKm: lat !== undefined && lng !== undefined ? radiusKm : undefined,
        from: window.from,
        to: window.to,
      });
      if (id !== requestId.current) return;
      setRuns(data.items.filter(isActiveRun));
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Could not load group runs.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [enabled, when, limit, crewId, lat, lng, radiusKm]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { runs, isLoading, error, refresh };
}
