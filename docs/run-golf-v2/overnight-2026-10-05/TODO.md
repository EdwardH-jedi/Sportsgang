# Overnight hardening 2026-10-05 — task tracker

Status values: TODO, IN_PROGRESS, PASS, NEEDS_FIXES, NOT_RUN, BLOCKED.
"PASS" here means the implementation owner's own checks passed; it is never an
independent acceptance.

| Item | Scope | Acceptance (short) | Status | Evidence / notes |
|---|---|---|---|---|
| SETUP | worktree `.claude/worktrees/run-golf-v2-overnight`, branch `fix/run-golf-v2-overnight-2026-10-05` from `8d891dd` | no newer source on origin; inputs pinned | PASS | origin unchanged at 03:16 AEDT |
| W0-REVIEW | independent Codex review of the candidate | Codex CLI noninteractive review in a separate worktree | BLOCKED | `codex` CLI not installed (`codex-companion.mjs setup`: codex not found); installing is not authorised |
| W0-HANDOFF | complete Codex handoff for the candidate review scope (8 points) | handoff written | PASS | CODEX_REVIEW_HANDOFF.md (parts A–C) |
| W1-A | ChatScreen adaptive layout at default/max text, narrow/ordinary widths, keyboard, Korean input, long names, multiline | native screenshots + AX frames on a dedicated simulator | PASS | `a12a368`; evidence/native-chat (16e 390 pt, SE 375 pt, default + max, keyboard up/down, Korean paste, long name, Report/Block, 4003). Korean IME switching NOT_RUN |
| W1-B | ChatScreen request/action ownership (fetch retry, held fetches across match/account A→B→A, socket after cleanup, send settle, Report/Block dialog expiry, confirm/decline vs refresh, failed send vs new draft, 4003/restriction) | reproductions first, behavioural regressions | PASS | `a12a368` + `a9b92c2`; `ChatScreen.ownership.test.tsx` 21 tests (first 20: 18 fail / 2 controls pass at 8d891dd, evidence/logs), all pass after; existing chat suite 51/51 |
| W2-A | Web legal/support routes slash + no-slash, query strings, no-JS; host artifact; CI check | HTTP responses + documents verified | PASS | `b10f510`; preview 301 + 404 hook; `check:routes` 28/28 (CI step); Netlify note, no rule by design |
| W2-B | Print: FAQ answers printed, state restored, card breaks, sticky nav | real PDF inspected | PASS | `b10f510`; Chrome 154 PDFs: 10/10 answers, state restored, no split card |
| W2-C | Browser recheck 320/390/768/1440 + high zoom; Safari only if real | | PASS | Chrome 154 headless; Safari NOT_RUN |
| W3-PREFLIGHT | release preflight script/checklist (public URLs, identity, locked builds, export identity, missing inputs, device/signed/provider gates) | sanitized, no secrets | PASS | `1159f49`; 17 unit tests; result CONSISTENT_WITH_MISSING_INPUTS |
| W3-R6 | validate the read-only R6 procedure on isolated fixtures (UTC, Sydney, mixed, repeated hour) | inconclusive where evidence is insufficient | NEEDS_FIXES (procedure) | `1159f49`; as written: 3 correct, 1 appropriately inconclusive, 1 no decision, 5 wrong/overconfident; amended procedure proposed (not applied); production NOT_RUN |
| W3-TOPOLOGY | operator check for single WebSocket API process | prepared, live check pending | PASS (prepared) | live check NOT_RUN |
| W4-VERIFY | final suites (API, PG UTC+Sydney, mobile, lint, typecheck, iOS export, launcher if changed, web) | actual totals recorded | PASS | 773; 64+64; R1 94; reviewer 11/2 (adapted); mobile 989 ×2; export; preflight; launcher Docker-free; web 28/28 — IMPLEMENTATION_REPORT §6 |
| W4-CODEX | final independent review | | BLOCKED | Codex CLI unavailable (see W0-REVIEW) |
| W5-QA | new QA project from final source, dedicated simulator, web preview | identity verified | PASS | `sg-on-20261005-qa` API 8173 / Metro 8273 (reset, fresh fixtures); preview 5207 detached; KB simulator at default size |
| W5-HUMAN | HUMAN_QA.md (7 areas) | | PASS | |
| DELIVERY | IMPLEMENTATION_REPORT, CODEX_REVIEW_HANDOFF, RESULT.json, evidence; push; CI | | IN_PROGRESS | docs committed; final CI in the terminal handoff |
