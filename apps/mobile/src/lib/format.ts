/**
 * One place for date / time copy, so every screen reads the same:
 *
 *   formatClock        "6:00 AM"
 *   formatTimeRange    "4:00–5:30 PM" (shared meridiem collapsed),
 *                      "11:30 AM–12:30 PM" otherwise
 *   formatDayLabel     "Today" / "Tomorrow" / "Sat 26 Sep"
 *   formatDate         "Sat 26 Sep" (never relative)
 *   formatDayMonth     "26 Sep"
 *   formatWhen         "Tomorrow · 6:00 AM"
 *   formatWhenRange    "Sat 26 Sep · 4:00–5:30 PM"
 *
 * Deliberately hand-rolled rather than `toLocaleTimeString`: Hermes and
 * the JS engines behind tests / web disagree ("06:00 am", "6:00 am",
 * "06:00"), and the app speaks one English voice. Every helper takes a
 * Date or an ISO string and returns '' for an invalid date.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateInput = Date | string | number;

export interface ClockParts {
  /** "6:00" */
  time: string;
  meridiem: 'AM' | 'PM';
}

function toDate(input: DateInput): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clockParts(d: Date): ClockParts {
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = d.getMinutes();
  return {
    time: `${hour12}:${minutes < 10 ? `0${minutes}` : minutes}`,
    meridiem: h < 12 ? 'AM' : 'PM',
  };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** { time: "6:00", meridiem: "AM" } — for big-number layouts (StatBlock value + unit). */
export function formatClockParts(input: DateInput): ClockParts | null {
  const d = toDate(input);
  return d ? clockParts(d) : null;
}

/** "6:00 AM", "12:30 PM". */
export function formatClock(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const { time, meridiem } = clockParts(d);
  return `${time} ${meridiem}`;
}

/** "4:00–5:30 PM"; "11:30 AM–12:30 PM" when the meridiem changes. */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e) return formatClock(s);
  const a = clockParts(s);
  const b = clockParts(e);
  return a.meridiem === b.meridiem
    ? `${a.time}–${b.time} ${b.meridiem}`
    : `${a.time} ${a.meridiem}–${b.time} ${b.meridiem}`;
}

/** "26 Sep". */
export function formatDayMonth(input: DateInput): string {
  const d = toDate(input);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}

/** "Sep" — date tiles. */
export function formatMonthShort(input: DateInput): string {
  const d = toDate(input);
  return d ? MONTHS[d.getMonth()] : '';
}

/** "Sat 26 Sep". */
export function formatDate(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Today", "Tomorrow", otherwise "Sat 26 Sep". */
export function formatDayLabel(input: DateInput, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '';
  if (sameLocalDay(d, now)) return 'Today';
  if (sameLocalDay(d, new Date(now.getTime() + DAY_MS))) return 'Tomorrow';
  return formatDate(d);
}

/** "Tomorrow · 6:00 AM" (relative day) or "Sat 26 Sep · 6:00 AM". */
export function formatWhen(
  input: DateInput,
  { now = new Date(), relative = true }: { now?: Date; relative?: boolean } = {}
): string {
  const d = toDate(input);
  if (!d) return '';
  const day = relative ? formatDayLabel(d, now) : formatDate(d);
  return `${day} · ${formatClock(d)}`;
}

/** "Sat 26 Sep · 4:00–5:30 PM" (or "Today · …" when `relative`). */
export function formatWhenRange(
  start: DateInput,
  end: DateInput,
  { now = new Date(), relative = false }: { now?: Date; relative?: boolean } = {}
): string {
  const s = toDate(start);
  if (!s) return '';
  const day = relative ? formatDayLabel(s, now) : formatDate(s);
  return `${day} · ${formatTimeRange(s, end)}`;
}
