/**
 * useMatches hook tests
 *
 *  - initial fetch of GET /matches?limit=50 with the full-screen loading flag
 *  - error surface on failure
 *  - refresh() re-fetches through the loading flag
 *  - pullToRefresh() re-fetches through the isRefreshing flag only
 *  - revalidate() re-fetches silently and never surfaces an error
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { useMatches } from '../hooks/useMatches';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn() },
}));

const mockGet = api.get as jest.Mock;

const match = {
  id: 'match-1',
  sport: 'running',
  status: 'active',
  createdAt: '2026-04-01T00:00:00Z',
  partner: { userId: 'u-2', displayName: 'Sam', sportProfiles: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMatches', () => {
  it('loads matches on mount', async () => {
    mockGet.mockResolvedValue({ items: [match], total: 1, limit: 50, offset: 0 });
    const { result } = renderHook(() => useMatches());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith('/matches?limit=50');
    expect(result.current.items).toEqual([match]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the error message on failure', async () => {
    mockGet.mockRejectedValue(new Error('Server error'));
    const { result } = renderHook(() => useMatches());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Server error');
    expect(result.current.items).toEqual([]);
  });

  it('refresh() clears the error and reloads', async () => {
    mockGet.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useMatches());
    await waitFor(() => expect(result.current.error).toBe('boom'));

    mockGet.mockResolvedValue({ items: [match], total: 1, limit: 50, offset: 0 });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.items).toEqual([match]);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('revalidate() re-fetches without loading flags and swallows failures', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const { result } = renderHook(() => useMatches());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGet.mockResolvedValueOnce({ items: [match], total: 1, limit: 50, offset: 0 });
    await act(async () => {
      await result.current.revalidate();
    });
    expect(result.current.items).toEqual([match]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);

    mockGet.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.revalidate();
    });
    expect(result.current.items).toEqual([match]);
    expect(result.current.error).toBeNull();
  });

  it('pullToRefresh() uses isRefreshing and leaves isLoading alone', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    const { result } = renderHook(() => useMatches());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolve!: (v: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.pullToRefresh();
    });
    expect(result.current.isRefreshing).toBe(true);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      resolve({ items: [match], total: 1, limit: 50, offset: 0 });
      await pending;
    });
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.items).toEqual([match]);
  });
});
