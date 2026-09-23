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

import { colors, radii, spacing } from '../../theme';
import { usePressScale } from './feedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CardVariant = 'default' | 'elevated' | 'outline' | 'brand';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  /** Makes the whole card a button (press scale + pressed surface). */
  onPress?: (e: GestureResponderEvent) => void;
  variant?: CardVariant;
  padding?: CardPadding;
  disabled?: boolean;
  /** Required when pressable: summarise the card for screen readers. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const PAD: Record<CardPadding, number> = { none: 0, sm: spacing.sm + 4, md: spacing.md, lg: spacing.lg };

const SURFACE: Record<CardVariant, ViewStyle> = {
  default: { backgroundColor: colors.surface, borderColor: colors.separator, borderWidth: 1 },
  elevated: { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 },
  outline: { backgroundColor: 'transparent', borderColor: colors.borderStrong, borderWidth: 1 },
  brand: { backgroundColor: colors.brandSoft, borderColor: colors.brandMuted, borderWidth: 1 },
};

/** Surface container. Static by default; pressable when `onPress` is set. */
export function Card({
  children,
  onPress,
  variant = 'default',
  padding = 'md',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale();
  const base = [styles.base, SURFACE[variant], { padding: PAD[padding] }];

  if (!onPress) {
    return (
      <View style={[base, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        base,
        pressed && variant !== 'brand' && styles.pressed,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.5,
  },
});
