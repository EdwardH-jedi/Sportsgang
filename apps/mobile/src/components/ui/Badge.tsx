import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';
import { Icon, type IconName } from './Icon';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'error';
export type BadgeVariant = 'soft' | 'solid' | 'outline';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  icon?: IconName;
  size?: 'sm' | 'md';
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<BadgeTone, { solid: string; soft: string; fg: string; onSolid: string }> = {
  neutral: { solid: colors.textSecondary, soft: colors.surfaceHigh, fg: colors.textSecondary, onSolid: colors.textInverse },
  brand: { solid: colors.brand, soft: colors.brandSoft, fg: colors.brand, onSolid: colors.textInverse },
  success: { solid: colors.success, soft: colors.successSoft, fg: colors.success, onSolid: colors.textInverse },
  warning: { solid: colors.warning, soft: colors.warningSoft, fg: colors.warning, onSolid: colors.textInverse },
  error: { solid: colors.error, soft: colors.errorSoft, fg: colors.error, onSolid: colors.textInverse },
};

/** Small non-interactive status label ("3 spots left", "Confirmed"). */
export function Badge({
  label,
  tone = 'neutral',
  variant = 'soft',
  icon,
  size = 'md',
  accessibilityLabel,
  testID,
  style,
}: BadgeProps) {
  const t = TONES[tone];
  const bg = variant === 'solid' ? t.solid : variant === 'soft' ? t.soft : 'transparent';
  const fg = variant === 'solid' ? t.onSolid : t.fg;
  const border = variant === 'outline' ? t.fg : 'transparent';

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: bg, borderColor: border },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 12 : 'xs'} color={fg} /> : null}
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Alias: tags use the same visual as badges. */
export const Tag = Badge;
export type TagProps = BadgeProps;

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  md: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  sm: {
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 1,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
  },
  labelSm: {
    fontSize: 11,
    lineHeight: 14,
  },
});
