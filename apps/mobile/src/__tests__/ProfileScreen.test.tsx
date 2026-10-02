/**
 * ProfileScreen tests (v2 running / golf).
 *
 * Covers identity, the "Your sports" cards (configured, legacy-unconfigured,
 * missing), the removal of the hardcoded tennis/annandale rank + Honor
 * surfaces, settings reachability, and the unchanged logout / delete-account
 * behaviour.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ProfileScreen } from '../screens/profile/ProfileScreen';

const mockApiGet = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
  BASE_URL: 'http://localhost:8000',
}));

const mockNavigate = jest.fn();
const mockReset = jest.fn();
const mockGetParent = jest.fn(() => ({ reset: mockReset }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    reset: mockReset,
    getParent: mockGetParent,
  }),
}));

const mockLogout = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({ logout: mockLogout }),
}));

const mockFetchProfile = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
let mockSportProfiles: Record<string, unknown>[] = [];

jest.mock('../stores/profile', () => ({
  useProfileStore: () => ({
    profile: mockProfile,
    sportProfiles: mockSportProfiles,
    fetchProfile: mockFetchProfile,
  }),
  sportLabel: (sport: string) => {
    const labels: Record<string, string> = { gym: 'Gym', golf: 'Golf', tennis: 'Tennis', running: 'Running' };
    return labels[sport] ?? sport;
  },
}));

const mockOpenLegal = jest.fn();
jest.mock('../lib/legal', () => ({
  openLegal: (...args: unknown[]) => mockOpenLegal(...args),
  PRIVACY_URL: 'privacy',
  TERMS_URL: 'terms',
  SUPPORT_URL: 'support',
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const V2_NULLS = {
  preferencesVersion: null,
  golfHandicapTenths: null,
  golfHandicapSource: null,
  golfExperience: null,
  golfPartnerIntents: null,
  golfSimilarityToleranceTenths: null,
  golfPreferredHoles: null,
  runPaceMode: null,
  runPaceMinSecPerKm: null,
  runPaceMaxSecPerKm: null,
  runDistancesKm: null,
  runGroupStyle: null,
};

const GOLF_V2 = {
  ...V2_NULLS,
  id: 'sp-golf',
  sport: 'golf',
  level: 'advanced',
  preferredTimes: ['morning'],
  preferencesVersion: 2,
  golfHandicapTenths: -21,
  golfHandicapSource: 'official_index',
  golfExperience: 'regular',
  golfPartnerIntents: ['welcome_beginners'],
};

const RUN_LEGACY = { ...V2_NULLS, id: 'sp-run', sport: 'running', level: 'beginner', preferredTimes: ['evening'] };

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = null;
    mockSportProfiles = [];
    mockFetchProfile.mockResolvedValue(undefined);
  });

  // ── Loading / empty / error ───────────────────────────────────────────────

  it('shows a loading indicator while fetchProfile is pending', () => {
    mockFetchProfile.mockReturnValue(new Promise(() => {}));
    const { getByLabelText } = render(<ProfileScreen />);
    getByLabelText('Loading your profile…');
  });

  it('shows "Profile not set up" with a way to finish setup when there is no profile', async () => {
    const { getByText, getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    fireEvent.press(getByLabelText('Finish setting up'));
    expect(mockNavigate).toHaveBeenCalledWith('OnboardingStep1');
  });

  it('does not show an error when fetchProfile rejects with a 404', async () => {
    mockFetchProfile.mockRejectedValue(new Error('404 not found'));
    const { queryByText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByText(/404/)).toBeNull();
  });

  it('shows an error message when fetchProfile rejects with a non-404 error', async () => {
    mockFetchProfile.mockRejectedValue(new Error('Server error'));
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Server error'));
  });

  // ── Identity ──────────────────────────────────────────────────────────────

  it('renders name, suburb and bio', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: 'Newtown', bio: 'Early runs only.' };
    const { getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Jordan Lee'));
    getByText('Newtown');
    getByText('Early runs only.');
  });

  it('navigates to EditProfile from the header button', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Edit profile'));
    fireEvent.press(getByLabelText('Edit profile'));
    expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
  });

  it('does not render Edit profile when no profile exists', async () => {
    const { queryByLabelText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Profile not set up'));
    expect(queryByLabelText('Edit profile')).toBeNull();
  });

  // ── Your sports ───────────────────────────────────────────────────────────

  it('shows a configured golf card with factual chips and an edit action', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [GOLF_V2];
    const { getByText, getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Your sports'));
    getByText('Handicap +2.1 (self-reported)');
    getByText('Play regularly');
    getByText('Happy to play with beginners');
    getByText('Mornings');
    fireEvent.press(getByLabelText('Edit golf preferences'));
    expect(mockNavigate).toHaveBeenCalledWith('EditSportPreferences', { sport: 'golf' });
  });

  it('asks a legacy (unconfigured) running row to set up preferences instead of inventing any', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [RUN_LEGACY];
    const { getByLabelText, queryByText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Set up running preferences'));
    expect(queryByText(/Pace /)).toBeNull();
    fireEvent.press(getByLabelText('Set up running preferences'));
    expect(mockNavigate).toHaveBeenCalledWith('EditSportPreferences', { sport: 'running' });
  });

  it('offers to add a missing sport through the setup flow in add mode', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [GOLF_V2];
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Add running'));
    fireEvent.press(getByLabelText('Add running'));
    expect(mockNavigate).toHaveBeenCalledWith('SetupSports', { mode: 'add' });
  });

  it('keeps legacy gym/tennis rows visible read-only and never offers to delete them', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    mockSportProfiles = [{ ...V2_NULLS, sport: 'gym', level: 'intermediate', preferredTimes: [] }];
    const { getByText, queryByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByText(/Also saved from earlier versions: Gym \(Intermediate\)/));
    expect(queryByLabelText(/Remove/)).toBeNull();
  });

  // ── Removed rank / honor surfaces ─────────────────────────────────────────

  it('no longer shows hardcoded tennis/annandale ranks, Honor or upcoming sessions, and makes no rank reads', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { queryByText, getByText } = render(<ProfileScreen />);
    await waitFor(() => getByText('Jordan Lee'));
    expect(queryByText(/annandale/i)).toBeNull();
    expect(queryByText(/Tennis/)).toBeNull();
    expect(queryByText(/Honor/)).toBeNull();
    expect(queryByText('Upcoming sessions')).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  // ── Settings & legal ──────────────────────────────────────────────────────

  it('keeps optional photos, partner preferences, blocking and safety reachable', async () => {
    mockProfile = { displayName: 'Jordan Lee', suburb: null, bio: null };
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Photos & bio'));
    fireEvent.press(getByLabelText('Photos & bio'));
    expect(mockNavigate).toHaveBeenLastCalledWith('OnboardingStep2');
    fireEvent.press(getByLabelText('Partner preferences'));
    expect(mockNavigate).toHaveBeenLastCalledWith('OnboardingStep3');
    fireEvent.press(getByLabelText('Blocked users'));
    expect(mockNavigate).toHaveBeenLastCalledWith('BlockedUsers');
    fireEvent.press(getByLabelText('Safety Center'));
    expect(mockNavigate).toHaveBeenLastCalledWith('SafetyCenter');
  });

  it('renders Privacy Policy, Terms of Service, and Support links', async () => {
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    fireEvent.press(getByLabelText('Privacy Policy'));
    expect(mockOpenLegal).toHaveBeenCalledWith('privacy', 'Privacy Policy');
    getByLabelText('Terms of Service');
    getByLabelText('Support');
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  it('calls logout and resets navigation to AuthEntry when Log out is pressed', async () => {
    mockLogout.mockResolvedValue(undefined);
    const { getByLabelText } = render(<ProfileScreen />);
    await waitFor(() => getByLabelText('Log out'));
    await act(async () => {
      fireEvent.press(getByLabelText('Log out'));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'AuthEntry' }] });
  });

  // ── Delete account ────────────────────────────────────────────────────────

  describe('Delete my account', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    function destructiveButton() {
      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        style?: string;
        onPress?: () => void | Promise<void>;
      }[];
      return buttons.find((b) => b.style === 'destructive');
    }

    it('opens a confirmation alert labelled "Delete account"', async () => {
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      expect(alertSpy.mock.calls[0][0]).toBe('Delete your account?');
      expect(destructiveButton()?.text).toBe('Delete account');
      expect(mockApiDelete).not.toHaveBeenCalled();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('calls DELETE /auth/me, logs out, then resets the root stack to AuthEntry', async () => {
      mockApiDelete.mockResolvedValue(undefined);
      mockLogout.mockResolvedValue(undefined);
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      await act(async () => {
        await destructiveButton()?.onPress?.();
      });
      expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
      expect(mockGetParent).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'AuthEntry' }] });
      expect(mockLogout.mock.invocationCallOrder[0]).toBeLessThan(mockReset.mock.invocationCallOrder.at(-1)!);
    });

    it('keeps the session when delete fails', async () => {
      mockApiDelete.mockRejectedValue(new Error('500 server error'));
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      await act(async () => {
        await destructiveButton()?.onPress?.();
      });
      expect(mockLogout).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
      expect(alertSpy.mock.calls[1][0]).toBe('Delete failed');
    });

    it('does not fire DELETE twice while the first is in flight', async () => {
      let resolveDelete!: (v: unknown) => void;
      mockApiDelete.mockReturnValueOnce(new Promise((res) => (resolveDelete = res)));
      mockLogout.mockResolvedValue(undefined);
      const { getByLabelText } = render(<ProfileScreen />);
      await waitFor(() => getByLabelText('Delete my account'));
      fireEvent.press(getByLabelText('Delete my account'));
      const destructive = destructiveButton();
      let firstPress: Promise<void> | void | undefined;
      act(() => {
        firstPress = destructive?.onPress?.();
      });
      await act(async () => {
        await destructive?.onPress?.();
      });
      expect(mockApiDelete).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveDelete(undefined);
        await firstPress;
      });
    });
  });
});
