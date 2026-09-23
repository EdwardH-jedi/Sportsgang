/**
 * ProfileScreen tests
 *
 * Mocks:
 *  - ../stores/auth   (useAuthStore → logout)
 *  - ../stores/profile (useProfileStore → profile, sportProfiles, fetchProfile)
 *  - ../lib/api       (api.get, api.delete)
 *  - expo-web-browser (WebBrowser.openAuthSessionAsync)
 *  - ../components/Screen
 *  - ../theme
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ProfileScreen } from '../screens/profile/ProfileScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

// ─── Mock @react-navigation/native ────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockGetParent = jest.fn(() => ({ reset: mockReset }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    reset: mockReset,
    getParent: mockGetParent,
  }),
  // ProfileScreen calls useFocusEffect to refetch upcoming sessions when
  // the user returns to the Profile tab. Stub fires the callback once on
  // mount and treats any returned cleanup as the unmount handler.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────

const mockLogout = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({ logout: mockLogout }),
}));

// ─── Mock profile store ───────────────────────────────────────────────────────

const mockFetchProfile = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
let mockSportProfiles: { sport: string; level: string }[] = [];

jest.mock('../stores/profile', () => ({
  useProfileStore: () => ({
    profile: mockProfile,
    sportProfiles: mockSportProfiles,
    fetchProfile: mockFetchProfile,
  }),
}));

// ─── Mock useRankSummary hook ─────────────────────────────────────────────────
// The hook is unit-tested via RankSummaryCard; the ProfileScreen tests only
// need to assert what the screen does with each summary state.

let mockRankSummary:
  | { honor: number; sports: { sport: string; rankPoints: number; tier: string; sessionsCompleted: number }[] }
  | null = null;
let mockRankLoading = false;

jest.mock('../hooks/useRankSummary', () => ({
  useRankSummary: () => ({
    summary: mockRankSummary,
    isLoading: mockRankLoading,
    error: null,
    refresh: jest.fn(),
  }),
}));

// ─── Mock useHonorSummary hook (V1.1) ─────────────────────────────────────────
// Same isolation pattern as useRankSummary above — the HonorCard component
// is unit-tested on its own; here we just stub the data path.

jest.mock('../hooks/useHonorSummary', () => ({
  useHonorSummary: () => ({
    summary: null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// ─── Mock useHonorSystem hook (local champion titles) ─────────────────────────
// LocalRankSection is unit-tested on its own. Here we just stub the data
// path so the ProfileScreen renders the section without touching the
// real read-only API client.

let mockLocalRank:
  | {
      id: string | null;
      userId: string;
      sport: string;
      area: string;
      rating: number;
      wins: number;
      losses: number;
      streak: number;
      lastPlayedAt: string | null;
      createdAt: string | null;
      updatedAt: string | null;
    }
  | null = null;
let mockLocalChampion:
  | {
      id: string;
      sport: string;
      area: string;
      titleName: string;
      currentHolderUserId: string | null;
      active: boolean;
      createdAt: string;
      updatedAt: string;
    }
  | null = null;
let mockMyTitles: {
  id: string;
  sport: string;
  area: string;
  titleName: string;
  currentHolderUserId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}[] = [];

const mockUseHonorSystem = jest.fn();

jest.mock('../hooks/useHonorSystem', () => ({
  useHonorSystem: (args: unknown) => {
    mockUseHonorSystem(args);
    return {
      rank: mockLocalRank,
      localChampion: mockLocalChampion,
      myTitles: mockMyTitles,
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    };
  },
}));

// ─── Mock expo-web-browser ────────────────────────────────────────────────────

const mockOpenAuthSession = jest.fn();

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSession(...args),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// The real theme is used: ProfileScreen renders design-system primitives
// (ListRow, Icon) that need the full token set, and the tokens are plain data.

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = null;
    mockSportProfiles = [];
    mockRankSummary = null;
    mockRankLoading = false;
    mockLocalRank = null;
    mockLocalChampion = null;
    mockMyTitles = [];
    // Default: fetchProfile resolves immediately, gcal not connected
    mockFetchProfile.mockResolvedValue(undefined);
    mockApiGet.mockResolvedValue({ connected: false });
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while fetchProfile is pending', () => {
    mockFetchProfile.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = render(<ProfileScreen />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  // ── Profile loaded ─────────────────────────────────────────────────────────

  it('renders the display name after profile loads', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Jordan Lee'));
  });

  it('renders suburb when present', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: 'Newtown', bio: null };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Newtown'));
  });

  it('renders bio when present', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: 'Early morning gym sessions only.' };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Early morning gym sessions only.'));
  });

  it('renders sport profiles with capitalised level', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [{ sport: 'gym', level: 'intermediate' }];
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => {
      getByText('Gym');
      getByText('Intermediate');
    });
  });

  // ── Empty / not-yet-created profile ───────────────────────────────────────

  it('shows "Profile not set up" when profile is null and fetchProfile resolves', async () => {
    mockProfile = null;
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
  });

  it('does not show an error when fetchProfile rejects with a 404', async () => {
    mockFetchProfile.mockRejectedValue(new Error('404 not found'));
    const { queryByText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByText(/404/)).toBeNull();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message when fetchProfile rejects with a non-404 error', async () => {
    mockFetchProfile.mockRejectedValue(new Error('Server error'));
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Server error'));
  });

  // ── Calendar integration is hidden in v1 ─────────────────────────────────

  it('does not expose the Google Calendar integration in v1', async () => {
    const { queryByText, getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    expect(queryByText('Integrations')).toBeNull();
    expect(queryByText('Connect Google Calendar')).toBeNull();
    expect(queryByText('Disconnect')).toBeNull();
  });

  // ── Legal & support links ────────────────────────────────────────────────

  it('renders Privacy Policy, Terms of Service, and Support links', async () => {
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    getByLabelText('Privacy Policy');
    getByLabelText('Terms of Service');
    getByLabelText('Support');
  });

  // ── Edit profile ───────────────────────────────────────────────────────────

  it('renders an Edit profile button when profile is loaded', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Edit profile'));
  });

  it('navigates to EditProfile when Edit profile is pressed', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Edit profile'));
    fireEvent.press(getByLabelText('Edit profile'));
    expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
  });

  it('does not render Edit profile when no profile exists', async () => {
    mockProfile = null;
    const { queryByLabelText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByLabelText('Edit profile')).toBeNull();
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it('calls logout and resets navigation to AuthEntry when Log out is pressed', async () => {
    mockLogout.mockResolvedValue(undefined);
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    await act(async () => {
      fireEvent.press(getByLabelText('Log out'));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    // RootNavigator is not token-gated, so logout must explicitly reset the
    // root stack; otherwise the user stays on the Profile tab with stale data.
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'AuthEntry' }],
    });
  });

  // ── Delete account ─────────────────────────────────────────────────────────

  describe('Delete my account', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    it('opens a confirmation alert when Delete my account is pressed', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe('Delete your account?');
      expect(mockApiDelete).not.toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('does nothing when the user cancels the confirmation', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      // Invoke the Cancel button's onPress (if any). Cancel has no handler,
      // so just verify nothing was called after the alert opened.
      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void;
      }[];
      const cancel = buttons.find((b) => b.text === 'Cancel');
      expect(cancel).toBeDefined();
      expect(cancel?.style).toBe('cancel');
      cancel?.onPress?.();

      expect(mockApiDelete).not.toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('calls DELETE /auth/me, logs out, and resets to AuthEntry on confirm', async () => {
      mockApiDelete.mockResolvedValue(undefined);
      mockLogout.mockResolvedValue(undefined);
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');
      expect(destructive).toBeDefined();

      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
      expect(mockLogout).toHaveBeenCalledTimes(1);
      // Navigation reset must hit the *parent* (root) stack — that is where
      // AuthEntry is registered. Resetting only the tab navigator would
      // leave the user inside the authenticated stack.
      expect(mockGetParent).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'AuthEntry' }],
      });
      // logout must be called BEFORE reset so the reset never re-renders
      // Profile against the stale (just-deleted) account's state.
      const logoutOrder = mockLogout.mock.invocationCallOrder[0];
      const resetOrder = mockReset.mock.invocationCallOrder.at(-1)!;
      expect(logoutOrder).toBeLessThan(resetOrder);
    });

    // (Rank summary integration tests are at the bottom of the describe block.)
    // ── placeholder for collocation marker ─────────────────────────────────

    it('shows a failure alert and does not log out or reset nav when delete rejects', async () => {
      mockApiDelete.mockRejectedValue(new Error('500 server error'));
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');

      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
      // Failed deletion must not clear the local session or send the user
      // to AuthEntry — otherwise the user is stranded in a logged-out state
      // even though their account still exists on the server.
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
      // Second alert call is the failure message
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy.mock.calls[1][0]).toBe('Delete failed');
    });

    it('labels the destructive confirmation as "Delete account"', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');
      expect(destructive?.text).toBe('Delete account');
    });

    it('does not fire DELETE twice if the destructive press is invoked twice', async () => {
      // Slow API: hold the first DELETE in flight while we attempt to fire a
      // second confirmation. The local isDeleting guard must short-circuit
      // the duplicate so /auth/me is only called once.
      let resolveDelete!: (v: unknown) => void;
      mockApiDelete.mockReturnValueOnce(
        new Promise((res) => {
          resolveDelete = res;
        })
      );
      mockLogout.mockResolvedValue(undefined);

      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      const destructive = buttons.find((b) => b.style === 'destructive');

      // Fire and DO NOT await — keeps the API in flight.
      let firstPress: Promise<void | undefined> | undefined;
      act(() => {
        firstPress = destructive?.onPress?.() as Promise<void> | undefined;
      });

      // Second invocation while in-flight must be ignored.
      await act(async () => {
        await destructive?.onPress?.();
      });

      expect(mockApiDelete).toHaveBeenCalledTimes(1);

      // Resolve the original to leave the test in a clean state.
      await act(async () => {
        resolveDelete(undefined);
        await firstPress;
      });
    });
  });

  // ── Sports reputation (rank/honor) — hidden in v1 ──────────────────────────
  // The Rank/Honor surface is intentionally not rendered on Profile in v1.
  // The component itself (RankSummaryCard) and its hook (useRankSummary) are
  // still unit-tested separately; these tests guard the Profile-level
  // contract that no rank/honor copy reaches a screenshot frame.

  describe('rank summary section (v1: hidden)', () => {
    it('renders the V1.1 Honor card when a profile exists', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      // Legacy rank summary remains hidden — the booking-based ledger
      // is no longer surfaced on Profile.
      mockRankSummary = {
        honor: 105,
        sports: [
          { sport: 'tennis', rankPoints: 10, tier: 'Bronze', sessionsCompleted: 2 },
        ],
      };
      const { findByLabelText, queryByText, getByText } = render(<ProfileScreen />);
      await waitFor(() => getByText('Jordan Lee'));
      // V1.1 Honor card is present (empty state copy from the stubbed
      // useHonorSummary returning null is fine).
      await findByLabelText('Honor card empty');
      // Legacy rank card stays off the profile screen.
      expect(queryByText('Sports reputation')).toBeNull();
      expect(queryByText('Bronze')).toBeNull();
    });

    it('does not render the Honor card when no profile exists', async () => {
      mockProfile = null;
      const { queryByLabelText, queryByText, getByText } = render(
        <ProfileScreen />
      );
      await waitFor(() => getByText('Profile not set up'));
      expect(queryByLabelText('Honor card empty')).toBeNull();
      expect(queryByText('Sports reputation')).toBeNull();
    });
  });

  // ── Local rank / Honor System section ──────────────────────────────────────
  //
  // The read-only Honor System surface (rating, wins/losses, streak,
  // current titles) lives next to the Honor card. These tests pin
  // that:
  //   * it renders when a profile exists,
  //   * its empty-state copy is shown for a new user,
  //   * no Honor System mutation endpoint is called from Profile.

  describe('local rank section', () => {
    it('scopes the Honor System to the primary sport and suburb area', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Balmain East', bio: null };
      mockSportProfiles = [
        { sport: 'tennis', level: 'intermediate' },
        { sport: 'running', level: 'beginner' },
      ];
      const { findByText } = render(<ProfileScreen />);
      await findByText('Balmain East Tennis Rank');
      expect(mockUseHonorSystem).toHaveBeenLastCalledWith({
        sport: 'tennis',
        area: 'balmain east',
        enabled: true,
      });
      // The old hard-coded MVP scope must be gone.
      expect(mockUseHonorSystem).not.toHaveBeenCalledWith(
        expect.objectContaining({ area: 'annandale' })
      );
    });

    it('falls back to running when the user has no sport profiles', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Newtown', bio: null };
      mockSportProfiles = [];
      const { findByText } = render(<ProfileScreen />);
      await findByText('Newtown Running Rank');
      expect(mockUseHonorSystem).toHaveBeenLastCalledWith({
        sport: 'running',
        area: 'newtown',
        enabled: true,
      });
    });

    it('skips the Honor System fetch and hides the section without a suburb', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      const { findByText, queryByLabelText } = render(<ProfileScreen />);
      await findByText('Jordan Lee');
      expect(queryByLabelText('Local rank section')).toBeNull();
      expect(mockUseHonorSystem).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it('renders the Local Rank section with empty-state copy for a new user', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Annandale', bio: null };
      mockSportProfiles = [{ sport: 'tennis', level: 'beginner' }];
      // Default mocks: rank null + no titles.
      const { findByLabelText, findByText } = render(<ProfileScreen />);
      await findByLabelText('Local rank section');
      await findByText('Annandale Tennis Rank');
      await findByText(
        'No local rank yet. Your rank will update when verified results are available.'
      );
    });

    it('renders rating / wins / streak when the user has activity', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Annandale', bio: null };
      mockSportProfiles = [{ sport: 'tennis', level: 'beginner' }];
      mockLocalRank = {
        id: 'rp-1',
        userId: 'u-1',
        sport: 'tennis',
        area: 'annandale',
        rating: 1080,
        wins: 4,
        losses: 1,
        streak: 3,
        lastPlayedAt: '2026-05-10T10:00:00Z',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };
      const { findByLabelText } = render(<ProfileScreen />);
      await findByLabelText('Rating: 1080');
      await findByLabelText('Wins / Losses: 4 / 1');
      await findByLabelText('Streak: 3');
    });

    it('renders the local champion row when a holder exists', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Annandale', bio: null };
      mockSportProfiles = [{ sport: 'tennis', level: 'beginner' }];
      mockLocalRank = {
        id: 'rp-1',
        userId: 'u-1',
        sport: 'tennis',
        area: 'annandale',
        rating: 1080,
        wins: 4,
        losses: 1,
        streak: 3,
        lastPlayedAt: '2026-05-10T10:00:00Z',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };
      mockLocalChampion = {
        id: 'ht-1',
        sport: 'tennis',
        area: 'annandale',
        titleName: 'Annandale Tennis Champion',
        currentHolderUserId: 'u-1',
        active: true,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-10T10:00:00Z',
      };
      const { findByLabelText, findByText } = render(<ProfileScreen />);
      await findByLabelText('Local champion');
      await findByText('Annandale Tennis Champion');
    });

    it('never invokes a Honor System mutation endpoint from Profile', async () => {
      // ProfileScreen must not call POST/PUT/PATCH/DELETE against the
      // Honor System routes. The public API is read-only and there is
      // no mutation surface on this screen.
      mockProfile = { displayName: 'Jordan Lee', suburb: 'Annandale', bio: null };
      mockSportProfiles = [{ sport: 'tennis', level: 'beginner' }];
      const { findByLabelText } = render(<ProfileScreen />);
      await findByLabelText('Local rank section');

      // mockApiGet captures every api.get call from the screen.
      const getCalls = mockApiGet.mock.calls.map((c) => c[0]);
      // The Honor System reads go through `lib/honorSystem.ts` which
      // is mocked by useHonorSystem — Profile itself should not be
      // hitting /rankings or /honors directly through the bare api.
      for (const path of getCalls) {
        expect(typeof path === 'string' && path.startsWith('/rankings')).toBe(
          false
        );
        expect(typeof path === 'string' && path.startsWith('/honors')).toBe(
          false
        );
      }

      // No write verbs are exercised at all on this screen via api.delete
      // unless the user invokes "Delete my account". That path is covered
      // by the dedicated delete-account tests; the local rank surface
      // must never touch a mutation verb against honors/rankings.
      expect(mockApiDelete).not.toHaveBeenCalledWith(
        expect.stringMatching(/^\/(honors|rankings)/)
      );
    });
  });

  // ── Upcoming sessions ──────────────────────────────────────────────────────
  //
  // Section pins what the receiver sees AFTER accepting a chat proposal:
  // the session lands here, future-only, with status pinned to Confirmed.
  // Pending and declined bookings stay in chat (S2) and must NOT leak into
  // this surface.

  describe('Upcoming sessions section', () => {
    function makeBooking(overrides: Record<string, unknown> = {}) {
      return {
        id: 'booking-99',
        matchId: 'match-7',
        proposerId: 'partner-1',
        partnerId: 'me-1',
        sport: 'gym',
        startsAt: '2099-04-09T09:00:00Z',
        endsAt: '2099-04-09T10:00:00Z',
        location: 'Anytime Fitness Pyrmont',
        notes: null,
        status: 'confirmed',
        createdAt: '2099-04-08T08:30:00Z',
        updatedAt: '2099-04-08T08:30:00Z',
        partner: { displayName: 'Chris' },
        venue: null,
        ...overrides,
      };
    }

    function setBookingsResponse(items: unknown[]) {
      mockApiGet.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.startsWith('/bookings')) {
          return Promise.resolve({ items, total: items.length, limit: 50, offset: 0 });
        }
        // Anything else returns the legacy default the rest of the suite uses.
        return Promise.resolve({ connected: false });
      });
    }

    it('renders the empty state when there are no confirmed sessions', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      setBookingsResponse([]);
      const { findByText } = render(<ProfileScreen />);
      await findByText('Upcoming sessions');
      await findByText('No confirmed sessions yet.');
    });

    it('renders a confirmed future session with sport, partner, and CONFIRMED pill', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      setBookingsResponse([makeBooking()]);
      const { findByText, queryByText } = render(<ProfileScreen />);
      await findByText('Upcoming sessions');
      // Sport, partner, location, and status pill must all surface.
      await findByText('Gym');
      await findByText('With Chris');
      await findByText('Anytime Fitness Pyrmont');
      // The pill text was promoted to all-caps for the screenshot polish
      // pass so it visually reads as a status badge rather than a sentence.
      await findByText('CONFIRMED');
      // Empty-state copy must NOT render when a session exists.
      expect(queryByText('No confirmed sessions yet.')).toBeNull();
    });

    it('navigates to BookingDetail when a row is tapped', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      setBookingsResponse([makeBooking()]);
      const { findByLabelText } = render(<ProfileScreen />);
      const row = await findByLabelText(
        'Open upcoming gym session with Chris'
      );
      await act(async () => {
        fireEvent.press(row);
      });
      expect(mockNavigate).toHaveBeenCalledWith('BookingDetail', {
        bookingId: 'booking-99',
      });
    });

    it('filters out past confirmed sessions client-side', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      // endsAt sits in the past — backend may still order it ASC, but the
      // mobile must drop it before rendering.
      setBookingsResponse([
        makeBooking({
          id: 'booking-past',
          startsAt: '2000-01-01T09:00:00Z',
          endsAt: '2000-01-01T10:00:00Z',
        }),
      ]);
      const { findByText, queryByText } = render(<ProfileScreen />);
      await findByText('No confirmed sessions yet.');
      expect(queryByText('With Chris')).toBeNull();
    });

    it('does not render proposed or declined bookings even if returned', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      // Defensive: even if a future code path mistakenly issues a wider
      // status query, the row-rendering filter must reject anything that
      // isn't confirmed/accepted.
      setBookingsResponse([
        makeBooking({ id: 'b-prop', status: 'proposed' }),
        makeBooking({ id: 'b-decl', status: 'declined' }),
      ]);
      const { findByText, queryByText } = render(<ProfileScreen />);
      await findByText('No confirmed sessions yet.');
      expect(queryByText('With Chris')).toBeNull();
    });

    it('queries /bookings with the confirmed status filter', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      setBookingsResponse([]);
      render(<ProfileScreen />);
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/bookings?status=confirmed&limit=50'
        );
      });
    });

    it('does not show calendar sync or push notification copy in this section', async () => {
      // Pin the v1 scope: Upcoming is read-only and does not surface
      // hidden surfaces (no calendar / push / reminder copy).
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      setBookingsResponse([makeBooking()]);
      const { findByText, queryByText } = render(<ProfileScreen />);
      await findByText('Upcoming sessions');
      expect(queryByText(/calendar/i)).toBeNull();
      expect(queryByText(/notification/i)).toBeNull();
      expect(queryByText(/reminder/i)).toBeNull();
    });
  });

  // ── Guides (Honor Guide + Safety Center) ────────────────────────────────────

  describe('guides', () => {
    it('renders Honor Guide and Safety Center entries when a profile exists', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      const { findByLabelText } = render(<ProfileScreen />);
      await findByLabelText('Honor Guide');
      await findByLabelText('Safety Center');
    });

    it('navigates to HonorGuide when the Honor Guide entry is pressed', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      const { findByLabelText } = render(<ProfileScreen />);
      const entry = await findByLabelText('Honor Guide');
      fireEvent.press(entry);
      expect(mockNavigate).toHaveBeenCalledWith('HonorGuide');
    });

    it('navigates to SafetyCenter when the Safety Center entry is pressed', async () => {
      mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
      const { findByLabelText } = render(<ProfileScreen />);
      const entry = await findByLabelText('Safety Center');
      fireEvent.press(entry);
      expect(mockNavigate).toHaveBeenCalledWith('SafetyCenter');
    });
  });
});
