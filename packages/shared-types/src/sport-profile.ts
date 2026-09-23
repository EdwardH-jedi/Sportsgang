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

// Backend contract for partner-matching sports. Display order (running
// first), labels and per-sport copy live in the mobile registry
// (apps/mobile/src/lib/sports.ts) — change metadata there, not these ids.
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

export interface SportProfile {
  id: UUID;
  userId: UUID;
  sport: Sport;
  level: FitnessLevel;
  preferredTimes: PreferredTime[];
  gymName?: string;    // for sport === 'gym'
  golfClub?: string;   // for sport === 'golf'
  goals?: string;      // max 300 chars
  updatedAt: ISODateString;
}

export interface UpsertSportProfileRequest {
  sport: Sport;
  level: FitnessLevel;
  preferredTimes: PreferredTime[];
  gymName?: string;
  golfClub?: string;
  goals?: string;
}
