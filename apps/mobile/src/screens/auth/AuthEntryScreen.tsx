import { StyleSheet, Text, View } from 'react-native';

import { Button, Icon, Screen } from '../../components/ui';
import { colors, iconSizes, spacing, typography } from '../../theme';
import type { AuthEntryScreenProps } from '../../navigation/types';

/**
 * SportsGang welcome / auth entry.
 *
 * Near-black canvas, lime wordmark, a big condensed running-first headline
 * and two stacked CTAs (primary lime "Get started", secondary "Log in").
 * No gradients or imagery — typography carries the hero.
 */
export function AuthEntryScreen({ navigation }: AuthEntryScreenProps) {
  return (
    <Screen testID="auth-entry">
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <Icon name="run" size="xl" color={colors.brand} />
          <Text style={styles.wordmark} accessibilityRole="header">
            sportsgang
          </Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.eyebrowRow}>
            <Icon name="location" size="sm" color={colors.brand} />
            <Text style={styles.eyebrow}>Sydney</Text>
          </View>
          <Text style={styles.headline}>Find your run.</Text>
          <Text style={[styles.headline, styles.headlineAccent]}>Find your people.</Text>
          <Text style={styles.tagline}>
            Group runs, running crews and training partners near you.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label="Get started"
            size="lg"
            fullWidth
            trailingIcon="chevron-right"
            onPress={() => navigation.navigate('RegisterScreen')}
            accessibilityLabel="Get started"
          />
          <Button
            label="Log in"
            size="lg"
            variant="secondary"
            fullWidth
            onPress={() => navigation.navigate('LoginScreen')}
            accessibilityLabel="Log in"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: {
    ...typography.h1,
    color: colors.brand,
    lineHeight: iconSizes.xl + spacing.xs,
  },
  hero: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  headline: {
    ...typography.display,
  },
  headlineAccent: {
    color: colors.brand,
  },
  tagline: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm + spacing.xs,
  },
});
