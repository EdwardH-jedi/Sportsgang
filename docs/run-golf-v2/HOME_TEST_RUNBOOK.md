# Run + Golf v2 — home acceptance runbook (20–30 min)

Prepared by Claude (implementer). Basic path first (scenarios 1–13), optional
deeper checks after. Everything runs locally; nothing touches staging or
production.

## Start here

| | |
| --- | --- |
| Worktree | `/Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2-home-test` |
| Branch | `chore/run-golf-v2-home-test-ready` (from `fix/run-golf-v2-review-fixes` @ `0789382`) |
| Source | the branch HEAD — `npm run qa:status` prints the source SHA the stack was started from |
| Start / recover (one command) | `npm run qa:up` |
| Status | `npm run qa:status` (all rows must say `OK`) |
| Open the app in the simulators | `npm run qa:open` (quits and reopens Expo Go; you stay signed in) |
| Credentials | `.qa/credentials.json` — every account uses the same password (`password` field) |
| Fixture manifest | `.qa/manifest.json` — ids, session names, expected results |
| Logs | `.qa/logs/api.log`, `.qa/logs/metro.log` |

Run all commands from the worktree. The stack is separate from your other
databases: Compose project `sportsgang-qa`, DB `sportsgang_qa` on
`127.0.0.1:55470`, Redis `56470`, API `http://127.0.0.1:8130`, Metro `8190`.

**Simulator.** iPhone 16e and iPhone 17 Pro are booted with Expo Go open on
the app. If Simulator was closed: `open -a Simulator`, then `npm run qa:open`.
Typing tip: if the simulator types Hangul, press Ctrl+Space to switch the
keyboard to English.

**Physical iPhone (optional).** Needs Expo Go for SDK 54 on the phone and the
same Wi-Fi as the Mac. Run `npm run qa:up -- --mode device`, then scan the QR
it prints (or open `exp://<Mac LAN IP>:8190` in Expo Go). Switch back with
`npm run qa:up -- --mode simulator`. Device mode was verified by opening the
LAN URL from a simulator, not on a real phone.

**If several days have passed,** run `npm run qa:seed` first. It only adds
what is missing, including future-dated copies of sessions that are now in the
past. The dates below are as seeded on Sat 3 Oct 2026; the manifest has the
current ones. Sydney moves to daylight time (AEDT) on Sun 4 Oct 2026; every
time in the app is Sydney time.

### Accounts (all `@example.com`)

| Login | Name | Use |
| --- | --- | --- |
| `qa.alice` | QA Alice | Main walkthrough. Runner 5:30–6:15 /km "Match my pace", golf learner (estimate 30.0, "Learn from experienced golfers"). Matched with Bob. |
| `qa.bob` | QA Bob | Host of the QA sessions, Alice's match. Runner 5:45–6:30, golf 12.0 official, "Happy to play with beginners". |
| `qa.cara` | QA Cara | Social runner (no pace); golf "Similar level" only. |
| `qa.dan` | QA Dan | Fast runner 4:00–4:30 (no overlap with Alice); hosts "QA Extra run 01–22". |
| `qa.fern` | QA Fern | Runner 5:40–6:20 — overlaps Alice. |
| `qa.eve` | QA Eve | Legacy profile without running preferences. |
| `qa.newbie` | — | Registered, no profile: goes straight to onboarding. |
| `qa.mod` | QA Mod Target | Disposable: report/block/delete target. |

### Limitations (not testable here)

| Item | Why | Prerequisite and reproduction |
| --- | --- | --- |
| Sign in with Apple | Needs a signed build with the Apple capability; Expo Go cannot. No signing identities on this Mac. | Dev or TestFlight build → Log in → "Sign in with Apple". |
| Push notifications | QA API sends pushes to a dead local address; simulators do not receive remote pushes. | Physical phone + dev build + Expo push credentials → Bob proposes a session → Alice's phone gets a push. |
| Release build | Expo Go + Metro is a dev runtime; a bundle export is not a release pass. | EAS/Xcode release build on a device. |
| Third-party providers | Provider keys are blank in QA (Google Calendar, places lookups). | Staging keys in a staging build. |
| My Plans one-source failure | Needs a fault on one endpoint only; no injector in the QA stack. Covered by `MyPlansScreen.test.tsx` ("keeps group sessions visible when bookings fail"). | Local proxy returning 500 for `/bookings` only → My Plans shows "Couldn't load your 1:1 sessions. Group sessions are still shown." |
| Chats list time | Known, pre-existing: message times are stored without a timezone, so the Chats list shows the UTC clock (e.g. "8:09 AM" for 6:09 pm Sydney). See `PRETEST_VERIFICATION.md` §3. | — |

## Scenarios

Each scenario gives the account, starting screen, steps, expected visible
result, expected persisted result, and what to capture on failure. Unless
stated otherwise, start on iPhone 16e. Profile › Log out has no confirm dialog.

### 1. New onboarding without photos/bio
- **Account / start:** `qa.newbie` · Welcome screen → "Log in".
- **Steps:**
  - "Step 1 of 4": Display name "QA Newbie", Birth year 1994, suburb "Redfern" → Continue.
  - "What do you play?": Running → Continue.
  - "Your running": Overall level Intermediate, "Match my pace", Fastest 5:45, Slowest 6:30 → Continue.
  - "When do you play?": Mornings → Finish.
- **Expected:** you land in Explore. Photos and bio are never asked for.
  - Run › Partners lists QA Alice, QA Bob and QA Fern as "Fits both ways".
  - QA Dan is absent.
- **Persisted:** Profile shows QA Newbie · Redfern, with Running "Pace 5:45–6:30 /km". It survives `npm run qa:open`.
- **On failure:** the screen of the failing step and any error text.
- **Note:** this uses up the prepared newbie account. Repeat only after `npm run qa:reset -- --yes`.

### 2. Running pace match and social mode
- **Account / start:** `qa.alice` · Explore › Run › Partners.
- **Expected:**
  - **QA Fern:** "Fits both ways", with "✓ Pace ranges overlap at 5:40–6:15 /km".
  - **QA Cara and QA Mod Target:** "Pace not confirmed".
  - **QA Eve:** "Preferences not set".
  - **QA Dan:** absent (pace mismatch).
  - **QA Bob:** absent (already matched).
- **Steps:**
  - Tick "Matching pace only": only QA Fern remains. Untick it.
  - Open QA Cara: her style reads "Social — pace is flexible".
- **On failure:** the partner list, plus the card of the wrong person.

### 3. Preference edit updates recommendations
- **Account / start:** `qa.alice` · Profile › "Edit running preferences".
- **Steps:**
  - Set Fastest 4:00, Slowest 4:30 → "Save preferences".
  - Explore › Run › Partners, then pull down to refresh.
- **Expected:** QA Dan now shows "Fits both ways" and QA Fern is gone. Cara still shows "Pace not confirmed".
- **Persisted:** Profile running card shows "Pace 4:00–4:30 /km".
- **Restore:** set 5:30 / 6:15 and save.
- **On failure:** the partner list and the Profile running card.

### 4. Clearing pace releases strict filtering
- **Account / start:** `qa.alice` · Profile › "Edit running preferences".
- **Steps:** choose "Social", delete both Fastest and Slowest → "Save preferences" → Explore › Run › Partners (pull to refresh).
- **Expected:**
  - Nobody is excluded for pace: QA Dan and QA Fern appear as "Pace not confirmed" ("They want to match pace; you haven't shared a pace range").
  - QA Cara shows "Both run socially — pace is flexible".
  - "Matching pace only" is disabled, with the note "Add your pace range to use this filter".
- **Restore:** "Match my pace", 5:30 / 6:15, Save.
- **On failure:** the partner list and the preference form.

### 5. Golf explicit beginner-companion consent
- **Account / start:** `qa.alice` · Explore › Golf › Partners.
- **Expected:**
  - QA Bob shows "Fits both ways", with "✓ More experienced than you (handicap 12.0 vs 30.0)", "✓ Welcomes beginners" and "Handicaps are self-reported, not verified".
  - QA Cara is absent: she chose "Similar level" only and has not opted into playing with beginners.
- **Optional consent check (switches accounts):**
  - Log in as `qa.bob` → Profile › "Edit golf preferences" → untick "Happy to play with beginners" → "Save preferences".
  - Log in as Alice → Golf › Partners: QA Bob is gone.
  - Re-tick it as Bob afterwards.
- **On failure:** both people's golf preference screens.

### 6. Running join → plans → leave → rejoin
- **Account / start:** `qa.alice` · Explore › Run › Sessions › "QA Bondi sunrise 5k" (Mon 5 Oct · 6:30 am, "6 runners · 5 spots left").
- **Steps:**
  - "Join this run".
  - My Plans › Upcoming → open the group run → "Leave this run".
  - Go back to the session and "Join this run" again.
- **Expected:**
  - After joining: "You're going.", "6 runners · 4 spots left", "2 of 6, including the host", and a "Joined" badge on the Explore card.
  - Leaving restores 5 spots and the row leaves Upcoming. Rejoining works.
- **Persisted:** a pull-to-refresh and `npm run qa:open` show the same state.
- **Restore:** "Leave this run" at the end, so the prepared data stays as described.
- **On failure:** the detail screen, list card and My Plans.

### 7. Golf final place → Full/Joined on detail and list
- **Account / start:** `qa.alice` · Explore › Golf › Sessions › "QA Moore Park 9" (Tue 6 Oct · 7:30 am, "2 golfers · 1 spot left", ~$35, Beginners welcome).
- **Steps:**
  - "Join this round".
  - Then, on iPhone 17 Pro, log in as `qa.cara` and open the same round.
- **Expected:**
  - Alice sees "You're going."; the list card shows "2 golfers · Full" and "Joined".
  - Cara sees "This round is full." and no Join button.
- **Restore:** Alice "Leave this round".
- **On failure:** both phones' detail screens.

### 8. Running booking proposal → partner confirmation → Sydney time
- **Account / start:** `qa.alice` · Chats › QA Bob.
- **Steps:**
  - "+ SESSION" → "Propose a session": a date next week, Start 7:00 am, End 8:00 am → "Send proposal".
  - Then, on iPhone 17 Pro as `qa.bob`: Chats › QA Alice → "Accept".
- **Expected:**
  - Alice's detail shows "AWAITING CONFIRMATION" with exactly the times entered and "Times are Sydney time".
  - Bob sees "Session proposal / QA Alice proposed a session" with the same times. After Accept: "Session confirmed".
  - Both My Plans › Upcoming show it at the same Sydney time.
- **Shortcut:** as Alice, My Plans › Pending (1) › "Requested by QA Bob" (Wed 7 Oct · 6:30–7:30 am) → "Confirm".
- **On failure:** both detail screens and the entered times.

### 9. Upcoming/Pending stay visible with large history; Show more works
- **Account / start:** `qa.alice` · My Plans.
- **Expected:**
  - **Upcoming:** "Running with QA Bob", Fri 9 Oct · 7:00 am – 8:00 am, Confirmed (plus anything you joined).
  - **Pending (1):** Bob's request.
  - **Past:** 110 rows, newest first, mixing "QA history run NN" group runs and "Running with QA Bob" 1:1 sessions. 20 load per page; "Show more" loads more until it disappears.
  - After paging Past, switching back to Upcoming and Pending still shows their rows.
- **On failure:** the tab, the last visible row and whether "Show more" was present.

### 10. Logout / account switch
- **Account / start:** `qa.alice` · Profile.
- **Steps:** "Log out" → log in as `qa.bob`.
- **Expected:**
  - Bob sees only his own data: Profile "QA Bob · Bondi", Chats › QA Alice, My Plans with his sessions. Nothing of Alice's remains on screen.
  - Log back in as Alice afterwards.
- **On failure:** any screen showing the previous user's data.

### 11. Report / block / unblock
- **Account / start:** `qa.alice` · Explore › Run › Partners › QA Mod Target.
- **Steps:**
  - "Report" → pick a reason → submit.
  - Back on the profile: "Block" → "Block QA Mod Target?" → Block.
  - Profile › Blocked users → "Unblock QA Mod Target" → Unblock.
  - Explore › Partners, then pull to refresh.
- **Expected:**
  - Report: "Report submitted".
  - Block: you return to the list and QA Mod Target is gone.
  - Blocked users lists "QA Mod Target" with "Blocked <date>". After Unblock: "No blocked users", and QA Mod Target is back in Explore.
- **Persisted:** the API log shows `POST /reports` 201, `POST /blocks/…` 201 and `DELETE /blocks/…` 204.

### 12. Delete the disposable account
- **Account / start:** `qa.mod` · Profile (scroll down).
- **Steps:**
  - "Delete my account" → "Delete your account?" → "Delete account".
  - Log in again as `qa.mod`.
- **Expected:** you return to the Welcome screen. The second login shows "Invalid credentials".
- **Restore:** `npm run qa:seed` recreates QA Mod Target with a new id; the manifest is rewritten.

### 13. Offline / retry
- **Account / start:** `qa.alice` · My Plans.
- **Steps:**
  1. In the terminal: `npm run qa:stop-api`.
  2. Pull down on My Plans.
  3. Open the confirmed 1:1 session.
  4. `npm run qa:up -- --no-open --no-seed`.
  5. Tap "Try again", go Back, then tap "Retry" on My Plans.
- **Expected:**
  - Step 2: the earlier rows stay, with one notice "Couldn't refresh your plans. Showing what was loaded earlier." and "Retry".
  - Step 3: "Could not load this session", the "Cannot reach the server…" text, plus Back and "Try again".
  - Step 5: the session loads and the notice clears.
- **One-source failure:** not prepared natively (see Limitations).

### Optional deeper checks
- **Large text:** set Settings › Accessibility › Display & Text Size › Larger Text, then repeat scenarios 2 and 9 on iPhone 16e.
- **VoiceOver on onboarding pickers:** "Birth year" announces the chosen value; each year is its own button; "Close Birth year" closes.
- **Paging:** Explore › Run › Sessions as Alice. The 22 "QA Extra run" sessions page with "Show more sessions"; "QA Cancelled Sunday run" is never listed.
- **Double tap:** double-tap "Join this run". Exactly one `POST /events/…/join` should appear in `.qa/logs/api.log`.

## Result template

```
#  Result (PASS/FAIL/BLOCKED) | Screen and action | Expected | Actual | Screenshot | Source SHA + runtime
1  PASS | Onboarding Step 1→Finish | Explore, Fern/Alice/Bob fit | as expected | — | <sha from qa:status>, Expo Go 54 on iPhone 16e (iOS 26.3)
```

## Reset and recovery (QA stack only)

| Situation | Command |
| --- | --- |
| Anything looks off | `npm run qa:status` |
| App shows old code or a red screen | `npm run qa:open` (or `npm run qa:restart` after pulling code) |
| API stopped (e.g. after scenario 13) | `npm run qa:up -- --no-open --no-seed` |
| After a reboot / Docker restart | `npm run qa:up` |
| Demo data edited or a session went past | `npm run qa:seed` (adds only what is missing; keeps your edits) |
| Start the demo data from scratch | `npm run qa:reset -- --yes` (drops and recreates only `sportsgang_qa` and the QA Redis, then reseeds) |
| Done for the day | `npm run qa:down` (stops API, Metro and the QA containers; data kept in volume `sportsgang-qa_pgdata`) |

- `qa:up`, `qa:open` and `qa:restart` quit and relaunch Expo Go. This is expected, not a crash.

## Stack ownership (launcher from review R2 on)

- One worktree owns a Compose project. The owner is recorded in
  `~/.sportsgang-qa/<project>.json` (worktree path + a fingerprint of that
  worktree's `.qa/config.env`; no secrets). `qa:up`, `qa:seed`, `qa:stop-api`,
  `qa:restart`, `qa:down` and `qa:reset` run only from the owner and refuse
  from any other worktree or a regenerated config. `qa:status` and `qa:open`
  are read-only.
- Before signalling the API or Metro, the launcher checks the recorded pid is
  still the same process (process group, start time, command line, cwd). If
  not — a reused pid or another program — it signals nothing; `down`,
  `restart`, `stop-api` and `reset` refuse and change nothing.
- **Adopting the stack that is already running** (started by the previous
  launcher, no owner record yet): after this launcher is in the home-test
  worktree, run `npm run qa:status` (read-only; ownership shows *adoptable*
  only if the containers were created from this worktree's compose file with
  this config's DB password), then `npm run qa:up -- --no-open --no-seed`.
  That records ownership and upgrades the running API/Metro records after
  verifying them; it does not restart containers or touch the volume.
  `npm run qa:restart` then loads new code: neither process reloads by
  itself (Metro runs in CI mode without a file watcher), and `qa:status`
  says when `apps/api` or `apps/mobile`/`packages` changed since each
  started.
- **A second, separate stack** (another worktree): put
  `QA_PROJECT=sportsgang-qa-<name>` and unused ports (`QA_API_PORT`,
  `QA_METRO_PORT`, `QA_PG_PORT`, `QA_REDIS_PORT`) in that worktree's
  `.qa/config.env` before its first `qa:up`. It gets its own containers and
  volume `<project>_pgdata`.
- A volume with no containers and no owner record is never adopted
  (ownership cannot be proven). If an owner worktree was deleted, remove its
  `~/.sportsgang-qa/<project>.json` by hand once you are sure nobody uses that
  stack.
- Never use the root `infra:reset`; it is not part of this stack.
- "Too many requests" on login or register is the real rate limit (5 logins or 3 registrations per minute). Wait one minute.
