/**
 * ChallengeListScreen tests
 *
 * Covers loading / empty / error states, the incoming/active/done client-side
 * grouping (since the backend list returns the caller's whole challenge set
 * unfiltered), and detail-screen navigation.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ChallengeListScreen } from '../screens/challenges/ChallengeListScreen';
import type { ChallengeRead, ChallengeStatus } from '@protin/shared-types';

let mockHookState: {
  items: ChallengeRead[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

const mockRefresh = jest.fn();

jest.mock('../hooks/useChallenges', () => ({
  useChallenges: () => ({
    ...mockHookState,
    refresh: mockRefresh,
  }),
}));

let mockCurrentUserId: string | null = 'me';

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockCurrentUserId ? { id: mockCurrentUserId } : null }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
  };
});

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeChallenge(overrides: Partial<ChallengeRead> = {}): ChallengeRead {
  return {
    id: 'c1',
    challengerUserId: 'them',
    opponentUserId: 'me',
    sport: 'tennis',
    area: 'Bondi',
    status: 'pending' as ChallengeStatus,
    note: null,
    createdAt: '2026-05-10T12:00:00Z',
    updatedAt: '2026-05-10T12:00:00Z',
    acceptedAt: null,
    completedAt: null,
    verifiedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe('ChallengeListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHookState = { items: [], total: 0, isLoading: false, error: null };
    mockCurrentUserId = 'me';
  });

  it('renders a loading skeleton while items are empty and request is in flight', () => {
    mockHookState = { items: [], total: 0, isLoading: true, error: null };
    const { getByText, getByLabelText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    // Header still rendered above the skeleton.
    getByText('Challenges');
    getByLabelText('Loading challenges');
    getByLabelText('Back');
  });

  it('renders empty-section copy when the hook resolves to no items', () => {
    const { getByText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Awaiting your response');
    getByText('No incoming challenges right now.');
    getByText('No active challenges. Accept an incoming one to start.');
    getByText('No completed challenges yet.');
  });

  it('renders the error block with a retry button when the load fails', () => {
    mockHookState = {
      items: [],
      total: 0,
      isLoading: false,
      error: 'Network down',
    };
    const { getByText, getByLabelText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Could not load challenges');
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading challenges'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('routes pending-where-I-am-opponent into the incoming section', () => {
    mockHookState = {
      items: [makeChallenge({ id: 'a', status: 'pending', opponentUserId: 'me', challengerUserId: 'them' })],
      total: 1,
      isLoading: false,
      error: null,
    };
    const { getByText, queryByText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    // Card present in incoming list.
    getByText('Challenged you');
    expect(queryByText('No incoming challenges right now.')).toBeNull();
    // Active section is empty (no card text "You challenged" surfaced).
    getByText('No active challenges. Accept an incoming one to start.');
  });

  it('routes pending-where-I-am-challenger into the active section', () => {
    mockHookState = {
      items: [makeChallenge({ id: 'b', status: 'pending', challengerUserId: 'me', opponentUserId: 'them' })],
      total: 1,
      isLoading: false,
      error: null,
    };
    const { getByText, queryByText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('You challenged');
    expect(queryByText('No active challenges. Accept an incoming one to start.')).toBeNull();
    getByText('No incoming challenges right now.');
  });

  it('routes accepted challenges into the active section regardless of role', () => {
    mockHookState = {
      items: [makeChallenge({ id: 'c', status: 'accepted', challengerUserId: 'me', opponentUserId: 'them' })],
      total: 1,
      isLoading: false,
      error: null,
    };
    const { getByText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Active');
    getByText('You challenged');
  });

  it('routes verified / disputed / declined / cancelled into the done section', () => {
    mockHookState = {
      items: [
        makeChallenge({ id: 'v', status: 'verified' }),
        makeChallenge({ id: 'd', status: 'disputed' }),
        makeChallenge({ id: 'x', status: 'declined' }),
        makeChallenge({ id: 'k', status: 'cancelled' }),
      ],
      total: 4,
      isLoading: false,
      error: null,
    };
    const { getByText, queryByText, getAllByText } = render(
      <ChallengeListScreen navigation={makeNavigation() as any} route={{} as any} />
    );
    getByText('Done');
    // Done section is non-empty (so emptyCopy must NOT render).
    expect(queryByText('No completed challenges yet.')).toBeNull();
    // Every terminal card carries the "Challenged you" role-label (opponent=me).
    expect(getAllByText('Challenged you').length).toBe(4);
  });

  it('navigates to detail when a card is pressed', () => {
    const nav = makeNavigation();
    mockHookState = {
      items: [makeChallenge({ id: 'open-me', sport: 'tennis' })],
      total: 1,
      isLoading: false,
      error: null,
    };
    const { getByLabelText } = render(
      <ChallengeListScreen navigation={nav as any} route={{} as any} />
    );
    fireEvent.press(getByLabelText('Open challenge in Tennis'));
    expect(nav.navigate).toHaveBeenCalledWith('ChallengeDetail', {
      challengeId: 'open-me',
    });
  });
});
