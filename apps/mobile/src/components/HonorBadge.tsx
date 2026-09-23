import { StyleSheet, Text, View } from 'react-native';

import type { HonorLevel } from '../lib/rank';
import { colors, face, radii, spacing, typography } from '../theme';
import { Icon } from './ui/Icon';

/**
 * Glyph size in points, built from spacing rather than an `iconSizes`
 * token: this badge renders inside Discovery / Battles screens whose tests
 * mock only colors / spacing / radii / typography.
 */
const GLYPH = spacing.sm + spacing.xs;
const HIGH_LEVELS: readonly HonorLevel[] = ['Trusted', 'Captain', 'Legend'];
/**
 * The app-wide "·" separator, written as an escape so a mis-encoded save
 * can't turn it into mojibake (it once rendered as "쨌").
 */
const MIDDOT = '\u00B7';

interface HonorBadgeProps {
  /** Honor level. Omit when the summary is unavailable to render the fallback. */
  honorLevel?: HonorLevel | null;
  /** Optional honor score. Hidden in compact mode. */
  honorScore?: number | null;
  /** Compact = level only (no numeric score). Default false. */
  compact?: boolean;
  /** Loading hint — renders a subtle dim variant. */
  isLoading?: boolean;
  /** Accessibility label override. */
  accessibilityLabel?: string;
}

const LEVEL_ACCENTS: Record<HonorLevel, string> = {
  Rookie: colors.textTertiary,
  Regular: colors.textSecondary,
  Trusted: colors.brand,
  Captain: colors.brand,
  Legend: colors.accent,
};

/**
 * Small Honor trust pill used at decision points (event cards, host
 * cards, partner cards).
 *
 * Copy rules:
 *   - Never call this "popularity" or a ranking against other users.
 *   - Never claim AI moderation or verified identity.
 *   - Never label it "leaderboard".
 *   - Fallback when summary unavailable: "New player".
 */
export function HonorBadge({
  honorLevel,
  honorScore,
  compact = false,
  isLoading = false,
  accessibilityLabel,
}: HonorBadgeProps) {
  if (isLoading) {
    return (
      <View
        style={[styles.pill, styles.pillMuted]}
        accessibilityLabel={accessibilityLabel ?? 'Honor loading'}
      >
        <Text style={styles.textMuted}>Honor</Text>
      </View>
    );
  }

  if (!honorLevel) {
    return (
      <View
        style={[styles.pill, styles.pillMuted]}
        accessibilityLabel={accessibilityLabel ?? 'New player'}
      >
        <Text style={styles.textMuted}>New player</Text>
      </View>
    );
  }

  const accent = LEVEL_ACCENTS[honorLevel];
  const showScore =
    !compact && typeof honorScore === 'number' && Number.isFinite(honorScore);
  const fallbackLabel = showScore
    ? `${honorLevel} ${honorScore}`
    : honorLevel;

  const high = HIGH_LEVELS.includes(honorLevel);

  return (
    <View
      style={[styles.pill, high && styles.pillHigh, { borderColor: accent }]}
      accessibilityLabel={accessibilityLabel ?? `Honor ${fallbackLabel}`}
    >
      <Icon name="award" size={GLYPH} color={accent} />
      <Text style={[styles.text, { color: accent }]}>{honorLevel}</Text>
      {showScore ? (
        <Text style={[styles.score, { color: accent }]}>{`${MIDDOT} ${honorScore}`}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.surfaceElevated,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  pillHigh: {
    backgroundColor: colors.brandSoft,
  },
  pillMuted: {
    borderColor: colors.border,
  },
  // Sentence case ("Regular · 104"), matching the "·" meta lines around it.
  text: {
    ...typography.caption,
    ...face('semibold', '600'),
  },
  textMuted: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  score: {
    ...typography.caption,
    ...face('semibold', '600'),
    fontVariant: ['tabular-nums'],
  },
});
