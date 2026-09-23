import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { HonorBadge } from '../../components/HonorBadge';
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  Header,
  Screen,
  Tag,
  sportIconName,
} from '../../components/ui';
import { useEvents } from '../../hooks/useEvents';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import {
  BATTLE_SPORTS,
  type EventMode,
  type EventSummary,
  formatEventWhen,
  isRunningSport,
  sportLabelForBattle,
} from '../../lib/events';
import type { BattlesScreenProps } from '../../navigation/types';
import { colors, layout, spacing, typography } from '../../theme';
import { RunCard } from '../run/components/RunCard';
import { RunCardSkeleton } from '../run/components/RunCardSkeleton';

type StatusFilter = 'open' | 'mine' | 'all';
type ModeFilter = 'all' | EventMode;
type SportFilter = 'all' | string;

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'mine', label: 'Mine' },
  { value: 'all', label: 'All' },
];

const MODE_CHIPS: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ranked', label: 'Ranked' },
  { value: 'casual', label: 'Casual' },
];

const SPORT_CHIPS = [{ value: 'all' as const, label: 'All' }, ...BATTLE_SPORTS];

/**
 * Games & group runs list (route `Battles`). Group runs render as run
 * cards; other sports keep the game card with mode and host honor.
 * Reached from Profile → Games & challenges.
 */
export function BattlesScreen({ navigation }: BattlesScreenProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [sportFilter, setSportFilter] = useState<SportFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { items, isLoading, error, refresh } = useEvents({
    mine: statusFilter === 'mine',
    mode: modeFilter === 'all' ? undefined : modeFilter,
    sport: sportFilter === 'all' ? undefined : sportFilter,
  });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const runsOnly = isRunningSport(sportFilter);
  const hostLabel = runsOnly ? 'Host a run' : 'Host a game';
  const openHost = () => {
    if (sportFilter === 'all') navigation.navigate('CreateBattle');
    else navigation.navigate('CreateBattle', { sport: sportFilter });
  };

  const renderEmpty = () => {
    if (error) {
      return (
        <EmptyState
          icon="alert"
          title={runsOnly ? 'Could not load group runs' : 'Could not load games'}
          message={error}
          action={{
            label: 'Try again',
            icon: 'refresh',
            onPress: () => void refresh(),
            accessibilityLabel: 'Retry loading battles',
          }}
        />
      );
    }
    return (
      <EmptyState
        icon={runsOnly ? 'run' : 'battle'}
        title={runsOnly ? 'No group runs yet.' : 'No games nearby yet.'}
        message="Start the first one and build your SportsGang."
        action={{ label: hostLabel, icon: 'plus', onPress: openHost }}
      />
    );
  };

  return (
    <Screen
      padded={false}
      header={
        <Header
          title={runsOnly ? 'Group runs' : 'Games'}
          subtitle={runsOnly ? 'Runs you can join' : 'Games & group runs'}
          onBack={() => navigation.goBack()}
          backLabel="Back"
          actions={[{ icon: 'plus', accessibilityLabel: hostLabel, onPress: openHost }]}
        />
      }
    >
      <View style={styles.filters}>
        <ChipRow label="Status" chips={STATUS_CHIPS} value={statusFilter} onChange={setStatusFilter} />
        <ChipRow label="Mode" chips={MODE_CHIPS} value={modeFilter} onChange={setModeFilter} />
        <ChipRow
          label="Sport"
          chips={SPORT_CHIPS}
          value={sportFilter}
          onChange={(v) => setSportFilter(v as SportFilter)}
        />
      </View>

      {isLoading && items.length === 0 ? (
        <View style={styles.list} accessibilityLabel="Loading games">
          <RunCardSkeleton />
          <View style={styles.separator} />
          <RunCardSkeleton />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={renderEmpty()}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          renderItem={({ item }) =>
            isRunningSport(item.sport) ? (
              <RunCard run={item} onPress={() => navigation.navigate('BattleDetail', { eventId: item.id })} />
            ) : (
              <BattleCard
                event={item}
                onPress={() => navigation.navigate('BattleDetail', { eventId: item.id })}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

// ─── Filter chip row ─────────────────────────────────────────────────────────

interface ChipRowProps<V extends string> {
  label: string;
  chips: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}

function ChipRow<V extends string>({ label, chips, value, onChange }: ChipRowProps<V>) {
  return (
    <View style={styles.chipRow}>
      <Text style={styles.chipRowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {chips.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            size="sm"
            selected={c.value === value}
            onPress={() => onChange(c.value)}
            accessibilityLabel={`Filter ${label.toLowerCase()} by ${c.label}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Game card ───────────────────────────────────────────────────────────────

function BattleCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  const isFull = event.status === 'full' || event.spotsLeft <= 0;
  const isCancelled = event.status === 'cancelled';
  const isCompleted = event.status === 'completed';
  const ctaLabel = isCancelled
    ? 'Cancelled'
    : isCompleted
      ? 'Completed'
      : event.hasJoined
        ? 'View'
        : isFull
          ? 'Full'
          : 'Join';
  const ctaTone = isCancelled || isCompleted || (isFull && !event.hasJoined) ? 'neutral' : event.hasJoined ? 'success' : 'brand';

  // Cached at the lib layer, so repeated hosts don't fan out requests.
  const {
    summary: hostSummary,
    isLoading: hostHonorLoading,
    error: hostHonorError,
  } = useUserHonorSummary({ userId: event.hostUserId });

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Open battle ${event.title}`}
      testID={`battle-card-${event.id}`}
    >
      <View style={styles.cardHeader}>
        <Badge
          label={event.mode === 'ranked' ? 'Ranked' : 'Casual'}
          tone={event.mode === 'ranked' ? 'brand' : 'neutral'}
          variant={event.mode === 'ranked' ? 'solid' : 'soft'}
          size="sm"
        />
        <Tag label={sportLabelForBattle(event.sport)} icon={sportIconName(event.sport)} size="sm" variant="outline" />
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {formatEventWhen(event.startsAt)}
      </Text>
      <Text style={styles.cardMetaSecondary} numberOfLines={1}>
        {event.locationText}
      </Text>
      <View style={styles.cardHonorRow}>
        <Text style={styles.cardHost} numberOfLines={1}>
          Host · {event.host?.displayName ?? 'SportsGang host'}
        </Text>
        {/* Hidden only on a hard error so a failure isn't shown as "New player". */}
        {hostHonorError ? null : (
          <HonorBadge
            honorLevel={hostSummary?.honorLevel ?? null}
            honorScore={hostSummary?.honorScore ?? null}
            isLoading={hostHonorLoading && !hostSummary}
            compact
            accessibilityLabel={hostSummary ? `Host honor ${hostSummary.honorLevel}` : 'Host honor unavailable'}
          />
        )}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardCount}>
          {event.participantCount}/{event.capacity} in
        </Text>
        <Badge label={ctaLabel} tone={ctaTone} variant={ctaTone === 'brand' ? 'solid' : 'soft'} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chipRowLabel: {
    ...typography.label,
    minWidth: spacing.xxl + spacing.sm,
  },
  chipScroll: {
    gap: spacing.sm,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.h3,
    marginTop: spacing.sm,
  },
  cardMeta: {
    ...typography.bodySmall,
    color: colors.brand,
    marginTop: spacing.xs,
  },
  cardMetaSecondary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  cardHonorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardHost: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  cardCount: {
    ...typography.statSmall,
  },
});
