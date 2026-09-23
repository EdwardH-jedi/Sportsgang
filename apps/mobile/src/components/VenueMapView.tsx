import Constants from 'expo-constants';
import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';

import { EmptyState } from './ui';
import { colors, radii } from '../theme';
import type { Venue } from '@protin/shared-types';

/**
 * Whether the Google Maps SDK key is configured for the CURRENT
 * platform (iOS vs Android vs web).
 *
 * The mobile bundle never sees the key value itself — `app.config.js`
 * surfaces only per-platform booleans via
 * `extra.googleMapsConfiguredIos` / `extra.googleMapsConfiguredAndroid`.
 * The native key value is wired into `ios.config.googleMapsApiKey`
 * and `android.config.googleMaps.apiKey` where react-native-maps
 * actually consumes it.
 *
 * Why platform-aware (not a single union boolean): a build may ship
 * with only the iOS Maps key configured. Without a per-platform
 * gate, the Android user opening the same OTA bundle would force
 * `PROVIDER_GOOGLE` and see a blank grey tile surface (no native
 * Android key to render against). The reverse symmetrical risk
 * applies on iOS. On web / other platforms we never force the
 * provider — react-native-maps web shim does not honour
 * `PROVIDER_GOOGLE` the same way and falling through to the default
 * keeps the picker rendering predictable surfaces.
 *
 * Tradeoff: when Places-sourced rows are visible AND the Maps key is
 * not configured for the current platform, the map uses non-Google
 * tiles. The "Powered by Google" attribution chip still appears next
 * to the visible rows via NearbyCourtsModal — Google's terms cover
 * *Places content* attribution; map-tile provider is independent.
 */
function isGoogleMapsProviderAvailableForPlatform(): boolean {
  const extra = Constants.expoConfig?.extra ?? {};
  if (Platform.OS === 'ios') {
    return Boolean(extra.googleMapsConfiguredIos);
  }
  if (Platform.OS === 'android') {
    return Boolean(extra.googleMapsConfiguredAndroid);
  }
  // web / other — never force PROVIDER_GOOGLE.
  return false;
}

const IS_GOOGLE_MAPS_PROVIDER_AVAILABLE = isGoogleMapsProviderAvailableForPlatform();

/** Whether a map should use Google tiles (Places rows need them when a key exists). */
export function shouldUseGoogleProvider(hasGooglePlacesRows: boolean): boolean {
  return hasGooglePlacesRows && IS_GOOGLE_MAPS_PROVIDER_AVAILABLE;
}

/**
 * Dark map theme for Google tiles (Android, and iOS when Places rows force
 * Google), built from the colour tokens so maps sit on the app canvas.
 * Apple Maps follows `userInterfaceStyle="dark"` instead.
 */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: colors.surface }] },
  { elementType: 'labels.text.fill', stylers: [{ color: colors.textTertiary }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: colors.background }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: colors.surfaceElevated }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: colors.surfaceHigh }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: colors.surfacePressed }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: colors.border }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: colors.borderStrong }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: colors.surfaceElevated }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: colors.background }] },
];

/** Pin colours: lime for the selected pin, muted otherwise. */
export const PIN_COLORS = {
  selected: colors.brand,
  default: colors.textSecondary,
  user: colors.accent,
} as const;

interface VenueMapViewProps {
  /** Venues to render as map pins. Markers are skipped for any venue
   * missing latitude or longitude. */
  venues: Venue[];
  /** Optional user-location pin. Set to null when coordinates aren't
   * available — the map then auto-frames the venue cluster instead. */
  userLat?: number;
  userLng?: number;
  /** Currently selected venue, drawn with the brand-color marker so the
   * user can see which pin they tapped. */
  selectedVenueId?: string | null;
  /** Called when a pin is pressed. The parent owns the selected-venue
   * state; this component just surfaces the tap. */
  onMarkerPress: (venue: Venue) => void;
}

/**
 * Lightweight read-only map view used by NearbyCourtsModal's Map mode.
 *
 * Wraps ``react-native-maps``' platform-default ``MapView`` (Apple
 * MapKit on iOS, Google Maps on Android) with a single layer of
 * markers — one for each venue in ``venues`` plus an optional
 * user-location dot. There is intentionally no clustering, no route
 * drawing, no search input, and no marker creation; those are
 * deliberate non-goals for the MVP.
 *
 * Native rendering requires a development build — the map area is
 * blank in Expo Go. Callers that show this in an Expo Go session
 * should provide a List-mode fallback (see NearbyCourtsModal).
 */
export function VenueMapView({
  venues,
  userLat,
  userLng,
  selectedVenueId,
  onMarkerPress,
}: VenueMapViewProps) {
  const hasGooglePlacesRows = venues.some(
    (venue) => venue.source === 'google_places' || venue.attributionRequired === true,
  );
  // Only switch to Google tiles when both (a) the current result set
  // contains Places-sourced rows AND (b) the CURRENT platform has a
  // Maps SDK key configured. Without (b), PROVIDER_GOOGLE renders a
  // blank map — see isGoogleMapsProviderAvailableForPlatform above.
  const useGoogleProvider = shouldUseGoogleProvider(hasGooglePlacesRows);

  // Frame the visible region around either the user pin (preferred,
  // since results are sorted by distance from them) or the centroid of
  // the venue cluster as a fallback. The deltas are conservative — a
  // ~0.15° span over Sydney clears the eastern suburbs / inner west
  // belt without zooming so far in that "Bondi vs Annandale" feels far.
  const initialRegion: Region | undefined = useMemo(() => {
    if (userLat !== undefined && userLng !== undefined) {
      return {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      };
    }
    const points = venues.filter(
      (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
    );
    if (points.length === 0) return undefined;
    const lat = points.reduce((s, v) => s + v.latitude, 0) / points.length;
    const lng = points.reduce((s, v) => s + v.longitude, 0) / points.length;
    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    };
  }, [userLat, userLng, venues]);

  // Without a region we can't render a useful map — the caller should
  // have already gated this case behind a list-mode fallback, but
  // defend against it with a clear copy block just in case.
  if (initialRegion === undefined) {
    return (
      <View style={styles.fallback}>
        <EmptyState
          icon="map"
          title="Map unavailable"
          message="Turn on location to see venues on a map."
          compact
        />
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel="Venue map">
      <MapView
        provider={useGoogleProvider ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        // Disable surfaces we don't use in the MVP — pure pin-picker.
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        toolbarEnabled={false}
        // Dark tiles to match the app canvas: Apple Maps via the
        // interface style, Google tiles via the token-based style.
        userInterfaceStyle="dark"
        customMapStyle={DARK_MAP_STYLE}
      >
        {userLat !== undefined && userLng !== undefined ? (
          <Marker
            key="venue-map-user"
            coordinate={{ latitude: userLat, longitude: userLng }}
            title="You are here"
            pinColor={PIN_COLORS.user}
            accessibilityLabel="Your location marker"
          />
        ) : null}
        {venues
          .filter(
            (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
          )
          .map((v) => {
            const isSelected = v.id === selectedVenueId;
            return (
              <Marker
                key={v.id}
                identifier={v.id}
                coordinate={{ latitude: v.latitude, longitude: v.longitude }}
                title={v.name}
                description={v.area ?? v.address ?? undefined}
                pinColor={isSelected ? PIN_COLORS.selected : PIN_COLORS.default}
                onPress={() => onMarkerPress(v)}
                accessibilityLabel={`Venue pin ${v.name}`}
              />
            );
          })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.md,
  },
});
