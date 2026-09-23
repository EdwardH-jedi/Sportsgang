import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing, typography } from '../../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  /** Primary (lime) call to action. */
  action?: EmptyStateAction;
  /** Ghost secondary action. */
  secondaryAction?: EmptyStateAction;
  /** Tighter spacing for use inside cards / sheets. */
  compact?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Centred "nothing here yet" block with an optional next step. */
export function EmptyState({
  title,
  message,
  icon,
  action,
  secondaryAction,
  compact = false,
  testID,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]} testID={testID}>
      {icon ? (
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
          <Icon name={icon} size={compact ? 'lg' : 'xl'} color={colors.brand} />
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? (
            <Button
              label={action.label}
              leadingIcon={action.icon}
              onPress={action.onPress}
              accessibilityLabel={action.accessibilityLabel}
            />
          ) : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              variant="ghost"
              leadingIcon={secondaryAction.icon}
              onPress={secondaryAction.onPress}
              accessibilityLabel={secondaryAction.accessibilityLabel}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  compact: {
    flex: 0,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.sm,
  },
  iconWrapCompact: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
  },
  title: {
    ...typography.h3,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    maxWidth: 320,
  },
  actions: {
    marginTop: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
});
