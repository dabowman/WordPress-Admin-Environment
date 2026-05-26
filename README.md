# WP Admin Shell

A WordPress plugin that replaces `wp-admin` with a configurable, React-based admin environment. The shell reads its layout, navigation, branding, and styling from `admin.json` configuration files and renders a complete admin UI on top of WordPress's existing REST API and design system.

> **Status:** pre-release. Nothing has shipped publicly; there is no installed base. The repository is being prepared for a first release — APIs and the schema may still change.

## The idea

WordPress has one admin interface. Every user — writer, developer, client, site manager — sees the same dashboard, the same menus, the same screens. Plugins add more menus. Everyone gets everything.

WP Admin Shell makes the admin **configurable**. A JSON file declares which screens are available, how navigation is structured, what branding to show, and which keyboard shortcuts do what. Swap the JSON file, swap the admin experience.

Same WordPress. Same data. Same plugins. Different admin for different people.

## Architecture

Three artifact types, three responsibilities:

| Artifact | Declares | Ships with |
|---|---|---|
| **app manifest** (`app.json`) | what an app *is* — ARIA role, requested platform services, capability floor, config schema, slots, DataView baseline | the app's code |
| **engine manifest** (`engine.json`) | what an engine *provides* — region templates, modes, slots, menu renderer, default region tree, default styles | the engine's code |
| **`admin.json`** | install *decisions* — which engine, which screens, the menu tree, commands, branding, token overrides | the install |

`admin.json` is shaped around user-task surfaces:

- **`workspace`** — engine selection, default screen, branding, notices, persistent widgets.
- **`settings`** — reusable registries: `dataViews` (3-axis `@wordpress/dataviews` config keyed by `kind → name → variant`) and `dataFields` (named field collections).
- **`screens`** — the id-keyed map of every screen: `apps[]`, `path`, `slot`, `mode`, `permissions`, `dataViewRef`.
- **`menu`** — an engine-agnostic information-architecture tree; item keys that match a screen id bind to it.
- **`commands`** — palette entries + keyboard shortcuts.
- **`styles`** — theme.json-shaped token overrides. **`preload`** — workspace-boot REST preloads. **`regions` / `routes`** — escape hatches.

**The runtime reads this shape directly.** The kernel (`src/runtime/`) derives the region tree + routes from the resolved `screens` / `workspace` blocks and the active engine's `defaultRegions` at mount time (`src/runtime/compile/`). There is no intermediate shape.

- **Cascade resolver.** Six origins merge into one document with field-aware, restrict-only semantics and `customizable` declarations modeled on block supports: `core` → `engine` (synthetic; carries the active engine's default styles) → `plugin` → `site` → `role` → `user`. Arrays merge by `id`; `null` tombstones any key at any depth. `core`/`engine`/`plugin`/`site` are trusted (may add + remove); `role`/`user` are consumer origins (shrink-only).
- **Capability gating.** Four layers — region fast-path, app gate, source-cap floor, REST observation. Navigation prunes gated screens recursively. Screen `permissions` are OR-semantic (`capabilities` / `roles`) with trust tiers.
- **Engine-owned theming.** The kernel is design-system-neutral: it mounts the active engine's `ThemeProvider` through the `ThemeProviderHost` seam (or a neutral pass-through wrapper when the engine ships none). The bundled `core:default` engine ships a WPDS-backed provider + style compiler; a third-party engine plugs in its own design system without touching the kernel.
- **REST-only contract.** Every screen reads/writes through `/wp-json/`. If the API can't do it, a thin app iframes the legacy wp-admin screen (the `iframe:<slug>` escape hatch) until it can be ported.

## Requirements

- WordPress 6.7+
- PHP 7.4+ (8.1+ supported)
- Node.js 20+ (to build from source)
- **Gutenberg plugin** — hard runtime dependency. `@wordpress/ui` overlay components opt into `wp.privateApis` against an allowlist core does not include but Gutenberg overrides. Without Gutenberg the shell renders empty. The plugin header declares `Requires Plugins: gutenberg`.

## Installation

```bash
git clone https://github.com/your-org/wp-admin-shell.git
cd wp-admin-shell
npm install
npm run build
```

Copy the directory into `wp-content/plugins/`, then activate **WP Admin Shell** (activate Gutenberg first).

### With wp-env (development)

```bash
npx wp-env start
```

Open `http://localhost:8888/wp-admin/admin.php?page=wp-admin-shell` (login: `admin` / `password`).

## Usage

1. Activate the plugin (and Gutenberg).
2. Open **WP Admin Shell** from the wp-admin sidebar — it takes over the viewport with its own navigation, toolbar, and content region.
3. Switch shells from the settings page or programmatically via `window.wpAdminShell.switchShell('content-author')`.

`Cmd/Ctrl+K` opens the command palette.

## Bundled engines

| Engine | Idiom |
|---|---|
| `core:default` | Flagship: dark chrome, drilldown sidebar, elevated cards |
| `core:single-pane` | Mobile-first: appbar + collapsible nav drawer |
| `core:desktop` | Windowed: compositor, dock, draggable/resizable window frames |

## Bundled shells

| Slug | Notes |
|---|---|
| `wp-admin-default` | Default install. Mirrors stock wp-admin via capability-gated screens + iframe fallbacks + the classic-menu bridge. |
| `developer-admin` | Native apps (users / comments / settings / site editor) + drilldown menu containers. |
| `content-author` | Minimal writing environment — collapsed sidebar, Posts / Pages / Media. |
| `client-portal` | Branded shell with custom logo + accent, scoped nav, "View Site" link. |
| `single-pane-demo` | `core:single-pane` engine demo. |
| `desktop-demo` | `core:desktop` engine demo. |
| `canonical-demo` | Canonical admin.json shape on `core:default`. |

## `admin.json` schema

The JSON Schemas live in [`docs/schemas/`](docs/schemas/): [`admin.json`](docs/schemas/admin.json) (workspace), [`admin-app.json`](docs/schemas/admin-app.json) (app manifest), [`admin-engine.json`](docs/schemas/admin-engine.json) (engine manifest), [`tokens.json`](docs/schemas/tokens.json) (DTCG primitives). The design is documented in [`docs/wp-admin-shell-design-spec.md`](docs/wp-admin-shell-design-spec.md) (runtime architecture) and [`docs/v3/schema-sketch.md`](docs/v3/schema-sketch.md) (admin.json shape). Author-facing references are in [`docs/public/`](docs/public/).

## Application sources

| Source | Native? | Notes |
|---|---|---|
| `core:posts` | ✅ | DataViews list; `config.postType`. |
| `core:simple-editor` | ✅ | Substack-style writing flow (title + restricted blocks + auto-save). |
| `core:editor` | iframe | Block editor (`post.php?action=edit`). Native mount deferred. |
| `core:media` | ✅ | Grid, upload, detail edit. |
| `core:users` / `core:comments` / `core:taxonomy` / `core:plugins` / `core:themes` | ✅ | DataViews entity-CRUD apps; per-app capability floors. |
| `core:profile` | ✅ | User profile form. |
| `core:settings` | partial | Composable host; native general / writing / reading / discussion panels, iframed permalinks / media / privacy. |
| `core:site-editor` | iframe | `site-editor.php` adapter. Native mount deferred. |
| `core:dashboard` / `core:dashboard-host` | ✅ | Overview cards / widget grid. |
| `iframe:{slug}` | iframe | Any wp-admin URL with chrome hidden. |

System apps (`core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu`) are declared explicitly in each shell's `workspace` / regions.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry — admin page, asset enqueue, config handoff
├── webpack.config.js        # @wordpress/scripts + a copy step for the DataViews CSS
├── shells/                  # Bundled admin.json configurations
├── includes/                # PHP
│   ├── class-wp-admin-shell-config.php
│   ├── class-wp-admin-shell-{can,prefs,data-view,data-field-collections}-rest.php
│   ├── class-wp-admin-shell-cli.php          # wp admin-shell list | activate | register
│   ├── cascade/             # Resolver, merge engine, customizable, cache, permissions,
│   │                        #   modes, dataView/dataField registries, preload, menu/route
│   │                        #   shims, classic-menu bridge, dashboard widgets
│   ├── origins/             # Core origin (bundled-defaults baseline)
│   ├── manifests/           # app.json / engine.json discovery + registry + validator
│   └── tokens/              # DTCG tokens.json resolver
├── src/
│   ├── index.js             # Entry — kernel(window.wpAdminShell.config)
│   └── runtime/             # DS-neutral kernel
│       ├── kernel.js, kernel-context.js
│       ├── compile/         # screens/workspace → regions / routes / default-route / commands
│       ├── registry/        # source registry + builtins
│       ├── engines/         # core-default, core-single-pane, core-desktop
│       ├── regions/         # generic Region renderer + mountApp
│       ├── routing/         # hash + Navigation API router
│       ├── styles/          # ThemeProviderHost seam + theme helpers
│       ├── dataView/        # useDataView + inline hydration
│       ├── modes/, capabilities/, bindings/, dirty-state/, config/
│   └── apps/                # All bundled apps (one dir each: index.js + app.json + app.md)
├── tests/
│   ├── php/                 # wp eval-file fixture runners
│   ├── schema/              # Ajv 2020-12 sweep over shells + manifests + fixtures
│   ├── runtime/             # pure-ESM runtime modules (node)
│   └── engines/             # core:desktop TS tests (node --experimental-strip-types)
└── docs/                    # design spec, schema docs, schemas, public references, archive
```

## Development

```bash
npm run start            # dev build with watch
npm run build            # production build
npm run lint:js
npm run lint:ts          # type-checks the core:desktop engine sources
npm run test:schema      # Ajv schema sweep
npm run test:parity      # WPDS slot-list drift detector
npm run test:runtime     # pure-ESM runtime modules
npm run test:engines     # core:desktop engine

# PHP fixture tests (inside the wp-env CLI container)
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
# … see docs / CLAUDE.md for the full list
```

## Why these choices

- **Cascade resolver** — `theme.json` resolves through merged origins; admin.json takes the same shape so site admins, plugin authors, and end users can override the active shell along well-defined precedence boundaries.
- **Engine-owned theming** — the kernel never presupposes a design system. WPDS lives entirely inside `core:default`; a Material or Tailwind engine brings its own provider, icon table, and CSS.
- **iframe for the editor / site editor** — both packages assume full-viewport ownership and private-API stores; the shell iframes them until a native mount lands.
- **`wp_add_inline_script`** for the config handoff — preserves type fidelity (`wp_localize_script` stringifies booleans and nested objects).

## License

GPL-2.0-or-later
