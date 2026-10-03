/**
 * My Plans — merge of 1:1 bookings and group sessions.
 *
 * Covers: pure segmentation (pending never shown as confirmed, explicit
 * source keys), Sydney rendering across the 2026-10-04 DST change on a
 * device in another timezone, partial and full source failure with retry,
 * empty states and navigation targets.
 */

import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { EventSummary } from '@protin/shared-types';

import { api } from '../lib/api';
import type { Session } from '../lib/sessions';
import { buildPlanItems } from '../hooks/usePlans';
import { MyPlansScreen } from '../screens/plans/MyPlansScreen';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) => ReactActual.useEffect(effect, [effect]),
  };
});

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) => selector({ user: { id: 'me' } }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockGet = api.get as jest.Mock;

// 2026-10-01T00:00Z — before the Sydney DST change on Sun 4 Oct 2026.
const NOW = Date.UTC(2026, 9, 1, 0, 0);

function booking(overrides: Partial<Session> = {}): Session {
  return {
    id: 'b1',
    matchId: 'm1',
    proposerId: 'me',
    partnerId: 'alex',
    sport: 'golf',
    startsAt: '2026-10-03T20:30:00Z', // Sun 4 Oct 7:30 am AEDT
    endsAt: '2026-10-03T21:30:00Z',
    location: 'Moore Park Golf',
    status: 'confirmed',
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    partner: { displayName: 'Alex' },
    venue: null,
    ...overrides,
  };
}

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    hostUserId: 'me',
    host: { id: 'me', displayName: 'Me' },
    title: 'Sunrise 5k',
    sport: 'running',
    mode: 'casual',
    startsAt: '2026-10-03T14:30:00Z', // Sun 4 Oct 12:30 am AEST (still before 2 am)
    locationText: 'Centennial Park',
    capacity: 8,
    participantCount: 3,
    spotsLeft: 5,
    visibility: 'public',
    status: 'open',
    hasJoined: true,
    description: null,
    runDetails: null,
    golfDetails: null,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

function routeApi(bookings: () => Promise<unknown>, events: () => Promise<unknown>) {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/bookings')) return bookings();
    if (url.startsWith('/events')) return events();
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const ok = (items: unknown[]) => () => Promise.resolve({ items, total: items.length, limit: 50, offset: 0 });
const fail = (msg: string) => () => Promise.reject(new Error(msg));

function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  render(<MyPlansScreen navigation={navigation as never} route={{ key: 'p', name: 'Plans' } as never} />);
  return navigation;
}

const originalTz = process.env.TZ;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  process.env.TZ = originalTz;
  jest.restoreAllMocks();
});

describe('buildPlanItems', () => {
  it('segments bookings and events without ever confirming a proposal', () => {
    const items = buildPlanItems(
      [
        booking({ id: 'in', status: 'proposed', proposerId: 'alex' }),
        booking({ id: 'out', status: 'proposed', proposerId: 'me' }),
        booking({ id: 'conf', status: 'confirmed' }),
        booking({ id: 'old', status: 'confirmed', startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-09-01T01:00:00Z' }),
        booking({ id: 'stale', status: 'proposed', startsAt: '2026-09-02T00:00:00Z', endsAt: '2026-09-02T01:00:00Z' }),
        booking({ id: 'can', status: 'cancelled' }),
        booking({ id: 'dec', status: 'declined' }),
      ],
      [
        event({ id: 'host' }),
        event({ id: 'joined', hostUserId: 'sam', status: 'full', startsAt: '2026-10-05T20:00:00Z' }),
        event({ id: 'cxl', status: 'cancelled' }),
        event({ id: 'done', status: 'completed', startsAt: '2026-09-10T00:00:00Z' }),
        event({ id: 'started', hostUserId: 'sam', startsAt: '2026-09-30T00:00:00Z' }),
      ],
      'me',
      NOW
    );

    expect(items.pending.map((i) => [i.key, i.statusLabel])).toEqual([
      ['booking:in', 'Requested by Alex'],
      ['booking:out', 'Waiting for Alex'],
    ]);
    expect(items.upcoming.map((i) => [i.key, i.statusLabel])).toEqual([
      ['event:host', 'Hosting'],
      ['booking:conf', 'Confirmed'],
      ['event:joined', 'Joined'],
    ]);
    const past = Object.fromEntries(items.past.map((i) => [i.key, i.statusLabel]));
    expect(past).toEqual({
      'event:cxl': 'Cancelled',
      'booking:can': 'Cancelled',
      'booking:dec': 'Declined',
      'event:started': 'Joined',
      'event:done': 'Completed',
      'booking:stale': 'Never confirmed',
      'booking:old': 'Confirmed',
    });
    // Past is newest first.
    expect(items.past.map((i) => i.key).slice(-2)).toEqual(['booking:stale', 'booking:old']);
    const all = [...items.upcoming, ...items.pending, ...items.past];
    expect(all.filter((i) => i.source === 'booking' && i.statusLabel === 'Confirmed').map((i) => i.id)).toEqual([
      'conf',
      'old',
    ]);
  });

  it('keeps booking and event identities apart even with the same id', () => {
    const items = buildPlanItems([booking({ id: 'x' })], [event({ id: 'x' })], 'me', NOW);
    expect(items.upcoming.map((i) => i.key).sort()).toEqual(['booking:x', 'event:x']);
  });
});

describe('MyPlansScreen', () => {
  it('renders Sydney times across the DST change on a device in another timezone', async () => {
    process.env.TZ = 'America/Los_Angeles';
    routeApi(ok([booking()]), ok([event()]));
    renderScreen();
    expect(await screen.findByText('Sun 4 Oct · 12:30 am')).toBeTruthy(); // AEST, before 2 am
    expect(screen.getByText('Sun 4 Oct · 7:30 am – 8:30 am')).toBeTruthy(); // AEDT, after the change
    expect(screen.getByText('Golf with Alex')).toBeTruthy();
    expect(screen.getByText('Group run')).toBeTruthy();
    // Each source is read per segment at one fixed as_of (review F2).
    const asOf = encodeURIComponent(new Date(NOW).toISOString());
    for (const segment of ['upcoming', 'pending', 'past']) {
      expect(mockGet).toHaveBeenCalledWith(
        `/bookings?status=proposed,confirmed,completed,cancelled,declined,no_show&segment=${segment}&as_of=${asOf}&limit=20&offset=0`
      );
    }
    for (const segment of ['upcoming', 'past']) {
      expect(mockGet).toHaveBeenCalledWith(`/events?mine=true&segment=${segment}&as_of=${asOf}&limit=20&offset=0`);
    }
    expect(mockGet).toHaveBeenCalledTimes(5);
  });

  it('shows pending proposals only under Pending', async () => {
    routeApi(ok([booking({ id: 'p1', status: 'proposed', proposerId: 'alex' })]), ok([]));
    renderScreen();
    expect(await screen.findByText('Nothing planned yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pending (1)'));
    expect(screen.getByText('Requested by Alex')).toBeTruthy();
    expect(screen.queryByText('Confirmed')).toBeNull();
  });

  it('keeps group sessions visible when bookings fail, and retries', async () => {
    routeApi(fail('HTTP 500'), ok([event()]));
    renderScreen();
    expect(await screen.findByText(/Couldn't load your 1:1 sessions/)).toBeTruthy();
    expect(screen.getByText('Sunrise 5k')).toBeTruthy();

    routeApi(ok([booking()]), ok([event()]));
    fireEvent.press(screen.getByLabelText('Retry'));
    expect(await screen.findByText('Golf with Alex')).toBeTruthy();
    expect(screen.queryByText(/Couldn't load your 1:1 sessions/)).toBeNull();
  });

  it('says the list is from earlier, once, when a refresh fails for both sources', async () => {
    routeApi(ok([booking()]), ok([event()]));
    renderScreen();
    expect(await screen.findByText('Golf with Alex')).toBeTruthy();

    routeApi(fail('Network request failed'), fail('Network request failed'));
    await act(async () => {
      await screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(screen.getByText("Couldn't refresh your plans. Showing what was loaded earlier.")).toBeTruthy();
    // No contradictory per-source notices claiming the other source is fine.
    expect(screen.queryByText(/still shown/)).toBeNull();
    expect(screen.getAllByLabelText('Retry')).toHaveLength(1);
    expect(screen.getByText('Golf with Alex')).toBeTruthy();
    expect(screen.getByText('Sunrise 5k')).toBeTruthy();

    routeApi(ok([booking()]), ok([event()]));
    fireEvent.press(screen.getByLabelText('Retry'));
    await waitFor(() => expect(screen.queryByText(/Couldn't refresh/)).toBeNull());
  });

  it('names the one source whose refresh failed without calling it missing', async () => {
    routeApi(ok([booking()]), ok([event()]));
    renderScreen();
    expect(await screen.findByText('Golf with Alex')).toBeTruthy();

    routeApi(fail('HTTP 500'), ok([event()]));
    await act(async () => {
      await screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    expect(screen.getByText("Couldn't refresh your 1:1 sessions. Showing what was loaded earlier.")).toBeTruthy();
    expect(screen.getByText('Golf with Alex')).toBeTruthy();
  });

  it('shows a retryable error, not an empty state, when both sources fail', async () => {
    routeApi(fail('Request timed out. Check your network connection.'), fail('HTTP 503'));
    renderScreen();
    expect(await screen.findByText('Could not load your plans')).toBeTruthy();
    expect(screen.queryByText('Nothing planned yet')).toBeNull();

    routeApi(ok([]), ok([event()]));
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Sunrise 5k')).toBeTruthy();
  });

  it('offers Explore from the empty Upcoming list', async () => {
    routeApi(ok([]), ok([]));
    const navigation = renderScreen();
    fireEvent.press(await screen.findByLabelText('Explore sessions'));
    expect(navigation.navigate).toHaveBeenCalledWith('Explore');
  });

  it('opens bookings and sessions with their own routes', async () => {
    routeApi(ok([booking({ id: 'b9' })]), ok([event({ id: 'e9' })]));
    const navigation = renderScreen();
    await screen.findByText('Golf with Alex');
    fireEvent.press(screen.getByTestId('plan-booking:b9'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingDetail', { bookingId: 'b9' });
    fireEvent.press(screen.getByTestId('plan-event:e9'));
    expect(navigation.navigate).toHaveBeenCalledWith('SessionDetail', { eventId: 'e9' });
  });

  it('refreshes from the API on focus without duplicating rows', async () => {
    routeApi(ok([booking()]), ok([event()]));
    renderScreen();
    await screen.findByText('Golf with Alex');
    // One load = 3 booking segments + 2 session segments.
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(5));
    expect(screen.getAllByText('Golf with Alex')).toHaveLength(1);
  });
});
