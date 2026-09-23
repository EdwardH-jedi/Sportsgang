import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SessionProposalCardData } from '../components/SessionProposalCard';
import { api } from '../lib/api';
import {
  listMessages,
  matchSocketUrl,
  postMessage,
  type ChatMessage,
} from '../lib/matches';
import { dedupeMessagesById } from '../lib/messages';
import { listMatchProposals, transitionBooking } from '../lib/sessions';

// Booking shape returned by GET /bookings (camelCased by lib/api). Only the
// fields the in-chat proposal card needs are listed; the BookingDetail
// screen owns the wider shape.
export interface ChatProposal extends SessionProposalCardData {
  createdAt: string;
  updatedAt: string;
}

/**
 * Unified timeline entry. Text messages and proposal cards are merged in
 * `createdAt` order so the chat reads chronologically — a proposal sent
 * mid-conversation appears between the surrounding text bubbles, not pinned
 * to the top or bottom.
 */
export type ChatTimelineEntry =
  | { kind: 'message'; createdAt: string; message: ChatMessage }
  | { kind: 'proposal'; createdAt: string; proposal: ChatProposal };

export type ProposalResponse = 'confirm' | 'decline';

interface UseChatArgs {
  matchId: string;
  /** Auth token for the real-time socket. No socket is opened while null. */
  token: string | null;
  /**
   * Called after a WebSocket frame has been merged into `messages` — the
   * screen uses it to scroll the list to the end. Read through a ref, so
   * passing a new function each render does not reconnect the socket.
   */
  onIncomingMessage?: (message: ChatMessage) => void;
}

interface UseChatResult {
  messages: ChatMessage[];
  proposals: ChatProposal[];
  /** Messages + proposals merged chronologically (messages win ties). */
  timeline: ChatTimelineEntry[];
  isLoading: boolean;
  error: string | null;
  /** Re-fetch message history and proposals in parallel. */
  refresh: () => Promise<void>;
  /** Re-fetch proposals only (e.g. on focus after BookingComposer). */
  refreshProposals: () => Promise<void>;
  /** POST a message and merge it into `messages`. Throws on failure. */
  sendMessage: (body: string) => Promise<ChatMessage>;
  /** Accept / decline a proposal and patch it in place. Throws on failure. */
  respondToProposal: (
    bookingId: string,
    action: ProposalResponse
  ) => Promise<ChatProposal>;
  /** Block the chat partner. Throws on failure. */
  blockPartner: (partnerId: string) => Promise<void>;
}

/**
 * Data layer for a single match's chat: message history, session proposal
 * cards, the real-time WebSocket, and the chat's mutations.
 *
 * Every path that adds a message (initial fetch, POST result, WS frame)
 * goes through `dedupeMessagesById` so a race between the POST response and
 * the WS echo of the same id can never render a duplicate bubble.
 *
 * Note: `refresh` intentionally does not reset `error` / `isLoading`; this
 * mirrors the behaviour the chat screen shipped with.
 */
export function useChat({
  matchId,
  token,
  onIncomingMessage,
}: UseChatArgs): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposals, setProposals] = useState<ChatProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onIncomingRef = useRef(onIncomingMessage);
  useEffect(() => {
    onIncomingRef.current = onIncomingMessage;
  }, [onIncomingMessage]);

  const refreshProposals = useCallback(async () => {
    // Pull every non-cancelled booking on this match. Cancelled bookings
    // are intentionally hidden from the in-chat surface — once the
    // proposer cancels, the card is gone; users discover the cancellation
    // via /matches preview / BookingDetail rather than a stale chat row.
    const data = await listMatchProposals<ChatProposal>(matchId);
    // Defensive shape check: only render rows that have the fields the card
    // actually reads. Guards against unexpected backend payloads and makes
    // the chat resilient — a malformed item just doesn't appear instead of
    // crashing the screen.
    setProposals(
      data.items.filter(
        (p) =>
          p &&
          typeof p.proposerId === 'string' &&
          typeof p.partnerId === 'string' &&
          typeof p.startsAt === 'string' &&
          p.partner !== undefined &&
          p.partner !== null
      )
    );
  }, [matchId]);

  const refresh = useCallback(async () => {
    try {
      // Run both fetches in parallel so a slow /bookings doesn't delay the
      // text history (and vice-versa). Either failing surfaces a single
      // friendly error.
      const [msgRes] = await Promise.all([
        listMessages(matchId),
        refreshProposals(),
      ]);
      // Merge instead of replace: a WS-received message could have landed in
      // state while this fetch was in-flight (slow network, partner sent
      // mid-load). dedupeMessagesById keeps the FIRST occurrence so the
      // canonical history from data.items wins on overlap, and any tail-end
      // WS messages survive at the end. Defensive against duplicate rows in
      // the response too.
      setMessages((prev) => dedupeMessagesById([...msgRes.items, ...prev]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages.');
    } finally {
      setIsLoading(false);
    }
  }, [matchId, refreshProposals]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Real-time WebSocket connection ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const ws = new WebSocket(matchSocketUrl(matchId, token));

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data as string) as ChatMessage;
        // Same dedupe helper as sendMessage and refresh — a race between the
        // POST response and a WS echo of the same id can never duplicate.
        setMessages((prev) => dedupeMessagesById([...prev, incoming]));
        onIncomingRef.current?.(incoming);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
    };
  }, [matchId, token]);

  const sendMessage = useCallback(
    async (body: string) => {
      const msg = await postMessage(matchId, body);
      // Dedupe-on-append: the WebSocket may have already broadcast this same
      // id back to us before the POST response resolved.
      setMessages((prev) => dedupeMessagesById([...prev, msg]));
      return msg;
    },
    [matchId]
  );

  const respondToProposal = useCallback(
    async (bookingId: string, action: ProposalResponse) => {
      const updated = await transitionBooking<ChatProposal>(bookingId, action);
      // Optimistic-but-authoritative: trust the backend's response over
      // any in-flight refetch result. Replace the row in-place.
      setProposals((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      return updated;
    },
    []
  );

  const blockPartner = useCallback(async (partnerId: string) => {
    await api.post(`/blocks/${partnerId}`, {});
  }, []);

  // Merged chronological timeline. Stable: messages and proposals are
  // dropped in by createdAt (ascending) with messages winning ties so a text
  // echo never jumps ahead of the booking event it followed.
  const timeline = useMemo<ChatTimelineEntry[]>(() => {
    const entries: ChatTimelineEntry[] = [
      ...messages.map<ChatTimelineEntry>((m) => ({
        kind: 'message',
        createdAt: m.createdAt,
        message: m,
      })),
      ...proposals.map<ChatTimelineEntry>((p) => ({
        kind: 'proposal',
        createdAt: p.createdAt,
        proposal: p,
      })),
    ];
    entries.sort((a, b) => {
      if (a.createdAt === b.createdAt) {
        return a.kind === 'message' ? -1 : 1;
      }
      return a.createdAt < b.createdAt ? -1 : 1;
    });
    return entries;
  }, [messages, proposals]);

  return {
    messages,
    proposals,
    timeline,
    isLoading,
    error,
    refresh,
    refreshProposals,
    sendMessage,
    respondToProposal,
    blockPartner,
  };
}
