import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Select, type SelectOption } from '../../components/Select';
import { TextField } from '../../components/ui';
import { SYDNEY_SUBURB_OPTIONS } from '../../data/sydneySuburbs';
import {
  DISPLAY_NAME_HELPER_TEXT,
  sanitizeDisplayName,
} from '../../lib/displayName';
import { useProfileStore } from '../../stores/profile';
import { colors, spacing, typography } from '../../theme';
import { OnboardingFrame } from './OnboardingFrame';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep1'>;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_AGE = 18;
const MAX_AGE = 90;
export const MAX_BIRTH_YEAR = CURRENT_YEAR - MIN_AGE;
export const MIN_BIRTH_YEAR = CURRENT_YEAR - MAX_AGE;

export function buildYearOptions(): SelectOption[] {
  const years: SelectOption[] = [];
  // Most recent year first — most users tap near the top of the list.
  for (let y = MAX_BIRTH_YEAR; y >= MIN_BIRTH_YEAR; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

export function OnboardingStep1Screen({ navigation }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [birthYear, setBirthYear] = useState<string | null>(null);
  const [suburb, setSuburb] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertProfile } = useProfileStore();

  const yearOptions = useMemo(buildYearOptions, []);

  const birthYearNum = birthYear ? parseInt(birthYear, 10) : null;
  const calculatedAge = birthYearNum ? CURRENT_YEAR - birthYearNum : null;

  async function handleContinue() {
    setError(null);
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    if (!birthYearNum) {
      setError('Please select your birth year.');
      return;
    }
    if (!suburb) {
      setError('Please select your Sydney suburb.');
      return;
    }
    setIsSubmitting(true);
    try {
      await upsertProfile({
        displayName: displayName.trim(),
        birthYear: birthYearNum,
        suburb,
      });
      navigation.navigate('OnboardingStep2');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingFrame
      step={1}
      eyebrow="Getting started"
      title="Your profile"
      subtitle="Help runners and training partners know who you are."
      error={error}
      submitLabel="Continue"
      onSubmit={() => void handleContinue()}
      submitting={isSubmitting}
      withKeyboard
    >
      <TextField
        label="Display name"
        required
        helper={DISPLAY_NAME_HELPER_TEXT}
        value={displayName}
        onChangeText={(text) => setDisplayName(sanitizeDisplayName(text))}
        placeholder="How you'll appear to others"
        autoCapitalize="words"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="next"
        // iOS-specific: declare this is the user's name, NOT a credential
        // field. After RegisterScreen's newPassword field, iOS Password
        // Autofill can keep a "save credential" overlay alive across the
        // screen swap and treat the next focused input as the username
        // slot (yellow field, keystrokes swallowed). `textContentType=
        // "name"` is the strongest non-credential semantic on iOS; it's
        // paired with Keyboard.dismiss() in RegisterScreen.handleRegister.
        textContentType="name"
        // Android: matching non-credential hint; importantForAutofill="no"
        // stops system autofill writing to the input without onChangeText.
        autoComplete="name"
        importantForAutofill="no"
        // Explicit label so iOS heuristics don't weight field position.
        accessibilityLabel="Display name"
      />

      <View style={styles.field}>
        <Select
          label="Birth year"
          required
          value={birthYear}
          onChange={setBirthYear}
          placeholder="Select your birth year"
          options={yearOptions}
          modalTitle="Birth year"
          accessibilityLabel="Birth year"
        />
        {calculatedAge !== null ? <Text style={styles.hint}>Age: {calculatedAge}</Text> : null}
      </View>

      <Select
        label="Your Sydney suburb"
        required
        value={suburb}
        onChange={setSuburb}
        placeholder="Select your suburb"
        options={SYDNEY_SUBURB_OPTIONS}
        searchable
        modalTitle="Sydney suburb"
        accessibilityLabel="Sydney suburb"
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
