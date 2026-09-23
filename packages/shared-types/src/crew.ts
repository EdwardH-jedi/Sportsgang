/**
 * Crew domain types (run-first redesign).
 *
 * A Crew is a persistent group of runners with a home area and a
 * typical pace band. Membership is `owner` or `member`; only owners can
 * edit or delete a crew. Group runs are Events with a `crewId` (see
 * event.ts).
 *
 * Privacy: a crew's home coordinates are write-only. Lists expose a
 * coarse `distanceKm` (rounded up to 0.5 km, minimum 1.0) instead.
 *
 * Wire keys are snake_case (e.g. `home_area`, `pace_min_sec_per_km`);
 * the mobile API client maps them to the camelCase names below.
 */

import type { ISODateString, Paginated, UUID } from './common';
import type { EventSummary } from './event';

export type CrewRole = 'owner' | 'member';
/** Only public crews exist for now. */
export type CrewVisibility = 'public';

/** Fields every crew representation carries. */
export interface Crew {
  id: UUID;
  name: string;                     // 1–60 chars
  description: string | null;       // ≤ 500 chars
  sport: string;                    // lower-case, default 'running'
  homeArea: string;                 // display name, e.g. "Surry Hills"
  /** Pace band in seconds per km (150–900); either bound may be null. */
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  visibility: CrewVisibility;
  /** Audit only — may be null after the creator deletes their account. */
  createdBy: UUID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Public member preview (same identity fields as PartnerCard). */
export interface CrewMember {
  userId: UUID;
  displayName: string;
  avatarUrl: string | null;
  role: CrewRole;
  joinedAt: ISODateString;
}

/** Compact next-run summary shown on crew list cards. */
export interface CrewNextRun {
  id: UUID;                         // event id → GET /events/{id}
  title: string;
  startsAt: ISODateString;
  locationText: string;
  distanceKm: number | null;
  paceMinSecPerKm: number | null;
  paceMaxSecPerKm: number | null;
  spotsLeft: number;
}

export interface CrewListItem extends Crew {
  memberCount: number;
  /** The caller's role, or null when not a member. */
  myRole: CrewRole | null;
  /** Coarse distance from the query point; null without lat/lng. */
  distanceKm: number | null;
  nextRun: CrewNextRun | null;
}

export interface CrewDetail extends CrewListItem {
  /**
   * Up to 12 members, owners first then by join date. Users in a block
   * relationship with the caller are omitted (memberCount still counts them).
   */
  members: CrewMember[];
  /** Up to 10 upcoming open/full public runs of this crew, soonest first. */
  upcomingRuns: EventSummary[];
}

export type CrewListResponse = Paginated<CrewListItem>;

/** GET /crews query. Wire names: lat, lng, radius_km, sport, q, mine, limit, offset. */
export interface CrewListQuery {
  /** Provide both lat and lng or neither. */
  lat?: number;
  lng?: number;
  /** 1–50, default 10. Only applies with lat/lng. */
  radiusKm?: number;
  sport?: string;
  /** Case-insensitive substring match on name or home area (1–60 chars). */
  q?: string;
  /** Only crews the caller belongs to. */
  mine?: boolean;
  limit?: number;                   // 1–50, default 20
  offset?: number;
}

/** POST /crews body. */
export interface CreateCrewRequest {
  name: string;
  description?: string | null;
  sport?: string;                   // default 'running'
  homeArea: string;
  /** Optional crew home point; send both or neither. Stored rounded to 2 dp. */
  homeLat?: number | null;
  homeLng?: number | null;
  paceMinSecPerKm?: number | null;
  paceMaxSecPerKm?: number | null;
  visibility?: CrewVisibility;
}

/**
 * PATCH /crews/{id} body (owner only). Omitted fields are untouched;
 * description, home point and pace bounds can be cleared with null.
 */
export interface UpdateCrewRequest {
  name?: string;
  description?: string | null;
  sport?: string;
  homeArea?: string;
  homeLat?: number | null;
  homeLng?: number | null;
  paceMinSecPerKm?: number | null;
  paceMaxSecPerKm?: number | null;
  visibility?: CrewVisibility;
}

/** DELETE /crews/{id}/membership response. */
export interface LeaveCrewResponse {
  crewId: UUID;
  /** True when the caller was the sole member (and owner) — the crew is gone. */
  crewDeleted: boolean;
}
