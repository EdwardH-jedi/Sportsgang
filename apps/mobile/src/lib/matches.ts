/**
 * Match + chat API helpers.
 *
 * Thin wrappers over `lib/api` so hooks (useMatches, useChat) don't inline
 * endpoint strings. No caching and no React state here — the hooks own
 * loading / error / refresh.
 */

import { api, BASE_URL } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchPartnerSummary {
  userId: string;
  displayName: string;
  suburb?: string;
  sportProfiles: { sport: string; level: string }[];
}

export interface MatchSummary {
  id: string;
  sport: string;
  status: string;
  createdAt: string;
  partner: MatchPartnerSummary;
  // Last-message preview fields. All optional so a brand-new match (no
  // messages yet) still satisfies the type — render the empty-state
  // fallback in that case.
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  lastMessageSenderId?: string | null;
}

export interface MatchListResponse {
  items: MatchSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ChatMessageListResponse {
  items: ChatMessage[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function listMatches(limit = 50): Promise<MatchListResponse> {
  return api.get<MatchListResponse>(`/matches?limit=${limit}`);
}

export async function listMessages(
  matchId: string,
  limit = 100
): Promise<ChatMessageListResponse> {
  return api.get<ChatMessageListResponse>(
    `/matches/${matchId}/messages?limit=${limit}`
  );
}

export async function postMessage(
  matchId: string,
  body: string
): Promise<ChatMessage> {
  return api.post<ChatMessage>(`/matches/${matchId}/messages`, { body });
}

/** WebSocket URL for real-time messages on a match (auth via query token). */
export function matchSocketUrl(matchId: string, token: string): string {
  const wsBase = BASE_URL.replace(/^http/, 'ws');
  return `${wsBase}/matches/${matchId}/ws?token=${token}`;
}
