/**
 * ChatScreen tests
 *
 * Mocks:
 *  - apps/mobile/src/lib/api (api.get / api.post)
 *  - apps/mobile/src/stores/auth (useAuthStore)
 *  - React Navigation (navigation.goBack, navigation.navigate)
 *  - Screen component
 *  - theme
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { ChatScreen } from '../screens/chat/ChatScreen';

// ─── Mock api ─────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
  BASE_URL: 'http://localhost:8000',
}));

// ─── URL-aware mockApiGet helper ──────────────────────────────────────────────
// ChatScreen now hits two GETs in parallel: /matches/{id}/messages and
// /bookings?match_id=.... Existing tests pre-date the bookings fetch and
// only mock messages. Default the bookings response to an empty list so
// older tests keep passing without per-test boilerplate; tests that care
// about proposals override via the URL-aware setter below.
const emptyListResponse = { items: [], total: 0, limit: 50, offset: 0 };
function setupMessagesAndBookingsMock(opts: {
  messages?: { items: unknown[]; total: number; limit: number; offset: number };
  bookings?: { items: unknown[]; total: number; limit: number; offset: number };
} = {}) {
  const messagesResp = opts.messages ?? { items: [], total: 0, limit: 100, offset: 0 };
  const bookingsResp = opts.bookings ?? emptyListResponse;
  mockApiGet.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.startsWith('/bookings')) {
      return Promise.resolve(bookingsResp);
    }
    return Promise.resolve(messagesResp);
  });
}

// ─── Mock auth store ──────────────────────────────────────────────────────────

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'me-123', email: 'me@example.com' },
    token: 'test-jwt-token',
  }),
}));

// ─── Mock WebSocket ───────────────────────────────────────────────────────────

interface MockWS {
  url: string;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close: jest.Mock;
}

let mockWsInstances: MockWS[] = [];

class MockWebSocket implements MockWS {
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1; // OPEN
  close = jest.fn(() => { this.readyState = 3; });

  constructor(url: string) {
    this.url = url;
    mockWsInstances.push(this);
  }
}

// Inject before module load so the import in ChatScreen picks it up.
(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

// ─── Mock Screen component ────────────────────────────────────────────────────

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ─── Mock @react-navigation/native ────────────────────────────────────────────
// ChatScreen now calls useFocusEffect to refetch proposals when the user
// returns from BookingComposer. The default test tree has no NavigationContainer,
// so stub the hook to fire its callback once on mount and treat any returned
// cleanup as the unmount handler.

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// ─── Mock react-native-safe-area-context ──────────────────────────────────────
// ChatScreen now reads insets.bottom directly to pad the composer above the
// home indicator. The default SafeAreaProvider is not in this test tree, so
// we stub the hook to a zero-inset record (matches the simulator's behavior
// on devices without a home indicator).

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
    h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {},
  },
}));

// ─── Mock navigation types (no-op — navigation is injected as a prop) ─────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNavigation(overrides: Record<string, jest.Mock> = {}) {
  return {
    goBack: jest.fn(),
    navigate: jest.fn(),
    ...overrides,
  };
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return {
    params: {
      matchId: 'match-1',
      partnerName: 'Jordan Lee',
      partnerId: 'partner-456',
      sport: 'gym',
      ...overrides,
    },
  };
}

const emptyMessageResponse = { items: [], total: 0, limit: 100, offset: 0 };

const sampleMessages = [
  {
    id: 'msg-1',
    matchId: 'match-1',
    senderId: 'partner-456',
    body: 'Hey! Want to train tomorrow?',
    createdAt: '2026-04-08T08:00:00Z',
  },
  {
    id: 'msg-2',
    matchId: 'match-1',
    senderId: 'me-123',
    body: 'Absolutely, sounds great!',
    createdAt: '2026-04-08T08:01:00Z',
  },
];

function renderChatScreen(opts: { route?: any; navigation?: any } = {}) {
  const navigation = opts.navigation ?? makeNavigation();
  const route = opts.route ?? makeRoute();
  const utils = render(<ChatScreen route={route as any} navigation={navigation as any} />);
  return { ...utils, navigation, route };
}

function getBubbleAlignSelf(UNSAFE_getAllByType: any, textNode: any): string | undefined {
  const { StyleSheet, View } = require('react-native');
  const allViews = UNSAFE_getAllByType(View);
  const bubble = allViews.find((v: any) =>
    v.props.children &&
    (Array.isArray(v.props.children) ? v.props.children : [v.props.children])
      .some((c: any) => c === textNode || (c && c.props && c.props.children === textNode.props.children))
  );
  return bubble ? StyleSheet.flatten(bubble.props.style).alignSelf : undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstances = [];
  });

  // ── Loading & fetch ────────────────────────────────────────────────────────

  it('shows a loading indicator on mount before messages load', () => {
    // Never resolves during this test
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const { UNSAFE_queryAllByType } = renderChatScreen();
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('renders partner name in the header', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByText } = renderChatScreen();
    await waitFor(() => getByText('Jordan Lee'));
  });

  it('fetches messages from the correct endpoint', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    renderChatScreen();
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/matches/match-1/messages?limit=100');
    });
  });

  // ── Empty messages ─────────────────────────────────────────────────────────

  it('shows the empty state prompt when there are no messages', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByText } = renderChatScreen();
    await waitFor(() => {
      getByText('Say hello to Jordan Lee to get things started.');
    });
  });

  // ── Message rendering ──────────────────────────────────────────────────────

  it('renders messages returned by the API', async () => {
    mockApiGet.mockResolvedValue({ items: sampleMessages, total: 2, limit: 100, offset: 0 });
    const { getByText } = renderChatScreen();
    await waitFor(() => {
      getByText('Hey! Want to train tomorrow?');
      getByText('Absolutely, sounds great!');
    });
  });

  it('renders a mixed Chris/Sarah conversation on both sides for the current user', async () => {
    mockApiGet.mockResolvedValue({
      items: [
        {
          id: 'msg-chris-1',
          matchId: 'match-1',
          senderId: 'me-123',
          body: 'Want to train this weekend?',
          createdAt: '2026-04-08T08:00:00Z',
        },
        {
          id: 'msg-sarah-1',
          matchId: 'match-1',
          senderId: 'partner-456',
          body: "Let's plan a session.",
          createdAt: '2026-04-08T08:01:00Z',
        },
        {
          id: 'msg-chris-2',
          matchId: 'match-1',
          senderId: 'me-123',
          body: 'Saturday morning works for me.',
          createdAt: '2026-04-08T08:02:00Z',
        },
      ],
      total: 3,
      limit: 100,
      offset: 0,
    });

    const { findByText, UNSAFE_getAllByType } = renderChatScreen();

    const chrisFirst = await findByText('Want to train this weekend?');
    const sarah = await findByText("Let's plan a session.");
    const chrisSecond = await findByText('Saturday morning works for me.');

    expect(getBubbleAlignSelf(UNSAFE_getAllByType, chrisFirst)).toBe('flex-end');
    expect(getBubbleAlignSelf(UNSAFE_getAllByType, sarah)).toBe('flex-start');
    expect(getBubbleAlignSelf(UNSAFE_getAllByType, chrisSecond)).toBe('flex-end');
  });

  it('uses the authenticated user id when route partnerId is missing or stale', async () => {
    mockApiGet.mockResolvedValue({
      items: sampleMessages,
      total: 2,
      limit: 100,
      offset: 0,
    });

    const { findByText, UNSAFE_getAllByType } = renderChatScreen({ route: makeRoute({ partnerId: undefined }) });

    const partnerText = await findByText('Hey! Want to train tomorrow?');
    const ownText = await findByText('Absolutely, sounds great!');

    expect(getBubbleAlignSelf(UNSAFE_getAllByType, partnerText)).toBe('flex-start');
    expect(getBubbleAlignSelf(UNSAFE_getAllByType, ownText)).toBe('flex-end');
  });

  it('renders messages from unknown senders as partner-side instead of assuming mine', async () => {
    const authMock = require('../stores/auth') as { useAuthStore: () => unknown };
    const original = authMock.useAuthStore;
    authMock.useAuthStore = () => ({ user: null, token: 'test-jwt-token' });
    try {
      mockApiGet.mockResolvedValue({
        items: [
          {
            id: 'msg-unknown',
            matchId: 'match-1',
            senderId: undefined,
            body: 'Unknown sender',
            createdAt: '2026-04-08T08:00:00Z',
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      });

      const { findByText, UNSAFE_getAllByType } = renderChatScreen({ route: makeRoute({ partnerId: undefined }) });

      const unknown = await findByText('Unknown sender');
      expect(getBubbleAlignSelf(UNSAFE_getAllByType, unknown)).toBe('flex-start');
    } finally {
      authMock.useAuthStore = original;
    }
  });

  it('renders every message on the partner side when the auth user is unavailable (conservative fallback)', async () => {
    // The Chris/Sarah iPhone regression was caused by an "if currentUserId is
    // null, fall back to routePartnerId" branch that mis-rendered every UUID
    // as "mine" when the partner id was missing/empty. The conservative fix
    // refuses to speculate: when the auth user hasn't hydrated yet, every
    // message renders on the partner side until /auth/me lands. This is the
    // safer failure mode — looks slightly off, doesn't leak the wrong
    // identity onto the screen.
    const authMock = require('../stores/auth') as { useAuthStore: () => unknown };
    const original = authMock.useAuthStore;
    authMock.useAuthStore = () => ({ user: null, token: 'test-jwt-token' });
    try {
      mockApiGet.mockResolvedValue({
        items: sampleMessages,
        total: 2,
        limit: 100,
        offset: 0,
      });
      const { findByText, UNSAFE_getAllByType } = renderChatScreen();

      // Both bubbles render. Both must land on the partner/left side: with
      // no auth user, the screen refuses to attribute any message to "me".
      const partnerText = await findByText('Hey! Want to train tomorrow?');
      const ownText = await findByText('Absolutely, sounds great!');

      expect(getBubbleAlignSelf(UNSAFE_getAllByType, partnerText)).toBe('flex-start');
      expect(getBubbleAlignSelf(UNSAFE_getAllByType, ownText)).toBe('flex-start');
    } finally {
      authMock.useAuthStore = original;
    }
  });

  it('treats currentUserId = Sarah as the inverse: Sarah right, Chris left', async () => {
    // Same data shape as the Chris/Sarah test above, but with the auth user
    // flipped to Sarah's id. This pins the symmetric case so a future
    // refactor that hard-codes "me-123" can't slip through.
    const authMock = require('../stores/auth') as { useAuthStore: () => unknown };
    const original = authMock.useAuthStore;
    authMock.useAuthStore = () => ({
      user: { id: 'partner-456', email: 'sarah@example.com' },
      token: 'test-jwt-token',
    });
    try {
      mockApiGet.mockResolvedValue({
        items: [
          {
            id: 'msg-chris',
            matchId: 'match-1',
            senderId: 'me-123',
            body: 'Want to train this weekend?',
            createdAt: '2026-04-08T08:00:00Z',
          },
          {
            id: 'msg-sarah',
            matchId: 'match-1',
            senderId: 'partner-456',
            body: "Let's plan a session.",
            createdAt: '2026-04-08T08:01:00Z',
          },
        ],
        total: 2,
        limit: 100,
        offset: 0,
      });
      const { findByText, UNSAFE_getAllByType } = renderChatScreen();
      const chris = await findByText('Want to train this weekend?');
      const sarah = await findByText("Let's plan a session.");
      expect(getBubbleAlignSelf(UNSAFE_getAllByType, chris)).toBe('flex-start');
      expect(getBubbleAlignSelf(UNSAFE_getAllByType, sarah)).toBe('flex-end');
    } finally {
      authMock.useAuthStore = original;
    }
  });

  it('does not treat every message as mine when routePartnerId is empty / whitespace', async () => {
    // Pin against the "missing partnerId makes everything render as mine"
    // class of bug. Even with an empty-string partnerId on the navigation
    // params, ownership is decided strictly by the auth user id.
    mockApiGet.mockResolvedValue({
      items: [
        {
          id: 'msg-chris',
          matchId: 'match-1',
          senderId: 'me-123',
          body: 'Want to train this weekend?',
          createdAt: '2026-04-08T08:00:00Z',
        },
        {
          id: 'msg-sarah',
          matchId: 'match-1',
          senderId: 'partner-456',
          body: "Let's plan a session.",
          createdAt: '2026-04-08T08:01:00Z',
        },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const { findByText, UNSAFE_getAllByType } = renderChatScreen({ route: makeRoute({ partnerId: '   ' }) });
    const chris = await findByText('Want to train this weekend?');
    const sarah = await findByText("Let's plan a session.");
    // Default authMock: user.id = 'me-123' (Chris). Chris on right, Sarah on
    // left — exactly as if the partnerId param were correct.
    expect(getBubbleAlignSelf(UNSAFE_getAllByType, chris)).toBe('flex-end');
    expect(getBubbleAlignSelf(UNSAFE_getAllByType, sarah)).toBe('flex-start');
  });

  it('null currentUserId never lets a message default to current-user/right, even with a valid partnerId', async () => {
    // Two-pronged regression pin: the previous fallback used routePartnerId
    // to flip messages right when currentUserId was null. With the
    // conservative policy, all bubbles must land on the partner side until
    // the auth user lands.
    const authMock = require('../stores/auth') as { useAuthStore: () => unknown };
    const original = authMock.useAuthStore;
    authMock.useAuthStore = () => ({ user: null, token: 'test-jwt-token' });
    try {
      mockApiGet.mockResolvedValue({
        items: [
          {
            id: 'msg-mine-pre-hydrate',
            matchId: 'match-1',
            senderId: 'me-123',
            body: 'Pre-hydrate own message',
            createdAt: '2026-04-08T08:00:00Z',
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      });
      const { findByText, UNSAFE_getAllByType } = renderChatScreen();
      const node = await findByText('Pre-hydrate own message');
      // Even though senderId === 'me-123' (the value the auth user *would*
      // have if it were hydrated), with `user: null` the screen refuses to
      // attribute it. Falls left.
      expect(getBubbleAlignSelf(UNSAFE_getAllByType, node)).toBe('flex-start');
    } finally {
      authMock.useAuthStore = original;
    }
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message and a retry button when fetch fails', async () => {
    mockApiGet.mockRejectedValue(new Error('Connection refused'));
    const { getByText } = renderChatScreen();
    await waitFor(() => {
      getByText('Connection refused');
      getByText('Try again');
    });
  });

  it('retries fetching messages when Try again is pressed', async () => {
    mockApiGet
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValue(emptyMessageResponse);

    const { getByText } = renderChatScreen();
    await waitFor(() => getByText('Try again'));
    await act(async () => {
      fireEvent.press(getByText('Try again'));
    });
    // Each fetchMessages now drives two GETs in parallel (messages + bookings).
    // Initial mount = 2 calls; retry tap = 2 more = 4 total.
    expect(mockApiGet).toHaveBeenCalledTimes(4);
  });

  // ── Send message ───────────────────────────────────────────────────────────

  it('sends a message and appends it to the list', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const sentMsg = {
      id: 'msg-new',
      matchId: 'match-1',
      senderId: 'me-123',
      body: 'Hello!',
      createdAt: '2026-04-08T09:00:00Z',
    };
    mockApiPost.mockResolvedValue(sentMsg);

    const { getByPlaceholderText, getByLabelText, findByText } = renderChatScreen();

    await waitFor(() => getByPlaceholderText('Message…'));

    fireEvent.changeText(getByPlaceholderText('Message…'), 'Hello!');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    expect(mockApiPost).toHaveBeenCalledWith('/matches/match-1/messages', { body: 'Hello!' });
    await findByText('Hello!');
  });

  it('clears the input after sending', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    mockApiPost.mockResolvedValue({
      id: 'msg-x', matchId: 'match-1', senderId: 'me-123', body: 'Hi', createdAt: '2026-04-08T09:00:00Z',
    });

    const { getByPlaceholderText, getByLabelText } = renderChatScreen();

    await waitFor(() => getByPlaceholderText('Message…'));
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Hi');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    await waitFor(() => {
      expect(getByPlaceholderText('Message…').props.value).toBe('');
    });
  });

  it('restores the draft and shows an Alert when send fails', async () => {
    // Real-device hardening: a network blip on /matches/.../messages must not
    // silently swallow the user's typed text. The current behavior optimistically
    // clears the draft for responsiveness, so the catch path must put it back.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    mockApiPost.mockRejectedValue(new Error('Network down'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByPlaceholderText, getByLabelText } = renderChatScreen();

    await waitFor(() => getByPlaceholderText('Message…'));
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Will retry this');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });

    // Draft restored to the user's typed text.
    expect(getByPlaceholderText('Message…').props.value).toBe('Will retry this');
    // Failure surfaced.
    expect(alertSpy).toHaveBeenCalledWith('Could not send', 'Network down');
    alertSpy.mockRestore();
  });

  it('preserves a WebSocket-received message that arrived during the initial fetch', async () => {
    // Race: chat opens → fetchMessages GET starts → WS opens and partner sends
    // a message that lands in state via ws.onmessage → fetch finally resolves
    // with a list that does NOT yet include that message. Before this
    // hardening, fetchMessages did setMessages(data.items) which overwrote
    // the WS-received message. Now it merges, so the message survives.
    let resolveFetch!: (v: typeof emptyMessageResponse) => void;
    mockApiGet.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      })
    );
    const { findByText } = renderChatScreen();

    // WS opens and a frame arrives BEFORE the fetch resolves. The list is
    // still hidden behind the loading spinner at this point.
    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    const wsOnly = {
      id: 'ws-arrived-mid-fetch',
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Arrived mid-fetch',
      createdAt: '2026-04-08T08:30:00Z',
    };
    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(wsOnly) });
    });

    // Now the original fetch resolves with an empty list (server hadn't
    // persisted the WS message at the time of the GET — the realistic race).
    await act(async () => {
      resolveFetch(emptyMessageResponse);
    });

    // After loading flips off, the FlatList renders and the WS-received
    // message must still be visible — merge, not replace.
    await findByText('Arrived mid-fetch');
  });

  it('does not call api.post when the draft is empty', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByLabelText } = renderChatScreen();
    await waitFor(() => getByLabelText('Send'));
    fireEvent.press(getByLabelText('Send'));
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  it('calls navigation.goBack when the Back button is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = renderChatScreen({ navigation });
    await waitFor(() => getByLabelText('Back'));
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('navigates to BookingComposer when + Session is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = renderChatScreen({ navigation });
    await waitFor(() => getByLabelText('Propose a session'));
    fireEvent.press(getByLabelText('Propose a session'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingComposer', {
      matchId: 'match-1',
      sport: 'gym',
    });
  });

  it('shows the "Plan a session" banner with a Find a court CTA', async () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // banner is rendered above the loader
    const { getByText, getByLabelText } = renderChatScreen();
    getByText('Plan a session');
    getByText('Find a court and propose a time.');
    getByLabelText('Find a court');
  });

  it.each([
    ['golf', 'course'],
    ['running', 'meeting spot'],
  ])('uses %s wording for the planning CTA', async (sport, noun) => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    const route = { ...makeRoute(), params: { ...makeRoute().params, sport } };
    const { getByText, getByLabelText, queryByText } = renderChatScreen({ route });
    getByText(`Find a ${noun} and propose a time.`);
    getByLabelText(`Find a ${noun}`);
    expect(queryByText(/court/)).toBeNull();
  });

  it('navigates to BookingComposer when Find a court is pressed', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const navigation = makeNavigation();
    const { getByLabelText } = renderChatScreen({ navigation });
    await waitFor(() => getByLabelText('Find a court'));
    fireEvent.press(getByLabelText('Find a court'));
    expect(navigation.navigate).toHaveBeenCalledWith('BookingComposer', {
      matchId: 'match-1',
      sport: 'gym',
    });
  });

  it('does not surface any Google Calendar copy in the chat', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { queryByText } = renderChatScreen();
    await waitFor(() => queryByText('Plan a session'));
    expect(queryByText(/google calendar/i)).toBeNull();
    expect(queryByText(/calendar/i)).toBeNull();
  });

  // ── Composer readability (real-device fix) ────────────────────────────────

  it('renders the composer as multiline with a readable minHeight and a capped maxHeight', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, getByLabelText } = renderChatScreen();
    await waitFor(() => getByPlaceholderText('Message…'));

    const { StyleSheet } = require('react-native');
    const input = getByPlaceholderText('Message…');
    expect(input.props.multiline).toBe(true);
    expect(input.props.textAlignVertical).toBe('top');

    // Style assertions pin the visibility contract: the composer must give
    // the user a readable resting target (≥ 48 px, well above the previous
    // ~36 px clipping) and cap multi-line growth so the keyboard can never
    // eat the message list.
    const inputStyle = StyleSheet.flatten(input.props.style);
    expect(inputStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(inputStyle.maxHeight).toBeGreaterThanOrEqual(120);
    expect(inputStyle.maxHeight).toBeLessThanOrEqual(140);

    // The Send button is height-matched to the input's resting height so a
    // single-line composer reads as one unified row.
    const sendStyle = StyleSheet.flatten(getByLabelText('Send').props.style);
    expect(sendStyle.minHeight).toBeGreaterThanOrEqual(48);
  });

  // ── Keyboard layout (real-device fix) ──────────────────────────────────────

  it('renders a visible normal-flow composer + Send before the keyboard opens (iOS)', async () => {
    // Regression pin: the previous iOS-only "composer lives only inside
    // InputAccessoryView" structure was structurally broken — InputAccessoryView
    // is shown only AFTER a linked TextInput is focused, but tapping a TextInput
    // requires it to be visible, so the chat had no focusable input on cold
    // open. The repair restores a single normal-flow composer rendered for
    // both platforms. These assertions guard against re-introducing the bug.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, getByLabelText, UNSAFE_queryAllByType } = renderChatScreen();
    await waitFor(() => getByPlaceholderText('Message…'));

    // 1) The composer TextInput is visible / non-hidden / editable.
    const input = getByPlaceholderText('Message…');
    expect(input).toBeTruthy();
    expect(input.props.editable).not.toBe(false);
    expect(input.props.multiline).toBe(true);

    // 2) The Send button is visible alongside the input.
    expect(getByLabelText('Send')).toBeTruthy();

    // 3) The TextInput must NOT carry an inputAccessoryViewID — the broken
    //    structure self-linked the only TextInput to an accessory it lived in.
    expect(input.props.inputAccessoryViewID).toBeUndefined();

    // 4) No InputAccessoryView is mounted at all — composer is a normal
    //    flow child, not an iOS accessory wrapper.
    const RN = require('react-native');
    expect(UNSAFE_queryAllByType(RN.InputAccessoryView).length).toBe(0);

    // 5) Plan-session / Find-a-court / + Session affordances are still reachable.
    expect(getByLabelText('Find a court')).toBeTruthy();
    expect(getByLabelText('Propose a session')).toBeTruthy();
  });

  it('Android path: composer is rendered normally (no InputAccessoryView, no inputAccessoryViewID)', async () => {
    // Override the default Platform.OS to exercise the Android branch and
    // confirm the visible-composer guarantee holds there too.
    const RN = require('react-native');
    const originalOS = RN.Platform.OS;
    Object.defineProperty(RN.Platform, 'OS', { value: 'android', configurable: true });
    try {
      mockApiGet.mockResolvedValue(emptyMessageResponse);
      const { getByPlaceholderText, getByLabelText, UNSAFE_queryAllByType } = renderChatScreen();
      await waitFor(() => getByPlaceholderText('Message…'));

      expect(UNSAFE_queryAllByType(RN.InputAccessoryView).length).toBe(0);
      expect(getByPlaceholderText('Message…').props.inputAccessoryViewID).toBeUndefined();
      expect(getByLabelText('Send')).toBeTruthy();
    } finally {
      Object.defineProperty(RN.Platform, 'OS', {
        value: originalOS,
        configurable: true,
      });
    }
  });

  it('mounts exactly one TextInput composer — never zero, never nested duplicates', async () => {
    // The focus-loop regression hid the only iOS TextInput inside an
    // InputAccessoryView, which presents AFTER focus, so the user could
    // see zero focusable inputs on cold open. A second flavour of the
    // same bug would be rendering two composers (a hidden visible one
    // plus an accessory-hosted one) — equally broken, harder to spot.
    // This assertion pins the structural contract: exactly one composer
    // TextInput exists at initial mount, before any focus event.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, UNSAFE_getAllByType } = renderChatScreen();
    await waitFor(() => getByPlaceholderText('Message…'));

    const RN = require('react-native');
    const inputs = UNSAFE_getAllByType(RN.TextInput);
    expect(inputs.length).toBe(1);
    // Sanity: that one input is the composer (matches the placeholder).
    expect(inputs[0].props.placeholder).toBe('Message…');
  });

  it('composer row uses normal layout flow — never position:absolute', async () => {
    // A second class of "invisible composer" bug is layering the composer
    // out of normal flow (absolute / overlay) so it never gets a real
    // tappable rect. Pin the inputRow to normal flow.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { getByPlaceholderText, UNSAFE_getAllByType } = renderChatScreen();
    await waitFor(() => getByPlaceholderText('Message…'));

    const { StyleSheet, View } = require('react-native');
    const allViews = UNSAFE_getAllByType(View);
    // The inputRow is the single View that directly contains the composer
    // TextInput; find it and flatten its style.
    const composerRow = allViews.find((v: any) => {
      const children = Array.isArray(v.props.children)
        ? v.props.children
        : [v.props.children];
      return children.some(
        (c: any) => c && c.props && c.props.placeholder === 'Message…'
      );
    });
    expect(composerRow).toBeDefined();
    const flatStyle = StyleSheet.flatten(composerRow.props.style);
    // RN style default is `position: 'relative'`. Anything other than
    // 'relative' or undefined would lift the composer out of flow and
    // re-introduce the visibility class of bug.
    expect(['relative', undefined]).toContain(flatStyle.position);
  });

  // ── WebSocket real-time ────────────────────────────────────────────────────

  it('opens a WebSocket connection on mount with the correct URL', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    renderChatScreen();
    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    expect(mockWsInstances[0].url).toBe(
      'ws://localhost:8000/matches/match-1/ws?token=test-jwt-token'
    );
  });

  it('appends a message received via WebSocket to the list', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { findByText } = renderChatScreen();

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    act(() => {
      mockWsInstances[0].onmessage?.({
        data: JSON.stringify({
          id: 'ws-msg-1',
          matchId: 'match-1',
          senderId: 'partner-456',
          body: 'Real-time hello!',
          createdAt: '2026-04-08T10:00:00Z',
        }),
      });
    });

    await findByText('Real-time hello!');
  });

  it('does not duplicate when a WebSocket frame arrives for the same id we just POSTed (real-device regression)', async () => {
    // Race: user taps Send → POST resolves with msg id X → before the React
    // setState commits, the server WS broadcasts the same msg id X back.
    // Both paths push the message; without dedup, FlatList renders two
    // children with the same key. This pin keeps that regression closed.
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const sentId = '63dd8190-86bf-4a49-801b-fe69ab9c5eaf';
    const sentMsg = {
      id: sentId,
      matchId: 'match-1',
      senderId: 'me-123',
      body: 'Race this!',
      createdAt: '2026-04-08T09:00:00Z',
    };
    mockApiPost.mockResolvedValue(sentMsg);

    const { getByPlaceholderText, getByLabelText, getAllByText } = renderChatScreen();

    await waitFor(() => getByPlaceholderText('Message…'));
    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    // Send + WS echo of the same id, in the order that triggered the bug.
    fireEvent.changeText(getByPlaceholderText('Message…'), 'Race this!');
    await act(async () => {
      fireEvent.press(getByLabelText('Send'));
    });
    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(sentMsg) });
    });

    await waitFor(() => {
      // Exactly one bubble in the rendered list — not two.
      expect(getAllByText('Race this!').length).toBe(1);
    });
  });

  it('does not duplicate when the initial fetch returns the same id twice', async () => {
    // Defensive: if a malformed page or a server-side bug ever returns the
    // same id twice in /matches/:id/messages, the screen must still render
    // exactly one bubble (not crash, not warn).
    const dupId = 'dup-1';
    const m = {
      id: dupId,
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Once is enough',
      createdAt: '2026-04-08T08:00:00Z',
    };
    mockApiGet.mockResolvedValue({
      items: [m, { ...m, body: 'second copy with the same id' }],
      total: 2,
      limit: 100,
      offset: 0,
    });
    const { getAllByText, queryByText } = renderChatScreen();
    await waitFor(() => {
      expect(getAllByText('Once is enough').length).toBe(1);
    });
    // Dedup keeps the FIRST occurrence — second copy must not render.
    expect(queryByText('second copy with the same id')).toBeNull();
  });

  it('deduplicates a WS message already in the local list', async () => {
    const existingMsg = {
      id: 'msg-already',
      matchId: 'match-1',
      senderId: 'partner-456',
      body: 'Already here',
      createdAt: '2026-04-08T08:00:00Z',
    };
    mockApiGet.mockResolvedValue({ items: [existingMsg], total: 1, limit: 100, offset: 0 });
    const { getAllByText } = renderChatScreen();

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    act(() => {
      mockWsInstances[0].onmessage?.({ data: JSON.stringify(existingMsg) });
    });

    // Message text should appear exactly once
    await waitFor(() => {
      expect(getAllByText('Already here').length).toBe(1);
    });
  });

  it('closes the WebSocket on unmount', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    const { unmount } = renderChatScreen();

    await waitFor(() => expect(mockWsInstances.length).toBe(1));
    unmount();
    expect(mockWsInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed WebSocket frames', async () => {
    mockApiGet.mockResolvedValue(emptyMessageResponse);
    renderChatScreen();

    await waitFor(() => expect(mockWsInstances.length).toBe(1));

    expect(() => {
      act(() => {
        mockWsInstances[0].onmessage?.({ data: 'not valid json{{' });
      });
    }).not.toThrow();
  });

  // ── Block flow (Step 3 hardening) ──────────────────────────────────────────
  // These run on the Android Alert.alert path so the safety menu and the
  // confirmation prompt are both observable via the same Alert spy.

  describe('Block flow', () => {
    let alertSpy: jest.SpyInstance;
    const RN = require('react-native') as { Platform: { OS: string } };
    let originalOS: string;

    type AlertButton = { text: string; style?: string; onPress?: () => void | Promise<void> };

    beforeEach(() => {
      mockApiGet.mockResolvedValue(emptyMessageResponse);
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      originalOS = RN.Platform.OS;
      Object.defineProperty(RN.Platform, 'OS', { value: 'android', configurable: true });
    });

    afterEach(() => {
      alertSpy.mockRestore();
      Object.defineProperty(RN.Platform, 'OS', { value: originalOS, configurable: true });
    });

    function findButton(callIndex: number, text: string): AlertButton | undefined {
      const buttons = alertSpy.mock.calls[callIndex]?.[2] as AlertButton[] | undefined;
      return buttons?.find((b) => b.text === text);
    }

    async function openMenuAndPressBlock(navigation: ReturnType<typeof makeNavigation>) {
      const utils = renderChatScreen({ navigation });
      await waitFor(() => utils.getByLabelText('More options'));
      fireEvent.press(utils.getByLabelText('More options'));
      // The first Alert is the safety menu — press its Block option.
      const blockMenuItem = findButton(0, 'Block');
      expect(blockMenuItem).toBeDefined();
      await act(async () => {
        await blockMenuItem!.onPress?.();
      });
      return utils;
    }

    it('asks for confirmation before blocking and uses safe copy', async () => {
      await openMenuAndPressBlock(makeNavigation());
      // Second Alert is the confirmation prompt.
      expect(alertSpy.mock.calls[1][0]).toBe('Block Jordan Lee?');
      expect(alertSpy.mock.calls[1][1]).toBe(
        "You won't see messages or activity from this user."
      );
      expect(mockApiPost).not.toHaveBeenCalled();
    });

    it('calls /blocks/:id, shows a success Alert, and goes back on OK', async () => {
      mockApiPost.mockResolvedValue({});
      const navigation = makeNavigation();
      await openMenuAndPressBlock(navigation);

      const confirm = findButton(1, 'Block');
      expect(confirm?.style).toBe('destructive');
      await act(async () => {
        await confirm?.onPress?.();
      });

      expect(mockApiPost).toHaveBeenCalledWith('/blocks/partner-456', {});
      // Third Alert is the success confirmation.
      expect(alertSpy.mock.calls[2][0]).toBe('User blocked');
      expect(alertSpy.mock.calls[2][1]).toBe(
        "You won't be matched or contacted by this user."
      );

      // Pressing OK on the success Alert returns the user to the previous screen.
      const ok = findButton(2, 'OK');
      ok?.onPress?.();
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('shows a failure Alert and stays on the chat when block fails', async () => {
      mockApiPost.mockRejectedValue(new Error('Network down'));
      const navigation = makeNavigation();
      await openMenuAndPressBlock(navigation);

      await act(async () => {
        await findButton(1, 'Block')?.onPress?.();
      });

      expect(alertSpy.mock.calls[2][0]).toBe('Could not block');
      expect(alertSpy.mock.calls[2][1]).toBe('Network down');
      // Failure must not navigate the user away — they stay in the chat to retry.
      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });

  // ── Session proposal card ──────────────────────────────────────────────────

  describe('session proposal cards', () => {
    function makeProposal(overrides: Record<string, unknown> = {}) {
      return {
        id: 'booking-1',
        matchId: 'match-1',
        proposerId: 'partner-456',
        partnerId: 'me-123',
        sport: 'gym',
        startsAt: '2026-04-09T09:00:00Z',
        endsAt: '2026-04-09T10:00:00Z',
        location: 'Bondi gym',
        notes: null,
        status: 'proposed',
        createdAt: '2026-04-08T08:30:00Z',
        updatedAt: '2026-04-08T08:30:00Z',
        partner: { displayName: 'Sarah' },
        venue: null,
        ...overrides,
      };
    }

    it('renders a proposed-card with Accept/Decline when the receiver opens chat', async () => {
      setupMessagesAndBookingsMock({
        bookings: { items: [makeProposal()], total: 1, limit: 50, offset: 0 },
      });
      const { findByText, getByLabelText } = renderChatScreen();
      // Title appears + Accept/Decline buttons rendered for the receiver.
      await findByText('Session proposal');
      expect(getByLabelText('Accept session proposal')).toBeTruthy();
      expect(getByLabelText('Decline session proposal')).toBeTruthy();
    });

    it('shows Awaiting confirmation and no Accept button for the proposer', async () => {
      // Flip proposer/partner so the signed-in user is the proposer.
      setupMessagesAndBookingsMock({
        bookings: {
          items: [makeProposal({ proposerId: 'me-123', partnerId: 'partner-456' })],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      const { findByText, queryByLabelText } = renderChatScreen();
      await findByText('Session proposal sent');
      await findByText('AWAITING CONFIRMATION');
      expect(queryByLabelText('Accept session proposal')).toBeNull();
      expect(queryByLabelText('Decline session proposal')).toBeNull();
    });

    it('renders the full "Session proposal" title without truncation alongside the long pill label', async () => {
      // Screenshot regression guard: the "AWAITING CONFIRMATION" pill and
      // the title used to share a flex-row with `numberOfLines={1}` on the
      // title, which clipped it to "Session pro..." on narrow phones. The
      // fix moves the pill onto its own row; this test pins the contract
      // by asserting the exact full title text is queryable for the
      // long-pill case.
      setupMessagesAndBookingsMock({
        bookings: {
          items: [makeProposal({ proposerId: 'me-123', partnerId: 'partner-456' })],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      const { findByText, queryByText } = renderChatScreen();
      await findByText('Session proposal sent');
      // Truncated "Session pro..." must not appear anywhere.
      expect(queryByText(/^Session pro\.\.\./)).toBeNull();
      expect(queryByText(/^Session pro$/)).toBeNull();
    });

    it('renders the confirmed state for both participants without action buttons', async () => {
      setupMessagesAndBookingsMock({
        bookings: {
          items: [makeProposal({ status: 'confirmed' })],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      const { findByText, queryByLabelText } = renderChatScreen();
      await findByText('Session confirmed');
      expect(queryByLabelText('Accept session proposal')).toBeNull();
      expect(queryByLabelText('Decline session proposal')).toBeNull();
    });

    it('renders the declined state without action buttons', async () => {
      setupMessagesAndBookingsMock({
        bookings: {
          items: [makeProposal({ status: 'declined' })],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      const { findByText, queryByLabelText } = renderChatScreen();
      await findByText('Session declined');
      expect(queryByLabelText('Accept session proposal')).toBeNull();
    });

    it('Accept calls /bookings/:id/confirm and updates the card to confirmed', async () => {
      setupMessagesAndBookingsMock({
        bookings: { items: [makeProposal()], total: 1, limit: 50, offset: 0 },
      });
      mockApiPost.mockResolvedValueOnce({
        ...makeProposal(),
        status: 'confirmed',
      });
      const { findByText, getByLabelText } = renderChatScreen();
      await findByText('Session proposal');
      await act(async () => {
        fireEvent.press(getByLabelText('Accept session proposal'));
      });
      expect(mockApiPost).toHaveBeenCalledWith('/bookings/booking-1/confirm', {});
      await findByText('Session confirmed');
    });

    it('Decline calls /bookings/:id/decline and updates the card to declined', async () => {
      setupMessagesAndBookingsMock({
        bookings: { items: [makeProposal()], total: 1, limit: 50, offset: 0 },
      });
      mockApiPost.mockResolvedValueOnce({
        ...makeProposal(),
        status: 'declined',
      });
      const { findByText, getByLabelText } = renderChatScreen();
      await findByText('Session proposal');
      await act(async () => {
        fireEvent.press(getByLabelText('Decline session proposal'));
      });
      expect(mockApiPost).toHaveBeenCalledWith('/bookings/booking-1/decline', {});
      await findByText('Session declined');
    });

    it('shows a friendly error if accept fails and keeps the card pending', async () => {
      setupMessagesAndBookingsMock({
        bookings: { items: [makeProposal()], total: 1, limit: 50, offset: 0 },
      });
      mockApiPost.mockRejectedValueOnce(new Error('Server down'));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { findByText, getByLabelText } = renderChatScreen();
      await findByText('Session proposal');
      await act(async () => {
        fireEvent.press(getByLabelText('Accept session proposal'));
      });
      // The Alert title is the friendly headline; the Card stays in proposed
      // state so the user can retry.
      expect(alertSpy).toHaveBeenCalled();
      expect(alertSpy.mock.calls[0][0]).toBe("Couldn't update this session.");
      await findByText('Session proposal');
      alertSpy.mockRestore();
    });

    it('renders no proposal card when /bookings is empty', async () => {
      setupMessagesAndBookingsMock();
      const { queryByText } = renderChatScreen();
      // Wait for any fetch settling; assert NO card text appears.
      await waitFor(() => {
        expect(queryByText('Session proposal')).toBeNull();
        expect(queryByText('Session proposal sent')).toBeNull();
      });
    });

    it('navigates to BookingDetail when the card is tapped', async () => {
      setupMessagesAndBookingsMock({
        bookings: { items: [makeProposal()], total: 1, limit: 50, offset: 0 },
      });
      const navigation = makeNavigation();
      const { findByLabelText } = renderChatScreen({ navigation });
      const card = await findByLabelText('Open session proposal');
      fireEvent.press(card);
      expect(navigation.navigate).toHaveBeenCalledWith('BookingDetail', {
        bookingId: 'booking-1',
      });
    });
  });
});
