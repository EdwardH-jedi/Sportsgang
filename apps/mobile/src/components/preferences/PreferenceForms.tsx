/**
 * Reusable v2 preference forms (setup flow + EditSportPreferences).
 *
 * Controlled components: the parent owns GolfFormState / RunFormState /
 * PreferredTime[] and validates with ./formState before saving.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FitnessLevel, PreferredTime } from '@protin/shared-types';

import { ChipRow, ChoiceChip, Field, SectionTitle } from '../ui';
import {
  DEFAULT_TOLERANCE_TENTHS,
  DISTANCE_PRESETS_KM,
  GOLF_EXPERIENCE_OPTIONS,
  GOLF_INTENT_OPTIONS,
  GROUP_STYLE_OPTIONS,
  HANDICAP_SOURCE_OPTIONS,
  HOLES_OPTIONS,
  LEVEL_OPTIONS,
  PACE_MODE_OPTIONS,
  TIME_OPTIONS,
  TOLERANCE_OPTIONS_TENTHS,
  formatDistance,
  formatHandicap,
} from '../../lib/sportPreferences';
import { colors, spacing, typography } from '../../theme';
import { toggleIn, toggleTime, type GolfFormState, type RunFormState } from './formState';

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {children}
    </View>
  );
}

function LevelPicker({
  value,
  onChange,
}: {
  value: FitnessLevel | null;
  onChange: (level: FitnessLevel) => void;
}) {
  return (
    <Section title="Overall level" hint="How you would describe yourself — shown on your profile.">
      <ChipRow>
        {LEVEL_OPTIONS.map((opt) => (
          <ChoiceChip
            key={opt.value}
            label={opt.label}
            selected={value === opt.value}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </ChipRow>
    </Section>
  );
}

// ─── Golf ───────────────────────────────────────────────────────────────────

export function GolfPreferencesForm({
  value,
  onChange,
}: {
  value: GolfFormState;
  onChange: (next: GolfFormState) => void;
}) {
  const set = (patch: Partial<GolfFormState>) => onChange({ ...value, ...patch });
  const similar = value.intents.includes('similar_level');

  return (
    <View>
      <LevelPicker value={value.level} onChange={(level) => set({ level })} />

      <Section title="Handicap" hint="Self-reported. SportsGang does not verify handicaps.">
        <View style={styles.stack}>
          {HANDICAP_SOURCE_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={value.handicapSource === opt.value}
              onPress={() =>
                set({
                  handicapSource: opt.value,
                  handicapText: opt.value === 'none' ? '' : value.handicapText,
                })
              }
            />
          ))}
        </View>
        {value.handicapSource && value.handicapSource !== 'none' ? (
          <View style={styles.inlineField}>
            <Field
              label={value.handicapSource === 'estimate' ? 'Estimated handicap' : 'Handicap index'}
              hint="For example 18.4. Use + for a plus handicap, e.g. +2.1."
              value={value.handicapText}
              onChangeText={(handicapText) => set({ handicapText })}
              placeholder="e.g. 18.4"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              maxLength={5}
              required
            />
          </View>
        ) : null}
      </Section>

      <Section title="Experience">
        <ChipRow>
          {GOLF_EXPERIENCE_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              label={opt.label}
              selected={value.experience === opt.value}
              onPress={() => set({ experience: opt.value })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section
        title="Who do you want to play with?"
        hint="Choose all that apply. You only see people whose own choices fit you too."
      >
        <View style={styles.stack}>
          {GOLF_INTENT_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              kind="checkbox"
              label={opt.label}
              description={opt.description}
              selected={value.intents.includes(opt.value)}
              onPress={() => set({ intents: toggleIn(value.intents, opt.value) })}
            />
          ))}
        </View>
      </Section>

      {similar ? (
        <Section
          title="How close is 'similar'?"
          hint={`Largest handicap gap you're happy with. If you skip this we use ${formatHandicap(
            DEFAULT_TOLERANCE_TENTHS
          )} strokes.`}
        >
          <ChipRow>
            {TOLERANCE_OPTIONS_TENTHS.map((tenths) => (
              <ChoiceChip
                key={tenths}
                label={`Within ${formatHandicap(tenths)}`}
                selected={value.toleranceTenths === tenths}
                onPress={() =>
                  set({ toleranceTenths: value.toleranceTenths === tenths ? null : tenths })
                }
              />
            ))}
          </ChipRow>
        </Section>
      ) : null}

      <Section title="Preferred round" hint="Optional.">
        <ChipRow>
          {HOLES_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              label={opt.label}
              selected={value.holes === opt.value}
              onPress={() => set({ holes: value.holes === opt.value ? null : opt.value })}
            />
          ))}
        </ChipRow>
      </Section>
    </View>
  );
}

// ─── Running ────────────────────────────────────────────────────────────────

export function RunPreferencesForm({
  value,
  onChange,
}: {
  value: RunFormState;
  onChange: (next: RunFormState) => void;
}) {
  const set = (patch: Partial<RunFormState>) => onChange({ ...value, ...patch });
  // Keep any stored distance that is not a preset visible and removable.
  const distanceOptions = [...new Set([...DISTANCE_PRESETS_KM, ...value.distances])].sort(
    (a, b) => a - b
  );
  const paceRequired = value.paceMode === 'match_pace';

  return (
    <View>
      <LevelPicker value={value.level} onChange={(level) => set({ level })} />

      <Section title="How do you like to run?">
        <View style={styles.stack}>
          {PACE_MODE_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              label={opt.label}
              description={opt.description}
              selected={value.paceMode === opt.value}
              onPress={() => set({ paceMode: opt.value })}
            />
          ))}
        </View>
      </Section>

      {value.paceMode ? (
        <Section
          title={paceRequired ? 'Comfortable pace' : 'Usual pace (optional)'}
          hint={
            paceRequired
              ? 'Minutes per km, e.g. 5:30 to 6:15. We match you with runners whose range overlaps.'
              : 'Leave empty if you would rather not say. Social runs never require a pace.'
          }
        >
          <View style={styles.paceRow}>
            <View style={styles.paceField}>
              <Field
                label="Fastest"
                value={value.paceFastest}
                onChangeText={(paceFastest) => set({ paceFastest })}
                placeholder="5:30"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                maxLength={5}
                required={paceRequired}
              />
            </View>
            <Text style={styles.paceDash} accessibilityElementsHidden>
              –
            </Text>
            <View style={styles.paceField}>
              <Field
                label="Slowest"
                value={value.paceSlowest}
                onChangeText={(paceSlowest) => set({ paceSlowest })}
                placeholder="6:15"
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                maxLength={5}
                required={paceRequired}
              />
            </View>
          </View>
        </Section>
      ) : null}

      <Section title="Distances you enjoy" hint="Optional. Choose any.">
        <ChipRow>
          {distanceOptions.map((km) => (
            <ChoiceChip
              key={km}
              kind="checkbox"
              label={formatDistance(km)}
              selected={value.distances.includes(km)}
              onPress={() => set({ distances: toggleIn(value.distances, km) })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="Group style" hint="Optional.">
        <ChipRow>
          {GROUP_STYLE_OPTIONS.map((opt) => (
            <ChoiceChip
              key={opt.value}
              label={opt.label}
              selected={value.groupStyle === opt.value}
              onPress={() => set({ groupStyle: value.groupStyle === opt.value ? null : opt.value })}
            />
          ))}
        </ChipRow>
      </Section>
    </View>
  );
}

// ─── Availability ───────────────────────────────────────────────────────────

export function AvailabilityPicker({
  value,
  onChange,
}: {
  value: PreferredTime[];
  onChange: (next: PreferredTime[]) => void;
}) {
  return (
    <Section title="When do you usually play?" hint="Choose any that apply, or Flexible.">
      <ChipRow>
        {TIME_OPTIONS.map((opt) => (
          <ChoiceChip
            key={opt.value}
            kind="checkbox"
            label={opt.label}
            selected={value.includes(opt.value)}
            onPress={() => onChange(toggleTime(value, opt.value))}
          />
        ))}
      </ChipRow>
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  stack: { gap: spacing.sm },
  inlineField: { marginTop: spacing.md },
  paceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  paceField: { flex: 1 },
  paceDash: {
    ...typography.h3,
    color: colors.textTertiary,
    marginTop: spacing.xl + spacing.xs,
  },
});
