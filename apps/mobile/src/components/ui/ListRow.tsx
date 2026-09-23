import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing, touchTarget, typography } from '../../theme';
import { Icon, type IconName } from './Icon';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading icon in a tinted square. */
  icon?: IconName;
  iconColor?: string;
  /** Custom leading content (e.g. an Avatar) — wins over `icon`. */
  leading?: React.ReactNode;
  /** Right-aligned value text ("3", "On"). */
  value?: string;
  /** Custom trailing content (e.g. a Switch or Badge). */
  trailing?: React.ReactNode;
  /** Defaults to true when the row is pressable. */
  chevron?: boolean;
  onPress?: () => void;
  /** Red title + icon for irreversible actions (Delete account). */
  destructive?: boolean;
  disabled?: boolean;
  /** Defaults to "title, subtitle, value". */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Settings / navigation row. Pressable rows are buttons with a chevron. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  value,
  trailing,
  chevron,
  onPress,
  destructive = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListRowProps) {
  const titleColor = destructive ? colors.error : colors.textPrimary;
  const showChevron = chevron ?? Boolean(onPress);
  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');

  const content = (pressed: boolean) => (
    <View style={[styles.row, pressed && styles.pressed, disabled && styles.disabled, style]}>
      {leading ??
        (icon ? (
          <View style={[styles.iconWrap, destructive && styles.iconWrapDestructive]}>
            <Icon name={icon} size="md" color={iconColor ?? (destructive ? colors.error : colors.brand)} />
          </View>
        ) : null)}
      <View style={styles.text}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? <Icon name="chevron-right" size="md" color={colors.textTertiary} /> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} testID={testID}>
        {content(false)}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget + 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm + 4,
    borderRadius: radii.md,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  iconWrapDestructive: {
    backgroundColor: colors.errorSoft,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  value: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: '40%',
  },
});
