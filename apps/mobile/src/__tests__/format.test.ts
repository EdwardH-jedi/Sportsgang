import {
  formatClock,
  formatClockParts,
  formatDate,
  formatDayLabel,
  formatDayMonth,
  formatMonthShort,
  formatTimeRange,
  formatWhen,
  formatWhenRange,
} from '../lib/format';
import { formatEventWhen } from '../lib/events';
import { formatPreviewTimestamp } from '../lib/messages';
import { formatDateLabel, formatTimeLabel } from '../lib/sessionTime';

// Local-time constructors keep these independent of the CI timezone.
const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m); // Sept 2026

describe('formatClock', () => {
  it('uses h:mm with an upper-case meridiem', () => {
    expect(formatClock(at(26, 6))).toBe('6:00 AM');
    expect(formatClock(at(26, 16, 5))).toBe('4:05 PM');
    expect(formatClock(at(26, 0, 30))).toBe('12:30 AM');
    expect(formatClock(at(26, 12))).toBe('12:00 PM');
  });

  it('accepts ISO strings and rejects invalid input', () => {
    expect(formatClock(at(26, 18, 15).toISOString())).toBe('6:15 PM');
    expect(formatClock('not-a-date')).toBe('');
  });

  it('exposes the parts for big-number layouts', () => {
    expect(formatClockParts(at(26, 9))).toEqual({ time: '9:00', meridiem: 'AM' });
    expect(formatClockParts('nope')).toBeNull();
  });
});

describe('formatTimeRange', () => {
  it('collapses a shared meridiem', () => {
    expect(formatTimeRange(at(26, 16), at(26, 17, 30))).toBe('4:00–5:30 PM');
    expect(formatTimeRange(at(26, 6), at(26, 7))).toBe('6:00–7:00 AM');
  });

  it('keeps both meridiems when they differ', () => {
    expect(formatTimeRange(at(26, 11, 30), at(26, 12, 30))).toBe('11:30 AM–12:30 PM');
  });

  it('falls back to the start time when the end is invalid', () => {
    expect(formatTimeRange(at(26, 6), 'bad')).toBe('6:00 AM');
  });
});

describe('day labels', () => {
  const now = at(24, 7);

  it('says Today / Tomorrow, otherwise weekday day month', () => {
    expect(formatDayLabel(at(24, 18), now)).toBe('Today');
    expect(formatDayLabel(at(25, 6), now)).toBe('Tomorrow');
    expect(formatDayLabel(at(26, 6), now)).toBe('Sat 26 Sep');
  });

  it('formats absolute dates', () => {
    expect(formatDate(at(26, 6))).toBe('Sat 26 Sep');
    expect(formatDayMonth(at(26, 6))).toBe('26 Sep');
    expect(formatMonthShort(at(26, 6))).toBe('Sep');
  });

  it('joins day and time with a middle dot', () => {
    expect(formatWhen(at(25, 6), { now })).toBe('Tomorrow · 6:00 AM');
    expect(formatWhen(at(25, 6), { now, relative: false })).toBe('Fri 25 Sep · 6:00 AM');
    expect(formatWhenRange(at(26, 16), at(26, 17, 30))).toBe('Sat 26 Sep · 4:00–5:30 PM');
    expect(formatWhenRange(at(24, 16), at(24, 17), { now, relative: true })).toBe('Today · 4:00–5:00 PM');
  });
});

describe('screens share the formatter', () => {
  it('events, sessions and chat previews use the same clock', () => {
    expect(formatEventWhen(at(26, 6).toISOString())).toBe('Sat 26 Sep · 6:00 AM');
    expect(formatTimeLabel('18:00')).toBe('6:00 PM');
    expect(formatDateLabel('2026-09-26')).toBe('Sat 26 Sep 2026');
    expect(formatPreviewTimestamp(at(24, 9, 30).toISOString(), at(24, 14))).toBe('9:30 AM');
    expect(formatPreviewTimestamp(at(23, 9, 30).toISOString(), at(24, 14))).toBe('23 Sep');
  });
});
