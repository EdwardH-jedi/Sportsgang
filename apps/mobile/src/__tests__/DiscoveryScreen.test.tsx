/**
 * DiscoveryScreen tests
 *
 * Mocks:
 *  - useDiscovery hook (covers api.ts internally)
 *  - React Navigation (DiscoveryScreen does not use navigation props directly,
 *    but Screen component may pull from context)
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

import { DiscoveryScreen, partnerKey } from '../screens/discovery/DiscoveryScreen';
import type { PartnerCard, UseDiscoveryReturn } from '../hooks/useDiscovery';

// ─── Mock useDiscovery ────────────────────────────────────────────────────────

const mockRecordAction = jest.fn();
const mockFetchMore = jest.fn();
const mockSetSport = jest.fn();

const defaultDiscovery: UseDiscoveryReturn = {
  partners: [],
  isLoading: false,
  error: null,
  sport: 'gym',
  setSport: mockSetSport,
  recordAction: mockRecordAction,
  fetchMore: mockFetchMore,
};

jest.mock('../hooks/useDiscovery', () => ({
  useDiscovery: jest.fn(),
  // re-export the PartnerCard type as a value (not needed at runtime)
}));

// ─── Mock useRankSummary hook ────────────────────────────────────────────────
// The real hook does an api.get on mount; in PartnerPreviewModal it then
// fires setState after the test body completes (and sometimes after the
// preview has been closed), producing React act() warnings. The discovery
// tests don't assert anything about the rank badge — return a static empty
// summary so the modal renders without firing late state updates.

jest.mock('../hooks/useRankSummary', () => ({
  useRankSummary: () => ({
    summary: null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

// ─── Mock useUserHonorSummary (V1.1 Honor badge on partner cards) ────────────

let mockHonorSummary: { honorLevel: string; honorScore: number } | null = {
  honorLevel: 'Trusted',
  honorScore: 118,
};
let mockHonorLoading = false;
let mockHonorError: string | null = null;

jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: () => ({
    summary: mockHonorSummary,
    isLoading: mockHonorLoading,
    error: mockHonorError,
  }),
}));

// ─── Mock React Navigation hook ──────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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
    h2: {}, h3: {}, body: {}, bodySmall: {}, label: {}, button: {},
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { useDiscovery } = require('../hooks/useDiscovery');

function setupDiscovery(overrides: Partial<UseDiscoveryReturn> = {}) {
  useDiscovery.mockReturnValue({ ...defaultDiscovery, ...overrides });
}

const samplePartner: PartnerCard = {
  userId: 'user-1',
  displayName: 'Alex Smith',
  suburb: 'Surry Hills',
  bioExcerpt: 'Love morning lifts.',
  age: 28,
  sportProfiles: [{ sport: 'gym', level: 'intermediate' }],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DiscoveryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHonorSummary = { honorLevel: 'Trusted', honorScore: 118 };
    mockHonorLoading = false;
    mockHonorError = null;
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading indicator while isLoading is true', () => {
    setupDiscovery({ isLoading: true, partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Finding players...');
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows an error message and a retry button when error is set', () => {
    setupDiscovery({ error: 'Network error', partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Something went wrong');
    getByText('Network error');
    getByText('Try again');
  });

  it('calls fetchMore when the retry button is pressed in error state', () => {
    setupDiscovery({ error: 'Network error', partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    fireEvent.press(getByText('Try again'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  it('shows the empty-state message when partners is empty and not loading', () => {
    setupDiscovery({ partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('No players to show right now.');
    getByText('Check back soon — new players join every week.');
  });

  it('calls fetchMore when the Refresh button is pressed in empty state', () => {
    setupDiscovery({ partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    fireEvent.press(getByText('Refresh'));
    expect(mockFetchMore).toHaveBeenCalledTimes(1);
  });

  // ── Partner cards ──────────────────────────────────────────────────────────

  it('renders a partner card with display name and suburb', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Alex Smith, 28');
    getByText('Surry Hills');
    getByText('Gym · Intermediate');
    getByText('Love morning lifts.');
  });

  it('renders the partner card hero with initials and no <Image> (v1 photo-free)', () => {
    // v1 screenshot policy: the discovery card hero must NOT render any
    // user-supplied photo, even if the partner record carries an
    // avatarUrl. The hero is built purely from <View> + <Text>: a
    // sport-keyed colored band plus an initials chip.
    const partnerWithAvatar: PartnerCard = {
      ...samplePartner,
      // Even though the discovery card never reads avatarUrl in v1, the
      // type allows it. Pass one to confirm it's ignored.
      avatarUrl: 'https://example.com/face.jpg',
    };
    setupDiscovery({ partners: [partnerWithAvatar] });
    const { getByText, UNSAFE_queryAllByType } = render(<DiscoveryScreen />);
    // Initials are derived from the display name ("Alex Smith" → "AS").
    getByText('AS');
    // No <Image> anywhere in the rendered card — the only Images in the
    // tree would be from the partner-preview modal, which is not open.
    const { Image } = require('react-native');
    expect(UNSAFE_queryAllByType(Image).length).toBe(0);
  });

  it('renders action buttons for a partner card', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    getByLabelText('Like');
    getByLabelText('Pass');
    getByLabelText('Save');
  });

  // ── Sport context visibility (V1 QA fix) ───────────────────────────────────
  // Real-device QA: two testers liked each other but for different sports
  // (golf vs running). Backend correctly created no match because match
  // creation is sport-scoped. The mobile UI didn't make the sport-scoping
  // visible enough. These tests pin the three smallest copy/UI levers
  // that fix the confusion.
  describe('sport-specific match rule visibility', () => {
    it('renders the sport-specific match-rule helper line', () => {
      setupDiscovery({ partners: [] });
      const { getByText } = render(<DiscoveryScreen />);
      getByText(
        "Likes are sport-specific — you'll match when both players like each other for the same sport."
      );
    });

    it('renders a sport-aware header title for the current sport', () => {
      setupDiscovery({ sport: 'gym', partners: [] });
      const { getByText, rerender } = render(<DiscoveryScreen />);
      getByText('Gym partners');
      // Switch to golf — header tracks the current sport.
      setupDiscovery({ sport: 'golf', partners: [] });
      rerender(<DiscoveryScreen />);
      getByText('Golf partners');
    });

    it('renders a V1-safe "Connect" CTA on the partner card', () => {
      // Visible label is sport-agnostic ("Connect"). Sport context is
      // carried by the screen header + helper line, not by the button.
      setupDiscovery({ sport: 'gym', partners: [samplePartner] });
      const { getByText, queryByText, rerender } = render(<DiscoveryScreen />);
      getByText('Connect');
      // Old "Like for Gym" copy must not reappear under any sport.
      expect(queryByText(/^Like for/)).toBeNull();
      setupDiscovery({ sport: 'tennis', partners: [samplePartner] });
      rerender(<DiscoveryScreen />);
      getByText('Connect');
      expect(queryByText(/^Like for/)).toBeNull();
    });

    it('keeps the "Like" accessibilityLabel so screen readers and existing tests still resolve', () => {
      setupDiscovery({ sport: 'gym', partners: [samplePartner] });
      const { getByLabelText } = render(<DiscoveryScreen />);
      // Same Pressable, sport-agnostic accessibility hint.
      getByLabelText('Like');
    });
  });

  // ── Partner detail preview (V1 photos/bio visibility) ─────────────────────
  // Real-device QA: viewers couldn't see uploaded photos or full bios on
  // discovery cards. Backend now ships `photoUrls` and full `bio`; the card
  // surfaces a "View details" button that opens a modal showing the
  // gallery + bio with safe placeholders when fields are missing.
  describe('partner detail preview', () => {
    function withPartner(overrides: Partial<typeof samplePartner> = {}) {
      return { ...samplePartner, ...overrides };
    }

    it('exposes a View details affordance on each partner card', () => {
      setupDiscovery({ partners: [samplePartner] });
      const { getByLabelText } = render(<DiscoveryScreen />);
      getByLabelText('View details');
    });

    it('renders the partner gallery and full bio when provided', async () => {
      const partner = withPartner({
        bio: 'Looking for a steady gym partner three mornings a week.',
        photoUrls: ['https://api/media/u/00.jpg', 'https://api/media/u/01.jpg'],
      });
      setupDiscovery({ partners: [partner] });
      const utils = render(<DiscoveryScreen />);
      await act(async () => {
        fireEvent.press(utils.getByLabelText('View details'));
      });
      utils.getByText('Looking for a steady gym partner three mornings a week.');
      utils.getByLabelText('Alex Smith photo 1');
      utils.getByLabelText('Alex Smith photo 2');
    });

    it('falls back to a friendly placeholder when there are no photos and no bio', async () => {
      const partner = withPartner({ bio: undefined, photoUrls: [] });
      setupDiscovery({ partners: [partner] });
      const utils = render(<DiscoveryScreen />);
      await act(async () => {
        fireEvent.press(utils.getByLabelText('View details'));
      });
      utils.getByText('No photos yet');
      utils.getByText("This player hasn't added a bio yet.");
    });

    it('closes the preview when Close is pressed', async () => {
      const partner = withPartner({
        bio: 'Active morning crew.',
        photoUrls: ['https://api/media/u/00.jpg'],
      });
      setupDiscovery({ partners: [partner] });
      const utils = render(<DiscoveryScreen />);
      await act(async () => {
        fireEvent.press(utils.getByLabelText('View details'));
      });
      utils.getByText('Active morning crew.');
      await act(async () => {
        fireEvent.press(utils.getByLabelText('Close profile preview'));
      });
      // The Modal is still mounted but with `visible={false}` — content
      // should no longer be reachable via getByText.
      expect(utils.queryByText('Active morning crew.')).toBeNull();
    });
  });

  // ── Sport toggle ───────────────────────────────────────────────────────────

  it('renders gym and golf sport tabs', () => {
    setupDiscovery({ partners: [] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    getByLabelText('Gym');
    getByLabelText('Golf');
  });

  it('renders the sport tabs from the registry, running first', () => {
    setupDiscovery({ partners: [], sport: 'running' });
    const { getAllByRole, getByLabelText } = render(<DiscoveryScreen />);
    expect(getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual([
      'Running',
      'Gym',
      'Tennis',
      'Golf',
    ]);
    expect(getByLabelText('Running').props.accessibilityState).toEqual({ selected: true });
  });

  it('calls setSport with "golf" when the Golf tab is pressed', () => {
    setupDiscovery({ partners: [], sport: 'gym' });
    const { getByLabelText } = render(<DiscoveryScreen />);
    fireEvent.press(getByLabelText('Golf'));
    expect(mockSetSport).toHaveBeenCalledWith('golf');
  });

  it('calls setSport with "gym" when the Gym tab is pressed', () => {
    setupDiscovery({ partners: [], sport: 'golf' });
    const { getByLabelText } = render(<DiscoveryScreen />);
    fireEvent.press(getByLabelText('Gym'));
    expect(mockSetSport).toHaveBeenCalledWith('gym');
  });

  // ── Like action ────────────────────────────────────────────────────────────

  it('calls recordAction with like when Like is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'like');
  });

  it('calls recordAction with pass when Pass is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Pass'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'pass');
  });

  it('calls recordAction with save when Save is pressed', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    await act(async () => {
      fireEvent.press(getByLabelText('Save'));
    });
    expect(mockRecordAction).toHaveBeenCalledWith('user-1', 'save');
  });

  // ── Match banner ───────────────────────────────────────────────────────────

  it('shows the match banner after a like that results in a match', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: true, matchId: 'match-1' });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText, queryByText } = render(<DiscoveryScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });

    await waitFor(() => {
      expect(queryByText('Linked up.')).not.toBeNull();
    });
  });

  it('does not show the match banner when matchCreated is false', async () => {
    mockRecordAction.mockResolvedValue({ matchCreated: false });
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText, queryByText } = render(<DiscoveryScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Like'));
    });

    expect(queryByText('Linked up.')).toBeNull();
  });

  // ── Action error resilience ────────────────────────────────────────────────

  it('does not throw when recordAction rejects', async () => {
    mockRecordAction.mockRejectedValue(new Error('Server error'));
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);

    await expect(
      act(async () => {
        fireEvent.press(getByLabelText('Like'));
      })
    ).resolves.not.toThrow();
  });

  // ── FlatList key uniqueness regression ────────────────────────────────────
  // Real-device QA fired "Encountered two children with the same key:
  // .$<UUID>" during discovery. The previous keyExtractor used `item.userId`
  // alone, so any duplicate userId in a single fetch (server bug ceiling)
  // collided. The fixed key is `${userId}-${sport}-${index}` — userId for
  // stability, sport to future-proof a cross-sport feed, index as the
  // tiebreaker that makes collisions structurally impossible. Tests target
  // the exported helper directly so we don't depend on the RN test
  // renderer's flaky console.error reporting.
  describe('partnerKey', () => {
    function p(userId: string): PartnerCard {
      return { userId, displayName: 'x', sportProfiles: [] };
    }

    it('produces unique keys when the same userId appears twice in one sport-fetch', () => {
      // The bug as observed on-device: server returns the same partner
      // twice. Without the index tiebreaker the FlatList collides.
      expect(partnerKey(p('user-1'), 0, 'gym')).not.toBe(
        partnerKey(p('user-1'), 1, 'gym')
      );
    });

    it('produces different keys for the same userId across different sports', () => {
      // Future-proof for a cross-sport feed.
      expect(partnerKey(p('user-1'), 0, 'gym')).not.toBe(
        partnerKey(p('user-1'), 0, 'golf')
      );
    });

    it('produces different keys for different userIds', () => {
      expect(partnerKey(p('user-1'), 0, 'gym')).not.toBe(
        partnerKey(p('user-2'), 0, 'gym')
      );
    });

    it('keeps userId as the leading segment so the key starts with a stable identity', () => {
      expect(partnerKey(p('user-1'), 0, 'gym')).toMatch(/^user-1-/);
    });
  });

  // ── Header ─────────────────────────────────────────────────────────────────

  it('renders a sport-aware discovery header and the Sydney eyebrow', () => {
    setupDiscovery({ sport: 'gym', partners: [] });
    const { getByText } = render(<DiscoveryScreen />);
    // Header title tracks the current sport so the user always sees which
    // feed they're in. The previous static "Discover" copy was the proximate
    // cause of the QA confusion (likes for different sports → no match).
    getByText('Gym partners');
    getByText('Sydney');
  });

  // ── V1.1 Honor surface ─────────────────────────────────────────────────────

  it('renders the Honor badge on the partner card when summary exists', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('Trusted');
  });

  it('renders a "New player" fallback when Honor summary is null', () => {
    mockHonorSummary = null;
    setupDiscovery({ partners: [samplePartner] });
    const { getByText } = render(<DiscoveryScreen />);
    getByText('New player');
  });

  it('hides the Honor badge on hard error and keeps the card rendered', () => {
    mockHonorSummary = null;
    mockHonorError = 'Network down';
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText, queryByText } = render(<DiscoveryScreen />);
    // Card is still here (CardHero exposes `${displayName} card` as
    // the accessibility label).
    getByLabelText(`${samplePartner.displayName} card`);
    // Neither the level nor the fallback should render on hard error.
    expect(queryByText('Trusted')).toBeNull();
    expect(queryByText('New player')).toBeNull();
  });

  it('exposes a "View profile" action that navigates to PublicProfile', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { getByLabelText } = render(<DiscoveryScreen />);
    fireEvent.press(getByLabelText('View profile'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'PublicProfile',
      expect.objectContaining({
        userId: samplePartner.userId,
        displayName: samplePartner.displayName,
      })
    );
  });

  it('Honor copy does not include popularity / leaderboard / verified / AI moderation', () => {
    setupDiscovery({ partners: [samplePartner] });
    const { queryByText } = render(<DiscoveryScreen />);
    expect(queryByText(/popular/i)).toBeNull();
    expect(queryByText(/popularity/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/verified/i)).toBeNull();
    expect(queryByText(/AI moderation/i)).toBeNull();
  });
});
