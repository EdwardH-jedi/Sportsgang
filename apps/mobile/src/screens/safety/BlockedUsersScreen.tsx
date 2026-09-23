import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import {
  Button,
  EmptyState,
  Header,
  Icon,
  Screen,
  Skeleton,
} from '../../components/ui';
import {
  type BlockResponse,
  listBlockedUsers,
  unblockUser,
} from '../../lib/safety';
import { colors, layout, radii, spacing, touchTarget, typography } from '../../theme';
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
    <Screen
      padded={false}
      header={
        <Header
          title="Blocked Users"
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />
      }
    >
      <View style={styles.introRow}>
        <Icon name="info" size="sm" color={colors.textTertiary} />
        <Text style={styles.intro}>
          People you block are restricted from supported interactions such as
          joining your games where supported.
        </Text>
      </View>

      {isLoading ? (
        <View
          style={styles.list}
          accessible
          accessibilityLabel="Loading blocked users"
          accessibilityState={{ busy: true }}
        >
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.row}>
              <Skeleton circle height={touchTarget} />
              <View style={styles.rowText}>
                <Skeleton width="60%" height={spacing.md} />
                <Skeleton width="35%" height={spacing.sm + spacing.xs} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <EmptyState
          icon="alert"
          title="Couldn't load blocked users"
          message={error}
          action={{
            label: 'Try again',
            icon: 'refresh',
            onPress: () => void load(),
            accessibilityLabel: 'Retry loading blocked users',
          }}
        />
      ) : items.length === 0 ? (
        <View style={styles.fill} accessibilityLabel="No blocked users">
          <EmptyState
            icon="shield"
            title="No blocked users"
            message="You haven't blocked anyone yet."
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={RowSeparator}
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

function RowSeparator() {
  return <View style={styles.separator} />;
}

interface BlockRowProps {
  block: BlockResponse;
  isUnblocking: boolean;
  error: string | null;
  onUnblock: () => void;
}

function BlockRow({ block, isUnblocking, error, onUnblock }: BlockRowProps) {
  const dateLabel = formatBlockedDate(block.createdAt);
  return (
    <View
      style={styles.row}
      accessibilityLabel={`Blocked user ${block.blockedId}`}
    >
      <View style={styles.rowIcon}>
        <Icon name="block" size="md" color={colors.textSecondary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {block.blockedId}
        </Text>
        {dateLabel ? <Text style={styles.rowMeta}>{dateLabel}</Text> : null}
        {error ? <Text style={styles.rowErrorText}>{error}</Text> : null}
      </View>
      <Button
        label="Unblock"
        variant="secondary"
        size="sm"
        loading={isUnblocking}
        onPress={onUnblock}
        accessibilityLabel={`Unblock ${block.blockedId}`}
      />
    </View>
  );
}

function formatBlockedDate(iso?: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `Blocked ${d.toLocaleDateString(undefined, {
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  fill: {
    flex: 1,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  intro: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
  },
  rowMeta: {
    ...typography.caption,
  },
  rowErrorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
});
