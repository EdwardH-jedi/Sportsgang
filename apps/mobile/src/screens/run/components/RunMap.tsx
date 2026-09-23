import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { DARK_MAP_STYLE, PIN_COLORS } from '../../../components/VenueMapView';
import type { EventSummary } from '../../../lib/events';
import { hasMeetingPoint } from '../../../lib/groupRuns';
import type { Coords } from '../../../lib/location';
import { colors } from '../../../theme';

/** Sydney CBD — the frame when there is no fix and no pinned run. */
export const DEFAULT_REGION: Region = {
  latitude: -33.8688,
  longitude: 151.2093,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
};

export interface RunMapProps {
  runs: readonly EventSummary[];
  coords: Coords | null;
  selectedRunId: string | null;
  onSelectRun: (run: EventSummary) => void;
}

/**
 * Dark map of group-run meeting points. Runs without a meeting point are
 * listed in the sheet only. The selected pin is lime.
 */
export function RunMap({ runs, coords, selectedRunId, onSelectRun }: RunMapProps) {
  const pinned = useMemo(() => runs.filter(hasMeetingPoint), [runs]);

  const initialRegion: Region = useMemo(() => {
    if (coords) {
      return { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    }
    if (pinned.length > 0) {
      const lat = pinned.reduce((s, r) => s + r.meetingLat, 0) / pinned.length;
      const lng = pinned.reduce((s, r) => s + r.meetingLng, 0) / pinned.length;
      return { latitude: lat, longitude: lng, latitudeDelta: 0.2, longitudeDelta: 0.2 };
    }
    return DEFAULT_REGION;
    // Frame once per location change, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng]);

  return (
    <View style={styles.container} accessibilityLabel="Group runs map" testID="run-map">
      <MapView
        // Apple Maps on iOS (dark via userInterfaceStyle), Google on
        // Android (dark via the token-based customMapStyle).
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        userInterfaceStyle="dark"
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {coords ? (
          <Marker
            key="run-map-you"
            coordinate={{ latitude: coords.lat, longitude: coords.lng }}
            title="Your area"
            pinColor={PIN_COLORS.user}
            accessibilityLabel="Your area marker"
          />
        ) : null}
        {pinned.map((run) => {
          const selected = run.id === selectedRunId;
          return (
            <Marker
              key={`${run.id}-${selected ? 's' : 'n'}`}
              identifier={run.id}
              coordinate={{ latitude: run.meetingLat, longitude: run.meetingLng }}
              title={run.title}
              description={run.locationText}
              pinColor={selected ? PIN_COLORS.selected : PIN_COLORS.default}
              zIndex={selected ? 2 : 1}
              onPress={() => onSelectRun(run)}
              accessibilityLabel={`Run pin ${run.title}`}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
  },
});
