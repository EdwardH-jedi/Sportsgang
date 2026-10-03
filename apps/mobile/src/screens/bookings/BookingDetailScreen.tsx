import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import { ErrorState } from '../../components/ui';
import { api } from '../../lib/api';
import { formatSydneyDateTime } from '../../lib/sydneyTime';
import { useAuthStore } from '../../stores/auth';
import { sportLabel } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { BookingDetailScreenProps } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingVenue {
  id: string;
  name: string;
  area?: string;
  address?: string;
  bookingUrl?: string;
  isBookable: boolean;
}

interface BookingDetail {
  id: string;
  matchId: string;
  proposerId: string;
  partnerId: string;
  sport: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  partner: {
    userId: string;
    displayName: string;
    suburb?: string;
  };
  venue?: BookingVenue | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    proposed: 'Awaiting confirmation',
    confirmed: 'Confirmed',
    declined: 'Declined',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No-show',
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  if (status === 'confirmed' || status === 'completed') return colors.success;
  if (status === 'declined' || status === 'cancelled' || status === 'no_show')
    return colors.error;
  return colors.textSecondary;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingDetailScreen({ route, navigation }: BookingDetailScreenProps) {
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  // Everything shown or acted on belongs to one binding: this account and
  // this route's booking (review R3). Results are tagged with the binding
  // they were requested for and only render while it is still current, so a
  // late response for another booking or account can never show — or be
  // acted on — after the route or account changed.
  const binding = user?.id ? `${user.id}|${bookingId}` : null;
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const generation = useRef(0);
  const actingOn = useRef<string | null>(null);
  const mounted = useRef(true);
  const [loaded, setLoaded] = useState<{ binding: string; booking: BookingDetail } | null>(null);
  const [failure, setFailure] = useState<{ binding: string; message: string } | null>(null);
  const [actingBinding, setActingBinding] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const booking = loaded && loaded.binding === binding ? loaded.booking : null;
  const error = failure && failure.binding === binding ? failure.message : null;
  const isLoading = !booking && !error;
  const isActing = actingBinding !== null && actingBinding === binding;

  const fetchBooking = useCallback(async () => {
    if (!binding) return;
    const gen = ++generation.current;
    const current = () => mounted.current && gen === generation.current && bindingRef.current === binding;
    setFailure(null);
    try {
      const data = await api.get<BookingDetail>(`/bookings/${bookingId}`);
      if (!current()) return;
      if (data?.id !== bookingId) {
        setFailure({ binding, message: 'Booking not found.' });
        return;
      }
      setLoaded({ binding, booking: data });
    } catch (err) {
      if (!current()) return;
      setFailure({ binding, message: err instanceof Error ? err.message : 'Failed to load booking.' });
    }
  }, [binding, bookingId]);

  useEffect(() => {
    void fetchBooking();
  }, [fetchBooking]);

  const performTransition = useCallback(
    async (action: string) => {
      // The booking being shown is the one acted on, for this binding only
      // (a confirmation dialog opened for an earlier binding is dropped).
      if (!booking || !binding || bindingRef.current !== binding || actingOn.current === binding) return;
      const target = booking.id;
      actingOn.current = binding;
      setActingBinding(binding);
      const current = () => mounted.current && bindingRef.current === binding;
      try {
        const updated = await api.post<BookingDetail>(`/bookings/${target}/${action}`, {});
        if (!current() || updated?.id !== target) return;
        generation.current += 1; // an older in-flight fetch must not undo this
        setLoaded({ binding, booking: updated });
      } catch (err) {
        if (!current()) return;
        Alert.alert('Error', err instanceof Error ? err.message : 'Action failed.');
      } finally {
        if (actingOn.current === binding) actingOn.current = null;
        if (mounted.current) setActingBinding((b) => (b === binding ? null : b));
      }
    },
    [booking, binding]
  );

  // No-show is the only transition the FSM lets either party trigger, so we
  // apply a small symmetric honor penalty to the caller as an anti-abuse
  // mitigation. Surfacing that in a confirmation prevents users from being
  // surprised when their honor drops after marking someone else.
  const handleNoShow = useCallback(() => {
    Alert.alert(
      'Record a no-show?',
      'Only do this for genuine no-shows. Your honor takes a small dip too — this keeps the system fair if both sides are being honest.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record no-show',
          style: 'destructive',
          onPress: () => performTransition('no-show'),
        },
      ]
    );
  }, [performTransition]);

  if (isLoading) {
    return (
      <Screen padded>
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const header = (
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
        <Text style={styles.headerTitle}>Session</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (error || !booking) {
    // Keep a way back and a retry: offline, this used to be a dead end.
    return (
      <Screen padded={false}>
        {header}
        <View style={styles.errorBody}>
          {error ? (
            <ErrorState title="Could not load this session" body={error} onAction={() => void fetchBooking()} />
          ) : (
            <Text style={styles.errorText}>Booking not found.</Text>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Status pill */}
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { borderColor: statusColor(booking.status) }]}>
            <Text style={[styles.statusText, { color: statusColor(booking.status) }]}>
              {statusLabel(booking.status)}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <DetailRow label="With" value={booking.partner.displayName} />
          <DetailRow label="Sport" value={sportLabel(booking.sport)} />
          <DetailRow label="Starts" value={formatSydneyDateTime(booking.startsAt)} />
          <DetailRow label="Ends" value={formatSydneyDateTime(booking.endsAt)} />
          <Text style={styles.timezoneNote}>Times are Sydney time</Text>
          {booking.venue ? (
            <>
              <DetailRow label="Court" value={booking.venue.name} />
              {booking.venue.area || booking.venue.address ? (
                <DetailRow
                  label="Where"
                  value={booking.venue.address ?? booking.venue.area ?? ''}
                />
              ) : null}
              {booking.venue.isBookable && booking.venue.bookingUrl ? (
                <Pressable
                  onPress={() => booking.venue?.bookingUrl && Linking.openURL(booking.venue.bookingUrl)}
                  accessibilityRole="link"
                  accessibilityLabel="Open court booking"
                  style={({ pressed }) => [styles.bookingLink, pressed && styles.pressed]}
                >
                  <Text style={styles.bookingLinkText}>Open court booking</Text>
                </Pressable>
              ) : null}
            </>
          ) : booking.location ? (
            <DetailRow label="Location" value={booking.location} />
          ) : null}
          {booking.notes ? (
            <DetailRow label="Notes" value={booking.notes} />
          ) : null}
        </View>

        {/* Action buttons — conditionally shown based on status */}
        {isActing ? (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.actions}>
            {booking.status === 'proposed' ? (
              (() => {
                const isProposer = booking.proposerId === user?.id;
                return isProposer ? (
                  <ActionButton
                    label="Cancel"
                    variant="ghost"
                    onPress={() => performTransition('cancel')}
                  />
                ) : (
                  <>
                    <ActionButton
                      label="Confirm"
                      variant="primary"
                      onPress={() => performTransition('confirm')}
                    />
                    <ActionButton
                      label="Decline"
                      variant="ghost"
                      onPress={() => performTransition('decline')}
                    />
                    <ActionButton
                      label="Cancel"
                      variant="ghost"
                      onPress={() => performTransition('cancel')}
                    />
                  </>
                );
              })()
            ) : booking.status === 'confirmed' ? (
              <>
                <ActionButton
                  label="Mark completed"
                  variant="primary"
                  onPress={() => performTransition('complete')}
                />
                <ActionButton
                  label="Record no-show"
                  variant="ghost"
                  onPress={handleNoShow}
                />
                <ActionButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => performTransition('cancel')}
                />
              </>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  variant,
  onPress,
}: {
  label: string;
  variant: 'primary' | 'ghost';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonGhost,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'primary'
            ? styles.actionButtonTextPrimary
            : styles.actionButtonTextGhost,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  scroll: {
    paddingBottom: spacing.xxxl,
  },
  statusRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusText: {
    ...typography.label,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  timezoneNote: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  detailLabel: {
    ...typography.label,
    color: colors.textTertiary,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  bookingLink: {
    paddingVertical: spacing.sm,
    alignItems: 'flex-end',
  },
  bookingLinkText: {
    ...typography.button,
    color: colors.brand,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  actionButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.brand,
  },
  actionButtonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    ...typography.button,
  },
  actionButtonTextPrimary: {
    color: colors.textInverse,
  },
  actionButtonTextGhost: {
    color: colors.textPrimary,
  },
  errorBody: {
    padding: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  pressed: { opacity: 0.65 },
});
