/**
 * Colour tokens.
 *
 * Visual direction: electric neon-lime accent on a near-black surface.
 * Lime is the brand mark; black + dark elevation are the canvas.
 *
 *   background        — near-black, the base canvas under every Screen
 *   surface           — slightly lighter than background for cards / chrome
 *   surfaceElevated   — one step brighter for raised content (banner gutter)
 *   surfaceHigh       — highest level: bottom sheets, popovers, menus
 *   surfacePressed    — pressed / highlighted row or card
 *   text*             — off-white ramp; tertiary still readable on dark
 *   textInverse       — near-black, used as text color on lime brand fills
 *   brand             — electric lime, the headline accent
 *   brandDark*        — deeper / darker lime + pure black for hero gradients
 *   brandSoft         — translucent lime tint, used for badges / soft fills
 *   accent            — slightly brighter lime for hover / pressed
 *   error / success / warning — tuned for legibility on dark surfaces
 *
 * Token *names* and existing values are stable — screens reference them
 * hundreds of times. Only add new tokens here; never repurpose one.
 */
export const colors = {
  // Backgrounds / surface levels (see `surfaceLevels` below)
  background: '#0A0A0A',
  surface: '#111114',
  surfaceElevated: '#16161B',
  surfaceHigh: '#1C1C22',
  surfacePressed: '#202027',

  // Text
  textPrimary: '#F5F5F0', // off-white
  textSecondary: '#A8A8A2', // muted body
  textTertiary: '#6E6E68', // hints, placeholders
  textInverse: '#0A0A0A', // text on lime brand fills
  textDisabled: '#4A4A46',

  // Brand — electric lime family
  brand: '#C6FF3D', // electric lime, primary CTA + accent
  brandDark: '#9CCC1F', // deeper lime, pressed state
  brandDarkest: '#000000', // pure black, hero base
  brandSoft: 'rgba(198,255,61,0.14)', // translucent lime tint for badges
  brandMuted: 'rgba(198,255,61,0.38)', // disabled lime fill
  accent: '#DBFF66', // brighter lime, hover/active

  // UI chrome
  border: '#26262B',
  borderStrong: '#34343B',
  separator: '#1B1B20',
  overlay: 'rgba(0, 0, 0, 0.65)',
  inputBackground: '#15151A',

  // Feedback
  error: '#FF5C5C',
  errorSoft: 'rgba(255,92,92,0.14)',
  success: '#5BFF8B',
  successSoft: 'rgba(91,255,139,0.14)',
  warning: '#FFB547',
  warningSoft: 'rgba(255,181,71,0.14)',
} as const;

/**
 * Surface levels, lowest → highest. On a near-black UI elevation reads as
 * "lighter surface", not as shadow, so pick a level first and add an
 * `elevation` preset only for floating content (sheets, FABs).
 */
export const surfaceLevels = {
  0: colors.background,
  1: colors.surface,
  2: colors.surfaceElevated,
  3: colors.surfaceHigh,
} as const;

export type SurfaceLevel = keyof typeof surfaceLevels;
