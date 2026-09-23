import { StyleSheet, Text, View } from 'react-native';

import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS_15,
  joinTime,
  snapMinuteTo15,
  splitTime,
  type TimeString,
} from '../lib/sessionTime';
import { colors, spacing, typography } from '../theme';
import { WheelPicker } from './WheelPicker';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export interface TimeWheelPickerProps {
  /** Current "HH:MM" value. */
  value: TimeString;
  /** Called with the new "HH:MM" whenever either wheel settles. */
  onChange: (next: TimeString) => void;
  /** Per-test prefix so hour-row + minute-row labels stay distinct. */
  hourLabelPrefix?: string;
  minuteLabelPrefix?: string;
}

/**
 * Two-wheel time picker: hour (00–23) on the left, minute (00, 15, 30, 45)
 * on the right, with a fixed colon separator. Mirrors the iPhone Clock
 * alarm wheel pair without the AM/PM column — sport sessions don't need
 * it and AM/PM is a known UX irritant.
 */
export function TimeWheelPicker({
  value,
  onChange,
  hourLabelPrefix = 'Set hour',
  minuteLabelPrefix = 'Set minute',
}: TimeWheelPickerProps) {
  const { hour, minute } = splitTime(value);
  // If a non-15-step minute leaks in (legacy state, manual entry), snap
  // it to the closest 15-step so the wheel can show + control it.
  const safeMinute = snapMinuteTo15(minute);

  return (
    <View style={styles.row}>
      <WheelPicker<number>
        items={HOUR_OPTIONS}
        selected={hour}
        onChange={(h) => onChange(joinTime(h, safeMinute))}
        formatItem={pad2}
        accessibilityLabel="Hour"
        accessibilityRowLabelPrefix={hourLabelPrefix}
        keyExtractor={(h) => `h-${h}`}
      />
      <Text style={styles.colon}>:</Text>
      <WheelPicker<number>
        items={MINUTE_OPTIONS_15}
        selected={safeMinute}
        onChange={(m) => onChange(joinTime(hour, m))}
        formatItem={pad2}
        accessibilityLabel="Minute"
        accessibilityRowLabelPrefix={minuteLabelPrefix}
        keyExtractor={(m) => `m-${m}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  colon: {
    ...typography.stat,
    color: colors.brand,
  },
});
