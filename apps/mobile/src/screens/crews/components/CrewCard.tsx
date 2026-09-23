import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Icon } from '../../../components/ui';
import type { CrewListItem } from '../../../lib/crews';
import { formatRunDay, formatRunTime } from '../../../lib/groupRuns';
import { formatDistanceAway, paceBandText } from '../../../lib/pace';
import { colors, spacing, typography } from '../../../theme';

export interface CrewCardProps {
  crew: CrewListItem;
  onPress: () => void;
}

export function memberCountText(n: number): string {
  return n === 1 ? '1 member' : `${n} members`;
}

/** Crew summary: name, area + distance, pace band, members, next run. */
export function CrewCard({ crew, onPress }: CrewCardProps) {
  const away = formatDistanceAway(crew.distanceKm);
  const pace = paceBandText(crew.paceMinSecPerKm, crew.paceMaxSecPerKm);
  const place = [crew.homeArea, away].filter(Boolean).join(' · ');

  return (
    <Card onPress={onPress} accessibilityLabel={`Open crew ${crew.name}`} testID={`crew-card-${crew.id}`}>
      <View style={styles.titleRow}>
        <Text style={styles.name} numberOfLines={1}>
          {crew.name}
        </Text>
        {crew.myRole ? (
          <Badge
            label={crew.myRole === 'owner' ? 'Owner' : 'Member'}
            tone={crew.myRole === 'owner' ? 'brand' : 'success'}
            size="sm"
          />
        ) : null}
      </View>
      <View style={styles.row}>
        <Icon name="location" size="xs" color={colors.textTertiary} />
        <Text style={styles.meta} numberOfLines={1}>
          {place}
        </Text>
      </View>
      <View style={styles.badges}>
        <Badge label={memberCountText(crew.memberCount)} icon="crew" size="sm" />
        {pace ? <Badge label={pace} icon="pace" size="sm" /> : null}
      </View>
      {crew.nextRun ? (
        <View style={[styles.row, styles.next]}>
          <Icon name="run" size="sm" color={colors.brand} />
          <Text style={styles.nextText} numberOfLines={1}>
            Next: {formatRunDay(crew.nextRun.startsAt)} {formatRunTime(crew.nextRun.startsAt)} ·{' '}
            {crew.nextRun.title}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.h3,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  next: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  nextText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
