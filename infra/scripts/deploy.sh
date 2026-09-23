#!/usr/bin/env bash
# =============================================================================
# Protin staging deployment script
#
# Runs on the home staging server. Assumes:
#   - Docker and docker compose v2 are installed
#   - .env.staging is present at the repo root (copied from .env.staging.example)
#   - The repo is checked out at the path where this script lives
#
# Usage:
#   cd /path/to/protin
#   bash infra/scripts/deploy.sh
#
# To force rebuild of images (e.g. after code changes):
#   bash infra/scripts/deploy.sh --build
#
# Day-to-day operators should typically drive this through the wrapper:
#   bash infra/scripts/staging-ops.sh deploy-sanity
#   bash infra/scripts/deploy.sh --build
#   bash infra/scripts/staging-ops.sh health
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
COMPOSE="docker compose $COMPOSE_FILES"

DO_BUILD=false
if [[ "${1:-}" == "--build" ]]; then
    DO_BUILD=true
fi

echo "==> Protin staging deploy - $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "    Repo root: $REPO_ROOT"
cd "$REPO_ROOT"

# Preflight checks
if [[ ! -f .env.staging ]]; then
    echo "ERROR: .env.staging not found."
    echo "       Copy .env.staging.example to .env.staging and fill in values."
    exit 1
fi

set -a
source .env.staging
set +a

if ! command -v docker &>/dev/null; then
    echo "ERROR: docker not found on PATH."
    exit 1
fi

# Refresh uv.lock
# The API Dockerfile uses `uv sync --frozen`, which requires apps/api/uv.lock.
# Always run `uv lock` (idempotent: a no-op if pyproject.toml is unchanged) so
# dependency edits flow through without having to manually delete the lock.
echo "==> Refreshing apps/api/uv.lock"
docker run --rm \
    -v "$REPO_ROOT/apps/api:/app" \
    -w /app \
    ghcr.io/astral-sh/uv:python3.12-bookworm-slim \
    uv lock

# Pull / build images
echo "==> Pulling base images"
$COMPOSE pull postgres redis nginx 2>/dev/null || true

if [[ "$DO_BUILD" == "true" ]]; then
    echo "==> Building API image"
    $COMPOSE build api worker migrate
fi

# Start infrastructure
echo "==> Starting postgres and redis"
$COMPOSE up -d postgres redis

echo "==> Waiting for postgres to be healthy"
if ! timeout 60 bash -c "until $COMPOSE ps postgres | grep -q 'healthy'; do sleep 2; done"; then
    echo "ERROR: postgres did not become healthy within 60 seconds."
    $COMPOSE logs --tail=20 postgres
    exit 1
fi

# Run migrations
echo "==> Running database migrations"
if ! $COMPOSE run --rm migrate; then
    echo "ERROR: database migrations failed."
    $COMPOSE logs --tail=20 migrate
    exit 1
fi

# Start API and worker
echo "==> Starting API, worker, and nginx"
$COMPOSE up -d api worker nginx

# Health check
echo "==> Waiting for API to become healthy"
if ! timeout 60 bash -c "until curl -sf http://localhost/health >/dev/null 2>&1; do sleep 3; done"; then
    echo "ERROR: API health check failed within 60 seconds."
    $COMPOSE logs --tail=30 api
    exit 1
fi

echo ""
echo "Deployment complete."
echo "  API health: $(curl -s http://localhost/health)"
echo ""
echo "  Follow logs:    bash infra/scripts/staging-ops.sh tail"
echo "  Re-run health:  bash infra/scripts/staging-ops.sh health"
echo "  Raw compose:    docker compose $COMPOSE_FILES logs -f api worker"
echo "  Stop stack:     docker compose $COMPOSE_FILES down"
