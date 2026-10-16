import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Message, MessageListResponse } from '@protin/shared-types';

import { api, BASE_URL } from '../lib/api';
import { compareMessages, mergeMessages } from '../lib/messages';

/**
 * Chat history + realtime sync for one match room.
 *
 * - History loads newest-first pages via `latest` / `before` cursors and is
 *   kept in one chronological, id-deduped list (see `mergeMessages`).
 * - The WebSocket reconnects with bounded exponential backoff; every
 *   (re)open, foreground return and screen focus runs an `after` catch-up
 *   so frames missed while disconnected are fetched over HTTP.
 * - Responses that land after the match changes or the screen unmounts are
 *   dropped (generation check), and sockets/timers are torn down.
 */

export type ChatConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline';

export const CHAT_PAGE_SIZE = 50;
const CATCH_UP_PAGE_SIZE = 100;
const MAX_CATCH_UP_PAGES = 5;
export const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
export const MAX_RECONNECT_ATTEMPTS = 6;
// Server closes with these when the token is invalid or the user is not a
// participant (routers/chat.py). Retrying cannot succeed.
const NO_RETRY_CLOSE_CODES = new Set([1008, 4003]);
// WebSocket.readyState values; spelled out so a test double without the
// static constants behaves the same.
const WS_CONNECTING = 0;
const WS_OPEN = 1;

export function useChatMessages(matchId: string, token: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [connection, setConnection] = useState<ChatConnectionState>('connecting');

  // Mirror of `messages` so cursors read the latest list without re-creating
  // callbacks on every message.
  const messagesRef = useRef<Message[]>([]);
  const generationRef = useRef(0);
  const loadedRef = useRef(false);
  const pendingCatchUpRef = useRef(false);
  const catchUpInFlightRef = useRef(false);
  const catchUpQueuedRef = useRef(false);
  const olderInFlightRef = useRef(false);
  const reconnectRef = useRef<(() => void) | null>(null);

  const commit = useCallback((next: Message[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const apply = useCallback(
    (incoming: Message[]) => commit(mergeMessages(messagesRef.current, incoming)),
    [commit]
  );

  // New match → new history. Cleanup also runs on unmount, invalidating any
  // request still in flight.
  useEffect(() => {
    commit([]);
    setHasOlder(false);
    setOlderError(false);
    loadedRef.current = false;
    pendingCatchUpRef.current = false;
    return () => {
      generationRef.current += 1;
      olderInFlightRef.current = false;
      catchUpInFlightRef.current = false;
      catchUpQueuedRef.current = false;
    };
  }, [matchId, commit]);

  const catchUp = useCallback(async (): Promise<void> => {
    if (!loadedRef.current) {
      // Initial load is still pending; it runs this once it lands.
      pendingCatchUpRef.current = true;
      return;
    }
    if (catchUpInFlightRef.current) {
      catchUpQueuedRef.current = true;
      return;
    }
    const gen = generationRef.current;
    catchUpInFlightRef.current = true;
    try {
      for (let page = 0; page < MAX_CATCH_UP_PAGES; page++) {
        const list = messagesRef.current;
        const newest = list[list.length - 1];
        if (!newest) {
          const res = await api.get<MessageListResponse>(
            `/matches/${matchId}/messages?latest=true&limit=${CHAT_PAGE_SIZE}`
          );
          if (gen !== generationRef.current) return;
          apply(res.items);
          setHasOlder(res.hasMore === true);
          return;
        }
        const res = await api.get<MessageListResponse>(
          `/matches/${matchId}/messages?after=${newest.id}&limit=${CATCH_UP_PAGE_SIZE}`
        );
        if (gen !== generationRef.current) return;
        apply(res.items);
        if (res.hasMore !== true) return;
      }
      // Too far behind to page forward: restart from the newest page rather
      // than leave a hole in the middle of the timeline.
      const res = await api.get<MessageListResponse>(
        `/matches/${matchId}/messages?latest=true&limit=${CHAT_PAGE_SIZE}`
      );
      if (gen !== generationRef.current) return;
      // Keep anything at or after the page start (e.g. a WS frame that
      // raced this request) so only the stale, gapped prefix is dropped.
      const first = res.items[0];
      const kept = first
        ? messagesRef.current.filter((m) => compareMessages(m, first) >= 0)
        : messagesRef.current;
      commit(mergeMessages(kept, res.items));
      setHasOlder(res.hasMore === true);
    } catch {
      // Best effort — the next reopen / foreground / focus retries.
    } finally {
      if (gen === generationRef.current) {
        catchUpInFlightRef.current = false;
        if (catchUpQueuedRef.current) {
          catchUpQueuedRef.current = false;
          void catchUp();
        }
      }
    }
  }, [matchId, apply, commit]);

  /** Newest page. Throws so the caller can show its error state. */
  const loadLatest = useCallback(async (): Promise<void> => {
    const gen = generationRef.current;
    const res = await api.get<MessageListResponse>(
      `/matches/${matchId}/messages?latest=true&limit=${CHAT_PAGE_SIZE}`
    );
    if (gen !== generationRef.current) return;
    apply(res.items);
    setHasOlder(res.hasMore === true);
    loadedRef.current = true;
    if (pendingCatchUpRef.current) {
      pendingCatchUpRef.current = false;
      void catchUp();
    }
  }, [matchId, apply, catchUp]);

  const loadOlder = useCallback(async (): Promise<void> => {
    const oldest = messagesRef.current[0];
    if (!oldest || olderInFlightRef.current) return;
    const gen = generationRef.current;
    olderInFlightRef.current = true;
    setIsLoadingOlder(true);
    setOlderError(false);
    try {
      const res = await api.get<MessageListResponse>(
        `/matches/${matchId}/messages?before=${oldest.id}&limit=${CHAT_PAGE_SIZE}`
      );
      if (gen !== generationRef.current) return;
      apply(res.items);
      setHasOlder(res.hasMore === true);
    } catch {
      if (gen === generationRef.current) setOlderError(true);
    } finally {
      if (gen === generationRef.current) {
        olderInFlightRef.current = false;
        setIsLoadingOlder(false);
      }
    }
  }, [matchId, apply]);

  // ── WebSocket with bounded reconnect ──────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setConnection('offline');
      return;
    }
    let disposed = false;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const url = `${BASE_URL.replace(/^http/, 'ws')}/matches/${matchId}/ws?token=${token}`;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      clearTimer();
      setConnection(attempts === 0 ? 'connecting' : 'reconnecting');
      const sock = new WebSocket(url);
      ws = sock;

      sock.onopen = () => {
        if (disposed || ws !== sock) return;
        attempts = 0;
        setConnection('open');
        void catchUp();
      };

      sock.onmessage = (event) => {
        if (disposed || ws !== sock) return;
        try {
          apply([JSON.parse(event.data as string) as Message]);
        } catch {
          // ignore malformed frames
        }
      };

      sock.onclose = (event) => {
        if (disposed || ws !== sock) return;
        ws = null;
        if (NO_RETRY_CLOSE_CODES.has(event?.code) || attempts >= MAX_RECONNECT_ATTEMPTS) {
          setConnection('offline');
          return;
        }
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempts, RECONNECT_MAX_DELAY_MS);
        attempts += 1;
        setConnection('reconnecting');
        timer = setTimeout(connect, delay);
      };
    };

    // Fresh attempt budget: used by the manual Retry and on foreground.
    const reconnectNow = () => {
      if (disposed) return;
      if (ws && (ws.readyState === WS_OPEN || ws.readyState === WS_CONNECTING)) return;
      if (ws) {
        const stale = ws;
        ws = null;
        stale.close();
      }
      attempts = 0;
      connect();
    };
    reconnectRef.current = reconnectNow;

    connect();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (ws && ws.readyState === WS_OPEN) {
        void catchUp();
      } else {
        reconnectNow();
      }
    });

    return () => {
      disposed = true;
      reconnectRef.current = null;
      sub.remove();
      clearTimer();
      ws?.close();
      ws = null;
    };
  }, [matchId, token, apply, catchUp]);

  const reconnect = useCallback(() => reconnectRef.current?.(), []);

  return {
    messages,
    hasOlder,
    isLoadingOlder,
    olderError,
    connection,
    loadLatest,
    loadOlder,
    catchUp,
    reconnect,
    /** Merge a message obtained outside the hook (e.g. POST result). */
    addMessage: useCallback((m: Message) => apply([m]), [apply]),
  };
}
