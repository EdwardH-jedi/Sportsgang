import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AgeRangeSelector } from '../../components/AgeRangeSelector';
import { Screen } from '../../components/Screen';
import { useProfileStore } from '../../stores/profile';
import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';
import type { GenderPreference } from '@protin/shared-types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep3'>;

const OPEN_TO_OPTIONS: { value: GenderPreference; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'non_binary', label: 'Non-binary' },
];

const DISTANCE_OPTIONS = [5, 10, 20, 50];

const AGE_MIN_LIMIT = 18;
const AGE_MAX_LIMIT = 80;
const DEFAULT_AGE_MAX = 65;

/**
 * Optional partner preferences (reached from Profile). The values are saved
 * to the existing identity-preferences record, but discovery does not filter
 * by them yet — the copy says so instead of implying they are enforced.
 */
export function OnboardingStep3Screen({ navigation }: Props) {
  const { upsertIdentityPreferences, identityPreferences: saved } = useProfileStore();
  const [openTo, setOpenTo] = useState<GenderPreference[]>(saved?.openTo?.length ? saved.openTo : ['any']);
  const [ageMin, setAgeMin] = useState<number>(saved?.ageRangeMin ?? AGE_MIN_LIMIT);
  const [ageMax, setAgeMax] = useState<number>(saved?.ageRangeMax ?? DEFAULT_AGE_MAX);
  const [maxDistance, setMaxDistance] = useState<number>(saved?.maxDistanceKm ?? 20);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleOpenTo(value: GenderPreference) {
    if (value === 'any') {
      setOpenTo(['any']);
      return;
    }
    setOpenTo((prev) => {
      const withoutAny = prev.filter((v) => v !== 'any');
      if (withoutAny.includes(value)) {
        const next = withoutAny.filter((v) => v !== value);
        return next.length === 0 ? ['any'] : next;
      }
      return [...withoutAny, value];
    });
  }

  function handleAgeChange(nextMin: number, nextMax: number) {
    setAgeMin(nextMin);
    setAgeMax(nextMax);
  }

  async function handleContinue() {
    setError(null);
    if (
      ageMin < AGE_MIN_LIMIT ||
      ageMax > AGE_MAX_LIMIT ||
      ageMin > ageMax
    ) {
      setError('Please choose a valid age range (18–80).');
      return;
    }
    setIsSubmitting(true);
    try {
      await upsertIdentityPreferences({
        openTo,
        ageRangeMin: ageMin,
        ageRangeMax: ageMax,
        maxDistanceKm: maxDistance,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen padded scroll>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Optional</Text>
        <Text style={styles.title} accessibilityRole="header">
          Partner preferences
        </Text>
        <Text style={styles.subtitle}>
          Saved to your profile for later. They do not filter who you see yet — matching uses
          your running and golf preferences.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>I'm open to training with</Text>
        <View style={styles.toggleRow}>
          {OPEN_TO_OPTIONS.map((opt) => {
            const isSelected = openTo.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => toggleOpenTo(opt.value)}
                accessibilityRole="checkbox"
                accessibilityLabel={opt.label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text
                  style={[
                    styles.toggleButtonText,
                    isSelected && styles.toggleButtonTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Partner age range</Text>
        <AgeRangeSelector
          minAge={ageMin}
          maxAge={ageMax}
          onChange={handleAgeChange}
          minLimit={AGE_MIN_LIMIT}
          maxLimit={AGE_MAX_LIMIT}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Max distance</Text>
        <View style={styles.toggleRow}>
          {DISTANCE_OPTIONS.map((km) => {
            const isSelected = maxDistance === km;
            return (
              <Pressable
                key={km}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setMaxDistance(km)}
                accessibilityRole="radio"
                accessibilityLabel={`${km} km`}
                accessibilityState={{ checked: isSelected }}
              >
                <Text
                  style={[
                    styles.toggleButtonText,
                    isSelected && styles.toggleButtonTextActive,
                  ]}
                >
                  {km} km
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          (pressed || isSubmitting) && styles.pressed,
        ]}
        onPress={handleContinue}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Save"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Save</Text>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggleButton: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  toggleButtonActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  toggleButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  toggleButtonTextActive: {
    color: colors.brand,
    fontWeight: '600',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
    minHeight: 50,
    justifyContent: 'center',
    // Match the pill shape used by OnboardingStep1/2 + LoginScreen so the
    // onboarding flow ends on the same CTA silhouette it began with.
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
});
