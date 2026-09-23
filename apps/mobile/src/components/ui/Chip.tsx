import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { hapticSelection, usePressScale } from './feedback';
import { Icon, type IconName } from './Icon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface ChipProps {
  label: string;
  selected?: boolean;
  /** Omit for a static chip (renders as plain text, not a button). */
  onPress?: () => void;
  icon?: IconName;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /**
   * Choice semantics. Default 'button' (filters, actions). 'checkbox' for
   * multi-select and 'radio' for single-select choices: announced with a
   * checked state and a check glyph when selected.
   */
  role?: 'button' | 'checkbox' | 'radio';
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT = { sm: 30, md: 36 } as const;

/** Filter / choice chip. Selected = lime fill with dark text. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  disabled = false,
  size = 'md',
  role = 'button',
  accessibilityLabel,
  testID,
  style,
}: ChipProps) {
  const isChoice = role !== 'button';
  const glyph: IconName | undefined = icon ?? (isChoice && selected ? 'check' : undefined);
  const { animatedStyle, onPressIn, onPressOut, pressed } = usePressScale();
  const fg = selected ? colors.textInverse : colors.textPrimary;
  const height = HEIGHT[size];
  const content = (
    <>
      {glyph ? <Icon name={glyph} size={size === 'sm' ? 'xs' : 'sm'} color={selected ? fg : colors.textSecondary} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  const surface = [
    styles.base,
    { height, paddingHorizontal: size === 'sm' ? spacing.sm + 2 : spacing.md - 2 },
    selected ? styles.selected : styles.unselected,
  ];

  if (!onPress) {
    return (
      <View style={[surface, style]} testID={testID}>
        {content}
      </View>
    );
  }

  const slop = Math.ceil((touchTarget - height) / 2);
  return (
    <AnimatedPressable
      onPress={() => {
        if (disabled) return;
        hapticSelection();
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={{ top: slop, bottom: slop, left: 2, right: 2 }}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={isChoice ? { checked: selected, disabled } : { selected, disabled }}
      testID={testID}
      style={[
        surface,
        pressed && !selected && styles.pressed,
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  unselected: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  selected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    ...typography.buttonSmall,
  },
});
