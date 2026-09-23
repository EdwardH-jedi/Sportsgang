# App Store Metadata Draft

**Status:** draft. Every field on this page is provisional and must be reviewed
by the operator (and where applicable by counsel) before it is pasted into
App Store Connect or submitted for review. Nothing here has been approved
for public publication.

This document is the single point of truth for the wording the App Store
record will carry. It does **not** replace `APP_STORE_SUBMISSION.md`, which
captures the field-by-field ASC submission mechanics; this file captures the
*content* of those fields in draft form so the operator can iterate on copy
without touching app code.

---

## 1. Identity and naming

| Field | Draft value | Notes |
|---|---|---|
| App Store display name | `SportsGang` | **Resolved 2026-05-05: public brand spelling is `SportsGang` / `sportsgang`** (the inner `s` better implies multiple sports and future multi-sport expansion). The mobile config (`app.config.js` `expo.name`) already uses `SportsGang` and is unchanged. Technical identifiers remain unchanged for v1: slug `protin`, iOS `bundleIdentifier` `com.edh1223.protin`, Android `package` `com.edh1223.protin`, npm workspace names `@protin/*`, EAS project `@edwardh1234/protin`. |
| App Store subtitle (≤30 chars) | `Find your next game` | 19 chars. v1 finalized wording — "next game" emphasises the session-and-play angle of the product instead of profile/match positioning. |
| Bundle identifier | `com.edh1223.protin` | Already wired in `app.config.js`. Document only — do not change for v1. Technical IDs intentionally diverge from the public brand. |
| SKU (App Store Connect, internal) | `protin-ios-1` | Suggestion. Must be unique within the developer account. Internal-only; never user-visible. |
| Primary language | English (Australia) | Sydney-first product; confirm before submission. |
| Short positioning line (internal copy reference) | `Built around the game, not the profile.` | Used throughout description, review notes, and any future Marketing URL hero copy. Anti-profile-app framing — keep this consistent across all v1 surfaces. |

## 2. Promotional text (≤170 chars)

> SportsGang helps you find players, chat, and plan sports sessions —
> and keep track of confirmed sessions in Events.

131 characters. The promotional text field can be updated after release
without a new build, so this is the "live" line a future operator can
swap as needed. The Events callout reflects the shipped Events tab
(Upcoming + Pending sessions); do not reword it back to imply
calendar sync or push reminders.

## 3. Short positioning line

> Built around the game, not the profile.

39 characters. Anti-profile-app framing reused in the description (§4)
and the review notes (§9). Keep consistent across surfaces; do not
soften to "match" or "swipe" language.

## 4. Full description (v1 finalized draft)

Four-paragraph structure. Reads as polished App Store copy — short
enough to scan, long enough to set expectations. No bullet lists, no
sport-by-sport claims, no v1-hidden features.

```
SportsGang helps you find players, chat, and plan your next sports
session — all in one place. Built around the game, not the profile,
SportsGang is for people who'd rather play than scroll.

Set up your profile in a few taps: pick the sport you play, your
level, and the suburb you train in. Browse other players who share
your sports interests, connect with the ones you'd like to play
with, and chat one-to-one. From the chat, propose a session with a
date, a time, and a court or venue from the in-app list — the other
player can accept or decline, and once it's confirmed you'll see it
in the Events tab alongside any pending proposals. SportsGang covers
gym, golf, tennis, and running, with more on the way.

Your control is built in. Report or block any user from inside a
chat. Delete your account at any time from the Profile screen — your
profile and chat history go with it. Our Privacy, Terms, and Support
pages are linked directly from the app so you always know how your
data is handled and how to reach us.

Find your next game on SportsGang.
```

**Do not** add any of the following to this description before they
actually ship in the user-visible product:

- Tournaments / brackets / public events.
- In-app rank or honor guide.
- Battles, ladders, leaderboards.
- Calendar sync (add-to-Apple-Calendar / Google Calendar).
- Push notifications as a marketing feature claim.
- Automatic nearby / GPS distance filters.
- Open chat rooms or public/private event rooms.
- Subscriptions or in-app purchases.

Each of these is intentionally hidden in v1 (see Step 1 hardening) or
not implemented at all. Mentioning any of them in App Store copy is a
5.1 / 2.3 risk — Apple holds the listing to what the app actually
does on first install.

Romantic / dating-app phrasing is also off-limits. Words like *match*,
*swipe*, or *like* should not be used as the primary verb describing
how users connect; the description above intentionally uses
*connect with* and *chat one-to-one* instead.

## 5. Keywords (v1 finalized draft)

App Store keyword field is a single 100-character comma-separated string.
The app name and category are auto-included — do not duplicate them here.

```
sports,fitness,gym,golf,tennis,running,players,chat,social,training
```

74 characters. Tuned for v1 positioning:

- **Sports-first vocabulary.** `sports`, `fitness`, `training`, plus the
  four named sports the v1 app actually supports: gym, golf, tennis, and
  running. Do **not** add sports the app does not currently support
  (e.g. badminton, football, soccer, basketball) — App Store keywords
  must reflect the visible v1 sport allowlist, not aspirational coverage.
- **Partner-finding intent.** `players`, `chat`, `social` — capture intent
  for "who do I play with" without leaning on dating-app vocabulary.
- **No competitor brand names.** Apple rejects keyword stuffing of
  competitor app names.
- **No dating / hookup terms.** SportsGang is not a dating app and the
  keyword field must not signal one (Apple's review will downrank or
  reject mismatched positioning).
- **No v1-hidden features.** Do not add `tournament`, `leaderboard`,
  `rank`, `calendar`, `push`, `nearby`, or `subscription`. None of those
  ship in the user-visible v1 surface.
- **`events` is intentionally still excluded** even though the Events
  tab is now shipped (it lists the user's own Upcoming + Pending
  sessions). The keyword `events` invites confusion with public events
  / open chat events / group events, none of which exist in v1, so
  keeping it out of the comma string avoids signalling a feature the
  app doesn't have. The Events tab is named in §4 description and §11
  screenshot captions where the surrounding context disambiguates it.

## 6. Category recommendation (v1 finalized)

- **Primary category:** `Sports`. Aligns with the product positioning
  ("Built around the game, not the profile") and the keyword set; signals
  to reviewers that the app's purpose is playing sports, not Health &
  Fitness tracking.
- **Secondary category:** `Social Networking`. The 1:1 chat plus the
  player discovery surface is the social-networking layer that justifies
  the report / block / delete-account safety controls.

If Apple's category rules force a single primary, **keep `Sports`**. The
Health & Fitness category was an earlier draft choice but does not match
the v1 positioning — SportsGang does not track workouts, count steps, or
log sessions; it helps people find each other to play.

Confirm both selections in App Store Connect at submission time.

## 7. Age rating considerations

> **Recommended conservative age-rating target: 17+** due to user
> profiles, chat, and real-world sports session coordination. Final
> rating must be confirmed in App Store Connect's age-rating
> questionnaire.

The product has two characteristics that drive this recommendation:

- **User-generated content.** Display name, bio, profile photos, and 1:1
  chat are all user-provided. The questionnaire row "User-Generated
  Content" must be answered honestly — chat-based social apps
  consistently land at 17+ once UGC is acknowledged at meaningful
  frequency, and SportsGang's chat surface is core to the product.
- **Real-world meet-ups.** SportsGang exists to coordinate physical
  sports sessions between two adults who haven't met before. The Terms
  carry an explicit real-world meeting risk disclaimer.

Operator may additionally elect an **18+ minimum-age policy**: a 17+
App Store rating combined with a Terms-of-Service clause requiring 18+.
The age gate is then enforced contractually, not via the rating
questionnaire alone. Picking this requires
`docs/release/LEGAL_WEBSITE_CONTENT.md` Terms §2 (Eligibility) to name
18+ as the minimum age, with the matching Privacy §11 update.

Do **not** position the app as 12+. Earlier draft notes carried a 12+
working assumption based on "Infrequent/Mild" UGC; that has been
withdrawn as inconsistent with chat + real-world-meet-up coordination.
The aligned recommendation across this file,
`docs/archive/deployment/APP_STORE_SUBMISSION.md` §5, and
`docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md` §4.3 is 17+.

Apple has not assigned any rating yet; 17+ is the operator-side
recommendation pending the App Store Connect questionnaire result.

## 8. URLs

The static legal/marketing site is deployed to Netlify at the canonical
host below. All four App Store Connect URL fields point at this host today;
all routes return `200 OK` HTML over HTTPS.

| Field | Value | Owner action |
|---|---|---|
| Marketing / Website URL (optional) | `https://sportgang.netlify.app/` | Site root; optional in ASC. |
| Privacy Policy URL | `https://sportgang.netlify.app/privacy/` | Pin into `EXPO_PUBLIC_PRIVACY_URL` on the EAS production + preview profiles. |
| Terms of Service URL | `https://sportgang.netlify.app/terms/` | Pin into `EXPO_PUBLIC_TERMS_URL`. |
| Support URL | `https://sportgang.netlify.app/support/` | Pin into `EXPO_PUBLIC_SUPPORT_URL`. Same address must align with the App Store Connect "App Review Contact" form once a real `support@` mailbox exists. |

Notes:
- `https://sportgang.netlify.app/` is the **current Netlify-hosted production
  URL**.
- **Open item:** replace the Netlify-subdomain URLs with a final custom
  domain (e.g. `https://sportsgang.app/...` — hypothetical, not yet
  registered) if/when the operator pins one. Do **not** claim
  `sportsgang.app` or `sportgang.app` is live; only `sportgang.netlify.app`
  is real today.
  Update this section, the EAS env values, and the env example files
  (`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`,
  `.env.example`) together if it changes.

The three `EXPO_PUBLIC_*_URL` env vars are read by
`apps/mobile/src/lib/legal.ts` (Step 2). The mobile build will treat each
link as "not available" until the env var is set on the EAS build profile.
Do **not** ship the App Store record with the URLs unset.

### Mobile env values (EAS — applied)

```
EXPO_PUBLIC_PRIVACY_URL=https://sportgang.netlify.app/privacy/
EXPO_PUBLIC_TERMS_URL=https://sportgang.netlify.app/terms/
EXPO_PUBLIC_SUPPORT_URL=https://sportgang.netlify.app/support/
```

These values are public and safe to commit; they live in the env example
files (`apps/mobile/.env.example`, `apps/mobile/.env.staging.example`,
`.env.example`) so local Expo runs resolve the same URLs, and they have
been pinned on the EAS `preview` and `production` environments. Verify
with:

```
eas env:list --environment preview
eas env:list --environment production
```

If a custom domain is later pinned, update with `eas env:update` (not
`:create`) on both environments. Full verification checklist + failure
triage live in `docs/archive/deployment/APPLE_TESTFLIGHT_PREP.md` §4.8.

## 9. Review notes draft (v1 finalized)

Draft text for the App Store Connect "Notes" field. Keep within the
plain-text style of typical reviewer notes; demo credentials go in the
ASC "App Review Information" panel, not into this notes block (see §10).

```
SportsGang is a sports app for finding players, chatting one-to-one,
and coordinating real-world sports sessions. Built around the game,
not the profile.

Account registration uses email + password; Sign in with Apple is
also available on iOS. After registration the app guides the user
through a short onboarding (sport, level, suburb), then lands them
on the Discovery surface where they can browse other players.

To exercise the core flow:
1. Register a new account, or use the demo credentials in the App
   Review Information panel.
2. Complete onboarding.
3. From Discovery, connect with a player you'd like to play with.
4. Open the chat with a connected player and exchange a message.
5. From the chat, tap "+ Session" and propose a session — pick a
   date, time, and a court or venue from the in-app list. The card
   appears in the chat as "Awaiting confirmation" for the proposer.
6. Sign in as the other test account: the same chat now shows
   "Session proposal" with Accept / Decline buttons. Accepting moves
   the card to "Session confirmed" for both participants.
7. Open the Events tab to confirm the session appears under
   Upcoming sessions; pending proposals (still awaiting a partner's
   reply) appear under Pending proposals.
8. Safety controls: from a chat, tap the header overflow to Report
   or Block the other user — both are wired end-to-end.
9. Account control: from the Profile screen, tap "Delete my account"
   to hard-delete the account, profile, and chat history.

The Privacy, Terms, and Support pages are linked directly from the
in-app Profile screen and are publicly hosted at:
- Privacy:  https://sportgang.netlify.app/privacy/
- Terms:    https://sportgang.netlify.app/terms/
- Support:  https://sportgang.netlify.app/support/
The Netlify hostname is the current public host; the brand spelling
on the site and in the app is "SportsGang".

If anything is unclear, the contact email in the App Review
Information panel is monitored.
```

Length: approximately 1,400 characters; comfortably within the ASC
notes-field limit. Update the Privacy/Terms/Support URLs in this
block in lockstep with §8 if a custom domain is later pinned.

## 10. Demo account section

A reviewer demo account is **required** because every meaningful surface
in the app sits behind a login. **Status: TBD.** The account has not been
created yet; the seed script that would populate it
(`apps/api/scripts/seed_review_data.py`) does not exist. See
`APPLE_TESTFLIGHT_PREP.md` §4.5 and `APP_STORE_SUBMISSION.md` §6 for the
operational tracking.

**Repo policy: never commit demo credentials.** The App Store Connect
"App Review Information" panel is the only place credentials live. This
file carries placeholder rows only.

| Field | Placeholder for in-repo docs | Where the real value lives |
|---|---|---|
| Demo email | `<provide in App Store Connect only>` | ASC → App Review Information → User Name. Use a mailbox the operator controls (not a personal address). |
| Demo password | `<provide in App Store Connect only>` | ASC → App Review Information → Password. Generate a strong, single-purpose value; rotate after each review cycle. |
| Sign-in is required? | Yes | Toggle this on in the ASC App Review Information form. |
| Seed data shape | 2 connected players + 1 chat with a short history | Produced by the seed script when it lands. |

When the seed script is created and the demo account is real, replace the
two placeholder cells above with a one-line note pointing at "ASC App
Review Information panel". Do not paste credentials into this repo, into
this file, or into the review-notes block in §9.

## 11. App Store screenshot checklist (v1 finalized)

Apple requires a coherent set per device class. Confirm device-class
requirements (counts and resolutions) with Apple's screenshot specs at
submission time; `APP_STORE_SUBMISSION.md` §9 carries the per-device
resolution table.

The final local screenshot package for v1 lives at
`docs/release/screenshots/ios/`. Six images are committed in the
display order below — the first three carry the strongest positioning
since Apple shows them in the App Store search-results card.

| # | File | Surface | Why it ships in v1 |
|---|---|---|---|
| 1 | `01-discovery-gym-partners.png` | `DiscoveryScreen` filtered to Gym | The core loop — sport-specific partner discovery with the "Connect" CTA. Most likely to convert. |
| 2 | `02-matches-message-previews.png` | `MatchesScreen` | Mutual-interest match list with chat previews so the conversion path from match to chat is obvious. |
| 3 | `03-chat-confirmed-session.png` | `ChatScreen` with a confirmed session card | Shows the 1:1 chat surface AND the confirmed session card so the booking flow is visible without leaving chat. |
| 4 | `04-events-sessions.png` | `EventsScreen` (Upcoming + Pending) | The single home for sessions — Upcoming sessions and Pending proposals. Demonstrates the "plan your next sports session" promise from §4. |
| 5 | `05-propose-session-form.png` | `BookingComposerScreen` (Propose a session) | Shows the date / time / venue proposal form so the screenshot story walks all the way through the proposal flow. |
| 6 | `08-profile-legal-account.png` | `ProfileScreen` legal + account block | Privacy / Terms / Support links and the Delete-account affordance — visible proof of the §9 review-notes claims for App Review §5.1.1(v). |

Capture guidance:

- **Use the SportsGang brand consistently.** Confirm the visible app name
  reads `SportsGang` (the inner `s`) before each screenshot session;
  `app.config.js` `expo.name` is already correct.
- **Use seeded, non-real data only.** No real names, real avatars, real
  phone numbers, real chat content, or real suburb / location signals.
  Reuse the same seed script that backs the reviewer demo account once
  it lands.
- **Do not screenshot any v1-hidden surface.** Specifically: Tournaments
  tab, RankHonorGuide route, Add-to-Calendar / Google Calendar
  Integrations card, distance / nearby filter, open chat rooms /
  events. Step 1 hardening hid those exact surfaces; shipping a
  screenshot of any of them would mis-advertise and risk a 5.1 / 2.3
  rejection.
- **Do not show push prompts, calendar prompts, or location prompts** in
  the captured frames. Those are not v1 marketing claims and capturing
  the system permission sheet implies the feature is shipped.
- **Keep captions consistent with the description (§4) and the
  positioning line (§3).** "Find your next game", "Built around the
  game, not the profile", and the §4 sport list are the safe vocabulary.

For the device-class capture mechanics (iPhone 16 Pro Max 6.9", iPhone
14 Plus 6.5", time-bar override, simulator commands), see
`APP_STORE_SUBMISSION.md` §9.

## 12. Open items before submission

### Resolved

| # | Item | Resolution |
|---|---|---|
| R1 | Public brand spelling (`SportGang` vs `SportsGang`) | Resolved 2026-05-05: public brand is `SportsGang` / `sportsgang`. Technical identifiers (slug `protin`, bundle ID `com.edh1223.protin`, npm workspaces `@protin/*`, EAS project `@edwardh1234/protin`) intentionally unchanged for v1. |
| R2 | Privacy / Terms / Support pages reachable over HTTPS | Done on Netlify — see §8 URL table. All four routes return `200 OK` HTML over HTTPS today. |
| R3 | Mobile EAS env values for legal/support URLs | `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_SUPPORT_URL` pinned on EAS `preview` and `production`. Verify with `eas env:list --environment {preview,production}`. |
| R4 | Real-iPhone tap-test of in-app legal/support links | PASS, 2026-05-05 — recorded in `RELEASE_GATE_CHECKLIST.md` §4.6. All five links opened the expected Netlify pages, no "link unavailable" alert, no 404, no crash. |
| R5 | Final local iOS screenshot package | PASS, 2026-05-06 — six PNGs prepared in `docs/release/screenshots/ios/` in the §11 order. Local package only — App Store Connect upload remains PENDING (see Remaining item 4). |
| R6 | App Store metadata copy review | PASS, 2026-05-06 — full pass over §1 identity, §2 promo (now references Events), §4 description (includes session proposal + court/venue + Accept/Decline + Events), §5 keywords (no badminton / push / calendar / tournament / rank / dating / nearby — `events` intentionally still excluded), §7 age rating (consistent 17+ across this file, `APP_STORE_SUBMISSION.md` §5, and `APPLE_TESTFLIGHT_PREP.md` §4.3), §8 URLs (Netlify host pinned), §9 review-notes walkthrough (extended through proposal + Events). `APP_STORE_SUBMISSION.md` §7 review-notes block, §8 description / keywords drafts, §9 screenshot lineup, and §12 rejection-recovery row that referenced "push notification flows" all replaced with pointers / cleaned copy so the two docs stay in lockstep. ASC submission itself remains PENDING (see Remaining items 4, 6, 7). |
| R7 | Apple Developer enrollment + ASC app record + EAS ID configuration | PASS, 2026-05-07 — Apple Developer Program enrollment complete, App Store Connect app record `SportsGang` created (Bundle ID `com.edh1223.protin`), Apple Team ID `37C8A2733Y` and ASC App ID `6767027447` captured and pinned in `apps/mobile/eas.json` `submit.production.ios`. APNs capability on the bundle ID, signing credentials, EAS iOS build, TestFlight upload, and TestFlight QA all remain PENDING. |

### Remaining

| # | Item | Blocker type | Owner |
|---|---|---|---|
| ~~1~~ | ~~Apple Developer Team ID~~ | ~~Apple-side setup~~ | RESOLVED 2026-05-07 — Team ID `37C8A2733Y` captured. See Resolved row R7. |
| ~~2~~ | ~~App Store Connect App ID~~ | ~~Apple-side setup~~ | RESOLVED 2026-05-07 — ASC App ID `6767027447` captured. See Resolved row R7. |
| 3 | Final app icon + splash artwork (replace Step 5 placeholders) | Design | Designer; replaces the placeholder PNGs in `apps/mobile/assets/`. |
| 4 | App Store Connect screenshot upload (per device class) | Apple-side upload | Operator. Local package is prepared in `docs/release/screenshots/ios/` (six PNGs in §11 order). Per-device-class resolution sets and the actual ASC upload remain pending — see `APP_STORE_SUBMISSION.md` §9 for the iPhone 16 Pro Max 6.9" / iPhone 14 Plus 6.5" capture matrix. |
| 5 | App Privacy Label confirmation against actual SDK behavior | Privacy review | Operator (see `APP_PRIVACY_LABEL_DRAFT.md`). |
| 6 | Reviewer demo account credentials (in ASC, never in repo) | Seed data | Operator + backend owner. Depends on `apps/api/scripts/seed_review_data.py` landing first. |
| 7 | Final review-notes copy pasted into ASC | Operator | Operator (paste from §9; substitute the live URLs in lockstep with §8). |
| 8 | Final age rating answered in ASC questionnaire | Operator | See §7. v1 recommended conservative default is 17+; final answer must align with `LEGAL_WEBSITE_CONTENT.md` Privacy §11 / Terms §2 minimum-age clause. |
| 9 | Real `support@`, `privacy@`, `legal@` mailboxes on a domain the operator controls | Operator | Required before the §9 review-notes contact line and the Support page footer can drop their placeholder addresses. |
| 10 | Optional custom-domain swap (`sportsgang.app` or similar) | Operator (optional) | Hypothetical only; do not claim the domain is live. If pinned, re-run §8 EAS env updates and the §4.6 / §4.8 verification in `RELEASE_GATE_CHECKLIST.md` and `APPLE_TESTFLIGHT_PREP.md`. |
| 11 | First green `eas build --platform ios --profile production` plus `eas submit --platform ios --latest` | Build path | Mobile / release owner. Items 1 and 2 (Apple Developer Team ID and ASC App ID) and the `eas.json` `ascAppId` / `appleTeamId` placeholder swap are now resolved (2026-05-07). Still gated by item 3 (final app icon + splash artwork), the APNs capability on the bundle ID, and the EAS-managed signing credentials flow on first build — both tracked in `APPLE_TESTFLIGHT_PREP.md` §4.2 / §4.3. |
| 12 | TestFlight internal tester group with 2+ humans, plus a dated on-device run of the §4.6 link tap-test against the actual signed build | Apple-side + device proof | Operator + at least one tester. Re-runs the §4.6 checklist on the production build, not just Expo Go. |

Until every "Remaining" line is resolved, the App Store record is not
ready to submit, even if the build itself passes review.
