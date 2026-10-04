# Release candidate — manual home-test checklist

A short pass over the release candidate on its own QA stack. The detailed
step lists live in [../HOME_TEST_RUNBOOK.md](../HOME_TEST_RUNBOOK.md) (§ numbers below);
this page says what to check on this candidate and where it differs.

## The candidate session

| Item | Value |
|---|---|
| Worktree | `.claude/worktrees/run-golf-v2-rc` (branch `chore/run-golf-v2-release-candidate-2026-10-04`) |
| Launcher project | `sg-rc-20261004-qa` — **not** the human stack `sportsgang-qa` (8130/8190/55470/56470), which is untouched |
| API | `http://127.0.0.1:8163` |
| App (Expo Go, simulator) | `exp://127.0.0.1:8263` |
| Website preview | `http://127.0.0.1:5196/` (production build of `apps/web`; legal pages at `/privacy/`, `/terms/`, `/support/`) |
| Accounts | `qa.alice`, `qa.bob`, `qa.cara`, `qa.dan`, `qa.fern`, `qa.eve`, `qa.newbie`, `qa.mod` `@example.com`; one shared password in `.qa/credentials.json` (mode 600, git-ignored) |
| Source | see [CANDIDATE.json](CANDIDATE.json) `final_source_sha`; `npm run qa:status` prints what the API and Metro actually run |

Run every launcher command **from the candidate worktree** with its own owner home:

```sh
cd .claude/worktrees/run-golf-v2-rc
export SPORTSGANG_QA_HOME="$PWD/.qa/owner-home"
npm run qa:status            # ownership, health, running source
npm run qa:open              # opens the app in booted simulators
npm run qa:stop-api          # for §6 below
npm run qa:up -- --no-open --no-seed
npm run qa:down              # when finished (keeps the data volume)
kill "$(cat .qa/web-preview.pid)"   # stops the website preview
```

A physical iPhone needs `npm run qa:restart -- --mode device` (the app then talks
to this Mac's LAN address). A dedicated simulator, "SportsGang RC 20261004"
(iPhone 16e), is left booted with Expo Go installed; any simulator works.

## Checklist

Record each line as PASS / FAIL / BLOCKED with a screenshot for anything that fails
(template: runbook "Result template").

1. **Running preferences and matching** (runbook §2–§4, as `qa.alice`, Explore › Run › Partners)
   - [ ] QA Fern "Fits both ways" with the overlapping pace range; "Matching pace only" leaves only Fern.
   - [ ] QA Cara reads "Social — pace is flexible"; QA Eve "Preferences not set"; QA Dan absent until Alice's pace changes.
   - [ ] Editing Alice's pace (and back) changes the list after a pull-to-refresh.
2. **Golf preferences and mutual beginner/experienced intent** (runbook §5, Explore › Golf › Partners)
   - [ ] QA Bob "Fits both ways" — more experienced, "Welcomes beginners", "Handicaps are self-reported, not verified".
   - [ ] QA Cara (similar level only) is absent.
   - [ ] Optional: Bob unticks "Happy to play with beginners" → Bob disappears for Alice; re-tick.
3. **Interest → match → chat → proposal → confirmation → My Plans** (runbook §8, §9)
   - [ ] Show interest from both sides (e.g. Alice ↔ Fern) opens a chat; interest alone does not.
   - [ ] Chats › QA Bob › "+ Session" → pick a date and times → "Send proposal": detail shows "Awaiting confirmation" with exactly those Sydney times.
   - [ ] As Bob: accept it → "Session confirmed"; both My Plans › Upcoming show the same Sydney time.
4. **Blocking, unblocking, existing bookings kept** (runbook §11; contract: CONTRACTS §8 "Kept while restricted")
   - [ ] As Alice, block QA Bob from the chat's ⋯ menu: the chat leaves Chats; Bob cannot message or propose ("You can't contact this person.").
   - [ ] Alice's and Bob's existing sessions with each other stay in My Plans and can still be opened, declined or cancelled.
   - [ ] Unblock (Profile › Blocked users): the chat returns with its earlier history; new messages work.
   - [ ] Report / block / unblock QA Mod Target as in §11.
5. **Failed requests and retry** (runbook §13)
   - [ ] With the API stopped, My Plans keeps the loaded rows with "Couldn't refresh your plans…" and "Retry"; a session detail shows "Could not load this session" with "Try again".
   - [ ] After `qa:up -- --no-open --no-seed`, "Try again" / "Retry" recover and the notice clears.
6. **Large text and time selection** (new in this candidate; evidence: [evidence/native/README.md](evidence/native/README.md))
   - [ ] Settings › Accessibility › Display & Text Size › Larger Text at the largest size, then relaunch Expo Go (it keeps old text sizes until relaunched).
   - [ ] Chats › QA Bob › "+ Session": the "Propose a session" title stays on one line, Back is a normal-size arrow, the form starts right under the header, and "Send proposal" sits inside its button.
   - [ ] Start/End time pickers: "Done" is whole and tappable; tapping the row next to the selection moves to it; a swipe settles on a row; the chosen times survive closing and reopening.
   - [ ] Back at default size, send a proposal and check the detail shows the same Sydney times.
   - Known and not fixed in this candidate: at the largest size the **chat screen's** ⋯ button is partly off-screen and its name/placeholder are cut short.
7. **In-app legal and support links** (Profile, bottom; and Register)
   - [ ] In this Expo Go session, Privacy Policy / Terms of Service / Support show the app's "<Link> not available — This link is not available yet." alert: the launcher does not pass the `EXPO_PUBLIC_*_URL` values, by design (`apps/mobile/src/lib/legal.ts`). The app has no App Store link of its own.
   - [ ] The public pages the store build links to open in Safari: `https://sportgang.netlify.app/privacy/`, `/terms/`, `/support/` (unchanged live pages; do not edit them).
8. **Website layout and navigation** (`http://127.0.0.1:5196/`; evidence: [evidence/web/README.md](evidence/web/README.md))
   - [ ] Phone width and desktop: header, menu, every nav link lands on its section below the sticky header; the FAQ opens and closes.
   - [ ] Keyboard only: Tab shows a visible focus ring everywhere; the skip link jumps to the content; Escape closes the menu.
   - [ ] The hero and final panel say the running and golf experience comes "with the next SportsGang update"; the App Store button opens the SportsGang listing.
   - [ ] Footer Privacy/Terms/Support open the live pages; `http://127.0.0.1:5196/privacy/`, `/terms/`, `/support/` show the same pages from the build.

## Not covered here

Real push notifications, a physical iPhone and VoiceOver, Android, a signed
release build, production services, and R6's production timestamp
provenance ([../morning-fixes/R6_C01_DEPLOYMENT_GATE.md](../morning-fixes/R6_C01_DEPLOYMENT_GATE.md)).
Do not run `qa:reset` in the human `run-golf-v2-home-test` worktree.
