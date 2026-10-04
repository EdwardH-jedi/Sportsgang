# Claim matrix — SportsGang website refresh and v2 metadata draft

Every product claim on the refreshed website (`apps/web`, commit `016ba0b`)
and in [APP_STORE_METADATA_V2_DRAFT.md](APP_STORE_METADATA_V2_DRAFT.md),
with its evidence, status and the condition for publishing it.

Source references are to the mobile/API application at `ecd1e86` (the code
under Codex review). This branch contains the same mobile/API files.

## Release-candidate update (5 Oct 2026)

Updated on `chore/run-golf-v2-release-candidate-2026-10-04`, which integrates
this site (`97990d9`) with the repaired app. The latest independent verdict is
Codex's morning acceptance review (publication `ce62aac`, reviewed delivery
`8b34bca`): **code NEEDS_FIXES** (new findings MA-C, MA-B, MA-A, all P2),
**Q01–Q09 PASS** within its measured scope, and **release NOT_READY** (R6
production provenance, single-API-process topology and device/release gates
open). The release candidate implements MA-C, MA-B and MA-A; they are **not
accepted** until a fresh independent review says so. No status below is
raised on the strength of this candidate's own tests.

Changes in this update: A5 (the build now carries the legal pages), A6 (the
preview tags now carry the next-update wording), E1, E2 and E7 (evidence
pointers to the latest verdict; still PENDING).

## Status key

| Status | Meaning |
|---|---|
| VERIFIED | Checked against a live public source on 4 Oct 2026 Sydney time (`evidence/link-check.txt`). |
| IMPLEMENTED | Present in v2 source at `ecd1e86` with its own tests. **Not in the App Store build** (store version is 1.0). |
| PENDING | Implemented as a Codex review repair (R1–R7 and their follow-ups); depends on an independent review accepting it. The latest verdict (`ce62aac`) is NEEDS_FIXES for the code as a whole. |
| NEGATIVE | A "does not do" statement, checked against source. It stays true unless the feature is added. |
| REMOVED | Was on the old site; unsupported, so removed from every rendered surface. |

**Publication condition used below:**
- **C1** — the update built from `ecd1e86` (or an accepted successor) is live on the App Store. Until then the site carries the visible note "The running and golf experience on this page arrives with the next SportsGang update." (`apps/web/src/components/ui.tsx`, shown under both App Store buttons and in the FAQ).
- **C2** — C1, plus Codex accepts the named repair.
- **C3** — none; may be published now.

## A. Availability and identity

| # | Public wording (where) | Evidence | Status | Condition |
|---|---|---|---|---|
| A1 | "Get SportsGang on the App Store" → `https://apps.apple.com/au/app/sportsgang/id6767027447` (hero, header, menu, final panel, footer, FAQ) | `evidence/link-check.txt`: 200, title "SportsGang App - App Store", page contains `id6767027447`; iTunes lookup trackName `SportsGang`, bundleId `com.edh1223.protin`; `apps/mobile/eas.json:30` `ascAppId` | VERIFIED | C3 |
| A2 | "For iPhone." (next-update note) | iTunes lookup `supportedDevices` lists iPhone models; app is an iOS build (`eas.json`) | VERIFIED | C3 |
| A3 | "The running and golf experience on this page arrives with the next SportsGang update." / FAQ "The version on the App Store today is an earlier release that works differently" | iTunes lookup `version: 1.0`, `currentVersionReleaseDate: 2026-05-15`; v1 description (`docs/release/APP_STORE_METADATA.md` §4) covers gym, golf, tennis and running with an Events tab | VERIFIED | C3 — **remove or reword when the update ships** |
| A4 | "Built for Sydney first, and times in the app are Sydney time" (FAQ) | `apps/mobile/src/screens/plans/MyPlansScreen.tsx:183` eyebrow "Sydney time"; `BookingComposerScreen.tsx:180` "Times are Sydney time (AEST/AEDT)."; onboarding "Your Sydney suburb" (`OnboardingStep1Screen.tsx:163`) | IMPLEMENTED | C1 |
| A5 | Privacy, Terms, Support links → `https://sportgang.netlify.app/{privacy,terms,support}/` (footer, FAQ, noscript) | `evidence/link-check.txt`: all 200; URLs recorded in `docs/release/APP_STORE_METADATA.md` §8 and `apps/mobile/.env.example:67`; App Store `sellerUrl` is the same site | VERIFIED (reachable) | C3 for the links; the pages' own content has gaps — see RELEASE_HANDOFF §2. The site build now also serves byte-for-byte copies of these pages at `/privacy/`, `/terms/`, `/support/` (from `feature/sportgang-official-website` `ad072fc`; CI compares them with `dist/`), so deploying the build to that host keeps the links working. Content unchanged. |
| A6 | Page `<title>`, meta description, `og:*`, `twitter:*` ("SportsGang — Running and golf partners in Sydney, in the next update" / "Coming in the next SportsGang update for iPhone: …" / "Coming in the next SportsGang update: …") and the no-script note | Wording: `apps/web/index.html`; features: B and D below; store version 1.0 (A3) | VERIFIED (wording) | C3 — the tags now carry the next-update wording, like the page; **reword when the update ships** |

## B. Running

| # | Public wording | Evidence | Status | Condition |
|---|---|---|---|---|
| B1 | "Share the range you are comfortable at and a card shows exactly where it meets theirs, like 'Pace ranges overlap at 5:45–6:15 /km'" | `apps/api/app/services/compatibility.py:333` reason text; `pace_overlap()` at `:296` | IMPLEMENTED | C1 |
| B2 | "Turn on Matching pace only to see just those runners" | `ExploreScreen.tsx:262` chip label; `compatibility.py:313` excludes pairs without an overlap when `strict_pace` | IMPLEMENTED | C1 |
| B3 | "Choose social running and skip the pace. Your profile says 'Social — pace is flexible'" | `PartnerDetailScreen.tsx:37`; pace mode options `sportPreferences.ts:105-108` | IMPLEMENTED | C1 |
| B4 | "Not everyone shares a pace … their card says 'Hasn't shared a pace range' instead of assuming one" | `compatibility.py:323` caveat; tier "Pace not confirmed" `PartnerCardView.tsx:11` | IMPLEMENTED | C1 |
| B5 | "A card only claims a fit your stated preferences support, and says plainly when something is unknown" | `compatibility.py:10-16` tier rules (compatible / unverified / needs_setup); every reason built from stored values | IMPLEMENTED | C1 |
| B6 | "Host a run with a time, a meeting point and a number of spots, or join one while spots are left" | `CreateSessionScreen.tsx:90,109,120,136-147`; running capacity 2–50 `sessionForm.ts:65-68`; join gate `SessionDetailScreen.tsx:113` | IMPLEMENTED | C1 |
| B7 | "SportsGang doesn't track your runs or record routes" | Only location use is a one-off foreground position for venue lookup: `apps/mobile/src/hooks/useVenueLocation.ts:67,80`; no `watchPositionAsync`, background location or task manager anywhere in `apps/mobile/src` | NEGATIVE | C3 |

## C. Golf

| # | Public wording | Evidence | Status | Condition |
|---|---|---|---|---|
| C1 | Handicap situation: "an official handicap, your own estimate, or none"; experience; 9 or 18 holes | `sportPreferences.ts:65-80` (Official handicap / My estimate / No handicap; experience bands), `:97-101` holes | IMPLEMENTED | C1 |
| C2 | Intent chips "Similar level", "Learn from experienced golfers", "Happy to play with beginners", "Any level" | `sportPreferences.ts:82-95` labels | IMPLEMENTED | C1 |
| C3 | "Two handicaps are compared within the gap you choose. Without two handicaps to compare, the card says it matched on experience instead." | `compatibility.py` `_golf_owner_admits` (similar_handicap within tolerance; labelled "similar_experience" fallback); tolerance options `sportPreferences.ts:103` | IMPLEMENTED | C1 |
| C4 | "If you want to learn, you see more experienced golfers only when they have said they are happy to play with beginners or open to any level. Not every experienced golfer has." (also FAQ) | `compatibility.py:190-208` `_learning_route` requires the mentor's `welcome_beginners` or `any_level` | IMPLEMENTED | C1 |
| C5 | "Handicaps are self-reported, not verified, and an estimate is labelled as one" (also FAQ "Are handicaps verified? No.") | `compatibility.py:278,280`; option description "(self-reported)" `sportPreferences.ts:70` | IMPLEMENTED | C1 |
| C6 | "Host a round for two to four golfers with a course and tee time … The host says whether the tee time is secured or still being booked." | Golf capacity 2–4 `sessionForm.ts:67`; "Course" / "Tee time" labels `CreateSessionScreen.tsx:109,120`; tee time status "Tee time secured" / "Planning to book" with hint "SportsGang doesn't book or verify tee times" `:162-174` | IMPLEMENTED | C1 |
| C7 | "SportsGang doesn't book courses or tee times, and doesn't offer coaching" (also FAQ) | `CreateSessionScreen.tsx:162` hint; no booking, payment or coaching code in `apps/api/app/routers` for v2 sessions | NEGATIVE | C3 |

## D. Connection, planning and My Plans

| # | Public wording | Evidence | Status | Condition |
|---|---|---|---|---|
| D1 | "Interest is private. A chat opens if you both show interest." (hero illustration, safety, FAQ, how it works) | App copy `PartnerDetailScreen.tsx:224`; a match (the chat room) is created only by a reverse like, `apps/api/app/services/discovery.py:315-345` (the only `Match(` construction in `app/services`); chat requires a match participant, `apps/api/app/services/chat.py:21`; "no invitation inbox" `docs/run-golf-v2/CONTRACTS.md:236-237` | IMPLEMENTED (pre-existing v1 behaviour, v2 copy) | C1 |
| D2 | "Suggest a time and place from the chat. They confirm or decline, and until then it stays pending." | "+ Session" `ChatScreen.tsx:409-411`; "Propose a session" `BookingComposerScreen.tsx:146` (date, start/end time, optional venue); Confirm/Decline `BookingDetailScreen.tsx:288,293`; pending labels `apps/mobile/src/hooks/usePlans.ts:73-81` | IMPLEMENTED | C1 |
| D3 | My Plans: Upcoming (confirmed 1:1, hosted/joined group sessions), Pending (never shown as confirmed), Past; Sydney time | `MyPlansScreen.tsx:1-12,90-94,183`; `usePlans.ts:66-145` | IMPLEMENTED | C1 |
| D4 | Illustration statuses "Confirmed", "Joined", "Hosting", "Waiting for Dan"; kinds "1:1 session", "Group run", "Group round" | `usePlans.ts:80,85,124,127,100,139` | IMPLEMENTED | C1 |
| D5 | "There is no group chat … joining adds it to My Plans" | No message route in `apps/api/app/routers/events.py`; joined events appear as "Joined" (`usePlans.ts:124-127`) | IMPLEMENTED / NEGATIVE | C1 |
| D6 | Explore card illustration: "Fits both ways", reasons, "Show interest" / "Pass" | `PartnerCardView.tsx:10,131`; reason texts `compatibility.py` (`Both like … km` `:346`, `Both prefer mornings` via `_TIME_LABEL` `:45`) | IMPLEMENTED | C1 |
| D7 | "Photos and a bio are now optional" (What's New only) | `docs/run-golf-v2/CONTRACTS.md:104-107`; `OnboardingStep2Screen.tsx` header comment | IMPLEMENTED | C1 |
| D8 | "Gym and tennis are no longer offered in the app" (What's New only) | `CONTRACTS.md` §1 ("the v2 app simply does not offer them"); `FOCUS_SPORTS` `sportPreferences.ts:27` | IMPLEMENTED | C1 + operator decision on telling existing users |

## E. Safety and account control

| # | Public wording | Evidence | Status | Condition |
|---|---|---|---|---|
| E1 | "Report or block them from a chat or their profile" | Chat: `ChatScreen.tsx:165-174` (Report, Block); profile: `PartnerDetailScreen.tsx:228-230` (Report), `:121` block | IMPLEMENTED | C1 (block on partner detail is R4 → C2; its follow-ups Q05/Q06 PASS at `ce62aac`, code verdict NEEDS_FIXES). At the largest text size the chat header's More options button is partly off-screen (release-candidate native evidence) — not changed |
| E2 | "Once blocked, neither of you can message, propose a session or show interest" | `docs/run-golf-v2/CONTRACTS.md` §8, `apps/api/app/services/safety.py` `is_contact_restricted` / `lock_contact`; R1's follow-ups Q01–Q03 PASS at `ce62aac` (one API process); MA-B/MA-C (bounds, notification ownership) implemented in the release candidate, not yet reviewed | PENDING (R1) | C2 — an independent review accepts the release candidate's code, and the deployment serves WebSockets from one API process |
| E3 | "…and you won't see each other in Explore" | `discovery.py:182-184` bidirectional block exclusion (pre-existing) | IMPLEMENTED | C1 |
| E4 | "A 1:1 session only counts as confirmed when the other person confirms it" | `usePlans.ts:18` ("nothing is labelled confirmed" while proposed), `:73-85` | IMPLEMENTED | C1 |
| E5 | "You can delete your account from your profile" | `ProfileScreen.tsx:80,265-267` "Delete my account" (also in v1) | IMPLEMENTED (and live in v1) | C3 |
| E6 | "Is this a dating app? No." | Product direction (`CLAUDE.md`); no dating features in source | NEGATIVE | C3 |
| E7 | Metadata: "Fixes for time display and the time picker" | R5 picker: Q09 PASS at `ce62aac`; R6 time display: gate OPEN, production provenance NOT_RUN (`docs/run-golf-v2/morning-fixes/R6_C01_DEPLOYMENT_GATE.md`) | PENDING (R5, R6) | C2 — an independent review accepts the code, and R6's production timestamp check is done by the authorised operator (RELEASE_HANDOFF §4) |

## F. Removed from the site (REMOVED)

| Old claim or element | Why removed |
|---|---|
| "Protin" brand, `@protin.app` contact inboxes | SportsGang is the public brand; the inboxes were invented and never verified |
| Waitlist form ("you're on the list"), `localStorage` collection (`protin.waitlist.v1`) | The app is on the App Store; the form collected emails into the browser only and implied a launch that has happened |
| Gym, badminton and tennis cards | Not offered in the v2 app (`CONTRACTS.md` §1); badminton was never supported |
| Rank badges (Bronze → Diamond), leaderboards, rewards | Not part of the v2 product surface |
| Verified profiles / verified skill, community ratings | No verification or rating exists; handicaps are self-reported |
| Group "events" content with group chat and invitations | v2 group sessions have no group chat or invitations |
| Draft Privacy / Terms / Contact modals | Replaced with links to the existing public pages; the modal text was a draft with invented addresses |
| Any Android availability | No Android release evidence |

Not present on the new site and checked in the built output
(`evidence/dist-term-scan.txt`): testimonials, user counts, partner logos,
demand statistics, email addresses, analytics.
