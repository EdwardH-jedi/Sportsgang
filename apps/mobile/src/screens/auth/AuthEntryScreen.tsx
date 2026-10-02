import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { colors, radii, spacing, typography } from '../../theme';
import type { AuthEntryScreenProps } from '../../navigation/types';

/**
 * SportsGang Welcome / Auth entry.
 *
 * Deep-green outdoor hero (light theme v2):
 *  - deep-green hero block with white text (on-brand tokens)
 *  - lowercase lime wordmark sits on the hero
 *  - lime pill primary CTA + outlined white ghost CTA stack at the bottom
 *
 * Built entirely with React Native primitives — no gradient library, just
 * two layered fills approximating a top→bottom darken.
 */
export function AuthEntryScreen({ navigation }: AuthEntryScreenProps) {
  return (
    <View style={styles.root}>
      {/* Deep-green hero: light status bar here only (app default is dark). */}
      <StatusBar style="light" />
      <View style={styles.hero}>
        {/* Layered overlay so the hero reads as a soft top→bottom darken,
            without needing a gradient library. */}
        <View style={styles.heroOverlayTop} />
        <View style={styles.heroOverlayBottom} />

        <View style={styles.heroContent}>
          <View style={styles.brandBlock}>
            <Text style={styles.wordmark}>sportsgang</Text>
            <Text style={styles.eyebrow}>Sydney</Text>
          </View>

          <View style={styles.headlineBlock}>
            <Text style={styles.headline}>Find your</Text>
            <Text style={styles.headline}>next game.</Text>
            <Text style={styles.tagline}>
              Match, chat, and plan your next session.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPrimaryPressed]}
              onPress={() => navigation.navigate('RegisterScreen')}
              accessibilityRole="button"
              accessibilityLabel="Get started"
            >
              <Text style={styles.ctaPrimaryText}>Get started</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.ctaGhost, pressed && styles.ctaGhostPressed]}
              onPress={() => navigation.navigate('LoginScreen')}
              accessibilityRole="button"
              accessibilityLabel="Log in"
            >
              <Text style={styles.ctaGhostText}>Log in</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brandDarkest,
  },
  hero: {
    flex: 1,
    backgroundColor: colors.brandDark,
    overflow: 'hidden',
  },
  heroOverlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: colors.brandDarkest,
    opacity: 0.6,
  },
  heroOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: colors.brandDarkest,
    opacity: 0.85,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.xxxl + spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  wordmark: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
    color: colors.primary,
  },
  eyebrow: {
    ...typography.label,
    color: colors.onBrandMuted,
  },
  headlineBlock: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headline: {
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 46,
    letterSpacing: -1.5,
    color: colors.onBrand,
    textAlign: 'center',
  },
  tagline: {
    ...typography.bodyLarge,
    color: colors.onBrandMuted,
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  ctaPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaPrimaryPressed: {
    backgroundColor: colors.primaryPressed,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: colors.onPrimary,
    fontSize: 17,
  },
  ctaGhost: {
    borderWidth: 1,
    borderColor: colors.onBrandBorder,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaGhostPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  ctaGhostText: {
    ...typography.button,
    color: colors.onBrand,
  },
});
