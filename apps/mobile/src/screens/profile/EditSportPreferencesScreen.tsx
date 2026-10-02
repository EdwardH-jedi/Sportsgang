import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PreferredTime } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { Button, ErrorState, InlineNotice, LoadingState } from '../../components/ui';
import {
  buildUpsert,
  golfFormFromProfile,
  runFormFromProfile,
  validateGolfForm,
  validateRunForm,
  validateTimes,
  type GolfFormState,
  type RunFormState,
} from '../../components/preferences/formState';
import {
  AvailabilityPicker,
  GolfPreferencesForm,
  RunPreferencesForm,
} from '../../components/preferences/PreferenceForms';
import { FOCUS_SPORT_LABEL, isConfigured } from '../../lib/sportPreferences';
import type { EditSportPreferencesScreenProps } from '../../navigation/types';
import { useProfileStore } from '../../stores/profile';
import { TOUCH_TARGET, colors, spacing, typography } from '../../theme';

/**
 * Edit (or complete) one sport's v2 preferences. Also the targeted
 * completion path for existing users whose legacy row is not configured:
 * their account, profile and other sports are left exactly as they are.
 */
export function EditSportPreferencesScreen({ navigation, route }: EditSportPreferencesScreenProps) {
  const { sport } = route.params;
  const label = FOCUS_SPORT_LABEL[sport];
  const { sportProfiles, fetchProfile, upsertSportProfile, deleteSportProfile } = useProfileStore();
  const existing = sportProfiles?.find((sp) => sp.sport === sport) ?? null;

  const [golf, setGolf] = useState<GolfFormState>(() => golfFormFromProfile(existing));
  const [run, setRun] = useState<RunFormState>(() => runFormFromProfile(existing));
  const [times, setTimes] = useState<PreferredTime[]>(() => [...(existing?.preferredTimes ?? [])]);
  const [isLoading, setIsLoading] = useState(sportProfiles === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const prefilled = useRef(sportProfiles !== null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await fetchProfile();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your profile.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchProfile]);

  useEffect(() => {
    if (sportProfiles === null) void load();
    // Load once on mount when the store is cold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill once when the profile arrives after a cold start.
  useEffect(() => {
    if (prefilled.current || sportProfiles === null) return;
    prefilled.current = true;
    const row = sportProfiles.find((sp) => sp.sport === sport) ?? null;
    setGolf(golfFormFromProfile(row));
    setRun(runFormFromProfile(row));
    setTimes([...(row?.preferredTimes ?? [])]);
  }, [sportProfiles, sport]);

  async function handleSave() {
    setError(null);
    const result = sport === 'golf' ? validateGolfForm(golf) : validateRunForm(run);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const timesError = validateTimes(times);
    if (timesError) {
      setError(timesError);
      return;
    }
    setIsSaving(true);
    try {
      await upsertSportProfile(buildUpsert(result.fields, times, existing));
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save your ${label.toLowerCase()} preferences.`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleRemove() {
    Alert.alert(
      `Remove ${label.toLowerCase()}?`,
      `This deletes your ${label.toLowerCase()} preferences. Your matches, chats and plans stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSportProfile(sport);
              navigation.goBack();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not remove this sport.');
            }
          },
        },
      ]
    );
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {label} preferences
        </Text>
      </View>

      {isLoading ? (
        <LoadingState label="Loading your preferences…" />
      ) : loadError ? (
        <ErrorState title="Could not load your profile" body={loadError} onAction={() => void load()} />
      ) : (
        <>
          {existing && !isConfigured(existing) ? (
            <InlineNotice
              tone="info"
              text={`Your ${label.toLowerCase()} profile was created before these questions existed. Finish them so we can show who fits — nothing else on your profile changes.`}
            />
          ) : null}

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

          <AvailabilityPicker
            value={times}
            onChange={(next) => {
              setError(null);
              setTimes(next);
            }}
          />

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Button label="Save preferences" onPress={handleSave} loading={isSaving} />
          {existing ? (
            <Button
              label={`Remove ${label.toLowerCase()} from my profile`}
              variant="danger"
              onPress={handleRemove}
              disabled={isSaving}
              style={styles.remove}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  back: { alignSelf: 'flex-start', minHeight: TOUCH_TARGET, justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '600', color: colors.brand },
  pressed: { opacity: 0.7 },
  title: { ...typography.h1 },
  error: { ...typography.body, color: colors.error, marginBottom: spacing.md },
  remove: { marginTop: spacing.md, marginBottom: spacing.xl },
});
