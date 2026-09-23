import { useCallback, useState } from 'react';

import { submitReport, type ReportReason } from '../lib/safety';

interface UseReportResult {
  isSubmitting: boolean;
  submitted: boolean;
  error: string | null;
  /** POST /reports. Errors land in `error`; never throws. */
  submit: (reason: ReportReason, context?: string) => Promise<void>;
}

/**
 * Submit a user report for `reportedUserId`. Guards against double
 * submission while a request is in flight.
 */
export function useReport(reportedUserId: string): UseReportResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (reason: ReportReason, context?: string) => {
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      try {
        await submitReport({ reportedUserId, reason, context });
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit report.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [reportedUserId, isSubmitting]
  );

  return { isSubmitting, submitted, error, submit };
}

export type { ReportReason };
