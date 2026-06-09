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

3. **Network access** — the sandbox egress policy is stricter than it looks,
   and the setup script is built around what is *actually* reachable
   (verified empirically, June 2026):

   | Status | Hosts | Used for |
   |---|---|---|
   | reachable | `registry-1.docker.io` | Docker Hub **manifests only** |
   | reachable | `mirror.gcr.io`, `public.ecr.aws` | Docker image **layers** (mirrors of Docker Hub) |
   | reachable | `downloads.wordpress.org`, `api.wordpress.org` | WP core / plugin zips |
   | reachable | `cdn.playwright.dev` | Chromium for screenshots |
   | **blocked** | `production.cloudfront.docker.com` | Docker Hub's layer CDN — direct `docker pull` always 403s mid-pull |
   | **blocked** | `deb.debian.org`, `security.debian.org`, `dl-cdn.alpinelinux.org` | apt/apk inside image builds |
   | **blocked** | `getcomposer.org`, `composer.github.io`, `pecl.php.net` | composer / pecl inside image builds |

   The script routes around every blocked host (registry mirror + the
   `@wordpress/env` patch below), so the default policy works as-is. If
   screenshots fail, allowlist `cdn.playwright.dev`; if WordPress downloads
   fail, allowlist `*.wordpress.org`.

That's it. New sessions re-run the setup script automatically. Docker **images**
are cached between sessions; **containers** start fresh, so `wp-env start` runs
each session (fast once images are cached).

### How the script routes around the blocked hosts

Two mechanisms, both committed to the repo:

- **Registry mirror** — `/etc/docker/daemon.json` gets
  `"registry-mirrors": ["https://mirror.gcr.io"]` before `dockerd` starts, so
  every `docker.io` pull (the four wp-env images: `mariadb:lts`, `phpmyadmin`,
  `wordpress`, `wordpress:cli`) transparently rides Google's mirror instead of
  Docker Hub's blocked CDN. A per-image fallback retags from
  `public.ecr.aws/docker/library/*` if the mirror ever misses. No Docker Hub
  login, token, or secret is required or stored anywhere.

- **`scripts/wp-env-offline-patch.mjs`** — patches `@wordpress/env` in
  `node_modules` after `npm ci` (idempotent; exact-match anchors fail loudly if
  an upstream upgrade reshapes the templates). It fixes two unrelated classes
  of failure that each hard-block a stock `wp-env start`:

  1. *Blocked package CDNs* — wp-env's generated Dockerfiles run
     `apt-get`/`apk update`, install `$PHPIZE_DEPS` + sudo + git, and download
     Composer + PHPUnit at build time. All those hosts are blocked, so the
     build dies on `RUN apk update` (exit 2). The patch drops every
     network-touching step, keeping the offline-safe parts (user creation,
     `php.ini` upload limits). Trade-off: no composer/phpunit/sudo inside the
     containers and no `--xdebug`/`--spx` — none of which this repo's
     `wp eval-file`-based PHP suites use.
  2. *Sandbox runs as root (uid 0)* — wp-env maps the host user into its
     containers, so Apache starts as root and refuses (`AH00526` …
     "Apache has not been designed to serve pages while running as root"; the
     `wordpress` services exit 1), and wp-cli rejects every command without
     `--allow-root`. The patch falls back to `www-data` for
     `APACHE_RUN_USER`/`GROUP` when the host uid is 0 and bakes
     `ENV WP_CLI_ALLOW_ROOT=1` into the CLI images. The setup script then
     `chmod -R a+rwX`s the WordPress `wp-content` trees so `www-data` can
     still write uploads.

> **`@wordpress/env` is a committed devDependency.** It is otherwise only an
> *optional* peer dependency of `@wordpress/scripts`, so `npm ci` would skip it
> and every `npx wp-env …` call would 404 against the npm registry (there is no
> bare `wp-env` package). It is pinned in `package.json` so `npm ci` always
> installs the `wp-env` CLI.

## What the setup script provisions

| Step | Result |
|---|---|
| Configure registry mirror + start `dockerd` | Docker daemon available, `docker.io` pulls ride `mirror.gcr.io` |
| Warm image cache | The four wp-env images present (skipped when cached from a prior session) |
| `npm ci` + `npm run build` | Dependencies installed, plugin built into `build/` |
| `node scripts/wp-env-offline-patch.mjs` | `@wordpress/env` patched for offline builds + root sandbox |
| `npx wp-env start` | Dev site `http://localhost:8888`, test site `http://localhost:8889` |
| `chmod -R a+rwX` the wp-content trees | Apache (`www-data`) can write uploads despite root-owned files |
| `playwright install chromium` (no `--with-deps` — apt is blocked) | Headless browser for screenshots |

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

- **`docker pull` dies with `403 Forbidden` from
  `production.cloudfront.docker.com`** — Docker Hub's layer CDN is blocked by
  the egress policy (manifests resolve, layers don't — this is NOT the
  anonymous pull rate limit). Confirm `docker info` lists
  `https://mirror.gcr.io/` under Registry Mirrors; if not, re-run
  `bash scripts/cloud-setup.sh` (it writes `/etc/docker/daemon.json` and
  restarts `dockerd`).
- **`wp-env start` dies building images on `RUN apk update` (exit 2) or
  `apt-get` errors** — the `@wordpress/env` patch isn't applied (an
  `npm ci`/`npm install` restores the pristine package). Re-apply:
  `node scripts/wp-env-offline-patch.mjs && npx wp-env start`.
- **`wordpress` / `tests-wordpress` containers exit 1 with Apache `AH00526`
  ("not designed to serve pages while running as root")** — same cause: the
  patch (which maps `APACHE_RUN_USER` to `www-data` for a root host user)
  isn't applied. Re-apply as above; wp-env regenerates its docker-compose.yml
  on every start.
- **wp-cli refuses with "Please run this again, adding … --allow-root"** —
  the patched CLI images bake in `WP_CLI_ALLOW_ROOT=1`; re-apply the patch and
  `npx wp-env start` to rebuild them.
- **`npx wp-env` errors with `404 Not Found … 'wp-env@*' is not in this
  registry`** — `@wordpress/env` isn't installed. Run `npm ci` (it's a committed
  devDependency); npx 404s because there is no bare `wp-env` npm package.
- **`wp-env start` hangs or fails some other way** — confirm `docker info`
  succeeds and `downloads.wordpress.org` is reachable. Re-run
  `npx wp-env start`.
- **`wp-cli not reachable`** — the DB container needs a few seconds after start;
  retry the `wp eval-file` command.
- **Screenshot can't find playwright** — the helper falls back to the global
  install; if it still fails, run `npm install -g playwright && npx playwright install chromium`.
- **Reset the stack** — `npx wp-env destroy && npx wp-env start`.
