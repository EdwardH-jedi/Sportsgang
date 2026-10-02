/**
 * v2 group sessions: form model, capacity copy and chips, SessionCard,
 * CreateSessionScreen and SessionDetailScreen.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { EventDetail, EventSummary } from '@protin/shared-types';

import { SessionCard } from '../components/SessionCard';
import { capacityText, golfSessionChips, runSessionChips } from '../lib/events';
import { buildCreateEventRequest, defaultSessionForm } from '../screens/sessions/sessionForm';
import { CreateSessionScreen } from '../screens/sessions/CreateSessionScreen';
import { SessionDetailScreen } from '../screens/sessions/SessionDetailScreen';

const mockCreateEvent = jest.fn();
const mockCancelEvent = jest.fn();
const mockCompleteEvent = jest.fn();
jest.mock('../lib/events', () => ({
  ...jest.requireActual('../lib/events'),
  createEvent: (...args: unknown[]) => mockCreateEvent(...args),
  cancelEvent: (...args: unknown[]) => mockCancelEvent(...args),
  completeEvent: (...args: unknown[]) => mockCompleteEvent(...args),
}));

let mockDetailState: {
  detail: EventDetail | null;
  isLoading: boolean;
  error: string | null;
};
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../hooks/useEvents', () => ({
  useEventDetail: () => ({ ...mockDetailState, join: mockJoin, leave: mockLeave, refresh: mockRefresh }),
}));

let mockUserId = 'viewer';
jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) => selector({ user: { id: mockUserId } }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const NOW = Date.UTC(2026, 9, 1, 0, 0); // 1 Oct 2026, before the DST change

function summary(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    hostUserId: 'host',
    host: { id: 'host', displayName: 'Sam' },
    title: 'Moore Park 9',
    sport: 'golf',
    mode: 'casual',
    startsAt: '2030-10-11T21:00:00Z',
    locationText: 'Moore Park Golf',
    capacity: 4,
    participantCount: 3,
    spotsLeft: 1,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: null,
    runDetails: null,
    golfDetails: {
      holes: 9,
      teeTimeStatus: 'secured',
      estimatedCostCents: 3500,
      handicapMinTenths: -21,
      handicapMaxTenths: 180,
      beginnersWelcome: true,
    },
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...summary(),
    participants: [
      { userId: 'host', displayName: 'Sam', joinedAt: '2026-09-20T00:00:00Z' },
      { userId: 'p2', displayName: 'Jo', joinedAt: '2026-09-21T00:00:00Z' },
      { userId: 'p3', displayName: 'Kai', joinedAt: '2026-09-22T00:00:00Z' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'viewer';
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('capacity copy and chips', () => {
  it('counts the host in the total', () => {
    expect(capacityText(summary())).toBe('4 golfers · 1 spot left');
    expect(capacityText(summary({ spotsLeft: 0, status: 'full', participantCount: 4 }))).toBe('4 golfers · Full');
    expect(capacityText(summary({ sport: 'running', capacity: 8, spotsLeft: 5 }))).toBe('8 runners · 5 spots left');
    expect(capacityText(summary({ status: 'cancelled' }))).toBe('4 golfers · Cancelled');
  });

  it('describes golf rounds without claiming a booking', () => {
    expect(golfSessionChips(summary().golfDetails!)).toEqual([
      '9 holes',
      'Tee time secured (host says)',
      '~$35',
      '+2.1–18.0 guide',
      'Beginners welcome',
    ]);
  });

  it('describes runs with target or social pace', () => {
    expect(
      runSessionChips({
        distanceKm: 10,
        paceMode: 'target_pace',
        paceMinSecPerKm: 330,
        paceMaxSecPerKm: 360,
        groupStyle: 'regroup_at_finish',
        beginnerFriendly: true,
        walkBreaksOk: true,
      })
    ).toEqual(['10 km', 'Target 5:30–6:00 /km', 'Regroup at the finish', 'Beginner friendly', 'Walk breaks OK']);
    expect(
      runSessionChips({
        distanceKm: 21.1,
        paceMode: 'social',
        paceMinSecPerKm: null,
        paceMaxSecPerKm: null,
        groupStyle: 'stay_together',
        beginnerFriendly: false,
        walkBreaksOk: false,
      })
    ).toEqual(['21.1 km', 'Social pace', 'Stay together']);
  });
});

describe('buildCreateEventRequest', () => {
  it('builds a golf round in Sydney time with cost and plus-handicap guide', () => {
    const form = defaultSessionForm('golf', NOW);
    form.title = '  Saturday 9  ';
    form.locationText = 'Moore Park Golf';
    form.date = '2026-10-10';
    form.time = '08:00';
    form.golf = { ...form.golf, holes: 9, costDollars: '42.50', handicapLow: '+2.1', handicapHigh: '18', beginnersWelcome: true };
    const result = buildCreateEventRequest('golf', form, NOW);
    expect(result).toEqual({
      ok: true,
      body: {
        title: 'Saturday 9',
        sport: 'golf',
        mode: 'casual',
        startsAt: '2026-10-09T21:00:00.000Z', // 8:00 am AEDT
        locationText: 'Moore Park Golf',
        capacity: 4,
        description: null,
        visibility: 'public',
        golfDetails: {
          holes: 9,
          teeTimeStatus: 'planning',
          estimatedCostCents: 4250,
          handicapMinTenths: -21,
          handicapMaxTenths: 180,
          beginnersWelcome: true,
        },
      },
    });
  });

  it('builds a target-pace run and stores pace as seconds per km', () => {
    const form = defaultSessionForm('running', NOW);
    form.title = 'Sunrise 10k';
    form.locationText = 'Centennial Park';
    form.date = '2026-10-03';
    form.time = '06:30'; // still AEST on Sat 3 Oct
    form.run = { ...form.run, distanceKm: '10', paceMode: 'target_pace', paceFastest: '5:30', paceSlowest: '6:00' };
    const result = buildCreateEventRequest('running', form, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.startsAt).toBe('2026-10-02T20:30:00.000Z');
      expect(result.body.runDetails).toEqual({
        distanceKm: 10,
        paceMode: 'target_pace',
        paceMinSecPerKm: 330,
        paceMaxSecPerKm: 360,
        groupStyle: 'stay_together',
        beginnerFriendly: false,
        walkBreaksOk: false,
      });
      expect(result.body.golfDetails).toBeUndefined();
    }
  });

  it.each([
    ['missing title and location', (f: ReturnType<typeof defaultSessionForm>) => f, ['title', 'location']],
    [
      'decimal pace',
      (f: ReturnType<typeof defaultSessionForm>) => ({
        ...f,
        run: { ...f.run, paceMode: 'target_pace' as const, paceFastest: '6.30', paceSlowest: '7:00' },
      }),
      ['title', 'location', 'pace'],
    ],
    [
      'unordered pace',
      (f: ReturnType<typeof defaultSessionForm>) => ({
        ...f,
        run: { ...f.run, paceMode: 'target_pace' as const, paceFastest: '6:30', paceSlowest: '5:30' },
      }),
      ['title', 'location', 'pace'],
    ],
    ['zero distance', (f: ReturnType<typeof defaultSessionForm>) => ({ ...f, run: { ...f.run, distanceKm: '0' } }), ['title', 'location', 'distance']],
    ['oversized group', (f: ReturnType<typeof defaultSessionForm>) => ({ ...f, capacity: 51 }), ['title', 'location', 'capacity']],
    ['DST gap time', (f: ReturnType<typeof defaultSessionForm>) => ({ ...f, date: '2026-10-04', time: '02:30' }), ['title', 'location', 'when']],
    ['past time', (f: ReturnType<typeof defaultSessionForm>) => ({ ...f, date: '2026-09-30', time: '06:00' }), ['title', 'location', 'when']],
  ])('rejects a run with %s', (_label, mutate, fields) => {
    const result = buildCreateEventRequest('running', mutate(defaultSessionForm('running', NOW)), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual([...fields].sort());
  });

  it('rejects a five-player golf group and a half handicap guide', () => {
    const form = { ...defaultSessionForm('golf', NOW), title: 'Round', locationText: 'Course', capacity: 5 };
    form.golf = { ...form.golf, handicapLow: '10' };
    const result = buildCreateEventRequest('golf', form, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['capacity', 'handicap']);
  });
});

// ─── SessionCard ─────────────────────────────────────────────────────────────

describe('SessionCard', () => {
  it('shows Sydney time, chips, capacity and the viewer role', () => {
    const onPress = jest.fn();
    render(<SessionCard event={summary({ startsAt: '2026-10-03T20:30:00Z' })} onPress={onPress} currentUserId="host" />);
    expect(screen.getByText('Sun 4 Oct · 7:30 am')).toBeTruthy();
    expect(screen.getByText('4 golfers · 1 spot left')).toBeTruthy();
    expect(screen.getByText('Tee time secured (host says)')).toBeTruthy();
    expect(screen.getByText('Hosting')).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-card-e1'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders legacy events without detail chips', () => {
    render(
      <SessionCard
        event={summary({ sport: 'basketball', title: 'Hoops', golfDetails: null, capacity: 10, spotsLeft: 6 })}
        onPress={jest.fn()}
      />
    );
    expect(screen.getByText('Hoops')).toBeTruthy();
    expect(screen.getByText('10 players · 6 spots left')).toBeTruthy();
    expect(screen.queryByText(/holes/)).toBeNull();
  });
});

// ─── CreateSessionScreen ────────────────────────────────────────────────────

function renderCreate(sport: 'running' | 'golf') {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  render(
    <CreateSessionScreen
      navigation={navigation as never}
      route={{ key: 'c', name: 'CreateSession', params: { sport } } as never}
    />
  );
  return navigation;
}

describe('CreateSessionScreen', () => {
  it('creates a golf round and opens its detail', async () => {
    mockCreateEvent.mockResolvedValue({ id: 'new-1' });
    const navigation = renderCreate('golf');
    expect(screen.getByText('Host a round')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Round name'), 'Saturday 9');
    fireEvent.changeText(screen.getByLabelText('Course'), 'Moore Park Golf');
    fireEvent.press(screen.getByLabelText('9 holes'));
    fireEvent.press(screen.getByLabelText('Beginners welcome'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-session-submit'));
    });
    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    const body = mockCreateEvent.mock.calls[0][0];
    expect(body).toMatchObject({
      title: 'Saturday 9',
      sport: 'golf',
      mode: 'casual',
      locationText: 'Moore Park Golf',
      capacity: 4,
      golfDetails: { holes: 9, teeTimeStatus: 'planning', beginnersWelcome: true },
    });
    expect(body.runDetails).toBeUndefined();
    expect(navigation.replace).toHaveBeenCalledWith('SessionDetail', { eventId: 'new-1' });
  });

  it('validates locally before calling the API', async () => {
    renderCreate('running');
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-session-submit'));
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(screen.getByText('Give your run a name.')).toBeTruthy();
    expect(screen.getByText('Add a meeting point.')).toBeTruthy();
  });

  it('shows the server explanation when the API rejects', async () => {
    mockCreateEvent.mockRejectedValue(new Error('A group run is 2 to 50 runners, including you.'));
    const navigation = renderCreate('running');
    fireEvent.changeText(screen.getByLabelText('Run name'), 'Sunrise 5k');
    fireEvent.changeText(screen.getByLabelText('Meeting point'), 'Centennial Park');
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-session-submit'));
    });
    expect(await screen.findByText('A group run is 2 to 50 runners, including you.')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('keeps group size inside the golf limit', () => {
    renderCreate('golf');
    expect(screen.getByText('4 golfers')).toBeTruthy();
    const more = screen.getByLabelText('More spots');
    expect(more.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByLabelText('Fewer spots'));
    fireEvent.press(screen.getByLabelText('Fewer spots'));
    fireEvent.press(screen.getByLabelText('Fewer spots'));
    expect(screen.getByText('2 golfers')).toBeTruthy();
  });
});

// ─── SessionDetailScreen ────────────────────────────────────────────────────

function renderDetail(d: EventDetail | null, extra: Partial<typeof mockDetailState> = {}) {
  mockDetailState = { detail: d, isLoading: false, error: null, ...extra };
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  render(
    <SessionDetailScreen
      navigation={navigation as never}
      route={{ key: 'd', name: 'SessionDetail', params: { eventId: 'e1' } } as never}
    />
  );
  return navigation;
}

describe('SessionDetailScreen', () => {
  it('shows the honest golf notes, capacity and no chat button', () => {
    renderDetail(detail());
    expect(screen.getByTestId('session-capacity').props.children).toBe('4 golfers · 1 spot left');
    expect(screen.getByText(/Joining here doesn't book the course/)).toBeTruthy();
    expect(screen.getByText(/The host says the tee time is secured/)).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.queryByText(/chat/i)).toBeNull();
    expect(screen.getByTestId('session-join')).toBeTruthy();
  });

  it('keeps the server reason when the last spot is taken first', async () => {
    mockJoin.mockRejectedValue(new Error('Event is full'));
    renderDetail(detail());
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-join'));
    });
    expect(await screen.findByText('Event is full')).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('lets a joined participant leave and hides join', async () => {
    mockLeave.mockResolvedValue(undefined);
    renderDetail(detail({ hasJoined: true }));
    expect(screen.queryByTestId('session-join')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-leave'));
    });
    expect(mockLeave).toHaveBeenCalled();
  });

  it('shows a full session without a join button', () => {
    renderDetail(detail({ spotsLeft: 0, status: 'full', participantCount: 4 }));
    expect(screen.queryByTestId('session-join')).toBeNull();
    expect(screen.getByText('This round is full.')).toBeTruthy();
  });

  it('lets the host cancel after confirming', async () => {
    mockUserId = 'host';
    mockCancelEvent.mockResolvedValue(detail({ status: 'cancelled' }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    renderDetail(detail());
    expect(screen.queryByTestId('session-join')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('session-cancel'));
    });
    await waitFor(() => expect(mockCancelEvent).toHaveBeenCalledWith('e1'));
    expect(mockRefresh).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('shows a cancelled session as cancelled with no actions', () => {
    renderDetail(detail({ status: 'cancelled' }));
    expect(screen.getByText('This round was cancelled by the host.')).toBeTruthy();
    expect(screen.queryByTestId('session-join')).toBeNull();
  });

  it('renders a legacy event without details', () => {
    renderDetail(detail({ sport: 'basketball', title: 'Hoops', golfDetails: null }));
    expect(screen.getByText('Hoops')).toBeTruthy();
    expect(screen.queryByText(/holes/)).toBeNull();
    expect(screen.queryByText(/guide/)).toBeNull();
  });

  it('distinguishes a load failure from a missing session', () => {
    renderDetail(null, { error: 'Request timed out. Check your network connection.' });
    expect(screen.getByText('Could not load this session')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
