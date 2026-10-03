import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AttendanceListResponse,
  type AttendanceStatus,
  type EventDetail,
  type EventListResponse,
  type EventMode,
  type EventSummary,
  type HostAttendanceUpdateRequest,
  type SelfAttendanceStatus,
  getEvent,
  getEventAttendance,
  hostUpdateAttendance,
  joinEvent,
  leaveEvent,
  listEvents,
  selfReportAttendance,
} from '../lib/events';
import { useSessionSync } from '../stores/sessionSync';

interface UseEventsArgs {
  mine?: boolean;
  sport?: string;
  mode?: EventMode;
  /** Only sessions starting now or later. */
  upcoming?: boolean;
  enabled?: boolean;
}

/** Server default page size for GET /events; the API caps `limit` at 50. */
const EVENTS_PAGE_SIZE = 20;
const EVENTS_MAX_LIMIT = 50;

function dedupeAppend(current: EventSummary[], incoming: EventSummary[]): EventSummary[] {
  const seen = new Set(current.map((e) => e.id));
  return [...current, ...incoming.filter((e) => !seen.has(e.id))];
}

/**
 * One list of sessions read from GET /events.
 *
 * - Re-reads the server whenever a session mutation succeeds anywhere in the
 *   app (stores/sessionSync.ts), so counts, open/full status and
 *   Hosting/Joined always come from the persisted state (review F8).
 * - `loadMore` follows `offset` with the existing API; rows are de-duplicated
 *   by id because offsets can shift when sessions are added meanwhile. A
 *   load-more failure keeps the loaded rows and is reported separately.
 * - A refresh re-reads as many rows as are already shown (up to the API
 *   maximum) so the reader keeps their place.
 * - Every request carries a generation; a response for a superseded query or
 *   refresh (e.g. a slow running list after switching to golf) is dropped,
 *   including its error and loading updates.
 */
export function useEvents({
  mine = false,
  sport,
  mode,
  upcoming = false,
  enabled = true,
}: UseEventsArgs = {}) {
  const [items, setItems] = useState<EventSummary[]>([]);
  const [total, setTotal] = useState(0);
  // Rows the server has returned for this query: the next page's offset.
  const [fetched, setFetched] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const generation = useRef(0);
  const queryKey = JSON.stringify({ mine, sport, mode, upcoming });
  const loaded = useRef({ key: queryKey, fetched: 0 });
  const revision = useSessionSync((s) => s.revision);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const gen = ++generation.current;
    const sameQuery = loaded.current.key === queryKey;
    if (!sameQuery) {
      // Never show another sport's or filter's rows under this one.
      loaded.current = { key: queryKey, fetched: 0 };
      setItems([]);
      setTotal(0);
      setFetched(0);
    }
    setIsLoading(true);
    setError(null);
    setLoadingMore(false);
    setLoadMoreError(null);
    const limit = Math.min(EVENTS_MAX_LIMIT, Math.max(EVENTS_PAGE_SIZE, loaded.current.fetched));
    try {
      const data: EventListResponse = await listEvents({ mine, sport, mode, upcoming, limit, offset: 0 });
      if (gen !== generation.current) return;
      loaded.current = { key: queryKey, fetched: data.items.length };
      setItems(data.items);
      setTotal(data.total);
      setFetched(data.items.length);
    } catch (err) {
      if (gen !== generation.current) return;
      setError(err instanceof Error ? err.message : 'Could not load sessions.');
    } finally {
      if (gen === generation.current) setIsLoading(false);
    }
  }, [mine, sport, mode, upcoming, enabled, queryKey]);

  useEffect(() => {
    void refresh();
    // `revision` changes after any successful session mutation.
  }, [refresh, revision]);

  const hasMore = !isLoading && !error && fetched < total;

  const loadMore = useCallback(async () => {
    if (!enabled || !hasMore || loadingMore) return;
    const gen = generation.current;
    const offset = loaded.current.fetched;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const data = await listEvents({ mine, sport, mode, upcoming, limit: EVENTS_PAGE_SIZE, offset });
      if (gen !== generation.current) return;
      loaded.current = { key: queryKey, fetched: offset + data.items.length };
      setItems((current) => dedupeAppend(current, data.items));
      setTotal(data.total);
      setFetched(offset + data.items.length);
    } catch {
      if (gen !== generation.current) return;
      setLoadMoreError('Could not load more sessions.');
    } finally {
      if (gen === generation.current) setLoadingMore(false);
    }
  }, [enabled, hasMore, loadingMore, mine, sport, mode, upcoming, queryKey]);

  return { items, isLoading, error, refresh, loadMore, hasMore, loadingMore, loadMoreError };
}

interface UseEventDetailArgs {
  eventId: string | null;
  enabled?: boolean;
}

export function useEventDetail({ eventId, enabled = true }: UseEventDetailArgs) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getEvent(eventId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this session.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const join = useCallback(async () => {
    if (!eventId) return;
    const data = await joinEvent(eventId);
    setDetail(data);
  }, [eventId]);

  const leave = useCallback(async () => {
    if (!eventId) return;
    const data = await leaveEvent(eventId);
    setDetail(data);
  }, [eventId]);

  return { detail, isLoading, error, join, leave, refresh };
}

interface UseEventAttendanceArgs {
  eventId: string | null;
  enabled?: boolean;
}

export function useEventAttendance({
  eventId,
  enabled = true,
}: UseEventAttendanceArgs) {
  const [data, setData] = useState<AttendanceListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !eventId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getEventAttendance(eventId);
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load attendance.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [eventId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateAsHost = useCallback(
    async (body: HostAttendanceUpdateRequest) => {
      if (!eventId) return;
      const entry = await hostUpdateAttendance(eventId, body);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.participantUserId === entry.participantUserId ? entry : it
              ),
            }
          : prev
      );
      return entry;
    },
    [eventId]
  );

  const selfReport = useCallback(
    async (attendanceStatus: SelfAttendanceStatus) => {
      if (!eventId) return;
      const entry = await selfReportAttendance(eventId, { attendanceStatus });
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.participantUserId === entry.participantUserId ? entry : it
              ),
            }
          : prev
      );
      return entry;
    },
    [eventId]
  );

  return { data, isLoading, error, refresh, updateAsHost, selfReport };
}

export type { AttendanceStatus, SelfAttendanceStatus };
