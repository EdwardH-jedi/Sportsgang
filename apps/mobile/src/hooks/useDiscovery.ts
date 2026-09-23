import { useCallback, useEffect, useState } from 'react';

import { api, BASE_URL } from '../lib/api';
import { type Coords, roundCoord } from '../lib/location';
import { DEFAULT_SPORT, type Sport } from '../lib/sports';

// Discovery card photos are served as relative paths (`/media/...`) by the
// API. RN's <Image> needs absolute URIs, so we expand them at the data
// boundary here — every consumer of useDiscovery gets ready-to-render URLs.
function absolutizeMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${BASE_URL}${path}`;
}

export interface PartnerCard {
  userId: string;
  displayName: string;
  suburb?: string;
  bioExcerpt?: string;
  bio?: string;
  avatarUrl?: string;
  photoUrls?: string[];
  age?: number;
  sportProfiles: {
    sport: string;
    level: string;
    gymName?: string;
    golfClub?: string;
  }[];
  /** Coarse distance (km) — only when the feed was requested with coords. */
  distanceKm?: number | null;
}

interface ActionResponse {
  matchCreated: boolean;
  matchId?: string;
}

export interface UseDiscoveryReturn {
  partners: PartnerCard[];
  isLoading: boolean;
  error: string | null;
  sport: Sport;
  setSport: (s: Sport) => void;
  recordAction: (
    targetUserId: string,
    action: 'like' | 'pass' | 'save'
  ) => Promise<ActionResponse>;
  fetchMore: () => void;
}

const PAGE_LIMIT = 20;

export interface UseDiscoveryArgs {
  /**
   * Geo mode: with coords the feed only contains runners within
   * `radiusKm` of this point, nearest first, each with `distanceKm`.
   * Coordinates are rounded to 2 dp before they are sent.
   */
  coords?: Coords | null;
  /** 1–50 km (API default 10). Only applies with coords. */
  radiusKm?: number;
}

export function discoveryPath(sport: Sport, coords?: Coords | null, radiusKm?: number): string {
  let path = `/discovery?sport=${sport}&limit=${PAGE_LIMIT}`;
  if (coords) {
    path += `&lat=${roundCoord(coords.lat)}&lng=${roundCoord(coords.lng)}`;
    if (radiusKm !== undefined) path += `&radius_km=${radiusKm}`;
  }
  return path;
}

export function useDiscovery({ coords = null, radiusKm }: UseDiscoveryArgs = {}): UseDiscoveryReturn {
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSportState] = useState<Sport>(DEFAULT_SPORT);

  const lat = coords?.lat;
  const lng = coords?.lng;

  async function fetchPartners(selectedSport: Sport) {
    setIsLoading(true);
    setError(null);
    try {
      const geo = lat !== undefined && lng !== undefined ? { lat, lng } : null;
      const data = await api.get<{ items: PartnerCard[] }>(
        discoveryPath(selectedSport, geo, radiusKm)
      );
      if (!data || !Array.isArray((data as { items?: unknown }).items)) {
        throw new Error(
          `Unexpected response shape from /discovery — got: ${JSON.stringify(data)}`
        );
      }
      const normalized = data.items.map((item) => {
        // Only overwrite media URL fields when the item actually carries
        // them. Spreading `avatarUrl: undefined` would add an explicit
        // undefined property and break callers that compare items via
        // structural equality (incl. existing useDiscovery tests).
        const out: PartnerCard = { ...item };
        const absoluteAvatar = absolutizeMediaUrl(item.avatarUrl);
        if (absoluteAvatar !== undefined) out.avatarUrl = absoluteAvatar;
        if (item.photoUrls !== undefined) {
          out.photoUrls = item.photoUrls
            .map(absolutizeMediaUrl)
            .filter((u): u is string => typeof u === 'string');
        }
        return out;
      });
      setPartners(normalized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partners.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchPartners(sport);
    // fetchPartners reads lat/lng/radiusKm from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, lat, lng, radiusKm]);

  function setSport(s: Sport) {
    setSportState(s);
  }

  const recordAction = useCallback(
    async (
      targetUserId: string,
      action: 'like' | 'pass' | 'save'
    ): Promise<ActionResponse> => {
      const result = await api.post<ActionResponse>('/discovery/actions', {
        targetUserId,
        action,
        sport,
      });
      // Remove acted-upon partner from the local list
      setPartners((prev) => prev.filter((p) => p.userId !== targetUserId));
      return result;
    },
    [sport]
  );

  function fetchMore() {
    fetchPartners(sport);
  }

  return {
    partners,
    isLoading,
    error,
    sport,
    setSport,
    recordAction,
    fetchMore,
  };
}
