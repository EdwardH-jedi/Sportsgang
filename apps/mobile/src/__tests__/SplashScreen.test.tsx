/**
 * SplashScreen tests
 *
 * Routing contract under test:
 *   - no token                      → AuthEntry
 *   - token, profile fetch fails    → OnboardingStep1 (treats 404 / network
 *                                     failure as "needs onboarding")
 *   - token, profile loaded but
 *     Step 1 fields missing         → OnboardingStep1
 *   - token, Step 1 complete        → Main
 *
 * Mocks:
 *  - stores/auth (useAuthStore.getState)
 *  - stores/profile (useProfileStore.getState)
 *  - expo-status-bar (the native StatusBar schedules updates that never
 *    flush under fake timers)
 *  - theme
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

import { SplashScreen } from '../screens/SplashScreen';

// ─── Mock expo-status-bar ─────────────────────────────────────────────────────

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockInitialize = jest.fn();
const mockAuthGetState = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: Object.assign(jest.fn(() => ({})), {
    getState: (...args: unknown[]) => mockAuthGetState(...args),
  }),
}));

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockFetchProfile = jest.fn();
const mockProfileGetState = jest.fn();

jest.mock('../stores/profile', () => ({
  useProfileStore: Object.assign(jest.fn(() => ({})), {
    getState: (...args: unknown[]) => mockProfileGetState(...args),
  }),
}));

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', border: '#ccc', surface: '#fff',
    surfaceElevated: '#f5f5f5', background: '#fafafa', separator: '#e0e0e0',
    textPrimary: '#000', textSecondary: '#555', textTertiary: '#888',
    textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h1: {}, h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function flushSplash() {
  // The SplashScreen waits on Promise.all([init, 1100ms timer]) and then a
  // chained .then() that runs an async profile fetch. Drain microtasks
  // generously to cover both arms of the chain.
  await act(async () => {
    jest.advanceTimersByTime(1100);
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  });
}

function completeStep1Profile() {
  return {
    id: 'p1',
    userId: 'u1',
    displayName: 'Jordan Lee',
    birthYear: 1990,
    suburb: 'Newtown',
    avatarUrl: undefined,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SplashScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the SPORTSGANG wordmark', () => {
    mockAuthGetState.mockReturnValue({
      initialize: jest.fn().mockResolvedValue(undefined),
      token: null,
    });
    const nav = { replace: jest.fn() };
    const { getByText } = render(
      <SplashScreen navigation={nav as any} route={{} as any} />
    );
    getByText('SPORTSGANG');
  });

  it('navigates to AuthEntry when no token is found after init', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockAuthGetState.mockReturnValue({ initialize: mockInitialize, token: null });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await flushSplash();

    expect(nav.replace).toHaveBeenCalledWith('AuthEntry');
  });

  it('navigates to Main when token is present and Step 1 profile fields are complete', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockAuthGetState
      .mockReturnValueOnce({ initialize: mockInitialize, token: null })
      .mockReturnValueOnce({ initialize: mockInitialize, token: 'valid-token' });
    mockFetchProfile.mockResolvedValue(undefined);
    mockProfileGetState.mockReturnValue({
      fetchProfile: mockFetchProfile,
      profile: completeStep1Profile(),
    });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await flushSplash();

    expect(mockFetchProfile).toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('Main');
  });

  it('navigates to OnboardingStep1 when token is present but profile fetch fails (404 etc.)', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockAuthGetState
      .mockReturnValueOnce({ initialize: mockInitialize, token: null })
      .mockReturnValueOnce({ initialize: mockInitialize, token: 'valid-token' });
    mockFetchProfile.mockRejectedValue(new Error('Profile not found'));
    mockProfileGetState.mockReturnValue({
      fetchProfile: mockFetchProfile,
      profile: null,
    });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await flushSplash();

    expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
  });

  it('navigates to OnboardingStep1 when token is present but display_name is blank', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockAuthGetState
      .mockReturnValueOnce({ initialize: mockInitialize, token: null })
      .mockReturnValueOnce({ initialize: mockInitialize, token: 'valid-token' });
    mockFetchProfile.mockResolvedValue(undefined);
    mockProfileGetState.mockReturnValue({
      fetchProfile: mockFetchProfile,
      profile: { ...completeStep1Profile(), displayName: '   ' },
    });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await flushSplash();

    expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
  });

  it('navigates to OnboardingStep1 when token is present but birthYear/suburb are missing', async () => {
    mockInitialize.mockResolvedValue(undefined);
    mockAuthGetState
      .mockReturnValueOnce({ initialize: mockInitialize, token: null })
      .mockReturnValueOnce({ initialize: mockInitialize, token: 'valid-token' });
    mockFetchProfile.mockResolvedValue(undefined);
    mockProfileGetState.mockReturnValue({
      fetchProfile: mockFetchProfile,
      profile: { ...completeStep1Profile(), birthYear: null, suburb: null },
    });

    const nav = { replace: jest.fn() };
    render(<SplashScreen navigation={nav as any} route={{} as any} />);

    await flushSplash();

    expect(nav.replace).toHaveBeenCalledWith('OnboardingStep1');
  });
});
