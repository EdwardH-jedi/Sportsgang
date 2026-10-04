# Native check — booking composer at default and maximum text size (A11Y-1/2)

| Item | Value |
|---|---|
| Device | New dedicated simulator "SportsGang RC 20261004", UDID `F6BD3C92-ADA5-4937-B72C-A92DF6C42DBC`, iPhone 16e, iOS 26.3, 390×844 pt. No other simulator was operated. |
| App | Expo Go 54.0.7 (bundle copied read-only from an existing installation) on Metro `exp://127.0.0.1:8263`, launcher project `sg-rc-20261004-qa` (API 8163), private `SPORTSGANG_QA_HOME` |
| Source served | `apps/mobile` identical to commit `e80b369` (Metro restarted after each edit; Expo Go terminated and relaunched after every text-size change) |
| Sizes | default `large`; maximum `accessibility-extra-extra-extra-large` (`xcrun simctl ui … content_size`, this device only) |
| Account | seeded fixture QA Alice → chat with QA Bob → Propose a session; notifications declined |
| Taps | `axe tap --tap-style physical`; frames from `axe describe-ui`; selected wheel rows derived from the row centred in the selection band |

## Heading and related controls

| State | Back (AX frame) | Title (AX frame) | Result |
|---|---|---|---|
| Before (morning candidate, `../../../morning-fixes/evidence/native-q09/33-ax5-form-start-end.jpg`) | arrow ~3× | "Propos / e a / session", three lines, mid-word break | defect reported |
| Max, title capped (`bcecdc8`) — `02-max-composer.jpg` | 16,79 **79.3×102** | 111.3,111.7 214.3×36.7, one line | header still ~100 pt too tall: the arrow's box kept its uncapped line height |
| Max, final (`e80b369`) — `03-max-composer-2.jpg` | 16,79 36.3×44.7 | 90,83 214.3×36.7, one line, `Heading` trait | PASS |
| Default, before the fix (`bcecdc8`; caps have no effect at default) | 16,79 28×34.3 | 114.7,83.3 156.3×26 | reference |
| Default, final — `12-default-composer-final.jpg` | 16,79 28×34 | 114.7,83 156.3×26 | PASS — fields move up 0.3 pt; nothing else changes |

"Send proposal" at maximum size wrapped onto two lines that ran into the pill's rounded ends; with side padding and a centred label it sits inside the pill (`04-max-send-fixed.jpg`, button 24,645 342×175). At default size the button is 342×52, as before.

The title is capped at 1.4×, the scale the app's other screen titles already use (`ScreenHeader`); every field, value and button below it still scales fully (`05-max-form-scroll-1.jpg`).

## Q09 picker (preserved)

| Check | Default | Maximum |
|---|---|---|
| Done target (AX) | 310.7,457 55.3×44, right edge 366 (`13`) | 215,310.7 151×79.7, right edge 366 (`06`) — identical to the reviewer's Q09 frames |
| Neighbour taps | hour 09→10→11; minute 00→15→30 (`14`); 45→30 (`15`) — each settled with 0.0 pt offset | same (`07`, `08`) |
| Swipe | settled on :45 (`16`) | settled on :45 (`09`) |
| Done → reopen | — | 11:30 kept (`10`) |
| End picker | — | 12:30, Done 215,310.7 151×79.7 (`11`) |

## Time selection → form → HTTP → database

One real submission at default size (`17` → `18`):

| Layer | Value |
|---|---|
| Form | Tue, Oct 6, 2026 · 11:30 AM – 12:30 PM, "Times are Sydney time (AEST/AEDT)" |
| HTTP | API access log `POST /bookings` → 201; `GET /bookings/2e9f30ca-408a-4806-9fd6-076f0a7f0e28` → `starts_at 2026-10-06T00:30:00Z`, `ends_at 2026-10-06T01:30:00Z`, `proposed` (`http-booking.json`). The request body itself was not recorded. |
| PostgreSQL | `2026-10-06 00:30:00+00` – `2026-10-06 01:30:00+00`, `timestamp with time zone`, `proposed` (`db-row.txt`) |
| Detail screen | "Tue 6 Oct · 11:30 am" – "12:30 pm", Awaiting confirmation |

11:30 AEDT (UTC+11) = 00:30 UTC: all four agree.

## Seen but not changed (outside this repair)

- **Chat screen at maximum size** (`01-max-chat-header.jpg`): the "More options" (⋯) button's AX frame is x 370–442 on a 390-pt screen (partly off-screen), the partner's name is not shown in the header, and the message field shows "Mess…". These are on the chat screen, not on the composer heading, so they were left for a separate decision.
- The composer's "Or type a location" placeholder does not grow with text size (`05`); it is not clipped.

## Not run

Physical iPhone, VoiceOver, Android, signed/release build. Expo Go is a development host, not the shipped binary.
