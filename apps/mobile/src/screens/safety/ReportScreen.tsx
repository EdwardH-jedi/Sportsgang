import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { useReport, type ReportReason } from '../../hooks/useReport';
import { colors, radii, spacing, typography } from '../../theme';
import type { ReportScreenProps } from '../../navigation/types';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'fake', label: 'Fake profile' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

export function ReportScreen({ route, navigation }: ReportScreenProps) {
  const { reportedUserId, reportedName } = route.params;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [context, setContext] = useState('');
  const { isSubmitting, submitted, error, submit } = useReport(reportedUserId);

  const handleSubmit = async () => {
    if (!reason || isSubmitting) return;
    await submit(reason, context.trim() || undefined);
  };

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>{'←'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Report</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {submitted ? (
        <View style={styles.successWrap}>
          <Text style={styles.successTitle}>Report submitted</Text>
          <Text style={styles.successBody}>
            Thanks for helping keep SportsGang safe. We'll review this user.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.prompt}>
            Why are you reporting {reportedName}?
          </Text>

          <View style={styles.reasonList}>
            {REASONS.map((r) => (
              <Pressable
                key={r.value}
                style={({ pressed }) => [
                  styles.reasonRow,
                  reason === r.value && styles.reasonRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => setReason(r.value)}
                accessibilityRole="radio"
              >
                <View
                  style={[
                    styles.reasonRadio,
                    reason === r.value && styles.reasonRadioSelected,
                  ]}
                />
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.contextField}>
            <Text style={styles.contextLabel}>Additional context (optional)</Text>
            <TextInput
              style={styles.contextInput}
              value={context}
              onChangeText={setContext}
              placeholder="Describe what happened…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={1000}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              (!reason || isSubmitting) && styles.submitButtonDisabled,
              pressed && reason && !isSubmitting && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={!reason || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Submit report"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.submitButtonText}>Submit report</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  form: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  prompt: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  reasonList: {
    gap: spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.background,
  },
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  reasonRadioSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  reasonLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  contextField: {
    gap: spacing.xs,
  },
  contextLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  contextInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  submitButton: {
    backgroundColor: colors.error,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  successWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  successTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: colors.brand,
    // Pill for the post-success affirmative CTA — matches every other
    // brand-primary button in the app. The red `submitButton` above
    // stays at radii.md as an intentional destructive-action signal.
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  doneButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: { opacity: 0.65 },
});
