/**
 * Pure helpers for chat message lists.
 *
 * Centralized so every code path that mutates the message array
 * (initial fetch, optimistic POST result, WebSocket frame, retry) goes
 * through the same dedup logic. Without this, a race between the POST
 * response and the WS broadcast of the same message id can produce two
 * children with the same React key — the iPhone-real-device warning we
 * saw before this fix.
 */

import { parseInstant } from './instant';

interface IdLike {
  id: string;
}

/**
 * Return a new array with duplicates by `id` removed, keeping the first
 * occurrence of each id and preserving the original order.
 *
 * Order matters here: the server returns messages oldest-first, sendMessage
 * appends at the tail, and the WS handler also appends at the tail. Keeping
 * the FIRST occurrence preserves the chronological order the user already
 * sees on screen even when a duplicate frame arrives later.
 */
export function dedupeMessagesById<T extends IdLike>(messages: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

// ─── Preview helpers (matches list / chat list row) ──────────────────────────

/**
 * Sanitize a raw message body for one-line preview display.
 *
 * - Returns '' for null/undefined so callers can branch on falsy.
 * - Trims surrounding whitespace.
 * - Collapses any internal whitespace (including newlines) to single
 *   spaces so a multi-line message reads as one line.
 *
 * Does NOT truncate — let `numberOfLines={1}` + `ellipsizeMode="tail"`
 * on the host Text handle truncation visually.
 */
export function previewText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Short timestamp for a chat-list preview row.
 *
 * - Same calendar day as `now` → time only (locale-formatted, e.g. `9:30 AM`).
 * - Older → short month + day (e.g. `May 6`).
 * - null / undefined / unparseable → '' so callers can skip rendering.
 * - The value is read as an instant (lib/instant.ts), then shown in the
 *   device's zone.
 */
export function formatPreviewTimestamp(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  const ms = parseInstant(iso);
  if (Number.isNaN(ms)) return '';
  const d = new Date(ms);

  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Chat timeline order ─────────────────────────────────────────────────────

export interface TimelineKey {
  kind: 'message' | 'proposal';
  createdAt: string;
  id: string;
}

/**
 * Chronological order for the merged chat timeline (messages + session
 * proposals): by instant, not by string — "…Z" and "+11:00" spellings of one
 * instant are equal — then messages before proposals, then id, so equal
 * instants always land in the same order.
 */
export function compareTimeline(a: TimelineKey, b: TimelineKey): number {
  const byTime = (parseInstant(a.createdAt) || 0) - (parseInstant(b.createdAt) || 0);
  if (byTime !== 0) return byTime;
  if (a.kind !== b.kind) return a.kind === 'message' ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
