# Track C — Dashboard Widget Grid (C4)

**Status:** ready
**Estimate:** ~8d
**Dependencies:** none (consumes existing `core:dynamic-children` platform service from PR #34)
**Branch base:** `feat/c2-view-config` (or `main` post-merge)
**Suggested branch name:** `feat/c4-dashboard-grid`

## Goal

Replace `core:dashboard`'s hand-rolled card layout with a first-class **widget grid** primitive: a `core:dashboard-grid` region template using `core:dynamic-children`. Widgets register as apps via `wp_admin_shell_register_dashboard_widget()` and declare a `dashboardWidget` manifest block; cascade merges placements + sizing. Reuses existing cap-gating layers (widgets-as-apps).

CIAB ships dashboard-widgets as a parallel registry. Shell ships it inside its existing region+app+dynamic-children primitives — consistent with the kernel's "everything is a region" philosophy.

## Scope

**In:**
- New `core:dashboard-grid` region template in `core-default` engine.
- New `dashboardWidget` block in `admin-app-v2.json` declaring layout hints (default size, min size, position, sortable).
- New PHP `wp_admin_shell_register_dashboard_widget( $id, $widget_app_id, $position?, $size? )` shim (CIAB API parity).
- New `core:dashboard-host` app that mounts into a `core:dashboard-grid` region and drives the dynamic-children store from registered widgets.
- Migrate `core:dashboard` to either (a) host shape using the new grid template, or (b) leave as-is and provide grid as an alternate via admin.json (recommend (b) for shipping safety).
- 1–2 bundled example widgets: `core:dashboard-widget-recent-posts` + `core:dashboard-widget-quick-draft` (clone from existing DashboardApp logic).
- Tests + docs.

**Out:**
- Drag-to-reorder UI (CIAB doesn't have it either; widget order is config-driven). Author orders via admin.json.
- Per-widget capability declarations beyond what `app.json#capabilities` already covers — widgets-as-apps means existing 4-layer gating handles it.
- WP-core dashboard widget bridge (rendering `wp_dashboard_setup` widgets inside the shell). Defer to a follow-up; non-trivial because legacy widgets emit jQuery-bound HTML.

## Files touched

**New (PHP):**
- `includes/cascade/class-wp-admin-shell-dashboard-widgets.php`
- `tests/php/run-dashboard-widgets-tests.php`

**New (JS / app):**
- `src/apps/dashboard-host/{index.js, app.json, app.md, index.css}`
- `src/apps/dashboard-widget-recent-posts/{index.js, app.json, app.md}`
- `src/apps/dashboard-widget-quick-draft/{index.js, app.json, app.md}`
- Possibly `src/runtime/dashboardGrid/{GridContext.js, useWidgets.js}` if the host needs runtime helpers beyond `core:dynamic-children`

**New (engine):**
- `core:dashboard-grid` template definition in `src/runtime/engines/core-default/engine.json`
- CSS in `src/runtime/engines/core-default/index.css` (or its own subdir) — grid layout class rules

**Modified:**
- `docs/schemas/admin-app-v2.json` — add `dashboardWidget` block + $defs
- `wp-admin-shell.php` — `require_once` + shim function
- `CLAUDE.md` — extension point #12, app table updates, test counts
- `docs/wp-admin-shell-design-spec.md` — §13 #12, §5.5 cross-ref
- `shells/developer-admin.json` (or sibling) — optionally swap `/dashboard` route to use the new grid

## Design notes

- **Template `core:dashboard-grid`** declares a region with `role: "region"`, layout uses CSS grid (`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`), and platform service `core:dynamic-children: true`.
- **`core:dashboard-host` app** mounts in that region. Reads the resolved cascade for `dashboardWidgets[]` (or queries the manifest registry for apps with a `dashboardWidget` block), composes a list of child regions (one per widget), and pushes them into the dynamic-children store. Each child region mounts the widget app.
- **`dashboardWidget` manifest block** carries layout hints:
  ```json
  "dashboardWidget": {
    "defaultSize": { "w": 1, "h": 1 },   // grid cells, not px
    "minSize":     { "w": 1, "h": 1 },
    "position":    "auto" | { "row": 1, "col": 2 },
    "title":       "Recent Posts"
  }
  ```
- **Cascade override pattern.** Admin.json can declare a `dashboardWidgets` top-level block that adds, hides, reorders, or resizes widgets:
  ```json
  "dashboardWidgets": {
    "core:dashboard-widget-recent-posts": { "position": { "row": 1, "col": 1 }, "defaultSize": { "w": 2, "h": 1 } },
    "core:dashboard-widget-quick-draft":  { "hidden": true }
  }
  ```
- **Widget = app.** No new primitive. Widgets get cap gating, theming, dirty-state, dynamic-children re-render — all from the existing app contract.

## Implementation steps

1. **Schema.** Add `dashboardWidget` to `admin-app-v2.json`. Add `dashboardWidgets` top-level to `admin-v2.json` for cascade overrides. Positive + negative fixtures.
2. **Engine template.** Add `core:dashboard-grid` to `core-default/engine.json` (role, layout, platform — keep CSS minimal initially).
3. **`core:dashboard-host` app.** Build the host that reads registered widgets + admin.json overrides → drives `useDynamicChildren`. Render a grid container; child regions get auto-sized cells.
4. **Two example widgets.** Port DashboardApp's recent-posts + quick-draft logic into standalone apps. Each declares its `dashboardWidget` block.
5. **PHP shim.** `wp_admin_shell_register_dashboard_widget()` writes into `dashboardWidgets` registry; `wp_admin_shell_data_plugin` filter contributes.
6. **Migration switch.** Add a `/dashboard-grid` route to one shell (developer-admin) that mounts `core:dashboard-host` so you can test in browser without forcing the default `/dashboard` migration. Once stable, promote.
7. **CSS / a11y.** Grid CSS in core-default. Tab order goes widget-by-widget (DOM order matches visual order).
8. **Tests.** PHP runner covering registration, dedup, cascade override merge. JS test against the host's widget-composition logic if it has any pure helpers. Manual browser smoke for visual.
9. **Docs.** Status block update, app table additions, §13 #12.

## Tests

- PHP: registry CRUD, cascade contribution path, admin.json override of size/position/hidden
- JS: dynamic-children integration sanity (mock widget set → expected child region count + ids)
- Schema sweep: positive + negative fixtures for both new schema blocks
- Browser smoke: navigate to `/dashboard-grid` in developer-admin; widgets render in declared positions

## Acceptance criteria

- [ ] `core:dashboard-grid` template registered + usable from admin.json
- [ ] Two bundled widgets render
- [ ] Plugin can register a third widget via the shim
- [ ] Admin.json can hide a widget, resize a widget, reposition a widget
- [ ] Each widget gets independent cap gating + dirty-state from the app contract (no new gating layer)
- [ ] Tests: schema sweep + new PHP suite + new JS test all green
- [ ] CLAUDE.md status + app table + extension points updated

## Coordination

- `docs/schemas/admin-app-v2.json`: adds `dashboardWidget` $def; no conflict with Tracks A/B/D.
- `docs/schemas/admin-v2.json`: adds `dashboardWidgets` top-level (admin.json overrides). Track A also touches this schema (adds `preload`). Append-friendly merge.
- `core-default/engine.json`: appends `dashboard-grid` template. No conflict expected.
- `wp-admin-shell.php` `require_once` block: append-only.
- `src/runtime/registry/builtins.js`: adds three new bundled apps. Track D rewrites the registry — coordinate by ensuring the new app registrations use the same `register()` API both shapes accept.
- `CLAUDE.md`: rebase status/test-count/app-table.

## Reference

- CIAB source: `next_admin_register_dashboard_widget()` + the `$next_admin_dashboard_widgets` global in `/Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/dashboard-widgets/`.
- Existing dynamic-children service: `src/runtime/regions/Region.js` recursion + `useDynamicChildren( parentRegionId )` hook. Spec §5.5.
- DashboardApp today: `src/apps/dashboard/index.js`.
