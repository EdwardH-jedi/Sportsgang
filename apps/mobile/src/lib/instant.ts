/**
 * API timestamps as instants (docs/run-golf-v2/CONTRACTS.md §9).
 *
 * The API sends every timestamp as ISO-8601 with an explicit offset
 * ("2026-10-02T15:30:00Z"). An offset-free value can only come from an API
 * that predates that contract, whose audit values were UTC wall time (its
 * default), so it is read as UTC — never in the device's zone, which is what
 * `new Date(iso)` does and what showed Sydney phones the wrong day.
 */

const HAS_OFFSET = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

/** Epoch milliseconds, or NaN when the value is missing or unparseable. */
export function parseInstant(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const value = iso.trim();
  return Date.parse(DATE_TIME.test(value) && !HAS_OFFSET.test(value) ? `${value}Z` : value);
}
