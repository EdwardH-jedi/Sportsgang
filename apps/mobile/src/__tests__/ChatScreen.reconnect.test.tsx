/**
 * ChatScreen WebSocket reconnect tests
 *
 * Kept apart from ChatScreen.test.tsx because these drive a controllable fake
 * socket (open / drop) under fake timers to check the backoff schedule, the
 * foreground reconnect and teardown.
 *
 * Mocks: lib/api, stores/auth, Screen, React Navigation, safe-area insets,
 * theme. AppState comes from the react-native jest preset (a jest.fn whose
 * addEventListener returns { remove: jest.fn() }).
 */

import React from 'react';
import { AppState } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import { ChatScreen } from '../screens/chat/ChatScreen';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: jest.fn(),
  },
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: { id: 'me-123', email: 'me@example.com' },
    token: 'test-jwt-token',
  }),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: { h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {} },
}));

// ─── Fake WebSocket ───────────────────────────────────────────────────────────

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = jest.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  // 1006 = abnormal closure, what React Native reports for a dropped network.
  drop(code = 1006) {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

(global as unknown as Record<string, unknown>).WebSocket = FakeWebSocket;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WS_URL = 'ws://localhost:8000/matches/match-1/ws?token=test-jwt-token';

function message(id: string, body: string) {
  return {
    id,
    matchId: 'match-1',
    senderId: 'partner-456',
    body,
    createdAt: `2026-04-08T08:0${id}:00Z`,
  };
}

function mockHistory(items: ReturnType<typeof message>[]) {
  mockApiGet.mockImplementation((url: string) =>
    Promise.resolve(
      url.startsWith('/bookings')
        ? { items: [], total: 0, limit: 50, offset: 0 }
        : { items, total: items.length, limit: 100, offset: 0 }
    )
  );
}

const messageFetches = () =>
  mockApiGet.mock.calls.filter(([url]) => String(url).startsWith('/matches/')).length;

const latestSocket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

/** The handler and subscription ChatScreen registered with AppState. */
function appStateListener() {
  const addEventListener = AppState.addEventListener as jest.Mock;
  const index = addEventListener.mock.calls.map(([event]) => event).lastIndexOf('change');
  if (index === -1) throw new Error('ChatScreen did not subscribe to AppState changes');
  return {
    onChange: addEventListener.mock.calls[index][1] as (state: string) => void,
    subscription: addEventListener.mock.results[index].value as { remove: jest.Mock },
  };
}

/** Render the chat, let the history load, and open the first socket. */
async function renderConnected() {
  const utils = render(
    <ChatScreen
      route={{ params: { matchId: 'match-1', partnerName: 'Jordan Lee', partnerId: 'partner-456', sport: 'gym' } } as any}
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as any}
    />
  );
  await utils.findByPlaceholderText('Message…');
  expect(FakeWebSocket.instances).toHaveLength(1);
  act(() => latestSocket().open());
  return utils;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ChatScreen WebSocket reconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    mockApiGet.mockReset();
    mockHistory([]);
    (AppState.addEventListener as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a dropped socket after 1s, 2s, 4s, 8s and 8s, then waits for the foreground', async () => {
    await renderConnected();

    const delays = [1000, 2000, 4000, 8000, 8000];
    for (const [i, delay] of delays.entries()) {
      act(() => latestSocket().drop());
      act(() => jest.advanceTimersByTime(delay - 1));
      expect(FakeWebSocket.instances).toHaveLength(i + 1);
      act(() => jest.advanceTimersByTime(1));
      expect(FakeWebSocket.instances).toHaveLength(i + 2);
      expect(latestSocket().url).toBe(WS_URL);
    }

    // Fifth retry fails too: no sixth timer.
    act(() => latestSocket().drop());
    act(() => jest.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(6);

    // Coming back to the foreground starts again.
    act(() => appStateListener().onChange('active'));
    expect(FakeWebSocket.instances).toHaveLength(7);
  });

  it('shows "Reconnecting…" while disconnected and refetches the history once reconnected', async () => {
    mockHistory([message('1', 'Before the drop')]);
    const { findByText, queryByText } = await renderConnected();
    expect(queryByText('Reconnecting…')).toBeNull();
    expect(messageFetches()).toBe(1);

    act(() => latestSocket().drop());
    expect(queryByText('Reconnecting…')).not.toBeNull();

    mockHistory([message('1', 'Before the drop'), message('2', 'Sent while you were away')]);
    act(() => jest.advanceTimersByTime(1000));
    act(() => latestSocket().open());

    await findByText('Sent while you were away');
    expect(queryByText('Reconnecting…')).toBeNull();
    expect(messageFetches()).toBe(2);
  });

  it('reconnects as soon as the app returns to the foreground', async () => {
    await renderConnected();
    const { onChange } = appStateListener();

    // Socket still open: nothing to do.
    act(() => onChange('active'));
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => latestSocket().drop());
    act(() => onChange('background'));
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => onChange('active'));
    expect(FakeWebSocket.instances).toHaveLength(2);

    // The pending 1s retry was cancelled, not run as well.
    act(() => jest.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it.each([1008, 4003])('does not retry when the server closes with %i (token or match rejected)', async (code) => {
    const { queryByText } = await renderConnected();

    act(() => latestSocket().drop(code));
    act(() => jest.advanceTimersByTime(60_000));
    act(() => appStateListener().onChange('active'));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(queryByText('Reconnecting…')).toBeNull();
  });

  it('closes the socket on unmount and ignores the close event that follows', async () => {
    const { unmount } = await renderConnected();
    const socket = latestSocket();

    unmount();
    expect(socket.close).toHaveBeenCalledTimes(1);

    act(() => socket.drop(1000));
    act(() => jest.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('cancels a pending retry and stops listening for app state on unmount', async () => {
    const { unmount } = await renderConnected();
    act(() => latestSocket().drop());
    const { subscription } = appStateListener();

    unmount();
    act(() => jest.advanceTimersByTime(60_000));

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(subscription.remove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(messageFetches()).toBe(1));
  });
});
