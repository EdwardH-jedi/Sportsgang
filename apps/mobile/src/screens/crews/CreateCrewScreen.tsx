import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Icon, Screen, TextField } from '../../components/ui';
import { useCrew } from '../../hooks/useCrew';
import { useHomeLocation } from '../../hooks/useHomeLocation';
import { type CreateCrewRequest, createCrew, updateCrew } from '../../lib/crews';
import { type Coords, roundCoords } from '../../lib/location';
import { formatPace, validatePaceBand } from '../../lib/pace';
import type { CreateCrewScreenProps } from '../../navigation/types';
import { useProfileStore } from '../../stores/profile';
import { colors, layout, spacing, typography } from '../../theme';

const NAME_MAX = 60;
const AREA_MAX = 80;
const DESCRIPTION_MAX = 500;

/**
 * Create a crew, or edit one (owner) when `crewId` is set. The crew's
 * home point comes from "Use my location" and is rounded to 2 dp; it is
 * never shown back (the API only uses it for "Crews near you").
 */
export function CreateCrewScreen({ navigation, route }: CreateCrewScreenProps) {
  const crewId = route?.params?.crewId ?? null;
  const isEdit = crewId !== null;
  const { crew } = useCrew(crewId);
  const suburb = useProfileStore((s) => s.profile?.suburb ?? '');
  const { requestLocation, isBusy: locating } = useHomeLocation({ auto: false });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [homeArea, setHomeArea] = useState(isEdit ? '' : suburb);
  const [home, setHome] = useState<Coords | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [paceMinInput, setPaceMinInput] = useState('');
  const [paceMaxInput, setPaceMaxInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prefilled = useRef(false);
  useEffect(() => {
    if (!crew || prefilled.current) return;
    prefilled.current = true;
    setName(crew.name);
    setDescription(crew.description ?? '');
    setHomeArea(crew.homeArea);
    setPaceMinInput(formatPace(crew.paceMinSecPerKm));
    setPaceMaxInput(formatPace(crew.paceMaxSecPerKm));
  }, [crew]);

  const pace = validatePaceBand(paceMinInput, paceMaxInput);
  const canSubmit =
    name.trim().length > 0 &&
    homeArea.trim().length > 0 &&
    !pace.error &&
    !isSubmitting &&
    (!isEdit || crew !== null);

  const takeLocation = async () => {
    setLocationNote(null);
    const fix = await requestLocation({ save: false });
    if (fix) {
      setHome(roundCoords(fix));
    } else {
      setLocationNote('Location unavailable — the crew will still show up in search.');
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const body: CreateCrewRequest = {
      name: name.trim(),
      homeArea: homeArea.trim(),
      description: description.trim() ? description.trim() : null,
      sport: 'running',
      paceMinSecPerKm: pace.min,
      paceMaxSecPerKm: pace.max,
    };
    if (home) {
      body.homeLat = home.lat;
      body.homeLng = home.lng;
    }
    try {
      if (isEdit && crewId) {
        // Sport is fixed after creation; home point only changes when re-set.
        const { sport: _sport, ...patch } = body;
        await updateCrew(crewId, patch);
        navigation.goBack();
      } else {
        const created = await createCrew(body);
        navigation.replace('CrewDetail', { crewId: created.id });
      }
    } catch (err) {
      Alert.alert(
        isEdit ? "Couldn't save the crew." : "Couldn't create the crew.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      padded={false}
      withKeyboard
      header={<Header title={isEdit ? 'Edit crew' : 'Create crew'} onBack={() => navigation.goBack()} />}
      footer={
        <Button
          label={isEdit ? 'Save changes' : 'Create crew'}
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!isEdit ? (
          <Text style={styles.sub}>
            A crew is the people you run with every week. You'll be its owner.
          </Text>
        ) : null}

        <TextField
          label="Crew name"
          value={name}
          onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
          placeholder="e.g. Inner West Dawn Patrol"
          maxLength={NAME_MAX}
          helper={`${name.length} / ${NAME_MAX}`}
        />

        <TextField
          label="Home area"
          value={homeArea}
          onChangeText={(t) => setHomeArea(t.slice(0, AREA_MAX))}
          placeholder="e.g. Glebe"
          leadingIcon="location"
          maxLength={AREA_MAX}
          helper="Shown on the crew. Suburb or park name."
        />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Where you meet</Text>
          {home ? (
            <Card variant="brand" padding="md">
              <View style={styles.row}>
                <Icon name="check-circle" size="md" color={colors.brand} />
                <Text style={styles.rowText}>Location set (about 1 km). Used for “Crews near you”.</Text>
                <Button label="Clear" variant="ghost" size="sm" onPress={() => setHome(null)} accessibilityLabel="Clear crew location" />
              </View>
            </Card>
          ) : (
            <Button
              label={isEdit ? 'Update location to here' : 'Use my location'}
              variant="secondary"
              leadingIcon="my-location"
              loading={locating}
              onPress={() => void takeLocation()}
              accessibilityLabel="Use my location for the crew"
            />
          )}
          <Text style={styles.hint}>
            {locationNote ??
              (isEdit
                ? 'Leave as is to keep the current crew location.'
                : 'Optional. Rounded to about 1 km and never shown to others.')}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Usual pace (optional)</Text>
          <View style={styles.row}>
            <TextField
              value={paceMinInput}
              onChangeText={setPaceMinInput}
              placeholder="5:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              helper="Fastest /km"
              accessibilityLabel="Fastest crew pace per km"
              containerStyle={styles.flex}
            />
            <TextField
              value={paceMaxInput}
              onChangeText={setPaceMaxInput}
              placeholder="6:30"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              helper="Slowest /km"
              accessibilityLabel="Slowest crew pace per km"
              containerStyle={styles.flex}
            />
          </View>
          {pace.error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {pace.error}
            </Text>
          ) : null}
        </View>

        <TextField
          label="About (optional)"
          value={description}
          onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX))}
          placeholder="Routes, regroup rules, coffee after…"
          multiline
          maxLength={DESCRIPTION_MAX}
          accessibilityLabel="Crew description"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  sub: {
    ...typography.body,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.label,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  hint: {
    ...typography.caption,
  },
  error: {
    ...typography.bodySmall,
    color: colors.error,
  },
});
