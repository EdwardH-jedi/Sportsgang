import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  /** Visible label above the input; also the default accessibility label. */
  label?: string;
  /** Hint below the input (hidden while an error shows). */
  helper?: string;
  /** Error text below the input; turns the border red and is announced. */
  error?: string | null;
  /** Password-style input with a show / hide toggle. */
  secure?: boolean;
  leadingIcon?: IconName;
  /** Multiline min height (default 96). */
  minHeight?: number;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  disabled?: boolean;
}

/** Labelled text input with helper / error text, focus ring and secure toggle. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    helper,
    error,
    secure = false,
    leadingIcon,
    multiline = false,
    minHeight = 96,
    containerStyle,
    inputStyle,
    disabled = false,
    accessibilityLabel,
    onFocus,
    onBlur,
    testID,
    ...inputProps
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hasError = Boolean(error);

  const borderColor = hasError ? colors.error : focused ? colors.brand : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text style={styles.label} nativeID={testID ? `${testID}-label` : undefined}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          { borderColor },
          multiline && { minHeight, alignItems: 'flex-start' },
          disabled && styles.disabled,
        ]}
      >
        {leadingIcon ? (
          <Icon
            name={leadingIcon}
            size="md"
            color={colors.textTertiary}
            style={multiline ? styles.leadingIconTop : undefined}
          />
        ) : null}
        <TextInput
          ref={ref}
          {...inputProps}
          testID={testID}
          multiline={multiline}
          editable={!disabled && inputProps.editable !== false}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.brand}
          cursorColor={colors.brand}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={hasError ? (error as string) : helper}
          accessibilityState={{ disabled }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && [styles.multiline, { minHeight: minHeight - 2 }],
            inputStyle,
          ]}
        />
        {secure ? (
          <IconButton
            icon={revealed ? 'eye-off' : 'eye'}
            size="sm"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((v) => !v)}
            testID={testID ? `${testID}-reveal` : undefined}
          />
        ) : null}
      </View>
      {hasError ? (
        <View
          style={styles.messageRow}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={error as string}
          accessibilityLiveRegion="polite"
        >
          <Icon name="alert" size="xs" color={colors.error} />
          <Text style={[styles.message, styles.errorText]}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.message}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm - 2,
  },
  label: {
    ...typography.label,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md - 2,
    gap: spacing.sm,
  },
  input: {
    ...typography.bodyLarge,
    flex: 1,
    paddingVertical: spacing.sm + 4,
    color: colors.textPrimary,
  },
  multiline: {
    textAlignVertical: 'top',
  },
  leadingIconTop: {
    marginTop: spacing.sm + 6,
  },
  disabled: {
    opacity: 0.5,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
  },
});
