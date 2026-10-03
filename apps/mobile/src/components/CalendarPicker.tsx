import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  buildMonthGrid,
  combineToLocalDate,
  daysInMonth,
  formatDateLabel,
  isPastDate,
  monthLabel,
  shiftMonth,
  toDateString,
  type DateString,
} from '../lib/sessionTime';
import { colors, radii, spacing, typography } from '../theme';

// Sunday-first labels. Index 0 == Sunday, matching JavaScript's
// `Date.getDay()` and `firstWeekdayOfMonth`. The grid offset and the
// header MUST share this convention or May 1 2026 (Friday) drifts off
// its real column. See `buildMonthGrid` for the offset rule.
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// 7 columns share the row evenly. Using a percentage flex-basis keeps
// the weekday header row and the day-cell rows on the SAME column
// geometry regardless of container width — `justifyContent:
// 'space-between'` with fixed-width children was distributing leftover
// horizontal slack independently per row on real iPhones, which shifted
// day cells one column off the matching header label.
const COLUMN_FLEX_BASIS = `${100 / 7}%` as const;

export interface CalendarPickerProps {
  /** Currently-selected date — drives initial visible month + selection ring. */
  selected: DateString;
  /** Called when the user taps a non-disabled day. */
  onSelect: (date: DateString) => void;
  /** Override the "today" reference — accepted for testability. */
  now?: Date;
  /**
   * Calendar date that counts as today ("YYYY-MM-DD"). The booking composer
   * passes Sydney's date so past-day rules follow Sydney, not the device.
   * Defaults to the device-local date of `now`.
   */
  today?: DateString;
}

/**
 * Month-grid calendar picker, banking-app style.
 *
 * - 7-column grid (Sun..Sat header).
 * - Header carries the visible month label + prev/next arrows.
 * - The visible month opens on `month-of(selected)` so reopening the
 *   picker after a future-date pick lands on that month, not today.
 * - Past days are visually de-emphasised AND non-pressable (v1 rule:
 *   no past-date proposals).
 * - Today and the currently-selected day each get a distinct visual
 *   treatment.
 */
export function CalendarPicker({ selected, onSelect, now = new Date(), today }: CalendarPickerProps) {
  const initial = useMemo(() => combineToLocalDate(selected, '00:00'), [selected]);
  const [visibleYear, setVisibleYear] = useState(initial.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initial.getMonth());

  const todayStr = useMemo(() => today ?? toDateString(now), [today, now]);
  const selectedStr = selected;

  // Build the grid cells via the pure helper so the offset (May 1 2026 ->
  // Friday in Sunday-first) is regression-tested independently of the
  // component renderer.
  const cells = useMemo(
    () => buildMonthGrid(visibleYear, visibleMonth),
    [visibleYear, visibleMonth]
  );

  const handlePrevMonth = () => {
    const next = shiftMonth(visibleYear, visibleMonth, -1);
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  };

  const handleNextMonth = () => {
    const next = shiftMonth(visibleYear, visibleMonth, 1);
    setVisibleYear(next.year);
    setVisibleMonth(next.month);
  };

  // Disable the prev arrow when the visible month is in the past — there's
  // no reason to step backward into months whose every day is past.
  const visibleMonthEndStr = toDateString(
    new Date(visibleYear, visibleMonth, daysInMonth(visibleYear, visibleMonth))
  );
  const prevDisabled = visibleMonthEndStr <= todayStr;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={handlePrevMonth}
          disabled={prevDisabled}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          style={({ pressed }) => [
            styles.navButton,
            prevDisabled && styles.navButtonDisabled,
            pressed && !prevDisabled && styles.pressed,
          ]}
        >
          <Text
            style={[styles.navText, prevDisabled && styles.navTextDisabled]}
          >
            {'‹'}
          </Text>
        </Pressable>

        <Text style={styles.monthLabel}>{monthLabel(visibleYear, visibleMonth)}</Text>

        <Pressable
          onPress={handleNextMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Text style={styles.navText}>{'›'}</Text>
        </Pressable>
      </View>

      <View style={styles.weekHeaderRow}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text key={`wd-${i}`} style={styles.weekHeaderText}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (!cell.date) {
            return <View key={cell.key} style={styles.cell} />;
          }
          const isToday = cell.date === todayStr;
          const isSelected = cell.date === selectedStr;
          const isPast = today ? cell.date < today : isPastDate(cell.date, now);
          return (
            <Pressable
              key={cell.key}
              onPress={() => !isPast && onSelect(cell.date!)}
              disabled={isPast}
              accessibilityRole="button"
              accessibilityLabel={`Select ${formatDateLabel(cell.date)}`}
              accessibilityState={{ disabled: isPast, selected: isSelected }}
              style={({ pressed }) => [
                styles.cell,
                pressed && !isPast && styles.pressed,
              ]}
            >
              {/* The cell takes 1/7 of row width for column alignment with
                  the header. The inner pill stays a fixed 40x40 round
                  shape so the today / selected indicators remain a
                  perfect circle on every screen size. */}
              <View
                style={[
                  styles.dayPill,
                  isToday && !isSelected && styles.dayPillToday,
                  isSelected && styles.dayPillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && !isSelected && styles.dayTextToday,
                    isSelected && styles.dayTextSelected,
                    isPast && styles.dayTextPast,
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL_HEIGHT = 40;
const ROW_GAP = 4;

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  navText: {
    fontSize: 26,
    color: colors.brand,
    lineHeight: 28,
  },
  navTextDisabled: {
    color: colors.textTertiary,
  },
  monthLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  weekHeaderText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    flexBasis: COLUMN_FLEX_BASIS,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: ROW_GAP,
  },
  cell: {
    flexBasis: COLUMN_FLEX_BASIS,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPill: {
    width: CELL_HEIGHT,
    height: CELL_HEIGHT,
    borderRadius: CELL_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillToday: {
    borderWidth: 1,
    borderColor: colors.brand,
  },
  dayPillSelected: {
    backgroundColor: colors.brand,
  },
  dayText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  dayTextToday: {
    color: colors.brand,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  dayTextPast: {
    color: colors.textTertiary,
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.65,
  },
});
