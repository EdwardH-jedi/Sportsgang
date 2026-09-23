import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChallengeStatusBadge } from '../../components/ChallengeStatusBadge';
import { FormErrorBanner } from '../../components/FormErrorBanner';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  Skeleton,
  sportIconName,
  type IconName,
} from '../../components/ui';
import { useChallengeDetail } from '../../hooks/useChallenges';
import { sportLabelForBattle } from '../../lib/events';
import { formatWhen } from '../../lib/format';
import { isChallengeTerminal } from '../../lib/challenges';
import { useAuthStore } from '../../stores/auth';
import { colors, layout, radii, spacing, touchTarget, typography } from '../../theme';
import type { ChallengeDetailScreenProps } from '../../navigation/types';

type WinnerChoice = 'me' | 'opponent';

export function ChallengeDetailScreen({
  navigation,
  route,
}: ChallengeDetailScreenProps) {
  const { challengeId } = route.params;
  const {
    detail,
    isLoading,
    error,
    refresh,
    accept,
    decline,
    cancel,
    submitResult,
  } = useChallengeDetail({ challengeId });
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const [acting, setActing] = useState(false);
  const [winnerChoice, setWinnerChoice] = useState<WinnerChoice | null>(null);
  // The backend exposes "did I already submit" indirectly — once a
  // participant POSTs to /result, status stays "accepted" until the
  // other side submits. ChallengeRead alone cannot tell us. Track the
  // optimistic flag locally so the form collapses into the
  // "waiting for opponent" state without a second round-trip.
  const [submittedLocally, setSubmittedLocally] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isChallenger =
    currentUserId !== null && detail?.challengerUserId === currentUserId;
  const isOpponent =
    currentUserId !== null && detail?.opponentUserId === currentUserId;
  const isParticipant = isChallenger || isOpponent;

  const opponentId = useMemo(() => {
    if (!detail || !currentUserId) return null;
    return currentUserId === detail.challengerUserId
      ? detail.opponentUserId
      : detail.challengerUserId;
  }, [detail, currentUserId]);

  const handleAccept = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await accept();
    } catch (err) {
      Alert.alert(
        "Couldn't accept this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, accept]);

  const handleDecline = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await decline();
    } catch (err) {
      Alert.alert(
        "Couldn't decline this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, decline]);

  const handleCancel = useCallback(async () => {
    if (acting) return;
    setActing(true);
    try {
      await cancel();
    } catch (err) {
      Alert.alert(
        "Couldn't cancel this challenge.",
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, cancel]);

  const handleSubmitResult = useCallback(async () => {
    if (acting || !winnerChoice || !currentUserId || !opponentId) return;
    setSubmitError(null);
    setActing(true);
    const winnerUserId = winnerChoice === 'me' ? currentUserId : opponentId;
    const loserUserId = winnerChoice === 'me' ? opponentId : currentUserId;
    try {
      await submitResult({ winnerUserId, loserUserId });
      setSubmittedLocally(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not submit result.'
      );
    } finally {
      setActing(false);
    }
  }, [acting, winnerChoice, currentUserId, opponentId, submitResult]);

  const header = (
    <Header
      title="Challenge"
      onBack={() => navigation.goBack()}
      backLabel="Back"
      style={styles.header}
    />
  );

  if (isLoading && !detail) {
    return (
      <Screen padded={false} header={header}>
        <View
          style={styles.scroll}
          accessible
          accessibilityLabel="Loading challenge"
          accessibilityState={{ busy: true }}
          testID="challenge-loading"
        >
          <Skeleton width="50%" height={spacing.xxl} />
          <Skeleton width="30%" height={spacing.md} />
          <Skeleton height={spacing.xxxl * 2} radius={radii.lg} />
        </View>
      </Screen>
    );
  }

  if (error && !detail) {
    return (
      <Screen padded={false} header={header}>
        <EmptyState
          icon="alert"
          title="Could not load challenge"
          message={error}
          action={{
            label: 'Try again',
            icon: 'refresh',
            onPress: () => void refresh(),
            accessibilityLabel: 'Retry loading challenge',
          }}
        />
      </Screen>
    );
  }

  if (!detail) {
    return null;
  }

  const sportLabel = sportLabelForBattle(detail.sport);
  const terminal = isChallengeTerminal(detail.status);
  const youWonLabel = isChallenger ? 'Challenger' : 'Opponent';
  const theyWonLabel = isChallenger ? 'Opponent' : 'Challenger';

  return (
    <Screen padded={false} header={header}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.sportIcon}>
              <Icon name={sportIconName(detail.sport)} size="lg" color={colors.brand} />
            </View>
            <ChallengeStatusBadge status={detail.status} />
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {sportLabel}
          </Text>
          <View style={styles.areaRow}>
            <Icon name="location" size="sm" color={colors.textSecondary} />
            <Text style={styles.area}>{detail.area}</Text>
          </View>
        </View>

        <Card padding="none">
          <MetaRow
            icon="profile"
            label="You are"
            value={isChallenger ? 'Challenger' : isOpponent ? 'Opponent' : 'Viewer'}
          />
          {detail.note ? <MetaRow icon="edit" label="Note" value={detail.note} /> : null}
          <MetaRow icon="calendar" label="Created" value={formatChallengeWhen(detail.createdAt)} />
          {detail.acceptedAt ? (
            <MetaRow icon="check" label="Accepted" value={formatChallengeWhen(detail.acceptedAt)} />
          ) : null}
          {detail.verifiedAt ? (
            <MetaRow
              icon="check-circle"
              label="Verified"
              value={formatChallengeWhen(detail.verifiedAt)}
            />
          ) : null}
        </Card>

        {/* Status-driven section */}
        {detail.status === 'pending' && isOpponent && !terminal ? (
          <View style={styles.actionsBlock}>
            <Text style={styles.actionsTitle}>Respond to this challenge</Text>
            <Button
              label="Accept"
              size="lg"
              fullWidth
              leadingIcon="check"
              onPress={handleAccept}
              disabled={acting}
              accessibilityLabel="Accept challenge"
            />
            <Button
              label="Decline"
              variant="secondary"
              fullWidth
              onPress={handleDecline}
              disabled={acting}
              accessibilityLabel="Decline challenge"
            />
          </View>
        ) : null}

        {detail.status === 'pending' && isChallenger && !terminal ? (
          <View style={styles.actionsBlock}>
            <View style={styles.waitingRow}>
              <Icon name="clock" size="sm" color={colors.textSecondary} />
              <Text style={styles.waitingCopy}>
                Waiting for opponent to accept or decline.
              </Text>
            </View>
            <Button
              label="Cancel challenge"
              variant="destructive"
              fullWidth
              onPress={handleCancel}
              disabled={acting}
              accessibilityLabel="Cancel challenge"
            />
          </View>
        ) : null}

        {detail.status === 'accepted' && isParticipant ? (
          submittedLocally ? (
            <StatusBlock
              icon="clock"
              tone="neutral"
              title="Result submitted"
              body="Waiting for your opponent to submit. Verified once both results match."
              accessibilityLabel="Awaiting opponent result"
            />
          ) : (
            <ResultForm
              youWonLabel={youWonLabel}
              theyWonLabel={theyWonLabel}
              choice={winnerChoice}
              onChoose={setWinnerChoice}
              onSubmit={handleSubmitResult}
              submitting={acting}
              error={submitError}
            />
          )
        ) : null}

        {detail.status === 'verified' ? (
          <StatusBlock
            icon="check-circle"
            tone="success"
            title="Result verified"
            body="Both players submitted matching results. This counted toward Honor and Rank."
            accessibilityLabel="Result verified"
          />
        ) : null}

        {detail.status === 'disputed' ? (
          <StatusBlock
            icon="alert"
            tone="error"
            title="Result disputed"
            body="The two submissions did not match. Honor and Rank are not changed for disputed challenges."
            accessibilityLabel="Result disputed"
          />
        ) : null}

        {detail.status === 'declined' ? (
          <StatusBlock
            icon="close"
            tone="neutral"
            title="Challenge declined"
            accessibilityLabel="Challenge declined"
          />
        ) : null}

        {detail.status === 'cancelled' ? (
          <StatusBlock
            icon="close"
            tone="neutral"
            title="Challenge cancelled"
            accessibilityLabel="Challenge cancelled"
          />
        ) : null}

        {!isParticipant ? (
          <StatusBlock
            icon="eye"
            tone="neutral"
            title="View only"
            body="You are not a participant in this challenge."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

interface MetaRowProps {
  icon: IconName;
  label: string;
  value: string;
}

function MetaRow({ icon, label, value }: MetaRowProps) {
  return (
    <View style={styles.metaRow}>
      <Icon name={icon} size="sm" color={colors.textTertiary} />
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const TONE_COLOR = {
  neutral: colors.textSecondary,
  success: colors.success,
  error: colors.error,
} as const;

function StatusBlock({
  icon,
  tone,
  title,
  body,
  accessibilityLabel,
}: {
  icon: IconName;
  tone: keyof typeof TONE_COLOR;
  title: string;
  body?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Card variant="elevated" accessibilityLabel={accessibilityLabel} style={styles.statusBlock}>
      <Icon name={icon} size="lg" color={TONE_COLOR[tone]} />
      <View style={styles.statusText}>
        <Text style={styles.statusTitle}>{title}</Text>
        {body ? <Text style={styles.statusBody}>{body}</Text> : null}
      </View>
    </Card>
  );
}

interface ResultFormProps {
  youWonLabel: string;
  theyWonLabel: string;
  choice: WinnerChoice | null;
  onChoose: (c: WinnerChoice) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

function ResultForm({
  youWonLabel,
  theyWonLabel,
  choice,
  onChoose,
  onSubmit,
  submitting,
  error,
}: ResultFormProps) {
  return (
    <View style={styles.actionsBlock}>
      <Text style={styles.actionsTitle}>Submit result</Text>
      <Text style={styles.helpCopy}>
        Result is verified when both players submit matching results.
      </Text>

      <View style={styles.choiceRow} accessibilityRole="radiogroup">
        <ChoiceOption
          selected={choice === 'me'}
          onPress={() => onChoose('me')}
          title="I won"
          caption={youWonLabel}
          accessibilityLabel="I won"
        />
        <ChoiceOption
          selected={choice === 'opponent'}
          onPress={() => onChoose('opponent')}
          title="They won"
          caption={theyWonLabel}
          accessibilityLabel="They won"
        />
      </View>

      {error ? (
        <View accessibilityLabel="Submit result error">
          <FormErrorBanner message={error} />
        </View>
      ) : null}

      <Button
        label={submitting ? 'Submitting...' : 'Submit result'}
        size="lg"
        fullWidth
        loading={submitting}
        disabled={choice === null}
        onPress={onSubmit}
        accessibilityLabel="Submit result"
      />
    </View>
  );
}

interface ChoiceOptionProps {
  selected: boolean;
  onPress: () => void;
  title: string;
  caption: string;
  accessibilityLabel: string;
}

/** Radio option for the result form (two large selectable tiles). */
function ChoiceOption({ selected, onPress, title, caption, accessibilityLabel }: ChoiceOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceActive,
        pressed && !selected && styles.choicePressed,
      ]}
    >
      <Icon
        name={selected ? 'check-circle' : 'trophy'}
        size="md"
        color={selected ? colors.brand : colors.textTertiary}
      />
      <Text style={[styles.choiceTitle, selected && styles.choiceTitleActive]}>{title}</Text>
      <Text style={styles.choiceCaption}>{caption}</Text>
    </Pressable>
  );
}

function formatChallengeWhen(iso: string): string {
  return formatWhen(iso, { relative: false }) || iso;
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sportIcon: {
    width: touchTarget + spacing.xs,
    height: touchTarget + spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...typography.h1,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  area: {
    ...typography.body,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  metaLabel: {
    ...typography.label,
    color: colors.textTertiary,
    flex: 1,
    paddingTop: spacing.xs / 2,
  },
  metaValue: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  actionsBlock: {
    gap: spacing.sm + spacing.xs,
  },
  actionsTitle: {
    ...typography.h3,
  },
  helpCopy: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  waitingCopy: {
    ...typography.body,
    flex: 1,
  },
  statusBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  statusText: {
    flex: 1,
    gap: spacing.xs,
  },
  statusTitle: {
    ...typography.h3,
  },
  statusBody: {
    ...typography.body,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  choice: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: touchTarget * 2,
  },
  choiceActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  choicePressed: {
    backgroundColor: colors.surfacePressed,
  },
  choiceTitle: {
    ...typography.bodyStrong,
  },
  choiceTitleActive: {
    color: colors.brand,
  },
  choiceCaption: {
    ...typography.caption,
  },
});
