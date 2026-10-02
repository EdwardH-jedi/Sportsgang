import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuthStore } from '../stores/auth';
import { useProfileStore } from '../stores/profile';
import { colors } from '../theme';
import type { SplashScreenProps } from '../navigation/types';

/**
 * In-app splash screen.
 *
 * Routes:
 *   - no token             → AuthEntry
 *   - token, no profile    → OnboardingStep1 (404 on /users/me/profile counts
 *                            as "not yet created")
 *   - token, profile but
 *     Step 1 fields blank  → OnboardingStep1 (treat partial profile as
 *                            still-onboarding rather than dropping the user
 *                            into Main with a missing display_name)
 *   - token, Step 1 done   → Main
 *
 * The native splash (app.config.js splash.backgroundColor #C6FF3D — the
 * SportsGang lime) matches this background — no visible flash on launch.
 */
export function SplashScreen({ navigation }: SplashScreenProps) {
  useEffect(() => {
    let cancelled = false;

    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 1100));
    const init = useAuthStore.getState().initialize();

    Promise.all([init, minDelay]).then(async () => {
      if (cancelled) return;
      const { token } = useAuthStore.getState();
      if (!token) {
        navigation.replace('AuthEntry');
        return;
      }
      try {
        await useProfileStore.getState().fetchProfile();
        if (cancelled) return;
        const { profile } = useProfileStore.getState();
        const step1Complete =
          !!profile &&
          !!profile.displayName &&
          profile.displayName.trim().length > 0 &&
          !!profile.birthYear &&
          !!profile.suburb;
        navigation.replace(step1Complete ? 'Main' : 'OnboardingStep1');
      } catch {
        if (cancelled) return;
        navigation.replace('OnboardingStep1');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>SPORTSGANG</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.splash,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.onPrimary,
    letterSpacing: 10,
  },
});
