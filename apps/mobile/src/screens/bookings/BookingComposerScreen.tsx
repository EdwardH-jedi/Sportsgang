import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CalendarPicker } from '../../components/CalendarPicker';
import { FormErrorBanner } from '../../components/FormErrorBanner';
import {
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  Screen,
  TextField,
} from '../../components/ui';
import { TimeWheelPicker } from '../../components/TimeWheelPicker';
import { useProposeSession } from '../../hooks/useBookings';
import { useVenueLocation } from '../../hooks/useVenueLocation';
import {
  combineToLocalDate,
  computeValidationError,
  defaultDate,
  defaultStartTime,
  formatDateLabel,
  formatTimeLabel,
  plusOneHour,
  type DateString,
  type TimeString,
} from '../../lib/sessionTime';
import { sportLabel } from '../../lib/sports';
import { formatVenueLocation } from '../../lib/venueLocation';
import { colors, layout, radii, spacing, typography } from '../../theme';
import type { BookingComposerScreenProps } from '../../navigation/types';
import type { Venue } from '@protin/shared-types';
import { NearbyCourtsModal } from './NearbyCourtsModal';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingComposerScreen({ route, navigation }: BookingComposerScreenProps) {
  const { matchId, sport } = route.params;

  // Date-stable defaults: tomorrow 09:00 → 10:00. Ensures the screen opens
  // in a valid, submittable state regardless of the device clock.
  const [date, setDate] = useState<DateString>(() => defaultDate());
  const [startTime, setStartTime] = useState<TimeString>(() => defaultStartTime());
  const [endTime, setEndTime] = useState<TimeString>(() => plusOneHour(defaultStartTime()));
  const [location, setLocation] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isVenuePickerOpen, setIsVenuePickerOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const { isSubmitting, error: submitError, propose } = useProposeSession({
    matchId,
    sport,
  });

  // Open-state for the three picker modals.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // Foreground location for the venue picker. The OS prompt only fires
  // once the user actually opens the picker — never on composer mount.
  const venueLocation = useVenueLocation({ enabled: isVenuePickerOpen });

  // Validation is derived from the picker state on every render so the
  // submit button + inline error always reflect the current selection
  // without an imperative validate-on-submit step.
  const validationError = useMemo(
    () => computeValidationError({ date, startTime, endTime }),
    [date, startTime, endTime]
  );

  const canSubmit = !validationError && !isSubmitting;

  /**
   * When the user picks a new start time, auto-shift the end time to
   * start + 1 hour if the existing end is now invalid (≤ start). This
   * keeps the form continuously submittable without forcing the user to
   * touch both pickers.
   */
  const handlePickStartTime = (next: TimeString) => {
    setStartTime(next);
    const candidateEnd = combineToLocalDate(date, endTime);
    const candidateStart = combineToLocalDate(date, next);
    if (candidateEnd <= candidateStart) {
      setEndTime(plusOneHour(next));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const startsAt = `${date}T${startTime}:00`;
    const endsAt = `${date}T${endTime}:00`;

    // Fallback chain for the persisted location string:
    //   1. typed text (manually entered always wins)
    //   2. venue-derived "Name — Address"
    //   3. undefined
    const trimmedTyped = location.trim();
    const venueDerived = selectedVenue ? formatVenueLocation(selectedVenue) : '';
    const payloadLocation = trimmedTyped || venueDerived || undefined;

    // useProposeSession maps server errors to friendly copy and releases
    // the submit lock on failure; on success it stays locked while we leave.
    const booking = await propose({
      startsAt,
      endsAt,
      location: payloadLocation,
      venueId: selectedVenue?.id,
      notes: notes.trim() || undefined,
    });
    if (booking) {
      navigation.replace('BookingDetail', { bookingId: booking.id });
    }
  };

  // The inline error shown under the time fields is the validation error
  // (live, derived) OR — if the user has tried to submit and the server
  // rejected — the friendly mapped message.
  const inlineError = validationError ?? submitError;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Header
          title="Propose a session"
          subtitle={sportLabel(sport)}
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section title="When">
            <Card padding="none">
              <ListRow
                icon="calendar"
                title="Date"
                value={formatDateLabel(date)}
                accessibilityLabel="Choose date"
                accessibilityHint={`Selected: ${formatDateLabel(date)}`}
                onPress={() => setDatePickerOpen(true)}
              />
              <View style={styles.rowDivider} />
              <ListRow
                icon="clock"
                title="Start time"
                value={formatTimeLabel(startTime)}
                accessibilityLabel="Choose start time"
                accessibilityHint={`Selected: ${formatTimeLabel(startTime)}`}
                onPress={() => setStartPickerOpen(true)}
              />
              <View style={styles.rowDivider} />
              <ListRow
                icon="clock"
                title="End time"
                value={formatTimeLabel(endTime)}
                accessibilityLabel="Choose end time"
                accessibilityHint={`Selected: ${formatTimeLabel(endTime)}`}
                onPress={() => setEndPickerOpen(true)}
              />
            </Card>
            <FormErrorBanner message={inlineError} />
            <View style={styles.hintRow}>
              <Icon name="info" size="xs" color={colors.textTertiary} />
              <Text style={styles.hint}>Times are in your local timezone.</Text>
            </View>
          </Section>

          <Section title="Court / venue (optional)">
            {selectedVenue ? (
              <Card variant="brand" padding="sm" style={styles.selectedVenueRow}>
                <Icon name="location" size="md" color={colors.brand} />
                <View style={styles.selectedVenueText}>
                  <Text style={styles.selectedVenueName} numberOfLines={1}>
                    {selectedVenue.name}
                  </Text>
                  {selectedVenue.area ? (
                    <Text style={styles.selectedVenueArea}>{selectedVenue.area}</Text>
                  ) : null}
                </View>
                <Button
                  label="Change"
                  variant="ghost"
                  size="sm"
                  onPress={() => setSelectedVenue(null)}
                  accessibilityLabel="Clear selected court"
                />
              </Card>
            ) : (
              <>
                <Card padding="none">
                  <ListRow
                    icon="map"
                    title="Choose a court or venue"
                    subtitle="Nearby courts, gyms and parks"
                    accessibilityLabel="Choose a court or venue"
                    onPress={() => setIsVenuePickerOpen(true)}
                  />
                </Card>
                <TextField
                  leadingIcon="location"
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Or type a location, e.g. Bondi gym"
                  accessibilityLabel="Location"
                  maxLength={200}
                />
              </>
            )}
          </Section>

          <Section title="Notes (optional)">
            <TextField
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything your partner should know…"
              accessibilityLabel="Notes"
              multiline
              maxLength={500}
            />
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Send proposal"
            size="lg"
            fullWidth
            leadingIcon="send"
            loading={isSubmitting}
            disabled={Boolean(validationError)}
            onPress={handleSubmit}
            accessibilityLabel="Send proposal"
          />
        </View>
      </KeyboardAvoidingView>

      <NearbyCourtsModal
        isOpen={isVenuePickerOpen}
        sport={sport}
        lat={venueLocation.latitude}
        lng={venueLocation.longitude}
        locationStatus={venueLocation.status}
        // Mirrors the polished Battle picker UX so partner-session
        // proposals get the same Nearby/Wider toggle when coords are
        // available. Off by default in the modal — opting in here.
        enableWiderResults
        onSelect={(venue) => {
          setSelectedVenue(venue);
          // Drop any freeform location text once a structured venue is chosen.
          setLocation('');
        }}
        onSelectManual={(text) => {
          // Manual fallback from inside the picker: discard any
          // structured selection (which also clears the venueId we
          // send to /bookings) and surface the typed string in the
          // outer freeform input so the user still sees it after
          // the modal closes. The submit fallback chain
          // (typed → venue-derived) then lands on the typed value.
          setSelectedVenue(null);
          setLocation(text);
        }}
        onClose={() => setIsVenuePickerOpen(false)}
      />

      <DatePickerModal
        isOpen={datePickerOpen}
        selected={date}
        onClose={() => setDatePickerOpen(false)}
        onSelect={(d) => setDate(d)}
      />

      <TimePickerModal
        isOpen={startPickerOpen}
        title="Start time"
        value={startTime}
        onClose={() => setStartPickerOpen(false)}
        onChange={handlePickStartTime}
      />

      <TimePickerModal
        isOpen={endPickerOpen}
        title="End time"
        value={endTime}
        onClose={() => setEndPickerOpen(false)}
        onChange={(t) => setEndTime(t)}
      />
    </Screen>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

function PickerModal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              {title}
            </Text>
            <Button
              label="Done"
              variant="ghost"
              size="sm"
              onPress={onClose}
              accessibilityLabel={`Close ${title.toLowerCase()} picker`}
            />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function DatePickerModal({
  isOpen,
  selected,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  selected: DateString;
  onClose: () => void;
  onSelect: (d: DateString) => void;
}) {
  return (
    <PickerModal isOpen={isOpen} title="Date" onClose={onClose}>
      <CalendarPicker
        selected={selected}
        onSelect={(d) => {
          onSelect(d);
          onClose();
        }}
      />
    </PickerModal>
  );
}

function TimePickerModal({
  isOpen,
  title,
  value,
  onClose,
  onChange,
}: {
  isOpen: boolean;
  title: string;
  value: TimeString;
  onClose: () => void;
  onChange: (t: TimeString) => void;
}) {
  // Local draft so the wheel can spin freely without flushing every micro
  // change up to the parent (which would re-render the auto-shift logic
  // on every intermediate tap). The committed value flows to the parent
  // only when the user taps Done.
  const [draft, setDraft] = useState<TimeString>(value);
  // Re-seed draft when the modal transitions to open. Don't depend on
  // `value` directly — that would clobber an in-progress spin if the
  // parent's value updated for any reason while the picker is open.
  useEffect(() => {
    if (isOpen) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDone = () => {
    onChange(draft);
    onClose();
  };

  return (
    <PickerModal isOpen={isOpen} title={title} onClose={handleDone}>
      <View style={styles.timeWheelWrap}>
        <TimeWheelPicker value={draft} onChange={setDraft} />
        <Text style={styles.wheelHint}>15-minute increments</Text>
      </View>
    </PickerModal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  form: {
    padding: layout.screenPadding,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm + spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: spacing.md,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  hint: {
    ...typography.bodySmall,
  },
  selectedVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  selectedVenueText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  selectedVenueName: {
    ...typography.bodyStrong,
  },
  selectedVenueArea: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },

  // ── Picker modal ───────────────────────────────────────────────────────────
  modalRoot: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '70%',
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  modalHandle: {
    alignSelf: 'center',
    width: spacing.xl + spacing.sm,
    height: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  modalTitle: {
    ...typography.h3,
  },
  timeWheelWrap: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  wheelHint: {
    ...typography.bodySmall,
    marginTop: spacing.sm,
  },
});
