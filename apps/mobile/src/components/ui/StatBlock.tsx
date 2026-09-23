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
  /**
   * Lines the label may wrap to (default 1). Use 2 in narrow grids
   * instead of letting a long label run into its neighbour.
   */
  labelLines?: 1 | 2;
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
  labelLines = 1,
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
          style={[VALUE_STYLE[size], styles.value, accent && styles.accent]}
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
        <Text
          style={[styles.label, size === 'sm' && styles.labelSm, centered && styles.labelCentered]}
          numberOfLines={labelLines}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export interface StatRowProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Row of StatBlocks that never clips: blocks keep their natural width and
 * wrap onto a second line when a wide value (a pace band like
 * "5:30–6:00 /km") leaves no room for the next one.
 */
export function StatRow({ children, style, testID }: StatRowProps) {
  return (
    <View style={[styles.row, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
    // Let a block shrink inside a row instead of pushing siblings off-screen.
    flexShrink: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.xl,
    rowGap: spacing.md,
  },
  value: {
    flexShrink: 1,
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
    flexShrink: 1,
  },
  /** Tighter tracking so small-grid captions ("No-shows") fit their cell. */
  labelSm: {
    letterSpacing: 0.6,
  },
  labelCentered: {
    textAlign: 'center',
  },
});
