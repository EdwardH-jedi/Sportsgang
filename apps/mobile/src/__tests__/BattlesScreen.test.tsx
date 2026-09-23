/**
 * BattlesScreen tests
 *
 * Covers: empty state, error/retry, card render, filter switching,
 * navigation to detail and create-game, run-aware copy + run cards.
 */

import React from 'react';
import { fireEvent, render as rtlRender } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BattlesScreen } from '../screens/battles/BattlesScreen';
import type { EventSummary } from '@protin/shared-types';

let mockHookState: {
  items: EventSummary[];
  isLoading: boolean;
  error: string | null;
};

const mockRefresh = jest.fn();
let lastHookArgs: { mine?: boolean; sport?: string; mode?: string } = {};

jest.mock('../hooks/useEvents', () => ({
  useEvents: (args: { mine?: boolean; sport?: string; mode?: string }) => {
    lastHookArgs = args;
    return { ...mockHookState, refresh: mockRefresh };
  },
}));

let mockHonorSummary: { honorLevel: string; honorScore: number } | null = {
  honorLevel: 'Trusted',
  honorScore: 126,
};
let mockHonorLoading = false;
let mockHonorError: string | null = null;
const honorCalls: string[] = [];

jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: ({ userId }: { userId: string | null }) => {
    if (userId) honorCalls.push(userId);
    return {
      summary: mockHonorSummary,
      isLoading: mockHonorLoading,
      error: mockHonorError,
    };
  },
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeEvent(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    hostUserId: 'host-1',
    host: { id: 'host-1', displayName: 'Sam' },
    title: 'Bondi Hoops',
    sport: 'basketball',
    mode: 'casual',
    startsAt: '2030-06-01T18:00:00Z',
    locationText: 'Bondi Court',
    capacity: 10,
    participantCount: 4,
    spotsLeft: 6,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function render(ui: React.ReactElement) {
  return rtlRender(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);
}

describe('BattlesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = { items: [], isLoading: false, error: null };
    lastHookArgs = {};
    mockHonorSummary = { honorLevel: 'Trusted', honorScore: 126 };
    mockHonorLoading = false;
    mockHonorError = null;
    honorCalls.length = 0;
  });

  it('renders the header and filter chips', () => {
    const { getByText, getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Games');
    getByText('Games & group runs');
    getByLabelText('Filter status by Open');
    getByLabelText('Filter mode by Ranked');
    getByLabelText('Filter sport by Basketball');
  });

  it('shows the empty state copy and a Host a game CTA', () => {
    const { getByText, getAllByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('No games nearby yet.');
    getByText('Start the first one and build your SportsGang.');
    // Two entry points: the header shortcut and the empty state CTA.
    expect(getAllByLabelText('Host a game').length).toBeGreaterThan(0);
  });

  it('renders an event card from items', () => {
    mockHookState.items = [makeEvent({ title: 'Saturday Basketball' })];
    const { getByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Saturday Basketball');
    getByText('Bondi Court');
    getByText('4/10 in');
  });

  it('shows Join CTA when the user has not joined', () => {
    mockHookState.items = [makeEvent({ hasJoined: false })];
    const { getAllByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    expect(getAllByText('Join').length).toBeGreaterThan(0);
  });

  it('shows View CTA when the user has joined', () => {
    mockHookState.items = [makeEvent({ hasJoined: true })];
    const { getByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('View');
  });

  it('shows Full CTA when status is full', () => {
    mockHookState.items = [makeEvent({ status: 'full', spotsLeft: 0 })];
    const { getByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Full');
  });

  it('switches hook to mine=true when Mine filter is selected', () => {
    const { getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Filter status by Mine'));
    expect(lastHookArgs.mine).toBe(true);
  });

  it('switches hook to mode=ranked when Ranked filter is selected', () => {
    const { getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Filter mode by Ranked'));
    expect(lastHookArgs.mode).toBe('ranked');
  });

  it('switches hook to sport when a sport chip is selected', () => {
    const { getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Filter sport by Tennis'));
    expect(lastHookArgs.sport).toBe('tennis');
  });

  it('navigates to BattleDetail when a card is pressed', () => {
    mockHookState.items = [makeEvent({ id: 'e-xyz' })];
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <BattlesScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Open battle Bondi Hoops'));
    expect(navigation.navigate).toHaveBeenCalledWith('BattleDetail', {
      eventId: 'e-xyz',
    });
  });

  it('navigates to CreateBattle when Host CTA in header is pressed', () => {
    const navigation = makeNavigation();
    const { getAllByLabelText } = render(
      <BattlesScreen navigation={navigation as any} route={{} as any} />
    );
    const buttons = getAllByLabelText('Host a game');
    fireEvent.press(buttons[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('CreateBattle');
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <BattlesScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('renders a retry button when error is set and refresh fires it', () => {
    mockHookState.error = 'Network down';
    const { getByText, getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading battles'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  // ── Honor badge on event cards ────────────────────────────────────────────

  it('shows the host Honor badge on event cards when summary is available', () => {
    mockHookState.items = [makeEvent({ hostUserId: 'host-1', title: 'Hoops' })];
    const { getByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Trusted');
  });

  it('falls back to "New player" when host honor unavailable', () => {
    mockHonorSummary = null;
    mockHookState.items = [makeEvent({ hostUserId: 'host-1' })];
    const { getByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('New player');
  });

  it('still renders event cards when honor fetch errors', () => {
    mockHonorSummary = null;
    mockHonorError = 'Network down';
    mockHookState.items = [
      makeEvent({ id: 'e-network', title: 'Still visible' }),
    ];
    const { getByText, queryByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    // Card renders even though honor lookup failed.
    getByText('Still visible');
    // Hard error must NOT be mislabelled as "New player".
    expect(queryByText('New player')).toBeNull();
  });

  // ── Lifecycle status on card ───────────────────────────────────────────

  it('event card shows Cancelled status and hides Join', () => {
    mockHookState.items = [makeEvent({ status: 'cancelled', hasJoined: false })];
    const { getByText, queryByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Cancelled');
    expect(queryByText('Join')).toBeNull();
  });

  it('event card shows Completed status and hides Join', () => {
    mockHookState.items = [makeEvent({ status: 'completed', hasJoined: false })];
    const { getByText, queryByText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Completed');
    expect(queryByText('Join')).toBeNull();
  });

  // ── Run-aware copy ──────────────────────────────────────────────────────

  it('switches to Group runs copy and Host a run when filtered to running', () => {
    const navigation = makeNavigation();
    const { getByLabelText, getByText, getAllByLabelText } = render(
      <BattlesScreen navigation={navigation as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Filter sport by Run'));
    getByText('Group runs');
    getByText('No group runs yet.');
    fireEvent.press(getAllByLabelText('Host a run')[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('CreateBattle', { sport: 'running' });
  });

  it('renders running events as run cards', () => {
    mockHookState.items = [
      makeEvent({ id: 'r1', sport: 'running', title: 'Harbour 10k', distanceKm: 10, crewName: 'Harbour Crew' }),
    ];
    const navigation = makeNavigation();
    const { getByLabelText, getByText } = render(
      <BattlesScreen navigation={navigation as any} route={{} as any} />
    );
    getByText('Harbour Crew');
    getByLabelText('10 km, Distance');
    fireEvent.press(getByLabelText('Open run Harbour 10k'));
    expect(navigation.navigate).toHaveBeenCalledWith('BattleDetail', { eventId: 'r1' });
  });

  it('shows skeletons while the first load is in flight', () => {
    mockHookState.isLoading = true;
    const { getByLabelText } = render(
      <BattlesScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByLabelText('Loading games');
  });
});
