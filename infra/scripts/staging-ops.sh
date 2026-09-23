#!/usr/bin/env bash
# staging-ops.sh - operator wrapper for the staging stack on the home staging server.
#
# Usage:
#   bash infra/scripts/staging-ops.sh health
#   bash infra/scripts/staging-ops.sh logs [service...]
#   bash infra/scripts/staging-ops.sh tail [service...]
#   bash infra/scripts/staging-ops.sh restart [service...]
#   bash infra/scripts/staging-ops.sh drift
#   bash infra/scripts/staging-ops.sh deploy-sanity

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.staging.yml)
DEFAULT_SERVICES=(api worker nginx postgres redis)

cd "$REPO_ROOT"

compose() {
    docker compose "${COMPOSE_FILES[@]}" "$@"
}

timestamp() {
    date -u '+%Y-%m-%dT%H:%M:%SZ'
}

info() {
    echo "==> $*"
}

warn() {
    echo "WARN: $*" >&2
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage:
  bash infra/scripts/staging-ops.sh health
  bash infra/scripts/staging-ops.sh logs [service...]
  bash infra/scripts/staging-ops.sh tail [service...]
  bash infra/scripts/staging-ops.sh restart [service...]
  bash infra/scripts/staging-ops.sh drift
  bash infra/scripts/staging-ops.sh deploy-sanity

Commands:
  health         Run the staging health check.
  logs           Show compose status plus a recent log summary (tail=80).
  tail           Follow logs for one or more services (default: api worker).
  restart        Restart services safely (default: api worker nginx), then re-run health.
  drift          Check .env.staging against .env.staging.example and common staging mistakes.
  deploy-sanity  Run drift + docker compose config validation + current health snapshot.
EOF
}

require_file() {
    local path="$1"
    [[ -f "$path" ]] || die "Required file not found: $path"
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found on PATH: $1"
}

read_env_value() {
    local file="$1"
    local key="$2"
    local line

    line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
    if [[ -z "$line" ]]; then
        return 1
    fi

    printf '%s\n' "${line#*=}"
}

load_service_args() {
    if [[ "$#" -gt 0 ]]; then
        printf '%s\n' "$@"
    else
        printf '%s\n' "${DEFAULT_SERVICES[@]}"
    fi
}

cmd_health() {
    require_command docker
    require_file "$REPO_ROOT/.env.staging"
    bash "$REPO_ROOT/infra/scripts/health-check.sh"
}

cmd_logs() {
    require_command docker
    require_file "$REPO_ROOT/.env.staging"

    local services=()
    mapfile -t services < <(load_service_args "$@")

    info "Compose status at $(timestamp)"
    compose ps

    for service in "${services[@]}"; do
        echo ""
        info "Recent logs for ${service} (last 80 lines)"
        compose logs --tail=80 "$service" || warn "Could not read logs for ${service}"
    done
}

cmd_tail() {
    require_command docker
    require_file "$REPO_ROOT/.env.staging"

    local services=("$@")
    if [[ "${#services[@]}" -eq 0 ]]; then
        services=(api worker)
    fi

    info "Following logs for: ${services[*]}"
    compose logs -f "${services[@]}"
}

cmd_restart() {
    require_command docker
    require_file "$REPO_ROOT/.env.staging"

    local services=("$@")
    if [[ "${#services[@]}" -eq 0 ]]; then
        services=(api worker nginx)
    fi

    info "Pre-restart drift check"
    cmd_drift

    info "Restarting services: ${services[*]}"
    compose restart "${services[@]}"

    info "Post-restart health check"
    cmd_health
}

cmd_drift() {
    require_file "$REPO_ROOT/.env.staging"
    require_file "$REPO_ROOT/.env.staging.example"

    local status=0
    local missing=()
    local extra=()
    local unresolved=()
    local example_keys=()
    local actual_keys=()

    mapfile -t example_keys < <(grep -E '^[A-Z0-9_]+=' "$REPO_ROOT/.env.staging.example" | cut -d= -f1 | sort -u)
    mapfile -t actual_keys < <(grep -E '^[A-Z0-9_]+=' "$REPO_ROOT/.env.staging" | cut -d= -f1 | sort -u)

    mapfile -t missing < <(comm -23 <(printf '%s\n' "${example_keys[@]}") <(printf '%s\n' "${actual_keys[@]}"))
    mapfile -t extra < <(comm -13 <(printf '%s\n' "${example_keys[@]}") <(printf '%s\n' "${actual_keys[@]}"))
    mapfile -t unresolved < <(grep -E '^[A-Z0-9_]+=.*<[^>]+>' "$REPO_ROOT/.env.staging" | cut -d= -f1 || true)

    info "Environment drift check at $(timestamp)"

    if [[ "${#missing[@]}" -eq 0 ]]; then
        echo "  [OK]   no missing keys from .env.staging.example"
    else
        echo "  [FAIL] missing keys: ${missing[*]}"
        status=1
    fi

    if [[ "${#extra[@]}" -eq 0 ]]; then
        echo "  [OK]   no unexpected extra keys"
    else
        echo "  [WARN] extra keys present: ${extra[*]}"
    fi

    if [[ "${#unresolved[@]}" -eq 0 ]]; then
        echo "  [OK]   no placeholder values left in .env.staging"
    else
        echo "  [FAIL] unresolved placeholder values: ${unresolved[*]}"
        status=1
    fi

    local app_env postgres_url redis_url pg_pw
    app_env="$(read_env_value "$REPO_ROOT/.env.staging" APP_ENV || true)"
    postgres_url="$(read_env_value "$REPO_ROOT/.env.staging" POSTGRES_URL || true)"
    redis_url="$(read_env_value "$REPO_ROOT/.env.staging" REDIS_URL || true)"
    pg_pw="$(read_env_value "$REPO_ROOT/.env.staging" POSTGRES_PASSWORD || true)"

    if [[ "$app_env" == "staging" ]]; then
        echo "  [OK]   APP_ENV=staging"
    else
        echo "  [FAIL] APP_ENV should be 'staging' but is '${app_env:-<unset>}'"
        status=1
    fi

    if [[ -n "$postgres_url" && "$postgres_url" == *"@postgres:"* ]]; then
        echo "  [OK]   POSTGRES_URL uses the docker service host"
    else
        echo "  [FAIL] POSTGRES_URL should target '@postgres:' inside compose"
        status=1
    fi

    if [[ -n "$redis_url" && "$redis_url" == redis://redis:* ]]; then
        echo "  [OK]   REDIS_URL uses the docker service host"
    else
        echo "  [FAIL] REDIS_URL should target 'redis://redis:' inside compose"
        status=1
    fi

    if [[ -n "$postgres_url" && "$postgres_url" == *"localhost"* ]]; then
        echo "  [FAIL] POSTGRES_URL still uses localhost"
        status=1
    fi

    if [[ -n "$redis_url" && "$redis_url" == *"localhost"* ]]; then
        echo "  [FAIL] REDIS_URL still uses localhost"
        status=1
    fi

    if [[ -n "$pg_pw" && -n "$postgres_url" && "$postgres_url" == *":${pg_pw}@postgres:"* ]]; then
        echo "  [OK]   POSTGRES_URL password matches POSTGRES_PASSWORD"
    else
        echo "  [FAIL] POSTGRES_URL password does not match POSTGRES_PASSWORD"
        status=1
    fi

    return "$status"
}

cmd_deploy_sanity() {
    require_command docker
    require_file "$REPO_ROOT/.env.staging"

    info "Deploy sanity check"
    cmd_drift

    info "Rendering docker compose config"
    compose config >/dev/null
    echo "  [OK]   docker compose config renders cleanly"

    echo ""
    cmd_health
}

main() {
    local command="${1:-}"
    shift || true

    case "$command" in
        health)
            cmd_health "$@"
            ;;
        logs)
            cmd_logs "$@"
            ;;
        tail)
            cmd_tail "$@"
            ;;
        restart)
            cmd_restart "$@"
            ;;
        drift)
            cmd_drift "$@"
            ;;
        deploy-sanity)
            cmd_deploy_sanity "$@"
            ;;
        -h|--help|help|"")
            usage
            ;;
        *)
            die "Unknown command: $command"
            ;;
    esac
}

main "$@"
