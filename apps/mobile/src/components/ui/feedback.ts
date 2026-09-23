import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { motion } from '../../theme';

/**
 * Haptics are best-effort: unsupported devices, web and the test runner
 * must never throw or surface a rejected promise.
 */
function safely(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    void run().catch(() => undefined);
  } catch {
    // Native module missing (e.g. Expo Go without haptics) — ignore.
  }
}

/** Light tap for primary actions (Button primary, FAB, Connect). */
export function hapticLight(): void {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick for choosing between options (tabs, chips, segments). */
export function hapticSelection(): void {
  safely(() => Haptics.selectionAsync());
}

/** Success / warning / error notification pattern. */
export function hapticNotify(type: 'success' | 'warning' | 'error'): void {
  const map = {
    success: Haptics.NotificationFeedbackType.Success,
    warning: Haptics.NotificationFeedbackType.Warning,
    error: Haptics.NotificationFeedbackType.Error,
  } as const;
  safely(() => Haptics.notificationAsync(map[type]));
}

/**
 * Press-scale feedback: springs to `motion.pressScale` (0.97) while held.
 * With reduce-motion on, the scale is skipped entirely (the pressed
 * opacity / colour change still shows the press).
 */
export function usePressScale(scaleTo: number = motion.pressScale) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  // Tracked in React state (not Pressable's function-style `pressed`):
  // Reanimated only animates styles passed as a plain array / object.
  const [pressed, setPressed] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    setPressed(true);
    if (reduceMotion) return;
    scale.value = withSpring(scaleTo, motion.spring.press);
  }, [reduceMotion, scale, scaleTo]);

  const onPressOut = useCallback(() => {
    setPressed(false);
    if (reduceMotion) return;
    scale.value = withSpring(1, motion.spring.press);
  }, [reduceMotion, scale]);

  return { animatedStyle, onPressIn, onPressOut, pressed };
}
