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



function hold<T>() {let resolve!: (v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function book(id:string,status='proposed',name=`Partner ${id}`){return makeBooking({id,status,partner:{userId:'partner-222',displayName:name}});}
function screen(id:string){return <BookingDetailScreen route={makeRoute(id) as any} navigation={makeNavigation() as any}/>;}
beforeEach(()=>{jest.clearAllMocks();mockApiGet.mockReset();mockApiPost.mockReset();mockUserId='proposer-111';jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>jest.restoreAllMocks());
it('CONTROL A pending -> B resolves -> A resolves keeps B and targets B',async()=>{
 const a=hold<any>(),b=hold<any>();mockApiGet.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
 const u=render(screen('A'));u.rerender(screen('B'));await act(async()=>b.resolve(book('B')));await act(async()=>a.resolve(book('A')));
 expect(u.getByText('Partner B')).toBeTruthy();expect(u.queryByText('Partner A')).toBeNull();mockApiPost.mockResolvedValue(book('B','cancelled'));await act(async()=>fireEvent.press(u.getByText('Cancel')));expect(mockApiPost).toHaveBeenCalledWith('/bookings/B/cancel',{});
});
it('R3 old transition cannot become current on route A -> B -> A',async()=>{
 const transition=hold<any>();mockApiGet.mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('B')).mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockReturnValueOnce(transition.promise);
 const u=render(screen('A'));await u.findByText('Partner A');await act(async()=>{fireEvent.press(u.getByText('Cancel'));});
 u.rerender(screen('B'));await u.findByText('Partner B');u.rerender(screen('A'));await u.findByText('Confirmed');await act(async()=>transition.resolve(book('A','cancelled')));
 expect(mockApiPost).toHaveBeenCalledWith('/bookings/A/cancel',{});expect(u.getByText('Confirmed')).toBeTruthy();expect(u.queryByText('Cancelled')).toBeNull();
});
it('R3 old transition failure cannot alert after account A -> B -> A',async()=>{
 const transition=hold<any>();mockApiGet.mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('A')).mockResolvedValueOnce(book('A'));mockApiPost.mockReturnValueOnce(transition.promise);
 const u=render(screen('A'));await u.findByText('Partner A');await act(async()=>{fireEvent.press(u.getByText('Cancel'));});
 mockUserId='account-b';u.rerender(screen('A'));await act(async()=>{});mockUserId='proposer-111';u.rerender(screen('A'));await act(async()=>{});await act(async()=>transition.reject(new Error('obsolete failure')));
 expect(Alert.alert).not.toHaveBeenCalled();
});
it('R3 old confirmation dialog must expire across A -> B -> A',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed')).mockResolvedValueOnce(book('B','confirmed')).mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockResolvedValue(book('A','no_show'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];
 u.rerender(screen('B'));await u.findByText('Partner B');u.rerender(screen('A'));await u.findByText('Partner A');await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());
 expect(mockApiPost).not.toHaveBeenCalled();
});
it('CONTROL old confirmation dialog sends nothing after route A -> B',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed')).mockResolvedValueOnce(book('B','confirmed'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];
 u.rerender(screen('B'));await u.findByText('Partner B');await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());expect(mockApiPost).not.toHaveBeenCalled();
});
it('R3 confirmation dialog must send nothing after unmount',async()=>{
 mockApiGet.mockResolvedValueOnce(book('A','confirmed'));mockApiPost.mockResolvedValue(book('A','no_show'));
 const u=render(screen('A'));await u.findByText('Partner A');fireEvent.press(u.getByText('Record no-show'));const buttons=(Alert.alert as jest.Mock).mock.calls[0][2];u.unmount();await act(async()=>buttons.find((b:any)=>b.text==='Record no-show').onPress());expect(mockApiPost).not.toHaveBeenCalled();
});
