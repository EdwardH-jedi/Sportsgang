# SportsGang Run + Golf v2 — Overnight Implementation TODO

Created: 2026-10-03, Australia/Sydney.
Workflow: Claude implements during the user's sleep; Codex independently reviews at the next morning handoff.
Repository: https://github.com/EdwardH-jedi/Sportsgang
Inspected baseline: main at edfb30fe48eddda76ebc9f347581641f3550ed44.
This is a repository-grounded implementation brief, not evidence that implementation or tests have already passed.

## 0. How to use this file

사용 방법:
1. 이 파일을 실제 SportsGang checkout의 루트에 todo.md로 둔다. 기존 todo.md가 있다면 보존하고 이 파일을 별도 이름으로 두며 아래 프롬프트의 파일명만 바꾼다.
2. 해당 프로젝트를 Claude Code에서 열고 아래 Claude 시작 프롬프트를 전달한다.
3. 다음 기상 후 Claude의 구현 브랜치/worktree를 Codex에서 열고 Codex 검수 프롬프트를 전달한다.
4. 로고는 보류한다. 이번 작업은 기존 앱의 러닝·골프 개편이다.

Claude launch prompt:

    Read todo.md and the applicable repository guidance. You are the primary
    implementer for the authorized SportsGang running/golf redesign.
    Execute Waves 0–5 in order inside an isolated feature worktree. Implement
    working application changes, run the specified checks, and leave a complete
    implementation report with exact branch, paths, commits, evidence and blockers.
    Make routine decisions autonomously and record assumptions. Preserve existing
    data and app identity. Do not deploy, publish, submit to App Store, or push.
    If one environment-dependent check is blocked, continue independent work,
    label the missing evidence, and provide exact reproduction steps.
    Do not finish with only a plan or a visual mock. Follow the scope and
    acceptance criteria in this file.

Codex morning review prompt:

    Read todo.md and docs/run-golf-v2/IMPLEMENTATION_REPORT.md, then independently
    review the actual feature diff and current source. Verify branch, baseline,
    HEAD and worktree cleanliness. Re-run applicable checks in disposable local
    services and exercise the running and golf journeys. Treat Claude's report
    as a handoff, not proof. Review migrations, legacy-client compatibility,
    bilateral matching, feed races/pagination, event permissions/capacity and
    native UI behavior. Write docs/run-golf-v2/CODEX_REVIEW.md with prioritized
    findings, exact code locations, reproduction, test results and a verdict.
    Do not merge, publish, deploy, or silently change product scope. This turn
    is review; record needed fixes for the implementation follow-up.

## 1. Product decisions and scope

The product promise is:

    Find people and sessions that fit your level and the way you want to exercise.

Active v2 sports: running and golf. A user may choose either or both.
Running supports pace-compatible partners and explicitly social/flexible runs.
Golf supports similar-handicap partners and beginners meeting experienced
golfers who actively welcome beginner companions.

Deliver a working development version covering:

    configure sport preferences -> find a suitable person or session
    -> join a group session OR use the existing mutual-match/chat/booking flow
    -> see the resulting commitment in My Plans

This overnight scope preserves the existing 1:1 mutual-match model. Partner
cards may use "Show interest"; mutual interest opens the existing chat/booking
path. Do not label a like as a direct invitation with an acceptance inbox unless
that separate invitation lifecycle is actually implemented. Direct partner
invitations are follow-up work.

### Included

- Running/golf onboarding and editable sport preferences.
- Additive storage/API/shared-contract changes.
- Deterministic, explainable, bilateral partner compatibility.
- Run/Golf focus switch and session/partner discovery.
- Sport-specific group session forms and details.
- My Plans aggregating existing 1:1 bookings and joined/hosted group events.
- Reuse existing match-specific chat.
- Light outdoor visual restyle across the primary screens.
- Feed correctness fixes and meaningful regression/integration checks.
- Evidence, small wave commits, and a morning review handoff.

### Deferred

- New logo, app icon, illustration campaign or rebranding/package renaming.
- Group chat, recurring-event scheduler, waitlist and paid coaching marketplace.
- New direct partner invitation/acceptance lifecycle.
- Golf-course inventory, payments, booking integrations or handicap verification.
- GPS workout recording, training plans, AI recommendations and gamification expansion.
- Production deployment, remote DB migrations, EAS builds/updates/submission,
  App Store changes, remote messaging, GitHub push/PR/merge.
- A rewrite of the existing app or changes to the marketing web app.

## 2. Observed implementation facts

These facts were inspected on the baseline; recheck locally before editing.

| Area | Current implementation | Required change |
| --- | --- | --- |
| Sport contracts | gym/golf/tennis/running; level beginner/intermediate/advanced | Add typed running/golf details while retaining legacy values |
| Profile storage | sport_profiles stores generic level, time slots, gym_name, golf_club, goals | Add nullable sport-specific preferences without erasing old data |
| Partner ranking | 60% level proximity + 40% preferred-time overlap | Replace v2 personalized ranking with bilateral sport rules |
| Discovery hook | Initial sport is gym; fetchMore reloads the first page | Persist focus sport; real pagination; guard stale requests |
| Onboarding | Step 2 requires two photos and a nonempty bio; preferences precede sport setup | Start with sport needs; make photos/bio optional to complete onboarding |
| Navigation | Discover / Matches / Events / Profile | Explore / My Plans / Chats / Profile |
| Group events | create/list/join/leave/cancel/complete/attendance exist | Reuse them for running sessions and golf rounds |
| Event join | SELECT FOR UPDATE is already used | Preserve this; prove capacity behavior on PostgreSQL |
| Chat model | Message requires match_id | Keep 1:1 chat; do not pretend it is group chat |
| Profile ranks | tennis/annandale is hardcoded | Remove this foreground placeholder and related unnecessary reads |
| Theme | Near-black surfaces with neon-lime accents | Introduce consistent light outdoor tokens |
| Restyle branch | brand/sportsgang-restyle was 108 commits behind main | Start from current main, not this old branch |

Primary source locations:

- AGENTS.md
- packages/shared-types/src/sport-profile.ts
- packages/shared-types/src/discovery.ts
- packages/shared-types/src/event.ts
- apps/api/app/models/profile.py
- apps/api/app/models/event.py
- apps/api/app/models/chat.py
- apps/api/app/schemas/profile.py
- apps/api/app/schemas/discovery.py
- apps/api/app/schemas/events.py
- apps/api/app/routers/users.py
- apps/api/app/routers/discovery.py
- apps/api/app/routers/events.py
- apps/api/app/services/discovery.py
- apps/api/app/services/events.py
- apps/mobile/src/stores/profile.ts
- apps/mobile/src/hooks/useDiscovery.ts
- apps/mobile/src/hooks/useEvents.ts
- apps/mobile/src/lib/events.ts
- apps/mobile/src/lib/sessions.ts
- apps/mobile/src/navigation/RootNavigator.tsx
- apps/mobile/src/navigation/types.ts
- apps/mobile/src/theme/index.ts
- apps/mobile/src/screens/onboarding/
- apps/mobile/src/screens/discovery/DiscoveryScreen.tsx
- apps/mobile/src/screens/battles/
- apps/mobile/src/screens/events/EventsScreen.tsx
- apps/mobile/src/screens/profile/
- .github/workflows/ci.yml

## 3. Wave 0 — Preflight and isolated workspace

- [ ] Verify the current checkout's origin is this repository. Read applicable
  AGENTS.md, CLAUDE.md and narrower guidance.
- [ ] Record branch, HEAD, dirty files and existing worktrees without exposing secrets.
- [ ] Fetch origin/main when available. Create an isolated feature worktree and
  a new branch such as feat/run-golf-v2 from the latest verified main.
- [ ] Preserve unrelated dirty files, existing worktrees and any existing todo.md.
  Do not reset, clean, delete or stash the user's work automatically.
- [ ] Record both the inspected baseline above and the actual implementation base.
  A newer main is normal: inspect its delta and adapt. Do not stop solely because
  main advanced or an old suggested branch is unavailable.
- [ ] If fetch is unavailable, use a verified local main and explicitly record
  remote freshness as unverified. If repository identity is wrong, report the
  concrete blocker rather than guessing a checkout path.
- [ ] Read the installed package scripts, lockfiles, API migrations, test fixtures
  and Expo configuration before choosing commands.
- [ ] Establish a baseline for relevant checks. Distinguish baseline failures
  from regressions introduced by this work.
- [ ] Create docs/run-golf-v2/IMPLEMENTATION_REPORT.md and a concise contract note,
  CONTRACTS.md. Update this checklist as work progresses.
- [ ] Keep commits local and stage owned paths explicitly. Do not use a blanket
  git add that captures unrelated files or credentials.

Repository AGENTS.md assigns Codex planning/review and favors wave-based work.
The user explicitly assigns primary implementation to Claude here. Preserve
the remaining repository guidance and existing architecture.

## 4. Wave 1 — Contracts, migration and profile APIs

Freeze the contract before implementing dependent UI. Keep Python schemas,
TypeScript types, API casing transformation and mobile read/write models aligned.

### 4.1 Data semantics

- [ ] Retain legacy Sport values and existing generic level/time fields for old
  clients and history. Introduce an explicit v2 FocusSport of running/golf for
  the new UI instead of deleting gym/tennis enum support everywhere.
- [ ] Add nullable sport-specific fields, or equivalently typed related records.
  Use the existing SQLAlchemy/Alembic structure; document the final schema.
- [ ] Record whether v2 preferences were explicitly configured, using a version
  or completion marker. Existing rows must remain "not configured" until edited.
- [ ] Missing, unknown and "open to any" are distinct states. Never invent a
  handicap, running pace, verified credential or consent during migration.
- [ ] Old payloads that omit new fields must preserve existing new-field values.
  Explicit clearing must have documented null/empty semantics.
- [ ] Validate sport-specific combinations server-side, not only in the UI.

Required golf information:

| Field | Meaning |
| --- | --- |
| Handicap value | Optional numeric value; support plus-handicap representation consistently |
| Handicap source | Self-reported official index / estimate / no handicap; no verification claim |
| Experience | New / driving-range experience / played rounds / regular player |
| Partner intents | similar_level / learn_from_experienced / welcome_beginners / any_level; multi-select |
| Similarity tolerance | User-selected or explicitly documented product default when applicable |
| Preferred holes | Optional 9 / 18 preference |

Do not impose a blanket nonnegative handicap rule that excludes plus-handicap
players. Document display-to-storage conversion and test it.

Required running information:

| Field | Meaning |
| --- | --- |
| Pace mode | match_pace / social |
| Pace range | Optional minimum/maximum seconds per kilometre |
| Preferred distances | Positive kilometre values |
| Group style | stay_together / regroup_at_finish / pace_groups, as a preference |

Store pace numerically as seconds per kilometre. Render minutes:seconds per
kilometre. Validate complete pairs and ordered bounds; do not store "6:30" as
a decimal 6.30. Social mode is not pace zero.

- [ ] Preserve existing preferred-time slots and suburb. Do not promise precise
  partner distance: current user/profile models do not provide usable location
  coordinates for that computation.
- [ ] Keep existing identity-preference records compatible and move optional
  controls out of the main setup. Do not infer gender or other missing
  attributes from names/photos. Do not claim unsupported filters are enforced.
- [ ] Write an additive Alembic migration. Verify a fresh DB and an upgrade from
  populated baseline schema, including preserved user/profile/match/message/
  booking/event identifiers and relationships.
- [ ] Update profile read/write endpoints and discovery summaries so persisted
  sport details survive app restart and profile editing.
- [ ] Consolidate mobile response types with shared contracts where practical;
  useDiscovery currently duplicates the PartnerCard shape.
- [ ] Cover old-client writes after v2 edits, explicit clearing, missing values,
  invalid ranges and sport switching with meaningful tests.

Gate: persisted preferences and final API payload examples agree before Wave 2.

## 5. Wave 2 — Explainable bilateral matching and reliable feeds

- [ ] Extract pure running/golf compatibility functions from HTTP/DB plumbing.
- [ ] Keep self/inactive/blocked users excluded and preserve existing permissions.
- [ ] Apply each user's intent. A requester's willingness alone is insufficient.
- [ ] Use deterministic rules; no new LLM/provider dependency or artificial
  percentage "match accuracy".
- [ ] Return factual compatibility reasons and identify incomplete preferences.

### Golf rules

- Similar-level mode respects both users' configured similarity limits when
  both have numeric handicaps.
- Learn-from-experienced requires the other person to welcome beginners or
  explicitly accept any level, plus available evidence of relevant experience.
- "Any level" on one profile does not override the other person's restrictions.
- With missing handicaps, use explicitly supplied experience/generic level only
  as a labeled fallback. Never claim a numeric handicap match.
- Established skill/intent incompatibility must not be offset by a time score.

### Running rules

- Two match-pace profiles require overlapping declared pace ranges.
- A social preference does not prove that the person can meet a specific pace.
  Unknown pace may appear in general browsing with an honest label, but must not
  receive a "pace overlaps" reason or pass a strict pace filter.
- Social recommendations emphasize declared time/distance/group-style fit.
- Group/session pace is a plan for that session and can differ from profile defaults.

Examples to cover:

- [ ] Beginner seeking experience + experienced golfer welcoming beginners.
- [ ] Same beginner + experienced golfer who wants similar-level partners only.
- [ ] Similar golfers within both configured limits.
- [ ] Missing/estimated/plus handicaps without fabricated verification.
- [ ] Overlapping and non-overlapping running pace ranges.
- [ ] Social runner with unknown pace under general versus strict pace browsing.
- [ ] Legacy profile with missing v2 details; helpful setup prompt, no invented match.
- [ ] Blocking either direction hides the profile.

### Feed correctness

- [ ] Default to selected active focus sport; persist choice and scope/reset
  account-specific preferences on logout/account switching.
- [ ] fetchMore retrieves another page and appends without duplicate rows.
- [ ] Choose a stable pagination approach appropriate to sorted recommendations.
  Test an action between page loads: hiding acted-on users must not silently
  skip the next candidates due to a shifted offset.
- [ ] Sport/filter switches invalidate previous responses, errors and loading
  updates; a slow running response cannot overwrite the golf feed.
- [ ] Prevent a stale card action from being sent with the newly selected sport.
- [ ] Preserve the selected filters through detail/back navigation.
- [ ] Distinguish loading, no eligible results, missing preferences, offline/
  request failure and retry. Do not translate an API error into "no people".
- [ ] If retaining the existing bounded 200-candidate scoring pool, document the
  limit and count semantics; do not imply complete global coverage.

Gate: backend reasons, UI reasons, selected sport and loaded candidates agree.

## 6. Wave 3 — Onboarding, navigation and visual restyle

Recommended visual direction: off-white backgrounds, dark green text,
restrained lime primary actions, readable sport information and generous spacing.
This is an authorized starting direction; no new logo is required.

- [ ] Introduce shared semantic tokens and reusable primitives for focus switch,
  information chips, partner/session cards, form fields and primary actions.
- [ ] Avoid changing only theme colors while leaving screen-specific hardcoded
  dark backgrounds and inverse text unreadable.
- [ ] Use existing React Native/Expo navigation and state patterns; no new app,
  framework replacement or unnecessary UI dependency.
- [ ] Implement these top-level destinations:

| Tab | Responsibility |
| --- | --- |
| Explore | Run/Golf switch, sessions/partners views and applicable filters |
| My Plans | Upcoming/pending 1:1 bookings plus hosted/joined group events |
| Chats | Existing match conversations, with meaningful empty state |
| Profile | Editable running/golf details, account/settings |

- [ ] Existing bookings/messages remain reachable; preserve navigation parameters
  and existing authorized deep-link behavior where configured.
- [ ] Rework onboarding: basic identity/suburb -> active sport(s) ->
  relevant details/intent -> availability -> finish.
- [ ] Make photos and bio optional for completion. Check every completion gate
  and resume path; changing one MIN_PHOTOS constant is not sufficient.
- [ ] Existing users get a dismissible/targeted preference-completion flow,
  preserving their account and profile, rather than forced full registration.
- [ ] Focus partner cards on handicap/intent or pace/distance/style before gallery
  and general biography. Reasons must originate from real stored data.
- [ ] Remove foreground hardcoded tennis/annandale ranks and ranked-battle/
  Honor-risk/tournament/challenge promotion. Preserve their old stored data and
  APIs. Keep reporting, blocking, account deletion and account settings reachable.
- [ ] Keep displayed app name, bundle IDs, Apple Sign-in integration, auth storage,
  Expo project identity, versioning and release configuration stable.
- [ ] Do not rename @protin packages or rewrite app.config.js/eas.json for branding.
- [ ] Confirm keyboard-safe forms, touch targets, labels, text scaling, scroll
  behavior and contrast on the primary screens.

Native primary screens to complete: setup, Explore, partner detail, create
session, session detail and My Plans. Apply shared chrome to Chats/Profile so
the app does not switch visual systems between tabs.

Gate: a coherent working UI reads/writes the Wave 1 contracts.

## 7. Wave 4 — Sport-specific sessions and My Plans

Reuse the current /events model and lifecycle. "Sessions" is product-facing
terminology; avoid a wholesale internal Event-to-Session rename.

- [ ] Add typed running/golf event details, persisted and returned through shared
  contracts and APIs; do not hide all meaningful information in description text.
- [ ] New v2 creation exposes only running/golf and casual social sessions.
  Keep legacy event sports/modes readable and compatible for old clients/history.
- [ ] Session host is already auto-joined. Show total capacity including host;
  "4 golfers, 1 spot left" must mean three joined people including the host.
- [ ] Preserve permission checks, moderation, privacy of attendance outcomes,
  joins/leaves/cancellation/completion and existing row-lock behavior.
- [ ] Use stored venue information where available and allow an honest manual
  location fallback. Keep provider credentials server-side and existing required
  attribution if provider-backed results are used.
- [ ] Do not require a live paid/provider lookup for local development or checks.

Running session information:

- Distance, target pace or explicit social mode.
- Meeting point and group style.
- Beginner/walk-break welcome flags.
- Date/time, capacity, host and participants.

Golf session information:

- Course/location, tee time, 9/18 holes.
- Optional estimated cost in AUD cents.
- Suitable handicap range/experience and beginner-welcome intent.
- Tee-time status: host says secured / planning to book.
- Total players and remaining places.

"Tee time secured" is a host declaration, not platform verification or a course
inventory reservation. Participation in the app does not itself book a course.

- [ ] Session forms validate required sport fields and invalid combinations.
- [ ] Session requirements/preferences are explicit. Define and document which
  are informational and which block joining; enforce any hard gate server-side.
- [ ] Preserve server rejection explanations when a session becomes full,
  cancelled or completed while the user is viewing it.
- [ ] My Plans merges bookings and events using explicit source IDs/types;
  preserve pending versus confirmed state and do not create fake confirmations.
- [ ] Completed, cancelled and past items have intentional filters/history.
- [ ] Surface data-source failures with retry even if another source succeeds.
- [ ] Keep Sydney display time/date correct, with UTC API timestamps; exercise
  daylight-saving boundary cases and devices in another timezone.
- [ ] Preserve 1:1 booking proposals/confirmation and match chat. For group
  sessions, show host/location/attendance details without a fake chat button.
- [ ] Add isolated, labeled development data for both sports if needed; never
  create fictitious public users/events in production.

Gate: real two-account journeys reach persisted commitments in My Plans.

## 8. Wave 5 — Verification, commits and handoff

### 8.1 Repository commands confirmed on the inspected baseline

Run from repository root after checking lockfiles/runtime:

    npm ci
    npm run lint --workspace @protin/mobile
    npm run typecheck --workspace @protin/mobile
    npm run test:ci --workspace @protin/mobile -- --runInBand

Run from apps/api:

    uv sync --frozen --dev
    uv run ruff check .
    uv run ruff format --check .
    uv run pytest -q

For integration services only, after verified disposable configuration:

    uv run alembic upgrade head
    uv run pytest tests_integration -q

Current mobile package has no build script. Do not invent npm run build.
Use a local bundle check where supported, from apps/mobile:

    npx --no-install expo export --platform ios --output-dir dist-review/ios

Use local/development configuration pointing to disposable local services;
do not use EAS preview/production profiles or the existing remote Fly endpoint.
Keep generated export/log outputs out of tracked application source.

### 8.2 Isolated integration environment

- [ ] Provision an explicitly disposable PostgreSQL/Redis environment with a
  distinct Compose project/database and available non-production ports.
- [ ] Inspect config targets without printing secrets before any migration/test.
- [ ] Keep temporary credentials/env/config files ignored and task-scoped.
- [ ] Do not run infra:reset, docker compose down -v, or migrations against an
  existing user's database. Never borrow production service URLs.
- [ ] Follow the current CI's real-service environment shape. The API unit suite
  uses mocks/SQLite in parts and does not prove PostgreSQL locking.
- [ ] If Docker/native tooling is unavailable, complete independent work and
  record those checks as BLOCKED_ENV, with exact steps to reproduce. Do not
  remove checks, replace them with mocks and call integration verified.

### 8.3 Required behavior verification

- [ ] Running user completes setup, restarts app and retains pace/intent.
- [ ] Golf beginner and experienced golfer have compatible bilateral preferences.
- [ ] Incompatible expert intent is respected and recommendation reason is honest.
- [ ] Existing user with legacy sports and prior messages/bookings can log in,
  update v2 preferences and still access old history.
- [ ] Old payload after v2 setup does not erase new preferences.
- [ ] Actual page two, acted-on-user pagination and slow sport-switch races work.
- [ ] Running host creates a session; another account joins/leaves; My Plans agrees.
- [ ] Golf host creates a round; last place is filled; a further join is rejected.
- [ ] Two simultaneous users competing for the last event place are checked
  against real PostgreSQL; no oversubscription.
- [ ] Duplicate/repeated join does not increase participant count.
- [ ] Host cancel versus another user's join leaves a consistent final state.
- [ ] Outsiders cannot alter host state, attendance or other people's bookings.
- [ ] Existing 1:1 match/chat/booking confirmation remains functional.
- [ ] Offline/request failure is distinct from empty results.
- [ ] Signup/auth/logout/account deletion/report/block regressions are checked.
- [ ] Sydney local-time rendering and day-boundary/DST behavior are checked.

### 8.4 Visual/native verification

- [ ] Exercise the six primary screens in an available iOS simulator/device,
  preferably at a normal and a smaller iPhone viewport.
- [ ] Capture screenshots, screen names, device/runtime and source commit.
- [ ] Check keyboard overlap, scrolling, long names, missing photos, numeric
  input formatting and large text.
- [ ] Record native bundling and native runtime checks separately.
- [ ] Expo Web or mocked component screenshots may supplement evidence but do
  not count as a native device pass.
- [ ] Preserve availability limitations honestly; no manufactured screenshots
  or unchecked "all tests passed" statements.

### 8.5 Required handoff

Update docs/run-golf-v2/IMPLEMENTATION_REPORT.md with:

1. Status: READY_FOR_CODEX_REVIEW, PARTIAL or BLOCKED, with explicit reasons.
2. Worktree path, branch, original base, final HEAD and git status.
3. Summary of completed checklist items and every incomplete item.
4. File/change map and contract/migration decisions.
5. Exact commands, exit codes, executed test counts, log paths and tested commit.
6. Fresh DB and populated legacy-upgrade evidence.
7. PostgreSQL concurrency results; mocked tests clearly separated.
8. Native screenshots/runtime evidence and any unavailable environment.
9. Two-account running/golf walkthrough and reproducible local start instructions.
10. Remaining defects, assumptions, deferred features and next recommended fix.
11. Confirmation that no deployment/App Store submission/push took place.

- [ ] Commit coherent waves locally with descriptive messages.
- [ ] Leave no accidental dependency upgrades, generated bundles, secrets or
  unrelated changes in the final diff.
- [ ] Run required checks on the final source. If code changes after checks,
  rerun affected checks. Identify any later documentation-only commit separately.
- [ ] Update this checklist from actual evidence, not intention.
- [ ] If runtime context is nearly exhausted, write a checkpoint with branch,
  HEAD, completed tasks, next commands and blockers; resume from it.
- [ ] When a provider-dependent check is unavailable, continue source/local
  verification. Never quietly substitute production calls or mock results.
- [ ] End with the handoff location and exact remaining work.

## 9. Codex morning review checklist

Codex is an independent reviewer. Do not award a pass based on screenshots,
commit count or a green Claude summary alone.

- [ ] Verify origin, implementation base, final HEAD and the complete owned diff.
- [ ] Read applicable guidance and compare implementation to this product scope.
- [ ] Confirm both sports work end-to-end and saved conditions drive actual results.
- [ ] Inspect old-client write behavior, migration upgrade safety and null semantics.
- [ ] Inspect bilateral intent rules, pace interval math and explanation accuracy.
- [ ] Test changing sports during slow success/failure responses and acting between
  pagination requests.
- [ ] Verify group-event capacity/permissions using real PostgreSQL.
- [ ] Verify My Plans keeps booking/event identities and lifecycle states separate.
- [ ] Check existing account/auth/chat/history/report/block/delete paths.
- [ ] Inspect hardcoded styles and native keyboard/accessibility behavior.
- [ ] Re-run required checks against reviewed source, using isolated services.
- [ ] Inspect logs for actual executed test coverage; zero-test success is not a pass.
- [ ] Compare report evidence commits to reviewed code and flag stale evidence.
- [ ] Write docs/run-golf-v2/CODEX_REVIEW.md.

Review report format:

    REVIEWED_BASE:
    REVIEWED_HEAD:
    BRANCH / WORKTREE:
    VERDICT: PASS | PASS_WITH_WARNINGS | NEEDS_FIXES | BLOCKED_ENV
    SCOPE_COMPLETION:
    P0/P1/P2 FINDINGS: severity, path:line, trigger, impact, reproduction, fix direction
    VERIFICATION: command, exit code, coverage and tested source
    MIGRATION / LEGACY_COMPATIBILITY:
    RUNNING_JOURNEY:
    GOLF_JOURNEY:
    NATIVE_UI_EVIDENCE:
    UNVERIFIED_ITEMS:
    NEXT_ACTION:

Severity guidance:
- P0: data loss, account/security exposure or a broadly unusable application.
- P1: a broken core journey, unsafe migration, wrong bilateral matches,
  oversubscribed session or misleading persisted/confirmed state.
- P2: material secondary behavior, usability or maintainability issue.

PASS requires completion and verified critical journeys. PASS_WITH_WARNINGS is
for nonblocking issues with those journeys verified. Missing essential native,
migration or PostgreSQL evidence must remain explicit; choose BLOCKED_ENV for
the blocked verification or NEEDS_FIXES for an observed defect. Keep code
findings distinct from environment gaps.

## 10. Final definition of done

- [ ] Existing SportsGang is recognizably focused on running and golf.
- [ ] Both sports have meaningful, editable, persistent preferences.
- [ ] Compatibility respects both people and explains actual conditions.
- [ ] Users can join real locally persisted running/golf sessions and see plans.
- [ ] Existing 1:1 communication/booking and legacy account/history remain usable.
- [ ] Primary screens share a readable outdoor visual system.
- [ ] Required regression, migration, concurrency and native checks have evidence,
  or the delivery is explicitly marked partial with reproducible blockers.
- [ ] Claude's work is concrete and reviewable by Codex the next morning.

