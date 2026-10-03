/**
 * Shared invalidation boundary for group-session lists (review F8).
 *
 * Every successful session mutation (create / join / leave / cancel /
 * complete, see lib/events.ts) bumps `revision`. Mounted lists — the Explore
 * sessions list and My Plans — re-read the server when it changes, so a
 * returning screen shows the persisted participant count, open/full status
 * and Hosting/Joined state. Nothing about sessions is cached here; the
 * server stays the only source of truth, and a failed mutation never bumps.
 */

import { create } from 'zustand';

interface SessionSyncState {
  revision: number;
}

export const useSessionSync = create<SessionSyncState>(() => ({ revision: 0 }));

export function markSessionsChanged(): void {
  useSessionSync.setState((s) => ({ revision: s.revision + 1 }));
}
