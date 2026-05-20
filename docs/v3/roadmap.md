# v3 roadmap

Tracks remaining work + locked design decisions for the v3 schema reshape. Living doc — updated as PR feedback lands and phases ship.

## Status snapshot

PR #49 against `main` (branch: `feat/wp-admin-shell-v3`).

| Phase | Status | Commits |
|---|---|---|
| **3a** — schemas + cascade null-tombstone | ✅ Shipped | `586ade2` |
| **3b** — resolvers (view-config / menu / permissions / modes) | ✅ Shipped | `12ce8dd`, `9be3aa3` ⚠️ view-config resolver was lossy (collapsed CIAB 3-axis registry); restoration plan in `docs/plans/2026-05-20-dataview-registry-restoration.md` corrects this. |
| **3c slice** — minimum end-to-end (compiler + engine defaultRegions + v3 default workspace mounting) | ✅ Shipped | `7980ca7`, `9e6b73a`, `6389449`, `14ed501`, `c945b15`, `8b0948c`, `ac8d058`, `5ccde5e`, `eff4ed5` |
| **3c proper** — dashboard-host rewrite, command palette rewrite, classic wp-admin menu bridge | 🟡 In progress (3c.1 + 3c.2 shipped; 3c.3 pending) | 3c.1: dashboard-host on `feat/v3-3c1-dashboard-host`; 3c.2 in `7d460a5` |
| **3d** — migrate 5 remaining bundled shells, v2→v3 migration helper, final test surface | 🔲 Pending | — |

## Locked design decisions

Detailed spec lives in `docs/v3/schema-sketch.md`. Phase 1 + 2 decisions to preserve verbatim through any refactor:

### Top-level shape

```
workspace      install metadata (engine + default-screen + branding + notices + persistent widgets)
settings       registries — dataViews, dataFields
screens        id-keyed map of every screen
menu           nested tree, items keyed at every depth
commands       shortcuts + palette entries with explicit id
styles         theme.json-shaped surface
preload        REST hydration
regions        escape hatch (advanced compositions)
routes         escape hatch (non-screen URL bindings)
```

### Conceptual renames

- "shell" (user-facing concept) → **workspace**.
- Plugin name + PHP class names keep "WP Admin Shell" (runtime).
- v2 `viewConfig` field on app manifests → **`dataView`**. The block ships the app's `(kind, name)` plus a `variants: { <id>: ... }` family. Each variant is a complete `@wordpress/dataviews` configuration. The 3-axis registry is preserved (CIAB-compatible).
- v2 `viewConfigs` admin.json block → **`settings.dataViews`**, keyed `kind → name → variant`. 3-axis (not flattened).
- v2 `fieldCollections` → **`settings.dataFields`** at top level. Per-descriptor word `field` stays unchanged.
- v2 `default-route` → **`workspace.default-screen`**.
- v2 `bindings` → **`commands`** (with explicit `id` field).
- v2 `dashboardWidgets` → dissolved into screen `apps[]` with `slot` field.

### Cascade semantics

- Deep-merge per-field uniformly across all blocks.
- Arrays merge by `id` (entries with matching id deep-merge; new ids append; tombstones via `__tombstone: true`).
- Tombstones via `null` at any nesting depth (theme.json convention).
- Path collisions → resolve-time error.
- Restrict-only enforcement preserved (AND-fields tighten by add; OR-fields tighten by remove).

### Permissions (OR-semantic with trust tiers)

`screens[id].permissions` block:
- `capabilities[]` array — user passes if they hold ANY listed cap.
- `roles[]` array — user passes if they belong to ANY listed role.
- Between fields: OR (user passes via cap OR role).
- App manifest's `capabilities[]` AND-floor is the hard backstop, untouchable by any origin.
- Trust-tier cascade rule:
  - `core` / `engine` / `plugin` / `site`: may add OR remove from OR-set.
  - `role` / `user`: may only REMOVE (shrink-only).
- Unknown cap/role → fail-closed (deny + dev-mode warning).
- Magic `"super-admin"` role triggers `is_super_admin()`.
- Default when block absent: admin-only (`administrator` role + `super-admin` magic).

### Modes (engine-declared chrome catalog)

- Engine ships `modes` block keyed by name. Four standard names: `default`, `focus`, `takeover`, `modal`.
- Each mode maps to per-region states (`hidden`, `compact`, `minimal`, `fullWidth`, etc.).
- `extends` field enables mode inheritance (depth limit 10, circular-ref detection).
- Plugin-contributed modes via `wp_admin_shell_engine_modes_{engineId}` filter.
- Region hiding is paint-only (CSS `display: none`); mount tree stable across mode flips.
- Modal stack: LIFO engine-managed.
- Transitions: engine-owned, undocumented (~180ms smooth + interruptible).

### Slots (3 tiers, 2 scopes)

Tiers:
- **Kernel-reserved**: `_self`, `palette`. Always available.
- **Engine-declared**: `detail`, `inspector`, `toolbar`, `sidebar-footer`, `status-bar`, `window`, `banner`, `snackbar`, `dashboard-grid`. Declared in `engine.json#slots` with `scope` field.
- **App-declared**: apps that host sub-mounts (e.g. `core:dashboard-host`) declare `slots` in their manifest.

Scopes:
- **Workspace-scope** on screens: `screens[id].slot` = which URL slot the screen mounts in.
- **Screen-scope** on apps array: `screens[id].apps[i].slot` = which sub-region inside the screen mounts the app.

`slot` and `mode` are orthogonal — declare both when both apply.

### Menu (nested tree)

- No separate groups/items split. Every entry is a menu item.
- Items with `items` map are containers; children render as drilldowns / nested folders / accordion sections per engine `menu-renderer`.
- Implicit screen binding: item key matching a screen id flows `label` / `icon` / `permissions` from the screen.
- Free-floating items (external links, separators, group headers): declare their own `label` / `icon` / `href` / `separator: true`.
- Drilldown state in URL slot `?screen=<id>`. `__root` sentinel = user explicitly closed drilldown via back button. Path-based inference reopens drilldown when URL primary matches a child's href.
- Drill-down children do NOT inherit parent icon — each item explicit.

### Screens

- Single-app shorthand: `app` + `config` on the screen.
- Multi-app long form: `apps[]` array; each entry `{ id (required), app, config, slot, size?, position? }`. Resolver normalizes shorthand to long form internally.
- Mount in slot: `screens[id].slot` (workspace-scope; default `_self`).
- Mode: `screens[id].mode` (default `default`).
- Per-screen `preload[]` for screen-specific REST hydration.
- Permissions block (see above).
- Inline `dataView` overlay deep-merges with the resolved `(kind, name, variant)` triple from `settings.dataViews`. The triple is selected via `dataViewRef`, explicit `dataViewVariant`, or by inferring from `screen.app`'s manifest.
- `regions` override block for per-screen mode tweaks.

### Workspace widgets (persistent across screens)

- `workspace.widgets.<slot>: [{ id, app, ... }]` keyed by engine-declared workspace slot.
- Cascade merge by `id` per slot array.
- Persist mounts across screen navigation (subject to active screen's mode).
- No widget registry — widgets are just apps in slots.
- Implicit eligibility — any app, any slot.
- App-manifest `slotHints` provides defaults (size/position) for grid-style slot hosts.

### Programmatic API

- `wp_admin_shell_register_workspace($slug, array $admin_json)` — accepts v3 shape only. Returns `true` or `WP_Error`.
- Convention discovery at `{plugin}/workspaces/{slug}.json` runs alongside.

### Plugin extension hooks (additions for v3)

- `wp_admin_shell_engine_modes_{engineId}` — plugin-contributed modes.
- `wp_admin_shell_register_menu_renderer($id, $callback)` — plugin-contributed menu renderers.
- `wp_admin_shell_register_workspace($slug, $array)` — programmatic workspace registration.

Existing v2 hooks survive (`wp_admin_shell_data_{origin}`, etc.). The view-config filter is renamed to `wp_admin_shell_data_view_config_{kind}_{name}[_{variant}]`; per-variant suffix restored. The v2 name `wp_admin_shell_view_config_{kind}_{name}` fires alongside with a `_deprecated_hook` notice for one release cycle.

## Open / deferred decisions

Items that surfaced during design but were deliberately deferred:

1. **v2 shells decision.** Phase 3b's PostsApp rewrite (`useScreenView(screenId)`) broke v2 shells because v2 routes don't inject `screenId`. Three options:
   - **(C1) Drop v2 shells entirely** — migrate 5 remaining bundled shells (`content-author`, `client-portal`, `developer-admin`, `v2-demo`, `single-pane-demo`, `desktop-demo`) to v3 shape. Aligns with no-back-compat policy.
   - **(C2) v2 back-compat layer** — v3 compiler synthesizes `dataViewVariant` from `route.config.variant` — v2 shells render under v3-built apps without modification.
   - **(C3) Leave v2 broken** — users migrate at their own pace.
   Lean: C2 for transition (Phase 3a–3d intermediate); C1 for endpoint (Phase 3d.1 cleanup).

2. **Mode-transition animation contract.** Spec note that transitions are smooth + interruptible across engines; per-engine specifics stay engine-owned. Spec doc needs the formalization.

3. **Per-renderer menu capability declarations.** Each engine `menu-renderer` should document what it supports (max nesting depth, separator rendering, drilldown vs accordion). Spec contract table.

4. **Cascade audit log surface.** Site-admin-visible UI for cascade rejections (loosening attempts, unknown caps, path collisions). REST endpoint? Settings page?

5. **Variant URL routing.** **Resolved (closed by dataview-registry restoration).** Variant selection happens via `dataViewRef` (path-driven: each variant is a separate screen) OR state inside one screen (`useDataView({kind, name, variant})` driven by tab/query state). Both shapes are legal; conventions for choosing TBD.

6. **App-internal slot/fill** vs schema declaration. Apps still expose slot/fill internally (PluginSidebar pattern); whether to surface these in the schema is post-v3.

7. **Multi-app layout algorithm.** Engine's layout algorithm for arranging multi-app screens isn't formalized. Currently relies on engine-specific region templates + slot mapping.

## Phase 3c proper — remaining apps + bridges

Detailed deliverables waiting for implementation:

### 3c.1 — Dashboard-host rewrite — ✅ Shipped

- Reads `screens[id].apps[]` with `slot: "grid"` (replaces v2 `dashboardWidgets` block).
- Uses the app-declared `grid` slot from `app.json#slots` exposure.
- Size + position hints from app-manifest `slotHints` + per-entry `size`/`position` override.
- `wp_admin_shell_register_dashboard_widget()` API survives — under the hood contributes a screen-app entry with `slot: "grid"` into the target screen (`dashboard-widgets` by default, configurable via `$args['screen']`).
- v2 back-compat: v3 compiler folds legacy `dashboardWidgets` block into `screens[dashboard-widgets].apps[]` at resolve time with a `_doing_it_wrong` notice under `WP_DEBUG`.
- New pure compiler `src/apps/dashboard-host/composeScreenWidgets.mjs` (replaces `src/runtime/dashboardGrid/composeWidgets.mjs`; legacy kept for v2 shells).
- Tests: 45 PHP assertions in `run-dashboard-widgets-tests.php`, 25 JS assertions in `tests/runtime/compose-screen-widgets.test.mjs`.

### 3c.2 — Command palette rewrite (~<1 day) — ✅ Shipped

- Read `commands[]` array directly.
- Generate "Go to X" palette entries from `screens[id]` map (path + label + icon).
- Drop the routes-block iteration path used by v2.

### 3c.3 — Classic wp-admin menu bridge (~5-8 days)

- New PHP class `WP_Admin_Shell_Classic_Menu_Bridge`.
- Walks `$GLOBALS['menu']` + `$GLOBALS['submenu']`. Ingests only third-party plugins (registration source path outside `wp-admin/` + `wp-includes/`).
- For each registration, synthesize TWO entries:
  - `screens[id]` describing the surface (label / icon / path / app / permissions).
  - `menu.<container>.items[id]` describing placement.
- Synthesized origin sits between `core` and `plugin` in cascade.
- Default container `menu.ingested.items` (label "Plugins").
- Icon mapping: data-URIs → icon-registry names; dashicons → registry names.
- Slug→path mapping (`edit.php?post_type=product` → `/admin/edit-php-post-type-product` or known core mappings).
- Hook timing: run after `admin_menu` fires on every shell-page load.
- Tests: new `run-classic-menu-bridge-tests.php` (~20-30 PHP assertions).

### 3c.4 — Multi-app layout algorithm (~1-2 days, may be deferred)

Engine reads `screens[id].apps[]` and arranges multiple apps. Today only the first/primary app mounts via the synthesized route. Multi-app screens (e.g. `posts` + paired `core:editor` in detail slot) need:
- Compiler synthesizes route configs for each `apps[]` entry, slotted into the appropriate URL slot.
- Engine layout algorithm arranges visible regions.

## Phase 3d — migration + final tests

### 3d.1 — Migrate 5 remaining bundled shells (~2-3 days)

In order of complexity:
- `content-author.json` (smallest)
- `client-portal.json`
- `v2-demo.json`
- `single-pane-demo.json` (engine: core:single-pane)
- `developer-admin.json` (largest, multi-feature)
- `desktop-demo.json` (engine: core:desktop)

Each migration: rename to `<name>.v3.json`, restructure to v3 shape using `wp-admin-default-v3.json` as the canonical template.

### 3d.2 — v2 → v3 migration helper (~2-3 days)

CLI command `wp admin-shell migrate-shell <slug>` that reads a v2 shell file and writes a v3-shape equivalent. Handles:
- routes block → screens entries.
- viewConfigs → settings.dataViews (3-axis preserved; each `(kind, name, variant|_default)` entry maps 1:1).
- fieldCollections → settings.dataFields.
- bindings → commands (synthesizes ids).
- regions block → workspace.widgets where applicable.
- routes' `config.variant` flows through as `screen.config.variant` on the synthesized screen — the v3 compiler does this automatically + the resolver's step-3 manifest-inference path reads it. The migration helper only needs to drop the routes block; screens are synthesized at boot via the v3 compiler's `synthesize_v2_screens_from_routes`.

### 3d.5 — Pre-v3.1 shim-removal hardening (~1-2 days)

Three items to address before the v3.1 cut removes the deprecation shims landed by the dataview-registry restoration (PR #50). All informational at v3-cut; load-bearing at v3.1-cut.

1. **v2 `viewConfigs` block migration warning.** v2 admin.json's top-level `viewConfigs` block becomes dead data under v3 — per-route-variant back-compat works via manifest inference, but admin-customized `viewConfigs` overrides silently drop on upgrade. Options (pick one):
   - Add the CLI command described in 3d.2 above with a `--dry-run` mode so site admins can preview the rewrite.
   - Add an admin notice on shell-load detecting a non-empty `viewConfigs` in any cascade origin, pointing at upgrade docs.
   - Add a server-side log entry (via `_doing_it_wrong`) when the resolver encounters orphan `viewConfigs` data.

2. **JS deprecation `console.warn` gating asymmetry.** The JS shims (`useScreenView`, `useViewConfig`, `hydrateInlineScreenView`) only warn when `process.env.NODE_ENV !== 'production'`. The PHP `_deprecated_hook` fires unconditionally (gated by `WP_DEBUG_LOG` only). Plugin authors testing in production builds get no JS signal + then break at v3.1-cut. Resolve by either:
   - Dropping the production gate — one-shot guard already in place, cost is one warn per page load.
   - Adding a server-side companion notice (PHP detects a v2-name filter attached + emits admin notice + logs).
   - Gating on a separate `wpAdminShell.debug` flag in `window` config so site admins can opt in regardless of build mode.

3. **Filter ordering documentation.** Legacy `wp_admin_shell_view_config_*` fires AFTER the new-name `wp_admin_shell_data_view_config_*` filter (`includes/cascade/class-wp-admin-shell-data-view-config.php:117 → 128`). Plugin authors migrating may expect their v2-name filter to run first. Document in the upgrade guide that v2-name filters are downstream and may see modifications applied by v3 plugins.

### 3d.3 — Test surface rewrites (~5-10 days)

Currently 990 assertions green. After v2 shell deprecation:
- Drop tests targeting v2-shape-only surfaces.
- Add v3-shape coverage for migrated shells.
- Add classic wp-admin menu bridge tests.
- Add multi-app layout tests (if 3c.4 lands).

Target: ~1000-1200 v3-shape assertions.

### 3d.4 — Documentation sweep (~1-2 days)

- Update `CLAUDE.md` status section + key rules to reflect v3 reality.
- Update `docs/wp-admin-shell-design-spec.md` §5 / §6 / §13 for v3 architecture.
- Update `docs/public/*-reference.md` to point at v3 schemas as the active surface.
- Promote `docs/v3/schema-sketch.md` to canonical design doc OR consolidate into spec.

## Known issues (smoke-testing surfaced)

Tracked separately from "remaining work" — these are bugs found during the Phase 3c slice browser smoke that may need follow-up commits before PR merge.

- v2 shells (default + 5 demos) currently render DataViews-less in entity-CRUD apps. Phase 3d migration resolves.
- Some entity apps (users / comments / plugins / themes) had missing `defaultView.fields` + mismatched field IDs. Fixed in `8b0948c`.
- DataViews silently returns null when `defaultLayouts[view.type]` is empty. Fixed by adding `defaultLayouts` to view defs in `c945b15`.
- Drilldown auto-inference from URL primary path landed in `ac8d058`; back-button suppression sentinel landed in `5ccde5e`; operator-precedence bug fixed in `eff4ed5`.
- View-config primitive collapsed CIAB 3-axis registry to 2-axis (PR #...) — restored via `docs/plans/2026-05-20-dataview-registry-restoration.md`.
- **Breaking change — command palette emitted names** (PR #51). Pre-3c.2: `core/admin-shell/goto-<encoded-pattern>`. Post-3c.2: `core/admin-shell/palette-<encoded-id>` (unified across `commands[]` + `screens[]` for first-write-wins dedup). Any external consumer of `@wordpress/commands` keyed off the old names breaks. No known consumers — but plugin authors extending the palette via `useCommandLoader` with the same registration name should re-key off the new prefix. Document in v3.0 upgrade notes.

## How to preserve through PR feedback

If review surfaces changes to the schema shape:
1. Update `docs/v3/schema-sketch.md` first (single source of truth for design).
2. Update this roadmap if a phase / open issue resolves.
3. Make the implementation change to match.
4. Update tests + commit.

Schema-level conventions to preserve regardless of PR-review-driven refactors:
- id-keyed everywhere (no array-positional addressing).
- Theme.json patterns where they fit (global registry + inline overlay).
- Nested menu tree (not flat).
- OR-semantic permissions with trust tiers.
- Engine-pluggable modes catalog with `extends`.
- Three-tier slot vocabulary (kernel + engine + app).
- v3 compiler synthesizes routes / regions / default-route from v3 shape; runtime kernel reads v2-shape internal output.
