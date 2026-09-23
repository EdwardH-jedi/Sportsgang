import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from './ui';
import { colors, radii, spacing, typography } from '../theme';

interface Props {
  /** Nothing renders when empty / null. */
  message?: string | null;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Form-level error (server / validation failure that isn't tied to a single
 * field). Soft red surface + alert icon; announced to screen readers.
 */
export function FormErrorBanner({ message, testID, style }: Props) {
  if (!message) return null;
  return (
    <View
      style={[styles.banner, style]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Icon name="alert" size="sm" color={colors.error} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  text: {
    ...typography.body,
    color: colors.error,
    flex: 1,
  },
});
