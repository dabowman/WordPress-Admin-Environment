# Changelog

All notable changes to WP Admin Shell. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1] — 2026-04-30

First v1 cut. Branch: `feat/wp-admin-shell-v1`. Five-milestone plan landed (M1 kernel rebuild → M2 cascade → M3 tokens → M4 apps → M5 ship).

### Added

- **Kernel** (M1). Registry-driven mount under `src/runtime/`. `core:site-editor-layout` engine. Six built-in region sources (sidebar / toolbar / content / preview / overlay / drawer). Hash router with `useRoute()`. Selection bus + REST endpoint at `/wp-admin-shell/v1/selection[/{scope}]`. Slot registry. System apps: `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-{banner,snackbar}`. `normalizeV0()` shim accepts MVP flat configs.
- **Cascade resolver** (M2). PHP `WP_Admin_Shell_Resolver` two-phase pipeline (trusted core/plugin via `merge_authoritative`, consumer site/role/user via plain `merge` + `userCustomizable` filter). `WP_Admin_Shell_Config` accessor. Two-layer cache (object cache + transient) with hash-based invalidation. Per-origin filters `wp_admin_shell_data_{origin}` + final `wp_admin_shell_data`. Per-role / per-user shell selection with `userSwitchable` gating.
- **Token system** (M3). `compileStyles` → three CSS-variable families (WPDS surface `--wpds-*`, chrome extensions `--wp-admin-shell--chrome--*`, compat bridge `--wp-admin-theme-color`). Within-doc DTCG aliases (`{styles.path}`). Density attribute writer. Pinned WPDS 6.9 baseline at `src/runtime/styles/wpds-defaults/6.9.json` (140 slots). CI parity test (`npm run test:parity`). Tokens emit at `:root` so portal-mounted UI inherits theming.
- **Core apps** (M4). `core:users` (DataViews, bulk delete with reassign). `core:comments` (DataViews, approve/unapprove/spam/trash). `core:settings` composable host (REST-bounded native panels: general/writing/reading/discussion partial; iframed: permalinks/media/privacy). `core:site-editor` iframe-backed adapter (native mount deferred to v2). Notices via `@wordpress/notices`. App-level slots: render (`core:app.before/.after`, `core:editor.sidebar`) + data (`core:posts.row-actions`, `core:users.row-actions`, `core:comments.row-actions`, `core:settings.panels`).
- **Permissions, prefs, ship** (M5). Four-layer capability gating (region fast-path → app gate → source-cap floor → REST observation). Recursive nav prune. `core:appearance` user-prefs UI (density / accent / default-route). Shell-switching plumbing via `window.wpAdminShell.switchShell(slug)` (no UI surface; v2 surfaces it). `wp admin-shell list | activate | register | upgrade-config` WP-CLI commands. `/wp-admin-shell/v1/can/{cap}` REST. `/wp-admin-shell/v1/user-prefs` REST. `docs/schemas/admin-v1.json` JSON Schema. `Requires Plugins: gutenberg` plugin header + admin notice.

### Changed

- Plugin version bumped to `1.0.0-beta.1`.
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
