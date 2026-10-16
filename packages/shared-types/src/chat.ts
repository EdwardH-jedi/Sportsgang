/**
 * Chat domain types.
 *
 * Messages are scoped to a match. Both participants can send and receive.
 */

import type { ISODateString, UUID } from './common';

export interface Message {
  id: UUID;
  matchId: UUID;
  senderId: UUID;
  body: string;
  createdAt: ISODateString;
}

export interface SendMessageRequest {
  body: string;
}

/**
 * GET /matches/:id/messages. Items are always oldest-first within a page.
 *
 * Query modes (mutually exclusive):
 *  - default: offset page from the start of history (legacy)
 *  - `latest=true`: newest `limit` messages
 *  - `before=<messageId>`: messages older than that message
 *  - `after=<messageId>`: messages newer than that message (catch-up)
 *
 * Cursor modes order by `(createdAt, id)` so equal timestamps page stably.
 */
export interface MessageListResponse {
  items: Message[];
  total: number;
  limit: number;
  offset: number;
  /** Another page exists in the direction being paged. */
  hasMore: boolean;
}
