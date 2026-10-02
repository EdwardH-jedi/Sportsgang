/**
 * @protin/shared-types
 *
 * Shared TypeScript type contracts for the Protin platform.
 *
 * Import from this barrel in all consumers:
 *   import type { User, PartnerCard, Match } from '@protin/shared-types';
 *
 * Domain map:
 *   common          — primitives: UUID, ISODateString, Paginated, ApiError
 *   user            — User, auth request/response types
 *   sport-profile   — Sport, FitnessLevel, PreferredTime, GenderPreference,
 *                     UserProfile, IdentityPreferences, SportProfile
 *   discovery       — DiscoveryAction, DiscoveryFilter, PartnerCard,
 *                     DiscoveryFeedResponse, RecordActionRequest, RecordActionResponse
 *   booking         — Booking, BookingDetail, BookingStatus, CreateBookingRequest
 *   match           — Match, MatchStatus, MatchWithPartner, MatchListResponse
 *   chat            — Message, SendMessageRequest, MessageListResponse
 *   calendar        — AvailabilityWindow, CalendarSlot, CalendarSync types (future)
 */

export type {
  UUID,
  ISODateString,
  CurrencyCode,
  Timezone,
  GeoLocation,
  Paginated,
  ApiError,
} from './common';

export type {
  User,
  RegisterRequest,
  LoginRequest,
  AppleSignInRequest,
  TokenResponse,
  MeResponse,
} from './user';

export type {
  Sport,
  FitnessLevel,
  PreferredTime,
  GenderPreference,
  UserProfile,
  CreateUserProfileRequest,
  UpdateUserProfileRequest,
  IdentityPreferences,
  SetIdentityPreferencesRequest,
  SportProfile,
  UpsertSportProfileRequest,
  FocusSport,
  SportPreferencesVersion,
  GolfHandicapSource,
  GolfExperience,
  GolfPartnerIntent,
  GolfPreferredHoles,
  RunPaceMode,
  RunGroupStyle,
  SportPreferencesV2,
} from './sport-profile';

export type {
  DiscoveryAction,
  DiscoveryFilter,
  PartnerCard,
  DiscoveryFeedResponse,
  RecordActionRequest,
  RecordActionResponse,
  CompatibilityTier,
  CompatibilityNote,
  PartnerCompatibility,
  PartnerSportSummary,
} from './discovery';

export type {
  BookingStatus,
  BookingStatusFilter,
  BookingListFilter,
  Booking,
  CreateBookingRequest,
  BookingDetail,
  BookingListResponse,
} from './booking';

export type {
  MatchStatus,
  Match,
  MatchWithPartner,
  MatchListResponse,
  ArchiveMatchRequest,
} from './match';

export type {
  Message,
  SendMessageRequest,
  MessageListResponse,
} from './chat';

export type {
  AvailabilityWindow,
  CreateAvailabilityWindowRequest,
  CalendarSlot,
  CalendarProvider,
  CalendarSyncRequest,
  CalendarSyncStatus,
  CalendarExportRequest,
} from './calendar';

export type {
  GoogleCalendarStatus,
  SyncBookingResponse,
} from './google-calendar';

export type {
  PushPlatform,
  NotificationType,
  RegisterPushTokenRequest,
  PushTokenResponse,
  PushNotificationData,
} from './notifications';

export type {
  ReportReason,
  ReportTargetType,
  ReportStatus,
  CreateReportRequest,
  ReportResponse,
  ReportListResponse,
  BlockResponse,
  BlockListResponse,
  CreateBlockRequest,
} from './safety';

export type {
  Venue,
  NearbyVenuesResponse,
  NearbyVenuesQuery,
  PlaceDetailsResponse,
  VenueSourceMode,
  VenueSourceTag,
  VenueProviderStatus,
  VenueConfidence,
} from './venue';

export type {
  RankTier,
  SportRankSummary,
  RankSummary,
  HonorLevel,
  SportLevelSummary,
  HonorSummary,
} from './rank';

export type {
  RankProfileRead,
  RankingEntry,
  RankingListResponse,
  HonorTitleRead,
} from './honor-system';

export type {
  TournamentStatus,
  TournamentSummary,
  TournamentParticipantSummary,
  TournamentDetail,
  TournamentListResponse,
} from './tournament';

export type {
  EventMode,
  EventVisibility,
  EventStatus,
  EventHost,
  EventSummary,
  EventParticipantSummary,
  EventDetail,
  EventListResponse,
  CreateEventRequest,
  AttendanceStatus,
  SelfAttendanceStatus,
  ParticipantLifecycleStatus,
  AttendanceEntry,
  AttendanceListResponse,
  HostAttendanceUpdateRequest,
  SelfAttendanceRequest,
  RunSessionPaceMode,
  RunSessionDetails,
  TeeTimeStatus,
  GolfSessionDetails,
} from './event';

export type {
  ChallengeStatus,
  ChallengeRead,
  ChallengeListResponse,
  CreateChallengeRequest,
  SubmitChallengeResultRequest,
} from './challenge';
