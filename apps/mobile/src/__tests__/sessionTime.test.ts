/**
 * sessionTime helpers — pure-function tests.
 *
 * Focus: validation rules, default-value math, and backend-error mapping.
 * UI-level interaction tests live in BookingComposerScreen.test.tsx.
 */

import {
  buildMonthGrid,
  combineToLocalDate,
  computeValidationError,
  dateOptions,
  daysInMonth,
  defaultDate,
  defaultStartTime,
  defaultSydneyDate,
  firstWeekdayOfMonth,
  isPastDate,
  joinTime,
  mapBackendError,
  sydneyProposalTimes,
  monthLabel,
  plusOneHour,
  shiftMonth,
  snapMinuteTo15,
  splitTime,
  timeOptions,
  toDateString,
  TIME_INCREMENT_MINUTES,
} from '../lib/sessionTime';

describe('toDateString', () => {
  it('formats local-time year/month/day with zero padding', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('combineToLocalDate', () => {
  it('parses date + time into a local Date', () => {
    const d = combineToLocalDate('2026-06-01', '09:30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });
});

describe('plusOneHour', () => {
  it('adds 60 minutes for typical times', () => {
    expect(plusOneHour('09:00')).toBe('10:00');
    expect(plusOneHour('22:30')).toBe('23:30');
  });
  it('clamps to 23:45 to keep the session same-day', () => {
    expect(plusOneHour('23:00')).toBe('23:45');
    expect(plusOneHour('23:30')).toBe('23:45');
  });
});

describe('defaultDate', () => {
  it('returns tomorrow in local time', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0); // 2026-06-01 14:00 local
    expect(defaultDate(now)).toBe('2026-06-02');
  });
  it('rolls month boundary correctly', () => {
    const now = new Date(2026, 0, 31, 14, 0, 0); // 2026-01-31
    expect(defaultDate(now)).toBe('2026-02-01');
  });
});

describe('dateOptions', () => {
  it('returns today + N days inclusive', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    const opts = dateOptions(now, 3);
    expect(opts).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  });
});

describe('timeOptions', () => {
  it('emits 24h * 4 slots at 15-minute increments by default', () => {
    const opts = timeOptions();
    expect(opts.length).toBe((24 * 60) / TIME_INCREMENT_MINUTES);
    expect(opts[0]).toBe('00:00');
    expect(opts[opts.length - 1]).toBe('23:45');
  });
  it('respects a custom increment', () => {
    expect(timeOptions(60).length).toBe(24);
    expect(timeOptions(30).length).toBe(48);
  });
});

describe('computeValidationError', () => {
  // Use a far-future date so "today / past-time" rules don't get triggered.
  const futureDate = '2099-06-01';

  it('returns null for a valid 1-hour session', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '10:00',
      })
    ).toBeNull();
  });

  it('returns the end-after-start message when end <= start', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '08:00',
      })
    ).toBe('End time must be later than start time.');
  });

  it('rejects the same start/end pair (zero-length session)', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:00',
      })
    ).toBe('End time must be later than start time.');
  });

  it('rejects sessions shorter than 30 minutes', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:15',
      })
    ).toBe('Sessions must be at least 30 minutes long.');
  });

  it('accepts a 30-minute session at the boundary', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '09:30',
      })
    ).toBeNull();
  });

  it('rejects sessions longer than 4 hours', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '13:30',
      })
    ).toBe('Sessions can be up to 4 hours long.');
  });

  it('accepts a 4-hour session at the boundary', () => {
    expect(
      computeValidationError({
        date: futureDate,
        startTime: '09:00',
        endTime: '13:00',
      })
    ).toBeNull();
  });

  it('rejects a today + past-time start with a friendly message', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0); // 2026-06-01 14:00 local
    expect(
      computeValidationError({
        date: '2026-06-01',
        startTime: '09:00',
        endTime: '10:00',
        now,
      })
    ).toBe('Choose a future start time.');
  });

  it('accepts a today + future-time start', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    expect(
      computeValidationError({
        date: '2026-06-01',
        startTime: '15:00',
        endTime: '16:00',
        now,
      })
    ).toBeNull();
  });

  it('does not flag a tomorrow date as past', () => {
    const now = new Date(2026, 5, 1, 14, 0, 0);
    expect(
      computeValidationError({
        date: '2026-06-02',
        startTime: '06:00',
        endTime: '07:00',
        now,
      })
    ).toBeNull();
  });
});

describe('mapBackendError', () => {
  it('translates the canonical "starts_at past" error', () => {
    expect(mapBackendError('starts_at cannot be more than 1 hour in the past'))
      .toBe('Choose a future start time.');
  });

  it('translates "ends_at must be after starts_at"', () => {
    expect(mapBackendError('ends_at must be after starts_at'))
      .toBe('End time must be later than start time.');
  });

  it('translates an overlap error', () => {
    expect(mapBackendError('Booking overlap with existing session'))
      .toBe('You already have a session at this time.');
  });

  it('translates a venue-not-found error', () => {
    expect(mapBackendError('Venue not found'))
      .toBe("That court isn't available. Pick another or type a location.");
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(mapBackendError('Internal server error 500'))
      .toBe("Couldn't propose this session. Please try again.");
  });

  it('returns the generic message for empty / null input', () => {
    expect(mapBackendError('')).toBe("Couldn't propose this session. Please try again.");
    expect(mapBackendError(null)).toBe("Couldn't propose this session. Please try again.");
    expect(mapBackendError(undefined)).toBe("Couldn't propose this session. Please try again.");
  });
});

describe('default helpers compose into a valid session', () => {
  it('default date + start + end is a 1-hour future session', () => {
    const date = defaultDate();
    const start = defaultStartTime();
    const end = plusOneHour(start);
    expect(computeValidationError({ date, startTime: start, endTime: end })).toBeNull();
  });
});

// ─── Time wheel helpers ──────────────────────────────────────────────────────

describe('splitTime / joinTime', () => {
  it('round-trips a simple time', () => {
    expect(splitTime('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(joinTime(9, 30)).toBe('09:30');
  });
  it('zero-pads single-digit hours and minutes', () => {
    expect(joinTime(0, 5)).toBe('00:05');
    expect(joinTime(23, 45)).toBe('23:45');
  });
});

describe('snapMinuteTo15', () => {
  it('keeps already-aligned minutes unchanged', () => {
    expect(snapMinuteTo15(0)).toBe(0);
    expect(snapMinuteTo15(15)).toBe(15);
    expect(snapMinuteTo15(30)).toBe(30);
    expect(snapMinuteTo15(45)).toBe(45);
  });
  it('snaps to the nearest 15-minute slot', () => {
    expect(snapMinuteTo15(7)).toBe(0); // closer to 0 than 15
    expect(snapMinuteTo15(8)).toBe(15); // closer to 15 than 0
    expect(snapMinuteTo15(22)).toBe(15);
    expect(snapMinuteTo15(23)).toBe(30);
    expect(snapMinuteTo15(40)).toBe(45);
  });
});

// ─── Calendar helpers ────────────────────────────────────────────────────────

describe('isPastDate', () => {
  const today = new Date(2026, 5, 15, 14, 30, 0); // 2026-06-15 local
  it('returns true for yesterday', () => {
    expect(isPastDate('2026-06-14', today)).toBe(true);
  });
  it('returns false for today', () => {
    expect(isPastDate('2026-06-15', today)).toBe(false);
  });
  it('returns false for tomorrow', () => {
    expect(isPastDate('2026-06-16', today)).toBe(false);
  });
  it('handles month boundaries by string comparison', () => {
    const lastDayOfMay = new Date(2026, 4, 31, 14, 0, 0);
    expect(isPastDate('2026-04-30', lastDayOfMay)).toBe(true);
    expect(isPastDate('2026-06-01', lastDayOfMay)).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('handles 30/31-day months and February', () => {
    expect(daysInMonth(2026, 0)).toBe(31);  // Jan
    expect(daysInMonth(2026, 1)).toBe(28);  // Feb 2026 (non-leap)
    expect(daysInMonth(2024, 1)).toBe(29);  // Feb 2024 (leap)
    expect(daysInMonth(2026, 3)).toBe(30);  // Apr
  });
});

describe('firstWeekdayOfMonth', () => {
  it('returns 0..6 (Sun=0)', () => {
    // 2026-06-01 is a Monday → 1
    expect(firstWeekdayOfMonth(2026, 5)).toBe(1);
  });
});

describe('monthLabel', () => {
  it('returns a friendly label including the year', () => {
    const label = monthLabel(2026, 5);
    // Locale-dependent but always contains the year
    expect(label).toMatch(/2026/);
  });
});

describe('shiftMonth', () => {
  it('steps forward correctly across year boundary', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  it('steps backward correctly across year boundary', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
  it('handles multi-month steps', () => {
    expect(shiftMonth(2026, 5, 6)).toEqual({ year: 2026, month: 11 });
    expect(shiftMonth(2026, 5, 12)).toEqual({ year: 2027, month: 5 });
  });
});

// ─── Calendar grid (Sunday-first column placement) ──────────────────────────
//
// Pin the column positions of specific days so a future regression in the
// offset/leading-blanks math (the iPhone Propose-a-session calendar drift
// where May 1 2026 was rendering off Friday) trips a deterministic test
// rather than only showing up on a real device.
//
// Layout contract: WEEKDAY_LABELS = ['S','M','T','W','T','F','S']
// Column index: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.

describe('buildMonthGrid (Sunday-first column placement)', () => {
  it('places May 1 2026 under the Friday column (index 5)', () => {
    // May 1 2026 is a Friday. With 5 leading blanks, day 1 lands at
    // index 5; day 2 at index 6 (Saturday); day 3 at index 7 (the
    // Sunday cell of the next row).
    const grid = buildMonthGrid(2026, 4); // month is 0-indexed
    expect(grid[5]).toMatchObject({ day: 1, date: '2026-05-01' });
    expect(grid[6]).toMatchObject({ day: 2, date: '2026-05-02' });
    expect(grid[7]).toMatchObject({ day: 3, date: '2026-05-03' });
    expect(grid[11]).toMatchObject({ day: 7, date: '2026-05-07' });

    // Leading 5 cells must be blanks, NOT day cells. A column shift in
    // the offset math typically manifests as a day landing in the
    // leading-blank zone — assert explicitly.
    for (let i = 0; i < 5; i++) {
      expect(grid[i].date).toBeUndefined();
      expect(grid[i].day).toBeUndefined();
    }

    // Bottom row pads to a full 7 cells; total length is a multiple of 7.
    expect(grid.length % 7).toBe(0);
  });

  it('places June 1 2026 under the Monday column (index 1)', () => {
    // June 1 2026 is a Monday — single leading blank (Sunday).
    const grid = buildMonthGrid(2026, 5);
    expect(grid[0].date).toBeUndefined();
    expect(grid[1]).toMatchObject({ day: 1, date: '2026-06-01' });
    expect(grid[7]).toMatchObject({ day: 7, date: '2026-06-07' });
  });

  it('places February 1 2026 under the Sunday column (index 0)', () => {
    // Feb 1 2026 is a Sunday — zero leading blanks.
    const grid = buildMonthGrid(2026, 1);
    expect(grid[0]).toMatchObject({ day: 1, date: '2026-02-01' });
    expect(grid[6]).toMatchObject({ day: 7, date: '2026-02-07' });
  });

  it('emits exactly daysInMonth day-cells in order', () => {
    const grid = buildMonthGrid(2026, 4); // May 2026, 31 days
    const dayCells = grid.filter((c) => c.day !== undefined);
    expect(dayCells.map((c) => c.day)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1)
    );
  });
});

describe('Sydney proposal times (review F5)', () => {
  // A frozen "now" well before every date used below.
  const NOW = Date.parse('2026-09-01T00:00:00Z');
  const times = (date: string, startTime: string, endTime: string, now = NOW) =>
    sydneyProposalTimes({ date, startTime, endTime, now });

  it('converts AEST and AEDT wall times to UTC instants', () => {
    expect(times('2026-09-15', '09:00', '10:00')).toEqual({
      ok: true,
      startsAt: '2026-09-14T23:00:00.000Z',
      endsAt: '2026-09-15T00:00:00.000Z',
    });
    expect(times('2026-11-15', '18:30', '20:00')).toEqual({
      ok: true,
      startsAt: '2026-11-15T07:30:00.000Z',
      endsAt: '2026-11-15T09:00:00.000Z',
    });
  });

  it('defaults to tomorrow on the Sydney calendar, not the UTC one', () => {
    // 10:30 pm UTC on 14 Nov is already 15 Nov (9:30 am AEDT) in Sydney.
    expect(defaultSydneyDate(Date.parse('2026-11-14T22:30:00Z'))).toBe('2026-11-16');
  });

  it('rejects a start that does not exist and keeps the overlap policy', () => {
    const gap = times('2026-10-04', '02:30', '03:30');
    expect(gap.ok).toBe(false);
    expect(gap).toMatchObject({ error: expect.stringContaining("doesn't exist in Sydney") });
    expect(times('2027-04-04', '02:30', '03:15')).toEqual({
      ok: true,
      startsAt: '2027-04-03T15:30:00.000Z',
      endsAt: '2027-04-03T17:15:00.000Z',
    });
  });

  it('checks order, length and the past on instants', () => {
    expect(times('2026-09-15', '10:00', '09:00')).toEqual({ ok: false, error: 'End time must be later than start time.' });
    expect(times('2026-09-15', '10:00', '10:15')).toEqual({
      ok: false,
      error: 'Sessions must be at least 30 minutes long.',
    });
    expect(times('2026-09-15', '08:00', '12:30')).toEqual({ ok: false, error: 'Sessions can be up to 4 hours long.' });
    // 01:30 → 03:30 on the DST start night is one real hour, so it is valid;
    // 01:30 → 01:45 that night is still too short.
    expect(times('2026-10-04', '01:30', '03:30').ok).toBe(true);
    expect(times('2026-10-04', '01:30', '01:45').ok).toBe(false);
    // Sydney 9:00 am on 15 Sep is 23:00 UTC on 14 Sep; a "now" just after it is past.
    expect(times('2026-09-15', '09:00', '10:00', Date.parse('2026-09-14T23:01:00Z'))).toEqual({
      ok: false,
      error: 'Choose a future start time.',
    });
    expect(times('2026-09-15', '09:00', '10:00', Date.parse('2026-09-14T22:59:00Z')).ok).toBe(true);
  });
});
