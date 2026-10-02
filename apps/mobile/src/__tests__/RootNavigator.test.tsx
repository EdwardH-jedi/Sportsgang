import React from 'react';
import { render, act } from '@testing-library/react-native';

import { RootNavigator } from '../navigation/RootNavigator';

const mockUseAuthStore = jest.fn();
const mockConfigureForegroundHandler = jest.fn();
const mockRegisterForPushNotifications = jest.fn();

jest.mock('../stores/auth', () => ({
  useAuthStore: () => mockUseAuthStore(),
}));

jest.mock('../lib/notifications', () => ({
  configureForegroundHandler: () => mockConfigureForegroundHandler(),
  registerForPushNotifications: () => mockRegisterForPushNotifications(),
}));

// The ref is defined INSIDE the factory because jest hoists jest.mock() above
// const declarations — referencing an outer `mockNavRef` here would still be
// in the TDZ when RootNavigator first calls createNavigationContainerRef().
jest.mock('@react-navigation/native', () => {
  const navRef = {
    isReady: jest.fn(() => false),
    getCurrentRoute: jest.fn(() => ({ name: 'Main' })),
    dispatch: jest.fn(),
  };
  return {
    NavigationContainer: ({ children }: { children: React.ReactNode }) => {
      const { View } = require('react-native');
      return <View>{children}</View>;
    },
    createNavigationContainerRef: () => navRef,
    CommonActions: {
      reset: (config: unknown) => ({ type: 'RESET', payload: config }),
    },
    __mockNavRef: navRef,
  };
});

// Pull the same ref the mock handed to RootNavigator so tests can drive it.
const mockNavRef = (
  jest.requireMock('@react-navigation/native') as {
    __mockNavRef: {
      isReady: jest.Mock;
      getCurrentRoute: jest.Mock;
      dispatch: jest.Mock;
    };
  }
).__mockNavRef;

const mockStackScreens: string[] = [];
const mockTabScreens: string[] = [];

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const { View } = require('react-native');
      return <View>{children}</View>;
    },
    // Record every registered route; render only the tab shell so the tab
    // registrations can be asserted too.
    Screen: ({ name, component: Component }: { name: string; component: React.ComponentType }) => {
      mockStackScreens.push(name);
      return name === 'Main' ? <Component /> : null;
    },
  }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => {
      const { View } = require('react-native');
      return <View>{children}</View>;
    },
    Screen: ({ name, options }: { name: string; options?: { title?: string } }) => {
      mockTabScreens.push(`${name}:${options?.title ?? ''}`);
      return null;
    },
  }),
}));

jest.mock('../screens/SplashScreen', () => ({ SplashScreen: () => null }));
jest.mock('../screens/auth/AuthEntryScreen', () => ({ AuthEntryScreen: () => null }));
jest.mock('../screens/auth/LoginScreen', () => ({ LoginScreen: () => null }));
jest.mock('../screens/auth/RegisterScreen', () => ({ RegisterScreen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep1Screen', () => ({ OnboardingStep1Screen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep2Screen', () => ({ OnboardingStep2Screen: () => null }));
jest.mock('../screens/onboarding/OnboardingStep3Screen', () => ({ OnboardingStep3Screen: () => null }));
jest.mock('../screens/setup/SetupSportsScreen', () => ({ SetupSportsScreen: () => null }));
jest.mock('../screens/setup/SetupSportDetailsScreen', () => ({ SetupSportDetailsScreen: () => null }));
jest.mock('../screens/setup/SetupAvailabilityScreen', () => ({ SetupAvailabilityScreen: () => null }));
jest.mock('../screens/explore/ExploreScreen', () => ({ ExploreScreen: () => null }));
jest.mock('../screens/explore/PartnerDetailScreen', () => ({ PartnerDetailScreen: () => null }));
jest.mock('../screens/plans/MyPlansScreen', () => ({ MyPlansScreen: () => null }));
jest.mock('../screens/sessions/CreateSessionScreen', () => ({ CreateSessionScreen: () => null }));
jest.mock('../screens/sessions/SessionDetailScreen', () => ({ SessionDetailScreen: () => null }));
jest.mock('../screens/profile/EditSportPreferencesScreen', () => ({ EditSportPreferencesScreen: () => null }));
jest.mock('../screens/matches/MatchesScreen', () => ({ MatchesScreen: () => null }));
jest.mock('../screens/profile/ProfileScreen', () => ({ ProfileScreen: () => null }));
jest.mock('../screens/profile/EditProfileScreen', () => ({ EditProfileScreen: () => null }));
jest.mock('../screens/chat/ChatScreen', () => ({ ChatScreen: () => null }));
jest.mock('../screens/bookings/BookingComposerScreen', () => ({ BookingComposerScreen: () => null }));
jest.mock('../screens/bookings/BookingDetailScreen', () => ({ BookingDetailScreen: () => null }));
jest.mock('../screens/safety/ReportScreen', () => ({ ReportScreen: () => null }));

describe('RootNavigator destinations', () => {
  beforeEach(() => {
    mockStackScreens.length = 0;
    mockTabScreens.length = 0;
    mockUseAuthStore.mockReturnValue({ token: null });
  });

  it('shows Explore / My Plans / Chats / Profile as the four tabs', () => {
    render(<RootNavigator />);
    expect(mockTabScreens).toEqual(['Explore:Explore', 'Plans:My Plans', 'Chats:Chats', 'Profile:Profile']);
  });

  it('registers the v2 routes and keeps existing booking / chat / safety routes reachable', () => {
    render(<RootNavigator />);
    for (const route of [
      'SetupSports',
      'SetupSportDetails',
      'SetupAvailability',
      'EditSportPreferences',
      'PartnerDetail',
      'CreateSession',
      'SessionDetail',
      'Chat',
      'BookingComposer',
      'BookingDetail',
      'Report',
      'BlockedUsers',
      'SafetyCenter',
      'EditProfile',
      'OnboardingStep2',
      'OnboardingStep3',
    ]) {
      expect(mockStackScreens).toContain(route);
    }
    expect(mockStackScreens).not.toContain('OnboardingStep4');
  });
});

describe('RootNavigator auth-adjacent side effects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthStore.mockReturnValue({ token: null });
    mockNavRef.isReady.mockReturnValue(false);
    mockNavRef.getCurrentRoute.mockReturnValue({ name: 'Main' });
  });

  it('does not let notification handler setup failures block navigator render', () => {
    mockConfigureForegroundHandler.mockImplementation(() => {
      throw new Error('Notifications unavailable in Expo Go');
    });

    expect(() => render(<RootNavigator />)).not.toThrow();
    expect(mockConfigureForegroundHandler).toHaveBeenCalled();
  });

  it('does not surface push registration rejection after login/register sets a token', async () => {
    mockUseAuthStore.mockReturnValue({ token: 'jwt-token' });
    mockRegisterForPushNotifications.mockRejectedValue(
      new Error('Expo push notifications unavailable')
    );

    render(<RootNavigator />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRegisterForPushNotifications).toHaveBeenCalled();
  });

  // ── Auth-state safety net (Step 4) ───────────────────────────────────────

  it('forces a reset to AuthEntry when token transitions from set to null on an authenticated route', () => {
    mockUseAuthStore.mockReturnValue({ token: 'jwt-token' });
    mockNavRef.isReady.mockReturnValue(true);
    mockNavRef.getCurrentRoute.mockReturnValue({ name: 'Main' });

    const { rerender } = render(<RootNavigator />);
    // No reset yet — the user is authed and on the authed stack.
    expect(mockNavRef.dispatch).not.toHaveBeenCalled();

    // Token clears (logout / delete-account / 401 interceptor).
    mockUseAuthStore.mockReturnValue({ token: null });
    rerender(<RootNavigator />);

    expect(mockNavRef.dispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: { index: 0, routes: [{ name: 'AuthEntry' }] },
    });
  });

  it('does not reset when the user is already on a safe unauthenticated route', () => {
    mockUseAuthStore.mockReturnValue({ token: 'jwt-token' });
    mockNavRef.isReady.mockReturnValue(true);
    mockNavRef.getCurrentRoute.mockReturnValue({ name: 'AuthEntry' });

    const { rerender } = render(<RootNavigator />);
    mockUseAuthStore.mockReturnValue({ token: null });
    rerender(<RootNavigator />);

    expect(mockNavRef.dispatch).not.toHaveBeenCalled();
  });

  it('does not reset on the initial cold-start render where token is still null', () => {
    mockUseAuthStore.mockReturnValue({ token: null });
    mockNavRef.isReady.mockReturnValue(true);

    render(<RootNavigator />);

    expect(mockNavRef.dispatch).not.toHaveBeenCalled();
  });
});
