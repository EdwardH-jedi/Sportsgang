/**
 * Account-level API helpers.
 */

import { api } from './api';

/**
 * Permanently delete the signed-in user's account (`DELETE /auth/me`).
 * Callers are responsible for clearing the local session afterwards.
 */
export async function deleteAccount(): Promise<void> {
  await api.delete('/auth/me');
}
