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
     setup field in its own shell, where command substitution + quotes fail with
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

- **`wp-env start` hangs or fails** — confirm `*.wordpress.org` is allowlisted
  and `docker info` succeeds. Re-run `npx wp-env start`.
- **`wp-cli not reachable`** — the DB container needs a few seconds after start;
  retry the `wp eval-file` command.
- **Screenshot can't find playwright** — the helper falls back to the global
  install; if it still fails, run `npm install -g playwright && npx playwright install chromium`.
- **Reset the stack** — `npx wp-env destroy && npx wp-env start`.
