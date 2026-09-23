import { useCallback, useRef } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Avatar,
  Badge,
  EmptyState,
  Header,
  Icon,
  Screen,
  Skeleton,
  sportIconName,
} from '../../components/ui';
import { useMatches } from '../../hooks/useMatches';
import type { MatchSummary as Match } from '../../lib/matches';
import { formatPreviewTimestamp, previewText } from '../../lib/messages';
import { sportLabel } from '../../lib/sports';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

// ─── Chat row ─────────────────────────────────────────────────────────────────

function ChatRow({ match, currentUserId }: { match: Match; currentUserId: string | null }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sportLabelText = sportLabel(match.sport);
  const levelLabel = match.partner.sportProfiles.find((sp) => sp.sport === match.sport)?.level;
  const badgeLabel = levelLabel
    ? `${sportLabelText} · ${levelLabel.charAt(0).toUpperCase()}${levelLabel.slice(1)}`
    : sportLabelText;

  const sanitized = previewText(match.lastMessage);
  // Only attach the "You:" prefix when we're sure the message belongs to
  // the current user — never speculate when `currentUserId` is missing.
  const isMine =
    !!currentUserId && match.lastMessageSenderId === currentUserId;
  const previewBody = sanitized || 'Start the conversation';
  const preview = sanitized && isMine ? `You: ${previewBody}` : previewBody;
  const timestamp = sanitized ? formatPreviewTimestamp(match.lastMessageAt) : '';
  const name = match.partner.displayName;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() =>
        navigation.navigate('Chat', {
          matchId: match.id,
          partnerName: match.partner.displayName,
          partnerId: match.partner.userId,
          sport: match.sport,
        })
      }
      accessibilityRole="button"
      accessibilityLabel={[`Chat with ${name}`, preview, timestamp].filter(Boolean).join(', ')}
    >
      <Avatar name={name} size="lg" />

      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {timestamp ? <Text style={styles.timestamp}>{timestamp}</Text> : null}
        </View>

        <Text
          style={[styles.preview, !sanitized && styles.previewEmpty]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {preview}
        </Text>

        <View style={styles.metaRow}>
          <Badge
            label={badgeLabel}
            tone="brand"
            size="sm"
            icon={sportIconName(match.sport)}
          />
          {match.partner.suburb ? (
            <View style={styles.suburbRow}>
              <Icon name="location" size="xs" color={colors.textTertiary} />
              <Text style={styles.suburb}>{match.partner.suburb}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ChatListSkeleton() {
  return (
    <View
      style={styles.list}
      accessible
      accessibilityLabel="Loading chats"
      accessibilityState={{ busy: true }}
      testID="chats-loading"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton circle height={AVATAR_LG} />
          <View style={styles.rowBody}>
            <Skeleton width="45%" height={spacing.md} />
            <Skeleton width="80%" height={spacing.sm + spacing.xs} />
            <Skeleton width="30%" height={spacing.sm + spacing.xs} />
          </View>
        </View>
      ))}
    </View>
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
    <Screen
      padded={false}
      header={<Header large title="Chats" />}
    >
      {isLoading ? (
        <ChatListSkeleton />
      ) : error ? (
        <EmptyState
          icon="alert"
          title="Something went wrong"
          message={error}
          action={{ label: 'Try again', icon: 'refresh', onPress: fetchMatches }}
        />
      ) : matches.length === 0 ? (
        <EmptyState
          icon="chat"
          title="No matches yet"
          message="Connect with runners you'd train with. When they connect back, your chat shows up here."
        />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ChatRow match={item} currentUserId={currentUserId} />
          )}
          ItemSeparatorComponent={RowSeparator}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
            />
          }
        />
      )}
    </Screen>
  );
}

function RowSeparator() {
  return <View style={styles.separator} />;
}

/** Avatar `lg` diameter — the skeleton circle mirrors it. */
const AVATAR_LG = 56;

const styles = StyleSheet.create({
  list: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginLeft: layout.screenPadding + AVATAR_LG + spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyStrong,
    fontSize: typography.bodyLarge.fontSize,
    flexShrink: 1,
  },
  timestamp: {
    ...typography.caption,
    marginLeft: 'auto',
  },
  preview: {
    ...typography.body,
  },
  previewEmpty: {
    fontStyle: 'italic',
    color: colors.textTertiary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs / 2,
  },
  suburbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
  },
  suburb: {
    ...typography.caption,
  },
});
