import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, elevation, motion, radii, spacing, typography, zIndex } from '../../theme';

/** Height in points, or a percentage of the available height ("50%"). */
export type SnapPoint = number | `${number}%`;

export interface BottomSheetProps {
  children: React.ReactNode;
  /** Visible heights, smallest first (e.g. [140, '50%', '90%']). */
  snapPoints: readonly SnapPoint[];
  /** Starting snap index (default 0). */
  initialIndex?: number;
  /** Controlled snap index; animate by changing it. */
  index?: number;
  onIndexChange?: (index: number) => void;
  /**
   * Modal sheets render above everything (own native modal layer) with a
   * backdrop, trap screen-reader focus and can be dismissed. Non-modal
   * sheets sit at the bottom of their parent (e.g. over a map).
   */
  modal?: boolean;
  /** Modal only: whether the sheet is shown. Default true. */
  open?: boolean;
  /** Called when the user dismisses (backdrop, drag down, back button, a11y escape). */
  onClose?: () => void;
  /** Dim the content behind. Defaults to `modal`. */
  backdrop?: boolean;
  /** Allow drag-down / backdrop dismissal. Defaults to `modal`. */
  dismissible?: boolean;
  /** Title shown in the drag area under the handle. */
  title?: string;
  /** Custom content for the drag area (below the title). */
  header?: React.ReactNode;
  /** Screen-reader name of the sheet (default: title or "Sheet"). */
  accessibilityLabel?: string;
  testID?: string;
}

const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
/** Fraction of fling velocity used to project where a drag would land. */
const VELOCITY_PROJECTION = 0.12;

function resolveSnap(point: SnapPoint, available: number): number {
  if (typeof point === 'number') return Math.min(point, available);
  const pct = parseFloat(point);
  return Math.round((Math.max(0, Math.min(100, pct)) / 100) * available);
}

/**
 * Draggable bottom sheet built on reanimated + gesture-handler.
 *
 * - Snap points in px or %, fling-aware snapping, optional pan-to-dismiss.
 * - The drag area is the handle + header, so lists inside the sheet scroll
 *   normally.
 * - Accessible: the handle is an "adjustable" control (swipe up / down with
 *   VoiceOver to change height), modal sheets set accessibilityViewIsModal
 *   and support the escape gesture / Android back.
 * - Reduce motion: snaps without spring animation.
 */
export function BottomSheet({
  children,
  snapPoints,
  initialIndex = 0,
  index: controlledIndex,
  onIndexChange,
  modal = false,
  open = true,
  onClose,
  backdrop,
  dismissible,
  title,
  header,
  accessibilityLabel,
  testID = 'bottom-sheet',
}: BottomSheetProps) {
  const window = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
  const reduceMotion = useReducedMotion();
  const showBackdrop = backdrop ?? modal;
  const canDismiss = dismissible ?? modal;

  const [available, setAvailable] = useState(window.height);
  const heights = useMemo(() => {
    const cap = modal ? available - insets.top : available;
    return snapPoints.map((p) => resolveSnap(p, cap));
  }, [snapPoints, available, insets.top, modal]);
  const maxH = Math.max(...heights, 0);

  const [internalIndex, setInternalIndex] = useState(
    Math.min(Math.max(initialIndex, 0), snapPoints.length - 1)
  );
  const currentIndex = controlledIndex ?? internalIndex;

  // Modal mount lifecycle: stay mounted while the close animation runs.
  const [mounted, setMounted] = useState(!modal || open);

  // translateY: 0 = fully expanded to maxH; maxH = fully hidden.
  const translateY = useSharedValue(modal ? maxH || window.height : maxH - (heights[currentIndex] ?? 0));
  const dragStart = useSharedValue(0);

  const animateTo = useCallback(
    (target: number, done?: () => void) => {
      if (reduceMotion) {
        translateY.value = target;
        done?.();
        return;
      }
      translateY.value = withSpring(target, motion.spring.sheet, (finished) => {
        if (finished && done) scheduleOnRN(done);
      });
    },
    [reduceMotion, translateY]
  );

  const setIndex = useCallback(
    (i: number) => {
      if (controlledIndex === undefined) setInternalIndex(i);
      onIndexChange?.(i);
    },
    [controlledIndex, onIndexChange]
  );

  // Open / close (modal) and follow index / layout changes.
  const openRef = useRef(open);
  useEffect(() => {
    if (modal && open) setMounted(true);
  }, [modal, open]);

  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = open;
    if (modal && !open) {
      if (wasOpen) {
        animateTo(maxH, () => setMounted(false));
      } else {
        setMounted(false);
      }
      return;
    }
    if (!mounted) return;
    animateTo(maxH - (heights[currentIndex] ?? 0));
  }, [modal, open, mounted, currentIndex, heights, maxH, animateTo]);

  const close = useCallback(() => {
    if (!canDismiss) return;
    onClose?.();
  }, [canDismiss, onClose]);

  // Offsets for each snap point (and "closed" when dismissible).
  const snapOffsets = useMemo(() => heights.map((h) => maxH - h), [heights, maxH]);

  const onDragEnd = useCallback(
    (projected: number) => {
      const candidates = snapOffsets.map((offset, i) => ({ offset, i }));
      if (canDismiss) candidates.push({ offset: maxH, i: -1 });
      let best = candidates[0];
      for (const c of candidates) {
        if (Math.abs(c.offset - projected) < Math.abs(best.offset - projected)) best = c;
      }
      if (best.i === -1) {
        animateTo(maxH);
        close();
        return;
      }
      animateTo(best.offset);
      if (best.i !== currentIndex) setIndex(best.i);
    },
    [snapOffsets, canDismiss, maxH, animateTo, close, currentIndex, setIndex]
  );

  const minOffset = 0;
  const maxOffset = canDismiss ? maxH : snapOffsets[0] ?? maxH;
  const pan = Gesture.Pan()
    .withTestId(`${testID}-pan`)
    .onStart(() => {
      dragStart.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = dragStart.value + e.translationY;
      // Rubber-band past the tallest snap point.
      translateY.value = next < minOffset ? minOffset + next * 0.2 : Math.min(next, maxOffset);
    })
    .onEnd((e) => {
      scheduleOnRN(onDragEnd, translateY.value + e.velocityY * VELOCITY_PROJECTION);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const lowest = snapOffsets[0] ?? maxH;
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [lowest, maxH], [1, 0], Extrapolation.CLAMP),
  }));

  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const last = heights.length - 1;
      switch (e.nativeEvent.actionName) {
        case 'increment':
          if (currentIndex < last) setIndex(currentIndex + 1);
          break;
        case 'decrement':
          if (currentIndex > 0) setIndex(currentIndex - 1);
          else close();
          break;
        case 'activate':
          setIndex(currentIndex === last ? 0 : last);
          break;
        case 'escape':
          close();
          break;
      }
    },
    [heights.length, currentIndex, setIndex, close]
  );

  const name = accessibilityLabel ?? title ?? 'Sheet';
  const stateText =
    heights.length > 1
      ? currentIndex === heights.length - 1
        ? 'Expanded'
        : currentIndex === 0
          ? 'Collapsed'
          : `Size ${currentIndex + 1} of ${heights.length}`
      : undefined;

  const sheet = (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - available) > 1) setAvailable(h);
      }}
    >
      {showBackdrop ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            disabled={!canDismiss}
            accessibilityRole="button"
            accessibilityLabel={`Close ${name}`}
            testID={`${testID}-backdrop`}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        testID={testID}
        accessibilityViewIsModal={modal}
        accessibilityLabel={name}
        onAccessibilityEscape={canDismiss ? close : undefined}
        style={[styles.sheet, { height: maxH }, sheetStyle]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.dragArea} testID={`${testID}-drag-area`}>
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`${name} handle`}
              accessibilityHint={heights.length > 1 ? 'Swipe up or down to resize' : undefined}
              accessibilityValue={stateText ? { text: stateText } : undefined}
              accessibilityActions={[
                { name: 'increment' },
                { name: 'decrement' },
                { name: 'activate' },
                { name: 'escape' },
              ]}
              onAccessibilityAction={onAccessibilityAction}
              style={styles.handleHit}
              testID={`${testID}-handle`}
            >
              <View style={styles.handle} />
            </View>
            {title ? (
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            {header}
          </View>
        </GestureDetector>
        <View style={[styles.content, { paddingBottom: insets.bottom }]}>{children}</View>
      </Animated.View>
    </View>
  );

  if (!modal) return mounted ? sheet : null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* A native modal is a separate root: gestures need their own root view. */}
      <GestureHandlerRootView style={styles.fill}>{sheet}</GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: zIndex.sheet,
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    ...elevation.lg,
  },
  dragArea: {
    paddingBottom: spacing.sm,
  },
  handleHit: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: radii.full,
    backgroundColor: colors.borderStrong,
  },
  title: {
    ...typography.h3,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  content: {
    flex: 1,
  },
});
