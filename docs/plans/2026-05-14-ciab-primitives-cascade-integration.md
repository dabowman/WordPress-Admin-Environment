# Port CIAB Admin's infra primitives into the shell cascade

**Date:** 2026-05-14
**Status:** Approved plan; not yet implemented.
**Source:** Refined through Ultraplan from the 2026-05-13 Riad conversation + CIAB code walkthrough at `/Users/davidbowman/Github/ciab-admin`.
**Companions:** `docs/research/ciab-admin-comparison.md`, `docs/research/ciab-primitives-cascade-integration.md`.

## Context

CIAB Admin grew out of WordPress Core's Next Admin — an infrastructure project to rebuild wp-admin as a React SPA — before management redirected it into a single-product track that was paused 2026-04-28. Before the pivot, Cvetan / Riad / Moltres shipped six infra primitives (REST preload, view-config API, field collections, dashboard widgets, menu-item / admin-route registration) that solve real problems the WP Admin Shell hasn't tackled yet. After the 2026-05-13 conversation with Riad, the integration thesis is clear: CIAB's primitives can plug into the shell's 6-origin cascade because the cascade is the layer CIAB never got to build.

**Goal.** Adopt all six primitives as first-class participants in the cascade (additive schema fields + new REST controllers + JS hooks), with deliberate trade-offs codified up front so plugins can migrate via `s/next_admin_/wp_admin_shell_/g` for ~80% of registrations.

**Out of scope.** Native `wp_register_script_module` build migration; `@automattic/design-system` package adoption (engine-pluggability concern handled separately by the app-side DS facade — see `project_ds_pluggability_contract`).

**Outcome.** Five-phase adoption (C1–C5), ~30 days single-track or ~3–4 weeks parallelized. After C5, the only CIAB infra primitives the shell still lacks are the deferred ones above.

---

## Cross-cutting decisions (load-bearing for every phase)

1. **View configurations are top-level, entity-keyed.** New `view-configs[kind][name][variant?]` at admin.json root, matching CIAB. One view-config can be consumed by multiple apps (PostsApp + future palette search + future card view). Filter chain `wp_admin_shell_entity_view_config_{kind}_{name}` mirrors CIAB.
2. **`fields_module` is a registered handle, NOT a dynamic import path.** Plugins ship JS that calls `registerFieldCollectionModule(id, exports)` from a normal WP-enqueued script. `preloadFieldCollections()` waits for handles to register; never `import(stringFromServer)`. Trade-off: less drop-in but bundler-safe.
3. **Dashboard widgets are a standalone registry (kind=`widget`).** Lightweight (`render_module` + `widget_module` + optional capability) — does NOT inherit the full app manifest weight (ARIA role, theme scope, 4 cap layers). Consumed by `core:dashboard-grid` region template via `core:dynamic-children`.
4. **Plugin contributions flow through a synthetic plugin-origin fragment.** New `WP_Admin_Shell_Plugin_Contributions` accumulator collects writes from `wp_admin_shell_register_*` shims and folds them in via `wp_admin_shell_data_plugin` filter. Lets site / role / user origins continue to override + tombstone individual items via existing cascade machinery.
5. **CIAB filter / function names are mirrored, only the prefix changes.** `next_admin_register_menu_item` → `wp_admin_shell_register_menu_item`. Migration is the use case.
6. **Schema additions are additive only.** No existing admin-v2 / admin-app-v2 / admin-engine-v2 key changes shape. v2.0.0-beta.2 contract preserved.

---

## C1 — REST preload (~2 days, executable today)

### Schema diff — `docs/schemas/admin-v2.json`

Add top-level `preload[]` + `$defs.preloadEntry` (string | `[path, method]` | `{ path, method?, capability? }`). Each entry's `path` must start with `/`. Methods limited to `GET | OPTIONS`.

### PHP

New file `includes/preload/class-wp-admin-shell-preload.php`:
- `WP_Admin_Shell_Preload::collect_entries( $config )` — reads `$config['preload']` post-cascade, normalizes to `rest_preload_api_request`-compatible tuples, drops entries the current user lacks capability for, applies `wp_admin_shell_preload_paths` filter.
- Called from `wp-admin-shell.php` `admin_enqueue_scripts` hook (after `wp_enqueue_script( 'wp-admin-shell' )`). Runs `array_reduce(..., 'rest_preload_api_request', [])` and `wp_add_inline_script( 'wp-api-fetch', 'wp.apiFetch.use( wp.apiFetch.createPreloadingMiddleware( ... ) )', 'after' )`.

### Cascade merge tightening

`includes/cascade/class-wp-admin-shell-merge.php`: tighten `detect_key_field()` to require ALL entries carry the candidate key, not just the first. Lets `preload[]` (no id field) merge as a plain replace-array while keyed lists (`menu-items`, `routes`) detect cleanly. Required for C3 too — front-load here.

### Test additions

- `tests/schema/fixtures/v2/admin/positive/03-with-preload.json` + 2 negatives (bad path / bad method).
- `tests/php/run-cascade-tests.php` — 3 assertions: plugin+site additive merge w/ `customizable: ["preload"]`; without it; role tombstone via `__removed`.
- `tests/php/run-shape-tests.php` — assert `WP_Admin_Shell_Preload::collect_entries` returns canonical tuples.

### Files modified

- `docs/schemas/admin-v2.json`
- `wp-admin-shell.php` — require + enqueue hook wiring
- `includes/preload/class-wp-admin-shell-preload.php` (new)
- `includes/cascade/class-wp-admin-shell-merge.php` — `detect_key_field` tightening
- 3 fixture files + 2 PHP test files

### Risks

- `rest_preload_api_request` triggers internal REST dispatch — too many preload entries tank cold-mount TTFB. Dev-mode warn if `count(preload) > 10`.
- Tightening `detect_key_field` may break existing merge tests that rely on first-entry detection — run full suite before merge.

---

## C2 — view-config + field-collections (~10 days)

### Schema diff — `docs/schemas/admin-v2.json`

Add top-level:
- `view-configs[kind][name][variant?]` with `$defs.viewConfig` shape: `{ labels, default_view, default_layouts, quick_edit_form, add_form, edit_form, tabs, allowed_fields, customizable }`.
- `field-collections{[id]}` with `$defs.fieldCollection` shape: `{ id, kind, name|null, fields, fields_module?, capability?, customizable? }`.

Extract shared `$defs.customizableDecl` (currently ad-hoc) for reuse.

### PHP API

New files:
- `includes/view-configs/class-wp-admin-shell-view-config-rest.php` — `GET /wp-admin-shell/v1/view-config?kind=&name=&variant=`. Reads cascade-merged baseline + applies `apply_filters( "wp_admin_shell_entity_view_config_{$kind}_{$name}", $config, $name, $variant )` per request. Variant filters override variant-less.
- `includes/view-configs/class-wp-admin-shell-view-config-registry.php` — view-config registration funnels into plugin contribution accumulator (introduced in C3 — front-load the accumulator class here).
- `includes/field-collections/class-wp-admin-shell-field-collections-rest.php` — `GET /wp-admin-shell/v1/field-collections?kind=&name=`. Returns matches by entity name + null-name universals. Applies `wp_admin_shell_field_collections_for` filter.
- `includes/field-collections/class-wp-admin-shell-field-collections-registry.php` — registry helper.

New functions in `includes/plugin-api/class-wp-admin-shell-plugin-api.php`:
```php
function wp_admin_shell_register_field_collection( $id, $kind, $name, $fields, $fields_module = null );
// view-config is filter-only — no register function. Matches CIAB.
```

### JS-side

New files:
- `src/runtime/view-configs/useViewConfig.js` — hook `useViewConfig(kind, name, variant)`. Reads `useKernel().config['view-configs']?.[kind]?.[name]?.[variant ?? '_default']` first, falls back to `apiFetch('/wp-admin-shell/v1/view-config?...')` (cached by C1 preload middleware). Return shape mirrors CIAB's `{ viewConfig, defaultView, defaultLayouts, quickEditForm, addForm, editForm, tabs, allowedFields, labels }`.
- `src/runtime/field-collections/registry.js` — `registerFieldCollectionModule(id, exports)` + `getFieldCollectionModule(id)`.
- `src/runtime/field-collections/preloadFieldCollections.js` — `async preloadFieldCollections(kind, name)`. Fetches collection list from REST, waits for matching `fields_module` handles to register (2s timeout w/ dev warn).

Existing files modified:
- `src/apps/posts/index.js` — PROOF OF CONCEPT consumer. Replace hardcoded view state (lines 41–51, 113–162) with `useViewConfig('postType', config.postType || 'post')`-driven defaults. App-instance config props (`postType`, `status`, `contentWidth`) keep precedence over view-config defaults — resolution order: app config > view-config defaults.

### Test additions

- Schema fixtures: positive `04-with-view-configs.json`, `05-with-field-collections.json`; negatives.
- `tests/php/run-view-config-tests.php` (new): filter chain order, variant override, REST schema.
- `tests/php/run-field-collections-tests.php` (new): name-match + null-name universal; plugin contribution writes.
- `tests/php/run-cascade-tests.php`: view-config baseline merges across origins; `customizable` enforced.
- `tests/runtime/view-config-hook.test.mjs` (new): inline-config path + REST fallback.
- `tests/runtime/field-collections-registry.test.mjs` (new): register + preload happy path + timeout.

### Files modified

- `docs/schemas/admin-v2.json` — 2 top-level + 2 defs + extracted `customizableDecl`.
- `wp-admin-shell.php` — requires + REST route registration.
- 4 new PHP files (rest + registry × 2).
- 1 new PHP file (`class-wp-admin-shell-plugin-contributions.php` — accumulator).
- `includes/cascade/class-wp-admin-shell-resolver.php` — register `wp_admin_shell_data_plugin` filter wiring the accumulator.
- 3 new JS files.
- `src/apps/posts/index.js` — migrated.
- ~10 new test files / fixtures.

### Risks

- Filter output not memoized → view-config-heavy shells hit the controller every navigation. Mitigate by making filter callbacks cheap; document the contract.
- `fields_module` registration timing: a module registering after `preloadFieldCollections` returns is a no-op. Hard timeout + dev warn covers it.
- PostsApp migration: existing app-instance config props (`postType`, `status`) need to coexist with view-config defaults. App config wins.

---

## C3 — menu-item + admin-route shims (~3 days)

### Schema diff — `docs/schemas/admin-v2.json`

Add top-level `menu-items[]` + `admin-routes[]` with `$defs.menuItem` (`id, to, label, icon, badge, parent, parent_type, position, region, bucket, capability, customizable`) and `$defs.adminRoute` (`path, content_module?, route_module?, before_load?, static_data?, gc_time?, app?`).

Add `path` to `WP_Admin_Shell_Merge::KEYED_ARRAY_KEYS` after `id, slug, name` (relies on C1's tightened `detect_key_field`).

### PHP API — `includes/plugin-api/class-wp-admin-shell-plugin-api.php`

```php
function wp_admin_shell_register_admin_route( $path, $content_module, $route_module = null, $before_load = false, $static_data = null, $gc_time = null );
function wp_admin_shell_register_menu_item( $id, $args, $is_meta = false );
function wp_admin_shell_deregister_menu_item( $id, $is_meta = false );
function wp_admin_shell_switch_menu_item( $old_id, $new_id, $new_args, $is_meta = false );
function wp_admin_shell_register_preload_path( $path, $method = 'GET' );      // companion shim for C1
function wp_admin_shell_register_dashboard_widget( $name, $render_module, $widget_module );  // promoted in C4
```

All writes go into `WP_Admin_Shell_Plugin_Contributions::instance()` (the accumulator introduced in C2). The accumulator's `as_admin_json_fragment()` is folded into the plugin origin via `wp_admin_shell_data_plugin` filter — cascade machinery treats file-based and shim-written contributions uniformly.

### Resolver normalization

In `WP_Admin_Shell_Resolver::resolve()` after origin merge but before `strip_origin_tags`:
- Walk `menu-items[]`. Route each into the target region's app config under `items[]` (default region: `navigation`; `bucket: 'meta'` → meta sub-list). Navigation app reads its existing `config.items` unchanged.
- Walk `admin-routes[]`. Normalize each with `app` field into the top-level `routes` block as `routes['/path'] = { app, config: static_data }`. Entries with only `content_module` (no `app`) trigger `_doing_it_wrong` warning — plugins need to register a real shell app or migrate.

### Test additions

- Schema fixtures (positive + negative) for `menu-items[]` and `admin-routes[]`.
- `tests/php/run-cascade-tests.php`: plugin registers A/B/C → site overrides B → user tombstones C → resolved order [A, B', removed-C]; shim writes merge w/ file-based; `deregister_menu_item` tombstones; `admin-routes` normalize into `routes`.
- `tests/php/run-manifest-tests.php`: `_doing_it_wrong` triggers for malformed shim args.
- `tests/runtime/menu-items-normalization.test.mjs`: kernel-side parity check (port PHP normalization to JS).

### Files modified

- `docs/schemas/admin-v2.json` — 2 top-level + 2 defs.
- `includes/plugin-api/class-wp-admin-shell-plugin-api.php` (new).
- `includes/plugin-api/class-wp-admin-shell-plugin-contributions.php` (from C2).
- `includes/cascade/class-wp-admin-shell-resolver.php` — post-merge normalization.
- `includes/cascade/class-wp-admin-shell-merge.php` — `KEYED_ARRAY_KEYS` adds `path`.
- `wp-admin-shell.php` — requires.
- ~6 fixtures + 5 PHP tests + 1 runtime test.

### Risks

- Plugin contribution order depends on `init` priority. `position` field on menu items handles deterministic ordering for nav; route paths are unique by construction.
- `route_module` + `before_load` are no-ops in shell today (no TanStack Router). Round-trip the fields; ignore at runtime; document the migration story.
- `wp_admin_shell_register_admin_route` after `init:8` (when resolver caches) would miss the first request. Shim fires `_doing_it_wrong` if called post-`init:8`.

---

## C4 — dashboard widget grid (~10 days)

### Schema diff

- `docs/schemas/admin-v2.json` add top-level `dashboard-widgets{[name]}` with `$defs.dashboardWidget` (`name, render_module, widget_module, capability?, customizable?`).
- `docs/schemas/admin-engine-v2.json` add new `core:user-layout` value to `honored-platform` enum; `core:dashboard-grid` template recognized by `core:default` engine.

Per-user layout lives at `user-prefs.dashboard.layout = [{ id, name, attributes? }, ...]` — shape enforced by runtime validator (already in user-prefs domain, not admin-v2 schema).

### PHP

`wp_admin_shell_register_dashboard_widget()` (stub in C3) becomes load-bearing. Writes through `WP_Admin_Shell_Plugin_Contributions`. Filter `wp_admin_shell_registered_widgets` runs at resolve time.

New optional REST endpoint `includes/dashboard/class-wp-admin-shell-dashboard-rest.php` — `GET / PUT /wp-admin-shell/v1/dashboard/layout`. Thin wrapper over `/user-prefs` namespacing writes into `dashboard.layout`. Strictly an ergonomic; everything works through `/user-prefs` POST.

### JS-side

New files:
- `src/runtime/dashboard/registry.js` — `registerDashboardWidget(name, { render, widget })` + `getDashboardWidget(name)`. Module-time registration.
- `src/runtime/dashboard/useDashboardContext.js` — `{ widgetTypes, dashboardWidgets, layout, addWidget, removeWidget, moveWidget }`. Reads catalog from `useKernel().config['dashboard-widgets']`; layout from user-prefs.
- `src/runtime/dashboard/DashboardGrid.js` — generic grid renderer. Per-card: scoped theme provider + capability gate identical to `<MountedApp>`. Filters orphan layout entries (widget removed but layout entry retained) at render.

Region template — added to `src/runtime/engines/core-default/engine.json`'s `templates`:
```json
"core:dashboard-grid": {
  "role": "region",
  "platform": { "core:dynamic-children": true },
  "default-style": { ... }
}
```

Modified:
- `src/apps/dashboard/index.js` — replace ad-hoc cards (lines 28–72) with `<DashboardGrid>`.

### Cascade

`dashboard-widgets` is an assoc object — standard deep merge applies. Per-widget `customizable` works.

Per-user layout: cascade's user origin already covers it. Admin.json declares a default layout under `dashboard.layout` (proposed location, parallel to `styles`); user origin overrides whole-array. `customizable: ["dashboard.layout"]` on plugin origin enables user override.

### Test additions

- Schema fixtures (positive + negative) for `dashboard-widgets`.
- `tests/php/run-cascade-tests.php`: plugin widgets + site adds → resolved catalog; user layout override; orphan filter behavior.
- `tests/runtime/dashboard-grid.test.mjs` (new): registry add/remove; layout→render lookup; orphan filter; cap gate.
- `tests/runtime/use-dashboard-context.test.mjs` (new): layout mutators write through to `/user-prefs`.

### Files modified

- 2 schema files.
- `includes/plugin-api/class-wp-admin-shell-plugin-api.php` (impl promotion).
- `includes/dashboard/class-wp-admin-shell-dashboard-rest.php` (new, optional ergonomic).
- 3 new JS files under `src/runtime/dashboard/`.
- `src/runtime/engines/core-default/engine.json` — new template entry.
- `src/apps/dashboard/index.js` — migrated.
- Tests as listed.

### Risks

- Render modules as registered IDs (not paths) — same constraint as `fields_module`. Plugins must register from a shell-page-loaded module.
- Bundle bloat: every plugin widget loaded synchronously on shell boot. Relieved by C5.
- DnD layout editing UX deferred — v1 ships read-only grid + programmatic layout via `/user-prefs`. UI polish later.

---

## C5 — lazy app registration (~7 days, sketched)

### Schema diff — `docs/schemas/admin-app-v2.json`

```json
"loadStrategy": { "enum": [ "eager", "lazy" ], "default": "eager" }
```

### JS

`src/runtime/registry/createRegistry.js` — accept `load: () => Promise<{ default: Component }>` alongside today's `Component` field.

`src/runtime/registry/builtins.js` — convert every `import PostsApp from '../../apps/posts'` to `'core:posts': () => import(/* webpackChunkName: "app-posts" */ '../../apps/posts')`. Bundle splits into ~24 chunks; initial bundle drops to kernel + actively-mounted apps.

`src/runtime/regions/mountApp.js` — branch on `sourceDef.load`. Wrap with `React.lazy()` inside `<Suspense fallback={<AppSkeleton />}>`.

### Test additions

- `tests/runtime/lazy-app.test.mjs`: registry accepts `load`; `<MountedApp>` renders fallback then resolved component.
- Bundle-size regression in CI.

### Files modified

- 1 schema file.
- 3 JS files (registry, builtins, mountApp).
- `webpack.config.js` — chunk filename convention via `output.chunkFilename`.
- Per-app side-effect audit (top-level `register*` calls break under lazy) — triage all 24 apps.

### Risks

- **Side-effect imports.** Any app registering blocks / slot-fills / icons at module load breaks under lazy. Audit before splitting. Apps with side effects stay `loadStrategy: eager`.
- **CSS code splitting.** App-specific styles currently roll into `build/index.css`. Lazy apps want CSS chunks too — requires `mini-css-extract-plugin` reconfig.
- **Inline-script handoff.** `window.wpAdminShell` must survive chunked loading; `wp_add_inline_script(..., 'before')` runs before all chunks load — verify.

---

## Phasing + parallelism

**Strict dependencies:**

- C1 → C3: C3 reuses the `detect_key_field` tightening C1 introduces. If C3 starts first, it inherits the tightening as part of its scope.
- C2 → C3: C2 introduces the `WP_Admin_Shell_Plugin_Contributions` accumulator class C3 builds on. Front-load the accumulator design (~1 day joint) before splitting.
- C3 → C4: C4's `wp_admin_shell_register_dashboard_widget` impl builds on C3's accumulator pattern.
- C5 is fully independent (registry + bundler).

**Recommended sequence:**

| Week | Phase | Notes |
|---|---|---|
| 1 | C1 alone | Establishes schema-add pattern + cascade merge tightening. Low risk, fast feedback. |
| 2–3 | C2 + C3 in parallel | Different engineers; share accumulator design upfront. |
| 4–5 | C4 | Builds on C2/C3 accumulator + schema patterns. |
| 6 | C5 | Ship behind opt-in `loadStrategy: lazy` per app before flipping defaults. |

**Critical assumption to validate before C1 starts:** the resolver's per-request memo `WP_Admin_Shell_Resolver::request_memo` must be invalidated when plugin contributions get written after the first read. Verify the resolver isn't called before `init:10` — if it is, the accumulator needs to invalidate the request memo on write.

**Branching:** This work runs separately from the active desktop engine track on `feat/desktop-engine-p2-mvp`. Create new branch `feat/ciab-primitives-c1` off `main` once C1 is ready to start. Each phase opens its own PR.

---

## Critical files

- `docs/schemas/admin-v2.json` — every phase adds top-level fields plus `$defs` entries; the schema is the contract.
- `docs/schemas/admin-app-v2.json` — C5 adds `loadStrategy`.
- `docs/schemas/admin-engine-v2.json` — C4 adds `core:user-layout` to `honored-platform` enum.
- `includes/cascade/class-wp-admin-shell-resolver.php` — `wp_admin_shell_data_plugin` filter wiring (C2/C3); post-merge normalization for `menu-items` → nav config.items and `admin-routes` → routes (C3).
- `includes/cascade/class-wp-admin-shell-merge.php` — `detect_key_field` tightening (C1); `KEYED_ARRAY_KEYS` += `path` (C3). Load-bearing.
- `wp-admin-shell.php` — preload inline-script wiring (C1); REST controller registrations + new require_once lines per phase.
- `src/runtime/kernel.js` — surface point for new context (view-config, dashboard registry); touched by C2 / C4 / C5.

## Functions / utilities to reuse

- `WP_Admin_Shell_Resolver::resolve()` (`includes/cascade/class-wp-admin-shell-resolver.php:46`) — entry point; no changes to merge logic itself, just new filter callback + normalization pass.
- `WP_Admin_Shell_Merge::merge_internal()` (`includes/cascade/class-wp-admin-shell-merge.php`) — handles every new field's merge without modification; only `detect_key_field` and `KEYED_ARRAY_KEYS` get tightened.
- `WP_Admin_Shell_Customizable::filter_doc()` — works out-of-the-box on every new dotted path. No changes.
- `register_rest_route()` namespace `wp-admin-shell/v1` (already used by `class-wp-admin-shell-can-rest.php`, `class-wp-admin-shell-prefs-rest.php`) — new controllers register under same namespace.
- `useKernel()` hook (`src/runtime/kernel-context.js:1`) — every new JS hook reads through `useKernel().config[...]`.
- `<MountedApp>` (`src/runtime/regions/mountApp.js`) — capability-gate pattern reused verbatim in `DashboardGrid` per-card render.

## Verification

End-to-end run order after each phase:

```bash
npm run lint:js && npm run lint:ts
npm run test:schema      # Ajv sweeps including new positives + negatives
npm run test:runtime     # new view-config + dashboard + field-collections tests
npm run test:parity      # WPDS slot drift detector — must stay green
npm run test:engines     # core-desktop tests — unaffected

# PHP tests
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php
# Plus phase-specific:
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-view-config-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-field-collections-tests.php

# Browser smoke
npm run build && # mount wp-admin in wp-env, navigate developer-admin shell
# C1: open DevTools network tab on cold load — preloaded endpoints should be cache-hits, not REST calls.
# C2: PostsApp DataViews defaults derive from registered view-config; filter overrides take effect on reload.
# C3: a CIAB-style plugin (mock test plugin shipped under tests/fixtures/ciab-migration-sample/) registers menu items + admin routes via `wp_admin_shell_register_*` and they appear in nav + route to the right apps.
# C4: dashboard renders grid; widget cap gating drops widgets the user can't see; layout writes persist to user-prefs.
# C5: bundle analyzer shows ~24 chunks; mounting a previously-unmounted app fetches that chunk only.
```

Expected total test assertions after C1–C5: ~750 (current 665 + ~85 new across schema / cascade / runtime / PHP).
