import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hapticSelection } from '../components/ui';
import { colors, iconSizes, layout, motion, radii, spacing, touchTarget, typography } from '../theme';

const INDICATOR_WIDTH = 28;

/**
 * SportsGang bottom tab bar: icon + label tabs on the surface colour with a
 * lime indicator that slides to the active tab (jumps with reduce motion).
 * Safe-area aware, every tab is a ≥44pt "tab" with selected state, and
 * switching tabs gives a selection haptic. Icons and badges come from the
 * standard `tabBarIcon` / `tabBarBadge` options.
 */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const tabWidth = count > 0 ? width / count : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    if (tabWidth === 0) return;
    const target = state.index * tabWidth + (tabWidth - INDICATOR_WIDTH) / 2;
    x.value = reduceMotion
      ? target
      : withTiming(target, {
          duration: motion.duration.slow,
          easing: Easing.bezier(...motion.easing.standard),
        });
  }, [state.index, tabWidth, reduceMotion, x]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom, height: layout.tabBarHeight + insets.bottom }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      testID="main-tab-bar"
    >
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, indicatorStyle]}
          testID="tab-indicator"
        />
      ) : null}
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const color = focused ? colors.brand : colors.textTertiary;
        const badge = options.tabBarBadge;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            hapticSelection();
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              options.tabBarAccessibilityLabel ??
              (badge !== undefined ? `${label}, ${badge} new` : label)
            }
            testID={options.tabBarTestID ?? `tab-${route.name}`}
            style={styles.tab}
          >
            <View>
              {options.tabBarIcon?.({ focused, color, size: iconSizes.lg })}
              {badge !== undefined ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: INDICATOR_WIDTH,
    height: 3,
    borderBottomLeftRadius: radii.sm,
    borderBottomRightRadius: radii.sm,
    backgroundColor: colors.brand,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  label: {
    ...typography.tab,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    ...typography.tab,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textInverse,
  },
});
