import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import { Icon } from './ui/Icon';

/**
 * Icon size in points. Kept numeric (built from spacing) rather than an
 * `iconSizes` token: Select is rendered by onboarding screens whose tests
 * mock only colors / spacing / radii / typography.
 */
const GLYPH = spacing.md + spacing.xs;

export type SelectOption = { value: string; label: string };

type Props = {
  label?: string;
  required?: boolean;
  value: string | null;
  placeholder?: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  searchable?: boolean;
  modalTitle?: string;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Minimal bounded-choice picker used for Step 1 onboarding (birth year, suburb).
 * Trigger mimics the Input visual language so it fits the existing forms.
 * Opens a native Modal with a scrollable list; pass ``searchable`` to show a
 * filter input at the top for longer lists (e.g. suburbs).
 */
export function Select({
  label,
  required = false,
  value,
  placeholder = 'Select…',
  options,
  onChange,
  searchable = false,
  modalTitle,
  accessibilityLabel,
  containerStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? null,
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  function handleSelect(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? 'Open picker'}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text
          style={[
            styles.triggerText,
            selectedLabel ? styles.triggerTextFilled : styles.triggerTextPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={GLYPH} color={colors.textTertiary} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.sheetHandle} />
            {modalTitle ? <Text style={styles.sheetTitle}>{modalTitle}</Text> : null}

            {searchable ? (
              <View style={styles.searchField}>
                <Icon name="search" size={GLYPH} color={colors.textTertiary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.searchInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search options"
                  selectionColor={colors.brand}
                />
              </View>
            ) : null}

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            >
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No matches</Text>
              ) : (
                filtered.map((item) => {
                  const isSelected = item.value === value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => handleSelect(item.value)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => [
                        styles.option,
                        isSelected && styles.optionSelected,
                        pressed && styles.optionPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                      {isSelected ? (
                        <Icon name="check" size={GLYPH} color={colors.brand} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    backgroundColor: colors.inputBackground,
    minHeight: spacing.xxl,
  },
  triggerPressed: {
    backgroundColor: colors.surfacePressed,
  },
  triggerText: {
    ...typography.bodyLarge,
    flex: 1,
  },
  triggerTextFilled: {
    color: colors.textPrimary,
  },
  triggerTextPlaceholder: {
    color: colors.textTertiary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: spacing.xl + spacing.sm,
    height: spacing.xs,
    borderRadius: radii.full,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  sheetTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.inputBackground,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm + spacing.xs,
    color: colors.textPrimary,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: spacing.xxl,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  optionSelected: {
    backgroundColor: colors.brandSoft,
  },
  optionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  optionTextSelected: {
    ...typography.bodyStrong,
    color: colors.brand,
    flex: 1,
  },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
