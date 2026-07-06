# Code map

File-by-file reference for the WP Admin Workspaces tree. `CLAUDE.md` carries
the skeletal top-level layout + the rules; this doc is the annotated
detail. Keep both in sync when files move.

## Project structure

```
wp-admin-workspaces/
├── wp-admin-workspaces.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── workspaces/                  # Bundled workspace.json configurations (workspace/screens/menu shape)
│   ├── wp-admin-default.json     # DEFAULT install workspace — wp-admin mirror w/ capability-gated screens + iframe-fallback screens
│   ├── writer.json               # Persona: focused writing desk (core:single-pane)
│   ├── developer.json            # Persona: windowed ops console (core:desktop)
│   └── client-portal.json        # Persona: minimal branded client admin (core:default)
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP
│   ├── class-wp-admin-workspaces-can-rest.php         # /wp-admin-workspaces/v1/can/{cap}
│   ├── class-wp-admin-workspaces-prefs-rest.php       # /wp-admin-workspaces/v1/user-prefs
│   ├── class-wp-admin-workspaces-data-view-rest.php   # /wp-admin-workspaces/v1/data-view + /data-view/variants
│   ├── class-wp-admin-workspaces-data-field-collections-rest.php # /wp-admin-workspaces/v1/field-collections (reads settings.dataFields)
│   ├── class-wp-admin-workspaces-cli.php              # `wp admin-workspace …` commands
│   ├── cascade/                                  # Cascade resolver
│   │   ├── class-wp-admin-workspaces-resolver.php     # Multi-origin merge + load_origins; null-tombstone aware
│   │   ├── class-wp-admin-workspaces-merge.php        # merge_authoritative + plain merge w/ tombstones
│   │   ├── class-wp-admin-workspaces-customizable.php # `customizable` filter (default-deny)
│   │   ├── class-wp-admin-workspaces-cache.php        # WP_Object_Cache + transient w/ hash keying
│   │   ├── class-wp-admin-workspaces-config-validator.php  # configSchema cache
│   │   ├── class-wp-admin-workspaces-classic-menu-bridge.php # Classic wp-admin menu bridge: walks $GLOBALS['menu']/['submenu'] at wp_admin_workspaces_data_plugin priority 6 → synthesizes screens[ingested-<slug>] + menu.ingested.items[]. Filter `wp_admin_workspaces_classic_menu_core_slugs` extends skip list.
│   │   ├── class-wp-admin-workspaces-modes.php        # engine modes catalog resolver + `extends` chain (depth 10, cycle-safe) + plugin-contributed modes via `wp_admin_workspaces_engine_modes_{engineId}` filter
│   │   ├── class-wp-admin-workspaces-permissions.php  # permissions resolver: OR-semantic capabilities + roles, super-admin magic, trust-tier cascade (core/engine/plugin/site may add/remove; role/user may only remove)
│   │   ├── class-wp-admin-workspaces-data-field-collections.php # data-field-collections registry + cascade contribution
│   │   ├── class-wp-admin-workspaces-data-view-config.php  # 3-axis data-view-config resolver: `(kind, name, variant|_default)` lookup + extends chain + ref-wins-inline merge + per-base + per-variant filter machinery
│   │   ├── class-wp-admin-workspaces-preload.php      # REST preload: collect across origins + dedupe + hydrate via rest_preload_api_request + emit on wp-api-fetch
│   │   ├── class-wp-admin-workspaces-menu-items.php   # menu-item registration: nav-region resolver + cascade contribution
│   │   └── class-wp-admin-workspaces-admin-routes.php # admin-route registration: cascade contribution
│   └── origins/
│       └── class-wp-admin-workspaces-origin-core.php  # empty baseline + chrome defaults
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminWorkspaces.config) and mounts result
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
│   │   │   ├── useDataView.js      # React hook overloaded: useDataView(screenId) OR useDataView({kind, name, variant}, {fallback}) → {config, isLoading}. Inline-snapshot fast path + /wp-admin-workspaces/v1/data-view REST fallback.
│   │   │   ├── hydrateInline.mjs   # Pure 3-axis triple hydrate: extends chain (cycle + depth-cap 10) + fieldsRef merge + inline screen overlay deep-merge. Mirror of WP_Admin_Workspaces_Data_View_Config::resolve_data_view_triple / resolve_screen_data_view.
│   │   │   └── mergeFields.mjs     # Pure ref-wins-inline-overrides field merge. Mirror of WP_Admin_Workspaces_Data_View_Config::merge_fields.
│   │   ├── modes/                  # engine modes (default/focus/takeover/modal + plugin-contributed)
│   │   │   ├── resolveMode.mjs     # Pure ESM: resolveMode(modesCatalog, modeName) → { regions: {…} } w/ extends chain (depth 10, cycle-safe). Mirror of WP_Admin_Workspaces_Modes::resolve.
│   │   │   └── useMode.js          # React hook: useMode(screenId) → { mode, regions }. Reads resolved engine modes from kernel context + active screen.mode.
│   │   └── workspace-switching.js      # window.wpAdminWorkspaces.switchShell(slug) plumbing
│   └── apps/                # All workspace-bundled apps (registered via builtins.js)
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
│   ├── schema/              # node: Ajv sweeps over workspaces + manifests
│   └── engines/             # TS engine tests; run via `node --experimental-strip-types`
├── scripts/snapshot-wpds.mjs   # Regenerate the engine's wpds-defaults/<wpds>.json snapshot
├── build/                   # webpack output (gitignored)
└── docs/                    # spec, schemas, readiness, perf-baseline, archive
```

**App-dir conventions.** Same shape as `engines/`. A `plugin:*` app dir
holds `app.json` + `index.js` + optional `index.css` (spec §13 #3).
Webpack picks up CSS through the dependency graph and tree-shakes unused
apps' CSS. Apps without CSS (e.g. command-palette) skip `index.css`.
`notices-banner` + `notices-snackbar` are independent dirs.
`navigation/index.js` bundles its drill-down helpers (Screen /
Item / Button + slide keyframes) into its own `index.css`; the Sidebar*
presentational helpers live under `navigation/_components/`.
`site-hub/SiteIcon.js` is a sibling of `site-hub/index.js`. Rule of
thumb: a presentational helper used by exactly one app belongs inside
that app's dir; promote to a shared location only when a second
consumer appears.

## Application sources

| Source | Component | Native? | Cap floor | Notes |
|---|---|---|---|---|
| `core:posts` | PostsApp | ✅ | — | The native showcase. DataViews table; `config.postType`. dataView consumer on `(postType, <name>, variant)`. |
| `core:simple-editor` | SimpleEditorApp | ✅ | — | Substack-style; title + 9 blocks + auto-save. The writer workspace's editor. See notes below. |
| `core:editor` | EditorApp | iframe | — | `post.php?post={id}&action=edit`. Tier 1 (`docs/block-editor-native-port.md`): `wp-admin-default` no longer declares screens mounting it — edit/new links hand off to classic full-page. The app stays as the embed option for workspaces that declare editor screens, and the `core:editor` id is the Tier 2 retarget contract. Full native recreation rejected — see the strategy doc. |
| `core:site-editor` | SiteEditorApp | iframe | `edit_theme_options` | `site-editor.php` adapter. Native `@wordpress/edit-site` mount not yet implemented; five blockers documented in `SiteEditorApp.js`. |
| `core:settings-workspace` | SettingsWorkspaceApp | ✅ | `manage_options` | The workspace's own Settings → Workspace enable/disable panel (`DataForm` over the `wp_admin_workspaces_enabled` option; mirrors the classic settings page). |
| `core:iframe-fallback` | IframeApp | iframe | — | The escape-hatch host every `iframe:` ref mounts. URL relative to `adminUrl`, chrome hidden via injected CSS. |
| `core:navigation` … `core:user-menu` | system apps | — | — | `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu`. Mounted by engine `defaultRegions` / frame widgets, not screens. `core:command-palette` reads `commands[]` + synthesizes "Go to X" entries from `screens[id]` via `compileCommands.mjs`; palette names `core/admin-workspace/palette-<encoded-id>` (first-write-wins dedup). |
| Desktop engine apps | `core:desktop-{compositor,dock-app,window-frame,iframe}` | ✅ | — | See `docs/desktop-engine-readiness.md`. |

**Parked apps** (recoverable on the `archive/native-apps` branch; see `docs/decisions.md`): media, taxonomy, users, user-new, comments, menus, tools, site-health, plugins, themes, profile, the settings host + general/writing/reading/discussion/media panels, appearance-preferences, dashboard-host + the five dashboard widgets, preview-pane. `wp-admin-default` routes their screens through `iframe:` refs instead.

### `core:simple-editor` notes

- Substack-style minimal editor — title + content only. Featured image, taxonomy, excerpt, scheduling deferred to a future post settings panel.
- Allowed blocks (9): `core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`.
- Composes `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList` (inline, not iframed — keeps editor styles in the workspace DOM).
- Block registration via `registerCoreBlocks()` gated by a module-level idempotent guard (`getBlockTypes().length === 0`).
- Settings: `allowedBlockTypes`, `bodyPlaceholder`, `__experimentalBlockPatterns: []`, `__experimentalBlockPatternCategories: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize: '680px'`.
- Auto-save: 2s debounce on `hasEdits`; cancellable timer ref so Publish flushes immediately. Status: `Unsaved changes` / `Saving…` / `Saved` (auto-fades) / `Save failed`.
- Publish button label flips `Publish` / `Update` based on `record.status`.
- New-post flow seeds an empty paragraph block into `content` because WP rejects fully-empty posts (`Content, title, and excerpt are empty`). EditorApp has the same latent bug — fix when touched.
- PHP enqueues `wp-block-editor`, `wp-block-library`, `wp-format-library` styles on the workspace page so block chrome + default block styles render.
- Title is a native `<input>` outside the block tree; Tab/Enter focuses the first contenteditable in the body.
