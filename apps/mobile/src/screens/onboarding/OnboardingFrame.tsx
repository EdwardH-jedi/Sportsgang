import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Header, Icon, Screen } from '../../components/ui';
import { colors, radii, spacing, typography } from '../../theme';

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
      // Always render the header row (empty on step 1) so the progress bar
      // sits at the same height on every step.
      header={<Header onBack={onBack} backLabel="Back" testID="onboarding-header" />}
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
  required = false,
  children,
}: {
  title: string;
  hint?: string;
  /** Red required marker, matching TextField / Select. */
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
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
  required: {
    color: colors.error,
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
});
