/**
 * Events ("battles" in the UI) API client.
 *
 * Wraps the typed /events surface. The shared @protin/shared-types
 * package owns the response shapes — this file is intentionally thin
 * so the type contract stays in one place.
 */

import { api } from './api';
import { roundCoord } from './location';
import { getSport, sportLabel } from './sports';
import type {
  AttendanceEntry,
  AttendanceListResponse,
  AttendanceStatus,
  CreateEventRequest,
  EventDetail,
  EventListResponse,
  EventMode,
  HostAttendanceUpdateRequest,
  SelfAttendanceRequest,
  UpdateEventRequest,
} from '@protin/shared-types';

export type {
  UpdateEventRequest,
  GroupRunFields,
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
  limit?: number;
  offset?: number;
  /** Only runs of this crew. */
  crewId?: string;
  /** Meeting-point geo filter; send both or neither (rounded to 2 dp). */
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** ISO-8601: starts_at >= from. */
  from?: string;
  /** ISO-8601: starts_at < to. */
  to?: string;
}

export function buildEventQuery(params: ListEventsParams): string {
  const qs = new URLSearchParams();
  if (params.mine) qs.set('mine', 'true');
  if (params.sport) qs.set('sport', params.sport);
  if (params.mode) qs.set('mode', params.mode);
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  if (params.crewId) qs.set('crew_id', params.crewId);
  if (params.lat !== undefined && params.lng !== undefined) {
    qs.set('lat', String(roundCoord(params.lat)));
    qs.set('lng', String(roundCoord(params.lng)));
    if (params.radiusKm !== undefined) qs.set('radius_km', String(params.radiusKm));
  }
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export async function listEvents(
  params: ListEventsParams = {}
): Promise<EventListResponse> {
  return api.get<EventListResponse>(`/events${buildEventQuery(params)}`);
}

export async function getEvent(eventId: string): Promise<EventDetail> {
  return api.get<EventDetail>(`/events/${eventId}`);
}

export async function createEvent(body: CreateEventRequest): Promise<EventDetail> {
  return api.post<EventDetail>('/events', body);
}

/**
 * Host-only partial update (PATCH /events/{id}); open/full events only.
 * Sport, mode and visibility are fixed at creation.
 */
export async function updateEvent(
  eventId: string,
  body: UpdateEventRequest
): Promise<EventDetail> {
  return api.patch<EventDetail>(`/events/${eventId}`, body);
}

export async function joinEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/join`);
}

export async function leaveEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/leave`);
}

/**
 * Host-only: cancel the event. Backend returns the updated EventDetail
 * with status='cancelled'. Idempotent — calling on an already-cancelled
 * event returns the current detail without erroring.
 */
export async function cancelEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/cancel`);
}

/**
 * Host-only: complete the event. Backend returns status='completed'.
 * Rejected (422) if called before `starts_at`. Idempotent if already
 * completed.
 */
export async function completeEvent(eventId: string): Promise<EventDetail> {
  return api.post<EventDetail>(`/events/${eventId}/complete`);
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
 * Battle sport options. Wider than the partner-matching registry in
 * lib/sports — the backend stores battle sport as a freeform lowercase
 * string, so adding more here doesn't require a migration. Sports that
 * also exist in the registry reuse its copy (chips use the compact
 * `shortLabel`, e.g. "Run"). Running is first, and so is the host form's
 * default.
 */
export const BATTLE_SPORTS = [
  { value: 'running', label: getSport('running').shortLabel },
  { value: 'basketball', label: 'Basketball' },
  { value: 'soccer', label: 'Soccer' },
  { value: 'golf', label: getSport('golf').shortLabel },
  { value: 'badminton', label: 'Badminton' },
  { value: 'tennis', label: getSport('tennis').shortLabel },
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

/** Group runs are events with sport "running". */
export function isRunningSport(sport: string | null | undefined): boolean {
  return sport === 'running';
}

/** User-facing noun: "run" for running, "game" for everything else. */
export function eventNoun(sport: string | null | undefined): 'run' | 'game' {
  return isRunningSport(sport) ? 'run' : 'game';
}

export function sportLabelForBattle(sport: string): string {
  const found = BATTLE_SPORTS.find((s) => s.value === sport);
  return found ? found.label : sportLabel(sport);
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
