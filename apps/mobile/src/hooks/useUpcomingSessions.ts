import { useCallback, useEffect, useState } from 'react';

import { fetchUpcomingSessions, type Session } from '../lib/sessions';

interface UseUpcomingSessionsArgs {
  /** Set false to skip the fetch entirely. */
  enabled?: boolean;
}

interface UseUpcomingSessionsResult {
  items: Session[];
  refresh: () => Promise<void>;
}

/**
 * Confirmed, not-yet-finished sessions for the signed-in user.
 *
 * Failure is silent by design (items fall back to []): this feeds
 * secondary surfaces such as Profile's "Upcoming sessions" card, and the
 * rest of the screen must keep rendering even if /bookings is down.
 */
export function useUpcomingSessions({
  enabled = true,
}: UseUpcomingSessionsArgs = {}): UseUpcomingSessionsResult {
  const [items, setItems] = useState<Session[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setItems(await fetchUpcomingSessions());
    } catch {
      setItems([]);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, refresh };
}
