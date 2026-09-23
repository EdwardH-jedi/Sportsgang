/**
 * BookingDetailScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get / api.post)
 *  - apps/mobile/src/lib/calendar (addBookingToCalendar)
 *  - apps/mobile/src/stores/auth (useAuthStore)
 *  - React Navigation (navigation.goBack)
 *  - Screen component
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
    Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
  };
});

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

  it('shows a loading skeleton (with a Back button) while fetching', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByLabelText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    getByLabelText('Loading session');
    getByLabelText('Back');
  });

  it('shows the start time and duration as stats', async () => {
    mockApiGet.mockResolvedValue(makeBooking());
    const { findByLabelText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await findByLabelText('60 min, Duration');
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

  it.each([
    ['running', 'Running'],
    ['tennis', 'Tennis'],
    ['golf', 'Golf'],
    ['gym', 'Gym'],
  ])('labels a %s session as %s (not the old gym/golf-only ternary)', async (sport, label) => {
    mockApiGet.mockResolvedValue(makeBooking({ sport }));
    const { getByText, queryByText } = render(
      <BookingDetailScreen
        route={makeRoute() as any}
        navigation={makeNavigation() as any}
      />
    );
    await waitFor(() => getByText(label));
    if (sport === 'running' || sport === 'tennis') {
      expect(queryByText('Golf')).toBeNull();
    }
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
});
