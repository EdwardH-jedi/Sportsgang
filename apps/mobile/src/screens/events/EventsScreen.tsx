import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { SessionProposalCard } from '../../components/SessionProposalCard';
import {
  acceptSession,
  declineSession,
  fetchPendingSessions,
  fetchUpcomingSessions,
  type Session,
} from '../../lib/sessions';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

/**
 * Events tab — single home for "what's actually happening with my
 * sessions?". Two sections, both fed by the existing /bookings list:
 *
 *   Upcoming sessions  → confirmed future sessions
 *   Pending proposals  → still in the proposed state, partitioned by
 *                        whether the signed-in user is the receiver or
 *                        the proposer
 *
 * Cancelled and declined bookings are intentionally hidden in v1; the
 * chat already shows the terminal state and Profile keeps a calm
 * Upcoming preview. Past sessions are filtered out client-side so the
 * tab matches the "what's next" mental model.
 */
export function EventsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [pending, setPending] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Run both fetches in parallel — pending and upcoming are independent
    // queries, so we never block one on the other. Failures are silent so
    // a flaky /bookings doesn't blank the screen; the empty state is the
    // graceful fallback.
    const [up, pen] = await Promise.allSettled([
      fetchUpcomingSessions(),
      fetchPendingSessions(),
    ]);
    if (up.status === 'fulfilled') setUpcoming(up.value);
    else setUpcoming([]);
    if (pen.status === 'fulfilled') setPending(pen.value);
    else setPending([]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        setIsLoading(true);
        await load();
        if (!cancelled) setIsLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await load();
    } finally {
      setIsRefreshing(false);
    }
  }, [load]);

  const handleAction = useCallback(
    async (sessionId: string, action: 'confirm' | 'decline') => {
      if (actingId) return;
      setActingId(sessionId);
      try {
        if (action === 'confirm') {
          await acceptSession(sessionId);
        } else {
          await declineSession(sessionId);
        }
        // Re-pull both lists so the just-updated row moves between
        // sections (or disappears) without us hand-mutating local state.
        await load();
      } catch (err) {
        Alert.alert(
          "Couldn't update this session.",
          err instanceof Error
            ? err.message
            : "Couldn't update this session. Please try again."
        );
      } finally {
        setActingId(null);
      }
    },
    [actingId, load]
  );

  // Split pending into incoming (the user is the receiver -> show
  // Accept/Decline) vs outgoing (proposer -> Awaiting confirmation). The
  // SessionProposalCard already branches on currentUserId; this split is
  // here so the section ordering is deterministic — incoming first since
  // it usually demands action.
  const incomingPending = pending.filter(
    (p) => currentUserId !== null && p.partnerId === currentUserId
  );
  const outgoingPending = pending.filter(
    (p) => currentUserId !== null && p.proposerId === currentUserId
  );

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
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Sessions</Text>
          <Text style={styles.title}>Events</Text>
        </View>

        {/* ── Battles entry card ──────────────────────────────────────── */}
        <View style={styles.battlesCardWrap}>
          <Pressable
            onPress={() => navigation.navigate('Battles')}
            accessibilityRole="button"
            accessibilityLabel="Open Battles"
            style={({ pressed }) => [
              styles.battlesCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.battlesCardText}>
              <Text style={styles.battlesEyebrow}>THIS WEEK</Text>
              <Text style={styles.battlesTitle}>Find a battle</Text>
              <Text style={styles.battlesSub}>
                Casual or ranked. Join a group game in your area.
              </Text>
            </View>
            <Text style={styles.battlesArrow}>{'→'}</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Challenges')}
            accessibilityRole="button"
            accessibilityLabel="Open Challenges"
            style={({ pressed }) => [
              styles.challengesCard,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.battlesCardText}>
              <Text style={styles.challengesEyebrow}>1-ON-1</Text>
              <Text style={styles.battlesTitle}>Challenges</Text>
              <Text style={styles.battlesSub}>
                Verified head-to-head results count toward Honor and Rank.
              </Text>
            </View>
            <Text style={styles.challengesArrow}>{'→'}</Text>
          </Pressable>
        </View>

        {/* ── Upcoming sessions ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming sessions</Text>
          {upcoming.length === 0 ? (
            <Text style={styles.emptyText}>No confirmed sessions yet.</Text>
          ) : (
            <View style={styles.list}>
              {upcoming.map((s) => (
                <UpcomingRow
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

        {/* ── Pending proposals ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending proposals</Text>
          {incomingPending.length + outgoingPending.length === 0 ? (
            <Text style={styles.emptyText}>No pending proposals.</Text>
          ) : (
            <View style={styles.list}>
              {[...incomingPending, ...outgoingPending].map((p) => (
                <SessionProposalCard
                  key={p.id}
                  proposal={p}
                  currentUserId={currentUserId ?? ''}
                  isActing={actingId === p.id}
                  onAccept={() => handleAction(p.id, 'confirm')}
                  onDecline={() => handleAction(p.id, 'decline')}
                  onView={() =>
                    navigation.navigate('BookingDetail', { bookingId: p.id })
                  }
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Upcoming compact row ────────────────────────────────────────────────────

function formatUpcomingDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
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

function venueLineFor(s: Session): string | null {
  if (s.venue?.name) {
    const where = s.venue.address ?? s.venue.area;
    return where ? `${s.venue.name} · ${where}` : s.venue.name;
  }
  return s.location?.trim() ? s.location : null;
}

function UpcomingRow({
  session,
  onPress,
}: {
  session: Session;
  onPress: () => void;
}) {
  const sport = sportLabel(session.sport);
  const partnerName = session.partner.displayName || 'Partner';
  const venue = venueLineFor(session);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open upcoming ${sport.toLowerCase()} session with ${partnerName}`}
      style={({ pressed }) => [styles.upcomingRow, pressed && styles.pressed]}
    >
      <View style={styles.upcomingHeader}>
        <Text style={styles.upcomingSport}>{sport}</Text>
        <View style={[styles.statusPill, { borderColor: colors.success }]}>
          <Text style={[styles.statusPillText, { color: colors.success }]}>
            CONFIRMED
          </Text>
        </View>
      </View>
      <Text style={styles.upcomingWhen}>
        {formatUpcomingDate(session.startsAt)} ·{' '}
        {formatUpcomingTimeRange(session.startsAt, session.endsAt)}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.sm,
  },
  upcomingRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    gap: 2,
  },
  upcomingHeader: {
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
  pressed: { opacity: 0.65 },
  battlesCardWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  battlesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brand,
    gap: spacing.md,
  },
  battlesCardText: {
    flex: 1,
    gap: 2,
  },
  battlesEyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  battlesTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  battlesSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  battlesArrow: {
    fontSize: 22,
    color: colors.brand,
  },
  challengesCard: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  challengesEyebrow: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 1.2,
  },
  challengesArrow: {
    fontSize: 22,
    color: colors.textSecondary,
  },
});
