import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  StatBlock,
  StatRow,
} from '../../components/ui';
import { useCrew } from '../../hooks/useCrew';
import { isLastOwnerError } from '../../lib/crews';
import { paceBandText, paceBandValue } from '../../lib/pace';
import type { CrewDetailScreenProps } from '../../navigation/types';
import { colors, layout, spacing, typography } from '../../theme';
import { RunCard } from '../run/components/RunCard';
import { memberCountText } from './components/CrewCard';

/**
 * Crew detail: area, pace band, members, upcoming runs, join / leave.
 * Owners can edit, delete and host a run for the crew. Leaving as the
 * last owner (409) explains the options instead of failing silently.
 */
export function CrewDetailScreen({ navigation, route }: CrewDetailScreenProps) {
  const { crewId } = route.params;
  const { crew, isLoading, error, refresh, join, leave, remove } = useCrew(crewId);
  const [busy, setBusy] = useState(false);

  // Refetch on return (e.g. after editing or hosting a run); the first
  // focus is covered by the hook's initial load.
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refresh();
      focusedOnce.current = true;
    }, [refresh])
  );

  const isOwner = crew?.myRole === 'owner';
  const isMember = crew?.myRole != null;

  const runDelete = async () => {
    setBusy(true);
    try {
      await remove();
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't delete the crew.", err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!crew) return;
    Alert.alert(
      `Delete ${crew.name}?`,
      'Members lose the crew. Its upcoming runs stay on as regular group runs.',
      [
        { text: 'Keep crew', style: 'cancel' },
        { text: 'Delete crew', style: 'destructive', onPress: () => void runDelete() },
      ]
    );
  };

  const handleJoin = async () => {
    setBusy(true);
    try {
      await join();
    } catch (err) {
      Alert.alert("Couldn't join the crew.", err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    try {
      const res = await leave();
      if (res?.crewDeleted) navigation.goBack();
    } catch (err) {
      if (isLastOwnerError(err)) {
        Alert.alert(
          "You're the last owner",
          'Other runners are still in this crew, so it needs an owner. Delete the crew instead, or leave once the others have left.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Delete crew', style: 'destructive', onPress: confirmDelete },
          ]
        );
      } else {
        Alert.alert("Couldn't leave the crew.", err instanceof Error ? err.message : 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmLeave = () => {
    if (!crew) return;
    Alert.alert(`Leave ${crew.name}?`, undefined, [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave crew', style: 'destructive', onPress: () => void handleLeave() },
    ]);
  };

  const header = (
    <Header
      title="Crew"
      onBack={() => navigation.goBack()}
      actions={
        isOwner
          ? [
              {
                icon: 'edit',
                accessibilityLabel: 'Edit crew',
                onPress: () => navigation.navigate('CreateCrew', { crewId }),
              },
            ]
          : []
      }
    />
  );

  if (!crew) {
    return (
      <Screen padded={false} header={header}>
        {error ? (
          <EmptyState
            icon="alert"
            title="Couldn't load this crew"
            message={error}
            action={{
              label: 'Try again',
              icon: 'refresh',
              onPress: () => void refresh(),
              accessibilityLabel: 'Retry loading crew',
            }}
          />
        ) : (
          <View style={styles.centred}>
            <ActivityIndicator color={colors.brand} accessibilityLabel="Loading crew" />
          </View>
        )}
      </Screen>
    );
  }

  const pace = paceBandValue(crew.paceMinSecPerKm, crew.paceMaxSecPerKm);
  const hostRun = () =>
    navigation.navigate('CreateBattle', { sport: 'running', crewId: crew.id, crewName: crew.name });

  const footer = isMember ? (
    <Button
      label="Host a run for this crew"
      leadingIcon="plus"
      size="lg"
      fullWidth
      onPress={hostRun}
    />
  ) : (
    <Button label="Join crew" leadingIcon="user-plus" size="lg" fullWidth loading={busy} onPress={() => void handleJoin()} />
  );

  return (
    <Screen padded={false} scroll header={header} footer={footer}>
      <View style={styles.hero}>
        <View style={styles.badges}>
          {crew.myRole ? (
            <Badge label={isOwner ? 'Owner' : 'Member'} tone={isOwner ? 'brand' : 'success'} size="sm" />
          ) : null}
          <Badge label="Running crew" icon="run" size="sm" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {crew.name}
        </Text>
        <View style={styles.row}>
          <Icon name="location" size="sm" color={colors.textSecondary} />
          <Text style={styles.area}>{crew.homeArea}</Text>
        </View>
        {crew.description ? <Text style={styles.description}>{crew.description}</Text> : null}
        <StatRow style={styles.stats} testID="crew-stats">
          {/* Pace last: a band like "5:00–6:00 /km" is the widest value, so
              when the row wraps it takes the second line on its own. */}
          <StatBlock value={crew.memberCount} label={crew.memberCount === 1 ? 'Member' : 'Members'} size="lg" accent />
          <StatBlock value={crew.upcomingRuns.length} label="Upcoming" size="lg" />
          <StatBlock
            value={pace ?? 'Any'}
            unit={pace ? '/km' : undefined}
            label="Pace"
            size="lg"
            accessibilityLabel={`Pace ${paceBandText(crew.paceMinSecPerKm, crew.paceMaxSecPerKm) ?? 'any'}`}
          />
        </StatRow>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Members</Text>
        <View style={styles.row}>
          <AvatarGroup
            people={crew.members.map((m) => ({ name: m.displayName, uri: m.avatarUrl }))}
            total={crew.memberCount}
            max={6}
          />
          <Text style={styles.caption}>{memberCountText(crew.memberCount)}</Text>
        </View>
        {crew.members.map((m) => (
          <ListRow
            key={m.userId}
            title={m.displayName}
            leading={<Avatar name={m.displayName} uri={m.avatarUrl} size="sm" ring={m.role === 'owner'} />}
            trailing={m.role === 'owner' ? <Badge label="Owner" tone="brand" size="sm" /> : undefined}
            accessibilityLabel={`${m.displayName}${m.role === 'owner' ? ', owner' : ''}`}
            style={styles.memberRow}
            testID={`member-${m.userId}`}
          />
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Upcoming runs</Text>
        {crew.upcomingRuns.length === 0 ? (
          <EmptyState
            compact
            icon="run"
            title="No runs scheduled yet"
            message={isMember ? 'Host the next one — pick a spot, a distance and a pace.' : 'Join to hear about the next one.'}
          />
        ) : (
          <View style={styles.runs}>
            {crew.upcomingRuns.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                hideCrew
                onPress={() => navigation.navigate('BattleDetail', { eventId: run.id })}
              />
            ))}
          </View>
        )}
      </View>

      {isMember ? (
        <View style={styles.section}>
          {isOwner ? (
            <Button
              label="Delete crew"
              variant="destructive"
              leadingIcon="trash"
              fullWidth
              disabled={busy}
              onPress={confirmDelete}
            />
          ) : null}
          <Button
            label="Leave crew"
            variant="ghost"
            leadingIcon="logout"
            fullWidth
            disabled={busy}
            onPress={confirmLeave}
          />
        </View>
      ) : null}
      {isLoading ? <ActivityIndicator color={colors.brand} style={styles.refreshing} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centred: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    ...typography.display,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  area: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
  },
  description: {
    ...typography.body,
  },
  stats: {
    marginTop: spacing.md,
  },
  section: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  sectionLabel: {
    ...typography.label,
  },
  caption: {
    ...typography.caption,
  },
  // The section already insets by the screen gutter; line avatars up with
  // the stack above instead of indenting them a second time.
  memberRow: {
    paddingHorizontal: 0,
  },
  runs: {
    gap: spacing.md,
  },
  refreshing: {
    marginTop: spacing.md,
  },
});
