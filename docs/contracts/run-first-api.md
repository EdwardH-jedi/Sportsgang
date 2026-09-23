# Run-first API: crews, group runs and geo discovery

Backend contract for the run-first redesign. Everything here is
**additive**: the live v1.0 app sends none of the new parameters or fields,
and the responses it reads keep every existing field unchanged. New
response fields are nullable and stay `null` for v1.0-style requests.

Wire format is snake_case. The TypeScript mirror (camelCase) lives in
`packages/shared-types/src/` (`crew.ts`, `event.ts`, `discovery.ts`,
`sport-profile.ts`). All routes need `Authorization: Bearer <token>`.

Migrations: `0016` (profile home location), `0017` (crews), `0018`
(group-run columns on `events`). All add nullable columns or new tables and
have a `downgrade()`.

## Privacy rules

| Data | Stored | Returned |
|---|---|---|
| Profile home (`home_lat`, `home_lng`) | rounded to 2 dp (~1 km) | never; own profile only gets `has_home_location` |
| Crew home point | rounded to 2 dp | never |
| Distance to a person or crew (`distance_km`) | n/a | rounded **up** to the next 0.5 km, minimum 1.0 |
| Group-run meeting point (`meeting_lat`, `meeting_lng`) | 5 dp, public | yes (it is a public place, used for map pins) |
| Distance to a meeting point (`distance_km_from_you`) | n/a | 1 dp |

Geo filtering uses a bounding-box SQL prefilter and an exact haversine check in
Python, so it behaves the same on PostgreSQL and on the SQLite test database.
`lat` and `lng` must be sent together (422 otherwise); `radius_km` is 1–50,
default 10.

## Profile home location

`PUT /users/me/profile`: the existing body gains optional `home_lat`
(−90..90) and `home_lng` (−180..180).

- Send both to set them. Send both as `null` to clear. Sending only one is a 422.
- Omit both to leave the stored value unchanged. v1.0 clients never send them.
- The response (`GET`/`PUT /users/me/profile`) gains `has_home_location: bool`.
  The coordinates are never serialised.

## Discovery (Runners)

`GET /discovery` gains the optional query parameters `lat`, `lng` and `radius_km`.

- **Without lat/lng**, the feed works as in v1.0. `PartnerCard.distance_km` is `null`.
- **With lat/lng**, the feed:
  - drops candidates with no home location or outside the radius;
  - orders the rest by coarse distance, then by the existing compatibility score;
  - gives each card a coarse `distance_km`.
- Blocking and already-acted-on exclusions apply in both modes. Pagination
  (`limit`/`offset`, `total`) is applied after the distance filter.

## Crews

A crew is a persistent group of runners with a home area and a pace band.
The creator becomes its `owner`. Only owners can edit or delete a crew.

**Blocking.** A crew is hidden from `GET /crews` if any of its owners has
blocked the caller, or the caller has blocked them. Detail and join return
404 for that crew, except when the caller is already a member. A member can
always see and leave their own crews. The detail member preview also leaves
out users in a block relationship with the caller.

**Moderation.** `name` and `description` go through content moderation
(422 on a hit).

### Objects

`CrewListItem`:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `name` | string | 1–60 chars, whitespace collapsed |
| `description` | string \| null | ≤ 500 chars |
| `sport` | string | lower-case, default `running` |
| `home_area` | string | display name, ≤ 80 chars |
| `pace_min_sec_per_km` | int \| null | 150–900 |
| `pace_max_sec_per_km` | int \| null | 150–900, ≥ min |
| `visibility` | `"public"` | only public crews for now |
| `created_by` | uuid \| null | audit only |
| `member_count` | int | |
| `my_role` | `"owner"` \| `"member"` \| null | caller's role |
| `distance_km` | float \| null | coarse; only when the list had lat/lng |
| `next_run` | CrewNextRun \| null | soonest upcoming open/full public run |
| `created_at` | datetime | |
| `updated_at` | datetime | |

`CrewNextRun` has these fields:

- `id`
- `title`
- `starts_at`
- `location_text`
- `distance_km`
- `pace_min_sec_per_km`
- `pace_max_sec_per_km`
- `spots_left`

`CrewDetail` has every `CrewListItem` field, plus:

- `members`: up to 12 `CrewMember` entries, owners first and then by join
  date. Each has `user_id`, `display_name`, `avatar_url`, `role` and `joined_at`.
- `upcoming_runs`: up to 10 `EventSummary` entries (the same shape as
  `/events`), soonest first.

### Endpoints

| Method & path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /crews` | query `lat`, `lng`, `radius_km`, `sport`, `q` (1–60, matches name or area case-insensitively), `mine` (bool), `limit` (1–50, 20), `offset` | 200 `{items: CrewListItem[], total, limit, offset}` | 422 |
| `POST /crews` | `name`, `home_area` (required); `description`, `sport`, `home_lat`+`home_lng`, `pace_min_sec_per_km`, `pace_max_sec_per_km`, `visibility` | 201 `CrewDetail` | 422 |
| `GET /crews/{id}` | – | 200 `CrewDetail` | 404 |
| `PATCH /crews/{id}` | any `POST` field; omitted = unchanged; `description`, the home pair and the pace bounds can be `null` | 200 `CrewDetail` | 403 not owner, 404, 422 (the pace band is re-checked against stored values) |
| `DELETE /crews/{id}` | – | 204 | 403 not owner, 404 |
| `POST /crews/{id}/join` | – | 200 `CrewDetail` | 404, 409 already a member |
| `DELETE /crews/{id}/membership` | – | 200 `{crew_id, crew_deleted}` | 404 not a member, 409 last owner while others remain |

List ordering:

- Without lat/lng: newest first.
- With lat/lng: coarse distance, then member count (highest first), then name.
  Crews without a home point are left out.
- `mine=true` lists the caller's crews and skips the block filter.

Leaving:

- A member leaving removes their membership.
- The **last owner cannot leave while other members remain** (409). They must
  delete the crew instead.
- An owner who is the only member dissolves the crew by leaving
  (`crew_deleted: true`).

Deleting a crew keeps its runs as ordinary events, with `crew_id` set to null.

Account deletion (`DELETE /auth/me`):

- If the deleted user was a crew's last owner, ownership passes to the
  longest-standing remaining member.
- Crews where they were the only member are deleted.

## Group runs (Events)

A group run is an `Event`, optionally attached to a crew. The `events`
table gains these nullable columns:

- `crew_id` (FK to `crews`, ON DELETE SET NULL)
- `meeting_lat`, `meeting_lng`
- `distance_km` (0.5–100)
- `pace_min_sec_per_km`, `pace_max_sec_per_km` (150–900, min ≤ max)

### `EventSummary` / `EventDetail`: new response fields

These are all `null` for ordinary events:

- `crew_id`
- `crew_name`
- `meeting_lat`
- `meeting_lng`
- `distance_km`
- `pace_min_sec_per_km`
- `pace_max_sec_per_km`
- `distance_km_from_you`: set only on a geo-filtered `GET /events`

### Endpoints

`POST /events` also accepts `crew_id`, `meeting_lat` + `meeting_lng` (as a pair),
`distance_km`, `pace_min_sec_per_km` and `pace_max_sec_per_km`, all optional.

- With a `crew_id`, the caller must be a crew member (403), and the crew must exist (404).

**New: `PATCH /events/{id}`.** Only the host can call it, and only while the
event is `open` or `full`.

- It is a partial update of `title`, `starts_at`, `location_text`, `capacity`,
  `description` and the group-run fields.
- `title`, `starts_at`, `location_text` and `capacity` cannot be set to null.
  Sport, mode and visibility cannot be changed.
- `capacity` must be at least the number of people already joined. The
  `open`/`full` status is recomputed after the change.
- Attaching a `crew_id` requires membership of that crew.
- Title and description are moderated.

Errors:

- 403: not the host, or not a member of the crew being attached
- 404: unknown event
- 422: validation, or a `cancelled`/`completed` event

`GET /events` gains optional filters. Without them it behaves as before.

| Param | Meaning |
|---|---|
| `crew_id` | only runs of that crew |
| `from` | `starts_at >= from` (ISO-8601) |
| `to` | `starts_at < to`; `from >= to` is a 422 |
| `lat`, `lng`, `radius_km` | only events whose meeting point is within the radius. Events without one are excluded in this mode only. Each item gets `distance_km_from_you`, and ordering stays `starts_at` ascending. |
