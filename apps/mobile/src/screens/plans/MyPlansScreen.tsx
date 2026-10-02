/**
 * My Plans tab — one place for every commitment:
 *
 *   Upcoming — confirmed 1:1 bookings and hosted/joined group sessions
 *   Pending  — 1:1 proposals still waiting on someone (never shown as confirmed)
 *   Past     — completed, cancelled, declined, no-show and past items
 *
 * Bookings and group sessions load independently; if one source fails the
 * other still renders with an inline retry notice. Times are Sydney time.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import {
  Card,
  EmptyState,
  ErrorState,
  InfoChip,
  InlineNotice,
  LoadingState,
  ScreenHeader,
  SegmentedControl,
} from '../../components/ui';
import { usePlans, type PlanItem, type PlanSegment } from '../../hooks/usePlans';
import { formatSydneyDateTime, formatSydneyRange } from '../../lib/sydneyTime';
import { useAuthStore } from '../../stores/auth';
import { colors, spacing, typography } from '../../theme';
import type { PlansScreenProps } from '../../navigation/types';

const EMPTY_COPY: Record<PlanSegment, { title: string; body: string }> = {
  upcoming: {
    title: 'Nothing planned yet',
    body: 'Join a run or round in Explore, or plan a 1:1 session with a match from Chats.',
  },
  pending: {
    title: 'No pending requests',
    body: 'Session proposals from your chats stay here until they are confirmed or declined.',
  },
  past: {
    title: 'No history yet',
    body: 'Completed, cancelled and past plans will appear here.',
  },
};

export function MyPlansScreen({ navigation }: PlansScreenProps) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const { segments, hasBookings, hasEvents, bookingsError, eventsError, isLoading, isRefreshing, load, refresh } =
    usePlans(currentUserId);
  const [segment, setSegment] = useState<PlanSegment>('upcoming');

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load])
  );

  const openItem = useCallback(
    (item: PlanItem) => {
      if (item.source === 'booking') navigation.navigate('BookingDetail', { bookingId: item.id });
      else navigation.navigate('SessionDetail', { eventId: item.id });
    },
    [navigation]
  );

  const count = (s: PlanSegment) => segments[s].length;
  const options = [
    { value: 'upcoming' as const, label: 'Upcoming' },
    { value: 'pending' as const, label: count('pending') > 0 ? `Pending (${count('pending')})` : 'Pending' },
    { value: 'past' as const, label: 'Past' },
  ];

  const nothingLoaded = !hasBookings && !hasEvents;
  const items = segments[segment];

  let body: ReactNode;
  if (isLoading) {
    body = <LoadingState label="Loading your plans…" />;
  } else if (nothingLoaded && (bookingsError || eventsError)) {
    body = (
      <ErrorState
        title="Could not load your plans"
        body={bookingsError ?? eventsError ?? undefined}
        onAction={refresh}
        testID="plans-error"
      />
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => <PlanRow item={item} onPress={() => openItem(item)} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.accent} />}
        ListHeaderComponent={
          <View>
            {bookingsError ? (
              <InlineNotice
                text="Couldn't load your 1:1 sessions. Group sessions are still shown."
                actionLabel="Retry"
                onAction={refresh}
              />
            ) : null}
            {eventsError ? (
              <InlineNotice
                text="Couldn't load your group sessions. 1:1 sessions are still shown."
                actionLabel="Retry"
                onAction={refresh}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={EMPTY_COPY[segment].title}
            body={EMPTY_COPY[segment].body}
            actionLabel={segment === 'upcoming' ? 'Explore sessions' : undefined}
            onAction={segment === 'upcoming' ? () => navigation.navigate('Explore') : undefined}
            testID={`plans-empty-${segment}`}
          />
        }
      />
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <ScreenHeader eyebrow="Sydney time" title="My Plans" />
        <SegmentedControl
          options={options}
          value={segment}
          onChange={setSegment}
          accessibilityLabel="Filter plans"
        />
      </View>
      {body}
    </Screen>
  );
}

function PlanRow({ item, onPress }: { item: PlanItem; onPress: () => void }) {
  const when = item.endsAt ? formatSydneyRange(item.startsAt, item.endsAt) : formatSydneyDateTime(item.startsAt);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${item.kind}: ${item.title}, ${when}, ${item.statusLabel}`}
      style={styles.row}
      testID={`plan-${item.key}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.kind}>{item.kind}</Text>
        <InfoChip label={item.statusLabel} tone={item.tone} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.when}>{when}</Text>
      {item.location ? (
        <Text style={styles.location} numberOfLines={2}>
          {item.location}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { marginBottom: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kind: { ...typography.label, color: colors.accent, flexShrink: 1 },
  title: { ...typography.h3, marginTop: spacing.xs },
  when: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  location: { ...typography.body, marginTop: 2 },
});
