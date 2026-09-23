import { useEffect, useRef } from 'react';
import {
  CommonActions,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SplashScreen } from '../screens/SplashScreen';
import { AuthEntryScreen } from '../screens/auth/AuthEntryScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { OnboardingStep1Screen } from '../screens/onboarding/OnboardingStep1Screen';
import { OnboardingStep2Screen } from '../screens/onboarding/OnboardingStep2Screen';
import { OnboardingStep3Screen } from '../screens/onboarding/OnboardingStep3Screen';
import { OnboardingStep4Screen } from '../screens/onboarding/OnboardingStep4Screen';
import { EventsScreen } from '../screens/events/EventsScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { ChatScreen } from '../screens/chat/ChatScreen';
import { BookingComposerScreen } from '../screens/bookings/BookingComposerScreen';
import { BookingDetailScreen } from '../screens/bookings/BookingDetailScreen';
import { ReportScreen } from '../screens/safety/ReportScreen';
import { BattlesScreen } from '../screens/battles/BattlesScreen';
import { BattleDetailScreen } from '../screens/battles/BattleDetailScreen';
import { CreateBattleScreen } from '../screens/battles/CreateBattleScreen';
import { AttendanceCheckScreen } from '../screens/battles/AttendanceCheckScreen';
import { ChallengeListScreen } from '../screens/challenges/ChallengeListScreen';
import { ChallengeDetailScreen } from '../screens/challenges/ChallengeDetailScreen';
import { PublicProfileScreen } from '../screens/profile/PublicProfileScreen';
import { HonorGuideScreen } from '../screens/help/HonorGuideScreen';
import { SafetyCenterScreen } from '../screens/help/SafetyCenterScreen';
import { BlockedUsersScreen } from '../screens/safety/BlockedUsersScreen';
import { UiGalleryScreen } from '../screens/dev/UiGalleryScreen';
import { CrewDetailScreen } from '../screens/crews/CrewDetailScreen';
import { CreateCrewScreen } from '../screens/crews/CreateCrewScreen';

import { registerForPushNotifications, configureForegroundHandler } from '../lib/notifications';
import { useAuthStore } from '../stores/auth';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Routes that are always safe to remain on without a token. Anything else is
// treated as authenticated stack and is force-reset to AuthEntry the moment
// the auth token clears (logout / delete account / future 401 interceptor).
const UNAUTH_ROUTES: readonly (keyof RootStackParamList)[] = [
  'Splash',
  'AuthEntry',
  'LoginScreen',
  'RegisterScreen',
];

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function RootNavigator() {
  const { token } = useAuthStore();
  // Tracks the previous token so the safety-net effect can detect a real
  // authenticated -> unauthenticated transition (logout / delete account /
  // forced session expiry) without firing on the very first cold-start
  // render (where token is briefly null until SecureStore resolves).
  const previousToken = useRef(token);

  useEffect(() => {
    try {
      configureForegroundHandler();
    } catch {
      // Notification support varies in Expo Go/dev clients. Foreground
      // handler setup must not block auth routing.
    }
  }, []);

  useEffect(() => {
    if (token) {
      void registerForPushNotifications().catch(() => {
        // Push registration is best-effort and auth-adjacent only because it
        // starts after login/register. Failures must not surface as auth errors.
      });
    }
  }, [token]);

  // Auth-state safety net: if the token was set and is now null, force the
  // navigator back to AuthEntry unless we are already on a safe unauthenticated
  // route. ProfileScreen does this on its happy path; this guard catches any
  // future code path that clears the token (e.g. a global 401 interceptor) so
  // the authenticated stack can never be left visible without a valid session.
  useEffect(() => {
    const wasAuthed = previousToken.current !== null;
    const nowUnauthed = token === null;
    previousToken.current = token;
    if (!wasAuthed || !nowUnauthed) return;
    if (!navigationRef.isReady()) return;
    const current = navigationRef.getCurrentRoute()?.name as
      | keyof RootStackParamList
      | undefined;
    if (current && UNAUTH_ROUTES.includes(current)) return;
    navigationRef.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'AuthEntry' }] })
    );
  }, [token]);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="AuthEntry" component={AuthEntryScreen} />
        <Stack.Screen
          name="LoginScreen"
          component={LoginScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="RegisterScreen"
          component={RegisterScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep1"
          component={OnboardingStep1Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep2"
          component={OnboardingStep2Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep3"
          component={OnboardingStep3Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OnboardingStep4"
          component={OnboardingStep4Screen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BookingComposer"
          component={BookingComposerScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BookingDetail"
          component={BookingDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Report"
          component={ReportScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        {/* The old Events tab. Its content now lives in Profile (upcoming
            sessions, Games & challenges); kept registered so nothing is
            orphaned until the run-first Run tab replaces it. */}
        <Stack.Screen
          name="Events"
          component={EventsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Battles"
          component={BattlesScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BattleDetail"
          component={BattleDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CreateBattle"
          component={CreateBattleScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="AttendanceCheck"
          component={AttendanceCheckScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Challenges"
          component={ChallengeListScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ChallengeDetail"
          component={ChallengeDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="PublicProfile"
          component={PublicProfileScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="HonorGuide"
          component={HonorGuideScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SafetyCenter"
          component={SafetyCenterScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="BlockedUsers"
          component={BlockedUsersScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CrewDetail"
          component={CrewDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CreateCrew"
          component={CreateCrewScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        {__DEV__ ? (
          // Design-system review screen; never registered in release builds.
          <Stack.Screen
            name="UiGallery"
            component={UiGalleryScreen}
            options={{ animation: 'slide_from_right' }}
          />
        ) : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
