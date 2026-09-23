import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
// Per-weight subpath imports: the package index requires all 18 weights,
// which would bundle every TTF. Only the faces in `fonts` ship.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';

import { iconFontSources } from '../components/ui/Icon';
import { fonts } from '../theme';

/**
 * Font files keyed by the family names in `theme.fonts`. The key is the
 * name `fontFamily` refers to, so the two must stay in sync.
 */
export const appFontSources = {
  [fonts.regular]: Inter_400Regular,
  [fonts.medium]: Inter_500Medium,
  [fonts.semibold]: Inter_600SemiBold,
  [fonts.bold]: Inter_700Bold,
  [fonts.displaySemibold]: BarlowCondensed_600SemiBold,
  [fonts.displayBold]: BarlowCondensed_700Bold,
} as const;

/** Brand fonts + the icon fonts, loaded together behind the splash. */
const allFontSources = { ...appFontSources, ...iconFontSources };

/** Give up waiting and render with system fonts after this long. */
export const FONT_LOAD_TIMEOUT_MS = 4000;

export interface AppFontsState {
  /** True once the app may render: fonts loaded, failed, or timed out. */
  ready: boolean;
  /** True when the brand fonts are actually available. */
  loaded: boolean;
  error: Error | null;
}

/**
 * Loads the brand fonts for App.tsx. Never blocks the app: a load error or
 * a slow load (FONT_LOAD_TIMEOUT_MS) still flips `ready`, and text falls
 * back to the system font (see `face()` in theme/typography).
 */
export function useAppFonts(): AppFontsState {
  const [loaded, error] = useFonts(allFontSources);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded || error) return;
    const id = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [loaded, error]);

  return {
    ready: loaded || error !== null || timedOut,
    loaded,
    error: error ?? null,
  };
}
