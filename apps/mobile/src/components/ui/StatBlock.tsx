import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import { Icon, type IconName } from './Icon';

export type StatSize = 'sm' | 'md' | 'lg' | 'hero';

export interface StatBlockProps {
  /** The number, pre-formatted ("5.2", "5:30", 12). */
  value: string | number;
  /** Unit after the value ("km", "/km"). */
  unit?: string;
  /** Caption under the value ("Distance"). */
  label: string;
  size?: StatSize;
  align?: 'left' | 'center';
  icon?: IconName;
  /** Lime value for the headline stat. */
  accent?: boolean;
  /** Defaults to "value unit, label" (e.g. "5.2 km, Distance"). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const VALUE_STYLE = {
  sm: typography.statSmall,
  md: typography.stat,
  lg: typography.statLarge,
  hero: typography.statHero,
} as const;

/** Big condensed number + unit + label, e.g. "5.2 KM / Distance". */
export function StatBlock({
  value,
  unit,
  label,
  size = 'md',
  align = 'left',
  icon,
  accent = false,
  accessibilityLabel,
  testID,
  style,
}: StatBlockProps) {
  const valueText = String(value);
  const a11y = accessibilityLabel ?? `${valueText}${unit ? ` ${unit}` : ''}, ${label}`;
  const centered = align === 'center';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
      testID={testID}
      style={[styles.container, centered && styles.centered, style]}
    >
      <View style={[styles.valueRow, centered && styles.centeredRow]}>
        <Text
          style={[VALUE_STYLE[size], accent && styles.accent]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {valueText}
        </Text>
        {unit ? <Text style={[styles.unit, size === 'sm' && styles.unitSm]}>{unit}</Text> : null}
      </View>
      <View style={[styles.labelRow, centered && styles.centeredRow]}>
        {icon ? <Icon name={icon} size="xs" color={colors.textTertiary} /> : null}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  centered: {
    alignItems: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  centeredRow: {
    justifyContent: 'center',
  },
  accent: {
    color: colors.brand,
  },
  unit: {
    ...typography.statUnit,
  },
  unitSm: {
    fontSize: 13,
    lineHeight: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textTertiary,
  },
});
