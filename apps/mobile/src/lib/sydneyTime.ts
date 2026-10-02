/**
 * Australia/Sydney wall-time helpers for v2 session screens.
 *
 * The API speaks UTC ISO-8601. v2 screens render and collect session times
 * in Sydney time regardless of the device timezone (a visitor's phone set to
 * Seoul must still show a 6:30 am Centennial Park run as 6:30 am).
 *
 * Rule-based on purpose — no dependency on the device timezone or on Hermes
 * Intl timeZone support — and verified against Node's ICU data in tests:
 *
 *   AEST = UTC+10 (standard)
 *   AEDT = UTC+11 from the first Sunday of October 02:00 AEST
 *          until the first Sunday of April 03:00 AEDT
 *
 * Only UTC getters are used, so results never depend on the process TZ.
 */

const MINUTE_MS = 60_000;
export const AEST_OFFSET_MINUTES = 600;
export const AEDT_OFFSET_MINUTES = 660;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function firstSundayOfMonth(year: number, monthIndex: number): number {
  const dow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - dow) % 7);
}

/** UTC instant DST starts in `year` (first Sunday Oct, 02:00 AEST). */
function dstStartMs(year: number): number {
  return Date.UTC(year, 9, firstSundayOfMonth(year, 9), 2) - AEST_OFFSET_MINUTES * MINUTE_MS;
}

/** UTC instant DST ends in `year` (first Sunday Apr, 03:00 AEDT). */
function dstEndMs(year: number): number {
  return Date.UTC(year, 3, firstSundayOfMonth(year, 3), 3) - AEDT_OFFSET_MINUTES * MINUTE_MS;
}

/** Sydney UTC offset in minutes (600 or 660) at a UTC instant. */
export function sydneyOffsetMinutes(utcMs: number): number {
  const year = new Date(utcMs).getUTCFullYear();
  // Southern hemisphere: DST spans the turn of the year.
  return utcMs < dstEndMs(year) || utcMs >= dstStartMs(year) ? AEDT_OFFSET_MINUTES : AEST_OFFSET_MINUTES;
}

export interface SydneyParts {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday */
  weekday: number;
  offsetMinutes: number;
}

function toMs(input: string | Date | number): number {
  if (typeof input === 'number') return input;
  if (input instanceof Date) return input.getTime();
  return Date.parse(input);
}

export function toSydneyParts(input: string | Date | number): SydneyParts {
  const ms = toMs(input);
  const offsetMinutes = sydneyOffsetMinutes(ms);
  const shifted = new Date(ms + offsetMinutes * MINUTE_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
    offsetMinutes,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "Sat 4 Oct" */
export function formatSydneyDate(input: string | Date | number): string {
  const p = toSydneyParts(input);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "6:30 am", "12:00 pm" */
export function formatSydneyTime(input: string | Date | number): string {
  const p = toSydneyParts(input);
  const suffix = p.hour < 12 ? 'am' : 'pm';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${pad2(p.minute)} ${suffix}`;
}

/** "Sat 4 Oct · 6:30 am" */
export function formatSydneyDateTime(input: string | Date | number): string {
  return `${formatSydneyDate(input)} · ${formatSydneyTime(input)}`;
}

/** "Sat 4 Oct · 6:30 am – 7:30 am" for a start/end pair. */
export function formatSydneyRange(start: string, end: string): string {
  return `${formatSydneyDateTime(start)} – ${formatSydneyTime(end)}`;
}

/** Sydney calendar date of an instant as "YYYY-MM-DD". */
export function sydneyDateString(input: string | Date | number = Date.now()): string {
  const p = toSydneyParts(input);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Calendar arithmetic on "YYYY-MM-DD" (timezone-free). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

export type WallTimeResult = { ok: true; iso: string } | { ok: false; error: string };

/**
 * Sydney wall time → UTC ISO string.
 *
 * - DST gap (e.g. 2026-10-04 02:30 does not exist; clocks jump 02:00→03:00)
 *   returns an error so the form can ask for another time.
 * - DST overlap (e.g. 2027-04-04 02:30 happens twice) resolves to the
 *   earlier instant, i.e. the AEDT (UTC+11) occurrence.
 */
export function sydneyWallTimeToUtc(date: string, time: string): WallTimeResult {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return { ok: false, error: 'Pick a valid date and time.' };
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [hh, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) {
    return { ok: false, error: 'Pick a valid date and time.' };
  }
  const wallMs = Date.UTC(y, mo - 1, d, hh, mi);
  if (new Date(wallMs).getUTCDate() !== d) return { ok: false, error: 'Pick a valid date and time.' };
  // Earlier instant first: AEDT candidate precedes AEST for the same wall time.
  for (const offset of [AEDT_OFFSET_MINUTES, AEST_OFFSET_MINUTES]) {
    const candidate = wallMs - offset * MINUTE_MS;
    if (sydneyOffsetMinutes(candidate) === offset) {
      return { ok: true, iso: new Date(candidate).toISOString() };
    }
  }
  return {
    ok: false,
    error: "That time doesn't exist in Sydney — clocks go forward an hour that night. Pick another time.",
  };
}

/** True if the instant is at or before `now`. Unparseable values count as past. */
export function isPastInstant(input: string, now: number = Date.now()): boolean {
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return true;
  return ms <= now;
}
