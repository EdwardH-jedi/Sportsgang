import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * Root stack — full-screen flows managed outside the tab bar.
 */
export type RootStackParamList = {
  Splash: undefined;
  AuthEntry: undefined;
  LoginScreen: undefined;
  RegisterScreen: undefined;
  OnboardingStep1: undefined;
  OnboardingStep2: undefined;
  OnboardingStep3: undefined;
  OnboardingStep4: undefined;
  Main: undefined;
  EditProfile: undefined;
  Chat: { matchId: string; partnerName: string; partnerId: string; sport: string };
  BookingComposer: { matchId: string; sport: string };
  BookingDetail: { bookingId: string };
  Report: { reportedUserId: string; reportedName: string };
  Battles: undefined;
  BattleDetail: { eventId: string };
  CreateBattle: undefined;
  AttendanceCheck: { eventId: string };
  Challenges: undefined;
  ChallengeDetail: { challengeId: string };
  /**
   * Public-safe view of another user, opened from Discovery cards.
   * Initial display fields are passed via route params to avoid a
   * placeholder flicker before /rank/users/{id} resolves.
   */
  PublicProfile: {
    userId: string;
    displayName?: string;
    suburb?: string;
    bio?: string;
    sports?: string[];
  };
  /** Informational explainer for Honor / Gang Score / Sport Levels. */
  HonorGuide: undefined;
  /** Informational safety / community-rules explainer. */
  SafetyCenter: undefined;
  /** Self-service management of users the caller has blocked. */
  BlockedUsers: undefined;
};

/**
 * Main tab bar — core surfaces of the authenticated experience.
 */
export type MainTabParamList = {
  Discovery: undefined;
  Matches: undefined;
  Events: undefined;
  Profile: undefined;
};

// Per-screen prop types for use in screen components.

export type SplashScreenProps = NativeStackScreenProps<RootStackParamList, 'Splash'>;
export type AuthEntryScreenProps = NativeStackScreenProps<RootStackParamList, 'AuthEntry'>;
export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'LoginScreen'>;
export type RegisterScreenProps = NativeStackScreenProps<RootStackParamList, 'RegisterScreen'>;
export type OnboardingStep1ScreenProps = NativeStackScreenProps<RootStackParamList, 'OnboardingStep1'>;
export type OnboardingStep2ScreenProps = NativeStackScreenProps<RootStackParamList, 'OnboardingStep2'>;
export type OnboardingStep3ScreenProps = NativeStackScreenProps<RootStackParamList, 'OnboardingStep3'>;
export type OnboardingStep4ScreenProps = NativeStackScreenProps<RootStackParamList, 'OnboardingStep4'>;

export type DiscoveryScreenProps = BottomTabScreenProps<MainTabParamList, 'Discovery'>;
export type MatchesScreenProps = BottomTabScreenProps<MainTabParamList, 'Matches'>;
export type EventsScreenProps = BottomTabScreenProps<MainTabParamList, 'Events'>;
export type ProfileScreenProps = BottomTabScreenProps<MainTabParamList, 'Profile'>;
export type EditProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;
export type BookingComposerScreenProps = NativeStackScreenProps<RootStackParamList, 'BookingComposer'>;
export type BookingDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>;
export type ReportScreenProps = NativeStackScreenProps<RootStackParamList, 'Report'>;

export type BattlesScreenProps = NativeStackScreenProps<RootStackParamList, 'Battles'>;
export type BattleDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'BattleDetail'>;
export type CreateBattleScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateBattle'>;
export type AttendanceCheckScreenProps = NativeStackScreenProps<RootStackParamList, 'AttendanceCheck'>;
export type ChallengeListScreenProps = NativeStackScreenProps<RootStackParamList, 'Challenges'>;
export type ChallengeDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'ChallengeDetail'>;
export type PublicProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'PublicProfile'>;
export type HonorGuideScreenProps = NativeStackScreenProps<RootStackParamList, 'HonorGuide'>;
export type SafetyCenterScreenProps = NativeStackScreenProps<RootStackParamList, 'SafetyCenter'>;
export type BlockedUsersScreenProps = NativeStackScreenProps<RootStackParamList, 'BlockedUsers'>;
