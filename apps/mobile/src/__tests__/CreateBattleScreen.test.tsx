/**
 * CreateBattleScreen tests
 *
 * Covers: form renders, capacity default updates on sport switch,
 * Create button disabled until title + location, calls createEvent
 * with the right payload, navigates to the resulting detail.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CreateBattleScreen } from '../screens/battles/CreateBattleScreen';

const mockCreateEvent = jest.fn();

jest.mock('../lib/events', () => {
  const actual = jest.requireActual('../lib/events');
  return {
    ...actual,
    createEvent: (...args: unknown[]) => mockCreateEvent(...args),
    updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
  };
});

const mockCrews: { id: string; name: string }[] = [];
jest.mock('../hooks/useCrews', () => ({
  useCrews: () => ({ items: mockCrews, total: mockCrews.length, isLoading: false, error: null, refresh: jest.fn() }),
}));

const mockUpdateEvent = jest.fn();
let mockEditing: Record<string, unknown> | null = null;
jest.mock('../hooks/useEvents', () => ({
  useEventDetail: ({ enabled }: { enabled: boolean }) => ({
    detail: enabled ? mockEditing : null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// ─── Mock NearbyCourtsModal ──────────────────────────────────────────────────

// Captures the latest props the event form passes into the modal so the
// venue-picker integration tests can assert that sport + coords + status
// flow through correctly. Mirrors the BookingComposerScreen test pattern.
const mockNearbyModalProps = jest.fn();

jest.mock('../screens/bookings/NearbyCourtsModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    NearbyCourtsModal: (props: any) => {
      mockNearbyModalProps(props);
      const { isOpen, onSelect, onSelectManual, onSelectPin, onClose } = props;
      if (!isOpen) return null;
      return (
        <View>
          <Pressable
            accessibilityLabel="mock-pick-venue"
            onPress={() => {
              onSelect({
                id: 'venue-1',
                name: 'Tennis Court Alpha',
                sportTags: ['tennis'],
                area: 'Bondi',
                address: '1 Beach Rd, Bondi NSW',
                latitude: -33.89,
                longitude: 151.27,
                isBookable: false,
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
              });
              onClose();
            }}
          >
            <Text>pick mock venue</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="mock-pick-manual"
            onPress={() => {
              // Simulates the user typing a court name into the
              // modal's bottom fallback and pressing "Use this venue".
              onSelectManual?.('My Backyard Court');
              onClose();
            }}
          >
            <Text>pick mock manual</Text>
          </Pressable>
          {onSelectPin ? (
            <Pressable
              accessibilityLabel="mock-pick-pin"
              onPress={() => {
                onSelectPin({ latitude: -33.85678, longitude: 151.21534 });
                onClose();
              }}
            >
              <Text>pick mock pin</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  };
});

// ─── Mock expo-location ───────────────────────────────────────────────────────

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  }),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { Balanced: 3 },
}));

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function renderCreateBattle(opts: { navigation?: any; params?: Record<string, unknown> } = {}) {
  const navigation = opts.navigation ?? makeNavigation();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CreateBattleScreen navigation={navigation as any} route={{ params: opts.params } as any} />
    </SafeAreaProvider>
  );
  return { ...utils, navigation };
}

describe('CreateBattleScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCrews.length = 0;
    mockEditing = null;
  });

  it('opens as Host a run by default and Host a game for other sports', () => {
    const { getByText, getByLabelText } = renderCreateBattle();
    getByText('Host a run');
    getByText('Pick a meeting spot, a distance and a pace. Reliable hosts build higher Honor.');
    fireEvent.press(getByLabelText('Select sport Tennis'));
    getByText('Host a game');
    getByText('Set the details. Reliable hosts build higher Honor.');
  });

  it('renders mode (games only) and sport options', () => {
    const { getByLabelText, queryByLabelText } = renderCreateBattle();
    expect(queryByLabelText('Select Casual Game')).toBeNull();
    fireEvent.press(getByLabelText('Select sport Basketball'));
    getByLabelText('Select Casual Game');
    getByLabelText('Select Ranked Battle');
    getByLabelText('Select sport Basketball');
    getByLabelText('Select sport Tennis');
  });

  it('lists Run first and defaults to it with the running capacity', () => {
    const { getByLabelText, getAllByLabelText } = renderCreateBattle();
    const sportChips = getAllByLabelText(/^Select sport /).map(
      (c) => c.props.accessibilityLabel
    );
    expect(sportChips[0]).toBe('Select sport Run');
    expect(getByLabelText('Run capacity').props.value).toBe('30');
    expect(getByLabelText('Choose park, route, or meeting spot')).toBeTruthy();
  });

  it('Post run button stays disabled until title and location are filled', async () => {
    const navigation = makeNavigation();
    const { getByLabelText } = renderCreateBattle({ navigation });
    const cta = getByLabelText('Post run');
    expect(cta.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(cta);
    });
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it('calls createEvent and navigates to BattleDetail on success', async () => {
    mockCreateEvent.mockResolvedValueOnce({ id: 'new-event-1' });
    const navigation = makeNavigation();
    const { getByLabelText } = renderCreateBattle({ navigation });

    fireEvent.changeText(getByLabelText('Run title'), 'Friday Run Club');
    fireEvent.changeText(getByLabelText('Meeting spot'), 'Bondi Court');

    await act(async () => {
      fireEvent.press(getByLabelText('Post run'));
    });

    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    const payload = mockCreateEvent.mock.calls[0][0];
    expect(payload.title).toBe('Friday Run Club');
    expect(payload.locationText).toBe('Bondi Court');
    expect(payload.mode).toBe('casual');
    expect(payload.sport).toBe('running');
    expect(payload.visibility).toBe('public');
    expect(payload.capacity).toBeGreaterThan(0);
    expect(navigation.replace).toHaveBeenCalledWith('BattleDetail', {
      eventId: 'new-event-1',
    });
  });

  it('updates capacity default when sport changes (tennis → 2)', async () => {
    const { getByLabelText } = renderCreateBattle();
    fireEvent.press(getByLabelText('Select sport Tennis'));
    const capacityInput = getByLabelText('Game capacity');
    // Default for tennis is 2.
    expect(capacityInput.props.value).toBe('2');
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = renderCreateBattle({ navigation });
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  // ── Venue picker integration ────────────────────────────────────────────

  describe('venue picker', () => {
    it('shows the Choose court or venue button for tennis (sport-specific label)', () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      expect(getByLabelText('Choose court or venue')).toBeTruthy();
    });

    it('shows the venue picker for basketball — bug fix', () => {
      // Pre-fix this screen gated the picker behind a hardcoded set of
      // {gym, golf, tennis, running}, so basketball hosts only saw the
      // free-text input. Backend accepts any sport string; the modal's
      // manual-venue footer covers the "no seed data" case, so the
      // picker now renders for every sport.
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Basketball'));
      expect(getByLabelText('Choose court, field, or venue')).toBeTruthy();
      // Free-text fallback is also still present below it.
      expect(getByLabelText('Game location')).toBeTruthy();
    });

    it('shows the venue picker for soccer (court/field copy)', () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Soccer'));
      expect(getByLabelText('Choose court, field, or venue')).toBeTruthy();
    });

    it('shows the venue picker for badminton (court/venue copy, shared with tennis)', () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Badminton'));
      expect(getByLabelText('Choose court or venue')).toBeTruthy();
    });

    it('shows running-specific picker copy (park/route/meeting-spot)', () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Run'));
      expect(getByLabelText('Choose park, route, or meeting spot')).toBeTruthy();
    });

    it('opens the modal and forwards sport + location status when picker is tapped', async () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      // Wait for useVenueLocation's denied-path effect to settle.
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.isOpen).toBe(true);
        expect(props?.sport).toBe('tennis');
        expect(props?.locationStatus).toBe('denied');
        expect(props?.lat).toBeUndefined();
        expect(props?.lng).toBeUndefined();
      });
    });

    it('selecting a venue populates the form and submit sends a venue-derived locationText', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-with-venue' });
      const navigation = makeNavigation();
      const { getByLabelText, getByText, queryByLabelText } = renderCreateBattle({ navigation });
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Annandale Tennis Hit');

      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });

      // Chip replaces the free-text input.
      expect(getByText('Tennis Court Alpha')).toBeTruthy();
      expect(getByText('1 Beach Rd, Bondi NSW')).toBeTruthy();
      expect(queryByLabelText('Game location')).toBeNull();
      expect(getByLabelText('Clear selected venue')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('tennis');
      expect(payload.locationText).toBe('Tennis Court Alpha — 1 Beach Rd, Bondi NSW');
    });

    it('Change clears the selected venue back to the free-text fallback', async () => {
      const { getByLabelText, getByPlaceholderText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      fireEvent.press(getByLabelText('Clear selected venue'));
      expect(getByPlaceholderText('Bondi Beach Court 2')).toBeTruthy();
    });

    it('switching sport drops the selected venue chip (mismatched-payload guard)', async () => {
      const { getByLabelText, queryByText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      expect(queryByText('Tennis Court Alpha')).toBeTruthy();

      fireEvent.press(getByLabelText('Select sport Basketball'));
      // Venue chip is gone; basketball now shows its own picker CTA AND
      // the free-text fallback right beneath it.
      expect(queryByText('Tennis Court Alpha')).toBeNull();
      expect(getByLabelText('Choose court, field, or venue')).toBeTruthy();
      expect(getByLabelText('Game location')).toBeTruthy();
    });

    it('still allows submit using only the free-text input (picker is optional)', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-no-picker' });
      const { getByLabelText } = renderCreateBattle();
      // Sport defaults to running — the picker CTA is rendered, but
      // the host can ignore it and type into the free-text field. The
      // payload still uses the existing-compatible locationText shape.
      fireEvent.changeText(getByLabelText('Run title'), 'Bondi pickup hoops');
      fireEvent.changeText(getByLabelText('Meeting spot'), 'Bondi Court');
      await act(async () => {
        fireEvent.press(getByLabelText('Post run'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('running');
      expect(payload.locationText).toBe('Bondi Court');
    });

    it('basketball: selecting a venue from the picker populates locationText', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-basketball-venue' });
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Basketball'));
      fireEvent.changeText(getByLabelText('Game title'), 'Bondi pickup hoops');
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court, field, or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('basketball');
      // The mock-pick-venue Pressable returns the tennis-tagged seed
      // venue; what matters here is that the venue-derived locationText
      // formatter lands the result in the existing payload field.
      expect(payload.locationText).toBe('Tennis Court Alpha — 1 Beach Rd, Bondi NSW');
    });

    it('basketball: manual venue fallback from the picker populates locationText', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-basketball-manual' });
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Basketball'));
      fireEvent.changeText(getByLabelText('Game title'), 'Driveway hoops');
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court, field, or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.sport).toBe('basketball');
      expect(payload.locationText).toBe('My Backyard Court');
    });

    it('soccer: opens the modal and forwards the soccer sport string', async () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Soccer'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court, field, or venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.isOpen).toBe(true);
        expect(props?.sport).toBe('soccer');
      });
    });

    it('badminton: opens the modal and forwards the badminton sport string', async () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Badminton'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.isOpen).toBe(true);
        expect(props?.sport).toBe('badminton');
      });
    });

    it('forwards enableWiderResults and onSelectManual to the modal', async () => {
      const { getByLabelText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.enableWiderResults).toBe(true);
        expect(typeof props?.onSelectManual).toBe('function');
      });
    });

    it('manual venue from the modal becomes the locationText on submit', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-manual-venue' });
      const navigation = makeNavigation();
      const { getByLabelText, queryByText } = renderCreateBattle({ navigation });
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Tennis at the back court');

      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });

      // No structured selection chip — the typed-text path is in play.
      expect(queryByText('Tennis Court Alpha')).toBeNull();
      // Outer free-text mirrors what the user typed in the modal.
      const locationInput = getByLabelText('Game location');
      expect(locationInput.props.value).toBe('My Backyard Court');

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });

      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      const payload = mockCreateEvent.mock.calls[0][0];
      // Existing backend-compatible field: locationText.
      expect(payload.locationText).toBe('My Backyard Court');
      expect(payload.sport).toBe('tennis');
    });

    it('manual venue overrides a previously selected structured venue', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'event-manual-overrides' });
      const { getByLabelText, queryByText } = renderCreateBattle();
      fireEvent.press(getByLabelText('Select sport Tennis'));
      fireEvent.changeText(getByLabelText('Game title'), 'Tennis hit');

      // First: pick a structured venue.
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      // Then: reopen and use manual fallback — modal closes, chip
      // disappears, free-text input returns with the typed value.
      await act(async () => {
        fireEvent.press(getByLabelText('Clear selected venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Choose court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });
      expect(queryByText('Tennis Court Alpha')).toBeNull();

      await act(async () => {
        fireEvent.press(getByLabelText('Create game'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.locationText).toBe('My Backyard Court');
    });
  });

  // ── Host a run ─────────────────────────────────────────────────────────

  describe('host a run', () => {
    it('sends crew, pinned meeting point, distance and pace band', async () => {
      mockCrews.push({ id: 'c1', name: 'Harbour Crew' });
      mockCreateEvent.mockResolvedValueOnce({ id: 'run-1' });
      const { getByLabelText, getByText } = renderCreateBattle();
      fireEvent.changeText(getByLabelText('Run title'), 'Harbour 10k');
      fireEvent.press(getByLabelText('Crew Harbour Crew'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose park, route, or meeting spot'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.purpose).toBe('meeting-spot');
        expect(typeof props?.onSelectPin).toBe('function');
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-pin'));
      });
      getByText('Pinned on the map');
      fireEvent.changeText(getByLabelText('Meeting spot'), 'Opera House steps');
      fireEvent.changeText(getByLabelText('Run distance in km'), '10');
      fireEvent.changeText(getByLabelText('Fastest pace per km'), '5:00');
      fireEvent.changeText(getByLabelText('Slowest pace per km'), '5:45');
      await act(async () => {
        fireEvent.press(getByLabelText('Post run'));
      });
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          sport: 'running',
          mode: 'casual',
          title: 'Harbour 10k',
          locationText: 'Opera House steps',
          crewId: 'c1',
          meetingLat: -33.85678,
          meetingLng: 151.21534,
          distanceKm: 10,
          paceMinSecPerKm: 300,
          paceMaxSecPerKm: 345,
        })
      );
    });

    it('a picked venue becomes the meeting point', async () => {
      mockCreateEvent.mockResolvedValueOnce({ id: 'run-2' });
      const { getByLabelText } = renderCreateBattle();
      fireEvent.changeText(getByLabelText('Run title'), 'Bondi loop');
      await act(async () => {
        fireEvent.press(getByLabelText('Choose park, route, or meeting spot'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Post run'));
      });
      const payload = mockCreateEvent.mock.calls[0][0];
      expect(payload.meetingLat).toBe(-33.89);
      expect(payload.meetingLng).toBe(151.27);
      expect(payload.locationText).toBe('Tennis Court Alpha — 1 Beach Rd, Bondi NSW');
      expect(payload.crewId).toBeUndefined();
    });

    it('blocks submit on an invalid pace band or distance', async () => {
      const { getByLabelText, getByText } = renderCreateBattle();
      fireEvent.changeText(getByLabelText('Run title'), 'Tempo');
      fireEvent.changeText(getByLabelText('Meeting spot'), 'Park');
      fireEvent.changeText(getByLabelText('Fastest pace per km'), '6:00');
      fireEvent.changeText(getByLabelText('Slowest pace per km'), '5:00');
      getByText('The faster pace must come first.');
      expect(getByLabelText('Post run').props.accessibilityState?.disabled).toBe(true);
      fireEvent.changeText(getByLabelText('Slowest pace per km'), '');
      fireEvent.changeText(getByLabelText('Run distance in km'), '250');
      getByText('Distance must be 0.5–100 km.');
      expect(getByLabelText('Post run').props.accessibilityState?.disabled).toBe(true);
    });

    it('pre-selects the crew passed from a crew screen', () => {
      const { getByLabelText } = renderCreateBattle({
        params: { sport: 'running', crewId: 'c9', crewName: 'Dawn Patrol' },
      });
      expect(getByLabelText('Crew Dawn Patrol').props.accessibilityState).toMatchObject({ selected: true });
    });

    it('opens the date and time sheets', async () => {
      const { getByLabelText, getByRole } = renderCreateBattle();
      await act(async () => {
        fireEvent.press(getByLabelText('Run date'));
      });
      getByRole('header', { name: 'Pick a date' });
      await act(async () => {
        fireEvent.press(getByLabelText('Run time'));
      });
      getByRole('header', { name: 'Start time' });
    });
  });

  // ── Edit (PATCH) ───────────────────────────────────────────────────────

  describe('edit mode', () => {
    beforeEach(() => {
      mockEditing = {
        id: 'e7',
        sport: 'running',
        mode: 'casual',
        title: 'Old title',
        startsAt: '2030-06-01T08:30:00Z',
        locationText: 'Centennial Park gates',
        capacity: 12,
        participantCount: 3,
        description: null,
        crewId: null,
        crewName: null,
        meetingLat: -33.9,
        meetingLng: 151.23,
        distanceKm: 8,
        paceMinSecPerKm: 330,
        paceMaxSecPerKm: 360,
      };
    });

    it('pre-fills the form and PATCHes the event, then goes back', async () => {
      mockUpdateEvent.mockResolvedValueOnce({});
      const navigation = makeNavigation();
      const { getByLabelText, getByText, queryByLabelText } = renderCreateBattle({
        navigation,
        params: { eventId: 'e7' },
      });
      getByText('Edit run');
      expect(queryByLabelText('Select sport Run')).toBeNull();
      expect(getByLabelText('Run title').props.value).toBe('Old title');
      expect(getByLabelText('Run distance in km').props.value).toBe('8');
      expect(getByLabelText('Fastest pace per km').props.value).toBe('5:30');
      fireEvent.changeText(getByLabelText('Run title'), 'New title');
      fireEvent.changeText(getByLabelText('Slowest pace per km'), '');
      await act(async () => {
        fireEvent.press(getByLabelText('Save changes'));
      });
      expect(mockUpdateEvent).toHaveBeenCalledWith(
        'e7',
        expect.objectContaining({
          title: 'New title',
          locationText: 'Centennial Park gates',
          capacity: 12,
          meetingLat: -33.9,
          meetingLng: 151.23,
          distanceKm: 8,
          paceMinSecPerKm: 330,
          paceMaxSecPerKm: null,
          crewId: null,
        })
      );
      expect(mockCreateEvent).not.toHaveBeenCalled();
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });
});
