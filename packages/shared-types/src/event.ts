/**
 * Event ("battle" / "game") domain types.
 *
 * Distinct from Booking (1:1 partner session). One host opens an
 * event, other users join up to capacity.
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
}
