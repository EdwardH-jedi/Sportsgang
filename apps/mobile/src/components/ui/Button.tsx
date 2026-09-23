import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { hapticLight, usePressScale } from './feedback';
import { Icon, type IconName } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the width, blocks presses, sets busy state. */
  loading?: boolean;
  disabled?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  /** Stretch to the parent's width. */
  fullWidth?: boolean;
  /** Light haptic on press. Defaults to true for `primary` only. */
  haptic?: boolean;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };
const PAD_X: Record<ButtonSize, number> = { sm: spacing.md - 2, md: spacing.lg - 4, lg: spacing.lg };

const PALETTE: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; fg: string; border: string }
> = {
  primary: { bg: colors.brand, bgPressed: colors.brandDark, fg: colors.textInverse, border: colors.brand },
  secondary: {
    bg: colors.surfaceElevated,
    bgPressed: colors.surfacePressed,
    fg: colors.textPrimary,
    border: colors.borderStrong,
  },
  ghost: { bg: 'transparent', bgPressed: colors.brandSoft, fg: colors.brand, border: 'transparent' },
  destructive: { bg: colors.errorSoft, bgPressed: 'rgba(255,92,92,0.24)', fg: colors.error, border: 'transparent' },
};

/**
 * The app's button. One primary (lime) action per view; secondary / ghost
 * for the rest; destructive for irreversible actions.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  haptic,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale();
  const palette = PALETTE[variant];
  const inactive = disabled || loading;
  const withHaptic = haptic ?? variant === 'primary';
  const height = HEIGHT[size];
  // Small buttons stay visually compact but still get a 44pt target.
  const slop = Math.max(0, Math.ceil((touchTarget - height) / 2));
  const textStyle = size === 'sm' ? typography.buttonSmall : typography.button;
  const iconSize = size === 'sm' ? 'sm' : 'md';

  return (
    <AnimatedPressable
      onPress={(e) => {
        if (inactive) return;
        if (withHaptic) hapticLight();
        onPress?.(e);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={inactive}
      hitSlop={slop ? { top: slop, bottom: slop, left: 0, right: 0 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        {
          height,
          paddingHorizontal: PAD_X[size],
          backgroundColor: pressed && !inactive ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderRadius: size === 'sm' ? radii.md : radii.lg,
        },
        variant === 'secondary' && styles.bordered,
        fullWidth && styles.fullWidth,
        disabled && !loading && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {/* Label stays laid out while loading so the width doesn't jump. */}
      <View style={[styles.row, loading && styles.hidden]}>
        {leadingIcon ? <Icon name={leadingIcon} size={iconSize} color={palette.fg} /> : null}
        <Text style={[textStyle, { color: palette.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {trailingIcon ? <Icon name={trailingIcon} size={iconSize} color={palette.fg} /> : null}
      </View>
      {loading ? (
        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          color={palette.fg}
          testID={testID ? `${testID}-spinner` : 'button-spinner'}
        />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderWidth: 0,
  },
  bordered: {
    borderWidth: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hidden: {
    opacity: 0,
  },
  disabled: {
    opacity: 0.4,
  },
});
