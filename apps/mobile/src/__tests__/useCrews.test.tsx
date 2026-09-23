import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCrew } from '../hooks/useCrew';
import { useCrews } from '../hooks/useCrews';
import * as crews from '../lib/crews';

jest.mock('../lib/crews', () => {
  const actual = jest.requireActual('../lib/crews');
  return {
    ...actual,
    listCrews: jest.fn(),
    getCrew: jest.fn(),
    joinCrew: jest.fn(),
    leaveCrew: jest.fn(),
    updateCrew: jest.fn(),
    deleteCrew: jest.fn(),
  };
});

const mocked = crews as jest.Mocked<typeof crews>;

const crewDetail = {
  id: 'c1',
  name: 'Dawn Patrol',
  description: null,
  sport: 'running',
  homeArea: 'Bondi',
  paceMinSecPerKm: 300,
  paceMaxSecPerKm: 360,
  visibility: 'public' as const,
  createdBy: 'u1',
  createdAt: '',
  updatedAt: '',
  memberCount: 3,
  myRole: null,
  distanceKm: null,
  nextRun: null,
  members: [],
  upcomingRuns: [],
};

beforeEach(() => jest.clearAllMocks());

describe('useCrews', () => {
  it('fetches with the given filters and exposes items + total', async () => {
    mocked.listCrews.mockResolvedValue({ items: [crewDetail], total: 1, limit: 20, offset: 0 });
    const { result } = renderHook(() => useCrews({ mine: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocked.listCrews).toHaveBeenCalledWith({ mine: true });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it('does not fetch while disabled and refetches when a filter changes', async () => {
    mocked.listCrews.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    const { rerender } = renderHook(
      ({ q, enabled }: { q: string; enabled: boolean }) => useCrews({ q, enabled }),
      { initialProps: { q: '', enabled: false } }
    );
    expect(mocked.listCrews).not.toHaveBeenCalled();
    rerender({ q: 'bondi', enabled: true });
    await waitFor(() => expect(mocked.listCrews).toHaveBeenCalledWith({ q: 'bondi' }));
  });

  it('surfaces errors', async () => {
    mocked.listCrews.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useCrews());
    await waitFor(() => expect(result.current.error).toBe('Network down'));
  });
});

describe('useCrew', () => {
  it('loads the crew and joins', async () => {
    mocked.getCrew.mockResolvedValue(crewDetail);
    mocked.joinCrew.mockResolvedValue({ ...crewDetail, myRole: 'member', memberCount: 4 });
    const { result } = renderHook(() => useCrew('c1'));
    await waitFor(() => expect(result.current.crew?.id).toBe('c1'));
    await act(async () => {
      await result.current.join();
    });
    expect(mocked.joinCrew).toHaveBeenCalledWith('c1');
    expect(result.current.crew?.myRole).toBe('member');
  });

  it('leave refetches unless the crew was dissolved', async () => {
    mocked.getCrew.mockResolvedValue(crewDetail);
    mocked.leaveCrew.mockResolvedValueOnce({ crewId: 'c1', crewDeleted: false });
    const { result } = renderHook(() => useCrew('c1'));
    await waitFor(() => expect(result.current.crew).not.toBeNull());
    await act(async () => {
      await result.current.leave();
    });
    expect(mocked.getCrew).toHaveBeenCalledTimes(2);

    mocked.leaveCrew.mockResolvedValueOnce({ crewId: 'c1', crewDeleted: true });
    let res: unknown;
    await act(async () => {
      res = await result.current.leave();
    });
    expect(res).toEqual({ crewId: 'c1', crewDeleted: true });
    expect(mocked.getCrew).toHaveBeenCalledTimes(2);
  });

  it('propagates action errors (e.g. last-owner 409) to the caller', async () => {
    mocked.getCrew.mockResolvedValue(crewDetail);
    mocked.leaveCrew.mockRejectedValue(new Error("You're the crew's only owner."));
    const { result } = renderHook(() => useCrew('c1'));
    await waitFor(() => expect(result.current.crew).not.toBeNull());
    await expect(result.current.leave()).rejects.toThrow(/only owner/);
  });

  it('update and remove call the API', async () => {
    mocked.getCrew.mockResolvedValue(crewDetail);
    mocked.updateCrew.mockResolvedValue({ ...crewDetail, name: 'Sunrise' });
    mocked.deleteCrew.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCrew('c1'));
    await waitFor(() => expect(result.current.crew).not.toBeNull());
    await act(async () => {
      await result.current.update({ name: 'Sunrise' });
    });
    expect(result.current.crew?.name).toBe('Sunrise');
    await act(async () => {
      await result.current.remove();
    });
    expect(mocked.deleteCrew).toHaveBeenCalledWith('c1');
  });

  it('shows the load error', async () => {
    mocked.getCrew.mockRejectedValue(new Error('Crew not found'));
    const { result } = renderHook(() => useCrew('c1'));
    await waitFor(() => expect(result.current.error).toBe('Crew not found'));
  });
});
