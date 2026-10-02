import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SetupMode } from '../../navigation/types';
import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';

export const SETUP_TOTAL_STEPS = 4;

interface SetupHeaderProps {
  mode: SetupMode;
  /** 1-based step within the onboarding flow (Step 1 is the identity screen). */
  step: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

/**
 * Header shared by the v2 setup screens. Onboarding shows the same
 * "Step n of 4" bar as OnboardingStep1; adding a sport later from Profile
 * shows a plain "Add a sport" eyebrow instead of a misleading progress bar.
 */
export function SetupHeader({ mode, step, title, subtitle, onBack }: SetupHeaderProps) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
      ) : null}

      {mode === 'onboarding' ? (
        <View style={styles.progressBlock}>
          <View style={styles.progressBar}>
            {Array.from({ length: SETUP_TOTAL_STEPS }, (_, i) => (
              <View key={i} style={[styles.segment, i < step && styles.segmentActive]} />
            ))}
          </View>
          <Text style={styles.stepLabel}>
            Step {step} of {SETUP_TOTAL_STEPS}
          </Text>
        </View>
      ) : (
        <Text style={styles.eyebrow}>Add a sport</Text>
      )}

      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  back: {
    alignSelf: 'flex-start',
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  backText: { fontSize: 16, fontWeight: '600', color: colors.brand },
  pressed: { opacity: 0.7 },
  progressBlock: { gap: spacing.sm, marginBottom: spacing.lg },
  progressBar: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, height: 4, borderRadius: radii.pill, backgroundColor: colors.separator },
  segmentActive: { backgroundColor: colors.brand },
  stepLabel: { ...typography.label, color: colors.textTertiary },
  eyebrow: { ...typography.label, color: colors.accent, marginBottom: spacing.sm },
  title: { ...typography.h1, marginBottom: spacing.xs },
  subtitle: { ...typography.body },
});
