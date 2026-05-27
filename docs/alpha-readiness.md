# Alpha Readiness — 0.1.0

Manual smoke checklist for the first public alpha (workspace as the primary
admin entry, driven by a `wp-content/admin.json` override on the
`wp-admin-default` baseline). Run against the `developer-admin` starter on a
wp-env machine with the Gutenberg plugin active.

This doc is authored for the actual alpha surface — it is **not** the
`docs/archive/v1-readiness.md` / `v2-readiness.md` format. Items marked
**[auto]** are covered by the test suite; **[manual]** need a browser
because the behavior can't be exercised under WP-CLI (`is_admin()` is false
there, and the render/redirect paths `exit`).

## What ships in 0.1.0

`wp-content/admin.json` is a **partial override** that field-merges over the
shipped `wp-admin-default` baseline (theme.json model): the baseline fills
the cascade `core` slot, the file fills `plugin`. A valid file makes the
workspace take over the admin root; classic wp-admin stays reachable via the
endpoint allowlist and the cap-gated `?classic=1` cookie.

## 1. Cascade — baseline + override merge

- [auto] `run-alpha-trigger-tests.php`: baseline loads into `core`, a valid
  file into `plugin`; a delta-only `{ "styles": … }` file merges over the
  baseline (baseline screens survive); a trusted-origin `null` tombstone
  removes a baseline screen; engine falls back to the baseline when the file
  omits `workspace.engine`.
- [manual] Copy `shells/developer-admin.json` → `wp-content/admin.json`, load
  `/wp-admin/` — the resolved tree carries the file's regions over the
  baseline. Trim the file to a one-key `{ "styles": { "color": { … } } }`
  delta; the baseline's screens/menu stay, only the chrome retints.
- [manual] Edit the file, refresh — changes take effect with no DB write
  (mtime cache signal).

## 2. Trigger / validation

- [auto] Malformed JSON, a top-level JSON array, an empty object, and an
  absent file all degrade to the bare baseline (loader returns null).
- [manual] With `WP_DEBUG` on, a malformed `wp-content/admin.json` emits a
  `_doing_it_wrong` notice and the admin still loads (degrades to baseline) —
  it does **not** white-screen.
- [auto] `wp_admin_shell_workspace_active()`: true with a valid file OR an
  explicitly-written `wp_admin_shell_active_shell` option; false on a fresh
  install with neither.
- [manual] Fresh install, no file, no option → `/wp-admin/` is untouched
  classic wp-admin (no hijack).

## 3. Workspace hijack (the takeover)

- [auto] Decision logic: `index.php` and bare `admin.php` are root entries;
  `admin.php?page=*`, `edit.php`, `upload.php` are not; RPC / install /
  update / customizer / network endpoints are allowlisted; the context guard
  short-circuits non-page contexts.
- [manual] With a file in place, `/wp-admin/` and `/wp-admin/index.php` mount
  the workspace. `/wp-admin/admin-ajax.php` still serves AJAX. The old
  `admin.php?page=wp-admin-shell` URL 404s (intentional — bookmark cleanup is
  a release note).
- [manual] A third-party plugin page at `admin.php?page=acme` still loads
  classic (allowlisted), and surfaces in the workspace nav via the classic-
  menu bridge.
- [manual] Logged-out → `/wp-admin/` redirects to `wp-login.php` and back
  cleanly (no hijack-before-auth loop).

## 4. Classic escape hatch (W3)

- [auto] `set_cookie(true|false)` flips `$_COOKIE`; the "Back to workspace"
  admin-bar node shows only when the cookie is set AND a workspace is active.
- [manual] As an admin, the toolbar "Classic wp-admin" button reloads into
  classic; every classic page is reachable; the admin bar shows "↩ Back to
  workspace"; clicking it returns to the workspace. The cookie clears on
  browser close.
- [manual] A non-`manage_options` user: the toolbar button is absent, and
  hitting `?classic=1` directly is ignored (lands back in the workspace).

## 5. Link interception — workspace → classic (W4)

- [auto] `admin-link-interceptor.test.mjs`: mapped links route, RPC / cross-
  origin / hash / classic-toggle / modifier-click / `target=_blank` /
  download / external-rel pass through; specificity (constrained mapping
  beats a bare sibling).
- [manual] Inside the workspace, clicking a link to `/wp-admin/edit.php?post_type=page`
  updates the hash to `#/pages` (no full reload). Cmd/Ctrl-click opens a new
  tab. A link to an unmapped admin page does a normal navigation to classic.

## 6. Link interception — classic → workspace (W5)

- [auto] `run-alpha-routing-tests.php`: `match_legacy_hash` maps
  `edit.php?post_type=page` → `/pages`, bare `edit.php` → `/posts`,
  `post.php?post=42&action=edit` → `/posts/42/edit`; the baseline `legacy_map`
  covers `/posts`, `/pages`, `/media` and excludes allowlisted scripts.
- [manual] Type `/wp-admin/edit.php?post_type=page` in the address bar → lands
  in the workspace at `#/pages`. `/wp-admin/upload.php` → workspace media.
  `/wp-admin/customize.php` (allowlisted) → classic loads.
- [manual] Saving a post (`POST post.php?action=editpost`) is **not**
  redirected — the write completes in classic.

## 7. Iframe behavior (W6)

- [auto] `iframe-bridge.test.mjs`: origin- + source-pinned; in-iframe
  `admin-link` routes to the workspace when mapped, navigates the iframe
  otherwise; `external-link` opens a new tab; spoofed origin/source dropped.
- [manual] Open an `iframe:` screen (e.g. the editor / site-editor). Clicking
  an in-iframe admin link that maps to a workspace screen pops out into the
  workspace; an unmapped one navigates within the iframe; an external link
  opens a new tab. Desktop engine (`core:desktop`) iframe windows behave as
  before (regression check).

## 8. Capability matrix

- [manual] Walk subscriber → contributor → author → editor → admin. Each role
  sees exactly the screens/menu items wp-admin would surface natively
  (capability gating unchanged by the alpha entry work). Subscriber on an
  admin-only screen gets the gate, not a blank shell.

## Non-goals / known caveats (alpha)

- **Network admin (multisite):** `/wp-admin/network/` is always classic
  (allowlisted). Never hijacked.
- **Customizer:** `customize.php` is allowlisted — classic only, no native
  port. Reachable from the workspace as a normal navigation.
- **No in-workspace iframe host for unmapped links:** a workspace click on an
  unmapped `/wp-admin/...` link does a full browser navigation to classic
  (the `onUnmatched` iframe-host seam exists but is unwired for alpha).
- **`wp-content/admin.json` is read-only from PHP:** authors manage it via
  SFTP/git/wp-cli. No settings UI writes it (filesystem caps + nonce + locking
  are post-alpha). Ship the `.htaccess` / nginx note so the file isn't served
  as static JSON.
- **Bundled `shells/*` are starter templates**, not a selectable catalog —
  copy one to `wp-content/admin.json` and edit. The legacy
  `wp_admin_shell_active_shell` option still works as a back-compat trigger.
