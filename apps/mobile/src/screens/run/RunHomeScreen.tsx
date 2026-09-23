import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Chip, Header, Screen, SegmentedControl } from '../../components/ui';
import { useHomeLocation } from '../../hooks/useHomeLocation';
import type { LocationStatus } from '../../lib/location';
import type { RootStackParamList } from '../../navigation/types';
import { layout, spacing } from '../../theme';
import { GroupRunsView } from './GroupRunsView';
import { RunnersView } from './RunnersView';
import { NextUpCard } from './components/NextUpCard';
import { useNextUp } from './useNextUp';

export type RunSegment = 'runs' | 'runners';

const SEGMENTS = [
  { value: 'runs' as const, label: 'Group runs', icon: 'map' as const },
  { value: 'runners' as const, label: 'Runners', icon: 'crew' as const },
];

export function locationSubtitle(status: LocationStatus, area: string | null): string {
  switch (status) {
    case 'ready':
      return area ? `Around ${area}` : 'Around you';
    case 'checking':
    case 'locating':
      return 'Finding your area…';
    case 'denied':
      return 'Location off · showing all of Sydney';
    case 'unavailable':
      return "Couldn't get your location · showing all of Sydney";
    default:
      return 'Set your location to see what’s close';
  }
}

/**
 * Run tab (home): "Runs near you" with the location state, an optional
 * Next-up card, then Group runs (map + sheet) or Runners (partner cards).
 */
export function RunHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const location = useHomeLocation();
  const [segment, setSegment] = useState<RunSegment>('runs');
  const { next, refresh: refreshNextUp } = useNextUp();

  useFocusEffect(
    useCallback(() => {
      void refreshNextUp();
    }, [refreshNextUp])
  );

  const { status, areaLabel, requestLocation, openSettings } = location;
  const setLocation = useCallback(() => {
    void requestLocation();
  }, [requestLocation]);

  let chip: React.ReactNode;
  if (status === 'ready') {
    chip = (
      <Chip
        label={areaLabel ?? 'Near you'}
        icon="location"
        size="sm"
        selected
        onPress={setLocation}
        accessibilityLabel={`Location: ${areaLabel ?? 'near you'}. Update location`}
      />
    );
  } else if (status === 'checking' || status === 'locating') {
    chip = <Chip label="Locating…" icon="location" size="sm" />;
  } else if (status === 'denied') {
    chip = (
      <Chip
        label="Location off"
        icon="location"
        size="sm"
        onPress={openSettings}
        accessibilityLabel="Location off. Open settings"
      />
    );
  } else {
    chip = <Chip label="Set location" icon="my-location" size="sm" onPress={setLocation} />;
  }

  return (
    <Screen padded={false} testID="run-home">
      <Header large title="Runs near you" subtitle={locationSubtitle(status, areaLabel)} right={chip} />
      {next ? (
        <View style={styles.nextUp}>
          <NextUpCard
            item={next}
            // Group runs needs the height for its map; a one-line row keeps
            // the time visible without squeezing the map to a strip.
            compact={segment === 'runs'}
            onPress={() =>
              next.kind === 'session'
                ? navigation.navigate('BookingDetail', { bookingId: next.id })
                : navigation.navigate('BattleDetail', { eventId: next.id })
            }
          />
        </View>
      ) : null}
      <SegmentedControl
        segments={SEGMENTS}
        value={segment}
        onChange={setSegment}
        accessibilityLabel="Run home view"
        style={styles.segments}
        testID="run-segments"
      />
      <View style={styles.body}>
        {segment === 'runs' ? (
          <GroupRunsView
            coords={location.coords}
            locationStatus={status}
            onSetLocation={setLocation}
            onOpenSettings={openSettings}
            onOpenRun={(run) => navigation.navigate('BattleDetail', { eventId: run.id })}
            onHostRun={() => navigation.navigate('CreateBattle', { sport: 'running' })}
          />
        ) : (
          <RunnersView coords={location.coords} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nextUp: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  segments: {
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing.sm,
  },
  body: {
    flex: 1,
  },
});
