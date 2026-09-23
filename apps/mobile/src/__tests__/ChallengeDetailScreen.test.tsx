/**
 * ChallengeDetailScreen tests
 *
 * Covers role-aware actions (accept/decline for opponent, cancel for
 * challenger), submit-result flow (correct payload, post-submit waiting
 * state), pending/verified/disputed copy, safe error messaging, and the
 * non-participant view-only state.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ChallengeDetailScreen } from '../screens/challenges/ChallengeDetailScreen';
import type { ChallengeRead, ChallengeStatus } from '@protin/shared-types';

let mockDetail: ChallengeRead | null;
let mockIsLoading: boolean;
let mockError: string | null;
const mockRefresh = jest.fn();
const mockAccept = jest.fn();
const mockDecline = jest.fn();
const mockCancel = jest.fn();
const mockSubmitResult = jest.fn();

jest.mock('../hooks/useChallenges', () => ({
  useChallengeDetail: () => ({
    detail: mockDetail,
    isLoading: mockIsLoading,
    error: mockError,
    refresh: mockRefresh,
    accept: mockAccept,
    decline: mockDecline,
    cancel: mockCancel,
    submitResult: mockSubmitResult,
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
  return { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
}

function makeRoute(params: { challengeId: string } = { challengeId: 'c1' }) {
  return { key: 'k', name: 'ChallengeDetail' as const, params };
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

describe('ChallengeDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'me';
    mockIsLoading = false;
    mockError = null;
    mockDetail = makeChallenge();
  });

  it('renders the loading state while detail is null', () => {
    mockDetail = null;
    mockIsLoading = true;
    const { getByText, getByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByText('Challenge');
    getByLabelText('Loading challenge');
  });

  it('renders a safe error message with retry when detail load fails', () => {
    mockDetail = null;
    mockError = 'Network down';
    const { getByText, getByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByText('Could not load challenge');
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading challenge'));
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows Accept / Decline buttons when I am the opponent and status is pending', () => {
    mockDetail = makeChallenge({
      status: 'pending',
      challengerUserId: 'them',
      opponentUserId: 'me',
    });
    const { getByLabelText, queryByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByLabelText('Accept challenge');
    getByLabelText('Decline challenge');
    expect(queryByLabelText('Cancel challenge')).toBeNull();
    expect(queryByLabelText('Submit result')).toBeNull();
  });

  it('shows Cancel button when I am the challenger and status is pending', () => {
    mockDetail = makeChallenge({
      status: 'pending',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    const { getByLabelText, queryByLabelText, getByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByLabelText('Cancel challenge');
    getByText('Waiting for opponent to accept or decline.');
    expect(queryByLabelText('Accept challenge')).toBeNull();
    expect(queryByLabelText('Decline challenge')).toBeNull();
    expect(queryByLabelText('Submit result')).toBeNull();
  });

  it('shows the submit-result form when status is accepted and I am a participant', () => {
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    const { getByLabelText, getByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    // Section title + the submit button both render the literal "Submit
    // result", so assert via the button's accessibilityLabel and the
    // unique helper copy below it.
    getByLabelText('Submit result');
    getByText('Result is verified when both players submit matching results.');
    getByLabelText('I won');
    getByLabelText('They won');
  });

  it('hides participant-only actions and shows view-only copy for unrelated users', () => {
    mockCurrentUserId = 'stranger';
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'them',
      opponentUserId: 'opp',
    });
    const { queryByLabelText, getByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    expect(queryByLabelText('Submit result')).toBeNull();
    expect(queryByLabelText('Accept challenge')).toBeNull();
    expect(queryByLabelText('Decline challenge')).toBeNull();
    expect(queryByLabelText('Cancel challenge')).toBeNull();
    getByText('View only');
  });

  it('submits a winner=me payload using current user and derived opponent ids', async () => {
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    mockSubmitResult.mockResolvedValueOnce(undefined);
    const { getByLabelText, getByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    fireEvent.press(getByLabelText('I won'));
    await act(async () => {
      fireEvent.press(getByLabelText('Submit result'));
    });
    expect(mockSubmitResult).toHaveBeenCalledWith({
      winnerUserId: 'me',
      loserUserId: 'them',
    });
    // After successful submit, the form collapses into the waiting state.
    await waitFor(() => {
      getByText('Result submitted');
      getByText(
        'Waiting for your opponent to submit. Verified once both results match.'
      );
    });
  });

  it('submits a winner=opponent payload when I tap "They won"', async () => {
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'them',
      opponentUserId: 'me',
    });
    mockSubmitResult.mockResolvedValueOnce(undefined);
    const { getByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    fireEvent.press(getByLabelText('They won'));
    await act(async () => {
      fireEvent.press(getByLabelText('Submit result'));
    });
    expect(mockSubmitResult).toHaveBeenCalledWith({
      winnerUserId: 'them',
      loserUserId: 'me',
    });
  });

  it('shows the safe error copy under the form when submitResult rejects', async () => {
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    mockSubmitResult.mockRejectedValueOnce(
      new Error('You have already submitted a result for this challenge')
    );
    const { getByLabelText, findByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    fireEvent.press(getByLabelText('I won'));
    await act(async () => {
      fireEvent.press(getByLabelText('Submit result'));
    });
    await findByText('You have already submitted a result for this challenge');
  });

  it('renders the verified status block when the challenge is verified', () => {
    mockDetail = makeChallenge({
      status: 'verified',
      challengerUserId: 'me',
      opponentUserId: 'them',
      verifiedAt: '2026-05-11T13:00:00Z',
    });
    const { getByText, queryByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByText('Result verified');
    getByText(
      'Both players submitted matching results. This counted toward Honor and Rank.'
    );
    expect(queryByLabelText('Submit result')).toBeNull();
  });

  it('renders the disputed status block and the no-rank-change message', () => {
    mockDetail = makeChallenge({
      status: 'disputed',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    const { getByText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    getByText('Result disputed');
    getByText(
      'The two submissions did not match. Honor and Rank are not changed for disputed challenges.'
    );
  });

  it('marks the chosen result option as a selected radio', () => {
    mockDetail = makeChallenge({
      status: 'accepted',
      challengerUserId: 'me',
      opponentUserId: 'them',
    });
    const { getByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    expect(getByLabelText('Submit result').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    fireEvent.press(getByLabelText('I won'));
    const won = getByLabelText('I won');
    expect(won.props.accessibilityRole).toBe('radio');
    expect(won.props.accessibilityState).toMatchObject({ selected: true });
    expect(getByLabelText('They won').props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(getByLabelText('Submit result').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('calls accept() on the hook when the Accept button is pressed', async () => {
    mockDetail = makeChallenge({
      status: 'pending',
      challengerUserId: 'them',
      opponentUserId: 'me',
    });
    mockAccept.mockResolvedValueOnce(undefined);
    const { getByLabelText } = render(
      <ChallengeDetailScreen
        navigation={makeNavigation() as any}
        route={makeRoute() as any}
      />
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Accept challenge'));
    });
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });
});
