import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FocusSport } from '@protin/shared-types';

export type SetupMode = 'onboarding' | 'add';

/**
 * Root stack — full-screen flows managed outside the tab bar.
 */
export type RootStackParamList = {
  Splash: undefined;
  AuthEntry: undefined;
  LoginScreen: undefined;
  RegisterScreen: undefined;
  OnboardingStep1: undefined;
  /**
   * v2 sport setup: identity (Step 1) → sports → per-sport details →
   * availability → Main. `mode: 'add'` reuses the flow from Profile to add
   * a second sport without touching the rest of the profile.
   */
  SetupSports: { mode: SetupMode } | undefined;
  SetupSportDetails: { mode: SetupMode; sports: FocusSport[]; index: number };
  SetupAvailability: { mode: SetupMode; sports: FocusSport[] };
  /** Edit one sport's v2 preferences (Profile / Explore setup prompt). */
  EditSportPreferences: { sport: FocusSport };
  /** Optional photos & bio (no longer a completion gate). */
  OnboardingStep2: undefined;
  /** Optional partner (identity) preferences — informational, not enforced. */
  OnboardingStep3: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  /**
   * Partner detail, opened from an Explore partner card. The card is read
   * from the discovery store by (userId, sport) so the feed and the detail
   * screen act on the same loaded data.
   */
  PartnerDetail: { userId: string; sport: FocusSport };
  CreateSession: { sport: FocusSport };
  SessionDetail: { eventId: string };
  EditProfile: undefined;
  Chat: { matchId: string; partnerName: string; partnerId: string; sport: string };
  BookingComposer: { matchId: string; sport: string };
  BookingDetail: { bookingId: string };
  Report: { reportedUserId: string; reportedName: string };
  Tournaments: undefined;
  TournamentDetail: { tournamentId: string };
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
  Explore: undefined;
  Plans: undefined;
  Chats: undefined;
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
export type SetupSportsScreenProps = NativeStackScreenProps<RootStackParamList, 'SetupSports'>;
export type SetupSportDetailsScreenProps = NativeStackScreenProps<RootStackParamList, 'SetupSportDetails'>;
export type SetupAvailabilityScreenProps = NativeStackScreenProps<RootStackParamList, 'SetupAvailability'>;
export type EditSportPreferencesScreenProps = NativeStackScreenProps<RootStackParamList, 'EditSportPreferences'>;
export type PartnerDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'PartnerDetail'>;
export type CreateSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'CreateSession'>;
export type SessionDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SessionDetail'>;

/** Tab screens can also push root-stack routes. */
type TabProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
export type ExploreScreenProps = TabProps<'Explore'>;
export type PlansScreenProps = TabProps<'Plans'>;
export type ChatsScreenProps = TabProps<'Chats'>;
export type ProfileScreenProps = TabProps<'Profile'>;
export type EditProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'EditProfile'>;

export type ChatScreenProps = NativeStackScreenProps<RootStackParamList, 'Chat'>;
export type BookingComposerScreenProps = NativeStackScreenProps<RootStackParamList, 'BookingComposer'>;
export type BookingDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'BookingDetail'>;
export type ReportScreenProps = NativeStackScreenProps<RootStackParamList, 'Report'>;

export type TournamentsScreenProps = NativeStackScreenProps<RootStackParamList, 'Tournaments'>;
export type TournamentDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'TournamentDetail'>;

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
