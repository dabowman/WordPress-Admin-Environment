# Track B — Menu Item + Admin Route Shims (C3)

**Status:** ready
**Estimate:** ~3d
**Dependencies:** none
**Branch base:** `feat/c2-view-config` (or `main` post-merge)
**Suggested branch name:** `feat/c3-menu-route-shims`

## Goal

CIAB plugins call `next_admin_register_menu_item()` + `next_admin_register_admin_route()` to declare nav entries and URL routes at runtime. Ship the shell-side equivalents (`wp_admin_shell_register_menu_item()` / `wp_admin_shell_register_admin_route()`) that write into the `plugin` origin via the existing `wp_admin_shell_data_plugin` filter, so plugins port from CIAB with mechanical rename.

Cap gating is *not* duplicated — CIAB's inline `current_user_can()` checks are dropped; shell's 4-layer cap model covers it automatically.

## Scope

**In:**
- PHP `wp_admin_shell_register_menu_item( $id, $args )` — args mirror CIAB: `to` (href) / `label` / `icon` / `badge` / `parent` / `parent_type` (`drilldown` | `dropdown`) / `position`.
- PHP `wp_admin_shell_register_admin_route( $path, $args )` — args: `app` + `config` (plus pass-throughs for any `static_data` keys CIAB plugins carry).
- Optional `region` arg on the menu-item shim to disambiguate target nav region (defaults to the first `core:navigation` app encountered in the resolved tree).
- Cap gating *after* registration via the shell's existing 4 layers.
- Migration notes documenting the CIAB→shell rename pattern (`s/next_admin_/wp_admin_shell_/g`).
- New PHP test runner `run-menu-route-shims-tests.php`.

**Out:**
- TanStack Router's `gcTime` (CIAB-specific cache GC; shell has no equivalent — log a one-time `WP_DEBUG` notice when present, ignore the value).
- Variant-addressable nav items — separate concern tied to the locked C2 design (filed in feedback inbox); this track adds plain menu items.
- Per-item programmatic deregistration — `WP_Error` on duplicate id; no `unregister`.

## Files touched

**New:**
- `includes/cascade/class-wp-admin-shell-menu-items.php`
- `includes/cascade/class-wp-admin-shell-admin-routes.php`
- `tests/php/run-menu-route-shims-tests.php`

**Modified:**
- `wp-admin-shell.php` — `require_once` + public function definitions
- `CLAUDE.md` — extension points #10 + #11, test counts
- `docs/wp-admin-shell-design-spec.md` — §13 #10 + #11
- `docs/wp-admin-shell-design-spec.md` already covers shape-level concerns; just describe the API surfaces

## Design notes

- **Cascade contribution.** Both shims register into a global PHP array; an `add_filter('wp_admin_shell_data_plugin', ...)` callback at priority 5 reads the array and writes into the appropriate plugin-origin path. Pattern mirrors `class-wp-admin-shell-field-collections.php` (C2). Site/role/user origins can still override per the cascade rules.
- **Default nav region resolution.** When the plugin doesn't specify `region`, walk the (already-merged) doc and find the first region whose `app === 'core:navigation'`. Write the new item under `regions[<that-id>].config.items[]`. Document the heuristic; document the override knob.
- **`parent_type` semantics.** `drilldown` = nest under a `screen` item (existing shell nav primitive); `dropdown` = currently not supported by shell nav (filed as feedback follow-up). When `dropdown` is requested, fall back to `drilldown` with a `WP_DEBUG` notice.
- **Duplicate id rejection.** Mirror field-collections — `WP_Error` on dup.

## Implementation steps

1. **PHP API surface.** Define `wp_admin_shell_register_menu_item()` + `wp_admin_shell_register_admin_route()` as free functions in `wp-admin-shell.php`. Each delegates to the corresponding class.
2. **Class `WP_Admin_Shell_Menu_Items`.** Static registry + `register()` (validation, dup rejection) + `find_default_nav_region_id( $doc )` helper + `contribute( $doc )` filter callback.
3. **Class `WP_Admin_Shell_Admin_Routes`.** Static registry + `register()` (validates `$path` matches admin-v2 route pattern, validates `$app` exists in manifest registry) + `contribute( $doc )` filter callback writing into `routes` block.
4. **Filter wiring.** `add_filter( 'wp_admin_shell_data_plugin', [ ..., 'contribute' ], 5 )` for each. Priority 5 so plugin authors using direct `wp_admin_shell_data_plugin` filters at default priority 10 land after the shim contributions.
5. **CIAB `gc_time` handling.** Accept the key, ignore the value, dev-warn once per id.
6. **Tests.** `run-menu-route-shims-tests.php`:
   - Menu item registered with no `region` → lands under first nav region's `items[]`
   - Menu item with explicit `region` → lands under that region (test both top-level + nested children)
   - `parent` + `parent_type=drilldown` → nests under the named screen
   - Admin route → lands in `routes`
   - Duplicate id → `WP_Error`
   - Cap gating: register a menu item with capability requirement; verify subscriber doesn't see it after cascade resolution (sanity that the shell's cap-prune still works on shim-registered items)
7. **Migration doc.** Add a short section to `docs/wp-admin-shell-design-spec.md` §13 or a sibling `docs/comms/ciab-migration.md` showing the `s/next_admin_/wp_admin_shell_/g` rename pattern + the `gc_time` deprecation note.

## Tests

PHP coverage:
- Both APIs reject malformed input with `WP_Error`
- Both contribute through `wp_admin_shell_data_plugin` filter additively
- Cap gating still applies through the shell's 4-layer model

Schema sweep: unchanged (no schema additions).

## Acceptance criteria

- [ ] `wp_admin_shell_register_menu_item()` + `wp_admin_shell_register_admin_route()` exist as public functions
- [ ] Items registered via the shims appear in the resolved cascade tree in the expected locations
- [ ] CIAB-flavored test: register a menu item + route via the shims; declare an admin.json that doesn't mention them; resolved tree contains both
- [ ] Cap-gating sanity: shim-registered item with `capability` is pruned for users lacking it
- [ ] `gc_time` accepted + ignored with dev warn
- [ ] Tests: schema sweep stays green; new PHP suite passes
- [ ] CLAUDE.md test count updated
- [ ] Spec §13 grows to 11 extension points (after Track A adds #9 it'd be 11; coordinate the numbering during rebase)

## Coordination

- `wp-admin-shell.php` `require_once` block: append-only.
- `CLAUDE.md`: rebase test-count line.
- Spec §13 numbering: Track A adds #9 (preload), this track adds #10 (menu) + #11 (admin-route). If Track A merges first, no change needed. If Track B merges first, renumber on rebase.

## Reference

- CIAB source: `/Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/lib/api/routes.php` (admin route) + sibling `menu-items.php`.
- Shell field-collections registry pattern: `includes/cascade/class-wp-admin-shell-field-collections.php` (C2 — model for this track's registry + filter contribution shape).
