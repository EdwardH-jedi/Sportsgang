import { useCallback, useEffect, useState } from 'react';
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
import { EmptyState, ErrorState, ScreenHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { formatPreviewTimestamp, previewText } from '../../lib/messages';
import { useAuthStore } from '../../stores/auth';
import { sportLabel } from '../../stores/profile';
import { colors, radii, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PartnerSummary {
  userId: string;
  displayName: string;
  suburb?: string;
  sportProfiles: { sport: string; level: string }[];
}

interface Match {
  id: string;
  sport: string;
  status: string;
  createdAt: string;
  partner: PartnerSummary;
  // Last-message preview fields. All optional so a brand-new match (no
  // messages yet) still satisfies the type — render the empty-state
  // fallback in that case.
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageSenderId?: string | null;
}

interface MatchListResponse {
  items: Match[];
  total: number;
  limit: number;
  offset: number;
}

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);

  const fetchMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<MatchListResponse>('/matches?limit=50');
      setMatches(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await api.get<MatchListResponse>('/matches?limit=50');
      setMatches(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Refresh on tab focus so the preview line stays in sync after the user
  // returns from a chat. Cheaper than wiring a per-match WebSocket
  // subscription into the list, and matches the existing pull-to-refresh
  // contract — the preview is at most one round-trip stale.
  useFocusEffect(
    useCallback(() => {
      // Skip the focus refetch on the very first mount — the useEffect
      // above already fires the initial fetch.
      if (!isLoading) {
        void fetchMatches();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchMatches])
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <ScreenHeader eyebrow="Mutual interest" title="Chats" />
      </View>

      {isLoading ? (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Loading chats" />
        </View>
      ) : error ? (
        <View style={styles.centred}>
          <ErrorState title="Could not load your chats" body={error} onAction={fetchMatches} />
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.centred}>
          <EmptyState
            title="No chats yet"
            body={
              'When you and someone both show interest in Explore, your chat opens here.\n' +
              'Use it to agree a time and propose a session.'
            }
            actionLabel="Go to Explore"
            onAction={() => navigation.navigate('Main', { screen: 'Explore' })}
          />
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
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
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
