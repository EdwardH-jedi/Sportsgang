import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../../components/Screen';
import {
  type BlockResponse,
  listBlockedUsers,
  unblockUser,
} from '../../lib/safety';
import { parseInstant } from '../../lib/instant';
import { colors, radii, spacing, typography } from '../../theme';
import type { BlockedUsersScreenProps } from '../../navigation/types';

/**
 * Self-service management of the caller's blocked-user list.
 *
 * Copy is deliberately scoped:
 *   - "restricted from supported interactions" — no chat-blocking claim.
 *   - No AI moderation, instant enforcement, or verified identity wording.
 *
 * The screen consumes the existing GET /blocks + DELETE /blocks/{id}
 * endpoints; no backend change is required.
 */
export function BlockedUsersScreen({ navigation }: BlockedUsersScreenProps) {
  const [items, setItems] = useState<BlockResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listBlockedUsers();
      setItems(data.items ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load blocked users.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestUnblock = (block: BlockResponse) => {
    Alert.alert(
      'Unblock this user?',
      'They may be able to interact with you again in supported areas.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () => void performUnblock(block),
        },
      ]
    );
  };

  const performUnblock = async (block: BlockResponse) => {
    if (unblockingId) return;
    setUnblockingId(block.blockedId);
    setRowErrors((prev) => {
      if (!(block.blockedId in prev)) return prev;
      const next = { ...prev };
      delete next[block.blockedId];
      return next;
    });
    try {
      await unblockUser(block.blockedId);
      // Drop the row optimistically — the API has returned 204.
      setItems((prev) =>
        prev.filter((b) => b.blockedId !== block.blockedId)
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not unblock this user.';
      setRowErrors((prev) => ({ ...prev, [block.blockedId]: msg }));
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Blocked Users</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.intro}>
        People you block are restricted from supported interactions such as
        joining your games where supported.
      </Text>

      {isLoading ? (
        <View style={styles.centered} accessibilityLabel="Loading blocked users">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading blocked users"
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered} accessibilityLabel="No blocked users">
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptyBody}>You haven't blocked anyone yet.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <BlockRow
              block={item}
              isUnblocking={unblockingId === item.blockedId}
              error={rowErrors[item.blockedId] ?? null}
              onUnblock={() => requestUnblock(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

interface BlockRowProps {
  block: BlockResponse;
  isUnblocking: boolean;
  error: string | null;
  onUnblock: () => void;
}

function BlockRow({ block, isUnblocking, error, onUnblock }: BlockRowProps) {
  const dateLabel = formatBlockedDate(block.createdAt);
  // Never show the raw user id; it means nothing to the person reading it.
  const name = block.blockedDisplayName || 'Unnamed member';
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Blocked user ${name}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        {dateLabel ? <Text style={styles.rowMeta}>{dateLabel}</Text> : null}
        {error ? <Text style={styles.rowErrorText}>{error}</Text> : null}
      </View>
      <Pressable
        onPress={onUnblock}
        disabled={isUnblocking}
        accessibilityRole="button"
        accessibilityLabel={`Unblock ${name}`}
        accessibilityState={{ disabled: isUnblocking }}
        style={({ pressed }) => [
          styles.unblockButton,
          pressed && !isUnblocking && styles.pressed,
        ]}
      >
        {isUnblocking ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <Text style={styles.unblockText}>Unblock</Text>
        )}
      </Pressable>
    </View>
  );
}

function formatBlockedDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    const ms = parseInstant(iso);
    if (Number.isNaN(ms)) return null;
    return `Blocked ${new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSpacer: { width: 32 },
  intro: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.brand,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  separator: { height: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowMeta: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  rowErrorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
  unblockButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: 'transparent',
    minWidth: 88,
    alignItems: 'center',
  },
  unblockText: {
    ...typography.button,
    fontSize: 13,
    color: colors.brand,
  },
  pressed: { opacity: 0.65 },
});
