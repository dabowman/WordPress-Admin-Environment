# WP Admin Workspaces

**Swap the JSON file, swap the admin.** WP Admin Workspaces is `theme.json` for wp-admin: a WordPress plugin that replaces the admin with a configurable, React-based workspace driven by a single `workspace.json` file.

> **Status:** pre-release. Nothing has shipped publicly; there is no installed base. APIs and the schema may change without migration paths until 1.0.

## The idea

WordPress has one admin interface. Every user — writer, developer, client, site manager — sees the same dashboard, the same menus, the same screens. Plugins add more menus. Everyone gets everything.

WP Admin Workspaces makes the admin **configurable**. A JSON file declares which screens exist, how navigation is structured, what branding to show, and which keyboard shortcuts do what. Same WordPress, same data, same plugins — a different admin for different people.

One install, four bundled workspaces:

| Workspace | Who it's for | What it looks like |
|---|---|---|
| `wp-admin-default` | Everyone (the baseline) | Mirrors stock wp-admin — every screen reachable, plugin menus bridged automatically, legacy pages served through the iframe escape hatch. |
| `writer` | Authors | A focused writing desk: posts, pages, a distraction-free editor. Single pane, comfortable spacing, nothing else. |
| `developer` | Developers / operators | A windowed console: content, plugins, users, and diagnostics open side-by-side as draggable desktop windows. |
| `client-portal` | Site clients | Three menu items — content, pages, media — under the client's branding. Everything they shouldn't touch simply isn't there. |

<!-- TODO(screenshots): one install wearing writer / developer / client-portal —
     three screenshots, same site, same content. Capture on a real WP install
     (see docs/decisions.md D4); this is the highest-leverage asset in the repo. -->

## How it works

Think of it like the web itself:

- The **kernel** is the platform — routing, capability gating, a cascade resolver, a region-rendering primitive. It is design-system-neutral and knows nothing about what it renders.
- An **engine** is the browser chrome — it owns layout, navigation rendering, theming, and ships its own design system. Three ship in the box: `core:default` (sidebar + toolbar + content), `core:single-pane` (mobile-style appbar), `core:desktop` (windowed compositor + dock).
- An **app** is the website — a React component mounted into a region, reading and writing through the REST API.
- **`workspace.json`** is the address bar and bookmarks — the install-level decisions: which engine, which screens, what menu, what branding.

Three artifact types carry those responsibilities:

| Artifact | Declares | Ships with |
|---|---|---|
| **app manifest** (`app.json`) | what an app *is* — ARIA role, platform services, capability floor, config schema | the app's code |
| **engine manifest** (`engine.json`) | what an engine *provides* — region templates, modes, slots, menu renderer, default styles | the engine's code |
| **`workspace.json`** | install *decisions* — engine, screens, menu, commands, branding, token overrides | the install |

And one coverage guarantee: **any wp-admin screen the workspace doesn't rebuild natively is served through the `iframe:<slug>` escape hatch** — the real classic screen, chrome hidden, plugin JS intact, wrapped in workspace navigation. The classic-menu bridge ingests third-party plugin menus automatically, so a plugin-heavy install keeps working on day one. This is permanent architecture, not a stopgap (see Non-goals).

## Five-minute quickstart

```bash
# 1. Install + activate the plugin (see Installation below), then:
cp wp-content/plugins/wp-admin-workspaces/workspaces/writer.json wp-content/workspace.json

# 2. Visit /wp-admin/ — you're in the writing desk.

# 3. Change one value: edit wp-content/workspace.json and set
#    "styles": { "theme": { "color": { "primary": "#d63638" } } }
#    Reload. The admin re-themes.
```

The file at `wp-content/workspace.json` is both the trigger and the configuration. It behaves like `theme.json` over core defaults: a **partial override** layered on the `wp-admin-default` baseline — declare only what you change, everything else falls through. Delete the file and wp-admin goes back to classic, untouched.

`Cmd/Ctrl+K` opens the command palette. The workspace toolbar shows a **Classic wp-admin** button (a session-scoped escape hatch for every logged-in user); classic shows a reciprocal **Back to workspace** link.

## Requirements

- WordPress 6.7+ (PHP 7.4+; 8.1+ supported)
- Node.js 20+ (only to build from source)
- **WordPress 7.0+ _or_ the Gutenberg plugin** — a runtime private-API dependency, contained in one adapter. `@wordpress/ui` overlay components opt into `wp.privateApis` against an allowlist the loaded `wp-private-apis` script must include. WordPress 7.0 ships that allowlist (and `@wordpress/theme`) in core; on WordPress 6.7–6.9 only the Gutenberg plugin supplies it. With neither present the workspace **stands down to classic wp-admin** with an admin notice (the gate is `wp_admin_workspaces_dependencies_met()`; the single JS touchpoint is `src/runtime/engines/core-default/WpdsThemeProvider.js`).

## Installation

### From a release zip (recommended)

1. On WordPress 6.7–6.9 only: activate the **Gutenberg** plugin first (not needed on 7.0+).
2. **Plugins → Add New → Upload Plugin**, choose `wp-admin-workspaces.zip`, install.
3. Activate **WP Admin Workspaces**.

Grab the zip from the releases page, or build one with `npm run build:zip` (output lands at the project root; it bundles the PHP, the compiled `build/`, the bundled `workspaces/`, and the app/engine manifests the PHP registry discovers at boot).

### From source (development)

```bash
git clone https://github.com/dabowman/WordPress-Admin-Workspaces.git
cd WordPress-Admin-Workspaces
npm install
npm run build
```

Copy the directory into `wp-content/plugins/`, activate. For a disposable environment: `npx wp-env start`.

## What's native, what's iframed

The bundled app surface is deliberately small — the thesis is the kernel + the cascade + one excellent native app + the escape hatch, not a screen-by-screen rewrite of wp-admin:

| Source | Native? | Notes |
|---|---|---|
| `core:posts` | ✅ | The showcase: a `@wordpress/dataviews` list app driven entirely by the `workspace.json` dataView registry (`config.postType` — posts, pages, any CPT). |
| `core:simple-editor` | ✅ | The writer workspace's distraction-free editor (title + restricted blocks + auto-save). |
| `core:settings-workspace` | ✅ | The workspace's own on/off panel (Settings → Workspace). |
| `core:editor` / `core:site-editor` | iframe | Chromeless `post.php` / `site-editor.php` wrappers. Editing in `wp-admin-default` hands off to the real block editor and returns to the workspace. |
| `iframe:{slug}` | iframe | Any wp-admin URL with chrome hidden — the escape hatch every other screen rides. |

System apps (`core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu`) are engine furniture, not screens. A previous iteration built ~20 more native screen apps (media, users, comments, taxonomy, plugins, themes, settings panels, a dashboard grid…); they're parked on the [`archive/native-apps`](../../tree/archive/native-apps) branch, recoverable per screen (see `docs/decisions.md`).

## Non-goals

- **Rewriting wp-admin screen by screen.** Out of scope *by design* — that's how admin-replacement projects die. The parity workspace + the iframe escape hatch is the permanent coverage guarantee, not a temporary bridge.
- **A second design system.** The kernel is DS-neutral; WPDS lives inside the bundled engines. A Material or Tailwind engine brings its own provider without kernel changes.
- **Replacing the REST API.** Every native app reads and writes through `/wp-json/`. Where the API has gaps, screens stay iframed until upstream closes them.

## Going deeper

- **Architecture reference:** [`docs/wp-admin-workspaces-design-spec.md`](docs/wp-admin-workspaces-design-spec.md) — the runtime contracts (regions, routing, cascade, capability gating, extension points). Read on day three, not day one.
- **`workspace.json` shape:** [`docs/schema-sketch.md`](docs/schema-sketch.md) (design doc) and the JSON Schemas in [`docs/schemas/`](docs/schemas/).
- **Author-facing references:** [`docs/public/`](docs/public/) — `workspace-json-reference.md`, `app-json-reference.md`, `engine-json-reference.md`, and a worked customization guide.
- **Contributor map:** [`CLAUDE.md`](CLAUDE.md) + [`docs/code-map.md`](docs/code-map.md).

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
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cascade-tests.php
# … see CLAUDE.md for the full list
```

## License

GPL-2.0-or-later
