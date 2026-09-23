import React, { useCallback } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { HonorBadge } from '../../../components/HonorBadge';
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Icon,
  hapticLight,
  sportIconName,
} from '../../../components/ui';
import type { PartnerCard } from '../../../hooks/useDiscovery';
import { useUserHonorSummary } from '../../../hooks/useUserHonorSummary';
import { formatDistanceAway } from '../../../lib/pace';
import { capitalize, sportLabel } from '../../../lib/sports';
import { colors, elevation, motion, radii, spacing, typography } from '../../../theme';

/** Share of the screen width a drag must travel (or be flung) to commit. */
export const SWIPE_THRESHOLD_RATIO = 0.28;
/** Fraction of fling velocity added to the drag when deciding. */
const VELOCITY_PROJECTION = 0.15;
/** Max card tilt while dragging, in degrees. */
const MAX_TILT_DEG = 10;

export type SwipeDirection = 'left' | 'right';

/** Pure decision used by the gesture: commit left/right, or snap back. */
export function swipeDecision(
  translationX: number,
  velocityX: number,
  width: number
): SwipeDirection | null {
  'worklet';
  const projected = translationX + velocityX * VELOCITY_PROJECTION;
  const threshold = width * SWIPE_THRESHOLD_RATIO;
  if (projected > threshold) return 'right';
  if (projected < -threshold) return 'left';
  return null;
}

export interface RunnerCardProps {
  partner: PartnerCard;
  /** Swipe right / Connect. */
  onConnect: () => Promise<void> | void;
  /** Swipe left / Pass. */
  onPass: () => Promise<void> | void;
  onSave: () => void;
  onViewDetails: () => void;
  onOpenProfile: () => void;
  /** An action for this card is in flight. */
  busy: boolean;
}

/**
 * Partner-discovery card. Pan right = Connect, left = Pass (with tilt and
 * a fly-out); the Pass / Save / Connect buttons do the same for anyone
 * who can't or won't swipe. Reduce motion: no tilt or fly-out — the
 * swipe commits in place.
 */
export function RunnerCard({
  partner,
  onConnect,
  onPass,
  onSave,
  onViewDetails,
  onOpenProfile,
  busy,
}: RunnerCardProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const threshold = width * SWIPE_THRESHOLD_RATIO;

  const {
    summary: honorSummary,
    isLoading: honorLoading,
    error: honorError,
  } = useUserHonorSummary({ userId: partner.userId });

  const commit = useCallback(
    async (dir: SwipeDirection) => {
      hapticLight();
      try {
        await (dir === 'right' ? onConnect() : onPass());
      } finally {
        // Still on screen (the action failed): bring the card back.
        x.value = reduceMotion ? 0 : withSpring(0, motion.spring.gentle);
      }
    },
    [onConnect, onPass, reduceMotion, x]
  );

  const pan = Gesture.Pan()
    .withTestId('runner-swipe')
    .enabled(!busy)
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const dir = swipeDecision(e.translationX, e.velocityX, width);
      if (dir === null) {
        x.value = reduceMotion ? 0 : withSpring(0, motion.spring.gentle);
        return;
      }
      if (reduceMotion) {
        x.value = 0;
        scheduleOnRN(commit, dir);
        return;
      }
      const target = (dir === 'right' ? 1 : -1) * width * 1.4;
      x.value = withTiming(target, { duration: motion.duration.slow }, (finished) => {
        if (finished) scheduleOnRN(commit, dir);
      });
    });

  const cardStyle = useAnimatedStyle(() => {
    const tilt = reduceMotion
      ? 0
      : interpolate(x.value, [-width, 0, width], [-MAX_TILT_DEG, 0, MAX_TILT_DEG], Extrapolation.CLAMP);
    return { transform: [{ translateX: x.value }, { rotate: `${tilt}deg` }] };
  });
  const connectStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const passStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const away = formatDistanceAway(partner.distanceKm);
  const photo = partner.avatarUrl ?? partner.photoUrls?.[0] ?? null;
  const place = [partner.suburb, away].filter(Boolean).join(' · ');

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.card, cardStyle]}
        accessibilityHint="Swipe right to connect or left to pass, or use the buttons below."
        testID={`runner-card-${partner.userId}`}
      >
        <Animated.View style={[styles.stamp, styles.stampConnect, connectStamp]} pointerEvents="none">
          <Text style={[styles.stampText, styles.stampTextConnect]} importantForAccessibility="no">
            Connect
          </Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampPass, passStamp]} pointerEvents="none">
          <Text style={styles.stampText} importantForAccessibility="no">
            Pass
          </Text>
        </Animated.View>

        <View style={styles.hero} accessibilityLabel={`${partner.displayName} card`}>
          <Avatar name={partner.displayName} uri={photo} size="xl" ring />
          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={1}>
              {partner.displayName}
              {partner.age ? `, ${partner.age}` : ''}
            </Text>
            {place ? (
              <View style={styles.placeRow}>
                <Icon name="location" size="xs" color={colors.textSecondary} />
                <Text style={styles.place} numberOfLines={1}>
                  {place}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Hidden on a hard error so a network failure isn't mislabelled
            as "New player"; 404 / null still falls through. */}
        {!honorError ? (
          <View style={styles.row}>
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
          <View style={styles.badges}>
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

        {partner.bioExcerpt ? (
          <Text style={styles.bio} numberOfLines={3}>
            {partner.bioExcerpt}
          </Text>
        ) : null}

        <View style={styles.links}>
          <Button label="View details" variant="ghost" size="sm" onPress={onViewDetails} />
          <Button label="View profile" variant="ghost" size="sm" onPress={onOpenProfile} />
        </View>

        <View style={styles.actions}>
          <IconButton
            icon="close"
            variant="outline"
            size="lg"
            accessibilityLabel="Pass"
            onPress={() => void onPass()}
            disabled={busy}
          />
          <IconButton
            icon="star"
            variant="filled"
            size="lg"
            accessibilityLabel="Save"
            onPress={onSave}
            disabled={busy}
          />
          {/* accessibilityLabel stays "Like" (screen-reader + test
              contract); the visible label is "Connect". */}
          <Button
            label="Connect"
            accessibilityLabel="Like"
            leadingIcon="user-plus"
            onPress={() => void onConnect()}
            disabled={busy}
            loading={busy}
            style={styles.connect}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.md,
  },
  stamp: {
    position: 'absolute',
    top: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  stampConnect: {
    right: spacing.lg,
    borderColor: colors.brand,
  },
  stampPass: {
    left: spacing.lg,
    borderColor: colors.textSecondary,
  },
  stampText: {
    ...typography.statSmall,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  stampTextConnect: {
    color: colors.brand,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    ...typography.h1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  place: {
    ...typography.body,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bio: {
    ...typography.body,
  },
  links: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  connect: {
    flex: 1,
  },
});
