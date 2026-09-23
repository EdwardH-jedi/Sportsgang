import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { HonorCard } from '../../components/HonorCard';
import { LocalRankSection } from '../../components/LocalRankSection';
import { Screen } from '../../components/Screen';
import { useDeleteAccount } from '../../hooks/useAccount';
import { useHonorSummary } from '../../hooks/useHonorSummary';
import { useHonorSystem } from '../../hooks/useHonorSystem';
import { useUpcomingSessions } from '../../hooks/useUpcomingSessions';
import { openLegal, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../../lib/legal';
import { useAuthStore } from '../../stores/auth';
import { sportLabel, useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { Session } from '../../lib/sessions';
import type { RootStackParamList } from '../../navigation/types';

// ─── Upcoming sessions ───────────────────────────────────────────────────────
//
// v1 surface for "what did I just confirm?" — sits on the existing Profile
// card stack so we don't add a new bottom tab. useUpcomingSessions reuses
// GET /bookings's existing `status` filter (so no backend change here) and
// client-filters to future starts so a session that already happened drops
// off without any timezone math on the server.

type UpcomingSession = Session;

export function ProfileScreen() {
  const { logout } = useAuthStore();
  const { profile, sportProfiles, fetchProfile } = useProfileStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { deleteAccount } = useDeleteAccount();
  const {
    summary: honorSummary,
    isLoading: honorLoading,
    error: honorError,
  } = useHonorSummary();
  // Honor System (local champion titles) read-only surface. The
  // (sport, area) pair here is a temporary MVP default — replace with
  // the user's selected sport/location context once Profile exposes a
  // "primary sport + area" preference. The backend GET /rankings/me is
  // read-only and returns the default rank row without persisting, so
  // a brand-new user safely lands on the empty state.
  const {
    rank: localRank,
    localChampion,
    myTitles,
    isLoading: localRankLoading,
    error: localRankError,
  } = useHonorSystem({ sport: 'tennis', area: 'annandale' });
  // Local guard so a double-tap or repeat confirmation cannot fire
  // DELETE /auth/me twice. Also blocks Log out while a delete is mid-flight.
  // A ref (not state) is required because Alert button onPress callbacks close
  // over stale state — `.current` always reflects the latest value across
  // consecutive invocations.
  const isDeletingRef = useRef(false);

  useEffect(() => {
    fetchProfile()
      .catch((err) => {
        // 404 = profile not yet created — show prompt rather than error
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('404') && !msg.includes('not found')) {
          setError(msg || 'Failed to load profile.');
        }
      })
      .finally(() => setIsLoading(false));
  }, [fetchProfile]);

  // Confirmed bookings load on mount (inside useUpcomingSessions — called
  // after the profile effect above so request order is unchanged) AND on
  // every tab-focus so a brand-new accept (driven from chat) shows up the
  // moment the user navigates back to Profile. Failure is silent: Upcoming
  // is a secondary surface and the rest of the screen must keep rendering
  // even if /bookings is down.
  const { items: upcoming, refresh: fetchUpcoming } = useUpcomingSessions();
  useFocusEffect(
    useCallback(() => {
      void fetchUpcoming();
    }, [fetchUpcoming])
  );

  // Reset the root stack to AuthEntry. RootNavigator's auth-state effect also
  // forces this when `token` transitions to null, but we keep this explicit
  // reset on the success path so navigation lands instantly without waiting
  // on the store -> effect cycle.
  const resetToAuthEntry = useCallback(() => {
    const parent = navigation.getParent();
    (parent ?? navigation).reset({ index: 0, routes: [{ name: 'AuthEntry' }] });
  }, [navigation]);

  const handleLogout = useCallback(async () => {
    if (isDeletingRef.current) return;
    await logout();
    resetToAuthEntry();
  }, [logout, resetToAuthEntry]);

  const handleDeleteAccount = useCallback(() => {
    if (isDeletingRef.current) return;
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, matches, chat history, and bookings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            // The Alert button can fire twice if the OS retains a stale onPress
            // over a long press. Read the ref instead of state — the React
            // closure captures stale state, but .current always reflects the
            // latest value across consecutive invocations.
            if (isDeletingRef.current) return;
            isDeletingRef.current = true;
            try {
              await deleteAccount();
              // Order matters: clear local session first (logout drops the
              // token + resets the profile store), then reset navigation so
              // we never re-render Profile against stale state.
              await logout();
              resetToAuthEntry();
            } catch (err) {
              // Failure must NOT logout — the account still exists on the
              // server, the user must stay signed in to retry.
              Alert.alert(
                'Delete failed',
                err instanceof Error
                  ? err.message
                  : "Couldn't delete your account. Please try again or contact support."
              );
            } finally {
              isDeletingRef.current = false;
            }
          },
        },
      ]
    );
  }, [logout, resetToAuthEntry, deleteAccount]);

  if (isLoading) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* SportsGang brand banner — neon-lime hero with the avatar overlapping
            the bottom edge. The bannerOverlay supplies a subtle deeper-lime tint
            so the band reads as a brand block, not a flat fill. */}
        <View style={styles.banner}>
          <View style={styles.bannerOverlay} />
          <View style={styles.bannerHeader}>
            <Text style={styles.bannerEyebrow}>Account</Text>
            {profile ? (
              <Pressable
                onPress={() => navigation.navigate('EditProfile')}
                style={({ pressed }) => [styles.editChip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Text style={styles.editChipText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Avatar + name block — overlaps the banner via negative top margin.
            We keep the page title `Profile` for parity with the reference page
            structure even though the banner now carries the brand. */}
        <View style={styles.identityBlock}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.displayName?.charAt(0).toUpperCase() ?? '·'}
              </Text>
            </View>
          </View>

          <Text style={styles.pageTitle}>Profile</Text>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : profile ? (
            <>
              <Text style={styles.displayName}>{profile.displayName}</Text>
              {profile.suburb ? (
                <Text style={styles.suburb}>{profile.suburb}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>Profile not set up</Text>
              <Text style={styles.emptyBody}>
                Complete onboarding to build your workout partner profile.
              </Text>
            </View>
          )}
        </View>

        {/* Profile content cards — only shown when a profile exists. */}
        {!error && profile ? (
          <View style={styles.cardStack}>
            <HonorCard
              summary={honorSummary}
              isLoading={honorLoading}
              error={honorError}
            />

            <LocalRankSection
              sport="tennis"
              area="annandale"
              rank={localRank}
              localChampion={localChampion}
              myTitles={myTitles}
              isLoading={localRankLoading}
              error={localRankError}
            />

            {profile.bio ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>About</Text>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </View>
            ) : null}

            {sportProfiles && sportProfiles.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Sports</Text>
                <View style={styles.sportList}>
                  {sportProfiles.map((sp) => (
                    <View key={sp.sport} style={styles.sportRow}>
                      <Text style={styles.sportName}>
                        {sportLabel(sp.sport)}
                      </Text>
                      <Text style={styles.sportLevel}>
                        {sp.level.charAt(0).toUpperCase() + sp.level.slice(1)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

          </View>
        ) : null}

        <View style={styles.cardStack}>
          {/* Upcoming sessions — confirmed bookings only, sorted earliest
              first. Pending proposals stay in chat (S2); declined and past
              sessions are filtered out so the section stays a calm, simple
              "what's actually happening next" surface. */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Upcoming sessions</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.upcomingEmpty}>No confirmed sessions yet.</Text>
            ) : (
              <View style={styles.upcomingList}>
                {upcoming.map((s) => (
                  <UpcomingSessionRow
                    key={s.id}
                    session={s}
                    onPress={() =>
                      navigation.navigate('BookingDetail', { bookingId: s.id })
                    }
                  />
                ))}
              </View>
            )}
          </View>

          {/* Guides — how Honor works + safety basics */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Guides</Text>
            <View style={styles.legalList}>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => navigation.navigate('HonorGuide')}
                accessibilityRole="link"
                accessibilityLabel="Honor Guide"
              >
                <Text style={styles.legalRowText}>Honor Guide</Text>
                <Text style={styles.legalRowSubText}>
                  How Honor, Gang Score, and Sport Levels work
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => navigation.navigate('SafetyCenter')}
                accessibilityRole="link"
                accessibilityLabel="Safety Center"
              >
                <Text style={styles.legalRowText}>Safety Center</Text>
                <Text style={styles.legalRowSubText}>
                  Reports, blocking, and community rules
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Legal */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Legal</Text>
            <View style={styles.legalList}>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => openLegal(PRIVACY_URL, 'Privacy Policy')}
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy"
              >
                <Text style={styles.legalRowText}>Privacy Policy</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => openLegal(TERMS_URL, 'Terms of Service')}
                accessibilityRole="link"
                accessibilityLabel="Terms of Service"
              >
                <Text style={styles.legalRowText}>Terms of Service</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.legalRow, pressed && styles.pressed]}
                onPress={() => openLegal(SUPPORT_URL, 'Support')}
                accessibilityRole="link"
                accessibilityLabel="Support"
              >
                <Text style={styles.legalRowText}>Support</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Account actions */}
        <View style={styles.actionStack}>
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            <Text style={styles.deleteText}>Delete my account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function formatUpcomingDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatUpcomingTimeRange(startsAt: string, endsAt: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${new Date(startsAt).toLocaleTimeString(undefined, opts)}–${new Date(
    endsAt
  ).toLocaleTimeString(undefined, opts)}`;
}

function upcomingVenueLine(s: UpcomingSession): string | null {
  if (s.venue?.name) {
    const where = s.venue.address ?? s.venue.area;
    return where ? `${s.venue.name} · ${where}` : s.venue.name;
  }
  return s.location?.trim() ? s.location : null;
}

/**
 * Compact row inside the Upcoming sessions card. Tap → BookingDetail
 * (where the existing Cancel / Mark completed / Record no-show actions
 * live; this row deliberately does NOT duplicate them).
 */
function UpcomingSessionRow({
  session,
  onPress,
}: {
  session: UpcomingSession;
  onPress: () => void;
}) {
  const sport = sportLabel(session.sport);
  const date = formatUpcomingDate(session.startsAt);
  const time = formatUpcomingTimeRange(session.startsAt, session.endsAt);
  const venue = upcomingVenueLine(session);
  const partnerName = session.partner.displayName || 'Partner';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open upcoming ${sport.toLowerCase()} session with ${partnerName}`}
      style={({ pressed }) => [styles.upcomingRow, pressed && styles.pressed]}
    >
      <View style={styles.upcomingRowHeader}>
        <Text style={styles.upcomingSport}>{sport}</Text>
        <View style={[styles.statusPill, { borderColor: colors.success }]}>
          <Text style={[styles.statusPillText, { color: colors.success }]}>
            CONFIRMED
          </Text>
        </View>
      </View>
      <Text style={styles.upcomingWhen}>
        {date} · {time}
      </Text>
      {venue ? (
        <Text style={styles.upcomingVenue} numberOfLines={2}>
          {venue}
        </Text>
      ) : null}
      <Text style={styles.upcomingPartner}>With {partnerName}</Text>
    </Pressable>
  );
}

const BANNER_HEIGHT = 168;
const AVATAR_SIZE = 104;

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
    backgroundColor: colors.surfaceElevated,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Hero banner
  banner: {
    height: BANNER_HEIGHT,
    backgroundColor: colors.brand,
    overflow: 'hidden',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brandDark,
    opacity: 0.35,
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  bannerEyebrow: {
    ...typography.label,
    color: colors.textInverse,
  },
  editChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  editChipText: {
    ...typography.label,
    color: colors.textInverse,
    letterSpacing: 0.6,
  },

  // Identity block (overlaps banner)
  identityBlock: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: -AVATAR_SIZE / 2,
  },
  avatarRing: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textInverse,
  },
  pageTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  displayName: {
    ...typography.h1,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  suburb: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  // Card stack
  cardStack: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  bioText: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  sportList: {
    gap: spacing.sm,
  },
  sportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  sportName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sportLevel: {
    ...typography.body,
    color: colors.brand,
    fontWeight: '600',
  },

  // Upcoming sessions
  upcomingEmpty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  upcomingList: {
    gap: spacing.sm,
  },
  upcomingRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    gap: 2,
  },
  upcomingRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 2,
  },
  upcomingSport: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  upcomingWhen: {
    ...typography.body,
    color: colors.textPrimary,
  },
  upcomingVenue: {
    ...typography.body,
    color: colors.textSecondary,
  },
  upcomingPartner: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusPillText: {
    ...typography.label,
    letterSpacing: 0.6,
  },

  // Integrations
  integrationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  integrationLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  integrationAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  integrationActionText: {
    ...typography.label,
    color: colors.error,
  },
  integrationButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
  },
  integrationButtonText: {
    ...typography.button,
    color: colors.brand,
  },
  integrationDisabled: {
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  integrationDisabledTitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  integrationDisabledBody: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  integrationErrorText: {
    ...typography.bodySmall,
    color: colors.error,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Legal
  legalList: {
    gap: spacing.xs,
  },
  legalRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  legalRowText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  legalRowSubText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Account actions
  actionStack: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  logoutText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  deleteButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteText: {
    ...typography.button,
    color: colors.error,
  },
  pressed: {
    opacity: 0.65,
  },
});
