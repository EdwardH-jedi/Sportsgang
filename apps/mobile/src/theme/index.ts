/**
 * SportsGang design tokens (theme v2).
 *
 * Import everything from `../theme`:
 *
 *   colors / surfaceLevels  — colour values (unchanged v1 tokens + additions)
 *   spacing / radii         — layout scale
 *   elevation               — iOS shadow + Android elevation presets
 *   motion                  — durations, easing curves, spring configs
 *   zIndex / hitSlop / touchTarget / iconSizes / layout
 *   fonts / typography      — Inter (UI) + Barlow Condensed (display, stats)
 *
 * Rules: screens never hard-code colours or sizes; use these tokens and the
 * primitives in `components/ui`.
 */
export { colors, surfaceLevels } from './colors';
export type { SurfaceLevel } from './colors';
export { fonts, face, typography } from './typography';
export type { FontToken, TypographyVariant } from './typography';
export {
  spacing,
  radii,
  elevation,
  motion,
  zIndex,
  touchTarget,
  hitSlop,
  iconSizes,
  layout,
} from './tokens';
export type { ElevationLevel, IconSize } from './tokens';
