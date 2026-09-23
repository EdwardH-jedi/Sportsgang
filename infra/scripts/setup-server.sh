#!/usr/bin/env bash
# setup-server.sh — First-time Docker Engine setup for Ubuntu 22.04+
#
# Target machine: home staging server running Ubuntu 22.04+
# Note: nginx runs inside Docker — do NOT install nginx on the host.
#
# Usage:
#   sudo bash infra/scripts/setup-server.sh
#
# What it does:
#   - Installs Docker Engine and Docker Compose v2 via the official apt repo
#   - Adds the invoking user to the docker group
#   - Enables Docker to start on boot
#
# Safe to re-run — guards prevent duplicate apt source entries and GPG key writes.

set -euo pipefail

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  echo "Error: run this script with sudo or as root." >&2
  exit 1
fi

# ── Install Docker Engine ──────────────────────────────────────────────────────
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings

# Only write the GPG key if it doesn't exist (idempotent)
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
chmod a+r /etc/apt/keyrings/docker.gpg

# Only add the apt source if it doesn't exist (idempotent)
if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
fi

apt-get update
apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# ── Enable Docker on boot ──────────────────────────────────────────────────────
systemctl enable --now docker
echo "Docker enabled and started."

# ── Add user to docker group ───────────────────────────────────────────────────
TARGET_USER="${SUDO_USER:-$USER}"
usermod -aG docker "$TARGET_USER"
echo "User '$TARGET_USER' added to the docker group."
echo "IMPORTANT: log out and back in (or run: newgrp docker) for this to take effect."

# ── Verify ────────────────────────────────────────────────────────────────────
docker --version
docker compose version
