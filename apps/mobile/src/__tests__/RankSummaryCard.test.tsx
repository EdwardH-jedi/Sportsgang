/**
 * RankSummaryCard tests
 *
 * Mocks:
 *  - theme — keep token surface tiny
 */

import React from 'react';
import { render } from '@testing-library/react-native';

import { RankSummaryCard } from '../components/RankSummaryCard';
import type { RankSummary } from '@protin/shared-types';

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', brandSoft: '#222', border: '#ccc',
    surface: '#fff', surfaceElevated: '#f5f5f5', background: '#fafafa',
    separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', inputBackground: '#eee',
    success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, pill: 9999, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summary(overrides: Partial<RankSummary> = {}): RankSummary {
  return {
    honor: 100,
    sports: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RankSummaryCard', () => {
  it('renders the loading state with a spinner', () => {
    const { getByLabelText, UNSAFE_queryAllByType } = render(
      <RankSummaryCard summary={null} isLoading />
    );
    expect(getByLabelText('Sports reputation loading')).toBeTruthy();
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBe(1);
  });

  it('renders the no-data empty state when summary is null', () => {
    const { getByText, queryByText } = render(<RankSummaryCard summary={null} />);
    getByText('No reputation yet');
    // No fake numbers must appear in the empty state.
    expect(queryByText('100')).toBeNull();
    expect(queryByText('Rookie')).toBeNull();
  });

  it('shows baseline honor + "No ranked sports yet" for a brand-new player', () => {
    // Brand-new player == honor 100, sports []. The Rank/Honor feature must
    // be visibly present (not hidden behind a generic empty card), but we
    // must NOT invent a tier the user has not earned.
    const { getByText, queryByText } = render(
      <RankSummaryCard summary={summary({ honor: 100, sports: [] })} />
    );
    getByText('Sports reputation');
    getByText('100');
    getByText('/200');
    getByText('No ranked sports yet');
    getByText('Complete sessions to build your sport rank.');
    expect(queryByText('Rookie')).toBeNull();
    expect(queryByText('Bronze')).toBeNull();
  });

  it('does not crash and treats malformed sports payloads as empty', () => {
    // The API contract says sports is an array, but a malformed payload
    // (sports: {}, sports: null) must not blow up the profile screen.
    const malformed = { honor: 100, sports: {} } as unknown as RankSummary;
    const { getByText, queryByText } = render(<RankSummaryCard summary={malformed} />);
    getByText('100');
    getByText('No ranked sports yet');
    expect(queryByText('Rookie')).toBeNull();

    const nullSports = { honor: 100, sports: null } as unknown as RankSummary;
    const second = render(<RankSummaryCard summary={nullSports} />);
    second.getByText('100');
    second.getByText('No ranked sports yet');
  });

  it('renders the honor number + sport rows when activity exists', () => {
    const { getByText } = render(
      <RankSummaryCard
        summary={summary({
          honor: 105,
          sports: [
            { sport: 'tennis', rankPoints: 15, tier: 'Bronze', sessionsCompleted: 3 },
            { sport: 'gym', rankPoints: 5, tier: 'Rookie', sessionsCompleted: 1 },
          ],
        })}
      />
    );
    getByText('105');
    getByText('/200');
    getByText('Tennis');
    getByText('3 sessions');
    getByText('Gym');
    getByText('1 session'); // singular
    getByText('Bronze');
    getByText('Rookie');
  });

  it('shows the honest explanatory copy without overclaiming verification', () => {
    const { getByText, queryByText } = render(
      <RankSummaryCard
        summary={summary({
          honor: 102,
          sports: [{ sport: 'tennis', rankPoints: 5, tier: 'Rookie', sessionsCompleted: 1 }],
        })}
      />
    );
    getByText('Honor reflects reliability and completed sessions.');
    getByText(/Rank is sport-specific and grows with your completed sessions\./);
    // Pin the regression: rank is computed from booking transitions, not
    // verified results — UI must never imply otherwise.
    expect(queryByText(/verified play history/i)).toBeNull();
    expect(queryByText(/verified competitive/i)).toBeNull();
    expect(queryByText(/result verification/i)).toBeNull();
  });

  it('uses the override title when provided', () => {
    const { getByText, queryByText } = render(
      <RankSummaryCard
        summary={summary({
          honor: 102,
          sports: [{ sport: 'tennis', rankPoints: 5, tier: 'Rookie', sessionsCompleted: 1 }],
        })}
        title="Reputation"
      />
    );
    getByText('Reputation');
    expect(queryByText('Sports reputation')).toBeNull();
  });

  it('handles a non-default honor with no sports (e.g. after a no-show penalty)', () => {
    const { getByText } = render(
      <RankSummaryCard summary={summary({ honor: 95, sports: [] })} />
    );
    // Honor changed → render the badge even with no sports populated yet.
    getByText('95');
  });
});
