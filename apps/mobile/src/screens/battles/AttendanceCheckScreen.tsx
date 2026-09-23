import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Avatar,
  Badge,
  type BadgeTone,
  Card,
  Chip,
  EmptyState,
  Header,
  Icon,
  Screen,
} from '../../components/ui';
import { useEventAttendance, useEventDetail } from '../../hooks/useEvents';
import {
  type AttendanceEntry,
  type AttendanceStatus,
  attendanceStatusLabel,
  eventHasStarted,
  eventNoun,
  formatEventWhen,
  sportLabelForBattle,
} from '../../lib/events';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, spacing, typography } from '../../theme';
import type { AttendanceCheckScreenProps } from '../../navigation/types';

/**
 * Host-only attendance check.
 *
 * Routed to from BattleDetail's "Confirm attendance" CTA. Non-hosts
 * who land here see a friendly inaccessible state — server already
 * returns a self-only payload for them, so the UI hides the host
 * controls in that case.
 */

type Choice = AttendanceStatus | 'not_sure';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'attended', label: 'Attended' },
  { value: 'no_show', label: 'No-show' },
  { value: 'excused', label: 'Excused' },
  { value: 'not_sure', label: 'Not sure' },
];

export function AttendanceCheckScreen({
  navigation,
  route,
}: AttendanceCheckScreenProps) {
  const { eventId } = route.params;
  const { detail } = useEventDetail({ eventId });
  const { data, isLoading, error, updateAsHost, refresh } = useEventAttendance({
    eventId,
  });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [savingFor, setSavingFor] = useState<string | null>(null);

  // Host gate. Two signals must agree:
  //   1. The viewer is the host of the loaded event (detail.hostUserId).
  //   2. The attendance response was returned in the host-scope shape
  //      (data.hostUserId === currentUserId).
  // For non-hosts the server already returns a self-only payload, but
  // we explicitly suppress all host marking controls regardless.
  const viewerIsHost =
    currentUserId !== null &&
    ((detail !== null && detail.hostUserId === currentUserId) ||
      (data !== null && data.hostUserId === currentUserId));

  // Lifecycle gates mirror the backend service:
  //   - cancelled events freeze attendance entirely
  //   - future events show "opens after the game starts" copy
  //   - completed events stay open for corrections regardless of clock
  const eventStatus = detail?.status ?? null;
  const isCancelled = eventStatus === 'cancelled';
  const isCompleted = eventStatus === 'completed';
  const hasStarted =
    detail !== null ? eventHasStarted(detail.startsAt) : true;
  const attendanceOpen = !isCancelled && (isCompleted || hasStarted);

  const onPick = useCallback(
    async (participantUserId: string, choice: Choice) => {
      if (choice === 'not_sure') {
        // 'Not sure' is a UI-only no-op for this stream — no mark
        // recorded, so the row stays as whatever it was.
        return;
      }
      if (savingFor) return;
      setSavingFor(participantUserId);
      try {
        await updateAsHost({
          participantUserId,
          attendanceStatus: choice,
        });
      } catch (err) {
        Alert.alert(
          'Could not save attendance',
          err instanceof Error ? err.message : 'Please try again.'
        );
      } finally {
        setSavingFor(null);
      }
    },
    [savingFor, updateAsHost]
  );

  const activeItems = useMemo(
    () => (data?.items ?? []).filter((it) => it.participantStatus === 'joined'),
    [data]
  );

  const noun = eventNoun(detail?.sport);

  let content: React.ReactNode;
  if (isLoading && !data) {
    content = (
      <View style={styles.centred}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  } else if (error) {
    content = (
      <EmptyState
        icon="alert"
        title="Couldn't load attendance"
        message={error}
        action={{
          label: 'Try again',
          icon: 'refresh',
          onPress: () => void refresh(),
          accessibilityLabel: 'Retry loading attendance',
        }}
      />
    );
  } else if (!viewerIsHost) {
    content = (
      <EmptyState
        icon="lock"
        title="Host only"
        message="Only the event host can mark attendance from here."
        accessibilityLabel="Attendance check is host only"
      />
    );
  } else if (isCancelled) {
    content = (
      <EmptyState
        icon="close"
        title="Event cancelled"
        message={`Attendance is no longer available for cancelled ${noun}s.`}
        accessibilityLabel="Attendance check is cancelled"
      />
    );
  } else if (!attendanceOpen) {
    content = (
      <EmptyState
        icon="clock"
        title="Not yet"
        message={`Attendance opens after the ${noun} starts.`}
        accessibilityLabel={`Attendance opens after the ${noun} starts`}
      />
    );
  } else if (activeItems.length === 0) {
    content = <EmptyState icon="crew" title="No active participants yet." />;
  } else {
    content = (
      <View style={styles.list}>
        {activeItems.map((p) => (
          <ParticipantRow
            key={p.participantUserId}
            participant={p}
            isSaving={savingFor === p.participantUserId}
            onPick={(c) => void onPick(p.participantUserId, c)}
          />
        ))}
      </View>
    );
  }

  return (
    <Screen
      padded={false}
      header={<Header title="Confirm attendance" onBack={() => navigation.goBack()} backLabel="Back" />}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {detail ? (
          <View style={styles.summary}>
            <Text style={styles.summarySport}>{sportLabelForBattle(detail.sport)}</Text>
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {detail.title}
            </Text>
            <Text style={styles.summaryMeta}>
              {formatEventWhen(detail.startsAt)} · {detail.locationText}
            </Text>
          </View>
        ) : null}

        {viewerIsHost && attendanceOpen ? (
          <Card variant="outline" padding="md">
            <View style={styles.warningRow}>
              <Icon name="warning" size="sm" color={colors.warning} />
              <Text style={styles.warningText}>
                Only mark no-show when the player clearly did not attend.
              </Text>
            </View>
          </Card>
        ) : null}

        {content}
      </ScrollView>
    </Screen>
  );
}

interface ParticipantRowProps {
  participant: AttendanceEntry;
  isSaving: boolean;
  onPick: (choice: Choice) => void;
}

const STATUS_TONE: Record<AttendanceStatus, BadgeTone> = {
  pending: 'neutral',
  attended: 'success',
  no_show: 'error',
  excused: 'warning',
};

function ParticipantRow({ participant, isSaving, onPick }: ParticipantRowProps) {
  const status = participant.attendanceStatus as AttendanceStatus;
  return (
    <Card testID={`attendance-row-${participant.participantUserId}`}>
      <View style={styles.rowHeader} accessibilityLabel={`Attendance row for ${participant.displayName}`}>
        <Avatar name={participant.displayName} size="sm" />
        <Text style={styles.rowName} numberOfLines={1}>
          {participant.displayName}
        </Text>
        <Badge label={attendanceStatusLabel(status)} tone={STATUS_TONE[status] ?? 'neutral'} size="sm" />
      </View>
      <View style={styles.choices}>
        {CHOICES.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            size="sm"
            selected={c.value === participant.attendanceStatus}
            disabled={isSaving}
            onPress={() => onPick(c.value)}
            accessibilityLabel={`Mark ${participant.displayName} as ${c.label}`}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centred: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  summary: {
    gap: spacing.xs,
  },
  summarySport: {
    ...typography.label,
    color: colors.brand,
  },
  summaryTitle: {
    ...typography.h1,
  },
  summaryMeta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  list: {
    gap: spacing.md,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    ...typography.bodyStrong,
    flex: 1,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
