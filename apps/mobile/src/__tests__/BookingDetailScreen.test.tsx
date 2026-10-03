/**
 * BookingDetailScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get / api.post)
 *  - apps/mobile/src/lib/calendar (addBookingToCalendar)
 *  - apps/mobile/src/stores/auth (useAuthStore)
 *  - React Navigation (navigation.goBack)
 *  - Screen component
 *  - theme
 *  - react-native Alert
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// ─── Mock calendar lib ────────────────────────────────────────────────────────

const mockAddBookingToCalendar = jest.fn();

jest.mock('../lib/calendar', () => ({
  addBookingToCalendar: (...args: unknown[]) => mockAddBookingToCalendar(...args),
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────

// Default: current user is the proposer
let mockUserId = 'proposer-111';

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: { id: mockUserId, email: 'me@example.com' } }),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000',
    brand: '#000',
    border: '#ccc',
    surface: '#fff',
    surfaceElevated: '#f5f5f5',
    background: '#fafafa',
    separator: '#e0e0e0',
    textPrimary: '#000',
    textSecondary: '#555',
    textTertiary: '#888',
    textInverse: '#fff',
    success: '#0f0',
    error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48,
  },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation() {
  return { goBack: jest.fn(), navigate: jest.fn() };
}

function makeRoute(bookingId = 'booking-abc') {
  return { params: { bookingId } };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-abc',
    matchId: 'match-1',
    proposerId: 'proposer-111',
    partnerId: 'partner-222',
    sport: 'gym',
    startsAt: '2026-04-10T09:00:00Z',
    endsAt: '2026-04-10T10:00:00Z',
    location: 'City Gym, Sydney CBD',
    notes: 'Bring your towel.',
    status: 'proposed',
    createdAt: '2026-04-08T08:00:00Z',
    updatedAt: '2026-04-08T08:00:00Z',
    partner: {
      userId: 'partner-222',
      displayName: 'Jordan Lee',
      suburb: 'Newtown',
    },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BookingDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'proposer-111';
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while fetching', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message when the API fails', async () => {
    mockApiGet.mockRejectedValue(new Error('Not found'));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Not found'));
  });

  it('keeps Back and a working retry when the booking cannot be loaded', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Cannot reach the server'));
    const navigation = makeNavigation();
    const { getByText, getByLabelText, findByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={navigation as any}
      />
    );
    await findByText('Cannot reach the server');

    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);

    mockApiGet.mockResolvedValueOnce(makeBooking());
    fireEvent.press(getByText('Try again'));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(() => getByText('Cannot reach the server')).toThrow());
  });

  // ── Detail display ─────────────────────────────────────────────────────────

  it('renders booking details after a successful fetch', async () => {
    mockApiGet.mockResolvedValue(makeBooking());
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => {
      getByText('Jordan Lee');
      getByText('Gym');
      getByText('City Gym, Sydney CBD');
      getByText('Bring your towel.');
    });
  });

  it('displays the correct status label for "proposed"', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'proposed' }));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Awaiting confirmation'));
  });

  it('displays the correct status label for "confirmed"', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Confirmed'));
  });

  it('displays the correct status label for "cancelled"', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Cancelled'));
  });

  // ── Proposer — proposed status ─────────────────────────────────────────────

  it('shows only Cancel for the proposer when status is proposed', async () => {
    mockUserId = 'proposer-111';
    mockApiGet.mockResolvedValue(makeBooking({ status: 'proposed' }));
    const { getByText, queryByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Cancel'));
    expect(queryByText('Confirm')).toBeNull();
    expect(queryByText('Decline')).toBeNull();
  });

  // ── Partner (receiver) — proposed status ───────────────────────────────────

  it('shows Confirm, Decline, and Cancel for the non-proposer when status is proposed', async () => {
    mockUserId = 'partner-222'; // receiver
    mockApiGet.mockResolvedValue(makeBooking({ status: 'proposed' }));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => {
      getByText('Confirm');
      getByText('Decline');
      getByText('Cancel');
    });
  });

  // ── Confirmed status actions ───────────────────────────────────────────────

  it('shows Mark completed, Record no-show, and Cancel when confirmed', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => {
      getByText('Mark completed');
      getByText('Record no-show');
      getByText('Cancel');
    });
  });

  // ── Add to Calendar is hidden in v1 ──────────────────────────────────────

  it('does not expose an Add to Calendar control in v1', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    const { queryByText, getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Confirmed'));
    expect(queryByText('Add to Calendar')).toBeNull();
  });

  // ── State transitions ──────────────────────────────────────────────────────

  it('calls the correct API endpoint and updates state when Confirm is pressed', async () => {
    mockUserId = 'partner-222';
    const proposed = makeBooking({ status: 'proposed' });
    const confirmed = makeBooking({ status: 'confirmed' });
    mockApiGet.mockResolvedValue(proposed);
    mockApiPost.mockResolvedValue(confirmed);

    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Confirm'));
    await act(async () => {
      fireEvent.press(getByText('Confirm'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings/booking-abc/confirm', {});
    await waitFor(() => getByText('Confirmed'));
  });

  it('calls the correct API endpoint when Cancel is pressed', async () => {
    mockUserId = 'proposer-111';
    const proposed = makeBooking({ status: 'proposed' });
    const cancelled = makeBooking({ status: 'cancelled' });
    mockApiGet.mockResolvedValue(proposed);
    mockApiPost.mockResolvedValue(cancelled);

    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Cancel'));
    await act(async () => {
      fireEvent.press(getByText('Cancel'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/bookings/booking-abc/cancel', {});
    await waitFor(() => getByText('Cancelled'));
  });

  it('shows an Alert when a transition API call fails', async () => {
    mockUserId = 'proposer-111';
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockApiGet.mockResolvedValue(makeBooking({ status: 'proposed' }));
    mockApiPost.mockRejectedValue(new Error('Forbidden'));

    const { getByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText('Cancel'));
    await act(async () => {
      fireEvent.press(getByText('Cancel'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Forbidden');
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when the Back button is pressed', async () => {
    mockApiGet.mockResolvedValue(makeBooking());
    const navigation = makeNavigation();
    const { getByLabelText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={navigation as any}
      />
    );
    await waitFor(() => getByLabelText('Back'));
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  // ── Terminal statuses — no action buttons ──────────────────────────────────

  it('renders no action buttons when status is completed', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ status: 'completed' }));
    const { queryByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => queryByText('Completed'));
    expect(queryByText('Confirm')).toBeNull();
    expect(queryByText('Decline')).toBeNull();
    expect(queryByText('Mark completed')).toBeNull();
  });

  // ── Sport label (review F7) ────────────────────────────────────────────────

  it.each([
    ['running', 'Running'],
    ['tennis', 'Tennis'],
    ['golf', 'Golf'],
    ['gym', 'Gym'],
  ])('labels a %s booking as %s', async (sport, label) => {
    mockApiGet.mockResolvedValue(makeBooking({ sport }));
    const { findByText, queryByText } = render(
      <BookingDetailScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(await findByText(label)).toBeTruthy();
    for (const other of ['Running', 'Tennis', 'Golf', 'Gym'].filter((l) => l !== label)) {
      expect(queryByText(other)).toBeNull();
    }
  });

  it('shows an unexpected legacy sport honestly instead of guessing Golf', async () => {
    mockApiGet.mockResolvedValue(makeBooking({ sport: 'pickleball' }));
    const { findByText, queryByText } = render(
      <BookingDetailScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(await findByText('Pickleball')).toBeTruthy();
    expect(queryByText('Golf')).toBeNull();
  });

  // ── Time display (review F5) ──────────────────────────────────────────────

  it('shows the stored instant in Sydney time with the timezone named', async () => {
    // 2026-04-10 09:00Z is 7:00 pm AEST (DST ended 5 Apr 2026).
    mockApiGet.mockResolvedValue(makeBooking({ sport: 'running' }));
    const { findByText, getByText } = render(
      <BookingDetailScreen route={makeRoute() as any} navigation={makeNavigation() as any} />
    );
    expect(await findByText('Fri 10 Apr · 7:00 pm')).toBeTruthy();
    expect(getByText('Fri 10 Apr · 8:00 pm')).toBeTruthy();
    expect(getByText('Times are Sydney time')).toBeTruthy();
  });
});
