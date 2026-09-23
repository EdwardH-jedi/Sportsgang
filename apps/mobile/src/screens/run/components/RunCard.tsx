import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Card, Icon, StatBlock } from '../../../components/ui';
import type { EventSummary } from '../../../lib/events';
import { formatRunDay, formatRunTime } from '../../../lib/groupRuns';
import { formatDistanceAway, formatKm, paceBandValue } from '../../../lib/pace';
import { colors, spacing, typography } from '../../../theme';

export interface RunCardProps {
  run: EventSummary;
  onPress: () => void;
  /** Highlight (e.g. its map pin is selected). */
  selected?: boolean;
  /** Hide the crew badge (e.g. inside that crew's own screen). */
  hideCrew?: boolean;
  /** Reference "now" for Today / Tomorrow copy (tests). */
  now?: Date;
  testID?: string;
}

/**
 * Group-run summary: when, title, crew, distance / pace / spots stats,
 * distance from you and the host. The whole card opens the run.
 */
export function RunCard({ run, onPress, selected = false, hideCrew = false, now, testID }: RunCardProps) {
  const isFull = run.status === 'full' || run.spotsLeft <= 0;
  const away = formatDistanceAway(run.distanceKmFromYou);
  const pace = paceBandValue(run.paceMinSecPerKm, run.paceMaxSecPerKm);
  const km = formatKm(run.distanceKm);
  const when = `${formatRunDay(run.startsAt, now)} · ${formatRunTime(run.startsAt)}`;

  return (
    <Card
      onPress={onPress}
      variant={selected ? 'brand' : 'default'}
      accessibilityLabel={`Open run ${run.title}`}
      accessibilityHint={[when, away].filter(Boolean).join(', ')}
      testID={testID ?? `run-card-${run.id}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.when} numberOfLines={1}>
          {when}
        </Text>
        {away ? (
          <View style={styles.away}>
            <Icon name="location" size="xs" color={colors.textTertiary} />
            <Text style={styles.awayText}>{away}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {run.title}
      </Text>

      <View style={styles.metaRow}>
        {!hideCrew && run.crewName ? (
          <Badge label={run.crewName} tone="brand" icon="crew" size="sm" />
        ) : null}
        {run.hasJoined ? <Badge label="You're in" tone="success" icon="check" size="sm" /> : null}
        <Text style={styles.location} numberOfLines={1}>
          {run.locationText}
        </Text>
      </View>

      <View style={styles.stats}>
        <StatBlock value={km || '–'} unit={km ? 'km' : undefined} label="Distance" size="sm" />
        <StatBlock value={pace ?? 'Any'} unit={pace ? '/km' : undefined} label="Pace" size="sm" />
        <StatBlock
          value={isFull ? 'Full' : run.spotsLeft}
          label={isFull ? `${run.capacity} going` : 'Spots left'}
          size="sm"
          accent={!isFull}
        />
      </View>

      {run.host ? (
        <View style={styles.hostRow}>
          <Avatar name={run.host.displayName} size="xs" />
          <Text style={styles.hostText} numberOfLines={1}>
            Hosted by {run.host.displayName}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  when: {
    ...typography.label,
    color: colors.brand,
    flexShrink: 1,
  },
  away: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  awayText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  title: {
    ...typography.h3,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  location: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  hostText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
