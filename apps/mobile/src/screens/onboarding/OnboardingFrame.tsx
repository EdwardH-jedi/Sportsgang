import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Header, Icon, Screen, hapticSelection } from '../../components/ui';
import { colors, radii, spacing, touchTarget, typography } from '../../theme';

export const ONBOARDING_STEPS = 4;

export interface OnboardingFrameProps {
  step: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  error?: string | null;
  submitLabel: string;
  onSubmit: () => void;
  submitting: boolean;
  /** Pass for screens with text inputs. */
  withKeyboard?: boolean;
  /** Back to the previous step (steps 2+). */
  onBack?: () => void;
}

/**
 * Shared onboarding layout: segmented progress + "Step N of 4", a large
 * condensed title, scrolling body, and the primary action pinned in the
 * footer (with the form error above it).
 */
export function OnboardingFrame({
  step,
  eyebrow,
  title,
  subtitle,
  children,
  error,
  submitLabel,
  onSubmit,
  submitting,
  withKeyboard = false,
  onBack,
}: OnboardingFrameProps) {
  return (
    <Screen
      scroll
      withKeyboard={withKeyboard}
      header={onBack ? <Header onBack={onBack} backLabel="Back" /> : undefined}
      footer={
        <View style={styles.footer}>
          {error ? (
            <View style={styles.errorRow} accessibilityRole="alert">
              <Icon name="alert" size="sm" color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Button
            label={submitLabel}
            size="lg"
            fullWidth
            loading={submitting}
            onPress={onSubmit}
          />
        </View>
      }
    >
      <View
        style={styles.progressBlock}
        accessibilityLabel={`Step ${step} of ${ONBOARDING_STEPS}`}
      >
        <View style={styles.progressBar}>
          {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
            <View key={i} style={[styles.segment, i < step && styles.segmentActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          Step {step} of {ONBOARDING_STEPS}
        </Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.body}>{children}</View>
    </Screen>
  );
}

/** Section with an uppercase label. */
export function OnboardingSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export interface ChoiceChipProps {
  label: string;
  checked: boolean;
  onPress: () => void;
  /** checkbox = multi-select, radio = single-select. */
  role: 'checkbox' | 'radio';
}

/**
 * Selectable pill with checkbox / radio semantics (the ui `Chip` is a
 * plain button; onboarding choices need checked state for screen readers).
 */
export function ChoiceChip({ label, checked, onPress, role }: ChoiceChipProps) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        styles.choice,
        checked ? styles.choiceOn : styles.choiceOff,
        pressed && !checked && styles.choicePressed,
      ]}
    >
      {checked ? <Icon name="check" size="sm" color={colors.textInverse} /> : null}
      <Text style={[styles.choiceText, checked && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.choiceRow}>{children}</View>;
}

const styles = StyleSheet.create({
  progressBlock: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  progressBar: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  segmentActive: {
    backgroundColor: colors.brand,
  },
  stepLabel: {
    ...typography.label,
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  title: {
    ...typography.display,
  },
  subtitle: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
  },
  body: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  footer: {
    gap: spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
    flex: 1,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choice: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  choiceOff: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  choiceOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choicePressed: {
    backgroundColor: colors.surfacePressed,
  },
  choiceText: {
    ...typography.buttonSmall,
    color: colors.textPrimary,
  },
  choiceTextOn: {
    color: colors.textInverse,
  },
});
