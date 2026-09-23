import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { useMatches } from '../../hooks/useMatches';
import type { MatchSummary as Match } from '../../lib/matches';
import { formatPreviewTimestamp, previewText } from '../../lib/messages';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({ match, currentUserId }: { match: Match; currentUserId: string | null }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sportLabelText = sportLabel(match.sport);
  const levelLabel = match.partner.sportProfiles.find((sp) => sp.sport === match.sport)?.level;

  const sanitized = previewText(match.lastMessage);
  // Only attach the "You:" prefix when we're sure the message belongs to
  // the current user — never speculate when `currentUserId` is missing.
  const isMine =
    !!currentUserId && match.lastMessageSenderId === currentUserId;
  const previewBody = sanitized || 'Start the conversation';
  const timestamp = sanitized ? formatPreviewTimestamp(match.lastMessageAt) : '';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() =>
        navigation.navigate('Chat', {
          matchId: match.id,
          partnerName: match.partner.displayName,
          partnerId: match.partner.userId,
          sport: match.sport,
        })
      }
      accessibilityRole="button"
    >
      <View style={styles.cardAvatar}>
        <Text style={styles.cardAvatarText}>
          {match.partner.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {match.partner.displayName}
          </Text>
          {timestamp ? (
            <Text style={styles.cardTimestamp}>{timestamp}</Text>
          ) : null}
        </View>

        <Text
          style={[
            styles.cardPreview,
            !sanitized && styles.cardPreviewEmpty,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {sanitized && isMine ? `You: ${previewBody}` : previewBody}
        </Text>

        <View style={styles.cardMetaRow}>
          {match.partner.suburb ? (
            <Text style={styles.cardSuburb}>{match.partner.suburb}</Text>
          ) : null}
          <View style={styles.sportBadge}>
            <Text style={styles.sportBadgeText}>
              {sportLabelText}
              {levelLabel ? ` · ${levelLabel.charAt(0).toUpperCase()}${levelLabel.slice(1)}` : ''}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function MatchesScreen() {
  const {
    items: matches,
    isLoading,
    isRefreshing,
    error,
    refresh: fetchMatches,
    pullToRefresh: handleRefresh,
    revalidate,
  } = useMatches();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

  // Refresh on tab focus so the preview line stays in sync after the user
  // returns from a chat. Cheaper than wiring a per-match WebSocket
  // subscription into the list, and matches the existing pull-to-refresh
  // contract — the preview is at most one round-trip stale.
  //
  // Skip the very first focus — useMatches already fires the initial fetch.
  // A ref (not the `isLoading` flag) decides this: the memoised callback
  // would otherwise capture the first render's `isLoading === true` forever
  // and the focus refresh would never run.
  const didMountRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      void revalidate();
    }, [revalidate])
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Mutual interest</Text>
        <Text style={styles.title}>Matches</Text>
      </View>

      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            onPress={fetchMatches}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centred}>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptyBody}>
            Tap players you'd train with.{'\n'}When they tap back, they show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MatchCard match={item} currentUserId={currentUserId} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.h2,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textSecondary,
    maxWidth: 260,
    lineHeight: 22,
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
  retryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.65,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textInverse,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardName: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cardTimestamp: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginLeft: 'auto',
  },
  cardPreview: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardPreviewEmpty: {
    fontStyle: 'italic',
    color: colors.textTertiary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  cardSuburb: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  sportBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.separator,
  },
  sportBadgeText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
