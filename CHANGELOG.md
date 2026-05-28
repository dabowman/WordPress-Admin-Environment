# Changelog

All notable changes to WP Admin Shell. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> **Status:** Pre-release. Nothing has shipped publicly; there is no installed base. The canonical architecture lives in `CLAUDE.md` + `docs/`. This file records how the codebase reached its current shape — migration history, deprecation windows, and provenance that `CLAUDE.md` deliberately omits to stay canonical.

## [0.1.0] - 2026-05-28

### Workspace as primary admin entry

The first public-testing release (`0.1.0`): a `wp-content/admin.json` file turns the WordPress admin into the workspace. (This is the version tracked internally as `1.0.0-beta.1` during the v3 reshape — see the note under that entry below; renumbered to `0.1.0` for the first public cut to signal pre-1.0 API/schema instability.) Top-line shape (full detail in `docs/wp-admin-shell-design-spec.md` §19 and `docs/alpha-readiness.md`):

- **Theme.json-style cascade.** `wp-admin-default` ships as the baseline in the `core` origin slot; `wp-content/admin.json` is a partial delta loaded into the `plugin` slot. Field-aware merge — a one-key `{ "styles": … }` file retints the chrome while every baseline screen/menu/command survives.
- **Workspace hijack.** `WP_Admin_Shell_Hijack` (admin_init priority 0) renders the shell at `/wp-admin/` / `index.php` / bare `admin.php` via WordPress's own `admin-header.php`/`admin-footer.php`. The legacy `admin.php?page=wp-admin-shell` entry is removed. Allowlist + the cap-gated `?classic=1` session cookie + the persistent **Settings → Workspace** toggle keep classic reachable.
- **Bidirectional link interception.** Workspace→classic clicks intercepted by `adminLinkInterceptor` (route or pass-through); classic→workspace direct navigations 302'd via `screens[].legacy_path` mappings. Matcher honors WP conventions (absent `?post_type=` ≡ `post`, `?action=` only when an entry constrains it, `?_wpnonce` never mapped).
- **Iframe-fallback hardening.** Origin- + mandatorily-source-pinned bridge consumer; `target=_parent` navigates the iframe (preserves nonces, keeps the user in the workspace); `external-link` scheme-allowlisted; chrome no longer flashes on inner navigation; session expiry forces the wp-auth-check modal immediately. Chromeless requests never re-enter the workspace (no nested-shell recursion).
- **Persistent toggle.** `wp_admin_shell_workspace_enabled` option (default true) vetoes the file/legacy triggers. Workspace-side `core:settings-workspace` DataForm + classic-side `Settings → WP Admin Shell` page.
- **Distribution.** `npm run build:zip` (wp-scripts `plugin-zip` + the `package.json` `files` allowlist) produces `wp-admin-shell.zip`.

Origin-file defensive stat hardening (`clearstatcache` + `is_file()` + `@`-suppressed reads) so the override file disappearing between requests doesn't leak warnings or break header() calls on Docker bind-mount setups.

#### Pre-public-testing review hardening

A whole-codebase review pass before public testing (PR #93):

- **Security.** The resolved config is now pruned server-side to the screens + menu the current user can reach before it ships to the page (`wp_admin_shell_prune_config_for_user`) — the full admin IA no longer leaks to every logged-in user, and role-only nav gates the client can't evaluate are enforced server-side. `user-prefs` writes are byte/key-bounded. `user_passes()` fails closed on a truly empty permission set (no floor, no OR-set). `menu.**.permissions` joins the consumer-origin deny-list (the matcher gained `**` any-depth glob support). The classic-mode `?classic=1` toggle is nonce-protected and its cap floor lowered to `read` (mirrors the hijack floor) so any logged-in user can escape a workspace bug; the documented "Classic wp-admin" admin-bar escape control now actually ships. The classic-menu bridge skips the shell's own Settings page; the iframe bridge's `_parent`/`_top` branch enforces the wp-admin path floor; the origin-file validator rejects list-shaped object blocks.
- **Correctness.** Simple-editor remounts on post change (no cross-post content bleed); settings-general re-syncs custom date/time formats; the bulk-confirm modal guards against double-click; taxonomy cache invalidation uses the full 3-element query key; plugins/themes lists paginate their controlled data; users/comments decode HTML entities in name/author columns; the menu shallowest-wins dedupe hoists a deduped node's unique children instead of dropping them.
- **Distribution.** Added the `License`/`License URI`/`Author`/`Plugin URI` headers, the `WP_ADMIN_SHELL_VERSION` constant, `readme.txt`, `uninstall.php` (options + prefs meta + transient cleanup, multisite-aware), JS i18n (`wp_set_script_translations` + `languages/wp-admin-shell.pot`), and a Gutenberg runtime-dependency gate that stands the hijack down to classic instead of rendering blank. Fixed README/CLI references to the removed demo shells; archived stale process docs under `docs/archive/`.

#### Fixed

- **Editor stuck on a permanent spinner.** The `wp-admin-default` post-edit and page-edit screens passed the captured post id into `config.postId`, but `core:editor` reads `config.id`. Since `interpolate()` only carries the keys the screen `config` declares (and the app's `config-schema` is never enforced at mount), `config.id` was `undefined` → `Number(undefined)` is `NaN` → the `! postId` loading guard never cleared, so editing any post or page showed a spinner forever with no error. Aligned both screens to `"id": "{id}"` (matching `single-pane-demo.json`, which was already correct), declared `id` in the editor's `config-schema`, and corrected the `app.json`/`app.md` references that wrongly named the key `postId`. Codified the route-config-key-must-match-what-the-app-reads trap in `CLAUDE.md`.

### v3 reshape (current shape)

Three artifacts replaced v1's single-file shape:

- `app.json` (per-app intrinsics, ships with app code)
- `engine.json` (engine + region templates + modes + slots)
- `admin.json` (install decisions only) — shape `workspace` / `settings` / `screens` / `menu` / `commands` (+ `styles` / `preload` / `regions` / `routes`)

The v2 region vocabulary (`role` + `layout` + `platform` + `routing`) carried forward unchanged into v3. The kernel reads v3 natively. All bundled shells migrated to canonical v3 shape.

Provenance of notable subsystems (for archaeology only — not load-bearing):

- Desktop engine P1 + P2 landed on `feat/desktop-engine-*` branches.
- `WpdsThemeProvider` relocated kernel → `engines/core-default/` in PR-#49 Stage 4; `compileStyles` + wpds-defaults snapshot moved to core-default in P1.
- Per-app docs contract (`app.json#documentation` + sibling `app.md`) introduced 2026-05-13.
- Master spec dated 2026-05-01 (URL-routing refined 2026-05-04). App-validation audit 2026-05-04 (v2-era). App-level CSS hex-color audit 2026-05-06. Lint clean baseline 2026-05-07.

### Removed (relative to earlier pre-release builds)

- WPDS theming fallback path removed at v2.0.0-beta.2 — sites without a Gutenberg + WPDS engine now render empty rather than falling back to a kernel-injected WPDS provider.

### Deprecated (shims live one release cycle; removed in v3.1)

- `useScreenView` / `useViewConfig` JS hooks → re-export from `useDataView` with one-shot dev `console.warn`.
- `hydrateInlineScreenView` → alias of `hydrateInline`.
- REST `/wp-admin-shell/v1/screen-view` → aliases `/data-view` with `X-WP-Deprecated` header.
- Filter `wp_admin_shell_view_config_{kind}_{name}[_{variant}]` → fires alongside `wp_admin_shell_data_view_config_*` with `_deprecated_hook` notice.
- `wp_admin_shell_register_field_collection()` → wrapper over `wp_admin_shell_register_data_field_collection()`; `_doing_it_wrong` under `WP_DEBUG`.
- admin.json `viewConfigs` block → `_doing_it_wrong` via `warn_legacy_view_configs()` (priority 999).
- admin.json `dashboardWidgets` block → folded into `screens[dashboard-widgets].apps[]` at resolve time with `_doing_it_wrong` under `WP_DEBUG`; `composeWidgets.mjs` retained for these legacy shells.
- `userCustomizable` → read for one cycle alongside `customizable`.
- Option `wp_admin_shell_active_config` (MVP) → resolver reads `wp_admin_shell_active_shell` first, falls back to legacy key.
- App-level `contentWidth` / `preview` config keys → still honored as a decoration escape hatch; new shells use the v3 multi-app `screens[id].apps[]` shape.

### Known gaps

- `core:desktop-iframe` command-palette harvest (chromeless-bridge sub-system 11) ships as a stub — the parent palette consumer isn't wired yet.
- No JSDOM mount test for the React kernel (`<Region>` / `<ThemeProviderHost>`); full component render is a manual browser pass. Tracked in issue #30.
- `@wordpress/components` `Modal` overlays (DataViews `RenderModal`, bulk-confirm) inherit root theme on bg + color — not covered by the `RegionThemedSubtree` seam. Logged in `docs/feedback.md`.

## [1.0.0-beta.1] — 2026-04-30

First v1 cut. Branch: `feat/wp-admin-shell-v1`. Five-milestone plan landed (M1 kernel rebuild → M2 cascade → M3 tokens → M4 apps → M5 ship).

### Added

- **Kernel** (M1). Registry-driven mount under `src/runtime/`. `core:site-editor-layout` engine. Six built-in region sources (sidebar / toolbar / content / preview / overlay / drawer). Hash router with `useRoute()`. Selection bus + REST endpoint at `/wp-admin-shell/v1/selection[/{scope}]`. Slot registry. System apps: `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-{banner,snackbar}`. `normalizeV0()` shim accepts MVP flat configs.
- **Cascade resolver** (M2). PHP `WP_Admin_Shell_Resolver` two-phase pipeline (trusted core/plugin via `merge_authoritative`, consumer site/role/user via plain `merge` + `userCustomizable` filter). `WP_Admin_Shell_Config` accessor. Two-layer cache (object cache + transient) with hash-based invalidation. Per-origin filters `wp_admin_shell_data_{origin}` + final `wp_admin_shell_data`. Per-role / per-user shell selection with `userSwitchable` gating.
- **Token system** (M3). `compileStyles` → three CSS-variable families (WPDS surface `--wpds-*`, chrome extensions `--wp-admin-shell--chrome--*`, compat bridge `--wp-admin-theme-color`). Within-doc DTCG aliases (`{styles.path}`). Density attribute writer. Pinned WPDS 6.9 baseline at `src/runtime/styles/wpds-defaults/6.9.json` (140 slots). CI parity test (`npm run test:parity`). Tokens emit at `:root` so portal-mounted UI inherits theming.
- **Core apps** (M4). `core:users` (DataViews, bulk delete with reassign). `core:comments` (DataViews, approve/unapprove/spam/trash). `core:settings` composable host (REST-bounded native panels: general/writing/reading/discussion partial; iframed: permalinks/media/privacy). `core:site-editor` iframe-backed adapter (native mount deferred to v2). Notices via `@wordpress/notices`. App-level slots: render (`core:app.before/.after`, `core:editor.sidebar`) + data (`core:posts.row-actions`, `core:users.row-actions`, `core:comments.row-actions`, `core:settings.panels`).
- **Permissions, prefs, ship** (M5). Four-layer capability gating (region fast-path → app gate → source-cap floor → REST observation). Recursive nav prune. `core:appearance` user-prefs UI (density / accent / default-route). Shell-switching plumbing via `window.wpAdminShell.switchShell(slug)` (no UI surface; v2 surfaces it). `wp admin-shell list | activate | register | upgrade-config` WP-CLI commands. `/wp-admin-shell/v1/can/{cap}` REST. `/wp-admin-shell/v1/user-prefs` REST. `docs/schemas/admin-v1.json` JSON Schema. `Requires Plugins: gutenberg` plugin header + admin notice.

### Changed

- Plugin version bumped to `1.0.0-beta.1` (internal/pre-release only — later renumbered to `0.1.0` for the first public-testing cut; the shipped header, `WP_ADMIN_SHELL_VERSION`, and `package.json` all read `0.1.0`).
- MVP `wp_admin_shell_active_config` option migrates to `wp_admin_shell_active_shell`. Reads check the new key first, fall back to the legacy key for one minor cycle.
- `src/shell/*`, `src/routing/*`, `src/commands/*`, `src/config/*` retired. Surviving presentational helpers relocated to `src/runtime/apps/_components/` and `src/runtime/config/iconMap.js`.
- `docs/wp-admin-shell-mvp-spec.md` archived to `docs/archive/`.
- Bundle: 371 KiB minified JS (under the 408 KiB ship target).

### Fixed

- Settings page form save no longer fatals on PHP 8.1+. Legacy `wp_admin_shell_active_config` removed from the page-form option group; `sanitize_file_name` wrapped in a NULL guard.
- Tokens reach `@wordpress/commands` palette portal after the `:root` scope move (was `#wp-admin-shell`-scoped, leaving portaled UI on WordPress defaults).

### Removed

- v0 shell-switcher dropdown from the toolbar (spec §6.4.1: switching is option-write + reload only in v1).
- `src/runtime/apps/NoticesStubApp.js` (M4 real implementation backed by `@wordpress/notices`).

### Deferred

- Native `@wordpress/edit-site` embedding (v2; M4 risk mitigation cut).
- `tokens.json` primitives layer (v2; spec §4.0.5).
- `plugin:{slug}` source registry (v2).
- Layout engines beyond `core:site-editor-layout` (v2 tiling, v3 floating).
- `core:dashboard`, `core:plugins` native (v2).
- Multi-routable regions (v2).
- Shell-switcher UI surface (v2).
- Drop-in replacement of `/wp-admin/*` URL interception (v3).
- Mobile layout adaptation, i18n for shell-config strings (v3).
