/**
 * v2 running / golf preference vocabulary, labels and display <-> storage
 * conversion. Mirrors docs/run-golf-v2/CONTRACTS.md §2 and the API's
 * app/services/sport_preferences.py bounds.
 *
 * Storage units:
 *   handicap — signed tenths (124 = "12.4", -21 = "+2.1")
 *   pace     — integer seconds per km (390 = "6:30 /km")
 */

import type {
  FitnessLevel,
  FocusSport,
  GolfExperience,
  GolfHandicapSource,
  GolfPartnerIntent,
  GolfPreferredHoles,
  PartnerSportSummary,
  PreferredTime,
  RunGroupStyle,
  RunPaceMode,
  SportProfile,
} from '@protin/shared-types';

export const PREFERENCES_V2 = 2 as const;

export const FOCUS_SPORTS: readonly FocusSport[] = ['running', 'golf'];

export const FOCUS_SPORT_LABEL: Record<FocusSport, string> = {
  running: 'Running',
  golf: 'Golf',
};

/** Short labels for the Run/Golf focus switch. */
export const FOCUS_SWITCH_OPTIONS: readonly { value: FocusSport; label: string }[] = [
  { value: 'running', label: 'Run' },
  { value: 'golf', label: 'Golf' },
];

export function isFocusSport(value: string | null | undefined): value is FocusSport {
  return value === 'running' || value === 'golf';
}

export const HANDICAP_MIN_TENTHS = -100;
export const HANDICAP_MAX_TENTHS = 540;
export const DEFAULT_TOLERANCE_TENTHS = 50;
export const PACE_MIN_SEC = 120;
export const PACE_MAX_SEC = 1200;

// ─── Option lists ────────────────────────────────────────────────────────────

export const LEVEL_OPTIONS: readonly { value: FitnessLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const TIME_OPTIONS: readonly { value: PreferredTime; label: string }[] = [
  { value: 'morning', label: 'Mornings' },
  { value: 'afternoon', label: 'Afternoons' },
  { value: 'evening', label: 'Evenings' },
  { value: 'flexible', label: 'Flexible' },
];

export const HANDICAP_SOURCE_OPTIONS: readonly {
  value: GolfHandicapSource;
  label: string;
  description: string;
}[] = [
  { value: 'official_index', label: 'Official handicap', description: 'From your club or Golf Australia (self-reported)' },
  { value: 'estimate', label: 'My estimate', description: 'Roughly what you play to' },
  { value: 'none', label: 'No handicap', description: 'Not sure or never had one' },
];

export const GOLF_EXPERIENCE_OPTIONS: readonly { value: GolfExperience; label: string }[] = [
  { value: 'new', label: 'New to golf' },
  { value: 'range', label: 'Driving range' },
  { value: 'played_rounds', label: 'Played some rounds' },
  { value: 'regular', label: 'Play regularly' },
];

export const GOLF_INTENT_OPTIONS: readonly {
  value: GolfPartnerIntent;
  label: string;
  description: string;
}[] = [
  { value: 'similar_level', label: 'Similar level', description: 'Golfers close to my handicap or experience' },
  {
    value: 'learn_from_experienced',
    label: 'Learn from experienced golfers',
    description: 'Play with someone who has more experience',
  },
  { value: 'welcome_beginners', label: 'Happy to play with beginners', description: 'I welcome newer golfers' },
  { value: 'any_level', label: 'Any level', description: 'Anyone is welcome' },
];

export const HOLES_OPTIONS: readonly { value: GolfPreferredHoles; label: string }[] = [
  { value: '9', label: '9 holes' },
  { value: '18', label: '18 holes' },
  { value: 'either', label: 'Either' },
];

export const TOLERANCE_OPTIONS_TENTHS: readonly number[] = [20, 50, 80, 120];

export const PACE_MODE_OPTIONS: readonly { value: RunPaceMode; label: string; description: string }[] = [
  { value: 'match_pace', label: 'Match my pace', description: 'Run with people at a similar pace' },
  { value: 'social', label: 'Social', description: 'Pace is flexible — company first' },
];

export const GROUP_STYLE_OPTIONS: readonly { value: RunGroupStyle; label: string }[] = [
  { value: 'stay_together', label: 'Stay together' },
  { value: 'regroup_at_finish', label: 'Regroup at the finish' },
  { value: 'pace_groups', label: 'Pace groups' },
];

export const DISTANCE_PRESETS_KM: readonly number[] = [3, 5, 8, 10, 15, 21.1, 42.2];

function labelFor<T extends string>(options: readonly { value: T; label: string }[], value: T | null | undefined) {
  return options.find((o) => o.value === value)?.label ?? null;
}

export const golfExperienceLabel = (v: GolfExperience | null | undefined) => labelFor(GOLF_EXPERIENCE_OPTIONS, v);
export const golfIntentLabel = (v: GolfPartnerIntent | null | undefined) => labelFor(GOLF_INTENT_OPTIONS, v);
export const groupStyleLabel = (v: RunGroupStyle | null | undefined) => labelFor(GROUP_STYLE_OPTIONS, v);
export const levelLabel = (v: FitnessLevel | null | undefined) => labelFor(LEVEL_OPTIONS, v);

// ─── Handicap ────────────────────────────────────────────────────────────────

/** 124 → "12.4", -21 → "+2.1", 0 → "0.0". */
export function formatHandicap(tenths: number): string {
  const sign = tenths < 0 ? '+' : '';
  const abs = Math.abs(tenths);
  return `${sign}${Math.floor(abs / 10)}.${abs % 10}`;
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Parse a typed handicap. Accepts "12", "12.4", "+2.1", "+0.5", "0".
 * A leading "-" is rejected because golf writes plus handicaps with "+".
 */
export function parseHandicap(input: string): ParseResult {
  const text = input.trim().replace(',', '.');
  if (!text) return { ok: false, error: 'Enter your handicap.' };
  if (text.startsWith('-')) {
    return { ok: false, error: 'Use + for a plus handicap (e.g. +2.1).' };
  }
  const match = /^(\+)?(\d{1,2})(?:\.(\d))?$/.exec(text);
  if (!match) return { ok: false, error: 'Use a number with at most one decimal, e.g. 12.4 or +2.1.' };
  const tenths = Number(match[2]) * 10 + Number(match[3] ?? 0);
  const value = match[1] ? -tenths : tenths;
  if (value < HANDICAP_MIN_TENTHS || value > HANDICAP_MAX_TENTHS) {
    return { ok: false, error: 'Handicaps run from +10.0 to 54.0.' };
  }
  return { ok: true, value };
}

// ─── Pace ────────────────────────────────────────────────────────────────────

/** 390 → "6:30". */
export function formatPace(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? `0${s}` : s}`;
}

export function formatPaceRange(min: number, max: number): string {
  return min === max ? `${formatPace(min)} /km` : `${formatPace(min)}–${formatPace(max)} /km`;
}

/**
 * Parse "m:ss" per km. "6.30" is rejected on purpose: it is ambiguous
 * (6.3 minutes is 6:18) and storing it as a decimal is a contract violation.
 */
export function parsePace(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter a pace like 5:30.' };
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(text);
  if (!match) return { ok: false, error: 'Use minutes:seconds, e.g. 5:30.' };
  const value = Number(match[1]) * 60 + Number(match[2]);
  if (value < PACE_MIN_SEC || value > PACE_MAX_SEC) {
    return { ok: false, error: 'Pace must be between 2:00 and 20:00 per km.' };
  }
  return { ok: true, value };
}

export type PaceRangeResult =
  | { ok: true; min: number; max: number }
  | { ok: false; error: string };

export function parsePaceRange(fastest: string, slowest: string): PaceRangeResult {
  const a = parsePace(fastest);
  if (!a.ok) return { ok: false, error: `Fastest pace: ${a.error}` };
  const b = parsePace(slowest);
  if (!b.ok) return { ok: false, error: `Slowest pace: ${b.error}` };
  if (a.value > b.value) {
    return { ok: false, error: 'The fastest pace must be quicker than (or equal to) the slowest pace.' };
  }
  return { ok: true, min: a.value, max: b.value };
}

// ─── Distances ───────────────────────────────────────────────────────────────

export function formatDistance(km: number): string {
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

export function formatDistances(list: number[] | null | undefined): string | null {
  if (!list || list.length === 0) return null;
  return `${list.map((d) => (Number.isInteger(d) ? `${d}` : d.toFixed(1))).join(' · ')} km`;
}

// ─── Profile helpers ─────────────────────────────────────────────────────────

type PreferenceFields = Pick<
  PartnerSportSummary,
  | 'golfHandicapTenths'
  | 'golfHandicapSource'
  | 'golfExperience'
  | 'golfPartnerIntents'
  | 'golfPreferredHoles'
  | 'runPaceMode'
  | 'runPaceMinSecPerKm'
  | 'runPaceMaxSecPerKm'
  | 'runDistancesKm'
  | 'runGroupStyle'
>;

export function isConfigured(sp: Pick<SportProfile, 'preferencesVersion'> | null | undefined): boolean {
  return !!sp && sp.preferencesVersion === PREFERENCES_V2;
}

/** Handicap line that never implies verification. */
export function handicapText(p: Pick<PreferenceFields, 'golfHandicapTenths' | 'golfHandicapSource'>): string | null {
  if (p.golfHandicapSource === 'none') return 'No handicap';
  if (p.golfHandicapTenths === null || p.golfHandicapTenths === undefined) return null;
  const suffix = p.golfHandicapSource === 'estimate' ? ' (estimate)' : ' (self-reported)';
  return `Handicap ${formatHandicap(p.golfHandicapTenths)}${suffix}`;
}

export function paceText(p: Pick<PreferenceFields, 'runPaceMode' | 'runPaceMinSecPerKm' | 'runPaceMaxSecPerKm'>): string | null {
  const hasRange = p.runPaceMinSecPerKm != null && p.runPaceMaxSecPerKm != null;
  if (hasRange) return formatPaceRange(p.runPaceMinSecPerKm as number, p.runPaceMaxSecPerKm as number);
  if (p.runPaceMode === 'social') return 'Pace not shared';
  return null;
}

/** Ordered, factual chips for a golf profile (cards / detail). */
export function golfChips(p: PreferenceFields): string[] {
  const chips: string[] = [];
  const hcp = handicapText(p);
  if (hcp) chips.push(hcp);
  const exp = golfExperienceLabel(p.golfExperience);
  if (exp) chips.push(exp);
  for (const intent of p.golfPartnerIntents ?? []) {
    const label = golfIntentLabel(intent);
    if (label) chips.push(label);
  }
  if (p.golfPreferredHoles && p.golfPreferredHoles !== 'either') chips.push(`${p.golfPreferredHoles} holes`);
  return chips;
}

/** Ordered, factual chips for a running profile (cards / detail). */
export function runChips(p: PreferenceFields): string[] {
  const chips: string[] = [];
  if (p.runPaceMode === 'social') chips.push('Social runner');
  const pace = paceText(p);
  if (pace && pace !== 'Pace not shared') chips.push(`Pace ${pace}`);
  else if (pace) chips.push(pace);
  const distances = formatDistances(p.runDistancesKm);
  if (distances) chips.push(distances);
  const style = groupStyleLabel(p.runGroupStyle);
  if (style) chips.push(style);
  return chips;
}
