import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RankBadge } from '../../components/RankBadge';
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  Header,
  IconButton,
  Skeleton,
  SkeletonText,
  hapticNotify,
  sportIconName,
} from '../../components/ui';
import { type PartnerCard, useDiscovery } from '../../hooks/useDiscovery';
import { useRankSummary } from '../../hooks/useRankSummary';
import type { Coords } from '../../lib/location';
import { SPORTS, capitalize, sportLabel } from '../../lib/sports';
import type { RootStackParamList } from '../../navigation/types';
import { colors, layout, radii, spacing, typography, zIndex } from '../../theme';
import { RunnerCard } from './components/RunnerCard';

/** Search radius for the Runners feed once we have a fix. */
export const RUNNER_RADIUS_KM = 15;
const MATCH_BANNER_MS = 2000;

/**
 * Stable, collision-proof key for a partner card: `${userId}-${sport}-${index}`
 * (the index guards against a server returning a userId twice).
 */
export function partnerKey(item: PartnerCard, index: number, sport: string): string {
  return `${item.userId}-${sport}-${index}`;
}

export interface RunnersViewProps {
  /** Rounded fix; with it the feed is nearest-first with "2 km away". */
  coords: Coords | null;
}

/** Runners segment: 1:1 partner discovery as a swipeable card deck. */
export function RunnersView({ coords }: RunnersViewProps) {
  const { partners, isLoading, error, sport, setSport, recordAction, fetchMore } = useDiscovery({
    coords,
    radiusKm: coords ? RUNNER_RADIUS_KM : undefined,
  });
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [matchVisible, setMatchVisible] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [previewPartner, setPreviewPartner] = useState<PartnerCard | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    },
    []
  );

  const showMatchBanner = useCallback(() => {
    setMatchVisible(true);
    hapticNotify('success');
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setMatchVisible(false), MATCH_BANNER_MS);
  }, []);

  const handleAction = useCallback(
    async (targetUserId: string, action: 'like' | 'pass' | 'save') => {
      if (actingOn) return;
      setActingOn(targetUserId);
      try {
        const result = await recordAction(targetUserId, action);
        if (action === 'like' && result.matchCreated) showMatchBanner();
      } catch {
        // Card stays visible; the user can retry.
      } finally {
        setActingOn(null);
      }
    },
    [actingOn, recordAction, showMatchBanner]
  );

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

  const people = sport === 'running' ? 'runners' : 'players';
  const top = partners[0];

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.loading} accessibilityLabel={`Finding ${people}`}>
        <Card padding="lg">
          <View style={styles.skeletonHero}>
            <Skeleton circle height={88} />
            <View style={styles.flex}>
              <SkeletonText lines={2} />
            </View>
          </View>
          <SkeletonText lines={3} style={styles.skeletonBody} />
        </Card>
        <Text style={styles.caption}>Finding {people}…</Text>
      </View>
    );
  } else if (error) {
    body = (
      <EmptyState
        icon="alert"
        title="Something went wrong"
        message={error}
        action={{ label: 'Try again', onPress: fetchMore, icon: 'refresh' }}
      />
    );
  } else if (!top) {
    body = (
      <EmptyState
        icon={sportIconName(sport)}
        title={`No ${people} to show right now.`}
        message={
          coords
            ? `Nobody new within ${RUNNER_RADIUS_KM} km yet — new ${people} join every week.`
            : 'Check back soon — new players join every week.'
        }
        action={{ label: 'Refresh', onPress: fetchMore, icon: 'refresh' }}
      />
    );
  } else {
    body = (
      <View style={styles.deck}>
        <RunnerCard
          key={partnerKey(top, 0, sport)}
          partner={top}
          busy={actingOn === top.userId}
          onConnect={() => handleAction(top.userId, 'like')}
          onPass={() => handleAction(top.userId, 'pass')}
          onSave={() => void handleAction(top.userId, 'save')}
          onViewDetails={() => setPreviewPartner(top)}
          onOpenProfile={() => openPublicProfile(top)}
        />
        {partners.length > 1 ? (
          <Text style={styles.caption}>
            {partners.length - 1} more {people} {coords ? 'nearby' : 'to meet'}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
        testID="runner-sport-chips"
      >
        {SPORTS.map(({ id, label }) => (
          <Chip
            key={id}
            label={label}
            icon={sportIconName(id)}
            selected={sport === id}
            onPress={() => setSport(id)}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">
          {sportLabel(sport)} partners
        </Text>
        <Text style={styles.hint}>
          Likes are sport-specific — you'll match when both players like each other for the same sport.
        </Text>
        {body}
      </ScrollView>

      {matchVisible ? (
        <View style={styles.banner} pointerEvents="none" accessibilityLiveRegion="polite">
          <Card variant="brand" padding="md">
            <Text style={styles.bannerEyebrow}>Linked</Text>
            <Text style={styles.bannerText}>Linked up.</Text>
            <Text style={styles.bannerSub}>Say hi in Chats.</Text>
          </Card>
        </View>
      ) : null}

      <PartnerPreviewModal partner={previewPartner} onClose={() => setPreviewPartner(null)} />
    </View>
  );
}

// ─── Partner preview ──────────────────────────────────────────────────────────

function PartnerPreviewModal({
  partner,
  onClose,
}: {
  partner: PartnerCard | null;
  onClose: () => void;
}) {
  const visible = partner !== null;
  // Lazy: only while open. 404 = no badge rather than a fake "Rookie 0".
  const { summary: rankSummary } = useRankSummary({
    userId: partner?.userId ?? null,
    enabled: visible,
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalSheet}>
          <Header
            title="Profile"
            right={
              <IconButton icon="close" accessibilityLabel="Close profile preview" onPress={onClose} />
            }
          />
          {partner ? (
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {partner.photoUrls && partner.photoUrls.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.gallery}
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
                  <Text style={styles.caption}>No photos yet</Text>
                </View>
              )}

              <Text style={styles.previewName}>
                {partner.displayName}
                {partner.age ? `, ${partner.age}` : ''}
              </Text>
              {partner.suburb ? <Text style={styles.hint}>{partner.suburb}</Text> : null}

              {partner.sportProfiles.length > 0 ? (
                <View style={styles.previewBadges}>
                  {partner.sportProfiles.map((sp, idx) => (
                    <Badge
                      key={`${sp.sport}-${idx}`}
                      label={`${sportLabel(sp.sport)} · ${capitalize(sp.level)}`}
                      icon={sportIconName(sp.sport)}
                      size="sm"
                    />
                  ))}
                </View>
              ) : null}

              <RankBadge summary={rankSummary} />

              <Text style={styles.sectionLabel}>About</Text>
              {partner.bio && partner.bio.trim().length > 0 ? (
                <Text style={styles.previewBio}>{partner.bio}</Text>
              ) : (
                <Text style={styles.hint}>This player hasn't added a bio yet.</Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const PHOTO_SIZE = 220;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // A horizontal ScrollView in a column can be squeezed by its flex
  // sibling (the card list) — never let it shrink below the chip height.
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.h3,
    marginTop: spacing.sm,
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  caption: {
    ...typography.caption,
    textAlign: 'center',
  },
  loading: {
    gap: spacing.md,
  },
  skeletonHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonBody: {
    marginTop: spacing.lg,
  },
  deck: {
    gap: spacing.md,
  },
  banner: {
    position: 'absolute',
    top: spacing.xxl,
    left: layout.screenPadding,
    right: layout.screenPadding,
    zIndex: zIndex.toast,
  },
  bannerEyebrow: {
    ...typography.label,
    color: colors.brand,
  },
  bannerText: {
    ...typography.h1,
  },
  bannerSub: {
    ...typography.body,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalSheet: {
    maxHeight: '90%',
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xl,
  },
  modalScroll: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },
  gallery: {
    gap: spacing.sm,
  },
  galleryPhoto: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
  },
  galleryPlaceholder: {
    height: PHOTO_SIZE / 2,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  previewName: {
    ...typography.h1,
    marginTop: spacing.md,
  },
  previewBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    marginTop: spacing.md,
  },
  previewBio: {
    ...typography.bodyLarge,
  },
});
