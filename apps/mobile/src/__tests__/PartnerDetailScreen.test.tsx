/**
 * PartnerDetailScreen — reads the card the Explore feed loaded, shows the
 * sport details + every reason/caveat, and "Show interest" uses the
 * existing like (mutual → existing chat), never an invitation inbox.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { PartnerDetailScreen } from '../screens/explore/PartnerDetailScreen';
import { useExploreStore } from '../stores/explore';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://api.test',
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('../components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

const golfer = {
  userId: 'g1',
  displayName: 'Morgan',
  suburb: 'Bondi',
  bio: 'Weekend golfer, happy to help newer players.',
  photoUrls: [],
  sportProfiles: [
    {
      sport: 'golf',
      level: 'advanced',
      preferencesConfigured: true,
      preferredTimes: ['morning', 'afternoon'],
      golfHandicapTenths: -21,
      golfHandicapSource: 'official_index',
      golfExperience: 'regular',
      golfPartnerIntents: ['welcome_beginners'],
      golfPreferredHoles: '18',
      runPaceMode: null,
      runPaceMinSecPerKm: null,
      runPaceMaxSecPerKm: null,
      runDistancesKm: null,
      runGroupStyle: null,
    },
  ],
  compatibility: {
    tier: 'compatible',
    reasons: [
      { code: 'more_experienced', text: 'More experienced than you (plays regularly vs driving-range experience)' },
      { code: 'welcomes_beginners', text: 'Welcomes beginners' },
    ],
    caveats: [{ code: 'handicap_self_reported', text: 'Handicaps are self-reported, not verified' }],
  },
};

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn((_event: string, _listener: () => void) => jest.fn()),
};

async function loadGolfFeed() {
  useExploreStore.getState().reset();
  useExploreStore.getState().setFocusSport('golf');
  mockGet.mockResolvedValueOnce({ items: [golfer], total: 1, limit: 20, offset: 0, nextCursor: null });
  await useExploreStore.getState().loadFeed();
}

function renderDetail(userId = 'g1', sport: 'golf' | 'running' = 'golf') {
  return render(
    <PartnerDetailScreen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigation={navigation as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      route={{ key: 'PartnerDetail', name: 'PartnerDetail', params: { userId, sport } } as any}
    />
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await loadGolfFeed();
});

it('shows golf details, reasons and the self-reported caveat', () => {
  const utils = renderDetail();
  utils.getByText('Morgan');
  utils.getByText('Fits both ways');
  utils.getByText('+2.1 (self-reported)');
  utils.getByText('Play regularly');
  utils.getByText('Happy to play with beginners');
  utils.getByText('Mornings, Afternoons');
  utils.getByText('✓ Welcomes beginners');
  utils.getByText('Handicaps are self-reported, not verified');
  utils.getByText('Weekend golfer, happy to help newer players.');
});

it('a one-sided interest goes back to Explore and removes the card', async () => {
  mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: false });
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Show interest'));
  });
  expect(mockPost).toHaveBeenCalledWith('/discovery/actions', { targetUserId: 'g1', action: 'like', sport: 'golf' });
  expect(navigation.goBack).toHaveBeenCalled();
  expect(useExploreStore.getState().feed.items).toHaveLength(0);
});

it('mutual interest replaces the detail with the existing chat', async () => {
  mockPost.mockResolvedValueOnce({ action: 'like', matchCreated: true, matchId: 'm9' });
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Show interest'));
  });
  expect(navigation.replace).toHaveBeenCalledWith('Chat', {
    matchId: 'm9',
    partnerName: 'Morgan',
    partnerId: 'g1',
    sport: 'golf',
  });
});

it('keeps the user on the screen with a message when the action fails', async () => {
  mockPost.mockRejectedValueOnce(new Error('Request timed out. Check your network connection.'));
  const utils = renderDetail();
  await act(async () => {
    fireEvent.press(utils.getByLabelText('Pass'));
  });
  await waitFor(() => utils.getByText('Request timed out. Check your network connection.'));
  expect(navigation.goBack).not.toHaveBeenCalled();
});

it('report stays reachable', () => {
  const utils = renderDetail();
  fireEvent.press(utils.getByLabelText('Report'));
  expect(navigation.navigate).toHaveBeenCalledWith('Report', { reportedUserId: 'g1', reportedName: 'Morgan' });
});

// The button used to read "Report or block" but only opened the report form.
describe('block', () => {
  const confirmBlock = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

  afterEach(() => jest.restoreAllMocks());

  it('blocks after confirmation, drops the card from the feed and goes back', async () => {
    confirmBlock();
    mockPost.mockResolvedValueOnce({ id: 'b1', blockedUserId: 'g1' });
    const utils = renderDetail();
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    expect(Alert.alert).toHaveBeenCalledWith('Block Morgan?', expect.any(String), expect.any(Array));
    expect(mockPost).toHaveBeenCalledWith('/blocks/g1');
    expect(useExploreStore.getState().feed.items.map((c) => c.userId)).not.toContain('g1');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('keeps the card and explains when blocking fails', async () => {
    confirmBlock();
    mockPost.mockRejectedValueOnce(new Error('Network request failed'));
    const utils = renderDetail();
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    await waitFor(() => utils.getByText('Network request failed'));
    expect(useExploreStore.getState().feed.items.map((c) => c.userId)).toContain('g1');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

it('a card that is not in the current sport feed shows an honest fallback', () => {
  const utils = renderDetail('g1', 'running');
  utils.getByText('This profile is no longer in your feed');
  fireEvent.press(utils.getByLabelText('Back to Explore'));
  expect(navigation.goBack).toHaveBeenCalled();
});

// ─── Block is a store-owned, serialized mutation (review R4) ────────────────

describe('block races (review R4)', () => {
  const confirmWith = (style: 'destructive' | 'cancel') =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((button) => button.style === style)?.onPress?.();
    });
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((a, b) => {
      resolve = a;
      reject = b;
    });
    return { promise, resolve, reject };
  }
  const feedIds = () => useExploreStore.getState().feed.items.map((c) => c.userId);

  beforeEach(() => {
    navigation.isFocused.mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a feed response requested before the block never brings the card back', async () => {
    const utils = renderDetail();
    const held = deferred<unknown>();
    mockGet.mockReturnValueOnce(held.promise).mockResolvedValueOnce({ items: [], total: 0, limit: 20, nextCursor: null });
    let reload!: Promise<void>;
    act(() => {
      reload = useExploreStore.getState().loadFeed({ force: true });
    });
    confirmWith('destructive');
    mockPost.mockResolvedValueOnce({ id: 'block1', blockedId: 'g1' });
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    await act(async () => {
      held.resolve({ items: [golfer], total: 1, limit: 20, nextCursor: null });
      await reload;
    });
    expect(feedIds()).not.toContain('g1');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('Show interest does nothing while a confirmed block is in flight', async () => {
    const utils = renderDetail();
    confirmWith('destructive');
    const blocking = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocking.promise);
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Show interest'));
      fireEvent.press(utils.getByLabelText('Pass'));
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/blocks/g1']);
    expect(navigation.replace).not.toHaveBeenCalled();
    await act(async () => blocking.resolve({ id: 'block1' }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('Block does nothing while Show interest is in flight', async () => {
    const utils = renderDetail();
    const alert = confirmWith('destructive');
    const liking = deferred<unknown>();
    mockPost.mockReturnValueOnce(liking.promise);
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Show interest'));
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    expect(alert).not.toHaveBeenCalled();
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/discovery/actions']);
    await act(async () => liking.resolve({ action: 'like', matchCreated: true, matchId: 'm9' }));
    expect(navigation.replace).toHaveBeenCalledWith('Chat', expect.objectContaining({ matchId: 'm9' }));
  });

  it('Cancel in the block confirmation sends nothing and keeps the card', async () => {
    const utils = renderDetail();
    confirmWith('cancel');
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(feedIds()).toEqual(['g1']);
  });

  it('a block that finishes after leaving the screen does not navigate', async () => {
    confirmWith('destructive');
    const blocking = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocking.promise);
    const utils = renderDetail();
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    utils.unmount();
    await act(async () => blocking.resolve({ id: 'block1' }));
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(feedIds()).not.toContain('g1');
  });

  it('a block that finishes while another screen is on top does not navigate', async () => {
    confirmWith('destructive');
    const blocking = deferred<unknown>();
    mockPost.mockReturnValueOnce(blocking.promise);
    const utils = renderDetail();
    await act(async () => {
      fireEvent.press(utils.getByTestId('partner-block'));
    });
    navigation.isFocused.mockReturnValue(false);
    await act(async () => blocking.resolve({ id: 'block1' }));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('a like that finishes after the account changed does not open a chat', async () => {
    await useExploreStore.getState().hydrateFocus('viewer-1', 'golf');
    mockGet.mockResolvedValueOnce({ items: [golfer], total: 1, limit: 20, offset: 0, nextCursor: null });
    await useExploreStore.getState().loadFeed();
    const liking = deferred<unknown>();
    mockPost.mockReturnValueOnce(liking.promise);
    const utils = renderDetail();
    await act(async () => {
      fireEvent.press(utils.getByLabelText('Show interest'));
    });
    act(() => useExploreStore.getState().reset());
    await act(async () => liking.resolve({ action: 'like', matchCreated: true, matchId: 'm9' }));
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

// ─── Block confirmation expiry (review Q06) ─────────────────────────────────
// Reviewer probes (codex-overnight-partner) kept as permanent regressions.
// The account-replacement cases drive a retained screen directly; normal
// logout resets the navigation stack and unmounts this screen instead.

describe('block confirmation expiry (review Q06)', () => {
  const blockButton = () => (Alert.alert as jest.Mock).mock.calls[0][2].find((b: { text: string }) => b.text === 'Block');
  const golfFeed = { items: [golfer], total: 1, limit: 20, offset: 0, nextCursor: null };
  function detail(userId = 'g1') {
    return (
      <PartnerDetailScreen
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigation={navigation as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        route={{ key: 'PartnerDetail', name: 'PartnerDetail', params: { userId, sport: 'golf' } } as any}
      />
    );
  }
  async function loadFor(owner: string) {
    await useExploreStore.getState().hydrateFocus(owner);
    useExploreStore.getState().setFocusSport('golf');
    mockGet.mockResolvedValueOnce(golfFeed);
    await useExploreStore.getState().loadFeed();
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGet.mockReset();
    mockPost.mockReset();
    navigation.isFocused.mockReturnValue(true);
    navigation.addListener.mockImplementation(() => jest.fn());
    await loadGolfFeed();
  });
  afterEach(() => jest.restoreAllMocks());

  it('a block dialog opened for owner A cannot execute for owner B', async () => {
    await loadFor('a');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    await act(async () => useExploreStore.getState().hydrateFocus('b'));
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('a block dialog opened for owner A cannot execute after A -> B -> A', async () => {
    await loadFor('a');
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    await act(async () => useExploreStore.getState().hydrateFocus('b'));
    await act(async () => loadFor('a'));
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
    expect(useExploreStore.getState().actingOn).toBeNull();
  });

  it('Show interest on a card loaded for an earlier owner epoch sends nothing', async () => {
    await loadFor('a');
    const u = renderDetail();
    await act(async () => useExploreStore.getState().hydrateFocus('b'));
    await act(async () => loadFor('a'));
    mockPost.mockResolvedValue({ action: 'like', matchCreated: true, matchId: 'm9' });
    await act(async () => {
      fireEvent.press(u.getByLabelText('Show interest'));
    });
    expect(mockPost).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('a block dialog sends nothing after the screen unmounts', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    u.unmount();
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('a block dialog stays expired once the screen lost focus, even after focus returns', async () => {
    const listeners: Record<string, () => void> = {};
    navigation.addListener.mockImplementation((event: string, listener: () => void) => {
      listeners[event] = listener;
      return jest.fn();
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    act(() => listeners.blur());
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
    expect(u.getByText('Morgan')).toBeTruthy();
  });

  it('a block dialog sends nothing while another screen is on top', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    navigation.isFocused.mockReturnValue(false);
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('a block dialog sends nothing after the route moves to another person', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = render(detail('g1'));
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    u.rerender(detail('g2'));
    mockPost.mockResolvedValue({});
    await act(async () => button.onPress());
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('one confirmation sends one block however often it fires', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    const button = blockButton();
    mockPost.mockResolvedValue({ id: 'b1' });
    await act(async () => {
      button.onPress();
      button.onPress();
    });
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/blocks/g1']);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('a failed block can be retried from a new confirmation', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((b) => b.text === 'Block')?.onPress?.();
    });
    mockPost.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValueOnce({ id: 'b1' });
    const u = renderDetail();
    await act(async () => {
      fireEvent.press(u.getByTestId('partner-block'));
    });
    await waitFor(() => u.getByText('Network request failed'));
    expect(navigation.goBack).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(u.getByTestId('partner-block'));
    });
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual(['/blocks/g1', '/blocks/g1']);
    expect(useExploreStore.getState().feed.items.map((c) => c.userId)).not.toContain('g1');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('CONTROL a block completed after focus loss does not navigate', async () => {
    let resolve!: (v: unknown) => void;
    mockPost.mockReturnValueOnce(
      new Promise((a) => {
        resolve = a;
      })
    );
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
      buttons?.find((b) => b.text === 'Block')?.onPress?.();
    });
    const u = renderDetail();
    fireEvent.press(u.getByText('Block'));
    navigation.isFocused.mockReturnValue(false);
    await act(async () => resolve({}));
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
