import { useCallback, useEffect, useState } from 'react';

import {
  type CrewDetail,
  type LeaveCrewResponse,
  type UpdateCrewRequest,
  deleteCrew,
  getCrew,
  joinCrew,
  leaveCrew,
  updateCrew,
} from '../lib/crews';

export interface UseCrewResult {
  crew: CrewDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  join: () => Promise<CrewDetail | null>;
  /** Resolves with `crewDeleted` so the screen can leave a dissolved crew. */
  leave: () => Promise<LeaveCrewResponse | null>;
  update: (body: UpdateCrewRequest) => Promise<CrewDetail | null>;
  remove: () => Promise<void>;
}

/** One crew's detail plus its membership / owner actions. Actions throw on failure. */
export function useCrew(crewId: string | null): UseCrewResult {
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!crewId) return;
    setIsLoading(true);
    setError(null);
    try {
      setCrew(await getCrew(crewId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this crew.');
    } finally {
      setIsLoading(false);
    }
  }, [crewId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const join = useCallback(async () => {
    if (!crewId) return null;
    const next = await joinCrew(crewId);
    setCrew(next);
    return next;
  }, [crewId]);

  const leave = useCallback(async () => {
    if (!crewId) return null;
    const res = await leaveCrew(crewId);
    if (!res.crewDeleted) await refresh();
    return res;
  }, [crewId, refresh]);

  const update = useCallback(
    async (body: UpdateCrewRequest) => {
      if (!crewId) return null;
      const next = await updateCrew(crewId, body);
      setCrew(next);
      return next;
    },
    [crewId]
  );

  const remove = useCallback(async () => {
    if (!crewId) return;
    await deleteCrew(crewId);
  }, [crewId]);

  return { crew, isLoading, error, refresh, join, leave, update, remove };
}
