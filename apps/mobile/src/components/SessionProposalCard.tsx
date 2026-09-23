import { StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../lib/sports';
import { colors, radii, spacing, touchTarget, typography } from '../theme';
import { Badge, Button, Card, Icon, sportIconName, type BadgeTone, type IconName } from './ui';

/**
 * In-chat session proposal card.
 *
 * Renders one of four states based on the booking's status + the viewer's
 * role:
 *   * proposed + viewer is RECEIVER -> "Session proposal" with Accept /
 *     Decline buttons.
 *   * proposed + viewer is PROPOSER -> "Session proposal sent / Awaiting
 *     confirmation" — no action buttons (Cancel is reachable via the
 *     existing BookingDetail screen and is intentionally not duplicated
 *     here per S2 scope).
 *   * confirmed -> "Session confirmed" pill, no actions.
 *   * declined  -> "Session declined" pill, no actions.
 *
 * Visual treatment matches the SportsGang dark/lime palette and keeps the
 * card tappable as a whole so users can drill into BookingDetail for the
 * fuller view (e.g. venue link, no-show, complete) without us reproducing
 * those affordances here.
 */

export type ProposalStatus = 'proposed' | 'confirmed' | 'declined';

export interface SessionProposalCardData {
  id: string;
  matchId: string;
  proposerId: string;
  partnerId: string;
  sport: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  notes?: string | null;
  status: string;
  partner: { displayName: string };
  venue?: { name: string; area?: string | null; address?: string | null } | null;
}

export interface SessionProposalCardProps {
  proposal: SessionProposalCardData;
  /** id of the user currently signed in — drives proposer vs receiver branch. */
  currentUserId: string;
  onAccept: () => void | Promise<void>;
  onDecline: () => void | Promise<void>;
  /** Open BookingDetail for the full surface (notes, venue link, etc.). */
  onView: () => void;
  /** True while the parent has an /accept or /decline request in flight. */
  isActing?: boolean;
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  // Day + start; pair with the end-time on the right of the dash. Keeps the
  // line readable on narrow phones.
  const dayPart = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  return `${dayPart} · ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

function venueLine(p: SessionProposalCardData): string | null {
  if (p.venue?.name) {
    return p.venue.address ?? p.venue.area
      ? `${p.venue.name} · ${p.venue.address ?? p.venue.area}`
      : p.venue.name;
  }
  return p.location?.trim() ? p.location : null;
}

export function SessionProposalCard({
  proposal,
  currentUserId,
  onAccept,
  onDecline,
  onView,
  isActing = false,
}: SessionProposalCardProps) {
  const isProposer = proposal.proposerId === currentUserId;
  const status = proposal.status as ProposalStatus | string;

  const partnerName = proposal.partner.displayName || 'Partner';
  const sportText = sportLabel(proposal.sport);

  let title: string;
  let subtitle: string | null = null;
  let pillText: string | null = null;
  let pillTone: BadgeTone = 'neutral';

  if (status === 'proposed') {
    if (isProposer) {
      title = 'Session proposal sent';
      pillText = 'AWAITING CONFIRMATION';
      pillTone = 'warning';
    } else {
      title = 'Session proposal';
      subtitle = `${partnerName} proposed a session`;
    }
  } else if (status === 'confirmed') {
    title = 'Session confirmed';
    pillText = 'CONFIRMED';
    pillTone = 'success';
  } else if (status === 'declined') {
    title = 'Session declined';
    pillText = 'DECLINED';
    pillTone = 'error';
  } else {
    // Defensive default — older or unknown statuses just render as "Session"
    // with no pill rather than blowing up the chat. Tap-through still works.
    title = 'Session';
  }

  const venue = venueLine(proposal);
  const showActionButtons = status === 'proposed' && !isProposer;

  return (
    <Card
      onPress={onView}
      accessibilityLabel={`Open ${title.toLowerCase()}`}
      style={styles.card}
    >
      <View style={styles.headRow}>
        <View style={styles.sportIcon}>
          <Icon name={sportIconName(proposal.sport)} size="md" color={colors.brand} />
        </View>
        {/* Title keeps the full row width — the status pill sits on its
            own line so a long "AWAITING CONFIRMATION" never truncates
            "Session proposal" on narrow phones. */}
        <View style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {pillText ? <Badge label={pillText} tone={pillTone} size="sm" /> : null}

      <View style={styles.detailBlock}>
        <DetailRow icon={sportIconName(proposal.sport)} text={sportText} />
        <DetailRow icon="calendar" text={formatTimeRange(proposal.startsAt, proposal.endsAt)} />
        {venue ? <DetailRow icon="location" text={venue} lines={2} /> : null}
        {proposal.notes ? (
          <Text style={styles.notes} numberOfLines={3}>
            {proposal.notes}
          </Text>
        ) : null}
      </View>

      {showActionButtons ? (
        <View style={styles.actions}>
          <Button
            label="Accept"
            size="md"
            loading={isActing}
            onPress={(e) => {
              // stopPropagation keeps the card-wide tap (open detail) from
              // also firing. The event is optional in some test renderers.
              e?.stopPropagation?.();
              if (!isActing) void onAccept();
            }}
            accessibilityLabel="Accept session proposal"
            style={styles.action}
          />
          <Button
            label="Decline"
            size="md"
            variant="secondary"
            disabled={isActing}
            onPress={(e) => {
              e?.stopPropagation?.();
              if (!isActing) void onDecline();
            }}
            accessibilityLabel="Decline session proposal"
            style={styles.action}
          />
        </View>
      ) : null}
    </Card>
  );
}

function DetailRow({ icon, text, lines = 1 }: { icon: IconName; text: string; lines?: number }) {
  return (
    <View style={styles.detailRow}>
      <Icon name={icon} size="sm" color={colors.textTertiary} />
      <Text style={styles.detail} numberOfLines={lines}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
  },
  sportIcon: {
    width: touchTarget - spacing.xs,
    height: touchTarget - spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  title: {
    ...typography.h3,
  },
  subtitle: {
    ...typography.body,
  },
  detailBlock: {
    gap: spacing.xs + spacing.xs / 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detail: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  notes: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  action: {
    flex: 1,
    alignSelf: 'auto',
  },
});
