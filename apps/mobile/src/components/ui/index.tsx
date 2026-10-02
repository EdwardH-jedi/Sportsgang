/**
 * Shared v2 UI primitives (light outdoor theme).
 *
 * One small file on purpose: buttons, chips, cards, form fields, the
 * segmented / focus switch and the loading / empty / error states that every
 * primary screen shares. All interactive pieces meet the 44pt touch target
 * and expose accessibility roles + state so screen readers and tests can
 * address them by label.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';

// ─── Buttons ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const textColor =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'danger'
        ? colors.error
        : colors.brand;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'primary' && pressed && styles.buttonPrimaryPressed,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        pressed && variant !== 'primary' && styles.pressed,
        inactive && styles.buttonInactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]} numberOfLines={2}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Chips ──────────────────────────────────────────────────────────────────

type ChipTone = 'neutral' | 'brand' | 'warning';

/** Read-only information chip ("Pace 5:30–6:30 /km", "18 holes"). */
export function InfoChip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  return (
    <View
      style={[
        styles.infoChip,
        tone === 'brand' && styles.infoChipBrand,
        tone === 'warning' && styles.infoChipWarning,
      ]}
    >
      <Text
        style={[
          styles.infoChipText,
          tone === 'brand' && styles.infoChipTextBrand,
          tone === 'warning' && styles.infoChipTextWarning,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

interface ChoiceChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for single-choice groups, 'checkbox' for multi-select. */
  kind?: 'radio' | 'checkbox';
  description?: string;
  disabled?: boolean;
}

/** Selectable chip for single- or multi-choice form groups. */
export function ChoiceChip({
  label,
  selected,
  onPress,
  kind = 'radio',
  description,
  disabled = false,
}: ChoiceChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={kind === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      style={({ pressed }) => [
        styles.choiceChip,
        description ? styles.choiceChipWide : null,
        selected && styles.choiceChipSelected,
        pressed && styles.pressed,
        disabled && styles.buttonInactive,
      ]}
    >
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>{label}</Text>
      {description ? (
        <Text style={[styles.choiceChipDescription, selected && styles.choiceChipTextSelected]}>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Wrapping row for chips. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

// ─── Segmented control / focus switch ───────────────────────────────────────

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * Two- or three-way switch used for the Run/Golf focus switch and the
 * Sessions/Partners view switch. Exposed as a tablist so assistive tech
 * announces the selected segment.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} testID={testID}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.segment, active && styles.segmentActive, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Cards and sections ─────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, onPress, accessibilityLabel, style, testID }: CardProps) {
  if (!onPress) {
    return (
      <View style={[styles.card, style]} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={styles.sectionTitleBlock}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {children}
      </Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/** Screen-level header used by every tab so the tabs share one chrome. */
export function ScreenHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.screenTitle} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

// ─── Form field ─────────────────────────────────────────────────────────────

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

export function Field({ label, hint, error, required, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, error ? styles.inputError : null, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ─── Loading / empty / error states ─────────────────────────────────────────

export function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.state} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.stateBody}>{label}</Text>
    </View>
  );
}

interface MessageStateProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ title, body, actionLabel, onAction, testID }: MessageStateProps) {
  return (
    <View style={styles.state} testID={testID}>
      <Text style={styles.stateTitle}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.stateAction} />
      ) : null}
    </View>
  );
}

/** Request failure — always distinct from "no results", always retryable. */
export function ErrorState({ title = 'Could not load', body, actionLabel = 'Try again', onAction, testID }: Partial<MessageStateProps> & { onAction: () => void }) {
  return (
    <View style={[styles.state, styles.errorState]} testID={testID} accessibilityRole="alert">
      <Text style={[styles.stateTitle, styles.errorTitle]}>{title}</Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.stateAction} />
    </View>
  );
}

/** Inline banner for a partial failure (e.g. one My Plans source failed). */
export function InlineNotice({
  text,
  actionLabel,
  onAction,
  tone = 'warning',
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'warning' | 'info';
}) {
  return (
    <View style={[styles.notice, tone === 'info' && styles.noticeInfo]} accessibilityRole={tone === 'warning' ? 'alert' : undefined}>
      <Text style={[styles.noticeText, tone === 'info' && styles.noticeTextInfo]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [styles.noticeAction, pressed && styles.pressed]}
        >
          <Text style={styles.noticeActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },

  button: {
    minHeight: TOUCH_TARGET + 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryPressed: { backgroundColor: colors.primaryPressed },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.brand,
  },
  buttonDanger: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonInactive: { opacity: 0.5 },
  buttonText: { ...typography.button, textAlign: 'center' },

  infoChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
  },
  infoChipBrand: { backgroundColor: colors.brandSoft },
  infoChipWarning: { backgroundColor: colors.warningSoft },
  infoChipText: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, fontWeight: '500' },
  infoChipTextBrand: { color: colors.brand, fontWeight: '600' },
  infoChipTextWarning: { color: colors.warning, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  choiceChipWide: {
    borderRadius: radii.md,
    width: '100%',
    paddingVertical: spacing.sm + 2,
  },
  choiceChipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  choiceChipText: { fontSize: 15, lineHeight: 20, color: colors.textPrimary, fontWeight: '500' },
  choiceChipTextSelected: { color: colors.brand, fontWeight: '600' },
  choiceChipDescription: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: TOUCH_TARGET - 4,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.brandDarkest,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.brand },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
  },
  sectionTitleBlock: { marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3 },
  sectionHint: { ...typography.bodySmall, marginTop: 2 },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  screenHeaderText: { flex: 1 },
  eyebrow: { ...typography.label, color: colors.accent, marginBottom: 2 },
  screenTitle: { ...typography.h1 },

  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: spacing.xs },
  required: { color: colors.error },
  input: {
    minHeight: TOUCH_TARGET + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.error },
  fieldError: { fontSize: 13, lineHeight: 18, color: colors.error, marginTop: spacing.xs },
  fieldHint: { fontSize: 13, lineHeight: 18, color: colors.textTertiary, marginTop: spacing.xs },

  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  errorState: {},
  stateTitle: { ...typography.h3, textAlign: 'center' },
  errorTitle: { color: colors.error },
  stateBody: { ...typography.body, textAlign: 'center', marginTop: spacing.sm },
  stateAction: { marginTop: spacing.md, alignSelf: 'center' },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeInfo: { backgroundColor: colors.brandSoft },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.warning },
  noticeTextInfo: { color: colors.brand },
  noticeAction: { minHeight: TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: spacing.sm },
  noticeActionText: { fontSize: 14, fontWeight: '700', color: colors.brand },
});
