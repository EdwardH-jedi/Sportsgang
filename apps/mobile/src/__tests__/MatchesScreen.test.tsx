/**
 * MatchesScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get)
 *  - @react-navigation/native (useNavigation)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { MatchesScreen } from '../screens/matches/MatchesScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

// ─── Mock navigation ──────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // The screen calls useFocusEffect to refetch on tab return; simplest stub
  // is to fire the effect once on mount and treat it as a no-op cleanup.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// ─── Mock auth store ──────────────────────────────────────────────────────────
// The screen uses `useAuthStore((state) => state.user?.id ?? null)` to
// detect whether the latest message belongs to the current user. Exposed
// via a mutable holder so individual tests can flip the current user id.

let mockCurrentUserId: string | null = 'me-user-id';

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: any) => any) =>
    selector({ user: mockCurrentUserId ? { id: mockCurrentUserId } : null }),
}));

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock theme ───────────────────────────────────────────────────────────────

jest.mock('../theme', () => ({
  colors: {
    accent: '#000',
    brand: '#000',
    border: '#ccc',
    surface: '#fff',
    surfaceElevated: '#f5f5f5',
    background: '#fafafa',
    separator: '#e0e0e0',
    textPrimary: '#000',
    textSecondary: '#555',
    textTertiary: '#888',
    textInverse: '#fff',
    success: '#0f0',
    error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48,
  },
  typography: {
    h2: {}, h3: {}, body: {}, bodySmall: {}, bodyLarge: {}, label: {}, button: {},
  },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const emptyResponse = { items: [], total: 0, limit: 50, offset: 0 };

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'match-1',
    sport: 'gym',
    status: 'active',
    createdAt: '2026-04-01T10:00:00Z',
    partner: {
      userId: 'partner-111',
      displayName: 'Jordan Lee',
      suburb: 'Newtown',
      sportProfiles: [{ sport: 'gym', level: 'intermediate' }],
    },
    ...overrides,
  };
}

const twoMatches = [
  makeMatch({ id: 'match-1', partner: { userId: 'p1', displayName: 'Jordan Lee', suburb: 'Newtown', sportProfiles: [{ sport: 'gym', level: 'intermediate' }] } }),
  makeMatch({ id: 'match-2', sport: 'golf', partner: { userId: 'p2', displayName: 'Alex Kim', suburb: 'Bondi', sportProfiles: [{ sport: 'golf', level: 'beginner' }] } }),
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MatchesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = render(<MatchesScreen />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('fetches from the correct endpoint on mount', async () => {
    mockApiGet.mockResolvedValue(emptyResponse);
    render(<MatchesScreen />);
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/matches?limit=50');
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows the empty state when there are no matches', async () => {
    mockApiGet.mockResolvedValue(emptyResponse);
    const { getByText, getByLabelText } = render(<MatchesScreen />);
    await waitFor(() => getByText('No chats yet'));
    // The empty state explains how chats start and links back to Explore.
    fireEvent.press(getByLabelText('Go to Explore'));
    expect(mockNavigate).toHaveBeenCalledWith('Main', { screen: 'Explore' });
  });

  it('titles the tab Chats', async () => {
    mockApiGet.mockResolvedValue(emptyResponse);
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Chats'));
  });

  // ── Match list ─────────────────────────────────────────────────────────────

  it('renders partner names for each match', async () => {
    mockApiGet.mockResolvedValue({ items: twoMatches, total: 2, limit: 50, offset: 0 });
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => {
      getByText('Jordan Lee');
      getByText('Alex Kim');
    });
  });

  it('renders suburb when present', async () => {
    mockApiGet.mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Newtown'));
  });

  it('renders the sport badge with level', async () => {
    mockApiGet.mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { getByText } = render(<MatchesScreen />);
    // Badge text: "Gym · Intermediate"
    await waitFor(() => getByText('Gym · Intermediate'));
  });

  it('renders the sport badge without level when no matching sport profile', async () => {
    const match = makeMatch({
      sport: 'tennis',
      partner: {
        userId: 'p3',
        displayName: 'Sam Park',
        suburb: undefined,
        sportProfiles: [{ sport: 'gym', level: 'advanced' }], // no tennis profile
      },
    });
    mockApiGet.mockResolvedValue({ items: [match], total: 1, limit: 50, offset: 0 });
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Tennis'));
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('navigates to Chat with correct params when a card is pressed', async () => {
    mockApiGet.mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Jordan Lee'));
    fireEvent.press(getByText('Jordan Lee'));
    expect(mockNavigate).toHaveBeenCalledWith('Chat', {
      matchId: 'match-1',
      partnerName: 'Jordan Lee',
      partnerId: 'partner-111',
      sport: 'gym',
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message and Try again button on fetch failure', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => {
      getByText('Network error');
      getByText('Try again');
    });
  });

  it('retries the fetch when Try again is pressed', async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(emptyResponse);

    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Try again'));
    await act(async () => {
      fireEvent.press(getByText('Try again'));
    });

    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('shows the match list after a successful retry', async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });

    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Try again'));
    await act(async () => {
      fireEvent.press(getByText('Try again'));
    });

    await waitFor(() => getByText('Jordan Lee'));
  });

  // ── Last-message preview ─────────────────────────────────────────────────

  describe('last-message preview', () => {
    beforeEach(() => {
      mockCurrentUserId = 'me-user-id';
    });

    it('renders the empty-state fallback when no messages exist yet', async () => {
      mockApiGet.mockResolvedValue({
        items: [makeMatch()], // no last_message fields
        total: 1,
        limit: 50,
        offset: 0,
      });
      const { getByText } = render(<MatchesScreen />);
      await waitFor(() => getByText('Start the conversation'));
    });

    it('shows a partner message verbatim (no "You:" prefix)', async () => {
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: 'Want to train this weekend?',
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'partner-111',
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { getByText, queryByText } = render(<MatchesScreen />);
      await waitFor(() => getByText('Want to train this weekend?'));
      expect(queryByText(/^You:/)).toBeNull();
    });

    it('prefixes the preview with "You:" when the current user sent the latest message', async () => {
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: "Let's plan a session.",
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'me-user-id',
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { getByText } = render(<MatchesScreen />);
      await waitFor(() => getByText("You: Let's plan a session."));
    });

    it('does not speculate "You:" when the current user id is unknown', async () => {
      // Auth store hasn't yet hydrated user.id — even if the sender id
      // happens to be a string we don't want to risk a wrong attribution.
      mockCurrentUserId = null;
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: 'Saturday morning works for me.',
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'me-user-id', // matches what the user *would* be if known
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { getByText, queryByText } = render(<MatchesScreen />);
      await waitFor(() => getByText('Saturday morning works for me.'));
      expect(queryByText(/^You:/)).toBeNull();
    });

    it('sanitizes whitespace and newlines in the preview to one line', async () => {
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: '  Saturday morning\nworks   for me.  ',
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'partner-111',
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { getByText } = render(<MatchesScreen />);
      await waitFor(() => getByText('Saturday morning works for me.'));
    });

    it('falls back to the empty-state when last_message is an empty/whitespace string', async () => {
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: '   ',
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'partner-111',
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { getByText } = render(<MatchesScreen />);
      await waitFor(() => getByText('Start the conversation'));
    });

    it('never displays raw "undefined" or "null" in the preview line', async () => {
      mockApiGet.mockResolvedValue({
        items: [makeMatch()],
        total: 1, limit: 50, offset: 0,
      });
      const { queryByText } = render(<MatchesScreen />);
      await waitFor(() => {
        expect(queryByText(/undefined/i)).toBeNull();
        expect(queryByText(/^null$/i)).toBeNull();
      });
    });

    it('truncates long previews via numberOfLines (no manual character cap)', async () => {
      const long = 'Saturday morning works for me too — let me know what court you want and I can book a slot for two hours and bring extra balls.';
      mockApiGet.mockResolvedValue({
        items: [
          makeMatch({
            lastMessage: long,
            lastMessageAt: '2026-05-06T09:30:00Z',
            lastMessageSenderId: 'partner-111',
          }),
        ],
        total: 1, limit: 50, offset: 0,
      });
      const { findByText } = render(<MatchesScreen />);
      // The full string still goes into the Text node; truncation is a
      // visual-layout concern handled by numberOfLines={1} + ellipsizeMode.
      const node = await findByText(long);
      expect(node.props.numberOfLines).toBe(1);
      expect(node.props.ellipsizeMode).toBe('tail');
    });
  });
});
