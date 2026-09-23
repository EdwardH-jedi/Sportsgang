import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HonorBadge } from '../../components/HonorBadge';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Header,
  Icon,
  Screen,
  SkeletonText,
  StatBlock,
  sportIconName,
} from '../../components/ui';
import { useUserHonorSummary } from '../../hooks/useUserHonorSummary';
import { blockUser } from '../../lib/safety';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, spacing, typography } from '../../theme';
import type { PublicProfileScreenProps } from '../../navigation/types';

/**
 * Public-safe view of another user.
 *
 * Renders only the fields a viewer is allowed to see — display name,
 * suburb, bio, sports — plus a sanitized Honor / Gang Score summary
 * fetched from /rank/users/{id}. Never renders moderation data,
 * attendance rows, attendance notes, or block/report records.
 */
export function PublicProfileScreen({
  navigation,
  route,
}: PublicProfileScreenProps) {
  const { userId, displayName, suburb, bio, sports } = route.params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isSelf = currentUserId !== null && currentUserId === userId;

  const {
    summary,
    isLoading: honorLoading,
    error: honorError,
  } = useUserHonorSummary({ userId });

  const [isBlocking, setIsBlocking] = useState(false);

  const handleBlock = async () => {
    if (isBlocking) return;
    Alert.alert(
      'Block this user?',
      'Blocked users will be restricted from joining your games where supported.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            setIsBlocking(true);
            try {
              await blockUser(userId);
              Alert.alert(
                'User blocked',
                'You will no longer see games hosted by this user.'
              );
              navigation.goBack();
            } catch (err) {
              Alert.alert(
                "Couldn't block this user",
                err instanceof Error ? err.message : 'Please try again.'
              );
            } finally {
              setIsBlocking(false);
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    navigation.navigate('Report', {
      reportedUserId: userId,
      reportedName: displayName ?? 'this user',
    });
  };

  const showSafetyActions = !isSelf;
  // Hide the Honor block entirely on a hard error so a network failure
  // isn't mislabelled as "New player". 404 / no-summary flows through
  // to the HonorBadge fallback.
  const showHonorBlock = !honorError;

  return (
    <Screen
      padded={false}
      header={
        <Header
          title="Profile"
          onBack={() => navigation.goBack()}
          backLabel="Back"
          style={styles.header}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.identityBlock}>
          <Avatar name={displayName ?? 'Player'} size="xl" />
          <Text style={styles.displayName} accessibilityRole="header">
            {displayName ?? 'Player'}
          </Text>
          {suburb ? (
            <View style={styles.suburbRow}>
              <Icon name="location" size="sm" color={colors.textSecondary} />
              <Text style={styles.suburb}>{suburb}</Text>
            </View>
          ) : null}
          {sports && sports.length > 0 ? (
            <View style={styles.chipRow}>
              {sports.map((s) => (
                <Badge key={s} label={capitalize(s)} tone="brand" icon={sportIconName(s)} />
              ))}
            </View>
          ) : null}
        </View>

        {showHonorBlock ? (
          <Card variant="elevated" padding="lg" style={styles.card} accessibilityLabel="Honor summary">
            <View style={styles.honorRow}>
              <Text style={styles.cardTitle}>Honor</Text>
              <HonorBadge
                honorLevel={summary?.honorLevel ?? null}
                honorScore={summary?.honorScore ?? null}
                isLoading={honorLoading && !summary}
                accessibilityLabel={
                  summary
                    ? `Honor ${summary.honorLevel} ${summary.honorScore}`
                    : 'Honor unavailable'
                }
              />
            </View>
            <Text style={styles.cardCopy}>
              Honor reflects attendance, fair play, and reliable hosting.
            </Text>
            {summary ? (
              <View style={styles.statsRow}>
                <StatBlock label="Gang Score" value={summary.gangScore} size="sm" style={styles.stat} />
                <StatBlock
                  label="Completed games"
                  value={summary.completedGamesCount}
                  size="sm"
                  style={styles.stat}
                />
                <StatBlock label="No-shows" value={summary.noShowCount} size="sm" style={styles.stat} />
              </View>
            ) : null}
            {summary && summary.sportLevels.length > 0 ? (
              <View style={styles.sportsBlock}>
                <Text style={styles.sectionLabel}>Sport levels</Text>
                {summary.sportLevels.map((s) => (
                  <View key={s.sport} style={styles.sportRow}>
                    <Icon name={sportIconName(s.sport)} size="sm" color={colors.textSecondary} />
                    <Text style={styles.sportName}>{capitalize(s.sport)}</Text>
                    <Text style={styles.sportLevel}>
                      Lv {s.level} - {s.xp} XP
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {honorLoading && !summary ? (
              <View accessibilityLabel="Loading Honor summary" style={styles.loadingRow}>
                <SkeletonText lines={2} />
              </View>
            ) : null}
          </Card>
        ) : null}

        {bio ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>About</Text>
            <Text style={styles.bioText}>{bio}</Text>
          </Card>
        ) : null}

        {showSafetyActions ? (
          <View style={styles.safetyActions}>
            <Button
              label="Report user"
              variant="secondary"
              leadingIcon="flag"
              fullWidth
              onPress={handleReport}
              accessibilityLabel="Report user"
            />
            <Button
              label={isBlocking ? 'Blocking…' : 'Block user'}
              variant="destructive"
              leadingIcon="block"
              fullWidth
              disabled={isBlocking}
              onPress={() => void handleBlock()}
              accessibilityLabel="Block user"
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  identityBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  displayName: {
    ...typography.h2,
    textAlign: 'center',
  },
  suburbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  suburb: {
    ...typography.body,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs + spacing.xs / 2,
    marginTop: spacing.xs,
  },
  card: {
    gap: spacing.sm + spacing.xs,
  },
  honorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    ...typography.h3,
  },
  cardCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  stat: {
    flex: 1,
  },
  sportsBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sportName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  sportLevel: {
    ...typography.body,
    color: colors.brand,
  },
  loadingRow: {
    paddingVertical: spacing.sm,
  },
  bioText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  safetyActions: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
