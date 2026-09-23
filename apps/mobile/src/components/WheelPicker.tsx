import { useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, touchTarget, typography } from '../theme';

const ITEM_HEIGHT = touchTarget; // iOS-standard 44pt row — matches the snap interval.
const VISIBLE_COUNT = 5; // Odd: 2 above + 1 center + 2 below.
const VISIBLE_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
const HALF_VISIBLE = Math.floor(VISIBLE_COUNT / 2);
const PADDING = ITEM_HEIGHT * HALF_VISIBLE;

export interface WheelPickerProps<T> {
  items: readonly T[];
  selected: T;
  onChange: (value: T) => void;
  /** How each item should render in the wheel. */
  formatItem: (value: T) => string;
  /** Per-row accessibility label prefix — full label is `${prefix} ${formatItem(value)}`. */
  accessibilityRowLabelPrefix?: string;
  /** Labels the wheel column itself (announced by screen readers). */
  accessibilityLabel?: string;
  /** Stable string-key for each item — defaults to `String(item)`. */
  keyExtractor?: (item: T, index: number) => string;
}

/**
 * Snap-to-center vertical wheel picker, built from a ScrollView (no
 * external dependency). Mirrors the iPhone Clock alarm wheel feel:
 *
 * - Scroll snaps to ITEM_HEIGHT, settle dispatches `onChange` for the
 *   row that landed on center.
 * - Tapping any visible row also selects it AND animates the scroll
 *   so that row sits at center. This matches iOS Clock's
 *   tap-an-off-center-row behavior and keeps the picker driveable
 *   from accessibility tools / tests.
 *
 * The center selection cursor is a raised surface band with a faint lime
 * outline behind the center row — visually quiet but unambiguous. Values
 * use the condensed stat face with tabular digits.
 */
export function WheelPicker<T>({
  items,
  selected,
  onChange,
  formatItem,
  accessibilityRowLabelPrefix = 'Set',
  accessibilityLabel,
  keyExtractor,
}: WheelPickerProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = items.indexOf(selected);
  // Track the most recently dispatched index so we don't fire onChange
  // when the wheel happens to settle on the value it already had (avoids
  // an infinite parent-controlled feedback loop).
  const lastDispatchedIndexRef = useRef<number>(selectedIndex);

  // Whenever the externally-controlled `selected` changes, scroll the
  // wheel to that row. This keeps the wheel in sync with parent state
  // changes (e.g. auto-shifted end time when start moves).
  useEffect(() => {
    if (selectedIndex < 0) return;
    lastDispatchedIndexRef.current = selectedIndex;
    scrollRef.current?.scrollTo({
      y: selectedIndex * ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex]);

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // ITEM_HEIGHT is the snap interval, so contentOffset / ITEM_HEIGHT
    // is the index of the row currently at center.
    const idx = Math.max(
      0,
      Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT))
    );
    if (idx !== lastDispatchedIndexRef.current) {
      lastDispatchedIndexRef.current = idx;
      onChange(items[idx]);
    }
  };

  const handlePressItem = (item: T, index: number) => {
    if (index === lastDispatchedIndexRef.current) return;
    lastDispatchedIndexRef.current = index;
    onChange(item);
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={styles.column} accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}>
      {/* Selection cursor — a raised band behind the center row. */}
      <View style={styles.cursorBand} pointerEvents="none" />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={styles.scrollContent}
        // Initial offset so the selected row lands at center on first
        // mount; the useEffect above keeps it in sync afterward.
        contentOffset={{ x: 0, y: Math.max(0, selectedIndex) * ITEM_HEIGHT }}
      >
        {items.map((item, index) => {
          const key = keyExtractor ? keyExtractor(item, index) : String(item);
          const isSelected = item === selected;
          return (
            <Pressable
              key={key}
              onPress={() => handlePressItem(item, index)}
              accessibilityRole="button"
              accessibilityLabel={`${accessibilityRowLabelPrefix} ${formatItem(item)}`}
              style={styles.row}
            >
              <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                {formatItem(item)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: touchTarget * 2,
    height: VISIBLE_HEIGHT,
    justifyContent: 'center',
  },
  scrollContent: {
    // Padding so first / last items can scroll into the center row.
    paddingTop: PADDING,
    paddingBottom: PADDING,
  },
  row: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    ...typography.statSmall,
    color: colors.textTertiary,
  },
  rowTextSelected: {
    color: colors.textPrimary,
  },
  cursorBand: {
    position: 'absolute',
    top: PADDING,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.brandMuted,
  },
});
