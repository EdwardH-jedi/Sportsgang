import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import { Icon } from './ui/Icon';
import type { Venue } from '@protin/shared-types';

interface VenueCardProps {
  venue: Venue;
  onUse: () => void;
  onOpenBookingUrl?: () => void;
}

function formatDistance(km: number | null | undefined): string | null {
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/**
 * Single venue tile used by NearbyCourtsModal. SportsGang dark/neon style:
 * dark surface card, subtle border, lime CTA. The "Open booking" link is
 * shown only when the venue has a real bookingUrl AND is_bookable=true so
 * we never claim something is bookable that isn't.
 */
export function VenueCard({ venue, onUse, onOpenBookingUrl }: VenueCardProps) {
  const distance = formatDistance(venue.distanceKm);
  const showBookingCta = venue.isBookable && !!venue.bookingUrl && !!onOpenBookingUrl;

  return (
    <View style={styles.card} accessibilityLabel={`Venue ${venue.name}`}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>
          {venue.name}
        </Text>
        {distance ? (
          <View style={styles.distanceRow}>
            <Icon name="distance" size={GLYPH} color={colors.brand} />
            <Text style={styles.distance}>{distance}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        {venue.sportTags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag.toUpperCase()}</Text>
          </View>
        ))}
        {venue.area ? (
          <View style={styles.areaRow}>
            <Icon name="location" size={GLYPH} color={colors.textTertiary} />
            <Text style={styles.area}>{venue.area}</Text>
          </View>
        ) : null}
      </View>

      {venue.address ? (
        <Text style={styles.address} numberOfLines={2}>
          {venue.address}
        </Text>
      ) : null}

      {venue.notes ? (
        <Text style={styles.notes} numberOfLines={2}>
          {venue.notes}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onUse}
          accessibilityRole="button"
          accessibilityLabel={`Use ${venue.name} for session`}
          style={({ pressed }) => [styles.useButton, pressed && styles.useButtonPressed]}
        >
          <Icon name="check" size={GLYPH} color={colors.textInverse} />
          <Text style={styles.useButtonText}>Use for session</Text>
        </Pressable>

        {showBookingCta ? (
          <Pressable
            onPress={onOpenBookingUrl}
            accessibilityRole="link"
            accessibilityLabel={`Open booking for ${venue.name}`}
            style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
          >
            <Text style={styles.linkButtonText}>Open booking</Text>
            <Icon name="external-link" size={GLYPH} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Icon size in points, built from spacing rather than an `iconSizes`
 * token: NearbyCourtsModal's tests mock only part of the theme.
 */
const GLYPH = spacing.md;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  distance: {
    ...typography.statSmall,
    color: colors.brand,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  tagText: {
    ...typography.label,
    color: colors.brand,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  area: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  address: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  notes: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  useButton: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    minHeight: spacing.xxl - spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useButtonPressed: {
    backgroundColor: colors.brandDark,
  },
  useButtonText: {
    ...typography.buttonSmall,
    color: colors.textInverse,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: spacing.xxl - spacing.xs,
    borderRadius: radii.md,
  },
  linkButtonPressed: {
    backgroundColor: colors.brandSoft,
  },
  linkButtonText: {
    ...typography.buttonSmall,
    color: colors.brand,
  },
});
