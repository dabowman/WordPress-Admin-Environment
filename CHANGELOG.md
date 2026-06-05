# Changelog

All notable changes to WP Admin Workspaces. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

> **Status:** Pre-release. Nothing has shipped publicly; there is no installed base. The canonical architecture lives in `CLAUDE.md` + `docs/`. This file records how the codebase reached its current shape — migration history, deprecation windows, and provenance that `CLAUDE.md` deliberately omits to stay canonical.

## [Unreleased]

### core:default engine hygiene (issue #69 items 2/3/4/6)

Follow-up to the 2026-05-27 engine review (items 1 + 5 resolved earlier). Class names below use the current `wp-admin-workspaces-*` prefix.

- **Role-based region slotting (item 4).** `engines/core-default/Layout.js` no longer slots well-known regions by literal id. The pure `slotRegions.mjs` helper now dispatches by **role** with the id as a tiebreaker (toolbar←`banner`, sidebar←`navigation`, content←`main`, detail←`complementary`; `preview` stays id-only since the engine ships no `core:preview` template), honoring the engine's `specializes-roles`. A workspace that names its main region something other than `content` (role `main`) now lands in the content slot instead of the straggler bucket. Side effect: the `detail` region — whose `core:detail` template carries `core:dismiss-on`, so the old `getRegionKind` path bucketed it as a bottom-of-layout "drawer" — is now correctly placed in the content (`areas`) row next to content (still collapsed via `data-app-mounted="false"` when no mirror app is mounted).
- **Real `core:dashboard-grid` mount point (item 2).** A region templated `core:dashboard-grid` (`platform.core:dynamic-children: true`) now renders **inside the content row** rather than falling to stragglers after `__body`. Other non-slotted chrome regions (the notices banners) still render as layout-root stragglers.
- **Removed dead `data-mode-minimal` CSS (item 3).** No mode in the `core:default` catalog (`default`/`focus`/`takeover`/`modal`) emits `minimal: true`, so the `.wp-admin-workspaces-region--toolbar[data-mode-minimal]` rule in `index.css` had no producer. Rule removed; the `minimal` row dropped from the region-state vocabulary table in `docs/core-default-engine.md`.
- **Documented the chrome→WPDS bridge asymmetry (item 6).** `docs/core-default-engine.md` now spells out that `CHROME_WPDS_BINDINGS` covers `canvas`/`sidebar`/`toolbar`/`site-hub` only — `chrome.content.*` is consumed by templates/CSS (card background/radius/inset) but is intentionally **not** WPDS-bridged (content = neutral card surface), so authoring it won't re-theme `@wordpress/ui` inside the content card.
- **Test.** `tests/runtime/core-default-slot-regions.test.mjs` pins role+id dispatch, the modal→overlay split, the dashboard-grid→body-row mount, the preview id-only fallback, and malformed-input safety. Chained into `npm run test:runtime`.

### Renamed: "WP Admin Shell" → "WP Admin Workspaces" (0.1.0 rebrand)

The product, plugin, and every author/user-facing surface unified under
**workspaces**. Vocabulary, the dissolved-block shape, and the prefix map are
canonical in `docs/vocabulary-spec.md`.

- **BREAKING — public extension surfaces renamed with no back-compat shims**
  (acceptable for pre-release; no installed base). Third-party integrations
  must update:
  - Hooks: `wp_admin_shell_data` / `wp_admin_shell_data_{origin}` /
    `wp_admin_shell_cache_signals` / … → `wp_admin_workspaces_*`.
  - Functions: `wp_admin_shell_register_app` / `_engine` / `_template` /
    `_menu_item` / `_dashboard_widget` / `_menu_renderer` → `wp_admin_workspaces_*`;
    `register_shell` → `wp_admin_workspaces_register_workspace`;
    `register_admin_route` → `wp_admin_workspaces_register_route`.
  - REST namespace `wp-admin-shell/v1` → `wp-admin-workspaces/v1` (old routes
    404 — bundled JS updated in lockstep).
  - JS global `window.wpAdminShell` → `window.wpAdminWorkspaces`
    (incl. `registerMenuRenderer`, `switchShell` → `switchWorkspace`).
  - CSS prefixes `.wp-admin-shell-*` / `--wp-admin-shell--*`, the
    `#wp-admin-shell` mount id, PHP classes `WP_Admin_Shell_*`, and the text
    domain / slug `wp-admin-shell` → `wp-admin-workspaces`.
- **Config + schema files**: `wp-content/admin.json` → `wp-content/workspace.json`;
  `docs/schemas/admin{,-app,-engine}.json` → `workspace{,-app,-engine}.json`;
  bundled `shells/` → `workspaces/`. WP-CLI `wp admin-shell` → `wp admin-workspace`.
- **Shape**: the inner `workspace` block is dissolved — `engine` /
  `default-screen` are now top-level fields and `branding` / `notices` /
  `widgets` move under a new `frame` block (distinct from `styles.chrome`,
  which paints it). `required` becomes `[version, $wpds, name, engine, screens]`.
- **Persisted-option migration (on upgrade, idempotent, db_version 2)**:
  legacy `wp_admin_shell_*` options are copied forward to their
  `wp_admin_workspaces_*` names — `active_shell` → `active_workspace`,
  `workspace_enabled` → `enabled`, plus `settings` / `site_config` /
  `role_config` and the `user_prefs` user-meta key. Without this an upgraded
  install would silently lose its active-workspace selection and re-enable a
  deliberately-disabled admin takeover. `uninstall.php` sweeps both namespaces.

### Gutenberg dependency version-gated (WordPress 7.0)

The hard Gutenberg requirement is now conditional on the WordPress version. The dependency was never about Gutenberg features — it was about the `wp-private-apis` allowlist: `@wordpress/ui` overlay components transitively opt into private APIs via `__dangerousOptInToUnstableAPIsOnlyForCoreModules`, and WordPress 6.7–6.9 core's allowlist excludes `@wordpress/theme` / `@wordpress/ui` / `@wordpress/dataviews`, so only the Gutenberg plugin's override unlocked them.

Verified against the WordPress 7.0 release source: core now bundles `@wordpress/theme` (`wp-includes/assets/script-loader-packages.php`) **and** ships a `wp-private-apis` allowlist (`wp-includes/js/dist/private-apis.js` → `CORE_MODULES_USING_PRIVATE_APIS`) that includes `@wordpress/theme`, `@wordpress/ui`, and `@wordpress/dataviews`. The opt-in consent string is byte-identical to the one the shell hardcodes, so the existing `WpdsThemeProvider` unlock works against core 7.0 with no change.

- `wp_admin_shell_dependencies_met()` now returns true on WordPress ≥ 7.0 (new `wp_admin_shell_core_supplies_private_apis()` helper) before falling back to the `GUTENBERG_VERSION` / `is_plugin_active()` checks. Flows through to both consumers — the `admin_notices` warning and the `WP_Admin_Shell_Hijack` stand-down.
- Removed the static `Requires Plugins: gutenberg` plugin header (and the `readme.txt` equivalent). The header is a hard activation gate on WP 6.7+ with no way to express "only when WordPress < 7.0", so keeping it would block activation on a 7.0-without-Gutenberg site and defeat the gate. The runtime guard already covers every version gracefully (notice + classic stand-down when unmet).
- Admin-notice copy + README / readme.txt / CLAUDE.md updated to "WordPress 7.0+ **or** the Gutenberg plugin".
- Scope note: core 7.0 does **not** externalize `wp-ui` / `wp-admin-ui` / `wp-dataviews` as script handles, so this plugin keeps bundling `@wordpress/ui` and `@wordpress/dataviews` (unchanged).
- **Validated on a live WP 7.0 install with the Gutenberg plugin deactivated** — the shell and `@wordpress/ui` overlays render correctly, confirming the bundled `@wordpress/ui@0.12` private-API opt-in succeeds against core 7.0's own `wp.privateApis` (no version-skew `Cannot unlock`). Automated CI can't render JS; the gate's PHP version logic is covered by `tests/php/run-alpha-routing-tests.php`, and the `wp-env` CI job exercises the resolved doc on a Gutenberg-free 7.0 container.

### Plugins screen: fix 404 on activate/deactivate/delete of folder-based plugins

`src/apps/plugins/index.js` built the REST path with `encodeURIComponent( item.plugin )`, turning a folder-based plugin id like `gutenberg/gutenberg` into `gutenberg%2Fgutenberg`. The `wp/v2/plugins` route matches a **literal** slash (`[^.\/]+(?:\/[^.\/]+)?`), so the encoded `%2F` 404s (rejected by the route and by web servers with `AllowEncodedSlashes Off`). Single-file plugins have no slash and worked, masking the bug. New `restPluginId()` helper encodes per path segment, preserving the literal slash; applied to both the status (POST) and delete (DELETE) call sites. Surfaced while deactivating Gutenberg to validate the 7.0 gate.

---

The **wave-2** integration (PR #243): the DataViews interaction-pattern library, the six entity-CRUD apps rebuilt on top of it, and nav / settings / editor / dashboard / appearance parity. Built as ~25 bot-reviewed sub-PRs squash-merged through the `wave-2` branch.

### DataViews interaction-pattern library (shared)

A shared substrate so every list/detail app builds against one set of components and two contracts (`docs/dataviews-interaction-patterns.md` / `docs/no-api-fallback-pattern.md` / `docs/runtime-harvest-pattern.md`) rather than a bespoke modal per app — all in `src/apps/_shared/`:

- `EntityFormModal` (Modal Edit/Create), `BulkEditModal` (apply-N-fields-to-M-rows with a `— No change —` sentinel + self-exclusion `filterItems`), `buildQueryArgs` (declarative DataViews-view → REST query mapper), `ViewTabs` (pinned filter-segment strip with live counts via `useEntityElementCounts`), `UnavailableViaApi` (tiered classic-screen / `wp option update` / agent-prompt fallback for no-REST capabilities), and the shared `useEntityAutosave` hook.
- DataViews already wraps a `RenderModal` action in its own `<Modal>`; `EntityFormModal`/`BulkEditModal` were corrected to the bare-`<Stack>` contract of `createBulkConfirmModal` (they were double-wrapping → doubled scrim/header/focus-trap).

### Entity-CRUD app rebuilds

The six list apps rebuilt against the shared library:

- **Posts** (#107 / #111 / #132) — Bulk Edit, status/Mine/Sticky filter tabs, date/category/format filters, post-type-support gating (Sticky/format/categories hidden on Pages).
- **Comments** (#113 / #112 / #114 / #111) — status verbs (unspam → approved, restore, delete-permanent), enriched author column (avatar / mailto / URL / IP), Reply + Quick/full Edit modals, status filter tabs.
- **Users** (#110 / #112 / #122) — self-demote-guarded "Change role" bulk action, avatar/email/translated-role cell, native `core:user-new` **Add New User** app replacing `iframe:user-new.php` (CSPRNG-generated password); `core:profile` now honors `config.userId` so Edit targets the right user instead of the acting user; working "View posts" author scope.
- **Taxonomy** (#115 / #116) — hierarchical parent picker + depth-first tree rendering (gated to the default name-asc first page when the whole tree fits on one page; flat otherwise), default-category delete protection.
- **Media** (#109 / #132) — full DataViews grid+table rewrite + host-agnostic `MediaDetails` editor, bulk delete, upload toolbar, date/author/type filters; net-new `root/media/_default` dataView.
- **Plugins** (#126) — install-by-slug header action + zip-upload `UnavailableViaApi` fallback.

### Runtime-harvest: nav + chrome (#127 / #128 / #129)

- **Classic-menu bridge** now carries the numeric `position`, nests core-parented plugin submenus under the real shell parent (Tools / Settings) instead of the generic `ingested` bucket, and harvests data-URI / image menu icons via an `iconSource` descriptor.
- **Admin-bar + admin-notices harvest** — `WP_Admin_Shell_Chrome_Harvest` instantiates `WP_Admin_Bar` + buffers `admin_notices` at `wp_admin_shell_data_plugin` priority 6 (skip-core filter `wp_admin_shell_admin_bar_core_node_ids`; detaches the core notice hooks after capture so admin-header.php's later pass doesn't double-dispatch side effects), rendered by `core:toolbar-actions` / `core:notices-banner` (global-`admin_notices`-only limitation documented).
- **Dynamic `+New`** enumerated from creatable post types via `getPostTypes` + `canUser('create')` (internal-type denylist: `wp_block` / `wp_navigation` / `wp_template` / …).
- **Arbitrary-icon escape hatch** (`src/apps/_shared/icons/ArbitraryIcon.js`) renders harvested data-URI / image / trusted-HTML titles engine-side; the kernel icon registry (`src/runtime/config/iconMap.js`) stays name-based + DS-neutral.

### Settings (#117 / #118)

- Native **Media** settings panel + `register_setting( show_in_rest )` for the 8 image-size / uploads options.
- Full **Discussion** shims (boolean `'1'`/`''` round-trip, enum schemas, integer clamps) — the schema `minimum` is dropped where a `sanitize_callback` clamps, since the REST controller validates-then-sanitizes and a schema floor would 400 a sub-floor write before the clamp runs.
- Legacy **Writing** options (`mailserver_*`, `ping_sites`, `default_link_category`, `use_balanceTags`) surfaced via `UnavailableViaApi` instead of a dead-end notice (`mailserver_pass` deliberately kept out of REST).

### Editor (#119)

Native document-settings sidebar for `core:simple-editor`, rendered as a `<Fill>` into the `core:editor.sidebar` Slot (plugins can fill it too) — Status/Visibility, Publish/Schedule, Slug, Categories/Tags, Excerpt, Featured image, Author (cap-gated), Discussion; each mutating the post entity via buffered `edit()`. Extracted the shared `useEntityAutosave` hook (folding in the #210 CPT `rest_base` derivation). Taxonomy entities keyed by slug; password-visibility persisted in local state; site-local `date` round-trip; non-content metadata edits don't flash "Auto-saved".

### Dashboard (#133 / #134)

- **Folded the dashboard monolith into `core:dashboard-host`** with a bundled default tile set (At-a-Glance, Activity, author-scoped Recent Drafts, Quick Draft; greeting → host chrome). Count tiles use `view`-context queries under the `read` cap floor so read-only users see real counts; Recent Drafts is author-scoped fail-closed (`enabled: !! userId`).
- **Classic dashboard-widget bridge** (#134) — `WP_Admin_Shell_Dashboard_Bridge` harvests un-ported plugin dashboard widgets (skip-core filter `wp_admin_shell_dashboard_core_widget_ids`) into host tiles, fed by a lazy `GET /wp-admin-shell/v1/dashboard-widget/{id}` controller that `ob_start`-captures the widget callback HTML, with a classic-dashboard iframe fallback. The harvest + REST paths force the `dashboard` screen context around `wp_dashboard_setup()` (and restore it) so `wp_add_dashboard_widget()` files boxes under `$wp_meta_boxes['dashboard']` instead of the shell/REST screen.

### Native Menus editor (#120)

Native Appearance → Menus editor (Option B — no drag-and-drop) over the `menus` / `menu-items` / `menu-locations` REST entities: create/edit menus, add custom-link / post / term items, explicit Up/Down/Indent/Outdent reorder + numeric order field, theme-location assignment. Block-theme-aware (consumes the `workspace.theme-support` signal — disables on block themes) with a reachable theme-agnostic "Menus (Classic)" iframe escape hatch. Reorder / delete / location handlers surface REST errors via `getLastEntitySaveError` / `getLastEntityDeleteError` (the core-data mutations resolve rather than throw on failure) instead of failing silently with a false success.

### Appearance lane (issue #121)

- **Renamed `core:appearance` → `core:appearance-preferences`.** The app is the per-user personalization panel (density / accent / default-route), not the wp-admin Appearance hub. The rename frees the "Appearance" section name and fixes the app's orphaned screen wiring: it previously bound to the Appearance group menu node (which has `items` and therefore renders as a drilldown container, never navigating to its own href), so it was reachable only by typing `/appearance`. It now binds the `appearance-preferences` screen (path `/appearance-preferences`, cap `read`) surfaced under **Settings → Appearance Preferences**, and the `appearance` group node carries its own explicit label/icon. No back-compat (unshipped). Updated everywhere: `src/apps/appearance-preferences/` (dir + `app.json` id + `app.md`), `src/runtime/registry/builtins.js`, `src/runtime/shell-switching.js`, `includes/class-wp-admin-shell-prefs-rest.php`, `shells/wp-admin-default.json`, `src/apps/site-editor/*` (collision references), `docs/code-map.md`.
- **Appearance-menu prune by theme support.** New `WP_Admin_Shell_Appearance_Menu` (`includes/cascade/`) runs on `wp_admin_shell_data` at priority 4 (before `bind_screens`). It reads `wp_is_block_theme()` + `current_theme_supports()` and prunes the Appearance group to match the active theme: block themes keep the Site Editor and drop Customize / Widgets / classic Menus; classic themes keep Customize / Widgets / Menus (+ Custom Background / Header only when `add_theme_support()`ed) and drop the Site Editor. Dropped screens are removed from both `screens` and the `menu` tree. The pass stamps a reusable **block-theme signal** at `workspace.theme-support` (`block-theme` bool + `theme-supports` map) that issue #120 (native classic Menus) consumes. Schema documents the synthetic read-only block; tests in `tests/php/run-appearance-menu-tests.php`.

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

- **Editor stuck on a permanent spinner (edit).** The `wp-admin-default` post-edit and page-edit screens passed the captured post id into `config.postId`, but `core:editor` reads `config.id`. Since `interpolate()` only carries the keys the screen `config` declares (and the app's `config-schema` is never enforced at mount), `config.id` was `undefined` → `Number(undefined)` is `NaN` → the `! postId` loading guard never cleared, so editing any post or page showed a spinner forever with no error. Aligned both screens to `"id": "{id}"` (matching `single-pane-demo.json`, which was already correct), declared `id` in the editor's `config-schema`, and corrected the `app.json`/`app.md` references that wrongly named the key `postId`. Codified the route-config-key-must-match-what-the-app-reads trap in `CLAUDE.md`.
- **Editor stuck on a permanent spinner (add-new).** The add-new screens (`/posts/new`, `/pages/new`) route to `core:editor` with no `config.id`, but `EditorApp` only entered the draft-creation flow when `config.id === 'new'` — so `config.id` undefined meant `isNew` was false, no draft was created, `postId` was `NaN`, and the same silent spinner appeared. Brought `EditorApp` in line with the already-fixed `SimpleEditorApp`: `isNew` now also treats `undefined`/`''` as the create flow, and after creating the draft the URL is rewritten to the canonical edit route `#/{posts|pages}/{id}/edit` (was a non-canonical `#/editor/{postType}/{id}` that matched no route in the bundled shells and broke on refresh).

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
- JSDOM mount test for the React kernel (`<Region>` / `<ThemeProviderHost>`) is **partially** closed (issue #30). `tests/runtime/kernel-smoke.test.mjs` now pins the reader-level decisions the bug class targets — landing-screen → mounted app (`matchRoute( routes, default-route )`), nav prune ≥ 1, command-palette "Go to <screen>" entries, and the JS-side capability role matrix (mirrors `run-cap-gating-smoke.php`) — using the same pure modules the kernel + apps import. Still open: a literal React-DOM mount asserting `kernel(config)` renders without throwing + token emission reaching the DOM through the engine's `ThemeProvider` (token→CSS-string already pinned by `theme-provider-host.test.mjs`). That half needs `react`/`jsdom` devDeps + an importer-rewrite loader for the `@wordpress/*` externals, neither present in the plain-`node` CI today.
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
