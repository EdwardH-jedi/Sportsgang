import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';

import { HonorBadge } from '../../components/HonorBadge';
import { DARK_MAP_STYLE, PIN_COLORS } from '../../components/VenueMapView';
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  StatBlock,
  StatRow,
  sportIconName,
} from '../../components/ui';
import { useEventDetail } from '../../hooks/useEvents';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import {
  type SelfAttendanceStatus,
  attendanceStatusLabel,
  cancelEvent,
  completeEvent,
  eventHasStarted,
  eventNoun,
  formatEventWhen,
  isRunningSport,
  selfReportAttendance,
  sportLabelForBattle,
} from '../../lib/events';
import { hasMeetingPoint } from '../../lib/groupRuns';
import { formatKm, paceBandText, paceBandValue } from '../../lib/pace';
import type { BattleDetailScreenProps } from '../../navigation/types';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, radii, spacing, typography } from '../../theme';

const MINI_MAP_HEIGHT = 160;
const MINI_MAP_DELTA = 0.01;

/**
 * Group run / game detail (route `BattleDetail`). Running events get the
 * run layout (distance / pace / spots, meeting-point map, crew link);
 * other sports keep the game layout. Join / leave, host tools (edit via
 * PATCH, cancel, complete) and attendance are shared.
 */
export function BattleDetailScreen({ navigation, route }: BattleDetailScreenProps) {
  const { eventId } = route.params;
  const { detail, isLoading, error, join, leave, refresh } = useEventDetail({ eventId });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const {
    summary: hostHonor,
    isLoading: hostHonorLoading,
    error: hostHonorError,
  } = useUserHonorSummary({ userId: detail?.hostUserId ?? null });
  const [isActing, setIsActing] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [selfReportSaving, setSelfReportSaving] = useState(false);
  const [selfReportError, setSelfReportError] = useState<string | null>(null);
  const [selfReportSaved, setSelfReportSaved] = useState<SelfAttendanceStatus | null>(null);

  // Refetch when returning to the screen (e.g. after a host edit). The
  // first focus is skipped: useEventDetail already loads on mount.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refresh();
      focusedOnce.current = true;
    }, [refresh])
  );

  const noun = eventNoun(detail?.sport);

  const handleJoin = useCallback(async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await join();
    } catch (err) {
      Alert.alert(`Couldn't join this ${noun}.`, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsActing(false);
    }
  }, [isActing, join, noun]);

  const handleLeave = useCallback(async () => {
    if (isActing) return;
    setIsActing(true);
    try {
      await leave();
    } catch (err) {
      Alert.alert(`Couldn't leave this ${noun}.`, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsActing(false);
    }
  }, [isActing, leave, noun]);

  const header = (
    <Header
      title={detail ? (isRunningSport(detail.sport) ? 'Group run' : 'Game') : ''}
      onBack={() => navigation.goBack()}
      backLabel="Back"
      actions={
        detail &&
        currentUserId === detail.hostUserId &&
        (detail.status === 'open' || detail.status === 'full')
          ? [
              {
                icon: 'edit',
                accessibilityLabel: `Edit ${noun}`,
                onPress: () => navigation.navigate('CreateBattle', { eventId: detail.id }),
              },
            ]
          : []
      }
    />
  );

  if (isLoading && !detail) {
    return (
      <Screen padded={false} header={header}>
        <View style={styles.centred}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen padded={false} header={header}>
        <EmptyState
          icon="alert"
          title="Couldn't load this"
          message={error}
          action={{
            label: 'Try again',
            icon: 'refresh',
            onPress: () => void refresh(),
            accessibilityLabel: 'Retry loading battle',
          }}
        />
      </Screen>
    );
  }

  if (!detail) return null;

  const isRun = isRunningSport(detail.sport);
  const isFull = detail.status === 'full' || detail.spotsLeft <= 0;
  const isCancelled = detail.status === 'cancelled';
  const isCompleted = detail.status === 'completed';
  const isHost = currentUserId !== null && currentUserId === detail.hostUserId;
  const isParticipant = detail.hasJoined && !isHost;
  // Mirrors the backend attendance gate: completed stays open, cancelled
  // is blocked, otherwise starts_at <= now.
  const hasStarted = eventHasStarted(detail.startsAt);
  const attendanceOpen = !isCancelled && (isCompleted || hasStarted);
  const ownAttendanceStatus = selfReportSaved;

  const runCancel = async () => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await cancelEvent(eventId);
      await refresh();
    } catch (err) {
      Alert.alert(`Couldn't cancel this ${noun}.`, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const runComplete = async () => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    try {
      await completeEvent(eventId);
      await refresh();
    } catch (err) {
      Alert.alert(`Couldn't complete this ${noun}.`, err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const confirmCancel = () => {
    if (lifecycleBusy) return;
    Alert.alert(`Cancel this ${noun}?`, `${isRun ? 'Runners' : 'Players'} will no longer be able to join.`, [
      { text: 'Keep open', style: 'cancel' },
      { text: `Cancel ${noun}`, style: 'destructive', onPress: () => void runCancel() },
    ]);
  };

  const confirmComplete = () => {
    if (lifecycleBusy) return;
    Alert.alert(
      `Complete this ${noun}?`,
      `This closes joining and marks the ${noun} as finished. You can still adjust attendance.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: `Complete ${noun}`, onPress: () => void runComplete() },
      ]
    );
  };

  const handleSelfReport = async (statusValue: SelfAttendanceStatus) => {
    if (selfReportSaving) return;
    setSelfReportSaving(true);
    setSelfReportError(null);
    try {
      await selfReportAttendance(eventId, { attendanceStatus: statusValue });
      setSelfReportSaved(statusValue);
    } catch (err) {
      setSelfReportError(err instanceof Error ? err.message : 'Could not save attendance.');
    } finally {
      setSelfReportSaving(false);
    }
  };

  // Terminal statuses win so a cancelled / completed event never shows Join/Leave.
  let cta: React.ReactNode;
  if (isCancelled || isCompleted) {
    cta = <Button label={isCancelled ? 'Cancelled' : 'Completed'} variant="secondary" disabled fullWidth />;
  } else if (detail.hasJoined) {
    cta = (
      <Button
        label="Joined · Leave"
        variant="secondary"
        leadingIcon="check"
        fullWidth
        loading={isActing}
        onPress={() => void handleLeave()}
        accessibilityLabel={`Leave this ${noun}`}
      />
    );
  } else if (isFull) {
    cta = <Button label="Full" variant="secondary" disabled fullWidth />;
  } else {
    cta = (
      <Button
        label={isRun ? 'Join run' : 'Join'}
        size="lg"
        fullWidth
        loading={isActing}
        onPress={() => void handleJoin()}
        accessibilityLabel={`Join this ${noun}`}
      />
    );
  }

  const paceValue = paceBandValue(detail.paceMinSecPerKm, detail.paceMaxSecPerKm);
  const km = formatKm(detail.distanceKm);
  const people = detail.participants.map((p) => ({ name: p.displayName }));

  return (
    <Screen
      padded={false}
      scroll
      header={header}
      footer={cta}
      scrollProps={{ contentInsetAdjustmentBehavior: 'never' }}
    >
      <View style={styles.hero}>
        <View style={styles.badges}>
          {isRun ? null : (
            <Badge
              label={detail.mode === 'ranked' ? 'Ranked' : 'Casual'}
              tone={detail.mode === 'ranked' ? 'brand' : 'neutral'}
              variant={detail.mode === 'ranked' ? 'solid' : 'soft'}
              size="sm"
            />
          )}
          <Badge label={sportLabelForBattle(detail.sport)} icon={sportIconName(detail.sport)} size="sm" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {detail.title}
        </Text>
        <View style={styles.metaRow}>
          <Icon name="calendar" size="sm" color={colors.brand} />
          <Text style={styles.when}>{formatEventWhen(detail.startsAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Icon name="location" size="sm" color={colors.textSecondary} />
          <Text style={styles.location}>{detail.locationText}</Text>
        </View>

        <StatRow style={styles.stats} testID="detail-stats">
          {isRun ? (
            <StatBlock value={km || '–'} unit={km ? 'km' : undefined} label="Distance" size="lg" accent />
          ) : (
            <StatBlock value={`${detail.participantCount}/${detail.capacity}`} label="Players" size="lg" accent />
          )}
          <StatBlock value={isFull ? 0 : detail.spotsLeft} label="Spots left" size="lg" />
          {/* Pace last: the band is the widest value, so when the row wraps
              it takes the second line on its own. */}
          {isRun ? (
            <StatBlock
              value={paceValue ?? 'Any'}
              unit={paceValue ? '/km' : undefined}
              label="Pace"
              size="lg"
              accessibilityLabel={`Pace ${paceBandText(detail.paceMinSecPerKm, detail.paceMaxSecPerKm) ?? 'any'}`}
            />
          ) : null}
        </StatRow>
      </View>

      {isRun && hasMeetingPoint(detail) ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Meeting point</Text>
          <View style={styles.miniMap} accessibilityLabel={`Meeting point map, ${detail.locationText}`}>
            <MapView
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                latitude: detail.meetingLat,
                longitude: detail.meetingLng,
                latitudeDelta: MINI_MAP_DELTA,
                longitudeDelta: MINI_MAP_DELTA,
              }}
              userInterfaceStyle="dark"
              customMapStyle={DARK_MAP_STYLE}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
              liteMode
            >
              <Marker
                coordinate={{ latitude: detail.meetingLat, longitude: detail.meetingLng }}
                pinColor={PIN_COLORS.selected}
                title={detail.locationText}
              />
            </MapView>
          </View>
        </View>
      ) : null}

      {detail.crewId && detail.crewName ? (
        <View style={styles.section}>
          <ListRow
            icon="crew"
            title={detail.crewName}
            subtitle="Crew run · see the crew"
            onPress={() => navigation.navigate('CrewDetail', { crewId: detail.crewId as string })}
            accessibilityLabel={`Open crew ${detail.crewName}`}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{isRun ? 'Runners' : 'Players'}</Text>
        {people.length > 0 ? (
          <AvatarGroup people={people} total={detail.participantCount} max={6} />
        ) : null}
        <Text style={styles.countLine}>
          {detail.participantCount}/{detail.capacity} in · {detail.spotsLeft} spots left
        </Text>
      </View>

      {detail.host ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Host</Text>
          <View style={styles.hostRow}>
            <Avatar name={detail.host.displayName || 'Host'} size="md" />
            <View style={styles.hostInfo}>
              <Text style={styles.hostName}>{detail.host.displayName}</Text>
              <Text style={styles.hostMeta}>SportsGang host</Text>
            </View>
            {/* Hidden only on a hard error; 404 / null flows to "New player". */}
            {hostHonorError ? null : (
              <HonorBadge
                honorLevel={hostHonor?.honorLevel ?? null}
                honorScore={hostHonor?.honorScore ?? null}
                isLoading={hostHonorLoading && !hostHonor}
                accessibilityLabel={
                  hostHonor
                    ? `Host honor ${hostHonor.honorLevel} ${hostHonor.honorScore}`
                    : 'Host honor unavailable'
                }
              />
            )}
          </View>
        </View>
      ) : null}

      {detail.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Details</Text>
          <Text style={styles.description}>{detail.description}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Card variant="outline" padding="md">
          <View style={styles.metaRow}>
            <Icon name="shield" size="sm" color={colors.warning} />
            <Text style={styles.warningText}>Only join if you can attend. No-shows affect your Honor.</Text>
          </View>
        </Card>
      </View>

      {isHost && !isCancelled && !isCompleted ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Host controls</Text>
          <View style={styles.buttonRow}>
            <Button
              label={`Cancel ${noun}`}
              variant="destructive"
              onPress={confirmCancel}
              disabled={lifecycleBusy}
              style={styles.flexButton}
            />
            <Button
              label={`Complete ${noun}`}
              variant="secondary"
              onPress={confirmComplete}
              disabled={lifecycleBusy || !hasStarted}
              style={styles.flexButton}
            />
          </View>
          {!hasStarted ? (
            <Text style={styles.copy}>You can complete the {noun} once it has started.</Text>
          ) : null}
        </View>
      ) : null}

      {isHost && (attendanceOpen || isCompleted) ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Attendance</Text>
          <Text style={styles.copy}>Only mark no-show when the player clearly did not attend.</Text>
          <Button
            label="Confirm attendance"
            variant="secondary"
            leadingIcon="check-circle"
            onPress={() => navigation.navigate('AttendanceCheck', { eventId: detail.id })}
          />
        </View>
      ) : null}

      {isHost && !attendanceOpen && !isCompleted && !isCancelled ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Attendance</Text>
          <Text style={styles.copy}>Attendance opens after the {noun} starts.</Text>
        </View>
      ) : null}

      {isParticipant && attendanceOpen ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Did you attend this {noun}?</Text>
          <Text style={styles.copy}>Attendance helps keep Honor fair.</Text>
          {ownAttendanceStatus ? (
            <Text style={styles.saved} accessibilityLabel="Attendance saved">
              Attendance saved · {attendanceStatusLabel(ownAttendanceStatus)}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <Button
              label="Yes, I attended"
              onPress={() => void handleSelfReport('attended')}
              disabled={selfReportSaving}
              style={styles.flexButton}
            />
            <Button
              label="I could not attend"
              variant="secondary"
              onPress={() => void handleSelfReport('excused')}
              disabled={selfReportSaving}
              style={styles.flexButton}
            />
          </View>
          {selfReportError ? <Text style={styles.errorText}>{selfReportError}</Text> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  when: {
    ...typography.bodyStrong,
    color: colors.brand,
  },
  location: {
    ...typography.body,
    flexShrink: 1,
  },
  stats: {
    marginTop: spacing.md,
  },
  section: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  sectionLabel: {
    ...typography.label,
  },
  miniMap: {
    height: MINI_MAP_HEIGHT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  countLine: {
    ...typography.body,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    ...typography.bodyStrong,
  },
  hostMeta: {
    ...typography.caption,
  },
  description: {
    ...typography.bodyLarge,
  },
  warningText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  copy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  saved: {
    ...typography.bodySmall,
    color: colors.success,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
});
