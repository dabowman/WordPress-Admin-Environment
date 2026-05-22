# v3 roadmap

Tracks remaining work + locked design decisions for the v3 schema reshape. Living doc — updated as PR feedback lands and phases ship.

## Status snapshot

PR #49 against `main` (branch: `feat/wp-admin-shell-v3`).

| Phase | Status | Commits |
|---|---|---|
| **3a** — schemas + cascade null-tombstone | ✅ Shipped | `586ade2` |
| **3b** — resolvers (view-config / menu / permissions / modes) | ✅ Shipped | `12ce8dd`, `9be3aa3` ⚠️ view-config resolver was lossy (collapsed CIAB 3-axis registry); restoration plan in `docs/plans/2026-05-20-dataview-registry-restoration.md` corrects this. |
| **3c slice** — minimum end-to-end (compiler + engine defaultRegions + v3 default workspace mounting) | ✅ Shipped | `7980ca7`, `9e6b73a`, `6389449`, `14ed501`, `c945b15`, `8b0948c`, `ac8d058`, `5ccde5e`, `eff4ed5` |
| **3c proper** — dashboard-host rewrite (3c.1), command palette rewrite (3c.2), classic wp-admin menu bridge (3c.3), multi-app layout (3c.4) | ✅ Shipped | 3c.1: `0cc48fb`; 3c.2: `7d460a5`; 3c.3: `968a3da`; 3c.4: `134637f` |
| **3d.0** — dataview-registry restoration (3-axis CIAB shape; view-config → dataView) | ✅ Shipped | `61c41eb` (PR #50) |
| **3d.1** — migrate 6 remaining bundled shells to v3 + retire v2 default | ✅ Shipped | `f624231` (PR #56) |
| **3d.2** — v2 → v3 migration helper (`wp admin-shell migrate-shell <slug>`) | ✅ Shipped | `51249de` (PR #58) |
| **3d.5** — pre-v3.1 shim-removal hardening (legacy-block warnings, debug-gated JS warns, filter-ordering docs) | ✅ Shipped | `8f39e5f` (PR #57) |
| **3d.3** — test surface rewrites (drop v2-only tests, add v3-shape coverage, port `run-cap-gating-smoke.php` to v3 region walker) | 🟡 In progress | — |
| **3d.4** — documentation sweep (CLAUDE.md status + master spec §5/§6/§13 + public reference docs + schema-sketch consolidation) | ✅ Shipped | this PR |

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

### 3c.3 — Classic wp-admin menu bridge ✅ Shipped

- New PHP class `WP_Admin_Shell_Classic_Menu_Bridge` at `includes/cascade/class-wp-admin-shell-classic-menu-bridge.php`.
- Walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` eagerly at filter time (inside `wp_admin_shell_data_plugin`, priority 6 — after menu-items / admin-routes / dashboard-widgets at 5 — so an explicit `wp_admin_shell_register_menu_item()` call wins via the idempotency guard).
- Core detection: **static slug list** covering every default wp-admin top-level + well-known submenu script, plus `edit.php?post_type={post,page,attachment}`. Extensible via the new `wp_admin_shell_classic_menu_core_slugs` filter — plugins / sites adding a CPT screen natively expand the skip list this way.
- For each ingested third-party entry the contribute() pass writes TWO additions to the resolved doc:
  - `screens[ingested-<slugified>]` — label / icon / path (`/admin/<slugified>`) / app (`iframe:<original-slug>`) / `permissions.capabilities[<menu-cap>]`.
  - `menu.ingested.items[ingested-<slugified>]` — placement under a hardcoded "Plugins" container at the menu root.
- Submenu nesting: children of third-party parents nest under the parent's ingested id. Children of CORE wp-admin parents (e.g. plugins adding pages under `tools.php`) get a synthesized container record carrying the core parent's label, so the children still surface. Children that themselves match core slugs are skipped to avoid double-bridging.
- Icon mapping: `dashicons-foo` → `foo` (resolved via engine icon registry); `data:image/svg+xml;…` → fallback `menu` (SVG harvesting deferred); empty / `none` / `div` → `menu`. No icon-registry registration at scan time.
- Idempotency: bridge checks `isset( $doc['screens'][<id>] )` and `isset( $doc['menu'][ingested][items][<id>] )` before writing, so admin.json declarations win at every cascade origin AND repeat filter invocations don't duplicate.
- Container preservation: bridge writes only to `menu.ingested.items`. An admin.json declaration like `menu.ingested.label = "Custom"` at site origin survives the bridge pass entirely.
- v2 back-compat: not needed (3c.3 is v3-only). v2 shells continue using `add_menu_page()` directly.
- Tests: new `tests/php/run-classic-menu-bridge-tests.php` (63 PHP assertions) covers screen/path derivation, core-slug detection + filter expansion, icon mapping, scan walks, submenu nesting (third-party + core parents), idempotency, admin.json-declared-screen-wins, container preservation, and coexistence with `wp_admin_shell_register_menu_item()`.
- Spec docs: extension point #14 (`wp_admin_shell_classic_menu_core_slugs`) added to spec §13.
- Out of scope (tracked as follow-ups): SVG icon harvesting + dynamic icon registration from data-URIs; multi-pane parent screens (deferred to 3c.4); removing the original entries from `$GLOBALS['menu']` (bridge is purely additive).

### 3c.4 — Multi-app layout algorithm — ✅ Shipped

Engine reads `screens[id].apps[]` and arranges multiple apps. Today only the first/primary app mounts via the synthesized route. Multi-app screens (e.g. `posts` + paired `core:editor` in detail slot) need:
- Compiler synthesizes route configs for each `apps[]` entry, slotted into the appropriate URL slot.
- Engine layout algorithm arranges visible regions.

**Implementation:** survey came in at ~4-6h actual vs 1-2d estimate. Routing infrastructure already worked end-to-end; only the compiler's `synthesize_routes` skipped non-primary entries. Now walks every `apps[]` entry — entries with a `slot` emit `@<slot>/<path>` slot-namespaced routes that engine regions declaring `routing.route-key: "<slot>"` pick up. Entries without a slot stay app-internal (e.g. dashboard host's `slot: "grid"` widgets mount inside the host, not via engine slots). Existing `routes` block (escape hatch) wins on collision.

**Runtime contract:** `core:default` engine `defaultRegions` gains a `detail` region declaring `routing: { "route-key": "detail", "mode": "mirror" }`. The `mode` field selects between two slot-resolution strategies: `query` (default, preserves existing palette behavior — slot value comes from `?<key>=...` URL query param) and `mirror` (synthesizes the slot value as `@<route-key><primary>` from the URL primary path so the v3 compiler's `@<slot>/<primary>` route synthesis becomes findable without URL-query pollution). Engine peer regions opt into `mirror`. `<PersistentRegion>` emits `data-app-mounted="true|false"` ONLY on mirror-mode regions; engine CSS collapses empty mirror-mode containers via `[data-app-mounted="false"]:not([data-keep-visible-when-empty="true"])`. Single-app screens, the `_self` content region, and query-driven regions (palette) keep their existing always-rendered behavior.

**Tests:** 14 PHP compiler-synthesis assertions + 11 Node routing assertions (pattern validity for `@<slot>/<path>`, `readSlot` mirror mode synthesis).

## Phase 3d — migration + final tests

### 3d.1 — Migrate 5 remaining bundled shells — ✅ Shipped

All 6 remaining bundled shells migrated to v3 shape; the v2
`shells/wp-admin-default.json` removed (its v3 counterpart took the slug back):

- `shells/content-author.v3.json` (writer; collapsed nav).
- `shells/client-portal.v3.json` (branded; Acme logo + red accent preserved).
- `shells/v2-demo.v3.json` (canonical-shape demo, user-switchable).
- `shells/single-pane-demo.v3.json` (engine: `core:single-pane`).
- `shells/developer-admin.v3.json` (largest; viewConfigs → settings.dataViews,
  fieldCollections → settings.dataFields, design + system drill-downs become
  menu containers).
- `shells/desktop-demo.v3.json` (engine: `core:desktop`; dock items preserved
  through the `regions` escape hatch).
- `shells/wp-admin-default.json` (was `-v3`; the `-v3` suffix dropped post-v2-removal).

Schema sweep extended to validate v3-shaped shells; cap-gating-smoke PHP test
short-circuits with SKIP on v3 shells (the v2 nav-items capability pruning it
exercised is now a screen/menu concern — port deferred to 3d.3).

### 3d.2 — v2 → v3 migration helper (~2-3 days)

CLI command `wp admin-shell migrate-shell <slug>` that reads a v2 shell file and writes a v3-shape equivalent. Handles:
- routes block → screens entries.
- viewConfigs → settings.dataViews (3-axis preserved; each `(kind, name, variant|_default)` entry maps 1:1).
- fieldCollections → settings.dataFields.
- bindings → commands (synthesizes ids).
- regions block → workspace.widgets where applicable.
- routes' `config.variant` flows through as `screen.config.variant` on the synthesized screen — the v3 compiler does this automatically + the resolver's step-3 manifest-inference path reads it. The migration helper only needs to drop the routes block; screens are synthesized at boot via the v3 compiler's `synthesize_v2_screens_from_routes`.

### 3d.5 — Pre-v3.1 shim-removal hardening — Shipped

All three items landed on `feat/v3-3d5-hardening`. The deprecation shims
landed by PR #50 (dataview-registry restoration) are now safer to live
through the v3.0.x release cycle:

1. **v2 `viewConfigs` block migration warning — shipped.**
   `WP_Admin_Shell_Data_View_Config::warn_legacy_view_configs()` hooks
   `wp_admin_shell_data` at priority 999 and emits `_doing_it_wrong`
   once per request when the post-cascade resolved doc still carries a
   non-empty top-level `viewConfigs` block. One-shot guard suppresses
   repeats. Does NOT auto-translate — that's the
   `wp admin-shell migrate-shell` CLI's job (3d.2).

2. **JS deprecation warns gated on `wpAdminShell.debug` — shipped.**
   PHP `wp-admin-shell.php` injects
   `'debug' => defined('WP_DEBUG') && WP_DEBUG` into the inline-script
   payload. The three JS shims (`useScreenView`, `useViewConfig`,
   `hydrateInlineScreenView`) now warn when
   `NODE_ENV !== 'production'` OR `window.wpAdminShell.debug === true`.
   Site admins running production builds with `WP_DEBUG` on now see the
   JS warning even though the bundle is minified. One-shot guards
   preserved.

3. **Filter ordering documentation — shipped.** New
   [`docs/upgrade-v2-to-v3.md`](../upgrade-v2-to-v3.md) covers the full
   migration timeline including the documented filter-ordering
   reversal — legacy `wp_admin_shell_view_config_*` is downstream of
   the new-name filter and sees its modifications.

### 3d.3 — Test surface rewrites (~5-10 days)

Currently 990 assertions green. After v2 shell deprecation:
- Drop tests targeting v2-shape-only surfaces.
- Add v3-shape coverage for migrated shells.
- Add classic wp-admin menu bridge tests.
- Add multi-app layout tests (if 3c.4 lands).

Target: ~1000-1200 v3-shape assertions.

### 3d.4 — Documentation sweep — ✅ Shipped

Five-unit sweep on branch `feat/v3-3d4-doc-sweep`:

1. **`CLAUDE.md` sweep.** Status block now enumerates phases 3a–3d.5
   with shipped/in-progress markers; v1/v2 bullets marked historical;
   v3 set as the active shape. Pre-reads reordered to surface v3 design
   doc + roadmap + upgrade guide + dataview-config + public references
   first; v2 plan archived. Test surface refreshed (~1300 assertions)
   with new PHP test files surfaced (`run-classic-menu-bridge-tests.php`,
   `run-v3-compiler-tests.php`, `run-mode-resolution-tests.php`,
   `run-migrate-shell-cli-tests.php`). Project structure tree updated
   with new PHP cascade classes + runtime modules. Navigation +
   multi-area layout sections rewritten around v3 vocabulary.
2. **Master spec sweep** (`docs/wp-admin-shell-design-spec.md`).
   Header v3 reshape note added; §4.3 admin.json example prefixed
   with v3 admonition; §5 documents where v3 region declarations
   live (workspace.widgets + engine defaultRegions + per-screen
   overrides); §6.2 routes-block clarified as runtime-internal with
   v3 author-shape example; §14 gains v2 → v3 migration paragraph;
   §15 roadmap gains v3 status header; §19 references surface v3
   docs first.
3. **schema-sketch.md promotion.** Reframed from "Working draft" to
   "Canonical v3 schema design doc"; bidirectional cross-link with
   master spec; open-questions section refreshed (variant URL routing
   marked resolved by dataview-registry restoration).
4. **Public reference docs sweep.** `admin-json-reference.md` fully
   rewritten around v3 shape (workspace/settings/screens/menu/commands
   blocks + v2-surfaces-deprecated table); `app-json-reference.md`
   viewConfig → dataView with variants family + new slots / slotHints
   sections; `engine-json-reference.md` gains the three v3-added
   blocks (modes / slots / menu-renderer / defaultRegions). All point
   at v3 schemas + cross-reference `docs/upgrade-v2-to-v3.md`.
5. **Roadmap clean** — this entry.

## Known issues (smoke-testing surfaced)

Tracked separately from "remaining work" — these are bugs found during the Phase 3c slice browser smoke that may need follow-up commits before PR merge.

- v2 shells (default + 5 demos) currently render DataViews-less in entity-CRUD apps. Phase 3d migration resolves.
- Some entity apps (users / comments / plugins / themes) had missing `defaultView.fields` + mismatched field IDs. Fixed in `8b0948c`.
- DataViews silently returns null when `defaultLayouts[view.type]` is empty. Fixed by adding `defaultLayouts` to view defs in `c945b15`.
- Drilldown auto-inference from URL primary path landed in `ac8d058`; back-button suppression sentinel landed in `5ccde5e`; operator-precedence bug fixed in `eff4ed5`.
- View-config primitive collapsed CIAB 3-axis registry to 2-axis (PR #...) — restored via `docs/plans/2026-05-20-dataview-registry-restoration.md`.
- **Breaking change — command palette emitted names** (PR #51). Pre-3c.2: `core/admin-shell/goto-<encoded-pattern>`. Post-3c.2: `core/admin-shell/palette-<encoded-id>` (unified across `commands[]` + `screens[]` for first-write-wins dedup). Any external consumer of `@wordpress/commands` keyed off the old names breaks. No known consumers — but plugin authors extending the palette via `useCommandLoader` with the same registration name should re-key off the new prefix. Document in v3.0 upgrade notes.
- **Inline `default-style` forces engine CSS into `!important`** (PR #55). The kernel applies template `default-style` blocks as inline `style="..."` on region wrappers. When engine CSS needs to override a default-style property (e.g. `display: none` collapsing a mirror-mode region whose template ships `display: flex`), inline-style specificity beats stylesheet declarations and only `!important` wins. Acceptable surgical fix today, but the root cause is the inline-style emission convention. **Future direction** (v3.0 polish queue): add a template-level field like `default-style.collapsible: true` so the kernel skips emitting the offending inline properties when `data-app-mounted="false"`, letting engine CSS win without `!important`. Out of scope for 3c.4 — file for a later polish pass.
- **`routing.mode` enum naming bikeshed** (PR #55). `"mirror"` reads cleanly in code but is slightly opaque vocabulary. Alternatives like `"path"` or `"primary"` describe the slot source more directly. Bikeshed-grade; revisit if pre-v3.0 doc sweep surfaces a clearer term. Acceptable as-is.
- **`desktop-demo.v3.json` dock items duplicate screens** (PR #56). The desktop-engine dock-app reads `config.items[]` directly with label/icon/href — same data the screens block carries. Preserved via the `regions.dock.config.items[]` escape hatch during 3d.1 migration; no v3-idiomatic mapping yet. **Future direction:** dock-app consumes the `menu` tree (or a filtered subset) the same way the navigation app does. Removes the duplication + keeps menu as single source of truth for label/icon/order. Out of scope for 3d.1; file for v3.0 polish or 3c.x desktop-engine follow-up.
- **Orphan-`viewConfigs` warning doesn't name origin** (PR #57). `warn_legacy_view_configs()` runs on the post-cascade resolved doc, so the `_doing_it_wrong` notice tells the admin the block exists but not which origin contributed it (plugin / site option / role / user override). CLI spot-checks the file shape but admin-customized origins (`get_option`, role overrides, per-user prefs) are invisible. **Future direction:** wrap the warning loop around each pre-merge origin source so the notice names the contributor. Out of scope for 3d.5; surface for v3.0.x if support tickets land.

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
