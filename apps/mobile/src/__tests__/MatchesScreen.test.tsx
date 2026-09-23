/**
 * MatchesScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get)
 *  - @react-navigation/native (useNavigation)
 *  - Screen component
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
// Re-focus hooks registered by the useFocusEffect stub. `mockEmitFocus()`
// simulates the user coming back to the tab: it runs the LATEST callback the
// screen passed, exactly like React Navigation does on a focus event.
const mockFocusListeners: (() => void)[] = [];
function mockEmitFocus() {
  mockFocusListeners.forEach((fn) => fn());
}

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // The screen calls useFocusEffect to refetch on tab return; the stub fires
  // the effect once on mount and registers a listener for later re-focus.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    const latest = React.useRef(cb);
    latest.current = cb;
    React.useEffect(() => {
      const listener = () => {
        latest.current();
      };
      mockFocusListeners.push(listener);
      const cleanup = cb();
      return () => {
        mockFocusListeners.splice(mockFocusListeners.indexOf(listener), 1);
        if (typeof cleanup === 'function') cleanup();
      };
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
    Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => (
      <View>
        {header}
        {children}
        {footer}
      </View>
    ),
  };
});

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

  it('shows skeleton rows before data arrives', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { getByLabelText } = render(<MatchesScreen />);
    getByLabelText('Loading chats');
  });

  it('renders the Chats header', async () => {
    mockApiGet.mockResolvedValue(emptyResponse);
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('No matches yet'));
    getByText('Chats');
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
    const { getByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('No matches yet'));
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

  it('labels each row as a button that opens the chat', async () => {
    mockApiGet.mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { findByLabelText } = render(<MatchesScreen />);
    const row = await findByLabelText(/^Chat with Jordan Lee/);
    expect(row.props.accessibilityRole).toBe('button');
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

  // ── Refresh on tab focus ─────────────────────────────────────────────────

  it('re-fetches silently when the tab regains focus (regression)', async () => {
    // Regression: the focus callback read a stale `isLoading === true` from
    // the first render, so returning to the tab never refreshed previews.
    mockApiGet.mockResolvedValue({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { getByText, queryByLabelText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Jordan Lee'));
    // First focus (mount) must not double the initial fetch.
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    mockApiGet.mockResolvedValue({
      items: [makeMatch({ partner: { userId: 'p9', displayName: 'Riley Chen', suburb: 'Glebe', sportProfiles: [] } })],
      total: 1,
      limit: 50,
      offset: 0,
    });
    await act(async () => {
      mockEmitFocus();
    });

    expect(mockApiGet).toHaveBeenCalledTimes(2);
    await waitFor(() => getByText('Riley Chen'));
    // Silent: the list is never replaced by the loading skeleton.
    expect(queryByLabelText('Loading chats')).toBeNull();
  });

  it('keeps the list on screen when a focus refresh fails', async () => {
    mockApiGet.mockResolvedValueOnce({ items: [makeMatch()], total: 1, limit: 50, offset: 0 });
    const { getByText, queryByText } = render(<MatchesScreen />);
    await waitFor(() => getByText('Jordan Lee'));
    mockApiGet.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => {
      mockEmitFocus();
    });
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    getByText('Jordan Lee');
    expect(queryByText('Try again')).toBeNull();
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
