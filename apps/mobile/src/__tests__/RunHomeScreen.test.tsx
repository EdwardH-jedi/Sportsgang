/**
 * Run tab home: location chip / subtitle states, Group runs map + sheet
 * (filters, pins, states, navigation), Runners segment switch, Next up.
 */
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { EventSummary } from '@protin/shared-types';

import { StyleSheet } from 'react-native';

import { formatClock, formatDayLabel } from '../lib/format';
import { RunHomeScreen, locationSubtitle } from '../screens/run/RunHomeScreen';
import { GROUP_RUN_RADIUS_KM, SHEET_SNAPS } from '../screens/run/GroupRunsView';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockRequestLocation = jest.fn();
const mockOpenSettings = jest.fn();
let mockLocation: Record<string, unknown>;
jest.mock('../hooks/useHomeLocation', () => ({
  useHomeLocation: () => mockLocation,
}));

const mockRefreshRuns = jest.fn();
let mockRuns: { runs: EventSummary[]; isLoading: boolean; error: string | null };
const groupRunArgs: unknown[] = [];
jest.mock('../hooks/useGroupRuns', () => ({
  useGroupRuns: (args: unknown) => {
    groupRunArgs.push(args);
    return { ...mockRuns, refresh: mockRefreshRuns };
  },
}));

jest.mock('../hooks/useDiscovery', () => ({
  useDiscovery: () => ({
    partners: [],
    isLoading: false,
    error: null,
    sport: 'running',
    setSport: jest.fn(),
    recordAction: jest.fn(),
    fetchMore: jest.fn(),
  }),
}));

let mockSessions: unknown[] = [];
jest.mock('../hooks/useUpcomingSessions', () => ({
  useUpcomingSessions: () => ({ items: mockSessions, refresh: jest.fn() }),
}));

const mockListEvents = jest.fn();
jest.mock('../lib/events', () => ({
  ...jest.requireActual('../lib/events'),
  listEvents: (...args: unknown[]) => mockListEvents(...args),
}));

jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: () => ({ summary: null, isLoading: false, error: null }),
}));

jest.mock('react-native-maps', () => {
  const { View, Pressable, Text } = require('react-native');
  const MapView = ({ children, ...rest }: any) => (
    <View testID="mock-map" {...rest}>
      {children}
    </View>
  );
  const Marker = ({ title, onPress, accessibilityLabel, pinColor }: any) => (
    <Pressable accessibilityLabel={accessibilityLabel} onPress={onPress} testID={`pin-${pinColor}`}>
      <Text>{title}</Text>
    </Pressable>
  );
  return { __esModule: true, default: MapView, Marker, PROVIDER_DEFAULT: 'default' };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => {
    const R = require('react');
    R.useEffect(() => {
      cb();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen() {
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RunHomeScreen />
    </SafeAreaProvider>
  );
  // Let the Next-up fetch settle inside act().
  await act(async () => undefined);
  return utils;
}

function makeRun(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'r1',
    hostUserId: 'h1',
    host: { id: 'h1', displayName: 'Sam' },
    title: 'Bay Run Loop',
    sport: 'running',
    mode: 'casual',
    startsAt: '2030-06-01T20:00:00Z',
    locationText: 'Iron Cove Bridge',
    capacity: 20,
    participantCount: 5,
    spotsLeft: 15,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    crewId: 'c1',
    crewName: 'Inner West Runners',
    meetingLat: -33.86,
    meetingLng: 151.15,
    distanceKm: 7,
    paceMinSecPerKm: 330,
    paceMaxSecPerKm: 360,
    distanceKmFromYou: 2.4,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  groupRunArgs.length = 0;
  mockSessions = [];
  mockListEvents.mockResolvedValue({ items: [], total: 0 });
  mockLocation = {
    status: 'undetermined',
    coords: null,
    error: null,
    areaLabel: null,
    hasHomeLocation: false,
    isBusy: false,
    requestLocation: mockRequestLocation,
    openSettings: mockOpenSettings,
  };
  mockRuns = { runs: [], isLoading: false, error: null };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RunHomeScreen header + location', () => {
  it('asks for a location when none is set', async () => {
    const { getByRole, getAllByRole, getByText, getAllByText } = await renderScreen();
    getByRole('header', { name: 'Runs near you' });
    getByText('Set your location to see what’s close');
    // Header chip + sheet notice both offer it.
    expect(getAllByText('Set location').length).toBe(2);
    fireEvent.press(getAllByRole('button', { name: 'Set location' })[0]);
    expect(mockRequestLocation).toHaveBeenCalled();
    getByText('See runs near you');
  });

  it('shows the area when located and queries runs within the radius', async () => {
    mockLocation = { ...mockLocation, status: 'ready', coords: { lat: -33.88, lng: 151.18 }, areaLabel: 'Glebe' };
    const { getByText, getByLabelText, queryByText } = await renderScreen();
    getByText('Around Glebe');
    getByLabelText('Location: Glebe. Update location');
    expect(queryByText('See runs near you')).toBeNull();
    expect(groupRunArgs[groupRunArgs.length - 1]).toEqual({
      coords: { lat: -33.88, lng: 151.18 },
      radiusKm: GROUP_RUN_RADIUS_KM,
      when: 'week',
    });
  });

  it('offers settings when location is denied', async () => {
    mockLocation = { ...mockLocation, status: 'denied' };
    const { getByText, getByLabelText } = await renderScreen();
    getByText('Location off · showing all of Sydney');
    fireEvent.press(getByLabelText('Location off. Open settings'));
    getByText('Location is off');
    fireEvent.press(getByText('Open settings'));
    expect(mockOpenSettings).toHaveBeenCalledTimes(2);
  });

  it('maps every status to a subtitle', () => {
    expect(locationSubtitle('ready', null)).toBe('Around you');
    expect(locationSubtitle('locating', null)).toBe('Finding your area…');
    expect(locationSubtitle('unavailable', null)).toMatch(/Couldn't get your location/);
    expect(locationSubtitle('unknown', null)).toBe('Set your location to see what’s close');
  });
});

describe('Group runs segment', () => {
  it('lists run cards with stats, crew and distance, and opens a run', async () => {
    mockRuns.runs = [makeRun()];
    const { getByLabelText, getByText } = await renderScreen();
    const card = getByLabelText('Open run Bay Run Loop');
    within(card).getByText('Inner West Runners');
    within(card).getByText('2.4 km away');
    within(card).getByText('Hosted by Sam');
    getByLabelText('7 km, Distance');
    getByLabelText('5:30–6:00 /km, Pace');
    getByLabelText('15, Spots left');
    getByText('1 run');
    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith('BattleDetail', { eventId: 'r1' });
  });

  it('pins runs with a meeting point and brings the tapped run to the top', async () => {
    mockRuns.runs = [
      makeRun({ id: 'a', title: 'First' }),
      makeRun({ id: 'b', title: 'Second' }),
      makeRun({ id: 'c', title: 'No pin', meetingLat: null, meetingLng: null }),
    ];
    const { getByLabelText, queryByLabelText, getAllByLabelText } = await renderScreen();
    expect(queryByLabelText('Run pin No pin')).toBeNull();
    fireEvent.press(getByLabelText('Run pin Second'));
    const cards = getAllByLabelText(/^Open run /);
    expect(cards[0].props.accessibilityLabel).toBe('Open run Second');
  });

  it('switches the time window from the When chips', async () => {
    const { getByLabelText } = await renderScreen();
    fireEvent.press(getByLabelText('Today'));
    expect(groupRunArgs[groupRunArgs.length - 1]).toMatchObject({ when: 'today' });
    fireEvent.press(getByLabelText('All'));
    expect(groupRunArgs[groupRunArgs.length - 1]).toMatchObject({ when: 'all' });
  });

  it('filters by distance and pace, with a clear-filters empty state', async () => {
    mockRuns.runs = [makeRun({ id: 'a', title: 'Short one', distanceKm: 4 })];
    const { getByLabelText, getByText, queryByLabelText } = await renderScreen();
    fireEvent.press(getByLabelText('Show distance and pace filters'));
    fireEvent.press(getByLabelText('Over 10 km'));
    expect(queryByLabelText('Open run Short one')).toBeNull();
    getByText('No runs match these filters');
    fireEvent.press(getByText('Clear filters'));
    getByLabelText('Open run Short one');
    fireEvent.press(getByLabelText('Pace Under 5:00'));
    expect(queryByLabelText('Open run Short one')).toBeNull();
  });

  it('shows skeletons while loading', async () => {
    mockRuns.isLoading = true;
    const { getByLabelText, getAllByTestId, getByText } = await renderScreen();
    getByLabelText('Loading group runs');
    expect(getAllByTestId('run-card-skeleton').length).toBe(2);
    getByText('Loading…');
  });

  it('shows the error state with retry', async () => {
    mockRuns.error = 'Network down';
    const { getByText, getByLabelText } = await renderScreen();
    getByText('Could not load group runs');
    fireEvent.press(getByLabelText('Retry loading group runs'));
    expect(mockRefreshRuns).toHaveBeenCalled();
  });

  it('empty state and the sheet button both open Host a run', async () => {
    const { getByText, getAllByText } = await renderScreen();
    getByText('No group runs yet');
    const hostButtons = getAllByText('Host a run');
    expect(hostButtons.length).toBe(2);
    fireEvent.press(hostButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('CreateBattle', { sport: 'running' });
  });
});

describe('Runners segment', () => {
  it('switches to partner discovery', async () => {
    const { getByRole, getByText, queryByText } = await renderScreen();
    fireEvent.press(getByRole('tab', { name: 'Runners' }));
    getByText('Running partners');
    expect(queryByText('Group runs', { exact: true })).toBeTruthy(); // segment label stays
    expect(queryByText('No group runs yet')).toBeNull();
  });
});

describe('Next up', () => {
  it('shows the soonest upcoming session and opens it', async () => {
    mockSessions = [
      {
        id: 's1',
        sport: 'running',
        startsAt: '2031-01-01T08:00:00Z',
        partner: { displayName: 'Kim' },
        venue: { name: 'Centennial Park' },
        location: null,
      },
    ];
    mockListEvents.mockResolvedValue({
      items: [makeRun({ id: 'later', title: 'Later run', startsAt: '2031-02-01T08:00:00Z' })],
      total: 1,
    });
    const { findByText, getByTestId } = await renderScreen();
    await findByText('Running with Kim');
    fireEvent.press(getByTestId('next-up-card'));
    expect(mockNavigate).toHaveBeenCalledWith('BookingDetail', { bookingId: 's1' });
    expect(mockListEvents).toHaveBeenCalledWith(expect.objectContaining({ mine: true, limit: 10 }));
  });

  it('shows a joined run when it is the soonest', async () => {
    mockListEvents.mockResolvedValue({
      items: [makeRun({ id: 'mine', title: 'Sunrise 5k', startsAt: '2031-01-01T06:00:00Z' })],
      total: 1,
    });
    const { findByText, getByTestId } = await renderScreen();
    await findByText('Sunrise 5k');
    fireEvent.press(getByTestId('next-up-card'));
    expect(mockNavigate).toHaveBeenCalledWith('BattleDetail', { eventId: 'mine' });
  });

  it('keeps the time out of the truncating eyebrow (compact on Group runs, own line on Runners)', async () => {
    const startsAt = '2031-01-01T06:00:00Z';
    mockListEvents.mockResolvedValue({
      items: [makeRun({ id: 'mine', title: 'Sunrise 5k', startsAt })],
      total: 1,
    });
    const { findByText, getByText, queryByText } = await renderScreen();
    await findByText('Next up');
    // Compact row: day and time are separate, untruncated lines.
    getByText(formatClock(startsAt));
    getByText(formatDayLabel(startsAt));
    fireEvent.press(getByText('Runners'));
    getByText(`${formatDayLabel(startsAt)} · ${formatClock(startsAt)}`);
    expect(queryByText(/Next up ·/)).toBeNull();
  });

  it('is hidden with nothing upcoming', async () => {
    const { queryByTestId } = await renderScreen();
    await waitFor(() => expect(mockListEvents).toHaveBeenCalled());
    expect(queryByTestId('next-up-card')).toBeNull();
  });
});

describe('Group runs sheet layout', () => {
  it('opens at 40% so the map stays usable, flush above the tab bar', async () => {
    expect(SHEET_SNAPS[1]).toBe('40%');
    const { getByTestId } = await renderScreen();
    expect(StyleSheet.flatten(getByTestId('group-runs-sheet-content').props.style).paddingBottom).toBe(0);
  });
});
