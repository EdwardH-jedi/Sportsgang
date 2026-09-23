import { useCallback, useEffect, useState } from 'react';

import { api, BASE_URL } from '../lib/api';
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

export function useDiscovery(): UseDiscoveryReturn {
  const [partners, setPartners] = useState<PartnerCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sport, setSportState] = useState<Sport>(DEFAULT_SPORT);

  async function fetchPartners(selectedSport: Sport) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items: PartnerCard[] }>(
        `/discovery?sport=${selectedSport}&limit=${PAGE_LIMIT}`
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
  }, [sport]);

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
