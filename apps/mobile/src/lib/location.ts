/**
 * Coarse device location for the run-first surfaces (Run home, Runners,
 * Crews near you, host-a-run / create-crew "use my location").
 *
 * Privacy rules (docs/contracts/run-first-api.md):
 *  - Coordinates are rounded to 2 dp (~1 km) on the device, BEFORE they
 *    leave it — for the profile home location and for every geo query.
 *  - Only a low-accuracy fix is requested.
 *  - The server never returns the home point; the client keeps the last
 *    rounded fix in memory (this store) for the session.
 */

import * as Location from 'expo-location';
import { create } from 'zustand';

import { api } from './api';

/** Decimal places kept for any coordinate we send. 2 dp ≈ 1.1 km. */
export const COORD_DP = 2;

export interface Coords {
  lat: number;
  lng: number;
}

export function roundCoord(value: number, dp: number = COORD_DP): number {
  const f = 10 ** dp;
  // +0 normalises -0 (e.g. rounding -0.001) so it serialises as 0.
  return Math.round(value * f) / f + 0;
}

export function roundCoords(coords: Coords, dp: number = COORD_DP): Coords {
  return { lat: roundCoord(coords.lat, dp), lng: roundCoord(coords.lng, dp) };
}

/**
 * Where the location flow is:
 *  - unknown       nothing checked yet this session
 *  - checking      reading the OS permission (no prompt)
 *  - undetermined  never asked; show a "Set location" action
 *  - denied        refused (or blocked); show settings / fallback copy
 *  - locating      permission granted, waiting for a fix
 *  - ready         `coords` holds a rounded fix
 *  - unavailable   permission granted but no fix (services off, timeout)
 */
export type LocationStatus =
  | 'unknown'
  | 'checking'
  | 'undetermined'
  | 'denied'
  | 'locating'
  | 'ready'
  | 'unavailable';

export type PermissionState = 'granted' | 'undetermined' | 'denied';

/** Read the foreground permission without prompting. */
export async function readLocationPermission(): Promise<PermissionState> {
  const res = await Location.getForegroundPermissionsAsync();
  if (res.granted) return 'granted';
  if (res.status === Location.PermissionStatus.UNDETERMINED && res.canAskAgain !== false) {
    return 'undetermined';
  }
  return 'denied';
}

/** Prompt for foreground permission (the OS only shows it once). */
export async function requestLocationPermission(): Promise<PermissionState> {
  const res = await Location.requestForegroundPermissionsAsync();
  return res.granted ? 'granted' : 'denied';
}

/** One low-accuracy fix, rounded to 2 dp. Throws when no fix is available. */
export async function getCoarsePosition(): Promise<Coords> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  const { latitude, longitude } = position.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Could not read your location.');
  }
  return roundCoords({ lat: latitude, lng: longitude });
}

interface ProfileLike {
  displayName: string;
  hasHomeLocation?: boolean;
}

/**
 * Save the profile home location (PUT /users/me/profile home_lat/home_lng).
 * The endpoint needs `display_name` on every PUT, so it is read from the
 * caller or fetched first. Other profile fields are left untouched (the
 * API only applies fields that are sent). Returns `has_home_location`.
 */
export async function saveHomeLocation(
  coords: Coords,
  displayName?: string | null
): Promise<boolean> {
  const rounded = roundCoords(coords);
  let name = displayName ?? null;
  if (!name) {
    const current = await api.get<ProfileLike>('/users/me/profile');
    name = current.displayName;
  }
  const res = await api.put<ProfileLike>('/users/me/profile', {
    displayName: name,
    homeLat: rounded.lat,
    homeLng: rounded.lng,
  });
  return res?.hasHomeLocation ?? true;
}

interface LocationStoreState {
  status: LocationStatus;
  coords: Coords | null;
  error: string | null;
  set: (patch: Partial<Pick<LocationStoreState, 'status' | 'coords' | 'error'>>) => void;
  reset: () => void;
}

/** Session-wide location state, shared by every screen that needs it. */
export const useLocationStore = create<LocationStoreState>((set) => ({
  status: 'unknown',
  coords: null,
  error: null,
  set: (patch) => set(patch),
  reset: () => set({ status: 'unknown', coords: null, error: null }),
}));
