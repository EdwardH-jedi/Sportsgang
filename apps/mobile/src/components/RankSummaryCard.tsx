import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../lib/sports';
import { colors, radii, spacing, typography } from '../theme';
import type { RankSummary, RankTier, SportRankSummary } from '@protin/shared-types';

interface RankSummaryCardProps {
  summary: RankSummary | null;
  isLoading?: boolean;
  /**
   * Title shown at the top. Default "Sports reputation" matches the
   * profile-screen surface; callers on other screens can override
   * (e.g. "Reputation" for a partner detail panel).
   */
  title?: string;
}

const TIER_ACCENTS: Record<RankTier, string> = {
  Rookie: colors.textTertiary,
  Bronze: '#CD7F32',
  Silver: '#C0C0C0',
  Gold: '#E0B33B',
  Platinum: '#7CD0FF',
  Diamond: colors.brand,
};

/**
 * Displays a Sports Reputation summary on the SportsGang dark/neon canvas.
 *
 * Rendered states:
 *   - loading            — small spinner inside the card
 *   - no-summary         — backend returned nothing; gentle "no reputation yet" copy
 *   - new player         — honor 100 badge + "No ranked sports yet" copy
 *   - has-data           — honor badge + per-sport tier rows
 *
 * No fake tiers: per-sport rank rows render only when the backend supplied
 * them; we never invent Rookie/Bronze for a player with no activity.
 */
export function RankSummaryCard({
  summary,
  isLoading = false,
  title = 'Sports reputation',
}: RankSummaryCardProps) {
  if (isLoading) {
    return (
      <View style={styles.card} accessibilityLabel="Sports reputation loading">
        <Text style={styles.title}>{title}</Text>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.card} accessibilityLabel="Sports reputation">
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>No reputation yet</Text>
          <Text style={styles.emptyBody}>
            Complete a confirmed session to start building your sports reputation. Honor
            reflects reliability; rank grows per sport as you play.
          </Text>
        </View>
      </View>
    );
  }

  // Defensively normalize sports: the API contract is an array, but a malformed
  // payload (null, undefined, {}) must not crash the profile screen.
  const sports: SportRankSummary[] = Array.isArray(summary.sports) ? summary.sports : [];

  return (
    <View style={styles.card} accessibilityLabel="Sports reputation">
      <Text style={styles.title}>{title}</Text>

      <View style={styles.honorRow}>
        <View style={styles.honorBadge}>
          <Text style={styles.honorValue}>{summary.honor}</Text>
          <Text style={styles.honorScale}>/200</Text>
        </View>
        <Text style={styles.honorLabel}>Honor</Text>
      </View>

      <Text style={styles.honorExplain}>
        Honor reflects reliability and completed sessions.
      </Text>

      {sports.length > 0 ? (
        <>
          <View style={styles.sportsList}>
            {sports.map((s) => (
              <View key={s.sport} style={styles.sportRow}>
                <View style={styles.sportLeft}>
                  <Text style={styles.sportName}>{sportLabel(s.sport)}</Text>
                  <Text style={styles.sportSub}>
                    {s.sessionsCompleted} session{s.sessionsCompleted === 1 ? '' : 's'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.tierPill,
                    { borderColor: TIER_ACCENTS[s.tier] },
                  ]}
                >
                  <Text style={[styles.tierText, { color: TIER_ACCENTS[s.tier] }]}>
                    {s.tier}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.rankExplain}>
            Rank is sport-specific and grows with your completed sessions.
          </Text>
        </>
      ) : (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>No ranked sports yet</Text>
          <Text style={styles.emptyBody}>
            Complete sessions to build your sport rank.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    gap: spacing.md,
  },
  title: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  honorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  honorBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  honorValue: {
    ...typography.h2,
    color: colors.textInverse,
    fontWeight: '700',
  },
  honorScale: {
    ...typography.bodySmall,
    color: colors.textInverse,
    marginLeft: 2,
  },
  honorLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  honorExplain: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  sportsList: {
    gap: spacing.sm,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.inputBackground,
    borderRadius: radii.md,
  },
  sportLeft: {
    flex: 1,
    gap: 2,
  },
  sportName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sportSub: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  tierText: {
    ...typography.label,
    fontWeight: '700',
  },
  rankExplain: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  emptyBlock: {
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  emptyBody: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
});
