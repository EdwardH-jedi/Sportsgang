import { StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../lib/sports';
import { colors, radii, spacing, typography } from '../theme';
import {
  Badge,
  Card,
  Icon,
  Skeleton,
  SkeletonText,
  sportIconName,
  type BadgeTone,
} from './ui';
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

/**
 * Tier → Badge tone. The theme has no metal colours (bronze / silver /
 * gold), so tiers map onto the semantic tones: entry tiers neutral,
 * metal tiers warm, top tiers lime.
 */
const TIER_TONES: Record<RankTier, BadgeTone> = {
  Rookie: 'neutral',
  Bronze: 'warning',
  Silver: 'neutral',
  Gold: 'warning',
  Platinum: 'success',
  Diamond: 'brand',
};

/**
 * Displays a Sports Reputation summary on the SportsGang dark/neon canvas.
 *
 * Rendered states:
 *   - loading            — skeleton inside the card
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
      <Card accessibilityLabel="Sports reputation loading" padding="lg" style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Skeleton width="40%" height={spacing.xxl} radius={radii.md} />
        <SkeletonText lines={2} />
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card accessibilityLabel="Sports reputation" padding="lg" style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>No reputation yet</Text>
          <Text style={styles.emptyBody}>
            Complete a confirmed session to start building your sports reputation. Honor
            reflects reliability; rank grows per sport as you play.
          </Text>
        </View>
      </Card>
    );
  }

  // Defensively normalize sports: the API contract is an array, but a malformed
  // payload (null, undefined, {}) must not crash the profile screen.
  const sports: SportRankSummary[] = Array.isArray(summary.sports) ? summary.sports : [];

  return (
    <Card accessibilityLabel="Sports reputation" padding="lg" style={styles.card}>
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
                <Icon name={sportIconName(s.sport)} size="md" color={colors.brand} />
                <View style={styles.sportLeft}>
                  <Text style={styles.sportName}>{sportLabel(s.sport)}</Text>
                  <Text style={styles.sportSub}>
                    {s.sessionsCompleted} session{s.sessionsCompleted === 1 ? '' : 's'}
                  </Text>
                </View>
                <Badge label={s.tier} tone={TIER_TONES[s.tier] ?? 'neutral'} variant="outline" />
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  title: {
    ...typography.h3,
  },
  honorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  honorBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs / 2,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  honorValue: {
    ...typography.stat,
    color: colors.textInverse,
  },
  honorScale: {
    ...typography.statUnit,
    color: colors.textInverse,
  },
  honorLabel: {
    ...typography.label,
  },
  honorExplain: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  sportsList: {
    gap: spacing.xs,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sportLeft: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  sportName: {
    ...typography.bodyStrong,
  },
  sportSub: {
    ...typography.caption,
  },
  rankExplain: {
    ...typography.bodySmall,
  },
  emptyBlock: {
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyStrong,
  },
  emptyBody: {
    ...typography.body,
  },
});
