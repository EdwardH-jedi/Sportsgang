/**
 * Honor System (local champion titles) — read-only mobile API client.
 *
 * Backs the per-(sport, area) leaderboard and the "Annandale Tennis
 * Champion"-style title surfaces. The public Honor System API is
 * read-only by design: there is no mutation route, and this module
 * intentionally exposes none. The only writer is the future verified
 * challenge / tournament / group-event result hook on the backend.
 *
 * Distinct from `./rank.ts`, which talks to the legacy event-driven
 * `/rank/me` Honor / Gang Score endpoint.
 */

import { api } from './api';
import { DEFAULT_SPORT } from './sports';
import type {
  HonorTitleRead,
  RankProfileRead,
  RankingListResponse,
} from '@protin/shared-types';

export type {
  HonorTitleRead,
  RankProfileRead,
  RankingEntry,
  RankingListResponse,
} from '@protin/shared-types';

/**
 * Honor System `area` key for a profile suburb.
 *
 * The backend matches `area` verbatim (no normalisation) and derives the
 * title name with Python's `str.title()` ("annandale" → "Annandale Tennis
 * Champion"), so the canonical key is the lowercased suburb name with
 * whitespace collapsed — e.g. "Balmain East" → "balmain east". Returns
 * null when there is no usable suburb.
 */
export function areaFromSuburb(suburb: string | null | undefined): string | null {
  const normalized = (suburb ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * The signed-in user's primary sport for Honor System surfaces: the first
 * sport profile they saved, else the registry default (running).
 */
export function primarySport(
  sportProfiles: readonly { sport: string }[] | null | undefined
): string {
  return sportProfiles?.[0]?.sport ?? DEFAULT_SPORT;
}

function buildQuery(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    usp.set(k, v);
  }
  return usp.toString();
}

/**
 * Fetch the caller's rank profile in a given (sport, area).
 *
 * The backend GET is read-only and returns the default profile
 * (rating 1000, zero counts) for a brand-new user without persisting
 * a row, so callers can render the section unconditionally.
 */
export async function getMyRank(
  sport: string,
  area: string
): Promise<RankProfileRead> {
  return api.get<RankProfileRead>(
    `/rankings/me?${buildQuery({ sport, area })}`
  );
}

/** Fetch a (sport, area) leaderboard sorted by rating desc. */
export async function getRankings(
  sport: string,
  area: string
): Promise<RankingListResponse> {
  return api.get<RankingListResponse>(
    `/rankings?${buildQuery({ sport, area })}`
  );
}

/**
 * Fetch the current honor title for a (sport, area), or null if no
 * title has been awarded yet in that area.
 *
 * The backend returns a JSON `null` body when no title exists, which
 * the shared transformer passes through verbatim.
 */
export async function getCurrentHonor(
  sport: string,
  area: string
): Promise<HonorTitleRead | null> {
  return api.get<HonorTitleRead | null>(
    `/honors?${buildQuery({ sport, area })}`
  );
}

/** Fetch the list of honor titles the caller currently holds. */
export async function getMyHonors(): Promise<HonorTitleRead[]> {
  return api.get<HonorTitleRead[]>('/honors/me');
}
