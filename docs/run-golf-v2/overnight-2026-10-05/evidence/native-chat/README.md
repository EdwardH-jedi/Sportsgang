# Chat screen — native layout and restriction evidence (W1-A)

| Item | Value |
|---|---|
| Devices (all new, task-owned) | "SportsGang Overnight 20261005" iPhone 16e (390×844 pt), "SportsGang Overnight KB 20261005" iPhone 16e (390×844 pt, software keyboard), "SportsGang Overnight SE 20261005" iPhone SE 3rd gen (375×667 pt); iOS 26.3; Expo Go 54.0.7 |
| Stack | launcher project `sg-on-20261005-qa` (API 8173, Metro 8273), private owner home; synthetic fixtures (QA Alice ↔ QA Bob) |
| Source | `apps/mobile` working tree equal to the commit that adds this file (Metro restarted after every edit; Expo Go terminated and relaunched after every text-size change) |
| Text sizes | default `large`; maximum `accessibility-extra-extra-extra-large` (RN `fontScale` 3.571, logged once from the app during a temporary diagnostic and removed) |
| Frames | `ax-frames.json` (from `axe describe-ui`; `inside` = the frame lies within the screen width) |

## Results

| # | State | Result |
|---|---|---|
| 01 | Max text, 390 pt, **intermediate build** before the chrome cap: header wrapped correctly, but the planning banner grew to ~420 pt and left no room for messages; input 184 pt wide, "Mess…" clipped | defect found natively, fixed |
| 02 | Default, 390 pt, 43-character partner name | all controls inside; name on two lines; Back and ⋯ 44×44 |
| 03–05 | Default, 390 pt, **software keyboard up**; Korean + English five-line text pasted through the on-screen Paste callout; sent | composer and Send above the keyboard; input grows to its max height; the sent bubble wraps |
| 06 | Max text, 390 pt, keyboard down | header on one row (Back, name, + Session, ⋯ all inside); banner compact; input full width with "Message…" whole, Send under it |
| 07–08 | Max text, 390 pt, keyboard up, pasted text, sent | the planning banner steps aside while typing; two message lines stay visible; input and Send above the keyboard; sent |
| 09 | Max text: ⋯ → action sheet | Report and Block both on screen |
| 10 | Max text: + Session | Propose a session opens |
| 11 | Max text, long name | two lines with ellipsis, full name in the accessibility label; actions inside |
| 12–13 | SE 375 pt, default and max | all controls inside 375 pt; at max the input is full width and messages remain visible |
| 14 | QA Bob blocks Alice through the API while her chat is open | the socket closes with 4003; "You can't contact this person." with the explanation; history hidden; + Session and banner removed; ⋯ (Report) kept |
| 15–16 | While blocked: My Plans and Booking Detail | the 1:1 session with Bob is listed and opens (Confirmed, Cancel available) |
| 17 | Bob unblocks; Alice reopens the chat | history and composer are back |
| 18 | **Observation, not changed:** Booking Detail offers "Cancel" to the *receiver* of a still-proposed booking; the server answers "Only the proposer can perform this transition" (no data changed). Outside this repair. | recorded |

## Not run here

- Switching the software keyboard to the Korean IME (and its frame change): the fresh
  keyboard device has no Korean keyboard installed; Korean text was entered by paste.
- The software keyboard on the first 16e and the SE after a hardware key event: the
  simulator then treats a hardware keyboard as attached. Showing it again would need the
  Simulator app's global keyboard setting or a restart of Simulator.app, which would
  affect other simulators, so a fresh device with only on-screen input was used instead.
- VoiceOver, physical iPhone, Android, signed build.
