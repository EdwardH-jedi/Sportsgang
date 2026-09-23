# Protin — Environment Variables Reference

All variables consumed by the API, worker, and docker-compose services.

---

## Root `.env` / `.env.staging`

These are loaded by Docker Compose and passed into the relevant containers.

### PostgreSQL (Compose + API)

| Variable | Default (local) | Description |
|---|---|---|
| `POSTGRES_DB` | `protin` | Database name |
| `POSTGRES_USER` | `protin` | Database user |
| `POSTGRES_PASSWORD` | `protin` | Database password — **use a strong value in staging** |
| `POSTGRES_PORT` | `5432` | Host port mapped to postgres container (local only; not exposed in staging) |
| `POSTGRES_URL` | `postgresql://protin:protin@localhost:5432/protin` | Full connection URL for the API; must use `postgres` hostname in staging (Docker network) |

### Redis (Compose + API)

| Variable | Default (local) | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL; use `redis` hostname in staging |
| `REDIS_PORT` | `6379` | Host port mapped to redis container (local only) |

### API runtime

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `local` | Environment tag: `local` \| `staging` \| `production` |
| `API_HOST` | `0.0.0.0` | Bind host for uvicorn |
| `API_PORT` | `8000` | Bind port for uvicorn |
| `LOG_LEVEL` | `info` | Uvicorn / Python log level: `debug` \| `info` \| `warning` \| `error` |
| `SECRET_KEY` | — | **Required.** JWT signing secret. Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `INTERNAL_API_TOKEN` | `""` | **Required in staging/production.** Shared secret for `/internal/*` routes (e.g. `/internal/process-notifications`). The API refuses to boot when unset under `APP_ENV=staging` or `production`. Callers must send it as the `X-Internal-Token` header. Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |

### Google OAuth (optional)

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `""` | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `""` | OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/users/me/google-calendar/callback` | Must be registered as an Authorised redirect URI in Google Cloud Console |

### Worker

| Variable | Default | Description |
|---|---|---|
| `WORKER_POLL_INTERVAL_SECONDS` | `60` | Seconds between notification worker poll cycles |

---

## `apps/mobile/.env`

Loaded by Expo at start time. Variables **must** have the `EXPO_PUBLIC_` prefix to be accessible in JavaScript.

| Variable | Local default | Staging value | Description |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8000` | `http://<staging-host>` | Base URL of the Protin API. No trailing slash. |
| `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` | `http://localhost:8000/users/me/google-calendar/callback` | `http://<staging-host>/users/me/google-calendar/callback` | Must match `GOOGLE_REDIRECT_URI` in the API env and in Google Cloud Console. |

---

## `apps/api/.env`

The API process reads its own `apps/api/.env` for local development (without Docker). In staging the same variables are injected via `docker-compose.staging.yml` from the root `.env.staging`.

See `apps/api/.env.example` for the full list with descriptions.

---

## Notes

- **Never commit** `.env`, `.env.staging`, or `apps/api/.env` — they are in `.gitignore`.
- Example files (`.env.example`, `.env.staging.example`) are committed and serve as templates.
- In staging, postgres and redis ports are **not exposed** to the host; only nginx port 80 (and optionally 443) is public.
