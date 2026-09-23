import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormErrorBanner } from '../../components/FormErrorBanner';
import { Button, Card, EmptyState, Header, Screen, TextField } from '../../components/ui';
import { useReport, type ReportReason } from '../../hooks/useReport';
import { colors, layout, spacing, touchTarget, typography } from '../../theme';
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
    <Screen
      padded={false}
      withKeyboard
      header={
        <Header
          title="Report"
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />
      }
    >
      {submitted ? (
        <EmptyState
          icon="check-circle"
          title="Report submitted"
          message="Thanks for helping keep SportsGang safe. We'll review this user."
          action={{ label: 'Done', onPress: () => navigation.goBack() }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.prompt} accessibilityRole="header">
            Why are you reporting {reportedName}?
          </Text>

          <Card padding="none" style={styles.reasonList}>
            <View accessibilityRole="radiogroup">
              {REASONS.map((r, i) => {
                const selected = reason === r.value;
                return (
                  <Pressable
                    key={r.value}
                    style={({ pressed }) => [
                      styles.reasonRow,
                      i < REASONS.length - 1 && styles.reasonDivider,
                      selected && styles.reasonRowSelected,
                      pressed && !selected && styles.reasonRowPressed,
                    ]}
                    onPress={() => setReason(r.value)}
                    accessibilityRole="radio"
                    accessibilityLabel={r.label}
                    accessibilityState={{ selected, checked: selected }}
                  >
                    <View style={[styles.reasonRadio, selected && styles.reasonRadioSelected]}>
                      {selected ? <View style={styles.reasonRadioDot} /> : null}
                    </View>
                    <Text style={styles.reasonLabel}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <TextField
            label="Additional context (optional)"
            value={context}
            onChangeText={setContext}
            placeholder="Describe what happened…"
            multiline
            maxLength={1000}
          />

          <FormErrorBanner message={error} />

          <Button
            label="Submit report"
            size="lg"
            fullWidth
            leadingIcon="flag"
            loading={isSubmitting}
            disabled={!reason}
            onPress={handleSubmit}
            accessibilityLabel="Submit report"
          />
        </ScrollView>
      )}
    </Screen>
  );
}

/** Radio circle diameter and its selected dot. */
const RADIO = spacing.md + spacing.xs;
const RADIO_DOT = spacing.sm + spacing.xs / 2;

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  form: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  prompt: {
    ...typography.h2,
  },
  reasonList: {
    overflow: 'hidden',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + spacing.sm,
    paddingHorizontal: spacing.md,
  },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  reasonRowSelected: {
    backgroundColor: colors.brandSoft,
  },
  reasonRowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  reasonRadio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonRadioSelected: {
    borderColor: colors.brand,
  },
  reasonRadioDot: {
    width: RADIO_DOT,
    height: RADIO_DOT,
    borderRadius: RADIO_DOT / 2,
    backgroundColor: colors.brand,
  },
  reasonLabel: {
    ...typography.bodyStrong,
  },
});
