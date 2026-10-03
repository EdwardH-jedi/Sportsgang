/**
 * MatchesScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get)
 *  - @react-navigation/native (useNavigation)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { MatchesScreen } from '../screens/matches/MatchesScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// ─── Mock navigation ──────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
// Latest focus callback, so a test can simulate returning to the tab.
const mockFocus: { current: null | (() => void | (() => void)) } = { current: null };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // The screen calls useFocusEffect to refetch on tab return; simplest stub
  // is to fire the effect once on mount and treat it as a no-op cleanup.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    mockFocus.current = cb;
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────
// The screen uses `useAuthStore((state) => state.user?.id ?? null)` to
// detect whether the latest message belongs to the current user. Exposed
// via a mutable holder so individual tests can flip the current user id.

let mockCurrentUserId: string | null = 'me-user-id';

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({ user: mockCurrentUserId ? { id: mockCurrentUserId } : null }),
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
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const emptyResponse = { items: [], total: 0, limit: 50, offset: 0 };

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    sport: 'gym',
    status: 'active',
    createdAt: '2026-04-01T10:00:00Z',
    partner: {
      userId: 'partner-111',
      displayName: 'Jordan Lee',
      suburb: 'Newtown',
      sportProfiles: [{ sport: 'gym', level: 'intermediate' }],
    },
    ...overrides,
  };
}

const twoMatches = [
  makeMatch({ id: 'match-1', partner: { userId: 'p1', displayName: 'Jordan Lee', suburb: 'Newtown', sportProfiles: [{ sport: 'gym', level: 'intermediate' }] } }),
  makeMatch({ id: 'match-2', sport: 'golf', partner: { userId: 'p2', displayName: 'Alex Kim', suburb: 'Bondi', sportProfiles: [{ sport: 'golf', level: 'beginner' }] } }),
];

// ─── Tests ────────────────────────────────────────────────────────────────────



function hold<T>() {let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const response={items:[makeMatch()],total:1,limit:50,offset:0};
beforeEach(()=>{jest.clearAllMocks();mockApiGet.mockReset();mockCurrentUserId='me-user-id';});
it('R1/R4 old focus response cannot restore a blocked chat after newer empty list',async()=>{
 const old=hold<any>();mockApiGet.mockResolvedValueOnce(response).mockReturnValueOnce(old.promise).mockResolvedValueOnce(emptyResponse);
 const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');await act(async()=>{mockFocus.current?.();});await act(async()=>{mockFocus.current?.();});await u.findByText('No chats yet');await act(async()=>old.resolve(response));
 expect(u.queryByText('Jordan Lee')).toBeNull();expect(u.getByText('No chats yet')).toBeTruthy();
});
it('R4 retained screen clears matches immediately on owner replacement',async()=>{
 mockApiGet.mockResolvedValueOnce(response);const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');mockCurrentUserId='account-b';u.rerender(<MatchesScreen/>);
 expect(u.queryByText('Jordan Lee')).toBeNull();
});
it('R1 follow-up successful focus refresh recovers initial fetch failure',async()=>{
 mockApiGet.mockRejectedValueOnce(new Error('initial offline')).mockResolvedValueOnce(response);const u=render(<MatchesScreen/>);await u.findByText('initial offline');await act(async()=>{mockFocus.current?.();});
 expect(u.queryByText('initial offline')).toBeNull();expect(u.getByText('Jordan Lee')).toBeTruthy();
});
it('CONTROL first focus fetches once and next focus removes blocked chat',async()=>{
 mockApiGet.mockResolvedValueOnce(response).mockResolvedValueOnce(emptyResponse);const u=render(<MatchesScreen/>);await u.findByText('Jordan Lee');expect(mockApiGet).toHaveBeenCalledTimes(1);await act(async()=>{mockFocus.current?.();});expect(u.getByText('No chats yet')).toBeTruthy();expect(mockApiGet).toHaveBeenCalledTimes(2);
});
