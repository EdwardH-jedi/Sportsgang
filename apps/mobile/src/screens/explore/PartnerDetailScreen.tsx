import { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PartnerSportSummary } from '@protin/shared-types';

import { Screen } from '../../components/Screen';
import { Button, Card, ChipRow, EmptyState, InfoChip, InlineNotice, SectionTitle } from '../../components/ui';
import {
  FOCUS_SPORT_LABEL,
  formatDistances,
  golfExperienceLabel,
  golfIntentLabel,
  groupStyleLabel,
  handicapText,
  levelLabel,
  paceText,
  TIME_OPTIONS,
} from '../../lib/sportPreferences';
import { findFeedCard, useExploreStore } from '../../stores/explore';
import { colors, spacing, typography } from '../../theme';
import type { PartnerDetailScreenProps } from '../../navigation/types';
import { Avatar, TIER_LABEL, sportSummaryFor } from './PartnerCardView';

function detailRows(sport: 'running' | 'golf', s: PartnerSportSummary): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] = [{ label: 'Overall level', value: levelLabel(s.level) }];
  if (sport === 'golf') {
    rows.push(
      { label: 'Handicap', value: handicapText(s)?.replace(/^Handicap /, '') ?? null },
      { label: 'Experience', value: golfExperienceLabel(s.golfExperience) },
      {
        label: 'Looking for',
        value: (s.golfPartnerIntents ?? []).map((i) => golfIntentLabel(i)).filter(Boolean).join(', ') || null,
      },
      { label: 'Holes', value: s.golfPreferredHoles ? (s.golfPreferredHoles === 'either' ? '9 or 18' : s.golfPreferredHoles) : null }
    );
  } else {
    rows.push(
      { label: 'Style', value: s.runPaceMode === 'social' ? 'Social — pace is flexible' : s.runPaceMode === 'match_pace' ? 'Matches pace' : null },
      { label: 'Pace', value: paceText(s) },
      { label: 'Distances', value: formatDistances(s.runDistancesKm) },
      { label: 'Group style', value: groupStyleLabel(s.runGroupStyle) }
    );
  }
  const times = (s.preferredTimes ?? [])
    .map((t) => TIME_OPTIONS.find((o) => o.value === t)?.label)
    .filter(Boolean)
    .join(', ');
  rows.push({ label: 'Usually free', value: times || null });
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}

/**
 * Partner detail — the same card the Explore feed loaded (looked up in the
 * explore store), with full sport details and every reason/caveat. "Show
 * interest" is the existing like: mutual interest opens the existing chat;
 * there is no invitation inbox.
 */
export function PartnerDetailScreen({ navigation, route }: PartnerDetailScreenProps) {
  const { userId, sport } = route.params;
  // Snapshot at mount: acting removes the card from the feed list.
  const [card] = useState(() => findFeedCard(userId, sport));
  const recordAction = useExploreStore((s) => s.recordAction);
  const blockPartner = useExploreStore((s) => s.blockPartner);
  const actingOn = useExploreStore((s) => s.actingOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'like' | 'pass' | 'block' | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!card) {
    return (
      <Screen>
        <EmptyState
          title="This profile is no longer in your feed"
          body="Go back to Explore to see who fits right now."
          actionLabel="Back to Explore"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const summary = sportSummaryFor(card);
  const tier = card.compatibility ? TIER_LABEL[card.compatibility.tier] : null;
  const meta = [card.age ? `${card.age}` : null, card.suburb].filter(Boolean).join(' · ');
  // Like, pass and block share the store's one-at-a-time guard (review R4).
  const busy = actingOn !== null;
  // Navigate only from this screen while it is still the one on top; the
  // store returns null/false when the account changed meanwhile.
  const canNavigate = () => mounted.current && navigation.isFocused();

  async function act(action: 'like' | 'pass') {
    if (!card || busy) return;
    setError(null);
    setPending(action);
    try {
      const result = await recordAction(card, action);
      if (!result || !canNavigate()) return;
      if (action === 'like' && result.matchCreated && result.matchId) {
        navigation.replace('Chat', {
          matchId: result.matchId,
          partnerName: card.displayName,
          partnerId: card.userId,
          sport: card.feedSport,
        });
        return;
      }
      navigation.goBack();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'That did not go through. Try again.');
    } finally {
      if (mounted.current) setPending(null);
    }
  }

  async function block() {
    if (!card || busy) return;
    setError(null);
    setPending('block');
    try {
      // The store invalidates every in-flight feed page and drops the card;
      // the server excludes blocked people from then on.
      if ((await blockPartner(card.userId)) && canNavigate()) navigation.goBack();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not block this person. Try again.');
    } finally {
      if (mounted.current) setPending(null);
    }
  }

  function confirmBlock() {
    if (!card || busy) return;
    Alert.alert(`Block ${card.displayName}?`, "You won't see each other in Explore and they can't message you.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void block() },
    ]);
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="‹ Back" variant="ghost" onPress={() => navigation.goBack()} style={styles.back} />
        <View style={styles.header}>
          <Avatar card={card} size={72} />
          <View style={styles.headerText}>
            <Text style={styles.name} accessibilityRole="header">
              {card.displayName}
            </Text>
            {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            {tier ? (
              <View style={styles.tierRow}>
                <InfoChip label={tier.text} tone={tier.tone} />
              </View>
            ) : null}
          </View>
        </View>

        {card.compatibility && (card.compatibility.reasons.length > 0 || card.compatibility.caveats.length > 0) ? (
          <Card style={styles.block}>
            <SectionTitle>Why they show up</SectionTitle>
            {card.compatibility.reasons.map((r) => (
              <Text key={r.code} style={styles.reason}>
                ✓ {r.text}
              </Text>
            ))}
            {card.compatibility.caveats.map((c) => (
              <Text key={c.code} style={styles.caveat}>
                {c.text}
              </Text>
            ))}
          </Card>
        ) : null}

        <Card style={styles.block}>
          <SectionTitle>{FOCUS_SPORT_LABEL[sport]}</SectionTitle>
          {summary && summary.preferencesConfigured ? (
            detailRows(sport, summary).map((row) => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.caveat}>They have not set their {FOCUS_SPORT_LABEL[sport].toLowerCase()} preferences yet.</Text>
          )}
        </Card>

        {card.bio ? (
          <Card style={styles.block}>
            <SectionTitle>About</SectionTitle>
            <Text style={styles.bio}>{card.bio}</Text>
          </Card>
        ) : null}

        {card.photoUrls && card.photoUrls.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.block} accessibilityLabel="Photos">
            <ChipRow>
              {card.photoUrls.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors />
              ))}
            </ChipRow>
          </ScrollView>
        ) : null}

        {error ? <InlineNotice text={error} /> : null}

        <View style={styles.actions}>
          <Button label="Pass" variant="secondary" onPress={() => act('pass')} disabled={busy} style={styles.action} />
          <Button
            label="Show interest"
            onPress={() => act('like')}
            loading={pending === 'like'}
            disabled={busy}
            accessibilityHint="If they are interested too, a chat opens"
            style={styles.action}
          />
        </View>
        <Text style={styles.footnote}>
          Interest is private. If you both show interest, a chat opens where you can plan a session.
        </Text>
        <View style={styles.safety}>
          <Button
            label="Report"
            variant="ghost"
            onPress={() => navigation.navigate('Report', { reportedUserId: card.userId, reportedName: card.displayName })}
          />
          <Button
            label="Block"
            variant="ghost"
            onPress={confirmBlock}
            loading={pending === 'block'}
            disabled={busy}
            testID="partner-block"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  headerText: { flex: 1 },
  name: { ...typography.h2 },
  meta: { ...typography.body, marginTop: 2 },
  tierRow: { flexDirection: 'row', marginTop: spacing.sm },
  block: { marginBottom: spacing.md },
  reason: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginTop: 2 },
  caveat: { fontSize: 14, lineHeight: 20, color: colors.textTertiary, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs },
  rowLabel: { ...typography.body, flexShrink: 0 },
  rowValue: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
  bio: { ...typography.bodyLarge },
  photo: { width: 140, height: 180, borderRadius: 12, backgroundColor: colors.surfaceElevated },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  footnote: { ...typography.bodySmall, textAlign: 'center', marginTop: spacing.sm },
  safety: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, alignSelf: 'center', marginTop: spacing.md },
});
