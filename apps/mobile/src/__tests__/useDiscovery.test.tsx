/**
 * useDiscovery hook tests
 *
 * Covers:
 *  - Initial fetch on mount with the default sport (running — registry first)
 *  - Refetch when setSport is called
 *  - recordAction posts correct payload and removes the partner locally
 *  - Error state when the API rejects
 *  - Error state when the response shape is unexpected
 *  - fetchMore re-invokes the discovery endpoint
 *
 * Also includes a small smoke describe that exercises the jest-native
 * matchers (`toHaveTextContent`, `toBeOnTheScreen`) to confirm they load.
 */

// Pulls in the jest-native type augmentation for toHaveTextContent /
// toBeOnTheScreen (tsc otherwise only sees the base Jest matcher set).
import '@testing-library/jest-native/extend-expect';

import React from 'react';
import { Text, View } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../lib/api';
import { useDiscovery } from '../hooks/useDiscovery';

// ─── Mock the api module ──────────────────────────────────────────────────────

jest.mock('../lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  setToken: jest.fn(),
  BASE_URL: 'http://localhost:8000',
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const partnerA = {
  userId: 'user-a',
  displayName: 'Alex',
  sportProfiles: [{ sport: 'gym', level: 'intermediate' }],
};

const partnerB = {
  userId: 'user-b',
  displayName: 'Blake',
  sportProfiles: [{ sport: 'gym', level: 'beginner' }],
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDiscovery', () => {
  it('fetches partners for the default sport on mount', async () => {
    mockGet.mockResolvedValue({ items: [partnerA, partnerB] });

    const { result } = renderHook(() => useDiscovery());

    expect(result.current.isLoading).toBe(true);
    expect(mockGet).toHaveBeenCalledWith('/discovery?sport=running&limit=20');

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.partners).toEqual([partnerA, partnerB]);
    expect(result.current.error).toBeNull();
  });

  it('refetches when setSport is called with a new sport', async () => {
    mockGet.mockResolvedValueOnce({ items: [partnerA] });
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGet.mockResolvedValueOnce({ items: [partnerB] });
    act(() => {
      result.current.setSport('golf');
    });

    await waitFor(() => expect(result.current.sport).toBe('golf'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenLastCalledWith('/discovery?sport=golf&limit=20');
    expect(result.current.partners).toEqual([partnerB]);
  });

  it('posts recordAction with targetUserId, action and current sport', async () => {
    mockGet.mockResolvedValue({ items: [partnerA, partnerB] });
    mockPost.mockResolvedValue({ matchCreated: false });

    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.recordAction('user-a', 'like');
    });

    expect(mockPost).toHaveBeenCalledWith('/discovery/actions', {
      targetUserId: 'user-a',
      action: 'like',
      sport: 'running',
    });
  });

  it('removes the acted-upon partner from the local list', async () => {
    mockGet.mockResolvedValue({ items: [partnerA, partnerB] });
    mockPost.mockResolvedValue({ matchCreated: false });

    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.partners).toHaveLength(2));

    await act(async () => {
      await result.current.recordAction('user-a', 'pass');
    });

    expect(result.current.partners).toEqual([partnerB]);
  });

  it('returns the ActionResponse from recordAction (match created)', async () => {
    mockGet.mockResolvedValue({ items: [partnerA] });
    mockPost.mockResolvedValue({ matchCreated: true, matchId: 'm-1' });

    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resp: { matchCreated: boolean; matchId?: string } | undefined;
    await act(async () => {
      resp = await result.current.recordAction('user-a', 'like');
    });
    expect(resp).toEqual({ matchCreated: true, matchId: 'm-1' });
  });

  it('sets error when the API rejects', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.partners).toEqual([]);
  });

  it('sets a generic error when a non-Error value is thrown', async () => {
    mockGet.mockRejectedValue('boom');
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to load partners.');
  });

  it('sets an error when the response shape is unexpected', async () => {
    mockGet.mockResolvedValue({ wrong: 'shape' });
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toMatch(/Unexpected response shape/);
    expect(result.current.partners).toEqual([]);
  });

  it('fetchMore re-invokes the discovery endpoint with the current sport', async () => {
    mockGet.mockResolvedValue({ items: [partnerA] });
    const { result } = renderHook(() => useDiscovery());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGet.mockClear();
    mockGet.mockResolvedValue({ items: [partnerA, partnerB] });

    act(() => {
      result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith('/discovery?sport=running&limit=20');
    expect(result.current.partners).toEqual([partnerA, partnerB]);
  });
});

// ─── jest-native matcher smoke test ───────────────────────────────────────────

describe('jest-native matchers are loaded', () => {
  it('supports toHaveTextContent and toBeOnTheScreen', () => {
    const { getByTestId } = render(
      <View testID="probe">
        <Text>hello world</Text>
      </View>
    );
    const probe = getByTestId('probe');
    expect(probe).toBeOnTheScreen();
    expect(probe).toHaveTextContent('hello world');
  });
});
