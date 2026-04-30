# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

MVP complete (Steps 1–7) on branch `feat/wp-admin-shell-mvp`. Four bundled shell configs working (`content-author`, `client-portal`, `developer-admin`, `wp-admin-default`). Tested on WordPress 6.7+.

**v1 in progress on branch `feat/wp-admin-shell-v1`.** Master design spec at `docs/wp-admin-shell-design-spec.md` is the authoritative architecture. v1 implementation plan at `docs/wp-admin-shell-v1-plan.md` breaks the work into five sequential milestones (M1 kernel rebuild → M2 cascade → M3 tokens → M4 apps → M5 ship).

**M1 complete (2026-04-30).** Kernel rebuild landed: registry-driven mount through `src/runtime/`, `core:site-editor-layout` engine, six built-in region sources, hash router, selection bus + REST endpoint, slot registry, system apps (`core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-{banner,snackbar}` stubs), MVP user apps registered as `AppSource` definitions, `normalizeV0()` shim mapping v0 (MVP flat) configs into the v1 partitioned shape. `src/shell/*`, `src/routing/*`, `src/commands/*`, `src/config/*` retired; surviving presentational helpers relocated to `src/runtime/apps/_components/` and `src/runtime/config/iconMap.js`. All four bundled shells render through the new kernel with parity (the v0 shell-switcher dropdown is intentionally absent per spec §6.4.1; switching is option-write + reload only in v1, prefs UI surface lands in v2).

**M2 complete (2026-04-30).** Cascade resolver landed in `includes/`: `WP_Admin_Shell_Resolver` two-phase pipeline (trusted core/plugin via `merge_authoritative`, consumer site/role/user via plain `merge` filtered through `userCustomizable`), `WP_Admin_Shell_Config` accessor class, `WP_Admin_Shell_Cache` two-layer (object cache + transient) with hash-based invalidation, `WP_Admin_Shell_Origin_Core` owning the v0 → v1 normalizer (the M1 JS shim is now redundant; passes through). Per-role / per-user shell selection with `userSwitchable` gating; legacy `wp_admin_shell_active_config` migrates to `wp_admin_shell_active_shell`. `wp-admin-shell-data_{core|plugin|site|role|user}` per-origin filters plus a final `wp_admin_shell_data` filter for plugin extension. 22 cascade tests + 5 selection tests pass via `wp eval-file`. configSchema validation cache stub registered; real validators land in M4.

**M3 complete (2026-04-30).** Token emission landed in `src/runtime/styles/`: `compileStyles` walks the styles tree into three CSS-variable families (WPDS surface `--wpds-{path-with-dashes}`, chrome extensions `--wp-admin-shell--chrome--{cat}--{slug}`, scoped per-region/per-app overrides under `[data-region-id]`/`[data-app-id]`); `compatBridge` adds the static legacy aliases (`--wp-admin-theme-color`, `--rgb` triplet derived numerically, `-darker-20` from HSL.lightness − 20, `--wp-components-color-{accent,background,foreground}`, `--wp-admin-border-width-focus`); `density.js` writes `data-wpds-density` on the shell root; `emitTokens` injects everything as `<style id="wp-admin-shell-tokens">` at kernel mount. Within-doc DTCG aliases (`{styles.path}`) resolve; tokens.json aliases pass through as `var(--token-…)` fallback for v2. Pinned WPDS 6.9 baseline at `src/runtime/styles/wpds-defaults/6.9.json` (140 slots), regenerated via `npm run snapshot:wpds`. Parity test (`npm run test:parity`) diffs the snapshot against live `@wordpress/theme/src/prebuilt/css/design-tokens.css`; drift fails the build. Chrome-surface inline-style audit converted MVP `index.css` chrome surfaces (sidebar / toolbar / site-hub / content-card) onto chrome vars (167 hex/px occurrences down to 26; remaining are app-internal styles inside the elevated card). One-pager reference at `docs/v1-token-emission.md`.

**M4 (core app expansion) up next.**

## Before modifying code

1. Load these skills (symlinked in `.claude/skills/`):
   - `/wordpress-rest-api` — REST API endpoints, authentication, `_fields`/`_embed`, entity records
   - `/wordpress-dataviews` — DataViews component for PostsApp: fields, views, actions, filtering
   - `/gutenberg-contributor` — `@wordpress/*` package APIs, package boundaries, build tooling
2. Read `docs/wp-admin-shell-design-spec.md` — **master design spec** (post-MVP architecture, regions+apps+layout-engines, 5-origin cascade w/ restrict-only overrides, three-tier design system w/ proposed `tokens.json` primitives layer aliased into both admin.json and theme.json, extension model). `$wpds` is **top-level** (resolved 2026-04-30); selection scopes are per-mount with opt-in `persist: true` (resolved 2026-04-30); `color.palette[]` is dropped from admin.json (resolved 2026-04-30).
3. Read `docs/wp-admin-shell-v1-plan.md` — **v1 implementation plan** (M1–M5 milestones, source layout, ordered tasks, exit criteria, MVP code disposition table). Required reading before any v1 work.
4. Read `docs/wp-admin-shell-mvp-spec.md` — MVP design spec (validated implementation, working code samples)
5. Read `docs/admin-json-schema.md` — original v0/flat schema reference (preserved for cascade resolver)
6. Read `docs/admin-json-api-validation.md` — REST API coverage analysis per application source. The `core:settings` v1 scope split (REST-native panels vs iframe fallbacks) is bounded by this doc.
7. Skim `docs/feedback.md` — running triage log (Inbox / Triaged / In progress / Done). Drop new bugs, feature requests, and to-dos into Inbox as they come up; promote items here before treating them as work.

## Key rules

- **WPDS components: prefer `@wordpress/ui` (next-gen WPDS) over `@wordpress/components` whenever an equivalent exists.** Both are part of WPDS — `@wordpress/ui` is built on Base UI + the WPDS token system (`--wpds-*` CSS variables) and is in `@wordpress/dependency-extraction-webpack-plugin`'s `BUNDLED_PACKAGES`, so it bundles with no extra config. Fall back to `@wordpress/components` for primitives `@wordpress/ui` doesn't ship yet: `RadioControl`, `CheckboxControl`, `SelectControl` (also needed for native `<optgroup>` support), `Spinner`, `Divider` as of `0.12.0`. No custom component libraries.
- **Gutenberg plugin is a hard runtime dependency.** Any `@wordpress/ui` overlay component (`Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, form `Select`/`Autocomplete`) transitively imports `@wordpress/theme`, which calls `__dangerousOptInToUnstableAPIsOnlyForCoreModules` against `wp.privateApis`. WP 6.9 core's allowlist excludes `@wordpress/theme`/`@wordpress/ui`/`@wordpress/dataviews`; the Gutenberg plugin overrides `wp-private-apis` with one that includes them. Without Gutenberg, those modules throw at load and the shell renders empty. Local dev: `gutenberg` is in `.wp-env.json`'s `plugins` array. Production: declare a `Requires Plugins: gutenberg` header (or detect-and-conditionally-render) before shipping.
- Component-mapping cheat sheet (use `@wordpress/ui` left side when available):
  - `Button` (`tone`, `variant`, `size`, `loading`) replaces `@wordpress/components` `Button` (`variant="primary"` → `tone="brand" variant="solid"`; `isBusy` → `loading`).
  - `InputControl` (`label`, `description`, `value`, `onChange(e)`) replaces `TextControl` — onChange takes a DOM event, not the raw value.
  - `Stack` (`direction`, `gap="xs|sm|md|lg|xl|2xl|3xl"`, `align`, `justify`) replaces `__experimentalVStack` / `__experimentalHStack`.
  - `Text` (`variant="heading-xl|lg|md|sm|body-xl|lg|md|sm"`, `render={ <h2/> }` to set the tag) replaces `__experimentalHeading` and `__experimentalText`.
  - `Notice.Root` (`intent="info|warning|success|error|neutral"`) + `Notice.Description` + `Notice.Actions` + `Notice.CloseIcon` replaces `Notice`.
  - Other namespaced replacements when needed: `Card.*`, `Dialog.*`, `Drawer.*`, `Tabs.*`, `Tooltip.*`, `Popover.*`, `EmptyState.*`, `Collapsible.*`.
- All data fetching uses `@wordpress/core-data` (`useEntityRecords`, `useEntityRecord`). No raw `fetch()`.
- Exception: `@wordpress/api-fetch` is used for non-entity operations (media upload, auto-draft creation).
- Always pass `context: 'edit'` on entity queries that need raw field values. Without it, `view` context is used and `title`/`content`/`excerpt` return only `rendered`, not `raw` — edits silently break.
- `deleteEntityRecord('postType', name, id)` without extra args sends posts to trash. Pass `force: true` for permanent delete. Media and taxonomy terms have no trash and require `force: true`.
- No external npm dependencies. Only `@wordpress/*` packages (loaded as externals by `@wordpress/scripts`).
- Config is passed to JS via `wp_add_inline_script` + `wp_json_encode` (not `wp_localize_script` — it coerces types).
- The `iframe:` escape hatch is a feature, not a compromise. The EditorApp and site-editor use it for MVP.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
```

## Webpack externals

`webpack.config.js` extends the default `@wordpress/scripts` config with a `copy-webpack-plugin` step that copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`. The dep-extraction plugin's defaults handle the rest — `@wordpress/dataviews` and `@wordpress/ui` are both in the upstream `BUNDLED_PACKAGES` list and bundle themselves; everything else externalizes to `wp.*`.

### `@wordpress/ui` requires the Gutenberg plugin

`@wordpress/ui` and `@wordpress/theme` opt into private APIs via `__dangerousOptInToUnstableAPIsOnlyForCoreModules`. WP core 6.9's runtime allowlist (`CORE_MODULES_USING_PRIVATE_APIS`) is a 16-package set that does **not** include `@wordpress/ui`/`@wordpress/theme`/`@wordpress/dataviews`. The list and the `allowCoreModule` helper are not exported on `wp.privateApis`, so we cannot extend the allowlist from outside.

The **Gutenberg plugin** ships its own `wp-private-apis` script bundle (`build/scripts/private-apis/`) that overrides core's. Its allowlist (verified on Gutenberg 23.0.1) includes `@wordpress/ui`, `@wordpress/theme`, `@wordpress/dataviews`, `@wordpress/fields`, `@wordpress/admin-ui`, `@wordpress/views` and more, with the `'I acknowledge…'` consent string those packages send. With Gutenberg active, every `@wordpress/ui` component loads cleanly.

Without Gutenberg, overlay components throw at module-load time — the throw fires inside the import graph before React mounts, so the entire shell renders empty with no React error boundary catching it. `Notice.CloseIcon → IconButton → Tooltip → themePrivateApis` is one of several chains that breaks.

**Implication:** Gutenberg is a hard runtime dependency. `.wp-env.json` includes `gutenberg` in its `plugins` array. Distribution must declare `Requires Plugins: gutenberg` (or detect-and-conditionally-render a `@wordpress/components` fallback when missing).

**Past failed workaround — don't repeat:** bundling `@wordpress/private-apis` to control the allowlist creates a *separate registry* from the runtime `wp.privateApis`. `@wordpress/dataviews` (also bundled) then tries to `unlock()` objects locked by `wp.components` in the runtime registry → `"Cannot unlock an object that was not locked before"`.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── shells/                  # Bundled admin.json configurations
│   ├── content-author.json  # Minimal writer shell (collapsed nav, posts/pages/media only)
│   ├── client-portal.json   # Branded client shell (acme logo, accent color, scoped nav)
│   └── developer-admin.json # Full admin (all apps, iframe escape hatches for system screens)
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP classes (REST endpoints, future M2 cascade resolver)
│   └── class-wp-admin-shell-selection-rest.php  # GET/POST/DELETE /wp-admin-shell/v1/selection[/{scope}]
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminShell.config) and mounts result
│   ├── index.css            # All custom CSS (layout, nav, apps)
│   ├── runtime/             # v1 kernel — registry-driven, replaces MVP src/shell/*
│   │   ├── kernel.js        # Top-level mount: registry + normalizer + engine + region resolution
│   │   ├── kernel-context.js  # KernelProvider exposing { registry, config } to all sources
│   │   ├── registry/
│   │   │   ├── createRegistry.js   # Kind-checked registry (app | region | engine), dup-rejection
│   │   │   ├── builtins.js         # Imperative registration of every core:* source
│   │   │   └── source-types.js     # JSDoc typedefs for SourceProps (no runtime)
│   │   ├── engines/
│   │   │   └── core-site-editor-layout/
│   │   │       ├── index.js        # EngineSource definition
│   │   │       └── Layout.js       # Arranges regions: dark chrome + elevated cards
│   │   ├── regions/                # Six built-in region sources, thin contains[] wrappers
│   │   │   ├── mountApp.js         # Shared <MountedApp> resolver: appRef → registry → render
│   │   │   ├── sidebar-region/index.js
│   │   │   ├── toolbar-region/index.js
│   │   │   ├── content-region/index.js   # router:true honored; routable single-region
│   │   │   ├── preview-region/index.js   # subscribes to selection scope via useSelection
│   │   │   ├── overlay-region/index.js   # display:contents pass-through (command palette host)
│   │   │   └── drawer-region/index.js    # slides L/R, dismissOn: escape | overlay-click
│   │   ├── routing/
│   │   │   ├── router.js           # Hash router, RouterProvider, useRoute, navigate, navigateRoute
│   │   │   └── useRoute.js         # Re-export
│   │   ├── selection/              # Cross-region selection event bus
│   │   │   ├── store.js            # core/admin-shell/selection Redux store
│   │   │   ├── useSelection.js     # Subscriber hook
│   │   │   └── persist.js          # apiFetch bridge to selection REST endpoint
│   │   ├── slots/
│   │   │   ├── createSlotRegistry.js  # Known slot names (toolbar, navigation.footer, posts.row-actions, etc.)
│   │   │   └── Slot.js             # Slot/Fill wrappers + SlotFillProvider re-export
│   │   ├── config/
│   │   │   ├── normalizeV0.js      # M1 v0 (MVP flat) → v1 partitioned shape; retires into M2 cascade
│   │   │   └── iconMap.js          # icon name string → @wordpress/icons component
│   │   └── apps/                   # System apps (sidebar/toolbar/overlay content)
│   │       ├── NavigationApp.js    # core:navigation — drilldown sidebar tree
│   │       ├── SiteHubApp.js       # core:site-hub — icon + title + ⌘K
│   │       ├── ToolbarActionsApp.js  # core:toolbar-actions — left/right action clusters
│   │       ├── CommandPickerApp.js   # core:command-picker — registers shell commands w/ commandsStore
│   │       ├── PreviewPaneApp.js     # core:preview-pane — selection-driven placeholder
│   │       ├── NoticesStubApp.js     # core:notices-{banner,snackbar} — M1 stubs; M4 real impl
│   │       └── _components/        # Presentational helpers shared by system apps
│   │           ├── SiteIcon.js
│   │           ├── SidebarNavigationContext.js
│   │           ├── SidebarNavigationScreen.js
│   │           ├── SidebarNavigationItem.js
│   │           ├── SidebarContent.js
│   │           └── SidebarButton.js
│   └── apps/                # User apps (MVP — registered as AppSource via builtins.js)
│       ├── PostsApp.js      # DataViews post/page list (server-side fetch, actions)
│       ├── EditorApp.js     # Block editor in iframe + auto-draft flow (legacy escape hatch)
│       ├── SimpleEditorApp.js # Substack-style native block editor (title + restricted blocks + auto-save)
│       ├── MediaApp.js      # Media grid with upload, detail modal, delete
│       ├── ProfileApp.js    # User profile form via useEntityRecord
│       ├── SettingsGeneralApp.js # WPDS rebuild of options-general.php (site, membership, locale, dates)
│       └── IframeApp.js     # Legacy wp-admin page in iframe with chrome hiding (core:iframe-fallback)
├── build/                   # Compiled output (~440KB JS post-M1; size budget set in M5)
└── docs/                    # Specs and reference docs
```

## Application sources

| Source | Component | Data layer | Notes |
|--------|-----------|------------|-------|
| `core:posts` | PostsApp | `useEntityRecords('postType', config.postType)` | DataViews table, server-side fetch |
| `core:editor` | EditorApp | `apiFetch` for auto-draft | Iframe to `post.php?post={id}&action=edit` (escape hatch / full editor) |
| `core:simple-editor` | SimpleEditorApp | `useEntityRecord('postType', 'post', id)` + `apiFetch` for new draft | Native block editor, title + 9 allowed blocks, debounced auto-save, Publish/Update |
| `core:media` | MediaApp | `useEntityRecords('root', 'media')` | Grid, upload, detail modal |
| `core:profile` | ProfileApp | `useEntityRecord('root', 'user', userId)` | Form with optimistic edits |
| `core:settings-general` | SettingsGeneralApp | `useEntityRecord('root', 'site')` | Recreates `wp-admin/options-general.php` with WPDS components |
| `iframe:{url}` | IframeApp | None | URL relative to `adminUrl`, chrome hidden via injected CSS |

### `core:simple-editor` notes

- Substack-style minimal editor — title + content only. Featured image, taxonomy, excerpt, scheduling, etc. are deferred to a future post settings panel.
- Allowed blocks (9): `core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`.
- Composes `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList` (inline, not iframed — keeps editor styles in the shell DOM).
- Block registration via `registerCoreBlocks()` is gated by a module-level idempotent guard (`getBlockTypes().length === 0`).
- Settings: `allowedBlockTypes`, `bodyPlaceholder`, `__experimentalBlockPatterns: []`, `__experimentalBlockPatternCategories: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize: '680px'`.
- Auto-save: 2s debounce on `hasEdits`; cancellable timer ref so Publish flushes immediately. Status indicator: `Unsaved changes` / `Saving…` / `Saved` (auto-fades) / `Save failed`.
- Publish button label flips between `Publish` and `Update` based on `record.status`.
- New-post flow seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->` into `content` because WP rejects fully-empty posts (`Content, title, and excerpt are empty`). EditorApp has the same latent bug — fix when touched.
- PHP enqueues `wp-block-editor`, `wp-block-library`, `wp-format-library` styles on the shell page so block chrome and default block styles render.
- Title is a native `<input>` outside the block tree (not a "title block"); Tab/Enter from the title focuses the first contenteditable in the body.

## Navigation

The sidebar supports two navigation modes:

- **Flat items**: `{ "app": "posts" }`, `{ "separator": true }`, `{ "group": "Label", "items": [...] }`, `{ "label": "...", "href": "...", "external": true }`
- **Drill-down screens**: `{ "screen": "id", "label": "...", "icon": "...", "description": "...", "items": [...] }` — renders as a nav item with chevron that slides to a sub-screen with back button

Screens support slide animations (0.14s CSS keyframes) and focus restoration after back navigation.

## Multi-area layout

The content region supports a split layout with primary content + preview cards:

- Set `contentWidth` on an app config to constrain the primary card width
- Set `preview` on an app config to the ID of another app to render in a secondary preview card
- Both panels float as elevated white cards on the dark chrome background

Example: `{ "id": "pages", "source": "core:posts", "config": { "postType": "page", "contentWidth": 480, "preview": "editor" } }`

## Shell switching

The active shell config is stored in `wp_admin_shell_active_config` option (registered with `show_in_rest`). Switchable via:
- Settings page (`wp-admin/admin.php?page=wp-admin-shell-settings`)
- Toolbar dropdown (saves via `POST /wp/v2/settings`, then reloads)

## Testing

Manual testing on WordPress 6.7+:
1. Activate plugin, navigate to "Shell Admin"
2. Verify navigation renders from active config
3. Test PostsApp: list, search, pagination, edit/trash actions
4. Test EditorApp: edit existing post, create new post (auto-draft)
5. Test MediaApp: grid, upload, detail edit, delete
6. Test ProfileApp: edit fields, save
7. Test IframeApp: plugins.php, users.php render with chrome hidden
8. Test shell switching: dropdown in toolbar, verify config changes
9. Test command palette: Cmd+K shows scoped commands
10. Test all three configs: content-author, client-portal, developer-admin
