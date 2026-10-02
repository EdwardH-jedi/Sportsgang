/**
 * Form state + validation + payload building for the v2 running / golf
 * preference forms. Pure functions so the setup flow, the edit screen and
 * the tests share one implementation of docs/run-golf-v2/CONTRACTS.md §2.
 *
 * Payload rules:
 *  - preferencesVersion: 2 is always sent (the v2 flow marks completion).
 *  - Only the chosen sport's v2 fields are sent; golf fields never ride on a
 *    running payload or vice versa.
 *  - Cleared optional v2 fields are sent as explicit null (the API treats an
 *    omitted v2 key as "keep the stored value").
 *  - Legacy gymName / golfClub / goals use full-replace semantics on the
 *    API, so an existing row's values are echoed back to avoid wiping them.
 */

import type {
  FitnessLevel,
  FocusSport,
  GolfExperience,
  GolfHandicapSource,
  GolfPartnerIntent,
  GolfPreferredHoles,
  PreferredTime,
  RunGroupStyle,
  RunPaceMode,
  SportProfile,
  UpsertSportProfileRequest,
} from '@protin/shared-types';

import {
  PREFERENCES_V2,
  formatHandicap,
  formatPace,
  parseHandicap,
  parsePaceRange,
} from '../../lib/sportPreferences';

export interface GolfFormState {
  level: FitnessLevel | null;
  handicapSource: GolfHandicapSource | null;
  handicapText: string;
  experience: GolfExperience | null;
  intents: GolfPartnerIntent[];
  toleranceTenths: number | null;
  holes: GolfPreferredHoles | null;
}

export interface RunFormState {
  level: FitnessLevel | null;
  paceMode: RunPaceMode | null;
  paceFastest: string;
  paceSlowest: string;
  distances: number[];
  groupStyle: RunGroupStyle | null;
}

export function emptyGolfForm(): GolfFormState {
  return {
    level: null,
    handicapSource: null,
    handicapText: '',
    experience: null,
    intents: [],
    toleranceTenths: null,
    holes: null,
  };
}

export function emptyRunForm(): RunFormState {
  return {
    level: null,
    paceMode: null,
    paceFastest: '',
    paceSlowest: '',
    distances: [],
    groupStyle: null,
  };
}

/** Prefill from a stored row. Legacy rows only contribute their level. */
export function golfFormFromProfile(sp: SportProfile | null | undefined): GolfFormState {
  if (!sp) return emptyGolfForm();
  return {
    level: sp.level ?? null,
    handicapSource: sp.golfHandicapSource ?? null,
    handicapText:
      sp.golfHandicapTenths !== null && sp.golfHandicapTenths !== undefined
        ? formatHandicap(sp.golfHandicapTenths)
        : '',
    experience: sp.golfExperience ?? null,
    intents: sp.golfPartnerIntents ? [...sp.golfPartnerIntents] : [],
    toleranceTenths: sp.golfSimilarityToleranceTenths ?? null,
    holes: sp.golfPreferredHoles ?? null,
  };
}

export function runFormFromProfile(sp: SportProfile | null | undefined): RunFormState {
  if (!sp) return emptyRunForm();
  const hasRange = sp.runPaceMinSecPerKm != null && sp.runPaceMaxSecPerKm != null;
  return {
    level: sp.level ?? null,
    paceMode: sp.runPaceMode ?? null,
    paceFastest: hasRange ? formatPace(sp.runPaceMinSecPerKm as number) : '',
    paceSlowest: hasRange ? formatPace(sp.runPaceMaxSecPerKm as number) : '',
    distances: sp.runDistancesKm ? [...sp.runDistancesKm] : [],
    groupStyle: sp.runGroupStyle ?? null,
  };
}

/** v2 fields + level for one sport — everything except availability. */
export type SportFields = Omit<UpsertSportProfileRequest, 'preferredTimes'>;

export type FormResult = { ok: true; fields: SportFields } | { ok: false; error: string };

export function validateGolfForm(form: GolfFormState): FormResult {
  if (!form.level) return { ok: false, error: 'Choose your overall level.' };
  if (!form.handicapSource) return { ok: false, error: 'Choose your handicap situation.' };
  let handicap: number | null = null;
  if (form.handicapSource !== 'none') {
    const parsed = parseHandicap(form.handicapText);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    handicap = parsed.value;
  }
  if (!form.experience) return { ok: false, error: 'Choose your golf experience.' };
  if (form.intents.length === 0) return { ok: false, error: 'Choose at least one kind of golf partner.' };
  const similar = form.intents.includes('similar_level');
  return {
    ok: true,
    fields: {
      sport: 'golf',
      level: form.level,
      preferencesVersion: PREFERENCES_V2,
      golfHandicapTenths: handicap,
      golfHandicapSource: form.handicapSource,
      golfExperience: form.experience,
      golfPartnerIntents: [...form.intents],
      golfSimilarityToleranceTenths: similar ? form.toleranceTenths : null,
      golfPreferredHoles: form.holes,
    },
  };
}

export function validateRunForm(form: RunFormState): FormResult {
  if (!form.level) return { ok: false, error: 'Choose your overall level.' };
  if (!form.paceMode) return { ok: false, error: 'Choose whether you want to match pace or run socially.' };
  const fastest = form.paceFastest.trim();
  const slowest = form.paceSlowest.trim();
  let paceMin: number | null = null;
  let paceMax: number | null = null;
  if (form.paceMode === 'match_pace' || fastest || slowest) {
    if (form.paceMode === 'social' && (!fastest || !slowest)) {
      return { ok: false, error: 'Give both ends of your usual pace, or leave both empty.' };
    }
    if (form.paceMode === 'match_pace' && (!fastest || !slowest)) {
      return { ok: false, error: 'Matching pace needs your comfortable pace range.' };
    }
    const range = parsePaceRange(fastest, slowest);
    if (!range.ok) return { ok: false, error: range.error };
    paceMin = range.min;
    paceMax = range.max;
  }
  const distances = [...new Set(form.distances)].sort((a, b) => a - b);
  return {
    ok: true,
    fields: {
      sport: 'running',
      level: form.level,
      preferencesVersion: PREFERENCES_V2,
      runPaceMode: form.paceMode,
      runPaceMinSecPerKm: paceMin,
      runPaceMaxSecPerKm: paceMax,
      runDistancesKm: distances.length > 0 ? distances : null,
      runGroupStyle: form.groupStyle,
    },
  };
}

export function validateTimes(times: PreferredTime[]): string | null {
  return times.length === 0 ? 'Choose when you usually play, or Flexible.' : null;
}

/** Final upsert body: sport fields + availability + echoed legacy fields. */
export function buildUpsert(
  fields: SportFields,
  preferredTimes: PreferredTime[],
  existing: SportProfile | null | undefined
): UpsertSportProfileRequest {
  const body: UpsertSportProfileRequest = { ...fields, preferredTimes: [...preferredTimes] };
  if (existing) {
    if (existing.gymName != null) body.gymName = existing.gymName;
    if (existing.golfClub != null) body.golfClub = existing.golfClub;
    if (existing.goals != null) body.goals = existing.goals;
  }
  return body;
}

/** Toggle helper shared by the multi-select chip groups. */
export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Availability toggle: "Flexible" is exclusive with specific slots. */
export function toggleTime(list: PreferredTime[], value: PreferredTime): PreferredTime[] {
  if (value === 'flexible') return list.includes('flexible') ? [] : ['flexible'];
  return toggleIn(list.filter((t) => t !== 'flexible'), value);
}

export function sportTitle(sport: FocusSport): string {
  return sport === 'golf' ? 'Your golf' : 'Your running';
}
