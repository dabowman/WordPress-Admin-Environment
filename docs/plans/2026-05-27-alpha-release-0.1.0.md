# Alpha Release 0.1.0 — admin.json as Override on a Core Baseline

**Status:** active
**Date:** 2026-05-27
**Supersedes:** `docs/archive/plans/2026-05-21-alpha-release.md` (kept as historical artifact; do not edit)
**Branch:** `claude/vibrant-galileo-yjXj2`
**Estimate:** ~7 days serial; W4/W5 can run parallel after W2
**Tag target:** `0.1.0`

## What changed since the archived plan

The 2026-05-21 draft predates the post-ship "unnumbering" cleanup and carried two stale framings. Both are resolved here:

1. **Version.** The archived plan targeted `v3.0.0-alpha.1` and cut a `feat/v3-alpha-release` branch off a "v3 stack." That stack has already landed and been un-numbered — "v3" is gone from the code on purpose. This alpha is **`0.1.0`**: honest pre-1.0 numbering. The current header reads `Version: 2.0.0-beta.1`; W9 resets it to `0.1.0`.
2. **File names.** References to `admin-v3.json` are stale. The schema is `docs/schemas/admin.json`; the validator class is `WP_Admin_Shell_Config_Validator` (`includes/cascade/class-wp-admin-shell-config-validator.php`). All references below use the current names.

And one architecture decision is now **locked** (it was Open Decision D1 in the archived plan):

3. **File semantics — theme.json model.** `wp-content/admin.json` is a **partial override** that deep-merges onto a shipped default baseline, exactly the way a theme's `theme.json` overrides core's `wp-includes/theme.json`. **This plugin is "core."** The bundled `wp-admin-default` shell **moves into the `core` origin slot** as the baseline; the override file occupies the `plugin` slot as a partial delta. This is the resolution of the old "Model A vs Model B" question: it's refined Model A (the file is a validated admin.json doc, not a `{shell, overrides}` selector) — but its *role* is "delta on a real baseline," not "wholesale replacement of the plugin slot." Chosen because the deep, tombstone-aware, merge-by-id resolver is already theme.json-shaped, and because this origin layout is what a future **WordPress core feature** would ship (`wp-includes/admin.json` baseline + `wp-content/admin.json` override).

## Goal

Ship the first public alpha. Today the shell is reached through `wp-admin/admin.php?page=wp-admin-shell` — a guest inside classic wp-admin. Alpha end-state: **plugin active + a valid `wp-content/admin.json` present ⇒ the workspace replaces classic wp-admin at the URL level**, with the file's content layered as a partial override on the shipped `wp-admin-default` baseline. Classic stays reachable as an explicit, cap-gated escape hatch.

End-state user model:

- Default baseline (`wp-admin-default`) ships in the `core` origin. With **no** `wp-content/admin.json`, the workspace does not mount — classic wp-admin is the admin (no hijack).
- A valid `wp-content/admin.json` → workspace mounts at `/wp-admin/`, baseline + file merged. The file declares only deltas (retint chrome, hide a screen, add an app) — everything else falls through from the baseline.
- The six demo shells in `shells/` are **starter templates** the user copies into `wp-content/admin.json`, not selectable peers.
- Toolbar "Classic wp-admin" → cookie-scoped session in classic; reciprocal "Back to workspace" in the classic admin bar.
- Workspace-internal `/wp-admin/...` links route through the admin-route registry or iframe-fallback; classic-internal links to mapped screens redirect into the workspace.

## Non-goals (alpha)

- **Network admin (multisite).** `/wp-admin/network/` always classic. Flag in readiness doc.
- **Customizer (`/wp-admin/customize.php`).** Iframe-fallback only, no native port.
- **Workspace at a non-`/wp-admin/` URL.** Reuse the existing admin URL — same auth, same nonce contract.
- **WP-CLI scaffolder for admin.json.** Manual copy from `shells/` for alpha.
- **Multi-shell selection UI.** Under the file model the file *is* the customization. The `wp_admin_shell_active_shell` option + switching UI are retired from the primary path (kept only as a back-compat trigger — see W1).
- **Settings UI that writes `wp-content/admin.json`.** The file is read-only from PHP's view; authors manage it via SFTP/git/wp-cli. A writer needs filesystem caps + nonce + lock handling — post-alpha.
- **Setup wizard / onboarding modal.** Plain README docs for alpha.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| File semantics | Partial override (theme.json model). File = delta; `wp-admin-default` = baseline |
| Baseline origin slot | `core` (was `plugin`). `wp-admin-default` moves out of the selectable-shell pool |
| Override origin slot | `plugin` (full-trust filesystem origin; site/role/user still layer above) |
| Override validation | Partial-permissive: existing schema with top-level `required` relaxed; completeness enforced post-merge by shape-tests |
| admin.json home | `wp-content/admin.json` |
| Escape hatch | Toolbar link + `?classic=1` query + `wp_admin_shell_classic` session cookie (cap-gated `manage_options`) |
| Legacy `admin.php?page=wp-admin-shell` route | Remove immediately |
| `wp_admin_shell_active_shell` option | Back-compat trigger only (full-shell replace semantics); file wins when present |
| Iframe-internal admin links | Generalize chromeless bridge from `core:desktop-iframe` to all iframe-fallback apps |
| Target version | `0.1.0` |

## Architecture overview

### Cascade (the core change)

Six origins still merge in order — but the **baseline and override swap slots** so the file becomes a true delta:

```
BEFORE                                    AFTER (0.1.0)
core   = empty_doc() skeleton             core   = wp-admin-default baseline (full)
engine = engine default-styles            engine = engine default-styles
plugin = selected shell (full, replace)   plugin = wp-content/admin.json (partial override)
site   = wp_admin_shell_site_config        site   = wp_admin_shell_site_config
role   = role config                       role   = role config
user   = user prefs                        user   = user prefs
```

The merge engine is unchanged — it already deep-merges per-property, merges arrays by `id`, and honors null tombstones (a capability theme.json lacks). All that changes is *what loads into `core` and `plugin`*, plus the validation mode for the override.

### Request routing

```
                       ┌────────────────────────────────────────────┐
                       │ Browser hits /wp-admin/{index,admin}.php   │
                       └──────────────────┬─────────────────────────┘
                                          │
                                ┌─────────▼──────────┐
                                │ admin_init pri=0   │
                                │   gate (W2)        │
                                └─┬──────────────┬───┘
            workspace active +    │              │ workspace inactive
            no classic cookie +   │              │      OR cookie set
            allowlisted endpoint  │              │      OR endpoint denied
                                  ▼              ▼
                       ┌──────────────────┐   ┌──────────────────┐
                       │ render shell +   │   │ classic wp-admin │
                       │ exit             │   │ (+ "Back to      │
                       │                  │   │  workspace" in   │
                       │                  │   │  admin_bar)      │
                       └────────┬─────────┘   └──────────────────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
            link click     iframe app    "Classic" toolbar btn
            interceptor    (chromeless     → set cookie
            (W4)            bridge)         → reload
                            (W6)            (W3)
```

Both link-interception directions reduce to one guarantee: **the URL determines the renderer.** Classic links into workspace-mapped screens redirect to the workspace; workspace clicks on `/wp-admin/...` route through the registry. The cookie short-circuits both for the `manage_options` escape hatch.

## Workstream breakdown

### W1 — Core baseline + file override origin (~1.5 days)

**Goal.** Move `wp-admin-default` into the `core` origin as the shipped baseline; make `wp-content/admin.json` a partial override in the `plugin` slot; teach the validator a partial-permissive mode. Presence of a valid file determines "workspace active."

**Files touched:**

- `includes/origins/class-wp-admin-shell-origin-core.php`
  - Relocate the baseline doc on disk to `includes/origins/admin-default.json` (semantic clarity — "this is core's shipped default," and the path mirrors WP core's eventual `wp-includes/admin.json`). The remaining six `shells/*.json` stay put as starter templates.
  - `load()` reads the baseline file; `empty_doc()` is demoted to a last-resort guard used only when the baseline file is missing/corrupt.
- `includes/origins/class-wp-admin-shell-origin-file.php` (new) — loads `WP_CONTENT_DIR . '/admin.json'`, validates it **partial-permissively** (see below), returns the doc or `null`. mtime exposed via a static getter for the cache signal.
- `includes/cascade/class-wp-admin-shell-config-validator.php` — add a partial mode. The override file must be structurally correct for whatever keys it declares, but need not be *complete*. Implementation: validate against the existing `docs/schemas/admin.json` with the **top-level `required` array relaxed** (`[ "version", "$wpds", "name", "workspace", "screens" ]` no longer mandatory at the override layer). Nested `required` (e.g. a declared screen still needs an `id`, a `workspace` that *is* present still needs `engine`) stays enforced. Completeness of the *merged* doc is enforced where it already is — post-resolution, by `run-shape-tests.php`. This mirrors theme.json: per-origin partials are lenient; the resolved result is complete.
- `includes/cascade/class-wp-admin-shell-resolver.php`
  - `load_origins()`: `core` ← baseline (`Origin_Core::load()`); `plugin` ← file origin when a valid `wp-content/admin.json` exists, else fall back to the legacy selected-shell (back-compat, see below).
  - **Baseline-skip rework.** The current `$has_plugin_engine` branch (resolver.php:201–209) skips the `empty_doc()` baseline whenever the plugin doc declares an engine — it exists because the old `core` was a conflicting v1 skeleton. With `core` now holding the real baseline, the rule inverts: **keep the baseline and merge** when the `plugin` slot holds a *partial override file*; **skip the baseline (full replace)** only on the back-compat path when the `plugin` slot holds a *complete selected shell*. Detect via the origin source, not by sniffing for an engine key. Mark the file-origin doc as partial so the resolver branches correctly.
  - **Engine resolution.** `engine_origin()` currently reads the engine id from the plugin doc only. A partial override file may omit `workspace.engine`; the effective engine must then come from the **baseline** (`core.workspace.engine`). Change `engine_origin()` to read `override.workspace.engine ?? baseline.workspace.engine`.
  - `active_shell_slug()` becomes back-compat-only: consulted only when no file is present.
- `includes/cascade/class-wp-admin-shell-cache.php` — `wp_admin_shell_cache_signals` contribution: `admin_json_mtime` (override file) so edits invalidate cache automatically. Confirm the baseline file's mtime is also covered (extend `core_mtime` / `shells_mtime()` to include `includes/origins/admin-default.json` after the relocation).
- `wp-admin-shell.php` — new helper `wp_admin_shell_workspace_active()` → bool. **True when** (a) a valid `wp-content/admin.json` is present, **OR** (b) the `wp_admin_shell_active_shell` option was *explicitly written* to the DB (back-compat). A fresh install has neither, so it returns false and the hijack (W2) never fires. Note: `get_option('wp_admin_shell_active_shell', 'wp-admin-default')` defaults to a non-empty value, so "explicitly written" must be detected via `get_option(..., null) !== null`, not mere non-emptiness. Single source of truth used by W2/W3/W5.
- `tests/php/run-alpha-trigger-tests.php` (new, ~20 assertions) — baseline loads into `core`; valid file → merges as partial over baseline (delta-only file inherits baseline screens); malformed file → `WP_Error`, graceful degrade to baseline + `_doing_it_wrong`; absent file + unset option → `workspace_active()` false; absent file + explicit option → back-compat full-shell replace; partial-permissive validation accepts a `{ "styles": {…} }`-only file but rejects a structurally-broken screen; mtime change (file or baseline) invalidates cache.

**Acceptance:** Copy `shells/developer-admin.json` to `wp-content/admin.json`, hit `/wp-admin/`, see the resolved tree carry the file's regions over the baseline. Trim the file to a one-key `{ "styles": { … } }` delta — the baseline's screens/menu remain, only the chrome retints. Edit the file, refresh — changes take effect without a DB write.

**Risks.**

- **Malformed `admin.json` crashes the whole admin.** Validator returns `WP_Error`; resolver degrades to the bare `core` baseline + a warning. Cover with negative tests.
- **Back-compat merge surprise.** An existing install with the option set to a *full* demo shell must keep its old "replace" behavior, not silently inherit baseline screens. The origin-source-based skip rule (above) guarantees this; pin it with a back-compat test.
- **`wp-content/admin.json` directly fetchable.** A webserver may serve it as static JSON at the public URL. Ship an `.htaccess` snippet (Apache) + an nginx doc note. Defense in depth: the file is structural config with no secrets; document the exposure.
- **`WP_CONTENT_DIR` writable assumption.** None — the file is read-only from PHP. Authors manage it out-of-band.

### W2 — Workspace as primary admin entry (~1.5 days)

**Goal.** `/wp-admin/`, `/wp-admin/index.php`, and `/wp-admin/admin.php` (no `?page=...`) render the workspace when active. The legacy `?page=wp-admin-shell` entry goes away.

**Files touched:**

- `wp-admin-shell.php`:
  - Remove the `admin_menu` registration adding `add_menu_page('wp-admin-shell', …)` (wp-admin-shell.php:296) and the `wp-admin-shell-settings` submenu (:307).
  - Move the shell-render body out of `wp_admin_shell_render_page()` into a standalone function callable from the new hijack point.
  - Swap the `'toplevel_page_wp-admin-shell' !== $hook` guard in `admin_enqueue_scripts` (:328) for a `wp_admin_shell_is_active_request()` check.
  - Update `logoutUrl` (:433) from `admin_url('admin.php?page=wp-admin-shell')` to `admin_url('/')`.
- `includes/class-wp-admin-shell-hijack.php` (new) — `admin_init` priority 0:
  1. Bail if `! is_admin()`, `wp_doing_ajax()`, `defined('REST_REQUEST')`, `defined('DOING_CRON')`, or `defined('XMLRPC_REQUEST')`.
  2. Bail if the request path matches `ENDPOINT_ALLOWLIST` (W7).
  3. Bail if `$_COOKIE['wp_admin_shell_classic']` is set.
  4. Bail if `! wp_admin_shell_workspace_active()`.
  5. Bail if `! current_user_can( 'read' )`.
  6. Render the shell container, enqueue assets, `exit`.
- Settings page registration removed. The settings page URL 404s post-alpha; bookmark cleanup is a release-note item. Shell-level settings move to a workspace-internal app later.
- `tests/php/run-alpha-routing-tests.php` (new) — hijack fires on the right paths, bails on the right paths, respects cookie/cap, exits cleanly.

**Acceptance:** With `wp-content/admin.json` in place, `/wp-admin/` mounts the workspace. `/wp-admin/post-new.php` (W5) redirects to the workspace. `/wp-admin/admin-ajax.php` still serves AJAX. The old settings URL 404s (intentional).

**Risks.**

- **Hook ordering.** `admin_init` fires after `set_current_user`, so auth is established before the hijack. Manual-test a logged-out session to confirm the login redirect lands cleanly.
- **Plugin-added admin pages.** Any `admin.php?page=*` request is allowlisted to classic (W7) so third-party plugin pages stay reachable; the classic-menu bridge already surfaces opt-in plugins in the workspace nav as `iframe:` apps.
- **`update.php` and async upload.** Hard-allowlisted — separate auth/nonce chains that must not be intercepted.

### W3 — Classic escape hatch (~0.5 day)

**Goal.** Toolbar button switches the current user into classic for a session; reciprocal "Back to workspace" in the classic admin bar.

**Files touched:**

- `src/apps/toolbar-actions/index.js` — entry rendered when `current_user_can('manage_options')` (read from `window.wpAdminShell.capabilities`); click navigates to `/wp-admin/?classic=1`.
- `includes/class-wp-admin-shell-classic-mode.php` (new):
  - `admin_init` priority −10 (before W2's hijack): if `$_GET['classic'] === '1'`, set session cookie `wp_admin_shell_classic`, path `/wp-admin/`, httpOnly, `secure` when `is_ssl()`. Strip the param + `wp_safe_redirect` back. Cap-gated to `manage_options` (no cap → ignored, user lands in the workspace).
  - `admin_bar_menu` priority 999: when the cookie is present add a "Back to workspace" node → `/wp-admin/?classic=0`. When `$_GET['classic'] === '0'`, clear the cookie + redirect.
- `tests/php/run-alpha-routing-tests.php` — cookie set/clear/cap-gate flow.

**Acceptance:** Admin clicks "Classic wp-admin" → reloads in classic; all classic pages reachable. "Back to workspace" → workspace returns. Non-admin clicking the button has no effect. Cookie clears on browser close.

**Risks.** Cap downgrade mid-session keeps classic until the cookie expires (acceptable — cap gates activation, not continuation; document). Cookie is browser-wide, so all tabs follow on next navigation (acceptable for alpha).

### W4 — Workspace → classic link interception (JS, ~1 day)

**Goal.** Clicks on `/wp-admin/...` links inside the workspace stay in the workspace. Capture-phase listener resolves the href against the admin-route registry, routes via hash on match, falls through to iframe-fallback on miss. Forms, AJAX endpoints, and modifier-key clicks pass through.

**Files touched:**

- `src/runtime/navigation/adminLinkInterceptor.js` (new) — `installAdminLinkInterceptor(adminUrl, { routes, navigate, openIframeFallback })`:
  1. `document.addEventListener('click', handler, { capture: true })`.
  2. Bail on `event.defaultPrevented`, any modifier key, `button !== 0`.
  3. Walk to the nearest `<a>`. Bail if none, if `target && target !== '_self'`, if `download`, if `rel*="external"`.
  4. Parse href. Bail unless same-origin AND path under the admin URL path.
  5. Bail on RPC paths (`admin-ajax.php`, `admin-post.php`, `async-upload.php`, `load-{scripts,styles}.php`).
  6. Match against the admin-route registry (exposed to JS via `window.wpAdminShell.adminRoutes`). Hit → `preventDefault` + `navigate(hashRoute)`. Miss → `preventDefault` + `openIframeFallback(href)` (dispatches to `core:iframe-fallback` with `config.url = href`).
- `src/runtime/kernel.js` — install the interceptor on mount.
- `wp-admin-shell.php` — emit the `adminRoutes` shape into `window.wpAdminShell` (from `WP_Admin_Shell_Admin_Routes::get_registered()`).
- `tests/runtime/adminLinkInterceptor.test.mjs` (new, ~30 assertions) — positive/negative cases, modifier keys, `target=_blank`, RPC paths, missing hrefs, registry hit, registry miss → iframe-fallback.

**Acceptance:** Programmatically click an anchor at `/wp-admin/edit.php?post_type=page` → hash updates to the workspace pages route. Click `/wp-admin/admin-ajax.php?action=foo` → passes through. Cmd-click → new tab.

**Risks.** Forward+legacy route encoding — the registry uses path templates (`/posts/{id}`); mapping `edit.php?post_type=page` → `/pages` needs optional `legacy_path`/`legacy_query` declarations on admin routes (added in W5; interceptor matches forward AND legacy in one walk). In-iframe clicks don't bubble to the parent — caught by the chromeless bridge (W6).

### W5 — Classic → workspace redirect (PHP, ~0.5 day)

**Goal.** A workspace-active user hitting `/wp-admin/edit.php` (or any classic page with a workspace equivalent) redirects into the workspace at the matching route. Endpoints without an equivalent stay classic.

**Files touched:**

- `includes/class-wp-admin-shell-admin-routes.php` — add optional `legacy_path` + `legacy_query` to route registration args (`wp_admin_shell_register_admin_route('/posts', [ …, 'legacy_path' => 'edit.php', 'legacy_query' => [ 'post_type' => 'post' ] ])`).
- `includes/class-wp-admin-shell-hijack.php` — classic-screen→workspace-route mapper: walk registered routes, collect `legacy_path` entries; if the request path + query subset matches, build `admin_url('/') . '#' . $hashRoute` (interpolating `legacy_query` slots) and `wp_safe_redirect( …, 302 )` + `exit`.
- Baseline `admin-default.json` + the classic-menu-bridge default routes — populate `legacy_path` / `legacy_query` for the core screens already mapped: `edit.php` (per `post_type`), `post-new.php`, `upload.php`, `users.php`, `themes.php`, `plugins.php`, `options-general.php`, etc.
- `tests/php/run-alpha-routing-tests.php` — round-trip: every screen the classic-menu bridge ingests has a matching `legacy_path`; hitting the classic URL redirects to the workspace route.

**Acceptance:** `/wp-admin/edit.php?post_type=page` → `#/pages`; `/wp-admin/upload.php` → workspace media; `/wp-admin/customize.php` (no mapping) → classic (allowlisted in W7).

**Risks.** Redirect loop — only redirect when the target hash route is non-empty and the path isn't already the workspace root (guard with "target = current path" check). POST handling — the mapper matches GET only; write endpoints (`post.php?action=editpost`) pass through (negative test).

### W6 — Chromeless bridge generalization (~1 day)

**Goal.** Iframe-internal anchor clicks to admin URLs post a message up so the workspace can intercept (mirroring W4). Today only `core:desktop-iframe` does this. Promote the bridge to a kernel-neutral platform service consumed by `core:iframe-fallback`.

**Files touched:**

- `includes/engines/core-desktop/chromeless-bridge.php` → move to `includes/platform/iframe-bridge.php` (create `includes/platform/`). Trigger query string stays `?wp_admin_shell_chromeless=1`. PHP gate broadens: fires whenever an iframe-app loads, not engine-specific.
- `src/runtime/platform/iframeBridge.js` (new) — parent-side listener (postMessage with origin allowlist pinned to the exact `adminUrl`). Routes `admin-link` → `navigate(workspaceHashRoute)` (same registry lookup as W4), `external-link` → `window.open(href, '_blank')`, `focus-request` → engine-specific (no-op outside `core:desktop`).
- `src/apps/iframe-fallback/index.js` — consume `iframeBridge.js`; register + tear down the listener bound to its iframe element.
- `src/runtime/engines/core-desktop/Layout.js` (or its iframe app) — keep desktop-specific `focus-request` (WindowManager) handling, otherwise consume the shared module. Desktop's iframe app extends the base rather than re-registering, so no double-attach.
- `tests/php/run-chromeless-bridge-tests.php` — extend coverage for non-desktop iframe app loads.

**Acceptance:** Loading any `core:iframe-fallback` app attaches the bridge; clicking an `/wp-admin/...` link inside posts `admin-link` and the parent navigates the workspace route; external links open in new tabs; `core:desktop-iframe` regression-clean.

**Risks.** Origin check must verify `event.origin` against the exact `adminUrl` string (loose checks invite spoofing). De-dupe registration so the desktop and fallback apps don't both attach.

### W7 — Redirect-loop guards + endpoint allowlist (~0.5 day)

**Goal.** Centralize the admin URLs that NEVER hijack; audit boundary cases; pre-empt loop scenarios.

**Files touched:**

- `includes/class-wp-admin-shell-hijack.php` — `ENDPOINT_ALLOWLIST`: `admin-ajax.php`, `admin-post.php`, `async-upload.php`, `update.php`, `update-core.php`, `theme-install.php`, `plugin-install.php`, `network/*`, `customize.php`, `media-upload.php`, `load-scripts.php`, `load-styles.php`, `press-this.php`, `link-add.php`.
- Filter `wp_admin_shell_hijack_allowlist` so plugins extend it (mirrors the `wp_admin_shell_classic_menu_core_slugs` filter pattern).
- Tests cover every allowlist path plus 5 paths that SHOULD hijack.

**Acceptance:** Endpoint matrix test passes — every allowlist entry reachable in workspace mode without the cookie; every non-allowlist admin entry hijacks correctly.

### W8 — Tests + readiness doc (~1 day)

**Goal.** Wire the new PHP test runners into `CLAUDE.md`'s test list; ship an alpha readiness doc in a fresh format (the archived `docs/archive/v1-readiness.md` / `v2-readiness.md` format is not binding — author what actually serves the alpha).

**Files touched:**

- `tests/php/run-alpha-trigger-tests.php` — W1 coverage (~20 assertions).
- `tests/php/run-alpha-routing-tests.php` — W2/W3/W5/W7 (~50 assertions: hijack matrix, cookie flow, classic-mode toggle, classic→workspace redirect, allowlist).
- `tests/runtime/adminLinkInterceptor.test.mjs` — W4 (~30 assertions).
- `tests/runtime/iframeBridge.test.mjs` — W6 (~15 assertions).
- `CLAUDE.md` test block — append the new runners; bump assertion totals.
- `docs/alpha-readiness.md` (new) — author for the actual alpha surface, not the legacy template. Cover at minimum: **the cascade change** (baseline-in-`core` + partial override merge, incl. a delta-only file smoke), trigger (file present/absent/malformed; back-compat option), hijack matrix, classic escape round-trip, link interception (both directions), iframe behavior, the multisite + customizer caveats, partial-permissive validation, and a per-role cap matrix. Reference the new origin layout explicitly so a reviewer can confirm `wp-admin-default` resolves from `core`.

**Acceptance:** Full test sweep green; `docs/alpha-readiness.md` checklist completes against a copied `developer-admin` file on a wp-env machine.

### W9 — Documentation + release notes (~0.5 day)

**Goal.** Inform users + contributors of the new mental model.

**Files touched:**

- `README.md` — install/activation walkthrough rewritten around `wp-content/admin.json` as an **override**. Quickstart: "The plugin ships the `wp-admin-default` baseline. To customize, copy a starter template from `shells/` to `wp-content/admin.json` and edit it — you only need to declare what you want to change."
- `CLAUDE.md` — status block update for `0.1.0`. Document the cascade change (baseline moves to `core`; `wp-content/admin.json` is a partial override in `plugin`), the alpha entry point, and classic mode. New Recurring Pattern: "Workspace links never bypass the interceptor — always `<a href>`, never `window.location.assign('/wp-admin/...')`." Update the cascade-origins description (currently "`plugin` = bundled shell") to reflect the new slot assignments.
- `docs/wp-admin-shell-design-spec.md` — append a section "Workspace as primary admin entry" documenting the hijack contract, classic mode, link interception both ways, and the endpoint allowlist as spec-level concepts. Update the cascade section to describe the theme.json-style baseline/override split and note the core-portability target (`wp-includes/admin.json` ↔ `wp-content/admin.json`).
- `docs/schema-sketch.md` — document partial-permissive validation for the override origin (top-level `required` relaxed; completeness enforced post-merge).
- `docs/feedback.md` — Inbox triage of known alpha gaps (network admin, customizer, scaffolding CLI, settings-page replacement, filesystem writer).
- `wp-admin-shell.php` plugin header — set `Version: 0.1.0`. Keep `Requires Plugins: gutenberg`.

**Acceptance:** Fresh clone + README walkthrough produces a working alpha install on wp-env in under 5 minutes, including the delta-only override demonstration.

## Risk register

| Risk | Mitigation |
|------|------------|
| `admin.json` malformed crashes admin | Validator returns `WP_Error`; degrade to bare `core` baseline + warning |
| Partial file rejected by full-schema `required` | Partial-permissive validation relaxes top-level `required`; completeness enforced post-merge by shape-tests |
| Back-compat install silently inherits baseline screens | Origin-source-based skip rule: full selected shell → replace baseline; partial file → merge. Pinned by back-compat test |
| Partial override omits engine | `engine_origin()` reads `override.workspace.engine ?? baseline.workspace.engine` |
| Login redirect loops with hijack | Hijack fires post-`set_current_user`; manual logged-out test in W2 |
| `wp-content/admin.json` exposed via webserver | `.htaccess` snippet + nginx doc; file is structural, no secrets |
| Plugin admin pages broken by hijack | `admin.php?page=*` always allowlisted to classic; plugins opt in via classic-menu bridge |
| Iframe link click bridges twice | W6 origin-check pin + de-dupe registration |
| W5 mapper hits POST endpoint | Mapper GET-only; POST passes through |
| Customizer needs to be reachable | Customizer in allowlist; linked from workspace as iframe-fallback or external |

## Core-portability note

This layout is deliberately the shape a future WordPress **core** feature would take: core ships `wp-includes/admin.json` (the baseline, here `includes/origins/admin-default.json` in the `core` origin) and a site overrides it at `wp-content/admin.json`. The `wp_admin_shell_active_shell` option + multi-shell selection are plugin-isms retained only for back-compat in alpha; they do not translate to core and should not gain new dependents. Keep the baseline/override split clean so the eventual core port is a relocation, not a redesign.

## Cutover sequence

After every workstream lands:

1. Tag `0.1.0` on the release branch.
2. Update the `CLAUDE.md` status block.
3. Publish a P2 post per `docs/comms/` template (if present).
4. Open a tracking issue for deferred work (CLI scaffolder, network admin, customizer, settings-page replacement, filesystem writer).

## Out-of-scope reminders (do not creep)

- WP-CLI scaffolder — defer.
- Multi-shell selection UI — retired under the file model; do not rebuild.
- Filesystem writer for `wp-content/admin.json` — post-alpha (caps + nonce + locking).
- Network admin support — explicit non-goal; document in readiness.
- Customizer port — explicit non-goal; allowlist only.
- Auto-disable plugin when no file + no option — alpha behavior in that state is "no hijack, classic admin"; a cleaner deactivation flow is post-alpha.
