# Screen Spec: Plugins (installed list, add, file editor)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/plugins.php`, `wp-admin/plugin-install.php`, `wp-admin/plugin-editor.php`, `WP_Plugins_List_Table` (`wp-admin/includes/class-wp-plugins-list-table.php`), `WP_Plugin_Install_List_Table` (`wp-admin/includes/class-wp-plugin-install-list-table.php`)
**Current shell coverage:** `core:plugins` → `src/apps/plugins/index.js` (native installed-plugins list with activate / deactivate / delete, cap-gated on `activate_plugins`; registered in `src/runtime/registry/builtins.js`). See `src/apps/plugins/app.md`. The add / file-editor screens remain iframe-only.

This spec describes the **semantic surface** of the three plugin-management screens so an agent can rebuild them in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs. Single-site context only — network-admin variants of these screens live in a separate `network-admin/plugins.md` spec.

The three screens are documented as one app (`core:plugins`) because they share an entity (`plugins`), capabilities, and REST surface. A reasonable shell mapping is:
- `core:plugins` → installed list (default route)
- `core:plugins-install` → add / browse directory / upload
- `core:plugin-editor` → file editor

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `plugins` |
| Display name | "Plugins" |
| Original URL | `/wp-admin/plugins.php` |
| Sub-screens | `/wp-admin/plugin-install.php` (Add Plugin), `/wp-admin/plugin-editor.php` (Plugin File Editor) |
| Menu location | Top-level "Plugins"; submenu items: Installed Plugins, Add New Plugin, Plugin File Editor |
| Parent app | None — top-level app |

---

## 2. Purpose

Manage the lifecycle of plugins installed on a WordPress site: discover, install, activate, configure, update, deactivate, delete, and (rarely) edit plugin source files.

Jobs to be done:
- **Activate or deactivate a plugin** — fastest path from the installed list.
- **Update a plugin** — see "update available" notices, run inline upgrade.
- **Install a new plugin** — search the WordPress.org directory, install + activate in one flow; or upload a `.zip`.
- **Find a plugin's settings** — follow the per-row Settings link if the plugin advertises one.
- **Delete a plugin permanently** — remove files and (where applicable) data.
- **Triage updates across many plugins** — bulk update.
- **Edit a plugin file in-place** — emergency hot-fix; dangerous; controlled by `DISALLOW_FILE_EDIT`.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View installed list | `activate_plugins` | `plugins.php` line 12, `WP_Plugins_List_Table::ajax_user_can()` |
| Activate / deactivate single plugin | `activate_plugin`, `deactivate_plugin` (plugin-scoped) | `plugins.php` action handlers |
| Bulk activate / deactivate | `activate_plugins` / `deactivate_plugins` | `plugins.php` |
| Update | `update_plugins` | `plugins.php`, `WP_Plugins_List_Table::get_bulk_actions()` |
| Delete | `delete_plugins` | `plugins.php` |
| Manage auto-updates | `update_plugins` + `wp_is_auto_update_enabled_for_type('plugin')` | `plugins.php` |
| Resume a paused plugin | `resume_plugin` (plugin-scoped) | `plugins.php` |
| View Add Plugin screen | `install_plugins` | `plugin-install.php` line 18 |
| Upload `.zip` | `upload_plugins` | `plugin-install.php` line 150 |
| Edit plugin files | `edit_plugins` | `plugin-editor.php` line 17 |
| Network-activate / network-deactivate | `manage_network_plugins` | network admin only |

**Permission-denied states:**
- Lacking `activate_plugins`: core renders `wp_die('Sorry, you are not allowed to manage plugins for this site.')`. Shell should mirror with a 403 view inside the content region, not blank.
- Lacking `install_plugins`: same pattern on Add Plugin.
- Lacking `edit_plugins`: same pattern on Plugin File Editor.
- `DISALLOW_FILE_EDIT` constant defined in `wp-config.php`: file editor is fully disabled regardless of caps. `edit_plugins` is filtered to `false` by `map_meta_cap`.
- `DISALLOW_FILE_MODS` constant: install/update/delete all disabled, regardless of caps.

**Multisite:**
- Single-site users with `activate_plugins` see only the Installed list, scoped to plugins they may activate on their site. Network-active plugins appear in the Active filter as read-only (cannot deactivate at site level — controlled by `is_plugin_active_for_network()`).
- Network-only plugins (header `Network: true`) are filtered out unless the user has `manage_network_plugins`.
- Add Plugin and Plugin File Editor in single-site context redirect to network admin in multisite (`plugin-install.php` line 22, `plugin-editor.php` line 12). Surface as "this action requires network admin" in shell.

---

## 4. Data model

### Primary entity
- **Type:** plugin (file path; e.g. `akismet/akismet.php`, `hello.php` for single-file plugins)
- **REST endpoint:** `GET /wp/v2/plugins`
- **Single-record endpoint:** `GET /wp/v2/plugins/{plugin}` where `{plugin}` is the file path with `.php` stripped (e.g. `akismet/akismet`)
- **Controller:** `WP_REST_Plugins_Controller` (`wp-includes/rest-api/endpoints/class-wp-rest-plugins-controller.php`)

### Fields used by the installed list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `plugin` | `plugin` | string | id (file path without `.php`) |
| `name` | `name` | string | "Plugin Name" header |
| `status` | `status` | enum: `active`, `inactive`, `network-active` | row primary state |
| `description.raw` / `.rendered` | `description` | object | shown beneath name; rendered includes inline links |
| `version` | `version` | string | shown in row meta |
| `author` | `author` (string with `<a>` markup) | string | "By {Author}" line; markup wrapped |
| `author_uri` | `author_uri` | URL | author link target |
| `plugin_uri` | `plugin_uri` | URL | "Visit plugin site" link target |
| `requires_wp` | `requires_wp` | string (version) | `Requires at least` header |
| `requires_php` | `requires_php` | string (version) | `Requires PHP` header |
| `network_only` | `network_only` | bool | `Network: true` header |
| `textdomain` | `textdomain` | string | not displayed; used for translation |

Fields **not in REST but shown by the list table** (gaps):
- **Update available** — flag derived from `update_plugins` site transient. Available via `wp.updates` AJAX, not REST.
- **Auto-update enabled / disabled / forced** — derived from `auto_update_plugins` site option + `wp_is_auto_update_forced_for_item` filter chain. Not REST-exposed.
- **Recently activated** — derived from `recently_activated` option; entries expire after a week.
- **Paused** — `is_plugin_paused()` checks WSOD recovery; not REST-exposed.
- **Must-Use plugins** (`mu-plugins/`) — bypass activation, always loaded.
- **Drop-ins** (`wp-content/{advanced-cache,db,maintenance,object-cache,...}.php`) — replace core internals.
- **Plugin dependencies** — `Requires Plugins:` header (WP 6.5+). `WP_Plugin_Dependencies` resolves slugs; `has_unmet_dependencies()`, `has_circular_dependency()`, `has_active_dependents()` gate row actions. Not REST-exposed.

### Query parameters
- `status` — comma-separated list of `active`, `inactive`, `network-active` (REST). Maps to status filter tabs.
- `search` — full-text across plugin name + description (REST: implemented client-side in `WP_REST_Plugins_Controller::does_plugin_match_request`, matches plugin file, name, description, plugin URI, author, author URI, textdomain).
- `context` — `view` (default) hides `description.raw`; `edit` exposes both raw and rendered.
- Pagination: REST does not paginate the plugins list — it returns all matched plugins in a single response (the list is small by nature; admin renders 999/page). Shell can render the full set or paginate client-side.

### Aggregate data — status counts
The status filter row shows: `All (N) | Active (N) | Inactive (N) | Recently Active (N) | Update Available (N) | Auto-updates Enabled (N) | Auto-updates Disabled (N) | Must-Use (N) | Drop-ins (N)`.

- Source: `WP_Plugins_List_Table::prepare_items()` builds these locally via `get_plugins()`, `get_mu_plugins()`, `get_dropins()`, plus the `update_plugins` transient and `recently_activated` option.
- REST exposure: none. Shell can compute Active/Inactive/Network-active from the full plugins list response by counting `status`. Update Available, Recently Active, Must-Use, Drop-ins, Auto-update Enabled/Disabled have no REST equivalent.

### Data model: Add Plugin (browse directory)

Distinct entity. Source is the WordPress.org Plugin Directory API (`api.wordpress.org/plugins/info/1.2/`), wrapped server-side by `plugins_api()`.

| Field | Origin | Notes |
|---|---|---|
| `slug` | wp.org | directory slug; uniqueness key |
| `name` | wp.org | |
| `version` | wp.org | latest |
| `author` | wp.org | HTML markup wrapped |
| `rating` | wp.org | 0–100 |
| `num_ratings` | wp.org | rating count |
| `active_installs` | wp.org | rough usage signal |
| `last_updated` | wp.org | "Updated 2 weeks ago" |
| `tested` | wp.org | "Tested up to" WP version |
| `requires` | wp.org | min WP version |
| `requires_php` | wp.org | min PHP version |
| `icons` | wp.org | object: `{ "1x": URL, "2x": URL, "default": URL, "svg": URL }` |
| `banners` | wp.org | object: `{ "low": URL, "high": URL }` |
| `short_description` | wp.org | card description |
| `sections` | wp.org | object with `description`, `installation`, `faq`, `changelog`, `screenshots`, `reviews` (HTML) — used by More Details modal |

REST exposure: **gap.** `WP_REST_Plugins_Controller::create_item` consumes the wp.org API server-side via `plugins_api()` and only returns the installed plugin record. The browse / search / details data has **no REST endpoint**. Shell options: (a) call `plugins_api()` through a custom `/wp-admin-workspaces/v1/plugins-directory` proxy endpoint, or (b) call `https://api.wordpress.org/plugins/info/1.2/` directly from the browser (CORS allows it).

### Data model: Plugin File Editor

| Field | Source | Notes |
|---|---|---|
| Selected plugin | `plugin` query param (file path) | dropdown of all plugins |
| File list | `get_plugin_files($plugin)` | files inside the plugin directory matching `wp_get_plugin_file_editable_extensions($plugin)` (default: `php`, `txt`, `tmpl`, `xml`, `js`, `css`, `html`, `htm`, `md`, `json`, `yaml`, `yml`, `inc`) |
| File contents | `file_get_contents()` | raw text |
| Save | POST `plugin-editor.php` form, no AJAX | `wp_edit_theme_plugin_file()` validates by attempting to load the modified plugin in a sandbox; if PHP fatal, the plugin is auto-deactivated and edit rejected. |

REST exposure: **gap.** No REST endpoint exists for plugin files. Acceptable interim is `iframe:plugin-editor.php` or omit the screen entirely (recommended — cap-gated by default, dangerous, increasingly deprecated).

---

## 5. Layout regions (semantic)

### 5a. Installed Plugins list

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Plugins")                                        │
│  └─ Primary action: "Add New Plugin" → /plugins-install      │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Status tabs (All | Active | Inactive | Recently Active  │
│  │      | Update Available | Auto-updates Enabled |          │
│  │      Auto-updates Disabled | Must-Use | Drop-ins)         │
│  └─ Search input (filters across name + description)         │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  └─ Bulk action select + apply                               │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION (table)                                          │
│  └─ One row per plugin:                                      │
│     - selection checkbox (hidden for must-use / drop-ins)    │
│     - Plugin column: name + per-row actions hover strip      │
│     - Description column: description + meta line + update   │
│       notice + auto-update toggle (right-aligned)            │
└─────────────────────────────────────────────────────────────┘
```

Notes:
- The list table renders all plugins on one page (per_page = 999 in core). No footer pagination is present in practice.
- Recently Active and Must-Use views show extra notices in the table nav (clear list, "files in mu-plugins are auto-loaded").

### 5b. Add Plugin

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Add Plugins")                                    │
│  └─ Toggle: "Upload Plugin" ↔ "Browse Plugins"              │
├─────────────────────────────────────────────────────────────┤
│ UPLOAD PANEL (when toggled to upload)                        │
│  └─ File picker (.zip) + Install Now button                  │
├─────────────────────────────────────────────────────────────┤
│ TAB BAR                                                      │
│  └─ Featured | Popular | Recommended | Favorites | Search    │
│       (Search Results) | Beta Testing (when on beta build)   │
├─────────────────────────────────────────────────────────────┤
│ FILTER ROW (Search tab)                                      │
│  └─ Search type (Term / Author / Tag) + search input         │
│     + keyword cloud (popular tags)                           │
├─────────────────────────────────────────────────────────────┤
│ FAVORITES FORM (Favorites tab only)                          │
│  └─ "Your wp.org username" + Get Favorites                   │
├─────────────────────────────────────────────────────────────┤
│ CARD GRID (per_page = 36)                                    │
│  └─ Plugin card:                                             │
│     - icon                                                   │
│     - name + version                                         │
│     - author (linked)                                        │
│     - star rating + rating count                             │
│     - short description                                      │
│     - active installs ("1+ Million", "10,000+")              │
│     - last updated relative time                             │
│     - "Tested with your version of WordPress" / warning      │
│     - PHP / WP compatibility check                           │
│     - actions: Install Now / Activate / More Details         │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination                                               │
└─────────────────────────────────────────────────────────────┘
```

**More Details modal:** name, banner, icon, version, author, last updated, requires WP, requires PHP, active installs, rating, link to wp.org page. Body uses sub-tabs: Description / Installation / FAQ / Changelog / Screenshots / Reviews (each is HTML from wp.org `sections`).

### 5c. Plugin File Editor

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Edit Plugins")                                   │
├─────────────────────────────────────────────────────────────┤
│ PLUGIN PICKER                                                │
│  └─ "Select plugin to edit:" dropdown + Select button        │
├─────────────────────────────────────────────────────────────┤
│ WARNING BANNER                                               │
│  └─ "If you make changes, plugin updates will overwrite      │
│     your customizations." + "Need to make changes?" link     │
│     to "I understand the risks" workflow                     │
├─────────────────────────────────────────────────────────────┤
│ MAIN SPLIT                                                   │
│  ┌──────────────────┬─────────────────────────────────────┐ │
│  │ FILES TREE       │ CODE EDITOR                          │ │
│  │ - PHP / CSS / JS │ - syntax-highlighted (CodeMirror)    │ │
│  │   tree per       │ - "Function name" doc lookup         │ │
│  │   plugin folder  │   dropdown (PHP only)                │ │
│  │                  │ - Update File button                 │ │
│  └──────────────────┴─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

If `DISALLOW_FILE_EDIT` is defined: render an empty state ("File editing is disabled") instead of the editor. If `wp_get_plugin_file_editable_extensions()` returns empty: same.

---

## 6. States

### Installed list

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton rows |
| Empty (no plugins) | `total === 0` | "No plugins are currently available." |
| Empty (filtered) | filter yields 0 | "No plugins found." + (search) link to wp.org search |
| Plugin paused | `is_plugin_paused()` | Inline error row: "This plugin failed to load properly and is paused during recovery mode." + Resume action |
| Plugin needs update | listed in `update_plugins` transient | Inline notice strip in row: "There is a new version of {Name} available. View details / update now." |
| Plugin missing dependency | `WP_Plugin_Dependencies::has_unmet_dependencies` | Notice strip: "{Name} requires the following plugins: {list}." Activate button replaced with disabled "Cannot Activate" |
| Plugin has active dependents | `has_active_dependents` | Deactivate button disabled with screen-reader text "You cannot deactivate this plugin as other plugins require it." |
| Activation error | `error=true&plugin={file}` URL param after redirect | Top-of-list error notice; offers "Disable and try again" or sandboxed scrape diagnosis |
| Permission denied | 403 | "Sorry, you are not allowed to manage plugins for this site." |

### Add Plugin

| State | Display |
|---|---|
| Loading | Spinner overlay |
| API error (wp.org unreachable) | "An unexpected error occurred. Try again." + Try Again button |
| Empty search | "No plugins found. Try a different search." |
| Already installed | "Active" badge + button label "Activate" / "Active" / "Update" |
| Incompatible PHP | red "Requires PHP {N}" warning, Install button disabled |
| Incompatible WP | red "Requires WordPress {N}" warning, Install button disabled |
| Untested with current WP | yellow "Untested with your version of WordPress" |
| Plugin install in progress | button → "Installing…" with spinner; on success → "Activate" (or "Active" if `status: 'active'` was requested) |

### Plugin File Editor

| State | Display |
|---|---|
| Save success | "File edited successfully." notice |
| Save fatal error | Plugin auto-deactivated. Notice with PHP error message + line number; previous content restored. |
| File too large | "File is too large to edit." (server-side guard) |
| File not editable | "Files of this type are not editable." |
| `DISALLOW_FILE_EDIT` | "File editing is disabled in this WordPress installation." |

---

## 7. Actions

### Header / primary actions

| Action | Cap | Destination |
|---|---|---|
| Add New Plugin (installed list) | `install_plugins` | navigates to Add Plugin screen |
| Upload Plugin (Add Plugin) | `upload_plugins` | toggles upload panel |
| Browse Plugins (Add Plugin) | `install_plugins` | toggles back to directory browse |

### Per-row actions (installed list)

| Action | Cap | Type | Notes |
|---|---|---|---|
| Activate | `activate_plugin` (plugin-scoped) | Mutation | `PUT /wp/v2/plugins/{plugin}` `{ status: 'active' }`. Hidden when already active. Disabled when unmet deps or PHP/WP incompatible. |
| Deactivate | `deactivate_plugin` (plugin-scoped) | Mutation | `PUT /wp/v2/plugins/{plugin}` `{ status: 'inactive' }`. Hidden when inactive. Disabled when active dependents present. |
| Settings | derived from plugin's submenu page | Navigation | Plugins register a Settings page; the link is `plugin_action_links` filter output. **Gap in REST** — the link is computed in PHP. Shell options: parse plugin's registered submenus from a custom REST endpoint, or omit and let users find the settings page via Settings menu. |
| Activate / Settings (combined) | varies | varies | The first `plugin_action_links` entry typically replaces "Activate" with "Settings" once active. |
| Edit | `edit_plugins` | Navigation | Opens Plugin File Editor at this plugin. Hidden when `DISALLOW_FILE_EDIT`. |
| Delete | `delete_plugins` | Mutation | Two-step: confirmation page lists plugins + warns about data deletion via `is_uninstallable_plugin()`. `DELETE /wp/v2/plugins/{plugin}`. Plugin must be inactive; REST returns 400 otherwise. |
| View details | `install_plugins` (modal) | Modal | Opens Add Plugin More Details modal for this plugin (via wp.org `plugins_api`). Only when the plugin is in the wp.org directory. |
| Resume | `resume_plugin` | Mutation | Visible only when paused. **Gap in REST** — no endpoint; handled by `plugins.php?action=resume`. |
| Visit plugin site | none | External | `plugin_uri` link, new tab. |
| Enable / Disable auto-updates | `update_plugins` + `wp_is_auto_update_enabled_for_type('plugin')` | Mutation | Toggle in right column. Backed by `auto_update_plugins` site option. **Gap in REST** — no endpoint; core uses admin-ajax (`toggle-auto-updates` action via `wp.updates` JS). Shell needs a custom `POST /wp-admin-workspaces/v1/plugin-auto-updates` endpoint or replicate the option write via `/wp/v2/settings` (the option is not registered for REST by default). |

### Bulk actions (installed list)

Selection model: checkbox per row + "select all on page". Must-use and Drop-ins are not selectable.

| Bulk action | Cap | Status filter | Behavior |
|---|---|---|---|
| Activate | `activate_plugins` | not "active" | Iterate selected, skip already-active and network-only on multisite. Parallel `PUT` w/ `{status: 'active'}`. |
| Deactivate | `deactivate_plugins` | not "inactive" / "recent" | Skip already-inactive. Parallel `PUT` w/ `{status: 'inactive'}`. |
| Update | `update_plugins` | any | Core delegates to `update.php?action=update-selected` rendered inside an iframe (admin-ajax progress). **Gap in REST** — no plugin update endpoint. Core uses `wp_ajax_update_plugin` (admin-ajax). Shell options: custom REST proxy, or iframe `update.php` for v1. |
| Delete | `delete_plugins` | not "active" | Confirmation page (lists names + uninstallable warning), then parallel `DELETE`. Active plugins are filtered out before delete. |
| Enable Auto-updates | `update_plugins` | not "auto-update-enabled" | Same gap as toggle. |
| Disable Auto-updates | `update_plugins` | not "auto-update-disabled" | Same gap as toggle. |
| Clear List | none (recently_activated only) | "Recently Active" | Empties `recently_activated` option. **Gap in REST.** |

### Add Plugin actions

| Action | Cap | Behavior |
|---|---|---|
| Install Now | `install_plugins` | `POST /wp/v2/plugins` `{ slug, status: 'inactive' }`. Returns 201 with full plugin record. |
| Install + Activate | `install_plugins` + `activate_plugins` | `POST /wp/v2/plugins` `{ slug, status: 'active' }` (or `network-active`). |
| More Details | `install_plugins` | Open modal w/ `plugins_api({slug, sections: true})` data. |
| Upload | `upload_plugins` | **Gap in REST** — REST `POST /wp/v2/plugins` only accepts wp.org slug, not file upload. Core uses `update.php?action=upload-plugin` multipart form. Shell options: custom `/wp-admin-workspaces/v1/plugin-upload` endpoint that wraps `Plugin_Upgrader::install` against an uploaded `.zip`. |
| Favorite a wp.org user's plugins | `install_plugins` | persisted in `wporg_favorites` user meta |

### Plugin File Editor actions

| Action | Cap | Behavior |
|---|---|---|
| Select plugin | `edit_plugins` | Reload editor with new plugin's first file |
| Select file | `edit_plugins` | Load file content |
| Save (Update File) | `edit_plugins` | POST form to `plugin-editor.php`. **Gap in REST** — no endpoint. Sandboxed reload validates; on PHP fatal, plugin auto-deactivates. |
| "Need to make changes?" warning | none | Shows acknowledge-the-risks dialog before unlocking the editor for first-time use. |

### Optimistic vs. blocking
- **Activate / deactivate** — blocking. Activation can produce errors (PHP fatal in the plugin's load path captured by `plugin_sandbox_scrape`). Wait for response.
- **Auto-update toggle** — optimistic. Roll back on error.
- **Delete** — blocking + double-confirmed.
- **Install** — blocking with progress. Server work (download, unzip, copy) is non-trivial.
- **Update** — blocking with progress (per-plugin spinner).

---

## 8. Filters, sort, search, pagination

### Installed list filters

| Filter | Field | Operator | Source |
|---|---|---|---|
| Status | derived | `is` | enum (All, Active, Inactive, Recently Active, Update Available, Auto-updates Enabled, Auto-updates Disabled, Must-Use, Drop-ins) |
| Search | name + description + plugin URI + author + author URI + textdomain | substring contains | client-side filter on returned set; REST `?search=` matches the same fields |

### Add Plugin filters

| Filter | Field | Operator | Source |
|---|---|---|---|
| Tab | `browse` | enum | featured / popular / recommended / favorites / beta / search |
| Search type | `type` | enum | term / author / tag |
| Search query | `s` | text | passed to wp.org API |
| Favorites user | `user` | text | wp.org username |

### Sort
Installed list: alphabetical by Name (case-insensitive); core also accepts `orderby=Name`/`Author` query args, but the UI does not expose sort controls. Add Plugin: sort handled server-side by wp.org (`relevance` for search, manual curation for featured/recommended/popular).

### Search
- Installed list: single full-text input. Debounced (300ms). Resets to page 1.
- Add Plugin: single input + radio for type (term/author/tag). On submit, navigates to `?tab=search&s={query}&type={type}`.

### Pagination
- Installed list: per_page 999 in practice (core `get_items_per_page('plugins_per_page', 999)`). Effectively all-in-one render for typical sites.
- Add Plugin: per_page 36, paginated via wp.org API (`?paged={n}`).
- Plugin File Editor: not paginated.

---

## 9. Forms & inputs

### Add Plugin → Upload form

| Field | Type | Required |
|---|---|---|
| Plugin file | file picker (`.zip` only) | yes |

Accepts a single zip archive containing the plugin's top-level directory and main PHP file with header.

### Plugin File Editor

| Field | Type | Required |
|---|---|---|
| Plugin selector | dropdown (all plugins) | yes |
| File selector | tree (filtered to editable extensions) | yes |
| File contents | code editor (CodeMirror with mode by file extension) | yes |
| Newcontent (POST body) | textarea (fallback) | yes |
| Nonce | hidden | yes |

**Validation:** Server-side. Editable extensions per-plugin via `wp_get_plugin_file_editable_extensions()`. PHP files are validated by attempting to load the modified plugin in a sandbox; fatal triggers auto-deactivation.

### Save semantics

| Form | Verb / endpoint | Notes |
|---|---|---|
| Activate / deactivate / network-activate | `PUT /wp/v2/plugins/{plugin}` | Set `status` to `active` / `inactive` / `network-active`. |
| Install | `POST /wp/v2/plugins` | Body: `{ slug, status }`. |
| Delete | `DELETE /wp/v2/plugins/{plugin}` | Plugin must be inactive. |
| Bulk update | iframe to `update.php?action=update-selected` (gap) | No REST equivalent. |
| Upload `.zip` | multipart POST to `update.php?action=upload-plugin` (gap) | No REST equivalent. |
| File editor save | POST `plugin-editor.php` (gap) | No REST equivalent. |
| Auto-update toggle | admin-ajax `wp_ajax_toggle_auto_updates` (gap) | No REST equivalent. |

---

## 10. Routing & URL state

Original wp-admin URLs:
- `/wp-admin/plugins.php?plugin_status={all|active|inactive|recently_activated|upgrade|auto-update-enabled|auto-update-disabled|mustuse|dropins|paused}`
- `?s={query}` — search
- `?paged={n}` — pagination (rare)
- `?action={activate|deactivate|delete-selected|...}&plugin={file}&_wpnonce={nonce}` — row action targets
- `/wp-admin/plugin-install.php?tab={featured|popular|recommended|favorites|search|upload|beta}` — tab selection
- `/wp-admin/plugin-install.php?tab=search&s={query}&type={term|author|tag}`
- `/wp-admin/plugin-install.php?tab=plugin-information&plugin={slug}` — More Details modal as an iframe URL
- `/wp-admin/plugin-editor.php?plugin={file}&file={path}` — file editor

Recommended shell hash routing:
```
#/plugins?status=active&search=cache
#/plugins-install?tab=search&s=cache&type=term
#/plugins-install?tab=upload
#/plugin-editor?plugin=akismet/akismet.php&file=akismet/akismet.php
```

Browser back/forward must restore filter state. Refresh must restore. Sharing the URL must reproduce the view.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| "Add New Plugin" header button | `core:plugins-install` | tab=featured |
| Per-row "View details" | Modal in current screen | slug |
| Per-row "Settings" | App or external admin page registered by plugin | varies |
| Per-row "Edit" | `core:plugin-editor` | plugin |
| Per-row "Visit plugin site" | external URL | new tab |
| "More Details" in Add Plugin | Modal | slug |
| "Install + Activate" success | back to installed list | plugin file |
| Plugin File Editor "Need to make changes?" link | external doc | new tab |

### Inbound

- Settings menu items registered by plugins → may link back to installed list with focus on a specific plugin.
- Updates screen (`update-core.php`) → bulk update for plugins (out of scope here; covered by the updates spec).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Activate one | Banner: "Plugin activated." Persistent on the page until next nav. |
| Activate many | Banner: "Selected plugins activated." |
| Activate fatal | Banner with "Plugin could not be activated because it triggered a fatal error." + sandboxed scrape link |
| Deactivate one | Banner: "Plugin deactivated." |
| Deactivate many | Banner: "Selected plugins deactivated." |
| Install success | Banner: "Plugin installed successfully. Activate Plugin / Return to Plugins page." |
| Install error | Inline error in card or in upload panel |
| Update success | Per-row green flash + banner |
| Update error | Per-row red error + retry |
| Delete success | Banner: "Selected plugin(s) deleted." |
| Delete attempted on active plugin | Banner: "Cannot delete an active plugin. Please deactivate it first." (REST 400) |
| Auto-update toggled | Inline icon flip + screen-reader announcement; no banner |
| File save success | Banner: "File edited successfully." |
| File save fatal | Banner: "Plugin auto-deactivated due to fatal error." + error detail |

Core uses page-load banners (no toast / snackbar pattern). Modern shell can switch to snackbars for transient confirmations and reserve banners for persistent issues (fatal-deactivated plugin).

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `↑` / `↓` | Move row focus |
| `Space` | Toggle selection on focused row |
| `Enter` | Activate primary action on focused row (or open card More Details) |
| `Esc` | Close modal / dismiss banner |

### ARIA & focus
- Status filter tabs: `role="tablist"` with counts in accessible name.
- Auto-update toggle: `<button>` with `aria-pressed` and screen-reader label "Enable auto-updates for {Plugin}".
- Update notice strip: `aria-live="polite"` so it's announced when available.
- Bulk action bar: announced via live region when items selected.
- Delete confirmation: focus trap, return focus to row on cancel, advance to next row on confirm.
- Plugin File Editor: keyboard-trap escape pattern `Esc` + `Tab` to leave the textarea (documented in the original Help tab — preserve).

### Screen reader
- "Activated" / "Deactivated" / "Auto-updates enabled" announced via live region.
- Card grid in Add Plugin: each card is `role="article"`. Install button label includes plugin name ("Install Akismet Anti-Spam").

---

## 14. Extension points (core hooks)

Core exposes these. Decide for each whether to preserve via shell-level extensibility, replace, or drop.

| Hook | Purpose | Recommendation |
|---|---|---|
| `all_plugins` | Filter the full plugin list | Replace with shell field-level filter on REST response |
| `plugins_list` | Filter the per-status partition | Replace with shell-level filter API |
| `plugin_action_links` / `plugin_action_links_{plugin}` | Per-row action links (Settings / Activate / etc.) | **Critical** — most plugins inject Settings link here. Shell needs a `core:plugins.row-actions` slot or proxy core's filter via REST. |
| `plugin_row_meta` | Below-name meta line (View details, Visit plugin site) | Replace with shell `core:plugins.row-meta` slot |
| `network_admin_plugin_action_links` / `_{plugin}` | Network admin per-row | Network spec |
| `bulk_actions-plugins` | Add bulk actions | Replace with shell `actions` registry, `supportsBulk: true` |
| `views_plugins` | Add status filter tabs | Replace with shell-level filter tab API |
| `manage_plugins_columns` / `manage_plugins_custom_column` | Add columns | Replace with shell field registry |
| `pre_current_active_plugins` | Render content above active plugins block | Drop — not used by mainstream plugins |
| `plugin_install_action_links` | Add Plugin card actions | Replace with shell `core:plugins-install.card-actions` slot |
| `install_plugins_tabs` | Tab list on Add Plugin | Replace with shell tab registry |
| `install_plugins_table_api_args_{tab}` | Modify wp.org query per tab | Replace with shell hook on directory query |
| `plugins_api_args` / `plugins_api_result` | Modify wp.org responses | Preserve if shell uses server-side proxy |
| `wp_create_application_password_form` | (no plugin counterpart on plugins) | n/a |

**Plugin compatibility note:** the most-used hook is `plugin_action_links_{plugin}`. Plugins ship a Settings link by hooking it. Without a shim or slot, the user's main path to a plugin's settings is lost. Options:
1. Build a server-side proxy that runs the filter and returns the resulting links per plugin via a custom REST field.
2. Document migration: plugins must register a `core:plugins.row-actions` slot item to appear in the shell.
3. Both.

Recommendation: ship (1) for v1 (zero-config plugin compatibility) and (2) for new shell-aware plugins.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:plugins` → `src/apps/plugins/index.js`, registered in `src/runtime/registry/builtins.js`.
- **What works:** native installed-plugins list — `useEntityRecords('root','plugin')` read with client-side search + status filter, plus activate / deactivate (`POST /wp/v2/plugins/{plugin}` with `{ status }`) / delete (`DELETE`) actions (cap-gated on `activate_plugins`) via `apiFetch` with manual cache invalidation. See `src/apps/plugins/app.md`.
- **What's still iframe-only:** `plugin-install.php` (add / browse / upload) and `plugin-editor.php`.
- **Note:** the Gaps table below predates the native list app (it still lists "`core:plugins` native list app" as a gap) and may overstate what's missing; treat `app.md` as canonical.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| `core:plugins` native list app | High | Build on `WP_REST_Plugins_Controller`. |
| Status filter tabs with counts | High | Compute Active / Inactive / Network-active client-side; flag the rest as not supported in v1. |
| Plugin row actions (`plugin_action_links` filter result) | High | Server-side proxy in shell REST — without this, Settings links disappear. |
| Auto-update toggle | Medium | Custom REST endpoint to write `auto_update_plugins` site option. |
| Plugin update available indicator | Medium | Custom REST endpoint that returns `update_plugins` transient summary. |
| Bulk update | Medium | Custom REST proxy wrapping `Plugin_Upgrader::bulk_upgrade`. Or iframe `update.php?action=update-selected`. |
| Plugin dependencies (`Requires Plugins`) gating | Medium | Read from `WP_Plugin_Dependencies::has_unmet_dependencies()`. Custom REST field. |
| Recently Active list | Low | Custom REST proxy of `recently_activated` option. |
| Must-Use / Drop-ins listing | Low | Custom REST proxy of `get_mu_plugins()` / `get_dropins()`. |
| Paused-plugin recovery | Low | Custom REST proxy + Resume action. |
| `core:plugins-install` browse / search / favorites | High | Either (a) custom REST proxy for `plugins_api()`, or (b) call `api.wordpress.org/plugins/info/1.2/` from the browser. |
| `core:plugins-install` upload | Medium | Custom REST endpoint wrapping `Plugin_Upgrader::install` with file upload. |
| More Details modal | Medium | wp.org `plugins_api({sections: true})`. |
| Compatibility check (PHP / WP version) | Medium | Computed client-side from `requires` / `requires_php` versus `window.wpAdminWorkspaces.serverVersions`. |
| `core:plugin-editor` | Low | Recommend **drop**. Cap-gated by default; dangerous; deprecation candidate. Acceptable interim: `iframe:plugin-editor.php`. |
| `core:plugins.row-actions` slot for plugin compat | High | Required so shell-aware plugins can inject row actions. |
| Network-admin variants | n/a | Separate spec (`network-admin/plugins.md`). |

### Acceptable interim
For v1, `iframe:plugins.php`, `iframe:plugin-install.php`, `iframe:plugin-editor.php` are acceptable escape hatches. The developer-admin shell already uses these. Track them for native replacement.

---

## 16. Out of scope

- **Network admin** plugin management (network-activate at scale, network-only plugins, site-network plugin orchestration). Covered in `network-admin/plugins.md`.
- **WordPress.com / Jetpack-managed plugin auto-update orchestration.** Out of core scope.
- **Plugin marketplace integrations** (commercial / freemium licensing). Plugin authors implement themselves.
- **Plugin file editor permanent deprecation** — community discussion ongoing; not blocking v1.
- **Plugin data export / migration tooling** — separate spec.
- **WSOD recovery dashboard** (paused plugins) — surfaced minimally on the list; full recovery flow is a separate screen.

---

## 17. Reference

- Original PHP:
  - `wp-admin/plugins.php`
  - `wp-admin/plugin-install.php`
  - `wp-admin/plugin-editor.php`
- List tables:
  - `wp-admin/includes/class-wp-plugins-list-table.php`
  - `wp-admin/includes/class-wp-plugin-install-list-table.php`
- Plugin metadata:
  - `wp-admin/includes/plugin.php` (`get_plugins`, `get_plugin_data`, `_get_plugin_data_markup_translate`)
  - `wp-admin/includes/plugin-install.php` (`plugins_api`, `install_plugin_information`)
  - `wp-includes/class-wp-plugin-dependencies.php` (`Requires Plugins:` resolution)
- Upgrader:
  - `wp-admin/includes/class-plugin-upgrader.php`
  - `wp-admin/includes/class-wp-upgrader.php`
- File editor:
  - `wp-admin/includes/file.php::wp_edit_theme_plugin_file()`
  - `wp-admin/includes/file.php::wp_get_plugin_file_editable_extensions()`
- REST controller:
  - `wp-includes/rest-api/endpoints/class-wp-rest-plugins-controller.php`
- REST schema reference: `https://developer.wordpress.org/rest-api/reference/plugins/`
- Auto-updates: `wp-admin/includes/update.php` + `auto_update_plugins` site option
- Capability map: `wp-admin/includes/capabilities.php` (`map_meta_cap` cases for `activate_plugin`, `deactivate_plugin`, `delete_plugin`, `edit_plugin`, `update_plugin`, `resume_plugin`)
- Current shell impl: none (iframe fallback in `shells/developer-admin.json`)
- Cross-link: `docs/screens/users.md` (analogous list-with-modal-actions pattern)
