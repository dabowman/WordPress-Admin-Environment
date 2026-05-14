# Plugging CIAB Admin's primitives into the shell cascade

**Date:** 2026-05-13
**Premise:** CIAB Admin grew out of Next Admin — an infrastructure effort to build the same kind of admin substrate this shell is building. Management redirected it into a single-product track and the project was paused 2026-04-28. The infra primitives Cvetan, Riad, and the Moltres team built before the pivot solve real problems the shell hasn't tackled yet. This doc inventories what it would take to make each of those primitives plug into the shell's 6-origin cascade.
**Source data:** Walkthrough of `/Users/davidbowman/Github/ciab-admin` 2026-05-13. Companion to `ciab-admin-comparison.md`.

---

## Integration shape

Shell's cascade today: 6 origins of admin.json (core / engine / plugin / site / role / user) → resolver merges with restrict-only + customizable filter → kernel renders. CIAB's primitives are PHP-side global registries + filters that build a parallel admin description at runtime.

**Pattern for every primitive below:** treat the CIAB registration call as a contribution to shell's `plugin` origin (or a new dedicated block). A PHP shim translates `next_admin_register_*` → cascade-eligible JSON fragment. The cascade handles role / site / user overrides, customizable filter, and capability gating automatically — none of which CIAB had.

Two new schema-level additions cover most of the work: a `preload[]` top-level + a `viewConfig` per-app block + a `fieldCollections{}` top-level + a `dashboardWidgets{}` top-level.

---

## 1. REST preload middleware — do first

**CIAB:** static hardcoded path list → `rest_preload_api_request` → `wp.apiFetch.createPreloadingMiddleware`. Hardcoded list in `/lib/pages/admin.php:76–118`. Not filterable.

**Shell today:** no preload. Every `@wordpress/core-data` resolver fetches on cold mount.

**Integration:**
- New `preload[]` block in admin-v2 schema. Items: `string | [path, method]`.
- Cascade merges additively across origins (no override semantics needed).
- PHP runs `rest_preload_api_request` on the merged list before render and injects via `wp_add_inline_script` on the `wp-api-fetch` handle.
- Plugin authors contribute via `wp_admin_shell_data_plugin` filter or by emitting `preload` in their plugin-origin admin.json.

**Effort:** ~2 days. Fully independent of every other primitive. Biggest perf win per LOC.

---

## 2. View Configuration API + Field Collections — paired

CIAB ships these together; they reference each other. Integrate as a unit.

### CIAB view-config

- Filter: `apply_filters( "next_admin_entity_view_config_{$kind}_{$name}", $config )`. Variant-qualified flavor also supported: `_{$kind}_{$name}_{$variant}`.
- REST: `GET /wp/v2/view-config?kind=postType&name=post` (controller `class-next-admin-rest-view-config-controller.php`).
- Shape: `{ default_view, default_layouts, quick_edit_form, add_form, edit_form, tabs }`. `default_view` itself contains `type`, `search`, `filters`, `perPage`, `mediaField`, `titleField`, `fields[]`.
- Sanitization: `preg_replace( '/[^a-zA-Z0-9_-]/', '', $value )` to preserve camelCase kind/name.

### CIAB field collections

- Registration: `next_admin_register_field_collection( $id, $kind, $name, $fields, $fields_module )`.
- Storage: global `$next_admin_field_collections`.
- REST: `GET /wp/v2/field-collections?kind=postType&name=attachment`.
- Per-entity match: exact name or universal (null name → matches any entity of the kind).
- `fields_module` is a native ESM script-module handle for client-side field extensions.

### Shell today

Every app — PostsApp / MediaApp / UsersApp / CommentsApp / etc. — hardcodes its DataViews fields / views / layouts inline. ~18 apps × ~150 LOC of inline config each. No reuse, no cascade override.

### Integration

- New schema blocks:
  - `admin-app-v2`: `viewConfig: { kind, name, default_view, default_layouts, edit_form, ... }` per app.
  - `admin-v2` top-level: `fieldCollections: { [id]: { kind, name, fields, fields_module } }`.
- Cascade merges per-app view-config across origins. Plugin overrides core defaults; site / role / user can extend if `customizable` opt-in is present.
- New PHP API:
  - `wp_admin_shell_register_field_collection( $id, $kind, $name, $fields, $fields_module )`.
  - Filter `wp_admin_shell_view_config_{kind}_{name}` (mirror CIAB's filter naming).
- New REST endpoints under `/wp-admin-shell/v1/view-config` + `/field-collections` (mirror CIAB shape; swap base path).
- Apps consume via `useViewConfig( kind, name )` hook (analog to CIAB's). Falls back to in-app hardcoded config if no override is registered — so migration is opt-in per app.

### Migration

Don't rewrite 18 apps at once. Land schema + resolver + REST + one app integration (Posts is richest DataViews user). Measure value. Expand if it pays.

### Effort

~8–10 days for the full unit (schema + resolver + REST + 1 app + 2 example field collections). ~1 day per app to migrate afterward.

### Risk

`fields_module` is a native ESM dep. Shell ships on webpack. Resolve via dynamic `import()` from a build-time-generated module-ID map. Not a blocker — a delivery quirk.

---

## 3. Menu-item + admin-route registration shims — ergonomic

Plugin authors fluent in CIAB's API want it. Cheap adoption.

### CIAB

- `next_admin_register_menu_item( $id, $args )` — args: `to`, `label`, `icon`, `badge`, `parent`, `parent_type` (`drilldown` | `dropdown`), `position`. Capability-gated at the registration site (inline `current_user_can` per call; not pluggable).
- `next_admin_register_admin_route( $path, $content_module, $route_module, $before_load, $static_data, $gc_time )` — TanStack-router-shaped, including `gc_time` (TanStack-specific cache GC).

### Shell today

Plugin authors append to `regions[].config.items[]` via `add_filter('wp_admin_shell_data_plugin', ...)` and add region routing entries.

### Integration shims

- PHP `wp_admin_shell_register_menu_item( $id, $args )` writes into the plugin-origin's `regions[<default-nav>].config.items[]`. Honors `parent` / `parent_type` for drill-down (already supported as `screen` items) / dropdown.
- PHP `wp_admin_shell_register_admin_route( $path, $args )` writes into plugin-origin region routing entries. `gc_time` ignored (shell router has no equivalent — note in mapping doc, not a blocker).
- Both run cap gating *after* registration via shell's 4-layer model — strictly better than CIAB's hardcoded inline prune. Migrating plugins can drop their `current_user_can` checks.

### Caveat

CIAB has one global menu; shell's nav is per-region. Shim picks default region (first `core:navigation` app encountered) or accepts an explicit `region` arg.

### Effort

~3–4 days for both shims + tests.

---

## 4. Dashboard widget grid

**CIAB:** `next_admin_register_dashboard_widget( $name, $render_module, $widget_module )`. Global registry (`$next_admin_dashboard_widgets`). Layout / sizing not in the registration shape — punted to client-side widget metadata. Filter `next_admin_registered_widgets` for late mutation.

**Shell today:** DashboardApp renders fixed cards. No grid abstraction.

### Two paths

| Path | Effort | Notes |
|---|---|---|
| **(a) Region-template path.** New `core:dashboard-grid` region template using the `core:dynamic-children` platform service. Widgets register as apps with a `dashboardWidget` manifest block. Cascade merges placements + sizing. | 7–10 days | Consistent with shell's region-as-primitive philosophy. Widgets-as-apps means existing cap-gating layers cover them. |
| **(b) CIAB pattern verbatim.** `wp_admin_shell_register_dashboard_widget()` as a parallel registry alongside apps. Inline JSON serialize. | 3–4 days | Faster. Two registries instead of one. Cap gating becomes a 5th layer. |

**Recommendation:** (a). Region + dynamic-children is already shell's general answer to "many things in one canvas" — used by the desktop engine's window compositor. Dashboard grid is the same shape with a different layout policy.

**Effort:** ~7–10 days for (a).

---

## 5. Lazy app registration / code-split

Not a CIAB primitive per se — a property of CIAB's build + route registry. But the code-split idea matters more than the build tool.

### CIAB

- `package.json` `route` field → wp-build generates registration calls.
- Two modules per route: static `route.tsx` (loader / inspector / canvas — runs `beforeLoad`) + content `stage.tsx` (lazy).
- Static module ships eagerly; content lazy-loads on route match.

### Shell today

`src/runtime/registry/builtins.js` imperatively imports all 18 apps at module load. Every bundle ships eagerly.

### Integration

- Registry accepts `{ id, kind, load: () => import('./apps/posts') }` alongside today's `{ id, kind, render: Component }`.
- Router calls `load()` on first route match for the app; cached.
- The app's `app.json` ships in the main bundle (small); the React component is the lazy half.
- Webpack `import()` produces named chunks. No native-script-modules requirement.

### Effort

~5–7 days. Touches registry + builtins + Region.js mount path + webpack config (chunk naming).

### Skip

Native `wp_register_script_module` + `.asset.php` migration. Months of work; orthogonal to CIAB's primitives. Track separately.

---

## 6. Build system (wp-build)

**Skip.** Adopting CIAB's primitives requires nothing from CIAB's build. Shell stays on `@wordpress/scripts` + dynamic `import()` for code-split. Native script modules is a separate modernization arc — worth doing but not gated by this work.

---

## 7. Design system package (`@automattic/design-system` + `@automattic/theme`)

**Skip for this integration.** Shell's `ThemeProviderHost` seam already accepts alternative providers; a non-WPDS engine ships its own. Integrating CIAB's DS package is an engine-pluggability concern, not a primitives-cascade concern. See `project_ds_pluggability_contract` memory for the bigger app-side facade refactor that would unlock real swap.

---

## 8. Server-side menu prune

**Nothing to integrate.** Shell's 4-layer cap gating (region fast-path → app gate → source-cap floor → REST observation) is strictly more capable than CIAB's inline `current_user_can` checks at the registration site. CIAB plugins migrating to shell can drop their cap checks at registration; shell does it cleaner.

---

## Phasing recommendation

| Phase | Primitives | Effort | Cumulative value |
|---|---|---|---|
| **C1** | Preload middleware | ~2 days | Cold-mount perf parity with CIAB |
| **C2** | View-config + field-collections + 1 app migration (Posts) | ~10 days | Cascadable UI spec; biggest plugin-author win |
| **C3** | Menu-item + admin-route shims | ~3 days | CIAB plugins port with minimal changes |
| **C4** | Dashboard widget grid via region-template | ~8 days | First-class data-UI primitive parity |
| **C5** | Lazy app registration | ~6 days | Cold-mount perf beyond CIAB |
| *defer* | Native script modules + DS package | months | Orthogonal modernization |

**Total C1–C5:** ~30 days = 6 weeks single-track, 3–4 weeks if parallelized.

---

## Risks + open questions

1. **`fields_module` script-module dep model.** CIAB ships native ESM; shell ships webpack chunks. Verify dynamic `import()` with computed paths plays clean — may need a build-time module-ID map.
2. **View-config schema scope.** CIAB ships per-`kind` / `name` / `variant`. Shell's schema must accept the same 3-axis key; cascade resolution per axis. Probably one schema iteration to get right.
3. **Field-collection vs app-bound fields overlap.** Two ways to specify a field — inline in viewConfig OR via collection ref. Define precedence: ref wins, inline overrides per-field.
4. **Dashboard widget capability gating.** Each widget needs a cap floor. Reinforces path (a) — widgets-as-apps reuse existing gating layers; path (b) adds a 5th layer.
5. **Migration ergonomics.** Goal: `s/next_admin_/wp_admin_shell_/g` works for ~80% of registrations. View-config + field-collection + menu-item shims will give this; admin-route shim may need shape adaptation (`content_module` / `route_module` → app id).

---

## Where this leaves the comparison

After C1–C5, the only CIAB infra primitives shell doesn't have are:

- Native script modules build (modernization, not a primitive)
- A8C-internal DS package adoption (engine pluggability, separate refactor)

Everything else — view-config / field-collections / dashboard-widgets / preload / route+content code-split / menu-item registration / admin-route registration — lives inside shell's cascade, with role / site / user overrides free on top.

Riad's framing (from the 2026-05-13 conversation) reads correctly: CIAB's primitives can plug into the shell's cascade because the cascade is the layer CIAB never got to build before management pulled the team into product mode.

---

## Cross-refs

- `docs/research/ciab-admin-comparison.md` — full architectural compare.
- `project_admin_renovation_landscape` memory — Next Admin / CIAB history.
- `project_ds_pluggability_contract` memory — app-side facade refactor (deferred).
- `/Users/davidbowman/Github/ciab-admin` — source.
