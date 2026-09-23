import type { ChallengeStatus } from '@protin/shared-types';

import { Badge, type BadgeTone, type IconName } from './ui';

interface ChallengeStatusBadgeProps {
  status: ChallengeStatus;
  accessibilityLabel?: string;
}

interface BadgeStyleSpec {
  label: string;
  tone: BadgeTone;
  icon: IconName;
}

const STATUS_STYLES: Record<ChallengeStatus, BadgeStyleSpec> = {
  pending: { label: 'Pending', tone: 'warning', icon: 'clock' },
  accepted: { label: 'Accepted', tone: 'brand', icon: 'check' },
  verified: { label: 'Verified', tone: 'success', icon: 'check-circle' },
  disputed: { label: 'Disputed', tone: 'error', icon: 'alert' },
  declined: { label: 'Declined', tone: 'neutral', icon: 'close' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'close' },
};

/**
 * Compact status pill for Challenge cards and the detail header.
 *
 * Copy stays neutral — disputed reads "Disputed" not "Failed", verified
 * reads "Verified" not "Won", because the badge sits next to user
 * names and a value-laden label would mis-imply blame.
 */
export function ChallengeStatusBadge({
  status,
  accessibilityLabel,
}: ChallengeStatusBadgeProps) {
  const spec = STATUS_STYLES[status];
  return (
    <Badge
      label={spec.label}
      tone={spec.tone}
      icon={spec.icon}
      size="sm"
      accessibilityLabel={accessibilityLabel ?? `Status ${spec.label}`}
    />
  );
}
