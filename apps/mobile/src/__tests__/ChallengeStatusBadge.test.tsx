import React from 'react';
import { render } from '@testing-library/react-native';

import { ChallengeStatusBadge } from '../components/ChallengeStatusBadge';

describe('ChallengeStatusBadge', () => {
  it.each([
    ['pending', 'Pending'],
    ['accepted', 'Accepted'],
    ['verified', 'Verified'],
    ['disputed', 'Disputed'],
    ['declined', 'Declined'],
    ['cancelled', 'Cancelled'],
  ] as const)('renders %s as the neutral label "%s"', (status, label) => {
    const { getByText, getByLabelText } = render(<ChallengeStatusBadge status={status} />);
    getByText(label);
    getByLabelText(`Status ${label}`);
  });

  it('accepts an accessibility label override', () => {
    const { getByLabelText } = render(
      <ChallengeStatusBadge status="verified" accessibilityLabel="Challenge verified" />
    );
    getByLabelText('Challenge verified');
  });
});
