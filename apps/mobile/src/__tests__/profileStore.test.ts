/**
 * profile store rehydration tests
 *
 * Covers the cold-start retrieval slice from the photo persistence review:
 *  - fetchProfile() populates photoUris from the persisted profile.photos list
 *  - relative /media/... URLs are normalized to absolute URLs against BASE_URL
 *  - uploadProfilePhotos() exposes absolute URLs in photoUris
 */

import { useProfileStore } from '../stores/profile';
import { api, BASE_URL } from '../lib/api';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: 'https://api.example.test/' } },
    manifest2: null,
    manifest: null,
  },
}));

function resetStore() {
  useProfileStore.setState({
    profile: null,
    identityPreferences: null,
    sportProfiles: null,
    photoUris: [],
  });
}

describe('useProfileStore', () => {
  beforeEach(() => {
    resetStore();
    jest.restoreAllMocks();
  });

  it('fetchProfile rehydrates photoUris from persisted profile.photos in order', async () => {
    const profileResponse = {
      id: 'p1',
      userId: 'u1',
      displayName: 'Jordan Lee',
      bio: 'Hi',
      birthYear: 1990,
      suburb: 'Newtown',
      avatarUrl: '/media/profile_photos/u1/00.jpg',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      photos: [
        { id: 'ph2', photoUrl: '/media/profile_photos/u1/01.jpg', position: 1 },
        { id: 'ph1', photoUrl: '/media/profile_photos/u1/00.jpg', position: 0 },
      ],
    };

    const getSpy = jest
      .spyOn(api, 'get')
      .mockImplementation(async (path: string) => {
        if (path === '/users/me/profile') return profileResponse as any;
        if (path === '/users/me/identity-preferences') return null as any;
        if (path === '/users/me/sport-profiles') return [] as any;
        throw new Error(`Unexpected path: ${path}`);
      });

    await useProfileStore.getState().fetchProfile();

    const state = useProfileStore.getState();
    expect(state.photoUris).toEqual([
      `${BASE_URL}/media/profile_photos/u1/00.jpg`,
      `${BASE_URL}/media/profile_photos/u1/01.jpg`,
    ]);
    expect(state.profile?.avatarUrl).toBe(`${BASE_URL}/media/profile_photos/u1/00.jpg`);
    // The store keeps the canonical UserProfile shape — no photos field on it.
    expect((state.profile as any).photos).toBeUndefined();

    getSpy.mockRestore();
  });

  it('fetchProfile leaves photoUris empty when the profile has no persisted photos', async () => {
    const profileResponse = {
      id: 'p1',
      userId: 'u1',
      displayName: 'Jordan Lee',
      bio: null,
      birthYear: 1990,
      suburb: 'Newtown',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      photos: [],
    };

    const getSpy = jest
      .spyOn(api, 'get')
      .mockImplementation(async (path: string) => {
        if (path === '/users/me/profile') return profileResponse as any;
        if (path === '/users/me/identity-preferences') return null as any;
        if (path === '/users/me/sport-profiles') return [] as any;
        throw new Error(`Unexpected path: ${path}`);
      });

    await useProfileStore.getState().fetchProfile();

    expect(useProfileStore.getState().photoUris).toEqual([]);
    getSpy.mockRestore();
  });

  it('fetchProfile preserves already-absolute URLs without re-prefixing them', async () => {
    const absolute = 'https://cdn.example.com/u1/00.jpg';
    const profileResponse = {
      id: 'p1',
      userId: 'u1',
      displayName: 'Jordan Lee',
      bio: null,
      birthYear: 1990,
      suburb: 'Newtown',
      avatarUrl: absolute,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      photos: [
        { id: 'ph1', photoUrl: absolute, position: 0 },
        { id: 'ph2', photoUrl: '/media/profile_photos/u1/01.jpg', position: 1 },
      ],
    };

    const getSpy = jest
      .spyOn(api, 'get')
      .mockImplementation(async (path: string) => {
        if (path === '/users/me/profile') return profileResponse as any;
        if (path === '/users/me/identity-preferences') return null as any;
        if (path === '/users/me/sport-profiles') return [] as any;
        throw new Error(`Unexpected path: ${path}`);
      });

    await useProfileStore.getState().fetchProfile();

    const state = useProfileStore.getState();
    expect(state.photoUris).toEqual([
      absolute,
      `${BASE_URL}/media/profile_photos/u1/01.jpg`,
    ]);
    expect(state.profile?.avatarUrl).toBe(absolute);

    getSpy.mockRestore();
  });

  it('uploadProfilePhotos returns absolute URLs and stores them on photoUris', async () => {
    const formSpy = jest
      .spyOn(api, 'putForm')
      .mockResolvedValue({
        photos: [
          { id: 'ph1', photoUrl: '/media/profile_photos/u1/00.jpg', position: 0 },
          { id: 'ph2', photoUrl: '/media/profile_photos/u1/01.jpg', position: 1 },
        ],
        avatarUrl: '/media/profile_photos/u1/00.jpg',
      } as any);

    useProfileStore.setState({
      profile: {
        id: 'p1',
        userId: 'u1',
        displayName: 'Jordan Lee',
        avatarUrl: undefined,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      } as any,
    });

    const returned = await useProfileStore
      .getState()
      .uploadProfilePhotos(['file:///tmp/p1.jpg', 'file:///tmp/p2.jpg']);

    expect(returned).toEqual([
      `${BASE_URL}/media/profile_photos/u1/00.jpg`,
      `${BASE_URL}/media/profile_photos/u1/01.jpg`,
    ]);
    const state = useProfileStore.getState();
    expect(state.photoUris).toEqual(returned);
    expect(state.profile?.avatarUrl).toBe(`${BASE_URL}/media/profile_photos/u1/00.jpg`);

    formSpy.mockRestore();
  });
  // v2: partner (identity) preferences are optional, so a user who never
  // opened that screen has no row. That 404 must not fail fetchProfile —
  // Splash/Login treat a fetchProfile failure as "restart onboarding".
  it('fetchProfile treats a missing identity-preferences record as null', async () => {
    jest.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path === '/users/me/profile') {
        return { id: 'p1', userId: 'u1', displayName: 'Jordan Lee', photos: [] } as any;
      }
      if (path === '/users/me/identity-preferences') throw new Error('Preferences not found');
      if (path === '/users/me/sport-profiles') return [{ sport: 'running', level: 'beginner' }] as any;
      throw new Error(`Unexpected path: ${path}`);
    });

    await useProfileStore.getState().fetchProfile();

    const state = useProfileStore.getState();
    expect(state.profile?.displayName).toBe('Jordan Lee');
    expect(state.identityPreferences).toBeNull();
    expect(state.sportProfiles).toEqual([{ sport: 'running', level: 'beginner' }]);
  });

  it('fetchProfile still fails on a real identity-preferences error', async () => {
    jest.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path === '/users/me/profile') return { id: 'p1', userId: 'u1', displayName: 'J', photos: [] } as any;
      if (path === '/users/me/identity-preferences') throw new Error('HTTP 500');
      return [] as any;
    });
    await expect(useProfileStore.getState().fetchProfile()).rejects.toThrow('HTTP 500');
  });

  it('deleteSportProfile calls the API and drops only that sport locally', async () => {
    const deleteSpy = jest.spyOn(api, 'delete').mockResolvedValue(undefined as any);
    useProfileStore.setState({
      sportProfiles: [
        { sport: 'golf', level: 'beginner' },
        { sport: 'gym', level: 'advanced' },
      ] as any,
    });
    await useProfileStore.getState().deleteSportProfile('golf');
    expect(deleteSpy).toHaveBeenCalledWith('/users/me/sport-profiles/golf');
    expect(useProfileStore.getState().sportProfiles).toEqual([{ sport: 'gym', level: 'advanced' }]);
  });
});
