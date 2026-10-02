/**
 * Group session card (Explore sessions list, My Plans).
 *
 * Shows only stored facts: Sydney start time, meeting point / course,
 * sport-specific detail chips and total capacity including the host
 * ("4 golfers · 1 spot left"). Legacy events without v2 details render
 * without chips.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { EventSummary } from '@protin/shared-types';

import { Card, ChipRow, InfoChip } from './ui';
import { capacityText, sessionChips, sessionNoun } from '../lib/events';
import { formatSydneyDateTime } from '../lib/sydneyTime';
import { colors, spacing, typography } from '../theme';

export interface SessionCardProps {
  event: EventSummary;
  onPress: () => void;
  /** When known, marks sessions the viewer hosts. */
  currentUserId?: string | null;
}

export function SessionCard({ event, onPress, currentUserId }: SessionCardProps) {
  const hosting = !!currentUserId && event.hostUserId === currentUserId;
  const chips = sessionChips(event);
  const when = formatSydneyDateTime(event.startsAt);
  const capacity = capacityText(event);
  const badge = hosting ? 'Hosting' : event.hasJoined ? 'Joined' : null;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${event.title}, ${sessionNoun(event.sport)}, ${when}, ${event.locationText}, ${capacity}`}
      style={styles.card}
      testID={`session-card-${event.id}`}
    >
      <View style={styles.topRow}>
        <Text style={styles.when}>{when}</Text>
        {badge ? <InfoChip label={badge} tone="brand" /> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.location} numberOfLines={2}>
        {event.locationText}
      </Text>
      {chips.length > 0 ? (
        <View style={styles.chips}>
          <ChipRow>
            {chips.map((c) => (
              <InfoChip key={c} label={c} />
            ))}
          </ChipRow>
        </View>
      ) : null}
      <Text
        style={[
          styles.capacity,
          (event.status === 'cancelled' || event.spotsLeft <= 0) && styles.capacityMuted,
        ]}
      >
        {capacity}
      </Text>
      {event.host ? <Text style={styles.host}>Hosted by {event.host.displayName}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  when: { fontSize: 14, fontWeight: '600', color: colors.accent, flexShrink: 1 },
  title: { ...typography.h3, marginTop: spacing.xs },
  location: { ...typography.body, marginTop: 2 },
  chips: { marginTop: spacing.sm },
  capacity: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginTop: spacing.sm },
  capacityMuted: { color: colors.textSecondary },
  host: { ...typography.bodySmall, marginTop: 2 },
});
