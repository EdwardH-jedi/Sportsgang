import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Chip, EmptyState, Icon } from '../../components/ui';
import { useGroupRuns } from '../../hooks/useGroupRuns';
import type { EventSummary } from '../../lib/events';
import {
  DISTANCE_FILTERS,
  type DistanceFilter,
  PACE_FILTERS,
  type PaceFilter,
  WHEN_FILTERS,
  type WhenFilter,
  filterRuns,
} from '../../lib/groupRuns';
import type { Coords, LocationStatus } from '../../lib/location';
import { colors, layout, radii, spacing, typography } from '../../theme';
import { RunCard } from './components/RunCard';
import { RunCardSkeleton } from './components/RunCardSkeleton';
import { RunMap } from './components/RunMap';

/** Meeting-point search radius once we have a fix. */
export const GROUP_RUN_RADIUS_KM = 20;
/**
 * Collapsed · default · expanded. The default (40%) leaves the map a real
 * area to scan pins in, with ~2 run cards visible below the filters.
 */
export const SHEET_SNAPS = ['25%', '40%', '90%'] as const;

export interface GroupRunsViewProps {
  coords: Coords | null;
  locationStatus: LocationStatus;
  onSetLocation: () => void;
  onOpenSettings: () => void;
  onOpenRun: (run: EventSummary) => void;
  onHostRun: () => void;
}

/** Group runs segment: dark map of meeting points under a run-card sheet. */
export function GroupRunsView({
  coords,
  locationStatus,
  onSetLocation,
  onOpenSettings,
  onOpenRun,
  onHostRun,
}: GroupRunsViewProps) {
  const [when, setWhen] = useState<WhenFilter>('week');
  const [distance, setDistance] = useState<DistanceFilter>('any');
  const [pace, setPace] = useState<PaceFilter>('any');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [sheetIndex, setSheetIndex] = useState(1);

  const { runs, isLoading, error, refresh } = useGroupRuns({
    coords,
    radiusKm: GROUP_RUN_RADIUS_KM,
    when,
  });

  const filtered = useMemo(() => filterRuns(runs, { distance, pace }), [runs, distance, pace]);
  // The selected pin's run leads the list so it's visible at any snap.
  const ordered = useMemo(() => {
    const selected = filtered.find((r) => r.id === selectedRunId);
    return selected ? [selected, ...filtered.filter((r) => r.id !== selectedRunId)] : filtered;
  }, [filtered, selectedRunId]);

  const extraFilters = (distance !== 'any' ? 1 : 0) + (pace !== 'any' ? 1 : 0);
  const clearFilters = () => {
    setDistance('any');
    setPace('any');
  };

  const locationNotice = (() => {
    if (locationStatus === 'undetermined') {
      return (
        <LocationBanner
          title="See runs near you"
          body="Share a rough location (about 1 km) to sort runs by distance."
          action={<Button label="Set location" size="sm" onPress={onSetLocation} />}
        />
      );
    }
    if (locationStatus === 'denied') {
      return (
        <LocationBanner
          title="Location is off"
          body="Showing group runs across Sydney."
          action={<Button label="Open settings" size="sm" variant="secondary" onPress={onOpenSettings} />}
        />
      );
    }
    if (locationStatus === 'unavailable') {
      return (
        <LocationBanner
          title="Couldn't find your location"
          body="Showing group runs across Sydney."
          action={<Button label="Try again" size="sm" variant="secondary" onPress={onSetLocation} />}
        />
      );
    }
    return null;
  })();

  const filtersBlock = (
    <View style={styles.filters}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {WHEN_FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} size="sm" selected={when === f.id} onPress={() => setWhen(f.id)} />
        ))}
        <Chip
          label={extraFilters > 0 ? `Filters · ${extraFilters}` : 'Filters'}
          icon="filter"
          size="sm"
          selected={showFilters || extraFilters > 0}
          onPress={() => setShowFilters((v) => !v)}
          accessibilityLabel={showFilters ? 'Hide distance and pace filters' : 'Show distance and pace filters'}
        />
      </ScrollView>
      {showFilters ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {DISTANCE_FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                size="sm"
                selected={distance === f.id}
                onPress={() => setDistance(f.id)}
              />
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {PACE_FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                size="sm"
                selected={pace === f.id}
                onPress={() => setPace(f.id)}
                accessibilityLabel={`Pace ${f.label}`}
              />
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  let empty: React.ReactNode = null;
  if (isLoading && runs.length === 0) {
    empty = (
      <View style={styles.skeletons} accessibilityLabel="Loading group runs">
        <RunCardSkeleton />
        <RunCardSkeleton />
      </View>
    );
  } else if (error) {
    empty = (
      <EmptyState
        compact
        icon="alert"
        title="Could not load group runs"
        message={error}
        action={{
          label: 'Try again',
          onPress: () => void refresh(),
          icon: 'refresh',
          accessibilityLabel: 'Retry loading group runs',
        }}
      />
    );
  } else if (runs.length > 0 && filtered.length === 0) {
    empty = (
      <EmptyState
        compact
        icon="filter"
        title="No runs match these filters"
        action={{ label: 'Clear filters', onPress: clearFilters }}
      />
    );
  } else {
    empty = (
      <EmptyState
        compact
        icon="run"
        title={coords ? 'No group runs near you yet' : 'No group runs yet'}
        message="Start one — pick a meeting spot, a distance and a pace."
        action={{ label: 'Host a run', onPress: onHostRun, icon: 'plus' }}
      />
    );
  }

  const count = filtered.length;

  return (
    <View style={styles.container}>
      <RunMap
        runs={filtered}
        coords={coords}
        selectedRunId={selectedRunId}
        onSelectRun={(run) => {
          setSelectedRunId(run.id);
          if (sheetIndex === 0) setSheetIndex(1);
        }}
      />
      <BottomSheet
        snapPoints={SHEET_SNAPS}
        index={sheetIndex}
        onIndexChange={setSheetIndex}
        accessibilityLabel="Group runs list"
        testID="group-runs-sheet"
        // The Run tab ends above the tab bar, which already clears the
        // home indicator — don't pad the list a second time.
        bottomInset={0}
        header={
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                Group runs
              </Text>
              <Text style={styles.sheetCount}>
                {isLoading && runs.length === 0 ? 'Loading…' : `${count} ${count === 1 ? 'run' : 'runs'}`}
              </Text>
            </View>
            <Button label="Host a run" size="sm" leadingIcon="plus" onPress={onHostRun} />
          </View>
        }
      >
        <FlatList
          data={isLoading && runs.length === 0 ? [] : ordered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {filtersBlock}
              {locationNotice}
            </View>
          }
          ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
          ItemSeparatorComponent={Separator}
          renderItem={({ item }) => (
            <RunCard
              run={item}
              selected={item.id === selectedRunId}
              onPress={() => onOpenRun(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </BottomSheet>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** Inline one-row notice (location state) that keeps run cards in view. */
function LocationBanner({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <View style={styles.notice}>
      <Icon name="location" size="md" color={colors.brand} />
      <View style={styles.noticeText}>
        <Text style={styles.noticeTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.noticeBody} numberOfLines={2}>
          {body}
        </Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  sheetTitleBlock: {
    flex: 1,
  },
  sheetTitle: {
    ...typography.h3,
  },
  sheetCount: {
    ...typography.caption,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  filters: {
    gap: spacing.sm,
  },
  // Chip rows bleed to the sheet edge (the list is inset by the screen
  // padding) and re-inset their content, so chips scroll off the edge
  // instead of being clipped inside the gutter.
  chipScroll: {
    marginHorizontal: -layout.screenPadding,
  },
  chipRow: {
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  noticeText: {
    flex: 1,
    minWidth: 0,
  },
  noticeTitle: {
    ...typography.bodyStrong,
  },
  noticeBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  skeletons: {
    gap: spacing.md,
  },
  empty: {
    paddingTop: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
});
