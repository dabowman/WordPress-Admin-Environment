# Screen Spec: Network Plugins (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/plugins.php` (delegates to `wp-admin/plugins.php` with network context)
- `wp-admin/network/plugin-install.php` (delegates to `wp-admin/plugin-install.php`)
- `wp-admin/network/plugin-editor.php` (delegates to `wp-admin/plugin-editor.php`)
- `wp-admin/includes/class-wp-plugins-list-table.php` (same class, network-aware)

**Current shell coverage:** None.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_network_plugins`.

This spec describes the **semantic surface** of the network-level Plugins management screen. Plugins differ from themes: a "Network Activated" plugin is **active on every site simultaneously** (no per-site override). Site-level plugin activation is a separate flow gated by the network's `menu_items[plugins]` setting (see `network-settings.md`).

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-plugins` |
| Display name | "Plugins" (network context) |
| Original URLs | `/wp-admin/network/plugins.php`, `/wp-admin/network/plugin-install.php`, `/wp-admin/network/plugin-editor.php?file={file}&plugin={plugin}` |
| Menu location | `menu[20]` in `wp-admin/network/menu.php` (cap: `manage_network_plugins`) |
| Submenu items | Installed Plugins (this list), Add Plugin (install), Plugin File Editor |
| Parent app | None — top-level network app |
| Sub-screens | List (default), Install, File Editor, Bulk-update iframe, Bulk-delete confirmation |

The single-site Plugins screen reuses the same list-table class. The differences are: cap (`manage_network_plugins` vs. `activate_plugins`), the "Active" tab semantically means "Network Active", and Network-Only plugins (header `Network: true`) are activatable only here.

---

## 2. Purpose

Manage every plugin installed on the network: network-activate, install new plugins, update, delete, edit files (escape hatch). Network-active plugins run on every site; the per-site Plugins screen only manages plugins that are not network-active.

Jobs to be done:
- **Network-activate** a plugin so it runs on every site.
- **Network-deactivate** a plugin (cannot deactivate site-by-site once network-active).
- **Update** plugins (single + bulk).
- **Toggle auto-updates** (single + bulk).
- **Install** new plugins (wp.org search + zip upload).
- **Delete** plugins.
- **Edit** plugin files.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View list | `manage_network_plugins` | inferred from menu cap; admin redirect target |
| Network activate / deactivate | `manage_network_plugins` | `wp-admin/plugins.php` action handlers |
| Update | `update_plugins` | `wp-admin/plugins.php` |
| Auto-update toggle | `update_plugins` AND `wp_is_auto_update_enabled_for_type('plugin')` | same |
| Install | `install_plugins` | `wp-admin/plugin-install.php` |
| Delete | `delete_plugins` | `wp-admin/plugins.php` |
| Edit files | `edit_plugins` AND ! `DISALLOW_FILE_MODS` | `wp-admin/plugin-editor.php` |

**Network-only plugins:** plugins with `Network: true` in their header (or that declare `Site Wide Only: true` legacy variant) can ONLY be activated network-wide. Their per-site activate links are suppressed.

**Permission-denied state:** `wp_die()` 403. Shell renders no-access state.

---

## 4. Data model

### Primary entity
- **Type:** plugin (file path key e.g. `akismet/akismet.php`)
- **REST endpoint:** `GET /wp/v2/plugins` — full CRUD via `WP_REST_Plugins_Controller` (this is the only network-admin entity with full REST coverage).

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `plugin` (file) | `plugin` | string | row key (e.g. `akismet/akismet.php`) |
| `name` | `name` | string | display |
| `description` | `description.raw` / `.rendered` | string | display |
| `version` | `version` | string | display |
| `author` | `author`, `author_uri` | string | display |
| `plugin_uri` | `plugin_uri` | URL | display |
| `requires_wp` | `requires_wp` | string | warns if unmet |
| `requires_php` | `requires_php` | string | warns if unmet |
| `requires_plugins` | `requires_plugins[]` | string[] | dependency labels |
| `network_only` | `network_only` | bool | hides per-site activate links elsewhere |
| `status` | `status` | enum: `active` (network-active), `inactive`, `active-network`, `network-only` | filter facet |
| `update available` | derived from `update_plugins` site transient | bool | facet |
| `auto-update enabled` | derived from `auto_update_plugins` site option | bool | facet |
| `must-use` | filesystem: `wp-content/mu-plugins/*.php` | bool | facet |
| `drop-in` | filesystem: `wp-content/{advanced-cache,db,...}.php` | bool | facet |

### Status filter facets (tabs)
| Tab | Counts source |
|---|---|
| All | All discovered + MU + drop-ins |
| Active | network-active plugins |
| Inactive | not network-active |
| Update Available | intersection with `update_plugins` transient |
| Recently Active | `recently_activated` site option (last 5, time-decayed) |
| Auto-updates Enabled | `auto_update_plugins` site option |
| Auto-updates Disabled | complement |
| Must-Use | `mu-plugins` |
| Drop-ins | `drop_ins` |

Counts on each tab.

### Query parameters (list)
- `plugin_status` — one of the tab keys (`all`, `active`, `inactive`, `upgrade`, `recently_activated`, `auto-update-enabled`, `auto-update-disabled`, `mustuse`, `dropins`)
- `s` — search (matches name/description/author)
- `paged` — pagination

### Plugin Install screen
Reuses `wp-admin/plugin-install.php`. Tabs: **Search** (wp.org), **Featured / Popular / Recommended / Favorites / Beta**, **Upload Plugin** (zip upload). Detail thickbox + Install button.

### Plugin File Editor
Reuses `wp-admin/plugin-editor.php`. Plugin picker + file tree + textarea + Save (nonce). Disabled when `DISALLOW_FILE_MODS` or `DISALLOW_FILE_EDIT`.

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| List plugins | `GET /wp/v2/plugins` | Works. Includes `network_only` and `status` (`active-network` for network-active). |
| Get plugin | `GET /wp/v2/plugins/{plugin}` | Works. |
| Install plugin from wp.org | `POST /wp/v2/plugins` with `slug` body | Works. Cap: `install_plugins`. |
| Update plugin status | `PUT /wp/v2/plugins/{plugin}` with `status: 'active' | 'inactive' | 'active-network'` | Works! `active-network` is the network-activate path. Cap: `manage_network_plugins`. **This is the only network-admin mutation in core REST that has full coverage.** |
| Delete plugin | `DELETE /wp/v2/plugins/{plugin}` | Works. Cap: `delete_plugins`. Plugin must be inactive first. |
| Auto-update toggle | None | **GAP** — `auto_update_plugins` site option, no REST. Custom endpoint required. |
| Update plugin (run upgrade) | None | **GAP** — REST `PUT` only changes `status`; running an upgrade still requires `wp-admin/update.php?action=update-selected`. |
| Edit plugin file | None (security boundary) | **GAP — by design.** |
| Bulk operations | Iterate REST calls | Works for all `PUT`/`DELETE`-style mutations. |

Plugins have the strongest REST coverage of any network-admin entity. Network activate / deactivate / install / delete are all reachable via REST.

---

## 5. Layout regions (semantic)

### Network Plugins list
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Plugins")                                        │
│  └─ Primary action: "Add Plugin" (cap: install_plugins)      │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Status tabs: All | Active | Inactive | Update Available  │
│  │               | Recently Active | Auto-updates Enabled    │
│  │               | Auto-updates Disabled | Must-Use | Drop-ins│
│  └─ Search (search installed plugins)                        │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  └─ Network Activate | Network Deactivate | Update |         │
│     Enable/Disable Auto-updates | Delete                     │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  └─ Table: [cb] | Plugin (name + description + meta) |       │
│            Auto-Updates                                      │
│            Per-row hover actions:                            │
│              - Network Activate / Deactivate                 │
│              - Edit (file editor)                            │
│              - Delete (when inactive)                        │
└─────────────────────────────────────────────────────────────┘
```

### Add Plugin (install)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Add Plugins"                                        │
│ FILTER ROW: Featured | Popular | Recommended | Favorites |   │
│             Beta | Search | Upload Plugin                    │
├─────────────────────────────────────────────────────────────┤
│ GRID of plugin cards (name, author, icon, "Install Now")     │
│  Detail modal (changelog, ratings, install)                  │
└─────────────────────────────────────────────────────────────┘
```

### Plugin File Editor
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Edit Plugins"                                       │
│ Plugin picker (select)                                       │
│ Two-column:                                                  │
│  - Left: file tree                                           │
│  - Right: code textarea + Save                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading list | First fetch | Skeleton rows |
| Empty filtered | No plugins match | "No plugins found." |
| Bulk-update in progress | Bulk Update | Iframe streaming `update.php?action=update-selected` |
| Delete confirmation | Bulk Delete | Full-page list of targets |
| Cannot deactivate (Network-Only) | Tried to per-site deactivate a `Network: true` plugin | UI hides per-site action; only network-deactivate allowed |
| Dependency unmet | Plugin has unsatisfied `Requires Plugins` | Inline warning, activate disabled |
| WP / PHP version unmet | `requires_wp` / `requires_php` | Inline warning, activate disabled |
| File-edit refused | `DISALLOW_FILE_MODS` | Editor screen blocks |
| Auto-update bulk no-selection | "No items selected." inline error |

---

## 7. Actions

### List header
- **Add Plugin** — navigate to install. Cap: `install_plugins`.

### Per-row actions
| Action | Cap | REST |
|---|---|---|
| Network Activate | `manage_network_plugins` | `PUT /wp/v2/plugins/{plugin}` `status=active-network` |
| Network Deactivate | `manage_network_plugins` | `PUT /wp/v2/plugins/{plugin}` `status=inactive` |
| Edit | `edit_plugins` | Open file editor |
| Delete | `delete_plugins` (plugin must be inactive) | `DELETE /wp/v2/plugins/{plugin}` |
| Enable / Disable Auto-update | `update_plugins` | Custom endpoint over `auto_update_plugins` site option |

### Bulk actions
| Bulk action | Behavior |
|---|---|
| Network Activate | Iterate selected → REST `PUT` `status=active-network` |
| Network Deactivate | Iterate → `PUT` `status=inactive` |
| Update | Iframe to `update.php?action=update-selected` |
| Enable / Disable Auto-updates | Mutate `auto_update_plugins` site option |
| Delete | Confirmation interstitial → `DELETE /wp/v2/plugins/{plugin}` per item |

### Add Plugin
- Search wp.org → install
- Upload zip → install (cap: `upload_plugins`)
- "More details" thickbox

### Plugin File Editor
- Select plugin + file → edit → Save (nonce `edit-plugin_{plugin}_{file}`)

### Optimistic vs. blocking
- **Network activate / deactivate** — optimistic-friendly (REST returns updated entity).
- **Delete** — blocking, full-page confirm.
- **Update** — blocking, iframe progress.
- **Auto-update toggle** — optimistic.

---

## 8. Filters, sort, search, pagination

### Filters
Status tabs (see § 4). No additional facets in core.

### Sort
List is unsorted (alpha-by-name). No sortable columns declared.

### Search
- Single `s` input
- Matches against name / description / author / tags via `_search_callback()` in the list table

### Pagination
- Default page size: per-user screen option (default 999; plugin counts are typically small)

---

## 9. Forms & inputs

### Add Plugin upload
| Field | Type | Required |
|---|---|---|
| `pluginzip` | file | yes (zip) |

### Plugin File Editor
| Field | Type | Required |
|---|---|---|
| `plugin` | hidden | yes |
| `file` | hidden | yes |
| `newcontent` | textarea | yes |

Save: nonce `edit-plugin_{plugin}_{file}`. Reload after save.

---

## 10. Routing & URL state

Original wp-admin URL params (list):
- `?plugin_status={status}&s={query}&paged={n}`
- `?action={activate|deactivate|update-selected|delete-selected|enable-auto-update|disable-auto-update}&plugin={plugin}` (single-site equivalent)
- Network-context handlers post to `network/plugins.php?action=...`

Recommended shell hash:
```
#/network-plugins?status=inactive&s=akismet
#/network-plugins/install
#/network-plugins/install?upload=1
#/network-plugins/edit?plugin={plugin}&file=plugin.php
```

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| "Add Plugin" | install sub-screen | none |
| "Edit" per row | file editor | plugin |
| Auto-update column | doc link | external |
| Bulk Update | iframe stream | selected plugins |
| Detail thickbox | external repo link | new tab |

### Inbound
| Origin | Behavior |
|---|---|
| `network-updates` "Update Plugins" | this list with `plugin_status=upgrade` |
| `network-settings` Menu Settings → "Plugins" toggle | sets `menu_items[plugins]`, no direct nav |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Network activate (single) | "Plugin activated." |
| Bulk activate | "{N} plugins activated." |
| Network deactivate | "Plugin deactivated." |
| Bulk deactivate | "{N} plugins deactivated." |
| Deleted | "{N} plugins deleted." |
| Auto-update enabled | "Plugin will be auto-updated." |
| Auto-update disabled | "Plugin will no longer be auto-updated." |
| Activation error (e.g. fatal during load) | Inline error notice with details |
| Dependency unmet | Inline warning, activate suppressed |

Destructive actions: confirmation interstitial; no undo (the data on disk is gone).

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `Space` | Toggle selection |

### ARIA
- Status tabs: `role="tablist"` with counts in name.
- Auto-update column: button with `aria-pressed`.
- Plugin description: a `<p>` linked by `aria-describedby` from the row's primary cell so screen readers read description after name.
- File editor textarea: `aria-label="Edit plugin file: {file}"`.
- Bulk-delete interstitial: focus trap.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_plugins-network_columns` | Add columns | Replace with `fields` API |
| `network_admin_plugin_action_links_{plugin}` | Per-row action links | Slot |
| `plugin_row_meta` | Per-row meta links | Slot |
| `bulk_actions-plugins-network` | Add bulk actions | Action registry |
| `plugins_list_table_query_args` | Modify query args | Replace |
| `auto_update_plugins` (option event) | After auto-update toggle | Event bus |
| `handle_network_bulk_actions-{screen}` | Custom bulk actions | Action registry |

---

## 15. Mapping & implementation status

### Current shell coverage
- None. Single-site `core:plugins` is also not yet built.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `network-plugins` source | High | Top-level network app; REST is well-supported |
| Status tabs (network-aware "Active" semantics) | High | "Active" tab means network-active |
| Recently-active tab | Low | `recently_activated` site option |
| Must-Use / Drop-ins tabs | Medium | Read-only filesystem listings |
| Auto-update toggle endpoint | Medium | Custom; mutates `auto_update_plugins` |
| Run-upgrade endpoint | Medium | REST has no run-upgrade — iframe `update.php` interim |
| Bulk update progress UI | Medium | Iframe streaming |
| Plugin install (search wp.org, upload) | Medium | `wp-admin/plugin-install.php` reuses; iframe interim |
| Plugin file editor | Low | Iframe; security-sensitive |
| Dependency-aware activate ordering | Medium | REST returns 400 if unmet; surface as inline warning |

### Acceptable interim
`iframe:network/plugins.php`, `iframe:network/plugin-install.php`, `iframe:network/plugin-editor.php` for v1. Full REST surface justifies a native rebuild for the **list** before the install/editor sub-screens.

---

## 16. Out of scope

- **Per-site plugin activation** — that's a single-site Plugins screen concern, gated by `menu_items[plugins]`.
- **Plugin zip signing / verification** — out of plugin scope.
- **Restricted plugins** (`hide_plugin_filter` and similar plugins) — keep transparent passthrough.

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/plugins.php`
  - `wp-admin/network/plugin-install.php`
  - `wp-admin/network/plugin-editor.php`
- List table (shared with single-site): `wp-admin/includes/class-wp-plugins-list-table.php`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-plugins-controller.php`
- Auto-update site option: `auto_update_plugins`
- Recently-activated option: `recently_activated`
- Single-site equivalent (related): `wp-admin/plugins.php`
- WP-CLI parity: `wp plugin activate --network`, `wp plugin deactivate --network`
