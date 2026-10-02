import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Screen } from '../../components/Screen';
import { Button } from '../../components/ui';
import {
  golfFormFromProfile,
  runFormFromProfile,
  sportTitle,
  validateGolfForm,
  validateRunForm,
} from '../../components/preferences/formState';
import { GolfPreferencesForm, RunPreferencesForm } from '../../components/preferences/PreferenceForms';
import type { SetupSportDetailsScreenProps } from '../../navigation/types';
import { useProfileStore } from '../../stores/profile';
import { useSetupDraft } from '../../stores/setupDraft';
import { colors, spacing, typography } from '../../theme';
import { SetupHeader } from './SetupHeader';

/**
 * Step 3: one screen per chosen sport (golf details or running details).
 * Answers live in the setup draft so Back keeps them; nothing is saved to
 * the API until the availability step.
 */
export function SetupSportDetailsScreen({ navigation, route }: SetupSportDetailsScreenProps) {
  const { mode, sports, index } = route.params;
  const sport = sports[index];
  const existing = useProfileStore((s) => s.sportProfiles?.find((sp) => sp.sport === sport) ?? null);
  const golf = useSetupDraft((s) => s.golf);
  const run = useSetupDraft((s) => s.run);
  const setGolf = useSetupDraft((s) => s.setGolf);
  const setRun = useSetupDraft((s) => s.setRun);
  const [error, setError] = useState<string | null>(null);

  // A row that already exists (e.g. a legacy golf profile) prefills the
  // form once, unless the user has already started answering in this flow.
  useEffect(() => {
    if (!existing) return;
    if (sport === 'golf' && golf.level === null) setGolf(golfFormFromProfile(existing));
    if (sport === 'running' && run.level === null) setRun(runFormFromProfile(existing));
    // Prefill once per sport; later edits are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, existing?.id]);

  function handleContinue() {
    const result = sport === 'golf' ? validateGolfForm(golf) : validateRunForm(run);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    if (index + 1 < sports.length) {
      navigation.push('SetupSportDetails', { mode, sports, index: index + 1 });
    } else {
      navigation.navigate('SetupAvailability', { mode, sports });
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <SetupHeader
        mode={mode}
        step={3}
        title={sportTitle(sport)}
        subtitle={
          sport === 'golf'
            ? 'This decides who you see — and who sees you. Both people’s choices have to fit.'
            : 'Pace partners need overlapping ranges. Social runners keep it relaxed.'
        }
        onBack={() => navigation.goBack()}
      />

      {sport === 'golf' ? (
        <GolfPreferencesForm
          value={golf}
          onChange={(next) => {
            setError(null);
            setGolf(next);
          }}
        />
      ) : (
        <RunPreferencesForm
          value={run}
          onChange={(next) => {
            setError(null);
            setRun(next);
          }}
        />
      )}

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
  error: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  cta: { marginBottom: spacing.xl },
});
