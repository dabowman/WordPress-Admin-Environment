# Alpha Readiness — 0.1.0

Manual smoke checklist for the first public alpha (workspace as the primary
admin entry, driven by a `wp-content/workspace.json` override on the
`wp-admin-default` baseline). Run against the `single-pane-demo` starter on a
wp-env machine with the Gutenberg plugin active.

This doc is authored for the actual alpha surface — it is **not** the
`docs/archive/v1-readiness.md` / `v2-readiness.md` format. Items marked
**[auto]** are covered by the test suite; **[manual]** need a browser
because the behavior can't be exercised under WP-CLI (`is_admin()` is false
there, and the render/redirect paths `exit`).

## What ships in 0.1.0

`wp-content/workspace.json` is a **partial override** that field-merges over the
shipped `wp-admin-default` baseline (theme.json model): the baseline fills
the cascade `core` slot, the file fills `plugin`. A valid file makes the
workspace take over the admin root; classic wp-admin stays reachable via the
endpoint allowlist and the cap-gated `?classic=1` cookie.

## 1. Cascade — baseline + override merge

- [auto] `run-alpha-trigger-tests.php`: baseline loads into `core`, a valid
  file into `plugin`; a delta-only `{ "styles": … }` file merges over the
  baseline (baseline screens survive); a trusted-origin `null` tombstone
  removes a baseline screen; engine falls back to the baseline when the file
  omits `engine`.
- [manual] Copy `workspaces/single-pane-demo.json` → `wp-content/workspace.json`, load
  `/wp-admin/` — the resolved tree carries the file's regions over the
  baseline. Trim the file to a one-key `{ "styles": { "color": { … } } }`
  delta; the baseline's screens/menu stay, only the chrome retints.
- [manual] Edit the file, refresh — changes take effect with no DB write
  (mtime cache signal).

## 2. Trigger / validation

- [auto] Malformed JSON, a top-level JSON array, an empty object, a
  wrong-typed known top-level block (`"screens":"oops"`), an over-size
  file (>1 MB), and an absent file all degrade to the bare baseline
  (loader returns null). Validation is intentionally partial-permissive
  (PHP ships no JSON-Schema validator) — it catches gross corruption,
  not per-field completeness; the merged doc is shape-tested separately.
- [manual] With `WP_DEBUG` on, a malformed `wp-content/workspace.json` emits
  a `_doing_it_wrong` notice and the admin still loads (degrades to
  baseline) — it does **not** white-screen.
- [auto] `wp_admin_workspaces_workspace_active()`: true with a valid file OR
  an explicitly-written `wp_admin_workspaces_active_shell` option; false on a
  fresh install with neither. When the file is active,
  `window.wpAdminWorkspaces.workspaceFileActive` is true — the workspace switcher
  hides and `switchShell()` throws (writing the option would be a silent
  no-op since the file wins).
- [manual] Fresh install, no file, no option → `/wp-admin/` is untouched
  classic wp-admin (no hijack).

## 3. Workspace hijack (the takeover)

- [auto] Decision logic: bare `index.php` and bare `admin.php` are root
  entries; `?page=…` (incl. `index.php?page=…` plugin dashboard subpages),
  `?action=…` dispatch, `edit.php`, `upload.php` are not; RPC / install /
  update / customizer / network endpoints are allowlisted; the context
  guard short-circuits non-page contexts.
- [manual] With a file in place, `/wp-admin/` and `/wp-admin/index.php`
  mount the workspace. `/wp-admin/admin-ajax.php` still serves AJAX. The
  old `admin.php?page=wp-admin-workspaces` URL 404s (intentional — bookmark
  cleanup is a release note).
- [manual] A third-party plugin page at `admin.php?page=acme` (or a
  dashboard subpage at `index.php?page=acme`) still loads classic, and
  surfaces in the workspace nav via the classic-menu bridge.
- [manual] Logged-out → `/wp-admin/` redirects to `wp-login.php` and back
  cleanly (no hijack-before-auth loop).

## 4. Escape hatches — persistent toggle + session cookie

The workspace can be left in two ways. The persistent **Settings →
Workspace** screen flips the `wp_admin_workspaces_enabled` option;
the session-scoped `?classic=1` cookie remains as a power-user shortcut.

- [auto] **Persistent toggle.** The trigger truth table in
  `run-alpha-trigger-tests.php` covers it: `workspace_enabled=false`
  vetoes a present `wp-content/workspace.json` AND the legacy active-workspace
  option; flipping back to true restores the file-trigger path.
- [manual] **Workspace → Settings → Workspace.** Uncheck "Activate WP
  Admin Workspace", click Save → snackbar success → an inline "Reload
  to apply" notice appears with a Reload now button. Click it → land in
  classic wp-admin.
- [manual] **Classic → Settings → WP Admin Workspaces.** Check the box and
  click Save Changes → the next admin nav lands in the workspace. (This
  parallel `add_options_page` is the only way to re-enable from classic;
  without it the workspace would strand the user after disabling.)
- [auto] **Session cookie.** `set_cookie(true|false)` flips `$_COOKIE`;
  `passes_base_gates` matches the exact value `'1'` (a forged / garbage
  non-empty cookie can't permanently disable the workspace). The toggle
  handler bails on ajax / REST / cron / xmlrpc / CLI contexts and on
  non-GET requests.
- [manual] **`?classic=1` URL toggle.** As an admin, visit
  `/wp-admin/?classic=1` → cookie set → classic for the session. The
  classic admin bar gains "↩ Back to workspace" linking to
  `/wp-admin/?classic=0`. Cookie clears on browser close. Scoped to
  `ADMIN_COOKIE_PATH`, so it works on subdirectory / relocated /
  multisite-subdir installs.
- [manual] A non-`manage_options` user hitting `?classic=1` directly is
  ignored (lands back in the workspace).

## 5. Link interception — workspace → classic (W4)

- [auto] `admin-link-interceptor.test.mjs`: mapped links route, RPC / cross-
  origin / hash / classic-toggle / modifier-click / `target=_blank` /
  download / external-rel pass through; specificity (constrained mapping
  beats a bare sibling); a bare `edit.php` (no `post_type`) is treated as
  `post_type=post` so it still maps to `/posts`; a CPT
  (`?post_type=product`) and an incidental `?action=` on a non-`action`
  entry fall through to classic instead of dropping the param. A nonce-
  protected (`_wpnonce`) request also falls through.
- [manual] Inside the workspace, clicking a link to `/wp-admin/edit.php?post_type=page`
  updates the hash to `#/pages` (no full reload). Cmd/Ctrl-click opens a new
  tab. A link to an unmapped admin page does a normal navigation to classic.

## 6. Link interception — classic → workspace (W5)

- [auto] `run-alpha-routing-tests.php`: `match_legacy_hash` maps
  `edit.php?post_type=page` → `/pages`, bare `edit.php` → `/posts` (WP
  default `post_type=post`), `edit.php?post_type=product` → null (CPT
  falls through to classic), nonce-protected GETs → null, and a request
  whose `?action=` isn't claimed by the entry → null. The baseline
  `legacy_map` covers `/posts`, `/pages`, `/media` and excludes
  allowlisted scripts. `post.php` is intentionally **not** mapped — it
  carries no `post_type`, so editing a Page would otherwise wrongly open
  the Posts editor.
- [manual] Type `/wp-admin/edit.php?post_type=page` in the address bar →
  lands in the workspace at `#/pages`. `/wp-admin/upload.php` → workspace
  media. `/wp-admin/customize.php` (allowlisted) → classic loads.
- [manual] Editing a Page (`post.php?post=42&action=edit` where post 42
  is a Page) loads the classic editor — not redirected to the workspace
  Posts editor.
- [manual] Saving a post (`POST post.php?action=editpost`) is **not**
  redirected — the write completes in classic.

## 7. Iframe behavior (W6)

- [auto] `iframe-bridge.test.mjs`: origin- + source-pinned (source pin
  is **mandatory** — messages without a bound `getIframeWindow` are
  refused); in-iframe `admin-link` routes to the workspace when mapped,
  navigates the iframe otherwise (a `'pass'` URL — RPC / classic toggle
  / cross-origin — is never piped into `iframe.src`); `external-link`
  is scheme-allowlisted (`http` / `https` / `mailto` only — `javascript:`
  / `data:` are ignored); `target=_parent` / `_top` navigate the iframe
  (URL preserved, including nonces); spoofed origin/source + tampered
  cross-origin `target=_parent` dropped.
- [auto] `passes_base_gates` bails on chromeless requests
  (`Sec-Fetch-Dest: iframe` OR `?wp_admin_workspaces_chromeless=1`), so an
  iframed classic page never re-enters the workspace → no nested-workspace
  recursion regardless of whether the iframe URL hits a W5 redirect
  mapping or W2's root-entry render.
- [manual] **Open an `iframe:` screen** (editor / site-editor / Plugins
  → Add New). Clicking an in-iframe admin link that maps to a workspace
  screen pops out into the workspace; an unmapped link navigates within
  the iframe; an external link opens a new tab. Desktop engine
  (`core:desktop`) iframe windows behave as before (regression check).
- [manual] **Plugin upload "Replace current with uploaded".** The
  `target=_parent` button now navigates the IFRAME (not the workspace
  parent), so the action completes server-side with its `_wpnonce`
  preserved and the result renders embedded — user stays in the workspace.
- [manual] **No chrome flash.** The iframe stays `visibility: hidden`
  until `onIframeLoad` injects the chrome-hide CSS, AND a
  `beforeunload` listener flips it hidden again for any in-iframe
  navigation (form submit / link click). A Spinner covers the gap.
- [manual] **Session-expiry recovery.** Reload an iframed classic page
  after a session reset. WordPress would normally render `wp-login.php`
  inside the iframe; the iframe stays hidden, a heartbeat poll is
  forced, and the standard wp-auth-check modal pops at the workspace level.
  Sign in → heartbeat tick → iframe reloads to the real page.

## 8. Capability matrix

- [manual] Walk subscriber → contributor → author → editor → admin. Each role
  sees exactly the screens/menu items wp-admin would surface natively
  (capability gating unchanged by the alpha entry work). Subscriber on an
  admin-only screen gets the gate, not a blank workspace.

## Non-goals / known caveats (alpha)

- **Network admin (multisite):** `/wp-admin/network/` is always classic
  (allowlisted). Never hijacked.
- **Customizer:** `customize.php` is allowlisted — classic only, no native
  port. Reachable from the workspace as a normal navigation.
- **No in-workspace iframe host for unmapped links:** a workspace click on an
  unmapped `/wp-admin/...` link does a full browser navigation to classic
  (the `onUnmatched` iframe-host seam exists but is unwired for alpha).
- **`wp-content/workspace.json` is read-only from PHP:** authors manage it via
  SFTP/git/wp-cli. No settings UI writes it (filesystem caps + nonce + locking
  are post-alpha). Ship the `.htaccess` / nginx note so the file isn't served
  as static JSON.
- **Bundled `workspaces/*` are starter templates**, not a selectable catalog —
  copy one to `wp-content/workspace.json` and edit. The legacy
  `wp_admin_workspaces_active_shell` option still works as a back-compat
  trigger but is hidden by the switcher when a file override is active.
- **The override file has trusted-tier cascade authority by design.** It
  loads into the `plugin` slot and merges via `merge_authoritative`, so it
  may add+remove baseline screens (null tombstones), grow
  `screens[].permissions`, and change `engine` — same authority
  as the bundled plugin. Writing `wp-content/workspace.json` requires
  filesystem access, which already implies the ability to run arbitrary
  plugin code, so no privilege boundary is being defended. See spec §19.
- **Editing a Page edits in classic.** `post.php` carries no `post_type`,
  so the workspace doesn't try to disambiguate Pages/Posts/CPTs — the
  classic post editor handles any post type. The workspace's own
  `/posts/{id}/edit` and `/pages/{id}/edit` links are used internally.
- **Plugin-contributed `legacy_path` mappings are extensible.** A plugin
  can register a route with `legacy_path` to round-trip its own classic
  pages, subject to the same matcher rules: most-specific mapping wins;
  an entry that doesn't claim `?action=` is skipped when the URL carries
  one (so a nonce-less state-changing GET stays classic).
