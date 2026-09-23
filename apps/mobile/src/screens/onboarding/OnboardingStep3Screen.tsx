import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AgeRangeSelector } from '../../components/AgeRangeSelector';
import { Button, Card, Icon } from '../../components/ui';
import { useHomeLocation } from '../../hooks/useHomeLocation';
import { useProfileStore } from '../../stores/profile';
import { colors, spacing, typography } from '../../theme';
import { ChoiceChip, ChoiceRow, OnboardingFrame, OnboardingSection } from './OnboardingFrame';
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

export function OnboardingStep3Screen({ navigation }: Props) {
  const [openTo, setOpenTo] = useState<GenderPreference[]>(['any']);
  const [ageMin, setAgeMin] = useState<number>(AGE_MIN_LIMIT);
  const [ageMax, setAgeMax] = useState<number>(DEFAULT_AGE_MAX);
  const [maxDistance, setMaxDistance] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertIdentityPreferences } = useProfileStore();

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
      navigation.navigate('OnboardingStep4');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <OnboardingFrame
      step={3}
      onBack={() => navigation.goBack()}
      eyebrow="Preferences"
      title="Who and where"
      subtitle="We use this to show you runners, crews and group runs that fit."
      error={error}
      submitLabel="Continue"
      onSubmit={() => void handleContinue()}
      submitting={isSubmitting}
    >
      <OnboardingSection title="Where do you usually run?" hint="Optional — rounded to about 1 km and never shown to anyone.">
        <LocationStep />
      </OnboardingSection>

      <OnboardingSection title="I'm open to training with">
        <ChoiceRow>
          {OPEN_TO_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              role="checkbox"
              label={opt.label}
              checked={openTo.includes(opt.value)}
              onPress={() => toggleOpenTo(opt.value)}
            />
          ))}
        </ChoiceRow>
      </OnboardingSection>

      <OnboardingSection title="Partner age range">
        <AgeRangeSelector
          minAge={ageMin}
          maxAge={ageMax}
          onChange={handleAgeChange}
          minLimit={AGE_MIN_LIMIT}
          maxLimit={AGE_MAX_LIMIT}
        />
      </OnboardingSection>

      <OnboardingSection title="Max distance">
        <ChoiceRow>
          {DISTANCE_OPTIONS.map((km) => (
            <ChoiceChip
              key={km}
              role="radio"
              label={`${km} km`}
              checked={maxDistance === km}
              onPress={() => setMaxDistance(km)}
            />
          ))}
        </ChoiceRow>
      </OnboardingSection>
    </OnboardingFrame>
  );
}

/**
 * Skippable location step: one tap asks for permission, takes a coarse
 * fix and saves it as the profile home location (2 dp). Powers "near
 * you" on the Run and Crews tabs.
 */
function LocationStep() {
  const { status, requestLocation, isBusy, openSettings } = useHomeLocation({ auto: false });

  if (status === 'ready') {
    return (
      <Card variant="brand" padding="md">
        <View style={styles.locationRow}>
          <Icon name="check-circle" size="md" color={colors.brand} />
          <Text style={styles.locationText}>Location saved. We'll show what's near you.</Text>
        </View>
      </Card>
    );
  }
  if (status === 'denied') {
    return (
      <View style={styles.locationBlock}>
        <Text style={styles.locationHint}>
          Location is off. You can still browse all of Sydney and set it later from the Run tab.
        </Text>
        <Button label="Open settings" variant="secondary" size="sm" onPress={openSettings} />
      </View>
    );
  }
  return (
    <View style={styles.locationBlock}>
      <Button
        label="Use my location"
        variant="secondary"
        leadingIcon="my-location"
        loading={isBusy}
        onPress={() => void requestLocation()}
      />
      {status === 'unavailable' ? (
        <Text style={styles.locationHint}>Couldn't get a fix — you can skip this and set it later.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },
  locationBlock: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  locationHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
