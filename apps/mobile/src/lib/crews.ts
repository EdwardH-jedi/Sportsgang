/**
 * Crews API client (run-first). Thin wrapper over /crews — the shapes
 * live in @protin/shared-types (crew.ts). Coordinates sent in list
 * queries and crew home points are rounded to 2 dp first.
 */

import type {
  CreateCrewRequest,
  CrewDetail,
  CrewListQuery,
  CrewListResponse,
  LeaveCrewResponse,
  UpdateCrewRequest,
} from '@protin/shared-types';

import { api } from './api';
import { roundCoord } from './location';

export type {
  CreateCrewRequest,
  CrewDetail,
  CrewListItem,
  CrewListQuery,
  CrewListResponse,
  CrewMember,
  CrewNextRun,
  CrewRole,
  LeaveCrewResponse,
  UpdateCrewRequest,
} from '@protin/shared-types';

export function buildCrewQuery(params: CrewListQuery): string {
  const qs = new URLSearchParams();
  const hasGeo = params.lat !== undefined && params.lng !== undefined;
  if (hasGeo) {
    qs.set('lat', String(roundCoord(params.lat as number)));
    qs.set('lng', String(roundCoord(params.lng as number)));
    if (params.radiusKm !== undefined) qs.set('radius_km', String(params.radiusKm));
  }
  if (params.sport) qs.set('sport', params.sport);
  const q = params.q?.trim();
  if (q) qs.set('q', q.slice(0, 60));
  if (params.mine) qs.set('mine', 'true');
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.offset !== undefined) qs.set('offset', String(params.offset));
  const out = qs.toString();
  return out ? `?${out}` : '';
}

export function listCrews(params: CrewListQuery = {}): Promise<CrewListResponse> {
  return api.get<CrewListResponse>(`/crews${buildCrewQuery(params)}`);
}

export function getCrew(crewId: string): Promise<CrewDetail> {
  return api.get<CrewDetail>(`/crews/${crewId}`);
}

function roundHome<T extends { homeLat?: number | null; homeLng?: number | null }>(body: T): T {
  const out = { ...body };
  if (typeof out.homeLat === 'number') out.homeLat = roundCoord(out.homeLat);
  if (typeof out.homeLng === 'number') out.homeLng = roundCoord(out.homeLng);
  return out;
}

export function createCrew(body: CreateCrewRequest): Promise<CrewDetail> {
  return api.post<CrewDetail>('/crews', roundHome(body));
}

export function updateCrew(crewId: string, body: UpdateCrewRequest): Promise<CrewDetail> {
  return api.patch<CrewDetail>(`/crews/${crewId}`, roundHome(body));
}

export function deleteCrew(crewId: string): Promise<void> {
  return api.delete<void>(`/crews/${crewId}`);
}

export function joinCrew(crewId: string): Promise<CrewDetail> {
  return api.post<CrewDetail>(`/crews/${crewId}/join`);
}

export function leaveCrew(crewId: string): Promise<LeaveCrewResponse> {
  return api.delete<LeaveCrewResponse>(`/crews/${crewId}/membership`);
}

/**
 * The API answers 409 when the last owner tries to leave a crew that
 * still has members. The client only sees the message, so match on it.
 */
export function isLastOwnerError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /only owner/i.test(message);
}
