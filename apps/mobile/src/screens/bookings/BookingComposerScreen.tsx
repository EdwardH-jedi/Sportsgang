import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CalendarPicker } from '../../components/CalendarPicker';
import { Screen } from '../../components/Screen';
import { TimeWheelPicker } from '../../components/TimeWheelPicker';
import { useVenueLocation } from '../../hooks/useVenueLocation';
import { api } from '../../lib/api';
import {
  defaultStartTime,
  defaultSydneyDate,
  formatDateLabel,
  formatTimeLabel,
  mapBackendError,
  plusOneHour,
  sydneyProposalTimes,
  type DateString,
  type TimeString,
} from '../../lib/sessionTime';
import { sydneyDateString } from '../../lib/sydneyTime';
import { formatVenueLocation } from '../../lib/venueLocation';
import { colors, radii, spacing, typography } from '../../theme';
import type { BookingComposerScreenProps } from '../../navigation/types';
import type { Venue } from '@protin/shared-types';
import { NearbyCourtsModal } from './NearbyCourtsModal';

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingComposerScreen({ route, navigation }: BookingComposerScreenProps) {
  const { matchId, sport } = route.params;

  // Date-stable defaults: tomorrow 09:00 → 10:00, Sydney time. Ensures the
  // screen opens in a valid, submittable state regardless of the device
  // clock or timezone.
  const [date, setDate] = useState<DateString>(() => defaultSydneyDate());
  const [startTime, setStartTime] = useState<TimeString>(() => defaultStartTime());
  const [endTime, setEndTime] = useState<TimeString>(() => plusOneHour(defaultStartTime()));
  const [location, setLocation] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isVenuePickerOpen, setIsVenuePickerOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Open-state for the three picker modals.
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  // Foreground location for the venue picker. The OS prompt only fires
  // once the user actually opens the picker — never on composer mount.
  const venueLocation = useVenueLocation({ enabled: isVenuePickerOpen });

  // The pickers hold Sydney wall time (CONTRACTS.md §7). Validation and the
  // payload come from the same conversion to UTC instants, re-derived on
  // every selection so the submit button and inline error always agree.
  const times = useMemo(
    () => sydneyProposalTimes({ date, startTime, endTime }),
    [date, startTime, endTime]
  );
  const validationError = times.ok ? null : times.error;

  const canSubmit = !validationError && !isSubmitting;

  /**
   * When the user picks a new start time, auto-shift the end time to
   * start + 1 hour if the existing end is now invalid (≤ start). This
   * keeps the form continuously submittable without forcing the user to
   * touch both pickers.
   */
  const handlePickStartTime = (next: TimeString) => {
    setStartTime(next);
    // Same-day "HH:MM" strings order like the times they name.
    if (endTime <= next) {
      setEndTime(plusOneHour(next));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !times.ok) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // Aware UTC instants of the chosen Sydney wall times.
      const { startsAt, endsAt } = times;

      // Fallback chain for the persisted location string:
      //   1. typed text (manually entered always wins)
      //   2. venue-derived "Name — Address"
      //   3. undefined
      const trimmedTyped = location.trim();
      const venueDerived = selectedVenue ? formatVenueLocation(selectedVenue) : '';
      const payloadLocation = trimmedTyped || venueDerived || undefined;

      const booking = await api.post<{ id: string }>('/bookings', {
        matchId,
        sport,
        startsAt,
        endsAt,
        location: payloadLocation,
        venueId: selectedVenue?.id,
        notes: notes.trim() || undefined,
      });

      navigation.replace('BookingDetail', { bookingId: booking.id });
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setSubmitError(mapBackendError(raw));
      setIsSubmitting(false);
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
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backText}>{'←'}</Text>
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Propose a session</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Field label="Date">
            <SelectorButton
              label={formatDateLabel(date)}
              accessibilityLabel="Choose date"
              onPress={() => setDatePickerOpen(true)}
            />
          </Field>

          <Field label="Start time">
            <SelectorButton
              label={formatTimeLabel(startTime)}
              accessibilityLabel="Choose start time"
              onPress={() => setStartPickerOpen(true)}
            />
          </Field>

          <Field label="End time">
            <SelectorButton
              label={formatTimeLabel(endTime)}
              accessibilityLabel="Choose end time"
              onPress={() => setEndPickerOpen(true)}
            />
          </Field>

          <Text style={styles.timezoneHint}>Times are Sydney time (AEST/AEDT).</Text>

          {inlineError ? (
            <Text style={styles.errorText} accessibilityLiveRegion="polite">
              {inlineError}
            </Text>
          ) : null}

          <Field label="Court / venue (optional)">
            {selectedVenue ? (
              <View style={styles.selectedVenueRow}>
                <View style={styles.selectedVenueText}>
                  <Text style={styles.selectedVenueName} numberOfLines={1}>
                    {selectedVenue.name}
                  </Text>
                  {selectedVenue.area ? (
                    <Text style={styles.selectedVenueArea}>{selectedVenue.area}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => setSelectedVenue(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Clear selected court"
                  style={({ pressed }) => [styles.clearVenue, pressed && styles.pressed]}
                >
                  <Text style={styles.clearVenueText}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setIsVenuePickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a court or venue"
                  style={({ pressed }) => [styles.findCourtButton, pressed && styles.pressed]}
                >
                  <Text style={styles.findCourtText}>Choose a court or venue</Text>
                </Pressable>
                <TextInput
                  style={[styles.input, styles.locationFallback]}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Or type a location, e.g. Bondi gym"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={200}
                />
              </>
            )}
          </Field>

          <Field label="Notes (optional)">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything your partner should know…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
            />
          </Field>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
              pressed && canSubmit && styles.pressed,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Send proposal"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.submitButtonText}>Send proposal</Text>
            )}
          </Pressable>
        </ScrollView>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SelectorButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.selector, pressed && styles.pressed]}
    >
      <Text style={styles.selectorText}>{label}</Text>
      <Text style={styles.selectorChevron}>{'›'}</Text>
    </Pressable>
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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()} picker`}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <Text style={styles.modalCloseText}>Done</Text>
            </Pressable>
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
        today={sydneyDateString()}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  form: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    minHeight: 48,
  },
  selectorText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  selectorChevron: {
    fontSize: 22,
    color: colors.textTertiary,
  },
  findCourtButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
  },
  findCourtText: {
    ...typography.button,
    color: colors.brand,
  },
  locationFallback: {
    marginTop: spacing.sm,
  },
  selectedVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.brandSoft,
  },
  selectedVenueText: {
    flex: 1,
    gap: 2,
  },
  selectedVenueName: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  selectedVenueArea: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  clearVenue: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  clearVenueText: {
    ...typography.button,
    color: colors.brand,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  timezoneHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  submitButton: {
    backgroundColor: colors.brand,
    // Pill matches the dominant primary-CTA shape across the app
    // (LoginScreen, RegisterScreen, AuthEntry, CreateBattle, BattleDetail).
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: colors.border,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  pressed: { opacity: 0.65 },

  // ── Picker modal ───────────────────────────────────────────────────────────
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    maxHeight: '70%',
    paddingTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalClose: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modalCloseText: {
    ...typography.button,
    color: colors.brand,
  },
  timeWheelWrap: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  wheelHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});
