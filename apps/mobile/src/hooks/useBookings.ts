import { useCallback, useEffect, useState } from 'react';

import { mapBackendError } from '../lib/sessionTime';
import {
  createBooking,
  getBooking,
  transitionBooking,
  type BookingAction,
  type CreateBookingRequest,
} from '../lib/sessions';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookingVenue {
  id: string;
  name: string;
  area?: string;
  address?: string;
  bookingUrl?: string;
  isBookable: boolean;
}

/** Full booking shape rendered by BookingDetail (GET /bookings/{id}). */
export interface BookingDetail {
  id: string;
  matchId: string;
  proposerId: string;
  partnerId: string;
  sport: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  partner: {
    userId: string;
    displayName: string;
    suburb?: string;
  };
  venue?: BookingVenue | null;
}

// ─── useBooking ──────────────────────────────────────────────────────────────

interface UseBookingResult {
  booking: BookingDetail | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Run an FSM transition and replace `booking` with the result. Throws on failure. */
  transition: (action: BookingAction) => Promise<void>;
}

/**
 * One booking by id plus its lifecycle transitions (confirm / decline /
 * cancel / complete / no-show). Mutations update `booking` in place from
 * the backend's response and rethrow on failure so the screen can alert.
 */
export function useBooking(bookingId: string): UseBookingResult {
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getBooking<BookingDetail>(bookingId);
      setBooking(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking.');
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const transition = useCallback(
    async (action: BookingAction) => {
      const updated = await transitionBooking<BookingDetail>(bookingId, action);
      setBooking(updated);
    },
    [bookingId]
  );

  return { booking, isLoading, error, refresh, transition };
}

// ─── useProposeSession ───────────────────────────────────────────────────────

export type ProposeSessionInput = Omit<CreateBookingRequest, 'matchId' | 'sport'>;

interface UseProposeSessionArgs {
  matchId: string;
  sport: string;
}

interface UseProposeSessionResult {
  isSubmitting: boolean;
  /** Friendly (mapped) server error from the last failed attempt. */
  error: string | null;
  /**
   * POST /bookings. Resolves with the new booking id on success — the
   * caller navigates away, so `isSubmitting` intentionally stays true to
   * keep the submit button locked. Resolves null on failure after setting
   * `error` and releasing `isSubmitting`.
   */
  propose: (input: ProposeSessionInput) => Promise<{ id: string } | null>;
}

export function useProposeSession({
  matchId,
  sport,
}: UseProposeSessionArgs): UseProposeSessionResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propose = useCallback(
    async (input: ProposeSessionInput) => {
      setError(null);
      setIsSubmitting(true);
      try {
        return await createBooking({
          matchId,
          sport,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          location: input.location,
          venueId: input.venueId,
          notes: input.notes,
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : '';
        setError(mapBackendError(raw));
        setIsSubmitting(false);
        return null;
      }
    },
    [matchId, sport]
  );

  return { isSubmitting, error, propose };
}
