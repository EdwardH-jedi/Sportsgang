/**
 * Event ("battle" / "game") domain types.
 *
 * Distinct from Booking (1:1 partner session) and Tournament
 * (multi-round structured competition). One host opens an event,
 * other users join up to capacity.
 */

import type { ISODateString, UUID } from './common';

export type EventMode = 'casual' | 'ranked';
export type EventVisibility = 'public' | 'private';
export type EventStatus = 'open' | 'full' | 'cancelled' | 'completed';
export type AttendanceStatus = 'pending' | 'attended' | 'no_show' | 'excused';
export type SelfAttendanceStatus = 'attended' | 'excused';
export type ParticipantLifecycleStatus = 'joined' | 'left';

export interface EventHost {
  id: UUID;
  displayName: string;
}

export interface EventSummary {
  id: UUID;
  hostUserId: UUID;
  host: EventHost | null;
  title: string;
  sport: string;
  mode: EventMode;
  startsAt: ISODateString;
  locationText: string;
  capacity: number;
  participantCount: number;
  spotsLeft: number;
  visibility: EventVisibility;
  status: EventStatus;
  hasJoined: boolean;
  description: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  // --- Group-run fields (run-first). Null for ordinary events; optional
  // so fixtures written for the v1.0 shape still type-check. ---------
  crewId?: UUID | null;
  crewName?: string | null;
  /** Public meeting point (5 dp). */
  meetingLat?: number | null;
  meetingLng?: number | null;
  /** Planned distance in km (0.5–100). */
  distanceKm?: number | null;
  /** Pace band in seconds per km (150–900). */
  paceMinSecPerKm?: number | null;
  paceMaxSecPerKm?: number | null;
  /** km (1 dp) from the query lat/lng; only set on geo-filtered lists. */
  distanceKmFromYou?: number | null;
}

export interface EventParticipantSummary {
  userId: UUID;
  displayName: string;
  joinedAt: ISODateString;
  // attendanceStatus is intentionally not on this shape. Attendance
  // data is only returned by GET /events/{id}/attendance, never via
  // GET /events/{id}.
}

export interface AttendanceEntry {
  eventId: UUID;
  participantUserId: UUID;
  displayName: string;
  participantStatus: ParticipantLifecycleStatus;
  attendanceStatus: AttendanceStatus;
  joinedAt: ISODateString;
  leftAt: ISODateString | null;
  attendanceConfirmedByHostAt: ISODateString | null;
  attendanceSelfReportedAt: ISODateString | null;
  attendanceNote: string | null;
}

export interface AttendanceListResponse {
  eventId: UUID;
  hostUserId: UUID;
  items: AttendanceEntry[];
}

export interface HostAttendanceUpdateRequest {
  participantUserId: UUID;
  attendanceStatus: AttendanceStatus;
  attendanceNote?: string | null;
}

export interface SelfAttendanceRequest {
  attendanceStatus: SelfAttendanceStatus;
  attendanceNote?: string | null;
}

export interface EventDetail extends EventSummary {
  participants: EventParticipantSummary[];
}

export interface EventListResponse {
  items: EventSummary[];
  total: number;
}

/**
 * Optional group-run fields accepted by create and update. Wire names:
 * crew_id, meeting_lat, meeting_lng, distance_km, pace_min_sec_per_km,
 * pace_max_sec_per_km.
 */
export interface GroupRunFields {
  /** Caller must be a member of the crew (403 otherwise, 404 if unknown). */
  crewId?: UUID | null;
  /** Send both or neither. */
  meetingLat?: number | null;
  meetingLng?: number | null;
  distanceKm?: number | null;
  paceMinSecPerKm?: number | null;
  paceMaxSecPerKm?: number | null;
}

export interface CreateEventRequest extends GroupRunFields {
  title: string;
  sport: string;
  mode: EventMode;
  startsAt: ISODateString;
  locationText: string;
  capacity: number;
  description?: string | null;
  visibility?: EventVisibility;
}

/**
 * PATCH /events/{id} body (host only, open/full events). Omitted fields
 * are untouched. Capacity cannot go below the joined count. Sport, mode
 * and visibility are fixed at creation.
 */
export interface UpdateEventRequest extends GroupRunFields {
  title?: string;
  startsAt?: ISODateString;
  locationText?: string;
  capacity?: number;
  description?: string | null;
}

/**
 * GET /events query. Wire names: mine, sport, mode, limit, offset,
 * crew_id, lat, lng, radius_km, from, to.
 */
export interface EventListQuery {
  mine?: boolean;
  sport?: string;
  mode?: EventMode;
  limit?: number;                   // 1–50, default 20
  offset?: number;
  crewId?: UUID;
  /** Provide both lat and lng or neither; filters on the meeting point. */
  lat?: number;
  lng?: number;
  /** 1–50, default 10. Only applies with lat/lng. */
  radiusKm?: number;
  /** starts_at >= from */
  from?: ISODateString;
  /** starts_at < to */
  to?: ISODateString;
}
