# Customization abilities (WordPress Abilities API)

The plugin registers a catalog of **workspace-customization abilities** against
the WordPress Abilities API (core in WP 6.9+) under the
`wp-admin-workspaces` category. They are the machine-consumable surface for
customizing the workspace — designed for AI agents reaching the site through
the `wp-abilities/v1` REST namespace (and, later, in-workspace JS via
`@wordpress/abilities`).

**Ability IDs are stable API.** Renaming or removing one is a breaking change
for every client that learned it. Add new abilities; don't mutate existing
ones.

Registration lives in `includes/class-wp-admin-workspaces-abilities.php`
(`WP_Admin_Workspaces_Abilities`). Every ability sets `meta.show_in_rest`;
read abilities also set `meta.readonly`.

## Version gate

Feature-detected, not version-pinned: registration hooks
(`wp_abilities_api_categories_init` / `wp_abilities_api_init`) only fire when
the Abilities API exists, and the callbacks re-check
`function_exists( 'wp_register_ability' )`. On WordPress < 6.9 the whole
surface silently no-ops — same philosophy as the private-APIs runtime gate.
No `Requires at least` bump.

## Design stance

The abilities are **thin transports over existing machinery** — resolver,
`customizable` enforcement, the persisted origin slices. Enforcement does NOT
move into the abilities:

- User-tier writes are **stored verbatim** (parity with the `/user-prefs`
  REST transport) and the cascade resolver filters them at read time. What
  the ability adds is **feedback**: `update-user-prefs` pre-flights the patch
  through `WP_Admin_Workspaces_Customizable::filter_doc()` and reports which
  leaf paths will take effect (`applied`) vs. be ignored (`rejected`) — an
  agent learns the allowlist instead of failing silently.
- Site-tier writes go straight to the `wp_admin_workspaces_site_config`
  option (trusted origin, `manage_options`); cache invalidation rides the
  existing `update_option_*` hook. The same feedback contract applies:
  `update-site-config` pre-flights through `filter_doc( …, 'site' )` and
  reports `applied`/`rejected`. The site tier passes the v3 top-level
  blocks verbatim, but `filter_doc` rebuilds the doc from only the blocks
  it recognizes — an unrecognized top-level key (e.g. `frame`) and
  `styles`/`settings` paths without a matching `customizable` declaration
  are stored but dropped at resolve, and the report says so.
- Discovery is first-class: `describe-customization-surface` is the inverse
  view of `filter_doc` (`WP_Admin_Workspaces_Customizable::describe_writable_paths()`),
  reporting per-tier writability before a write is attempted.

Patch payloads share the `/user-prefs` REST bounds
(`WP_Admin_Workspaces_Prefs_REST::MAX_BYTES` / `MAX_KEYS`) and the merge
primitives in `WP_Admin_Workspaces_Util` (`deep_merge_patch` — null deletes
for the user slice, null-as-stored-tombstone for the site slice — and
`count_keys`).

## Catalog

### Read primitives (`meta.readonly`)

| Ability | Permission | Does |
|---|---|---|
| `wp-admin-workspaces/get-workspace-config` | logged-in | Resolved doc for the current user (same prune as the inline payload / `/config` REST). Optional `blocks: string[]` input returns a subset. |
| `wp-admin-workspaces/describe-customization-surface` | logged-in | Per-tier writability report: user-tier `allowedPaths` (`{path, mode}` — `subtree` for `customizable: true` nodes, `exact` for allowlist entries) + `deniedPatterns`; site-tier `writable` flag; `workspaceFileActive` / `workspaceSwitchable`. Empty `allowedPaths` = default-locked posture. |
| `wp-admin-workspaces/get-user-prefs` | logged-in | The stored user slice, verbatim (stored ≠ effective; see describe). |
| `wp-admin-workspaces/get-site-config` | `manage_options` | The stored site slice, verbatim (nulls are tombstones). |
| `wp-admin-workspaces/list-workspaces` | logged-in | Bundled + programmatic workspaces, active slug, file-override status. |

### Write primitives

| Ability | Permission | Does |
|---|---|---|
| `wp-admin-workspaces/update-user-prefs` | logged-in | Deep-merge `prefs` onto the user slice (null deletes a stored key). Returns `prefs` + the pre-flight report `applied` / `rejected` / `outOfBand` (the `workspace` slug key is honored out-of-band by `active_workspace_slug()`, not the cascade merge). |
| `wp-admin-workspaces/reset-user-prefs` | logged-in | Deletes the user slice. |
| `wp-admin-workspaces/update-site-config` | `manage_options` | Deep-merge `config` onto the site slice — nulls are **stored** as tombstones (they remove baseline entries at resolve time). `remove: string[]` deletes dotted paths from the stored slice (e.g. to undo a tombstone); emptied parent containers are pruned. Returns `config` + the `applied`/`rejected` resolve report (see design stance — unrecognized blocks don't survive resolve) + `removed` echoing which remove paths existed and were deleted. |

### Semantic abilities

| Ability | Permission | Does |
|---|---|---|
| `wp-admin-workspaces/switch-workspace` | `manage_options` | Site-wide switch via the `wp_admin_workspaces_active_workspace` option. 404 on unknown slug (error data lists valid ones), 409 while a `wp-content/workspace.json` override is in force (the file wins; the write would be a silent no-op). Per-user switching = `workspace` key via `update-user-prefs` (user-switchable workspaces only). |
| `wp-admin-workspaces/set-default-screen` | `manage_options` | Validates the screen id against the resolved `screens` map (404 + valid ids on miss), writes `default-screen` to the site slice. |
| `wp-admin-workspaces/hide-menu-item` | `manage_options` | Finds the id in the resolved menu tree (nested `items` walked; id-keyed map and keyed-list shapes both handled), writes a null tombstone at that path in the site slice. Cosmetic — capability gates and URL reachability untouched. |
| `wp-admin-workspaces/show-menu-item` | `manage_options` | Inverse: removes the site-tier tombstone. Errors when the id isn't tombstoned at the site tier (an item hidden by the workspace file or another origin can't be restored here). |

## Cascade fix that rode along: `default-screen` in `V3_TOP_LEVEL_BLOCKS`

`WP_Admin_Workspaces_Customizable::filter_doc()` rebuilds consumer/site-origin
docs from `settings` + `styles` + `V3_TOP_LEVEL_BLOCKS` only. `default-screen`
wasn't listed, so a site-origin `default-screen` was **silently dropped** —
contradicting the documented trust-tier rule (site may declare any block
shape) and making `set-default-screen` impossible. It now rides the list:
the trusted site origin passes it through; consumer origins (role/user) still
can't set it because `filter_v3_block` rejects scalar replacements outright.
Pinned end-to-end by `tests/php/run-abilities-tests.php` (§6).

## Testing

```bash
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-abilities-tests.php
```

Covers registration (`wp_get_ability` per id), permission floors per role,
the per-user config prune, the locked-baseline + fixture-allowlist describe /
pre-flight paths, site-tier writes landing in the resolved doc, and the
switch-workspace error states (including the file-override 409 via the
`wp_admin_workspaces_workspace_json_path` filter). Prints `SKIP` and exits 0
when the Abilities API is absent (WP < 6.9 env).

## Follow-ups (not in the first batch)

- Role-tier slice abilities (`wp_admin_workspaces_role_config` — role-keyed
  input shape).
- Writing the `wp-content/workspace.json` override itself (filesystem write;
  needs its own safety story).
- A `set-theme-style` semantic wrapper (currently expressible through
  `update-user-prefs` / `update-site-config` with a `styles` payload; the
  describe ability already reports which style paths are writable).
- In-workspace consumption (`@wordpress/abilities`, command palette entries
  backed by abilities).
