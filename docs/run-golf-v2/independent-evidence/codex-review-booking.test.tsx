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


function deferred<T>() { let resolve!: (v:T)=>void; let reject!: (e:Error)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
beforeEach(()=>{jest.clearAllMocks();mockUserId='proposer-111';});
it('PROOF: late route A success replaces the already loaded route B booking',async()=>{
 const a=deferred<any>();const b=deferred<any>();mockApiGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const n=makeNavigation();const u=render(<BookingDetailScreen route={makeRoute('A') as any} navigation={n as any}/>);
 u.rerender(<BookingDetailScreen route={makeRoute('B') as any} navigation={n as any}/>);
 await act(async()=>b.resolve(makeBooking({id:'B',partner:{displayName:'Partner B'}})));
 expect(u.getByText('Partner B')).toBeTruthy();
 await act(async()=>a.resolve(makeBooking({id:'A',partner:{displayName:'Partner A'}})));
 expect(u.getByText('Partner A')).toBeTruthy(); expect(u.queryByText('Partner B')).toBeNull();
 mockApiPost.mockResolvedValue(makeBooking({id:'B',status:'cancelled',partner:{displayName:'Partner B'}}));
 await act(async()=>fireEvent.press(u.getByText('Cancel')));
 expect(mockApiPost).toHaveBeenCalledWith('/bookings/B/cancel',{});
});
it('CONTROL: failed route B hides route A and shows its error state',async()=>{
 mockApiGet.mockResolvedValueOnce(makeBooking({id:'A',partner:{displayName:'Partner A'}})).mockRejectedValueOnce(new Error('Booking not found'));
 const n=makeNavigation();const u=render(<BookingDetailScreen route={makeRoute('A') as any} navigation={n as any}/>);
 await u.findByText('Partner A');
 u.rerender(<BookingDetailScreen route={makeRoute('B') as any} navigation={n as any}/>);
 await waitFor(()=>expect(mockApiGet).toHaveBeenCalledTimes(2));
 await act(async()=>{});
 expect(u.queryByText('Partner A')).toBeNull();expect(u.getByText('Booking not found')).toBeTruthy();
});
it('CONTROL: initial failure and successful retry display the correct route',async()=>{
 mockApiGet.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(makeBooking({partner:{displayName:'Partner B'}}));
 const u=render(<BookingDetailScreen route={makeRoute('B') as any} navigation={makeNavigation() as any}/>);
 await u.findByText('Offline'); expect(u.getByLabelText('Back')).toBeTruthy();
 await act(async()=>fireEvent.press(u.getByText('Try again')));expect(await u.findByText('Partner B')).toBeTruthy();
});
