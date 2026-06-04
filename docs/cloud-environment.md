# Cloud environment setup (Claude Code on the web)

This repo's full toolchain — the Docker-based `wp-env` WordPress stack, every PHP
test, and headless-browser screenshots — runs in a Claude Code cloud session.
The heavy lifting lives in [`scripts/cloud-setup.sh`](../scripts/cloud-setup.sh);
this doc covers the one-time UI configuration that **can't** be committed to the
repo, plus how to use the environment in a session.

## One-time configuration at claude.ai/code

The setup script is configured in the cloud-environment UI, not in the repo
(it runs as root on Ubuntu 24.04 *before* the agent launches; a non-zero exit
aborts the session).

1. Open **claude.ai/code** → click the environment chip → **Add / edit environment**.
2. **Setup script** field — paste this single line:

   ```bash
   find / -path /proc -prune -o -path /sys -prune -o -path /dev -prune -o -name cloud-setup.sh -path '*scripts*' -exec bash {} ';' || true
   ```

   Keeping the logic in the committed script means changes ship with the repo;
   only this self-locating one-liner lives in the UI. It looks odd for two
   reasons, both learned the hard way:

   - **The working directory is _not_ the repo root**, and the clone path isn't
     known ahead of time, so `bash scripts/cloud-setup.sh` fails with exit 127
     (`No such file or directory`). `find` resolves the script wherever the repo
     was cloned.
   - **No `$(...)`, no double quotes, no backslashes.** The platform re-wraps the
     setup field in its own workspace, where command substitution + quotes fail with
     `syntax error near unexpected token ')'`. The `find` form avoids all three.

   `|| true` guarantees a clean exit so the session always launches; the script
   then `cd`s to its own repo root internally.

3. **Network access** — the default *Trusted* allowlist already covers Docker
   Hub, npm, and GitHub, but **not** WordPress.org or the Playwright browser
   CDN. Choose **Custom** (Trusted + the domains below) or **Full**:

   | Why | Domains to allow |
   |---|---|
   | wp-env downloads WP core + the Gutenberg plugin zip | `*.wordpress.org` (covers `downloads.wordpress.org`, `api.wordpress.org`) |
   | Playwright downloads the Chromium binary | `cdn.playwright.dev`, `playwright.download.prss.microsoft.com` |

   Without `*.wordpress.org`, `wp-env start` fails (no WordPress to install).
   Without the Playwright CDN, screenshots are unavailable but tests still run.

That's it. New sessions re-run the setup script automatically. Docker **images**
are cached between sessions; **containers** start fresh, so `wp-env start` runs
each session (fast once images are cached).

### Docker Hub pull rate limit (credential-free)

wp-env pulls four images from Docker Hub: `mariadb:lts`, `phpmyadmin`, and the
`wordpress` / `wordpress:cli` bases for its WP + CLI service builds. Cloud
sessions share an egress IP, so the **anonymous** pull limit can trip — it
surfaces as a `403 Forbidden` mid-pull ("You have reached your unauthenticated
pull rate limit").

The setup script handles this **without any credentials**:

- **Cache-aware** — it skips any image already present in `/var/lib/docker`
  (which persists between sessions), so a warm session makes *zero* Docker Hub
  requests. Even a cached re-pull would spend a manifest request against the
  quota, so skipping matters.
- **Cold-pull retry** — a first-time pull retries with backoff to ride out
  transient throttling, then `wp-env start` retries a few times too.

Four pulls is well under the anonymous ceiling, and they only happen once
(thereafter the cache covers it). The only case the script can't paper over is a
**fully exhausted shared-IP quota** — that resets with time (~6h); just retry
`npx wp-env start` in-session later. No Docker Hub login, token, or secret is
required or stored anywhere.

> **`@wordpress/env` is a committed devDependency.** It is otherwise only an
> *optional* peer dependency of `@wordpress/scripts`, so `npm ci` would skip it
> and every `npx wp-env …` call would 404 against the npm registry (there is no
> bare `wp-env` package). It is pinned in `package.json` so `npm ci` always
> installs the `wp-env` CLI.

## What the setup script provisions

| Step | Result |
|---|---|
| Start `dockerd` | Docker daemon available for wp-env |
| `npm ci` + `npm run build` | Dependencies installed, plugin built into `build/` |
| `npx wp-env start --update` | Dev site `http://localhost:8888`, test site `http://localhost:8889` |
| `playwright install chromium` | Headless browser for screenshots (installed globally) |

Sandbox resources: 4 vCPU / 16 GB RAM / 30 GB disk — ample for this stack.

## Using it in a session

### Run the test suites

Node suites run directly:

```bash
npm run test:schema
npm run test:runtime
npm run test:engines
npm run test:parity
npm run lint:js
npm run lint:ts
```

PHP suites run through the wp-env CLI container, exactly as in `CLAUDE.md`:

```bash
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
# ...and the rest of the run-*.php files under tests/php/
```

> **Path note:** wp-env mounts the repo at
> `wp-content/plugins/<repo-dir-name>`. The commands above (and in `CLAUDE.md`)
> assume the checkout dir is `WordPress-Admin-Environment`. If the cloud
> checkout name differs, adjust the in-container path accordingly — confirm with
> `npx wp-env run cli ls wp-content/plugins`.

### Capture a screenshot for review

[`scripts/screenshot.mjs`](../scripts/screenshot.mjs) logs into the dev site and
saves a full-page PNG:

```bash
node scripts/screenshot.mjs /wp-admin/                 admin-home.png
node scripts/screenshot.mjs "/wp-admin/index.php"      dashboard.png
node scripts/screenshot.mjs /                          front.png
```

Defaults match wp-env (`admin` / `password` on `:8888`). Override via
`WP_BASE_URL` (use `:8889` for the test site), `WP_USER`, `WP_PASS`,
`WP_VIEWPORT`. The agent can then read the PNG inline to review rendering.

## Troubleshooting

- **`wp-env start` fails with `403 Forbidden` / "unauthenticated pull rate
  limit"** — Docker Hub throttled the shared egress IP. The setup script skips
  cached images and retries cold pulls with backoff, so this only bites a cold
  cache on an already-exhausted IP. Wait for the anonymous limit to reset (~6h),
  then re-run `npx wp-env start`; once the four images are cached, later sessions
  don't pull at all.
- **`npx wp-env` errors with `404 Not Found … 'wp-env@*' is not in this
  registry`** — `@wordpress/env` isn't installed. Run `npm ci` (it's a committed
  devDependency); npx 404s because there is no bare `wp-env` npm package.
- **`wp-env start` hangs or fails** — confirm `*.wordpress.org` is allowlisted
  and `docker info` succeeds. Re-run `npx wp-env start`.
- **`wp-cli not reachable`** — the DB container needs a few seconds after start;
  retry the `wp eval-file` command.
- **Screenshot can't find playwright** — the helper falls back to the global
  install; if it still fails, run `npm install -g playwright && npx playwright install chromium`.
- **Reset the stack** — `npx wp-env destroy && npx wp-env start`.
