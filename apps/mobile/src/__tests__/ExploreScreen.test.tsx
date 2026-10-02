/**
 * ExploreScreen — Run/Golf focus switch, Sessions vs Partners, and the
 * partner-feed states (loading, setup prompt, empty vs request failure),
 * sport-scoped "Show interest", and the mutual-interest chat hand-off.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { ExploreScreen } from '../screens/explore/ExploreScreen';
import { useAuthStore } from '../stores/auth';
import { useExploreStore } from '../stores/explore';
import { useProfileStore } from '../stores/profile';

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

const mockUseEvents = jest.fn();
jest.mock('../hooks/useEvents', () => ({
  useEvents: (args: unknown) => mockUseEvents(args),
}));

jest.mock('../components/SessionCard', () => {
  const { Pressable, Text } = require('react-native');
  return {
    SessionCard: ({ event, onPress }: { event: { id: string; title: string }; onPress: () => void }) => (
      <Pressable onPress={onPress} accessibilityLabel={`session ${event.title}`}>
        <Text>{event.title}</Text>
      </Pressable>
    ),
  };
});

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

function runProfile(overrides: object = {}) {
  return {
    id: 'sp-run',
    userId: 'me',
    sport: 'running',
    level: 'intermediate',
    preferredTimes: ['morning'],
    preferencesVersion: 2,
    golfHandicapTenths: null,
    golfHandicapSource: null,
    golfExperience: null,
    golfPartnerIntents: null,
    golfSimilarityToleranceTenths: null,
    golfPreferredHoles: null,
    runPaceMode: 'match_pace',
    runPaceMinSecPerKm: 330,
    runPaceMaxSecPerKm: 390,
    runDistancesKm: [5, 10],
    runGroupStyle: 'stay_together',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const partner = {
  userId: 'p1',
  displayName: 'Priya',
  suburb: 'Newtown',
  age: 31,
  photoUrls: [],
  sportProfiles: [
    {
      sport: 'running',
      level: 'intermediate',
      preferencesConfigured: true,
      preferredTimes: ['morning'],
      golfHandicapTenths: null,
      golfHandicapSource: null,
      golfExperience: null,
      golfPartnerIntents: null,
      golfPreferredHoles: null,
      runPaceMode: 'match_pace',
      runPaceMinSecPerKm: 360,
      runPaceMaxSecPerKm: 420,
      runDistancesKm: [10],
      runGroupStyle: 'stay_together',
    },
  ],
  compatibility: {
    tier: 'compatible',
    reasons: [{ code: 'pace_overlap', text: 'Pace ranges overlap at 6:00–6:30 /km' }],
    caveats: [],
  },
};

function feed(items: unknown[], extra: object = {}) {
  return { items, total: items.length, limit: 20, offset: 0, nextCursor: null, viewerSetupRequired: false, poolLimit: 200, ...extra };
}

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

function renderExplore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ExploreScreen navigation={navigation as any} route={{ key: 'Explore', name: 'Explore' } as any} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  useExploreStore.getState().reset();
  useAuthStore.setState({ user: { id: 'me', email: 'me@example.com' } as never, token: 't' });
  useProfileStore.setState({ sportProfiles: [runProfile()] as never });
  mockUseEvents.mockReturnValue({ items: [], isLoading: false, error: null, refresh: jest.fn() });
});

async function openPartners(utils: ReturnType<typeof renderExplore>) {
  await waitFor(() => expect(useExploreStore.getState().focusHydrated).toBe(true));
  fireEvent.press(utils.getByLabelText('Partners'));
}

describe('sessions view', () => {
  it('defaults to sessions for the focus sport and lets the user host one', async () => {
    const utils = renderExplore();
    await waitFor(() => expect(mockUseEvents).toHaveBeenCalledWith({ sport: 'running', upcoming: true }));
    utils.getByText('No upcoming runs yet');
    fireEvent.press(utils.getByLabelText('Host a run'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateSession', { sport: 'running' });
  });

  it('switching to Golf asks for golf sessions and changes the copy', async () => {
    const utils = renderExplore();
    await waitFor(() => expect(useExploreStore.getState().focusHydrated).toBe(true));
    fireEvent.press(utils.getByLabelText('Golf'));
    await waitFor(() => expect(mockUseEvents).toHaveBeenLastCalledWith({ sport: 'golf', upcoming: true }));
    utils.getByLabelText('Host a round');
  });

  it('shows a request failure with retry instead of an empty list', async () => {
    const refresh = jest.fn();
    mockUseEvents.mockReturnValue({ items: [], isLoading: false, error: 'Request timed out.', refresh });
    const utils = renderExplore();
    await waitFor(() => utils.getByText('Could not load runs'));
    expect(utils.queryByText('No upcoming runs yet')).toBeNull();
    fireEvent.press(utils.getByLabelText('Try again'));
    expect(refresh).toHaveBeenCalled();
  });

  it('opens a session', async () => {
    mockUseEvents.mockReturnValue({
      items: [{ id: 'e1', title: 'Saturday 10k' }],
      isLoading: false,
      error: null,
      refresh: jest.fn(),
    });
    const utils = renderExplore();
    await waitFor(() => utils.getByText('Saturday 10k'));
    fireEvent.press(utils.getByLabelText('session Saturday 10k'));
    expect(navigation.navigate).toHaveBeenCalledWith('SessionDetail', { eventId: 'e1' });
  });
});

describe('partners view', () => {
  it('renders sport-first cards with factual reasons', async () => {
    mockGet.mockResolvedValueOnce(feed([partner]));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByText('Priya'));
    utils.getByText('Fits both ways');
    utils.getByText('Pace 6:00–7:00 /km');
    utils.getByText('✓ Pace ranges overlap at 6:00–6:30 /km');
    expect(mockGet).toHaveBeenCalledWith('/discovery?sport=running&limit=20');
  });

  it('shows the setup prompt when the server says the viewer is not configured', async () => {
    mockGet.mockResolvedValueOnce(feed([], { viewerSetupRequired: true }));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByTestId('setup-prompt'));
    fireEvent.press(utils.getByLabelText('Set up now'));
    expect(navigation.navigate).toHaveBeenCalledWith('EditSportPreferences', { sport: 'running' });
  });

  it('distinguishes a request failure from no results', async () => {
    mockGet.mockRejectedValueOnce(new Error('Cannot reach the server'));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByTestId('feed-error'));
    utils.getByText('Cannot reach the server');
    expect(utils.queryByTestId('feed-empty')).toBeNull();

    mockGet.mockResolvedValueOnce(feed([]));
    fireEvent.press(utils.getByLabelText('Try again'));
    await waitFor(() => utils.getByTestId('feed-empty'));
    expect(utils.queryByTestId('feed-error')).toBeNull();
  });

  it('Show interest posts with the card sport and offers the chat on a mutual match', async () => {
    mockGet.mockResolvedValueOnce(feed([partner]));
    mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: true, matchId: 'm-1' });
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByText('Priya'));
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Show interest'));
    });
    expect(mockPost).toHaveBeenCalledWith('/discovery/actions', { targetUserId: 'p1', action: 'like', sport: 'running' });
    await waitFor(() => utils.getByText('You and Priya are both interested — say hi.'));
    fireEvent.press(utils.getByLabelText('Open chat'));
    expect(navigation.navigate).toHaveBeenCalledWith('Chat', {
      matchId: 'm-1',
      partnerName: 'Priya',
      partnerId: 'p1',
      sport: 'running',
    });
  });

  it('keeps the card and explains when an action fails', async () => {
    mockGet.mockResolvedValueOnce(feed([partner]));
    mockPost.mockRejectedValueOnce(new Error('Request timed out. Check your network connection.'));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByText('Priya'));
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Pass'));
    });
    await waitFor(() => utils.getByText('Request timed out. Check your network connection.'));
    utils.getByText('Priya');
  });

  it('opens partner detail with the card sport', async () => {
    mockGet.mockResolvedValueOnce(feed([partner]));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByText('Priya'));
    fireEvent.press(utils.getByLabelText('View Priya'));
    expect(navigation.navigate).toHaveBeenCalledWith('PartnerDetail', { userId: 'p1', sport: 'running' });
  });

  it('the pace filter needs the viewer’s own pace range', async () => {
    useProfileStore.setState({
      sportProfiles: [runProfile({ runPaceMode: 'social', runPaceMinSecPerKm: null, runPaceMaxSecPerKm: null })] as never,
    });
    mockGet.mockResolvedValue(feed([]));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByTestId('feed-empty'));
    const chip = utils.getByLabelText('Matching pace only');
    expect(chip.props.accessibilityState).toMatchObject({ disabled: true, checked: false });
    utils.getByText('Add your pace range to use this filter');
  });

  it('turning on the pace filter reloads with strict_pace', async () => {
    mockGet.mockResolvedValue(feed([]));
    const utils = renderExplore();
    await openPartners(utils);
    await waitFor(() => utils.getByTestId('feed-empty'));
    fireEvent.press(utils.getByLabelText('Matching pace only'));
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/discovery?sport=running&limit=20&strict_pace=true'));
    await waitFor(() => utils.getByText('Nobody with a matching pace yet'));
  });

  it('remembers the selected view and sport when returning (store-backed)', async () => {
    mockGet.mockResolvedValue(feed([partner]));
    const first = renderExplore();
    await openPartners(first);
    await waitFor(() => first.getByText('Priya'));
    first.unmount();
    const again = renderExplore();
    await waitFor(() => again.getByText('Priya'));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
