/**
 * lib/location + useHomeLocation: permission flow, 2 dp rounding before
 * anything is stored or sent, and the PUT /users/me/profile save.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { api } from '../lib/api';
import { roundCoord, roundCoords, saveHomeLocation, useLocationStore } from '../lib/location';
import { resetHomeLocationSession, useHomeLocation } from '../hooks/useHomeLocation';
import { useProfileStore } from '../stores/profile';

jest.mock('../lib/api', () => ({
  api: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setToken: jest.fn(),
  BASE_URL: 'http://localhost:8000',
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3 },
}));

const mockGetPerm = Location.getForegroundPermissionsAsync as jest.Mock;
const mockRequestPerm = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockPosition = Location.getCurrentPositionAsync as jest.Mock;
const mockPut = api.put as jest.Mock;
const mockGet = api.get as jest.Mock;

const granted = { status: 'granted', granted: true, canAskAgain: true };
const undetermined = { status: 'undetermined', granted: false, canAskAgain: true };
const denied = { status: 'denied', granted: false, canAskAgain: false };
const fix = { coords: { latitude: -33.876543, longitude: 151.207123 } };

beforeEach(() => {
  jest.clearAllMocks();
  resetHomeLocationSession();
  useProfileStore.setState({ profile: null });
});

describe('coordinate rounding', () => {
  it('rounds to 2 dp', () => {
    expect(roundCoord(-33.876543)).toBe(-33.88);
    expect(roundCoord(151.204999)).toBe(151.2);
    expect(roundCoords({ lat: -33.8749, lng: 151.2051 })).toEqual({ lat: -33.87, lng: 151.21 });
    expect(Object.is(roundCoord(-0.001), -0)).toBe(false);
  });

  it('saveHomeLocation rounds before sending and fetches the display name when missing', async () => {
    mockGet.mockResolvedValue({ displayName: 'Jo' });
    mockPut.mockResolvedValue({ displayName: 'Jo', hasHomeLocation: true });
    await expect(saveHomeLocation({ lat: -33.876543, lng: 151.207123 })).resolves.toBe(true);
    expect(mockGet).toHaveBeenCalledWith('/users/me/profile');
    expect(mockPut).toHaveBeenCalledWith('/users/me/profile', {
      displayName: 'Jo',
      homeLat: -33.88,
      homeLng: 151.21,
    });
  });
});

describe('useHomeLocation', () => {
  it('silently locates on mount when permission is already granted (no prompt, no save)', async () => {
    mockGetPerm.mockResolvedValue(granted);
    mockPosition.mockResolvedValue(fix);
    const { result } = renderHook(() => useHomeLocation());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.coords).toEqual({ lat: -33.88, lng: 151.21 });
    expect(mockRequestPerm).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockPosition).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Low });
  });

  it('reports undetermined without prompting on mount', async () => {
    mockGetPerm.mockResolvedValue(undetermined);
    const { result } = renderHook(() => useHomeLocation());
    await waitFor(() => expect(result.current.status).toBe('undetermined'));
    expect(mockRequestPerm).not.toHaveBeenCalled();
    expect(result.current.coords).toBeNull();
  });

  it('does not check anything when auto is off', async () => {
    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    expect(result.current.status).toBe('unknown');
    expect(mockGetPerm).not.toHaveBeenCalled();
  });

  it('requestLocation prompts, locates and saves the rounded home location', async () => {
    useProfileStore.setState({
      profile: {
        id: 'p', userId: 'u', displayName: 'Jo', suburb: 'Glebe',
        createdAt: '', updatedAt: '',
      },
    });
    mockGetPerm.mockResolvedValue(undetermined);
    mockRequestPerm.mockResolvedValue(granted);
    mockPosition.mockResolvedValue(fix);
    mockPut.mockResolvedValue({ displayName: 'Jo', hasHomeLocation: true });

    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    let out: unknown;
    await act(async () => {
      out = await result.current.requestLocation();
    });
    expect(out).toEqual({ lat: -33.88, lng: 151.21 });
    expect(mockRequestPerm).toHaveBeenCalled();
    expect(mockPut).toHaveBeenCalledWith('/users/me/profile', {
      displayName: 'Jo',
      homeLat: -33.88,
      homeLng: 151.21,
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.hasHomeLocation).toBe(true);
    expect(result.current.areaLabel).toBe('Glebe');
  });

  it('requestLocation({ save: false }) never writes the profile', async () => {
    mockGetPerm.mockResolvedValue(granted);
    mockPosition.mockResolvedValue(fix);
    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    await act(async () => {
      await result.current.requestLocation({ save: false });
    });
    expect(mockPut).not.toHaveBeenCalled();
    expect(useLocationStore.getState().coords).toEqual({ lat: -33.88, lng: 151.21 });
  });

  it('ends in denied when the user refuses', async () => {
    mockGetPerm.mockResolvedValue(denied);
    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    let out: unknown = 'x';
    await act(async () => {
      out = await result.current.requestLocation();
    });
    expect(out).toBeNull();
    expect(result.current.status).toBe('denied');
    expect(mockPosition).not.toHaveBeenCalled();
  });

  it('ends in unavailable when no fix can be read', async () => {
    mockGetPerm.mockResolvedValue(granted);
    mockPosition.mockRejectedValue(new Error('Location services are off'));
    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.status).toBe('unavailable');
    expect(result.current.error).toBe('Location services are off');
  });

  it('keeps the fix when saving the home location fails', async () => {
    mockGetPerm.mockResolvedValue(granted);
    mockPosition.mockResolvedValue(fix);
    mockGet.mockResolvedValue({ displayName: 'Jo' });
    mockPut.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useHomeLocation({ auto: false }));
    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.coords).toEqual({ lat: -33.88, lng: 151.21 });
  });
});
