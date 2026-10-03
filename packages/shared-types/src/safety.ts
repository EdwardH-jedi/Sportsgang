/**
 * Safety types — reports and blocks.
 *
 * Report: POST /reports
 * Block:  POST /blocks/{userId}
 *         DELETE /blocks/{userId}
 *         GET /blocks
 */

import type { ISODateString, UUID } from './common';

export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'fake'
  | 'harassment'
  | 'other';

/**
 * Report target kind. Matches the backend `target_type` column:
 *   - "user"  → report is about a user (reported_id required)
 *   - "event" → report is about an event (target_event_id required)
 */
export type ReportTargetType = 'user' | 'event';

/**
 * Moderation lifecycle of a report. Matches the backend `status` column.
 * Only "actioned" feeds Honor; the other states are inert.
 */
export type ReportStatus =
  | 'submitted'
  | 'reviewed'
  | 'dismissed'
  | 'actioned';

export interface CreateReportRequest {
  reportedUserId: UUID;
  reason: ReportReason;
  context?: string;
}

export interface ReportResponse {
  id: UUID;
  reporterId: UUID;
  reportedId: UUID;
  reason: ReportReason;
  context?: string;
  createdAt: ISODateString;
}

/**
 * Response shape for `GET /reports/mine` — a paginated list of the
 * caller's submitted reports. `total` mirrors the block-list pattern.
 */
export interface ReportListResponse {
  items: ReportResponse[];
  total: number;
}

export interface BlockResponse {
  id: UUID;
  blockerId: UUID;
  blockedId: UUID;
  createdAt: ISODateString;
  /** Set by `GET /blocks`; null when the blocked user has no profile. */
  blockedDisplayName?: string | null;
}

export interface BlockListResponse {
  items: BlockResponse[];
  total: number;
}

/**
 * Client-side helper shape for issuing a block. The block endpoint
 * uses `POST /blocks/{blockedUserId}` (path param only), so this is a
 * small request object the mobile client can pass around without
 * stringifying a bare UUID.
 */
export interface CreateBlockRequest {
  blockedUserId: UUID;
}
