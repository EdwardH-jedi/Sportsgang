# Build context: REPO ROOT.
# `fly.toml` at the repo root sets `[build] dockerfile = "apps/api/Dockerfile"`
# but does not pin a different build context, so Fly defaults to the directory
# that holds fly.toml. Every COPY below is relative to that repo root, e.g.
# `apps/api/pyproject.toml`, NOT bare `pyproject.toml`. The earlier version
# of this Dockerfile assumed the context was `apps/api` and broke clean Fly
# deploys at "COPY pyproject.toml uv.lock ./" with
# `failed to calculate checksum: "/uv.lock": not found`.

# ─── Stage 1: dependency installer ──────────────────────────────────────────
#
# Uses the official uv image so we get a reproducible, fast install.
# Run `uv lock` locally inside apps/api before building if uv.lock is missing
# or stale.
#
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifest and lock file first so Docker can cache this layer.
# Paths are repo-root-relative; both files live under apps/api/.
COPY apps/api/pyproject.toml apps/api/uv.lock ./

# Install production dependencies into an isolated .venv.
# --frozen              : refuse to update uv.lock (fails fast if stale)
# --no-dev              : exclude test/lint dependencies
# --no-install-project  : don't build/install the local package; runtime copies source directly
RUN uv sync --frozen --no-dev --no-install-project


# ─── Stage 2: runtime image ──────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Bring over only the installed virtual environment from the builder.
COPY --from=builder /app/.venv /app/.venv

# Copy application source explicitly (NOT `COPY . .`). Each source under
# `apps/api/` lands directly at WORKDIR so `uvicorn app.main:app` and
# `python worker.py` resolve from /app at runtime, and the image carries
# only the API tree — not the entire monorepo (apps/mobile, docs,
# infra, screenshots, etc.).
COPY apps/api/app ./app
COPY apps/api/worker.py ./worker.py
COPY apps/api/alembic.ini ./alembic.ini
COPY apps/api/alembic ./alembic
COPY apps/api/scripts ./scripts
# Reference data consumed by scripts/seed_venues.py. The seed resolves
# DATA_PATH as scripts/../data/venues_sydney.json, so the runtime image
# must contain /app/data/venues_sydney.json. Previously omitted, which
# left prod with an empty venue catalog and /venues/nearby returning
# items=[] for every sport.
COPY apps/api/data ./data

# Activate the venv for all subsequent RUN / CMD invocations.
ENV PATH="/app/.venv/bin:$PATH"

# Prevent Python from buffering stdout/stderr so logs appear immediately.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Default command — override in fly.toml [processes] for the worker process.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--log-level", "info", \
     "--access-log"]
