/**
 * My Plans data: existing 1:1 bookings + hosted/joined group sessions.
 *
 * Two independent sources (docs/run-golf-v2/CONTRACTS.md §6), each read per
 * lifecycle segment so history can never push future plans out (review F2):
 *   GET /bookings?status=…&segment=upcoming|pending|past&as_of=…
 *   GET /events?mine=true&segment=upcoming|past&as_of=…
 *
 * - One `as_of` instant per load generation; every page of that generation
 *   is requested with it and classified against it.
 * - Each (segment, source) pages with limit/offset; a segment shows only the
 *   merged prefix that is complete — nothing that sorts after a source's
 *   last loaded row is shown until that source's next page is loaded — so
 *   items never appear out of order or with a gap before them.
 * - Items keep an explicit `source` + `id` (key `booking:<id>` /
 *   `event:<id>`), so a booking and an event can never be confused; a row
 *   seen twice keeps its most recently fetched version.
 * - A proposed booking is always "pending" — nothing is labelled confirmed
 *   unless the API says so. One source failing never hides the other, and
 *   a failed "show more" keeps what is loaded.
 * - Successful session mutations (stores/sessionSync.ts) reload the plans.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventSummary } from '@protin/shared-types';

import { api } from '../lib/api';
import { listEvents, sessionNoun } from '../lib/events';
import type { Session, SessionListResponse } from '../lib/sessions';
import { sportLabel } from '../stores/profile';
import { useSessionSync } from '../stores/sessionSync';

export type PlanSource = 'booking' | 'event';
export type PlanSegment = 'upcoming' | 'pending' | 'past';

export interface PlanItem {
  key: string;
  source: PlanSource;
  id: string;
  segment: PlanSegment;
  sport: string;
  title: string;
  /** "1:1 session", "Group run", "Group round", "Group session". */
  kind: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  statusLabel: string;
  /** Visual tone for the status chip. */
  tone: 'brand' | 'neutral' | 'warning';
}

export const BOOKING_STATUSES = 'proposed,confirmed,completed,cancelled,declined,no_show';

const BOOKING_TERMINAL_LABEL: Record<string, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
  no_show: 'No-show',
};

function bookingItem(b: Session, currentUserId: string | null, nowMs: number): PlanItem {
  const partner = b.partner?.displayName ?? 'your partner';
  const ended = Date.parse(b.endsAt) <= nowMs;
  let segment: PlanSegment;
  let statusLabel: string;
  let tone: PlanItem['tone'] = 'neutral';

  if (b.status === 'proposed') {
    const incoming = currentUserId !== null && b.proposerId !== currentUserId;
    if (Date.parse(b.startsAt) <= nowMs) {
      segment = 'past';
      statusLabel = 'Never confirmed';
    } else {
      segment = 'pending';
      statusLabel = incoming ? `Requested by ${partner}` : `Waiting for ${partner}`;
      tone = 'warning';
    }
  } else if (b.status === 'confirmed' || b.status === 'accepted') {
    segment = ended ? 'past' : 'upcoming';
    statusLabel = 'Confirmed';
    tone = ended ? 'neutral' : 'brand';
  } else {
    segment = 'past';
    statusLabel = BOOKING_TERMINAL_LABEL[b.status] ?? b.status;
  }

  const venue = b.venue?.name ?? b.location ?? null;
  return {
    key: `booking:${b.id}`,
    source: 'booking',
    id: b.id,
    segment,
    sport: b.sport,
    title: `${sportLabel(b.sport)} with ${partner}`,
    kind: '1:1 session',
    startsAt: b.startsAt,
    endsAt: b.endsAt ?? null,
    location: venue,
    statusLabel,
    tone,
  };
}

function eventItem(e: EventSummary, currentUserId: string | null, nowMs: number): PlanItem {
  const hosting = currentUserId !== null && e.hostUserId === currentUserId;
  const started = Date.parse(e.startsAt) <= nowMs;
  let segment: PlanSegment;
  let statusLabel: string;
  let tone: PlanItem['tone'] = 'neutral';

  if (e.status === 'cancelled') {
    segment = 'past';
    statusLabel = 'Cancelled';
  } else if (e.status === 'completed') {
    segment = 'past';
    statusLabel = 'Completed';
  } else if (started) {
    segment = 'past';
    statusLabel = hosting ? 'Hosted' : 'Joined';
  } else {
    segment = 'upcoming';
    statusLabel = hosting ? 'Hosting' : 'Joined';
    tone = 'brand';
  }

  const noun = sessionNoun(e.sport);
  return {
    key: `event:${e.id}`,
    source: 'event',
    id: e.id,
    segment,
    sport: e.sport,
    title: e.title,
    kind: noun === 'session' ? 'Group session' : `Group ${noun}`,
    startsAt: e.startsAt,
    endsAt: null,
    location: e.locationText,
    statusLabel,
    tone,
  };
}

/**
 * Display order inside a segment: start time, then key. The key tie-break is
 * a plain code-unit comparison so it matches the API's (starts_at, id) order
 * for rows of one source (lowercase UUIDs order the same way in both).
 */
function comparePlanItems(a: PlanItem, b: PlanItem): number {
  const byTime = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  if (byTime !== 0) return byTime;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Pure merge + segmentation (exported for tests). */
export function buildPlanItems(
  bookings: Session[],
  events: EventSummary[],
  currentUserId: string | null,
  nowMs: number = Date.now()
): Record<PlanSegment, PlanItem[]> {
  const all = [
    ...bookings.map((b) => bookingItem(b, currentUserId, nowMs)),
    ...events.map((e) => eventItem(e, currentUserId, nowMs)),
  ];
  return {
    upcoming: all.filter((i) => i.segment === 'upcoming').sort(comparePlanItems),
    pending: all.filter((i) => i.segment === 'pending').sort(comparePlanItems),
    past: all.filter((i) => i.segment === 'past').sort((a, b) => -comparePlanItems(a, b)),
  };
}

// ─── Paged loading ──────────────────────────────────────────────────────────

export const PLAN_PAGE_SIZE = 20;
/** GET /events caps `limit` at 50; a reload re-reads up to this many rows per source. */
const PLAN_RELOAD_LIMIT = 50;

export const SEGMENT_SOURCES: Record<PlanSegment, readonly PlanSource[]> = {
  upcoming: ['booking', 'event'],
  pending: ['booking'],
  past: ['booking', 'event'],
};

type PageKey = `${PlanSegment}:${PlanSource}`;
const PAGE_KEYS: readonly PageKey[] = (Object.keys(SEGMENT_SOURCES) as PlanSegment[]).flatMap((segment) =>
  SEGMENT_SOURCES[segment].map((source) => `${segment}:${source}` as PageKey)
);

type SourceRow = { source: 'booking'; row: Session } | { source: 'event'; row: EventSummary };

interface SourcePage {
  /** Rows in server order across every page loaded so far. */
  rows: SourceRow[];
  /** Rows received: the offset of the next page. */
  fetched: number;
  total: number;
  /** A first page has arrived (in this or an earlier load). */
  loaded: boolean;
  /** Loading the first page failed (shown as a source notice). */
  error: string | null;
  /** Loading a further page failed (shown at the end of the list). */
  moreError: string | null;
  loadingMore: boolean;
  /** Arrival order; the newest version of a row wins when merging. */
  seq: number;
}

interface PlansData {
  asOf: number;
  pages: Record<PageKey, SourcePage>;
}

const EMPTY_PAGE: SourcePage = {
  rows: [],
  fetched: 0,
  total: 0,
  loaded: false,
  error: null,
  moreError: null,
  loadingMore: false,
  seq: 0,
};

const SOURCE_FALLBACK: Record<PlanSource, string> = {
  booking: 'Could not load your 1:1 sessions.',
  event: 'Could not load your group sessions.',
};

function splitKey(key: PageKey): [PlanSegment, PlanSource] {
  const [segment, source] = key.split(':') as [PlanSegment, PlanSource];
  return [segment, source];
}

async function fetchPage(
  segment: PlanSegment,
  source: PlanSource,
  asOfIso: string,
  limit: number,
  offset: number
): Promise<{ rows: SourceRow[]; total: number }> {
  if (source === 'booking') {
    const res = await api.get<SessionListResponse>(
      `/bookings?status=${BOOKING_STATUSES}&segment=${segment}&as_of=${encodeURIComponent(asOfIso)}` +
        `&limit=${limit}&offset=${offset}`
    );
    return { rows: res.items.map((row) => ({ source: 'booking', row })), total: res.total };
  }
  const res = await listEvents({ mine: true, segment: segment as 'upcoming' | 'past', asOf: asOfIso, limit, offset });
  return { rows: res.items.map((row) => ({ source: 'event', row })), total: res.total };
}

function rowItem(r: SourceRow, currentUserId: string | null, nowMs: number): PlanItem {
  return r.source === 'booking' ? bookingItem(r.row, currentUserId, nowMs) : eventItem(r.row, currentUserId, nowMs);
}

const hasMoreRows = (p: SourcePage) => p.loaded && p.fetched < p.total;

/** Segments as shown: classified at `asOf`, de-duplicated, cut to the complete prefix. */
function viewOf(data: PlansData, currentUserId: string | null): Record<PlanSegment, PlanItem[]> {
  const latest = new Map<string, { row: SourceRow; seq: number }>();
  for (const key of PAGE_KEYS) {
    const page = data.pages[key];
    for (const row of page.rows) {
      const id = `${row.source}:${row.row.id}`;
      const seen = latest.get(id);
      if (!seen || page.seq >= seen.seq) latest.set(id, { row, seq: page.seq });
    }
  }
  const rows = [...latest.values()].map((v) => v.row);
  const merged = buildPlanItems(
    rows.flatMap((r) => (r.source === 'booking' ? [r.row] : [])),
    rows.flatMap((r) => (r.source === 'event' ? [r.row] : [])),
    currentUserId,
    data.asOf
  );
  const view = {} as Record<PlanSegment, PlanItem[]>;
  for (const segment of Object.keys(SEGMENT_SOURCES) as PlanSegment[]) {
    let items = merged[segment];
    for (const source of SEGMENT_SOURCES[segment]) {
      const page = data.pages[`${segment}:${source}`];
      if (!hasMoreRows(page) || page.rows.length === 0) continue;
      // Rows after this source's last loaded row may still be missing from it.
      const frontier = rowItem(page.rows[page.rows.length - 1], currentUserId, data.asOf);
      items = items.filter((i) =>
        segment === 'past' ? comparePlanItems(i, frontier) >= 0 : comparePlanItems(i, frontier) <= 0
      );
    }
    view[segment] = items;
  }
  return view;
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function emptyPages(): Record<PageKey, SourcePage> {
  return Object.fromEntries(PAGE_KEYS.map((key) => [key, EMPTY_PAGE])) as Record<PageKey, SourcePage>;
}

export function usePlans(currentUserId: string | null) {
  const [data, setData] = useState<PlansData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // The latest committed data, for callbacks that build on it.
  const dataRef = useRef<PlansData | null>(null);
  const generation = useRef(0);
  const arrivals = useRef(0);
  const mounted = useRef(true);
  const owner = useRef(currentUserId);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const commit = useCallback((next: PlansData | null) => {
    dataRef.current = next;
    setData(next);
  }, []);

  // Another account: never show (or merge into) the previous account's plans.
  useEffect(() => {
    if (owner.current === currentUserId) return;
    owner.current = currentUserId;
    generation.current += 1;
    commit(null);
    setIsLoading(true);
  }, [currentUserId, commit]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const gen = ++generation.current;
      if (mode === 'refresh') setIsRefreshing(true);
      const asOf = Date.now();
      const asOfIso = new Date(asOf).toISOString();
      const previous = dataRef.current?.pages ?? emptyPages();
      // Re-read as much as was shown, so a refresh keeps the reader's place.
      const results = await Promise.allSettled(
        PAGE_KEYS.map((key) => {
          const [segment, source] = splitKey(key);
          const limit = Math.min(PLAN_RELOAD_LIMIT, Math.max(PLAN_PAGE_SIZE, previous[key].fetched));
          return fetchPage(segment, source, asOfIso, limit, 0);
        })
      );
      // A newer load (or unmount, or another account) supersedes this one.
      if (!mounted.current || gen !== generation.current) return;
      const pages = emptyPages();
      PAGE_KEYS.forEach((key, i) => {
        const result = results[i];
        if (result.status === 'fulfilled') {
          const { rows, total } = result.value;
          pages[key] = { ...EMPTY_PAGE, rows, fetched: rows.length, total, loaded: true, seq: ++arrivals.current };
        } else {
          // Keep what this source showed before, with the failure on top.
          pages[key] = {
            ...previous[key],
            loadingMore: false,
            moreError: null,
            error: messageOf(result.reason, SOURCE_FALLBACK[splitKey(key)[1]]),
          };
        }
      });
      commit({ asOf, pages });
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [commit]
  );

  /** Next page (`more`) or a failed first page (`retry`) for the given sources. */
  const fetchInto = useCallback(
    async (keys: PageKey[], kind: 'more' | 'retry') => {
      const current = dataRef.current;
      if (!current || keys.length === 0) return;
      const gen = generation.current;
      const asOfIso = new Date(current.asOf).toISOString();
      const patch = (key: PageKey, change: Partial<SourcePage>) => {
        const now = dataRef.current;
        if (!now) return;
        commit({ ...now, pages: { ...now.pages, [key]: { ...now.pages[key], ...change } } });
      };
      for (const key of keys) patch(key, { loadingMore: true, moreError: null, ...(kind === 'retry' ? { error: null } : {}) });
      await Promise.all(
        keys.map(async (key) => {
          const [segment, source] = splitKey(key);
          const page = current.pages[key];
          const append = kind === 'more' && page.loaded;
          const offset = append ? page.fetched : 0;
          const limit = append ? PLAN_PAGE_SIZE : Math.min(PLAN_RELOAD_LIMIT, Math.max(PLAN_PAGE_SIZE, page.fetched));
          try {
            const { rows, total } = await fetchPage(segment, source, asOfIso, limit, offset);
            if (!mounted.current || gen !== generation.current) return;
            const latest = dataRef.current?.pages[key] ?? page;
            patch(key, {
              rows: append ? [...latest.rows, ...rows] : rows,
              fetched: offset + rows.length,
              total,
              loaded: true,
              error: null,
              moreError: null,
              loadingMore: false,
              seq: ++arrivals.current,
            });
          } catch (err) {
            if (!mounted.current || gen !== generation.current) return;
            const message = messageOf(err, SOURCE_FALLBACK[source]);
            patch(key, kind === 'more' ? { loadingMore: false, moreError: message } : { loadingMore: false, error: message });
          }
        })
      );
    },
    [commit]
  );

  const loadMore = useCallback(
    (segment: PlanSegment) => {
      const current = dataRef.current;
      if (!current) return Promise.resolve();
      const keys = SEGMENT_SOURCES[segment]
        .map((source) => `${segment}:${source}` as PageKey)
        .filter((key) => hasMoreRows(current.pages[key]) && !current.pages[key].loadingMore);
      return fetchInto(keys, 'more');
    },
    [fetchInto]
  );

  /** Re-request every page whose load failed, in every segment. */
  const retryFailed = useCallback(() => {
    const current = dataRef.current;
    if (!current) return Promise.resolve();
    return fetchInto(
      PAGE_KEYS.filter((key) => current.pages[key].error !== null && !current.pages[key].loadingMore),
      'retry'
    );
  }, [fetchInto]);

  // Joins, leaves, cancellations and new sessions elsewhere in the app.
  const sessionsRevision = useSessionSync((s) => s.revision);
  const seenRevision = useRef(sessionsRevision);
  useEffect(() => {
    if (seenRevision.current === sessionsRevision) return;
    seenRevision.current = sessionsRevision;
    void load('initial');
  }, [sessionsRevision, load]);

  const segments = useMemo(
    () => (data ? viewOf(data, currentUserId) : { upcoming: [], pending: [], past: [] }),
    [data, currentUserId]
  );

  const pages = data?.pages ?? emptyPages();
  const perSegment = <T,>(fn: (segment: PlanSegment, sources: SourcePage[]) => T): Record<PlanSegment, T> => {
    const out = {} as Record<PlanSegment, T>;
    for (const segment of Object.keys(SEGMENT_SOURCES) as PlanSegment[]) {
      out[segment] = fn(
        segment,
        SEGMENT_SOURCES[segment].map((source) => pages[`${segment}:${source}`])
      );
    }
    return out;
  };
  const sourceError = (source: PlanSource) =>
    PAGE_KEYS.filter((key) => splitKey(key)[1] === source)
      .map((key) => pages[key].error)
      .find((e) => e !== null) ?? null;

  return {
    segments,
    /** Server totals per segment (both sources), for labels. */
    totals: perSegment((_, sources) => sources.reduce((sum, p) => sum + (p.loaded ? p.total : 0), 0)),
    hasMore: perSegment((_, sources) => sources.some(hasMoreRows)),
    loadingMore: perSegment((_, sources) => sources.some((p) => p.loadingMore)),
    loadMoreError: perSegment((_, sources) => sources.map((p) => p.moreError).find((e) => e !== null) ?? null),
    hasBookings: PAGE_KEYS.some((key) => splitKey(key)[1] === 'booking' && pages[key].loaded),
    hasEvents: PAGE_KEYS.some((key) => splitKey(key)[1] === 'event' && pages[key].loaded),
    bookingsError: sourceError('booking'),
    eventsError: sourceError('event'),
    isLoading,
    isRefreshing,
    load,
    refresh: useCallback(() => load('refresh'), [load]),
    loadMore,
    retryFailed,
  };
}
