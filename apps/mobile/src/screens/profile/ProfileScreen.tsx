import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { HonorCard } from '../../components/HonorCard';
import { LocalRankSection } from '../../components/LocalRankSection';
import { FormErrorBanner } from '../../components/FormErrorBanner';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  Skeleton,
  StatBlock,
  sportIconName,
} from '../../components/ui';
import { useDeleteAccount } from '../../hooks/useAccount';
import { useHonorSummary } from '../../hooks/useHonorSummary';
import { useHonorSystem } from '../../hooks/useHonorSystem';
import { useUpcomingSessions } from '../../hooks/useUpcomingSessions';
import { formatMonthShort, formatWhenRange } from '../../lib/format';
import { areaFromSuburb, primarySport } from '../../lib/honorSystem';
import { openLegal, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../../lib/legal';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { useProfileStore } from '../../stores/profile';
import { colors, layout, radii, spacing, touchTarget, typography } from '../../theme';
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
  // Honor System (local champion titles) read-only surface, scoped to the
  // user's primary sport (first sport profile, else the registry default)
  // and their suburb as the area key. No fetch until the profile has a
  // suburb. The backend GET /rankings/me is read-only and returns the
  // default rank row without persisting, so a brand-new user safely lands
  // on the empty state.
  const honorSport = primarySport(sportProfiles);
  const honorArea = areaFromSuburb(profile?.suburb);
  const {
    rank: localRank,
    localChampion,
    myTitles,
    isLoading: localRankLoading,
    error: localRankError,
  } = useHonorSystem({
    sport: honorSport,
    area: honorArea ?? '',
    enabled: honorArea !== null,
  });
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
      <Screen padded={false}>
        <ProfileSkeleton />
      </Screen>
    );
  }

  const stats = [
    {
      value: honorSummary ? honorSummary.completedGamesCount : EMPTY_STAT,
      label: 'Completed',
      icon: 'finish' as const,
    },
    { value: honorSummary ? honorSummary.honorScore : EMPTY_STAT, label: 'Honor', icon: 'award' as const },
    { value: upcoming.length, label: 'Upcoming', icon: 'calendar' as const },
  ];

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Header
          large
          title="Profile"
          actions={
            profile
              ? [
                  {
                    icon: 'edit',
                    accessibilityLabel: 'Edit profile',
                    onPress: () => navigation.navigate('EditProfile'),
                  },
                ]
              : []
          }
        />

        {/* Identity */}
        <View style={styles.identity}>
          {error ? (
            <FormErrorBanner message={error} style={styles.fill} />
          ) : profile ? (
            <>
              <Avatar
                name={profile.displayName || 'You'}
                uri={profile.avatarUrl}
                size="xl"
                ring
              />
              <View style={styles.identityText}>
                <Text style={styles.displayName} numberOfLines={2}>
                  {profile.displayName}
                </Text>
                {profile.suburb ? (
                  <View style={styles.suburbRow}>
                    <Icon name="location" size="sm" color={colors.textSecondary} />
                    <Text style={styles.suburb}>{profile.suburb}</Text>
                  </View>
                ) : null}
                {sportProfiles && sportProfiles.length > 0 ? (
                  <View style={styles.sportBadges}>
                    {sportProfiles.map((sp) => (
                      <Badge
                        key={sp.sport}
                        tone="brand"
                        icon={sportIconName(sp.sport)}
                        label={`${sportLabel(sp.sport)} · ${capitalize(sp.level)}`}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <EmptyState
              compact
              icon="profile"
              title="Profile not set up"
              message="Complete onboarding to build your training partner profile."
              style={styles.fill}
            />
          )}
        </View>

        {!error && profile ? (
          <Card variant="elevated" padding="md" style={styles.statsCard}>
            {stats.map((st) => (
              <StatBlock
                key={st.label}
                value={st.value}
                label={st.label}
                icon={st.icon}
                align="center"
                accent={st.label === 'Honor'}
                style={styles.stat}
              />
            ))}
          </Card>
        ) : null}

        <View style={styles.sections}>
          {!error && profile?.bio ? (
            <Section title="About">
              <Card>
                <Text style={styles.bioText}>{profile.bio}</Text>
              </Card>
            </Section>
          ) : null}

          <Section title="Crews">
            <Card padding="none">
              <ListRow
                icon="crew"
                title="Your crews"
                subtitle="Run with your crew and find new ones"
                accessibilityLabel="Your crews"
                onPress={() => navigation.navigate('Main', { screen: 'Crews' })}
              />
            </Card>
          </Section>

          {/* Upcoming sessions — confirmed bookings only, sorted earliest
              first. Pending proposals stay in chat (S2); declined and past
              sessions are filtered out so the section stays a calm, simple
              "what's actually happening next" surface. */}
          <Section title="Upcoming sessions">
            {upcoming.length === 0 ? (
              <Card>
                <View style={styles.upcomingEmpty}>
                  <Icon name="calendar" size="md" color={colors.textTertiary} />
                  <Text style={styles.upcomingEmptyText}>No confirmed sessions yet.</Text>
                </View>
              </Card>
            ) : (
              <Card padding="none">
                {upcoming.map((s, i) => (
                  <UpcomingSessionRow
                    key={s.id}
                    session={s}
                    divider={i < upcoming.length - 1}
                    onPress={() =>
                      navigation.navigate('BookingDetail', { bookingId: s.id })
                    }
                  />
                ))}
              </Card>
            )}
          </Section>

          {!error && profile ? (
            <Section title="Honor & rank">
              <HonorCard
                summary={honorSummary}
                isLoading={honorLoading}
                error={honorError}
              />
              {honorArea !== null && profile.suburb ? (
                <LocalRankSection
                  sport={honorSport}
                  // Display form (e.g. "Balmain East"); the hook gets the key.
                  area={profile.suburb.trim()}
                  rank={localRank}
                  localChampion={localChampion}
                  myTitles={myTitles}
                  isLoading={localRankLoading}
                  error={localRankError}
                />
              ) : null}
            </Section>
          ) : null}

          {/* Games & challenges — the former Events tab's entry points:
              Battles (group games in every sport) and 1-on-1 Challenges. */}
          <Section title="Games & challenges">
            <Card padding="none">
              <ListRow
                icon="battle"
                title="Battles"
                subtitle="Casual or ranked group games in your area"
                accessibilityLabel="Open Battles"
                onPress={() => navigation.navigate('Battles')}
              />
              <RowDivider />
              <ListRow
                icon="trophy"
                title="Challenges"
                subtitle="1-on-1 results that count toward Honor and Rank"
                accessibilityLabel="Open Challenges"
                onPress={() => navigation.navigate('Challenges')}
              />
            </Card>
          </Section>

          {/* Guides + safety tools */}
          <Section title="Guides & safety">
            <Card padding="none">
              <ListRow
                icon="award"
                title="Honor Guide"
                subtitle="How Honor, Gang Score, and Sport Levels work"
                accessibilityLabel="Honor Guide"
                onPress={() => navigation.navigate('HonorGuide')}
              />
              <RowDivider />
              <ListRow
                icon="shield"
                title="Safety Center"
                subtitle="Reports, blocking, and community rules"
                accessibilityLabel="Safety Center"
                onPress={() => navigation.navigate('SafetyCenter')}
              />
              <RowDivider />
              <ListRow
                icon="block"
                title="Blocked users"
                subtitle="Review and unblock people"
                accessibilityLabel="Blocked users"
                onPress={() => navigation.navigate('BlockedUsers')}
              />
            </Card>
          </Section>

          {__DEV__ ? (
            // Development builds only: design-system review screen.
            <Section title="Developer">
              <Card padding="none">
                <ListRow
                  icon="settings"
                  title="UI gallery"
                  subtitle="Every design-system primitive and variant"
                  onPress={() => navigation.navigate('UiGallery')}
                />
              </Card>
            </Section>
          ) : null}

          <Section title="Legal">
            <Card padding="none">
              <ListRow
                icon="lock"
                title="Privacy Policy"
                accessibilityLabel="Privacy Policy"
                trailing={<Icon name="external-link" size="sm" color={colors.textTertiary} />}
                chevron={false}
                onPress={() => openLegal(PRIVACY_URL, 'Privacy Policy')}
              />
              <RowDivider />
              <ListRow
                icon="info"
                title="Terms of Service"
                accessibilityLabel="Terms of Service"
                trailing={<Icon name="external-link" size="sm" color={colors.textTertiary} />}
                chevron={false}
                onPress={() => openLegal(TERMS_URL, 'Terms of Service')}
              />
              <RowDivider />
              <ListRow
                icon="help"
                title="Support"
                accessibilityLabel="Support"
                trailing={<Icon name="external-link" size="sm" color={colors.textTertiary} />}
                chevron={false}
                onPress={() => openLegal(SUPPORT_URL, 'Support')}
              />
            </Card>
          </Section>

          <Section title="Account">
            <Card padding="none">
              <ListRow
                icon="logout"
                iconColor={colors.textPrimary}
                title="Log out"
                accessibilityLabel="Log out"
                chevron={false}
                onPress={handleLogout}
              />
              <RowDivider />
              <ListRow
                icon="trash"
                title="Delete my account"
                accessibilityLabel="Delete my account"
                destructive
                chevron={false}
                onPress={handleDeleteAccount}
              />
            </Card>
          </Section>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Shown in a stat when the value isn't available yet (no invented zeros). */
const EMPTY_STAT = '–';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

function ProfileSkeleton() {
  return (
    <View
      style={styles.skeleton}
      accessible
      accessibilityLabel="Loading profile"
      accessibilityState={{ busy: true }}
      testID="profile-loading"
    >
      <Skeleton width="40%" height={spacing.xl + spacing.xs} />
      <View style={styles.identity}>
        <Skeleton circle height={AVATAR_XL} />
        <View style={styles.identityText}>
          <Skeleton width="70%" height={spacing.lg} />
          <Skeleton width="40%" height={spacing.md} />
        </View>
      </View>
      <Skeleton height={spacing.xxxl + spacing.lg} radius={radii.lg} />
      <Skeleton height={spacing.xxxl} radius={radii.lg} />
      <Skeleton height={spacing.xxxl} radius={radii.lg} />
    </View>
  );
}

function upcomingVenueLine(s: UpcomingSession): string | null {
  if (s.venue?.name) {
    const where = s.venue.address ?? s.venue.area;
    return where ? `${s.venue.name} · ${where}` : s.venue.name;
  }
  return s.location?.trim() ? s.location : null;
}

/**
 * Row inside the Upcoming sessions card: a condensed date tile, sport,
 * time, venue and partner. Tap → BookingDetail (where the existing
 * Cancel / Mark completed / Record no-show actions live; this row
 * deliberately does NOT duplicate them).
 */
function UpcomingSessionRow({
  session,
  onPress,
  divider,
}: {
  session: UpcomingSession;
  onPress: () => void;
  divider: boolean;
}) {
  const sport = sportLabel(session.sport);
  const start = new Date(session.startsAt);
  const when = formatWhenRange(session.startsAt, session.endsAt);
  const venue = upcomingVenueLine(session);
  const partnerName = session.partner.displayName || 'Partner';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open upcoming ${sport.toLowerCase()} session with ${partnerName}`}
      style={({ pressed }) => [
        styles.upcomingRow,
        divider && styles.upcomingDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.dateTile}>
        <Text style={styles.dateTileDay}>{start.getDate()}</Text>
        <Text style={styles.dateTileMonth}>
          {formatMonthShort(start)}
        </Text>
      </View>
      <View style={styles.upcomingBody}>
        <View style={styles.upcomingRowHeader}>
          <Icon name={sportIconName(session.sport)} size="sm" color={colors.brand} />
          <Text style={styles.upcomingSport}>{sport}</Text>
          <Badge label="CONFIRMED" tone="success" size="sm" style={styles.upcomingBadge} />
        </View>
        <Text style={styles.upcomingWhen}>{when}</Text>
        {venue ? (
          <Text style={styles.upcomingVenue} numberOfLines={2}>
            {venue}
          </Text>
        ) : null}
        <Text style={styles.upcomingPartner}>With {partnerName}</Text>
      </View>
      <Icon name="chevron-right" size="md" color={colors.textTertiary} />
    </Pressable>
  );
}

/** Avatar `xl` diameter — the loading skeleton mirrors it. */
const AVATAR_XL = 88;

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  fill: {
    flex: 1,
  },
  skeleton: {
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + spacing.xs,
    paddingHorizontal: layout.screenPadding,
  },
  identityText: {
    flex: 1,
    gap: spacing.xs + spacing.xs / 2,
  },
  displayName: {
    ...typography.h2,
  },
  suburbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  suburb: {
    ...typography.body,
  },
  sportBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + spacing.xs / 2,
    marginTop: spacing.xs,
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
  },
  sections: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm + spacing.xs,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing.md,
  },
  bioText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  upcomingEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  upcomingEmptyText: {
    ...typography.body,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  upcomingDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  dateTile: {
    width: touchTarget + spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
  },
  dateTileDay: {
    ...typography.statSmall,
  },
  dateTileMonth: {
    ...typography.label,
    color: colors.brand,
  },
  upcomingBody: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  upcomingRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + spacing.xs / 2,
  },
  upcomingSport: {
    ...typography.bodyStrong,
  },
  upcomingBadge: {
    marginLeft: 'auto',
  },
  upcomingWhen: {
    ...typography.body,
    color: colors.textPrimary,
  },
  upcomingVenue: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  upcomingPartner: {
    ...typography.bodySmall,
  },
});
