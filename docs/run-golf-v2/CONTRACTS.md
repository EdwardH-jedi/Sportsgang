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
  (newest 200 users with a profile for the sport, before exclusion of
  incompatible ones), **not** global coverage.
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

Each person's own intents must admit the other; a pair is excluded when
either side does not.

- Golf `any_level`: admits anyone (does not override the other person).
- Golf `similar_level`: two numeric handicaps → gap ≤ *that person's*
  tolerance (default 5.0). Fewer than two handicaps → labelled fallback
  "similar experience" only when both experience bands are equal; never
  reported as a handicap match.
- Golf `learn_from_experienced`: needs evidence the other is more
  experienced — handicap at least 5.0 lower when both are numeric,
  otherwise a higher stated experience band.
- Golf `welcome_beginners`: admits someone `new`/`range`, or someone the
  owner is demonstrably more experienced than (same evidence rule).
- Running `match_pace`: the other person's *declared* range must overlap.
  Declared and non-overlapping → excluded; undeclared → `unverified` with a
  caveat and no "pace overlaps" reason. `social` imposes no pace rule.
- Fit points (ordering inside a tier only): shared preferred times (2 each,
  or 2 when either is flexible), shared run distances (2 each, max 4), same
  group style (2), compatible golf holes preference (1).

### Client contract

- `POST /discovery/actions` sends the sport the card was loaded for (kept
  with each loaded page), never the sport currently selected in the switch.
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

## 6. My Plans (client aggregation)

Sources, fetched independently:

- `GET /bookings?status=proposed,confirmed,completed,cancelled,declined,no_show`
- `GET /events?mine=true` (hosted or currently joined, every status)

Items carry `{source: 'booking' | 'event', id}`; a booking id never collides
with an event id in the UI. Booking `proposed` stays "Pending"; nothing is
shown as confirmed unless the API says so. A failure of one source is shown
with retry while the other source still renders.

## 7. Time

API timestamps are UTC ISO-8601. Mobile v2 screens render and collect
session times in `Australia/Sydney` regardless of device timezone
(`apps/mobile/src/lib/sydneyTime.ts`, rule-based AEST/AEDT conversion,
tested across DST boundaries, e.g. 2026-10-04 02:00 → 03:00).
