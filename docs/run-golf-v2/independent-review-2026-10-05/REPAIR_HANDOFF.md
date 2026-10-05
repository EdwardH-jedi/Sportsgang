# Repair handoff — independent overnight review, 2026-10-05

Reviewed delivery `59013601ae97b70a035f3abaae00c74edfa52e99`, source `a9b92c2430456e1b0055436824c6ad6dfcd7c6e4`. Verdict **NEEDS_FIXES: 6 P2 + 1 P3**. See [REVIEW.md](REVIEW.md) for triggers, source evidence and limits. This handoff proposes work; no product repairs were applied.

## Ownership and waves

| Wave | Owner and exclusive write scope | Work and completion gate |
|---|---|---|
| 1A | API realtime owner: `apps/api/app/services/chat.py`, relevant realtime tests only | F01: drain cannot be abandoned by a second cancellation; rollback and a committed block must observe zero live sends. Port the independent real-PG probe into the integration gate. Re-run room-wide 1/3/20-socket deadlines, ordinary cancellation, repeated cancellation, send/close failures, admission/delivery block-first and dispatch-first cases |
| 1B | One mobile chat owner: `ChatScreen.tsx`, `ChatScreen.ownership.test.tsx` | F02–F05 and F07 all touch the same lifecycle/state/layout file, so keep one sequential owner. Refocus must recheck authority after a disconnected block; stale action responses must obey `updatedAt`; block completion/error/OK must expire with focus/dialog ownership; restricted content must scroll without covering the header; replacement socket success must reconcile paused/catch-up state |
| 1C | Release tooling owner: `scripts/release/preflight.py`, `test_preflight.py` | F06: short non-allow-listed env canaries must be absent from both text and JSON across reflected filename, branch and metadata paths; keep public allow-listed URL reporting intact. Do not add secret values to evidence |
| 2 | Independent reviewer, evidence-only | Freeze a new source/delivery identity. Run new boundary probes, affected core suites and fresh native controls. Preserve original evidence and mark incomplete device/operational gates explicitly |
| Separate procedure review | R6 gate owner and authorized production operator | Review the diagnostic amendment and make external writer/period provenance a prerequisite for its conclusions. Fixtures and ≥2 samples do not approve production history. No timestamp migration, rewrite or configuration selection is authorized here |

Waves 1A/1B/1C have disjoint scopes. Within 1B, avoid splitting separate agents across the same file. Do not expand this repair into notification/event architecture, other mobile screens, hosting or unrelated cleanup. Existing booking access in My Plans must stay available after restriction; chat contact actions must follow server authority.

## Mobile decisive gates

1. A retained chat loses its socket, peer block commits, focus returns: authoritative messages read returns restriction; old history/input/propose actions disappear. Late successful reads cannot restore them. Booking history stays accessible through My Plans.
2. Confirmation returns after a newer completed/declined refresh: newer state wins. Also retain the existing reverse-order test and do not resurrect a row omitted by a current list.
3. A block starts while authorized, then the screen blurs: the request may finish, but success/error UI cannot appear over the covering screen. A saved success OK callback cannot navigate after blur, account/match rebinding or unmount.
4. Maximum accessibility text on 390 pt and fresh 375 pt simulators: real socket restriction must leave readable, scrollable explanatory content and visible/tappable Back/More options. Prove Report/Block still opens with physical touch. Keep the existing Korean/English software-keyboard, multiline Send and picker controls passing. Relaunch Expo Go after each text-size change.
5. Same-account token replacement after transient disconnect: current socket open/catch-up resolves the paused notice; saved old open/message/close callbacks cannot affect the replacement. Preserve restriction `4003` handling and manual Reconnect failure behaviour.

Fresh native replay here demonstrates maximum-size restricted failure and default-size control, not physical-device accessibility acceptance. Physical iPhone, VoiceOver, Android and the signed release binary remain required external QA.

## Reusing the review probes

Probe sources live in [evidence/probes](evidence/probes/). They are deterministic review fixtures, not shipped application code. Create fresh disposable services and synthetic env values; never reuse the protected human QA projects/ports. The scripts expect a private configuration JSON at `/private/tmp/sg_review_env_20261005.json`; that file was removed after review. Recreate it locally with `APP_ENV=local`, a random `SECRET_KEY`, disposable `POSTGRES_URL` and `REDIS_URL`. Never save its values with the artifacts.

- API: run from `apps/api` with `PYTHONPATH` containing that directory and `tests_integration`, `REVIEW_EVIDENCE` pointing to a new directory, and pytest `--asyncio-mode=auto`. The reviewer probes deliberately guard PostgreSQL port `55781`; adapt only the guard/isolated endpoint if needed, and record the change. `run_extra.py` documents the environment setup.
- Mobile: temporarily copy `ChatScreen.review.test.tsx` into `apps/mobile/src/__tests__/`, run the targeted Jest file, then remove the execution copy while preserving its final source and logs. Current expectation is five failures/two passing controls. Do not adjust failed expectations merely to turn the run green.
- Preflight: `preflight_canary_review.py` creates and commits an isolated fixture before reflecting the synthetic short value through an untracked path. It needs no private credentials, production access or real project mutation.
- R6: copied fixtures/runner use only the review R6 container on loopback `55783`; adaptations change harness root/container/port, not procedure scoring or application code. Compare original and amended scores in fresh databases. No live production call is implied.
- QA launcher: `QA_TEST_DOCKER=1 python3 -m unittest scripts/qa/test_qa.py -v` uses randomized temporary projects/ports and stub readiness services; it does not prove the real API/Metro lifecycle beyond the separately run native stack.

Final acceptance requires fresh decisive evidence for the changed paths, not a count increase alone. Preserve `NEEDS_FIXES` until P2s are resolved. Keep production status separate: R6 provenance/amendment, real deployed WS topology, physical/signed/push/Safari/domain/host gates remain open after these code repairs.
