/**
 * Theme v2 contract:
 *  - every v1 colour token keeps its exact value (screens rely on them)
 *  - new token groups exist with sane values
 *  - display / h1 / stat presets use Barlow Condensed, UI presets use Inter
 *  - stat presets use tabular numbers
 *  - face() only sets fontWeight on iOS (Android would swap in system font)
 */
import { Platform } from 'react-native';

import {
  colors,
  elevation,
  face,
  fonts,
  hitSlop,
  iconSizes,
  motion,
  radii,
  spacing,
  surfaceLevels,
  touchTarget,
  typography,
  zIndex,
} from '../theme';

describe('theme v2', () => {
  it('keeps every v1 colour value unchanged', () => {
    expect(colors).toMatchObject({
      background: '#0A0A0A',
      surface: '#111114',
      surfaceElevated: '#16161B',
      textPrimary: '#F5F5F0',
      textSecondary: '#A8A8A2',
      textTertiary: '#6E6E68',
      textInverse: '#0A0A0A',
      brand: '#C6FF3D',
      brandDark: '#9CCC1F',
      brandDarkest: '#000000',
      brandSoft: 'rgba(198,255,61,0.14)',
      accent: '#DBFF66',
      border: '#26262B',
      separator: '#1B1B20',
      overlay: 'rgba(0, 0, 0, 0.65)',
      inputBackground: '#15151A',
      error: '#FF5C5C',
      success: '#5BFF8B',
    });
  });

  it('keeps the v1 spacing and radii scales', () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 });
    expect(radii).toEqual({ sm: 6, md: 12, lg: 18, xl: 24, pill: 9999, full: 9999 });
  });

  it('orders surface levels from the canvas upwards', () => {
    expect(surfaceLevels[0]).toBe(colors.background);
    expect(surfaceLevels[1]).toBe(colors.surface);
    expect(surfaceLevels[2]).toBe(colors.surfaceElevated);
    expect(surfaceLevels[3]).toBe(colors.surfaceHigh);
  });

  it('ships elevation presets for both platforms', () => {
    for (const level of ['sm', 'md', 'lg'] as const) {
      expect(elevation[level].elevation).toBeGreaterThan(0);
      expect(elevation[level].shadowOpacity).toBeGreaterThan(0);
    }
    expect(elevation.sm.elevation).toBeLessThan(elevation.lg.elevation);
    expect(elevation.none.elevation).toBe(0);
  });

  it('keeps motion subtle (150–250 ms feedback, 0.97 press scale)', () => {
    expect(motion.duration.fast).toBe(150);
    expect(motion.duration.slow).toBe(250);
    expect(motion.pressScale).toBe(0.97);
    expect(motion.easing.standard).toHaveLength(4);
    expect(motion.spring.sheet.damping).toBeGreaterThan(0);
  });

  it('exposes z-index, hitSlop, touch target and icon sizes', () => {
    expect(zIndex.sheet).toBeGreaterThan(zIndex.header);
    expect(touchTarget).toBe(44);
    expect(24 + hitSlop.md.top + hitSlop.md.bottom).toBeGreaterThanOrEqual(touchTarget);
    expect(iconSizes.lg).toBe(24);
  });

  it('uses Barlow Condensed for display, h1 and stats', () => {
    for (const key of ['display', 'h1', 'statHero', 'statLarge', 'stat'] as const) {
      expect(typography[key].fontFamily).toBe(fonts.displayBold);
    }
    expect(typography.statSmall.fontFamily).toBe(fonts.displaySemibold);
  });

  it('uses Inter for body, label and button', () => {
    expect(typography.body.fontFamily).toBe(fonts.regular);
    expect(typography.bodyLarge.fontFamily).toBe(fonts.regular);
    expect(typography.label.fontFamily).toBe(fonts.semibold);
    expect(typography.button.fontFamily).toBe(fonts.semibold);
    expect(typography.h2.fontFamily).toBe(fonts.bold);
  });

  it('uses tabular numbers on every stat preset', () => {
    for (const key of ['statHero', 'statLarge', 'stat', 'statSmall'] as const) {
      expect(typography[key].fontVariant).toEqual(['tabular-nums']);
    }
  });

  describe('face()', () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    });

    it('keeps the weight on iOS (system-font fallback stays bold)', () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      expect(face('bold', '700')).toEqual({ fontFamily: 'Inter_700Bold', fontWeight: '700' });
    });

    it('omits the weight on Android', () => {
      Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
      expect(face('bold', '700')).toEqual({ fontFamily: 'Inter_700Bold' });
    });
  });
});
