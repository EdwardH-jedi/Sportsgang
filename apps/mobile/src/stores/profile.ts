import { create } from 'zustand';
import type {
  IdentityPreferences,
  SetIdentityPreferencesRequest,
  Sport,
  SportProfile,
  UpsertSportProfileRequest,
  UserProfile,
} from '@protin/shared-types';

import { api, BASE_URL } from '../lib/api';

export type SportType = Sport;

export const SPORT_LABELS: Record<SportType, string> = {
  gym: 'Gym',
  golf: 'Golf',
  tennis: 'Tennis',
  running: 'Running',
};

export function sportLabel(sport: string): string {
  return SPORT_LABELS[sport as SportType] ?? sport.charAt(0).toUpperCase() + sport.slice(1);
}

interface ProfilePhotoResponse {
  id: string;
  photoUrl: string;
  position: number;
}

interface ProfilePhotosResponse {
  photos: ProfilePhotoResponse[];
  avatarUrl: string | null;
}

// The backend returns media URLs as relative paths (e.g. "/media/...") served
// from the same API origin. React Native's <Image> needs absolute URLs, so we
// prepend the API base URL when the value is relative.
function absolutizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${path}`;
}

// Profile responses now include the persisted ordered photo list so the app
// can rehydrate after restart/store reset.
type ProfileResponse = UserProfile & { photos?: ProfilePhotoResponse[] };

// Edits may explicitly clear the bio. JSON.stringify drops `undefined` keys,
// so the call site must pass `null` to tell the backend "set this column to
// NULL"; otherwise the previous value is preserved server-side. The shared
// UserProfile type models a *read* shape (bio?: string) and intentionally
// stays narrow — only the upsert input widens here.
export type UpsertProfileInput = Omit<Partial<UserProfile>, 'bio'> & {
  bio?: string | null;
};

interface ProfileState {
  profile: UserProfile | null;
  identityPreferences: IdentityPreferences | null;
  sportProfiles: SportProfile[] | null;
  /**
   * Per-sport counter bumped after every successful preference change for
   * that sport (save, clear, delete, or a re-fetch that returns a different
   * row). Explore compares it with the revision a feed was loaded under and
   * asks the server again when they differ. Monotonic across logouts.
   */
  preferenceRevision: Partial<Record<Sport, number>>;
  // URLs returned by the backend after a successful PUT /users/me/photos.
  // Locally selected file URIs are held in screen-local state and are not
  // promoted into the store until the backend has persisted them.
  photoUris: string[];
  fetchProfile: () => Promise<void>;
  upsertProfile: (data: UpsertProfileInput) => Promise<void>;
  uploadProfilePhotos: (uris: string[]) => Promise<string[]>;
  upsertIdentityPreferences: (data: SetIdentityPreferencesRequest) => Promise<void>;
  upsertSportProfile: (data: UpsertSportProfileRequest) => Promise<void>;
  // User-initiated removal of one sport (DELETE /users/me/sport-profiles/{sport}).
  deleteSportProfile: (sport: Sport) => Promise<void>;
  // Drop every cached field tied to the current session. Called from
  // auth.logout() so a logout/delete-account flow cannot leave a stale
  // profile (display name, photos, sport rows) visible to the next user.
  reset: () => void;
}

/**
 * Partner (identity) preferences are optional since the v2 setup flow: a
 * user who never opened that screen has no row and the API answers 404.
 * Treat that as "not set" so it can never block loading the profile (and
 * therefore can never bounce a fully onboarded user back to Step 1).
 */
async function fetchIdentityPreferences(): Promise<IdentityPreferences | null> {
  try {
    return await api.get<IdentityPreferences>('/users/me/identity-preferences');
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/not found|HTTP 404/i.test(message)) return null;
    throw err;
  }
}

function inferMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function inferNameFromUri(uri: string, index: number): string {
  const tail = uri.split('/').pop() ?? '';
  const cleaned = tail.split('?')[0];
  if (cleaned && /\.[a-z0-9]+$/i.test(cleaned)) return cleaned;
  const mime = inferMimeFromUri(uri);
  const ext = mime.split('/')[1] ?? 'jpg';
  return `photo_${index}.${ext}`;
}

/** Sports whose own row differs between two loaded sport-profile lists. */
function changedSports(before: SportProfile[], after: SportProfile[]): Sport[] {
  const sports = new Set<Sport>([...before, ...after].map((sp) => sp.sport));
  const row = (list: SportProfile[], sport: Sport) => JSON.stringify(list.find((sp) => sp.sport === sport) ?? null);
  return [...sports].filter((sport) => row(before, sport) !== row(after, sport));
}

function bumpRevision(
  revision: Partial<Record<Sport, number>>,
  sports: Sport[]
): Partial<Record<Sport, number>> {
  if (sports.length === 0) return revision;
  const next = { ...revision };
  for (const sport of sports) next[sport] = (next[sport] ?? 0) + 1;
  return next;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  identityPreferences: null,
  sportProfiles: null,
  preferenceRevision: {},
  photoUris: [],

  fetchProfile: async () => {
    const raw = await api.get<ProfileResponse>('/users/me/profile');
    const identityPreferences = await fetchIdentityPreferences();
    const sportProfiles = await api.get<SportProfile[]>('/users/me/sport-profiles');
    const photoUris = (raw.photos ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => absolutizeMediaUrl(p.photoUrl))
      .filter((u): u is string => u !== null);
    const { photos: _photos, ...profileFields } = raw;
    const profile: UserProfile = {
      ...profileFields,
      avatarUrl: absolutizeMediaUrl(profileFields.avatarUrl) ?? undefined,
    };
    // A first load (from null) is not a change; a re-fetch that differs is
    // (e.g. preferences edited on another device).
    const previous = get().sportProfiles;
    const changed = previous === null ? [] : changedSports(previous, sportProfiles);
    set({
      profile,
      identityPreferences,
      sportProfiles,
      photoUris,
      preferenceRevision: bumpRevision(get().preferenceRevision, changed),
    });
  },

  upsertProfile: async (data) => {
    const raw = await api.put<ProfileResponse>('/users/me/profile', data);
    const { photos: _photos, ...profileFields } = raw;
    const updated: UserProfile = {
      ...profileFields,
      avatarUrl: absolutizeMediaUrl(profileFields.avatarUrl) ?? undefined,
    };
    set({ profile: updated });
  },

  uploadProfilePhotos: async (uris) => {
    const form = new FormData();
    uris.forEach((uri, index) => {
      form.append('files', {
        uri,
        name: inferNameFromUri(uri, index),
        type: inferMimeFromUri(uri),
      } as unknown as Blob);
    });
    const response = await api.putForm<ProfilePhotosResponse>('/users/me/photos', form);
    const photoUrls = response.photos
      .map((p) => absolutizeMediaUrl(p.photoUrl))
      .filter((u): u is string => u !== null);
    const absoluteAvatar = absolutizeMediaUrl(response.avatarUrl) ?? undefined;
    set((state) => ({
      photoUris: photoUrls,
      profile: state.profile
        ? { ...state.profile, avatarUrl: absoluteAvatar ?? state.profile.avatarUrl }
        : state.profile,
    }));
    return photoUrls;
  },

  upsertIdentityPreferences: async (data) => {
    const updated = await api.put<IdentityPreferences>('/users/me/identity-preferences', data);
    set({ identityPreferences: updated });
  },

  upsertSportProfile: async (data) => {
    const updated = await api.post<SportProfile>('/users/me/sport-profiles', data);
    const current = get().sportProfiles ?? [];
    const idx = current.findIndex((sp) => sp.sport === data.sport);
    const next = idx >= 0 ? current.map((sp, i) => (i === idx ? updated : sp)) : [...current, updated];
    // Only after the server accepted the write: a failed save changes nothing.
    set({ sportProfiles: next, preferenceRevision: bumpRevision(get().preferenceRevision, [data.sport]) });
  },

  deleteSportProfile: async (sport) => {
    await api.delete<void>(`/users/me/sport-profiles/${sport}`);
    set({
      sportProfiles: (get().sportProfiles ?? []).filter((sp) => sp.sport !== sport),
      preferenceRevision: bumpRevision(get().preferenceRevision, [sport]),
    });
  },

  reset: () => {
    set({
      profile: null,
      identityPreferences: null,
      sportProfiles: null,
      photoUris: [],
    });
  },
}));
