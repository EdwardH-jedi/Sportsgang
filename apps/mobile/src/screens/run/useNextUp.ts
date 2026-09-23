import { useCallback, useEffect, useMemo, useState } from 'react';

import { useUpcomingSessions } from '../../hooks/useUpcomingSessions';
import { type EventSummary, eventNoun, listEvents } from '../../lib/events';
import { isActiveRun } from '../../lib/groupRuns';
import { sportLabel } from '../../lib/sports';

export type NextUpItem =
  | { kind: 'session'; id: string; title: string; startsAt: string; detail: string | null }
  | { kind: 'event'; id: string; title: string; startsAt: string; detail: string | null; sport: string };

/**
 * The user's next commitment: the soonest of their confirmed 1:1
 * sessions and the runs / games they host or joined. Failures are silent
 * (the card just doesn't show) — this is a secondary surface.
 */
export function useNextUp(): { next: NextUpItem | null; refresh: () => Promise<void> } {
  const { items: sessions, refresh: refreshSessions } = useUpcomingSessions();
  const [events, setEvents] = useState<EventSummary[]>([]);

  const refreshEvents = useCallback(async () => {
    try {
      const res = await listEvents({ mine: true, from: new Date().toISOString(), limit: 10 });
      setEvents(res.items.filter(isActiveRun));
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshSessions(), refreshEvents()]);
  }, [refreshSessions, refreshEvents]);

  const next = useMemo<NextUpItem | null>(() => {
    const now = Date.now();
    const candidates: NextUpItem[] = [
      ...sessions.map(
        (s): NextUpItem => ({
          kind: 'session',
          id: s.id,
          title: `${sportLabel(s.sport)} with ${s.partner?.displayName ?? 'your partner'}`,
          startsAt: s.startsAt,
          detail: s.venue?.name ?? s.location ?? null,
        })
      ),
      ...events.map(
        (e): NextUpItem => ({
          kind: 'event',
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          detail: e.crewName ? `${e.crewName} · ${e.locationText}` : e.locationText,
          sport: e.sport,
        })
      ),
    ].filter((c) => {
      const t = Date.parse(c.startsAt);
      return Number.isFinite(t) && t >= now;
    });
    candidates.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return candidates[0] ?? null;
  }, [sessions, events]);

  return { next, refresh };
}

/** "Group run" / "Game" / "Session" kicker for the card. */
export function nextUpKind(item: NextUpItem): string {
  if (item.kind === 'session') return 'Session';
  return eventNoun(item.sport) === 'run' ? 'Group run' : 'Game';
}
