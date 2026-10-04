# App Store metadata — next update (v2 running and golf) — DRAFT

**Status: DRAFT for the next SportsGang update. Not approved, not submitted,
not published.** Nothing here has been pasted into App Store Connect. The
canonical v1 record, `docs/release/APP_STORE_METADATA.md`, is unchanged and
still describes what is live today (App Store version 1.0, released
15 May 2026 — `evidence/link-check.txt`).

Every claim below is tied to source in [CLAIM_MATRIX.md](CLAIM_MATRIX.md).
The copy describes the run + golf v2 application at `ecd1e86`, which is still
under independent Codex review. Do not submit it until the conditions in
[RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) are met and the wording has been
checked against the signed build that is actually submitted.

Character counts were computed with Python `len()` on the exact strings in
this file (Unicode code points; the em dash, curly quotes and "·" count as
one character each).

## Counts against limits

| Field | Characters | Limit | Headroom | Where the limit comes from |
|---|---:|---:|---:|---|
| Subtitle | 25 | 30 | 5 | recorded in docs/release/APP_STORE_METADATA.md §1 ("≤30 chars") |
| Promotional text | 138 | 170 | 32 | recorded in docs/release/APP_STORE_METADATA.md §2 ("≤170 chars") |
| Keywords | 93 | 100 | 7 | recorded in docs/release/APP_STORE_METADATA.md §5 ("single 100-character comma-separated string") |
| Description | 2,223 | 4,000 | 1,777 | Apple's published limit; NOT recorded in docs/release/APP_STORE_METADATA.md |
| What's New | 867 | 4,000 | 3,133 | Apple's published limit; NOT recorded in docs/release/APP_STORE_METADATA.md |

The App Store name stays `SportsGang` (unchanged, not counted here).

## 1. Subtitle (recommended)

```
Running and golf partners
```

25 characters. Replaces v1's `Find your next game`, which no longer
says what the app is for. Alternatives considered, both at the 30-character
limit:

- `Sydney running & golf partners` (30 characters)
- `Find your pace and your people` (30 characters)

The first narrows the listing to Sydney in the store copy; the second is
the site's line but says nothing about the sports. Operator's choice.

## 2. Promotional text

```
Find runners at your pace and golfers who suit your game in Sydney. Show interest, chat when it's mutual, and keep every plan in My Plans.
```

138 characters. Promotional text can change without a new build, so it
is the line to adjust if the update's timing or scope changes.

## 3. Keywords

```
running,golf,running partner,golf partner,group run,pace,handicap,beginner golf,sydney,sports
```

93 characters, no spaces after commas. "SportsGang" is
auto-included by Apple and is not repeated. Deliberately excluded:
`gym`, `tennis` (no longer offered), `tee time`, `booking`, `coach`,
`tracker`, `gps` (the app does none of these), `match`, `dating`, `meet`
(dating-app signals), `club`, `leaderboard`, `rank` (not features).

## 4. Full description

```
SportsGang helps Sydney runners and golfers find people to play with, agree a time, and keep every plan in one place.

RUNNING
Share the pace range you're comfortable at, or choose social running and skip it. Add the distances and times you like and how you like to run as a group. When you both share a pace, a card shows exactly where your ranges overlap, and Matching pace only shows just those runners. If someone hasn't shared a pace, their card says so instead of guessing.

GOLF
Add your handicap situation (an official handicap, your own estimate, or none) with your experience, 9 or 18 holes, and the golfers you want to play with: a similar level, more experienced golfers to learn from, beginners, or any level. If you want to learn, you only see more experienced golfers who have said they're happy to play with beginners or open to any level. Handicaps are self-reported and not verified, and an estimate is labelled as one.

HOW IT WORKS
Explore shows people whose preferences fit yours, with the reasons on every card. Showing interest is private, and a chat opens only when you both show interest. From the chat, propose a session with a date, start and end times and an optional venue. The other person confirms or declines; until then it stays pending.

GROUP RUNS AND ROUNDS
Host a run or a round with a time, a place and a number of spots (up to four golfers for a round), or join one in Explore while spots are left. Group sessions don't have a group chat.

MY PLANS
Confirmed one-to-one sessions and the group runs and rounds you host or join sit together in My Plans. Pending proposals are kept separate and past plans stay out of the way. Times are shown in Sydney time.

YOUR CONTROL
Report or block anyone from a chat or their profile. Once blocked, neither of you can message, propose a session or show interest, and you won't see each other in Explore. Delete your account at any time from your profile. The Privacy Policy, Terms of Service and Support pages are linked from the Profile screen.

SportsGang doesn't book courses or tee times, track runs or record routes, or provide coaching. It helps you find the right people and agree when and where to meet.

Find your pace. Find your people.
```

2,223 characters. Uses "show interest" rather than "match",
"like" or "swipe" as the verb for connecting, as the v1 copy rules require.
"Matching pace only" is the app's filter name.

## 5. What's New

```
SportsGang now focuses on running and golf. Gym and tennis are no longer offered in the app.

- Running preferences: a pace range or social running, plus distances, times and group style. Turn on Matching pace only to see runners whose pace ranges overlap with yours.
- Golf preferences: your handicap situation (self-reported), experience, 9 or 18 holes, and who you want to play with. Beginners who want to learn only see experienced golfers who welcome beginners or any level.
- Explore shows why someone fits, and says plainly when something is unknown.
- Host or join group runs and rounds.
- My Plans replaces Events: Upcoming, Pending and Past, all in Sydney time.
- Photos and a bio are now optional.
- Blocking now stops messages, session proposals and interest in both directions.
- Fixes for time display and the time picker, plus reliability improvements.
```

867 characters.

Notes for the operator:

- The first line tells existing gym and tennis users that those sports are
  no longer offered. Their stored data is kept (CONTRACTS.md §1), but the v2
  app does not offer those sports. Decide whether you also want to tell
  existing users another way.
- The blocking line depends on Codex accepting R1. The fixes line covers R5
  (time picker) and R6 (time display). Remove either line if the
  corresponding repair is not in the submitted build.

## 6. Reviewer flow outline (replaces the v1 Events-tab walkthrough)

For the App Store Connect "Notes" field once the build is final. Demo
credentials go only in the App Review Information panel, never in the repo
(v1 §10 policy still applies). Screen labels are from source at `ecd1e86`;
re-check every label on the signed build before pasting.

Prerequisite: two demo accounts whose running (or golf) preferences fit each
other, so each appears in the other's Explore. No seed script for review
data exists yet (v1 §10 "Status: TBD").

```
SportsGang helps Sydney runners and golfers find people to play with,
agree a session in chat, and keep their plans in My Plans.

1. Sign in with the demo account (or register with email and password;
   Sign in with Apple is also available). New accounts add a display
   name, birth year and Sydney suburb.
2. Set running or golf preferences when Explore prompts for them (also
   available from Profile).
3. Explore: switch between Running and Golf. Each card shows why the
   person fits. Tap "Show interest" (or "Pass").
4. Sign in as the second demo account and show interest back. A banner
   says you are both interested; "Open chat" opens the conversation.
5. In the chat, tap "+ Session" to propose a session: date, start and end
   time, optional venue and notes. It appears in My Plans > Pending as
   "Waiting for <name>".
6. As the other account, open the proposal from the chat or from
   My Plans > Pending ("Requested by <name>") and tap Confirm (or
   Decline). A confirmed session moves to My Plans > Upcoming.
7. Group sessions: in Explore, tap "Host a run" or "Host a round", set a
   time, place and number of spots. The host sees it in My Plans as
   "Hosting"; another account can join while spots are left ("Joined").
   Group sessions have no group chat.
8. Safety: from a chat header or a partner's profile, Report or Block.
   Once blocked, neither account can message, propose a session or show
   interest, and they no longer see each other in Explore.
9. Profile: Privacy Policy, Terms of Service and Support links, and
   "Delete my account".

Times in the app are Sydney time.
```

## 7. Category

The live App Store record's primary genre is **Health & Fitness**
(`evidence/link-check.txt`), while the v1 metadata recommends **Sports**
(primary) and **Social Networking** (secondary). Not changed here; the
operator should decide in App Store Connect.

## 8. Not covered by this draft

- Screenshots: none were captured for this draft. The website uses
  illustrations, not product screenshots. New App Store screenshots must be
  captured from the reviewed build with safe demo data.
- Age rating, App Privacy label, demo accounts, support contact: unchanged
  from v1 and still open where v1 §12 lists them as open.
