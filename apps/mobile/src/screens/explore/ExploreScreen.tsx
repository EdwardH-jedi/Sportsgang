import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FocusSport } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { SessionCard } from '../../components/SessionCard';
import {
  Button,
  Card,
  ChipRow,
  ChoiceChip,
  EmptyState,
  ErrorState,
  InlineNotice,
  LoadingState,
  ScreenHeader,
  SegmentedControl,
} from '../../components/ui';
import { useDiscovery, type FeedCard } from '../../hooks/useDiscovery';
import { useEvents } from '../../hooks/useEvents';
import { FOCUS_SPORTS, FOCUS_SPORT_LABEL, FOCUS_SWITCH_OPTIONS, isConfigured, isFocusSport } from '../../lib/sportPreferences';
import { useAuthStore } from '../../stores/auth';
import { useExploreStore, type ExploreView } from '../../stores/explore';
import { useProfileStore } from '../../stores/profile';
import { colors, spacing, typography } from '../../theme';
import type { ExploreScreenProps } from '../../navigation/types';
import { PartnerCardView } from './PartnerCardView';

const VIEW_OPTIONS: readonly { value: ExploreView; label: string }[] = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'partners', label: 'Partners' },
];

const SESSION_NOUN: Record<FocusSport, { host: string; plural: string }> = {
  running: { host: 'Host a run', plural: 'runs' },
  golf: { host: 'Host a round', plural: 'rounds' },
};

/**
 * Explore tab — Run/Golf focus switch, then either upcoming group sessions
 * or recommended partners for that sport.
 */
export function ExploreScreen({ navigation }: ExploreScreenProps) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sportProfiles = useProfileStore((s) => s.sportProfiles);
  const focusSport = useExploreStore((s) => s.focusSport);
  const focusHydrated = useExploreStore((s) => s.focusHydrated);
  const view = useExploreStore((s) => s.view);
  const setFocusSport = useExploreStore((s) => s.setFocusSport);
  const setView = useExploreStore((s) => s.setView);
  const hydrateFocus = useExploreStore((s) => s.hydrateFocus);

  // Default focus: the stored choice for this account, else the first sport
  // the user has configured, else their first running/golf row.
  const fallbackSport = useMemo<FocusSport | null>(() => {
    // Deterministic: walk Run then Golf rather than the API's row order.
    const rows = FOCUS_SPORTS.map((sport) => (sportProfiles ?? []).find((sp) => sp.sport === sport)).filter(
      (sp): sp is NonNullable<typeof sp> => !!sp
    );
    const pick = rows.find((sp) => isConfigured(sp)) ?? rows[0];
    return pick && isFocusSport(pick.sport) ? pick.sport : null;
  }, [sportProfiles]);

  useEffect(() => {
    if (userId) void hydrateFocus(userId, fallbackSport);
  }, [userId, fallbackSport, hydrateFocus]);

  const ownProfile = (sportProfiles ?? []).find((sp) => sp.sport === focusSport) ?? null;

  return (
    <Screen padded={false}>
      <View style={styles.top}>
        <ScreenHeader eyebrow="Sydney" title="Explore" />
        <SegmentedControl
          options={FOCUS_SWITCH_OPTIONS}
          value={focusSport}
          onChange={setFocusSport}
          accessibilityLabel="Sport"
          testID="focus-switch"
        />
        <View style={styles.viewSwitch}>
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            accessibilityLabel="Show sessions or partners"
            testID="view-switch"
          />
        </View>
      </View>
      {!focusHydrated && userId ? (
        <LoadingState label="Loading…" />
      ) : view === 'sessions' ? (
        <SessionsView sport={focusSport} onOpen={(id) => navigation.navigate('SessionDetail', { eventId: id })} onHost={() => navigation.navigate('CreateSession', { sport: focusSport })} />
      ) : (
        <PartnersView
          sport={focusSport}
          ownConfigured={sportProfiles === null ? null : isConfigured(ownProfile)}
          ownHasPaceRange={ownProfile?.runPaceMinSecPerKm != null}
          onSetup={() => navigation.navigate('EditSportPreferences', { sport: focusSport })}
          onOpen={(card) => navigation.navigate('PartnerDetail', { userId: card.userId, sport: card.feedSport })}
          onOpenChat={(card, matchId) =>
            navigation.navigate('Chat', {
              matchId,
              partnerName: card.displayName,
              partnerId: card.userId,
              sport: card.feedSport,
            })
          }
        />
      )}
    </Screen>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function SessionsView({ sport, onOpen, onHost }: { sport: FocusSport; onOpen: (id: string) => void; onHost: () => void }) {
  const { items, isLoading, error, refresh } = useEvents({ sport, upcoming: true });
  const noun = SESSION_NOUN[sport];

  return (
    <ScrollView
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isLoading && items.length > 0} onRefresh={refresh} tintColor={colors.accent} />}
    >
      <Button label={noun.host} onPress={onHost} style={styles.hostButton} />
      {isLoading && items.length === 0 ? (
        <LoadingState label={`Finding ${noun.plural}…`} />
      ) : error ? (
        <ErrorState title={`Could not load ${noun.plural}`} body={error} onAction={refresh} />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No upcoming ${noun.plural} yet`}
          body={`Be the first — host a ${sport === 'golf' ? 'round' : 'run'} and others can join.`}
        />
      ) : (
        items.map((event) => (
          <View key={event.id} style={styles.cardGap}>
            <SessionCard event={event} onPress={() => onOpen(event.id)} />
          </View>
        ))
      )}
    </ScrollView>
  );
}

// ─── Partners ────────────────────────────────────────────────────────────────

interface PartnersViewProps {
  sport: FocusSport;
  /** null while the user's own sport profiles have not loaded yet. */
  ownConfigured: boolean | null;
  ownHasPaceRange: boolean;
  onSetup: () => void;
  onOpen: (card: FeedCard) => void;
  onOpenChat: (card: FeedCard, matchId: string) => void;
}

function PartnersView({ sport, ownConfigured, ownHasPaceRange, onSetup, onOpen, onOpenChat }: PartnersViewProps) {
  const { feed, partners, strictPace, setStrictPace, actingOn, refresh, fetchMore, recordAction } = useDiscovery();
  const [actionError, setActionError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ card: FeedCard; matchId: string } | null>(null);
  const label = FOCUS_SPORT_LABEL[sport].toLowerCase();

  useEffect(() => {
    setActionError(null);
    setMatch(null);
  }, [sport]);

  const act = useCallback(
    async (card: FeedCard, action: 'like' | 'pass') => {
      if (actingOn) return;
      setActionError(null);
      try {
        const result = await recordAction(card, action);
        if (action === 'like' && result.matchCreated && result.matchId) {
          setMatch({ card, matchId: result.matchId });
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'That did not go through. Try again.');
      }
    },
    [actingOn, recordAction]
  );

  // The server's flag is authoritative once the feed has loaded; before
  // that, only a loaded-and-unconfigured own profile shows the prompt.
  const setupNeeded = feed.status === 'ready' ? feed.viewerSetupRequired : ownConfigured === false;

  const header = (
    <View>
      {setupNeeded ? (
        <Card style={styles.setupCard} testID="setup-prompt">
          <Text style={styles.setupTitle}>Set up your {label} preferences</Text>
          <Text style={styles.setupBody}>
            {sport === 'golf'
              ? 'Add your handicap situation and the golfers you want to play with. Until then nobody is shown as a fit.'
              : 'Add your pace and how you like to run. Until then nobody is shown as a fit.'}
          </Text>
          <Button label="Set up now" onPress={onSetup} style={styles.setupButton} />
        </Card>
      ) : null}
      {sport === 'running' ? (
        <View style={styles.filterRow}>
          <ChipRow>
            <ChoiceChip
              kind="checkbox"
              label="Matching pace only"
              selected={strictPace}
              disabled={!ownHasPaceRange}
              onPress={() => setStrictPace(!strictPace)}
              description={ownHasPaceRange ? undefined : 'Add your pace range to use this filter'}
            />
          </ChipRow>
        </View>
      ) : null}
      {match ? (
        <InlineNotice
          tone="info"
          text={`You and ${match.card.displayName} are both interested — say hi.`}
          actionLabel="Open chat"
          onAction={() => onOpenChat(match.card, match.matchId)}
        />
      ) : null}
      {actionError ? <InlineNotice text={actionError} /> : null}
    </View>
  );

  if (feed.status === 'idle' || (feed.status === 'loading' && partners.length === 0)) {
    return (
      <View style={styles.fill}>
        <View style={styles.listContent}>{header}</View>
        <LoadingState label={`Finding ${label} partners…`} />
      </View>
    );
  }

  if (feed.status === 'error') {
    return (
      <View style={styles.fill}>
        <View style={styles.listContent}>{header}</View>
        <ErrorState title="Could not load partners" body={feed.error ?? undefined} onAction={refresh} testID="feed-error" />
      </View>
    );
  }

  return (
    <FlatList
      data={partners}
      keyExtractor={(item) => `${item.feedSport}:${item.userId}`}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <View style={styles.cardGap}>
          <PartnerCardView
            card={item}
            busy={actingOn === item.userId}
            onOpen={() => onOpen(item)}
            onInterest={() => act(item, 'like')}
            onPass={() => act(item, 'pass')}
          />
        </View>
      )}
      onEndReached={() => void fetchMore()}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}
      ListEmptyComponent={
        <EmptyState
          testID="feed-empty"
          title={strictPace ? 'Nobody with a matching pace yet' : `No ${label} partners fit right now`}
          body={
            strictPace
              ? 'Turn off "Matching pace only" to see social runners who have not shared a pace.'
              : 'People only appear when both of your preferences fit. New members join every week.'
          }
          actionLabel="Refresh"
          onAction={refresh}
        />
      }
      ListFooterComponent={
        partners.length === 0 ? null : feed.loadingMore ? (
          <ActivityIndicator style={styles.footer} color={colors.accent} accessibilityLabel="Loading more partners" />
        ) : feed.loadMoreError ? (
          <InlineNotice text={feed.loadMoreError} actionLabel="Retry" onAction={() => void fetchMore()} />
        ) : !feed.nextCursor ? (
          <Text style={styles.endNote}>
            That&apos;s everyone who fits for now.
            {feed.poolLimit ? ` We check the ${feed.poolLimit} newest ${label} members.` : ''}
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  viewSwitch: { marginTop: spacing.sm },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  cardGap: { marginBottom: spacing.md },
  hostButton: { marginBottom: spacing.md },
  setupCard: { marginBottom: spacing.md, borderColor: colors.brand },
  setupTitle: { ...typography.h3 },
  setupBody: { ...typography.body, marginTop: spacing.xs },
  setupButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
  filterRow: { marginBottom: spacing.md },
  footer: { marginVertical: spacing.lg },
  endNote: { ...typography.bodySmall, textAlign: 'center', marginVertical: spacing.lg },
});
