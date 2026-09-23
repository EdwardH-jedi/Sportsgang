/**
 * Runners segment of the Run tab (ported from the old DiscoveryScreen
 * tests): states, sport chips, Pass / Save / Connect(“Like”), swipe
 * gestures, match banner, partner preview, honor badge, public profile.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { PartnerCard, UseDiscoveryReturn } from '../hooks/useDiscovery';
import { RunnersView, RUNNER_RADIUS_KM, partnerKey } from '../screens/run/RunnersView';
import { swipeDecision } from '../screens/run/components/RunnerCard';

const mockRecordAction = jest.fn();
const mockFetchMore = jest.fn();
const mockSetSport = jest.fn();
const mockUseDiscovery = jest.fn();

jest.mock('../hooks/useDiscovery', () => ({
  useDiscovery: (args: unknown) => mockUseDiscovery(args),
}));

jest.mock('../hooks/useRankSummary', () => ({
  useRankSummary: () => ({ summary: null, isLoading: false, error: null, refresh: jest.fn() }),
}));

let mockHonorSummary: { honorLevel: string; honorScore: number } | null = null;
let mockHonorError: string | null = null;
jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: () => ({ summary: mockHonorSummary, isLoading: false, error: mockHonorError }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const baseDiscovery: UseDiscoveryReturn = {
  partners: [],
  isLoading: false,
  error: null,
  sport: 'running',
  setSport: mockSetSport,
  recordAction: mockRecordAction,
  fetchMore: mockFetchMore,
};

function setup(overrides: Partial<UseDiscoveryReturn> = {}) {
  mockUseDiscovery.mockReturnValue({ ...baseDiscovery, ...overrides });
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderView(coords: { lat: number; lng: number } | null = null) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RunnersView coords={coords} />
    </SafeAreaProvider>
  );
}

const alex: PartnerCard = {
  userId: 'user-1',
  displayName: 'Alex Smith',
  suburb: 'Surry Hills',
  bioExcerpt: 'Easy 10ks before work.',
  age: 28,
  distanceKm: 2,
  sportProfiles: [{ sport: 'running', level: 'intermediate' }],
};
const blake: PartnerCard = { userId: 'user-2', displayName: 'Blake', sportProfiles: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockHonorSummary = { honorLevel: 'Trusted', honorScore: 118 };
  mockHonorError = null;
});

describe('RunnersView', () => {
  it('passes rounded coords + radius to useDiscovery only when located', () => {
    setup();
    renderView({ lat: -33.88, lng: 151.21 });
    expect(mockUseDiscovery).toHaveBeenLastCalledWith({
      coords: { lat: -33.88, lng: 151.21 },
      radiusKm: RUNNER_RADIUS_KM,
    });
    renderView(null);
    expect(mockUseDiscovery).toHaveBeenLastCalledWith({ coords: null, radiusKm: undefined });
  });

  it('shows a loading state', () => {
    setup({ isLoading: true });
    const { getByText, getByLabelText } = renderView();
    getByText('Finding runners…');
    getByLabelText('Finding runners');
  });

  it('shows the error state and retries', () => {
    setup({ error: 'Network error' });
    const { getByText } = renderView();
    getByText('Something went wrong');
    getByText('Network error');
    fireEvent.press(getByText('Try again'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state and refreshes', () => {
    setup({ sport: 'gym' });
    const { getByText } = renderView();
    getByText('No players to show right now.');
    getByText('Check back soon — new players join every week.');
    fireEvent.press(getByText('Refresh'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  it('mentions the radius in the empty state when located', () => {
    setup();
    const { getByText } = renderView({ lat: -33.9, lng: 151.2 });
    getByText('No runners to show right now.');
    getByText(`Nobody new within ${RUNNER_RADIUS_KM} km yet — new runners join every week.`);
  });

  it('renders the top runner with age, suburb, distance, sport badge and bio', () => {
    setup({ partners: [alex, blake] });
    const { getByText, getByLabelText, queryByText } = renderView();
    getByText('Alex Smith, 28');
    getByText('Surry Hills · 2 km away');
    getByText('Running · Intermediate');
    getByText('Easy 10ks before work.');
    getByLabelText('Alex Smith card');
    getByText('1 more runners to meet');
    // Only the top card is shown.
    expect(queryByText('Blake')).toBeNull();
  });

  it('falls back to initials when the runner has no photo', () => {
    setup({ partners: [{ ...alex, avatarUrl: undefined, photoUrls: [] }] });
    const { getByText } = renderView();
    getByText('AS');
  });

  it('keeps the Pass / Save / Like(Connect) controls', () => {
    setup({ partners: [alex] });
    const { getByLabelText, getAllByText } = renderView();
    getByLabelText('Pass');
    getByLabelText('Save');
    getByLabelText('Like');
    // Visible CTA is "Connect" (plus the swipe stamp).
    expect(getAllByText('Connect').length).toBeGreaterThan(0);
  });

  it.each([
    ['Like', 'like'],
    ['Pass', 'pass'],
    ['Save', 'save'],
  ])('%s records a %s action', async (label, action) => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setup({ partners: [alex] });
    const { getByLabelText } = renderView();
    await act(async () => {
      fireEvent.press(getByLabelText(label));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', action);
  });

  it('shows the Linked up banner after a mutual like', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: true, matchId: 'm1' });
    setup({ partners: [alex] });
    const { getByLabelText, findByText } = renderView();
    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });
    await findByText('Linked up.');
  });

  it('does not show the banner without a match and survives a failed action', async () => {
    mockRecordAction.mockRejectedValueOnce(new Error('Server error'));
    setup({ partners: [alex] });
    const { getByLabelText, queryByText } = renderView();
    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });
    expect(queryByText('Linked up.')).toBeNull();
    getByLabelText('Alex Smith card');
  });

  it('swipe right connects and swipe left passes', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setup({ partners: [alex] });
    renderView();
    fireGestureHandler<PanGesture>(getByGestureTestId('runner-swipe'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: 120, velocityX: 600 },
      { state: State.END, translationX: 260, velocityX: 900 },
    ]);
    await waitFor(() => expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'like'), {
      timeout: 3000,
    });

    mockRecordAction.mockClear();
    fireGestureHandler<PanGesture>(getByGestureTestId('runner-swipe'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -120, velocityX: -600 },
      { state: State.END, translationX: -260, velocityX: -900 },
    ]);
    await waitFor(() => expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'pass'), {
      timeout: 3000,
    });
  });

  it('a short drag snaps back without acting', async () => {
    setup({ partners: [alex] });
    renderView();
    fireGestureHandler<PanGesture>(getByGestureTestId('runner-swipe'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: 30, velocityX: 50 },
      { state: State.END, translationX: 30, velocityX: 50 },
    ]);
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRecordAction).not.toHaveBeenCalled();
  });

  it('decides swipes from distance plus fling velocity', () => {
    expect(swipeDecision(200, 0, 390)).toBe('right');
    expect(swipeDecision(-200, 0, 390)).toBe('left');
    expect(swipeDecision(40, 0, 390)).toBeNull();
    // A fast fling commits even from a short drag.
    expect(swipeDecision(40, 800, 390)).toBe('right');
  });

  describe('sport chips', () => {
    it('lists the registry sports, running first and selected', () => {
      setup();
      const { getByLabelText } = renderView();
      for (const label of ['Running', 'Gym', 'Tennis', 'Golf']) getByLabelText(label);
      expect(getByLabelText('Running').props.accessibilityState).toMatchObject({ selected: true });
    });

    it('switches sport', () => {
      setup();
      const { getByLabelText } = renderView();
      fireEvent.press(getByLabelText('Golf'));
      expect(mockSetSport).toHaveBeenCalledWith('golf');
    });

    it('titles the feed by sport and keeps the sport-specific match rule', () => {
      setup({ sport: 'gym' });
      const { getByText } = renderView();
      getByText('Gym partners');
      getByText(
        "Likes are sport-specific — you'll match when both players like each other for the same sport."
      );
    });
  });

  describe('partner preview', () => {
    it('opens the gallery + full bio and closes', async () => {
      setup({
        partners: [{ ...alex, bio: 'Sunday long runs.', photoUrls: ['https://a/0.jpg', 'https://a/1.jpg'] }],
      });
      const utils = renderView();
      await act(async () => {
        fireEvent.press(utils.getByLabelText('View details'));
      });
      utils.getByText('Sunday long runs.');
      utils.getByLabelText('Alex Smith photo 1');
      utils.getByLabelText('Alex Smith photo 2');
      await act(async () => {
        fireEvent.press(utils.getByLabelText('Close profile preview'));
      });
      expect(utils.queryByText('Sunday long runs.')).toBeNull();
    });

    it('uses friendly placeholders without photos or bio', async () => {
      setup({ partners: [{ ...alex, bio: undefined, photoUrls: [] }] });
      const utils = renderView();
      await act(async () => {
        fireEvent.press(utils.getByLabelText('View details'));
      });
      utils.getByText('No photos yet');
      utils.getByText("This player hasn't added a bio yet.");
    });
  });

  it('opens the public profile', () => {
    setup({ partners: [alex] });
    const { getByLabelText } = renderView();
    fireEvent.press(getByLabelText('View profile'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'PublicProfile',
      expect.objectContaining({ userId: 'user-1', displayName: 'Alex Smith' })
    );
  });

  describe('honor badge', () => {
    it('shows the level', () => {
      setup({ partners: [alex] });
      renderView().getByText('Trusted');
    });

    it('falls back to New player', () => {
      mockHonorSummary = null;
      setup({ partners: [alex] });
      renderView().getByText('New player');
    });

    it('hides on hard error but keeps the card', () => {
      mockHonorSummary = null;
      mockHonorError = 'Network down';
      setup({ partners: [alex] });
      const { getByLabelText, queryByText } = renderView();
      getByLabelText('Alex Smith card');
      expect(queryByText('New player')).toBeNull();
    });
  });

  describe('partnerKey', () => {
    const p = (userId: string): PartnerCard => ({ userId, displayName: 'x', sportProfiles: [] });
    it('is unique per index, sport and user, led by the userId', () => {
      expect(partnerKey(p('u1'), 0, 'gym')).not.toBe(partnerKey(p('u1'), 1, 'gym'));
      expect(partnerKey(p('u1'), 0, 'gym')).not.toBe(partnerKey(p('u1'), 0, 'golf'));
      expect(partnerKey(p('u1'), 0, 'gym')).not.toBe(partnerKey(p('u2'), 0, 'gym'));
      expect(partnerKey(p('u1'), 0, 'gym')).toMatch(/^u1-/);
    });
  });

  it('copy avoids popularity / leaderboard / verified claims', () => {
    setup({ partners: [alex] });
    const { queryByText } = renderView();
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
  });
});
