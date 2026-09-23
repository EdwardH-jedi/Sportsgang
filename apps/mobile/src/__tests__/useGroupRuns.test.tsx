import { renderHook, waitFor } from '@testing-library/react-native';

import { useGroupRuns } from '../hooks/useGroupRuns';
import { api } from '../lib/api';
import { buildEventQuery, updateEvent } from '../lib/events';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const mockGet = api.get as jest.Mock;

function ev(id: string, status: string) {
  return { id, status, sport: 'running', title: id };
}

beforeEach(() => jest.clearAllMocks());

describe('events query builder', () => {
  it('keeps the v1 query shape without the new params', () => {
    expect(buildEventQuery({ mine: true, sport: 'tennis' })).toBe('?mine=true&sport=tennis');
  });

  it('adds crew, rounded geo and time-window params', () => {
    expect(
      buildEventQuery({
        sport: 'running',
        crewId: 'c1',
        lat: -33.87654,
        lng: 151.20712,
        radiusKm: 25,
        from: '2030-01-01T00:00:00.000Z',
        to: '2030-01-08T00:00:00.000Z',
      })
    ).toBe(
      '?sport=running&crew_id=c1&lat=-33.88&lng=151.21&radius_km=25&from=2030-01-01T00%3A00%3A00.000Z&to=2030-01-08T00%3A00%3A00.000Z'
    );
  });

  it('PATCHes /events/{id} for host edits', async () => {
    await updateEvent('e1', { title: 'New', distanceKm: 8 });
    expect(api.patch).toHaveBeenCalledWith('/events/e1', { title: 'New', distanceKm: 8 });
  });
});

describe('useGroupRuns', () => {
  it('lists upcoming running events with geo + window and drops inactive runs', async () => {
    mockGet.mockResolvedValue({
      items: [ev('a', 'open'), ev('b', 'cancelled'), ev('c', 'full'), ev('d', 'completed')],
      total: 4,
    });
    const { result } = renderHook(() =>
      useGroupRuns({ coords: { lat: -33.9, lng: 151.2 }, radiusKm: 10, when: 'week' })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.runs.map((r) => r.id)).toEqual(['a', 'c']);
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/events\?sport=running&limit=50&lat=-33\.9&lng=151\.2&radius_km=10&from=.+&to=.+/);
  });

  it('omits geo params without coords and the "to" bound for All', async () => {
    mockGet.mockResolvedValue({ items: [], total: 0 });
    renderHook(() => useGroupRuns({ radiusKm: 10, when: 'all', crewId: 'c9' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('crew_id=c9');
    expect(url).not.toContain('lat=');
    expect(url).not.toContain('radius_km');
    expect(url).not.toContain('to=');
  });

  it('surfaces errors and skips fetching when disabled', async () => {
    mockGet.mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useGroupRuns());
    await waitFor(() => expect(result.current.error).toBe('Network down'));

    mockGet.mockClear();
    renderHook(() => useGroupRuns({ enabled: false }));
    expect(mockGet).not.toHaveBeenCalled();
  });
});
