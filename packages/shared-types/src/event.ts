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

// ---------------------------------------------------------------------------
// v2 running / golf session details (docs/run-golf-v2/CONTRACTS.md §5)
//
// Everything here is informational: only status and capacity block joining.
// The meeting point / course is the event's `locationText`; the tee time or
// start time is `startsAt`.
// ---------------------------------------------------------------------------

export type RunSessionPaceMode = 'target_pace' | 'social';

export interface RunSessionDetails {
  distanceKm: number;
  paceMode: RunSessionPaceMode;
  /** Required for target_pace, null for social. Seconds per km. */
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  groupStyle: 'stay_together' | 'regroup_at_finish' | 'pace_groups';
  beginnerFriendly: boolean;
  walkBreaksOk: boolean;
}

/** Host's declaration — never a course booking or platform verification. */
export type TeeTimeStatus = 'secured' | 'planning';

export interface GolfSessionDetails {
  holes: 9 | 18;
  teeTimeStatus: TeeTimeStatus;
  /** Optional estimate in AUD cents. */
  estimatedCostCents: number | null;
  /** Suitable handicap guide, signed tenths, pair or neither. */
  handicapMinTenths: number | null;
  handicapMaxTenths: number | null;
  beginnersWelcome: boolean;
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
  /** null on legacy events and on non-running sessions. */
  runDetails?: RunSessionDetails | null;
  /** null on legacy events and on non-golf sessions. */
  golfDetails?: GolfSessionDetails | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
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

export interface CreateEventRequest {
  title: string;
  sport: string;
  mode: EventMode;
  startsAt: ISODateString;
  locationText: string;
  capacity: number;
  description?: string | null;
  visibility?: EventVisibility;
  /** Only with sport 'running'; requires mode 'casual'. */
  runDetails?: RunSessionDetails;
  /** Only with sport 'golf'; requires mode 'casual'. */
  golfDetails?: GolfSessionDetails;
}
