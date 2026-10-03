# Run + Golf v2 — contract note

Frozen before dependent UI work (todo.md Wave 1 gate). Python schemas
(`apps/api/app/schemas/*`), TypeScript contracts (`packages/shared-types`)
and the mobile read/write models must agree with this file. Wire format is
snake_case; `apps/mobile/src/lib/api.ts` converts to camelCase.

## 1. Sports

- Legacy `Sport` stays `gym | golf | tennis | running` everywhere (old
  clients, history, matches, bookings, events).
- v2 UI uses `FocusSport = running | golf`. Gym/tennis rows are never
  deleted or rewritten; the v2 app simply does not offer them.
- A user's active v2 sports are their `sport_profiles` rows whose sport is
  `running` or `golf`.

## 2. Sport profile v2 fields (`sport_profiles`, migration 0016)

All new columns are nullable. The migration adds columns only; it never
writes a value into an existing row.

| Column | Type | Meaning |
| --- | --- | --- |
| `preferences_version` | smallint | `NULL` = v2 preferences not configured (every pre-existing row). `2` = configured through the v2 flow. |
| `golf_handicap_tenths` | int | Signed handicap in tenths. `124` = 12.4. Plus handicaps are negative: `+2.1` → `-21`. Range `-100..540` (+10.0 … 54.0). |
| `golf_handicap_source` | varchar(20) | `official_index` / `estimate` / `none`. Self-reported; never a verification claim. |
| `golf_experience` | varchar(20) | `new` / `range` / `played_rounds` / `regular` |
| `golf_partner_intents` | json list | Subset of `similar_level`, `learn_from_experienced`, `welcome_beginners`, `any_level` |
| `golf_similarity_tolerance_tenths` | int | User-chosen max handicap gap for `similar_level`, `10..200` (1.0–20.0). `NULL` → documented product default **5.0** (`50`). |
| `golf_preferred_holes` | varchar(10) | `9` / `18` / `either`. `NULL` = not stated. |
| `run_pace_mode` | varchar(20) | `match_pace` / `social` |
| `run_pace_min_sec_per_km` | int | Fastest end of the comfortable pace range (fewest seconds per km). |
| `run_pace_max_sec_per_km` | int | Slowest end. |
| `run_distances_km` | json list | Preferred distances in km, each `0 < d <= 100`, one decimal, unique, ≤ 6 items. |
| `run_group_style` | varchar(30) | `stay_together` / `regroup_at_finish` / `pace_groups` |

### Display ↔ storage

- Handicap: display `"12.4"` ↔ `124`; display `"+2.1"` ↔ `-21`; display
  `"0.0"` ↔ `0`. Mobile helpers `parseHandicap` / `formatHandicap`
  (`apps/mobile/src/lib/sportPreferences.ts`) round-trip these.
- Pace: integer seconds per km; display `m:ss /km` (`390` ↔ `"6:30 /km"`).
  `"6.30"` is rejected by the mobile parser; the API only accepts integers.
  Social mode is a mode, not pace `0`.

### Missing / unknown / open-to-any are distinct

- Missing: column `NULL` (not stated).
- Unknown handicap: `golf_handicap_source = none`, handicap `NULL`.
- Open to any: `golf_partner_intents` contains `any_level`; running
  `run_pace_mode = social`.
- `preferences_version IS NULL` means the row predates v2 or was never
  completed; compatibility is never claimed for such a row.

### Server-side validation (on the merged row, i.e. existing values + patch)

- `golf_*` values are only accepted on `sport = golf` rows; `run_*` only on
  `sport = running` rows (422 otherwise).
- Handicap without a source is rejected; source `none` with a handicap is
  rejected; source `official_index`/`estimate` requires a handicap when the
  row is v2-configured.
- Pace bounds: both or neither; `120 <= min <= max <= 1200`.
- `preferences_version = 2` requires completeness:
  - golf: `golf_handicap_source`, `golf_experience`, at least one intent.
  - running: `run_pace_mode`; `match_pace` also requires the pace range.
- Intents / distances are de-duplicated; distances sorted ascending.

### Write semantics — `POST /users/me/sport-profiles` (upsert by sport)

- Legacy fields (`level`, `preferred_times`, `gym_name`, `golf_club`,
  `goals`) keep their existing full-replace behaviour. `level` stays
  required; the v2 UI asks the user for it explicitly (it is never derived
  from handicap or pace).
- v2 fields and `preferences_version`: **omitted = preserved**,
  **explicit `null` = cleared**, value = set. An old client that posts only
  legacy fields after a v2 edit therefore keeps every v2 value.
- Clearing a field that completeness requires while the row is v2 returns
  422; send `preferences_version: null` in the same request to un-configure.
- `GET /users/me/sport-profiles` and the POST response return every v2 field.

Example v2 golf write:

```json
{
  "sport": "golf", "level": "beginner", "preferred_times": ["morning"],
  "golf_club": null, "preferences_version": 2,
  "golf_handicap_tenths": null, "golf_handicap_source": "none",
  "golf_experience": "range", "golf_partner_intents": ["learn_from_experienced"],
  "golf_similarity_tolerance_tenths": null, "golf_preferred_holes": "9"
}
```

Example v2 running write:

```json
{
  "sport": "running", "level": "intermediate", "preferred_times": ["morning", "evening"],
  "preferences_version": 2, "run_pace_mode": "match_pace",
  "run_pace_min_sec_per_km": 330, "run_pace_max_sec_per_km": 390,
  "run_distances_km": [5, 10], "run_group_style": "stay_together"
}
```

## 3. Photos and onboarding completion

- `PUT /users/me/photos` accepts 1–4 files (was 2–4). Zero photos means the
  call is simply not made; photos and bio are optional for completion.
- Completion gate for entering the app stays "profile has display name,
  birth year and suburb". Missing v2 sport preferences are handled by a
  targeted setup prompt inside Explore/Profile, not a forced re-registration.

## 4. Discovery — `GET /discovery`

Query: `sport` (required), `limit` (1–50), `offset` (legacy), `cursor`
(v2, opaque), `strict_pace` (running only, bool).

- `sport ∈ {gym, tennis}`: unchanged legacy ranking (`_score_compatibility`,
  60% level / 40% time) and `compatibility = null` on every card.
- `sport ∈ {running, golf}`: v2 bilateral rules
  (`app/services/compatibility.py`). Candidates with an *established*
  incompatibility (intent or pace) are excluded; time fit can never offset
  that.
- Self, inactive users, users blocked in either direction and users the
  viewer already acted on for this sport stay excluded (unchanged).

Response additions (all additive):

```json
{
  "items": [PartnerCard], "total": 7, "limit": 20, "offset": 0,
  "next_cursor": "MjoxMjoz…" ,
  "viewer_setup_required": false,
  "pool_limit": 200
}
```

- `total`: number of eligible candidates inside the bounded scoring pool
  (the pool is the newest 200 users with a profile for the sport; `total`
  is counted *after* candidates with an established incompatibility are
  excluded), **not** global coverage.
- Ordering: tier (`compatible` > `unverified` > `needs_setup`), then
  integer fit points (desc), then `user_id` (asc). Deterministic.
- `cursor` encodes the last returned `(tier, points, user_id)`. The next page
  returns rows strictly after it, so hiding acted-on users between page
  loads cannot shift later candidates out of view (unlike `offset`).
  `next_cursor` is `null` on the last page. When `cursor` is sent, `offset`
  is ignored.
- `strict_pace=true` (running): only candidates whose *declared* pace range
  overlaps the viewer's declared range. Returns 422 if the viewer has no
  declared range.

`PartnerCard` additions:

```json
{
  "sport_profiles": [{
    "sport": "golf", "level": "beginner", "golf_club": null, "gym_name": null,
    "preferences_configured": true, "preferred_times": ["morning"],
    "golf_handicap_tenths": null, "golf_handicap_source": "none",
    "golf_experience": "range", "golf_partner_intents": ["learn_from_experienced"],
    "golf_preferred_holes": "9",
    "run_pace_mode": null, "run_pace_min_sec_per_km": null,
    "run_pace_max_sec_per_km": null, "run_distances_km": null, "run_group_style": null
  }],
  "compatibility": {
    "tier": "compatible",
    "reasons": [
      {"code": "more_experienced", "text": "More experienced than you (plays regularly vs driving-range experience)"},
      {"code": "welcomes_beginners", "text": "Welcomes beginners"}
    ],
    "caveats": [{"code": "handicap_self_reported", "text": "Handicaps are self-reported, not verified"}]
  }
}
```

- `tier`: `compatible` (both configured, bilateral rules pass on stated
  facts), `unverified` (both configured, nothing incompatible, but a fact the
  viewer's rule needs is unknown — e.g. a social runner without a declared
  pace), `needs_setup` (viewer or candidate has not configured v2
  preferences; no compatibility is claimed).
- Reasons are built only from stored values. No percentages.

### Bilateral rules (`app/services/compatibility.py`)

Golf pairs are admitted by **routes**; a pair is excluded unless at least
one route holds, and reasons are only taken from the routes that hold.

1. **Mutual** — each person's own non-learning intent admits the other:
   - `any_level`: admits anyone (never overrides the other person's rule).
   - `similar_level`: two numeric handicaps → gap ≤ *that person's*
     tolerance (default 5.0). Fewer than two handicaps → labelled fallback
     "similar experience" only when both experience bands are equal; never
     reported as a handicap match.
   - `welcome_beginners`: admits someone `new`/`range`, or someone the owner
     is demonstrably more experienced than (evidence rule below).
2. **Learning** (either direction) — the learner has
   `learn_from_experienced` **and** there is evidence the other person is
   more experienced (handicap at least 5.0 lower when both are numeric,
   otherwise a higher stated experience band) **and** that person explicitly
   selected `welcome_beginners` or `any_level` (review F3, todo.md "Golf
   rules"). A wide `similar_level` tolerance is not consent to play with a
   learner. `learn_from_experienced` admits nobody through the mutual route.

Explanation codes per route: mutual → `similar_handicap` /
`similar_experience`, plus the candidate's `welcomes_beginners` / `any_level`
when that is how the candidate admits the viewer; viewer learning →
`more_experienced` + the candidate's consent code (`welcomes_beginners` or
`any_level`); candidate learning → `learner_fit`. A pair admitted only by
`similar_level` therefore never carries a learning/mentoring reason, even
when one of them wants to learn.

Running and ordering (each person's own rule must admit the other):

- Running `match_pace`: the other person's *declared* range must overlap.
  Declared and non-overlapping → excluded; undeclared → `unverified` with a
  caveat and no "pace overlaps" reason. `social` imposes no pace rule.
- Fit points (ordering inside a tier only): shared preferred times (2 each,
  or 2 when either is flexible), shared run distances (2 each, max 4), same
  group style (2), compatible golf holes preference (1).

### Client contract

- `POST /discovery/actions` sends the sport the card was loaded for (kept
  with each loaded page), never the sport currently selected in the switch.
- Preference changes (review F4/F6): the profile store keeps a per-sport
  `preferenceRevision`, bumped only after the server accepted a save, clear
  or delete (or a re-fetch returned a different row). A loaded feed is only
  reused for the same sport, filter **and** revision; a change for the
  feed's sport drops it immediately and invalidates in-flight responses, so
  Explore re-asks the server and shows its new reasons. Ordinary
  detail → back navigation keeps the sport, filter and loaded feed.
- `strict_pace` is only sent while the viewer has their own declared range.
  When it disappears (range cleared, social without a range, running
  removed, legacy row) the filter is switched off and general browsing
  continues; a selected filter chip stays dismissible.
- Cards keep "Show interest" (`like`) semantics: mutual interest creates the
  existing match + chat; there is no invitation inbox.

## 5. Group sessions — `/events`

Internal name stays Event. Product copy says "session" / "round".

Request (`POST /events`) adds optional nested objects; legacy requests are
unchanged:

```json
{
  "title": "Saturday 10k", "sport": "running", "mode": "casual",
  "starts_at": "2026-10-10T20:30:00Z", "location_text": "Centennial Park, Paddington Gates",
  "capacity": 8, "description": null,
  "run_details": {
    "distance_km": 10, "pace_mode": "target_pace",
    "pace_min_sec_per_km": 330, "pace_max_sec_per_km": 360,
    "group_style": "stay_together", "beginner_friendly": false, "walk_breaks_ok": false
  }
}
```

```json
{
  "title": "Moore Park 9", "sport": "golf", "mode": "casual",
  "starts_at": "2026-10-11T21:00:00Z", "location_text": "Moore Park Golf",
  "capacity": 4,
  "golf_details": {
    "holes": 9, "tee_time_status": "planning", "estimated_cost_cents": 3500,
    "handicap_min_tenths": null, "handicap_max_tenths": null, "beginners_welcome": true
  }
}
```

Validation: `run_details` only with `sport = running`, `golf_details` only
with `sport = golf`, never both; details require `mode = casual`;
golf-with-details capacity 2–4, running-with-details capacity 2–50.
`target_pace` requires the pace pair (same bounds as profiles);
`social` forbids it. Handicap range is a pair or neither, `min <= max`.

Responses (`EventSummary` / `EventDetail`) add `run_details` and
`golf_details` (both `null` for legacy events). Storage: nullable `run_*` /
`golf_*` columns on `events` (migration 0016).

- `capacity` is the total including the host. `participant_count` already
  includes the auto-joined host; `spots_left = capacity - participant_count`.
  "4 golfers, 1 spot left" = capacity 4, three joined including the host.
- Session preferences (pace, beginner/walk-break flags, handicap range,
  beginners welcome) are **informational**. Only status (cancelled /
  completed) and capacity block joining — enforced server-side under the
  existing `SELECT … FOR UPDATE` row lock.
- `tee_time_status = secured` is the host's declaration, not a course
  booking or platform verification.
- `GET /events` adds `upcoming=true` (starts_at ≥ now) for Explore.

### Client session lists (review F8)

- Every successful create / join / leave / cancel / complete marks session
  lists stale (`stores/sessionSync.ts`); mounted lists re-read the server, so
  counts, open/full status and Hosting/Joined come from persisted state. A
  failed mutation marks nothing and nothing is shown optimistically.
- Explore re-reads its list whenever it is focused again (another account
  may have joined or cancelled) and on pull-to-refresh.
- The Explore list pages with the existing `limit`/`offset` (20 per page,
  "Show more sessions"); rows are de-duplicated by id. Known limit of offset
  paging: a session that becomes visible earlier in the order between two
  page loads shows up on the next refresh rather than mid-list.

### Participant lifecycle (review F1)

- Leaving is a soft leave (`status = left`, `left_at` set). Rejoining
  reactivates **the same** `event_participants` row (same `id`): `status`
  back to `joined`, `left_at = NULL`, `joined_at` = the rejoin instant. A user
  never has two rows for one event, and a rejoin is subject to the same
  capacity/status checks and row lock as a first join; a rejected rejoin
  writes nothing.
- `joined_at`, `left_at` and the attendance timestamps are all
  `TIMESTAMP WITH TIME ZONE` (migrations 0010/0011) and absolute UTC instants
  on the wire. The ORM previously declared `joined_at` as a naive `DateTime`,
  so SQLAlchemy bound the rejoin value as `TIMESTAMP WITHOUT TIME ZONE` and
  asyncpg rejected the aware UTC value (HTTP 500 on PostgreSQL only). The
  model now matches the migrated column; no migration or data rewrite was
  needed and existing values keep their meaning.

## 6. My Plans (client aggregation)

Sources, fetched independently **per segment** (review F2 — the client used
to read only the first 50 rows of each source in `starts_at` order, so 51+
past items hid every future plan):

- `GET /bookings?status=proposed,confirmed,completed,cancelled,declined,no_show&segment=upcoming|pending|past&as_of=…&limit=…&offset=…`
- `GET /events?mine=true&segment=upcoming|past&as_of=…&limit=…&offset=…`
  (hosted or currently joined, every status)

Segment rules (API and the mobile `buildPlanItems` agree; `as_of` is one
instant per load, offset-free means UTC, default now):

| Source | Upcoming | Pending | Past |
| --- | --- | --- | --- |
| Booking | `confirmed`/`accepted` and `ends_at > as_of` | `proposed` and `starts_at > as_of` | everything else (ended, never-confirmed past proposals, cancelled / declined / completed / no-show — even when future-dated) |
| Session | not `cancelled`/`completed` and `starts_at > as_of` | — | everything else |

- Order is `(starts_at, id)` ascending for Upcoming/Pending and descending
  for Past, so equal start times page deterministically. `total` is the
  segment total. Without `segment` both endpoints behave as before (all
  rows, ascending; `id` now breaks ties). `segment` on `/events` requires
  `mine=true` (422 otherwise). Authorization is unchanged: participant-only
  bookings, hosted-or-joined sessions.
- The client loads the first page (20) of every (segment, source) with one
  `as_of`, shows each segment as the merged prefix that is complete (never
  past a source's last loaded row while that source has more), and offers
  "Show more" per segment; a refresh re-reads as many rows as were shown
  (up to 50 per source).
- Items carry `{source: 'booking' | 'event', id}`; a booking id never
  collides with an event id in the UI, and a row seen twice keeps its newest
  version. Booking `proposed` stays "Pending"; nothing is shown as confirmed
  unless the API says so. A failure of one source is shown with retry while
  the other source still renders; a failed "show more" keeps the loaded rows
  and retries that page. Successful session mutations, focus and
  pull-to-refresh reload; an account switch drops the previous account's
  data and late responses.
- Known limit of offset paging inside one generation: a plan that changes
  segment between two page loads can be missed or repeated until the next
  refresh (repeats are de-duplicated).

## 7. Time

API timestamps are UTC ISO-8601. Mobile v2 screens render and collect
session times in `Australia/Sydney` regardless of device timezone
(`apps/mobile/src/lib/sydneyTime.ts`, rule-based AEST/AEDT conversion,
tested across DST boundaries, e.g. 2026-10-04 02:00 → 03:00).

### 1:1 booking instants — `POST /bookings` (review F5)

- `starts_at` and `ends_at` are each normalized to one absolute UTC instant
  **before** the order check, the past-time check and storage
  (`CreateBookingRequest`). The stored value never depends on the API
  process time zone (previously an offset-free value was stored relative to
  the process TZ: 09:00 under `TZ=UTC`, 22:00Z the previous day under
  `TZ=Australia/Sydney`).
- A value **with** an offset (`Z`, `+11:00`, `-05:00`, …) keeps its instant;
  equivalent offsets store identical values.
- **Legacy compatibility:** a value **without** an offset is accepted and
  interpreted as **UTC**. That is the convention the API's past-time check
  always applied to such values, and it matches what an API running in UTC
  stored. No device timezone is inferred. Older app builds that sent device
  wall time without an offset therefore keep the API-in-UTC interpretation;
  historical bookings are not rewritten (there is no record of the intended
  zone).
- The corrected composer (`BookingComposerScreen`) collects **Sydney wall
  time**, says so on screen ("Times are Sydney time (AEST/AEDT)"), converts
  both ends with `sydneyWallTimeToUtc` and sends aware UTC ISO strings
  (`2026-11-10T22:00:00.000Z`). Validation (order, 30 min–4 h length, not in
  the past) runs on those instants. A wall time inside the DST spring-forward
  gap is a validation error; a wall time in the autumn overlap resolves to the
  earlier (AEDT) instant, as documented on the helper.
- Booking detail, the in-chat proposal card and My Plans render booking
  times with the Sydney helpers (`formatSydneyDateTime` /
  `formatSydneyRange`) and label them as Sydney time.

## 8. Blocking and contact restriction (review R1)

Source of truth: `app/services/safety.py` (`ensure_contact_allowed`,
`is_contact_restricted`). A pair is **contact-restricted** while a block row
exists in either direction, or while either account is inactive or missing.
The block row stays directional (who blocked whom) but its effect is
bilateral.

### Denied while restricted

Every denial is `403` with the single detail **"You can't contact this
person."** — the same text for either block direction and for an inactive
account, so the blocked person cannot tell who blocked whom. Nothing is
written: no message, discovery action, match, booking, notification, rank or
honor row.

| Endpoint | Behaviour |
|---|---|
| `POST /matches/{id}/messages` | 403 |
| `GET /matches/{id}/messages` | 403 — history is hidden from **both** people (see below) |
| `GET /matches` | the match is omitted and `total` excludes it |
| `POST /discovery/actions` (like, pass, save) | 403; an unknown target is 404 |
| `POST /bookings` (new proposal) | 403 |
| `POST /bookings/{id}/confirm` | 403 (accepting is new contact) |
| `POST /challenges`, `POST /challenges/{id}/accept` | 403 |
| WebSocket `/matches/{id}/ws` | closes with **4003** at admission |

WebSocket admission now matches HTTP auth: an invalid token or a missing or
inactive account closes with **1008** (HTTP 401); a non-participant or a
restricted pair closes with **4003** (HTTP 403). A successful
`POST /blocks/{id}` closes every open chat socket between the pair (4003),
and every push re-checks the restriction, so a message that committed just
before a block is stored but not pushed after it. Socket bookkeeping is
in-process (one API process); the per-push check is what holds if that
changes.

A `proposal_received` push queued before a block is not delivered after it
(`failed_reason = "contact_restricted"`, row kept).

### Kept while restricted (history and commitments)

- **Messages are retained unchanged** in the database and are not readable
  through the API by either person while the restriction lasts. Unblocking
  makes the same history readable again and allows new messages, proposals
  and socket connections. Blocking never deletes messages, bookings, matches,
  reports or rank/honor history.
- **Existing bookings stay readable** to both people (`GET /bookings`,
  `GET /bookings/{id}`, My Plans), including the partner's name, so a
  commitment can still be identified and managed.
- Withdrawals and outcomes on existing bookings remain allowed: `decline`,
  `cancel` (and their notifications, so nobody travels to a cancelled
  session), `complete`, `no-show`. Already-scheduled reminders for a booking
  that stays confirmed are still sent.
- Reporting a blocked person still works.
- Account deletion is unchanged (hard delete; the pair's match, messages and
  bookings cascade away).

### Serialization

Contact writes lock the pair's two `users` rows `FOR SHARE` (in id order)
before reading `blocks`; block and unblock lock them `FOR NO KEY UPDATE`. A
write that commits before a block is ordinary pre-block history; a write
that waits on a block re-reads after it commits and is refused. Verified on
PostgreSQL in `tests_integration/test_contact_restriction.py`; SQLite (unit
suite) ignores the locking clause.

### Client

The app shows the API's detail text verbatim (e.g. a refused send keeps the
draft and alerts "Could not send — You can't contact this person."). Explore
blocking is a store-owned mutation (`stores/explore.ts`, review R4); the
server remains the authority.

## 9. Audit timestamps (review R6)

Appointment bounds (`starts_at`/`ends_at`) are aware columns governed by §7
and are unchanged here. This section covers **audit** timestamps — when
something was created or changed.

### Storage (unchanged columns)

Nine audit columns are `timestamp without time zone` with a `now()` default:
`messages.created_at`, `bookings.created_at`, `bookings.updated_at`,
`blocks.created_at`, `reports.created_at`, `notification_events.created_at`,
`push_tokens.created_at`, `calendar_booking_syncs.created_at`,
`google_calendar_tokens.connected_at` (checked in `information_schema` on a
fresh 0016 database; every other timestamp column is `timestamptz`). `now()`
stores wall time in the **writing session's** `TimeZone`, so the same
instant is stored ten hours apart under UTC and Sydney sessions. No column
type or row is changed by this repair.

### Future writes

Every API and Alembic connection pins the session `TimeZone` to
`DB_NAIVE_TIMEZONE` (`Settings.db_connect_args`, asyncpg `server_settings`),
default **UTC**. New naive values are therefore wall time in that zone
whatever the server's or database's default zone — verified on PostgreSQL
with a database whose default is `Australia/Sydney`. Tools that bypass the
API (psql, the local seed scripts under `apps/api/scripts`) do not get the
pin; they must run with that zone or not write these columns.

### On the wire

Every audit field is an aware UTC instant with an explicit offset —
`"2026-10-02T15:30:00Z"` — as `ISODateString` in shared-types already
promised: `MessageResponse.created_at` (HTTP and the WebSocket frame's
`createdAt`), `MatchResponse.created_at` / `last_message_at`,
`BookingResponse.created_at` / `updated_at`, `BlockResponse.created_at`,
`ReportResponse.created_at`, `PushTokenResponse.created_at`,
`GoogleCalendarStatus.connected_at` (`app/core/time.py`, `AuditInstant`).
Naive values are read in `DB_NAIVE_TIMEZONE`; aware values keep their
instant; null stays null. For a non-UTC zone a repeated wall time is the
earlier occurrence and a skipped one uses the offset before the transition.

### Client

`apps/mobile/src/lib/instant.ts` (`parseInstant`) reads timestamps as
instants. An offset-free value can only come from an API older than this
contract and is read as UTC (that API's default), never in the device's zone.
Chat previews and blocked dates show the instant in the device's zone; the
chat timeline orders messages and proposals by instant, then messages before
proposals, then id (`compareTimeline`), so equal instants and different
offset spellings sort the same every time.

### Legacy interpretation and provenance

Existing naive rows are read as wall time in `DB_NAIVE_TIMEZONE` (UTC
unless configured). Evidence for UTC in the repository: local, CI and the
staging compose stack use `postgres:16-alpine` without a `TZ`/`timezone`
override (its server default is `UTC`, confirmed on the disposable
verification database: `TimeZone = UTC`, source `configuration file`); no
code, migration or deployment file sets a session or database zone.
Production is Fly managed Postgres (`fly postgres create`, region `syd`);
its historical `TimeZone` is **not verifiable from the repository** and was
not inspected (no remote access was used). Until it is verified, the UTC
reading of production history is an assumption.

Read-only verification on the production database (no writes):

```sql
SHOW timezone;
SELECT setting, source, sourcefile FROM pg_settings WHERE name = 'TimeZone';
SELECT coalesce(d.datname, '*') AS db, coalesce(r.rolname, '*') AS role, s.setconfig
  FROM pg_db_role_setting s
  LEFT JOIN pg_database d ON d.oid = s.setdatabase
  LEFT JOIN pg_roles r ON r.oid = s.setrole;
-- Per-period evidence: a proposal's naive bookings.created_at and its
-- proposal_received notification's aware scheduled_at (timestamptz, set from
-- UTC in Python) are written by the same request, so their difference is
-- the session zone's offset at the time of that write (0 h = UTC).
SELECT date_trunc('month', n.scheduled_at) AS month,
       round(extract(epoch FROM b.created_at - (n.scheduled_at AT TIME ZONE 'UTC')) / 3600) AS offset_hours,
       count(*)
  FROM bookings b
  JOIN notification_events n ON n.booking_id = b.id AND n.notification_type = 'proposal_received'
 GROUP BY 1, 2 ORDER BY 1, 2;
```

- All UTC (and no per-role/database override ever applied) → keep the
  default; the contract above is exact for history and future writes.
- One other zone `Z` throughout → deploy with `DB_NAIVE_TIMEZONE=Z`; history
  and new writes then share that zone and are read back correctly.
- Mixed or unknown → keep UTC for new writes and treat earlier rows as
  approximate; an explicit, reversible column migration
  (`ALTER COLUMN … TYPE timestamptz USING col AT TIME ZONE '<zone>'`, with
  the inverse `… TYPE timestamp USING col AT TIME ZONE '<zone>'`) is only
  justified once the zone of each period is known, and must be tested on a
  copy first.
