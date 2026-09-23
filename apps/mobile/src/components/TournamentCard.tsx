import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../lib/sports';
import { colors, radii, spacing, typography } from '../theme';
import type { TournamentSummary } from '@protin/shared-types';

interface TournamentCardProps {
  tournament: TournamentSummary;
  onPress: () => void;
}

function formatStartsAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Open';
  if (status === 'full') return 'Full';
  if (status === 'closed') return 'Closed';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  return status;
}

function statusColor(status: string): string {
  if (status === 'open') return colors.brand;
  if (status === 'full') return colors.textSecondary;
  if (status === 'cancelled') return colors.error;
  return colors.textTertiary;
}

export function TournamentCard({ tournament, onPress }: TournamentCardProps) {
  const startLabel = formatStartsAt(tournament.startsAt);
  const sportText = sportLabel(tournament.sport).toUpperCase();
  const showSpotsLeft = tournament.status === 'open' || tournament.status === 'full';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${tournament.title}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.sportPill}>{sportText}</Text>
        <Text
          style={[styles.statusPill, { color: statusColor(tournament.status) }]}
        >
          {statusLabel(tournament.status)}
        </Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {tournament.title}
      </Text>

      <Text style={styles.meta}>
        {startLabel}
        {tournament.area ? `  ·  ${tournament.area}` : ''}
      </Text>

      {showSpotsLeft ? (
        <View style={styles.spotsRow}>
          <Text style={styles.spotsValue}>{tournament.spotsLeft}</Text>
          <Text style={styles.spotsLabel}>
            {`${
              tournament.spotsLeft === 1 ? 'spot left' : 'spots left'
            }  ·  ${tournament.participantCount} / ${tournament.capacity} joined`}
          </Text>
        </View>
      ) : null}

      {tournament.hasJoined ? (
        <Text style={styles.joinedTag}>You are in</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sportPill: {
    ...typography.label,
    color: colors.textInverse,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  statusPill: {
    ...typography.label,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  spotsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  spotsValue: {
    ...typography.h3,
    color: colors.brand,
  },
  spotsLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  joinedTag: {
    ...typography.label,
    color: colors.brand,
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
