import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { Select, type SelectOption } from '../../components/Select';
import { Button } from '../../components/ui';
import { SYDNEY_SUBURB_OPTIONS } from '../../data/sydneySuburbs';
import {
  DISPLAY_NAME_HELPER_TEXT,
  sanitizeDisplayName,
} from '../../lib/displayName';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
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
  const { upsertProfile, profile } = useProfileStore();
  // A partially created profile (app closed mid-onboarding) resumes with its
  // saved values instead of asking for them again.
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [birthYear, setBirthYear] = useState<string | null>(
    profile?.birthYear ? String(profile.birthYear) : null
  );
  const [suburb, setSuburb] = useState<string | null>(profile?.suburb ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // v2 flow: identity → sports → details → availability. Photos, bio and
      // partner preferences are optional and live in Profile.
      navigation.navigate('SetupSports', { mode: 'onboarding' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen padded scroll withKeyboard>
      <View style={styles.progressBlock}>
        <View style={styles.progressBar}>
          <View style={[styles.progressSegment, styles.progressSegmentActive]} />
          <View style={styles.progressSegment} />
          <View style={styles.progressSegment} />
          <View style={styles.progressSegment} />
        </View>
        <Text style={styles.stepLabel}>Step 1 of 4</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Getting started</Text>
        <Text style={styles.title}>Your profile</Text>
        <Text style={styles.subtitle}>
          The basics first. Next you'll choose running, golf or both.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>
            Display name<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={(text) => setDisplayName(sanitizeDisplayName(text))}
            placeholder="How you'll appear to others"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="next"
            // iOS-specific: declare this is the user's name, NOT a
            // credential field. After the RegisterScreen newPassword
            // field, iOS Strong Password / Password Autofill keeps a
            // "save credential" overlay alive across the screen swap and
            // associates the next focused TextInput as the username slot —
            // painting it yellow and capturing keystrokes before they
            // reach React state. `textContentType="name"` is the
            // strongest non-credential semantic on iOS and breaks the
            // association on real devices where the previous `nickname`
            // value still let the carry-over win. Paired with the
            // `Keyboard.dismiss()` in RegisterScreen.handleRegister which
            // severs the carry-over at the navigation boundary.
            textContentType="name"
            // Android: declare a non-credential autofill hint matching the
            // iOS semantic. `importantForAutofill="no"` is kept so any
            // future Android-side autofill regression can never write to
            // the native input without firing onChangeText.
            autoComplete="name"
            importantForAutofill="no"
            // Explicit accessibilityLabel removes the last bit of
            // ambiguity for iOS heuristics. Without it, iOS's autofill
            // engine weights field position more heavily — and "first
            // TextInput on the screen after a credential flow" is exactly
            // the position iOS treats as the credential's username slot.
            accessibilityLabel="Display name"
          />
          <Text style={styles.hint}>{DISPLAY_NAME_HELPER_TEXT}</Text>
        </View>

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
          {calculatedAge !== null ? (
            <Text style={styles.hint}>Age: {calculatedAge}</Text>
          ) : null}
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          label="Continue"
          onPress={handleContinue}
          loading={isSubmitting}
          style={styles.submit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressBlock: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  progressBar: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.separator,
  },
  progressSegmentActive: {
    backgroundColor: colors.brand,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  header: {
    paddingBottom: spacing.xl,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  required: {
    color: colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    // Use explicit fontSize/fontWeight from the bodyLarge token but omit
    // lineHeight: setting lineHeight on a TextInput clips descenders (g, y, p)
    // on Android and is unnecessary since TextInput is single-line here.
    fontSize: typography.bodyLarge.fontSize,
    fontWeight: typography.bodyLarge.fontWeight,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  submit: {
    marginTop: spacing.md,
  },
});
