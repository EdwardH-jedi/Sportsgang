import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useTournamentDetail } from '../../hooks/useTournaments';
import { sportLabel } from '../../lib/sports';
import { colors, radii, spacing, typography } from '../../theme';
import type { TournamentDetailScreenProps } from '../../navigation/types';

function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Open for joining';
  if (status === 'full') return 'Full';
  if (status === 'closed') return 'Registration closed';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return status;
}

export function TournamentDetailScreen({ route, navigation }: TournamentDetailScreenProps) {
  const { tournamentId } = route.params;
  const { detail, isLoading, error, join, leave, refresh } = useTournamentDetail({
    tournamentId,
  });
  const [isActing, setIsActing] = useState(false);

  const handleJoin = useCallback(async () => {
    setIsActing(true);
    try {
      await join();
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setIsActing(false);
    }
  }, [join]);

  const handleLeave = useCallback(() => {
    Alert.alert(
      'Leave tournament?',
      'Your spot will be freed up for someone else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsActing(true);
            try {
              await leave();
            } catch (err) {
              Alert.alert('Could not leave', err instanceof Error ? err.message : 'Action failed.');
            } finally {
              setIsActing(false);
            }
          },
        },
      ]
    );
  }, [leave]);

  if (isLoading && !detail) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <Text style={styles.errorText}>{error ?? 'Tournament not found.'}</Text>
          <Pressable
            onPress={refresh}
            accessibilityRole="button"
            accessibilityLabel="Retry loading tournament"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const isJoinable = detail.status === 'open' && !detail.hasJoined && detail.spotsLeft > 0;
  const canLeave = detail.hasJoined && detail.status !== 'completed' && detail.status !== 'cancelled';

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Tournament</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <Text style={styles.sportTag}>{sportLabel(detail.sport).toUpperCase()}</Text>
          <Text style={styles.title}>{detail.title}</Text>
          <Text style={styles.statusText}>{statusLabel(detail.status)}</Text>
        </View>

        <View style={styles.section}>
          <DetailRow label="Starts" value={formatStartsAt(detail.startsAt)} />
          {detail.area ? <DetailRow label="Area" value={detail.area} /> : null}
          <DetailRow
            label="Players"
            value={`${detail.participantCount} / ${detail.capacity}`}
          />
          {detail.spotsLeft > 0 && detail.status === 'open' ? (
            <DetailRow
              label="Spots left"
              value={String(detail.spotsLeft)}
            />
          ) : null}
        </View>

        {detail.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description}>{detail.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Players in</Text>
          {detail.participants.length === 0 ? (
            <Text style={styles.empty}>No one has joined yet — be the first.</Text>
          ) : (
            // Plain ordered list — no seed numbers, no rounds, no bracket.
            // Brackets are not implemented; the UI must not imply they are.
            <View style={styles.participantList}>
              {detail.participants.map((p) => (
                <View key={p.userId} style={styles.participantRow}>
                  <Text style={styles.participantName}>{p.displayName}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          {isJoinable ? (
            <Pressable
              onPress={handleJoin}
              disabled={isActing}
              accessibilityRole="button"
              accessibilityLabel="Join tournament"
              style={({ pressed }) => [
                styles.joinButton,
                (pressed || isActing) && styles.pressed,
              ]}
            >
              {isActing ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.joinButtonText}>Join</Text>
              )}
            </Pressable>
          ) : null}

          {canLeave ? (
            <Pressable
              onPress={handleLeave}
              disabled={isActing}
              accessibilityRole="button"
              accessibilityLabel="Leave tournament"
              style={({ pressed }) => [
                styles.leaveButton,
                (pressed || isActing) && styles.pressed,
              ]}
            >
              <Text style={styles.leaveButtonText}>Leave tournament</Text>
            </Pressable>
          ) : null}

          {!isJoinable && !canLeave ? (
            <Text style={styles.notJoinableHint}>
              {detail.status === 'full'
                ? 'This tournament is full.'
                : detail.status === 'closed'
                  ? 'Registration is closed.'
                  : detail.status === 'completed'
                    ? 'This tournament has ended.'
                    : detail.status === 'cancelled'
                      ? 'This tournament was cancelled.'
                      : ''}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  backText: { fontSize: 22, color: colors.textPrimary },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  titleBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  sportTag: {
    ...typography.label,
    color: colors.brand,
  },
  title: {
    ...typography.h1,
    fontSize: 26,
    color: colors.textPrimary,
  },
  statusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  detailLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  participantList: {
    gap: spacing.xs,
  },
  participantRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  participantName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  joinButton: {
    backgroundColor: colors.brand,
    // Pill keeps tournament-detail's primary CTA visually identical to
    // BattleDetailScreen's join CTA.
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  joinButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  leaveButtonText: {
    ...typography.button,
    color: colors.error,
  },
  notJoinableHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.brand,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  pressed: { opacity: 0.65 },
});
