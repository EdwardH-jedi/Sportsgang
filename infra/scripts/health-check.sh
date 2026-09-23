#!/usr/bin/env bash
# health-check.sh — verify the staging stack is up on the home staging server
#
# Usage (from repo root):
#   bash infra/scripts/health-check.sh
#
# Exits 0 if all checks pass, 1 if any fail.

set -euo pipefail

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.staging.yml"
COMPOSE="docker compose $COMPOSE_FILES"

PASS=0
FAIL=0

check() {
    local name="$1"
    local result="$2"
    if [[ "$result" == "ok" ]]; then
        echo "  [OK]   $name"
        ((PASS++)) || true
    else
        echo "  [FAIL] $name — $result"
        ((FAIL++)) || true
    fi
}

echo "==> Protin staging health check — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# ── Container status ──────────────────────────────────────────────────────────
echo "Container status:"
$COMPOSE ps

echo ""
echo "Service checks:"

# API HTTP health endpoint
api_status=$(curl -sf http://localhost/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unreachable")
check "API /health" "$api_status"

# Redis ping via docker exec
redis_ping=$($COMPOSE exec -T redis redis-cli ping 2>/dev/null | tr -d '[:space:]' || echo "unreachable")
[[ "$redis_ping" == "PONG" ]] && redis_result="ok" || redis_result="$redis_ping"
check "Redis ping" "$redis_result"

# Postgres pg_isready via docker exec
pg_ready=$($COMPOSE exec -T postgres pg_isready 2>/dev/null | grep -c "accepting connections" || echo "0")
[[ "$pg_ready" -ge 1 ]] && pg_result="ok" || pg_result="not accepting connections"
check "Postgres pg_isready" "$pg_result"

# Worker process running
worker_running=$($COMPOSE ps worker 2>/dev/null | grep -c "running\|Up" || echo "0")
[[ "$worker_running" -ge 1 ]] && worker_result="ok" || worker_result="not running"
check "Worker process" "$worker_result"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"

if [[ "$FAIL" -gt 0 ]]; then
    echo ""
    echo "To diagnose failing services:"
    echo "  docker compose $COMPOSE_FILES logs --tail=50 api"
    echo "  docker compose $COMPOSE_FILES logs --tail=50 worker"
    exit 1
fi

echo "All checks passed."
