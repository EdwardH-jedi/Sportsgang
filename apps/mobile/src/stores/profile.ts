import { create } from 'zustand';
import type {
  IdentityPreferences,
  SetIdentityPreferencesRequest,
  SportProfile,
  UpsertSportProfileRequest,
  UserProfile,
} from '@protin/shared-types';

import { api, BASE_URL } from '../lib/api';

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
  // URLs returned by the backend after a successful PUT /users/me/photos.
  // Locally selected file URIs are held in screen-local state and are not
  // promoted into the store until the backend has persisted them.
  photoUris: string[];
  fetchProfile: () => Promise<void>;
  upsertProfile: (data: UpsertProfileInput) => Promise<void>;
  uploadProfilePhotos: (uris: string[]) => Promise<string[]>;
  upsertIdentityPreferences: (data: SetIdentityPreferencesRequest) => Promise<void>;
  upsertSportProfile: (data: UpsertSportProfileRequest) => Promise<void>;
  // Drop every cached field tied to the current session. Called from
  // auth.logout() so a logout/delete-account flow cannot leave a stale
  // profile (display name, photos, sport rows) visible to the next user.
  reset: () => void;
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

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  identityPreferences: null,
  sportProfiles: null,
  photoUris: [],

  fetchProfile: async () => {
    const raw = await api.get<ProfileResponse>('/users/me/profile');
    const identityPreferences = await api.get<IdentityPreferences>('/users/me/identity-preferences');
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
    set({ profile, identityPreferences, sportProfiles, photoUris });
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
    set({ sportProfiles: next });
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
