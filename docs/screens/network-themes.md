# Screen Spec: Network Themes (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/themes.php` (theme list — network-enable/disable/auto-update/delete)
- `wp-admin/network/theme-install.php` (delegates to `wp-admin/theme-install.php`)
- `wp-admin/network/theme-editor.php` (delegates to `wp-admin/theme-editor.php`)
- `wp-admin/includes/class-wp-ms-themes-list-table.php`

**Current shell coverage:** None.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_network_themes`.

This spec describes the **semantic surface** of the network-level Themes management screen, the network theme install screen, and the theme file editor in the network context. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-themes` |
| Display name | "Themes" (network context) |
| Original URLs | `/wp-admin/network/themes.php`, `/wp-admin/network/theme-install.php`, `/wp-admin/network/theme-editor.php?file={file}&theme={stylesheet}` |
| Menu location | `menu[15]` in `wp-admin/network/menu.php` (cap: `manage_network_themes`) |
| Submenu items | Installed Themes (this list), Add Theme (install), Theme File Editor |
| Parent app | None — top-level network app |
| Sub-screens | List (default), Install, File Editor, Bulk-update iframe, Bulk-delete confirmation |

The shell's existing single-site themes flow (if any) does not cover network operations. "Network enable" is a multisite-only concept layered over the standard `WP_Theme` data: a theme present on disk becomes available to a site only if it's network-enabled OR the site has it in its `allowedthemes` option (see `network-sites.md` Edit Site → Themes tab).

---

## 2. Purpose

Decide which installed themes are available to sites on the network, install new themes from the WordPress.org directory or a zip upload, manage auto-update preferences, and (with appropriate cap) edit theme files in-place.

Jobs to be done:
- **Network-enable a theme** so any site can switch to it.
- **Network-disable a theme** so it disappears from the per-site Appearance picker (without uninstalling).
- **Update themes** (single + bulk).
- **Toggle auto-updates** (single + bulk).
- **Install a new theme** (search wp.org, upload zip).
- **Delete a theme** (with explicit warning that the theme may be in use).
- **Edit theme files** (escape hatch; gated by `edit_themes` and not allowed when `DISALLOW_FILE_EDIT` is true).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View list | `manage_network_themes` | `wp-admin/network/themes.php` line 13 |
| Network enable / disable | `manage_network_themes` | implicit; `WP_Theme::network_enable_theme()` |
| Update themes | `update_themes` | `themes.php` line 239 |
| Auto-update toggle | `update_themes` AND `wp_is_auto_update_enabled_for_type('theme')` | `themes.php` line 239 |
| Delete theme | `delete_themes` | `themes.php` line 101 |
| Install theme | `install_themes` | `wp-admin/theme-install.php` |
| Edit theme files | `edit_themes` AND ! `DISALLOW_FILE_EDIT` | `wp-admin/theme-editor.php` |

**Main-site protection:** the active theme on the network's main site cannot be deleted (`error=main`).

**Permission-denied state:** `wp_die()` 403 throughout. Shell renders no-access state.

---

## 4. Data model

### Primary entity
- **Type:** `WP_Theme` (filesystem-discovered, not a DB row)
- **REST endpoint:** `GET /wp/v2/themes` — returns theme metadata. Network context exposes themes regardless of per-site `allowedthemes`.

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `stylesheet` | `stylesheet` | string | row key |
| `name` | `name.rendered` | string | display |
| `description` | `description.rendered` | string | display |
| `version` | `version` | string | display |
| `author` | `author.rendered`, `author_uri` | string | display |
| `theme_uri` | `theme_uri.rendered` | URL | display |
| `template` (parent) | `template` | string | child-theme indicator |
| `tags` | `tags.rendered` | string[] | facet (search-filter only) |
| `screenshot` | `screenshot` | URL | thumbnail |
| `status` (network-enabled) | `status` | enum: `active`/`inactive` (network) | filter facet |
| `update available` | derived from `get_site_transient('update_themes')` | bool | facet |
| `auto-update enabled` | derived from `get_site_option('auto_update_themes')` | bool | facet |
| `update_supported` | `WP_Theme::$update_supported` | bool | gates auto-update |
| `errors` (broken) | `wp_get_themes(['errors' => true])` | array | facet |

### Status filter facets (tabs)
| Tab | Source |
|---|---|
| All | All discovered themes |
| Enabled | network-active set: `WP_Theme::$network_enabled` |
| Disabled | not in the above |
| Update Available | intersection with `update_themes` transient |
| Broken | `wp_get_themes(['errors' => true])` |
| Auto-updates Enabled | `auto_update_themes` site option |
| Auto-updates Disabled | complement |

Counts on each tab.

### Query parameters (list)
- `theme_status` — one of the tab keys
- `s` — search (matches name/description/author/tags)
- `paged` — pagination
- `orderby` — limited; primary column is name

### Theme Install screen
Reuses `wp-admin/theme-install.php`. Tabs:
- **Search** (wp.org)
- **Featured** / **Popular** / **Latest** / **Favorites** / **Block Themes** (filter chips)
- **Upload Theme** — zip upload

Detail thickbox on each result. "Install" button installs to the network's `wp-content/themes`.

### Theme File Editor
Reuses `wp-admin/theme-editor.php`. Selects a theme + a file in its tree, shows a textarea, saves with nonce.

### Auto-update mutations
| Action | Cap | Site option |
|---|---|---|
| `enable-auto-update` | `update_themes` + auto-updates enabled | `auto_update_themes[] = $stylesheet` |
| `disable-auto-update` | same | `auto_update_themes` filter-out |
| `enable-auto-update-selected` | bulk variant | `auto_update_themes` merge |
| `disable-auto-update-selected` | bulk variant | array_diff |

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| List themes | `GET /wp/v2/themes` | Works. |
| Get theme | `GET /wp/v2/themes/{stylesheet}` | Works. |
| Network enable | None | **GAP** — `WP_Theme::network_enable_theme()` writes the `allowedthemes` site option (network-wide); no REST endpoint. |
| Network disable | None | **GAP** — `WP_Theme::network_disable_theme()`. |
| Bulk enable / disable | None | **GAP** — same. |
| Update theme | None | **GAP** — `wp-admin/update.php?action=update-selected-themes` is admin-side; REST has no endpoint. (Plugins controller has CRUD; themes controller is read-only.) |
| Delete theme | `DELETE /wp/v2/themes/{stylesheet}` | **NOT EXPOSED** — themes controller does not implement DELETE. **GAP.** |
| Install theme | None | **GAP** — `wp-admin/theme-install.php` uses `wp_install_theme()` PHP-side. |
| Auto-update toggle | None | **GAP** — `auto_update_themes` site option, no REST. |
| Edit theme file | None (security boundary) | **GAP — by design.** Should remain admin-side. |

The themes controller is read-only in core. Network theme management is essentially un-RESTed.

---

## 5. Layout regions (semantic)

### Network Themes list
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Themes")                                         │
│  └─ Primary action: "Add Theme" (cap: install_themes)        │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Status tabs: All | Enabled | Disabled | Update Available │
│  │               Auto-updates Enabled | Auto-updates Disabled│
│  │               Broken                                      │
│  └─ Search (search installed themes)                         │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  └─ Network Enable | Network Disable | Update |              │
│     Enable Auto-updates | Disable Auto-updates | Delete      │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  └─ Table: [cb] | Theme (name + author + thumbnail) |        │
│            Description | Auto-Updates                        │
│            Per-row hover actions: Network Enable/Disable |   │
│            Edit (file editor) | Delete                       │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination                                               │
└─────────────────────────────────────────────────────────────┘
```

### Add Theme (install)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Add Themes"                                         │
│ FILTER ROW: Featured | Popular | Latest | Favorites |        │
│             Block Themes | Search | Upload Theme             │
├─────────────────────────────────────────────────────────────┤
│ GRID of theme cards (name, author, screenshot, "Install")    │
│  Detail modal (preview + install)                            │
└─────────────────────────────────────────────────────────────┘
```

### Theme File Editor
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Edit Themes"                                        │
│ Theme picker (select)                                        │
│ Two-column:                                                  │
│  - Left: file tree                                           │
│  - Right: code textarea + Save                               │
└─────────────────────────────────────────────────────────────┘
```

### Bulk-update iframe
Bulk update launches an iframe at `update.php?action=update-selected-themes` so progress streams live. Same pattern as single-site.

### Bulk-delete confirmation
Full-page interstitial listing the themes to delete with a warning about other sites possibly using them.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading list | First fetch | Skeleton rows |
| Empty filtered | No themes match status/search | "No items found." |
| Bulk-update in progress | Bulk Update action | Iframe streaming `update.php` output |
| Delete confirmation | Bulk Delete | Full-page list of targets with warning |
| Delete refused | Tried to delete active main-site theme | Notice: "You cannot delete a theme while it is active on the main site." |
| File-edit refused | `DISALLOW_FILE_EDIT` is true | Editor screen blocks with a warning |
| Network disabled | Theme disabled — sites that already use it keep it | Note in help tab: "If the network admin disables a theme that is in use, it can still remain selected on that site. If another theme is chosen, the disabled theme will not appear..." |

---

## 7. Actions

### List header
- **Add Theme** — navigate to install. Cap: `install_themes`.

### Per-row actions
| Action | Cap | Notes |
|---|---|---|
| Network Enable | `manage_network_themes` | `WP_Theme::network_enable_theme($stylesheet)` |
| Network Disable | `manage_network_themes` | `WP_Theme::network_disable_theme($stylesheet)` |
| Edit | `edit_themes` | Opens file editor for that theme |
| Delete | `delete_themes` | Confirmation interstitial (cannot delete active main-site theme) |
| Enable / Disable Auto-update | `update_themes` | Updates `auto_update_themes` option |

### Bulk actions
| Bulk action | Behavior |
|---|---|
| Network Enable | `WP_Theme::network_enable_theme((array) $themes)` |
| Network Disable | `WP_Theme::network_disable_theme((array) $themes)` |
| Update | Iframe to `update.php?action=update-selected-themes&themes=...` |
| Delete | Confirmation interstitial → `delete_theme()` per item |
| Enable Auto-updates | Append to `auto_update_themes` site option |
| Disable Auto-updates | Remove from `auto_update_themes` site option |

### Add Theme
- Search wp.org → install
- Upload zip → install
- Side action "Preview" (thickbox modal)

### Theme File Editor
- Select theme + file → edit → Save (nonce)

### Optimistic vs. blocking
- **Network enable / disable** — could be optimistic; core uses redirect + notice (blocking).
- **Delete** — blocking, full-page confirm.
- **Update** — blocking, iframe progress.
- **Auto-update toggle** — optimistic-friendly.

---

## 8. Filters, sort, search, pagination

### Filters
Status tabs (see § 4). No additional facets in core.

### Sort
List is largely unsorted (or alpha-by-name). `WP_MS_Themes_List_Table` does not declare sortable columns.

### Search
Single `s` input. Matches name/description/author/tags via `_search_callback()`.

### Pagination
- Default page size: per-user screen option (default 999 — themes count is small).
- Search redirects via `theme_status=search`.

---

## 9. Forms & inputs

### Add Theme upload
| Field | Type | Required |
|---|---|---|
| `themezip` | file | yes (zip) |

### Theme File Editor
| Field | Type | Required |
|---|---|---|
| `theme` | hidden (selected stylesheet) | yes |
| `file` | hidden (relative path) | yes |
| `newcontent` | textarea | yes |

Save: nonce `edit-theme_{stylesheet}_{file}`. PHP fopen + fwrite. Reload after save.

---

## 10. Routing & URL state

Original wp-admin URL params (list):
- `?theme_status={status}&s={query}&paged={n}`
- `?action={enable|disable|update-selected|delete-selected|enable-auto-update|disable-auto-update}&theme={stylesheet}`

Recommended shell hash:
```
#/network-themes?status=disabled&s=astra
#/network-themes/install
#/network-themes/install?upload=1
#/network-themes/edit?theme={stylesheet}&file=style.css
```

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| "Add Theme" | install sub-screen | none |
| "Edit" per row | file editor | stylesheet |
| Auto-update column | doc link | external |
| Bulk Update | iframe stream | selected stylesheets |
| Theme detail thickbox → Preview | external preview URL | new tab |

### Inbound
| Origin | Behavior |
|---|---|
| `network-sites` Edit Site → Themes tab → "Manage themes" | this list (often pre-filtered to enabled/disabled) |
| `network-updates` "Update Themes" | this list with `theme_status=upgrade` |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Theme enabled (single) | "Theme enabled." |
| Bulk enabled | "{N} themes enabled." |
| Theme disabled | "Theme disabled." |
| Bulk disabled | "{N} themes disabled." |
| Deleted (single / bulk) | "Theme deleted." / "{N} themes deleted." |
| No selection | "No theme selected." |
| Cannot delete main-site active theme | "You cannot delete a theme while it is active on the main site." |
| Auto-update enabled | "Theme will be auto-updated." / "{N} themes will be auto-updated." |
| Auto-update disabled | "Theme will no longer be auto-updated." |
| Bulk update | Iframe progress; errors per theme inside the iframe |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `Space` | Toggle selection on focused row |

### ARIA
- Status tab strip: `role="tablist"` with counts in accessible name.
- Auto-update column: a button with `aria-pressed` reflecting state.
- File editor textarea: large `<textarea>`; ensure font-mono and proper `aria-label` ("Edit theme file: {file}").
- Bulk-delete interstitial: focus trap.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_themes-network_columns` | Add columns | Replace with `fields` API |
| `manage_themes_custom_column` | Render column cell | Same |
| `bulk_actions-themes-network` | Add bulk actions | Shell action registry |
| `theme_row_meta` (filter) | Per-row meta links | Slot |
| `network_admin_plugin_action_links_{plugin}` | Per-row action links (themes use a generic equivalent) | Same |
| `wp_is_auto_update_enabled_for_type` (filter) | Disable auto-update UI | Document |
| `handle_network_bulk_actions-{screen}` | Custom bulk actions | Action registry |

---

## 15. Mapping & implementation status

### Current shell coverage
- None.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `network-themes` source | High | Top-level network app |
| Network enable / disable REST | High | No REST surface; need custom endpoints |
| Bulk update iframe (or rebuild update streaming) | Medium | Iframe is acceptable interim |
| Auto-update toggle endpoint | Medium | Custom endpoint over `auto_update_themes` site option |
| Delete-theme endpoint | Medium | Themes REST controller does not implement DELETE |
| Theme install (search wp.org) | Medium | Reuse single-site `wp-admin/theme-install.php` flow via iframe |
| Theme file editor | Low | Iframe acceptable; security-sensitive |
| Status tabs with counts | High | Computed shell-side from theme list |
| Broken-theme tab | Low | `wp_get_themes(['errors' => true])` shape |

### Acceptable interim
`iframe:network/themes.php`, `iframe:network/theme-install.php`, `iframe:network/theme-editor.php` for v1.

---

## 16. Out of scope

- **Theme preview** beyond linking to the public preview URL.
- **Site-level theme allowlist** — that lives in `network-sites.md` Edit Site → Themes tab.
- **Block theme editor** — same admin-page entry as single-site; not specific to network.
- **Theme zip signing / verification** — out of plugin scope.

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/themes.php`
  - `wp-admin/network/theme-install.php`
  - `wp-admin/network/theme-editor.php`
- List table: `wp-admin/includes/class-wp-ms-themes-list-table.php`
- PHP API: `WP_Theme::network_enable_theme`, `WP_Theme::network_disable_theme`, `wp_get_themes`, `delete_theme`, `auto_update_themes` site option
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-themes-controller.php` (read-only)
- Bulk-update streaming: `wp-admin/update.php?action=update-selected-themes`
- Single-site equivalent (related): `wp-admin/themes.php`
