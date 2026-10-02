import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FocusSport } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { Button, ChoiceChip } from '../../components/ui';
import { FOCUS_SPORTS, FOCUS_SPORT_LABEL } from '../../lib/sportPreferences';
import type { SetupSportsScreenProps } from '../../navigation/types';
import { useProfileStore } from '../../stores/profile';
import { useSetupDraft } from '../../stores/setupDraft';
import { colors, spacing, typography } from '../../theme';
import { SetupHeader } from './SetupHeader';

const SPORT_DESCRIPTIONS: Record<FocusSport, string> = {
  running: 'Pace-matched partners or relaxed social runs',
  golf: 'Golfers at your level, or experienced golfers who welcome beginners',
};

/** Step 2 of onboarding (or "Add a sport" from Profile): pick running and/or golf. */
export function SetupSportsScreen({ navigation, route }: SetupSportsScreenProps) {
  const mode = route.params?.mode ?? 'onboarding';
  const sportProfiles = useProfileStore((s) => s.sportProfiles);
  const resetDraft = useSetupDraft((s) => s.reset);
  const [selected, setSelected] = useState<FocusSport[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Every visit to this screen starts a fresh flow, so answers from an
  // abandoned attempt (or another account) never leak into this one.
  useEffect(() => {
    resetDraft();
  }, [resetDraft]);

  const existing = new Set((sportProfiles ?? []).map((sp) => sp.sport));
  // When adding later, a sport that already has a profile is edited from
  // Profile instead, so its stored preferences are never overwritten here.
  const isUnavailable = (sport: FocusSport) => mode === 'add' && existing.has(sport);

  function toggle(sport: FocusSport) {
    setError(null);
    setSelected((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]));
  }

  function handleContinue() {
    const sports = FOCUS_SPORTS.filter((s) => selected.includes(s) && !isUnavailable(s));
    if (sports.length === 0) {
      setError('Choose running, golf or both.');
      return;
    }
    navigation.navigate('SetupSportDetails', { mode, sports, index: 0 });
  }

  return (
    <Screen padded scroll>
      <SetupHeader
        mode={mode}
        step={2}
        title={mode === 'add' ? 'Which sport?' : 'What do you play?'}
        subtitle="Choose one or both. You can change this later from Profile."
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      />

      <View style={styles.options}>
        {FOCUS_SPORTS.map((sport) => (
          <ChoiceChip
            key={sport}
            kind="checkbox"
            label={FOCUS_SPORT_LABEL[sport]}
            description={
              isUnavailable(sport) ? 'Already on your profile — edit it from Profile' : SPORT_DESCRIPTIONS[sport]
            }
            selected={selected.includes(sport) && !isUnavailable(sport)}
            disabled={isUnavailable(sport)}
            onPress={() => toggle(sport)}
          />
        ))}
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button label="Continue" onPress={handleContinue} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { gap: spacing.sm, marginBottom: spacing.lg },
  error: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  cta: { marginBottom: spacing.xl },
});
