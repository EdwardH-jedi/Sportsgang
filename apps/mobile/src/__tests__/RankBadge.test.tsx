/**
 * RankBadge tests
 *
 * Pinning the "no fake values" property on the discovery surface: a brand-new
 * player or a missing summary must render NOTHING — never a fabricated
 * "Rookie 0/200" pill that would imply data we don't have.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { RankBadge } from '../components/RankBadge';
import type { RankSummary } from '@protin/shared-types';

describe('RankBadge', () => {
  it('renders nothing when summary is null', () => {
    const { toJSON } = render(<RankBadge summary={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing for a brand-new player (default honor + no sports)', () => {
    const summary: RankSummary = { honor: 100, sports: [] };
    const { toJSON } = render(<RankBadge summary={summary} />);
    expect(toJSON()).toBeNull();
  });

  it('renders honor + top sport tier when activity exists', () => {
    const summary: RankSummary = {
      honor: 102,
      sports: [
        { sport: 'tennis', rankPoints: 5, tier: 'Rookie', sessionsCompleted: 1 },
        { sport: 'golf', rankPoints: 25, tier: 'Bronze', sessionsCompleted: 5 },
      ],
    };
    const { getByText } = render(<RankBadge summary={summary} />);
    getByText('Honor 102');
    // Top sport (most rank points) should be golf, not tennis.
    getByText('Bronze · golf');
  });

  it('renders only the honor pill when honor moved but sports list is empty', () => {
    const summary: RankSummary = { honor: 95, sports: [] };
    const { getByText, queryByText } = render(<RankBadge summary={summary} />);
    // After a no-show penalty: honor changed, no completed sessions yet.
    getByText('Honor 95');
    expect(queryByText(/Rookie|Bronze|Silver|Gold|Platinum|Diamond/)).toBeNull();
  });
});
