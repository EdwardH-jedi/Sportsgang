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
import { AppState, FlatList } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

  it('keeps the chat on screen when the refetch after a reconnect fails', async () => {
    mockHistory([message('1', 'Before the drop')]);
    const { getByPlaceholderText, getByText, queryByText } = await renderConnected();

    act(() => latestSocket().drop());
    mockApiGet.mockRejectedValue(new Error('Network request failed'));
    act(() => jest.advanceTimersByTime(1000));
    await act(async () => {
      latestSocket().open();
    });

    expect(messageFetches()).toBe(2);
    expect(getByText('Before the drop')).toBeTruthy();
    expect(getByPlaceholderText('Message…')).toBeTruthy();
    expect(queryByText('Try again')).toBeNull();
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

// ─── Gap recovery (Codex B1) ──────────────────────────────────────────────────
// Codex's independent regression, kept as written: 100 messages loaded (the
// newest page is 50-99), the socket drops while 70 more arrive, then every id
// 0-169 must be reachable through "Load earlier messages". Before the repair,
// ids 100-119 were never fetched and the control disappeared anyway.

describe('ChatScreen reconnect gap recovery', () => {
  const msg = (i: number) => ({
    id: `h-${i}`,
    matchId: 'match-1',
    senderId: 'partner-456',
    body: `Message ${i}`,
    createdAt: new Date(Date.UTC(2026, 3, 8, 8, 0, i)).toISOString(),
  });
  let total = 100;
  // Pages oldest-first with limit/offset, like GET /matches/:id/messages.
  function history() {
    mockApiGet.mockImplementation((url: string) => {
      if (url.startsWith('/bookings')) return Promise.resolve({ items: [], total: 0 });
      const limit = Number(/limit=(\d+)/.exec(url)?.[1] ?? 50);
      const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0);
      return Promise.resolve({
        items: Array.from({ length: Math.min(limit, total - offset) }, (_, k) => msg(offset + k)),
        total,
        limit,
        offset,
      });
    });
  }
  const ids = (u: any): string[] =>
    u.UNSAFE_getByType(FlatList)
      .props.data.filter((x: any) => x.kind === 'message')
      .map((x: any) => x.message.id);
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `h-${from + i}`);

  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    mockApiGet.mockReset();
    (AppState.addEventListener as jest.Mock).mockClear();
    total = 100;
    history();
  });

  afterEach(() => jest.useRealTimers());

  it('makes all messages reachable after reconnect misses more than one page', async () => {
    const u = await renderConnected();
    await act(async () => {});
    expect(ids(u)).toEqual(range(50, 100));
    act(() => latestSocket().drop());
    total = 170;
    act(() => jest.advanceTimersByTime(1000));
    await act(async () => latestSocket().open());
    for (let i = 0; i < 5 && u.queryByLabelText('Load earlier messages'); i++)
      await act(async () => {
        fireEvent.press(u.getByLabelText('Load earlier messages'));
      });
    expect(u.queryByLabelText('Load earlier messages')).toBeNull();
    expect(ids(u)).toEqual(range(0, 170));
  });

  // FlatList only renders its first rows here, so these start from a short
  // history to keep the gap row on screen, and read its position from `data`.
  const entries = (u: any): string[] =>
    u.UNSAFE_getByType(FlatList).props.data.map((x: any) => (x.kind === 'gap' ? 'gap' : x.message.id));
  const pressLoadEarlier = async (u: any) => {
    for (let i = 0; i < 5 && u.queryByLabelText('Load earlier messages'); i++)
      await act(async () => {
        fireEvent.press(u.getByLabelText('Load earlier messages'));
      });
  };

  it('stops paging back after 10 pages and leaves the rest as a loadable gap', async () => {
    total = 5;
    const u = await renderConnected();
    await act(async () => {});
    act(() => latestSocket().drop());
    total = 600;
    act(() => jest.advanceTimersByTime(1000));
    await act(async () => latestSocket().open());

    // 1 request for the first load; 2 for the newest page on reconnect + 9 back.
    expect(messageFetches()).toBe(12);
    expect(entries(u)).toEqual([...range(0, 5), 'gap', ...range(100, 600)]);
    expect(u.getByText('Some messages may be missing')).toBeTruthy();

    await pressLoadEarlier(u);
    expect(entries(u)).toEqual(range(0, 600));
    expect(u.queryByText('Some messages may be missing')).toBeNull();
    expect(u.queryByLabelText('Load earlier messages')).toBeNull();
  });

  it('keeps a gap loadable when a page back fails during the reconnect', async () => {
    total = 5;
    const u = await renderConnected();
    await act(async () => {});
    const serve = mockApiGet.getMockImplementation()!;
    mockApiGet.mockImplementation((url: string) =>
      url === '/matches/match-1/messages?limit=50&offset=20'
        ? Promise.reject(new Error('Network request failed'))
        : serve(url)
    );
    act(() => latestSocket().drop());
    total = 120;
    act(() => jest.advanceTimersByTime(1000));
    await act(async () => latestSocket().open());

    expect(entries(u)).toEqual([...range(0, 5), 'gap', ...range(70, 120)]);
    expect(u.getByText('Some messages may be missing')).toBeTruthy();
    expect(u.queryByText('Try again')).toBeNull();

    mockApiGet.mockImplementation(serve);
    await pressLoadEarlier(u);
    expect(entries(u)).toEqual(range(0, 120));
    expect(u.queryByText('Some messages may be missing')).toBeNull();
  });
});
