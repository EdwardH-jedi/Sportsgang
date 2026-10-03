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
let mockUserId: string | null = 'proposer-111';

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({ user: mockUserId ? { id: mockUserId, email: 'me@example.com' } : null }),
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

// ─── Route and account binding (review R3) ─────────────────────────────────

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

function bookingFor(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return makeBooking({ id, partner: { userId: `u-${id}`, displayName: name }, ...overrides });
}

describe('BookingDetailScreen binding (review R3)', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'proposer-111';
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  function screenFor(id: string, navigation = makeNavigation()) {
    return <BookingDetailScreen route={makeRoute(id) as any} navigation={navigation as any} />;
  }

  async function pressCancelAndExpect(u: ReturnType<typeof render>, id: string) {
    mockApiPost.mockResolvedValueOnce(bookingFor(id, `Partner ${id}`, { status: 'cancelled' }));
    await act(async () => {
      fireEvent.press(u.getByText('Cancel'));
    });
    expect(mockApiPost).toHaveBeenLastCalledWith(`/bookings/${id}/cancel`, {});
  }

  it('a late response for the previous route never replaces the current booking', async () => {
    const a = deferred<any>();
    const b = deferred<any>();
    mockApiGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const u = render(screenFor('A'));
    u.rerender(screenFor('B'));
    await act(async () => b.resolve(bookingFor('B', 'Partner B')));
    await act(async () => a.resolve(bookingFor('A', 'Partner A')));
    expect(u.getByText('Partner B')).toBeTruthy();
    expect(u.queryByText('Partner A')).toBeNull();
    await pressCancelAndExpect(u, 'B');
  });

  it('the previous route resolving first shows nothing until the current one arrives', async () => {
    const a = deferred<any>();
    const b = deferred<any>();
    mockApiGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const u = render(screenFor('A'));
    u.rerender(screenFor('B'));
    await act(async () => a.resolve(bookingFor('A', 'Partner A')));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(u.queryByText('Cancel')).toBeNull();
    await act(async () => b.resolve(bookingFor('B', 'Partner B')));
    expect(u.getByText('Partner B')).toBeTruthy();
    await pressCancelAndExpect(u, 'B');
  });

  it('clears the previous booking as soon as the route changes', async () => {
    mockApiGet.mockResolvedValueOnce(bookingFor('A', 'Partner A')).mockReturnValueOnce(new Promise(() => {}));
    const u = render(screenFor('A'));
    await u.findByText('Partner A');
    u.rerender(screenFor('B'));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(u.queryByText('Cancel')).toBeNull();
  });

  it('a late rejection for the previous route does not replace the current booking', async () => {
    const a = deferred<any>();
    mockApiGet.mockReturnValueOnce(a.promise).mockResolvedValueOnce(bookingFor('B', 'Partner B'));
    const u = render(screenFor('A'));
    u.rerender(screenFor('B'));
    await u.findByText('Partner B');
    await act(async () => a.reject(new Error('A failed late')));
    expect(u.queryByText('A failed late')).toBeNull();
    expect(u.getByText('Partner B')).toBeTruthy();
  });

  it('repeated retries show only the current route, and a stale retry is dropped', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(new Error('Still offline'));
    const u = render(screenFor('A'));
    await u.findByText('Offline');
    await act(async () => {
      fireEvent.press(u.getByText('Try again'));
    });
    await u.findByText('Still offline');
    const retryA = deferred<any>();
    mockApiGet.mockReturnValueOnce(retryA.promise).mockResolvedValueOnce(bookingFor('B', 'Partner B'));
    await act(async () => {
      fireEvent.press(u.getByText('Try again'));
    });
    u.rerender(screenFor('B'));
    await u.findByText('Partner B');
    await act(async () => retryA.resolve(bookingFor('A', 'Partner A')));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(mockApiGet.mock.calls.map((c) => c[0])).toEqual([
      '/bookings/A',
      '/bookings/A',
      '/bookings/A',
      '/bookings/B',
    ]);
    await pressCancelAndExpect(u, 'B');
  });

  it('a transition that finishes after the route changed is not applied or alerted', async () => {
    mockApiGet.mockResolvedValueOnce(bookingFor('A', 'Partner A')).mockResolvedValueOnce(bookingFor('B', 'Partner B'));
    const cancelA = deferred<any>();
    mockApiPost.mockReturnValueOnce(cancelA.promise);
    const u = render(screenFor('A'));
    await u.findByText('Partner A');
    await act(async () => {
      fireEvent.press(u.getByText('Cancel'));
    });
    expect(mockApiPost).toHaveBeenLastCalledWith('/bookings/A/cancel', {});
    u.rerender(screenFor('B'));
    await u.findByText('Partner B');
    await act(async () => cancelA.resolve(bookingFor('A', 'Partner A', { status: 'cancelled' })));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(u.getByText('Awaiting confirmation')).toBeTruthy();
    // B is actionable straight away; A's pending request does not block it.
    await pressCancelAndExpect(u, 'B');

    const failA = deferred<any>();
    mockApiGet.mockResolvedValueOnce(bookingFor('A', 'Partner A'));
    mockApiPost.mockReturnValueOnce(failA.promise);
    u.rerender(screenFor('A'));
    await u.findByText('Partner A');
    await act(async () => {
      fireEvent.press(u.getByText('Cancel'));
    });
    u.unmount();
    await act(async () => failA.reject(new Error('late failure')));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a double tap sends one transition', async () => {
    mockApiGet.mockResolvedValueOnce(bookingFor('B', 'Partner B'));
    mockApiPost.mockReturnValueOnce(new Promise(() => {}));
    const u = render(screenFor('B'));
    await u.findByText('Partner B');
    const cancel = u.getByText('Cancel');
    await act(async () => {
      fireEvent.press(cancel);
      fireEvent.press(cancel);
    });
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it('another account never sees the previous account’s booking', async () => {
    const forUser2 = deferred<any>();
    mockApiGet.mockResolvedValueOnce(bookingFor('A', 'Partner A')).mockReturnValueOnce(forUser2.promise);
    const u = render(screenFor('A'));
    await u.findByText('Partner A');
    mockUserId = 'someone-else';
    u.rerender(screenFor('A'));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    await act(async () => forUser2.reject(new Error('Booking not found')));
    expect(u.getByText('Booking not found')).toBeTruthy();
    expect(u.queryByText('Cancel')).toBeNull();
  });

  it('logging out hides the booking and fetches nothing', async () => {
    mockApiGet.mockResolvedValueOnce(bookingFor('A', 'Partner A'));
    const u = render(screenFor('A'));
    await u.findByText('Partner A');
    mockUserId = null;
    u.rerender(screenFor('A'));
    expect(u.queryByText('Partner A')).toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('a late response after unmount changes nothing', async () => {
    const a = deferred<any>();
    mockApiGet.mockReturnValueOnce(a.promise);
    const u = render(screenFor('A'));
    u.unmount();
    await act(async () => a.resolve(bookingFor('A', 'Partner A')));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('a 404 or 403 shows the error with no actions', async () => {
    for (const message of ['Booking not found', 'Not a participant']) {
      mockApiGet.mockRejectedValueOnce(new Error(message));
      const u = render(screenFor('A'));
      expect(await u.findByText(message)).toBeTruthy();
      expect(u.queryByText('Cancel')).toBeNull();
      expect(u.getByLabelText('Back')).toBeTruthy();
      u.unmount();
    }
  });

  it('a payload for a different booking is treated as not found', async () => {
    mockApiGet.mockResolvedValueOnce(bookingFor('Z', 'Partner Z'));
    const u = render(screenFor('A'));
    expect(await u.findByText('Booking not found.')).toBeTruthy();
    expect(u.queryByText('Partner Z')).toBeNull();
  });
});
