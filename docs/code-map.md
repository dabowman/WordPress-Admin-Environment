# Code map

File-by-file reference for the WP Admin Shell tree. `CLAUDE.md` carries
the skeletal top-level layout + the rules; this doc is the annotated
detail. Keep both in sync when files move.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── shells/                  # Bundled admin.json configurations (workspace/screens/menu shape)
│   ├── wp-admin-default.json     # DEFAULT install shell — wp-admin mirror w/ capability-gated screens + iframe-fallback screens
│   ├── developer-admin.json      # Demo: native apps (users / comments / settings / site-editor) + drill-down menu containers
│   ├── content-author.json       # Demo: minimal writer shell (collapsed nav)
│   ├── client-portal.json        # Demo: branded shell (logo, red accent, scoped nav)
│   ├── canonical-demo.json       # Demo: canonical admin.json shape on core:default
│   ├── single-pane-demo.json     # Demo: core:single-pane engine
│   └── desktop-demo.json         # Demo: core:desktop engine
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP
│   ├── class-wp-admin-shell-config.php           # Read-only wrapper around merged tree
│   ├── class-wp-admin-shell-can-rest.php         # /wp-admin-shell/v1/can/{cap}
│   ├── class-wp-admin-shell-prefs-rest.php       # /wp-admin-shell/v1/user-prefs
│   ├── class-wp-admin-shell-data-view-rest.php   # /wp-admin-shell/v1/data-view + /data-view/variants
│   ├── class-wp-admin-shell-data-field-collections-rest.php # /wp-admin-shell/v1/field-collections (reads settings.dataFields)
│   ├── class-wp-admin-shell-cli.php              # `wp admin-shell …` commands
│   ├── cascade/                                  # Cascade resolver
│   │   ├── class-wp-admin-shell-resolver.php     # Multi-origin merge + load_origins; null-tombstone aware
│   │   ├── class-wp-admin-shell-merge.php        # merge_authoritative + plain merge w/ tombstones
│   │   ├── class-wp-admin-shell-customizable.php # `customizable` filter (default-deny)
│   │   ├── class-wp-admin-shell-cache.php        # WP_Object_Cache + transient w/ hash keying
│   │   ├── class-wp-admin-shell-config-validator.php  # configSchema cache
│   │   ├── class-wp-admin-shell-classic-menu-bridge.php # Classic wp-admin menu bridge: walks $GLOBALS['menu']/['submenu'] at wp_admin_shell_data_plugin priority 6 → synthesizes screens[ingested-<slug>] + menu.ingested.items[]. Filter `wp_admin_shell_classic_menu_core_slugs` extends skip list.
│   │   ├── class-wp-admin-shell-modes.php        # engine modes catalog resolver + `extends` chain (depth 10, cycle-safe) + plugin-contributed modes via `wp_admin_shell_engine_modes_{engineId}` filter
│   │   ├── class-wp-admin-shell-permissions.php  # permissions resolver: OR-semantic capabilities + roles, super-admin magic, trust-tier cascade (core/engine/plugin/site may add/remove; role/user may only remove)
│   │   ├── class-wp-admin-shell-data-field-collections.php # data-field-collections registry + cascade contribution
│   │   ├── class-wp-admin-shell-data-view-config.php  # 3-axis data-view-config resolver: `(kind, name, variant|_default)` lookup + extends chain + ref-wins-inline merge + per-base + per-variant filter machinery
│   │   ├── class-wp-admin-shell-preload.php      # REST preload: collect across origins + dedupe + hydrate via rest_preload_api_request + emit on wp-api-fetch
│   │   ├── class-wp-admin-shell-menu-items.php   # menu-item registration: nav-region resolver + cascade contribution
│   │   └── class-wp-admin-shell-admin-routes.php # admin-route registration: cascade contribution
│   └── origins/
│       └── class-wp-admin-shell-origin-core.php  # empty baseline + chrome defaults
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminShell.config) and mounts result
│   ├── index.css            # Bootstrap CSS only — body positioning, defensive Stack rule, chrome anchor/svg color overrides, cap-gate fallback. Engine + per-app CSS lives with the engine/app it belongs to.
│   ├── runtime/             # Kernel — registry-driven
│   │   ├── kernel.js        # Top-level mount: registry + normalizer + engine + region resolution
│   │   ├── kernel-context.js  # KernelProvider exposing { registry, config } to all sources
│   │   ├── registry/
│   │   │   ├── createRegistry.js   # Kind-checked registry (app | engine), dup-rejection. Eager `{ Component }` + lazy `{ load: () => Promise }` app shapes; `resolveComponent(id)` returns a per-id cached Promise fed into `React.lazy()`; `invalidateComponent(id)` clears the cache so retry re-fires a failed `load()`. Descriptor never mutated after register — `Component XOR load` holds for life. Engines eager-only.
│   │   │   ├── builtins.js         # Imperative registration of every core:* source. Lazy by default; the five always-mounted chrome apps (navigation, site-hub, toolbar-actions, notices-banner, notices-snackbar) stay eager.
│   │   │   └── source-types.js     # JSDoc typedefs for SourceProps (no runtime)
│   │   ├── engines/                # Per-engine modules. Each ships index.js (EngineSource def + side-effect imports index.css), Layout.js, engine.json (manifest w/ region templates + default-style CSS), index.css (engine-specific layout idiom CSS).
│   │   │   ├── core-default/        # Flagship: dark chrome + elevated cards (toolbar/sidebar/content/preview). Ships WpdsThemeProvider.js + compileStyles.mjs + wpds-defaults snapshot.
│   │   │   ├── core-single-pane/    # Mobile-first: appbar + collapsible nav drawer. Reuses core-default's WpdsThemeProvider via sibling import.
│   │   │   └── core-desktop/        # Windowed engine. Adds windowing/ subdir (TS): WindowManager state class + WindowManagerContext + hooks. icons.js + Layout.js + index.css mirror sibling engines; Layout wraps tree in WindowManagerProvider.
│   │   ├── regions/                # Single declaration-driven renderer
│   │   │   ├── Region.js           # Generic <Region>: GenericRegion → ModalRegion (backdrop + focus trap + ARIA modal + dismiss + autofocus) or PersistentRegion (landmark) composed from platform services. Recursive cap fast-path. Renders `region.regions` children with id `parent/child` (spec §5.5).
│   │   │   ├── regionKind.js       # Derives bucket (persistent | overlay | drawer) from platformServices.placement(region).
│   │   │   ├── platformServices.mjs # Pure-ESM spec §5.3 accessors (isModal, dismissTriggers, autofocusSelector, persistsAcrossNavigation, isTriggerable, triggerShortcut, wantsDirtyState, blocksNavigationOnDirty, placement) — reads region.platform/role.
│   │   │   ├── resolveRegion.mjs   # Pure-ESM template merge (declaration, engine) → resolved region. Recursive child resolution with MAX_REGION_DEPTH=10 + visited-templates set.
│   │   │   ├── validateRegion.mjs  # validateRegion + sanitizeRegion enforce `app` xor `routing.route-key` (spec §5.4). Kernel logs violation + drops `app` so URL routing wins.
│   │   │   └── mountApp.js         # Shared <MountedApp> resolver: appRef → registry → render. Eager apps render directly (no Suspense/boundary — render errors propagate honestly); lazy apps wrap in `<AppErrorBoundary>` + `<Suspense fallback={<AppLoading/>}>` via `React.lazy()` memoized in a per-id `lazyAppCache`. The boundary's `isChunkLoadError()` only catches load failures (`ChunkLoadError`, `Loading chunk …`, `createRegistry: load() …`) — render crashes re-throw with their real stack. Retry calls `registry.invalidateComponent(id)` + clears the lazy cache.
│   │   ├── routing/                # URL-decomposer router, routes-block matcher
│   │   │   ├── router.js           # RouterProvider (hashchange + Navigation API navigatesuccess), useRoute, useRouteForRegion(region, routesBlock), navigate(href).
│   │   │   ├── matchRoute.mjs      # Pure ESM: matchPattern, matchRoute (most-specific-wins), interpolate, parseHash, readSlot, isValidRoutePattern.
│   │   │   └── useRoute.js         # Re-export
│   │   ├── styles/                 # ThemeProviderHost (engine-pluggable seam) + themeScope.mjs (pure helpers — `pickDensity`, `hasThemeContent`, `scopedSelector`, `buildScopedDetailCss`, `THEME_SCOPE_ATTRIBUTE`/`THEME_SCOPE_DETAIL_ATTRIBUTE`). Host falls back to a neutral pass-through wrapper when an engine declines a `ThemeProvider`.
│   │   ├── capabilities/userCan.js # userCan() sync + checkCan() async via /can REST
│   │   ├── config/iconMap.js       # DS-neutral icon registry: registerIcons(table, {fallback}) + resolveIcon(name). Engines populate at module load.
│   │   ├── dataView/               # data-view-config + data-field-collections client (spec §13 #7-8)
│   │   │   ├── useDataView.js      # React hook overloaded: useDataView(screenId) OR useDataView({kind, name, variant}, {fallback}) → {config, isLoading}. Inline-snapshot fast path + /wp-admin-shell/v1/data-view REST fallback.
│   │   │   ├── hydrateInline.mjs   # Pure 3-axis triple hydrate: extends chain (cycle + depth-cap 10) + fieldsRef merge + inline screen overlay deep-merge. Mirror of WP_Admin_Shell_Data_View_Config::resolve_data_view_triple / resolve_screen_data_view.
│   │   │   └── mergeFields.mjs     # Pure ref-wins-inline-overrides field merge. Mirror of WP_Admin_Shell_Data_View_Config::merge_fields.
│   │   ├── modes/                  # engine modes (default/focus/takeover/modal + plugin-contributed)
│   │   │   ├── resolveMode.mjs     # Pure ESM: resolveMode(modesCatalog, modeName) → { regions: {…} } w/ extends chain (depth 10, cycle-safe). Mirror of WP_Admin_Shell_Modes::resolve.
│   │   │   └── useMode.js          # React hook: useMode(screenId) → { mode, regions }. Reads resolved engine modes from kernel context + active screen.mode.
│   │   └── shell-switching.js      # window.wpAdminShell.switchShell(slug) plumbing
│   └── apps/                # All shell-bundled apps (registered via builtins.js)
│       └── <id>/                           # one dir per app id; everything for the app lives here
│           ├── index.js                    #   React component (default export); imports './index.css' side-effect
│           ├── app.json                    #   manifest — includes `documentation` block (machine-readable rebuild contract)
│           ├── app.md                      #   prose docs — overview, architecture, rebuild guide, known limitations (parity gaps vs docs/screens/*.md)
│           ├── index.css                   #   app-specific structural CSS (optional)
│           └── (helpers/_components/)      #   single-app-only helpers colocate with their consumer
├── tests/
│   ├── php/                 # wp eval-file fixture suites
│   ├── parity/              # node: WPDS slot-drift detector
│   ├── runtime/             # node: pure-ESM runtime modules (resolveRegion / validateRegion / …)
│   ├── schema/              # node: Ajv sweeps over shells + manifests
│   └── engines/             # TS engine tests; run via `node --experimental-strip-types`
├── scripts/snapshot-wpds.mjs   # Regenerate the engine's wpds-defaults/<wpds>.json snapshot
├── build/                   # webpack output (gitignored)
└── docs/                    # spec, schemas, readiness, perf-baseline, archive
```

**App-dir conventions.** Same shape as `engines/`. A `plugin:*` app dir
holds `app.json` + `index.js` + optional `index.css` (spec §13 #3).
Webpack picks up CSS through the dependency graph and tree-shakes unused
apps' CSS. Apps without CSS (command-palette, preview-pane, appearance)
skip `index.css`. `notices-banner` + `notices-snackbar` are independent
dirs. `navigation/index.js` bundles its drill-down helpers (Screen /
Item / Button + slide keyframes) into its own `index.css`; the Sidebar*
presentational helpers live under `navigation/_components/`.
`site-hub/SiteIcon.js` is a sibling of `site-hub/index.js`. Settings
sub-panels (SettingsDiscussionApp / Reading / Writing) live inside
`settings/` as siblings of the host (internal helpers, not registered
apps). Rule of thumb: a presentational helper used by exactly one app
belongs inside that app's dir; promote to a shared location only when a
second consumer appears.

## Application sources

| Source | Component | Native? | Cap floor | Notes |
|---|---|---|---|---|
| `core:posts` | PostsApp | ✅ | — | DataViews table; `config.postType`. dataView consumer on `(postType, <name>, variant)`. |
| `core:simple-editor` | SimpleEditorApp | ✅ | — | Substack-style; title + 9 blocks + auto-save. See notes below. |
| `core:editor` | EditorApp | iframe | — | `post.php?post={id}&action=edit`. Native `@wordpress/edit-post` mount not yet implemented — blockers in `SiteEditorApp.js`. |
| `core:media` | MediaApp | ✅ | — | Grid, upload, detail modal |
| `core:taxonomy` | TaxonomyApp | ✅ | — | DataViews + create/edit/delete terms. dataView consumer on `(taxonomy, <name>, variant)`; manifest baseline binds `(taxonomy, category)`. |
| `core:profile` | ProfileApp | ✅ | — | `useEntityRecord('root','user',userId)` |
| `core:users` | UsersApp | ✅ | `list_users` | DataViews + bulk delete with reassign + self-delete guard; dataView consumer on `(root, user, variant)`. |
| `core:comments` | CommentsApp | ✅ | `moderate_comments` | DataViews + approve/spam/trash via partial saveEntityRecord. dataView consumer on `(root, comment, variant)`. |
| `core:settings` | SettingsApp | partial | `manage_options` | Composable host; native general/writing/reading/discussion + iframed permalinks/media/privacy |
| `core:settings-general` | SettingsGeneralApp | ✅ | — | Standalone version of the General panel |
| `core:dashboard` | DashboardApp | ✅ | — | Site overview cards; recent posts/drafts/comments |
| `core:plugins` | PluginsApp | ✅ | `activate_plugins` | DataViews on `'root','plugin'`; activate/deactivate via REST. dataView consumer on `(root, plugin, variant)`. |
| `core:themes` | ThemesApp | ✅ | `switch_themes` | DataViews on `'root','theme'`. dataView consumer on `(root, theme, variant)`; grid default with screenshot tiles + Activate / Details. |
| `core:tools` | ToolsApp | ✅ | — | Linker cards to import/export/site-health |
| `core:site-health` | SiteHealthApp | ✅ | `view_site_health_checks` | `/wp-site-health/v1/tests/{id}` runner |
| `core:site-editor` | SiteEditorApp | iframe | `edit_theme_options` | `site-editor.php` adapter. Native `@wordpress/edit-site` mount not yet implemented; five blockers documented in `SiteEditorApp.js`. |
| `core:appearance` | AppearanceApp | ✅ | — | User-prefs UI driven by `customizable` |
| `core:iframe-fallback` | IframeApp | iframe | — | URL relative to `adminUrl`, chrome hidden via injected CSS |
| `core:navigation` … `core:user-menu` | system apps | — | — | `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu`. Each shell declares them explicitly in regions / workspace widgets. `core:command-palette` reads `commands[]` + synthesizes "Go to X" entries from `screens[id]` via `compileCommands.mjs`; palette names `core/admin-shell/palette-<encoded-id>` (first-write-wins dedup). |
| `core:dashboard-host` | DashboardHostApp | ✅ | — | Widget-grid controller. Reads `screens[id].apps[]` with `slot: "grid"`; uses app-declared `grid` slot from `app.json#slots`. Size/position from `slotHints` + per-entry overrides. Compiler `dashboard-host/composeScreenWidgets.mjs`; `wp_admin_shell_register_dashboard_widget()` contributes a `slot: "grid"` screen-app entry. Bundled mount: `/dashboard/home` in `developer-admin`. |
| `core:dashboard-widget-recent-posts` | … | ✅ | `edit_posts` | Example widget. Five most recent post drafts; click → `#/posts/{id}/edit`. |
| `core:dashboard-widget-quick-draft` | … | ✅ | `edit_posts` | Example widget. Title + textarea + Save Draft → `saveEntityRecord`, invalidate recent-drafts, navigate. Empty body seeds an empty paragraph block to satisfy WP's empty-post rejection. |
| Desktop engine apps | `core:desktop-{compositor,dock-app,window-frame,iframe}` | ✅ | — | See `docs/desktop-engine-readiness.md`. |

### `core:simple-editor` notes

- Substack-style minimal editor — title + content only. Featured image, taxonomy, excerpt, scheduling deferred to a future post settings panel.
- Allowed blocks (9): `core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`.
- Composes `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList` (inline, not iframed — keeps editor styles in the shell DOM).
- Block registration via `registerCoreBlocks()` gated by a module-level idempotent guard (`getBlockTypes().length === 0`).
- Settings: `allowedBlockTypes`, `bodyPlaceholder`, `__experimentalBlockPatterns: []`, `__experimentalBlockPatternCategories: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize: '680px'`.
- Auto-save: 2s debounce on `hasEdits`; cancellable timer ref so Publish flushes immediately. Status: `Unsaved changes` / `Saving…` / `Saved` (auto-fades) / `Save failed`.
- Publish button label flips `Publish` / `Update` based on `record.status`.
- New-post flow seeds an empty paragraph block into `content` because WP rejects fully-empty posts (`Content, title, and excerpt are empty`). EditorApp has the same latent bug — fix when touched.
- PHP enqueues `wp-block-editor`, `wp-block-library`, `wp-format-library` styles on the shell page so block chrome + default block styles render.
- Title is a native `<input>` outside the block tree; Tab/Enter focuses the first contenteditable in the body.
