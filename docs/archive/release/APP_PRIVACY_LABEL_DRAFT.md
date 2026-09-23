# App Privacy Label Draft

**Status:** draft. The categories, purposes, and "linked / used for tracking"
flags below are *intentions* based on what the app currently does. They have
**not** been verified against the actual implementation of every code path,
nor against the behavior of every third-party SDK we ship. **Do not paste
this into App Store Connect's App Privacy questionnaire as-is.** Confirm
each row against the source before submission.

The App Privacy Label is operator-facing documentation only. Apple will hold
the operator to whatever is published, so factual accuracy beats convenience.

---

## 1. How to read this draft

Apple's App Privacy questionnaire asks, for each category of data:

- **Collected?** Yes / No. (If No, the rest do not apply.)
- **Linked to user?** Yes if the data can be tied back to the user's account
  identity. Auth, profile, chat, reports, blocks — all linked.
- **Used for tracking?** Yes only if the data is shared with third parties
  for cross-app/website tracking (advertising IDs, etc.). For this app the
  expected answer is **No** for every category, but verify per-SDK before
  pasting.
- **Source:** `User-provided` (forms, photos, messages) vs `Automatic`
  (collected without an explicit user action — diagnostics, identifiers).
- **Purpose:** App Functionality / Analytics / Product Personalization /
  App Improvement / etc. Apple's pick-list is fixed; map each row to the
  closest fit.

---

## 2. Data categories — current intent

### 2.1 Contact info → Email address
- **Collected:** Yes.
- **Source:** User-provided (sign-up form, Sign in with Apple).
- **Linked to user:** Yes (account identifier).
- **Used for tracking:** No.
- **Purpose:** App Functionality (login, account recovery, contacting the
  user about safety actions if needed).
- **Verify:** that no marketing email pipeline is wired before the label is
  published; if one ships later, add `Communications` purpose.

### 2.2 User content → Profile photos
- **Collected:** Yes.
- **Source:** User-provided (photo picker upload).
- **Linked to user:** Yes (shown on profile, attached to matches).
- **Used for tracking:** No.
- **Purpose:** App Functionality (profile presentation, matching).
- **Verify:** retention behavior on account deletion (must be deleted with
  the account; see §6 below).

### 2.3 User content → Bio / profile fields (display name, suburb, level)
- **Collected:** Yes.
- **Source:** User-provided (onboarding + EditProfile).
- **Linked to user:** Yes.
- **Used for tracking:** No.
- **Purpose:** App Functionality (matching).
- **Verify:** suburb is a coarse geographical cue, not a precise location —
  see §2.6.

### 2.4 User content → Chat / messages
- **Collected:** Yes.
- **Source:** User-provided.
- **Linked to user:** Yes (sender + recipient).
- **Used for tracking:** No.
- **Purpose:** App Functionality.
- **Verify:** server-side retention policy (privacy policy claim must match
  what the API actually does on account deletion).

### 2.5 User content → Reports / safety reports
- **Collected:** Yes (Step 3 hardening).
- **Source:** User-provided.
- **Linked to user:** Yes — both reporter and reported user IDs are
  recorded.
- **Used for tracking:** No.
- **Purpose:** App Functionality (moderation), Customer Support.
- **Verify:** retention policy. Reports may need to outlive the reporter's
  account for audit purposes; see §6.

### 2.6 Identifiers → User ID, auth/session identifier
- **Collected:** Yes.
- **Source:** Automatic (server-generated on register/login).
- **Linked to user:** Yes (this *is* the linkage).
- **Used for tracking:** No.
- **Purpose:** App Functionality.
- **Verify:** that no per-device advertising identifier (IDFA) is collected.
  Default for this app is **No IDFA**.

### 2.7 Location-related → Suburb / manually selected location/venue
- **Collected:** Yes for suburb (free-text, user-typed during onboarding).
- **Source:** User-provided.
- **Linked to user:** Yes.
- **Used for tracking:** No.
- **Purpose:** App Functionality (matching by area).

### 2.7a Location-related → Foreground device location (v1.1, venue picker)

> _Draft wording — confirm with legal/operator before App Store submission.
> The App Privacy answers in App Store Connect must be reviewed and
> updated to reflect this row before v1.1 is submitted._

- **Collected:** Yes, **only with explicit user permission** at the
  moment the in-app venue / court picker opens. The build uses
  `expo-location` with foreground permission and a single position
  fix; no background location, no continuous tracking.
- **Precision:** Apple's "Precise Location" answer applies when the
  user grants precise permission; "Coarse Location" applies when the
  user grants approximate permission. The app accepts whichever
  precision the OS hands back; the picker works at either level.
- **Source:** Automatic (foreground OS fix), gated by user permission
  grant.
- **Linked to user:** Yes (the request carries the caller's auth
  token to the SportsGang backend).
- **Used for tracking:** No.
- **Purpose:** App Functionality — venue discovery, venue search,
  list/map sorting by distance, and venue selection for sessions /
  bookings / games / challenges.
- **Backend processing:** When the venue picker is open, mobile sends
  the coordinates to the SportsGang backend together with the sport
  keyword and an optional search radius. The backend may forward those
  same query inputs to **Google Maps Platform / Google Places** as a
  third-party venue provider to widen coverage. No SportsGang user
  identifier or email is sent to Google.
- **Opt-out:** Location access is optional. If the user denies, the
  picker shows a manual venue-entry fallback and a static catalog —
  the rest of the app continues to function.
- **Verify:**
  - that no background location or "Always" location permission is
    requested (only foreground while-in-use);
  - that the App Privacy Label answers in App Store Connect are
    re-published before v1.1 submission so they include this row;
  - that "Powered by Google" attribution renders whenever Google
    Places-sourced venue results are visible (see §6 below).

### 2.8 Diagnostics → Crash logs / performance diagnostics
- **Collected:** Conditional.
- **Source:** Automatic (Sentry when `@sentry/react-native/expo` plugin is
  active and a DSN is configured).
- **Linked to user:** Verify — Sentry default behavior is to capture user
  context only if explicitly set. The v1 build should ensure Sentry's user
  context is *unset* unless there is a documented reason to set it.
- **Used for tracking:** No.
- **Purpose:** App Improvement (crash diagnostics).
- **Verify:** whether Sentry DSN is actually shipped in production EAS
  profile. If not, switch this row to "Not collected" before publishing the
  label, matching the guidance in `APPLE_TESTFLIGHT_PREP.md` §4.3.

### 2.9 Usage data / analytics
- **Collected:** **Verify.** No first-party analytics SDK is wired today.
  If one ships later (Amplitude, Firebase Analytics, PostHog, etc.), this
  row must be filled in before that build hits TestFlight.
- **Default answer for v1:** Not collected.

### 2.10 Sensitive personal data
- **Collected:** No.
- The app does not collect health data, financial data, government IDs, or
  other categories Apple flags as sensitive. Verify before submission.

---

## 3. "Tracking" question

Apple defines tracking as linking user data with third-party data, sharing
with data brokers, or showing targeted ads. The expected answer for v1 is
**No tracking** across every category. Verify by:

- Confirming no advertising SDK ships in `apps/mobile/package.json`.
- Confirming Sentry / Expo do not run a third-party tracker beacon.
- Confirming the backend does not forward user data to a marketing platform.

If any of those answers flip to Yes, the relevant rows above must change.

---

## 4. Account deletion

The mobile app exposes Delete account in `ProfileScreen` (Step 4 hardened).
Confirming destination side-effects (which the privacy policy must match):

- The auth-store `logout()` clears the local token (SecureStore) and resets
  the profile store (display name, photos, sport rows).
- `DELETE /auth/me` is the server-side delete. The backend implementation
  is owned by the API team and is **not** verified in this slice. Before
  the privacy policy commits to specific deletion behavior, confirm:
  - whether the server hard-deletes or soft-deletes the user row,
  - retention period for chat messages and reports,
  - retention period for blocks (often kept indefinitely so a blocked user
    cannot re-create an account and re-match the blocker — confirm policy),
  - retention of profile photos in object storage.

Do not write a deletion claim in the privacy policy that the backend cannot
honor. Either match the backend's actual behavior or update the backend
first.

---

## 5. Report / block moderation data

Reports and blocks are subject to platform-policy expectations:

- A report is created with the reporter's user ID + the reported user ID
  + reason + optional context. Linked to user.
- A block is created with the blocker + blocked user ID. Linked to user.

Both flows go through the existing API endpoints (Step 3). The privacy
label entry in §2.5 reflects the reports row. Blocks are currently treated
as "Identifiers / linked / not for tracking" — verify before publishing.

---

## 6. Third-party services to verify

Before publishing the App Privacy Label, confirm each of the following with
its current production configuration. Each row is "verify" until a signed
answer is recorded.

| Service | Why it is in the build | What to verify |
|---|---|---|
| Expo / EAS | Build/distribution path | Whether Expo's update server collects identifying data on update fetch (typically not). |
| Sentry (`@sentry/react-native/expo`) | Crash + perf diagnostics | DSN actually set in production EAS env? Sentry user context cleared by default? Apple's questionnaire treats Sentry as a `Diagnostics > Crash Data` collector. |
| Backend hosting (fly.io for `protin-api.fly.dev`) | Server logging | Server access logs may include IP. Decide retention; document in privacy policy. |
| Apple Sign-In | Optional auth path | Apple's hide-my-email relay is opaque to the operator; confirm the backend treats the relay address the same as a normal email. |
| First-party analytics SDK | None today | If one is added, refile §2.9 before that build is submitted. |
| Push notifications (Expo Push, future) | Currently hidden in v1 | Push registration is best-effort and silent in v1 (Step 4 / RootNavigator). When push is unhidden, confirm whether a device push token is collected and update §2.6. |
| Google Maps Platform / Google Places (v1.1) | Venue / court lookup behind the in-app picker | (1) Privacy Policy §4 lists this processor; (2) coordinates + sport keyword sent server-side only — API key never embedded in the mobile build; (3) Places-sourced rows are not persisted to the SportsGang database; (4) "Powered by Google" attribution renders whenever Places results are surfaced (see §8 below); (5) App Privacy answers reviewed/re-published in App Store Connect before v1.1 submission. |

---

## 7. Open questions

These are unresolved. Each must have a recorded answer before submission.

1. **Sentry production DSN** — set or not? If unset, switch §2.8 to
   "Not collected".
2. **Backend chat retention** — what is the actual server-side retention
   policy for messages once both users delete their accounts? The privacy
   policy claim depends on this.
3. **Reports retention** — operator policy decision: keep indefinitely for
   audit, or expire after N days? Both have App Store compliance arguments.
4. **Blocks after both accounts delete** — do block rows survive when both
   user IDs are gone? Most platforms keep them; confirm.
5. **Profile photo storage** — cloud bucket retention on account delete?
   Verify against API implementation.
6. **Hide-my-email Apple relay** — backend treats relay address as the
   user's email of record; confirm.
7. **Future push notification SDK choice** — Expo push only, or APNs
   directly? The label answer changes if the operator switches.
8. **Future analytics** — operator decision; default for v1 is no
   analytics. Lock this in writing before any build that adds one.

---

## 8. v1.1 release check — Google Places attribution + map provider compatibility

> _Draft wording — confirm with product/legal before App Store submission.
> No code changes are proposed by this pass; this section is a
> pre-submission checklist for the venue picker surface._

The v1.1 venue picker can surface rows sourced from Google Places. Google
Maps Platform terms require "Powered by Google" attribution whenever
Places data is shown to a user, and they restrict where Google content
can be rendered.

### 8.1 Attribution must be visible whenever Places results appear
- [ ] Mobile renders the "Powered by Google" chip in
      `apps/mobile/src/screens/bookings/NearbyCourtsModal.tsx` whenever
      the result set includes a venue with `source === "google_places"`
      (or `attributionRequired === true`).
- [ ] The chip is hidden for seed-only result sets (verified by
      `NearbyCourtsModal.test.tsx`).
- [ ] The chip remains visible in both List and Map modes of the picker
      and is not cropped by the safe-area / home indicator on notched
      iOS devices.
- [ ] Attribution copy is plain ASCII (`Powered by Google`) and uses a
      color/contrast that remains readable on the dark / neon theme.

### 8.2 Map provider compatibility check (release risk)
- [ ] Identify which map provider `apps/mobile/src/components/VenueMapView.tsx`
      uses for pins (Apple Maps via Expo's default `react-native-maps`
      provider, Google Maps via the `PROVIDER_GOOGLE` provider, or a
      custom non-Google tile source).
- [ ] **If pins for Google Places-sourced rows are rendered on a
      non-Google base map** (Apple Maps, OSM tiles, MapTiler, etc.),
      flag this as a release risk for product / legal review before
      v1.1 submission. Google Maps Platform terms restrict displaying
      Google content on competing maps in some configurations; the
      product owner needs to confirm whether the current provider
      choice is compatible or whether the picker needs to (a) show
      Places results in list-only mode, (b) switch to the Google Maps
      provider, or (c) drop Places pins from the map view.
- [ ] **Do not change code in this QA pass.** Action belongs in a
      follow-up branch once product / legal confirms the chosen
      direction. Logged here so it is not forgotten between QA and
      submission.

### 8.3 No mobile-side Google API surface
- [ ] Mobile bundle has zero references to `GOOGLE_PLACES_API_KEY`,
      `places.googleapis.com`, `X-Goog-Api-Key`, or any `AIza`-prefixed
      string (re-grep `apps/mobile/src` before each release build).
- [ ] The API key is set as a backend Fly secret only (see
      `docs/archive/release/GOOGLE_PLACES_RELEASE_QA.md` §3).
