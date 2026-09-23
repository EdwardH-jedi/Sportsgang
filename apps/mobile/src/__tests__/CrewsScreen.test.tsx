/**
 * Crews tab: Your crews (mine=true), Crews near you (geo), search,
 * Create crew, states and navigation.
 */
import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CrewListItem } from '@protin/shared-types';

import { CREW_RADIUS_KM, CrewsScreen } from '../screens/crews/CrewsScreen';

type ListState = { items: CrewListItem[]; isLoading: boolean; error: string | null };
let mockMine: ListState;
let mockNearby: ListState;
let mockResults: ListState;
const mockRefresh = jest.fn();
const crewCalls: Record<string, unknown>[] = [];

jest.mock('../hooks/useCrews', () => ({
  useCrews: (args: Record<string, unknown>) => {
    crewCalls.push(args);
    const state = args.mine ? mockMine : 'q' in args ? mockResults : mockNearby;
    return { ...state, total: state.items.length, refresh: mockRefresh };
  },
}));

const mockRequestLocation = jest.fn();
let mockLocation: Record<string, unknown>;
jest.mock('../hooks/useHomeLocation', () => ({
  useHomeLocation: () => mockLocation,
}));

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

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CrewsScreen />
    </SafeAreaProvider>
  );
}

function crew(overrides: Partial<CrewListItem> = {}): CrewListItem {
  return {
    id: 'c1',
    name: 'Dawn Patrol',
    description: null,
    sport: 'running',
    homeArea: 'Bondi',
    paceMinSecPerKm: 300,
    paceMaxSecPerKm: 360,
    visibility: 'public',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
    memberCount: 12,
    myRole: null,
    distanceKm: 2,
    nextRun: null,
    ...overrides,
  };
}

const empty = (): ListState => ({ items: [], isLoading: false, error: null });

beforeEach(() => {
  jest.clearAllMocks();
  crewCalls.length = 0;
  mockMine = empty();
  mockNearby = empty();
  mockResults = empty();
  mockLocation = { status: 'ready', coords: { lat: -33.89, lng: 151.27 }, requestLocation: mockRequestLocation };
});

describe('CrewsScreen', () => {
  it('queries your crews and running crews near you', () => {
    renderScreen();
    expect(crewCalls).toEqual(
      expect.arrayContaining([
        { mine: true, enabled: true },
        { sport: 'running', lat: -33.89, lng: 151.27, radiusKm: CREW_RADIUS_KM, enabled: true },
        { q: '', enabled: false },
      ])
    );
  });

  it('renders crew cards with area, distance, members, pace, role and next run', () => {
    mockMine.items = [crew({ id: 'm1', name: 'My Crew', myRole: 'owner' })];
    mockNearby.items = [
      crew({
        id: 'n1',
        nextRun: {
          id: 'r1',
          title: 'Harbour 10k',
          startsAt: '2030-06-01T20:00:00Z',
          locationText: 'Opera House',
          distanceKm: 10,
          paceMinSecPerKm: null,
          paceMaxSecPerKm: null,
          spotsLeft: 4,
        },
      }),
    ];
    const { getByLabelText, getByRole } = renderScreen();
    getByRole('header', { name: 'Your crews' });
    getByRole('header', { name: 'Crews near you' });
    within(getByLabelText('Open crew My Crew')).getByText('Owner');
    const card = getByLabelText('Open crew Dawn Patrol');
    within(card).getByText('Bondi · 2 km away');
    within(card).getByText('12 members');
    within(card).getByText('5:00–6:00 /km');
    within(card).getByText(/Harbour 10k/);
    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith('CrewDetail', { crewId: 'n1' });
  });

  it('does not repeat your crews in the nearby list', () => {
    mockMine.items = [crew({ id: 'same', name: 'Same Crew', myRole: 'member' })];
    mockNearby.items = [crew({ id: 'same', name: 'Same Crew' })];
    const { getAllByLabelText } = renderScreen();
    expect(getAllByLabelText('Open crew Same Crew')).toHaveLength(1);
  });

  it('shows empty states with Create crew', () => {
    const { getByText, getAllByLabelText } = renderScreen();
    getByText("You're not in a crew yet");
    getByText('No crews near you yet');
    // Header action + both empty states.
    const buttons = getAllByLabelText('Create crew');
    expect(buttons).toHaveLength(3);
    buttons.forEach((b) => fireEvent.press(b));
    expect(mockNavigate).toHaveBeenCalledTimes(3);
    expect(mockNavigate).toHaveBeenCalledWith('CreateCrew');
  });

  it('asks for a location when there is no fix', () => {
    mockLocation = { status: 'undetermined', coords: null, requestLocation: mockRequestLocation };
    const { getByRole, getByLabelText } = renderScreen();
    getByRole('header', { name: 'New crews' });
    fireEvent.press(getByLabelText('Set location for crews near you'));
    expect(mockRequestLocation).toHaveBeenCalled();
    expect(crewCalls).toContainEqual({ sport: 'running', lat: undefined, lng: undefined, radiusKm: undefined, enabled: true });
  });

  it('shows a skeleton while loading and an error with retry', () => {
    mockMine.isLoading = true;
    mockNearby.error = 'Network down';
    const { getByTestId, getByText, getByLabelText } = renderScreen();
    getByTestId('crew-card-skeleton');
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading crews'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('searches by name or area after a short debounce', async () => {
    mockResults.items = [crew({ id: 's1', name: 'Glebe Gallopers' })];
    const { getByLabelText, findByLabelText, queryByRole } = renderScreen();
    fireEvent.changeText(getByLabelText('Search crews'), 'glebe');
    await findByLabelText('Open crew Glebe Gallopers');
    expect(crewCalls).toContainEqual({ q: 'glebe', enabled: true });
    expect(queryByRole('header', { name: 'Your crews' })).toBeNull();
  });

  it('shows a no-results state', async () => {
    const { getByLabelText, findByText } = renderScreen();
    fireEvent.changeText(getByLabelText('Search crews'), 'zzz');
    await findByText('No crews match “zzz”');
    await waitFor(() => expect(crewCalls).toContainEqual({ q: 'zzz', enabled: true }));
  });
});
