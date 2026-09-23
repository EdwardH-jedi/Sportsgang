import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { sportLabel } from '../lib/sports';
import { colors, radii, spacing, typography } from '../theme';

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
  let pillColor: string = colors.textSecondary;

  if (status === 'proposed') {
    if (isProposer) {
      title = 'Session proposal sent';
      pillText = 'AWAITING CONFIRMATION';
      pillColor = colors.textSecondary;
    } else {
      title = 'Session proposal';
      subtitle = `${partnerName} proposed a session`;
    }
  } else if (status === 'confirmed') {
    title = 'Session confirmed';
    pillText = 'CONFIRMED';
    pillColor = colors.success;
  } else if (status === 'declined') {
    title = 'Session declined';
    pillText = 'DECLINED';
    pillColor = colors.error;
  } else {
    // Defensive default — older or unknown statuses just render as "Session"
    // with no pill rather than blowing up the chat. Tap-through still works.
    title = 'Session';
  }

  const venue = venueLine(proposal);
  const showActionButtons = status === 'proposed' && !isProposer;

  return (
    <Pressable
      onPress={onView}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title.toLowerCase()}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      {/* Title gets its own row at full width — keeping the title and the
          status pill on the same line was forcing "Session proposal" to
          truncate to "Session pro..." on screenshot-narrow phones because
          the long "AWAITING CONFIRMATION" pill ate the row width. */}
      <Text style={styles.title}>{title}</Text>
      {pillText ? (
        <View style={styles.statusRow}>
          <View style={[styles.statusPill, { borderColor: pillColor }]}>
            <Text style={[styles.statusPillText, { color: pillColor }]}>
              {pillText}
            </Text>
          </View>
        </View>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.detailBlock}>
        <Text style={styles.detail}>{sportText}</Text>
        <Text style={styles.detail}>{formatTimeRange(proposal.startsAt, proposal.endsAt)}</Text>
        {venue ? (
          <Text style={styles.detail} numberOfLines={2}>
            {venue}
          </Text>
        ) : null}
        {proposal.notes ? (
          <Text style={styles.notes} numberOfLines={3}>
            {proposal.notes}
          </Text>
        ) : null}
      </View>

      {showActionButtons ? (
        <View style={styles.actions}>
          <Pressable
            onPress={(e) => {
              // stopPropagation prevents the card-wide tap handler from
              // also firing when the user taps Accept. The event object
              // is optional at runtime (some test renderers omit it), so
              // call defensively.
              e?.stopPropagation?.();
              if (!isActing) void onAccept();
            }}
            disabled={isActing}
            accessibilityRole="button"
            accessibilityLabel="Accept session proposal"
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionPrimary,
              (pressed || isActing) && styles.pressed,
            ]}
          >
            {isActing ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.actionPrimaryText}>Accept</Text>
            )}
          </Pressable>
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              if (!isActing) void onDecline();
            }}
            disabled={isActing}
            accessibilityRole="button"
            accessibilityLabel="Decline session proposal"
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionGhost,
              (pressed || isActing) && styles.pressed,
            ]}
          >
            <Text style={styles.actionGhostText}>Decline</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Status pill row sits on its own line so "AWAITING CONFIRMATION" never
  // squeezes the title. `alignItems: 'flex-start'` keeps the pill at its
  // intrinsic width — it never stretches to fill the row.
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusPillText: {
    ...typography.label,
    letterSpacing: 0.6,
  },
  detailBlock: {
    paddingTop: spacing.xs,
    gap: 2,
  },
  detail: {
    ...typography.body,
    color: colors.textPrimary,
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
    paddingTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  actionPrimary: {
    backgroundColor: colors.brand,
  },
  actionPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  actionGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionGhostText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.65 },
});
