import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, spacing, typography } from '../../theme';
import { IconButton } from './IconButton';
import type { IconName } from './Icon';

export interface HeaderAction {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  badge?: boolean;
  testID?: string;
}

export interface HeaderProps {
  title?: string;
  /** Small uppercase line above a large title ("Runs near you"). */
  eyebrow?: string;
  /** Line below the title (e.g. location state). */
  subtitle?: string;
  /** Shows a back button when set. */
  onBack?: () => void;
  /** Default "Go back". */
  backLabel?: string;
  /** Up to ~3 icon actions on the right. */
  actions?: readonly HeaderAction[];
  /** Custom right-side content (rendered after `actions`). */
  right?: React.ReactNode;
  /** Large condensed title for top-level screens; compact centred bar otherwise. */
  large?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * In-screen header (the app hides the native navigation header). Compact
 * mode: back · centred title · actions. Large mode: back / actions row with
 * a big condensed title underneath.
 */
export function Header({
  title,
  eyebrow,
  subtitle,
  onBack,
  backLabel = 'Go back',
  actions = [],
  right,
  large = false,
  testID,
  style,
}: HeaderProps) {
  const back = onBack ? (
    <IconButton
      icon="back"
      size="md"
      accessibilityLabel={backLabel}
      onPress={onBack}
      testID={testID ? `${testID}-back` : 'header-back'}
    />
  ) : null;

  const trailing =
    actions.length > 0 || right ? (
      <View style={styles.actions}>
        {actions.map((a) => (
          <IconButton
            key={a.accessibilityLabel}
            icon={a.icon}
            onPress={a.onPress}
            accessibilityLabel={a.accessibilityLabel}
            badge={a.badge}
            testID={a.testID}
          />
        ))}
        {right}
      </View>
    ) : null;

  if (large) {
    return (
      <View style={[styles.large, style]} testID={testID}>
        {back || trailing ? (
          <View style={styles.bar}>
            <View style={styles.side}>{back}</View>
            <View style={[styles.side, styles.sideRight]}>{trailing}</View>
          </View>
        ) : null}
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        {title ? (
          <Text style={styles.largeTitle} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.bar, styles.compact, style]} testID={testID}>
      <View style={styles.side}>{back}</View>
      <View style={styles.center}>
        {title ? (
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.compactSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideRight]}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.headerHeight,
  },
  compact: {
    paddingHorizontal: spacing.sm,
  },
  side: {
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
    marginLeft: 'auto',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    fontSize: 17,
    color: colors.textPrimary,
  },
  compactSubtitle: {
    ...typography.caption,
  },
  large: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginTop: spacing.sm,
  },
  largeTitle: {
    ...typography.h1,
  },
  subtitle: {
    ...typography.body,
  },
});
