import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CalendarPicker } from '../../components/CalendarPicker';
import { TimeWheelPicker } from '../../components/TimeWheelPicker';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  Header,
  ListRow,
  Screen,
  TextField,
  sportIconName,
} from '../../components/ui';
import { useCrews } from '../../hooks/useCrews';
import { useEventDetail } from '../../hooks/useEvents';
import { useVenueLocation } from '../../hooks/useVenueLocation';
import {
  BATTLE_SPORTS,
  SPORT_CAPACITY_DEFAULTS,
  type EventMode,
  type GroupRunFields,
  createEvent,
  eventNoun,
  isRunningSport,
  updateEvent,
} from '../../lib/events';
import { formatKm, formatPace, parseKm, validatePaceBand } from '../../lib/pace';
import {
  combineToLocalDate,
  defaultDate,
  formatDateLabel,
  formatTimeLabel,
  toDateString,
} from '../../lib/sessionTime';
import { formatVenueLocation } from '../../lib/venueLocation';
import type { CreateBattleScreenProps } from '../../navigation/types';
import { colors, layout, spacing, typography } from '../../theme';
import { NearbyCourtsModal } from '../bookings/NearbyCourtsModal';

/**
 * Picker CTA per sport. The picker is offered for every sport — the API
 * returns an empty catalog for sports it doesn't seed and the modal's
 * manual fallback still lets the host type a venue. The string is both
 * the visible text and the accessibilityLabel.
 */
function venuePickerCtaLabel(sport: string): string {
  switch (sport) {
    case 'tennis':
    case 'badminton':
      return 'Choose court or venue';
    case 'basketball':
    case 'soccer':
    case 'football':
      return 'Choose court, field, or venue';
    case 'running':
      return 'Choose park, route, or meeting spot';
    default:
      return 'Choose venue';
  }
}

const MODE_OPTIONS: { value: EventMode; label: string; sub: string }[] = [
  { value: 'casual', label: 'Casual Game', sub: 'Just play. No Honor risk.' },
  { value: 'ranked', label: 'Ranked Battle', sub: 'Counts toward Rank.' },
];

const DEFAULT_TIME = '18:00';
const MIN_RUN_KM = 0.5;
const MAX_RUN_KM = 100;

/** A picked place: a catalog venue or a dropped pin. */
interface Spot {
  kind: 'venue' | 'pin';
  name: string;
  detail: string | null;
  /** Text sent as location_text for a venue. */
  locationText: string;
  lat: number;
  lng: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toTimeString(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Host form (route `CreateBattle`): "Host a run" for running (crew,
 * meeting spot + pin, distance, pace band) and "Host a game" for other
 * sports (mode, venue). With `eventId` it edits an existing event via
 * PATCH /events/{id} (host only).
 */
export function CreateBattleScreen({ navigation, route }: CreateBattleScreenProps) {
  const params = route?.params;
  const editId = params?.eventId ?? null;
  const isEdit = editId !== null;

  const initialSport = params?.sport ?? (params?.crewId ? 'running' : BATTLE_SPORTS[0].value);
  const [mode, setMode] = useState<EventMode>('casual');
  const [sport, setSport] = useState<string>(initialSport);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState(DEFAULT_TIME);
  const [location, setLocation] = useState('');
  const [spot, setSpot] = useState<Spot | null>(null);
  const [isVenuePickerOpen, setIsVenuePickerOpen] = useState(false);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [capacityInput, setCapacityInput] = useState(String(SPORT_CAPACITY_DEFAULTS[initialSport] ?? 10));
  const [description, setDescription] = useState('');
  const [crewId, setCrewId] = useState<string | null>(params?.crewId ?? null);
  const [distanceInput, setDistanceInput] = useState('');
  const [paceMinInput, setPaceMinInput] = useState('');
  const [paceMaxInput, setPaceMaxInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRun = isRunningSport(sport);
  const noun = eventNoun(sport);
  const Noun = noun === 'run' ? 'Run' : 'Game';

  // Edit mode: load the event once and pre-fill.
  const { detail: editing, isLoading: loadingEdit } = useEventDetail({
    eventId: editId,
    enabled: isEdit,
  });
  const prefilled = useRef(false);
  useEffect(() => {
    if (!editing || prefilled.current) return;
    prefilled.current = true;
    const starts = new Date(editing.startsAt);
    setSport(editing.sport);
    setMode(editing.mode);
    setTitle(editing.title);
    setDate(toDateString(starts));
    setTime(toTimeString(starts));
    setCapacityInput(String(editing.capacity));
    setDescription(editing.description ?? '');
    setCrewId(editing.crewId ?? null);
    setDistanceInput(editing.distanceKm ? formatKm(editing.distanceKm) : '');
    setPaceMinInput(formatPace(editing.paceMinSecPerKm));
    setPaceMaxInput(formatPace(editing.paceMaxSecPerKm));
    if (typeof editing.meetingLat === 'number' && typeof editing.meetingLng === 'number') {
      setSpot({
        kind: 'pin',
        name: editing.locationText,
        detail: null,
        locationText: editing.locationText,
        lat: editing.meetingLat,
        lng: editing.meetingLng,
      });
    }
    setLocation(editing.locationText);
  }, [editing]);

  // Crews the host belongs to (runs only), plus the crew passed in.
  const { items: myCrews } = useCrews({ mine: true, enabled: isRun });
  const crewOptions = useMemo(() => {
    const list = myCrews.map((c) => ({ id: c.id, name: c.name }));
    if (params?.crewId && params.crewName && !list.some((c) => c.id === params.crewId)) {
      list.unshift({ id: params.crewId, name: params.crewName });
    }
    if (editing?.crewId && editing.crewName && !list.some((c) => c.id === editing.crewId)) {
      list.unshift({ id: editing.crewId, name: editing.crewName });
    }
    return list;
  }, [myCrews, params?.crewId, params?.crewName, editing?.crewId, editing?.crewName]);

  // The OS permission prompt only fires once the picker opens.
  const venueLocation = useVenueLocation({ enabled: isVenuePickerOpen });
  const pickerCtaLabel = venuePickerCtaLabel(sport);

  const onSelectSport = (s: string) => {
    setSport(s);
    setCapacityInput(String(SPORT_CAPACITY_DEFAULTS[s] ?? 10));
    // A venue is tagged to one sport: drop it rather than send a mismatch.
    setSpot(null);
  };

  const capacity = useMemo(() => {
    const n = Number.parseInt(capacityInput, 10);
    return Number.isFinite(n) ? n : 0;
  }, [capacityInput]);

  const pace = validatePaceBand(paceMinInput, paceMaxInput);
  const distanceKm = parseKm(distanceInput);
  const distanceError =
    distanceInput.trim() && (distanceKm === null || distanceKm < MIN_RUN_KM || distanceKm > MAX_RUN_KM)
      ? `Distance must be ${MIN_RUN_KM}–${MAX_RUN_KM} km.`
      : null;

  // A typed location, a venue or a dropped pin satisfies the form.
  const hasLocation = location.trim().length > 0 || spot !== null;
  const runFieldsValid = !isRun || (!pace.error && !distanceError);
  const canSubmit =
    title.trim().length > 0 &&
    hasLocation &&
    capacity >= 1 &&
    runFieldsValid &&
    !isSubmitting &&
    (!isEdit || editing !== null);

  const locationText = (() => {
    const typed = location.trim();
    if (typed) return typed; // typed text always wins
    if (spot?.kind === 'venue') return spot.locationText;
    if (spot?.kind === 'pin') return spot.name || 'Pinned meeting spot';
    return '';
  })();

  const runFields = (): GroupRunFields => {
    const out: GroupRunFields = {};
    if (crewId) out.crewId = crewId;
    if (spot) {
      out.meetingLat = spot.lat;
      out.meetingLng = spot.lng;
    }
    if (distanceKm !== null) out.distanceKm = distanceKm;
    if (pace.min !== null) out.paceMinSecPerKm = pace.min;
    if (pace.max !== null) out.paceMaxSecPerKm = pace.max;
    return out;
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const startsAt = combineToLocalDate(date, time);
    if (Number.isNaN(startsAt.getTime())) {
      Alert.alert('Check date and time', 'Pick a date and a start time.');
      return;
    }
    setIsSubmitting(true);
    try {
      const desc = description.trim() ? description.trim() : null;
      if (isEdit && editId) {
        const run = runFields();
        await updateEvent(editId, {
          title: title.trim(),
          startsAt: startsAt.toISOString(),
          locationText,
          capacity,
          description: desc,
          ...(isRun
            ? {
                // Explicit nulls clear fields the host emptied.
                crewId: run.crewId ?? null,
                meetingLat: run.meetingLat ?? null,
                meetingLng: run.meetingLng ?? null,
                distanceKm: run.distanceKm ?? null,
                paceMinSecPerKm: run.paceMinSecPerKm ?? null,
                paceMaxSecPerKm: run.paceMaxSecPerKm ?? null,
              }
            : {}),
        });
        navigation.goBack();
        return;
      }
      const detail = await createEvent({
        title: title.trim(),
        sport,
        mode: isRun ? 'casual' : mode,
        startsAt: startsAt.toISOString(),
        locationText,
        capacity,
        description: desc,
        visibility: 'public',
        ...(isRun ? runFields() : {}),
      });
      // Replace so Back goes to the list, not the empty form.
      navigation.replace('BattleDetail', { eventId: detail.id });
    } catch (err) {
      Alert.alert(
        isEdit ? `Couldn't save the ${noun}.` : `Couldn't create the ${noun}.`,
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTitle = isEdit ? `Edit ${noun}` : `Host a ${noun}`;
  const submitLabel = isEdit ? 'Save changes' : isRun ? 'Post run' : 'Create game';

  return (
    <Screen
      padded={false}
      withKeyboard
      header={<Header title={headerTitle} onBack={() => navigation.goBack()} backLabel="Back" />}
      footer={
        <Button
          label={submitLabel}
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={!canSubmit}
          onPress={() => void handleSubmit()}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sub}>
          {isRun
            ? 'Pick a meeting spot, a distance and a pace. Reliable hosts build higher Honor.'
            : 'Set the details. Reliable hosts build higher Honor.'}
        </Text>

        {!isEdit ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Sport</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {BATTLE_SPORTS.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  icon={sportIconName(s.value)}
                  selected={s.value === sport}
                  onPress={() => onSelectSport(s.value)}
                  accessibilityLabel={`Select sport ${s.label}`}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!isRun && !isEdit ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Mode</Text>
            <View style={styles.modeRow}>
              {MODE_OPTIONS.map((opt) => {
                const active = opt.value === mode;
                return (
                  <Card
                    key={opt.value}
                    onPress={() => setMode(opt.value)}
                    variant={active ? 'brand' : 'default'}
                    accessibilityLabel={`Select ${opt.label}`}
                    style={styles.modeCard}
                  >
                    <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{opt.label}</Text>
                    <Text style={styles.modeSub}>{opt.sub}</Text>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}

        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder={isRun ? 'Saturday harbour 10k' : 'Sunday hoops at Bondi'}
          maxLength={120}
          accessibilityLabel={`${Noun} title`}
        />

        {isRun && crewOptions.length > 0 ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Crew (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip label="No crew" selected={crewId === null} onPress={() => setCrewId(null)} />
              {crewOptions.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  icon="crew"
                  selected={crewId === c.id}
                  onPress={() => setCrewId(c.id)}
                  accessibilityLabel={`Crew ${c.name}`}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>When</Text>
          <Card padding="none">
            <ListRow
              icon="calendar"
              title="Date"
              value={formatDateLabel(date)}
              onPress={() => setPicker('date')}
              accessibilityLabel={`${Noun} date`}
              accessibilityHint={formatDateLabel(date)}
            />
            <ListRow
              icon="clock"
              title="Start time"
              value={formatTimeLabel(time)}
              onPress={() => setPicker('time')}
              accessibilityLabel={`${Noun} time`}
              accessibilityHint={formatTimeLabel(time)}
            />
          </Card>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{isRun ? 'Meeting spot' : 'Venue / Court'}</Text>
          {spot ? (
            <Card variant="elevated">
              <View style={styles.spotRow}>
                <View style={styles.spotText}>
                  <Text style={styles.spotName} numberOfLines={1}>
                    {spot.kind === 'pin' && !spot.detail ? spot.name || 'Dropped pin' : spot.name}
                  </Text>
                  {spot.detail ? (
                    <Text style={styles.spotDetail} numberOfLines={1}>
                      {spot.detail}
                    </Text>
                  ) : null}
                  {isRun ? <Text style={styles.spotDetail}>Pinned on the map</Text> : null}
                </View>
                <Button
                  label="Change"
                  variant="ghost"
                  size="sm"
                  onPress={() => setSpot(null)}
                  accessibilityLabel="Clear selected venue"
                />
              </View>
            </Card>
          ) : (
            <Button
              label={pickerCtaLabel}
              variant="secondary"
              leadingIcon={isRun ? 'location' : 'search'}
              fullWidth
              onPress={() => setIsVenuePickerOpen(true)}
            />
          )}
          {!spot || spot.kind === 'pin' ? (
            <TextField
              value={location}
              onChangeText={setLocation}
              placeholder={isRun ? 'e.g. Opera House forecourt steps' : 'Bondi Beach Court 2'}
              maxLength={200}
              helper={spot?.kind === 'pin' ? 'Name the spot so runners can find it.' : undefined}
              accessibilityLabel={isRun ? 'Meeting spot' : 'Game location'}
            />
          ) : null}
        </View>

        {isRun ? (
          <>
            <TextField
              label="Distance (km)"
              value={distanceInput}
              onChangeText={setDistanceInput}
              placeholder="10"
              keyboardType="decimal-pad"
              maxLength={5}
              error={distanceError}
              accessibilityLabel="Run distance in km"
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Pace band (optional)</Text>
              <View style={styles.row}>
                <TextField
                  value={paceMinInput}
                  onChangeText={setPaceMinInput}
                  placeholder="5:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  helper="Fastest, min:sec /km"
                  accessibilityLabel="Fastest pace per km"
                  containerStyle={styles.rowItem}
                />
                <TextField
                  value={paceMaxInput}
                  onChangeText={setPaceMaxInput}
                  placeholder="6:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  helper="Slowest, min:sec /km"
                  accessibilityLabel="Slowest pace per km"
                  containerStyle={styles.rowItem}
                />
              </View>
              {pace.error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {pace.error}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        <TextField
          label={isRun ? 'Spots' : 'Capacity'}
          value={capacityInput}
          onChangeText={(t) => setCapacityInput(t.replace(/[^0-9]/g, ''))}
          placeholder="10"
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={`${Noun} capacity`}
        />

        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder={isRun ? 'Route, regroup points, coffee after?' : 'Bring your own water. Friendly game.'}
          multiline
          maxLength={1000}
          accessibilityLabel={`${Noun} description`}
        />

        <Text style={styles.note}>
          {isEdit && loadingEdit ? 'Loading…' : 'Visibility: Public · Friends-only events are coming later.'}
        </Text>
      </ScrollView>

      <NearbyCourtsModal
        isOpen={isVenuePickerOpen}
        sport={sport}
        purpose={isRun ? 'meeting-spot' : 'venue'}
        lat={venueLocation.latitude}
        lng={venueLocation.longitude}
        locationStatus={venueLocation.status}
        // Hosts pick across a city, not just their block.
        enableWiderResults
        onSelect={(venue) => {
          setSpot({
            kind: 'venue',
            name: venue.name,
            detail: venue.address ?? venue.area ?? null,
            locationText: formatVenueLocation(venue),
            lat: venue.latitude,
            lng: venue.longitude,
          });
          // Typed text would override the venue on submit — clear it.
          setLocation('');
        }}
        onSelectManual={(text) => {
          // Manual entry wins: drop any structured pick, keep the text visible.
          setSpot(null);
          setLocation(text);
        }}
        onSelectPin={
          isRun
            ? (pin) =>
                setSpot({
                  kind: 'pin',
                  name: location.trim(),
                  detail: null,
                  locationText: location.trim(),
                  lat: pin.latitude,
                  lng: pin.longitude,
                })
            : undefined
        }
        onClose={() => setIsVenuePickerOpen(false)}
      />

      <BottomSheet
        modal
        open={picker === 'date'}
        onClose={() => setPicker(null)}
        snapPoints={['65%']}
        title="Pick a date"
        testID="date-sheet"
      >
        <View style={styles.sheetBody}>
          <CalendarPicker
            selected={date}
            onSelect={(d) => {
              setDate(d);
              setPicker(null);
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        modal
        open={picker === 'time'}
        onClose={() => setPicker(null)}
        snapPoints={['50%']}
        title="Start time"
        testID="time-sheet"
      >
        <View style={styles.sheetBody}>
          <TimeWheelPicker value={time} onChange={setTime} />
          <Button label="Done" fullWidth onPress={() => setPicker(null)} />
        </View>
      </BottomSheet>
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
  chipRow: {
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeCard: {
    flex: 1,
  },
  modeTitle: {
    ...typography.bodyStrong,
  },
  modeTitleActive: {
    color: colors.brand,
  },
  modeSub: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  spotText: {
    flex: 1,
  },
  spotName: {
    ...typography.bodyStrong,
  },
  spotDetail: {
    ...typography.caption,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  error: {
    ...typography.bodySmall,
    color: colors.error,
  },
  note: {
    ...typography.caption,
  },
  sheetBody: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.md,
  },
});
