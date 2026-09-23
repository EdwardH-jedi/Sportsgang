import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, type LatLng } from 'react-native-maps';

import { VenueCard } from '../../components/VenueCard';
import { DARK_MAP_STYLE, PIN_COLORS, VenueMapView } from '../../components/VenueMapView';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  Icon,
  IconButton,
  SegmentedControl,
  TextField,
  type Segment,
} from '../../components/ui';
import { useNearbyVenues } from '../../hooks/useNearbyVenues';
import type { VenueLocationStatus } from '../../hooks/useVenueLocation';
import { sportLabel } from '../../lib/sports';
import { formatVenueLocation } from '../../lib/venueLocation';
import { colors, layout, radii, spacing, typography } from '../../theme';
import type { Venue, VenueProviderStatus } from '@protin/shared-types';

type PickerMode = 'list' | 'map' | 'pin';

/** Where the pin-drop map starts without a location fix (Sydney CBD). */
const PIN_FALLBACK_CENTER: LatLng = { latitude: -33.8688, longitude: 151.2093 };

/**
 * Radius option keys used for the radius chip row. ``'near'`` keeps the
 * backend default (10 km) and omits ``radius_km`` from the URL so the
 * v1.0 wire shape is preserved. Explicit km values set ``radius_km`` to
 * that integer. ``'wider'`` maps to {@link WIDER_RADIUS_KM} — the upper
 * bound of the API validator (apps/api/app/routers/venues.py — le=50.0).
 */
type RadiusOption = 'near' | 5 | 10 | 25 | 'wider';

const WIDER_RADIUS_KM = 50;

/**
 * 300 ms debounce on the search field. Long enough that a fast typist
 * doesn't fire a request on every keystroke (Google Places Text Search
 * is billed per request) but short enough that the picker still feels
 * responsive once they pause.
 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Per-page venue cap requested from /venues/nearby. The backend caps
 * at 50 (apps/api/app/routers/venues.py — le=50); the picker pulls the
 * full page so the map / list looks alive on first open, especially in
 * outer suburbs where the curated seed catalog is sparse.
 */
const PICKER_PAGE_LIMIT = 50;

interface NearbyCourtsModalProps {
  isOpen: boolean;
  /**
   * Sport identifier passed straight to /venues/nearby. Accepts any
   * Battle/Game sport string (basketball, soccer, badminton, …) — see
   * useNearbyVenues for the backend contract. The modal renders the
   * sport in the header in uppercase regardless.
   */
  sport: string;
  /** Coordinates from useVenueLocation. Pass both or neither. */
  lat?: number;
  lng?: number;
  /**
   * Optional location-flow status from useVenueLocation. Drives the
   * compact banner under the header so users see why results are or
   * are not distance-sorted. Defaults to "idle" if omitted.
   */
  locationStatus?: VenueLocationStatus;
  /**
   * When true AND coordinates are present, show a radius chips row
   * that lets the user expand the search radius up to
   * {@link WIDER_RADIUS_KM} km. Default off so existing booking/event
   * flows keep their current narrow default-radius behavior and URL
   * shape.
   */
  enableWiderResults?: boolean;
  /**
   * Optional manual-entry fallback. When provided, renders an input at
   * the bottom of the modal so users can type a venue/court name when
   * the catalog doesn't list it. The callback receives the trimmed
   * non-empty text; parents are responsible for clearing any
   * structured selectedVenue and closing the modal (mirrors the
   * onSelect contract).
   */
  onSelectManual?: (text: string) => void;
  onSelect: (venue: Venue) => void;
  onClose: () => void;
  /**
   * `'meeting-spot'` adapts the copy for group runs ("Meeting spot") and,
   * with `onSelectPin`, adds a "Drop pin" tab so a host can mark a spot
   * that isn't in the venue catalog. Default `'venue'`.
   */
  purpose?: 'venue' | 'meeting-spot';
  /** Meeting-spot mode: called with the dropped pin (then the modal closes). */
  onSelectPin?: (pin: LatLng) => void;
}

function resolveRadiusKm(option: RadiusOption): number | undefined {
  if (option === 'near') return undefined;
  if (option === 'wider') return WIDER_RADIUS_KM;
  return option;
}

/**
 * One-line user-facing message for provider statuses that we want the
 * picker to surface explicitly. Returning ``null`` means the status is
 * normal (``"ok"`` or ``"disabled"``) and no banner should appear.
 */
function providerStatusBannerText(
  status: VenueProviderStatus,
  hasCoords: boolean,
): string | null {
  switch (status) {
    case 'quota_exceeded':
      return 'Search quota reached. Showing seed catalog only.';
    case 'error':
      return 'Google Places unavailable. Showing seed catalog only.';
    case 'missing_coordinates':
      return hasCoords
        ? null
        : 'Enable location to search beyond the Sydney catalog.';
    case 'ok':
    case 'disabled':
    default:
      return null;
  }
}

function stripHtmlAttribution(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

const RADIUS_CHIPS: readonly {
  value: RadiusOption;
  label: string;
  /**
   * Two chips inherit the pre-v1.1 accessibility labels so existing
   * UI tests keep matching by label without modification. The new
   * granular chips get their own bespoke labels.
   */
  a11yLabel: string;
}[] = [
  { value: 'near', label: 'Near', a11yLabel: 'Show nearby venues' },
  { value: 5, label: '5 km', a11yLabel: 'Search within 5 km' },
  { value: 10, label: '10 km', a11yLabel: 'Search within 10 km' },
  { value: 25, label: '25 km', a11yLabel: 'Search within 25 km' },
  { value: 'wider', label: 'Wider', a11yLabel: 'Show wider results' },
];

/**
 * Full-screen modal shown over BookingComposer for picking a venue.
 *
 * Loads venues for the requested sport and renders them as VenueCards. The
 * "Use for session" button on a card calls onSelect with the chosen venue
 * and closes the modal — the parent composer is responsible for storing the
 * selection and including it in the booking payload.
 */
export function NearbyCourtsModal({
  isOpen,
  sport,
  lat,
  lng,
  locationStatus = 'idle',
  enableWiderResults = false,
  onSelectManual,
  onSelect,
  onClose,
  purpose = 'venue',
  onSelectPin,
}: NearbyCourtsModalProps) {
  // Default to list so every existing test + integration path keeps
  // working unchanged. The user opts into map mode explicitly.
  const [mode, setMode] = useState<PickerMode>('list');
  // Selected-pin state lives here (not in the parent) so List mode
  // stays untouched. Tap → show preview card → "Select this venue".
  const [mapSelectedVenue, setMapSelectedVenue] = useState<Venue | null>(null);
  // Radius chip state. Resets on every isOpen/sport boundary so a
  // stale toggle from a previous session doesn't quietly widen the
  // new one.
  const [radiusOption, setRadiusOption] = useState<RadiusOption>('near');
  // Manual-entry buffer for the bottom fallback. Stays local to the
  // modal — the parent only sees the trimmed value when the user
  // explicitly taps "Use this venue".
  const [manualText, setManualText] = useState('');
  // Search box — debounced into ``debouncedSearch`` which is what
  // actually drives the network call. Typing fast does not fire a
  // request per keystroke.
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const hasCoords = lat !== undefined && lng !== undefined;
  const radiusKm = hasCoords && enableWiderResults
    ? resolveRadiusKm(radiusOption)
    : undefined;

  // Source mode for /venues/nearby (Stream 2 backend, Stream 3 mobile):
  //
  //   * Coords present → "both"  — seed catalog + Google Places, merged
  //                                + deduped server-side. Densifies the
  //                                picker for sports/areas where the
  //                                seed catalog is sparse.
  //   * No coords     → "seed"  — pure catalog. "places" is silent
  //                                without coords (server can't query
  //                                Google without a centre) so "seed"
  //                                is the honest source label.
  //
  // The Google API key stays on the backend; mobile never sees it.
  const sourceMode: 'seed' | 'both' = hasCoords ? 'both' : 'seed';

  const {
    venues,
    isLoading,
    isLoadingMore,
    error,
    providerStatus,
    hasMore,
    refresh,
    loadMore,
  } = useNearbyVenues({
    sport,
    lat,
    lng,
    radiusKm,
    source: sourceMode,
    q: debouncedSearch,
    limit: PICKER_PAGE_LIMIT,
    enabled: isOpen,
  });

  // Google Places terms require a "Powered by Google" attribution mark
  // whenever Places-sourced rows are visibly surfaced. Seed-only result
  // sets must NOT show the chip (it would falsely imply Google data).
  const requiresGoogleAttribution = venues.some(
    (v) => v.source === 'google_places' || v.attributionRequired === true,
  );

  const googleAttributions = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const venue of venues) {
      for (const raw of venue.attributions ?? []) {
        const label = stripHtmlAttribution(raw);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
      }
    }
    return labels;
  }, [venues]);

  // Reset transient pickers / inputs on every close/open boundary and
  // whenever sport changes — see comment on radiusOption above.
  useEffect(() => {
    setMapSelectedVenue(null);
    setManualText('');
    setRadiusOption('near');
    setSearchText('');
    setDebouncedSearch('');
  }, [isOpen, sport]);

  // Debounce searchText → debouncedSearch. Cleared immediately when
  // the input is empty so the picker snaps back to the default
  // sport-based query without waiting out the timer.
  useEffect(() => {
    if (searchText.trim().length === 0) {
      setDebouncedSearch('');
      return;
    }
    const handle = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchText]);

  // Second guard: if the venue results change mid-session (refresh, a
  // background re-fetch, sport switch race), drop the selected pin
  // when its id is no longer in the result set. Stay no-op when the
  // same venue is still present so an in-progress tap doesn't get
  // wiped by an incidental refetch.
  useEffect(() => {
    if (mapSelectedVenue === null) return;
    const stillPresent = venues.some((v) => v.id === mapSelectedVenue.id);
    if (!stillPresent) {
      setMapSelectedVenue(null);
    }
  }, [venues, mapSelectedVenue]);

  // Catalog-honest fallback wording: only call results "near you" when
  // the server actually got coordinates. The wider/explicit-km branches
  // reuse the same honesty rule — don't claim "near you" once the user
  // has explicitly asked to look further out.
  const statusLabel: string | null = useMemo(() => {
    if (!hasCoords) {
      return locationStatus === 'denied' || locationStatus === 'unavailable'
        ? 'Location off. Showing Sydney catalog.'
        : null;
    }
    if (radiusOption === 'near') return 'Sorted near you';
    if (radiusOption === 'wider') return `Wider results (within ${WIDER_RADIUS_KM} km)`;
    return `Within ${radiusOption} km`;
  }, [hasCoords, locationStatus, radiusOption]);

  const providerBanner = providerStatusBannerText(providerStatus, hasCoords);

  const handleUse = (venue: Venue) => {
    onSelect(venue);
    onClose();
  };

  const handleOpenBooking = (venue: Venue) => {
    if (venue.bookingUrl) {
      void Linking.openURL(venue.bookingUrl);
    }
  };

  const handleUseManual = () => {
    if (!onSelectManual) return;
    const trimmed = manualText.trim();
    if (trimmed.length === 0) return;
    onSelectManual(trimmed);
    onClose();
  };

  const handleUsePin = (pin: LatLng) => {
    if (!onSelectPin) return;
    onSelectPin(pin);
    onClose();
  };

  const isMeetingSpot = purpose === 'meeting-spot';
  const canDropPin = isMeetingSpot && !!onSelectPin;
  const segments: Segment<PickerMode>[] = [
    { value: 'list', label: 'List', icon: 'list', accessibilityLabel: 'Show venue list' },
    { value: 'map', label: 'Map', icon: 'map', accessibilityLabel: 'Show venue map' },
  ];
  if (canDropPin) {
    segments.push({ value: 'pin', label: 'Drop pin', icon: 'location', accessibilityLabel: 'Drop a pin' });
  }

  const showWiderToggle = enableWiderResults && hasCoords;
  const showManualFooter = !!onSelectManual;
  const manualTrimmedNonEmpty = manualText.trim().length > 0;

  const listBody = isLoading ? (
    <View style={styles.centred}>
      <ActivityIndicator color={colors.brand} />
    </View>
  ) : error ? (
    <EmptyState
      icon="alert"
      title="Couldn't load venues"
      message={error}
      action={{
        label: 'Try again',
        icon: 'refresh',
        onPress: refresh,
        accessibilityLabel: 'Retry loading courts',
      }}
    />
  ) : venues.length === 0 ? (
    <EmptyState
      icon={isMeetingSpot ? 'location' : 'search'}
      title={isMeetingSpot ? 'No spots found' : 'No courts found'}
      message={
        hasCoords && enableWiderResults && radiusOption !== 'wider'
          ? 'Try expanding your radius, or type a court name below.'
          : isMeetingSpot
            ? 'Drop a pin on the map or type the meeting spot below.'
            : `We don't have any ${sport} venues here yet. Tap the location field below to type one in instead.`
      }
    />
  ) : mode === 'list' ? (
    <FlatList
      data={venues}
      keyExtractor={(v) => v.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={ListSeparator}
      renderItem={({ item }) => (
        <VenueCard
          venue={item}
          onUse={() => handleUse(item)}
          onOpenBookingUrl={
            item.isBookable && item.bookingUrl ? () => handleOpenBooking(item) : undefined
          }
        />
      )}
      ListFooterComponent={
        hasMore || isLoadingMore ? (
          <View style={styles.loadMoreRow}>
            {isLoadingMore ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <Button
                label="Load more"
                variant="secondary"
                size="sm"
                onPress={loadMore}
                accessibilityLabel="Load more venues"
              />
            )}
          </View>
        ) : null
      }
    />
  ) : (
    <View style={styles.mapWrap}>
      <VenueMapView
        venues={venues}
        userLat={lat}
        userLng={lng}
        selectedVenueId={mapSelectedVenue?.id ?? null}
        onMarkerPress={setMapSelectedVenue}
      />
      {mapSelectedVenue ? (
        <Card variant="elevated" style={styles.mapOverlay} testID="map-selected-venue">
          <View style={styles.mapPreview} accessibilityLabel="Selected venue preview">
            <View style={styles.mapPreviewText}>
              <Text style={styles.mapPreviewName} numberOfLines={1}>
                {mapSelectedVenue.name}
              </Text>
              {mapSelectedVenue.area || mapSelectedVenue.address ? (
                <Text style={styles.mapPreviewArea} numberOfLines={1}>
                  {formatVenueLocation(mapSelectedVenue)}
                </Text>
              ) : null}
            </View>
            <Button
              label={isMeetingSpot ? 'Use this spot' : 'Select this venue'}
              size="sm"
              onPress={() => handleUse(mapSelectedVenue)}
              accessibilityLabel={
                isMeetingSpot
                  ? `Use ${mapSelectedVenue.name} as meeting spot`
                  : `Select ${mapSelectedVenue.name} for session`
              }
            />
          </View>
        </Card>
      ) : (
        <View style={[styles.mapOverlay, styles.mapHint]} pointerEvents="none">
          <Text style={styles.mapHintText}>
            {hasCoords
              ? 'Tap a pin to select a venue.'
              : 'Tap a pin to select. Map is centred on the Sydney catalog - turn on location for distance sort.'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <Header
          title={isMeetingSpot ? 'Meeting spot' : 'Courts & venues'}
          subtitle={sportLabel(sport)}
          right={
            <IconButton
              icon="close"
              onPress={onClose}
              accessibilityLabel={isMeetingSpot ? 'Close meeting spot picker' : 'Close courts and venues'}
            />
          }
        />

        <View style={styles.controls}>
          {mode !== 'pin' ? (
            <TextField
              value={searchText}
              onChangeText={setSearchText}
              placeholder={isMeetingSpot ? 'Search parks and spots' : 'Search venues (e.g. Bondi tennis)'}
              leadingIcon="search"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
              returnKeyType="search"
              accessibilityLabel="Search venues"
            />
          ) : null}

          {statusLabel || providerBanner ? (
            <View style={styles.banners}>
              {statusLabel ? (
                <View style={styles.statusRow}>
                  <Icon name={hasCoords ? 'my-location' : 'location'} size="xs" color={colors.textSecondary} />
                  <Text style={styles.statusText} accessibilityLabel={`Location status: ${statusLabel}`}>
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
              {providerBanner ? (
                <View style={styles.statusRow} accessibilityLabel={`Provider status: ${providerBanner}`}>
                  <Icon name="warning" size="xs" color={colors.warning} />
                  <Text style={[styles.statusText, styles.providerText]}>{providerBanner}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <SegmentedControl
            segments={segments}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Venue picker view"
          />

          {showWiderToggle && mode !== 'pin' ? (
            <View style={styles.radiusRow}>
              {RADIUS_CHIPS.map((chip) => (
                <Chip
                  key={String(chip.value)}
                  label={chip.label}
                  size="sm"
                  selected={radiusOption === chip.value}
                  onPress={() => setRadiusOption(chip.value)}
                  accessibilityLabel={chip.a11yLabel}
                />
              ))}
            </View>
          ) : null}
        </View>

        {mode === 'pin' ? <PinDropMap lat={lat} lng={lng} onUse={handleUsePin} /> : listBody}

        {requiresGoogleAttribution && mode !== 'pin' ? (
          <View style={styles.attribution} accessibilityLabel="Powered by Google">
            <Text style={styles.attributionText}>Powered by Google</Text>
            {googleAttributions.length > 0 ? (
              <Text style={styles.thirdPartyAttributionText} numberOfLines={2}>
                Map data: {googleAttributions.join(', ')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {showManualFooter && mode !== 'pin' ? (
          <View style={styles.manualFooter} accessibilityLabel="Manual venue entry">
            <Text style={styles.manualLabel}>
              {isMeetingSpot ? 'Meeting somewhere else?' : "Can't find your court?"}
            </Text>
            <View style={styles.manualRow}>
              <TextField
                value={manualText}
                onChangeText={setManualText}
                placeholder={isMeetingSpot ? 'e.g. Bondi Pavilion steps' : 'Type venue or court name'}
                maxLength={200}
                autoCapitalize="words"
                autoCorrect={false}
                accessibilityLabel="Type venue or court name"
                returnKeyType="done"
                onSubmitEditing={handleUseManual}
                containerStyle={styles.manualInput}
              />
              <Button
                label={isMeetingSpot ? 'Use this spot' : 'Use this venue'}
                onPress={handleUseManual}
                disabled={!manualTrimmedNonEmpty}
                accessibilityLabel="Use typed venue"
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

/**
 * Meeting-spot mode: tap the (dark) map to drop a pin, drag it to
 * fine-tune, then "Use this spot". The pin is a public meeting point, so
 * it is sent at full precision (the API keeps 5 dp).
 */
function PinDropMap({
  lat,
  lng,
  onUse,
}: {
  lat?: number;
  lng?: number;
  onUse: (pin: LatLng) => void;
}) {
  const [pin, setPin] = useState<LatLng | null>(null);
  const center =
    lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : PIN_FALLBACK_CENTER;

  return (
    <View style={styles.mapWrap}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        userInterfaceStyle="dark"
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation={false}
        toolbarEnabled={false}
        onPress={(e) => setPin(e.nativeEvent.coordinate)}
        accessibilityLabel="Meeting spot map"
        testID="pin-drop-map"
      >
        {pin ? (
          <Marker
            coordinate={pin}
            draggable
            onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
            pinColor={PIN_COLORS.selected}
            accessibilityLabel="Dropped pin"
          />
        ) : null}
      </MapView>
      <Card variant="elevated" style={styles.mapOverlay}>
        <View style={styles.mapPreview}>
          <Text style={[styles.mapPreviewText, styles.mapHintText]}>
            {pin ? 'Pin dropped. Drag it to fine-tune.' : 'Tap the map where the run starts.'}
          </Text>
          <Button
            label="Use this spot"
            size="sm"
            disabled={!pin}
            onPress={() => pin && onUse(pin)}
            accessibilityLabel="Use dropped pin"
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  controls: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  banners: {
    gap: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  providerText: {
    color: colors.warning,
  },
  radiusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  loadMoreRow: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: layout.screenPadding,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  mapOverlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  mapPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mapPreviewText: {
    flex: 1,
  },
  mapPreviewName: {
    ...typography.bodyStrong,
  },
  mapPreviewArea: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  mapHint: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
  },
  mapHintText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  attribution: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  attributionText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  thirdPartyAttributionText: {
    ...typography.caption,
  },
  manualFooter: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  manualLabel: {
    ...typography.label,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manualInput: {
    flex: 1,
  },
});
