import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FitnessLevel, PreferredTime, Sport, UpsertSportProfileRequest } from '@protin/shared-types';

import { Card, Chip, Icon, TextField, sportIconName } from '../../components/ui';
import { DEFAULT_SPORT, SPORTS, getSport } from '../../lib/sports';
import { useProfileStore } from '../../stores/profile';
import { colors, spacing, typography } from '../../theme';
import { ChoiceRow, OnboardingFrame, OnboardingSection } from './OnboardingFrame';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingStep4'>;

type Level = FitnessLevel;
type TimeSlot = PreferredTime;

const LEVELS: { value: Level; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'flexible', label: 'Flexible' },
];

interface SportFormState {
  level: Level;
  times: TimeSlot[];
  venueName: string;
}

const DEFAULT_SPORT_STATE: SportFormState = {
  level: 'beginner',
  times: [],
  venueName: '',
};

function makeInitialStates(): Record<Sport, SportFormState> {
  return Object.fromEntries(
    SPORTS.map(({ id }) => [id, { ...DEFAULT_SPORT_STATE }])
  ) as Record<Sport, SportFormState>;
}

export function OnboardingStep4Screen({ navigation }: Props) {
  // Running-first: the registry's default sport starts pre-selected so the
  // common case is one tap; users can still deselect it.
  const [selected, setSelected] = useState<Set<Sport>>(() => new Set([DEFAULT_SPORT]));
  const [sportStates, setSportStates] = useState<Record<Sport, SportFormState>>(makeInitialStates);
  const [goals, setGoals] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upsertSportProfile } = useProfileStore();

  function toggleSport(sport: Sport) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport); else next.add(sport);
      return next;
    });
  }

  function updateSportState(sport: Sport, patch: Partial<SportFormState>) {
    setSportStates((prev) => ({ ...prev, [sport]: { ...prev[sport], ...patch } }));
  }

  function toggleTime(sport: Sport, time: TimeSlot) {
    const times = sportStates[sport].times;
    updateSportState(sport, {
      times: times.includes(time) ? times.filter((t) => t !== time) : [...times, time],
    });
  }

  async function handleFinish() {
    setError(null);
    if (selected.size === 0) {
      setError('Please select at least one sport.');
      return;
    }
    setIsSubmitting(true);
    try {
      const goalsValue = goals.trim() || undefined;
      await Promise.all(
        [...selected].map((sport) => {
          const state = sportStates[sport];
          // Only sports with a backend venue column persist the venue text.
          const venueField = getSport(sport).venueField;
          const venue = state.venueName.trim() || undefined;
          const profile: UpsertSportProfileRequest = {
            sport,
            level: state.level,
            preferredTimes: state.times,
            gymName: venueField === 'gymName' ? venue : undefined,
            golfClub: venueField === 'golfClub' ? venue : undefined,
            goals: goalsValue,
          };
          return upsertSportProfile(profile);
        })
      );
      navigation.replace('Main');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save sport profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const anySelected = selected.size > 0;

  return (
    <OnboardingFrame
      step={4}
      onBack={() => navigation.goBack()}
      eyebrow="Sport profile"
      title="What you train"
      subtitle="Running's picked for you — add anything else you play so we can match you better."
      error={error}
      submitLabel="Let's go"
      onSubmit={() => void handleFinish()}
      submitting={isSubmitting}
      withKeyboard
    >
      <OnboardingSection title="Which sports are you into?">
        <ChoiceRow>
          {SPORTS.map(({ id: value, label }) => (
            <Chip
              key={value}
              role="checkbox"
              label={label}
              selected={selected.has(value)}
              onPress={() => toggleSport(value)}
            />
          ))}
        </ChoiceRow>
      </OnboardingSection>

      {SPORTS.filter(({ id }) => selected.has(id)).map(({ id: value, label, venueLabel, venuePlaceholder }) => (
        <Card key={value} padding="lg">
          <View style={styles.sportTitleRow}>
            <Icon name={sportIconName(value)} size="md" color={colors.brand} />
            <Text style={styles.sportTitle}>{label}</Text>
          </View>
          <SportFields
            state={sportStates[value]}
            venueLabel={venueLabel}
            venuePlaceholder={venuePlaceholder}
            onLevelChange={(l) => updateSportState(value, { level: l })}
            onTimeToggle={(t) => toggleTime(value, t)}
            onVenueChange={(n) => updateSportState(value, { venueName: n })}
          />
        </Card>
      ))}

      {anySelected ? (
        <TextField
          label="Fitness goals (optional)"
          value={goals}
          onChangeText={(t) => setGoals(t.slice(0, 300))}
          placeholder="What are your fitness goals?"
          multiline
          helper={`${goals.length} / 300`}
        />
      ) : null}
    </OnboardingFrame>
  );
}

// ─── Inline sub-component ─────────────────────────────────────────────────────

interface SportFieldsProps {
  state: SportFormState;
  venuePlaceholder?: string;
  venueLabel?: string;
  onLevelChange: (l: Level) => void;
  onTimeToggle: (t: TimeSlot) => void;
  onVenueChange: (n: string) => void;
}

function SportFields({
  state,
  venuePlaceholder,
  venueLabel,
  onLevelChange,
  onTimeToggle,
  onVenueChange,
}: SportFieldsProps) {
  return (
    <View style={styles.sportFields}>
      <OnboardingSection title="Level">
        <ChoiceRow>
          {LEVELS.map((lv) => (
            <Chip
              key={lv.value}
              role="radio"
              label={lv.label}
              selected={state.level === lv.value}
              onPress={() => onLevelChange(lv.value)}
            />
          ))}
        </ChoiceRow>
      </OnboardingSection>

      <OnboardingSection title="Preferred times">
        <ChoiceRow>
          {TIME_SLOTS.map(({ value, label }) => (
            <Chip
              key={value}
              role="checkbox"
              label={label}
              selected={state.times.includes(value)}
              onPress={() => onTimeToggle(value)}
            />
          ))}
        </ChoiceRow>
      </OnboardingSection>

      {/* Venue — only when the sport has a venue concept. */}
      {venueLabel ? (
        <TextField
          label={venueLabel}
          value={state.venueName}
          onChangeText={onVenueChange}
          placeholder={venuePlaceholder}
          autoCapitalize="words"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sportTitle: {
    ...typography.h3,
  },
  sportFields: {
    gap: spacing.lg,
  },
});
