# Protin on Fly.io

Production deployment target. The existing `docker-compose.yml` and
`docker-compose.staging.yml` remain the local and staging path — they are
**not** deployed to Fly.

## One-time setup

Run these in order from the repo root. They are interactive and require
`flyctl` (https://fly.io/docs/flyctl/install/) and an authenticated
session (`fly auth login`).

```bash
# 1. Create the app shell (uses fly.toml in the repo root).
#    `--no-deploy` skips the initial deploy so we can wire dependencies first.
fly launch --no-deploy --copy-config --name protin-api --region syd

# 2. Provision managed Postgres in Sydney and attach it to the app.
#    This sets DATABASE_URL as a secret on protin-api automatically.
fly postgres create --name protin-pg --region syd
fly postgres attach protin-pg --app protin-api

# 3. Provision managed Redis (Fly's `fly redis create` now provisions Upstash).
#    This prints a connection URL; capture it and set it as a secret.
fly redis create --name protin-redis --region syd
fly secrets set REDIS_URL="<url-from-previous-command>" --app protin-api

# 4. Mirror the attached Postgres URL into POSTGRES_URL.
#    `fly postgres attach` only sets `DATABASE_URL`. The FastAPI Settings
#    model reads `POSTGRES_URL` (see apps/api/app/core/config.py:10), so
#    the API would otherwise fall through to the localhost default and
#    fail to connect on first boot.
fly secrets set POSTGRES_URL="<same value as DATABASE_URL>" --app protin-api

# 5. Set remaining application secrets. See `.env.staging.example` for the
#    authoritative list; at minimum these are required for a clean boot
#    in production:
fly secrets set \
  APP_ENV="production" \
  SECRET_KEY="<generate with: python -c 'import secrets; print(secrets.token_hex(32))'>" \
  FIELD_ENCRYPTION_KEY="<generate with: python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'>" \
  INTERNAL_API_TOKEN="<generate with: python -c 'import secrets; print(secrets.token_hex(32))'>" \
  APPLE_CLIENT_ID="com.edh1223.protin" \
  GOOGLE_CLIENT_ID="<prod google oauth client id>" \
  GOOGLE_CLIENT_SECRET="<prod google oauth client secret>" \
  --app protin-api

# Why each is required:
#   APP_ENV=production         the encryption-key boot guard refuses to
#                              start without FIELD_ENCRYPTION_KEY in
#                              app_env in {"staging","production"}.
#   SECRET_KEY                 JWT signing secret (token_hex(32) ->
#                              64 hex chars; do NOT use token_urlsafe).
#   FIELD_ENCRYPTION_KEY       MUST be a Fernet key (44-char base64 of
#                              32 raw bytes). `token_urlsafe(32)` will
#                              NOT work — Fernet rejects it at boot.
#   INTERNAL_API_TOKEN         routes mounted under /internal refuse to
#                              boot without it; called by the worker.
#   APPLE_CLIENT_ID            POST /auth/apple returns 503 when unset.

# 6. First deploy.
fly deploy --app protin-api

# 7. Run database migrations inside the deployed app.
fly ssh console -C 'alembic upgrade head' --app protin-api

# 8. Verify the deploy.
curl -sS https://protin-api.fly.dev/health | python -m json.tool
# Expect HTTP 200 and `"status": "ok"` with `"checks": {"db": "ok",
# "redis": "ok"}`. A 503 with "status": "degraded" means one of the
# managed services isn't reachable yet — re-check the secret values
# above before proceeding.
```

## Subsequent deploys

```bash
fly deploy --app protin-api
fly ssh console -C 'alembic upgrade head' --app protin-api   # only if new migrations
```

## TLS / hostname

Fly's Anycast edge terminates TLS automatically for `<app>.fly.dev`.
The default hostname will be **`https://protin-api.fly.dev`**. This is
the value the mobile track uses in `apps/mobile/eas.json` as
`EXPO_PUBLIC_API_URL`.

To add a custom domain later:

```bash
fly certs add api.protin.app --app protin-api
# then add the CNAME/AAAA records Fly prints to your DNS provider
```

## Why nginx isn't deployed here

`infra/nginx/*` is retained for the LAN/staging deployment on the home staging server
home server. On Fly, the Anycast edge handles TLS termination, HTTP→HTTPS
redirects, and request routing — running an extra nginx sidecar would be
redundant.

## Worker process

The worker (`python worker.py`) runs as a **second process group** on the
same image, defined under `[processes]` in `fly.toml`. Scale it
independently:

```bash
fly scale count app=1 worker=1 --app protin-api
fly logs --app protin-api                        # tail all processes
fly logs --app protin-api --instance <worker-id> # tail worker only
```

## Env vars populated by Fly-managed services

| Variable        | Source                          |
|-----------------|---------------------------------|
| `DATABASE_URL`  | `fly postgres attach` (Fly default) |
| `POSTGRES_URL`  | mirror manually with `fly secrets set POSTGRES_URL=...` — the FastAPI `Settings.postgres_url` field reads `POSTGRES_URL`, not `DATABASE_URL` |
| `REDIS_URL`     | set manually from `fly redis create` output |

Everything else (`APP_ENV`, `SECRET_KEY`, `FIELD_ENCRYPTION_KEY`,
`INTERNAL_API_TOKEN`, `APPLE_CLIENT_ID`, `GOOGLE_*`, etc.) is set manually
via `fly secrets set`. See the project `.env.staging.example` for the
authoritative list of variables the app reads.
