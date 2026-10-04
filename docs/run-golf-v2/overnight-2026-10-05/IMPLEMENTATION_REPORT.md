# Overnight hardening 2026-10-05 — implementation report

**Implementation owner's report. No independent review ran (see §2); nothing here is an
acceptance.**

## 1. Identity

| Item | Value |
|---|---|
| Branch | `fix/run-golf-v2-overnight-2026-10-05` (worktree `.claude/worktrees/run-golf-v2-overnight`) |
| Base delivery | `8d891ddb862de5345e85895a20fa65649ba1f46e` (`chore/run-golf-v2-release-candidate-2026-10-04`); its last source `a515b0073cb0f32dad97f88430a203e3427444fe` |
| Latest independent review consulted | `ce62aacff5dc88efd394abb240dc0a3d0bc3c76d` (`review/run-golf-v2-morning-acceptance-2026-10-04`, reviewed `8b34bca`) |
| **Final source SHA** | `a9b92c2430456e1b0055436824c6ad6dfcd7c6e4` — the last commit touching `apps/`, `scripts/`, `packages/` or `.github/` (adds one chat test to `a12a368`) |
| Delivery SHA | the branch head after the documentation commits (reported in the terminal handoff; not embedded here) |

Origin was fetched at 03:16 AEDT: no newer implementation or acceptance existed for the
candidate. `feat/run-first-ui` (`fc3fb14`) was not used or merged. Every other branch,
worktree, QA project (`sportsgang-qa`, `sg-rc-20261004-qa`), preview process (5187, 5196),
simulator and review evidence was left untouched.

| Commit | Scope |
|---|---|
| `68d8bcc` | plan and resume context |
| `1159f49` | W3: release preflight script, R6 procedure validation, topology operator check |
| `b10f510` | W2: deterministic legal routes in the preview, full FAQ in print, CI route check |
| `a12a368` | W1: chat request/action ownership and adaptive layout |
| `a9b92c2` | W1 follow-up: one more ownership test (a proposal refresh in flight when the chat becomes restricted) |
| later | documentation and evidence only |

## 2. Independent review (W0, W4) — not run

The Codex CLI is not installed on this machine (`which codex` → not found; the installed
openai-codex Claude plugin's read-only `codex-companion.mjs setup --json` reports
`codex: not found`, `ready: false`). Installing it, changing authentication or reading
credentials is outside this task's authority, so no independent review ran tonight. Claude's
own checks are reported as implementation evidence only. The complete handoff, including the
eight-point review scope for the candidate and the final-review scope, is
[CODEX_REVIEW_HANDOFF.md](CODEX_REVIEW_HANDOFF.md). The API (MA-A/B/C) is unchanged from the
base, as instructed when no defect is reproduced.

## 3. Wave 1 — chat (`apps/mobile/src/screens/chat/ChatScreen.tsx`)

**Reproduced first.** `ChatScreen.ownership.test.tsx` adds 20 behavioural tests (a 21st,
added after an internal review in `a9b92c2`, pins a refresh in flight during a restriction). At `8d891dd`,
the first 20 gave 18 failures at their defect assertion and 2 passing controls (`evidence/logs/chat-ownership-baseline-8d891dd.log`):

- a successful retry still showed the old error;
- match A's late messages/proposals appeared in match B, and B started with A's messages;
- returning to A revived A's first request; another account saw the previous account's
  held messages (account A → B → A);
- a frame delivered to the previous socket after cleanup, or a frame for another match,
  was shown;
- a send settling after a match switch restored its draft into the new chat and alerted;
  an older binding's `finally` released the current send's guard;
- a failed send overwrote a newer draft;
- **Block targeted the previous partner** after a match change (the partner id was a ref
  captured once); a safety menu or block confirmation opened before a match switch, blur
  or unmount still reported, blocked or navigated;
- a refresh read before a confirm undid it; a proposal action settling after a switch
  alerted in the new chat;
- a socket close 4003 and a 403 restriction were not shown; transient disconnects were
  silent.

**Repair** (existing idioms, no new layer):

- Every result is tagged with a binding epoch (account + match), the `BookingDetailScreen`
  pattern (R3/Q04): late results for an earlier binding — even the same match or account
  again — are dropped; per-binding guards are released only by the operation that took
  them. The account-loading phase (token set, user not yet loaded) is its own binding.
- Retry clears the error; proposal refreshes keep the newer copy of each booking by
  `updatedAt`.
- Report/Block use the current route's partner and expire on blur, binding change and
  unmount (the `PartnerDetailScreen` pattern, Q06).
- A failed send restores the text only if nothing newer was typed (otherwise the alert names
  the unsent text).
- Restriction: the API's single 403 detail ("You can't contact this person.", CONTRACTS §8)
  or socket close 4003 hides history and contact actions, keeps Report, and points to My
  Plans; a held response cannot repopulate it. Any other close shows "Live updates paused."
  with Reconnect (refetch + new socket) — never a block.
- Current-binding HTTP/socket deduplication and chronological ordering are unchanged (control
  tests pass).

**Layout.** Header, planning banner and composer wrap instead of overflowing; Back and ⋯ are
44-pt targets with capped glyphs; screen chrome (header actions, banner, Send) scales to the
app's 1.4× screen-title cap while messages and typed text scale fully; at the largest sizes
(`fontScale` ≥ 2.5) the input takes the full width with Send under it; at accessibility sizes
the planning banner steps aside while the keyboard is up. Native evidence on three new
simulators (iPhone 16e 390 pt, iPhone SE 375 pt; default and maximum text; keyboard up and
down; Korean + English multi-line paste; a 43-character name; Report/Block and + Session
reachable; 4003 restriction with My Plans and Booking Detail still available; unblock
recovery): [evidence/native-chat/README.md](evidence/native-chat/README.md).

Normal logout unmounts the authenticated stack; the account-replacement tests deliberately
retain the component and are a separate stress case.

## 4. Wave 2 — website (`apps/web`)

Implemented by a delegated agent under strict file ownership, then reviewed and re-run by the
coordinator ([evidence/web/README.md](evidence/web/README.md)):

- `vite preview`: `/privacy`, `/terms`, `/support` 301 to the slash form with the query kept
  (`Location` from a constant); unknown paths under a legal route 404 instead of the
  marketing page. Preview only — a production host is documented, not changed.
- `apps/web/hosting/netlify/` (unreviewed, not deployed): the reference host already
  redirects (observed read-only); an explicit `_redirects` rule would be a no-op or a loop,
  and a forced SPA catch-all would replace the legal pages, so the file holds no rule and the
  check enforces that.
- `npm run check:routes` (new step in the `web` CI job): 28 HTTP checks, including exact
  legal-page bytes. Re-run by the coordinator: 28/28; without the hook 14 checks fail.
- Print: every FAQ answer prints from the same `<details>` DOM and the reader's open/closed
  state is restored afterwards; cards stay whole; the header prints as a plain bar.
- Browser checks (Chrome 154 headless): layout at 320/390/768/1440, keyboard order, menus,
  anchors, real 200 % zoom (profile setting) and emulated 300/400 %, reduced motion
  (emulated), JavaScript off, PDFs. **Safari NOT_RUN** (Remote Automation off; not enabled).
- The legal pages and every public link destination are unchanged; domain, canonical and
  share image remain undecided.

## 5. Wave 3 — release preflight and open gates

- `scripts/release/preflight.py` + 17 tests ([release-preflight/RELEASE_PREFLIGHT.md](release-preflight/RELEASE_PREFLIGHT.md)):
  result `CONSISTENT_WITH_MISSING_INPUTS`. The three legal URL variables are read only at
  `apps/mobile/src/lib/legal.ts` and are in no committed build profile (documented public
  values agree across five sources; the EAS remote env cannot be checked locally); signing,
  APNs and the store build number are EAS-managed. The final export
  (`index-ed18c160be2847f21416b9235d6550eb.hbc`, sha256 `5f870cc6…395a`, clean tree at the
  final source) does not embed the legal URLs.
- R6 ([release-preflight/r6/R6_PROCEDURE_VALIDATION.md](release-preflight/r6/R6_PROCEDURE_VALIDATION.md)):
  the gate's read-only procedure, run exactly as written on ten isolated fixtures, is
  correct for 3, appropriately inconclusive for 1, gives no decision for 1, and is **wrong or
  overconfident for 5** (a switch-month row, unlabelled repeated-hour rows in seven of nine
  columns, coincidental or missing samples). An amended read-only procedure is proposed in
  that report only; the gate document is byte-for-byte unchanged. Production NOT_RUN.
- Topology ([release-preflight/TOPOLOGY_OPERATOR_CHECK.md](release-preflight/TOPOLOGY_OPERATOR_CHECK.md)):
  the read-only operator check for exactly one `app` machine (and no `WEB_CONCURRENCY`) is
  prepared; the live check is PENDING / NOT_RUN.

## 6. Verification (this session)

API, web, scripts and launcher checks ran at `a12a368`; `a9b92c2` changes only a mobile test
file, after which the mobile suites were re-run.

| Check | Result |
|---|---|
| API unit `uv run --frozen pytest -q tests` | **773 passed**, 0 skipped, 882 warnings |
| Ruff check / format | clean; 151 files formatted |
| Integration, fresh UTC DB | **64 passed**, 0 skipped |
| Integration, fresh DB with Sydney default | **64 passed**, 0 skipped |
| …includes contact authority, notification ownership (11), socket deadline (7), event clock (4) | pass |
| Adapted R1 probe | **94 PASS / 0 FAIL / 0 harness errors** |
| Review follow-up + block-first probes (unchanged but the port guard) | 11 passed, 2 failed — the two adapted interleavings (handoff) |
| Mobile Jest, TZ=UTC and Sydney (at `a9b92c2`) | **65 suites / 989 tests** each, 0 skipped |
| Chat suites | ownership 21/21, existing 51/51 |
| Mobile lint / typecheck | 0 warnings / clean |
| iOS export (clean tree at `a12a368`; `a9b92c2` changes no bundled file) | exit 0, Hermes 4.43 MB |
| Release preflight + tests | exit 0; 17/17 |
| Launcher, Docker-free, TZ unset and UTC | 21 ran: 14 passed + 7 Docker skips, each (launcher code unchanged; Docker variants not re-run) |
| Web typecheck / build / `check:routes` | 0 / 0 / 28 of 28; legal bytes identical in `dist/` |
| Web browser verification | §4 |
| Native chat | §3 |
| GitHub Actions | run 37219622454 on `ca9a04d`: all 9 jobs green incl. "Website typecheck and build" with the new route step; later runs in the terminal handoff |

Logs: [evidence/logs/](evidence/logs/) (paths sanitised; scanned for credentials).

## 7. Failed attempts and corrections

- Reproduction harness: `clearAllMocks` kept a queued `mockImplementationOnce` that leaked
  into the next test; switched to `resetAllMocks` before recording the baseline. One test
  asserted before its promise chain settled; fixed. Both were confirmed with temporary debug
  copies, then removed.
- The first fix read a render-time draft ref and treated the optimistic clear as a "newer
  draft"; the account-loading phase (token, no user) had no binding and fetched nothing.
  Both were caught by the existing suite and fixed (synchronous draft mirror; token-keyed
  pending binding).
- Native: the first max-text build left the banner ~420 pt tall and the placeholder clipped
  (fixed by the chrome cap); a percentage `flexBasis` did not make Yoga wrap (verified with a
  one-off `fontScale` log, then `minWidth: '100%'`).
- Simulators: a hardware key event (Cmd+V) makes iOS hide the software keyboard; a fresh
  device with a per-device `ConnectHardwareKeyboard=0` preference and on-screen Paste was used.
  A mistaken tap toggled Expo's element inspector (cleared by relaunch). A dismiss tap opened
  Booking Detail and hit Cancel; the server refused it ("Only the proposer can perform this
  transition"), nothing changed — recorded as an observation.
- zsh treated `?` in an unquoted URL as a glob; re-run quoted.

## 8. Unresolved / not run

| Item | Status |
|---|---|
| Independent Codex review (candidate and final) | BLOCKED — CLI not installed |
| R6 production provenance | NOT_RUN; the gate's procedure itself needs the amendment proposed in W3 before it can be trusted |
| Live single-process WebSocket topology | NOT_RUN (operator check prepared) |
| Physical iPhone, VoiceOver, Android, signed build, real push provider | NOT_RUN |
| Korean IME keyboard switching on the simulator | NOT_RUN (Korean text verified by paste) |
| Safari | NOT_RUN |
| Booking Detail shows Cancel to the receiver of a proposed booking (server refuses) | observed, not changed (outside scope) |
| Print: some empty space at page ends; legal pages request `/favicon.ico` (404) | noted |
| "Live updates paused" requires a tap to reconnect (no automatic retry) | by design, documented |
