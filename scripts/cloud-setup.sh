#!/usr/bin/env bash
#
# Cloud-environment setup for WP Admin Workspaces (Claude Code on the web).
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
#   1. Starts the Docker daemon with mirror.gcr.io as a registry mirror —
#      Docker Hub's blob CDN (production.cloudfront.docker.com) is BLOCKED by
#      the sandbox egress policy (manifests resolve, every layer 403s), so all
#      docker.io pulls must ride Google's mirror.
#   2. npm ci + production build.
#   3. Patches @wordpress/env for the sandbox (scripts/wp-env-offline-patch.mjs):
#      strips apt/apk/composer steps from its generated Dockerfiles (those
#      package CDNs are blocked too) and fixes the two run-as-root failures
#      (Apache AH00526, wp-cli --allow-root). Then `wp-env start` boots the
#      SAME WordPress stack we use locally (dev :8888, test :8889) so the
#      agent can run every PHP test against a live WP install.
#   4. Installs headless Chromium so the agent can drive the site with
#      Playwright and capture screenshots for review. NO --with-deps: that
#      flag shells out to apt-get (blocked); the sandbox image already has
#      the shared libraries Chromium needs.
#
# Runs as root on Ubuntu 24.04 BEFORE the agent session starts. A non-zero
# exit makes the whole session fail to launch, so every step is best-effort
# and we always `exit 0` — the agent diagnoses failures from the logs below.
#
# NETWORK (sandbox egress policy, verified empirically):
#   reachable: registry-1.docker.io (manifests only), mirror.gcr.io,
#              public.ecr.aws, downloads.wordpress.org, api.wordpress.org,
#              cdn.playwright.dev, npm, GitHub
#   blocked:   production.cloudfront.docker.com (Docker Hub layer CDN),
#              deb.debian.org, security.debian.org, dl-cdn.alpinelinux.org,
#              getcomposer.org, composer.github.io, pecl.php.net
# See docs/cloud-environment.md for the full matrix and what depends on what.

set -uo pipefail

log()  { printf '\n\033[1;34m[cloud-setup]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[cloud-setup WARN]\033[0m %s\n' "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
log "repo root: $REPO_ROOT"

# --- 1. Docker daemon with a registry mirror -------------------------------
# Docker Hub manifest requests succeed but layer downloads redirect to
# production.cloudfront.docker.com, which the egress policy 403s — a plain
# `docker pull` therefore always dies mid-pull. mirror.gcr.io serves the same
# library images and IS reachable, so route all docker.io pulls through it.
MIRROR_URL="https://mirror.gcr.io"
if ! grep -qs "$MIRROR_URL" /etc/docker/daemon.json 2>/dev/null; then
	if [ -s /etc/docker/daemon.json ]; then
		warn "replacing existing /etc/docker/daemon.json (backup: daemon.json.bak)"
		cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
	fi
	mkdir -p /etc/docker
	printf '{\n  "registry-mirrors": ["%s"]\n}\n' "$MIRROR_URL" > /etc/docker/daemon.json
	# A daemon started before the mirror was configured must be restarted.
	if docker info >/dev/null 2>&1; then
		log "restarting dockerd to pick up the registry mirror..."
		pkill dockerd 2>/dev/null
		sleep 3
	fi
fi

if ! docker info >/dev/null 2>&1; then
	log "starting dockerd in the background..."
	dockerd >/var/log/dockerd.log 2>&1 &
	for _ in $(seq 1 30); do
		docker info >/dev/null 2>&1 && break
		sleep 1
	done
fi
if docker info >/dev/null 2>&1; then
	log "docker daemon is up (mirror: $MIRROR_URL)"
else
	warn "docker is not available — wp-env (PHP tests / live WP) will not start"
fi

# --- Docker images (mirror-first, cache-aware) ------------------------------
# wp-env needs four docker.io library images: mariadb:lts, phpmyadmin, and the
# `wordpress` / `wordpress:cli` bases for its WP + CLI service builds.
#   - Images persist in /var/lib/docker between sessions, so anything cached
#     is skipped outright.
#   - A cold pull rides the registry mirror (above). If the mirror ever fails,
#     fall back to AWS's Docker Hub mirror (public.ecr.aws) and retag.
ensure_image() {
	img="$1"
	if docker image inspect "$img" >/dev/null 2>&1; then
		log "image cached, skipping pull: $img"
		return 0
	fi
	for attempt in 1 2; do
		if docker pull "$img" >/dev/null 2>&1; then
			log "pulled (via mirror): $img"
			return 0
		fi
		warn "pull failed for $img (attempt ${attempt}/2) — backing off..."
		sleep $(( attempt * 5 ))
	done
	ecr="public.ecr.aws/docker/library/$img"
	if docker pull "$ecr" >/dev/null 2>&1 && docker tag "$ecr" "$img"; then
		log "pulled (via public.ecr.aws): $img"
		return 0
	fi
	warn "could not pull $img from any reachable registry — wp-env start may fail; retry in-session"
	return 1
}

if docker info >/dev/null 2>&1; then
	log "warming Docker image cache (skips anything already cached)..."
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
# First patch @wordpress/env for the sandbox (MUST follow npm ci, which
# restores the pristine package). The patch is idempotent and fails loudly if
# an @wordpress/env upgrade reshapes the templates it edits. Without it,
# `wp-env start` dies twice over: image builds hit blocked apt/apk/composer
# CDNs, and the root sandbox user trips Apache's AH00526 + wp-cli's root guard.
log "patching @wordpress/env for sandboxed (offline, root) operation..."
node "$SCRIPT_DIR/wp-env-offline-patch.mjs" || warn "wp-env patch failed — wp-env start will likely fail; see message above"

log "starting wp-env (builds local images, installs WordPress)..."
wp_env_up=""
for attempt in 1 2 3; do
	if npx wp-env start; then
		wp_env_up="yes"
		break
	fi
	warn "wp-env start failed (attempt ${attempt}/3) — backing off then retrying..."
	sleep $(( attempt * 5 ))
done
if [ -n "$wp_env_up" ]; then
	log "wp-env is up — dev site http://localhost:8888  |  test site http://localhost:8889"
	# Apache runs as www-data (not the root host user — see the patch), so let
	# it write uploads/upgrade dirs inside the root-owned WordPress trees.
	chmod -R a+rwX "$HOME"/.wp-env/*/WordPress/wp-content \
		"$HOME"/.wp-env/*/tests-WordPress/wp-content 2>/dev/null \
		|| warn "could not open up wp-content permissions — media uploads may fail"
	# Sanity check that wp-cli works inside the container (this is how PHP tests run).
	npx wp-env run cli wp core version 2>/dev/null \
		&& log "wp-cli reachable inside the container" \
		|| warn "wp-cli not reachable yet — give the DB a moment, then retry in-session"
else
	warn "wp-env start failed. Common causes, in order of likelihood:"
	warn "  1. The @wordpress/env offline patch did not apply (see step 3 above) —"
	warn "     image builds then hit blocked package CDNs and die on 'apk update'."
	warn "  2. Docker images missing AND both mirrors unreachable (see pull warnings)."
	warn "  3. docker daemon not up (see step 1 above)."
	warn "  Retry in-session with: node scripts/wp-env-offline-patch.mjs && npx wp-env start"
fi

# --- 4. Headless browser for screenshot review ----------------------------
# @wordpress/scripts pulls Playwright in as a local (transitive) dependency, and
# scripts/screenshot.mjs resolves the LOCAL playwright first. Install the browser
# for THAT exact version via the local binary so versions never skew. Do NOT use
# --with-deps: it shells out to apt-get, which the egress policy blocks, and the
# sandbox image already ships the shared libraries headless Chromium needs.
log "installing Playwright Chromium for screenshots..."
if npx --no-install playwright install chromium \
	|| npx --yes playwright install chromium; then
	log "Playwright Chromium ready — use: node scripts/screenshot.mjs <path> [out.png]"
else
	warn "Playwright/Chromium install failed — allowlist cdn.playwright.dev (see docs/cloud-environment.md)"
fi

log "setup complete."
exit 0
