import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon } from '../../../components/ui';
import { formatClock, formatDayLabel } from '../../../lib/format';
import { colors, spacing, typography } from '../../../theme';
import { type NextUpItem, nextUpKind } from '../useNextUp';

export interface NextUpCardProps {
  item: NextUpItem;
  onPress: () => void;
  /**
   * One-line row (title left, day / time right) for screens where
   * vertical space is tight — the Group runs map.
   */
  compact?: boolean;
  /** Injectable clock for "Today" / "Tomorrow" (tests). */
  now?: Date;
}

/**
 * "Next up" card at the top of the Run tab. The time is the point of the
 * card, so it never shares a line that can truncate: full mode puts it on
 * its own line under the title; compact mode pins it to the right.
 */
export function NextUpCard({ item, onPress, compact = false, now }: NextUpCardProps) {
  const day = formatDayLabel(item.startsAt, now);
  const time = formatClock(item.startsAt);
  const when = `${day} · ${time}`;
  const kind = nextUpKind(item);
  const icon = item.kind === 'session' ? 'calendar' : 'run';

  if (compact) {
    return (
      <Card
        onPress={onPress}
        variant="elevated"
        padding="sm"
        accessibilityLabel={`Next up: ${kind}, ${item.title}, ${when}`}
        testID="next-up-card"
      >
        <View style={styles.row}>
          <View style={[styles.icon, styles.iconCompact]}>
            <Icon name={icon} size="sm" color={colors.textInverse} />
          </View>
          <View style={styles.text}>
            <Text style={styles.kicker} numberOfLines={1}>
              Next up
            </Text>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <View style={styles.compactWhen}>
            <Text style={styles.compactDay} numberOfLines={1}>
              {day}
            </Text>
            <Text style={styles.compactTime} numberOfLines={1}>
              {time}
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card
      onPress={onPress}
      variant="elevated"
      padding="sm"
      accessibilityLabel={`Next up: ${kind}, ${item.title}, ${when}`}
      testID="next-up-card"
    >
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={icon} size="md" color={colors.textInverse} />
        </View>
        <View style={styles.text}>
          <Text style={styles.kicker} numberOfLines={1}>
            Next up
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.when} numberOfLines={1}>
            {when}
          </Text>
          {item.detail ? (
            <Text style={styles.detail} numberOfLines={1}>
              {item.detail}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size="md" color={colors.textTertiary} />
      </View>
    </Card>
  );
}

const ICON_BOX = 40;
const ICON_BOX_COMPACT = 32;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: ICON_BOX / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  iconCompact: {
    width: ICON_BOX_COMPACT,
    height: ICON_BOX_COMPACT,
    borderRadius: ICON_BOX_COMPACT / 2,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    ...typography.label,
    color: colors.brand,
  },
  title: {
    ...typography.bodyStrong,
  },
  when: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.caption,
  },
  compactWhen: {
    alignItems: 'flex-end',
  },
  compactDay: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  compactTime: {
    ...typography.statUnit,
    fontVariant: ['tabular-nums'],
    color: colors.brand,
  },
});
