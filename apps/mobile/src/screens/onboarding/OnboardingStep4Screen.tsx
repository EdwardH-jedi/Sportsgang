import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FitnessLevel, PreferredTime, Sport, UpsertSportProfileRequest } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { DEFAULT_SPORT, SPORTS, getSport } from '../../lib/sports';
import { useProfileStore } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
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
    <Screen padded scroll>
      {/* Progress indicator */}
      <View style={styles.progress}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={[styles.dot, styles.dotActive]} />
        <Text style={styles.stepLabel}>Step 4 of 4</Text>
      </View>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Sport profile</Text>
        <Text style={styles.title}>Your sport{'\n'}profile</Text>
        <Text style={styles.subtitle}>Tell us what you train, so we can match you better.</Text>
      </View>

      {/* Sport selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Which sports are you into?</Text>
        <View style={styles.toggleRow}>
          {SPORTS.map(({ id: value, label }) => {
            const isOn = selected.has(value);
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isOn && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => toggleSport(value)}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: isOn }}
              >
                <Text style={[styles.toggleButtonText, isOn && styles.toggleButtonTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Per-sport detail sections */}
      {SPORTS.filter(({ id }) => selected.has(id)).map(
        ({ id: value, label, venueLabel, venuePlaceholder }, idx) => (
          <View key={value}>
            {idx > 0 && <View style={styles.divider} />}
            <View style={styles.sportBlock}>
              <Text style={styles.sportBlockTitle}>{label}</Text>
              <SportFields
                state={sportStates[value]}
                venueLabel={venueLabel}
                venuePlaceholder={venuePlaceholder}
                onLevelChange={(l) => updateSportState(value, { level: l })}
                onTimeToggle={(t) => toggleTime(value, t)}
                onVenueChange={(n) => updateSportState(value, { venueName: n })}
              />
            </View>
          </View>
        )
      )}

      {/* Goals */}
      {anySelected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fitness goals (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={goals}
            onChangeText={(t) => setGoals(t.slice(0, 300))}
            placeholder="What are your fitness goals?"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{goals.length} / 300</Text>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [
          styles.buttonPrimary,
          (pressed || isSubmitting) && styles.pressed,
        ]}
        onPress={handleFinish}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel="Let's go"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonPrimaryText}>Let's go</Text>
        )}
      </Pressable>
    </Screen>
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
    <View style={styles.sportFieldsContainer}>
      {/* Level */}
      <View style={styles.subSection}>
        <Text style={styles.subSectionTitle}>Level</Text>
        <View style={styles.toggleRow}>
          {LEVELS.map((lv) => {
            const isSelected = state.level === lv.value;
            return (
              <Pressable
                key={lv.value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => onLevelChange(lv.value)}
                accessibilityRole="radio"
                accessibilityLabel={lv.label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text style={[styles.toggleButtonText, isSelected && styles.toggleButtonTextActive]}>
                  {lv.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Preferred times */}
      <View style={styles.subSection}>
        <Text style={styles.subSectionTitle}>Preferred times</Text>
        <View style={styles.toggleRow}>
          {TIME_SLOTS.map(({ value, label }) => {
            const isSelected = state.times.includes(value);
            return (
              <Pressable
                key={value}
                style={({ pressed }) => [
                  styles.toggleButton,
                  isSelected && styles.toggleButtonActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => onTimeToggle(value)}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: isSelected }}
              >
                <Text style={[styles.toggleButtonText, isSelected && styles.toggleButtonTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Venue — only rendered when the sport has a venue concept */}
      {venueLabel ? (
        <View style={styles.subSection}>
          <Text style={styles.subSectionTitle}>{venueLabel}</Text>
          <TextInput
            style={styles.input}
            value={state.venueName}
            onChangeText={onVenueChange}
            placeholder={venuePlaceholder}
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 20,
  },
  stepLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginLeft: spacing.xs,
  },
  header: {
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  toggleButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  toggleButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  toggleButtonTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  sportBlock: {
    marginBottom: spacing.lg,
  },
  sportBlockTitle: {
    ...typography.h3,
    color: colors.brand,
    marginBottom: spacing.md,
  },
  sportFieldsContainer: {
    gap: spacing.md,
  },
  subSection: {
    gap: spacing.sm,
  },
  subSectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.separator,
    marginVertical: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.bodyLarge,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputMultiline: {
    height: 80,
    paddingTop: spacing.md,
  },
  charCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'right',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.md,
  },
  buttonPrimary: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  buttonPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: {
    opacity: 0.65,
  },
});
