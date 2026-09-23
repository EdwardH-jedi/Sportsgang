/**
 * BookingComposerScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.post)
 *  - React Navigation (navigation.goBack, navigation.replace)
 *  - Screen component
 *  - NearbyCourtsModal (stub that exposes a single "pick venue" Pressable)
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { BookingComposerScreen } from '../screens/bookings/BookingComposerScreen';
import {
  defaultDate,
  defaultStartTime,
  formatDateLabel,
  formatTimeLabel,
  plusOneHour,
} from '../lib/sessionTime';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
  };
});

// ─── Mock NearbyCourtsModal ──────────────────────────────────────────────────

// Captures the latest props the composer passes into the modal so the
// venue-picker integration tests can assert that coordinates + status
// flow through from useVenueLocation.
const mockNearbyModalProps = jest.fn();

jest.mock('../screens/bookings/NearbyCourtsModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    NearbyCourtsModal: (props: any) => {
      mockNearbyModalProps(props);
      const { isOpen, onSelect, onSelectManual, onClose } = props;
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
                latitude: 0,
                longitude: 0,
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
              // Simulates the user typing a court into the modal's
              // bottom manual fallback and confirming.
              onSelectManual?.('Hidden Garage Court');
              onClose();
            }}
          >
            <Text>pick mock manual</Text>
          </Pressable>
        </View>
      );
    },
  };
});

// ─── Mock expo-location ───────────────────────────────────────────────────────

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { Balanced: 3 },
}));

const Location = require('expo-location') as {
  getForegroundPermissionsAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
};

function mockLocationGranted(latitude = -33.89, longitude = 151.27) {
  Location.getForegroundPermissionsAsync.mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  });
  Location.getCurrentPositionAsync.mockResolvedValue({
    coords: { latitude, longitude, altitude: 0, accuracy: 5, heading: 0, speed: 0 },
    timestamp: 1_700_000_000_000,
  });
}

function mockLocationDeniedHard() {
  Location.getForegroundPermissionsAsync.mockResolvedValue({
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  });
}

function mockLocationUndeterminedThenDenied() {
  Location.getForegroundPermissionsAsync.mockResolvedValue({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  });
  Location.requestForegroundPermissionsAsync.mockResolvedValue({
    status: 'denied',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return {
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    params: {
      matchId: 'match-abc',
      sport: 'gym',
      ...overrides,
    },
  };
}

function renderComposer(opts: { route?: any; navigation?: any } = {}) {
  const navigation = opts.navigation ?? makeNavigation();
  const route = opts.route ?? makeRoute();
  const utils = render(
    <BookingComposerScreen route={route as any} navigation={navigation as any} />
  );
  return { ...utils, navigation, route };
}

/** Default startsAt the screen sends when the user submits without touching the pickers. */
function expectedStartsAt(): string {
  return `${defaultDate()}T${defaultStartTime()}:00`;
}

/** Default endsAt — start + 1 hour. */
function expectedEndsAt(): string {
  return `${defaultDate()}T${plusOneHour(defaultStartTime())}:00`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Drive the wheel-based time picker:
 *   1. open the picker
 *   2. tap the requested hour row
 *   3. tap the requested minute row (if not 00)
 *   4. tap Done — the modal commits the draft to the parent.
 */
function pickTime(
  getByLabelText: (label: string) => any,
  field: 'start' | 'end',
  hour: number,
  minute: number
) {
  const fieldTitle = field === 'start' ? 'Start time' : 'End time';
  fireEvent.press(getByLabelText(field === 'start' ? 'Choose start time' : 'Choose end time'));
  fireEvent.press(getByLabelText(`Set hour ${pad2(hour)}`));
  // Minute wheel default is 00 after the hour spin (`safeMinute` = 0); only
  // tap the minute row when we want a non-zero minute, to avoid the
  // already-selected-row no-op.
  if (minute !== 0) {
    fireEvent.press(getByLabelText(`Set minute ${pad2(minute)}`));
  }
  fireEvent.press(getByLabelText(`Close ${fieldTitle.toLowerCase()} picker`));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BookingComposerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the header title', () => {
    const { getByText } = renderComposer();
    expect(getByText('Propose a session')).toBeTruthy();
  });

  it('renders date + start + end as tappable selectors with friendly defaults', () => {
    const { getByLabelText, getByText } = renderComposer();
    expect(getByLabelText('Choose date')).toBeTruthy();
    expect(getByLabelText('Choose start time')).toBeTruthy();
    expect(getByLabelText('Choose end time')).toBeTruthy();
    // Friendly default labels: tomorrow + 09:00 → 10:00 in the local locale.
    expect(getByText(formatDateLabel(defaultDate()))).toBeTruthy();
    expect(getByText(formatTimeLabel(defaultStartTime()))).toBeTruthy();
    expect(getByText(formatTimeLabel(plusOneHour(defaultStartTime())))).toBeTruthy();
  });

  it('renders the optional venue + notes inputs', () => {
    const { getByPlaceholderText } = renderComposer();
    expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
    expect(getByPlaceholderText('Anything your partner should know…')).toBeTruthy();
  });

  // ── canSubmit / defaults ──────────────────────────────────────────────────

  it('Send proposal is enabled out of the box thanks to valid defaults', () => {
    const { getByLabelText } = renderComposer();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(false);
  });

  // ── Successful submission ──────────────────────────────────────────────────

  it('submits the default date + time when nothing is changed (freeform location, no venue)', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByLabelText, getByPlaceholderText } = renderComposer({ navigation });
    fireEvent.changeText(
      getByPlaceholderText('Or type a location, e.g. Bondi gym'),
      'City Gym'
    );
    fireEvent.changeText(getByPlaceholderText('Anything your partner should know…'), 'Bring towel');

    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings', {
      matchId: 'match-abc',
      sport: 'gym',
      startsAt: expectedStartsAt(),
      endsAt: expectedEndsAt(),
      location: 'City Gym',
      venueId: undefined,
      notes: 'Bring towel',
    });
  });

  it('omits location and notes when left empty', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const { getByLabelText } = renderComposer();
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(mockApiPost).toHaveBeenCalledWith('/bookings', expect.objectContaining({
      location: undefined,
      notes: undefined,
    }));
  });

  it('navigates to BookingDetail with the returned booking id on success', async () => {
    mockApiPost.mockResolvedValue({ id: 'new-booking-id' });
    const navigation = makeNavigation();
    const { getByLabelText } = renderComposer({ navigation });
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(navigation.replace).toHaveBeenCalledWith('BookingDetail', { bookingId: 'new-booking-id' });
  });

  it('shows ActivityIndicator while submitting', async () => {
    let resolve!: (v: unknown) => void;
    mockApiPost.mockReturnValue(new Promise((res) => { resolve = res; }));
    const { getByLabelText, UNSAFE_queryAllByType } = renderComposer();
    act(() => { fireEvent.press(getByLabelText('Send proposal')); });

    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    await act(async () => { resolve({ id: 'x' }); });
  });

  // ── Picker interaction ────────────────────────────────────────────────────

  it('changing start time auto-shifts end time when end would become invalid', async () => {
    mockApiPost.mockResolvedValue({ id: 'b1' });
    const { getByLabelText, getByText } = renderComposer();

    // Move start to 23:00. Default end was 10:00 — auto-shift should push
    // end to 23:00 + 1h, clamped to 23:45 by the same-day rule.
    pickTime(getByLabelText, 'start', 23, 0);

    expect(getByText(formatTimeLabel('23:00'))).toBeTruthy();
    expect(getByText(formatTimeLabel('23:45'))).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/bookings',
      expect.objectContaining({
        startsAt: `${defaultDate()}T23:00:00`,
        endsAt: `${defaultDate()}T23:45:00`,
      })
    );
  });

  it('selecting an end time before start time disables Send and shows a friendly inline error', () => {
    const { getByLabelText, getByText } = renderComposer();
    // Default start = 09:00, end = 10:00. Move end to 08:00 (before start).
    pickTime(getByLabelText, 'end', 8, 0);

    expect(getByText('End time must be later than start time.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('rejects an end time that creates a session longer than 4 hours', () => {
    const { getByLabelText, getByText } = renderComposer();
    // 09:00 → 14:00 = 5 hours.
    pickTime(getByLabelText, 'end', 14, 0);
    expect(getByText('Sessions can be up to 4 hours long.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('rejects an end time that creates a session shorter than 30 minutes', () => {
    const { getByLabelText, getByText } = renderComposer();
    // 09:00 → 09:15 = 15 minutes.
    pickTime(getByLabelText, 'end', 9, 15);
    expect(getByText('Sessions must be at least 30 minutes long.')).toBeTruthy();
    expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(true);
  });

  it('opens a calendar grid for date selection (no manual text entry)', () => {
    const { getByLabelText, queryByPlaceholderText } = renderComposer();
    // The previous freeform "2026-04-15" placeholder is gone — the date
    // field is now a tappable selector that opens a calendar modal.
    expect(queryByPlaceholderText('2026-04-15')).toBeNull();
    fireEvent.press(getByLabelText('Choose date'));
    // Calendar modal exposes month-nav buttons.
    expect(getByLabelText('Next month')).toBeTruthy();
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  it('maps a backend "starts_at in the past" error to a friendly message', async () => {
    mockApiPost.mockRejectedValue(new Error('starts_at cannot be more than 1 hour in the past'));
    const { getByLabelText, findByText } = renderComposer();
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText('Choose a future start time.');
  });

  it('maps a backend overlap error to a friendly message', async () => {
    mockApiPost.mockRejectedValue(new Error('Booking overlap'));
    const { getByLabelText, findByText } = renderComposer();
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText('You already have a session at this time.');
  });

  it('falls back to a generic friendly message for unknown backend errors', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByLabelText, findByText } = renderComposer();
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await findByText("Couldn't propose this session. Please try again.");
  });

  it('does not navigate when api.post rejects', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const navigation = makeNavigation();
    const { getByLabelText } = renderComposer({ navigation });
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('re-enables Send proposal after an error so the user can retry', async () => {
    mockApiPost.mockRejectedValue(new Error('Server error'));
    const { getByLabelText } = renderComposer();
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    await waitFor(() => {
      expect(getByLabelText('Send proposal').props.accessibilityState?.disabled).toBe(false);
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when the Back button is pressed', () => {
    const navigation = makeNavigation();
    const { getByLabelText } = renderComposer({ navigation });
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  // ── Venue picker integration ───────────────────────────────────────────────

  describe('venue picker', () => {
    it('shows the Find a court CTA when no venue is selected', () => {
      const { getByLabelText } = renderComposer();
      expect(getByLabelText('Choose a court or venue')).toBeTruthy();
    });

    it('selecting a venue replaces the freeform input with a chip', async () => {
      const { getByLabelText, getByText, queryByPlaceholderText } = renderComposer();
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      expect(queryByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeNull();
      expect(getByText('Tennis Court Alpha')).toBeTruthy();
      expect(getByLabelText('Clear selected court')).toBeTruthy();
    });

    it('sends venueId AND a venue-derived location when a venue is picked', async () => {
      mockApiPost.mockResolvedValue({ id: 'booking-with-venue' });
      const { getByLabelText } = renderComposer();
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('Send proposal'));
      });
      expect(mockApiPost).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({
          venueId: 'venue-1',
          location: 'Tennis Court Alpha — Bondi',
        })
      );
    });

    it('Change clears the selected venue back to the freeform field', async () => {
      const { getByLabelText, getByPlaceholderText } = renderComposer();
      fireEvent.press(getByLabelText('Choose a court or venue'));
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      fireEvent.press(getByLabelText('Clear selected court'));
      expect(getByPlaceholderText('Or type a location, e.g. Bondi gym')).toBeTruthy();
    });

    // ── Location wiring ──────────────────────────────────────────────────────

    it('does not request location permission while the picker stays closed', () => {
      mockLocationGranted();
      renderComposer();
      expect(Location.getForegroundPermissionsAsync).not.toHaveBeenCalled();
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('passes coordinates into NearbyCourtsModal when location is granted', async () => {
      mockLocationGranted(-33.89, 151.27);
      const { getByLabelText } = renderComposer();
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      // Wait for the hook's async chain to settle so the granted-path
      // props land on the modal.
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.isOpen).toBe(true);
        expect(props?.lat).toBeCloseTo(-33.89);
        expect(props?.lng).toBeCloseTo(151.27);
        expect(props?.locationStatus).toBe('granted');
      });
    });

    it('passes denied status and no coords when permission is hard-denied', async () => {
      mockLocationDeniedHard();
      const { getByLabelText } = renderComposer();
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.locationStatus).toBe('denied');
        expect(props?.lat).toBeUndefined();
        expect(props?.lng).toBeUndefined();
      });
      // A hard-denied user must never be re-prompted.
      expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    });

    it('prompts once when status is undetermined and reports denied if the user refuses', async () => {
      mockLocationUndeterminedThenDenied();
      const { getByLabelText } = renderComposer();
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await waitFor(() => {
        expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.locationStatus).toBe('denied');
      });
    });

    // ── Wider results + manual fallback (parity with Battle picker UX) ─

    it('forwards enableWiderResults and onSelectManual to the modal', async () => {
      const { getByLabelText } = renderComposer();
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await waitFor(() => {
        const props = mockNearbyModalProps.mock.calls.at(-1)?.[0];
        expect(props?.enableWiderResults).toBe(true);
        expect(typeof props?.onSelectManual).toBe('function');
      });
    });

    it('manual venue from the modal becomes the booking location (no venueId)', async () => {
      mockApiPost.mockResolvedValue({ id: 'booking-manual-venue' });
      const { getByLabelText, queryByText } = renderComposer();
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });

      // No structured chip — typed path is in play.
      expect(queryByText('Tennis Court Alpha')).toBeNull();

      await act(async () => {
        fireEvent.press(getByLabelText('Send proposal'));
      });

      expect(mockApiPost).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({
          location: 'Hidden Garage Court',
          // Clearing selectedVenue must also clear the structured
          // venueId — otherwise we'd ship a manual string with a
          // stale venue link.
          venueId: undefined,
        })
      );
    });

    it('manual venue overrides a previously selected structured venue', async () => {
      mockApiPost.mockResolvedValue({ id: 'booking-manual-overrides' });
      const { getByLabelText, queryByText } = renderComposer();
      // Step 1: select a structured venue.
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-venue'));
      });
      // Step 2: clear it and reopen the picker, then pick manual.
      fireEvent.press(getByLabelText('Clear selected court'));
      await act(async () => {
        fireEvent.press(getByLabelText('Choose a court or venue'));
      });
      await act(async () => {
        fireEvent.press(getByLabelText('mock-pick-manual'));
      });
      expect(queryByText('Tennis Court Alpha')).toBeNull();

      await act(async () => {
        fireEvent.press(getByLabelText('Send proposal'));
      });

      expect(mockApiPost).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({
          location: 'Hidden Garage Court',
          venueId: undefined,
        })
      );
    });
  });

  // ── Sport passed through ───────────────────────────────────────────────────

  it('passes the sport from route params to the API call', async () => {
    mockApiPost.mockResolvedValue({ id: 'booking-golf' });
    const { getByLabelText } = renderComposer({ route: makeRoute({ sport: 'golf' }) });
    await act(async () => {
      fireEvent.press(getByLabelText('Send proposal'));
    });
    expect(mockApiPost).toHaveBeenCalledWith('/bookings', expect.objectContaining({ sport: 'golf' }));
  });
});
