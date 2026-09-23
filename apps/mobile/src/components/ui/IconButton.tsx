import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, radii, touchTarget } from '../../theme';
import { hapticLight, usePressScale } from './feedback';
import { Icon, type IconName } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type IconButtonVariant = 'plain' | 'filled' | 'outline' | 'brand';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps {
  icon: IconName;
  /** Required: an icon alone has no accessible name. */
  accessibilityLabel: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  /** Overrides the variant's icon colour. */
  color?: string;
  /** Small lime dot (e.g. unread). */
  badge?: boolean;
  /** Light haptic on press. Defaults to true for `brand`. */
  haptic?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const DIAMETER: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 56 };
const GLYPH: Record<IconButtonSize, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', lg: 'lg' };

const PALETTE: Record<IconButtonVariant, { bg: string; bgPressed: string; fg: string; border: string }> = {
  plain: { bg: 'transparent', bgPressed: colors.surfacePressed, fg: colors.textPrimary, border: 'transparent' },
  filled: { bg: colors.surfaceElevated, bgPressed: colors.surfacePressed, fg: colors.textPrimary, border: 'transparent' },
  outline: { bg: 'transparent', bgPressed: colors.surfacePressed, fg: colors.textPrimary, border: colors.borderStrong },
  brand: { bg: colors.brand, bgPressed: colors.brandDark, fg: colors.textInverse, border: colors.brand },
};

/** Round icon-only button with a guaranteed 44pt touch target. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  size = 'md',
  disabled = false,
  color,
  badge = false,
  haptic,
  accessibilityHint,
  testID,
  style,
}: IconButtonProps) {
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale(0.92);
  const palette = PALETTE[variant];
  const d = DIAMETER[size];
  const slop = Math.max(0, Math.ceil((touchTarget - d) / 2));
  const withHaptic = haptic ?? variant === 'brand';

  return (
    <AnimatedPressable
      onPress={(e) => {
        if (disabled) return;
        if (withHaptic) hapticLight();
        onPress?.(e);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={slop ? { top: slop, bottom: slop, left: slop, right: slop } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        styles.base,
        {
          width: d,
          height: d,
          borderRadius: radii.full,
          backgroundColor: pressed && !disabled ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'outline' ? 1 : 0,
        },
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      <Icon name={icon} size={GLYPH[size]} color={color ?? palette.fg} />
      {badge ? <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined} /> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
