/**
 * Review F2 — My Plans shows every commitment, however long the history.
 *
 * The real usePlans hook and MyPlansScreen run over an in-memory server that
 * implements the API's segment contract (GET /bookings and
 * GET /events?mine=true with segment + as_of, ordered by (starts_at, id),
 * Past newest first). Assertions compare what the screen shows with what
 * the server holds.
 */

import React from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { MyPlansScreen } from '../screens/plans/MyPlansScreen';
import { useAuthStore } from '../stores/auth';

// ─── In-memory server ────────────────────────────────────────────────────────

interface Row {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** booking: proposer; event: host */
  owner: string;
  /** booking: partner; event: joined members */
  others: string[];
}

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 0, 0); // frozen: 10 Nov 2026, 11:00 am AEDT
const bookings = new Map<string, Row>();
const events = new Map<string, Row>();
const calls: string[] = [];
const failures: { match: RegExp; message: string; times: number }[] = [];
const holds: { match: RegExp; release: Promise<void> }[] = [];
let viewer = 'me';

function at(days: number, hours = 0): string {
  return new Date(NOW + days * DAY + hours * 3_600_000).toISOString();
}

function addBooking(id: string, days: number, status: string, proposer = 'me'): void {
  bookings.set(id, {
    id,
    startsAt: at(days),
    endsAt: at(days, 1),
    status,
    owner: proposer,
    others: [proposer === 'me' ? 'alex' : 'me'],
  });
}

function addEvent(id: string, days: number, status = 'open', host = 'me', members: string[] = []): void {
  events.set(id, { id, startsAt: at(days), endsAt: at(days, 1), status, owner: host, others: members });
}

const ascending = (a: Row, b: Row) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function bookingSegment(b: Row, asOf: number): string {
  if (b.status === 'proposed' && Date.parse(b.startsAt) > asOf) return 'pending';
  if ((b.status === 'confirmed' || b.status === 'accepted') && Date.parse(b.endsAt) > asOf) return 'upcoming';
  return 'past';
}

function eventSegment(e: Row, asOf: number): string {
  return e.status !== 'cancelled' && e.status !== 'completed' && Date.parse(e.startsAt) > asOf ? 'upcoming' : 'past';
}

function bookingJson(b: Row) {
  return {
    id: b.id,
    matchId: 'm1',
    proposerId: b.owner,
    partnerId: b.others[0],
    sport: 'running',
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    location: 'Centennial Park',
    status: b.status,
    createdAt: at(-300),
    updatedAt: at(-300),
    // The other participant, as the API's partner card does.
    partner: { displayName: (b.owner === viewer ? b.others[0] : b.owner).replace(/^./, (c) => c.toUpperCase()) },
    venue: null,
  };
}

function eventJson(e: Row) {
  return {
    id: e.id,
    hostUserId: e.owner,
    host: { id: e.owner, displayName: e.owner },
    title: `Run ${e.id}`,
    sport: 'running',
    mode: 'casual',
    startsAt: e.startsAt,
    locationText: 'Centennial Park',
    capacity: 8,
    participantCount: 1 + e.others.length,
    spotsLeft: 7 - e.others.length,
    visibility: 'public',
    status: e.status,
    hasJoined: e.owner === viewer || e.others.includes(viewer),
    description: null,
    runDetails: null,
    golfDetails: null,
    createdAt: at(-300),
    updatedAt: at(-300),
  };
}

function page<T>(rows: Row[], q: URLSearchParams, toJson: (r: Row) => T) {
  const limit = Number(q.get('limit') ?? 20);
  const offset = Number(q.get('offset') ?? 0);
  return { items: rows.slice(offset, offset + limit).map(toJson), total: rows.length, limit, offset };
}

async function mockServe(path: string) {
  calls.push(path);
  const hold = holds.find((h) => h.match.test(path));
  if (hold) {
    holds.splice(holds.indexOf(hold), 1);
    await hold.release;
  }
  const failure = failures.find((f) => f.match.test(path) && f.times > 0);
  if (failure) {
    failure.times -= 1;
    throw new Error(failure.message);
  }
  const url = new URL(path, 'http://api.test');
  const q = url.searchParams;
  const segment = q.get('segment');
  const asOf = Date.parse(q.get('as_of') ?? '');
  if (!segment || Number.isNaN(asOf)) throw new Error(`segment and as_of expected: ${path}`);
  const byOrder = (rows: Row[]) => (segment === 'past' ? rows.sort(ascending).reverse() : rows.sort(ascending));
  if (url.pathname === '/bookings') {
    const mine = [...bookings.values()].filter((b) => b.owner === viewer || b.others.includes(viewer));
    return page(byOrder(mine.filter((b) => bookingSegment(b, asOf) === segment)), q, bookingJson);
  }
  if (url.pathname === '/events' && q.get('mine') === 'true') {
    const mine = [...events.values()].filter((e) => e.owner === viewer || e.others.includes(viewer));
    return page(byOrder(mine.filter((e) => eventSegment(e, asOf) === segment)), q, eventJson);
  }
  throw new Error(`unexpected ${path}`);
}

jest.mock('../lib/api', () => ({
  api: { get: (path: string) => mockServe(path), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockFocusEffects = new Set<() => void>();
jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.add(effect);
        effect();
        return () => mockFocusEffects.delete(effect);
      }, [effect]),
  };
});

async function refocus() {
  await act(async () => {
    for (const effect of [...mockFocusEffects]) effect();
  });
}

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

function renderPlans() {
  return render(<MyPlansScreen navigation={navigation as never} route={{ key: 'p', name: 'Plans' } as never} />);
}

/** The rows the screen's list shows (read from its data: FlatList virtualizes rendering). */
function shownKeys(): string[] {
  const lists = screen.UNSAFE_queryAllByType(FlatList);
  if (lists.length === 0) return [];
  return (lists[0].props.data as { key: string }[]).map((item) => item.key);
}

async function showAll(segment: 'upcoming' | 'pending' | 'past') {
  for (let i = 0; i < 20; i += 1) {
    const more = screen.queryByTestId(`plans-more-${segment}`);
    if (!more) return;
    fireEvent.press(more);
    await waitFor(() => expect(screen.queryByLabelText('Loading more plans')).toBeNull());
  }
  throw new Error('kept offering more');
}

function expected(segment: 'upcoming' | 'pending' | 'past'): string[] {
  const rows = [
    ...[...bookings.values()]
      .filter((b) => (b.owner === viewer || b.others.includes(viewer)) && bookingSegment(b, NOW) === segment)
      .map((r) => ({ r, key: `booking:${r.id}` })),
    ...[...events.values()]
      .filter((e) => (e.owner === viewer || e.others.includes(viewer)) && eventSegment(e, NOW) === segment)
      .map((r) => ({ r, key: `event:${r.id}` })),
  ];
  const order = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    Date.parse(a.r.startsAt) - Date.parse(b.r.startsAt) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  rows.sort(order);
  if (segment === 'past') rows.reverse();
  return rows.map((x) => x.key);
}

beforeEach(() => {
  bookings.clear();
  events.clear();
  calls.length = 0;
  failures.length = 0;
  holds.length = 0;
  mockFocusEffects.clear();
  viewer = 'me';
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  useAuthStore.setState({ user: { id: 'me', email: 'me@example.com' } as never, token: 't' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function seedLongHistory() {
  for (let i = 0; i < 55; i += 1) {
    addBooking(`hb${String(i).padStart(2, '0')}`, -200 + i, 'completed');
    addEvent(`he${String(i).padStart(2, '0')}`, -200 + i, 'completed');
  }
  addBooking('confirmed-1', 3, 'confirmed');
  addBooking('proposal-1', 4, 'proposed', 'alex');
  addEvent('future-run', 5);
  addEvent('joined-run', 6, 'full', 'sam', ['me']);
  // Future-dated but already over.
  addEvent('cancelled-future', 7, 'cancelled');
  addBooking('completed-future', 8, 'completed');
}

describe('history never hides future plans', () => {
  it('shows upcoming and pending plans behind 55+ past items in each source', async () => {
    seedLongHistory();
    renderPlans();
    await waitFor(() => expect(shownKeys()).toEqual(['booking:confirmed-1', 'event:future-run', 'event:joined-run']));
    expect(screen.getByLabelText('Pending (1)')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pending (1)'));
    await waitFor(() => expect(shownKeys()).toEqual(['booking:proposal-1']));
    expect(screen.getByText('Requested by Alex')).toBeTruthy();
  });

  it('pages through all of Past, newest first, without duplicates or gaps', async () => {
    seedLongHistory();
    renderPlans();
    await waitFor(() => expect(shownKeys().length).toBeGreaterThan(0));
    fireEvent.press(screen.getByLabelText('Past'));
    await waitFor(() => expect(shownKeys().length).toBeGreaterThan(0));
    const full = expected('past');
    expect(full).toHaveLength(112);
    // Each view is an exact prefix of the full order: nothing out of order or skipped.
    expect(full.slice(0, shownKeys().length)).toEqual(shownKeys());
    expect(full.slice(0, 2)).toEqual(['booking:completed-future', 'event:cancelled-future']);
    await showAll('past');
    expect(shownKeys()).toEqual(full);
    expect(new Set(shownKeys()).size).toBe(112);
  });
});

describe('more than one page in a segment', () => {
  it('Upcoming interleaves both sources and only ever shows a complete prefix', async () => {
    for (let i = 0; i < 25; i += 1) {
      addBooking(`ub${String(i).padStart(2, '0')}`, 1 + i * 2, 'confirmed');
      addEvent(`ue${String(i).padStart(2, '0')}`, 2 + i * 2);
    }
    renderPlans();
    await waitFor(() => expect(shownKeys().length).toBeGreaterThan(0));
    const full = expected('upcoming');
    expect(full).toHaveLength(50);
    expect(shownKeys()).toEqual(full.slice(0, shownKeys().length));
    expect(shownKeys().length).toBeLessThan(50);
    await showAll('upcoming');
    expect(shownKeys()).toEqual(full);
  });

  it('Pending pages too', async () => {
    for (let i = 0; i < 23; i += 1) addBooking(`p${String(i).padStart(2, '0')}`, 1 + i, 'proposed', 'alex');
    renderPlans();
    fireEvent.press(await screen.findByLabelText('Pending (23)'));
    await waitFor(() => expect(shownKeys()).toHaveLength(20));
    await showAll('pending');
    expect(shownKeys()).toEqual(expected('pending'));
  });

  it('keeps equal start times and identical booking/event ids apart, in a fixed order', async () => {
    addBooking('x', 2, 'confirmed');
    addEvent('x', 2);
    addBooking('a', 2, 'confirmed');
    addEvent('b', 2);
    renderPlans();
    await waitFor(() => expect(shownKeys()).toEqual(['booking:a', 'booking:x', 'event:b', 'event:x']));
  });
});

describe('failures', () => {
  it('a failed source keeps the other visible and recovers on retry', async () => {
    seedLongHistory();
    failures.push({ match: /^\/bookings/, message: 'HTTP 500', times: 3 });
    renderPlans();
    expect(await screen.findByText(/Couldn't load your 1:1 sessions/)).toBeTruthy();
    expect(shownKeys()).toEqual(['event:future-run', 'event:joined-run']);
    fireEvent.press(screen.getByLabelText('Retry'));
    await waitFor(() => expect(shownKeys()).toEqual(['booking:confirmed-1', 'event:future-run', 'event:joined-run']));
    expect(screen.queryByText(/Couldn't load your 1:1 sessions/)).toBeNull();
    expect(screen.getByLabelText('Pending (1)')).toBeTruthy();
  });

  it('a failed "show more" keeps what is loaded and retries that page', async () => {
    seedLongHistory();
    renderPlans();
    await waitFor(() => expect(shownKeys().length).toBeGreaterThan(0));
    fireEvent.press(screen.getByLabelText('Past'));
    await waitFor(() => expect(screen.getByTestId('plans-more-past')).toBeTruthy());
    const before = shownKeys();
    failures.push({ match: /segment=past.*offset=20/, message: 'Network request failed', times: 2 });
    fireEvent.press(screen.getByTestId('plans-more-past'));
    expect(await screen.findByText("Couldn't load more plans.")).toBeTruthy();
    expect(shownKeys()).toEqual(before);
    fireEvent.press(screen.getByLabelText('Retry'));
    await waitFor(() => expect(shownKeys().length).toBeGreaterThan(before.length));
    expect(shownKeys()).toEqual(expected('past').slice(0, shownKeys().length));
  });
});

describe('changes and account switches', () => {
  it('a refresh picks up new and changed commitments', async () => {
    addBooking('proposal-1', 4, 'proposed', 'alex');
    addEvent('future-run', 5);
    renderPlans();
    await waitFor(() => expect(shownKeys()).toEqual(['event:future-run']));
    // Meanwhile: the proposal is confirmed, a new run is joined, the old one cancelled.
    bookings.get('proposal-1')!.status = 'confirmed';
    addEvent('new-run', 2, 'open', 'sam', ['me']);
    events.get('future-run')!.status = 'cancelled';
    await refocus();
    await waitFor(() => expect(shownKeys()).toEqual(['event:new-run', 'booking:proposal-1']));
    expect(screen.getByLabelText('Pending')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Past'));
    await waitFor(() => expect(shownKeys()).toEqual(['event:future-run']));
  });

  it('a late answer for the previous account is never shown to the next one', async () => {
    addEvent('mine-before', 3);
    let release!: () => void;
    holds.push({ match: /^\/events.*segment=upcoming/, release: new Promise<void>((r) => (release = r)) });
    renderPlans();
    await waitFor(() => expect(calls.some((c) => c.includes('segment=upcoming'))).toBe(true));
    // Switch account while the first account's upcoming request is in flight.
    viewer = 'other';
    addEvent('theirs', 4, 'open', 'other');
    await act(async () => {
      useAuthStore.setState({ user: { id: 'other', email: 'other@example.com' } as never, token: 't2' });
    });
    await refocus();
    await waitFor(() => expect(shownKeys()).toEqual(['event:theirs']));
    viewer = 'me';
    await act(async () => {
      release();
    });
    viewer = 'other';
    expect(shownKeys()).toEqual(['event:theirs']);
  });

  it('every row lands in the segment the server returned it for', async () => {
    seedLongHistory();
    addBooking('in-progress', 0, 'confirmed'); // started at NOW, ends in an hour
    addBooking('stale-proposal', -1, 'proposed', 'alex');
    renderPlans();
    for (const [label, segment] of [
      ['Upcoming', 'upcoming'],
      ['Pending (1)', 'pending'],
      ['Past', 'past'],
    ] as const) {
      fireEvent.press(screen.getByLabelText(label));
      await waitFor(() => expect(shownKeys().length).toBeGreaterThan(0));
      await showAll(segment);
      expect(shownKeys()).toEqual(expected(segment));
    }
    fireEvent.press(screen.getByLabelText('Past'));
    expect(within(screen.getByTestId('plan-booking:stale-proposal')).getByText('Never confirmed')).toBeTruthy();
  });
});
