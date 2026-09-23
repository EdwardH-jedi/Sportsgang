/**
 * Discovery domain types.
 *
 * Discovery is the browsing surface — the Discover tab in the mobile app.
 *
 * A PartnerCard is the summary shown in the discovery feed.
 * A DiscoveryAction is a pass/like/save gesture by the current user.
 * When two users mutually like each other, a Match is created.
 */

import type { Paginated, UUID } from './common';
import type { FitnessLevel, PreferredTime, Sport } from './sport-profile';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type DiscoveryAction = 'like' | 'pass' | 'save';

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

export interface DiscoveryFilter {
  sport?: Sport;                 // required filter — gym, golf, tennis, or running
  level?: FitnessLevel;
  suburb?: string;               // Sydney suburb
  preferredTime?: PreferredTime;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/**
 * A potential workout partner as shown in the discovery feed.
 * Intentionally limited — enough to render a card and make a like/pass decision.
 */
export interface PartnerCard {
  userId: UUID;
  displayName: string;
  suburb?: string;
  bioExcerpt?: string;    // truncated at 160 chars by the API
  bio?: string;           // full bio for the partner detail preview
  avatarUrl?: string;
  // Ordered list of all profile photos. Empty when the user has not
  // uploaded any. avatar_url mirrors photoUrls[0] when set, but consumers
  // should prefer photoUrls for the detail/gallery view.
  photoUrls?: string[];
  age?: number;           // derived from birthYear on the server
  sportProfiles: Array<{
    sport: Sport;
    level: FitnessLevel;
    gymName?: string;
    golfClub?: string;
  }>;
  /**
   * Coarse distance to this runner's home area (rounded up to 0.5 km,
   * minimum 1.0). Only set when the feed was requested with lat/lng.
   */
  distanceKm?: number | null;
}

/** GET /discovery query. Wire names: sport, limit, offset, lat, lng, radius_km. */
export interface DiscoveryQuery {
  sport: Sport;
  limit?: number;                   // 1–50, default 20
  offset?: number;
  /**
   * Provide both lat and lng or neither. With them, runners without a
   * home location or outside radiusKm are excluded and the feed is
   * ordered nearest first.
   */
  lat?: number;
  lng?: number;
  /** 1–50, default 10. */
  radiusKm?: number;
}

export type DiscoveryFeedResponse = Paginated<PartnerCard>;

// ---------------------------------------------------------------------------
// Request / response for recording an action
// ---------------------------------------------------------------------------

export interface RecordActionRequest {
  targetUserId: UUID;
  action: DiscoveryAction;
  sport: Sport;
}

export interface RecordActionResponse {
  action: DiscoveryAction;
  matchCreated: boolean;
  matchId?: UUID;
}
