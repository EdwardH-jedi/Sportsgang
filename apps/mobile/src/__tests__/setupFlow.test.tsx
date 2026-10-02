/**
 * v2 sport setup flow: SetupSports → SetupSportDetails → SetupAvailability.
 *
 * Uses the real profile + setup-draft stores with a mocked API client so the
 * tests assert the actual upsert payloads (docs/run-golf-v2/CONTRACTS.md §2).
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { SportProfile } from '@protin/shared-types';

import { SetupAvailabilityScreen } from '../screens/setup/SetupAvailabilityScreen';
import { SetupSportDetailsScreen } from '../screens/setup/SetupSportDetailsScreen';
import { SetupSportsScreen } from '../screens/setup/SetupSportsScreen';
import { useProfileStore } from '../stores/profile';
import { useSetupDraft } from '../stores/setupDraft';
import type { GolfFormState, RunFormState } from '../components/preferences/formState';

const mockPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: (...args: unknown[]) => mockPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

function makeNavigation(canGoBack = true) {
  return {
    navigate: jest.fn(),
    push: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    canGoBack: jest.fn(() => canGoBack),
  };
}

const VALID_GOLF: GolfFormState = {
  level: 'beginner',
  handicapSource: 'none',
  handicapText: '',
  experience: 'range',
  intents: ['learn_from_experienced'],
  toleranceTenths: null,
  holes: '9',
};

const VALID_RUN: RunFormState = {
  level: 'intermediate',
  paceMode: 'match_pace',
  paceFastest: '5:30',
  paceSlowest: '6:30',
  distances: [5, 10],
  groupStyle: null,
};

function storedRow(body: Record<string, unknown>): SportProfile {
  return { id: `sp-${String(body.sport)}`, userId: 'u1', updatedAt: '2026-10-03T00:00:00Z', ...body } as SportProfile;
}

beforeEach(() => {
  jest.clearAllMocks();
  useProfileStore.setState({ profile: null, identityPreferences: null, sportProfiles: [], photoUris: [] });
  useSetupDraft.getState().reset();
  mockPost.mockImplementation(async (_path: string, body: Record<string, unknown>) => storedRow(body));
});

// ─── SetupSports ──────────────────────────────────────────────────────────────

describe('SetupSportsScreen', () => {
  function renderSports(mode: 'onboarding' | 'add' = 'onboarding') {
    const nav = makeNavigation();
    const utils = render(<SetupSportsScreen navigation={nav as any} route={{ params: { mode } } as any} />);
    return { nav, ...utils };
  }

  it('requires at least one sport', () => {
    const { getByLabelText, getByText, nav } = renderSports();
    fireEvent.press(getByLabelText('Continue'));
    getByText('Choose running, golf or both.');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('continues with both sports in a stable order', () => {
    const { getByLabelText, nav, getByText } = renderSports();
    getByText('Step 2 of 4');
    fireEvent.press(getByLabelText('Golf'));
    fireEvent.press(getByLabelText('Running'));
    fireEvent.press(getByLabelText('Continue'));
    expect(nav.navigate).toHaveBeenCalledWith('SetupSportDetails', {
      mode: 'onboarding',
      sports: ['running', 'golf'],
      index: 0,
    });
  });

  it('in add mode, a sport already on the profile is not offered again', () => {
    useProfileStore.setState({ sportProfiles: [storedRow({ sport: 'golf', level: 'advanced' })] });
    const { getByLabelText, nav, getByText } = renderSports('add');
    getByText('Add a sport');
    expect(getByLabelText('Golf').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByLabelText('Running'));
    fireEvent.press(getByLabelText('Continue'));
    expect(nav.navigate).toHaveBeenCalledWith('SetupSportDetails', { mode: 'add', sports: ['running'], index: 0 });
  });

  it('starts every flow from a clean draft', () => {
    act(() => useSetupDraft.getState().setGolf(VALID_GOLF));
    renderSports();
    expect(useSetupDraft.getState().golf.level).toBeNull();
  });
});

// ─── SetupSportDetails ────────────────────────────────────────────────────────

describe('SetupSportDetailsScreen', () => {
  function renderDetails(sports: ('running' | 'golf')[], index = 0, mode: 'onboarding' | 'add' = 'onboarding') {
    const nav = makeNavigation();
    const utils = render(
      <SetupSportDetailsScreen navigation={nav as any} route={{ params: { mode, sports, index } } as any} />
    );
    return { nav, ...utils };
  }

  it('validates golf details before continuing', () => {
    const { getByLabelText, getByText, nav } = renderDetails(['golf']);
    fireEvent.press(getByLabelText('Continue'));
    getByText('Choose your overall level.');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('collects golf intent with a plus handicap and moves on to availability', () => {
    const { getByLabelText, nav } = renderDetails(['golf']);
    fireEvent.press(getByLabelText('Advanced'));
    fireEvent.press(getByLabelText('Official handicap'));
    fireEvent.changeText(getByLabelText('Handicap index'), '+2.1');
    fireEvent.press(getByLabelText('Play regularly'));
    fireEvent.press(getByLabelText('Happy to play with beginners'));
    fireEvent.press(getByLabelText('Continue'));
    expect(nav.navigate).toHaveBeenCalledWith('SetupAvailability', { mode: 'onboarding', sports: ['golf'] });
    const golf = useSetupDraft.getState().golf;
    expect(golf.handicapText).toBe('+2.1');
    expect(golf.intents).toEqual(['welcome_beginners']);
  });

  it('only asks how close "similar" is once Similar level is chosen', () => {
    const { getByLabelText, queryByLabelText } = renderDetails(['golf']);
    expect(queryByLabelText('Within 5.0')).toBeNull();
    fireEvent.press(getByLabelText('Similar level'));
    getByLabelText('Within 5.0');
  });

  it('hides the handicap number for "No handicap"', () => {
    const { getByLabelText, queryByLabelText } = renderDetails(['golf']);
    fireEvent.press(getByLabelText('No handicap'));
    expect(queryByLabelText('Handicap index')).toBeNull();
    expect(queryByLabelText('Estimated handicap')).toBeNull();
  });

  it('pushes the next sport when two were chosen', () => {
    const { getByLabelText, nav } = renderDetails(['running', 'golf'], 0);
    fireEvent.press(getByLabelText('Intermediate'));
    fireEvent.press(getByLabelText('Match my pace'));
    fireEvent.changeText(getByLabelText('Fastest'), '5:30');
    fireEvent.changeText(getByLabelText('Slowest'), '6:30');
    fireEvent.press(getByLabelText('10 km'));
    fireEvent.press(getByLabelText('Continue'));
    expect(nav.push).toHaveBeenCalledWith('SetupSportDetails', {
      mode: 'onboarding',
      sports: ['running', 'golf'],
      index: 1,
    });
    expect(useSetupDraft.getState().run.distances).toEqual([10]);
  });

  it('rejects a decimal pace like 6.30', () => {
    const { getByLabelText, getByText, nav } = renderDetails(['running']);
    fireEvent.press(getByLabelText('Beginner'));
    fireEvent.press(getByLabelText('Match my pace'));
    fireEvent.changeText(getByLabelText('Fastest'), '6.30');
    fireEvent.changeText(getByLabelText('Slowest'), '7:00');
    fireEvent.press(getByLabelText('Continue'));
    getByText('Fastest pace: Use minutes:seconds, e.g. 5:30.');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('prefills the level of an existing legacy row without inventing anything else', () => {
    useProfileStore.setState({ sportProfiles: [storedRow({ sport: 'golf', level: 'intermediate', preferencesVersion: null })] });
    const { getByLabelText } = renderDetails(['golf']);
    expect(getByLabelText('Intermediate').props.accessibilityState.selected).toBe(true);
    expect(useSetupDraft.getState().golf.handicapSource).toBeNull();
    expect(useSetupDraft.getState().golf.intents).toEqual([]);
  });
});

// ─── SetupAvailability ────────────────────────────────────────────────────────

describe('SetupAvailabilityScreen', () => {
  function renderAvailability(sports: ('running' | 'golf')[], mode: 'onboarding' | 'add' = 'onboarding') {
    const nav = makeNavigation();
    const utils = render(
      <SetupAvailabilityScreen navigation={nav as any} route={{ params: { mode, sports } } as any} />
    );
    return { nav, ...utils };
  }

  beforeEach(() => {
    act(() => {
      useSetupDraft.getState().setGolf(VALID_GOLF);
      useSetupDraft.getState().setRun(VALID_RUN);
    });
  });

  it('requires a time preference', async () => {
    const { getByLabelText, getByText } = renderAvailability(['running']);
    fireEvent.press(getByLabelText('Finish'));
    await waitFor(() => getByText('Choose when you usually play, or Flexible.'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('saves one v2 upsert per sport with only that sport’s fields, then enters the app', async () => {
    const { getByLabelText, nav } = renderAvailability(['running', 'golf']);
    fireEvent.press(getByLabelText('Mornings'));
    fireEvent.press(getByLabelText('Finish'));
    await waitFor(() => expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] }));

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenNthCalledWith(1, '/users/me/sport-profiles', {
      sport: 'running',
      level: 'intermediate',
      preferredTimes: ['morning'],
      preferencesVersion: 2,
      runPaceMode: 'match_pace',
      runPaceMinSecPerKm: 330,
      runPaceMaxSecPerKm: 390,
      runDistancesKm: [5, 10],
      runGroupStyle: null,
    });
    expect(mockPost).toHaveBeenNthCalledWith(2, '/users/me/sport-profiles', {
      sport: 'golf',
      level: 'beginner',
      preferredTimes: ['morning'],
      preferencesVersion: 2,
      golfHandicapTenths: null,
      golfHandicapSource: 'none',
      golfExperience: 'range',
      golfPartnerIntents: ['learn_from_experienced'],
      golfSimilarityToleranceTenths: null,
      golfPreferredHoles: '9',
    });
    // Persisted rows are in the store (survives navigation; restart re-reads them).
    expect(useProfileStore.getState().sportProfiles?.map((sp) => sp.sport)).toEqual(['running', 'golf']);
    expect(useSetupDraft.getState().run.level).toBeNull();
  });

  it('names the sport that failed, keeps what saved, and retries only the rest', async () => {
    mockPost
      .mockImplementationOnce(async (_p: string, body: Record<string, unknown>) => storedRow(body))
      .mockRejectedValueOnce(new Error('Choose at least one kind of golf partner.'));
    const { getByLabelText, getByText, nav } = renderAvailability(['running', 'golf']);
    fireEvent.press(getByLabelText('Flexible'));
    fireEvent.press(getByLabelText('Finish'));
    await waitFor(() =>
      getByText('Could not save your golf preferences. Choose at least one kind of golf partner.')
    );
    getByText('Running saved.');
    expect(nav.reset).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Finish'));
    await waitFor(() => expect(nav.reset).toHaveBeenCalled());
    const sports = mockPost.mock.calls.map((call) => (call[1] as { sport: string }).sport);
    expect(sports).toEqual(['running', 'golf', 'golf']);
  });

  it('in add mode returns to the Profile tab and keeps legacy golf club / goals', async () => {
    useProfileStore.setState({
      sportProfiles: [storedRow({ sport: 'golf', level: 'beginner', golfClub: 'Moore Park', goals: 'Break 100' })],
    });
    const { getByLabelText, nav } = renderAvailability(['golf'], 'add');
    fireEvent.press(getByLabelText('Evenings'));
    fireEvent.press(getByLabelText('Save'));
    await waitFor(() =>
      expect(nav.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main', params: { screen: 'Profile' } }] })
    );
    expect(mockPost.mock.calls[0][1]).toMatchObject({ golfClub: 'Moore Park', goals: 'Break 100' });
  });
});
