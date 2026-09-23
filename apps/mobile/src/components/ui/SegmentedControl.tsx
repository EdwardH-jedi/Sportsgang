import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, radii, spacing, touchTarget, typography } from '../../theme';
import { hapticSelection } from './feedback';
import { Icon, type IconName } from './Icon';

export interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers (e.g. "Run view"). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const PAD = 3;

/**
 * Two-to-four way switch (e.g. "Group runs | Runners"). The lime thumb
 * slides between segments; with reduce-motion it jumps.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
  testID,
  style,
}: SegmentedControlProps<T>) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((s) => s.value === value)
  );
  const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = index * segmentWidth;
    x.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motion.duration.base,
          easing: Easing.bezier(...motion.easing.standard),
        });
  }, [index, segmentWidth, reduceMotion, x]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View
      style={[styles.track, style]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { width: segmentWidth }, thumbStyle]}
        />
      ) : null}
      {segments.map((segment) => {
        const selected = segment.value === value;
        const fg = selected ? colors.textInverse : colors.textSecondary;
        return (
          <Pressable
            key={segment.value}
            onPress={() => {
              if (selected) return;
              hapticSelection();
              onChange(segment.value);
            }}
            accessibilityRole="tab"
            accessibilityLabel={segment.accessibilityLabel ?? segment.label}
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${segment.value}` : undefined}
            style={styles.segment}
          >
            {segment.icon ? <Icon name={segment.icon} size="sm" color={fg} /> : null}
            <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PAD,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumb: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: radii.md - PAD,
    backgroundColor: colors.brand,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget - PAD * 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  label: {
    ...typography.buttonSmall,
  },
});
