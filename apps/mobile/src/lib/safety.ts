/**
 * Safety API helpers (V1.1).
 *
 * Reports are submitted via the existing ReportScreen which calls
 * `api.post('/reports', ...)` inline. This module is intentionally
 * narrow — it exposes the block endpoint so screens that need to
 * trigger a block can do so without inlining a fetch.
 */

import { api } from './api';

export interface BlockResponse {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  /** Set by `GET /blocks`; null when the blocked user has no profile. */
  blockedDisplayName?: string | null;
}

export interface BlockListResponse {
  items: BlockResponse[];
  total: number;
}

/**
 * Block a user. Backend route is `POST /blocks/{blockedUserId}` and
 * is idempotent: repeated calls return the existing block.
 */
export async function blockUser(blockedUserId: string): Promise<BlockResponse> {
  return api.post<BlockResponse>(`/blocks/${blockedUserId}`);
}

/**
 * List users the caller has blocked. Backend returns `{ items, total }`;
 * each item is the directional block row (blocker -> blocked).
 */
export async function listBlockedUsers(): Promise<BlockListResponse> {
  return api.get<BlockListResponse>('/blocks');
}

/**
 * Unblock a previously blocked user. Backend returns 204; the helper
 * resolves to void.
 */
export async function unblockUser(blockedUserId: string): Promise<void> {
  return api.delete<void>(`/blocks/${blockedUserId}`);
}
