/**
 * Pure helpers for group runs (events with sport "running"): the time
 * windows behind the When chips, client-side distance / pace filters and
 * run-card date copy.
 */

import type { EventSummary } from '@protin/shared-types';

// ─── When ────────────────────────────────────────────────────────────────────

export type WhenFilter = 'today' | 'week' | 'all';

export const WHEN_FILTERS: readonly { id: WhenFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

/**
 * `from`/`to` (ISO) for GET /events. Upcoming only: `from` is now.
 * today → until local midnight; week → the next 7 days; all → open-ended.
 */
export function timeWindow(when: WhenFilter, now: Date = new Date()): { from: string; to?: string } {
  const from = now.toISOString();
  if (when === 'today') return { from, to: endOfLocalDay(now).toISOString() };
  if (when === 'week') return { from, to: new Date(now.getTime() + 7 * DAY_MS).toISOString() };
  return { from };
}

// ─── Distance ────────────────────────────────────────────────────────────────

export type DistanceFilter = 'any' | 'short' | 'mid' | 'long';

export const DISTANCE_FILTERS: readonly { id: DistanceFilter; label: string }[] = [
  { id: 'any', label: 'Any distance' },
  { id: 'short', label: 'Under 5 km' },
  { id: 'mid', label: '5–10 km' },
  { id: 'long', label: 'Over 10 km' },
];

/** Runs without a planned distance only match "Any distance". */
export function matchesDistance(run: EventSummary, filter: DistanceFilter): boolean {
  if (filter === 'any') return true;
  const km = run.distanceKm;
  if (km === null || km === undefined) return false;
  if (filter === 'short') return km < 5;
  if (filter === 'mid') return km >= 5 && km <= 10;
  return km > 10;
}

// ─── Pace ────────────────────────────────────────────────────────────────────

export type PaceFilter = 'any' | 'relaxed' | 'steady' | 'fast';

/** Bands in sec/km. min = fastest, max = slowest. */
export const PACE_FILTERS: readonly {
  id: PaceFilter;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { id: 'any', label: 'Any pace' },
  { id: 'relaxed', label: '6:00+ /km', min: 360 },
  { id: 'steady', label: '5:00–6:00', min: 300, max: 360 },
  { id: 'fast', label: 'Under 5:00', max: 300 },
];

/** A run matches when its pace band overlaps the filter band. */
export function matchesPace(run: EventSummary, filter: PaceFilter): boolean {
  if (filter === 'any') return true;
  const def = PACE_FILTERS.find((f) => f.id === filter);
  if (!def) return true;
  const runMin = run.paceMinSecPerKm ?? run.paceMaxSecPerKm;
  const runMax = run.paceMaxSecPerKm ?? run.paceMinSecPerKm;
  if (runMin === null || runMin === undefined || runMax === null || runMax === undefined) {
    return false;
  }
  const lo = def.min ?? -Infinity;
  const hi = def.max ?? Infinity;
  return runMin <= hi && runMax >= lo;
}

export function filterRuns(
  runs: readonly EventSummary[],
  { distance, pace }: { distance: DistanceFilter; pace: PaceFilter }
): EventSummary[] {
  return runs.filter((r) => matchesDistance(r, distance) && matchesPace(r, pace));
}

/** Runs that can be pinned on a map. */
export function hasMeetingPoint(
  run: EventSummary
): run is EventSummary & { meetingLat: number; meetingLng: number } {
  return (
    typeof run.meetingLat === 'number' &&
    typeof run.meetingLng === 'number' &&
    Number.isFinite(run.meetingLat) &&
    Number.isFinite(run.meetingLng)
  );
}

/** Open or full (still happening) — not cancelled / completed. */
export function isActiveRun(run: EventSummary): boolean {
  return run.status === 'open' || run.status === 'full';
}

// ─── Copy ────────────────────────────────────────────────────────────────────

export function spotsLeftText(run: Pick<EventSummary, 'spotsLeft' | 'status'>): string {
  if (run.status === 'full' || run.spotsLeft <= 0) return 'Full';
  return run.spotsLeft === 1 ? '1 spot left' : `${run.spotsLeft} spots left`;
}
