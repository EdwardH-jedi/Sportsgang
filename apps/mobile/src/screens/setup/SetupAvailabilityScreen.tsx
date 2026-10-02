import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { FocusSport } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { Button, InlineNotice } from '../../components/ui';
import {
  buildUpsert,
  validateGolfForm,
  validateRunForm,
  validateTimes,
} from '../../components/preferences/formState';
import { AvailabilityPicker } from '../../components/preferences/PreferenceForms';
import { FOCUS_SPORT_LABEL } from '../../lib/sportPreferences';
import type { SetupAvailabilityScreenProps } from '../../navigation/types';
import { useProfileStore } from '../../stores/profile';
import { useSetupDraft } from '../../stores/setupDraft';
import { colors, spacing, typography } from '../../theme';
import { SetupHeader } from './SetupHeader';

/**
 * Step 4: shared availability, then one upsert per chosen sport. Sports are
 * saved one at a time so a failure names the sport that did not save and a
 * retry only re-sends what is still missing.
 */
export function SetupAvailabilityScreen({ navigation, route }: SetupAvailabilityScreenProps) {
  const { mode, sports } = route.params;
  const sportProfiles = useProfileStore((s) => s.sportProfiles);
  const upsertSportProfile = useProfileStore((s) => s.upsertSportProfile);
  const { golf, run, times, setTimes, reset } = useSetupDraft();
  const [saved, setSaved] = useState<FocusSport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Prefill from an existing row's stored times when the draft has none.
  useEffect(() => {
    if (times.length > 0) return;
    const stored = (sportProfiles ?? []).find((sp) => sports.includes(sp.sport as FocusSport));
    if (stored?.preferredTimes?.length) setTimes([...stored.preferredTimes]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinish() {
    setError(null);
    const timesError = validateTimes(times);
    if (timesError) {
      setError(timesError);
      return;
    }
    setIsSaving(true);
    const done = [...saved];
    try {
      for (const sport of sports) {
        if (done.includes(sport)) continue;
        const result = sport === 'golf' ? validateGolfForm(golf) : validateRunForm(run);
        if (!result.ok) {
          setError(`${FOCUS_SPORT_LABEL[sport]}: ${result.error}`);
          return;
        }
        const existing = (sportProfiles ?? []).find((sp) => sp.sport === sport) ?? null;
        try {
          await upsertSportProfile(buildUpsert(result.fields, times, existing));
        } catch (err) {
          const detail = err instanceof Error ? err.message : 'Please try again.';
          setError(`Could not save your ${FOCUS_SPORT_LABEL[sport].toLowerCase()} preferences. ${detail}`);
          return;
        }
        done.push(sport);
        setSaved([...done]);
      }
      reset();
      if (mode === 'add') {
        navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: 'Profile' } }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen padded scroll>
      <SetupHeader
        mode={mode}
        step={4}
        title="When do you play?"
        subtitle="Used to rank partners whose times overlap with yours. It never overrides level or pace."
        onBack={isSaving ? undefined : () => navigation.goBack()}
      />

      <AvailabilityPicker
        value={times}
        onChange={(next) => {
          setError(null);
          setTimes(next);
        }}
      />

      {saved.length > 0 && saved.length < sports.length ? (
        <InlineNotice
          tone="info"
          text={`${saved.map((s) => FOCUS_SPORT_LABEL[s]).join(' and ')} saved.`}
        />
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        label={mode === 'add' ? 'Save' : 'Finish'}
        onPress={handleFinish}
        loading={isSaving}
        style={styles.cta}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  cta: { marginBottom: spacing.xl },
});
