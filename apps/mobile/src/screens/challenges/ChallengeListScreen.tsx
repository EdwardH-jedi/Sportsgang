import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChallengeStatusBadge } from '../../components/ChallengeStatusBadge';
import {
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  Skeleton,
  sportIconName,
} from '../../components/ui';
import { useChallenges } from '../../hooks/useChallenges';
import { useAuthStore } from '../../stores/auth';
import { sportLabelForBattle } from '../../lib/events';
import { formatDate } from '../../lib/format';
import { isChallengeTerminal, type ChallengeRead } from '../../lib/challenges';
import { colors, layout, radii, spacing, typography } from '../../theme';
import type { ChallengeListScreenProps } from '../../navigation/types';

type SectionKey = 'incoming' | 'active' | 'done';

interface SectionSpec {
  key: SectionKey;
  title: string;
  emptyCopy: string;
}

const SECTIONS: SectionSpec[] = [
  {
    key: 'incoming',
    title: 'Awaiting your response',
    emptyCopy: 'No incoming challenges right now.',
  },
  {
    key: 'active',
    title: 'Active',
    emptyCopy: 'No active challenges. Accept an incoming one to start.',
  },
  {
    key: 'done',
    title: 'Done',
    emptyCopy: 'No completed challenges yet.',
  },
];

interface GroupedChallenges {
  incoming: ChallengeRead[];
  active: ChallengeRead[];
  done: ChallengeRead[];
}

function groupChallenges(
  items: ChallengeRead[],
  currentUserId: string | null
): GroupedChallenges {
  const incoming: ChallengeRead[] = [];
  const active: ChallengeRead[] = [];
  const done: ChallengeRead[] = [];

  for (const c of items) {
    if (isChallengeTerminal(c.status)) {
      done.push(c);
      continue;
    }
    if (c.status === 'accepted') {
      active.push(c);
      continue;
    }
    if (c.status === 'pending') {
      const isOpponent = currentUserId !== null && currentUserId === c.opponentUserId;
      if (isOpponent) {
        incoming.push(c);
      } else {
        active.push(c);
      }
    }
  }

  return { incoming, active, done };
}

export function ChallengeListScreen({ navigation }: ChallengeListScreenProps) {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { items, isLoading, error, refresh } = useChallenges();

  const grouped = useMemo(
    () => groupChallenges(items, currentUserId),
    [items, currentUserId]
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh]);

  const header = (
    <Header
      large
      eyebrow="1-on-1"
      title="Challenges"
      onBack={() => navigation.goBack()}
      backLabel="Back"
    />
  );

  if (isLoading && items.length === 0 && !error) {
    return (
      <Screen padded={false} header={header}>
        <View
          style={styles.scroll}
          accessible
          accessibilityLabel="Loading challenges"
          accessibilityState={{ busy: true }}
          testID="challenges-loading"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={spacing.xxxl + spacing.xl} radius={radii.lg} />
          ))}
        </View>
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen padded={false} header={header}>
        <EmptyState
          icon="alert"
          title="Could not load challenges"
          message={error}
          action={{
            label: 'Try again',
            icon: 'refresh',
            onPress: () => void refresh(),
            accessibilityLabel: 'Retry loading challenges',
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false} header={header}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.introRow}>
          <Icon name="shield" size="sm" color={colors.textTertiary} />
          <Text style={styles.intro}>
            Challenge results are verified when both players submit matching
            outcomes.
          </Text>
        </View>

        {SECTIONS.map((section) => (
          <Section
            key={section.key}
            title={section.title}
            emptyCopy={section.emptyCopy}
            items={grouped[section.key]}
            currentUserId={currentUserId}
            onOpen={(id) => navigation.navigate('ChallengeDetail', { challengeId: id })}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

interface SectionProps {
  title: string;
  emptyCopy: string;
  items: ChallengeRead[];
  currentUserId: string | null;
  onOpen: (challengeId: string) => void;
}

function Section({ title, emptyCopy, items, currentUserId, onOpen }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {items.length > 0 ? <Text style={styles.sectionCount}>{items.length}</Text> : null}
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyCopy}</Text>
      ) : (
        <View style={styles.list}>
          {items.map((c) => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              currentUserId={currentUserId}
              onPress={() => onOpen(c.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeRead;
  currentUserId: string | null;
  onPress: () => void;
}

function ChallengeCard({ challenge, currentUserId, onPress }: ChallengeCardProps) {
  const isChallenger = currentUserId === challenge.challengerUserId;
  const roleLabel = isChallenger ? 'You challenged' : 'Challenged you';
  const sportLabel = sportLabelForBattle(challenge.sport);
  const when = formatChallengeWhen(challenge.createdAt);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Open challenge in ${sportLabel}`}
      style={styles.card}
    >
      <View style={styles.cardTop}>
        <View style={styles.sportRow}>
          <Icon name={sportIconName(challenge.sport)} size="sm" color={colors.brand} />
          <Text style={styles.cardSport}>{sportLabel}</Text>
        </View>
        <ChallengeStatusBadge status={challenge.status} />
      </View>
      <Text style={styles.cardRole}>{roleLabel}</Text>
      <View style={styles.metaRow}>
        <Icon name="location" size="xs" color={colors.textTertiary} />
        <Text style={styles.cardArea}>{challenge.area}</Text>
        {when ? (
          <>
            <Icon name="calendar" size="xs" color={colors.textTertiary} />
            <Text style={styles.cardMeta}>{when}</Text>
          </>
        ) : null}
      </View>
    </Card>
  );
}

function formatChallengeWhen(iso: string): string {
  return formatDate(iso);
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  intro: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  section: {
    gap: spacing.sm + spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
  },
  sectionCount: {
    ...typography.statSmall,
    color: colors.brand,
  },
  list: {
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
  },
  card: {
    gap: spacing.xs + spacing.xs / 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + spacing.xs / 2,
  },
  cardSport: {
    ...typography.label,
    color: colors.brand,
  },
  cardRole: {
    ...typography.bodyStrong,
    fontSize: typography.bodyLarge.fontSize,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  cardArea: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  cardMeta: {
    ...typography.bodySmall,
  },
});
