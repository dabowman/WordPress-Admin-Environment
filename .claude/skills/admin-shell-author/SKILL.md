---
name: admin-shell-author
description: Customize the WP Admin Shell experience by authoring or editing admin.json, engine.json, or app.json files. Use whenever a user wants to add/rename/hide a screen, reorganize the menu, brand the admin, bind keyboard shortcuts, change theme/density/colors, swap the rendering engine, ship a custom region layout, or extend WordPress admin with a new mounted React app. Triggers: "customize wp-admin", "build an admin shell", "add a screen to my admin", "make a custom WordPress dashboard", "hide the plugins menu", "swap to single-pane layout", "ship a new admin app", "rebrand wp-admin", "what should go in admin.json / engine.json / app.json". Routes the request to the right sub-skill — admin-json-author (workspace), engine-json-author (renderer + chrome), or app-json-author (mounted React app).
---

# WP Admin Shell — Authoring Skills (Umbrella)

WP Admin Shell replaces wp-admin with a configurable, React-based admin environment driven by JSON manifests. Three files, three roles:

| File | What it declares | Sub-skill |
|---|---|---|
| `admin.json` | An **install decision**: which engine renders this workspace, screens it exposes, menu IA, keyboard commands, branding, theme. One workspace = one admin.json. | [`admin-json-author`](../admin-json-author/SKILL.md) |
| `engine.json` | A **rendering strategy**: region templates, chrome modes, slot vocabulary, default region tree, menu renderer. Three ship with the plugin (`core:default`, `core:single-pane`, `core:desktop`); plugins ship more. | [`engine-json-author`](../engine-json-author/SKILL.md) |
| `app.json` | A **mounted React surface**: id, ARIA role, capability floor, config schema, script handle, optional dataView baseline + window hints. Multi per plugin (`{plugin}/apps/{name}/app.json`). | [`app-json-author`](../app-json-author/SKILL.md) |

## Routing user requests

Match the request to the right artifact, then invoke that sub-skill. Most requests are admin.json.

| User says... | Artifact | Why |
|---|---|---|
| "Add a Posts screen" / "rename Tools" / "hide Plugins menu" / "change Mod+K to ..." / "set landing screen to dashboard" / "brand admin with our logo" / "set the bg color" / "use the desktop engine" / "restrict Settings to editors" | **admin.json** | Install decisions: screen-set, menu IA, branding, theme seeds, commands, engine selection. |
| "Add a column to Posts table" / "create a Drafts variant" / "set default sort" | **admin.json** (`settings.dataViews`) — OR `app.json#dataView` if extending an app's baseline | DataView config lives in `settings.dataViews.<kind>.<name>.<variant>`. Per-screen overlay via `screens[id].dataView`. App ships baseline variants in its manifest. |
| "Build a tiling-window engine" / "ship a Material Design chrome" / "add a focus-tight mode" / "change menu to dock" / "expose a new slot" | **engine.json** | Engine-shipped vocabulary: templates, modes, slots, menu renderer, default region tree. |
| "Add a custom admin page for my plugin" / "build an app that lists Stripe customers" / "register an app called acme/orders" / "add a config-schema for postType" / "ship a dashboard widget" / "window-mount hints" | **app.json** | Per-app intrinsic declarations: id, role, capability floor, config-schema, script, optional dataView baseline + window block + slotHints. |

When unclear which file to touch, ask the user **what** they want to change (screen / chrome / new app) before guessing.

## Pre-flight before authoring

1. **All three artifacts set `"version": 3`.**
2. **Reference the schema in `$schema`.** Authors get IDE completion + Ajv validation in CI. Use `https://schemas.wp.org/<artifact>.json` for published files, or the relative repo path (`../docs/schemas/admin.json`) for in-tree shells.
3. **`additionalProperties: false`** on every top-level: unknown keys fail validation. If the schema rejects a key, check the spelling — don't invent fields.
4. **Pin `$wpds`** on admin.json files. The WPDS slot matrix changes per WP version; the resolver loads `wpds-defaults-{$wpds}.json` as the implicit baseline.
5. **Three engines ship with the plugin** — `core:default` (sidebar + topbar + content; WPDS), `core:single-pane` (mobile-first drawer; WPDS), `core:desktop` (windowed; WPDS). Most workspaces should pick one of these unless the user is shipping a custom engine.

## Bundled examples to mine

| File | Why useful |
|---|---|
| `shells/single-pane-demo.json` | Compact full-shape example: bound screens, menu, commands, theme tweak, on the `core:single-pane` engine. Start here. |
| `shells/wp-admin-default.json` | Largest shell — every wp-admin screen, iframe fallbacks, capability gating, dashboard widgets in `apps[]`. |
| `shells/desktop-demo.json` | Same screens against the `core:desktop` engine — engine selection is one field. |
| `src/runtime/engines/core-default/engine.json` | Reference engine manifest. `templates` + `modes` + `defaultRegions` + `default-styles`. |
| `src/apps/posts/app.json` | Reference app manifest with full `dataView` variants family + `documentation` block. |
| `src/apps/dashboard-host/app.json` | App that declares a `slots` block (the `grid` slot widgets mount into). |

## Sanity checks before declaring "done"

- Schema validates: `npm run test:schema` (Ajv sweep — runs on every shell, app, engine, fixture).
- PHP shape: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php` (validates author-shape invariants — primary app valid, paths unique, default-screen resolves).
- Cascade behavior: `tests/php/run-cascade-tests.php` for merge / tombstone semantics.
- Visual: load the shell in `wp-env` and open `wp-admin` (default install URL `http://localhost:8888/wp-admin/`).

Each sub-skill restates its own validation steps inline.

## Quick links

- Master spec: `docs/wp-admin-workspaces-design-spec.md`
- Design doc: `docs/schema-sketch.md`
- Public references: `docs/public/{admin,app,engine}-json-reference.md`
- Schemas: `docs/schemas/{admin,admin-app,admin-engine,tokens}.json`
- DataView authoring: `docs/dataview-config.md`
- Per-screen specs: `docs/screens/*.md` (42 files; source-of-truth for any rebuild)
