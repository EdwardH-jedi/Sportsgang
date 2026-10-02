import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompatibilityTier, PartnerSportSummary } from '@protin/shared-types';

import { Button, ChipRow, InfoChip } from '../../components/ui';
import type { FeedCard } from '../../hooks/useDiscovery';
import { golfChips, runChips } from '../../lib/sportPreferences';
import { colors, radii, spacing, typography } from '../../theme';

export const TIER_LABEL: Record<CompatibilityTier, { text: string; tone: 'brand' | 'warning' | 'neutral' }> = {
  compatible: { text: 'Fits both ways', tone: 'brand' },
  unverified: { text: 'Pace not confirmed', tone: 'warning' },
  needs_setup: { text: 'Preferences not set', tone: 'neutral' },
};

export function sportSummaryFor(card: FeedCard): PartnerSportSummary | undefined {
  return card.sportProfiles.find((sp) => sp.sport === card.feedSport);
}

export function sportChipsFor(card: FeedCard): string[] {
  const summary = sportSummaryFor(card);
  if (!summary || !summary.preferencesConfigured) return [];
  return card.feedSport === 'golf' ? golfChips(summary) : runChips(summary);
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

export function Avatar({ card, size = 52 }: { card: FeedCard; size?: number }) {
  const uri = card.photoUrls?.[0] ?? card.avatarUrl;
  const dims = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[styles.avatar, dims]} accessibilityIgnoresInvertColors accessible={false} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, dims]} accessible={false}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials(card.displayName)}</Text>
    </View>
  );
}

interface Props {
  card: FeedCard;
  busy: boolean;
  onOpen: () => void;
  onInterest: () => void;
  onPass: () => void;
}

/**
 * Explore partner card. Sport fit comes first (handicap / intent or pace /
 * distance / style), then the factual reasons from the API; the gallery
 * and full bio live on PartnerDetail.
 */
export function PartnerCardView({ card, busy, onOpen, onInterest, onPass }: Props) {
  const tier = card.compatibility ? TIER_LABEL[card.compatibility.tier] : null;
  const chips = sportChipsFor(card);
  const reasons = card.compatibility?.reasons.slice(0, 3) ?? [];
  const caveats = card.compatibility?.caveats.slice(0, 2) ?? [];
  const meta = [card.age ? `${card.age}` : null, card.suburb].filter(Boolean).join(' · ');

  return (
    <View style={styles.card} testID={`partner-card-${card.userId}`}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${card.displayName}`}
        accessibilityHint="Opens their running or golf details"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View style={styles.headerRow}>
          <Avatar card={card} />
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={2}>
              {card.displayName}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          </View>
        </View>
        {tier ? (
          <View style={styles.tierRow}>
            <InfoChip label={tier.text} tone={tier.tone} />
          </View>
        ) : null}
        {chips.length > 0 ? (
          <View style={styles.section}>
            <ChipRow>
              {chips.map((chip) => (
                <InfoChip key={chip} label={chip} />
              ))}
            </ChipRow>
          </View>
        ) : null}
        {reasons.length > 0 ? (
          <View style={styles.section}>
            {reasons.map((r) => (
              <Text key={r.code} style={styles.reason}>
                ✓ {r.text}
              </Text>
            ))}
          </View>
        ) : null}
        {caveats.length > 0 ? (
          <View style={styles.sectionTight}>
            {caveats.map((c) => (
              <Text key={c.code} style={styles.caveat}>
                {c.text}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>
      <View style={styles.actions}>
        <Button label="Pass" variant="secondary" onPress={onPass} disabled={busy} style={styles.actionButton} />
        <Button
          label="Show interest"
          onPress={onInterest}
          loading={busy}
          accessibilityHint="If they are interested too, a chat opens"
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    padding: spacing.md,
  },
  pressed: { opacity: 0.8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1 },
  avatar: { backgroundColor: colors.surfaceElevated },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  avatarText: { fontWeight: '700', color: colors.brand },
  name: { ...typography.h3 },
  meta: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  tierRow: { flexDirection: 'row', marginTop: spacing.sm },
  section: { marginTop: spacing.sm },
  sectionTight: { marginTop: spacing.xs },
  reason: { fontSize: 14, lineHeight: 20, color: colors.textPrimary, marginTop: 2 },
  caveat: { fontSize: 13, lineHeight: 18, color: colors.textTertiary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1, paddingHorizontal: spacing.sm },
});
