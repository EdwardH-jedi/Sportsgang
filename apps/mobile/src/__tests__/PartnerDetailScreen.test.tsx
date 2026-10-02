/**
 * PartnerDetailScreen — reads the card the Explore feed loaded, shows the
 * sport details + every reason/caveat, and "Show interest" uses the
 * existing like (mutual → existing chat), never an invitation inbox.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { PartnerDetailScreen } from '../screens/explore/PartnerDetailScreen';
import { useExploreStore } from '../stores/explore';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const golfer = {
  userId: 'g1',
  displayName: 'Morgan',
  suburb: 'Bondi',
  bio: 'Weekend golfer, happy to help newer players.',
  photoUrls: [],
  sportProfiles: [
    {
      sport: 'golf',
      level: 'advanced',
      preferencesConfigured: true,
      preferredTimes: ['morning', 'afternoon'],
      golfHandicapTenths: -21,
      golfHandicapSource: 'official_index',
      golfExperience: 'regular',
      golfPartnerIntents: ['welcome_beginners'],
      golfPreferredHoles: '18',
      runPaceMode: null,
      runPaceMinSecPerKm: null,
      runPaceMaxSecPerKm: null,
      runDistancesKm: null,
      runGroupStyle: null,
    },
  ],
  compatibility: {
    tier: 'compatible',
    reasons: [
      { code: 'more_experienced', text: 'More experienced than you (plays regularly vs driving-range experience)' },
      { code: 'welcomes_beginners', text: 'Welcomes beginners' },
    ],
    caveats: [{ code: 'handicap_self_reported', text: 'Handicaps are self-reported, not verified' }],
  },
};

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

async function loadGolfFeed() {
  useExploreStore.getState().reset();
  useExploreStore.getState().setFocusSport('golf');
  mockGet.mockResolvedValueOnce({ items: [golfer], total: 1, limit: 20, offset: 0, nextCursor: null });
  await useExploreStore.getState().loadFeed();
}

function renderDetail(userId = 'g1', sport: 'golf' | 'running' = 'golf') {
  return render(
    <PartnerDetailScreen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigation={navigation as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      route={{ key: 'PartnerDetail', name: 'PartnerDetail', params: { userId, sport } } as any}
    />
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await loadGolfFeed();
});

it('shows golf details, reasons and the self-reported caveat', () => {
  const utils = renderDetail();
  utils.getByText('Morgan');
  utils.getByText('Fits both ways');
  utils.getByText('+2.1 (self-reported)');
  utils.getByText('Play regularly');
  utils.getByText('Happy to play with beginners');
  utils.getByText('Mornings, Afternoons');
  utils.getByText('✓ Welcomes beginners');
  utils.getByText('Handicaps are self-reported, not verified');
  utils.getByText('Weekend golfer, happy to help newer players.');
});

it('a one-sided interest goes back to Explore and removes the card', async () => {
  mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: false });
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Show interest'));
  });
  expect(mockPost).toHaveBeenCalledWith('/discovery/actions', { targetUserId: 'g1', action: 'like', sport: 'golf' });
  expect(navigation.goBack).toHaveBeenCalled();
  expect(useExploreStore.getState().feed.items).toHaveLength(0);
});

it('mutual interest replaces the detail with the existing chat', async () => {
  mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: true, matchId: 'm9' });
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Show interest'));
  });
  expect(navigation.replace).toHaveBeenCalledWith('Chat', {
    matchId: 'm9',
    partnerName: 'Morgan',
    partnerId: 'g1',
    sport: 'golf',
  });
});

it('keeps the user on the screen with a message when the action fails', async () => {
  mockPost.mockRejectedValueOnce(new Error('Request timed out. Check your network connection.'));
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Pass'));
  });
  await waitFor(() => utils.getByText('Request timed out. Check your network connection.'));
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('report / block stays reachable', () => {
  const utils = renderDetail();
  fireEvent.press(utils.getByLabelText('Report or block'));
  expect(navigation.navigate).toHaveBeenCalledWith('Report', { reportedUserId: 'g1', reportedName: 'Morgan' });
});

it('a card that is not in the current sport feed shows an honest fallback', () => {
  const utils = renderDetail('g1', 'running');
  utils.getByText('This profile is no longer in your feed');
  fireEvent.press(utils.getByLabelText('Back to Explore'));
  expect(navigation.goBack).toHaveBeenCalled();
});
