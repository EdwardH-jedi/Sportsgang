import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import { Card, Icon, Skeleton, StatBlock } from './ui';
import type { HonorTitleRead, RankProfileRead } from '../lib/honorSystem';

interface LocalRankSectionProps {
  sport: string;
  area: string;
  rank: RankProfileRead | null;
  localChampion: HonorTitleRead | null;
  myTitles: HonorTitleRead[];
  isLoading?: boolean;
  error?: string | null;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Read-only Local Rank / Honor section for the Profile screen.
 *
 * Surfaces:
 *   - caller's rating, wins/losses, current win streak for (sport, area)
 *   - any local champion titles the caller currently holds
 *
 * Empty-state copy is intentionally calm and does NOT promise users
 * they can submit results manually — the public Honor System API is
 * read-only and the only legitimate writer is a future verified
 * challenge / tournament / group-event result hook. Do not change this
 * copy to imply a manual-submission flow.
 */
export function LocalRankSection({
  sport,
  area,
  rank,
  localChampion,
  myTitles,
  isLoading = false,
  error,
}: LocalRankSectionProps) {
  const heading = `${capitalize(area)} ${capitalize(sport)} Rank`;
  const isUnranked =
    rank === null || (rank.wins === 0 && rank.losses === 0);

  if (isLoading && rank === null) {
    return (
      <Card accessibilityLabel="Local rank loading" style={styles.card}>
        <Heading text={heading} />
        <View style={styles.statsGrid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={spacing.xxxl} radius={radii.md} style={styles.statCell} />
          ))}
        </View>
      </Card>
    );
  }

  if (error && rank === null) {
    return (
      <Card accessibilityLabel="Local rank error" style={styles.card}>
        <Heading text={heading} />
        <Text style={styles.errorText}>{error}</Text>
      </Card>
    );
  }

  return (
    <Card accessibilityLabel="Local rank section" style={styles.card}>
      <Heading text={heading} />

      {isUnranked ? (
        <Text style={styles.emptyText} accessibilityLabel="Local rank empty">
          No local rank yet. Your rank will update when verified results are
          available.
        </Text>
      ) : (
        <View style={styles.statsGrid}>
          <Stat label="Rating" value={rank?.rating ?? 0} accent />
          <Stat
            label="Wins / Losses"
            value={`${rank?.wins ?? 0} / ${rank?.losses ?? 0}`}
          />
          <Stat label="Streak" value={rank?.streak ?? 0} />
        </View>
      )}

      {localChampion && localChampion.currentHolderUserId !== null ? (
        <View style={styles.championRow} accessibilityLabel="Local champion">
          <Icon name="trophy" size="lg" color={colors.brand} />
          <View style={styles.championText}>
            <Text style={styles.championLabel}>Local champion</Text>
            <Text style={styles.championValue}>{localChampion.titleName}</Text>
          </View>
        </View>
      ) : null}

      {myTitles.length > 0 ? (
        <View style={styles.titlesBlock} accessibilityLabel="My honor titles">
          <Text style={styles.sectionLabel}>Current titles</Text>
          {myTitles.map((t) => (
            <View key={t.id} style={styles.titleRow}>
              <Icon name="medal" size="sm" color={colors.brand} />
              <Text style={styles.titleText}>{t.titleName}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Heading({ text }: { text: string }) {
  return (
    <View style={styles.headingRow}>
      <Icon name="trending" size="md" color={colors.brand} />
      <Text style={styles.title} accessibilityRole="header">
        {text}
      </Text>
    </View>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <StatBlock
      value={value}
      label={label}
      size="sm"
      align="center"
      accent={accent}
      accessibilityLabel={`${label}: ${value}`}
      style={styles.statCell}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + spacing.xs,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    flex: 1,
  },
  emptyText: {
    ...typography.body,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandMuted,
  },
  championText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  championLabel: {
    ...typography.label,
    color: colors.brand,
  },
  championValue: {
    ...typography.bodyStrong,
    fontSize: typography.bodyLarge.fontSize,
  },
  titlesBlock: {
    gap: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
