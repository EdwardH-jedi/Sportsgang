import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon } from '../../../components/ui';
import { formatWhen } from '../../../lib/format';
import { colors, spacing, typography } from '../../../theme';
import { type NextUpItem, nextUpKind } from '../useNextUp';

export interface NextUpCardProps {
  item: NextUpItem;
  onPress: () => void;
}

/** Compact "Next up" strip at the top of the Run tab. */
export function NextUpCard({ item, onPress }: NextUpCardProps) {
  const when = formatWhen(item.startsAt);
  return (
    <Card
      onPress={onPress}
      variant="elevated"
      padding="sm"
      accessibilityLabel={`Next up: ${item.title}, ${when}`}
      testID="next-up-card"
    >
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={item.kind === 'session' ? 'calendar' : 'run'} size="md" color={colors.textInverse} />
        </View>
        <View style={styles.text}>
          <Text style={styles.kicker} numberOfLines={1}>
            Next up · {nextUpKind(item)} · {when}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
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
  text: {
    flex: 1,
  },
  kicker: {
    ...typography.label,
    color: colors.brand,
  },
  title: {
    ...typography.bodyStrong,
  },
  detail: {
    ...typography.caption,
  },
});
