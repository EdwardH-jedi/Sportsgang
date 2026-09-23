/**
 * useAppFonts: the app renders once fonts load, fail, or time out — the
 * splash screen must never be held forever.
 */
import { act, renderHook } from '@testing-library/react-native';

import { FONT_LOAD_TIMEOUT_MS, appFontSources, useAppFonts } from '../hooks/useAppFonts';
import { fonts } from '../theme';

let mockFontsResult: [boolean, Error | null] = [false, null];
const mockUseFonts = jest.fn((_map: unknown) => mockFontsResult);

jest.mock('expo-font', () => ({
  useFonts: (map: unknown) => mockUseFonts(map),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockFontsResult = [false, null];
  mockUseFonts.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAppFonts', () => {
  it('registers every theme font family', () => {
    renderHook(() => useAppFonts());
    const map = mockUseFonts.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(map).sort()).toEqual(Object.values(fonts).sort());
    expect(Object.keys(appFontSources)).toHaveLength(Object.keys(fonts).length);
  });

  it('is not ready while fonts are loading', () => {
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toEqual({ ready: false, loaded: false, error: null });
  });

  it('is ready once fonts load', () => {
    mockFontsResult = [true, null];
    const { result } = renderHook(() => useAppFonts());
    expect(result.current.ready).toBe(true);
    expect(result.current.loaded).toBe(true);
  });

  it('is ready (system-font fallback) when loading errors', () => {
    const err = new Error('font missing');
    mockFontsResult = [false, err];
    const { result } = renderHook(() => useAppFonts());
    expect(result.current).toEqual({ ready: true, loaded: false, error: err });
  });

  it('stops waiting after the timeout', () => {
    const { result } = renderHook(() => useAppFonts());
    expect(result.current.ready).toBe(false);
    act(() => {
      jest.advanceTimersByTime(FONT_LOAD_TIMEOUT_MS);
    });
    expect(result.current.ready).toBe(true);
    expect(result.current.loaded).toBe(false);
  });
});
