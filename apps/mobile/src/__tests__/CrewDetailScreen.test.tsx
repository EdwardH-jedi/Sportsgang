/**
 * Crew detail: render, join, leave (incl. the last-owner 409 and a
 * dissolved crew), owner edit / delete / host a run, states.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CrewDetail } from '@protin/shared-types';

import { CrewDetailScreen } from '../screens/crews/CrewDetailScreen';

let mockState: { crew: CrewDetail | null; isLoading: boolean; error: string | null };
const mockJoin = jest.fn();
const mockLeave = jest.fn();
const mockRemove = jest.fn();
const mockRefresh = jest.fn();

jest.mock('../hooks/useCrew', () => ({
  useCrew: () => ({
    ...mockState,
    refresh: mockRefresh,
    join: mockJoin,
    leave: mockLeave,
    remove: mockRemove,
    update: jest.fn(),
  }),
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

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function makeCrew(overrides: Partial<CrewDetail> = {}): CrewDetail {
  return {
    id: 'c1',
    name: 'Dawn Patrol',
    description: 'Sunrise laps of the bay.',
    sport: 'running',
    homeArea: 'Bondi',
    paceMinSecPerKm: 300,
    paceMaxSecPerKm: 360,
    visibility: 'public',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
    memberCount: 14,
    myRole: null,
    distanceKm: null,
    nextRun: null,
    members: [
      { userId: 'u1', displayName: 'Olly Owner', avatarUrl: null, role: 'owner', joinedAt: '' },
      { userId: 'u2', displayName: 'Mia Member', avatarUrl: null, role: 'member', joinedAt: '' },
    ],
    upcomingRuns: [],
    ...overrides,
  };
}

function renderScreen(crew: CrewDetail | null, extra: Partial<typeof mockState> = {}) {
  mockState = { crew, isLoading: false, error: null, ...extra };
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const utils = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CrewDetailScreen navigation={navigation as any} route={{ params: { crewId: 'c1' } } as any} />
    </SafeAreaProvider>
  );
  return { ...utils, navigation };
}

/** Presses the named button of the next Alert. */
function pressAlert(text: string) {
  return jest.spyOn(Alert, 'alert').mockImplementationOnce((_t, _m, buttons) => {
    buttons?.find((b) => b.text === text)?.onPress?.();
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('CrewDetailScreen', () => {
  it('renders the crew, stats and members', () => {
    const { getByRole, getByText, getByLabelText } = renderScreen(makeCrew());
    getByRole('header', { name: 'Dawn Patrol' });
    getByText('Bondi');
    getByText('Sunrise laps of the bay.');
    getByLabelText('14, Members');
    getByLabelText('Pace 5:00–6:00 /km');
    getByText('14 members');
    getByLabelText('Olly Owner, owner');
    getByText('Mia Member');
    getByText('No runs scheduled yet');
  });

  it('lists upcoming runs as run cards that open the run', () => {
    const { getByLabelText, navigation } = renderScreen(
      makeCrew({
        upcomingRuns: [
          {
            id: 'r1',
            hostUserId: 'u1',
            host: { id: 'u1', displayName: 'Olly Owner' },
            title: 'Bay loop',
            sport: 'running',
            mode: 'casual',
            startsAt: '2030-06-01T20:00:00Z',
            locationText: 'Bondi Pavilion',
            capacity: 20,
            participantCount: 3,
            spotsLeft: 17,
            visibility: 'public',
            status: 'open',
            hasJoined: false,
            description: null,
            createdAt: '',
            updatedAt: '',
            crewId: 'c1',
            crewName: 'Dawn Patrol',
            distanceKm: 6,
          },
        ],
      })
    );
    fireEvent.press(getByLabelText('Open run Bay loop'));
    expect(navigation.navigate).toHaveBeenCalledWith('BattleDetail', { eventId: 'r1' });
  });

  it('joins a crew', async () => {
    mockJoin.mockResolvedValue(null);
    const { getByLabelText } = renderScreen(makeCrew());
    await act(async () => {
      fireEvent.press(getByLabelText('Join crew'));
    });
    expect(mockJoin).toHaveBeenCalled();
  });

  it('members can host a run for the crew and leave', async () => {
    mockLeave.mockResolvedValue({ crewId: 'c1', crewDeleted: false });
    const { getByLabelText, queryByLabelText, navigation } = renderScreen(makeCrew({ myRole: 'member' }));
    expect(queryByLabelText('Join crew')).toBeNull();
    expect(queryByLabelText('Edit crew')).toBeNull();
    expect(queryByLabelText('Delete crew')).toBeNull();
    fireEvent.press(getByLabelText('Host a run for this crew'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateBattle', {
      sport: 'running',
      crewId: 'c1',
      crewName: 'Dawn Patrol',
    });
    pressAlert('Leave crew');
    await act(async () => {
      fireEvent.press(getByLabelText('Leave crew'));
    });
    expect(mockLeave).toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('goes back when leaving dissolves the crew', async () => {
    mockLeave.mockResolvedValue({ crewId: 'c1', crewDeleted: true });
    const { getByLabelText, navigation } = renderScreen(makeCrew({ myRole: 'owner', memberCount: 1 }));
    pressAlert('Leave crew');
    await act(async () => {
      fireEvent.press(getByLabelText('Leave crew'));
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('explains the last-owner 409 and offers to delete instead', async () => {
    mockLeave.mockRejectedValue(
      new Error("You're the crew's only owner. Delete the crew, or wait until the other members have left.")
    );
    const alertSpy = jest.spyOn(Alert, 'alert');
    alertSpy.mockImplementationOnce((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Leave crew')?.onPress?.();
    });
    const { getByLabelText } = renderScreen(makeCrew({ myRole: 'owner' }));
    await act(async () => {
      fireEvent.press(getByLabelText('Leave crew'));
    });
    const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    expect(lastCall[0]).toBe("You're the last owner");
    expect((lastCall[2] ?? []).map((b) => b.text)).toEqual(['OK', 'Delete crew']);
  });

  it('owners can edit and delete', async () => {
    mockRemove.mockResolvedValue(undefined);
    const { getByLabelText, navigation } = renderScreen(makeCrew({ myRole: 'owner' }));
    fireEvent.press(getByLabelText('Edit crew'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateCrew', { crewId: 'c1' });
    pressAlert('Delete crew');
    await act(async () => {
      fireEvent.press(getByLabelText('Delete crew'));
    });
    expect(mockRemove).toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('shows loading and error states with a back button', () => {
    const loading = renderScreen(null, { isLoading: true });
    loading.getByLabelText('Loading crew');
    fireEvent.press(loading.getByLabelText('Go back'));
    expect(loading.navigation.goBack).toHaveBeenCalled();

    const failed = renderScreen(null, { error: 'Crew not found' });
    failed.getByText('Crew not found');
    fireEvent.press(failed.getByLabelText('Retry loading crew'));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
