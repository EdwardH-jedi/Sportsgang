/**
 * sydneyTime — rule-based Australia/Sydney conversion.
 *
 * Verified against Node's ICU timezone data (Intl with timeZone
 * 'Australia/Sydney') for every hour of 2025–2028, plus explicit DST
 * boundary cases and device-timezone independence.
 */

import {
  addDaysToDateString,
  formatSydneyDate,
  formatSydneyDateTime,
  formatSydneyTime,
  sydneyDateString,
  sydneyOffsetMinutes,
  sydneyWallTimeToUtc,
  toSydneyParts,
} from '../lib/sydneyTime';

const icu = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

function icuParts(ms: number) {
  const parts = Object.fromEntries(icu.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

describe('toSydneyParts', () => {
  it('matches ICU for every hour of 2025–2028', () => {
    const start = Date.UTC(2025, 0, 1);
    const end = Date.UTC(2029, 0, 1);
    let mismatches = 0;
    let checked = 0;
    for (let ms = start; ms < end; ms += 3_600_000) {
      const mine = toSydneyParts(ms);
      const theirs = icuParts(ms);
      checked += 1;
      if (
        mine.year !== theirs.year ||
        mine.month !== theirs.month ||
        mine.day !== theirs.day ||
        mine.hour !== theirs.hour ||
        mine.minute !== theirs.minute
      ) {
        mismatches += 1;
      }
    }
    expect(checked).toBeGreaterThan(35_000);
    expect(mismatches).toBe(0);
  });

  it('switches to AEDT at 2026-10-04 02:00 AEST (16:00 UTC the day before)', () => {
    const before = Date.UTC(2026, 9, 3, 15, 59);
    const after = Date.UTC(2026, 9, 3, 16, 0);
    expect(sydneyOffsetMinutes(before)).toBe(600);
    expect(sydneyOffsetMinutes(after)).toBe(660);
    expect(formatSydneyTime(before)).toBe('1:59 am');
    expect(formatSydneyTime(after)).toBe('3:00 am');
  });

  it('switches back to AEST at 2027-04-04 03:00 AEDT', () => {
    expect(sydneyOffsetMinutes(Date.UTC(2027, 3, 3, 15, 59))).toBe(660);
    expect(sydneyOffsetMinutes(Date.UTC(2027, 3, 3, 16, 0))).toBe(600);
  });
});

describe('formatting', () => {
  it('renders the Sydney calendar day even when UTC is still the previous day', () => {
    // 2026-10-03T20:30Z = Sun 4 Oct 07:30 AEDT.
    expect(formatSydneyDateTime('2026-10-03T20:30:00Z')).toBe('Sun 4 Oct · 7:30 am');
    expect(sydneyDateString('2026-10-03T20:30:00Z')).toBe('2026-10-04');
  });

  it('formats noon and midnight in 12-hour time', () => {
    expect(formatSydneyTime('2026-07-01T02:00:00Z')).toBe('12:00 pm');
    expect(formatSydneyTime('2026-07-01T14:05:00Z')).toBe('12:05 am');
    expect(formatSydneyDate('2026-07-01T14:05:00Z')).toBe('Thu 2 Jul');
  });

  it('crosses New Year in Sydney before UTC does', () => {
    expect(sydneyDateString('2026-12-31T13:30:00Z')).toBe('2027-01-01');
  });
});

describe('sydneyWallTimeToUtc', () => {
  it('converts standard and daylight wall times', () => {
    expect(sydneyWallTimeToUtc('2026-07-01', '06:30')).toEqual({ ok: true, iso: '2026-06-30T20:30:00.000Z' });
    expect(sydneyWallTimeToUtc('2026-12-01', '06:30')).toEqual({ ok: true, iso: '2026-11-30T19:30:00.000Z' });
  });

  it('rejects the non-existent hour when clocks go forward', () => {
    const result = sydneyWallTimeToUtc('2026-10-04', '02:30');
    expect(result.ok).toBe(false);
    expect(sydneyWallTimeToUtc('2026-10-04', '01:45')).toEqual({ ok: true, iso: '2026-10-03T15:45:00.000Z' });
    expect(sydneyWallTimeToUtc('2026-10-04', '03:00')).toEqual({ ok: true, iso: '2026-10-03T16:00:00.000Z' });
  });

  it('resolves the repeated hour when clocks go back to the earlier (AEDT) instant', () => {
    expect(sydneyWallTimeToUtc('2027-04-04', '02:30')).toEqual({ ok: true, iso: '2027-04-03T15:30:00.000Z' });
  });

  it('round-trips through formatting', () => {
    const result = sydneyWallTimeToUtc('2026-10-10', '07:15');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(formatSydneyDateTime(result.iso)).toBe('Sat 10 Oct · 7:15 am');
      expect(sydneyDateString(result.iso)).toBe('2026-10-10');
    }
  });

  it('rejects malformed input and impossible dates', () => {
    expect(sydneyWallTimeToUtc('2026-02-30', '07:00').ok).toBe(false);
    expect(sydneyWallTimeToUtc('2026-10-10', '7:00').ok).toBe(false);
    expect(sydneyWallTimeToUtc('10/10/2026', '07:00').ok).toBe(false);
  });
});

describe('device timezone independence', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each(['Asia/Seoul', 'America/Los_Angeles', 'UTC', 'Australia/Perth'])(
    'gives the same Sydney answers on a device set to %s',
    (tz) => {
      process.env.TZ = tz;
      expect(formatSydneyDateTime('2026-10-03T20:30:00Z')).toBe('Sun 4 Oct · 7:30 am');
      expect(sydneyWallTimeToUtc('2026-10-10', '07:15')).toEqual({ ok: true, iso: '2026-10-09T20:15:00.000Z' });
      expect(sydneyDateString(Date.UTC(2026, 9, 3, 14, 0))).toBe('2026-10-04');
    }
  );
});

describe('addDaysToDateString', () => {
  it('handles month and year rollover', () => {
    expect(addDaysToDateString('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2026-03-01', -1)).toBe('2026-02-28');
  });
});
