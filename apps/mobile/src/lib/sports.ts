/**
 * Sport registry — the single source of truth for the partner-matching
 * sports the app supports, in display order.
 *
 * Running is first: the product is running / running-crew led, so every
 * sport picker (Discovery chips, onboarding) lists it first and defaults
 * to it. The id union itself (`Sport`) lives in @protin/shared-types and
 * is the backend contract — never change the ids here, only the metadata.
 *
 * Battles accept a wider, free-form sport vocabulary (basketball, soccer,
 * …); that list lives in lib/events (`BATTLE_SPORTS`) and reuses this
 * registry's copy where the two overlap.
 */

import type { Sport, SportProfile } from '@protin/shared-types';

export type { Sport };

/** Sport-profile field that stores the user's regular venue, if any. */
export type SportVenueField = Extract<keyof SportProfile, 'gymName' | 'golfClub'>;

export interface SportConfig {
  id: Sport;
  /** Full display label ("Running"). */
  label: string;
  /** Compact label for dense chips ("Run"). */
  shortLabel: string;
  /** Onboarding: label + placeholder for the "regular venue" input. */
  venueLabel: string;
  venuePlaceholder: string;
  /**
   * Onboarding: which sport-profile field persists the venue text. Sports
   * without a backend column keep the input for the user but don't send it.
   */
  venueField: SportVenueField | null;
  /** Discovery card hero colour (bright top band; fades to near-black). */
  heroColor: string;
}

export const SPORTS: readonly SportConfig[] = [
  {
    id: 'running',
    label: 'Running',
    shortLabel: 'Run',
    venueLabel: 'Regular route (optional)',
    venuePlaceholder: 'e.g. Centennial Park loop',
    venueField: null,
    heroColor: '#2EB6FF', // sky-blue
  },
  {
    id: 'gym',
    label: 'Gym',
    shortLabel: 'Gym',
    venueLabel: 'Gym name (optional)',
    venuePlaceholder: 'e.g. Fitness First Surry Hills',
    venueField: 'gymName',
    heroColor: '#A8E61A', // electric lime (brand)
  },
  {
    id: 'tennis',
    label: 'Tennis',
    shortLabel: 'Tennis',
    venueLabel: 'Tennis club (optional)',
    venuePlaceholder: 'e.g. White City Tennis Club',
    venueField: null,
    heroColor: '#F5A524', // amber / clay-court
  },
  {
    id: 'golf',
    label: 'Golf',
    shortLabel: 'Golf',
    venueLabel: 'Golf club (optional)',
    venuePlaceholder: 'e.g. Royal Sydney Golf Club',
    venueField: 'golfClub',
    heroColor: '#1FAA59', // forest green
  },
];

/** Ordered sport ids, running first. */
export const SPORT_IDS: readonly Sport[] = SPORTS.map((s) => s.id);

/** The sport pickers default to (and the fallback for "primary sport"). */
export const DEFAULT_SPORT: Sport = SPORTS[0].id;

const BY_ID: Record<Sport, SportConfig> = Object.fromEntries(
  SPORTS.map((s) => [s.id, s])
) as Record<Sport, SportConfig>;

export function isSport(value: unknown): value is Sport {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, value);
}

export function getSport(id: Sport): SportConfig {
  return BY_ID[id];
}

/**
 * Display label for any sport string. Unknown values (e.g. free-form
 * battle sports) are capitalised rather than dropped.
 */
export function sportLabel(sport: string): string {
  return isSport(sport) ? BY_ID[sport].label : capitalize(sport);
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
