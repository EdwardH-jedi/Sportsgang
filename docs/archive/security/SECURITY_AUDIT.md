# Security Audit — Wave 8 Staging Readiness

**Date:** 2026-04-15
**Branch:** `feature/wave-8-staging-readiness`
**Scope (read-only):**
- `apps/api/app/core/security.py`
- `apps/api/app/core/config.py`
- `apps/api/app/core/encryption.py`
- `apps/api/app/routers/auth.py`
- `apps/api/app/routers/notifications.py`
- `apps/api/app/models/google_calendar.py`

Severity ladder: **critical** → exploit available now in staging/prod posture · **high** → likely exploitable or large blast radius · **medium** → defence-in-depth gap or conditional risk · **low** → hardening / hygiene.

---

## Critical

### C1. Default `SECRET_KEY` boots with a warning instead of failing
- **Where:** `apps/api/app/core/security.py:16-25`, `apps/api/app/core/config.py:25`
- **Issue:** `secret_key` defaults to the literal `"change-me-in-production"`, which is committed to source control. On startup, the app only emits a `_log.warning` and continues to serve traffic. Any JWT issued under this key is forgeable by anyone with access to the public repo.
- **Contrast:** `validate_encryption_config()` in `encryption.py:95-105` correctly aborts startup when `FIELD_ENCRYPTION_KEY` is missing in production. The same hard-fail pattern is missing for `SECRET_KEY`.
- **Recommendation:** Add a `validate_secret_key()` invoked from app startup that raises `RuntimeError` when `app_env in {"staging", "production"}` and `secret_key == "change-me-in-production"` (or empty / shorter than ~32 bytes). Capture the key inside `create_access_token` / `decode_access_token` via `get_settings()` rather than at module import — current import-time capture (`security.py:16`) means rotating the key requires a process restart and prevents per-request settings overrides in tests.

---

## High

### H1. `/internal/process-notifications` is fully unauthenticated
- **Where:** `apps/api/app/routers/notifications.py:39-48`
- **Issue:** The endpoint relies entirely on a docstring (`"Not authenticated — restrict to internal network in production."`). There is no shared-secret header, no IP allow-list, no auth dependency. A single LB/ingress misconfiguration exposes a fan-out push trigger that hits Expo with arbitrary cadence — usable for spam, denial-of-wallet, or DoS against users.
- **Recommendation:** Require an `X-Internal-Token` header validated against a secret (e.g. `INTERNAL_API_TOKEN`) via a FastAPI dependency, and gate the `internal_router` mount behind the same. Defence-in-depth should not depend on network topology alone.

### H2. CORS default is permissive
- **Where:** `apps/api/app/core/config.py:32-33, 42-46`
- **Issue:** `cors_origins` defaults to empty string and `cors_origins_list` returns `[]`. The accompanying comment states *"Empty = wildcard (local dev only)"*, implying the middleware substitutes `*` when the list is empty. Combined with bearer-token auth, a wildcard CORS in staging/production opens credentialed cross-origin access from any origin.
- **Recommendation:** Verify the CORS middleware in `main.py` does not silently fall back to `["*"]` when the list is empty in non-local environments. Add startup validation: when `app_env != "local"`, `cors_origins_list` must be non-empty. (Out-of-scope file, but the config defaults invite the bug.)

### H3. No rate limiting / lockout on `/auth/login` and `/auth/register`
- **Where:** `apps/api/app/routers/auth.py:40-63`
- **Issue:** Both endpoints accept unlimited attempts. Credential-stuffing and email-enumeration are unmitigated. Register also leaks account existence via the distinct `"Email already registered"` error (`auth.py:43-44`).
- **Recommendation:** Add per-IP and per-account rate limits (e.g. `slowapi` or Redis token bucket — Redis is already in `config.py`). Use a generic error message on register if email-enumeration matters for the threat model, or accept enumeration explicitly in a comment.

---

## Medium

### M1. Long-lived JWT (7 days) with no revocation, no refresh, no `jti`
- **Where:** `apps/api/app/core/security.py:28, 41-49`
- **Issue:** `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7`. A stolen token is valid for a full week with no server-side invalidation path. Payload contains only `sub` and `exp` — no `iat`, `jti`, `iss`, `aud`. There is no logout-style revocation list and no refresh-token rotation.
- **Recommendation:** Shorten access tokens (15–60 min) and introduce refresh tokens with rotation, or maintain a revocation set keyed by `jti` in Redis. At minimum, add `iat` and `jti` so future revocation is possible without a token-format migration.

### M2. `decode_access_token` does not require claims explicitly
- **Where:** `apps/api/app/core/security.py:47-49`
- **Issue:** `jwt.decode` is called without `options={"require": ["exp", "sub"]}`. PyJWT validates `exp` by default but does not require its presence. A token missing `exp` would currently authenticate indefinitely until the key rotates.
- **Recommendation:** Pass `options={"require": ["exp", "sub"], "verify_exp": True}` and explicitly type `sub` validation.

### M3. Login allows token issuance to inactive users
- **Where:** `apps/api/app/routers/auth.py:55-63`
- **Issue:** `login` checks the password but not `user.is_active`. A disabled user receives a token (which `get_current_user` then rejects on use). Result: weak signal in audit logs, wasted issuance, and the inactive-account error path exposes a different latency profile than the wrong-password path (timing oracle for active-vs-inactive).
- **Recommendation:** Reject inactive users in `login` before token issuance; return the same `"Invalid credentials"` message to preserve behavioural parity.

### M4. `decrypt_token` silently returns raw ciphertext on Fernet failure
- **Where:** `apps/api/app/core/encryption.py:81-92`
- **Issue:** A decryption failure logs a warning and returns the raw stored value. The caller will then forward this to Google APIs; the value may end up in error logs, exception traces, or upstream telemetry. The "legacy plaintext row" justification is fragile — an attacker who compromises the database write path (e.g. SQL injection) can write arbitrary ciphertext and force the plaintext-fallback path to leak the stored value back through error channels.
- **Recommendation:** Raise a typed exception (`TokenDecryptError`) and let the caller trigger re-auth explicitly. If a one-time legacy migration is required, gate the fallback behind a feature flag with a sunset date.

### M5. Plaintext sentinel (`plain:`) for OAuth tokens in the same column
- **Where:** `apps/api/app/core/encryption.py:36, 52-62`; `apps/api/app/models/google_calendar.py:32-33`
- **Issue:** OAuth access/refresh tokens may be persisted as `plain:<token>` when no key is configured. The schema cannot distinguish encrypted from plaintext rows at rest, raising the risk that a database backup, replication snapshot, or environment copy from staging→prod (or prod→staging) carries plaintext OAuth secrets across a trust boundary.
- **Recommendation:** Require `FIELD_ENCRYPTION_KEY` in **all** non-local environments (extend `validate_encryption_config()` to `app_env != "local"`). Remove the plaintext fallback once staging is keyed.

### M6. `field_encryption_key` enforced only when `app_env == "production"`
- **Where:** `apps/api/app/core/encryption.py:101`
- **Issue:** Staging is exempt from the key requirement, yet staging holds real OAuth tokens during integration testing. Backup/replica leakage from staging is a realistic exfiltration vector.
- **Recommendation:** Tighten the gate to `app_env in {"staging", "production"}`.

---

## Low

### L1. Email enumeration via distinct register error
- **Where:** `apps/api/app/routers/auth.py:43-44`
- **Issue:** `"Email already registered"` confirms account existence to anonymous callers.
- **Recommendation:** Either return a generic success and email a "you already have an account" message out-of-band, or accept enumeration explicitly. Low priority unless the threat model lists privacy of the user list as a concern.

### L2. No password policy at the auth layer
- **Where:** `apps/api/app/routers/auth.py:46`; password rules live in `app/schemas/auth.py` (out of scope).
- **Issue:** `hash_password` accepts any string. If `RegisterRequest` lacks length/complexity validation, weak passwords are accepted.
- **Recommendation:** Confirm the schema enforces a minimum length (≥10) and consider `zxcvbn`-style entropy on the client.

### L3. Bcrypt cost factor not pinned
- **Where:** `apps/api/app/core/security.py:30`
- **Issue:** `CryptContext(schemes=["bcrypt"], deprecated="auto")` uses passlib's default rounds (typically 12). Acceptable today; pin explicitly so future passlib bumps are intentional.
- **Recommendation:** `CryptContext(schemes=["bcrypt"], bcrypt__rounds=12, deprecated="auto")`.

### L4. `access_token` column width may truncate Fernet ciphertext
- **Where:** `apps/api/app/models/google_calendar.py:32`
- **Issue:** `String(2048)` should accommodate Fernet-wrapped Google access tokens, but Fernet adds ~70 bytes of overhead and base64 inflates by 4/3. Worth confirming with a test that round-trips a realistic token. Operational, not security-critical.
- **Recommendation:** Add a unit test asserting `len(encrypt_token(<2k token>)) <= 2048`, or widen to `Text`.

### L5. JWT `sub` accepts any UUID-shaped string without verifying user existed at issue time
- **Where:** `apps/api/app/core/security.py:41-49`
- **Issue:** Cosmetic — the existence check happens in `get_current_user`. Minor robustness gain by signing `iss`/`aud` so cross-service token reuse is impossible if Protin later adds a second JWT issuer.

---

## Suggested fix order

1. **C1** — fail closed on default `SECRET_KEY` (one-line startup check).
2. **H1** — add a shared-secret dependency to `internal_router`.
3. **H2** — verify CORS middleware behaviour and add a non-local startup assertion.
4. **M5/M6** — extend encryption-key requirement to staging.
5. **H3** — rate limiting on auth endpoints (Redis already wired).
6. **M1/M2** — JWT hardening (`jti`, `iat`, `require`, shorter TTL + refresh).
7. Remaining medium/low items as hygiene.

---

## Out of scope but flagged for follow-up

- `main.py` CORS middleware wiring (referenced by H2).
- `app/schemas/auth.py` password validation (referenced by L2).
- `app/services/notifications.py` IDOR scoping for `unregister_push_token` (looks correct from the router signature `notif_service.unregister_push_token(db, current_user.id, token_id)` but service body not reviewed).
- OAuth `state` / PKCE handling for the Google Calendar callback (lives in users router, not in scope here).
