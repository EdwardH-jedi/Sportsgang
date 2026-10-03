import { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, typography } from '../theme';

const ITEM_HEIGHT = 44; // iOS-standard row height — matches the snap interval.
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
 *   from accessibility tools / tests. The end of that animation is not a
 *   second selection.
 *
 * The center selection cursor is rendered as two hairlines above and
 * below the center row, with a faint highlight band — visually quiet
 * but unambiguous.
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
  // One authority for where the wheel is (review R5): the row it rests on or
  // is animating to. Only scrollToRow moves it programmatically, and it is
  // updated before onChange, so the parent's re-render never issues a second
  // scroll. (Natively, a tap used to start an animated scroll, the re-render
  // then jumped to the same row, the animation carried on one row further,
  // and its end was read as a user selection: 45 → tap 30 → 15.)
  const positionRef = useRef<number>(selectedIndex);
  // Row a programmatic scroll is heading to. iOS reports the end of every
  // programmatic scroll — animated or not — as a momentum end; that callback
  // only confirms the move, and one for any other row comes from a scroll
  // that was replaced, so it is ignored. A user drag takes over.
  const animatingToRef = useRef<number | null>(null);
  // Initial position only: a contentOffset prop that changes with every
  // selection is re-applied natively and fights an animation in flight.
  const [initialOffset] = useState(() => ({ x: 0, y: Math.max(0, selectedIndex) * ITEM_HEIGHT }));

  const rowAt = (y: number) => Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_HEIGHT)));

  const scrollToRow = (index: number, animated: boolean) => {
    positionRef.current = index;
    animatingToRef.current = index;
    scrollRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
  };

  // A value set from outside (reopening with the committed value, an
  // auto-shifted end time): move there. A value the wheel produced itself
  // is already where the wheel is.
  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex === positionRef.current) return;
    scrollToRow(selectedIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const select = (index: number) => {
    positionRef.current = index;
    if (items[index] !== selected) onChange(items[index]);
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // ITEM_HEIGHT is the snap interval, so contentOffset / ITEM_HEIGHT is
    // the index of the row currently at center.
    const index = rowAt(e.nativeEvent.contentOffset.y);
    const target = animatingToRef.current;
    if (target !== null) {
      if (index === target) animatingToRef.current = null;
      return;
    }
    select(index);
  };

  const handleDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Released exactly on a row: there is no momentum phase to settle it.
    const y = e.nativeEvent.contentOffset.y;
    if (Math.abs(y - rowAt(y) * ITEM_HEIGHT) < 0.5) select(rowAt(y));
  };

  const handlePressItem = (item: T, index: number) => {
    if (index === positionRef.current) return;
    scrollToRow(index, true);
    onChange(item);
  };

  return (
    <View style={styles.column} accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}>
      {/* Selection cursor — hairlines above + below the center row. */}
      <View style={styles.cursorBand} pointerEvents="none">
        <View style={styles.cursorHairline} />
        <View style={styles.cursorRow} />
        <View style={styles.cursorHairline} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={() => {
          animatingToRef.current = null;
        }}
        onScrollEndDrag={handleDragEnd}
        contentContainerStyle={styles.scrollContent}
        // Initial offset so the selected row lands at center on first
        // mount; the useEffect above keeps it in sync afterward.
        contentOffset={initialOffset}
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
              {/* Rows are a fixed 44 pt (the snap interval): cap text scaling
                  where 25 pt lines still fit, instead of clipping the digits. */}
              <Text style={[styles.rowText, isSelected && styles.rowTextSelected]} maxFontSizeMultiplier={1.6}>
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
    width: 90,
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
    ...typography.bodyLarge,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  rowTextSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cursorBand: {
    position: 'absolute',
    top: PADDING,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    justifyContent: 'space-between',
  },
  cursorHairline: {
    height: 1,
    backgroundColor: colors.brand,
    opacity: 0.5,
  },
  cursorRow: {
    flex: 1,
    backgroundColor: colors.brandSoft,
    opacity: 0.3,
  },
});
