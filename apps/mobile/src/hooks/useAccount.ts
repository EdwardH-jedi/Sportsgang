import { useCallback } from 'react';

import { deleteAccount as deleteAccountApi } from '../lib/account';

interface UseDeleteAccountResult {
  /** DELETE /auth/me. Throws on failure; does not touch the local session. */
  deleteAccount: () => Promise<void>;
}

/**
 * Account deletion. Kept separate from the auth store so the caller
 * controls ordering (delete → logout → reset navigation) and so a failed
 * delete never logs the user out.
 */
export function useDeleteAccount(): UseDeleteAccountResult {
  const deleteAccount = useCallback(() => deleteAccountApi(), []);
  return { deleteAccount };
}
