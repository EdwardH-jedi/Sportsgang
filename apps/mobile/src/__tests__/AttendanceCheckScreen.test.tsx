/**
 * AttendanceCheckScreen tests
 *
 * Covers: header copy, warning copy, participant row render, host pick
 * triggers updateAsHost with the right payload, "Not sure" is a no-op,
 * error state renders, empty state renders.
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AttendanceCheckScreen } from '../screens/battles/AttendanceCheckScreen';
import type { AttendanceEntry, EventDetail } from '@protin/shared-types';

let mockAttendanceState: {
  data: { eventId: string; hostUserId: string; items: AttendanceEntry[] } | null;
  isLoading: boolean;
  error: string | null;
};
const mockUpdateAsHost = jest.fn();
const mockSelfReport = jest.fn();
const mockAttendanceRefresh = jest.fn();
const mockDetail: { detail: EventDetail | null } = { detail: null };

jest.mock('../hooks/useEvents', () => ({
  useEventAttendance: () => ({
    ...mockAttendanceState,
    refresh: mockAttendanceRefresh,
    updateAsHost: mockUpdateAsHost,
    selfReport: mockSelfReport,
  }),
  useEventDetail: () => ({
    detail: mockDetail.detail,
    isLoading: false,
    error: null,
    join: jest.fn(),
    leave: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('../stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: mockCurrentUserId ? { id: mockCurrentUserId } : null }),
}));

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

function makeEntry(overrides: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return {
    eventId: 'e1',
    participantUserId: 'p-1',
    displayName: 'Chris',
    participantStatus: 'joined',
    attendanceStatus: 'pending',
    joinedAt: '2026-01-01T00:00:00Z',
    leftAt: null,
    attendanceConfirmedByHostAt: null,
    attendanceSelfReportedAt: null,
    attendanceNote: null,
    ...overrides,
  };
}

function makeDetail(): EventDetail {
  return {
    id: 'e1',
    hostUserId: 'host-1',
    host: { id: 'host-1', displayName: 'Sam' },
    title: 'Bondi Hoops',
    sport: 'basketball',
    mode: 'casual',
    // Past startsAt so attendance is open by default for the host
    // flow; lifecycle-gate tests override with a future timestamp.
    startsAt: '2020-06-01T18:00:00Z',
    locationText: 'Bondi Court',
    capacity: 10,
    participantCount: 2,
    spotsLeft: 8,
    visibility: 'public',
    status: 'open',
    hasJoined: true,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    participants: [],
  };
}

function renderScreen() {
  const navigation = makeNavigation();
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AttendanceCheckScreen
        navigation={navigation as any}
        route={{ params: { eventId: 'e1' }, key: 'k', name: 'AttendanceCheck' } as any}
      />
    </SafeAreaProvider>
  );
  return { ...utils, navigation };
}

describe('AttendanceCheckScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUserId = 'host-1';
    mockDetail.detail = makeDetail();
    mockAttendanceState = {
      data: {
        eventId: 'e1',
        hostUserId: 'host-1',
        items: [
          makeEntry({ participantUserId: 'p-1', displayName: 'Chris' }),
          makeEntry({ participantUserId: 'p-2', displayName: 'Alex' }),
        ],
      },
      isLoading: false,
      error: null,
    };
  });

  it('renders Confirm attendance header and warning copy', () => {
    const { getByText } = renderScreen();
    getByText('Confirm attendance');
    getByText(
      'Only mark no-show when the player clearly did not attend.'
    );
  });

  it('renders an active participant row for each joined participant', () => {
    const { getByText } = renderScreen();
    getByText('Chris');
    getByText('Alex');
  });

  it('renders the four host choices for a row', () => {
    const { getByLabelText } = renderScreen();
    getByLabelText('Mark Chris as Attended');
    getByLabelText('Mark Chris as No-show');
    getByLabelText('Mark Chris as Excused');
    getByLabelText('Mark Chris as Not sure');
  });

  it('calls updateAsHost with attended when host picks Attended', async () => {
    mockUpdateAsHost.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Mark Chris as Attended'));
    });
    expect(mockUpdateAsHost).toHaveBeenCalledWith({
      participantUserId: 'p-1',
      attendanceStatus: 'attended',
    });
  });

  it('calls updateAsHost with no_show when host picks No-show', async () => {
    mockUpdateAsHost.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Mark Chris as No-show'));
    });
    expect(mockUpdateAsHost).toHaveBeenCalledWith({
      participantUserId: 'p-1',
      attendanceStatus: 'no_show',
    });
  });

  it('calls updateAsHost with excused when host picks Excused', async () => {
    mockUpdateAsHost.mockResolvedValueOnce(undefined);
    const { getByLabelText } = renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Mark Chris as Excused'));
    });
    expect(mockUpdateAsHost).toHaveBeenCalledWith({
      participantUserId: 'p-1',
      attendanceStatus: 'excused',
    });
  });

  it('"Not sure" is a UI-only no-op', async () => {
    const { getByLabelText } = renderScreen();
    await act(async () => {
      fireEvent.press(getByLabelText('Mark Chris as Not sure'));
    });
    expect(mockUpdateAsHost).not.toHaveBeenCalled();
  });

  it('hides participants whose lifecycle status is left', () => {
    mockAttendanceState.data!.items = [
      makeEntry({ participantUserId: 'p-1', displayName: 'Chris' }),
      makeEntry({
        participantUserId: 'p-2',
        displayName: 'Alex',
        participantStatus: 'left',
      }),
    ];
    const { getByText, queryByText } = renderScreen();
    getByText('Chris');
    expect(queryByText('Alex')).toBeNull();
  });

  it('renders the empty state when there are no active participants', () => {
    mockAttendanceState.data!.items = [];
    const { getByText } = renderScreen();
    getByText('No active participants yet.');
  });

  it('renders an error and retry when load fails', () => {
    mockAttendanceState.data = null;
    mockAttendanceState.error = 'Network down';
    const { getByText, getByLabelText } = renderScreen();
    getByText('Network down');
    fireEvent.press(getByLabelText('Retry loading attendance'));
    expect(mockAttendanceRefresh).toHaveBeenCalled();
  });

  it('calls navigation.goBack when Back is pressed', () => {
    const { getByLabelText, navigation } = renderScreen();
    fireEvent.press(getByLabelText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('does not render host marking controls for a non-host viewer', () => {
    // Non-host: server returns self-only payload (hostUserId stays
    // host-1, the current viewer is viewer-1). UI must suppress all
    // mark-as-X controls and surface the inaccessible state.
    mockCurrentUserId = 'viewer-1';
    mockDetail.detail = { ...makeDetail() }; // host is still host-1
    mockAttendanceState.data = {
      eventId: 'e1',
      hostUserId: 'host-1',
      items: [
        makeEntry({ participantUserId: 'viewer-1', displayName: 'Me' }),
      ],
    };
    const { getByText, queryByLabelText, queryByText } = renderScreen();
    // Inaccessible state visible.
    getByText('Host only');
    // No host marking buttons.
    expect(queryByLabelText('Mark Me as No-show')).toBeNull();
    expect(queryByLabelText('Mark Me as Attended')).toBeNull();
    expect(queryByLabelText('Mark Me as Excused')).toBeNull();
    expect(queryByLabelText('Mark Me as Not sure')).toBeNull();
    // Host-only warning copy also suppressed.
    expect(
      queryByText('Only mark no-show when the player clearly did not attend.')
    ).toBeNull();
  });

  // ── Lifecycle gates ────────────────────────────────────────────────────

  it('blocks host marking controls before the event starts', () => {
    mockCurrentUserId = 'host-1';
    mockDetail.detail = { ...makeDetail(), startsAt: '2099-01-01T00:00:00Z' };
    const { getByLabelText, queryByLabelText } = renderScreen();
    getByLabelText('Attendance opens after the game starts');
    expect(queryByLabelText('Mark Chris as Attended')).toBeNull();
    expect(queryByLabelText('Mark Chris as No-show')).toBeNull();
  });

  it('blocks host marking controls on a cancelled event', () => {
    mockCurrentUserId = 'host-1';
    mockDetail.detail = { ...makeDetail(), status: 'cancelled' };
    const { getByLabelText, queryByLabelText } = renderScreen();
    getByLabelText('Attendance check is cancelled');
    expect(queryByLabelText('Mark Chris as Attended')).toBeNull();
    expect(queryByLabelText('Mark Chris as No-show')).toBeNull();
  });

  it('allows host marking controls on a completed event regardless of clock', () => {
    mockCurrentUserId = 'host-1';
    // Completed + future startsAt — completed bypasses the time gate.
    mockDetail.detail = {
      ...makeDetail(),
      status: 'completed',
      startsAt: '2099-01-01T00:00:00Z',
    };
    const { getByLabelText } = renderScreen();
    getByLabelText('Mark Chris as Attended');
    getByLabelText('Mark Chris as No-show');
  });

  it('uses run wording for group runs', () => {
    mockDetail.detail = { ...makeDetail(), sport: 'running', startsAt: '2099-01-01T00:00:00Z' };
    const { getByLabelText, getByText } = renderScreen();
    getByLabelText('Attendance opens after the run starts');
    getByText('Run');
  });
});
