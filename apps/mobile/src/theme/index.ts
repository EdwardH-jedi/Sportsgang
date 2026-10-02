/**
 * SportsGang design tokens — light outdoor theme (run + golf v2).
 *
 * Off-white canvas, dark-green text, deep-green brand for tints/links/fills,
 * and a restrained lime reserved for primary actions. Token *names* are kept
 * from the previous dark theme so every screen re-themes from one place;
 * the roles are:
 *
 *   background        — warm off-white canvas under every Screen
 *   surface           — white cards / sheets / tab bar
 *   surfaceElevated   — subtle tinted panel (chips, inset groups)
 *   text*             — dark-green ramp; all >= 4.5:1 on background/surface
 *   textInverse       — white, for text on `brand` (deep green) fills
 *   brand             — deep green: active tints, links, secondary fills
 *   brandDark         — pressed brand
 *   brandDarkest      — darkest green for hero panels and shadows
 *   brandSoft         — translucent green tint for badges / selected chips
 *   accent            — mid green for spinners and small highlights (text-safe)
 *   primary/onPrimary — lime fill + dark-green label for the primary action
 *   error / success / warning — tuned for >= 4.5:1 on the light canvas
 *
 * Lime is never used as a text colour: it fails contrast on off-white.
 */

export const colors = {
  // Backgrounds
  background: '#F5F4EE',
  surface: '#FFFFFF',
  surfaceElevated: '#ECEBE3',

  // Text
  textPrimary: '#13291C',
  textSecondary: '#4B5B50',
  textTertiary: '#58685D',
  textInverse: '#FFFFFF',

  // Brand — deep green family
  brand: '#1E5B3B',
  brandDark: '#164530',
  brandDarkest: '#0D2A1B',
  brandSoft: 'rgba(30,91,59,0.10)',
  accent: '#2B7A4B',

  // Primary action — restrained lime
  primary: '#C5EE5B',
  primaryPressed: '#B2DD45',
  onPrimary: '#13291C',
  // Text on deep-green hero panels (welcome screen)
  onBrand: '#FFFFFF',
  onBrandMuted: 'rgba(255,255,255,0.82)',
  onBrandBorder: 'rgba(255,255,255,0.45)',
  /** Native splash colour from app.config.js — the in-app splash matches it. */
  splash: '#C6FF3D',

  // UI chrome
  border: '#D9DACF',
  separator: '#E6E6DD',
  overlay: 'rgba(13,42,27,0.55)',
  inputBackground: '#FFFFFF',

  // Feedback
  error: '#B42318',
  errorSoft: 'rgba(180,35,24,0.08)',
  success: '#1F7A45',
  warning: '#8A5300',
  warningSoft: 'rgba(138,83,0,0.10)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 9999,
  full: 9999,
} as const;

/** Minimum touch target (iOS HIG 44pt). */
export const TOUCH_TARGET = 44;

/**
 * Typography scale. System font (SF Pro / Roboto), no external font dep.
 */
export const typography = {
  display: {
    fontSize: 40,
    fontWeight: '700' as const,
    lineHeight: 46,
    letterSpacing: -1.2,
    color: colors.textPrimary,
  },
  h1: {
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 36,
    letterSpacing: -0.8,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 19,
    fontWeight: '600' as const,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  bodyLarge: {
    fontSize: 17,
    fontWeight: '400' as const,
    lineHeight: 25,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
} as const;
