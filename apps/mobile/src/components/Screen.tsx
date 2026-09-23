import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, spacing, surfaceLevels, type SurfaceLevel } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Wrap content in a ScrollView. Useful for forms and long lists of static content.
   * For virtualized lists (FlatList etc.), leave false and manage scroll yourself.
   */
  scroll?: boolean;
  /** Apply standard horizontal padding from the design system. Default: true. */
  padded?: boolean;
  /** Shift content up when the keyboard appears. Useful for forms. */
  withKeyboard?: boolean;
  /**
   * Fixed content above the body (e.g. `<Header />`). It does not scroll
   * and is not affected by `padded`.
   */
  header?: React.ReactNode;
  /**
   * Fixed content pinned below the body (e.g. a primary action). Gets the
   * bottom safe-area inset so it clears the home indicator.
   */
  footer?: React.ReactNode;
  /** Canvas colour. Default 0 (`colors.background`). */
  surface?: SurfaceLevel;
  /**
   * Apply the top safe-area inset. Default true; turn off for screens
   * whose first element draws under the status bar (e.g. a full-bleed map).
   */
  safeTop?: boolean;
  /** Extra props for the ScrollView when `scroll` is set (refreshControl, …). */
  scrollProps?: Omit<ScrollViewProps, 'contentContainerStyle' | 'children'>;
  testID?: string;
};

export function Screen({
  children,
  style,
  scroll = false,
  padded = true,
  withKeyboard = false,
  header,
  footer,
  surface = 0,
  safeTop = true,
  scrollProps,
  testID,
}: Props) {
  const insets = useSafeAreaInsets();

  const inner = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
      contentContainerStyle={[
        styles.scrollContent,
        padded && styles.padded,
        // With a footer the footer owns the bottom inset.
        { paddingBottom: (footer ? 0 : insets.bottom) + spacing.xl },
        style,
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padded && styles.padded, style]}>
      {children}
    </View>
  );

  const body = withKeyboard ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {inner}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  ) : (
    <>
      {inner}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>{footer}</View>
      ) : null}
    </>
  );

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { backgroundColor: surfaceLevels[surface], paddingTop: safeTop ? insets.top : 0 },
      ]}
    >
      {header}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    paddingHorizontal: layout.screenPadding,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
});
