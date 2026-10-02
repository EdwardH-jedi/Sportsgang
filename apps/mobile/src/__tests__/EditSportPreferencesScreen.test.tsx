/**
 * EditSportPreferencesScreen — edit / complete one sport's v2 preferences.
 * Real profile store, mocked API client.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SportProfile } from '@protin/shared-types';

import { EditSportPreferencesScreen } from '../screens/profile/EditSportPreferencesScreen';
import { useProfileStore } from '../stores/profile';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const NULLS = {
  preferencesVersion: null,
  golfHandicapTenths: null,
  golfHandicapSource: null,
  golfExperience: null,
  golfPartnerIntents: null,
  golfSimilarityToleranceTenths: null,
  golfPreferredHoles: null,
  runPaceMode: null,
  runPaceMinSecPerKm: null,
  runPaceMaxSecPerKm: null,
  runDistancesKm: null,
  runGroupStyle: null,
};

const RUN_V2 = {
  ...NULLS,
  id: 'sp-run',
  userId: 'u1',
  sport: 'running',
  level: 'intermediate',
  preferredTimes: ['morning'],
  updatedAt: '2026-10-01T00:00:00Z',
  preferencesVersion: 2,
  runPaceMode: 'match_pace',
  runPaceMinSecPerKm: 330,
  runPaceMaxSecPerKm: 390,
  runDistancesKm: [7],
} as SportProfile;

const GOLF_LEGACY = {
  ...NULLS,
  id: 'sp-golf',
  userId: 'u1',
  sport: 'golf',
  level: 'intermediate',
  preferredTimes: ['evening'],
  golfClub: 'Moore Park',
  goals: 'Break 90',
  updatedAt: '2026-01-01T00:00:00Z',
} as SportProfile;

function makeNavigation() {
  return { goBack: jest.fn(), navigate: jest.fn() };
}

function renderEdit(sport: 'running' | 'golf') {
  const nav = makeNavigation();
  const utils = render(<EditSportPreferencesScreen navigation={nav as any} route={{ params: { sport } } as any} />);
  return { nav, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  useProfileStore.setState({ profile: null, identityPreferences: null, sportProfiles: [RUN_V2, GOLF_LEGACY], photoUris: [] });
  mockPost.mockImplementation(async (_p: string, body: Record<string, unknown>) => ({ ...NULLS, id: 'x', ...body }));
});

it('prefills a configured running row including a non-preset distance', () => {
  const { getByLabelText } = renderEdit('running');
  expect(getByLabelText('Fastest').props.value).toBe('5:30');
  expect(getByLabelText('Slowest').props.value).toBe('6:30');
  expect(getByLabelText('7 km').props.accessibilityState.checked).toBe(true);
  expect(getByLabelText('Mornings').props.accessibilityState.checked).toBe(true);
});

it('saves an edited pace as integer seconds and goes back', async () => {
  const { getByLabelText, nav } = renderEdit('running');
  fireEvent.changeText(getByLabelText('Slowest'), '6:45');
  fireEvent.press(getByLabelText('Save preferences'));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(mockPost).toHaveBeenCalledWith('/users/me/sport-profiles', {
    sport: 'running',
    level: 'intermediate',
    preferredTimes: ['morning'],
    preferencesVersion: 2,
    runPaceMode: 'match_pace',
    runPaceMinSecPerKm: 330,
    runPaceMaxSecPerKm: 405,
    runDistancesKm: [7],
    runGroupStyle: null,
  });
});

it('completes a legacy golf row in place, keeping club and goals', async () => {
  const { getByLabelText, getByText, nav } = renderEdit('golf');
  getByText(/created before these questions existed/);
  // Level comes from the stored row; everything else must be answered.
  fireEvent.press(getByLabelText('Save preferences'));
  await waitFor(() => getByText('Choose your handicap situation.'));
  expect(mockPost).not.toHaveBeenCalled();

  fireEvent.press(getByLabelText('My estimate'));
  fireEvent.changeText(getByLabelText('Estimated handicap'), '22.5');
  fireEvent.press(getByLabelText('Played some rounds'));
  fireEvent.press(getByLabelText('Similar level'));
  fireEvent.press(getByLabelText('Within 8.0'));
  fireEvent.press(getByLabelText('Save preferences'));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  expect(mockPost.mock.calls[0][1]).toEqual({
    sport: 'golf',
    level: 'intermediate',
    preferredTimes: ['evening'],
    preferencesVersion: 2,
    golfHandicapTenths: 225,
    golfHandicapSource: 'estimate',
    golfExperience: 'played_rounds',
    golfPartnerIntents: ['similar_level'],
    golfSimilarityToleranceTenths: 80,
    golfPreferredHoles: null,
    golfClub: 'Moore Park',
    goals: 'Break 90',
  });
});

it('creates the sport when the user has no row for it yet (Explore “Set up now”)', async () => {
  useProfileStore.setState({ sportProfiles: [GOLF_LEGACY] });
  const { getByLabelText, queryByLabelText, nav } = renderEdit('running');
  // Nothing to remove yet.
  expect(queryByLabelText(/Remove/)).toBeNull();
  fireEvent.press(getByLabelText('Beginner'));
  fireEvent.press(getByLabelText('Social'));
  fireEvent.press(getByLabelText('Evenings'));
  fireEvent.press(getByLabelText('Save preferences'));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  const body = mockPost.mock.calls[0][1];
  expect(body).toMatchObject({
    sport: 'running',
    level: 'beginner',
    preferredTimes: ['evening'],
    preferencesVersion: 2,
    runPaceMode: 'social',
  });
  // No legacy fields from another sport leak into the new row.
  expect(body).not.toHaveProperty('golfClub');
  expect(body).not.toHaveProperty('goals');
  expect(useProfileStore.getState().sportProfiles?.map((sp) => sp.sport)).toEqual(['golf', 'running']);
});

it('shows the server’s reason when the save is rejected', async () => {
  mockPost.mockRejectedValueOnce(new Error('Matching pace needs your comfortable pace range.'));
  const { getByLabelText, getByText, nav } = renderEdit('running');
  fireEvent.press(getByLabelText('Save preferences'));
  await waitFor(() => getByText('Matching pace needs your comfortable pace range.'));
  expect(nav.goBack).not.toHaveBeenCalled();
});

it('loads the profile on a cold start and prefills once it arrives', async () => {
  useProfileStore.setState({ sportProfiles: null });
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/users/me/profile') return { id: 'p', userId: 'u1', displayName: 'Jo', photos: [] };
    if (path === '/users/me/identity-preferences') throw new Error('Preferences not found');
    if (path === '/users/me/sport-profiles') return [RUN_V2];
    throw new Error(path);
  });
  const { getByLabelText } = renderEdit('running');
  await waitFor(() => expect(getByLabelText('Fastest').props.value).toBe('5:30'));
});

it('offers a retry when loading fails', async () => {
  useProfileStore.setState({ sportProfiles: null });
  mockGet.mockRejectedValue(new Error('Request timed out. Check your network connection.'));
  const { getByText, getByLabelText } = renderEdit('golf');
  await waitFor(() => getByText('Could not load your profile'));
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/users/me/profile') return { id: 'p', userId: 'u1', displayName: 'Jo', photos: [] };
    if (path === '/users/me/identity-preferences') return null;
    return [GOLF_LEGACY];
  });
  fireEvent.press(getByLabelText('Try again'));
  await waitFor(() => getByLabelText('Save preferences'));
});

it('removes the sport only after confirmation', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDelete.mockResolvedValue(undefined);
  const { getByLabelText, nav } = renderEdit('golf');
  fireEvent.press(getByLabelText('Remove golf from my profile'));
  expect(mockDelete).not.toHaveBeenCalled();
  const buttons = alertSpy.mock.calls[0][2] as { text: string; style?: string; onPress?: () => Promise<void> }[];
  await act(async () => {
    await buttons.find((b) => b.style === 'destructive')?.onPress?.();
  });
  expect(mockDelete).toHaveBeenCalledWith('/users/me/sport-profiles/golf');
  expect(useProfileStore.getState().sportProfiles?.map((sp) => sp.sport)).toEqual(['running']);
  expect(nav.goBack).toHaveBeenCalled();
  alertSpy.mockRestore();
});
