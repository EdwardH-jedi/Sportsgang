/**
 * Safety API helpers (V1.1).
 *
 * Report + block endpoints, shared by ReportScreen (via useReport),
 * PublicProfile, BlockedUsers and the chat safety menu (via useChat).
 */

import { api } from './api';

export interface BlockResponse {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
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

export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'harassment' | 'other';

export interface SubmitReportRequest {
  reportedUserId: string;
  reason: ReportReason;
  context?: string;
}

/** File a user report. Backend route is `POST /reports`. */
export async function submitReport(body: SubmitReportRequest): Promise<void> {
  await api.post('/reports', body);
}
