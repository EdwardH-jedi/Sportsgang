/**
 * ChatScreen request and action ownership (overnight 2026-10-05).
 *
 * Everything the chat shows or does belongs to one binding: this account and
 * this match. These tests pin late fetches, socket frames, send outcomes,
 * safety dialogs and proposal actions that settle after the binding changed
 * (match A → B → A, account A → B → A, blur/unmount), plus the restriction
 * (403 / socket close 4003) and failed-send paths. The component is retained
 * across the change on purpose; a normal logout unmounts the whole
 * authenticated stack instead and is not what these tests model.
 */

import React from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';

import { ChatScreen } from '../screens/chat/ChatScreen';

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock('../lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
  BASE_URL: 'http://localhost:8000',
}));

let mockUserId: string | null = 'me-1';
let mockToken: string | null = 'token-me-1';

jest.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    user: mockUserId ? { id: mockUserId, email: 'me@example.com' } : null,
    token: mockToken,
  }),
}));

class MockWebSocket {
  url: string;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = 1;
  close = jest.fn(() => {
    this.readyState = 3;
  });
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
}
let sockets: MockWebSocket[] = [];
(global as unknown as Record<string, unknown>).WebSocket = MockWebSocket;

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

// Focus: fires on mount like a real first focus; `refocus()` simulates
// coming back to the screen (e.g. from BookingComposer).
let focusCallback: (() => void) | null = null;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    focusCallback = cb as () => void;
    React.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));
function refocus() {
  act(() => {
    focusCallback?.();
  });
}

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../theme', () => ({
  colors: {
    accent: '#000', brand: '#000', border: '#ccc', surface: '#fff', surfaceElevated: '#f5f5f5',
    background: '#fafafa', separator: '#e0e0e0', textPrimary: '#000', textSecondary: '#555',
    textTertiary: '#888', textInverse: '#fff', success: '#0f0', error: '#f00',
  },
  radii: { sm: 4, md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40, xxxl: 48 },
  typography: { h2: {}, h3: {}, body: {}, bodyLarge: {}, bodySmall: {}, label: {}, button: {} },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTACT_UNAVAILABLE = "You can't contact this person.";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const list = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 });

function msg(matchId: string, id: string, body: string, senderId = 'partner', createdAt = '2026-10-04T08:00:00Z') {
  return { id, matchId, senderId, body, createdAt };
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    matchId: 'match-A',
    proposerId: 'partner-A',
    partnerId: 'me-1',
    sport: 'running',
    startsAt: '2026-10-06T00:30:00Z',
    endsAt: '2026-10-06T01:30:00Z',
    location: null,
    notes: null,
    status: 'proposed',
    createdAt: '2026-10-04T08:30:00Z',
    updatedAt: '2026-10-04T08:30:00Z',
    partner: { displayName: 'Ava' },
    venue: null,
    ...overrides,
  };
}

type Handlers = Record<string, (url: string) => Promise<unknown>>;
/** Routes GETs by prefix; unmatched GETs resolve to an empty list. */
function routeGets(handlers: Handlers) {
  mockApiGet.mockImplementation((url: string) => {
    for (const [prefix, h] of Object.entries(handlers)) if (url.startsWith(prefix)) return h(url);
    return Promise.resolve(list([]));
  });
}

function makeNavigation() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    goBack: jest.fn(),
    navigate: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn((event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
      return () => {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
      };
    }),
    emit(event: string) {
      (listeners[event] ?? []).forEach((f) => f());
    },
  };
}

const routes = {
  A: { params: { matchId: 'match-A', partnerName: 'Ava', partnerId: 'partner-A', sport: 'running' } },
  B: { params: { matchId: 'match-B', partnerName: 'Ben', partnerId: 'partner-B', sport: 'golf' } },
};

function screen(route: (typeof routes)['A'], navigation = makeNavigation()) {
  return <ChatScreen route={route as never} navigation={navigation as never} />;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

type AlertButton = { text: string; style?: string; onPress?: () => void };

let alertSpy: jest.SpyInstance;
let sheetSpy: jest.SpyInstance;

beforeEach(() => {
  // reset, not clear: a queued mockImplementationOnce must not leak into the next test.
  jest.resetAllMocks();
  sockets = [];
  focusCallback = null;
  mockUserId = 'me-1';
  mockToken = 'token-me-1';
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  sheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
});

afterEach(() => {
  alertSpy.mockRestore();
  sheetSpy.mockRestore();
});

function sheetCallback(): (index: number) => void {
  const call = sheetSpy.mock.calls[sheetSpy.mock.calls.length - 1];
  return call[1] as (index: number) => void;
}
function alertButton(text: string): AlertButton | undefined {
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  return (call?.[2] as AlertButton[] | undefined)?.find((b) => b.text === text);
}


it('review: focus after a disconnected peer block rechecks message authority', async () => {
  routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A','private1','private old history')])) });
  const u=render(screen(routes.A)); await u.findByText('private old history');
  act(() => sockets[0].onclose?.({code:1006}));
  routeGets({ '/matches/match-A/messages': () => Promise.reject(new Error(CONTACT_UNAVAILABLE)) });
  refocus(); await settle();
  expect(u.queryByText('private old history')).toBeNull();
  expect(u.queryByPlaceholderText('Message…')).toBeNull();
  expect(u.getByText(CONTACT_UNAVAILABLE)).toBeTruthy();
});
it('review: a token replacement that opens a new socket clears the paused status', async () => {
  routeGets({}); const u=render(screen(routes.A)); await settle();
  act(() => sockets[0].onclose?.({code:1006}));
  expect(u.getByText('Live updates paused.')).toBeTruthy();
  mockToken='replacement-token-me-1';u.rerender(screen(routes.A));await settle();
  expect(sockets[sockets.length-1].url).toContain(mockToken);
  act(() => sockets[sockets.length-1].onopen?.()); await settle();
  expect(u.queryByText('Live updates paused.')).toBeNull();
});
it('review: block success dialog acknowledgement expires on blur', async () => {
  routeGets({});mockApiPost.mockResolvedValue({});const navigation=makeNavigation();
  const u=render(screen(routes.A,navigation));await settle();
  fireEvent.press(u.getByLabelText('More options'));act(() => sheetCallback()(1));
  await act(async () => alertButton('Block')?.onPress?.());await settle();
  expect(alertSpy.mock.calls.at(-1)?.[0]).toBe('User blocked');
  const ok=alertButton('OK');act(() => navigation.emit('blur'));
  act(() => ok?.onPress?.());expect(navigation.goBack).not.toHaveBeenCalled();
});
it('review: block finishing after blur does not alert over a different screen', async () => {
  routeGets({});const done=deferred<unknown>();mockApiPost.mockImplementation(() => done.promise);
  const navigation=makeNavigation();const u=render(screen(routes.A,navigation));await settle();
  fireEvent.press(u.getByLabelText('More options'));act(() => sheetCallback()(1));
  act(() => alertButton('Block')?.onPress?.());act(() => navigation.emit('blur'));
  alertSpy.mockClear();await act(async () => done.resolve({}));await settle();
  expect(alertSpy).not.toHaveBeenCalled();
});
it('review: an older action response cannot undo a newer completed proposal refresh', async () => {
  routeGets({ '/bookings?match_id=match-A': () => Promise.resolve(list([proposal()])) });
  const done=deferred<unknown>();mockApiPost.mockImplementation(() => done.promise);
  const u=render(screen(routes.A));await u.findByText('Session proposal');
  act(() => fireEvent.press(u.getByLabelText('Accept session proposal')));
  routeGets({ '/bookings?match_id=match-A': () => Promise.resolve(list([proposal({status:'completed',updatedAt:'2026-10-04T10:00:00Z'})])) });
  refocus();await settle();expect(u.queryByText('Session confirmed')).toBeNull();
  await act(async () => done.resolve(proposal({status:'confirmed',updatedAt:'2026-10-04T09:00:00Z'})));await settle();
  expect(u.queryByText('Session confirmed')).toBeNull();
});
it('review control: a refocus never restores hidden history while still restricted', async () => {
 routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A','p1','hidden history')])) });
 const u=render(screen(routes.A));await u.findByText('hidden history');
 act(() => sockets[0].onclose?.({code:4003}));refocus();await settle();
 expect(u.queryByText('hidden history')).toBeNull();expect(u.queryByPlaceholderText('Message…')).toBeNull();
});
it('review control: token replacement ignores a saved old socket close', async () => {
 routeGets({});const u=render(screen(routes.A));await settle();const oldClose=sockets[0].onclose;
 mockToken='replacement-token-me-1';u.rerender(screen(routes.A));await settle();
 act(() => oldClose?.({code:4003}));await settle();expect(u.queryByText(CONTACT_UNAVAILABLE)).toBeNull();
});
