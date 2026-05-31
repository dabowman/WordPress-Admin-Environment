#!/usr/bin/env bash
#
# Cloud-environment setup for WP Admin Shell (Claude Code on the web).
#
# This file is committed to the repo so it stays version-controlled. Paste this
# ONE LINE into the Setup script box at claude.ai/code ▸ environment:
#
#     find / -path /proc -prune -o -path /sys -prune -o -path /dev -prune -o -name cloud-setup.sh -path '*scripts*' -exec bash {} ';' || true
#
# Why this shape and not just `bash scripts/cloud-setup.sh`:
#   - The setup field's working directory is NOT the repo root, so a relative
#     path fails with exit 127 (No such file or directory), and the clone path
#     isn't known ahead of time.
#   - The platform re-wraps the field in its own shell, where $(...) command
#     substitution + quotes break ("syntax error near unexpected token )").
# So we self-locate: `find` resolves this script wherever the repo was cloned,
# using no command substitution, no double quotes, and no backslashes. `|| true`
# guarantees a clean exit so the session always launches; this script then
# self-locates its own repo root (below) and cd's there.
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

# Optional Docker Hub auth. wp-env pulls mariadb + phpmyadmin from Docker Hub;
# cloud sessions share an egress IP, so the ANONYMOUS pull rate limit is easy to
# trip ("You have reached your unauthenticated pull rate limit" → 403 mid-pull).
# Authenticating raises the ceiling dramatically. Set DOCKERHUB_USERNAME +
# DOCKERHUB_TOKEN (a Docker Hub access token) as environment secrets to enable.
if [ -n "${DOCKERHUB_TOKEN:-}" ] && [ -n "${DOCKERHUB_USERNAME:-}" ]; then
	log "authenticating to Docker Hub as ${DOCKERHUB_USERNAME} (raises pull rate limit)..."
	printf '%s' "${DOCKERHUB_TOKEN}" | docker login -u "${DOCKERHUB_USERNAME}" --password-stdin >/dev/null 2>&1 \
		&& log "Docker Hub login OK" \
		|| warn "Docker Hub login failed — continuing anonymously (may hit pull rate limit)"
else
	log "no DOCKERHUB_USERNAME/DOCKERHUB_TOKEN set — pulling anonymously (subject to Docker Hub rate limit)"
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
	warn "wp-env start failed. Common causes, in order of likelihood:"
	warn "  1. Docker Hub pull rate limit (403 'unauthenticated pull rate limit')"
	warn "     → set DOCKERHUB_USERNAME + DOCKERHUB_TOKEN env secrets (see above)."
	warn "  2. *.wordpress.org not allowlisted (no WP core / Gutenberg to install)."
	warn "  3. docker daemon not up (see step 1 above)."
	warn "     Retry in-session with: npx wp-env start"
fi

# --- 4. Headless browser for screenshot review ----------------------------
# @wordpress/scripts pulls Playwright in as a local (transitive) dependency, and
# scripts/screenshot.mjs resolves the LOCAL playwright first. Install the browser
# for THAT exact version via the local binary so versions never skew (a global
# `playwright` of a different version downloads a mismatched Chromium build the
# launch then can't find). `--with-deps` adds the OS libraries Chromium needs.
log "installing Playwright + Chromium for screenshots..."
if npx --no-install playwright install --with-deps chromium >/dev/null 2>&1 \
	|| npx --yes playwright install --with-deps chromium >/dev/null 2>&1; then
	log "Playwright Chromium ready — use: node scripts/screenshot.mjs <path> [out.png]"
else
	warn "Playwright/Chromium install failed — allowlist the Playwright CDN (see docs/cloud-environment.md)"
fi

log "setup complete."
exit 0
