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

# --- Docker Hub images (credential-free, cache-aware) ----------------------
# wp-env pulls four images from Docker Hub: mariadb:lts, phpmyadmin, and the
# `wordpress` / `wordpress:cli` bases for its WP + CLI service builds. Cloud
# sessions share an egress IP, so the ANONYMOUS pull rate limit can trip ("You
# have reached your unauthenticated pull rate limit" → 403 mid-pull). Two things
# keep this credential-free:
#   - Docker images persist in /var/lib/docker between sessions, so we SKIP any
#     image already cached — a warm session makes ZERO Docker Hub requests (even
#     a cached re-pull spends a manifest request against the quota).
#   - A cold pull retries with backoff to ride out transient throttling. A fully
#     exhausted shared-IP quota only resets with time (~6h); the retry can't beat
#     that, so we fail soft and let the agent retry the pull in-session later.
ensure_image() {
	img="$1"
	if docker image inspect "$img" >/dev/null 2>&1; then
		log "image cached, skipping pull: $img"
		return 0
	fi
	for attempt in 1 2 3 4; do
		if docker pull "$img" >/dev/null 2>&1; then
			log "pulled: $img"
			return 0
		fi
		warn "pull failed for $img (attempt ${attempt}/4) — backing off..."
		sleep $(( attempt * attempt * 3 ))
	done
	warn "could not pull $img (Docker Hub rate limit?) — wp-env start may fail; retry in-session"
	return 1
}

if docker info >/dev/null 2>&1; then
	log "warming Docker Hub image cache (skips anything already cached)..."
	for img in mariadb:lts phpmyadmin wordpress wordpress:cli; do
		ensure_image "$img" || true
	done
fi

# --- 2. Node dependencies + plugin build ----------------------------------
log "installing npm dependencies..."
npm ci || npm install || warn "npm install failed"

log "building the plugin (wp-scripts build)..."
npm run build || warn "build failed — check the log above"

# --- 3. WordPress via wp-env ----------------------------------------------
# Pulls WP core + the Gutenberg plugin zip from *.wordpress.org and starts the
# Docker stack. --update keeps core/plugins fresh; falls back to plain start.
# Images were warmed above, so a healthy run starts containers without pulling.
log "starting wp-env (first run downloads WordPress + builds containers)..."
wp_env_up=""
for attempt in 1 2 3; do
	if npx wp-env start --update || npx wp-env start; then
		wp_env_up="yes"
		break
	fi
	warn "wp-env start failed (attempt ${attempt}/3) — backing off then retrying..."
	sleep $(( attempt * 5 ))
done
if [ -n "$wp_env_up" ]; then
	log "wp-env is up — dev site http://localhost:8888  |  test site http://localhost:8889"
	# Sanity check that wp-cli works inside the container (this is how PHP tests run).
	npx wp-env run cli wp core version 2>/dev/null \
		&& log "wp-cli reachable inside the container" \
		|| warn "wp-cli not reachable yet — give the DB a moment, then retry in-session"
else
	warn "wp-env start failed. Common causes, in order of likelihood:"
	warn "  1. Docker Hub pull rate limit (403 'unauthenticated pull rate limit')."
	warn "     Cached images make this a non-issue after the first successful run;"
	warn "     a fully exhausted shared-IP quota resets with time (~6h). Retry"
	warn "     in-session with: npx wp-env start"
	warn "  2. *.wordpress.org not allowlisted (no WP core / Gutenberg to install)."
	warn "  3. docker daemon not up (see step 1 above)."
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
