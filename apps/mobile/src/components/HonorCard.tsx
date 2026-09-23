import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import { Card, Icon, Skeleton, SkeletonText, StatBlock, sportIconName } from './ui';
import type { HonorLevel, HonorSummary, SportLevelSummary } from '../lib/rank';

interface HonorCardProps {
  summary: HonorSummary | null;
  isLoading?: boolean;
  error?: string | null;
}

const HONOR_LEVEL_ACCENTS: Record<HonorLevel, string> = {
  Rookie: colors.textTertiary,
  Regular: colors.textSecondary,
  Trusted: colors.brand,
  Captain: colors.brand,
  Legend: colors.accent,
};

/**
 * Honor / Gang Score / Sport Level card for the Profile / Me surface.
 *
 * Copy is deliberately specific:
 *   - "Honor reflects attendance, fair play, and reliable hosting."
 *   - "Gang Score reflects your activity and contribution."
 *
 * Never describe Honor as popularity; never claim AI moderation or
 * instant enforcement. Reports / blocks are not surfaced here.
 */
export function HonorCard({ summary, isLoading = false, error }: HonorCardProps) {
  if (isLoading && !summary) {
    return (
      <Card accessibilityLabel="Honor card loading" style={styles.card}>
        <CardTitle />
        <View style={styles.row}>
          <Skeleton height={spacing.xxxl + spacing.md} radius={radii.md} style={styles.flex} />
          <Skeleton height={spacing.xxxl + spacing.md} radius={radii.md} style={styles.flex} />
        </View>
        <SkeletonText lines={2} />
      </Card>
    );
  }

  if (error && !summary) {
    return (
      <Card accessibilityLabel="Honor card error" style={styles.card}>
        <CardTitle />
        <Text style={styles.errorText}>{error}</Text>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card accessibilityLabel="Honor card empty" style={styles.card}>
        <CardTitle />
        <Text style={styles.bodyMuted}>
          Play your first game to start building your Honor.
        </Text>
      </Card>
    );
  }

  const levelColor =
    HONOR_LEVEL_ACCENTS[summary.honorLevel] ?? colors.textSecondary;

  return (
    <Card accessibilityLabel="Honor card" style={styles.card}>
      <CardTitle />

      <View style={styles.row}>
        <View style={styles.scoreBlock}>
          <StatBlock
            value={summary.honorScore}
            label="Honor"
            size="lg"
            accent
            accessibilityLabel={`Honor score: ${summary.honorScore}, ${summary.honorLevel}`}
          />
          <Text style={[styles.levelText, { color: levelColor }]}>
            {summary.honorLevel}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <StatBlock
            value={summary.gangScore}
            label="Gang Score"
            size="lg"
            accessibilityLabel={`Gang Score: ${summary.gangScore}`}
          />
          <Text style={styles.scoreFootnote}>Activity · contribution</Text>
        </View>
      </View>

      <Text style={styles.bodyCopy}>
        Honor reflects attendance, fair play, and reliable hosting.
      </Text>
      <Text style={styles.bodyCopy}>
        Gang Score reflects your activity and contribution.
      </Text>

      <View style={styles.statsGrid}>
        <Stat label="Completed games" value={summary.completedGamesCount} />
        <Stat label="Hosted games" value={summary.hostedGamesCount} />
        <Stat label="No-shows" value={summary.noShowCount} />
      </View>

      {summary.sportLevels.length > 0 ? (
        <View style={styles.sportsBlock}>
          <Text style={styles.sectionLabel}>Sport levels</Text>
          {summary.sportLevels.map((s: SportLevelSummary) => (
            <View key={s.sport} style={styles.sportRow}>
              <Icon name={sportIconName(s.sport)} size="sm" color={colors.textSecondary} />
              <Text style={styles.sportName}>{capitalize(s.sport)}</Text>
              <Text style={styles.sportLevel}>
                Lv {s.level} · {s.xp} XP
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function CardTitle() {
  return (
    <View style={styles.titleRow}>
      <Icon name="award" size="md" color={colors.brand} />
      <Text style={styles.title} accessibilityRole="header">
        Honor
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <StatBlock
      value={value}
      label={label}
      size="sm"
      align="center"
      accessibilityLabel={`${label}: ${value}`}
      style={styles.statCell}
    />
  );
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm + spacing.xs,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  scoreBlock: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
  },
  levelText: {
    ...typography.buttonSmall,
  },
  scoreFootnote: {
    ...typography.caption,
  },
  bodyCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bodyMuted: {
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
  sportsBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sportName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  sportLevel: {
    ...typography.bodyStrong,
    color: colors.brand,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
});
