# Overnight hardening 2026-10-05 — task tracker

Status values: TODO, IN_PROGRESS, PASS, NEEDS_FIXES, NOT_RUN, BLOCKED.
"PASS" here means the implementation owner's own checks passed; it is never an
independent acceptance.

| Item | Scope | Acceptance (short) | Status | Evidence / notes |
|---|---|---|---|---|
| SETUP | worktree `.claude/worktrees/run-golf-v2-overnight`, branch `fix/run-golf-v2-overnight-2026-10-05` from `8d891dd` | no newer source on origin; inputs pinned | PASS | origin unchanged at 03:16 AEDT |
| W0-REVIEW | independent Codex review of the candidate | Codex CLI noninteractive review in a separate worktree | BLOCKED | `codex` CLI not installed (`codex-companion.mjs setup`: codex not found); installing is not authorised |
| W0-HANDOFF | complete Codex handoff for the candidate review scope (8 points) | handoff written | TODO | |
| W1-A | ChatScreen adaptive layout at default/max text, narrow/ordinary widths, keyboard, Korean input, long names, multiline | native screenshots + AX frames on a dedicated simulator | TODO | |
| W1-B | ChatScreen request/action ownership (fetch retry, held fetches across match/account A→B→A, socket after cleanup, send settle, Report/Block dialog expiry, confirm/decline vs refresh, failed send vs new draft, 4003/restriction) | reproductions first, behavioural regressions | TODO | |
| W2-A | Web legal/support routes slash + no-slash, query strings, no-JS; host artifact; CI check | HTTP responses + documents verified | TODO | |
| W2-B | Print: FAQ answers printed, state restored, card breaks, sticky nav | real PDF inspected | TODO | |
| W2-C | Browser recheck 320/390/768/1440 + high zoom; Safari only if real | | TODO | |
| W3-PREFLIGHT | release preflight script/checklist (public URLs, identity, locked builds, export identity, missing inputs, device/signed/provider gates) | sanitized, no secrets | TODO | |
| W3-R6 | validate the read-only R6 procedure on isolated fixtures (UTC, Sydney, mixed, repeated hour) | inconclusive where evidence is insufficient | TODO | production NOT_RUN |
| W3-TOPOLOGY | operator check for single WebSocket API process | prepared, live check pending | TODO | |
| W4-VERIFY | final suites (API, PG UTC+Sydney, mobile, lint, typecheck, iOS export, launcher if changed, web) | actual totals recorded | TODO | |
| W4-CODEX | final independent review | | BLOCKED | Codex CLI unavailable (see W0-REVIEW) |
| W5-QA | new QA project from final source, dedicated simulator, web preview | identity verified | TODO | |
| W5-HUMAN | HUMAN_QA.md (7 areas) | | TODO | |
| DELIVERY | IMPLEMENTATION_REPORT, CODEX_REVIEW_HANDOFF, RESULT.json, evidence; push; CI | | TODO | |
