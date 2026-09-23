/**
 * Shared session/booking helpers for the Events tab + Profile Upcoming +
 * ChatScreen proposal cards.
 *
 * Why this file exists:
 *   - The Events tab needs the same paginated lists Profile/ChatScreen already
 *     fetch. Inlining the endpoint strings in every caller would mean every
 *     future status filter or query-shape change has to be hunted across N
 *     screens.
 *   - This is intentionally a thin wrapper — no caching, no global state. The
 *     consumer screens still own their own React state (loading, refresh).
 */

import { api } from './api';

export type SessionStatus =
  | 'proposed'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface SessionVenue {
  name: string;
  area?: string | null;
  address?: string | null;
}

export interface SessionPartner {
  displayName: string;
}

/**
 * Camel-cased booking row as it lands on mobile after the api module's
 * snake→camel transform. Matches what ChatScreen and ProfileScreen already
 * consume; declared here so other screens can reuse without re-typing.
 */
export interface Session {
  id: string;
  matchId: string;
  proposerId: string;
  partnerId: string;
  sport: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  partner: SessionPartner;
  venue?: SessionVenue | null;
}

export interface SessionListResponse {
  items: Session[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;

function buildBookingsUrl(params: {
  status?: string;
  matchId?: string;
  limit?: number;
}): string {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.matchId) search.set('match_id', params.matchId);
  search.set('limit', String(params.limit ?? DEFAULT_LIMIT));
  return `/bookings?${search.toString()}`;
}

/**
 * Confirmed future sessions for the signed-in user. Past sessions are
 * filtered client-side via `endsAt > now` so the API stays generic — the
 * same /bookings list also feeds BookingDetail history elsewhere.
 */
export async function fetchUpcomingSessions(
  now: Date = new Date()
): Promise<Session[]> {
  const res = await api.get<SessionListResponse>(
    buildBookingsUrl({ status: 'confirmed' })
  );
  const nowMs = now.getTime();
  return res.items.filter(
    (b) =>
      (b.status === 'confirmed' || b.status === 'accepted') &&
      typeof b.endsAt === 'string' &&
      new Date(b.endsAt).getTime() > nowMs
  );
}

/**
 * Pending proposals for the signed-in user — both incoming (where the user
 * is the partner / receiver) and outgoing (where the user is the proposer).
 * Callers split by `proposerId === currentUserId` to render the right
 * card variant.
 */
export async function fetchPendingSessions(): Promise<Session[]> {
  const res = await api.get<SessionListResponse>(
    buildBookingsUrl({ status: 'proposed' })
  );
  return res.items.filter((b) => b.status === 'proposed');
}

/**
 * FSM transitions exposed by `POST /bookings/{id}/{action}`. Either party
 * can call any of them; the backend enforces who may do what.
 */
export type BookingAction = 'confirm' | 'decline' | 'cancel' | 'complete' | 'no-show';

/** Statuses the in-chat proposal cards render (cancelled rows are hidden). */
const MATCH_PROPOSAL_STATUSES = 'proposed,confirmed,declined';

/**
 * Every non-cancelled booking on a match — feeds the chat's proposal cards.
 * The query string is written out literally (comma list unencoded) to keep
 * the exact request the chat screen has always sent.
 */
export async function listMatchProposals<T = Session>(
  matchId: string
): Promise<{ items: T[]; total: number; limit: number; offset: number }> {
  return api.get<{ items: T[]; total: number; limit: number; offset: number }>(
    `/bookings?match_id=${matchId}&status=${MATCH_PROPOSAL_STATUSES}&limit=50`
  );
}

/** Single booking by id (BookingDetail). */
export async function getBooking<T = Session>(bookingId: string): Promise<T> {
  return api.get<T>(`/bookings/${bookingId}`);
}

/** Run one FSM transition and return the updated booking. */
export async function transitionBooking<T = Session>(
  bookingId: string,
  action: BookingAction
): Promise<T> {
  return api.post<T>(`/bookings/${bookingId}/${action}`, {});
}

export interface CreateBookingRequest {
  matchId: string;
  sport: string;
  /** Local wall-clock ISO string without offset, e.g. `2026-05-01T09:00:00`. */
  startsAt: string;
  endsAt: string;
  location?: string;
  venueId?: string;
  notes?: string;
}

/** Propose a session on a match (BookingComposer). */
export async function createBooking(
  body: CreateBookingRequest
): Promise<{ id: string }> {
  return api.post<{ id: string }>('/bookings', body);
}

/** Mirror of the chat card's Accept action — calls the existing FSM endpoint. */
export async function acceptSession(sessionId: string): Promise<Session> {
  return api.post<Session>(`/bookings/${sessionId}/confirm`, {});
}

/** Mirror of the chat card's Decline action — calls the existing FSM endpoint. */
export async function declineSession(sessionId: string): Promise<Session> {
  return api.post<Session>(`/bookings/${sessionId}/decline`, {});
}
