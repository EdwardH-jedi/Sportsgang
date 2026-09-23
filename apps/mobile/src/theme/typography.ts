import { Platform, type TextStyle } from 'react-native';

import { colors } from './colors';

/**
 * Font families registered by `useAppFonts` (App.tsx). The keys passed to
 * expo-font's `useFonts` ARE these family names, so they must stay in sync
 * with `appFontSources` in `src/theme/fonts.ts`.
 *
 *   Inter            — every UI string (body, labels, buttons, inputs)
 *   Barlow Condensed — display headings and numeric stats (pace, km, counts)
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  displaySemibold: 'BarlowCondensed_600SemiBold',
  displayBold: 'BarlowCondensed_700Bold',
} as const;

export type FontToken = keyof typeof fonts;

type Weight = '400' | '500' | '600' | '700';

/**
 * A font face: the family plus — on iOS only — the matching weight.
 *
 * Why iOS only: each weight is its own family on disk (Inter_700Bold …).
 * iOS resolves "family + weight" to the loaded face, and if fonts ever
 * failed to load it falls back to the system font AT THAT WEIGHT, so
 * headings stay bold. Android instead treats `fontWeight: '700'` on a custom
 * family as a request for a separate bold file and silently swaps in the
 * system font, so the weight must be omitted there.
 */
export function face(family: FontToken, weight: Weight): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  return Platform.OS === 'ios'
    ? { fontFamily: fonts[family], fontWeight: weight }
    : { fontFamily: fonts[family] };
}

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Typography scale. Display / h1 / stat* use Barlow Condensed; everything
 * else uses Inter. Stat styles use tabular numbers so live values (pace,
 * timers, counts) don't jitter as digits change.
 *
 * Existing preset names and sizes are kept (screens spread them); the
 * condensed presets relax the negative tracking a system font needed.
 */
export const typography = {
  display: {
    ...face('displayBold', '700'),
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h1: {
    ...face('displayBold', '700'),
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  h2: {
    ...face('bold', '700'),
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h3: {
    ...face('semibold', '600'),
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  bodyLarge: {
    ...face('regular', '400'),
    fontSize: 17,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  body: {
    ...face('regular', '400'),
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  bodySmall: {
    ...face('regular', '400'),
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  /** Emphasised body copy (list titles, card titles). */
  bodyStrong: {
    ...face('semibold', '600'),
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  caption: {
    ...face('medium', '500'),
    fontSize: 12,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  label: {
    ...face('semibold', '600'),
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
  button: {
    ...face('semibold', '600'),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  buttonSmall: {
    ...face('semibold', '600'),
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  /** Tab bar / chip labels. */
  tab: {
    ...face('semibold', '600'),
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  /** Hero run number (e.g. the distance on a run summary). */
  statHero: {
    ...face('displayBold', '700'),
    fontSize: 64,
    lineHeight: 64,
    letterSpacing: -0.5,
    fontVariant: tabular,
    color: colors.textPrimary,
  },
  statLarge: {
    ...face('displayBold', '700'),
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -0.3,
    fontVariant: tabular,
    color: colors.textPrimary,
  },
  stat: {
    ...face('displayBold', '700'),
    fontSize: 32,
    lineHeight: 34,
    fontVariant: tabular,
    color: colors.textPrimary,
  },
  statSmall: {
    ...face('displaySemibold', '600'),
    fontSize: 22,
    lineHeight: 24,
    fontVariant: tabular,
    color: colors.textPrimary,
  },
  /** Unit after a stat value ("km", "/km"). */
  statUnit: {
    ...face('displaySemibold', '600'),
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
} as const;

export type TypographyVariant = keyof typeof typography;
