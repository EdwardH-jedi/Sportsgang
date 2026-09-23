/**
 * PublicProfileScreen tests
 *
 * Covers route-param rendering, Honor summary states, Report/Block
 * actions, self-view hiding, and copy guarantees.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { PublicProfileScreen } from '../screens/profile/PublicProfileScreen';
import type { HonorSummary } from '@protin/shared-types';

let mockSummary: HonorSummary | null = {
  userId: 'other-1',
  honorScore: 126,
  honorLevel: 'Trusted',
  gangScore: 30,
  completedGamesCount: 3,
  hostedGamesCount: 1,
  noShowCount: 0,
  excusedCount: 0,
  pendingCount: 0,
  sportLevels: [
    {
      sport: 'basketball',
      xp: 30,
      level: 1,
      attendedCount: 3,
      hostedCount: 0,
    },
  ],
  generatedAt: '2026-05-11T00:00:00Z',
};
let mockLoading = false;
let mockError: string | null = null;

jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: () => ({
    summary: mockSummary,
    isLoading: mockLoading,
    error: mockError,
  }),
}));

const mockBlockUser = jest.fn();
jest.mock('../lib/safety', () => ({
  blockUser: (...args: unknown[]) => mockBlockUser(...args),
}));

let mockCurrentUserId: string | null = 'me-1';
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

function renderScreen(params: Record<string, unknown> = {}) {
  const navigation = makeNavigation();
  const utils = render(
    <PublicProfileScreen
      navigation={navigation as any}
      route={
        {
          params: {
            userId: 'other-1',
            displayName: 'Alex Smith',
            suburb: 'Bondi',
            bio: 'Plays weekend basketball.',
            sports: ['basketball'],
            ...params,
          },
          key: 'k',
          name: 'PublicProfile',
        } as any
      }
    />
  );
  return { ...utils, navigation };
}

describe('PublicProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'me-1';
    mockLoading = false;
    mockError = null;
    mockSummary = {
      userId: 'other-1',
      honorScore: 126,
      honorLevel: 'Trusted',
      gangScore: 30,
      completedGamesCount: 3,
      hostedGamesCount: 1,
      noShowCount: 0,
      excusedCount: 0,
      pendingCount: 0,
      sportLevels: [
        {
          sport: 'basketball',
          xp: 30,
          level: 1,
          attendedCount: 3,
          hostedCount: 0,
        },
      ],
      generatedAt: '2026-05-11T00:00:00Z',
    };
  });

  it('renders public profile info from route params', () => {
    const { getByText, getAllByText } = renderScreen();
    getByText('Alex Smith');
    getByText('Bondi');
    getByText('Plays weekend basketball.');
    // "Basketball" appears in both the sports chip row and the sport
    // level row — assert at least one is rendered.
    expect(getAllByText('Basketball').length).toBeGreaterThan(0);
  });

  it('renders Honor summary from /rank/users/{id}', () => {
    const { getByText } = renderScreen();
    getByText('Trusted');
    getByText('· 126');
    // Stats:
    getByText('Gang Score');
    getByText('Completed games');
    getByText('No-shows');
    // Sport levels render too.
    getByText('Lv 1 · 30 XP');
  });

  it('falls back to "New player" when summary is null (404 / no data)', () => {
    mockSummary = null;
    const { getByText } = renderScreen();
    getByText('New player');
  });

  it('hides the Honor block entirely on hard error', () => {
    mockSummary = null;
    mockError = 'Network down';
    const { queryByText, queryByLabelText } = renderScreen();
    expect(queryByText('Honor')).toBeNull();
    expect(queryByText('New player')).toBeNull();
    expect(queryByLabelText('Honor summary')).toBeNull();
  });

  it('Report user navigates to ReportScreen with user target', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Report user'));
    expect(navigation.navigate).toHaveBeenCalledWith('Report', {
      reportedUserId: 'other-1',
      reportedName: 'Alex Smith',
    });
  });

  it('Block user prompts for confirmation, calls blockUser, then goes back', async () => {
    mockBlockUser.mockResolvedValueOnce(undefined);
    const alertSpy = jest
      .spyOn(require('react-native').Alert, 'alert')
      .mockImplementation((..._args: unknown[]) => {
        const buttons = _args[2];
        if (!Array.isArray(buttons)) return;
        const block = (buttons as { text: string; onPress?: () => void }[]).find(
          (b) => b.text === 'Block'
        );
        block?.onPress?.();
      });
    const { getByLabelText, navigation } = renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Block user'));
    });
    expect(mockBlockUser).toHaveBeenCalledWith('other-1');
    expect(navigation.goBack).toHaveBeenCalled();

    // Confirmation copy must be truthful — no message-blocking claim.
    const confirmCall = alertSpy.mock.calls.find(
      (call) => call[0] === 'Block this user?'
    );
    expect(confirmCall).toBeTruthy();
    const body = String(confirmCall?.[1] ?? '');
    expect(body).not.toMatch(/message/i);
    expect(body).toContain('joining your games');
    alertSpy.mockRestore();
  });

  it('hides Report and Block actions when viewing self', () => {
    mockCurrentUserId = 'other-1'; // same as route userId
    const { queryByLabelText } = renderScreen({ userId: 'other-1' });
    expect(queryByLabelText('Report user')).toBeNull();
    expect(queryByLabelText('Block user')).toBeNull();
  });

  it('copy does not include popularity / leaderboard / verified / AI moderation / cannot message', () => {
    const { queryByText } = renderScreen();
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/popularity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/cannot message/i)).toBeNull();
  });

  it('Back button calls navigation.goBack', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
