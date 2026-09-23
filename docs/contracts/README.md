# Protin — Type Contracts

This directory documents the shared type contracts for the Protin platform.

---

## Source of truth hierarchy

```
apps/api/app/schemas/      ← canonical source of truth for field names and types
packages/shared-types/src/ ← TypeScript mirror of the API contract (camelCase)
apps/mobile/src/           ← consumes shared-types (read-only against this contract)
```

The **API schema** (Python/Pydantic) is the authoritative source for:
- Which fields exist in each response
- Field names (snake_case; mobile transforms to camelCase)
- Nullable vs required fields
- Enum values

The **shared-types package** must mirror the API schema exactly, using camelCase field names
(because the mobile `api.ts` client transforms snake_case → camelCase on every response).

The **mobile app** must not define its own local types for entities that have a shared-types
equivalent. Local inline types in screens are acceptable only for shapes that are never
shared across files.

---

## Contract ownership

| Layer | Owner | Edit rule |
|---|---|---|
| `apps/api/app/schemas/` | Backend teammate | Source of truth — changes here drive changes below |
| `packages/shared-types/src/` | Contracts teammate (Wave 8+) | Must stay in sync with API schemas |
| `docs/contracts/` | Contracts teammate | Document all changes and conventions |
| `apps/mobile/src/` | Mobile teammate | Must consume shared-types, not redefine types locally |

---

## Domain map

```
User                   Identity and authentication
  └─ User                id, email, isActive, createdAt  (user.ts)
  └─ UserProfile         displayName, bio, suburb, avatarUrl, birthYear  (sport-profile.ts)
  └─ IdentityPreferences openTo, ageRangeMin, ageRangeMax, maxDistanceKm  (sport-profile.ts)
  └─ SportProfile        sport, level, preferredTimes, gymName, golfClub, goals  (sport-profile.ts)

Discovery              Browsing potential workout partners (Discover tab)
  └─ PartnerCard         Summary shown in the discovery feed  (discovery.ts)
  └─ DiscoveryFilter     Query parameters for GET /discovery  (discovery.ts)
  └─ RecordActionRequest POST /discovery/actions payload  (discovery.ts)
  └─ RecordActionResponse matchCreated flag + optional matchId  (discovery.ts)

Match                  Mutual-interest entity (real DB record)
  └─ Match               id, sport, status, createdAt — base fields only  (match.ts)
  └─ MatchWithPartner    Match + partner PartnerCard — what the API actually returns  (match.ts)

Booking                Proposed sessions between matched partners
  └─ Booking             Base fields — API always returns enriched form  (booking.ts)
  └─ BookingDetail       Booking + partner PartnerCard — what the API actually returns  (booking.ts)
  └─ CreateBookingRequest POST /bookings payload  (booking.ts)

Chat                   Messages scoped to a match
  └─ Message             id, matchId, senderId, body, createdAt  (chat.ts)
  └─ SendMessageRequest  body  (chat.ts)

Google Calendar        Google Calendar integration (implemented)
  └─ GoogleCalendarStatus  connected, calendarId, connectedAt  (google-calendar.ts)
  └─ SyncBookingResponse   bookingId, googleEventId, syncStatus  (google-calendar.ts)

Notifications          Push token registration
  └─ RegisterPushTokenRequest  token, platform  (notifications.ts)
  └─ PushTokenResponse         id, userId, token, platform, createdAt  (notifications.ts)
  └─ PushNotificationData      type, bookingId  (notifications.ts)

Safety                 Reports and blocks
  └─ CreateReportRequest  reportedUserId, reason, context  (safety.ts)
  └─ ReportResponse       id, reporterId, reportedId, reason  (safety.ts)
  └─ BlockResponse        id, blockerId, blockedId, createdAt  (safety.ts)

Events / group runs    Battles and run-first group runs  (event.ts)
  └─ EventSummary        + optional crewId, crewName, meetingLat/Lng, distanceKm,
                           paceMin/MaxSecPerKm, distanceKmFromYou
  └─ GroupRunFields      optional run fields on Create/UpdateEventRequest
  └─ EventListQuery      GET /events filters incl. crewId, lat/lng/radiusKm, from/to

Crews                  Persistent running groups  (crew.ts)
  └─ CrewListItem        crew + memberCount, myRole, coarse distanceKm, nextRun
  └─ CrewDetail          CrewListItem + members (CrewMember[]) + upcomingRuns
  └─ Create/UpdateCrewRequest, CrewListQuery, LeaveCrewResponse

Calendar (future)      Availability scheduling — NOT YET IMPLEMENTED in the API
  └─ AvailabilityWindow   Recurring weekly block  (calendar.ts)
  └─ CalendarSlot         Single slot view  (calendar.ts)
  └─ CalendarSyncRequest  External provider OAuth  (calendar.ts)
```

---

## Architecture notes

### Wire format

FastAPI emits `snake_case` JSON by default. The mobile `api.ts` client transforms all keys:
- Outgoing requests: camelCase body keys → snake_case before sending
- Incoming responses: snake_case JSON keys → camelCase before returning to screens

Shared-types always use camelCase field names to match what screens receive after transformation.

```
API response (snake_case)       Mobile types (camelCase)
─────────────────────────       ────────────────────────
created_at        →             createdAt
display_name      →             displayName
birth_year        →             birthYear
sport_profiles    →             sportProfiles
match_id          →             matchId
proposer_id       →             proposerId
```

### Match response shape

The API's `MatchResponse` does NOT include `user1_id` / `user2_id`. Those are internal DB
fields (used to maintain the canonical pair). The API always returns the enriched shape with
`partner: PartnerCardResponse`. Mobile consumers must use `MatchWithPartner`, not `Match` directly.

### Booking response shape

Similarly, the API's `BookingResponse` always includes the `partner: PartnerCardResponse`.
There is no bare-booking endpoint. The base `Booking` type exists for type composition only.
Mobile consumers must use `BookingDetail`.

### User active status

The API's `UserResponse` uses `is_active: bool` (a boolean). There is no string `UserStatus`
field in the API contract. The previously exported `UserStatus` string union has been removed
from shared-types.

### Google Calendar vs generic CalendarSync

The implemented calendar feature is Google Calendar only, defined in `google-calendar.ts`.
The `calendar.ts` file contains placeholder types for a future general availability/scheduling
feature — those types have no corresponding API endpoints and must not be used in screens.

### DiscoveryAction leads to Match when mutual

```
User A likes User B  →  RecordActionResponse { matchCreated: false }
User B likes User A  →  RecordActionResponse { matchCreated: true, matchId: "..." }
                                              ↓
                                        Match entity created in DB
                                        (user1_id < user2_id, lexicographic)
```

### Paginated responses

Any endpoint returning a collection uses the `Paginated<T>` envelope:

```typescript
interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

### Timestamps

All timestamps are ISO 8601 UTC strings (`ISODateString`). Timezone conversion for display
is the mobile app's responsibility. Never store or transmit timestamps in local time
across the API boundary.

---

## How to update contracts

### When the API schema changes (Backend teammate changes a schema file)

1. Identify the changed field in `apps/api/app/schemas/{domain}.py`
2. Update the matching interface in `packages/shared-types/src/{domain}.ts`
   - Field names in shared-types use camelCase (the post-transform form)
   - Required → optional or vice versa must match the Pydantic field definition
3. Update `docs/contracts/naming.md` if a new field pattern is introduced
4. Check `apps/mobile/src/` for any local type definitions that duplicate the changed field
   — flag these as mobile-side mismatches for the Mobile teammate

### Adding a field to an existing entity

Edit the interface in `packages/shared-types/src/{domain}.ts`.
Verify the API schema has the matching field.
Update this README if the field changes the domain's architecture.

### Adding a new domain

1. Confirm the API schema exists in `apps/api/app/schemas/{domain}.py`
2. Create `packages/shared-types/src/{domain}.ts`
3. Export from `packages/shared-types/src/index.ts`
4. Add an entry to the domain map above
5. Add naming conventions in `docs/contracts/naming.md`

### Removing a field or type

1. Remove from the API schema first (Backend teammate)
2. Remove from `packages/shared-types/src/{domain}.ts`
3. Remove the export from `index.ts`
4. Search `apps/mobile/src/` for usages — flag to Mobile teammate

### Adding a status value

Status fields are string unions (not TypeScript enums). Add the new value to the union and
search the mobile codebase for exhaustive `switch` statements that will need updating.

---

## Consuming the shared-types package

The package is registered in the npm workspace root (`"packages/*"` in `workspaces`).

Import in mobile or other consumers:

```typescript
import type { User, PartnerCard, Match, MatchWithPartner, BookingDetail } from '@protin/shared-types';
```

Always import the enriched type for entities where the API always returns a partner/enriched form:
- Use `MatchWithPartner` not `Match`
- Use `BookingDetail` not `Booking`
