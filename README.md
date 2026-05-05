# WP Admin Shell

A WordPress plugin that replaces `wp-admin` with a configurable, React-based admin environment. The shell reads its layout, navigation, and styling from one or more `admin.json` files and renders a complete admin UI on top of WordPress's existing REST API and design system.

## The idea

WordPress has one admin interface. Every user — writer, developer, client, site manager — sees the same dashboard, the same menus, the same screens. Plugins add more menus. Themes don't touch the admin. Everyone gets everything.

WP Admin Shell makes the admin **configurable**. A JSON file declares which applications are available, how navigation is structured, what branding to show, and which toolbar actions to surface. Swap the JSON file, swap the admin experience.

Same WordPress. Same data. Same plugins. Different admin for different people.

## What v1 ships

- **Cascade resolver.** Five origins (core / plugin / site / role / user) merge into a single config with field-aware semantics, restrict-only enforcement, and `userCustomizable` declarations modeled on block supports.
- **Token system.** `admin.json.styles` compiles to three CSS-variable families: WPDS surface (`--wpds-*`), chrome extensions (`--wp-admin-shell--chrome--*`), and a static compat bridge for legacy `--wp-admin-theme-color` consumers.
- **Capability gating.** Four layers — region fast-path, app gate, source-cap floor, REST observation. Recursive nav prune drops gated apps + empty drilldowns.
- **Native apps.** Posts, Pages (`core:posts`), Simple editor (`core:simple-editor`), Block editor (`core:editor`, iframed), Media (`core:media`), Profile (`core:profile`), Users (`core:users`), Comments (`core:comments`), Settings (`core:settings` composable host with REST-bounded native panels), Site editor (`core:site-editor`, iframe-backed adapter), Appearance prefs (`core:appearance`).
- **Slots.** Render slots (`core:app.before/.after`, `core:editor.sidebar`) and data slots (`core:posts.row-actions`, `core:users.row-actions`, `core:comments.row-actions`, `core:settings.panels`) for plugin extension.
- **Notices via `@wordpress/notices`** pinned in a built-in `notices` overlay region.
- **WP-CLI:** `wp admin-shell list | activate | register | upgrade-config`.
- **Per-role + per-user shell selection** with `userSwitchable` gating.

## Requirements

- WordPress 6.7+
- PHP 7.4+ (8.1+ supported)
- Node.js 20+ (for building from source)
- **Gutenberg plugin** — hard runtime dependency. `@wordpress/ui` overlay components opt into `wp.privateApis` against an allowlist that core does not include but Gutenberg overrides. Without Gutenberg, the shell renders empty. The plugin header declares `Requires Plugins: gutenberg`.

## Installation

```bash
git clone https://github.com/your-org/wp-admin-shell.git
cd wp-admin-shell
npm install
npm run build
```

Copy the entire directory into `wp-content/plugins/`, then activate **WP Admin Shell** from the Plugins screen. (Activate Gutenberg first.)

### With wp-env (development)

```bash
npx wp-env start
```

Open `http://localhost:8888/wp-admin/admin.php?page=wp-admin-shell` (login: `admin` / `password`).

## Usage

1. Activate the plugin (and Gutenberg).
2. Click **Shell Admin** in the wp-admin sidebar.
3. The shell takes over the viewport with its own navigation, toolbar, and content region.
4. Switch shells from **Shell Admin → Settings** or programmatically via `window.wpAdminShell.switchShell('content-author')`.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open command palette |

The palette publishes `Go to {App}` and `New Post` / `New Page` commands scoped to the active shell.

## Bundled configurations

| Slug | Title | Notes |
|---|---|---|
| `developer-admin` | Developer Admin | Default. Native apps for the v1 surface (posts, pages, media, comments, users, settings, site editor) plus iframe escape hatches for plugins / tools. |
| `content-author` | Writer | Minimal writing environment. Collapsed sidebar, focused on Posts / Pages / Media + a "New Post" button. |
| `client-portal` | Acme Corp Portal | Branded shell with custom logo + accent. Pages first, scoped nav, "View Site" link. |
| `wp-admin-default` | WP Admin (Default) | Mirrors stock wp-admin: every screen rendered as an iframe of its wp-admin counterpart. Useful for parity testing. |

## `admin.json` schema

The full v1 schema lives at [`docs/schemas/admin-v1.json`](docs/schemas/admin-v1.json) and is the active schema for v1.0.0-beta.x bundled shells, which reference it via `$schema`. The post-v1 architecture is described in the master spec at [`docs/wp-admin-shell-design-spec.md`](docs/wp-admin-shell-design-spec.md) (2026-05-01); the three v2 manifest schemas (`admin-v2.json`, `admin-app-v2.json`, `admin-engine-v2.json`) live alongside it. The 2026-04-29 architecture is preserved at [`docs/archive/wp-admin-shell-design-spec-2026-04-29.md`](docs/archive/wp-admin-shell-design-spec-2026-04-29.md). The v2 migration directive at [`docs/plans/wp-admin-shell-v2-migration-directive.md`](docs/plans/wp-admin-shell-v2-migration-directive.md) is the active plan on `feat/wp-admin-shell-v2`.

v0 (MVP flat) admin.json files keep working indefinitely — the resolver normalizes them through the `core` origin loader. To rewrite a v0 file in place, run `wp admin-shell upgrade-config <name>` (the v0 file is preserved as `<name>.v0.json`).

## Application sources

| Source | Native? | Notes |
|---|---|---|
| `core:posts` | ✅ | DataViews list, server-side fetch, search/filter/pagination |
| `core:simple-editor` | ✅ | Substack-style writing flow (title + restricted blocks + auto-save) |
| `core:editor` | iframe | Block editor (post.php?action=edit). Native mount is post-v1. |
| `core:media` | ✅ | Grid, upload, detail edit |
| `core:profile` | ✅ | User profile form |
| `core:users` | ✅ | DataViews + bulk delete with reassign. `list_users` cap floor. |
| `core:comments` | ✅ | DataViews + approve/unapprove/spam/trash. `moderate_comments` cap floor. |
| `core:settings` | partial | Composable host. Native panels: general, writing, reading, discussion (REST-bounded). Iframed: permalinks, media, privacy. |
| `core:site-editor` | iframe | `@wordpress/edit-site` adapter. Native mount deferred to v2. |
| `core:appearance` | ✅ | User-prefs UI driven by `userCustomizable` declarations. |
| `iframe:{url}` | iframe | Any wp-admin URL with chrome hidden. |

System apps (`core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar`) are pinned by the v0 normalizer and don't appear in shell author files unless overridden.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php              # Plugin entry
├── webpack.config.js
├── shells/                         # Bundled admin.json files
├── assets/
├── includes/                       # PHP — REST endpoints, cascade resolver
│   ├── class-wp-admin-shell-config.php
│   ├── class-wp-admin-shell-{can,prefs,selection}-rest.php
│   ├── class-wp-admin-shell-cli.php
│   ├── cascade/                    # Resolver, merge engine, customizable, cache, validator
│   └── origins/                    # Core origin (v0 → v1 normalizer)
├── src/                            # JS source
│   ├── runtime/                    # v1 kernel
│   │   ├── kernel.js, kernel-context.js
│   │   ├── registry/               # Source registry + builtins
│   │   ├── engines/                # core:site-editor-layout
│   │   ├── regions/                # Generic Region renderer + regionKind helper + mountApp
│   │   ├── routing/                # Hash router
│   │   ├── selection/              # Cross-region selection bus
│   │   ├── slots/                  # Render + data slots
│   │   ├── styles/                 # Token compiler, compat bridge, density, WPDS baseline
│   │   ├── capabilities/           # userCan / checkCan
│   │   ├── config/                 # normalizeV0, iconMap
│   │   └── apps/                   # System apps (NavigationApp, SiteHubApp, etc.)
│   └── apps/                       # User apps (PostsApp, MediaApp, …)
├── tests/
│   ├── php/                        # Cascade + manifest + cap + shape + selection runners (wp eval-file)
│   ├── schema/                     # Ajv 2020-12 against admin-v1/v2/app-v2/engine-v2 (node)
│   ├── runtime/                    # Pure-JS runtime helpers (node) — resolveRegion merge, etc.
│   └── parity/                     # WPDS slot-list parity (node)
├── docs/                           # Specs, schemas, readiness notes
│   ├── wp-admin-shell-design-spec.md       # Master design (2026-05-01)
│   ├── post-editor-sketch.md               # v2 worked example
│   ├── plans/
│   │   └── wp-admin-shell-v2-migration-directive.md  # Active v2 plan
│   ├── schemas/
│   │   ├── admin-v1.json                   # v1.0.0-beta.x schema (still load-bearing)
│   │   ├── admin-v2.json                   # v2 admin.json schema
│   │   ├── admin-app-v2.json               # v2 app manifest schema
│   │   └── admin-engine-v2.json            # v2 engine manifest schema
│   ├── research/schema-exercise-findings.md
│   ├── v1-token-emission.md
│   ├── v1-readiness.md
│   └── archive/
│       ├── wp-admin-shell-mvp-spec.md
│       ├── wp-admin-shell-design-spec-2026-04-29.md
│       └── wp-admin-shell-v1-plan.md
├── scripts/                        # snapshot-wpds.mjs
└── build/                          # Compiled output (gitignored)
```

## Development

```bash
npm run start            # Dev build with watch
npm run build            # Production build
npm run lint:js
npm run format
npm run snapshot:wpds    # Regenerate WPDS slot snapshot from @wordpress/theme
npm run test:parity      # Diff snapshot vs upstream design-tokens.css
```

PHP fixture tests run inside the wp-env CLI container:

```bash
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-selection-tests.php
```

## Architecture highlights

**Why a cascade resolver?** `theme.json` resolves through merged origins; admin.json takes the same shape so site administrators / plugin authors / end users can override the active shell along well-defined precedence boundaries. Trusted origins (core / plugin) merge authoritatively (omission ⇒ tombstone); consumer origins (site / role / user) merge additively, filtered through `userCustomizable`.

**Why three CSS-variable families?** WPDS slots cover most of the surface but not shell-only chrome (sidebar, toolbar, site hub, content card). The chrome extension namespace fills that gap. The compat bridge keeps legacy `@wordpress/components` consumers + SCSS-compiled wp-admin CSS inheriting shell theming without touching every legacy stylesheet.

**Why iframe for the editor + site editor?** Both packages assume full-viewport ownership and own private-API stores. Embedding inside a region requires resolving four collisions (preferences-store namespace, command-palette double-registration, full-screen-mode CSS, hash-router conflicts). v1 ships iframe; v2 takes the native-mount path.

**Why `wp_add_inline_script`?** Type fidelity. `wp_localize_script` stringifies booleans and nested objects.

**Why the Gutenberg dependency?** Any `@wordpress/ui` overlay component (`Notice.CloseIcon → IconButton → Tooltip → @wordpress/theme`) opts into private APIs against an allowlist core does not include. Gutenberg overrides `wp-private-apis` with a permissive allowlist. Without Gutenberg, those modules throw at module-load.

## License

GPL-2.0-or-later
