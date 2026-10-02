/**
 * Group session detail (runs, golf rounds, and legacy events).
 *
 * Shows host, Sydney time, meeting point / course, the host's stated plan
 * (informational chips), total capacity including the host, and who has
 * joined. Join / leave for participants; cancel / complete for the host.
 * Server rejections (full, cancelled, completed) are shown verbatim and the
 * detail is re-fetched so the screen reflects the new state.
 *
 * There is deliberately no chat button: chat is 1:1 per match and there is
 * no group chat for sessions.
 */

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../components/Screen';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  InfoChip,
  InlineNotice,
  LoadingState,
  ScreenHeader,
  SectionTitle,
} from '../../components/ui';
import { useEventDetail } from '../../hooks/useEvents';
import { cancelEvent, capacityText, completeEvent, eventHasStarted, sessionChips, sessionNoun } from '../../lib/events';
import { formatSydneyDateTime } from '../../lib/sydneyTime';
import { useAuthStore } from '../../stores/auth';
import { sportLabel } from '../../stores/profile';
import { colors, spacing, typography } from '../../theme';
import type { SessionDetailScreenProps } from '../../navigation/types';

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function SessionDetailScreen({ navigation, route }: SessionDetailScreenProps) {
  const { eventId } = route.params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { detail, isLoading, error, join, leave, refresh } = useEventDetail({ eventId });
  const [acting, setActing] = useState<null | 'join' | 'leave' | 'cancel' | 'complete'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(kind: NonNullable<typeof acting>, action: () => Promise<unknown>, fallback: string) {
    setActing(kind);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      // e.g. "Event is full", "Cannot join a cancelled event" — keep the
      // server's explanation and show the current state behind it.
      setActionError(messageOf(err, fallback));
      await refresh();
    } finally {
      setActing(null);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancel this session?', 'Everyone who joined will see it as cancelled.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: () =>
          void run(
            'cancel',
            async () => {
              await cancelEvent(eventId);
              await refresh();
            },
            'Could not cancel the session.'
          ),
      },
    ]);
  }

  const back = <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} style={styles.backButton} />;

  if (isLoading && !detail) {
    return (
      <Screen>
        {back}
        <LoadingState label="Loading session…" />
      </Screen>
    );
  }
  if (!detail) {
    return (
      <Screen>
        {back}
        {error ? (
          <ErrorState title="Could not load this session" body={error} onAction={() => void refresh()} />
        ) : (
          <EmptyState title="Session not found" body="It may have been removed." />
        )}
      </Screen>
    );
  }

  const isHost = currentUserId !== null && detail.hostUserId === currentUserId;
  const started = eventHasStarted(detail.startsAt);
  const terminal = detail.status === 'cancelled' || detail.status === 'completed';
  const chips = sessionChips(detail);
  const noun = sessionNoun(detail.sport);
  const kindLabel =
    detail.sport === 'running' ? 'Group run' : detail.sport === 'golf' ? 'Golf round' : sportLabel(detail.sport);
  const canJoin = !isHost && !detail.hasJoined && !terminal && detail.spotsLeft > 0 && detail.status !== 'full';

  return (
    <Screen scroll>
      {back}
      <ScreenHeader eyebrow={kindLabel} title={detail.title} />

      {detail.status === 'cancelled' ? <InlineNotice text={`This ${noun} was cancelled by the host.`} /> : null}
      {detail.status === 'completed' ? <InlineNotice tone="info" text={`This ${noun} is complete.`} /> : null}
      {actionError ? <InlineNotice text={actionError} /> : null}

      <Card style={styles.card}>
        <Text style={styles.when}>{formatSydneyDateTime(detail.startsAt)}</Text>
        <Text style={styles.subtle}>Sydney time</Text>
        <Text style={styles.location}>{detail.locationText}</Text>
        {chips.length > 0 ? (
          <View style={styles.chips}>
            <ChipRow>
              {chips.map((c) => (
                <InfoChip key={c} label={c} />
              ))}
            </ChipRow>
          </View>
        ) : null}
        <Text style={styles.capacity} testID="session-capacity">
          {capacityText(detail)}
        </Text>
        <Text style={styles.subtle}>Hosted by {isHost ? 'you' : detail.host?.displayName ?? 'the host'}</Text>
      </Card>

      {detail.golfDetails ? (
        <Text style={styles.note}>
          {detail.golfDetails.teeTimeStatus === 'secured'
            ? 'The host says the tee time is secured. '
            : 'The host is still planning to book the tee time. '}
          Joining here doesn&apos;t book the course or take payment — sort green fees with the host.
        </Text>
      ) : null}
      {detail.runDetails || detail.golfDetails ? (
        <Text style={styles.note}>
          Pace, level and beginner notes are the host&apos;s guide. Anyone can join while spots remain.
        </Text>
      ) : null}

      {detail.description ? (
        <View style={styles.section}>
          <SectionTitle>Notes from the host</SectionTitle>
          <Text style={styles.body}>{detail.description}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle hint={`${detail.participantCount} of ${detail.capacity}, including the host`}>
          Who&apos;s going
        </SectionTitle>
        {detail.participants.map((p) => (
          <View key={p.userId} style={styles.participant}>
            <Text style={styles.participantName}>{p.userId === currentUserId ? 'You' : p.displayName}</Text>
            {p.userId === detail.hostUserId ? <InfoChip label="Host" tone="brand" /> : null}
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {canJoin ? (
          <Button
            label={`Join this ${noun}`}
            onPress={() => void run('join', join, `Could not join this ${noun}.`)}
            loading={acting === 'join'}
            testID="session-join"
          />
        ) : null}
        {!isHost && !terminal && !detail.hasJoined && !canJoin ? (
          <Text style={styles.fullText}>This {noun} is full.</Text>
        ) : null}
        {!isHost && detail.hasJoined && !terminal ? (
          <View>
            <Text style={styles.joinedText}>You&apos;re going.</Text>
            <Button
              label={`Leave this ${noun}`}
              variant="secondary"
              onPress={() => void run('leave', leave, `Could not leave this ${noun}.`)}
              loading={acting === 'leave'}
              testID="session-leave"
            />
          </View>
        ) : null}
        {isHost && started && detail.status !== 'cancelled' && detail.status !== 'completed' ? (
          <Button
            label="Mark as completed"
            variant="secondary"
            onPress={() =>
              void run(
                'complete',
                async () => {
                  await completeEvent(eventId);
                  await refresh();
                },
                'Could not complete the session.'
              )
            }
            loading={acting === 'complete'}
            style={styles.actionGap}
          />
        ) : null}
        {(isHost || detail.hasJoined) && started && detail.status !== 'cancelled' ? (
          <Button
            label="Attendance"
            variant="ghost"
            onPress={() => navigation.navigate('AttendanceCheck', { eventId })}
            style={styles.actionGap}
          />
        ) : null}
        {isHost && !terminal ? (
          <Button
            label={`Cancel ${noun}`}
            variant="danger"
            onPress={confirmCancel}
            loading={acting === 'cancel'}
            style={styles.actionGap}
            testID="session-cancel"
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: spacing.sm },
  card: { marginTop: spacing.sm },
  when: { ...typography.h3 },
  subtle: { ...typography.bodySmall, marginTop: 2 },
  location: { ...typography.bodyLarge, marginTop: spacing.sm },
  chips: { marginTop: spacing.sm },
  capacity: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.md },
  note: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  body: { ...typography.body },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  participantName: { fontSize: 16, color: colors.textPrimary },
  actions: { marginTop: spacing.xl, marginBottom: spacing.lg },
  actionGap: { marginTop: spacing.sm },
  joinedText: { ...typography.body, color: colors.success, fontWeight: '600', marginBottom: spacing.sm },
  fullText: { ...typography.body, textAlign: 'center' },
});
