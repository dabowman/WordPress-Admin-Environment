#!/usr/bin/env bash
#
# Cloud-environment setup for WP Admin Shell (Claude Code on the web).
#
# This file is committed to the repo so it stays version-controlled. Paste this
# ONE LINE into the Setup script box at claude.ai/code ▸ environment:
#
#     bash scripts/cloud-setup.sh
#
# Use a plain relative path — NOT a $(...) command substitution. The platform
# re-wraps the setup-script field in its own shell, where command substitution
# + quotes break ("syntax error near unexpected token )"). The repo is already
# cloned and the working directory is the repo root when this runs; the script
# also self-locates its repo root internally, so the relative path is enough.
#
# What it does, mirroring our local toolchain:
#   1. Ensures the Docker daemon is running (wp-env needs it).
#   2. npm ci + production build.
#   3. `wp-env start` — boots the SAME WordPress stack we use locally
#      (dev site :8888, test site :8889) so the agent can run every PHP test
#      and anything that needs a live WP install.
#   4. Installs headless Chromium so the agent can drive the site with
#      Playwright and capture screenshots for review.
#
# Runs as root on Ubuntu 24.04 BEFORE the agent session starts. A non-zero
# exit makes the whole session fail to launch, so every step is best-effort
# and we always `exit 0` — the agent diagnoses failures from the logs below.
#
# NETWORK: requires egress to *.wordpress.org (WP core + Gutenberg zip) and the
# Playwright browser CDN. Docker Hub / npm / GitHub are on the default Trusted
# allowlist. See docs/cloud-environment.md for the exact domains to allow.

set -uo pipefail

log()  { printf '\n\033[1;34m[cloud-setup]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[cloud-setup WARN]\033[0m %s\n' "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
log "repo root: $REPO_ROOT"

# --- 1. Docker daemon ------------------------------------------------------
# Installed in the sandbox but not always started. wp-env is Docker-based.
if ! docker info >/dev/null 2>&1; then
	log "starting dockerd in the background..."
	dockerd >/var/log/dockerd.log 2>&1 &
	for _ in $(seq 1 30); do
		docker info >/dev/null 2>&1 && break
		sleep 1
	done
fi
if docker info >/dev/null 2>&1; then
	log "docker daemon is up"
else
	warn "docker is not available — wp-env (PHP tests / live WP) will not start"
fi

# --- 2. Node dependencies + plugin build ----------------------------------
log "installing npm dependencies..."
npm ci || npm install || warn "npm install failed"

log "building the plugin (wp-scripts build)..."
npm run build || warn "build failed — check the log above"

# --- 3. WordPress via wp-env ----------------------------------------------
# Pulls WP core + the Gutenberg plugin zip from *.wordpress.org and starts the
# Docker stack. --update keeps core/plugins fresh; falls back to plain start.
log "starting wp-env (first run pulls images + downloads WordPress)..."
if npx wp-env start --update || npx wp-env start; then
	log "wp-env is up — dev site http://localhost:8888  |  test site http://localhost:8889"
	# Sanity check that wp-cli works inside the container (this is how PHP tests run).
	npx wp-env run cli wp core version 2>/dev/null \
		&& log "wp-cli reachable inside the container" \
		|| warn "wp-cli not reachable yet — give the DB a moment, then retry in-session"
else
	warn "wp-env start failed — verify *.wordpress.org egress and that docker is up"
fi

# --- 4. Headless browser for screenshot review ----------------------------
# Installed globally so it doesn't touch package.json / package-lock.json.
# scripts/screenshot.mjs resolves playwright from either a global or local install.
log "installing Playwright + Chromium for screenshots..."
if npm install -g playwright >/dev/null 2>&1 \
	&& npx --yes playwright install --with-deps chromium >/dev/null 2>&1; then
	log "Playwright Chromium ready — use: node scripts/screenshot.mjs <path> [out.png]"
else
	warn "Playwright/Chromium install failed — allowlist the Playwright CDN (see docs/cloud-environment.md)"
fi

log "setup complete."
exit 0
