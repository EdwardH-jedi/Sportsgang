/**
 * Events ("battles" in the UI) API client.
 *
 * Wraps the typed /events surface. The shared @protin/shared-types
 * package owns the response shapes — this file is intentionally thin
 * so the type contract stays in one place.
 */

import { markSessionsChanged } from '../stores/sessionSync';
import { api } from './api';
import { formatDistance, formatHandicap, formatPaceRange } from './sportPreferences';
import type {
  AttendanceEntry,
  AttendanceListResponse,
  AttendanceStatus,
  CreateEventRequest,
  EventDetail,
  EventListResponse,
  EventMode,
  EventSummary,
  GolfSessionDetails,
  HostAttendanceUpdateRequest,
  RunSessionDetails,
  SelfAttendanceRequest,
} from '@protin/shared-types';

export type {
  GolfSessionDetails,
  RunSessionDetails,
  RunSessionPaceMode,
  TeeTimeStatus,
  CreateEventRequest,
  EventDetail,
  EventListResponse,
  EventMode,
  EventStatus,
  EventSummary,
  EventVisibility,
  EventParticipantSummary,
  AttendanceStatus,
  SelfAttendanceStatus,
  ParticipantLifecycleStatus,
  AttendanceEntry,
  AttendanceListResponse,
  HostAttendanceUpdateRequest,
  SelfAttendanceRequest,
} from '@protin/shared-types';

export interface ListEventsParams {
  mine?: boolean;
  sport?: string;
  mode?: EventMode;
  /** Only sessions starting now or later. */
  upcoming?: boolean;
  /** My Plans segment (needs `mine`); Past comes newest first. */
  segment?: 'upcoming' | 'past';
  /** ISO instant the segment is computed at. */
  asOf?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(params: ListEventsParams): string {
  const qs = new URLSearchParams();
  if (params.mine) qs.set('mine', 'true');
  if (params.upcoming) qs.set('upcoming', 'true');
  if (params.sport) qs.set('sport', params.sport);
  if (params.mode) qs.set('mode', params.mode);
  if (params.segment) qs.set('segment', params.segment);
  if (params.asOf) qs.set('as_of', params.asOf);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export async function listEvents(
  params: ListEventsParams = {}
): Promise<EventListResponse> {
  return api.get<EventListResponse>(`/events${buildQuery(params)}`);
}

export async function getEvent(eventId: string): Promise<EventDetail> {
  return api.get<EventDetail>(`/events/${eventId}`);
}

// Mutations below mark session lists stale only after the server accepted
// them (stores/sessionSync.ts); a rejected request changes nothing.

async function mutate(path: string, body?: unknown): Promise<EventDetail> {
  const detail = body === undefined ? await api.post<EventDetail>(path) : await api.post<EventDetail>(path, body);
  markSessionsChanged();
  return detail;
}

export async function createEvent(body: CreateEventRequest): Promise<EventDetail> {
  return mutate('/events', body);
}

export async function joinEvent(eventId: string): Promise<EventDetail> {
  return mutate(`/events/${eventId}/join`);
}

export async function leaveEvent(eventId: string): Promise<EventDetail> {
  return mutate(`/events/${eventId}/leave`);
}

/**
 * Host-only: cancel the event. Backend returns the updated EventDetail
 * with status='cancelled'. Idempotent — calling on an already-cancelled
 * event returns the current detail without erroring.
 */
export async function cancelEvent(eventId: string): Promise<EventDetail> {
  return mutate(`/events/${eventId}/cancel`);
}

/**
 * Host-only: complete the event. Backend returns status='completed'.
 * Rejected (422) if called before `starts_at`. Idempotent if already
 * completed.
 */
export async function completeEvent(eventId: string): Promise<EventDetail> {
  return mutate(`/events/${eventId}/complete`);
}

/**
 * True if the event's `startsAt` is at or before now. Mirrors the
 * backend time-gate so the mobile UI hides attendance controls before
 * the game starts.
 */
export function eventHasStarted(startsAt: string): boolean {
  const ts = Date.parse(startsAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now();
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function getEventAttendance(
  eventId: string
): Promise<AttendanceListResponse> {
  return api.get<AttendanceListResponse>(`/events/${eventId}/attendance`);
}

export async function hostUpdateAttendance(
  eventId: string,
  body: HostAttendanceUpdateRequest
): Promise<AttendanceEntry> {
  return api.post<AttendanceEntry>(`/events/${eventId}/attendance`, body);
}

export async function selfReportAttendance(
  eventId: string,
  body: SelfAttendanceRequest
): Promise<AttendanceEntry> {
  return api.post<AttendanceEntry>(`/events/${eventId}/attendance/self`, body);
}

export function attendanceStatusLabel(s: AttendanceStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'attended':
      return 'Attended';
    case 'no_show':
      return 'No-show';
    case 'excused':
      return 'Excused';
  }
}

// ---------------------------------------------------------------------------
// Sport vocabulary
// ---------------------------------------------------------------------------

/**
 * Battle sport options. Keep in sync with the brief. Backend stores
 * sport as freeform lowercase string, so adding more here doesn't
 * require a migration.
 */
export const BATTLE_SPORTS = [
  { value: 'basketball', label: 'Basketball' },
  { value: 'soccer', label: 'Soccer' },
  { value: 'running', label: 'Run' },
  { value: 'golf', label: 'Golf' },
  { value: 'badminton', label: 'Badminton' },
  { value: 'tennis', label: 'Tennis' },
] as const;

export type BattleSportValue = (typeof BATTLE_SPORTS)[number]['value'];

/** Default capacities by sport — used as initial value in the host form. */
export const SPORT_CAPACITY_DEFAULTS: Record<string, number> = {
  basketball: 10,
  soccer: 10,
  running: 30,
  golf: 4,
  badminton: 4,
  tennis: 2,
};

export function sportLabelForBattle(sport: string): string {
  const found = BATTLE_SPORTS.find((s) => s.value === sport);
  return found ? found.label : sport.charAt(0).toUpperCase() + sport.slice(1);
}

/** Compact "Sat 17 May · 09:00" style. */
export function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

// ---------------------------------------------------------------------------
// v2 running / golf sessions (docs/run-golf-v2/CONTRACTS.md §5)
//
// Capacity is the total including the host; participantCount already
// includes the auto-joined host. All session preferences are informational.
// ---------------------------------------------------------------------------

/** Product noun for a session of this sport: "run", "round" or "session". */
export function sessionNoun(sport: string): string {
  if (sport === 'running') return 'run';
  if (sport === 'golf') return 'round';
  return 'session';
}

function participantNoun(sport: string, count: number): string {
  const base = sport === 'running' ? 'runner' : sport === 'golf' ? 'golfer' : 'player';
  return count === 1 ? base : `${base}s`;
}

/** "4 golfers · 1 spot left", "8 runners · Full", "4 golfers · Cancelled". */
export function capacityText(
  e: Pick<EventSummary, 'sport' | 'capacity' | 'spotsLeft' | 'status'>
): string {
  const total = `${e.capacity} ${participantNoun(e.sport, e.capacity)}`;
  if (e.status === 'cancelled') return `${total} · Cancelled`;
  if (e.status === 'completed') return `${total} · Completed`;
  if (e.spotsLeft <= 0 || e.status === 'full') return `${total} · Full`;
  return `${total} · ${e.spotsLeft} ${e.spotsLeft === 1 ? 'spot' : 'spots'} left`;
}

/** AUD cents → "~$35" / "~$35.50". */
export function formatAudEstimate(cents: number): string {
  const dollars = cents / 100;
  return `~$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

const GROUP_STYLE_TEXT: Record<RunSessionDetails['groupStyle'], string> = {
  stay_together: 'Stay together',
  regroup_at_finish: 'Regroup at the finish',
  pace_groups: 'Pace groups',
};

export function runSessionChips(d: RunSessionDetails): string[] {
  const chips = [formatDistance(d.distanceKm)];
  if (d.paceMode === 'target_pace' && d.paceMinSecPerKm != null && d.paceMaxSecPerKm != null) {
    chips.push(`Target ${formatPaceRange(d.paceMinSecPerKm, d.paceMaxSecPerKm)}`);
  } else {
    chips.push('Social pace');
  }
  chips.push(GROUP_STYLE_TEXT[d.groupStyle]);
  if (d.beginnerFriendly) chips.push('Beginner friendly');
  if (d.walkBreaksOk) chips.push('Walk breaks OK');
  return chips;
}

export function golfSessionChips(d: GolfSessionDetails): string[] {
  const chips = [`${d.holes} holes`];
  chips.push(d.teeTimeStatus === 'secured' ? 'Tee time secured (host says)' : 'Planning to book');
  if (d.estimatedCostCents != null) chips.push(formatAudEstimate(d.estimatedCostCents));
  if (d.handicapMinTenths != null && d.handicapMaxTenths != null) {
    chips.push(`${formatHandicap(d.handicapMinTenths)}–${formatHandicap(d.handicapMaxTenths)} guide`);
  }
  if (d.beginnersWelcome) chips.push('Beginners welcome');
  return chips;
}

/** Factual detail chips for any event; empty for legacy events. */
export function sessionChips(e: Pick<EventSummary, 'runDetails' | 'golfDetails'>): string[] {
  if (e.runDetails) return runSessionChips(e.runDetails);
  if (e.golfDetails) return golfSessionChips(e.golfDetails);
  return [];
}
