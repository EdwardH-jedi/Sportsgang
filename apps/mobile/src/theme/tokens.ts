/**
 * Layout, depth and motion tokens. Pure data — no React / reanimated
 * imports, so the theme stays cheap to import (and to mock in tests).
 */

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

/**
 * Shadow presets: iOS shadow* props + Android `elevation` in one object, so
 * `style={[styles.card, elevation.md]}` works on both platforms. On the
 * near-black canvas shadows only separate floating layers (sheets, FABs,
 * tab bar) — cards should use a surface level instead.
 */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export type ElevationLevel = keyof typeof elevation;

/**
 * Motion. Subtle and quick: 150–250 ms for UI feedback, springs for
 * anything the finger drags (sheets, cards). Easing curves are cubic-bezier
 * control points — pass them to `Easing.bezier(...motion.easing.standard)`.
 * Components must honour reduce-motion (`useReducedMotion`) by skipping or
 * shortening animations.
 */
export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    base: 200,
    slow: 250,
    sheet: 300,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
  },
  spring: {
    /** Press-in / press-out scale. */
    press: { damping: 20, stiffness: 400, mass: 0.6 },
    /** Bottom sheet snapping. */
    sheet: { damping: 28, stiffness: 260, mass: 1 },
    /** Softer settle for cards and indicators. */
    gentle: { damping: 18, stiffness: 180, mass: 1 },
  },
  /** Scale applied while a pressable is held. */
  pressScale: 0.97,
} as const;

export const zIndex = {
  base: 0,
  raised: 1,
  sticky: 10,
  header: 20,
  fab: 30,
  sheet: 40,
  overlay: 50,
  toast: 60,
} as const;

/** Minimum touch target (Apple HIG 44pt). */
export const touchTarget = 44;

/**
 * hitSlop presets to reach the 44pt target on visually small controls
 * (e.g. a 24pt icon + md on each side = 48pt).
 */
export const hitSlop = {
  sm: { top: 8, bottom: 8, left: 8, right: 8 },
  md: { top: 12, bottom: 12, left: 12, right: 12 },
  lg: { top: 16, bottom: 16, left: 16, right: 16 },
} as const;

export const iconSizes = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export type IconSize = keyof typeof iconSizes;

export const layout = {
  /** Horizontal gutter for screen content. */
  screenPadding: spacing.lg,
  /** Height of the custom tab bar, excluding the bottom safe-area inset. */
  tabBarHeight: 60,
  /** Height of the in-screen Header component. */
  headerHeight: 52,
} as const;
