/**
 * API timestamps are read as instants, whatever the device zone (review R6,
 * docs/run-golf-v2/CONTRACTS.md §9). CI runs in UTC, where reading an
 * offset-free value as device-local time looks right; these tests pin the
 * device zone to Australia/Sydney (Node applies process.env.TZ at runtime).
 */

import { compareTimeline, formatPreviewTimestamp } from '../lib/messages';
import { parseInstant } from '../lib/instant';

const ORIGINAL_TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = 'Australia/Sydney';
});
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const AT_1530Z = Date.UTC(2026, 9, 2, 15, 30); // 1:30 am Sat 3 Oct in Sydney (AEST)

describe('parseInstant', () => {
  it('honours explicit offsets', () => {
    expect(parseInstant('2026-10-02T15:30:00Z')).toBe(AT_1530Z);
    expect(parseInstant('2026-10-03T01:30:00+10:00')).toBe(AT_1530Z);
    expect(parseInstant('2026-10-03T02:30:00+1100')).toBe(AT_1530Z);
    expect(parseInstant('2026-10-02T15:30:00.335070Z')).toBe(AT_1530Z + 335);
  });

  it('reads an offset-free value from an older API as UTC, never device-local', () => {
    expect(new Date('2026-10-02T15:30:00').getTime()).not.toBe(AT_1530Z); // the old behaviour
    expect(parseInstant('2026-10-02T15:30:00')).toBe(AT_1530Z);
    expect(parseInstant('2026-10-02T15:30:00.335070')).toBe(AT_1530Z + 335);
  });

  it('is NaN for missing or unparseable values', () => {
    for (const v of [null, undefined, '', 'not-a-date']) expect(parseInstant(v)).toBeNaN();
  });
});

describe('chat preview time in a Sydney device', () => {
  const now = new Date(Date.UTC(2026, 9, 2, 17, 0)); // 3:00 am Sat 3 Oct in Sydney

  it('shows the time on the same Sydney day for both spellings', () => {
    const expected = new Date(AT_1530Z).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(formatPreviewTimestamp('2026-10-02T15:30:00Z', now)).toBe(expected);
    expect(formatPreviewTimestamp('2026-10-02T15:30:00', now)).toBe(expected);
  });

  it('crosses the Sydney midnight correctly', () => {
    const lateFriday = '2026-10-02T13:30:00Z'; // 11:30 pm Fri 2 Oct in Sydney
    const expected = new Date(Date.UTC(2026, 9, 2, 13, 30)).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    expect(formatPreviewTimestamp(lateFriday, now)).toBe(expected);
  });
});

describe('compareTimeline', () => {
  const entry = (kind: 'message' | 'proposal', createdAt: string, id: string) => ({ kind, createdAt, id });

  it('orders by instant across offset spellings, not by string', () => {
    const items = [
      entry('message', '2026-10-02T15:30:00Z', 'm2'), // later instant, smaller string
      entry('proposal', '2026-10-03T01:00:00+11:00', 'p1'), // 14:00Z
      entry('message', '2026-10-02T14:30:00', 'm1'), // legacy offset-free, 14:30Z
    ];
    expect([...items].sort(compareTimeline).map((e) => e.id)).toEqual(['p1', 'm1', 'm2']);
  });

  it('breaks equal instants by kind, then id, deterministically', () => {
    const items = [
      entry('proposal', '2026-10-03T02:30:00+11:00', 'p1'),
      entry('message', '2026-10-02T15:30:00Z', 'm9'),
      entry('message', '2026-10-02T15:30:00.000Z', 'm1'),
    ];
    for (const order of [items, [...items].reverse()]) {
      expect([...order].sort(compareTimeline).map((e) => e.id)).toEqual(['m1', 'm9', 'p1']);
    }
  });
});
