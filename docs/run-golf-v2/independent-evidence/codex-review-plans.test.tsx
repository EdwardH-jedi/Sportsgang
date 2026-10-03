/**
 * My Plans — merge of 1:1 bookings and group sessions.
 *
 * Covers: pure segmentation (pending never shown as confirmed, explicit
 * source keys), Sydney rendering across the 2026-10-04 DST change on a
 * device in another timezone, partial and full source failure with retry,
 * empty states and navigation targets.
 */

import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { EventSummary } from '@protin/shared-types';

import { api } from '../lib/api';
import type { Session } from '../lib/sessions';
import { buildPlanItems } from '../hooks/usePlans';
import { MyPlansScreen } from '../screens/plans/MyPlansScreen';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) => ReactActual.useEffect(effect, [effect]),
  };
});

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) => selector({ user: { id: 'me' } }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockGet = api.get as jest.Mock;

// 2026-10-01T00:00Z — before the Sydney DST change on Sun 4 Oct 2026.
const NOW = Date.UTC(2026, 9, 1, 0, 0);

function booking(overrides: Partial<Session> = {}): Session {
  return {
    id: 'b1',
    matchId: 'm1',
    proposerId: 'me',
    partnerId: 'alex',
    sport: 'golf',
    startsAt: '2026-10-03T20:30:00Z', // Sun 4 Oct 7:30 am AEDT
    endsAt: '2026-10-03T21:30:00Z',
    location: 'Moore Park Golf',
    status: 'confirmed',
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    partner: { displayName: 'Alex' },
    venue: null,
    ...overrides,
  };
}

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'e1',
    hostUserId: 'me',
    host: { id: 'me', displayName: 'Me' },
    title: 'Sunrise 5k',
    sport: 'running',
    mode: 'casual',
    startsAt: '2026-10-03T14:30:00Z', // Sun 4 Oct 12:30 am AEST (still before 2 am)
    locationText: 'Centennial Park',
    capacity: 8,
    participantCount: 3,
    spotsLeft: 5,
    visibility: 'public',
    status: 'open',
    hasJoined: true,
    description: null,
    runDetails: null,
    golfDetails: null,
    createdAt: '2026-09-20T00:00:00Z',
    updatedAt: '2026-09-20T00:00:00Z',
    ...overrides,
  };
}

function routeApi(bookings: () => Promise<unknown>, events: () => Promise<unknown>) {
  mockGet.mockImplementation((url: string) => {
    if (url.startsWith('/bookings')) return url.includes('segment=upcoming') ? bookings() : Promise.resolve({items:[],total:0});
    if (url.startsWith('/events')) return url.includes('segment=upcoming') ? events() : Promise.resolve({items:[],total:0});
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const ok = (items: unknown[]) => () => Promise.resolve({ items, total: items.length, limit: 50, offset: 0 });
const fail = (msg: string) => () => Promise.reject(new Error(msg));

function renderScreen() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  render(<MyPlansScreen navigation={navigation as never} route={{ key: 'p', name: 'Plans' } as never} />);
  return navigation;
}


function deferred<T>() { let resolve!: (v:T)=>void; let reject!: (e:Error)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(Date,'now').mockReturnValue(NOW);});
afterEach(()=>jest.restoreAllMocks());
it('PROOF: pending Retry removes stale-data notice before source has recovered',async()=>{
 routeApi(ok([booking()]),ok([event()]));renderScreen();await screen.findByTestId('plan-booking:b1');
 routeApi(fail('offline'),ok([event()]));
 const {FlatList}=require('react-native');const list=screen.UNSAFE_getByType(FlatList);
 await act(async()=>list.props.refreshControl.props.onRefresh());
 expect(screen.getByText("Couldn't refresh your 1:1 sessions. Showing what was loaded earlier.")).toBeTruthy();
 const hold=deferred<any>();routeApi(()=>hold.promise,ok([event()]));
 fireEvent.press(screen.getByText('Retry'));
 await act(async()=>{});
 expect(screen.queryByText("Couldn't refresh your 1:1 sessions. Showing what was loaded earlier.")).toBeNull();
 expect(screen.getByTestId('plan-booking:b1')).toBeTruthy();
 await act(async()=>hold.reject(new Error('still offline')));
 expect(screen.getByText("Couldn't refresh your 1:1 sessions. Showing what was loaded earlier.")).toBeTruthy();
});
it('CONTROL: both failed refreshes retain a successful zero-row load with a notice',async()=>{
 routeApi(ok([]),ok([]));renderScreen();await screen.findByTestId('plans-empty-upcoming');
 routeApi(fail('offline'),fail('offline'));
 const {FlatList}=require('react-native');const list=screen.UNSAFE_getByType(FlatList);
 await act(async()=>list.props.refreshControl.props.onRefresh());
 expect(screen.getByText("Couldn't refresh your plans. Showing what was loaded earlier.")).toBeTruthy();
 expect(screen.queryByTestId('plans-error')).toBeNull();
});
