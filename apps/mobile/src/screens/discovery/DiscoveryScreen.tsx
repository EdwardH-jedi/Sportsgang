import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { HonorBadge } from '../../components/HonorBadge';
import { RankBadge } from '../../components/RankBadge';
import { Screen } from '../../components/Screen';
import { useDiscovery, PartnerCard } from '../../hooks/useDiscovery';
import { useRankSummary } from '../../hooks/useRankSummary';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import { SPORTS, isSport, getSport, sportLabel } from '../../lib/sports';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

/**
 * FlatList key for a partner card.
 *
 * The discovery feed is fetched per-sport, but real-device QA observed
 * "Encountered two children with the same key" warnings keyed by a UUID
 * — i.e. the same `userId` appeared more than once in a single fetch.
 * The minimum-collision-resistant key is `${userId}-${sport}-${index}`:
 *   - `userId` keeps the key stable for a given partner across renders
 *     when the list shape doesn't change (the common case),
 *   - `sport` future-proofs against a cross-sport feed,
 *   - `index` is the tiebreaker for the rare case where the server hands
 *     back duplicate userIds within a single sport-fetch (server bug
 *     ceiling — the client should not crash on it).
 *
 * Exported so the contract can be unit-tested directly. Render-time
 * assertions on console.error from the RN test renderer are flaky;
 * asserting the function output for known inputs is unambiguous.
 */
export function partnerKey(item: PartnerCard, index: number, sport: string): string {
  return `${item.userId}-${sport}-${index}`;
}

// ─── Match banner ─────────────────────────────────────────────────────────────

function MatchBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.matchBanner} pointerEvents="none">
      <Text style={styles.matchBannerEyebrow}>Linked</Text>
      <Text style={styles.matchBannerText}>Linked up.</Text>
    </View>
  );
}

// ─── Hero / avatar ────────────────────────────────────────────────────────────

/**
 * Per-sport hero palette. v1 uses an initials avatar on a sport-keyed
 * "gradient" instead of real partner photos — the cards are 100%
 * `View` / `Text` so screenshots never depend on user-uploaded media,
 * external images, or any copyrighted asset.
 *
 * Each entry is a top color (bright sport identity) + a bottom color
 * (always near-black) — the fade between is faked with stacked
 * semi-transparent fills, no gradient library required.
 */
const HERO_BOTTOM = '#0A0A0A';

function getSportHeroPalette(sport: string) {
  // Top colours live in the sport registry; unknown sports fall back to
  // the gym entry's electric lime (the brand colour).
  const top = getSport(isSport(sport) ? sport : 'gym').heroColor;
  return { top, bottom: HERO_BOTTOM };
}

function CardHero({
  displayName,
  age,
  suburb,
  sport,
}: {
  displayName: string;
  age?: number | null;
  suburb?: string | null;
  sport: string;
}) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
  const ageStr = age ? `, ${age}` : '';
  const palette = getSportHeroPalette(sport);

  return (
    <View
      style={[styles.hero, { backgroundColor: palette.bottom }]}
      accessibilityLabel={`${displayName} card`}
    >
      {/* Top band — full bright sport color, occupies the upper portion. */}
      <View
        style={[styles.heroTopBand, { backgroundColor: palette.top }]}
      />
      {/* Mid fade — semi-transparent bottom color overlapping the band so
          the join reads as a smooth gradient instead of a hard edge. */}
      <View
        style={[styles.heroFade, { backgroundColor: palette.bottom }]}
      />

      {/* Initials chip — centered in the bright upper area. White ring +
          translucent fill so the chip reads cleanly on any sport color. */}
      <View style={styles.heroInitialsWrap}>
        <View style={styles.heroInitialsRing}>
          <View style={styles.heroInitialsCircle}>
            <Text style={styles.heroInitialsText}>{initials || '·'}</Text>
          </View>
        </View>
      </View>

      {/* Bottom darken so the name + suburb stay legible regardless of
          which sport palette is active. */}
      <View style={styles.heroDarken} />

      <View style={styles.heroOverlay}>
        <Text style={styles.heroName}>
          {displayName}
          {ageStr}
        </Text>
        {suburb ? <Text style={styles.heroSuburb}>{suburb}</Text> : null}
      </View>
    </View>
  );
}

// ─── Sport badge ──────────────────────────────────────────────────────────────

function SportBadge({ sport, level }: { sport: string; level: string }) {
  const label = `${sportLabel(sport)} · ${level.charAt(0).toUpperCase() + level.slice(1)}`;
  return (
    <View style={styles.sportBadge}>
      <Text style={styles.sportBadgeText}>{label}</Text>
    </View>
  );
}

// ─── Partner card ─────────────────────────────────────────────────────────────

interface PartnerCardProps {
  partner: PartnerCard;
  sport: string;
  onLike: () => void;
  onPass: () => void;
  onSave: () => void;
  onViewDetails: () => void;
  actionInFlight: boolean;
}

interface PartnerCardViewExtraProps {
  onOpenProfile: () => void;
}

function PartnerCardView({
  partner,
  sport,
  onLike,
  onPass,
  onSave,
  onViewDetails,
  actionInFlight,
  onOpenProfile,
}: PartnerCardProps & PartnerCardViewExtraProps) {
  // Honor badge data — cached + deduped at the lib layer so showing
  // multiple partners doesn't fan out into per-card requests.
  const {
    summary: honorSummary,
    isLoading: honorLoading,
    error: honorError,
  } = useUserHonorSummary({ userId: partner.userId });

  return (
    <View style={styles.card}>
      <CardHero
        displayName={partner.displayName}
        age={partner.age}
        suburb={partner.suburb}
        sport={sport}
      />

      <View style={styles.cardBody}>
        {/* Honor row — hidden on hard error so a network failure isn't
            mislabelled as "New player". 404/null still falls through. */}
        {!honorError ? (
          <View style={styles.honorRow}>
            <HonorBadge
              honorLevel={honorSummary?.honorLevel ?? null}
              honorScore={honorSummary?.honorScore ?? null}
              isLoading={honorLoading && !honorSummary}
              accessibilityLabel={
                honorSummary
                  ? `${partner.displayName} honor ${honorSummary.honorLevel}`
                  : `${partner.displayName} honor unavailable`
              }
            />
          </View>
        ) : null}

        {partner.sportProfiles.length > 0 ? (
          <View style={styles.sportBadges}>
            {/* Index suffix defends against a partner record that has
                duplicate sport entries (legacy data or a server bug). */}
            {partner.sportProfiles.map((sp, idx) => (
              <SportBadge
                key={`${sp.sport}-${idx}`}
                sport={sp.sport}
                level={sp.level}
              />
            ))}
          </View>
        ) : null}

        {partner.bioExcerpt ? (
          <Text style={styles.bio} numberOfLines={3}>
            {partner.bioExcerpt}
          </Text>
        ) : null}

        {/* Surface a tap target so the user can see full bio + photo
            gallery without committing to a like/pass. The accessibility
            label is sport-agnostic so screen readers don't repeat the
            sport context already announced by the card header. */}
        <View style={styles.detailRow}>
          <Pressable
            onPress={onViewDetails}
            accessibilityRole="button"
            accessibilityLabel="View details"
            style={({ pressed }) => [styles.viewDetails, pressed && styles.pressed]}
          >
            <Text style={styles.viewDetailsText}>View details</Text>
          </Pressable>
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="View profile"
            style={({ pressed }) => [styles.viewDetails, pressed && styles.pressed]}
          >
            <Text style={styles.viewDetailsText}>View profile</Text>
          </Pressable>
        </View>

        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionPass,
              pressed && styles.pressed,
            ]}
            onPress={onPass}
            disabled={actionInFlight}
            accessibilityRole="button"
            accessibilityLabel="Pass"
          >
            <Text style={styles.actionPassText}>Pass</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionSave,
              pressed && styles.pressed,
            ]}
            onPress={onSave}
            disabled={actionInFlight}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text style={styles.actionSaveText}>Save</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionLike,
              pressed && styles.pressed,
            ]}
            onPress={onLike}
            disabled={actionInFlight}
            accessibilityRole="button"
            // accessibilityLabel stays "Like" so existing test selectors
            // and screen-reader contracts keep working unchanged. The
            // visible label is "Connect" — same action, V1-safe wording
            // (no dating/gang language). Sport context lives in the
            // header title and the helper line above the cards.
            accessibilityLabel="Like"
          >
            <Text style={styles.actionLikeText}>Connect</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DiscoveryScreen() {
  const { partners, isLoading, error, sport, setSport, recordAction, fetchMore } =
    useDiscovery();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [matchVisible, setMatchVisible] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [previewPartner, setPreviewPartner] = useState<PartnerCard | null>(null);

  const openPublicProfile = useCallback(
    (partner: PartnerCard) => {
      navigation.navigate('PublicProfile', {
        userId: partner.userId,
        displayName: partner.displayName,
        suburb: partner.suburb,
        bio: partner.bio,
        sports: partner.sportProfiles.map((sp) => sp.sport),
      });
    },
    [navigation]
  );

  const showMatchBanner = useCallback(() => {
    setMatchVisible(true);
    setTimeout(() => setMatchVisible(false), 2000);
  }, []);

  const handleAction = useCallback(
    async (targetUserId: string, action: 'like' | 'pass' | 'save') => {
      if (actingOn) return;
      setActingOn(targetUserId);
      try {
        const result = await recordAction(targetUserId, action);
        if (action === 'like' && result.matchCreated) {
          showMatchBanner();
        }
      } catch {
        // silently swallow action errors — card stays visible, user can retry
      } finally {
        setActingOn(null);
      }
    },
    [actingOn, recordAction, showMatchBanner]
  );

  const renderItem = useCallback(
    ({ item }: { item: PartnerCard }) => (
      <PartnerCardView
        partner={item}
        sport={sport}
        onLike={() => handleAction(item.userId, 'like')}
        onPass={() => handleAction(item.userId, 'pass')}
        onSave={() => handleAction(item.userId, 'save')}
        onViewDetails={() => setPreviewPartner(item)}
        onOpenProfile={() => openPublicProfile(item)}
        actionInFlight={actingOn === item.userId}
      />
    ),
    [actingOn, handleAction, openPublicProfile, sport]
  );

  return (
    <Screen padded={false}>
      {/* Header — title is sport-aware so the user always sees which sport
          this feed and these likes are tied to. Real-device QA showed two
          users could like each other for *different* sports and get no
          match, because the sport context wasn't visible enough. */}
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Sydney</Text>
          <Text style={styles.headerTitle}>{sportLabel(sport)} partners</Text>
        </View>
      </View>

      {/* Sport toggle — pill chips */}
      <View style={styles.sportToggle}>
        {SPORTS.map(({ id: s, label }) => (
          <Pressable
            key={s}
            style={({ pressed }) => [
              styles.sportTab,
              sport === s && styles.sportTabActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setSport(s)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: sport === s }}
          >
            <Text
              style={[
                styles.sportTabText,
                sport === s && styles.sportTabTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Sport-specific match rule. This line is the smallest possible UI
          fix for the QA confusion: testers liked each other for different
          sports and expected a match. The rule is now visible in the same
          glance as the sport tabs. */}
      <Text style={styles.matchRuleHint}>
        Likes are sport-specific — you'll match when both players like each other for the same sport.
      </Text>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Finding players...</Text>
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMore}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : partners.length === 0 ? (
        <View style={styles.centred}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>·</Text>
          </View>
          <Text style={styles.emptyTitle}>No players to show right now.</Text>
          <Text style={styles.emptyBody}>Check back soon — new players join every week.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMore}
          >
            <Text style={styles.retryText}>Refresh</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item, index) => partnerKey(item, index, sport)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <MatchBanner visible={matchVisible} />

      <PartnerPreviewModal
        partner={previewPartner}
        onClose={() => setPreviewPartner(null)}
      />
    </Screen>
  );
}

// ─── Partner preview modal ────────────────────────────────────────────────────

interface PartnerPreviewModalProps {
  partner: PartnerCard | null;
  onClose: () => void;
}

function PartnerPreviewModal({ partner, onClose }: PartnerPreviewModalProps) {
  const visible = partner !== null;
  // Fetch the partner's public rank summary lazily — only while the modal
  // is visible AND we have a userId. The hook treats 404 as no-data so a
  // brand-new player simply renders no badge (no fake "Rookie 0" pill).
  const { summary: rankSummary } = useRankSummary({
    userId: partner?.userId ?? null,
    enabled: visible,
  });
  // Render nothing structurally when there's no partner — `visible` controls
  // the Modal animation. We still need a `partner` reference for the body
  // when visible; the early return below keeps null-safety simple.
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Profile</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close profile preview"
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>

          {partner ? (
            <ScrollView
              contentContainerStyle={styles.modalScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo gallery — horizontal carousel of all uploaded
                  photos. Falls back to a brand-tinted placeholder when
                  the partner hasn't uploaded any. */}
              {partner.photoUrls && partner.photoUrls.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.gallery}
                  contentContainerStyle={styles.galleryContent}
                >
                  {partner.photoUrls.map((uri, idx) => (
                    <Image
                      key={`${uri}-${idx}`}
                      source={{ uri }}
                      style={styles.galleryPhoto}
                      resizeMode="cover"
                      accessibilityLabel={`${partner.displayName} photo ${idx + 1}`}
                    />
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.galleryPlaceholder}>
                  <Text style={styles.galleryPlaceholderText}>
                    No photos yet
                  </Text>
                </View>
              )}

              <Text style={styles.previewName}>
                {partner.displayName}
                {partner.age ? `, ${partner.age}` : ''}
              </Text>
              {partner.suburb ? (
                <Text style={styles.previewSuburb}>{partner.suburb}</Text>
              ) : null}

              {partner.sportProfiles.length > 0 ? (
                <View style={styles.previewBadges}>
                  {partner.sportProfiles.map((sp, idx) => (
                    <SportBadge
                      key={`${sp.sport}-${idx}`}
                      sport={sp.sport}
                      level={sp.level}
                    />
                  ))}
                </View>
              ) : null}

              <RankBadge summary={rankSummary} />

              <Text style={styles.previewSectionTitle}>About</Text>
              {partner.bio && partner.bio.trim().length > 0 ? (
                <Text style={styles.previewBio}>{partner.bio}</Text>
              ) : (
                <Text style={styles.previewBioEmpty}>
                  This player hasn't added a bio yet.
                </Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HERO_HEIGHT = 280;

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brand,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.h2,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  filterIcon: {
    ...typography.label,
    color: colors.textTertiary,
  },

  // Sport toggle (pill chips)
  sportToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Sport-specific match-rule hint shown directly under the sport tabs.
  // Tertiary text colour so it reads as helper copy, not validation error.
  matchRuleHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sportTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sportTabActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  sportTabText: {
    ...typography.button,
    fontSize: 14,
    color: colors.textSecondary,
  },
  sportTabTextActive: {
    color: colors.textInverse,
  },

  // List
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.separator,
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },

  // Hero
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    overflow: 'hidden',
    // backgroundColor is set inline per-sport.
  },
  heroTopBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Bright sport color occupies the upper ~62%; the lower ~38% is the
    // dark base color set on the hero parent.
    height: HERO_HEIGHT * 0.62,
  },
  heroFade: {
    // Sits over the band's bottom edge; semi-transparent dark fill
    // approximates a soft top→bottom fade without a gradient library.
    position: 'absolute',
    left: 0,
    right: 0,
    top: HERO_HEIGHT * 0.32,
    height: HERO_HEIGHT * 0.4,
    opacity: 0.55,
  },
  heroInitialsWrap: {
    position: 'absolute',
    top: HERO_HEIGHT * 0.18,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  heroInitialsRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroInitialsCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitialsText: {
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1.5,
    // Hardcoded white: the initials chip is rendered on a sport-coloured
    // band that varies per card, but white reads on every band in this
    // palette set.
    color: '#FFFFFF',
  },
  heroDarken: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT * 0.5,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    // Hardcoded white: the hero darken overlay is the same on every card so
    // light text is the contract here, independent of theme `textInverse`.
    color: '#FFFFFF',
  },
  heroSuburb: {
    ...typography.bodyLarge,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
  },

  // Card body
  cardBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sportBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sportBadge: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sportBadgeText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.brand,
  },
  bio: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    lineHeight: 24,
  },

  // Actions
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  actionPass: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPassText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  actionSave: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionSaveText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  actionLike: {
    backgroundColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionLikeText: {
    ...typography.button,
    color: colors.textInverse,
  },

  // Centred container (loading / empty / error)
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.full,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyIconText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.brand,
    lineHeight: 36,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  retryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryText: {
    ...typography.button,
    color: colors.textInverse,
  },

  pressed: {
    opacity: 0.65,
  },

  // Match banner
  matchBanner: {
    position: 'absolute',
    top: '38%',
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    shadowColor: colors.brandDarkest,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  matchBannerEyebrow: {
    ...typography.label,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  matchBannerText: {
    ...typography.h2,
    color: colors.textInverse,
  },

  // Honor pill row above the sport badges
  honorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },

  // View details row + preview modal
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  viewDetails: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    alignSelf: 'flex-start',
  },
  viewDetailsText: {
    ...typography.bodySmall,
    color: colors.brand,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '88%',
    paddingTop: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalClose: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modalCloseText: {
    ...typography.button,
    color: colors.brand,
  },
  modalScroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  gallery: {
    marginBottom: spacing.lg,
  },
  galleryContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  galleryPhoto: {
    width: 220,
    height: 280,
    borderRadius: radii.lg,
    backgroundColor: colors.inputBackground,
  },
  galleryPlaceholder: {
    height: 200,
    borderRadius: radii.lg,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  galleryPlaceholderText: {
    ...typography.body,
    color: colors.brand,
    fontWeight: '600',
  },
  previewName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  previewSuburb: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    marginTop: 2,
  },
  previewBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  previewSectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  previewBio: {
    ...typography.bodyLarge,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  previewBioEmpty: {
    ...typography.body,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
});
