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

// ─── Fetch recovery ───────────────────────────────────────────────────────────

it('a successful retry clears the earlier error and shows the current messages', async () => {
  routeGets({ '/matches/match-A/messages': () => Promise.reject(new Error('Network request failed')) });
  const u = render(screen(routes.A));
  await u.findByText('Network request failed');

  routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A', 'a1', 'Hello again')])) });
  await act(async () => {
    fireEvent.press(u.getByText('Try again'));
  });
  await u.findByText('Hello again');
  expect(u.queryByText('Network request failed')).toBeNull();
});

// ─── Match binding ────────────────────────────────────────────────────────────

it('messages and proposals fetched for match A never appear after switching to match B', async () => {
  const aMessages = deferred<unknown>();
  const aBookings = deferred<unknown>();
  routeGets({
    '/matches/match-A/messages': () => aMessages.promise,
    '/bookings?match_id=match-A': () => aBookings.promise,
    '/matches/match-B/messages': () => Promise.resolve(list([msg('match-B', 'b1', 'Ben here')])),
  });
  const u = render(screen(routes.A));
  u.rerender(screen(routes.B));
  await u.findByText('Ben here');

  await act(async () => {
    aMessages.resolve(list([msg('match-A', 'a1', 'Ava late message')]));
    aBookings.resolve(list([proposal()]));
  });
  await settle();
  expect(u.queryByText('Ava late message')).toBeNull();
  expect(u.queryByText('Session proposal')).toBeNull();
  expect(u.getByText('Ben here')).toBeTruthy();
});

it('match B does not start with the messages already shown for match A', async () => {
  const bMessages = deferred<unknown>();
  routeGets({
    '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A', 'a1', 'Ava says hi')])),
    '/matches/match-B/messages': () => bMessages.promise,
  });
  const u = render(screen(routes.A));
  await u.findByText('Ava says hi');
  u.rerender(screen(routes.B));
  await settle();
  expect(u.queryByText('Ava says hi')).toBeNull();
});

it('returning to match A does not revive the request started on the first visit (A → B → A)', async () => {
  const firstA = deferred<unknown>();
  const secondA = deferred<unknown>();
  let aCalls = 0;
  routeGets({
    '/matches/match-A/messages': () => (++aCalls === 1 ? firstA.promise : secondA.promise),
    '/matches/match-B/messages': () => Promise.resolve(list([])),
  });
  const u = render(screen(routes.A));
  u.rerender(screen(routes.B));
  await settle();
  u.rerender(screen(routes.A));
  await settle();

  await act(async () => {
    firstA.resolve(list([msg('match-A', 'old', 'From the first visit')]));
  });
  await settle();
  expect(u.queryByText('From the first visit')).toBeNull();

  await act(async () => {
    secondA.resolve(list([msg('match-A', 'new', 'Current history')]));
  });
  await u.findByText('Current history');
});

// ─── Account binding ──────────────────────────────────────────────────────────

it("another account never sees the previous account's held messages (account A → B → A)", async () => {
  const forFirst = deferred<unknown>();
  let calls = 0;
  routeGets({
    '/matches/match-A/messages': () =>
      ++calls === 1 ? forFirst.promise : Promise.resolve(list([msg('match-A', `x${calls}`, `Fresh for call ${calls}`)])),
  });
  const u = render(screen(routes.A));

  mockUserId = 'me-2';
  mockToken = 'token-me-2';
  u.rerender(screen(routes.A));
  await u.findByText('Fresh for call 2');

  mockUserId = 'me-1';
  mockToken = 'token-me-1';
  u.rerender(screen(routes.A));
  await u.findByText('Fresh for call 3');

  await act(async () => {
    forFirst.resolve(list([msg('match-A', 'stale', 'Held for the first account')]));
  });
  await settle();
  expect(u.queryByText('Held for the first account')).toBeNull();
  expect(u.queryByText('Fresh for call 2')).toBeNull();
});

// ─── Socket ───────────────────────────────────────────────────────────────────

it('a frame delivered to the previous socket after cleanup changes nothing', async () => {
  routeGets({});
  const u = render(screen(routes.A));
  await settle();
  const oldSocket = sockets[0];
  const oldHandler = oldSocket.onmessage;
  u.rerender(screen(routes.B));
  await settle();
  expect(oldSocket.close).toHaveBeenCalled();

  act(() => {
    oldHandler?.({ data: JSON.stringify(msg('match-A', 'late', 'Late frame for A')) });
  });
  expect(u.queryByText('Late frame for A')).toBeNull();
});

it("ignores a frame for another match, keeps the current match's frames", async () => {
  routeGets({});
  const u = render(screen(routes.B));
  await settle();
  act(() => {
    sockets[0].onmessage?.({ data: JSON.stringify(msg('match-A', 'x', 'Wrong room')) });
    sockets[0].onmessage?.({ data: JSON.stringify(msg('match-B', 'y', 'Right room')) });
  });
  expect(u.queryByText('Wrong room')).toBeNull();
  expect(u.getByText('Right room')).toBeTruthy();
});

// ─── Send ─────────────────────────────────────────────────────────────────────

it('a send that settles after a match switch neither appears, restores its draft nor alerts', async () => {
  routeGets({});
  const sent = deferred<unknown>();
  mockApiPost.mockImplementation(() => sent.promise);
  const u = render(screen(routes.A));
  await settle();
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'For Ava');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  u.rerender(screen(routes.B));
  await settle();

  await act(async () => {
    sent.reject(new Error('Network request failed'));
  });
  await settle();
  expect(u.getByPlaceholderText('Message…').props.value).toBe('');
  expect(alertSpy).not.toHaveBeenCalled();

  // A late success for A is not shown in B either.
  const sent2 = deferred<unknown>();
  mockApiPost.mockImplementation(() => sent2.promise);
  u.rerender(screen(routes.A));
  await settle();
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'Second try');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  u.rerender(screen(routes.B));
  await settle();
  await act(async () => {
    sent2.resolve(msg('match-A', 'sent2', 'Second try', 'me-1'));
  });
  await settle();
  expect(u.queryByText('Second try')).toBeNull();
});

it("an earlier binding's send finishing does not release the current send's guard", async () => {
  routeGets({});
  const sentA = deferred<unknown>();
  const sentB = deferred<unknown>();
  mockApiPost.mockImplementationOnce(() => sentA.promise).mockImplementationOnce(() => sentB.promise);
  const u = render(screen(routes.A));
  await settle();
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'To Ava');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  u.rerender(screen(routes.B));
  await settle();
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'To Ben');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  expect(mockApiPost).toHaveBeenCalledTimes(2);

  await act(async () => {
    sentA.resolve(msg('match-A', 'a', 'To Ava', 'me-1'));
  });
  await settle();
  // B's send is still in flight: a new draft cannot be sent twice concurrently.
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'Another');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  expect(mockApiPost).toHaveBeenCalledTimes(2);
});

it('a failed send does not overwrite a newer draft', async () => {
  routeGets({});
  const sent = deferred<unknown>();
  mockApiPost.mockImplementation(() => sent.promise);
  const u = render(screen(routes.A));
  await settle();
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'First message');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'Typed meanwhile');
  await act(async () => {
    sent.reject(new Error('Network request failed'));
  });
  await settle();
  expect(u.getByPlaceholderText('Message…').props.value).toBe('Typed meanwhile');
  expect(alertSpy).toHaveBeenCalledTimes(1);
});

// ─── Safety dialogs ───────────────────────────────────────────────────────────

function sheetCallback(): (index: number) => void {
  const call = sheetSpy.mock.calls[sheetSpy.mock.calls.length - 1];
  return call[1] as (index: number) => void;
}
function alertButton(text: string): AlertButton | undefined {
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  return (call?.[2] as AlertButton[] | undefined)?.find((b) => b.text === text);
}

it('blocks the partner of the match on screen, not the previous one', async () => {
  routeGets({});
  mockApiPost.mockResolvedValue({});
  const u = render(screen(routes.A));
  await settle();
  u.rerender(screen(routes.B));
  await settle();
  fireEvent.press(u.getByLabelText('More options'));
  act(() => sheetCallback()(1));
  await act(async () => {
    alertButton('Block')?.onPress?.();
  });
  expect(mockApiPost).toHaveBeenCalledWith('/blocks/partner-B', {});
  expect(mockApiPost).not.toHaveBeenCalledWith('/blocks/partner-A', expect.anything());
});

it('a safety menu or block confirmation opened before a match switch sends and navigates nothing', async () => {
  routeGets({});
  mockApiPost.mockResolvedValue({});
  const navigation = makeNavigation();
  const u = render(screen(routes.A, navigation));
  await settle();
  fireEvent.press(u.getByLabelText('More options'));
  const menuForA = sheetCallback();
  u.rerender(screen(routes.B, navigation));
  await settle();

  act(() => menuForA(0)); // Report
  expect(navigation.navigate).not.toHaveBeenCalledWith('Report', expect.anything());
  act(() => menuForA(1)); // Block → must not even ask
  expect(alertSpy).not.toHaveBeenCalled();

  // Confirmation opened for B, then the screen loses focus before Block.
  fireEvent.press(u.getByLabelText('More options'));
  act(() => sheetCallback()(1));
  const block = alertButton('Block');
  act(() => navigation.emit('blur'));
  await act(async () => {
    block?.onPress?.();
  });
  expect(mockApiPost).not.toHaveBeenCalledWith(expect.stringMatching(/^\/blocks\//), expect.anything());
});

it('a block confirmation answered after unmount sends nothing', async () => {
  routeGets({});
  mockApiPost.mockResolvedValue({});
  const u = render(screen(routes.A));
  await settle();
  fireEvent.press(u.getByLabelText('More options'));
  act(() => sheetCallback()(1));
  const block = alertButton('Block');
  u.unmount();
  await act(async () => {
    block?.onPress?.();
  });
  expect(mockApiPost).not.toHaveBeenCalled();
});

// ─── Proposal actions ─────────────────────────────────────────────────────────

it('a confirm keeps its result when an older proposal refresh resolves afterwards', async () => {
  let bookingCalls = 0;
  const staleRefresh = deferred<unknown>();
  routeGets({
    '/bookings?match_id=match-A': () => (++bookingCalls === 1 ? Promise.resolve(list([proposal()])) : staleRefresh.promise),
  });
  const confirmed = deferred<unknown>();
  mockApiPost.mockImplementation(() => confirmed.promise);
  const u = render(screen(routes.A));
  await u.findByText('Session proposal');

  refocus(); // a refresh starts and is still pending
  await act(async () => {
    fireEvent.press(u.getByLabelText('Accept session proposal'));
  });
  await act(async () => {
    confirmed.resolve(proposal({ status: 'confirmed', updatedAt: '2026-10-04T09:00:00Z' }));
  });
  await settle();
  expect(u.getByText('Session confirmed')).toBeTruthy();

  await act(async () => {
    staleRefresh.resolve(list([proposal()])); // read before the confirm committed
  });
  await settle();
  expect(u.getByText('Session confirmed')).toBeTruthy();
  expect(u.queryByLabelText('Accept session proposal')).toBeNull();
});

it('a proposal action that settles after a match switch changes nothing and alerts nothing', async () => {
  routeGets({ '/bookings?match_id=match-A': () => Promise.resolve(list([proposal()])) });
  const declined = deferred<unknown>();
  mockApiPost.mockImplementation(() => declined.promise);
  const u = render(screen(routes.A));
  await u.findByText('Session proposal');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Decline session proposal'));
  });
  u.rerender(screen(routes.B));
  await settle();
  await act(async () => {
    declined.reject(new Error('Network request failed'));
  });
  await settle();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(u.queryByText('Session declined')).toBeNull();
});

// ─── Restriction and disconnects ──────────────────────────────────────────────

it('a socket closed with 4003 shows the restriction and a late history response cannot repopulate it', async () => {
  const held = deferred<unknown>();
  routeGets({ '/matches/match-A/messages': () => held.promise });
  const u = render(screen(routes.A));
  act(() => {
    sockets[0].onclose?.({ code: 4003 });
  });
  await u.findByText(CONTACT_UNAVAILABLE);
  await act(async () => {
    held.resolve(list([msg('match-A', 'h', 'Hidden history')]));
  });
  await settle();
  expect(u.queryByText('Hidden history')).toBeNull();
  expect(u.queryByPlaceholderText('Message…')).toBeNull();
  expect(u.queryByLabelText('Propose a session')).toBeNull();
  expect(u.getByLabelText('More options')).toBeTruthy(); // reporting stays available
});

it('a proposal refresh in flight when the restriction arrives cannot bring a card back', async () => {
  let bookingCalls = 0;
  const heldRefresh = deferred<unknown>();
  routeGets({
    '/bookings?match_id=match-A': () => (++bookingCalls === 1 ? Promise.resolve(list([])) : heldRefresh.promise),
  });
  const u = render(screen(routes.A));
  await settle();
  refocus(); // a proposals refresh starts and is held
  act(() => {
    sockets[0].onclose?.({ code: 4003 });
  });
  await u.findByText(CONTACT_UNAVAILABLE);
  await act(async () => {
    heldRefresh.resolve(list([proposal()]));
  });
  await settle();
  expect(u.queryByText('Session proposal')).toBeNull();
  expect(u.getByText(CONTACT_UNAVAILABLE)).toBeTruthy();
});

it('a 403 restriction on send shows the restriction instead of a retryable draft', async () => {
  routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A', 'a1', 'Earlier')])) });
  mockApiPost.mockRejectedValue(new Error(CONTACT_UNAVAILABLE));
  const u = render(screen(routes.A));
  await u.findByText('Earlier');
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'Are you there?');
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  await u.findByText(CONTACT_UNAVAILABLE);
  expect(u.queryByText('Earlier')).toBeNull();
  expect(u.queryByPlaceholderText('Message…')).toBeNull();
});

it('a transient disconnect is not presented as a block and can reconnect', async () => {
  routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A', 'a1', 'Still here')])) });
  const u = render(screen(routes.A));
  await u.findByText('Still here');
  act(() => {
    sockets[0].onclose?.({ code: 1006 });
  });
  await u.findByText('Live updates paused.');
  expect(u.queryByText(CONTACT_UNAVAILABLE)).toBeNull();
  expect(u.getByPlaceholderText('Message…')).toBeTruthy();
  const callsBefore = mockApiGet.mock.calls.length;
  await act(async () => {
    fireEvent.press(u.getByLabelText('Reconnect'));
  });
  await settle();
  expect(sockets).toHaveLength(2);
  expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore);
  expect(u.queryByText('Live updates paused.')).toBeNull();
});

it('closing our own socket on cleanup is not reported as a disconnect', async () => {
  routeGets({});
  const u = render(screen(routes.A));
  await settle();
  const first = sockets[0];
  const onclose = first.onclose;
  u.rerender(screen(routes.B));
  await settle();
  act(() => {
    onclose?.({ code: 1000 });
  });
  expect(u.queryByText('Live updates paused.')).toBeNull();
});

// ─── Current binding still works ──────────────────────────────────────────────

it('the HTTP response and the socket echo of one sent message still show it once, in order', async () => {
  routeGets({ '/matches/match-A/messages': () => Promise.resolve(list([msg('match-A', 'a1', 'First', 'partner', '2026-10-04T08:00:00Z')])) });
  const sent = msg('match-A', 'a2', 'Second', 'me-1', '2026-10-04T08:05:00Z');
  mockApiPost.mockResolvedValue(sent);
  const u = render(screen(routes.A));
  await u.findByText('First');
  fireEvent.changeText(u.getByPlaceholderText('Message…'), 'Second');
  act(() => {
    sockets[0].onmessage?.({ data: JSON.stringify(sent) });
  });
  await act(async () => {
    fireEvent.press(u.getByLabelText('Send'));
  });
  await settle();
  expect(u.getAllByText('Second')).toHaveLength(1);
  const texts = u.getAllByText(/^(First|Second)$/).map((n) => n.props.children);
  expect(texts).toEqual(['First', 'Second']);
});
