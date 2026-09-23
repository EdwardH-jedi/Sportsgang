import { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';

import {
  type Coords,
  type LocationStatus,
  getCoarsePosition,
  readLocationPermission,
  requestLocationPermission,
  saveHomeLocation,
  useLocationStore,
} from '../lib/location';
import { useProfileStore } from '../stores/profile';

export interface RequestLocationOptions {
  /** Also save the fix as the profile home location. Default true. */
  save?: boolean;
}

export interface UseHomeLocationArgs {
  /**
   * On mount, read the permission WITHOUT prompting and, if it is already
   * granted, take a silent low-accuracy fix. Default true.
   */
  auto?: boolean;
}

export interface UseHomeLocationResult {
  status: LocationStatus;
  /** Rounded (2 dp) fix for this session, or null. */
  coords: Coords | null;
  error: string | null;
  /** Display name for the area: the profile suburb when known. */
  areaLabel: string | null;
  /** Server flag: a home location is saved on the profile. */
  hasHomeLocation: boolean;
  /** True while checking the permission or waiting for a fix. */
  isBusy: boolean;
  /**
   * The "Set location" action: prompts if needed, takes a fix and (by
   * default) saves it as the profile home location. Resolves to the fix,
   * or null when denied / unavailable.
   */
  requestLocation: (options?: RequestLocationOptions) => Promise<Coords | null>;
  /** Open the OS settings page (for a denied permission). */
  openSettings: () => void;
}

// One silent check per session, shared by every mounted consumer.
let silentCheck: Promise<void> | null = null;

async function silentLocate(): Promise<void> {
  const { set } = useLocationStore.getState();
  set({ status: 'checking', error: null });
  try {
    const permission = await readLocationPermission();
    if (permission !== 'granted') {
      set({ status: permission });
      return;
    }
    set({ status: 'locating' });
    const coords = await getCoarsePosition();
    set({ status: 'ready', coords });
  } catch (err) {
    set({
      status: 'unavailable',
      error: err instanceof Error ? err.message : 'Could not read your location.',
    });
  }
}

/** Test hook: forget the once-per-session silent check. */
export function resetHomeLocationSession(): void {
  silentCheck = null;
  useLocationStore.getState().reset();
}

/**
 * Coarse location for the run-first screens, with the permission flow.
 * Coordinates are rounded to 2 dp before they are stored or sent.
 */
export function useHomeLocation({ auto = true }: UseHomeLocationArgs = {}): UseHomeLocationResult {
  const status = useLocationStore((s) => s.status);
  const coords = useLocationStore((s) => s.coords);
  const error = useLocationStore((s) => s.error);
  const profile = useProfileStore((s) => s.profile);

  useEffect(() => {
    if (!auto) return;
    if (useLocationStore.getState().status !== 'unknown') return;
    if (!silentCheck) silentCheck = silentLocate();
  }, [auto]);

  const requestLocation = useCallback(
    async ({ save = true }: RequestLocationOptions = {}): Promise<Coords | null> => {
      const { set } = useLocationStore.getState();
      set({ status: 'checking', error: null });
      try {
        let permission = await readLocationPermission();
        if (permission === 'undetermined') {
          permission = await requestLocationPermission();
        }
        if (permission !== 'granted') {
          set({ status: 'denied' });
          return null;
        }
        set({ status: 'locating' });
        const fix = await getCoarsePosition();
        set({ status: 'ready', coords: fix });
        if (save) {
          try {
            const displayName = useProfileStore.getState().profile?.displayName;
            const saved = await saveHomeLocation(fix, displayName);
            useProfileStore.setState((s) => ({
              profile: s.profile ? { ...s.profile, hasHomeLocation: saved } : s.profile,
            }));
          } catch {
            // Saving is best-effort: the session fix still powers the
            // screen, and the next "Set location" retries the save.
          }
        }
        return fix;
      } catch (err) {
        set({
          status: 'unavailable',
          error: err instanceof Error ? err.message : 'Could not read your location.',
        });
        return null;
      }
    },
    []
  );

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => undefined);
  }, []);

  return {
    status,
    coords,
    error,
    areaLabel: profile?.suburb ?? null,
    hasHomeLocation: profile?.hasHomeLocation ?? false,
    isBusy: status === 'checking' || status === 'locating',
    requestLocation,
    openSettings,
  };
}
