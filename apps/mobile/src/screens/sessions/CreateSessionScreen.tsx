/**
 * Host a group run or golf round (v2).
 *
 * The sport comes from the route (Explore's focus switch); only casual
 * running / golf sessions are created here. The date and time are Sydney
 * wall time. Capacity is the total including the host. Every session
 * preference is informational — the copy says so — and the server's 422
 * message is shown verbatim if it rejects the request.
 */

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarPicker } from '../../components/CalendarPicker';
import { Screen } from '../../components/Screen';
import { TimeWheelPicker } from '../../components/TimeWheelPicker';
import {
  Button,
  ChipRow,
  ChoiceChip,
  Field,
  InlineNotice,
  ScreenHeader,
  SectionTitle,
} from '../../components/ui';
import { createEvent } from '../../lib/events';
import { GROUP_STYLE_OPTIONS } from '../../lib/sportPreferences';
import { formatSydneyDateTime, sydneyWallTimeToUtc } from '../../lib/sydneyTime';
import { TOUCH_TARGET, colors, radii, spacing, typography } from '../../theme';
import type { CreateSessionScreenProps } from '../../navigation/types';
import {
  CAPACITY_LIMITS,
  buildCreateEventRequest,
  defaultSessionForm,
  type FormErrors,
  type SessionFormState,
} from './sessionForm';

export function CreateSessionScreen({ navigation, route }: CreateSessionScreenProps) {
  const sport = route.params.sport;
  const isGolf = sport === 'golf';
  const [form, setForm] = useState<SessionFormState>(() => defaultSessionForm(sport));
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const limits = CAPACITY_LIMITS[sport];
  const preview = useMemo(() => {
    const r = sydneyWallTimeToUtc(form.date, form.time);
    return r.ok ? formatSydneyDateTime(r.iso) : null;
  }, [form.date, form.time]);

  function patch(next: Partial<SessionFormState>) {
    setForm((f) => ({ ...f, ...next }));
  }
  function patchRun(next: Partial<SessionFormState['run']>) {
    setForm((f) => ({ ...f, run: { ...f.run, ...next } }));
  }
  function patchGolf(next: Partial<SessionFormState['golf']>) {
    setForm((f) => ({ ...f, golf: { ...f.golf, ...next } }));
  }

  async function submit() {
    setServerError(null);
    const result = buildCreateEventRequest(sport, form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await createEvent(result.body);
      navigation.replace('SessionDetail', { eventId: created.id });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not create the session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const noun = isGolf ? 'round' : 'run';
  const people = isGolf ? 'golfers' : 'runners';

  return (
    <Screen scroll withKeyboard>
      <View style={styles.topBar}>
        <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} style={styles.backButton} />
      </View>
      <ScreenHeader eyebrow={isGolf ? 'Golf' : 'Running'} title={isGolf ? 'Host a round' : 'Host a run'} />
      <Text style={styles.lead}>
        Times are Sydney time. Everything about pace, level and cost is a guide — anyone can join while spots
        remain.
      </Text>

      {serverError ? <InlineNotice text={serverError} /> : null}

      <Field
        label={isGolf ? 'Round name' : 'Run name'}
        required
        value={form.title}
        onChangeText={(title) => patch({ title })}
        placeholder={isGolf ? 'e.g. Saturday 9 at Moore Park' : 'e.g. Sunrise 5k loop'}
        maxLength={120}
        error={errors.title}
        returnKeyType="next"
      />
      <Field
        label={isGolf ? 'Course' : 'Meeting point'}
        required
        value={form.locationText}
        onChangeText={(locationText) => patch({ locationText })}
        placeholder={isGolf ? 'e.g. Moore Park Golf, Moore Park' : 'e.g. Centennial Park, Paddington Gates'}
        maxLength={200}
        error={errors.location}
        hint={isGolf ? undefined : 'Where everyone meets before the start.'}
      />

      <SectionTitle hint={preview ? `Starts ${preview}` : undefined}>
        {isGolf ? 'Tee time' : 'Start time'}
      </SectionTitle>
      <CalendarPicker selected={form.date} onSelect={(date) => patch({ date })} />
      <View style={styles.timeWheel}>
        <TimeWheelPicker value={form.time} onChange={(time) => patch({ time })} />
      </View>
      {errors.when ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errors.when}
        </Text>
      ) : null}

      <SectionTitle hint={`Total ${people} including you (${limits.min}–${limits.max}).`}>Group size</SectionTitle>
      <View style={styles.stepper}>
        <StepButton
          label="−"
          accessibilityLabel="Fewer spots"
          disabled={form.capacity <= limits.min}
          onPress={() => patch({ capacity: Math.max(limits.min, form.capacity - 1) })}
        />
        <Text style={styles.stepValue} accessibilityLabel={`${form.capacity} ${people} including you`}>
          {form.capacity} {people}
        </Text>
        <StepButton
          label="+"
          accessibilityLabel="More spots"
          disabled={form.capacity >= limits.max}
          onPress={() => patch({ capacity: Math.min(limits.max, form.capacity + 1) })}
        />
      </View>
      {errors.capacity ? <Text style={styles.error}>{errors.capacity}</Text> : null}

      {isGolf ? (
        <View>
          <SectionTitle>Holes</SectionTitle>
          <ChipRow>
            {([9, 18] as const).map((h) => (
              <ChoiceChip key={h} label={`${h} holes`} selected={form.golf.holes === h} onPress={() => patchGolf({ holes: h })} />
            ))}
          </ChipRow>

          <View style={styles.section}>
            <SectionTitle hint="This is your own update — SportsGang doesn't book or verify tee times.">
              Tee time status
            </SectionTitle>
            <ChipRow>
              <ChoiceChip
                label="Tee time secured"
                selected={form.golf.teeTimeStatus === 'secured'}
                onPress={() => patchGolf({ teeTimeStatus: 'secured' })}
              />
              <ChoiceChip
                label="Planning to book"
                selected={form.golf.teeTimeStatus === 'planning'}
                onPress={() => patchGolf({ teeTimeStatus: 'planning' })}
              />
            </ChipRow>
          </View>

          <View style={styles.section}>
            <Field
              label="Estimated cost per player (AUD, optional)"
              value={form.golf.costDollars}
              onChangeText={(costDollars) => patchGolf({ costDollars })}
              placeholder="e.g. 35"
              keyboardType="decimal-pad"
              error={errors.cost}
            />
            <SectionTitle hint="Optional guide, e.g. +2.1 to 18.0. Not enforced.">Suitable handicaps</SectionTitle>
            <View style={styles.row2}>
              <View style={styles.half}>
                <Field
                  label="From"
                  value={form.golf.handicapLow}
                  onChangeText={(handicapLow) => patchGolf({ handicapLow })}
                  placeholder="+2.1"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.half}>
                <Field
                  label="To"
                  value={form.golf.handicapHigh}
                  onChangeText={(handicapHigh) => patchGolf({ handicapHigh })}
                  placeholder="18.0"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            {errors.handicap ? <Text style={styles.error}>{errors.handicap}</Text> : null}
            <ChoiceChip
              kind="checkbox"
              label="Beginners welcome"
              selected={form.golf.beginnersWelcome}
              onPress={() => patchGolf({ beginnersWelcome: !form.golf.beginnersWelcome })}
            />
          </View>
        </View>
      ) : (
        <View>
          <Field
            label="Distance (km)"
            required
            value={form.run.distanceKm}
            onChangeText={(distanceKm) => patchRun({ distanceKm })}
            placeholder="e.g. 5"
            keyboardType="decimal-pad"
            error={errors.distance}
          />
          <SectionTitle>Pace</SectionTitle>
          <ChipRow>
            <ChoiceChip
              label="Social pace"
              selected={form.run.paceMode === 'social'}
              onPress={() => patchRun({ paceMode: 'social' })}
            />
            <ChoiceChip
              label="Target pace"
              selected={form.run.paceMode === 'target_pace'}
              onPress={() => patchRun({ paceMode: 'target_pace' })}
            />
          </ChipRow>
          {form.run.paceMode === 'target_pace' ? (
            <View style={[styles.row2, styles.section]}>
              <View style={styles.half}>
                <Field
                  label="Fastest (min:sec /km)"
                  value={form.run.paceFastest}
                  onChangeText={(paceFastest) => patchRun({ paceFastest })}
                  placeholder="5:30"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.half}>
                <Field
                  label="Slowest (min:sec /km)"
                  value={form.run.paceSlowest}
                  onChangeText={(paceSlowest) => patchRun({ paceSlowest })}
                  placeholder="6:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          ) : null}
          {errors.pace ? <Text style={styles.error}>{errors.pace}</Text> : null}

          <View style={styles.section}>
            <SectionTitle>Group style</SectionTitle>
            <ChipRow>
              {GROUP_STYLE_OPTIONS.map((o) => (
                <ChoiceChip
                  key={o.value}
                  label={o.label}
                  selected={form.run.groupStyle === o.value}
                  onPress={() => patchRun({ groupStyle: o.value })}
                />
              ))}
            </ChipRow>
          </View>
          <View style={styles.section}>
            <ChipRow>
              <ChoiceChip
                kind="checkbox"
                label="Beginner friendly"
                selected={form.run.beginnerFriendly}
                onPress={() => patchRun({ beginnerFriendly: !form.run.beginnerFriendly })}
              />
              <ChoiceChip
                kind="checkbox"
                label="Walk breaks OK"
                selected={form.run.walkBreaksOk}
                onPress={() => patchRun({ walkBreaksOk: !form.run.walkBreaksOk })}
              />
            </ChipRow>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Field
          label="Notes (optional)"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          placeholder={isGolf ? 'Cart, buggy, walking — anything to know' : 'Route, coffee after, anything to know'}
          multiline
          maxLength={1000}
          error={errors.description}
        />
      </View>

      <Button
        label={isGolf ? 'Create round' : 'Create run'}
        onPress={submit}
        loading={submitting}
        accessibilityHint={`Publishes this ${noun} so others can join`}
        testID="create-session-submit"
      />
    </Screen>
  );
}

function StepButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.stepButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.stepButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: spacing.sm },
  backButton: { paddingHorizontal: 0 },
  lead: { ...typography.body, marginBottom: spacing.md },
  section: { marginTop: spacing.md },
  timeWheel: { marginTop: spacing.sm },
  error: { fontSize: 13, lineHeight: 18, color: colors.error, marginTop: spacing.xs, marginBottom: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  stepButton: {
    width: TOUCH_TARGET + 4,
    height: TOUCH_TARGET + 4,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepButtonText: { fontSize: 22, fontWeight: '600', color: colors.brand },
  stepValue: { ...typography.h3, minWidth: 120, textAlign: 'center' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  row2: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
