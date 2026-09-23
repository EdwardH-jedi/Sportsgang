import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radii, spacing } from '../../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  /** Corner radius; ignored when `circle`. */
  radius?: number;
  /** Circle of diameter `height` (avatars). */
  circle?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Loading placeholder block with a slow opacity pulse (static with
 * reduce-motion). Hidden from screen readers: wrap a skeleton layout in a
 * container with `accessibilityLabel="Loading"` instead.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radii.sm,
  circle = false,
  testID,
  style,
}: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        circle
          ? { width: height, height, borderRadius: height / 2 }
          : { width, height, borderRadius: radius },
        pulse,
        style,
      ]}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  /** Width of the last line. Default 60%. */
  lastLineWidth?: DimensionValue;
  lineHeight?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Paragraph placeholder: N bars, the last one shorter. */
export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  lineHeight = 12,
  testID,
  style,
}: SkeletonTextProps) {
  return (
    <View style={[styles.text, style]} testID={testID}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceHigh,
  },
  text: {
    gap: spacing.sm,
  },
});
