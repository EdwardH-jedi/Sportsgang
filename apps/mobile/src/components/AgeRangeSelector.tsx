import { useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, spacing, touchTarget, typography } from '../theme';
import { Icon } from './ui/Icon';

/**
 * Stepper glyph size in points, built from spacing rather than an
 * `iconSizes` token: onboarding tests mock only part of the theme.
 */
const GLYPH = spacing.md + spacing.xs;

interface AgeRangeSelectorProps {
  minAge: number;
  maxAge: number;
  onChange: (minAge: number, maxAge: number) => void;
  minLimit?: number;
  maxLimit?: number;
}

const DEFAULT_MIN_LIMIT = 18;
const DEFAULT_MAX_LIMIT = 80;

// Keyboard-free range picker. iOS number-pad has no Return key, so editing
// age via TextInput on iPhone left users stranded. The bar is directly
// touch-interactive (tap-to-set + drag) so iPhone users can set the range
// without the keyboard. Steppers remain as a fine-grained / a11y fallback.
// Equality (min === max) is allowed to match the legacy validator
// (`min > max` is invalid; `min === max` isn't).
export function AgeRangeSelector({
  minAge,
  maxAge,
  onChange,
  minLimit = DEFAULT_MIN_LIMIT,
  maxLimit = DEFAULT_MAX_LIMIT,
}: AgeRangeSelectorProps) {
  const range = maxLimit - minLimit;
  const [barWidth, setBarWidth] = useState(0);
  const activeHandleRef = useRef<'min' | 'max' | null>(null);

  const minOffsetPct = range > 0 ? ((minAge - minLimit) / range) * 100 : 0;
  const maxOffsetPct = range > 0 ? ((maxAge - minLimit) / range) * 100 : 100;
  const fillWidthPct = Math.max(0, maxOffsetPct - minOffsetPct);

  function xToAge(x: number): number {
    if (barWidth <= 0 || range <= 0) return minLimit;
    const clampedX = Math.max(0, Math.min(barWidth, x));
    return Math.round(minLimit + (clampedX / barWidth) * range);
  }

  function applyToHandle(x: number, target: 'min' | 'max') {
    const age = xToAge(x);
    if (target === 'min') {
      const next = Math.max(minLimit, Math.min(age, maxAge));
      if (next !== minAge) onChange(next, maxAge);
    } else {
      const next = Math.min(maxLimit, Math.max(age, minAge));
      if (next !== maxAge) onChange(minAge, next);
    }
  }

  function pickHandle(x: number): 'min' | 'max' {
    if (barWidth <= 0) return 'min';
    const minX = (minOffsetPct / 100) * barWidth;
    const maxX = (maxOffsetPct / 100) * barWidth;
    const distToMin = Math.abs(x - minX);
    const distToMax = Math.abs(x - maxX);
    if (distToMin < distToMax) return 'min';
    if (distToMax < distToMin) return 'max';
    // Equidistant (e.g. handles overlap). Direction decides which side moves.
    return x < minX ? 'min' : 'max';
  }

  function handleLayout(e: LayoutChangeEvent) {
    setBarWidth(e.nativeEvent.layout.width);
  }

  function handleGrant(e: GestureResponderEvent) {
    const x = e.nativeEvent.locationX;
    const target = pickHandle(x);
    activeHandleRef.current = target;
    applyToHandle(x, target);
  }

  function handleMove(e: GestureResponderEvent) {
    if (!activeHandleRef.current) return;
    applyToHandle(e.nativeEvent.locationX, activeHandleRef.current);
  }

  function handleRelease() {
    activeHandleRef.current = null;
  }

  const canDecMin = minAge > minLimit;
  const canIncMin = minAge < maxAge;
  const canDecMax = maxAge > minAge;
  const canIncMax = maxAge < maxLimit;

  function decMin() {
    if (canDecMin) onChange(minAge - 1, maxAge);
  }
  function incMin() {
    if (canIncMin) onChange(minAge + 1, maxAge);
  }
  function decMax() {
    if (canDecMax) onChange(minAge, maxAge - 1);
  }
  function incMax() {
    if (canIncMax) onChange(minAge, maxAge + 1);
  }

  return (
    <View style={styles.container} accessibilityLabel="Partner age range selector">
      <View style={styles.summaryRow}>
        <Text style={styles.summaryValue} accessibilityLabel={`Age range ${minAge} to ${maxAge}`}>
          {minAge} <Text style={styles.summaryDash}>–</Text> {maxAge}
        </Text>
        <Text style={styles.summaryUnit}>years</Text>
      </View>

      <View
        accessibilityLabel="Age range bar"
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleRelease}
        // Parent <Screen scroll> wraps everything in a ScrollView; without
        // this, the ScrollView reclaims the responder on the first vertical
        // drift mid-drag and the handle stops following the finger.
        onResponderTerminationRequest={() => false}
        style={styles.barHitArea}
      >
        <View style={styles.scale}>
          <View style={styles.track} />
          <View
            style={[
              styles.fill,
              { left: `${minOffsetPct}%`, width: `${fillWidthPct}%` },
            ]}
          />
          <View
            style={[styles.thumb, { left: `${minOffsetPct}%` }]}
            pointerEvents="none"
          />
          <View
            style={[styles.thumb, { left: `${maxOffsetPct}%` }]}
            pointerEvents="none"
          />
        </View>
      </View>

      <View style={styles.scaleLabelsRow}>
        <Text style={styles.scaleEdgeLabel}>{minLimit}</Text>
        <Text style={styles.scaleEdgeLabel}>{maxLimit}</Text>
      </View>

      <View style={styles.controlsRow}>
        <StepperRow
          label="Min age"
          value={minAge}
          onDecrement={decMin}
          onIncrement={incMin}
          canDecrement={canDecMin}
          canIncrement={canIncMin}
          decrementLabel="Decrease minimum age"
          incrementLabel="Increase minimum age"
        />
        <StepperRow
          label="Max age"
          value={maxAge}
          onDecrement={decMax}
          onIncrement={incMax}
          canDecrement={canDecMax}
          canIncrement={canIncMax}
          decrementLabel="Decrease maximum age"
          incrementLabel="Increase maximum age"
        />
      </View>
    </View>
  );
}

interface StepperRowProps {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
  decrementLabel: string;
  incrementLabel: string;
}

function StepperRow({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
  decrementLabel,
  incrementLabel,
}: StepperRowProps) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={onDecrement}
          disabled={!canDecrement}
          accessibilityRole="button"
          accessibilityLabel={decrementLabel}
          accessibilityState={{ disabled: !canDecrement }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.stepperButton,
            !canDecrement && styles.stepperButtonDisabled,
            pressed && canDecrement && styles.pressed,
          ]}
        >
          <Icon
            name="minus"
            size={GLYPH}
            color={canDecrement ? colors.brand : colors.textTertiary}
          />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          onPress={onIncrement}
          disabled={!canIncrement}
          accessibilityRole="button"
          accessibilityLabel={incrementLabel}
          accessibilityState={{ disabled: !canIncrement }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.stepperButton,
            !canIncrement && styles.stepperButtonDisabled,
            pressed && canIncrement && styles.pressed,
          ]}
        >
          <Icon
            name="plus"
            size={GLYPH}
            color={canIncrement ? colors.brand : colors.textTertiary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const TRACK_HEIGHT = spacing.xs + spacing.xs / 2;
const THUMB_SIZE = spacing.lg;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  summaryValue: {
    ...typography.statLarge,
    color: colors.brand,
  },
  summaryDash: {
    color: colors.textTertiary,
  },
  summaryUnit: {
    ...typography.body,
    color: colors.textTertiary,
  },
  // Vertical-padding only — locationX is relative to the responder's left
  // edge, so any horizontal padding would offset the x→age mapping.
  barHitArea: {
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  scale: {
    height: THUMB_SIZE,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.brand,
    borderWidth: 3,
    borderColor: colors.background,
    marginLeft: -THUMB_SIZE / 2,
    top: 0,
  },
  scaleLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  scaleEdgeLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepperLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepperButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  stepperValue: {
    ...typography.stat,
    color: colors.textPrimary,
    minWidth: spacing.xl + spacing.sm,
    textAlign: 'center',
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
