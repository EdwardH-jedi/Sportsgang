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

  function close() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(v: string) {
    onChange(v);
    close();
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
        // Screen readers hear the current choice, not only the field name.
        accessibilityValue={{ text: selectedLabel ?? 'Not selected' }}
        accessibilityHint="Opens a list of options"
        accessibilityState={{ expanded: open }}
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
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          {/* Tap outside to close. The sheet is a sibling, not a child: a
              pressable wrapper made iOS expose the whole list as a single
              accessibility element instead of one per option. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessible={false}
            importantForAccessibility="no"
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              {modalTitle ? (
                <Text style={styles.sheetTitle} accessibilityRole="header">
                  {modalTitle}
                </Text>
              ) : (
                <View />
              )}
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={`Close ${modalTitle ?? label ?? 'list'}`}
                hitSlop={8}
                style={({ pressed }) => [styles.done, pressed && styles.triggerPressed]}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>

            {searchable ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search options"
              />
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
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },
  trigger: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    minHeight: 52,
    justifyContent: 'center',
  },
  triggerPressed: {
    opacity: 0.7,
  },
  triggerText: {
    ...typography.bodyLarge,
  },
  triggerTextFilled: {
    color: colors.textPrimary,
  },
  triggerTextPlaceholder: {
    color: colors.textTertiary,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    ...typography.h3,
    flexShrink: 1,
  },
  done: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  doneText: {
    ...typography.button,
    color: colors.brand,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingBottom: spacing.lg,
  },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  optionSelected: {
    backgroundColor: colors.surfaceElevated,
  },
  optionPressed: {
    opacity: 0.7,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  empty: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
