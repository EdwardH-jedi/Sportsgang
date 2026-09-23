/**
 * Create / edit crew: validation, pace band, "use my location" (2 dp,
 * never saved to the profile), POST vs PATCH payloads, navigation.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CreateCrewScreen } from '../screens/crews/CreateCrewScreen';
import { useProfileStore } from '../stores/profile';

const mockCreateCrew = jest.fn();
const mockUpdateCrew = jest.fn();
jest.mock('../lib/crews', () => ({
  ...jest.requireActual('../lib/crews'),
  createCrew: (...a: unknown[]) => mockCreateCrew(...a),
  updateCrew: (...a: unknown[]) => mockUpdateCrew(...a),
}));

let mockCrew: Record<string, unknown> | null = null;
jest.mock('../hooks/useCrew', () => ({
  useCrew: (id: string | null) => ({ crew: id ? mockCrew : null }),
}));

const mockRequestLocation = jest.fn();
jest.mock('../hooks/useHomeLocation', () => ({
  useHomeLocation: () => ({ requestLocation: mockRequestLocation, isBusy: false }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen(params?: Record<string, unknown>) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CreateCrewScreen navigation={navigation as any} route={{ params } as any} />
    </SafeAreaProvider>
  );
  return { ...utils, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCrew = null;
  useProfileStore.setState({
    profile: { id: 'p', userId: 'u', displayName: 'Jo', suburb: 'Glebe', createdAt: '', updatedAt: '' },
  });
});

describe('CreateCrewScreen', () => {
  it('pre-fills the area from the profile suburb and needs a name', () => {
    const { getByLabelText } = renderScreen();
    expect(getByLabelText('Home area').props.value).toBe('Glebe');
    expect(getByLabelText('Create crew').props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(getByLabelText('Crew name'), 'Glebe Gallopers');
    expect(getByLabelText('Create crew').props.accessibilityState?.disabled).toBe(false);
  });

  it('creates a crew with a rounded home point and pace band, then opens it', async () => {
    mockRequestLocation.mockResolvedValue({ lat: -33.879123, lng: 151.186789 });
    mockCreateCrew.mockResolvedValue({ id: 'new-crew' });
    const { getByLabelText, getByText, navigation } = renderScreen();
    fireEvent.changeText(getByLabelText('Crew name'), 'Glebe Gallopers');
    await act(async () => {
      fireEvent.press(getByLabelText('Use my location for the crew'));
    });
    expect(mockRequestLocation).toHaveBeenCalledWith({ save: false });
    getByText('Location set (about 1 km). Used for “Crews near you”.');
    fireEvent.changeText(getByLabelText('Fastest crew pace per km'), '5:15');
    fireEvent.changeText(getByLabelText('Slowest crew pace per km'), '6:00');
    fireEvent.changeText(getByLabelText('Crew description'), 'Saturday long runs');
    await act(async () => {
      fireEvent.press(getByLabelText('Create crew'));
    });
    expect(mockCreateCrew).toHaveBeenCalledWith({
      name: 'Glebe Gallopers',
      homeArea: 'Glebe',
      description: 'Saturday long runs',
      sport: 'running',
      paceMinSecPerKm: 315,
      paceMaxSecPerKm: 360,
      homeLat: -33.88,
      homeLng: 151.19,
    });
    expect(navigation.replace).toHaveBeenCalledWith('CrewDetail', { crewId: 'new-crew' });
  });

  it('omits the home point when location is unavailable and says so', async () => {
    mockRequestLocation.mockResolvedValue(null);
    mockCreateCrew.mockResolvedValue({ id: 'c2' });
    const { getByLabelText, getByText } = renderScreen();
    fireEvent.changeText(getByLabelText('Crew name'), 'No Fix Crew');
    await act(async () => {
      fireEvent.press(getByLabelText('Use my location for the crew'));
    });
    getByText('Location unavailable — the crew will still show up in search.');
    await act(async () => {
      fireEvent.press(getByLabelText('Create crew'));
    });
    const body = mockCreateCrew.mock.calls[0][0];
    expect(body.homeLat).toBeUndefined();
    expect(body.homeLng).toBeUndefined();
  });

  it('blocks an inverted pace band', () => {
    const { getByLabelText, getByText } = renderScreen();
    fireEvent.changeText(getByLabelText('Crew name'), 'X');
    fireEvent.changeText(getByLabelText('Fastest crew pace per km'), '6:00');
    fireEvent.changeText(getByLabelText('Slowest crew pace per km'), '5:00');
    getByText('The faster pace must come first.');
    expect(getByLabelText('Create crew').props.accessibilityState?.disabled).toBe(true);
  });

  it('edits a crew via PATCH without touching sport or home point', async () => {
    mockCrew = {
      id: 'c1',
      name: 'Dawn Patrol',
      description: null,
      homeArea: 'Bondi',
      paceMinSecPerKm: 300,
      paceMaxSecPerKm: null,
    };
    mockUpdateCrew.mockResolvedValue({});
    const { getByLabelText, getByText, navigation } = renderScreen({ crewId: 'c1' });
    getByText('Edit crew');
    expect(getByLabelText('Crew name').props.value).toBe('Dawn Patrol');
    expect(getByLabelText('Home area').props.value).toBe('Bondi');
    expect(getByLabelText('Fastest crew pace per km').props.value).toBe('5:00');
    fireEvent.changeText(getByLabelText('Crew name'), 'Dawn Patrol 2');
    await act(async () => {
      fireEvent.press(getByLabelText('Save changes'));
    });
    expect(mockUpdateCrew).toHaveBeenCalledWith('c1', {
      name: 'Dawn Patrol 2',
      homeArea: 'Bondi',
      description: null,
      paceMinSecPerKm: 300,
      paceMaxSecPerKm: null,
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
