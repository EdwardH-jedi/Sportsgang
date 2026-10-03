/**
 * Common primitives shared across all Protin domains.
 *
 * Keep this file minimal — only add a type here if at least two
 * domain files need it. Domain-specific primitives live in their
 * own file.
 */

// ---------------------------------------------------------------------------
// Scalar aliases
// ---------------------------------------------------------------------------

/** UUID v4 string. Branded only in documentation; at runtime it is a string. */
export type UUID = string;

/**
 * ISO 8601 datetime string, always in UTC.
 * Example: "2025-06-15T09:00:00Z"
 *
 * All timestamps crossing the API boundary use this format, including the
 * audit timestamps that the database stores without a zone
 * (docs/run-golf-v2/CONTRACTS.md §9). Parse with the mobile
 * `parseInstant` helper, never as device-local time.
 * Localisation for display is the mobile app's responsibility.
 */
export type ISODateString = string;

/**
 * ISO 4217 currency code.
 * Example: "USD", "EUR", "KRW"
 */
export type CurrencyCode = string;

/**
 * IANA timezone identifier.
 * Example: "America/New_York", "Asia/Seoul"
 */
export type Timezone = string;

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

export interface GeoLocation {
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// API response envelopes
// ---------------------------------------------------------------------------

/**
 * Paginated list response.
 * Used for any endpoint returning a collection with limit/offset pagination.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Standard error response body.
 * The API returns this shape for all 4xx and 5xx responses.
 *
 * `code` is a machine-readable constant (e.g. "SLOT_ALREADY_BOOKED").
 * `message` is human-readable and safe to surface in UI.
 * `details` carries field-level validation errors when applicable.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
