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
import type {
  FitnessLevel,
  GolfExperience,
  GolfHandicapSource,
  GolfPartnerIntent,
  GolfPreferredHoles,
  PreferredTime,
  RunGroupStyle,
  RunPaceMode,
  Sport,
} from './sport-profile';

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
  offset?: number;               // legacy; ignored when cursor is sent
  cursor?: string;               // v2 opaque cursor from nextCursor
  strictPace?: boolean;          // running only: declared pace must overlap
}

// ---------------------------------------------------------------------------
// v2 compatibility (running / golf feeds only)
// ---------------------------------------------------------------------------

/**
 * compatible  — both people configured; both people's rules pass on stated facts
 * unverified  — nothing incompatible, but a fact the viewer's rule needs is
 *               unknown (e.g. a social runner with no declared pace)
 * needs_setup — viewer or candidate has not configured v2 preferences;
 *               no compatibility is claimed
 */
export type CompatibilityTier = 'compatible' | 'unverified' | 'needs_setup';

export interface CompatibilityNote {
  code: string;
  text: string;
}

export interface PartnerCompatibility {
  tier: CompatibilityTier;
  /** Factual reasons built only from stored preferences. */
  reasons: CompatibilityNote[];
  /** Honest limits: unknown pace, self-reported handicap, missing setup. */
  caveats: CompatibilityNote[];
}

/** Sport summary on a partner card. v2 fields are null on legacy rows. */
export interface PartnerSportSummary {
  sport: Sport;
  level: FitnessLevel;
  gymName?: string | null;
  golfClub?: string | null;
  preferencesConfigured: boolean;
  preferredTimes: PreferredTime[];
  golfHandicapTenths: number | null;
  golfHandicapSource: GolfHandicapSource | null;
  golfExperience: GolfExperience | null;
  golfPartnerIntents: GolfPartnerIntent[] | null;
  golfPreferredHoles: GolfPreferredHoles | null;
  runPaceMode: RunPaceMode | null;
  runPaceMinSecPerKm: number | null;
  runPaceMaxSecPerKm: number | null;
  runDistancesKm: number[] | null;
  runGroupStyle: RunGroupStyle | null;
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
  sportProfiles: PartnerSportSummary[];
  /** v2 bilateral compatibility; null on legacy gym/tennis feeds. */
  compatibility?: PartnerCompatibility | null;
}

export interface DiscoveryFeedResponse extends Paginated<PartnerCard> {
  /** Cursor for the next page; null on the last page. */
  nextCursor?: string | null;
  /** The viewer has not configured v2 preferences for this sport. */
  viewerSetupRequired?: boolean;
  /** `total` counts eligible candidates inside this bounded pool only. */
  poolLimit?: number;
}

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
