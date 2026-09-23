import { useEffect } from 'react';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';

import { useAppFonts } from './src/hooks/useAppFonts';
import { RootNavigator } from './src/navigation/RootNavigator';

// Crash reporting — guarded so dev builds without a DSN are a no-op.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Leave tracing off by default; the App Store launch only needs crash
    // reports, not performance spans.
    tracesSampleRate: 0,
  });
}

// Prevent the native splash from auto-hiding before the JS bundle is ready.
// hideAsync() is called below once the brand fonts are ready.
ExpoSplashScreen.preventAutoHideAsync();

export default function App() {
  // Inter + Barlow Condensed. `ready` also flips on a load error or after a
  // timeout, so a font problem can never hold the splash screen forever —
  // text then falls back to the system font.
  const { ready: fontsReady, error: fontError } = useAppFonts();

  useEffect(() => {
    if (!fontsReady) return;
    if (fontError && SENTRY_DSN) {
      Sentry.captureException(fontError);
    }
    void ExpoSplashScreen.hideAsync();
  }, [fontsReady, fontError]);

  if (!fontsReady) {
    // Native splash is still visible.
    return null;
  }

  return (
    // Gesture handler must wrap the whole tree so pan gestures (bottom
    // sheets, swipe cards) work on every screen and inside modals.
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/*
          The app is dark-only (near-black canvas, see theme + app.config.js
          userInterfaceStyle "dark"), so status bar content is always light.
        */}
        <StatusBar style="light" />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
