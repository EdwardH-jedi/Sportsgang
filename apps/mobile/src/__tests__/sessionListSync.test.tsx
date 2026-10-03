/**
 * Review F8 — session lists must agree with persisted API state after
 * join / leave / cancel / create, and after another account's change once
 * the list is refreshed (focus or pull). Real hooks (useEvents,
 * useEventDetail, usePlans) and real screens run over a small in-memory
 * /events server, so every assertion is about what the server persisted.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

import { ExploreScreen } from '../screens/explore/ExploreScreen';
import { CreateSessionScreen } from '../screens/sessions/CreateSessionScreen';
import { SessionDetailScreen } from '../screens/sessions/SessionDetailScreen';
import { MyPlansScreen } from '../screens/plans/MyPlansScreen';
import { useAuthStore } from '../stores/auth';
import { useExploreStore } from '../stores/explore';
import { useProfileStore } from '../stores/profile';

// ─── In-memory /events server ────────────────────────────────────────────────

interface FakeEvent {
  id: string;
  hostUserId: string;
  title: string;
  sport: 'running' | 'golf';
  startsAt: string;
  capacity: number;
  status: 'open' | 'full' | 'cancelled' | 'completed';
  members: string[];
}

const NAMES: Record<string, string> = { alice: 'Alice', bob: 'Bob', carol: 'Carol' };
const db = new Map<string, FakeEvent>();
let viewer = 'alice';
let created = 0;
const calls: string[] = [];
const failures: { method: string; match: RegExp; message: string }[] = [];
const holds: { match: RegExp; release: Promise<void> }[] = [];

function future(days: number, hourUtc = 21): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc)).toISOString();
}

function addEvent(e: Partial<FakeEvent> & Pick<FakeEvent, 'id' | 'hostUserId'>): FakeEvent {
  const row: FakeEvent = {
    title: `Session ${e.id}`,
    sport: 'golf',
    startsAt: future(3),
    capacity: 4,
    status: 'open',
    members: [e.hostUserId],
    ...e,
  };
  db.set(row.id, row);
  return row;
}

function summary(e: FakeEvent) {
  const count = e.members.length;
  return {
    id: e.id,
    hostUserId: e.hostUserId,
    host: { id: e.hostUserId, displayName: NAMES[e.hostUserId] },
    title: e.title,
    sport: e.sport,
    mode: 'casual',
    startsAt: e.startsAt,
    locationText: 'Moore Park Golf',
    capacity: e.capacity,
    participantCount: count,
    spotsLeft: Math.max(0, e.capacity - count),
    visibility: 'public',
    status: e.status,
    hasJoined: e.members.includes(viewer),
    description: null,
    runDetails: null,
    golfDetails: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}

function detail(e: FakeEvent) {
  return {
    ...summary(e),
    participants: e.members.map((u) => ({ userId: u, displayName: NAMES[u], joinedAt: '2026-10-01T00:00:00Z' })),
  };
}

function byStart(a: FakeEvent, b: FakeEvent) {
  return Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id);
}

function listEvents(url: URL) {
  const q = url.searchParams;
  let rows = [...db.values()];
  const asOf = q.get('as_of') ? Date.parse(q.get('as_of') as string) : Date.now();
  if (q.get('mine') === 'true') {
    rows = rows.filter((e) => e.hostUserId === viewer || e.members.includes(viewer));
    const segment = q.get('segment');
    const isUpcoming = (e: FakeEvent) =>
      e.status !== 'cancelled' && e.status !== 'completed' && Date.parse(e.startsAt) > asOf;
    if (segment === 'upcoming') rows = rows.filter(isUpcoming).sort(byStart);
    else if (segment === 'past') rows = rows.filter((e) => !isUpcoming(e)).sort((a, b) => -byStart(a, b));
    else rows.sort(byStart);
  } else {
    rows = rows.filter((e) => e.status === 'open' || e.status === 'full');
    if (q.get('upcoming') === 'true') rows = rows.filter((e) => Date.parse(e.startsAt) >= Date.now());
    rows.sort(byStart);
  }
  const sport = q.get('sport');
  if (sport) rows = rows.filter((e) => e.sport === sport);
  const limit = Number(q.get('limit') ?? 20);
  const offset = Number(q.get('offset') ?? 0);
  return { items: rows.slice(offset, offset + limit).map(summary), total: rows.length };
}

function mutate(id: string, action: string) {
  const e = db.get(id);
  if (!e) throw new Error('Event not found');
  if (action === 'join') {
    if (e.status === 'cancelled' || e.status === 'completed') throw new Error(`Cannot join a ${e.status} event`);
    if (e.members.includes(viewer)) throw new Error('Already joined this event');
    if (e.members.length >= e.capacity) throw new Error('Event is full');
    e.members.push(viewer);
    if (e.members.length >= e.capacity) e.status = 'full';
  } else if (action === 'leave') {
    e.members = e.members.filter((u) => u !== viewer);
    if (e.status === 'full' && e.members.length < e.capacity) e.status = 'open';
  } else if (action === 'cancel') {
    e.status = 'cancelled';
  }
  return detail(e);
}

async function mockHandle(method: string, path: string, body?: Record<string, unknown>) {
  calls.push(`${method} ${path}`);
  const hold = holds.find((h) => h.match.test(path));
  if (hold) {
    holds.splice(holds.indexOf(hold), 1);
    await hold.release;
  }
  const failure = failures.find((f) => f.method === method && f.match.test(path));
  if (failure) {
    failures.splice(failures.indexOf(failure), 1);
    throw new Error(failure.message);
  }
  const url = new URL(path, 'http://api.test');
  if (method === 'GET' && url.pathname === '/events') return listEvents(url);
  if (method === 'GET' && url.pathname === '/bookings') {
    return { items: [], total: 0, limit: Number(url.searchParams.get('limit') ?? 20), offset: 0 };
  }
  const one = /^\/events\/([^/]+)$/.exec(url.pathname);
  if (method === 'GET' && one) {
    const e = db.get(one[1]);
    if (!e) throw new Error('Event not found');
    return detail(e);
  }
  if (method === 'POST' && url.pathname === '/events') {
    created += 1;
    const e = addEvent({
      id: `new-${created}`,
      hostUserId: viewer,
      title: String(body?.title),
      sport: body?.sport as FakeEvent['sport'],
      startsAt: String(body?.startsAt),
      capacity: Number(body?.capacity),
    });
    return detail(e);
  }
  const action = /^\/events\/([^/]+)\/(join|leave|cancel)$/.exec(url.pathname);
  if (method === 'POST' && action) return mutate(action[1], action[2]);
  throw new Error(`unhandled ${method} ${path}`);
}

jest.mock('../lib/api', () => ({
  api: {
    get: (path: string) => mockHandle('GET', path),
    post: (path: string, body?: Record<string, unknown>) => mockHandle('POST', path, body),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => 'golf'),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

// Focus is driven by the test: effects register on mount (first focus) and
// `refocus()` replays them, like returning to a screen in the navigator.
const mockFocusEffects = new Set<() => void | (() => void)>();
jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (effect: () => void | (() => void)) =>
      ReactActual.useEffect(() => {
        mockFocusEffects.add(effect);
        const cleanup = effect();
        return () => {
          mockFocusEffects.delete(effect);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]),
  };
});

async function refocus() {
  await act(async () => {
    for (const effect of [...mockFocusEffects]) effect();
  });
}

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => jest.fn()) };
/* eslint-disable @typescript-eslint/no-explicit-any */
const renderExplore = () =>
  render(<ExploreScreen navigation={navigation as any} route={{ key: 'Explore', name: 'Explore' } as any} />);
const renderDetail = (eventId: string) =>
  render(
    <SessionDetailScreen
      navigation={navigation as any}
      route={{ key: 'd', name: 'SessionDetail', params: { eventId } } as any}
    />
  );
const renderPlans = () =>
  render(<MyPlansScreen navigation={navigation as any} route={{ key: 'Plans', name: 'Plans' } as any} />);
/* eslint-enable @typescript-eslint/no-explicit-any */

function signIn(id: string) {
  viewer = id;
  useAuthStore.setState({ user: { id, email: `${id}@example.com` } as never, token: 't' });
}

function card(utils: ReturnType<typeof render>, id: string) {
  return within(utils.getByTestId(`session-card-${id}`));
}

/**
 * Press a control in a screen that was rendered before another (now
 * unmounted) screen. Testing Library's fireEvent did not dispatch into such
 * an earlier root, while these tests deliberately keep several screens
 * mounted at once, as the navigator does; so call the control's handler.
 */
function pressByLabel(utils: ReturnType<typeof render>, label: string) {
  const target = utils.UNSAFE_getAllByProps({ accessibilityLabel: label }).find((n) => typeof n.props.onPress === 'function');
  if (!target) throw new Error(`No pressable labelled ${label}`);
  act(() => {
    target.props.onPress();
  });
}

async function settled(utils: ReturnType<typeof render>, id: string, text: string) {
  await waitFor(() => expect(card(utils, id).getByText(text)).toBeTruthy());
}

beforeEach(() => {
  db.clear();
  calls.length = 0;
  failures.length = 0;
  holds.length = 0;
  mockFocusEffects.clear();
  created = 0;
  jest.clearAllMocks();
  useExploreStore.getState().reset();
  useProfileStore.getState().reset();
  useProfileStore.setState({ sportProfiles: [] as never });
  signIn('alice');
});

describe('Explore sessions after a mutation on the detail screen', () => {
  it('shows Full and Joined after taking the final golf place', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', capacity: 2 });
    const explore = renderExplore();
    await settled(explore, 'g1', '2 golfers · 1 spot left');
    expect(card(explore, 'g1').queryByText('Joined')).toBeNull();

    const detailScreen = renderDetail('g1');
    fireEvent.press(await detailScreen.findByTestId('session-join'));
    await waitFor(() => expect(detailScreen.getByTestId('session-capacity')).toHaveTextContent('2 golfers · Full'));
    detailScreen.unmount();
    await refocus();

    await settled(explore, 'g1', '2 golfers · Full');
    expect(card(explore, 'g1').getByText('Joined')).toBeTruthy();
    expect(db.get('g1')?.members).toEqual(['bob', 'alice']);
  });

  it('restores capacity after leaving and fills it again on rejoin', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', capacity: 2, members: ['bob', 'alice'], status: 'full' });
    const explore = renderExplore();
    await settled(explore, 'g1', '2 golfers · Full');

    const leaving = renderDetail('g1');
    fireEvent.press(await leaving.findByTestId('session-leave'));
    await waitFor(() => expect(leaving.getByTestId('session-join')).toBeTruthy());
    leaving.unmount();
    await refocus();
    await settled(explore, 'g1', '2 golfers · 1 spot left');
    expect(card(explore, 'g1').queryByText('Joined')).toBeNull();

    const rejoining = renderDetail('g1');
    fireEvent.press(await rejoining.findByTestId('session-join'));
    await waitFor(() => expect(rejoining.getByTestId('session-leave')).toBeTruthy());
    rejoining.unmount();
    await refocus();
    await settled(explore, 'g1', '2 golfers · Full');
    expect(card(explore, 'g1').getByText('Joined')).toBeTruthy();
  });

  it('updates the list underneath as soon as the mutation succeeds', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', capacity: 2 });
    const explore = renderExplore();
    await settled(explore, 'g1', '2 golfers · 1 spot left');
    const detailScreen = renderDetail('g1');
    fireEvent.press(await detailScreen.findByTestId('session-join'));
    // No focus event yet: the shared invalidation alone re-reads the list.
    await settled(explore, 'g1', '2 golfers · Full');
    expect(card(explore, 'g1').getByText('Joined')).toBeTruthy();
  });

  it('keeps the server state when a join is rejected, with no optimistic Joined', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', capacity: 2 });
    const explore = renderExplore();
    await settled(explore, 'g1', '2 golfers · 1 spot left');
    const detailScreen = renderDetail('g1');
    await detailScreen.findByTestId('session-join');
    // Carol takes the last place first.
    db.get('g1')!.members.push('carol');
    db.get('g1')!.status = 'full';
    fireEvent.press(detailScreen.getByTestId('session-join'));
    expect(await detailScreen.findByText('Event is full')).toBeTruthy();
    detailScreen.unmount();
    await refocus();
    await settled(explore, 'g1', '2 golfers · Full');
    expect(card(explore, 'g1').queryByText('Joined')).toBeNull();
  });
});

describe('create and cancel reach Explore and My Plans', () => {
  it('a hosted round appears in the golf list and in My Plans', async () => {
    const explore = renderExplore();
    await waitFor(() => expect(explore.getByText('No upcoming rounds yet')).toBeTruthy());
    const plans = renderPlans();
    await waitFor(() => expect(plans.getByTestId('plans-empty-upcoming')).toBeTruthy());

    const create = render(
      <CreateSessionScreen
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={navigation as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route={{ key: 'c', name: 'CreateSession', params: { sport: 'golf' } } as any}
      />
    );
    fireEvent.changeText(create.getByLabelText('Round name'), 'Saturday 9');
    fireEvent.changeText(create.getByLabelText('Course'), 'Moore Park Golf');
    fireEvent.press(create.getByLabelText('9 holes'));
    await act(async () => {
      fireEvent.press(create.getByTestId('create-session-submit'));
    });
    expect(navigation.replace).toHaveBeenCalledWith('SessionDetail', { eventId: 'new-1' });
    create.unmount();
    await refocus();

    await settled(explore, 'new-1', 'Hosting');
    await waitFor(() => expect(plans.getByTestId('plan-event:new-1')).toBeTruthy());
    expect(within(plans.getByTestId('plan-event:new-1')).getByText('Hosting')).toBeTruthy();
  });

  it('a cancelled round leaves the Explore list and moves to Past in My Plans', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    addEvent({ id: 'g1', hostUserId: 'alice', title: 'Alice round' });
    const explore = renderExplore();
    await settled(explore, 'g1', 'Hosting');
    const plans = renderPlans();
    await waitFor(() => expect(plans.getByTestId('plan-event:g1')).toBeTruthy());

    const detailScreen = renderDetail('g1');
    fireEvent.press(await detailScreen.findByTestId('session-cancel'));
    expect(await detailScreen.findByText('This round was cancelled by the host.')).toBeTruthy();
    detailScreen.unmount();
    await refocus();

    await waitFor(() => expect(explore.queryByTestId('session-card-g1')).toBeNull());
    await waitFor(() => expect(plans.queryByTestId('plan-event:g1')).toBeNull());
    pressByLabel(plans, 'Past');
    expect(await plans.findByTestId('plan-event:g1')).toBeTruthy();
    expect(within(plans.getByTestId('plan-event:g1')).getByText('Cancelled')).toBeTruthy();
  });
});

describe('refresh and request hygiene', () => {
  it("shows another account's join after the list is focused again", async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', capacity: 2 });
    const explore = renderExplore();
    await settled(explore, 'g1', '2 golfers · 1 spot left');
    db.get('g1')!.members.push('carol');
    db.get('g1')!.status = 'full';
    await refocus();
    await settled(explore, 'g1', '2 golfers · Full');
    expect(card(explore, 'g1').queryByText('Joined')).toBeNull();
  });

  it('does not refetch in a loop while the list is idle', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob' });
    const explore = renderExplore();
    await settled(explore, 'g1', '4 golfers · 3 spots left');
    const listCalls = () => calls.filter((c) => c.startsWith('GET /events?')).length;
    const before = listCalls();
    explore.rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ExploreScreen navigation={navigation as any} route={{ key: 'Explore', name: 'Explore' } as any} />
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(listCalls()).toBe(before);
  });

  it('drops a slow list response for the sport the user switched away from', async () => {
    addEvent({ id: 'g1', hostUserId: 'bob', sport: 'golf', title: 'Golf round' });
    addEvent({ id: 'r1', hostUserId: 'bob', sport: 'running', title: 'Run club', capacity: 8 });
    let release!: () => void;
    holds.push({ match: /sport=golf/, release: new Promise<void>((r) => (release = r)) });
    const explore = renderExplore();
    await waitFor(() => expect(calls.some((c) => c.includes('sport=golf'))).toBe(true));
    fireEvent.press(explore.getByLabelText('Run'));
    await waitFor(() => expect(explore.getByTestId('session-card-r1')).toBeTruthy());
    await act(async () => {
      release();
    });
    expect(explore.queryByTestId('session-card-g1')).toBeNull();
    expect(explore.getByTestId('session-card-r1')).toBeTruthy();
  });
});

describe('more than one page of public sessions', () => {
  beforeEach(() => {
    for (let i = 0; i < 23; i += 1) {
      addEvent({ id: `s${String(i).padStart(2, '0')}`, hostUserId: 'bob', startsAt: future(1 + i) });
    }
  });

  it('reaches sessions past the first 20 without duplicates', async () => {
    const explore = renderExplore();
    await waitFor(() => expect(explore.getByTestId('session-card-s19')).toBeTruthy());
    expect(explore.queryByTestId('session-card-s20')).toBeNull();
    // A new earlier session shifts the server's offsets between pages.
    addEvent({ id: 'a-early', hostUserId: 'carol', startsAt: future(0.5) });
    fireEvent.press(explore.getByText('Show more sessions'));
    await waitFor(() => expect(explore.getByTestId('session-card-s22')).toBeTruthy());
    expect(explore.getAllByTestId(/^session-card-s/)).toHaveLength(23);
    expect(explore.queryByText('Show more sessions')).toBeNull();
  });

  it('keeps loaded sessions and offers a retry when loading more fails', async () => {
    const explore = renderExplore();
    await waitFor(() => expect(explore.getByTestId('session-card-s19')).toBeTruthy());
    failures.push({ method: 'GET', match: /offset=20/, message: 'Network request failed' });
    fireEvent.press(explore.getByText('Show more sessions'));
    expect(await explore.findByText('Could not load more sessions.')).toBeTruthy();
    expect(explore.getByTestId('session-card-s19')).toBeTruthy();
    fireEvent.press(explore.getByText('Retry'));
    await waitFor(() => expect(explore.getByTestId('session-card-s22')).toBeTruthy());
    expect(explore.queryByText('Could not load more sessions.')).toBeNull();
  });
});
