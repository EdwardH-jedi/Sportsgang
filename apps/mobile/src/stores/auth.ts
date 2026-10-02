import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AppleSignInRequest, MeResponse, TokenResponse } from '@protin/shared-types';

import { api, setToken } from '../lib/api';
import { useExploreStore } from './explore';
import { useProfileStore } from './profile';
import { useSetupDraft } from './setupDraft';

const TOKEN_KEY = 'protin.auth.token';

interface AuthState {
  token: string | null;
  user: MeResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginWithApple: (payload: AppleSignInRequest) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
}

/**
 * Monotonically increasing operation counter shared by every auth path that
 * mutates the global `api._token` or the in-memory `user`. Each
 * initialize/login/register/loginWithApple/logout captures `++authOpVersion`
 * at start; once captured, ANY subsequent auth operation invalidates the
 * captured number, and the in-flight call must drop its results without
 * touching the api token, SecureStore, or the store.
 *
 * Why: backend evidence (Chris/Sarah real-device test, both messages saved
 * with sender_id = Sarah) proves the bearer header at POST time was Sarah's
 * even when the UI believed it was Chris. The structural cause is that
 * `setToken` is global and several async paths (initialize's /auth/me,
 * hydrate's /auth/me, logout) can resolve out of order. Without a guard, a
 * delayed /auth/me from a stale operation can re-pin the api token / user
 * AFTER a later logout-then-login has already landed the new identity.
 *
 * The guard makes the invariant explicit: only the LATEST auth operation
 * may write identity. Stale results are silently dropped. This is invariant
 * regardless of which exact production trigger reopens the window
 * (background/foreground pauses, slow networks, iOS keychain hiccups,
 * StrictMode double-effects).
 */
let authOpVersion = 0;

function nextAuthOp(): number {
  authOpVersion += 1;
  return authOpVersion;
}

function isCurrent(op: number): boolean {
  return op === authOpVersion;
}

/**
 * After `/auth/login`, `/auth/register`, or `/auth/apple` returns a token,
 * persist the token and immediately fetch `/auth/me` so the in-memory `user`
 * is populated for the rest of the session. Without this hydration step, the
 * store's `user.id` only landed on cold-start (via `initialize()`), which
 * caused mid-session login / account-switch flows to enter screens with
 * `currentUserId = null` and rely on a brittle fallback that mis-rendered
 * chat ownership on the iPhone.
 *
 * If `/auth/me` fails after the token landed, mirror `initialize()`'s
 * conservative behavior: drop the just-stored token so the app stays in a
 * logged-out state rather than carrying a token without a user, and rethrow
 * a friendly error so the auth screen can surface it.
 *
 * Stale-op guard: every state mutation here is gated on `isCurrent(op)`. A
 * later logout/login increments the version, so a slow /auth/me from this
 * call cannot overwrite identity after the user has moved on.
 */
async function hydrateUserAfterToken(
  set: (partial: Partial<AuthState>) => void,
  accessToken: string,
  op: number
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  if (!isCurrent(op)) return;
  setToken(accessToken);
  set({ token: accessToken, user: null });
  try {
    const me = await api.get<MeResponse>('/auth/me');
    if (!isCurrent(op)) return;
    set({ user: me });
  } catch (err) {
    if (!isCurrent(op)) {
      throw err instanceof Error
        ? err
        : new Error('Signed in, but could not load your account. Please try again.');
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    set({ token: null, user: null });
    throw err instanceof Error
      ? err
      : new Error('Signed in, but could not load your account. Please try again.');
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isLoading: false,

  login: async (email, password) => {
    const op = nextAuthOp();
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/login', { email, password });
      await hydrateUserAfterToken(set, data.accessToken, op);
    } finally {
      // isLoading is UI affordance, not identity — safe to release even on
      // a stale op. Without this, a stale login would leave the spinner up.
      set({ isLoading: false });
    }
  },

  register: async (email, password) => {
    const op = nextAuthOp();
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/register', { email, password });
      await hydrateUserAfterToken(set, data.accessToken, op);
    } finally {
      set({ isLoading: false });
    }
  },

  loginWithApple: async (payload) => {
    const op = nextAuthOp();
    set({ isLoading: true });
    try {
      const data = await api.post<TokenResponse>('/auth/apple', {
        identityToken: payload.identityToken,
        nonce: payload.nonce,
        email: payload.email ?? undefined,
        name: payload.name ?? undefined,
        // Forwarded for server-side token exchange so account deletion can
        // revoke the user's Apple tokens (App Store 5.1.1(v)).
        authorizationCode: payload.authorizationCode ?? undefined,
      });
      await hydrateUserAfterToken(set, data.accessToken, op);
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    // Bump the version FIRST. Any hydrate/initialize whose /auth/me is in
    // flight must observe a stale op the moment it next checks, so it
    // cannot re-pin the api token or repopulate user after we clear here.
    nextAuthOp();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    set({ token: null, user: null });
    // Drop every session-bound row out of the profile store too.
    // Without this, a logged-out (or just-deleted) user could briefly see
    // the previous account's display name, photos and sport rows on the
    // Profile tab while navigation is being reset.
    useProfileStore.getState().reset();
    // Same for Explore: focus sport, filters and loaded partner cards are
    // account-specific (the persisted focus key is per user id).
    useExploreStore.getState().reset();
    useSetupDraft.getState().reset();
  },

  initialize: async () => {
    const op = nextAuthOp();
    try {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!stored) return;
      if (!isCurrent(op)) return;
      setToken(stored);
      const user = await api.get<MeResponse>('/auth/me');
      if (!isCurrent(op)) return;
      set({ token: stored, user });
    } catch {
      if (!isCurrent(op)) return;
      // Token may be invalid — clear it silently
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setToken(null);
    }
  },
}));
