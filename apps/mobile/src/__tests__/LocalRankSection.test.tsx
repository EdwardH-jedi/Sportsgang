/**
 * LocalRankSection tests — read-only Honor System surface on Profile.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { LocalRankSection } from '../components/LocalRankSection';
import type { HonorTitleRead, RankProfileRead } from '../lib/honorSystem';

const defaultRank: RankProfileRead = {
  id: null,
  userId: 'u-1',
  sport: 'tennis',
  area: 'annandale',
  rating: 1000,
  wins: 0,
  losses: 0,
  streak: 0,
  lastPlayedAt: null,
  createdAt: null,
  updatedAt: null,
};

const rankedProfile: RankProfileRead = {
  id: 'rp-1',
  userId: 'u-1',
  sport: 'tennis',
  area: 'annandale',
  rating: 1080,
  wins: 4,
  losses: 1,
  streak: 3,
  lastPlayedAt: '2026-05-10T10:00:00Z',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-10T10:00:00Z',
};

const championTitle: HonorTitleRead = {
  id: 'ht-1',
  sport: 'tennis',
  area: 'annandale',
  titleName: 'Annandale Tennis Champion',
  currentHolderUserId: 'u-1',
  active: true,
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-10T10:00:00Z',
};

describe('LocalRankSection', () => {
  it('renders the area + sport heading', () => {
    const { getByText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={defaultRank}
        localChampion={null}
        myTitles={[]}
      />
    );
    getByText('Annandale Tennis Rank');
  });

  it('renders the empty state copy when the user has no rank yet', () => {
    const { getByLabelText, getByText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={defaultRank}
        localChampion={null}
        myTitles={[]}
      />
    );
    getByLabelText('Local rank empty');
    getByText(
      'No local rank yet. Your rank will update when verified results are available.'
    );
  });

  it('renders rating, wins/losses, and streak when ranked', () => {
    const { getByLabelText, queryByLabelText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={rankedProfile}
        localChampion={null}
        myTitles={[]}
      />
    );
    getByLabelText('Rating: 1080');
    getByLabelText('Wins / Losses: 4 / 1');
    getByLabelText('Streak: 3');
    expect(queryByLabelText('Local rank empty')).toBeNull();
  });

  it('renders the local champion row when a title is held', () => {
    const { getByLabelText, getAllByText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={rankedProfile}
        localChampion={championTitle}
        myTitles={[championTitle]}
      />
    );
    getByLabelText('Local champion');
    // The title name renders twice — once in the champion row, once
    // in the user's currently-held list. Both surfaces are expected.
    expect(getAllByText('Annandale Tennis Champion').length).toBe(2);
    getByLabelText('My honor titles');
  });

  it('hides the local champion row when the title has no holder', () => {
    const { queryByLabelText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={rankedProfile}
        localChampion={{ ...championTitle, currentHolderUserId: null }}
        myTitles={[]}
      />
    );
    expect(queryByLabelText('Local champion')).toBeNull();
  });

  it('shows a loading indicator while the rank is loading', () => {
    const { getByLabelText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={null}
        localChampion={null}
        myTitles={[]}
        isLoading
      />
    );
    getByLabelText('Local rank loading');
  });

  it('shows an error message when the rank read failed', () => {
    const { getByLabelText, getByText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={null}
        localChampion={null}
        myTitles={[]}
        error="Could not load your local rank."
      />
    );
    getByLabelText('Local rank error');
    getByText('Could not load your local rank.');
  });

  it('does not surface any submission / result / transfer copy', () => {
    // Public Honor System surface must stay read-only. The section
    // must not promise users they can submit results manually.
    const { queryByText } = render(
      <LocalRankSection
        sport="tennis"
        area="annandale"
        rank={defaultRank}
        localChampion={null}
        myTitles={[]}
      />
    );
    expect(queryByText(/submit/i)).toBeNull();
    expect(queryByText(/record (a )?(result|match)/i)).toBeNull();
    expect(queryByText(/challenge/i)).toBeNull();
    expect(queryByText(/tournament/i)).toBeNull();
  });
});
