/**
 * Pace + distance formatting for running surfaces (run cards, crew pace
 * bands, the host-a-run form).
 *
 * Pace is stored as whole seconds per km (backend range 150–900, i.e.
 * 2:30–15:00 /km). A band is (min, max) where min is the FASTER bound
 * (fewer seconds). Either bound may be null.
 */

export const PACE_MIN_SEC = 150;
export const PACE_MAX_SEC = 900;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 330 → "5:30". Returns "" for null / non-finite input. */
export function formatPace(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

/** 330 → "5:30 /km". */
export function formatPaceWithUnit(sec: number | null | undefined): string {
  const p = formatPace(sec);
  return p ? `${p} /km` : '';
}

/**
 * "5:30" / "5.30" / "5" → seconds per km. Returns null for anything that
 * isn't a plausible m:ss value (seconds must be 0–59).
 */
export function parsePace(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const minutes = Number(m[1]);
  const seconds = m[2] === undefined ? 0 : Number(m[2]);
  if (m[2] !== undefined && m[2].length !== 2) return null;
  if (seconds > 59) return null;
  return minutes * 60 + seconds;
}

/**
 * Human pace band: "5:00–6:00 /km", "5:30 /km" (equal bounds),
 * "From 5:00 /km" (only the fast bound), "Up to 6:00 /km" (only the
 * slow bound), or null when neither bound is set.
 */
export function paceBandText(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (hasMin && hasMax) {
    if (min === max) return formatPaceWithUnit(min);
    return `${formatPace(min)}–${formatPace(max)} /km`;
  }
  if (hasMin) return `From ${formatPaceWithUnit(min)}`;
  if (hasMax) return `Up to ${formatPaceWithUnit(max)}`;
  return null;
}

/** Compact value for a StatBlock ("5:00–6:00"), without the unit. */
export function paceBandValue(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (hasMin && hasMax) {
    return min === max ? formatPace(min) : `${formatPace(min)}–${formatPace(max)}`;
  }
  if (hasMin) return `${formatPace(min)}+`;
  if (hasMax) return `≤${formatPace(max)}`;
  return null;
}

export interface PaceBandInput {
  min: number | null;
  max: number | null;
  error: string | null;
}

/**
 * Validates the two free-text pace fields of a form. Empty fields are
 * allowed (null). Mirrors the backend rules: 2:30–15:00 /km, min ≤ max.
 */
export function validatePaceBand(minText: string, maxText: string): PaceBandInput {
  const minT = minText.trim();
  const maxT = maxText.trim();
  const min = minT ? parsePace(minT) : null;
  const max = maxT ? parsePace(maxT) : null;
  if ((minT && min === null) || (maxT && max === null)) {
    return { min, max, error: 'Use minutes:seconds, e.g. 5:30.' };
  }
  const outOfRange = (v: number | null) =>
    v !== null && (v < PACE_MIN_SEC || v > PACE_MAX_SEC);
  if (outOfRange(min) || outOfRange(max)) {
    return {
      min,
      max,
      error: `Pace must be between ${formatPace(PACE_MIN_SEC)} and ${formatPace(PACE_MAX_SEC)} /km.`,
    };
  }
  if (min !== null && max !== null && min > max) {
    return { min, max, error: 'The faster pace must come first.' };
  }
  return { min, max, error: null };
}

/** 5 → "5", 5.25 → "5.3", 21.1 → "21.1". */
export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '';
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 2 → "2 km away"; under 1 km reads "Under 1 km away". */
export function formatDistanceAway(km: number | null | undefined): string | null {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  if (km < 1) return 'Under 1 km away';
  return `${formatKm(km)} km away`;
}

/** Parses a distance input ("5", "10.5", "21,1") → km, or null. */
export function parseKm(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
