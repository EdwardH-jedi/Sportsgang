# Protin — Staging Setup

This guide covers first-time setup of the Protin staging environment on the home staging server.

## Prerequisites

- Ubuntu 22.04+ (or Debian 12+) on the home staging server
- Docker Engine 24+ and Docker Compose v2 (`docker compose` — not `docker-compose`)
- Git
- The server's LAN IP address (e.g. `192.168.1.x`) — devices testing the app must be on the same network or connected via Tailscale

Verify Docker:
```bash
docker --version          # Docker version 24+
docker compose version    # Docker Compose version v2+
```

---

## 1 — Clone the repository

```bash
git clone <repo-url> /opt/protin
cd /opt/protin
```

---

## 2 — Create the staging environment file

```bash
cp .env.staging.example .env.staging
nano .env.staging           # or vim, etc.
```

Fill in every `<placeholder>` value:

| Variable | How to get it |
|---|---|
| `POSTGRES_PASSWORD` | Any strong random string |
| `SECRET_KEY` | `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console — OAuth 2.0 Client (optional) |
| `GOOGLE_REDIRECT_URI` | Replace `<staging-host>` with the server's actual LAN IP |

Also update `POSTGRES_URL` so it matches your chosen `POSTGRES_PASSWORD`.

---

## 3 — (Optional) Google OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/), go to **APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add `http://<staging-host>/users/me/google-calendar/callback` as an Authorised redirect URI.
4. Copy the Client ID and Secret into `.env.staging`.

Skip this step if calendar sync is not needed for the current testing session.

---

## 4 — (Optional) HTTPS / self-signed certificate

If you want HTTPS on the LAN:

```bash
mkdir -p infra/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infra/nginx/certs/staging.key \
  -out    infra/nginx/certs/staging.crt \
  -subj "/CN=protin-staging"
```

Then uncomment the HTTPS server block in `infra/nginx/nginx.conf`.

---

## 5 — Deploy

```bash
# First deploy — build images from source
bash infra/scripts/deploy.sh --build

# Subsequent deploys after code changes
git pull
bash infra/scripts/deploy.sh --build

# Subsequent deploys with no code changes (restart / env update)
bash infra/scripts/deploy.sh
```

The script:
1. Checks `.env.staging` exists
2. Pulls base images (postgres, redis, nginx)
3. Builds API/worker if `--build` is passed
4. Starts postgres + redis, waits for healthy
5. Runs Alembic migrations
6. Starts API, worker, nginx
7. Polls `http://localhost/health` until 200

---

## 6 — Verify

```bash
# API health (on the server)
curl http://localhost/health

# From another device on the same LAN
curl http://<staging-host>/health
```

Expected response:
```json
{"status": "ok", "version": "0.1.0", "uptime_seconds": 12.3, "checks": {"database": "ok", "redis": "ok"}}
```

---

## 7 — Mobile app configuration

On the development machine (not the server):

```bash
cp apps/mobile/.env.staging.example apps/mobile/.env
# Edit apps/mobile/.env and set EXPO_PUBLIC_API_URL=http://<staging-host>
```

Then start the Expo dev server — the app will connect to the staging API.

---

## 8 — Useful commands

```bash
# View logs
docker compose -f docker-compose.yml -f docker-compose.staging.yml logs -f api worker

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.staging.yml down

# Stop without removing volumes
docker compose -f docker-compose.yml -f docker-compose.staging.yml stop

# Restart a single service
docker compose -f docker-compose.yml -f docker-compose.staging.yml restart api
```

See [RUNBOOK.md](./RUNBOOK.md) for day-to-day operations.
