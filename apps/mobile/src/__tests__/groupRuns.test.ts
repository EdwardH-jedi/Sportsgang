import type { EventSummary } from '@protin/shared-types';

import {
  filterRuns,
  formatRunDay,
  hasMeetingPoint,
  isActiveRun,
  matchesDistance,
  matchesPace,
  spotsLeftText,
  timeWindow,
} from '../lib/groupRuns';

function run(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'r1',
    hostUserId: 'h1',
    host: { id: 'h1', displayName: 'Sam' },
    title: 'Bay Run',
    sport: 'running',
    mode: 'casual',
    startsAt: '2030-06-01T20:00:00Z',
    locationText: 'Bay Run',
    capacity: 20,
    participantCount: 5,
    spotsLeft: 15,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('timeWindow', () => {
  const now = new Date(2030, 5, 1, 9, 30); // local 1 Jun 2030 09:30

  it('today ends at local midnight', () => {
    const w = timeWindow('today', now);
    expect(w.from).toBe(now.toISOString());
    expect(w.to).toBe(new Date(2030, 5, 2, 0, 0).toISOString());
  });

  it('this week spans the next 7 days', () => {
    const w = timeWindow('week', now);
    expect(new Date(w.to as string).getTime() - now.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it('all is open-ended', () => {
    expect(timeWindow('all', now)).toEqual({ from: now.toISOString() });
  });
});

describe('run filters', () => {
  it('matches distance ranges and excludes runs without a distance', () => {
    expect(matchesDistance(run({ distanceKm: 3 }), 'short')).toBe(true);
    expect(matchesDistance(run({ distanceKm: 5 }), 'short')).toBe(false);
    expect(matchesDistance(run({ distanceKm: 5 }), 'mid')).toBe(true);
    expect(matchesDistance(run({ distanceKm: 10 }), 'mid')).toBe(true);
    expect(matchesDistance(run({ distanceKm: 12 }), 'long')).toBe(true);
    expect(matchesDistance(run({ distanceKm: null }), 'long')).toBe(false);
    expect(matchesDistance(run({ distanceKm: null }), 'any')).toBe(true);
  });

  it('matches pace when the bands overlap', () => {
    const steadyRun = run({ paceMinSecPerKm: 320, paceMaxSecPerKm: 340 });
    expect(matchesPace(steadyRun, 'steady')).toBe(true);
    expect(matchesPace(steadyRun, 'fast')).toBe(false);
    expect(matchesPace(steadyRun, 'relaxed')).toBe(false);
    expect(matchesPace(run({ paceMinSecPerKm: 280, paceMaxSecPerKm: 310 }), 'fast')).toBe(true);
    expect(matchesPace(run({ paceMinSecPerKm: 400 }), 'relaxed')).toBe(true);
    expect(matchesPace(run(), 'steady')).toBe(false);
    expect(matchesPace(run(), 'any')).toBe(true);
  });

  it('combines distance and pace filters', () => {
    const runs = [
      run({ id: 'a', distanceKm: 5, paceMinSecPerKm: 330, paceMaxSecPerKm: 360 }),
      run({ id: 'b', distanceKm: 15, paceMinSecPerKm: 330, paceMaxSecPerKm: 360 }),
      run({ id: 'c', distanceKm: 6, paceMinSecPerKm: 270, paceMaxSecPerKm: 290 }),
    ];
    expect(filterRuns(runs, { distance: 'mid', pace: 'steady' }).map((r) => r.id)).toEqual(['a']);
    expect(filterRuns(runs, { distance: 'any', pace: 'any' })).toHaveLength(3);
  });

  it('detects meeting points and active runs', () => {
    expect(hasMeetingPoint(run({ meetingLat: -33.9, meetingLng: 151.2 }))).toBe(true);
    expect(hasMeetingPoint(run({ meetingLat: null, meetingLng: 151.2 }))).toBe(false);
    expect(isActiveRun(run({ status: 'full' }))).toBe(true);
    expect(isActiveRun(run({ status: 'cancelled' }))).toBe(false);
  });
});

describe('run copy', () => {
  it('labels today and tomorrow', () => {
    const now = new Date(2030, 5, 1, 7, 0);
    expect(formatRunDay(new Date(2030, 5, 1, 18, 0).toISOString(), now)).toBe('Today');
    expect(formatRunDay(new Date(2030, 5, 2, 6, 0).toISOString(), now)).toBe('Tomorrow');
    expect(formatRunDay(new Date(2030, 5, 5, 6, 0).toISOString(), now)).not.toMatch(/Today|Tomorrow/);
  });

  it('describes spots left', () => {
    expect(spotsLeftText({ spotsLeft: 3, status: 'open' })).toBe('3 spots left');
    expect(spotsLeftText({ spotsLeft: 1, status: 'open' })).toBe('1 spot left');
    expect(spotsLeftText({ spotsLeft: 0, status: 'full' })).toBe('Full');
  });
});
