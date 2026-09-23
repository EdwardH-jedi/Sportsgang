/**
 * BattleDetailScreen tests
 *
 * Covers: detail render, Join/Leave/Full CTA states, host display,
 * no-show warning copy, and error / loading states.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BattleDetailScreen } from '../screens/battles/BattleDetailScreen';
import type { EventDetail } from '@protin/shared-types';

let mockState: {
  detail: EventDetail | null;
  isLoading: boolean;
  error: string | null;
};
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockRefresh = jest.fn();
const mockSelfReport = jest.fn();

jest.mock('../hooks/useEvents', () => ({
  useEventDetail: () => ({
    ...mockState,
    join: mockJoin,
    leave: mockLeave,
    refresh: mockRefresh,
  }),
}));

const mockCancelEvent = jest.fn();
const mockCompleteEvent = jest.fn();

jest.mock('../lib/events', () => {
  const actual = jest.requireActual('../lib/events');
  return {
    ...actual,
    selfReportAttendance: (...args: unknown[]) => mockSelfReport(...args),
    cancelEvent: (...args: unknown[]) => mockCancelEvent(...args),
    completeEvent: (...args: unknown[]) => mockCompleteEvent(...args),
  };
});

let mockHostHonor: { honorLevel: string; honorScore: number } | null = {
  honorLevel: 'Captain',
  honorScore: 170,
};
let mockHostHonorLoading = false;
let mockHostHonorError: string | null = null;

jest.mock('../hooks/useUserHonorSummary', () => ({
  useUserHonorSummary: () => ({
    summary: mockHostHonor,
    isLoading: mockHostHonorLoading,
    error: mockHostHonorError,
  }),
}));

let mockCurrentUserId: string | null = 'viewer-1';
jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockCurrentUserId ? { id: mockCurrentUserId } : null }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const R = require('react');
    R.useEffect(() => {
      cb();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MapView = ({ children }: { children: React.ReactNode }) => <View testID="mini-map">{children}</View>;
  const Marker = () => null;
  return { __esModule: true, default: MapView, Marker, PROVIDER_DEFAULT: 'default' };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };
}

function makeDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 'e1',
    hostUserId: 'host-1',
    host: { id: 'host-1', displayName: 'Sam' },
    title: 'Bondi Hoops',
    sport: 'basketball',
    mode: 'casual',
    // Past startsAt so attendance is open by default; lifecycle tests
    // override with a future timestamp where the gate matters.
    startsAt: '2020-06-01T18:00:00Z',
    locationText: 'Bondi Court',
    capacity: 10,
    participantCount: 4,
    spotsLeft: 6,
    visibility: 'public',
    status: 'open',
    hasJoined: false,
    description: 'Friendly run, bring water',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    participants: [],
    ...overrides,
  };
}

function renderScreen(detail: EventDetail | null) {
  mockState = { detail, isLoading: detail === null, error: null };
  const navigation = makeNavigation();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <BattleDetailScreen
        navigation={navigation as any}
        route={{ params: { eventId: 'e1' }, key: 'k', name: 'BattleDetail' } as any}
      />
    </SafeAreaProvider>
  );
  return { ...utils, navigation };
}

describe('BattleDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'viewer-1';
    mockHostHonor = { honorLevel: 'Captain', honorScore: 170 };
    mockHostHonorLoading = false;
    mockHostHonorError = null;
  });

  it('renders title, location, host, and the no-show warning copy', () => {
    const { getByText } = renderScreen(makeDetail());
    getByText('Bondi Hoops');
    getByText('Bondi Court');
    getByText('Sam');
    getByText('Only join if you can attend. No-shows affect your Honor.');
  });

  it('renders the players count and capacity', () => {
    const { getByText } = renderScreen(makeDetail());
    getByText('4/10 in · 6 spots left');
  });

  it('shows Join CTA when hasJoined is false and status is open', () => {
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: false }));
    getByLabelText('Join this game');
  });

  it('shows Joined · Leave CTA when hasJoined is true', () => {
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: true }));
    getByLabelText('Leave this game');
  });

  it('shows Full CTA when status is full', () => {
    const { getByText } = renderScreen(
      makeDetail({ status: 'full', spotsLeft: 0 })
    );
    getByText('Full');
  });

  it('shows Cancelled CTA when status is cancelled', () => {
    const { getByText } = renderScreen(makeDetail({ status: 'cancelled' }));
    getByText('Cancelled');
  });

  it('calls join() when Join CTA is pressed', async () => {
    mockJoin.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: false }));
    await act(async () => {
      fireEvent.press(getByLabelText('Join this game'));
    });
    expect(mockJoin).toHaveBeenCalled();
  });

  it('calls leave() when Leave CTA is pressed', async () => {
    mockLeave.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: true }));
    await act(async () => {
      fireEvent.press(getByLabelText('Leave this game'));
    });
    expect(mockLeave).toHaveBeenCalled();
  });

  it('renders the description when present', () => {
    const { getByText } = renderScreen(makeDetail({ description: 'Bring shoes' }));
    getByText('Bring shoes');
  });

  it('does not render the Share / Report game placeholder buttons', () => {
    // App Review risk: the previous Share / Report game buttons were
    // wired to placeholder Alerts ("Sharing is coming in a later
    // release." / "Event reporting is coming in the next release.")
    // — non-functional UI Apple flags as misleading. Both have been
    // removed from the detail screen. This test locks that in so a
    // regression that re-adds either button (or the placeholder copy)
    // fails CI before reaching review. Real chat-side Report / Block
    // safety surfaces (PublicProfileScreen, SafetyCenterScreen,
    // BlockedUsersScreen) are unaffected and covered by their own
    // suites.
    const { queryByLabelText, queryByText } = renderScreen(makeDetail());
    expect(queryByLabelText('Share this game')).toBeNull();
    expect(queryByLabelText('Report this game')).toBeNull();
    expect(queryByText('Sharing is coming in a later release.')).toBeNull();
    expect(queryByText('Event reporting is coming in the next release.')).toBeNull();
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const { getByLabelText, navigation } = renderScreen(makeDetail());
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  // ── Attendance ───────────────────────────────────────────────────────────

  it('shows the host Confirm attendance CTA when current user is host', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText } = renderScreen(makeDetail({ hasJoined: true }));
    getByLabelText('Confirm attendance');
  });

  it('navigates to AttendanceCheck when host taps Confirm attendance', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText, navigation } = renderScreen(
      makeDetail({ hasJoined: true })
    );
    fireEvent.press(getByLabelText('Confirm attendance'));
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceCheck', {
      eventId: 'e1',
    });
  });

  it('shows participant self-attendance CTAs when joined and not host', () => {
    mockCurrentUserId = 'viewer-1';
    const { getByLabelText, getByText } = renderScreen(
      makeDetail({ hasJoined: true })
    );
    getByText('Did you attend this game?');
    getByText('Attendance helps keep Honor fair.');
    getByLabelText('Yes, I attended');
    getByLabelText('I could not attend');
  });

  it('does not show attendance CTAs for non-participants', () => {
    mockCurrentUserId = 'viewer-1';
    const { queryByLabelText, queryByText } = renderScreen(
      makeDetail({ hasJoined: false })
    );
    expect(queryByText('Did you attend this game?')).toBeNull();
    expect(queryByLabelText('Confirm attendance')).toBeNull();
  });

  it('does not show participant self-attendance section to the host', () => {
    mockCurrentUserId = 'host-1';
    const { queryByText } = renderScreen(makeDetail({ hasJoined: true }));
    expect(queryByText('Did you attend this game?')).toBeNull();
  });

  it('calls selfReportAttendance and shows saved state on tap', async () => {
    mockCurrentUserId = 'viewer-1';
    mockSelfReport.mockResolvedValueOnce({
      eventId: 'e1',
      participantUserId: 'viewer-1',
      displayName: 'Me',
      participantStatus: 'joined',
      attendanceStatus: 'attended',
      joinedAt: '2026-01-01T00:00:00Z',
      leftAt: null,
      attendanceConfirmedByHostAt: null,
      attendanceSelfReportedAt: '2026-01-01T00:01:00Z',
      attendanceNote: null,
    });
    const { getByLabelText, findByText } = renderScreen(
      makeDetail({ hasJoined: true })
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Yes, I attended'));
    });
    expect(mockSelfReport).toHaveBeenCalledWith('e1', {
      attendanceStatus: 'attended',
    });
    await findByText(/Attendance saved/);
  });

  it('renders an error message when self-report fails', async () => {
    mockCurrentUserId = 'viewer-1';
    mockSelfReport.mockRejectedValueOnce(new Error('Network down'));
    const { getByLabelText, findByText } = renderScreen(
      makeDetail({ hasJoined: true })
    );
    await act(async () => {
      fireEvent.press(getByLabelText('Yes, I attended'));
    });
    await findByText('Network down');
  });

  // ── Honor badge in host section ────────────────────────────────────────

  it('renders the host Honor badge in the host section', () => {
    const { getByText } = renderScreen(makeDetail());
    getByText('Captain');
    // ASCII hyphen separator (not the middle-dot that mojibakes).
    getByText('- 170');
  });

  it('falls back to "New player" when host honor summary is null', () => {
    mockHostHonor = null;
    const { getByText } = renderScreen(makeDetail());
    getByText('New player');
  });

  it('hides the host Honor badge on hard error (no "New player" leak)', () => {
    mockHostHonor = null;
    mockHostHonorError = 'Network down';
    const { queryByText, getByText } = renderScreen(
      makeDetail({ title: 'Visible Detail' })
    );
    // Screen still renders.
    getByText('Visible Detail');
    // Badge is hidden — neither the level nor the fallback should appear.
    expect(queryByText('New player')).toBeNull();
    expect(queryByText('Captain')).toBeNull();
  });

  // ── Event lifecycle ───────────────────────────────────────────────────

  function stubConfirmingAlert(action: string) {
    return jest
      .spyOn(require('react-native').Alert, 'alert')
      .mockImplementation((...args: unknown[]) => {
        const buttons = args[2];
        if (!Array.isArray(buttons)) return;
        const btn = (
          buttons as { text: string; onPress?: () => void }[]
        ).find((b) => b.text === action);
        btn?.onPress?.();
      });
  }

  it('host sees Cancel and Complete CTAs on a started open event', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText } = renderScreen(makeDetail());
    getByLabelText('Cancel game');
    getByLabelText('Complete game');
  });

  it('Complete CTA is disabled before starts_at', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText } = renderScreen(
      makeDetail({ startsAt: '2099-01-01T00:00:00Z' })
    );
    const btn = getByLabelText('Complete game');
    expect(
      btn.props.accessibilityState?.disabled ?? btn.props.disabled
    ).toBeTruthy();
  });

  it('host attendance section is hidden before starts_at', () => {
    mockCurrentUserId = 'host-1';
    const { queryByLabelText, getByText } = renderScreen(
      makeDetail({ startsAt: '2099-01-01T00:00:00Z' })
    );
    expect(queryByLabelText('Confirm attendance')).toBeNull();
    getByText('Attendance opens after the game starts.');
  });

  it('participant self-attendance is hidden before starts_at', () => {
    mockCurrentUserId = 'viewer-1';
    const { queryByText, queryByLabelText } = renderScreen(
      makeDetail({ hasJoined: true, startsAt: '2099-01-01T00:00:00Z' })
    );
    expect(queryByText('Did you attend this game?')).toBeNull();
    expect(queryByLabelText('Yes, I attended')).toBeNull();
  });

  it('participant self-attendance is visible after starts_at', () => {
    mockCurrentUserId = 'viewer-1';
    const { getByLabelText } = renderScreen(
      makeDetail({ hasJoined: true })
    );
    getByLabelText('Yes, I attended');
  });

  it('cancelled event hides Join, host controls, and self-attendance', () => {
    mockCurrentUserId = 'viewer-1';
    const { queryByLabelText, queryByText } = renderScreen(
      makeDetail({ status: 'cancelled', hasJoined: true })
    );
    expect(queryByLabelText('Join this game')).toBeNull();
    expect(queryByLabelText('Leave this game')).toBeNull();
    expect(queryByLabelText('Yes, I attended')).toBeNull();
    expect(queryByText('Did you attend this game?')).toBeNull();
  });

  it('completed event allows host attendance correction and participant self-report', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText } = renderScreen(
      makeDetail({ status: 'completed' })
    );
    getByLabelText('Confirm attendance');

    mockCurrentUserId = 'viewer-1';
    const second = renderScreen(
      makeDetail({ status: 'completed', hasJoined: true })
    );
    second.getByLabelText('Yes, I attended');
  });

  it('Cancel game CTA prompts and calls cancelEvent on confirm', async () => {
    mockCurrentUserId = 'host-1';
    mockCancelEvent.mockResolvedValueOnce(undefined);
    const alertSpy = stubConfirmingAlert('Cancel game');
    const { getByLabelText } = renderScreen(makeDetail());
    await act(async () => {
      fireEvent.press(getByLabelText('Cancel game'));
    });
    expect(mockCancelEvent).toHaveBeenCalledWith('e1');
    alertSpy.mockRestore();
  });

  it('Complete game CTA prompts and calls completeEvent on confirm', async () => {
    mockCurrentUserId = 'host-1';
    mockCompleteEvent.mockResolvedValueOnce(undefined);
    const alertSpy = stubConfirmingAlert('Complete game');
    const { getByLabelText } = renderScreen(makeDetail());
    await act(async () => {
      fireEvent.press(getByLabelText('Complete game'));
    });
    expect(mockCompleteEvent).toHaveBeenCalledWith('e1');
    alertSpy.mockRestore();
  });

  it('copy never claims instant Honor / AI moderation / leaderboard', () => {
    mockCurrentUserId = 'host-1';
    const { queryByText } = renderScreen(makeDetail());
    expect(queryByText(/AI moderation/i)).toBeNull();
    expect(queryByText(/leaderboard/i)).toBeNull();
    expect(queryByText(/instant honor/i)).toBeNull();
  });

  // ── Group-run layout ───────────────────────────────────────────────────

  function runDetail(overrides: Partial<EventDetail> = {}) {
    return makeDetail({
      sport: 'running',
      title: 'Harbour 10k',
      locationText: 'Opera House steps',
      distanceKm: 10,
      paceMinSecPerKm: 300,
      paceMaxSecPerKm: 330,
      meetingLat: -33.8568,
      meetingLng: 151.2153,
      crewId: 'c1',
      crewName: 'Harbour Crew',
      participants: [
        { userId: 'u1', displayName: 'Ana Lee', joinedAt: '2026-01-01T00:00:00Z' },
        { userId: 'u2', displayName: 'Ben Ng', joinedAt: '2026-01-01T00:00:00Z' },
      ],
      participantCount: 2,
      ...overrides,
    });
  }

  it('shows run stats, the meeting-point map and runners', () => {
    const { getByLabelText, getByText, getByTestId } = renderScreen(runDetail());
    getByText('Group run');
    getByLabelText('10 km, Distance');
    getByLabelText('Pace 5:00–5:30 /km');
    getByLabelText('Meeting point map, Opera House steps');
    getByTestId('mini-map');
    getByText('Runners');
    getByLabelText('Ana Lee');
  });

  it('links to the crew', () => {
    const { getByLabelText, navigation } = renderScreen(runDetail());
    fireEvent.press(getByLabelText('Open crew Harbour Crew'));
    expect(navigation.navigate).toHaveBeenCalledWith('CrewDetail', { crewId: 'c1' });
  });

  it('uses run wording for join / leave and host controls', () => {
    const joined = renderScreen(runDetail({ hasJoined: false }));
    joined.getByLabelText('Join this run');
    mockCurrentUserId = 'host-1';
    const host = renderScreen(runDetail());
    host.getByLabelText('Cancel run');
    host.getByLabelText('Complete run');
  });

  it('lets the host edit an open event', () => {
    mockCurrentUserId = 'host-1';
    const { getByLabelText, navigation } = renderScreen(runDetail());
    fireEvent.press(getByLabelText('Edit run'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateBattle', { eventId: 'e1' });
  });

  it('hides edit for non-hosts and closed events', () => {
    const viewer = renderScreen(runDetail());
    expect(viewer.queryByLabelText('Edit run')).toBeNull();
    mockCurrentUserId = 'host-1';
    const closed = renderScreen(runDetail({ status: 'completed' }));
    expect(closed.queryByLabelText('Edit run')).toBeNull();
  });

  it('shows the error state with retry', () => {
    mockState = { detail: null, isLoading: false, error: 'Network down' };
    const { getByText, getByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <BattleDetailScreen
          navigation={makeNavigation() as any}
          route={{ params: { eventId: 'e1' }, key: 'k', name: 'BattleDetail' } as any}
        />
      </SafeAreaProvider>
    );
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading battle'));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
