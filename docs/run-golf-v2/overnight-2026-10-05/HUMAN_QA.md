# Morning QA — overnight candidate checklist

Step-by-step versions of most items are in [../HOME_TEST_RUNBOOK.md](../HOME_TEST_RUNBOOK.md)
(§ numbers below). This page lists what to check on this candidate.

## Session

| Item | Value |
|---|---|
| Worktree | `.claude/worktrees/run-golf-v2-overnight` (branch `fix/run-golf-v2-overnight-2026-10-05`) |
| Launcher project | `sg-on-20261005-qa` — separate from `sportsgang-qa` (human stack) and `sg-rc-20261004-qa` (previous candidate), both untouched |
| API | `http://127.0.0.1:8173` |
| App (Expo Go, simulator) | `exp://127.0.0.1:8273` |
| Website preview | `http://127.0.0.1:5207/` (production build; legal pages at `/privacy/`, `/terms/`, `/support/`) |
| Simulator | "SportsGang Overnight KB 20261005" (iPhone 16e, iOS 26.3), default text size, software keyboard enabled, signed in as QA Alice |
| Accounts | `qa.alice`, `qa.bob`, `qa.cara`, `qa.dan`, `qa.fern`, `qa.eve`, `qa.newbie`, `qa.mod` `@example.com`; shared password in `.qa/credentials.json` (git-ignored, mode 600) |
| Source | `RESULT.json` → `final_source_sha`; `npm run qa:status` shows what the API and Metro run |

```sh
cd .claude/worktrees/run-golf-v2-overnight
export SPORTSGANG_QA_HOME="$PWD/.qa/owner-home"
npm run qa:status
npm run qa:open                       # open the app in booted simulators
npm run qa:stop-api                   # for item 6
npm run qa:up -- --no-open --no-seed  # bring the API back
npm run qa:down                       # finished: stops API, Metro, containers (data kept)
kill "$(cat .qa/web-preview.pid)"     # stop the website preview
```

On the simulator, type through the on-screen keyboard or paste with the edit menu: a
hardware key press (Cmd+V) hides the software keyboard for that device.

## Checklist (PASS / FAIL / BLOCKED, screenshot for any failure)

1. **Running preferences and pace/social compatibility** (runbook §2–§4)
   - [ ] As Alice, Explore › Run › Partners: Fern "Fits both ways" with the overlapping range; "Matching pace only" leaves only Fern; Cara reads "Social — pace is flexible"; Eve "Preferences not set".
   - [ ] Changing Alice's pace changes the list after a refresh (restore afterwards).
2. **Golf intent, self-reported level, beginner compatibility both ways** (runbook §5)
   - [ ] Bob "Fits both ways" (more experienced, "Welcomes beginners", "Handicaps are self-reported, not verified"); Cara (similar level only) absent.
   - [ ] Optional: Bob unticks "Happy to play with beginners" → Bob disappears for Alice; re-tick.
3. **Interest → match → chat → proposal → confirmation → My Plans** (runbook §8–§9)
   - [ ] Mutual interest opens a chat; one-sided interest does not.
   - [ ] Chats › QA Bob › "+ Session" → times → "Send proposal": "Awaiting confirmation" with exactly those Sydney times; as Bob, Accept → "Session confirmed"; both My Plans show the same time.
4. **Large text, typing, keyboard, Report/Block reachable** (new; evidence `evidence/native-chat/`)
   - [ ] Settings › Accessibility › Display & Text Size › Larger Text at the largest size, then relaunch Expo Go.
   - [ ] In a chat: Back, the partner's name, "+ Session" and ⋯ are all on screen; the planning banner is compact; "Message…" is whole; Send sits under the input.
   - [ ] Tap the input: the keyboard does not cover the input or Send; at the largest size the banner steps aside while typing and messages stay visible above the composer.
   - [ ] Type or paste a long multi-line message (also Korean text if you can) and send it.
   - [ ] ⋯ shows Report and Block; "+ Session" opens Propose a session.
   - [ ] Back at default size, the chat looks as before (one-row header and composer).
5. **Block / unblock and existing bookings**
   - [ ] While Alice has the chat with Bob open, Bob blocks Alice (log in as Bob on another simulator, or ⋯ › Block from Bob's chat): Alice's chat changes to "You can't contact this person." with no history, no "+ Session", no composer; ⋯ (Report) stays.
   - [ ] Alice's My Plans still lists the sessions with Bob and they open in Booking Detail.
   - [ ] Unblock (Profile › Blocked users): the chat shows its history and composer again.
6. **Failed fetch/send and recovery**
   - [ ] `qa:stop-api`, then open a chat: an error with "Try again"; bring the API back; "Try again" loads the chat and the error is gone.
   - [ ] With the API stopped, send a message: "Could not send" and the text comes back into the composer; if you typed something new meanwhile it is kept. A dropped live connection shows "Live updates paused." with Reconnect (not a block).
   - [ ] My Plans keeps loaded rows with "Couldn't refresh your plans…" and Retry (runbook §13).
7. **Website, legal/support routes, print** (`http://127.0.0.1:5207/`)
   - [ ] Phone and desktop widths: header, menu, nav anchors, FAQ open/close, keyboard focus rings.
   - [ ] `/privacy`, `/terms`, `/support` (no slash) redirect to the slash form and show the legal pages; with a query (`/privacy?x=1`) too.
   - [ ] Print preview of `/`: all FAQ answers appear; after closing print, the FAQ items you had open/closed are as before.

## Known and not covered

Real push notifications, physical iPhone, VoiceOver, Android, signed build, production
services, R6 production provenance. Booking Detail offers "Cancel" to the receiver of a
still-proposed booking and the server refuses it — known, not changed here.
