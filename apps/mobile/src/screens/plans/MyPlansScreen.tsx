/**
 * My Plans tab — one place for every commitment:
 *
 *   Upcoming — confirmed 1:1 bookings and hosted/joined group sessions
 *   Pending  — 1:1 proposals still waiting on someone (never shown as confirmed)
 *   Past     — completed, cancelled, declined, no-show and past items
 *
 * Bookings and group sessions load independently and per segment, so past
 * history never pushes future plans out; every segment can show more. If one
 * source fails the other still renders with an inline retry notice. Times are
 * Sydney time.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Screen } from '../../components/Screen';
import {
  Button,
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
  const {
    segments,
    totals,
    hasMore,
    loadingMore,
    loadMoreError,
    hasBookings,
    hasEvents,
    bookingsError,
    eventsError,
    isLoading,
    isRefreshing,
    load,
    refresh,
    loadMore,
    retryFailed,
  } = usePlans(currentUserId);
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

  // The server's total, not just what is loaded so far.
  const pendingCount = totals.pending;
  const options = [
    { value: 'upcoming' as const, label: 'Upcoming' },
    { value: 'pending' as const, label: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending' },
    { value: 'past' as const, label: 'Past' },
  ];

  const nothingLoaded = !hasBookings && !hasEvents;
  const items = segments[segment];
  // A failed refresh keeps the rows loaded earlier, so the notice says that
  // instead of claiming a source is missing or that the other one is fresh.
  let failureNotice: string | null = null;
  if (bookingsError && eventsError) {
    failureNotice = "Couldn't refresh your plans. Showing what was loaded earlier.";
  } else if (bookingsError) {
    failureNotice = hasBookings
      ? "Couldn't refresh your 1:1 sessions. Showing what was loaded earlier."
      : "Couldn't load your 1:1 sessions. Group sessions are still shown.";
  } else if (eventsError) {
    failureNotice = hasEvents
      ? "Couldn't refresh your group sessions. Showing what was loaded earlier."
      : "Couldn't load your group sessions. 1:1 sessions are still shown.";
  }

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
            {failureNotice ? (
              <InlineNotice text={failureNotice} actionLabel="Retry" onAction={() => void retryFailed()} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore[segment] ? (
            <ActivityIndicator style={styles.footer} color={colors.accent} accessibilityLabel="Loading more plans" />
          ) : loadMoreError[segment] ? (
            <InlineNotice
              text="Couldn't load more plans."
              actionLabel="Retry"
              onAction={() => void loadMore(segment)}
            />
          ) : hasMore[segment] ? (
            <Button
              label="Show more"
              variant="secondary"
              onPress={() => void loadMore(segment)}
              testID={`plans-more-${segment}`}
            />
          ) : null
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
  footer: { marginVertical: spacing.lg },
});
