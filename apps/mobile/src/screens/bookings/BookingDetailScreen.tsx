import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  Skeleton,
  SkeletonText,
  StatBlock,
  sportIconName,
  type BadgeTone,
  type IconName,
} from '../../components/ui';
import { useBooking } from '../../hooks/useBookings';
import { formatClockParts, formatWhen } from '../../lib/format';
import type { BookingAction } from '../../lib/sessions';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, radii, spacing, touchTarget, typography } from '../../theme';
import type { BookingDetailScreenProps } from '../../navigation/types';

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

function statusTone(status: string): BadgeTone {
  if (status === 'confirmed' || status === 'completed') return 'success';
  if (status === 'declined' || status === 'cancelled' || status === 'no_show') return 'error';
  if (status === 'proposed') return 'warning';
  return 'neutral';
}


/** Whole minutes between start and end (never negative). */
function durationMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : 0;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function BookingDetailScreen({ route, navigation }: BookingDetailScreenProps) {
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  const { booking, isLoading, error, transition } = useBooking(bookingId);
  const [isActing, setIsActing] = useState(false);

  const performTransition = useCallback(
    async (action: BookingAction) => {
      setIsActing(true);
      try {
        await transition(action);
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Action failed.');
      } finally {
        setIsActing(false);
      }
    },
    [transition]
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

  const header = (
    <Header
      title="Session"
      onBack={() => navigation.goBack()}
      backLabel="Back"
      style={styles.header}
    />
  );

  if (isLoading) {
    return (
      <Screen padded={false} header={header}>
        <View
          style={styles.skeleton}
          accessible
          accessibilityLabel="Loading session"
          accessibilityState={{ busy: true }}
          testID="booking-loading"
        >
          <Skeleton width="35%" height={spacing.lg} radius={radii.pill} />
          <Skeleton height={spacing.xxxl + spacing.xl} radius={radii.lg} />
          <SkeletonText lines={5} lineHeight={spacing.md} />
        </View>
      </Screen>
    );
  }

  if (error || !booking) {
    return (
      <Screen padded={false} header={header}>
        <EmptyState icon="alert" title="Session unavailable" message={error ?? 'Booking not found.'} />
      </Screen>
    );
  }

  const minutes = durationMinutes(booking.startsAt, booking.endsAt);
  const startClock = formatClockParts(booking.startsAt);

  return (
    <Screen padded={false} header={header}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary: status + the numbers that matter at a glance */}
        <Card variant="elevated" padding="lg" style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.sportIcon}>
              <Icon name={sportIconName(booking.sport)} size="lg" color={colors.brand} />
            </View>
            <Badge label={statusLabel(booking.status)} tone={statusTone(booking.status)} />
          </View>
          <View style={styles.stats}>
            <StatBlock
              value={startClock?.time ?? '–'}
              unit={startClock?.meridiem}
              label="Start"
              icon="clock"
              size="lg"
              accent
            />
            <StatBlock value={minutes} unit="min" label="Duration" icon="timer" size="lg" />
          </View>
        </Card>

        {/* Details */}
        <Card padding="none">
          <DetailRow icon="profile" label="With" value={booking.partner.displayName} />
          <DetailRow icon={sportIconName(booking.sport)} label="Sport" value={sportLabel(booking.sport)} />
          <DetailRow icon="calendar" label="Starts" value={formatWhen(booking.startsAt, { relative: false })} />
          <DetailRow icon="finish" label="Ends" value={formatWhen(booking.endsAt, { relative: false })} />
          {booking.venue ? (
            <>
              <DetailRow icon="location" label="Court" value={booking.venue.name} />
              {booking.venue.area || booking.venue.address ? (
                <DetailRow
                  icon="map"
                  label="Where"
                  value={booking.venue.address ?? booking.venue.area ?? ''}
                />
              ) : null}
            </>
          ) : booking.location ? (
            <DetailRow icon="location" label="Location" value={booking.location} />
          ) : null}
          {booking.notes ? (
            <DetailRow icon="edit" label="Notes" value={booking.notes} last />
          ) : null}
        </Card>

        {booking.venue?.isBookable && booking.venue.bookingUrl ? (
          <Button
            label="Open court booking"
            variant="secondary"
            leadingIcon="external-link"
            fullWidth
            onPress={() => booking.venue?.bookingUrl && Linking.openURL(booking.venue.bookingUrl)}
            accessibilityLabel="Open court booking"
          />
        ) : null}

        {/* Action buttons — conditionally shown based on status */}
        {isActing ? (
          <View style={styles.acting} accessibilityLabel="Updating session">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <View style={styles.actions}>
            {booking.status === 'proposed' ? (
              (() => {
                const isProposer = booking.proposerId === user?.id;
                return isProposer ? (
                  <Button
                    label="Cancel"
                    variant="destructive"
                    fullWidth
                    onPress={() => performTransition('cancel')}
                  />
                ) : (
                  <>
                    <Button
                      label="Confirm"
                      size="lg"
                      fullWidth
                      leadingIcon="check"
                      onPress={() => performTransition('confirm')}
                    />
                    <Button
                      label="Decline"
                      variant="secondary"
                      fullWidth
                      onPress={() => performTransition('decline')}
                    />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      fullWidth
                      onPress={() => performTransition('cancel')}
                    />
                  </>
                );
              })()
            ) : booking.status === 'confirmed' ? (
              <>
                <Button
                  label="Mark completed"
                  size="lg"
                  fullWidth
                  leadingIcon="check-circle"
                  onPress={() => performTransition('complete')}
                />
                <Button
                  label="Record no-show"
                  variant="secondary"
                  fullWidth
                  leadingIcon="flag"
                  onPress={handleNoShow}
                />
                <Button
                  label="Cancel"
                  variant="destructive"
                  fullWidth
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

function DetailRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      style={[styles.detailRow, !last && styles.detailDivider]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Icon name={icon} size="sm" color={colors.textTertiary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  skeleton: {
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  summary: {
    gap: spacing.lg,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sportIcon: {
    width: touchTarget + spacing.xs,
    height: touchTarget + spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  detailDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  detailLabel: {
    ...typography.label,
    color: colors.textTertiary,
    flex: 1,
    paddingTop: spacing.xs / 2,
  },
  detailValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  acting: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  actions: {
    gap: spacing.sm,
  },
});
