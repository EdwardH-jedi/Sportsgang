import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type { RankSummary } from '@protin/shared-types';

interface RankBadgeProps {
  summary: RankSummary | null;
}

/**
 * Compact reputation badge for Discovery / Partner preview surfaces.
 * Renders nothing when the player has no reputation activity yet — never
 * fabricates a fake "Rookie 0/200" pill that would imply data we don't have.
 */
export function RankBadge({ summary }: RankBadgeProps) {
  if (!summary) return null;
  const hasActivity = summary.honor !== 100 || summary.sports.length > 0;
  if (!hasActivity) return null;

  // Pick the strongest sport row (already sorted desc by points server-side
  // but we don't rely on that — recompute here for safety).
  const topSport = summary.sports.length
    ? summary.sports.reduce((best, s) => (s.rankPoints > best.rankPoints ? s : best))
    : null;

  return (
    <View style={styles.row} accessibilityLabel="Reputation summary">
      <View style={styles.honorPill}>
        <Text style={styles.honorText}>Honor {summary.honor}</Text>
      </View>
      {topSport ? (
        <View style={styles.tierPill}>
          <Text style={styles.tierText}>
            {topSport.tier} · {topSport.sport}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  honorPill: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  honorText: {
    ...typography.label,
    color: colors.textInverse,
  },
  tierPill: {
    borderWidth: 1,
    borderColor: colors.brandMuted,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tierText: {
    ...typography.label,
    color: colors.brand,
  },
});
