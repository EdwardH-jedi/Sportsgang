/**
 * My Plans data: existing 1:1 bookings + hosted/joined group sessions.
 *
 * Two independent sources (docs/run-golf-v2/CONTRACTS.md §6):
 *   GET /bookings?status=…   — every lifecycle state, so history is kept
 *   GET /events?mine=true    — hosted or currently joined, every status
 *
 * Items keep an explicit `source` + `id` (key `booking:<id>` /
 * `event:<id>`), so a booking and an event can never be confused. A
 * proposed booking is always "pending" — nothing is labelled confirmed
 * unless the API says so. One source failing never hides the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventSummary } from '@protin/shared-types';

import { api } from '../lib/api';
import { listEvents, sessionNoun } from '../lib/events';
import type { Session, SessionListResponse } from '../lib/sessions';
import { sportLabel } from '../stores/profile';

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
  const asc = (a: PlanItem, b: PlanItem) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.key.localeCompare(b.key);
  return {
    upcoming: all.filter((i) => i.segment === 'upcoming').sort(asc),
    pending: all.filter((i) => i.segment === 'pending').sort(asc),
    past: all.filter((i) => i.segment === 'past').sort((a, b) => -asc(a, b)),
  };
}

export async function fetchPlanBookings(): Promise<Session[]> {
  const res = await api.get<SessionListResponse>(`/bookings?status=${BOOKING_STATUSES}&limit=50`);
  return res.items;
}

export async function fetchPlanEvents(): Promise<EventSummary[]> {
  const res = await listEvents({ mine: true, limit: 50 });
  return res.items;
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function usePlans(currentUserId: string | null) {
  const [bookings, setBookings] = useState<Session[] | null>(null);
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    const gen = ++generation.current;
    if (mode === 'refresh') setIsRefreshing(true);
    const [b, e] = await Promise.allSettled([fetchPlanBookings(), fetchPlanEvents()]);
    // A newer load (or unmount) supersedes this one.
    if (!mounted.current || gen !== generation.current) return;
    if (b.status === 'fulfilled') {
      setBookings(b.value);
      setBookingsError(null);
    } else {
      setBookingsError(messageOf(b.reason, 'Could not load your 1:1 sessions.'));
    }
    if (e.status === 'fulfilled') {
      setEvents(e.value);
      setEventsError(null);
    } else {
      setEventsError(messageOf(e.reason, 'Could not load your group sessions.'));
    }
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  const segments = useMemo(
    () => buildPlanItems(bookings ?? [], events ?? [], currentUserId),
    [bookings, events, currentUserId]
  );

  return {
    segments,
    hasBookings: bookings !== null,
    hasEvents: events !== null,
    bookingsError,
    eventsError,
    isLoading,
    isRefreshing,
    load,
    refresh: useCallback(() => load('refresh'), [load]),
  };
}
