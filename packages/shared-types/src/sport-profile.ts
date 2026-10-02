/**
 * Sport profile domain types.
 *
 * Sport domain — gym, golf, tennis, and running.
 * This file covers both the user's own sport profile and identity preferences
 * (who they want to partner with).
 */

import type { ISODateString, UUID } from './common';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export type Sport = 'gym' | 'golf' | 'tennis' | 'running';

export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export type PreferredTime = 'morning' | 'afternoon' | 'evening' | 'flexible';

export type GenderPreference = 'any' | 'male' | 'female' | 'non_binary';

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: UUID;
  userId: UUID;
  displayName: string;
  bio?: string;            // max 400 chars
  birthYear?: number;      // age display only, not exact DOB
  suburb?: string;         // Sydney suburb
  avatarUrl?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateUserProfileRequest {
  displayName: string;
  bio?: string;
  birthYear?: number;
  suburb?: string;
}

export type UpdateUserProfileRequest = Partial<CreateUserProfileRequest>;

// ---------------------------------------------------------------------------
// Identity preferences (who you want to partner with)
// ---------------------------------------------------------------------------

export interface IdentityPreferences {
  id: UUID;
  userId: UUID;
  openTo: GenderPreference[];   // ['any'] or specific genders
  ageRangeMin: number;
  ageRangeMax: number;
  maxDistanceKm: number;
  updatedAt: ISODateString;
}

export interface SetIdentityPreferencesRequest {
  openTo: GenderPreference[];
  ageRangeMin: number;
  ageRangeMax: number;
  maxDistanceKm: number;
}

// ---------------------------------------------------------------------------
// Sport profile (your own fitness details per sport)
// ---------------------------------------------------------------------------

export interface SportProfile extends SportPreferencesV2 {
  id: UUID;
  userId: UUID;
  sport: Sport;
  level: FitnessLevel;
  preferredTimes: PreferredTime[];
  gymName?: string | null;    // for sport === 'gym'
  golfClub?: string | null;   // for sport === 'golf'
  goals?: string | null;      // max 300 chars
  updatedAt: ISODateString;
}

/**
 * Upsert body. Legacy fields keep full-replace semantics. Every
 * SportPreferencesV2 field follows "omitted = preserved, null = cleared"
 * (docs/run-golf-v2/CONTRACTS.md §2) — leave a key out to keep the stored
 * value, send null to clear it.
 */
export interface UpsertSportProfileRequest extends Partial<SportPreferencesV2> {
  sport: Sport;
  level: FitnessLevel;
  preferredTimes: PreferredTime[];
  gymName?: string | null;
  golfClub?: string | null;
  goals?: string | null;
}

// ---------------------------------------------------------------------------
// v2 running / golf preferences
// ---------------------------------------------------------------------------

/** Sports offered by the v2 app. Legacy `Sport` values stay readable. */
export type FocusSport = 'running' | 'golf';

/** Value of `preferencesVersion` once the v2 flow has been completed. */
export type SportPreferencesVersion = 2;

export type GolfHandicapSource = 'official_index' | 'estimate' | 'none';
export type GolfExperience = 'new' | 'range' | 'played_rounds' | 'regular';
export type GolfPartnerIntent =
  | 'similar_level'
  | 'learn_from_experienced'
  | 'welcome_beginners'
  | 'any_level';
export type GolfPreferredHoles = '9' | '18' | 'either';
export type RunPaceMode = 'match_pace' | 'social';
export type RunGroupStyle = 'stay_together' | 'regroup_at_finish' | 'pace_groups';

/**
 * Persisted v2 preference fields on a sport profile. `null` = not stated.
 * `preferencesVersion === null` means the row predates v2 (or was never
 * completed) and no compatibility is claimed for it.
 */
export interface SportPreferencesV2 {
  preferencesVersion: SportPreferencesVersion | null;
  /** Signed tenths: 124 = 12.4, -21 = +2.1 (plus handicap). */
  golfHandicapTenths: number | null;
  golfHandicapSource: GolfHandicapSource | null;
  golfExperience: GolfExperience | null;
  golfPartnerIntents: GolfPartnerIntent[] | null;
  /** Max handicap gap for similar_level, in tenths. null → default 5.0. */
  golfSimilarityToleranceTenths: number | null;
  golfPreferredHoles: GolfPreferredHoles | null;
  runPaceMode: RunPaceMode | null;
  /** Fastest end of the comfortable range, seconds per km. */
  runPaceMinSecPerKm: number | null;
  /** Slowest end of the comfortable range, seconds per km. */
  runPaceMaxSecPerKm: number | null;
  runDistancesKm: number[] | null;
  runGroupStyle: RunGroupStyle | null;
}
