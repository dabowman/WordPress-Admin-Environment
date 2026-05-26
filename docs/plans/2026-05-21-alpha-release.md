# Alpha Release — Workspace as Default Entry

**Status:** draft (one open design decision flagged in §Open Decisions before W1 starts)
**Date:** 2026-05-21
**Branch base:** `feat/v3-3c4-multi-app-layout` → cut `feat/v3-alpha-release` off `main` after current v3 stack lands
**Estimate:** ~7 days serial; W4/W5 can run parallel after W2
**Owner:** TBD
**Tag target:** `v3.0.0-alpha.1` on `main`

## Goal

Ship the first public alpha. Right now the shell is reached through `wp-admin/admin.php?page=wp-admin-shell` — the workspace is a guest inside classic wp-admin. Alpha state: plugin active + `wp-content/admin.json` present ⇒ workspace replaces classic wp-admin at the URL level. Classic stays reachable as an explicit escape hatch.

End-state user model:

- File at `wp-content/admin.json` → workspace mounts at `/wp-admin/`. Classic unreachable except via opt-in.
- No file → plugin behaves like today (admin page under classic, no hijack).
- Toolbar "Classic wp-admin" button → cookie-scoped session in classic. Classic admin bar shows reciprocal "Back to workspace".
- Workspace-internal `/wp-admin/...` links route through the admin-route registry or iframe-fallback. Classic-internal links to mapped screens redirect into workspace.

## Non-goals (alpha)

- **Network admin (multisite).** `/wp-admin/network/` left to classic always. Flag in readiness doc.
- **Customizer (`/wp-admin/customize.php`).** Same — iframe-fallback only, no native port.
- **Workspace at non-`/wp-admin/` URL.** No `/admin/` rewrite, no custom mount path. Reuse the existing admin URL — same auth, same nonce contract.
- **WP-CLI command to scaffold admin.json.** Manual copy from `shells/` for alpha. Scaffolder is v3.x.
- **Multi-shell selection UI.** With file-based trigger, the file IS the shell. Toolbar dropdown + settings page repurpose deferred (see §Open Decisions).
- **Setup wizard / onboarding modal.** Plain README docs for alpha install.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| admin.json home | `wp-content/admin.json` (file wins; existing `wp_admin_shell_active_shell` option = fallback) |
| Escape hatch | Toolbar link + `?classic=1` query + `wp_admin_shell_classic` session cookie (cap-gated `manage_options`) |
| Legacy `admin.php?page=wp-admin-shell` route | Remove immediately |
| Iframe-internal admin links | Generalize chromeless bridge from `core:desktop-iframe` to all iframe-fallback apps |

## Open Decisions

**D1 — File semantics.** Two viable interpretations:

- **Model A (file IS the shell).** Validates against `admin-v3.json`. Engine + regions + apps all declared inline. Bundled shells become starter templates users copy in. No "pick a shell" UI in alpha.
- **Model B (file is a selector).** Validates against a smaller schema: `{ "shell": "developer-admin", "overrides": {…} }`. Bundled shells stay as the catalog; file picks one + layers overrides.

Plan defaults to **Model A** — smaller conceptual surface, cleaner cascade story (file content flows into the existing `plugin` origin slot replacing the bundled shell), and CIAB-aligned (declarative file, not "select preset"). Ask user to confirm before W1 starts. Model B is mechanically achievable from the same scaffolding (the `plugin` origin loader just changes which file it reads) so the bulk of W1 is unaffected.

## Architecture overview

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

Both directions of the link-interception problem reduce to a single guarantee: **the URL determines the renderer.** Classic links into workspace-mapped screens redirect to workspace; workspace clicks on `/wp-admin/...` route through the registry. Cookie short-circuits both for the manage_options escape hatch.

## Workstream breakdown

### W1 — File-based site origin trigger (~1 day)

**Goal.** `wp-content/admin.json` becomes the canonical workspace declaration. Presence determines "workspace active." Existing `wp_admin_shell_active_shell` option remains for back-compat / programmatic use but file wins.

**Files touched:**

- `includes/origins/class-wp-admin-shell-origin-file.php` (new) — loads `WP_CONTENT_DIR . '/admin.json'`, validates against `admin-v3.json` via existing `WP_Admin_Shell_Config_Validator`, returns the doc or `null`. mtime exposed via static getter for cache signal.
- `includes/cascade/class-wp-admin-shell-resolver.php` — `load_origins()`: if file origin returns a doc, use it in the `plugin` slot in place of the bundled-shell lookup. `active_shell_slug()` gains a `is_file_active()` short-circuit.
- `includes/cascade/class-wp-admin-shell-cache.php` — `wp_admin_shell_cache_signals` contribution: `'admin_json_mtime'` keyed off the file mtime so edits invalidate cache automatically.
- `wp-admin-shell.php` — new helper `wp_admin_shell_workspace_active()` returns bool (file exists + validates, OR DB option non-empty). Single source of truth used by W2 / W3 / W5.
- `tests/php/run-alpha-trigger-tests.php` (new, ~15 assertions) — file-present-and-valid → plugin origin loads from file; file-malformed → graceful fall to bundled default + `_doing_it_wrong` warning; file-absent → option fallback works; mtime change invalidates cache.

**Acceptance:** Copy `shells/developer-admin.json` to `wp-content/admin.json`, hit `/wp-admin/`, see resolved tree carry the file's regions. Edit the file, refresh — changes take effect without DB write.

**Risks.**

- **Invalid JSON crashes the whole admin.** Validator must return a `WP_Error` and degrade to bundled `wp-admin-default` rather than throwing. Cover with negative tests.
- **`WP_CONTENT_DIR` writable assumption.** No — file is read-only from PHP's view. Authors manage via SFTP/git/wp-cli. Settings UI that writes to the file is out of scope for alpha (would need filesystem caps + nonce + lock handling).
- **`/wp-content/admin.json` directly fetchable.** Webserver default likely serves it as a static JSON file at the public URL. Plan ships an `.htaccess` snippet for Apache + nginx documentation note. Defense in depth: validate the file contains no secrets (it shouldn't — shell config is structural) and document the exposure clearly.

### W2 — Workspace as primary admin entry (~1.5 days)

**Goal.** `/wp-admin/`, `/wp-admin/index.php`, and `/wp-admin/admin.php` (no `?page=...`) render the workspace when active. The legacy `?page=wp-admin-shell` entry goes away.

**Files touched:**

- `wp-admin-shell.php`:
  - Remove the `admin_menu` registration that adds `add_menu_page('wp-admin-shell', …)` and the settings submenu.
  - Move the shell-render path into a standalone function callable from the new hijack point.
  - `'toplevel_page_wp-admin-shell' !== $hook` guard in `admin_enqueue_scripts` swaps to a `wp_admin_shell_is_active_request()` check.
  - User `logoutUrl` updates from `admin_url('admin.php?page=wp-admin-shell')` to `admin_url('/')`.
- `includes/class-wp-admin-shell-hijack.php` (new) — `admin_init` priority 0 handler:
  1. Bail if `! is_admin()`, `wp_doing_ajax()`, `defined('REST_REQUEST')`, `defined('DOING_CRON')`, or `defined('XMLRPC_REQUEST')`.
  2. Bail if request path matches any endpoint in `ENDPOINT_ALLOWLIST` (see W7).
  3. Bail if `$_COOKIE['wp_admin_shell_classic']` is set.
  4. Bail if `! wp_admin_shell_workspace_active()`.
  5. Bail if `! current_user_can( 'read' )` (mirror existing entry's cap).
  6. Render the shell container (the body of the old `wp_admin_shell_render_page()`), enqueue assets, `exit`.
- `includes/class-wp-admin-shell-settings.php` (if it exists separately; otherwise inline) — `wp-admin-shell-settings` page registration removed. Functionality moves to a workspace-internal app (`core:settings-shell`, future) or sticks in the existing `core:settings` host.
- `tests/php/run-alpha-routing-tests.php` (new, ~25 assertions) — hijack fires on the right paths, bails on the right paths, respects cookie, respects cap, exits cleanly.

**Acceptance:** With `wp-content/admin.json` in place, navigating to `/wp-admin/` mounts the workspace. `/wp-admin/post-new.php` (W5 territory) redirects to workspace. `/wp-admin/admin-ajax.php` still serves AJAX. The settings page URL 404s — that's intentional; bookmark cleanup is a release-note item.

**Risks.**

- **Hook ordering.** Auth + user-init must run before hijack. `admin_init` fires after `set_current_user`; safe. But login redirect (`wp-login.php` → `wp_safe_redirect( $redirect_to )`) lands on the admin URL — confirm the hijack doesn't fire before the login session is established. Manual test with logged-out session.
- **Plugin-added admin pages.** Third-party plugins may register pages at `/wp-admin/admin.php?page=acme-thing`. With workspace active, those URLs hit hijack. Bail rule: any `admin.php?page=*` request goes to classic (allowlisted in W7) so plugin pages stay reachable. The classic-menu bridge already ingests these into the workspace nav as `iframe:` apps for plugins that opt in.
- **`update.php` and async upload.** Hard-allowlist; they have their own auth flows + nonce chains that must not be intercepted.

### W3 — Classic escape hatch (~0.5 day)

**Goal.** Toolbar button switches the current user into classic for a session. Reciprocal "Back to workspace" in classic admin bar.

**Files touched:**

- `src/apps/toolbar-actions/index.js` — new entry rendered conditionally when `current_user_can( 'manage_options' )` (capability read from `window.wpAdminShell.capabilities`). Click navigates to `/wp-admin/?classic=1`.
- `includes/class-wp-admin-shell-classic-mode.php` (new):
  - `admin_init` priority −10 (before W2's hijack): if `$_GET['classic'] === '1'`, set cookie `wp_admin_shell_classic` = `1`, path=`/wp-admin/`, httpOnly, `secure` when `is_ssl()`, expires 0 (session). Strip query + `wp_safe_redirect` back to `$_SERVER['REQUEST_URI']` without the param. Cap-gated to `manage_options` (no cap = ignore, user lands in workspace).
  - `admin_bar_menu` hook (priority 999) — when cookie present, add "Back to workspace" node linking to `/wp-admin/?classic=0`. When `$_GET['classic'] === '0'`, clear the cookie + redirect.
  - Expiry: cookie is session-scoped. Optional setting (deferred) for explicit duration.
- `tests/php/run-alpha-routing-tests.php` — extend with cookie set/clear/cap-gate flow.

**Acceptance:** Admin clicks "Classic wp-admin" → page reloads in classic. All classic pages reachable. Click "Back to workspace" → workspace returns. Non-admin user clicking the workspace button has no effect (cap check). Cookie clears on browser close.

**Risks.**

- **Cap downgrade mid-session.** User has the cookie set; admin revokes `manage_options` on them; user keeps classic mode until cookie expires. Acceptable — the cap gates *activation*, not session continuation. Document.
- **Multiple browser tabs.** Cookie is browser-wide. One tab clicks Classic → all tabs are now classic on next navigation. Acceptable for alpha; per-tab mode is a future enhancement.

### W4 — Workspace → classic link interception (JS, ~1 day)

**Goal.** Clicks on `/wp-admin/...` links inside the workspace stay in the workspace. Capture-phase listener resolves the href against the admin-route registry, routes via hash on match, falls through to iframe-fallback on miss. Forms + AJAX endpoints + modifier-key clicks pass through.

**Files touched:**

- `src/runtime/navigation/adminLinkInterceptor.js` (new) — `installAdminLinkInterceptor(adminUrl, { routes, navigate, openIframeFallback })`:
  1. `document.addEventListener('click', handler, { capture: true })`.
  2. Bail if `event.defaultPrevented`, `metaKey || ctrlKey || shiftKey || altKey`, `button !== 0`.
  3. Walk up from `event.target` looking for `<a>`. Bail if none, if `target && target !== '_self'`, if `download`, if `rel*="external"`.
  4. Parse href. Bail unless same-origin AND path starts with admin URL path.
  5. Bail on RPC paths (`/wp-admin/admin-ajax.php`, `/wp-admin/admin-post.php`, `/wp-admin/async-upload.php`, `/wp-admin/load-{scripts,styles}.php`).
  6. Match against admin-route registry (existing `WP_Admin_Shell_Admin_Routes` shape — exposed to JS via `window.wpAdminShell.adminRoutes`). Hit → `event.preventDefault()` + `navigate(hashRoute)`.
  7. Miss → `event.preventDefault()` + `openIframeFallback(href)`. Iframe-fallback dispatches to `core:iframe-fallback` app with `config.url = href`, routes to that app, current shell renders it.
- `src/runtime/kernel.js` — install interceptor on mount.
- `wp-admin-shell.php` — emit `adminRoutes` shape into `window.wpAdminShell` (filter through `WP_Admin_Shell_Admin_Routes::get_registered()`).
- `tests/runtime/adminLinkInterceptor.test.mjs` (new, ~30 assertions) — positive + negative cases, modifier keys, target=_blank, RPC paths, missing hrefs, registry hit, registry miss → iframe-fallback.

**Acceptance:** Mount workspace; programmatically click an anchor pointing at `/wp-admin/edit.php?post_type=page` → URL hash updates to workspace pages route. Click `/wp-admin/admin-ajax.php?action=foo` → click passes through (form/RPC). Cmd-click → opens in new tab.

**Risks.**

- **The hash route encoding.** Existing admin-route registry uses path templates (`/posts/{id}`). Mapping `/wp-admin/edit.php?post_type=page` → `/pages` requires either a query-slot-aware inverse mapper, or per-route explicit `legacyPath` declarations. Plan adds optional `legacyPath` to admin-route registry args (`wp_admin_shell_register_admin_route('/posts', [..., 'legacy_path' => 'edit.php', 'legacy_query' => ['post_type' => 'post']])`); interceptor matches forward AND legacy in one walk. Covered in W5 too.
- **In-iframe clicks.** Iframe-internal anchors don't bubble to the parent listener. Chromeless bridge (W6) catches them via the iframe's own listener and posts a message up.

### W5 — Classic → workspace redirect (PHP, ~0.5 day)

**Goal.** When a user with workspace active hits `/wp-admin/edit.php` (or any classic page that has a workspace equivalent), they redirect into the workspace at the matching route. Endpoints without an equivalent stay in classic.

**Files touched:**

- `includes/class-wp-admin-shell-hijack.php` — extend with classic-screen→workspace-route mapper:
  - Walk `WP_Admin_Shell_Admin_Routes::get_registered()`; collect entries declaring `legacy_path` + optional `legacy_query`.
  - On `admin_init` (after the workspace-root render path in W2): if request path matches a `legacy_path` and query subset matches `legacy_query`, build the workspace URL (`admin_url('/') . '#' . $hashRoute`), interpolating any `legacy_query` slots into the route template.
  - `wp_safe_redirect( $workspace_url, 302 )` + `exit`.
- `shells/wp-admin-default.json` + the C3 menu-bridge default routes — populate `legacy_path` / `legacy_query` for the core wp-admin screens already mapped: `edit.php` (per `post_type`), `post-new.php`, `upload.php`, `users.php`, `themes.php`, `plugins.php`, `options-general.php`, etc.
- `tests/php/run-alpha-routing-tests.php` — round-trip: every screen the classic-menu-bridge ingests has a matching `legacy_path` entry; hitting the classic URL redirects to the workspace route.

**Acceptance:** Logged-in admin types `/wp-admin/edit.php?post_type=page` in the address bar — lands in workspace at `#/pages`. Types `/wp-admin/upload.php` → workspace media. Types `/wp-admin/customize.php` (no mapping) → classic loads (allowlisted in W7).

**Risks.**

- **Redirect loop.** Hash fragments aren't sent to the server, but if a redirect target happens to be an admin URL that itself redirects, infinite loop. Mitigation: only redirect when target's hash route is non-empty + the path isn't already the workspace root. Cover with a "redirect target = current path" guard.
- **POST handling.** Form posts (`post.php?action=editpost`) must NOT redirect — they're write endpoints. Mapper only matches GET. Confirm with negative test.

### W6 — Chromeless bridge generalization (~1 day)

**Goal.** Iframe-internal anchor clicks to admin URLs post a message up so the workspace can intercept (mirroring W4 behavior). Today only `core:desktop-iframe` does this. Promote the bridge to a kernel-neutral platform service consumed by `core:iframe-fallback`.

**Files touched:**

- `includes/engines/core-desktop/chromeless-bridge.php` → move to `includes/platform/iframe-bridge.php`. Trigger query string remains `?wp_admin_shell_chromeless=1`. PHP gate broadens: fires whenever an iframe-app loads, not engine-specific.
- `src/runtime/platform/iframeBridge.js` (new) — parent-side listener (postMessage with origin allowlist = `adminUrl`). Routes `admin-link` → `navigate(workspaceHashRoute)` (using the same registry lookup as W4), `external-link` → `window.open(href, '_blank')`, `focus-request` → engine-specific (no-op outside core:desktop; desktop's WindowManager intercepts via its own consumer).
- `src/apps/iframe-fallback/index.js` — consume `iframeBridge.js`. Today the app renders a bare `<iframe>`; gain a `useEffect` that registers + tears down the listener bound to its iframe element.
- `src/runtime/engines/core-desktop/Layout.js` (or its iframe-app) — keep desktop-specific `focus-request` handling (window-manager wiring) but otherwise consume the shared module.
- `tests/php/run-chromeless-bridge-tests.php` — extend coverage for non-desktop iframe app loads.

**Acceptance:** Loading any `core:iframe-fallback` app, the iframe's chromeless bridge attaches its JS (per existing 14-subsystem behavior). Clicking an `/wp-admin/...` link inside the iframe posts `admin-link` to the parent; parent navigates the workspace route. External links open in new tabs. `core:desktop-iframe` regression-clean.

**Risks.**

- **Origin check.** postMessage must verify `event.origin` matches `adminUrl`. Loose check exposes the workspace to message spoofing from same-origin iframes that escape the gate. Pin to exact origin string.
- **Bridge double-attach.** `core:desktop-iframe` currently owns the listener. After promotion, both `core:iframe-fallback` and `core:desktop-iframe` must not register duplicates. Desktop's iframe app extends the base rather than re-registering.

### W7 — Redirect-loop guards + endpoint allowlist (~0.5 day)

**Goal.** Centralize the list of admin URLs that NEVER hijack. Audit boundary cases. Pre-empt loop scenarios.

**Files touched:**

- `includes/class-wp-admin-shell-hijack.php` — `ENDPOINT_ALLOWLIST` constant: `admin-ajax.php`, `admin-post.php`, `async-upload.php`, `update.php`, `update-core.php`, `theme-install.php`, `plugin-install.php`, `network/*` (all multisite), `customize.php`, `media-upload.php`, `load-scripts.php`, `load-styles.php`, `press-this.php` (deprecated but still bookmark-targets), `link-add.php` (deprecated, still routed).
- Filter `wp_admin_shell_hijack_allowlist` so plugins extend (CIAB plugins that need their own classic pages reachable). Mirrors the `wp_admin_shell_classic_menu_core_slugs` filter pattern from 3c.3.
- Tests cover every path in the allowlist plus 5 paths that SHOULD hijack.

**Acceptance:** Comprehensive endpoint matrix test passes. Each allowlist entry stays reachable in workspace mode without cookie. Each non-allowlist admin entry hijacks correctly.

### W8 — Tests + smoke (~0.5 day)

**Goal.** Wire the new PHP test runners into CLAUDE.md's test list. Add an alpha smoke checklist.

**Files touched:**

- `tests/php/run-alpha-trigger-tests.php` — W1 coverage (~15 assertions).
- `tests/php/run-alpha-routing-tests.php` — W2/W3/W5/W7 coverage (~50 assertions across hijack matrix, cookie flow, classic-mode toggle, classic→workspace redirect, allowlist).
- `tests/runtime/adminLinkInterceptor.test.mjs` — W4 (~30 assertions).
- `tests/runtime/iframeBridge.test.mjs` — W6 (~15 assertions).
- `CLAUDE.md` test block — append the four new runners; bump assertion totals (~1235 → ~1345).
- `docs/alpha-readiness.md` (new) — smoke checklist mirroring `docs/v1-readiness.md` and `docs/v2-readiness.md`. Sections: trigger, hijack, escape, link interception (both ways), iframe behavior, multisite caveat, customizer caveat, per-role cap matrix.

**Acceptance:** Full test sweep green. `docs/alpha-readiness.md` checklist completes against `developer-admin` shell on a wp-env machine.

### W9 — Documentation + release notes (~0.5 day)

**Goal.** Inform users + contributors of the new mental model.

**Files touched:**

- `README.md` — top-of-file install / activation walkthrough rewritten around `wp-content/admin.json`. Quickstart: "Drop a copy of `shells/developer-admin.json` at `wp-content/admin.json`, navigate to `/wp-admin/`."
- `CLAUDE.md` — status block update for `v3.0.0-alpha.1`. Add the alpha entry point + classic-mode flag to architecture summary. New Recurring Pattern: "Workspace links never bypass the interceptor — always use `<a href>`, never `window.location.assign('/wp-admin/...')`."
- `docs/wp-admin-shell-design-spec.md` — append §19 "Workspace as primary admin entry" documenting the hijack contract, classic mode, link interception both ways, and the endpoint allowlist as a spec-level concept (so it's a contract, not an implementation detail).
- `docs/feedback.md` — Inbox triage of known alpha gaps (network admin, customizer, scaffolding CLI, settings page replacement).
- `wp-admin-shell.php` plugin header — bump `Version: 3.0.0-alpha.1`. Keep `Requires Plugins: gutenberg`.

**Acceptance:** Fresh git clone + README walkthrough produces a working alpha install on wp-env in under 5 minutes.

## Risk register

| Risk | Mitigation |
|------|------------|
| `admin.json` malformed crashes admin | Validator returns `WP_Error`; degrade to bundled `wp-admin-default` + warning |
| Login redirect loops with hijack | Hijack fires post-`set_current_user`; manual test with logged-out session in W2 |
| `wp-content/admin.json` exposed via webserver | Ship `.htaccess` snippet + nginx doc; validate file has no secrets (structural only) |
| Plugin admin pages broken by hijack | `admin.php?page=*` always allowlisted to classic; plugins opt in via classic-menu bridge |
| Cookie set in incognito then cleared | Session cookie — expires on browser close. User reloads → workspace. Documented |
| Iframe link click bridges twice | W6 origin-check pin + de-dupe registration in `core:iframe-fallback` |
| W5 mapper hits POST endpoint | Mapper GET-only; POST passes through |
| Customizer needs to be reachable | Customizer in allowlist; users link to it from workspace as iframe-fallback or external |

## Cutover sequence

After every workstream lands:

1. Tag `v3.0.0-alpha.1` on `main`. No backport.
2. Update `CLAUDE.md` status block.
3. Publish P2 post per `docs/comms/p2-update-template.md` (if it exists; otherwise script in `docs/comms/`).
4. Open Linear / GitHub tracking issue for the deferred work (CLI scaffolder, network admin, customizer, settings-page-replacement, scaffolding wizard).

## Out-of-scope reminders (do not creep)

- WP-CLI scaffolder (`wp admin-shell scaffold-config`) — defer to v3.x.
- Multi-shell selection UI under the file-based model — defer.
- Auto-disable plugin when no admin.json + no DB option — alpha keeps the legacy entry path working when neither is set (no hijack, no workspace mount). Plugin behavior in that state is "harmless dead weight"; cleaner deactivation flow is post-alpha.
- Network admin support — explicit non-goal, document in readiness.
- Customizer port — explicit non-goal, allowlist only.
