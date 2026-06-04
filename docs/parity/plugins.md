# Parity: Plugins (core:plugins)

> Audited 2026-05-29 against WordPress 7.0 core. Shell app: `src/apps/plugins/`. Classic counterpart: `wp-admin/plugins.php`, `wp-admin/plugin-install.php`, `wp-admin/plugin-editor.php`, `WP_Plugins_List_Table`, `WP_Plugin_Install_List_Table`.

## Verdict

**Major gaps.** The shell ships ONLY the installed-plugin manager — list, search, activate / deactivate / delete (inactive only), and visit-site. Against the three classic screens that `core:plugins` is meant to cover (`plugins.php` + `plugin-install.php` + `plugin-editor.php`), the entire **Add-New flow** (search the wordpress.org directory, Featured/Popular/Recommended/Favorites tabs, plugin cards with ratings/active-installs/compatibility, Install Now, Upload .zip), the **update flow** (the "update available" inline row, "update now", bulk update), the **auto-update toggle column** (single + bulk), the **plugin file editor**, the **must-use / drop-in sections**, **paused-plugin recovery + Resume**, and **plugin-dependency gating** are all absent. Several of these are hard API blockers (no REST surface), but several are missing features the shell could build with the *existing* `/wp/v2/plugins` controller (notably the whole installed-list richness, network-active read-only states, and the upload/install flows partially). The single installed-list screen the shell does ship is itself only at **minor-gaps** parity — but the app's scope is the three-screen surface, so the verdict for the assignment is major gaps.

## Counterpart mapping

- **Classic screen(s):**
  - Installed list — `wp-admin/plugins.php` (action router + render) powered by `WP_Plugins_List_Table` (`wp-admin/includes/class-wp-plugins-list-table.php`).
  - Add New / browse directory / upload — `wp-admin/plugin-install.php` powered by `WP_Plugin_Install_List_Table` (`wp-admin/includes/class-wp-plugin-install-list-table.php`); directory data via `plugins_api()` (`wp-admin/includes/plugin-install.php`).
  - File editor — `wp-admin/plugin-editor.php` (no list-table; `get_plugin_files()` + `wp_edit_theme_plugin_file()`).
- **REST / core-data surface the shell app uses:**
  - Read: `useEntityRecords('root', 'plugin', { context: 'edit' })` → `GET /wp/v2/plugins?context=edit` (`WP_REST_Plugins_Controller::get_items`). `src/apps/plugins/index.js:88-93`.
  - Write (status): `apiFetch({ path: '/wp/v2/plugins/{plugin}', method: 'POST', data: { status } })` → `WP_REST_Plugins_Controller::update_item`. `src/apps/plugins/index.js:106-132`.
  - Write (delete): `apiFetch({ path: '/wp/v2/plugins/{plugin}', method: 'DELETE' })` → `WP_REST_Plugins_Controller::delete_item`. `src/apps/plugins/index.js:220-226`.
- **Project screen spec:** `docs/screens/plugins.md` (full Tier-2 spec, present). It documents all three screens, marks the same REST gaps, and explicitly lists current shell coverage as "none — `iframe:plugins.php` only" — that line is now stale (a native DataViews installed list exists). The network-admin variant is split into `docs/screens/network-plugins.md`.

## Feature parity matrix

Status: full / partial / missing / blocked.

### Installed list (`plugins.php`)

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Plugin name + description cell | `single_row` "name" + "description" columns; name bold, description below (`class-wp-plugins-list-table.php:1173-1312`) | `name` field renderer: bold name + description truncated to 160 chars (`index.js:52-63`) | full | Shell truncates description; classic shows full HTML description with inline links. Minor divergence. |
| Status (active/inactive/network-active) | Row CSS class `active`/`inactive`; no dedicated column — status is implied by which view + row styling | Explicit `status` text column + filter (`index.js:64-68`, `app.json:35`) | full (reframed) | Shell surfaces status as a real column/filter; classic uses view tabs + row color. Functionally equivalent. |
| Version (row meta) | "Version %s" in description column meta line (`class-wp-plugins-list-table.php:1187-1190`) | `version` column (`index.js:69-71`) | full | |
| Author (row meta, linked) | "By %s" with `AuthorURI` link (`class-wp-plugins-list-table.php:1192-1201`) | `author` column, tags stripped, NOT linked (`index.js:72`, `index.js:174`) | partial | Author rendered as plain text; classic links to `author_uri`. `author_uri` is fetched (`index.js:175`) but unused. |
| Description column meta: "Visit plugin site" / "View details" | `plugin_uri` link OR (if `slug` known + `install_plugins`) thickbox "View details" modal (`class-wp-plugins-list-table.php:1203-1228`) | "Visit plugin site" row action only, opens `plugin_uri` in new tab (`index.js:246-252`) | partial | "View details" modal (wp.org plugin-information) not ported — no slug/thickbox path. |
| Sortable column headers | `get_sortable_columns()` returns `array()` — no sortable headers; sorts by Name always via `_order_callback` (`class-wp-plugins-list-table.php:485-487, 391-406`) | DataViews sorts client-side on name/version/author/status; default name asc (`index.js:270-297`) | full (exceeds) | Shell ADDS sortable columns classic lacks. Net positive, no regression. |
| Search installed plugins | `_search_callback` matches name/desc/author across all string fields (`class-wp-plugins-list-table.php:372-382`) | Client-side filter on name + stripped description only (`index.js:144-156`) | partial | Shell search narrower: classic also matches author, plugin URI, author URI, textdomain. |
| Status view tabs w/ live counts (All / Active / Inactive) | `get_views()` from `$totals` (`class-wp-plugins-list-table.php:494-616`) | Counts surfaced on the `status` filter dropdown elements ("Active (5)") via client-side `statusCounts` (`index.js:184-205`) | partial | Counts present but as filter-dropdown options, not a tab strip. No "All" affordance distinct from "no filter." |
| View tab: Recently Active (+Clear List) | `recently_activated` option; "Clear List" button (`class-wp-plugins-list-table.php:521-528, 684-685`; `plugins.php:437-444`) | absent | missing | `recently_activated` option has no REST surface. |
| View tab: Update Available (count) | `upgrade` total from `update_plugins` transient (`class-wp-plugins-list-table.php:151-159, 561-568`) | absent | blocked | Update state not in REST schema (see blockers). |
| View tab: Auto-updates Enabled/Disabled (count) | from `auto_update_plugins` option (`class-wp-plugins-list-table.php:569-584`) | absent | blocked | Auto-update state not REST-exposed. |
| Pagination | per_page=999; `array_slice` only if > per_page (`class-wp-plugins-list-table.php:350-356`) | Client-side sort + slice, perPage=50, clamp on shrink (`index.js:270-305`) | full | Both effectively unpaginated for normal sites; shell paginates at 50, classic at 999. |
| Bulk: Activate | `activate-selected` (`class-wp-plugins-list-table.php:627-629`; `plugins.php:92-145`) | `activate` action `supportsBulk` (`app.json:40`; `index.js:244`) | full | Shell fires parallel `POST {status:'active'}`. |
| Bulk: Deactivate | `deactivate-selected` (`class-wp-plugins-list-table.php:631-633`; `plugins.php:226-267`) | `deactivate` action `supportsBulk` (`app.json:41`; `index.js:245`) | full | |
| Bulk: Update | `update-selected` → iframed `update.php` (`class-wp-plugins-list-table.php:636-638`; `plugins.php:147-174`) | absent | blocked | No REST update endpoint (admin-ajax `wp_ajax_update_plugin`). |
| Bulk: Delete | `delete-selected` w/ confirmation page (`class-wp-plugins-list-table.php:640-642`; `plugins.php:269-436`) | `delete` action `supportsBulk` + confirm modal (`app.json:43`; `index.js:208-239`) | full | Shell confirm modal is simpler than classic's per-plugin "will also delete its data" enumeration. |
| Bulk: Enable / Disable Auto-updates | `enable/disable-auto-update-selected` (`class-wp-plugins-list-table.php:644-651`; `plugins.php:464-535`) | absent | blocked | No REST surface for `auto_update_plugins`. |
| Row action: Activate | nonce'd link `?action=activate` (`class-wp-plugins-list-table.php:956-985`) | `activate` action, `eligibleWhen status:inactive` (`app.json:40`) | full | |
| Row action: Deactivate | `?action=deactivate` (`class-wp-plugins-list-table.php:914-937`) | `deactivate` action, `eligibleWhen status:[active,network-active]` (`app.json:41`) | full | |
| Row action: Delete | `?action=delete-selected&checked[]=` → confirm page (`class-wp-plugins-list-table.php:987-1009`) | `delete` action, inactive-only, confirm modal (`app.json:43`) | full | |
| Row action: Details / View details (modal) | thickbox wp.org plugin-information iframe (`class-wp-plugins-list-table.php:1204-1217`) | absent (shell has "Visit plugin site" external link instead) | missing | wp.org plugin-information has no REST surface (`plugins_api`). |
| Row action: Resume (paused plugin) | `?action=resume` when `is_plugin_paused` (`class-wp-plugins-list-table.php:939-954`; `plugins.php:445-463`) | absent | blocked | No REST endpoint; `resume_plugin` is web-request only. |
| Row action: Network Activate / Deactivate | network-admin only (`class-wp-plugins-list-table.php:823-880`) | N/A (shell hijacks single-site admin root only; never network admin) | missing | Out of scope per shell architecture. Deactivate action does cover `network-active` rows on single-site. |
| Auto-updates column (toggle + next-update time) | `auto-updates` column, per-row enable/disable link + `wp_get_auto_update_message()` (`class-wp-plugins-list-table.php:1314-1404`) | absent | blocked | Entire column missing — no REST surface. |
| "Update available" inline row + "update now" | inline `<tr class="plugin-update-tr">` when in `update_plugins` transient (`class-wp-plugins-list-table.php` row class `update`; templates in `plugins.php:823`) | absent | blocked | Update availability not in REST schema. |
| PHP/WP incompatibility inline row | `is_php_version_compatible` / `is_wp_version_compatible` → "does not work with your version" row (`class-wp-plugins-list-table.php:1429-1490`) | absent | partial | `requires_php`/`requires_wp` ARE in REST schema (lines 955-966) but shell ignores them — could be built (shell-side gap). |
| Plugin dependency gating (Requires Plugins) | `WP_Plugin_Dependencies::has_unmet_dependencies` disables Activate; `has_active_dependents` disables Deactivate; "Required by:" / "Requires:" rows (`class-wp-plugins-list-table.php:779-782, 852-856, 916-920, 1282-1288`) | absent | blocked | `WP_Plugin_Dependencies` state not REST-exposed; the `Requires Plugins` header is not a REST field. |
| Must-Use plugins section | `get_mu_plugins()` (`class-wp-plugins-list-table.php:142-144`) | absent | blocked | `get_items` iterates `get_plugins()` only — mu-plugins never returned by REST. |
| Drop-ins section | `get_dropins()` (`class-wp-plugins-list-table.php:147-149`) | absent | blocked | Not returned by `/wp/v2/plugins`. |
| Empty state | `no_items()` — "No plugins are currently available." + wp.org search link (`class-wp-plugins-list-table.php:411-429`) | DataViews built-in empty state (no custom copy / no wp.org link) | partial | Shell uses DataViews default; classic offers a directory search link. |
| Error state | top-of-page `wp_admin_notice` per redirect param (`plugins.php:664-755`) | Terminal error: replaces table w/ `Notice.Root` until next action (`index.js:307-315`) | full (divergent) | Shell error is terminal + replaces the list; classic is a dismissible banner above a still-rendered list. |
| Activation fatal-error handling | `error=true` → "triggered a fatal error" notice + sandboxed `error_scrape` iframe diagnosis (`plugins.php:60-69, 176-197, 664-706`) | absent — REST returns the activation `WP_Error`; shell shows its `.message` in the terminal notice (`index.js:121-129`) | partial | No iframe scrape / "disable and try again." REST's `activate_plugin` does surface a fatal as a 500 WP_Error, so the message is shown, but no recovery affordance. |
| "Add New Plugin" header button | `page-title-action` → `plugin-install.php` when `install_plugins` (`plugins.php:768-772`) | absent | missing | No Add-New entry point in the app. |
| Screen options: per-page | `add_screen_option('per_page', default 999)` (`plugins.php:558`) | DataViews view perPage (50), persisted in view state, not a WP screen option | partial (reframed) | Different mechanism; functionally a per-page control exists. |
| Screen options: column toggle | List-table hidden-columns screen option | DataViews field visibility menu (`enableHiding` per field, `name` locked `enableHiding:false`) (`app.json:34`) | full (reframed) | DataViews owns column show/hide. |
| Help tabs (Overview / Troubleshooting / Auto-updates / Dependencies) | 4 help tabs + sidebar (`plugins.php:560-623`) | absent | missing | No help-tab surface in shell. |
| Capability gating | `current_user_can('activate_plugins')` or `wp_die` (`plugins.php:12-14`) | app `capabilities: ['activate_plugins']` (`app.json:9-11`) + REST `get_items_permissions_check` (controller:112-122) | full | |
| Nonces / security | per-action `check_admin_referer` (`plugins.php` throughout) | api-fetch nonce middleware (`X-WP-Nonce`) on REST; capability checks server-side | full (reframed) | REST controller enforces caps per operation. |
| Extensibility: `plugin_action_links` filter (Settings link, etc.) | per-plugin row-action filter (`class-wp-plugins-list-table.php:1075-1097`) | absent — DataViews actions come from the resolved dataView spec only | missing | The ubiquitous per-plugin "Settings" link is PHP-computed and has no REST surface. |
| Extensibility: `plugin_row_meta` filter | row meta line filter (`class-wp-plugins-list-table.php:1276`) | absent | missing | PHP-only filter; no REST equivalent. |
| a11y: per-row aria-labels ("Activate {name}") | every action link carries `aria-label` (`class-wp-plugins-list-table.php` throughout) | DataViews owns action a11y; labels are generic ("Activate") not name-scoped | partial | DataViews actions don't interpolate the item name into the control label. |

### Add New / directory browse (`plugin-install.php`)

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Browse directory (Featured/Popular/Recommended) | `plugins_api('query_plugins', {browse})` (`class-wp-plugin-install-list-table.php:178-188`) | absent | blocked | `plugins_api` → HTTP `api.wordpress.org`; no REST. |
| Search directory (Term / Author / Tag) | `plugins_api('query_plugins', {search/author/tag})` (`class-wp-plugin-install-list-table.php:160-176`) | absent | blocked | Same. |
| Favorites tab (wp.org username) | `plugins_api` w/ `user`; `wporg_favorites` user meta (`class-wp-plugin-install-list-table.php:190-209`) | absent | blocked | Same + user-meta write. |
| Beta Testing tab | shown on beta builds (`class-wp-plugin-install-list-table.php:107-109`) | absent | blocked | Same. |
| Plugin cards (icon/name/author/short desc) | `display_rows` (`class-wp-plugin-install-list-table.php:499-739`) | absent | blocked | Card data from `plugins_api`; no REST. |
| Star rating + rating count | `wp_star_rating()` from `rating`/`num_ratings` (`class-wp-plugin-install-list-table.php:688-699`) | absent | blocked | Not in REST. |
| Active installs ("1+ Million") | `active_installs` (`class-wp-plugin-install-list-table.php:707-724`) | absent | blocked | Not in REST. |
| Last-updated relative time | `last_updated` (`class-wp-plugin-install-list-table.php:600, 700-706`) | absent | blocked | Not in REST. |
| PHP / WP compatibility badge | `is_php/wp_version_compatible` + `tested` (`class-wp-plugin-install-list-table.php:556-558, 725-735`) | absent | blocked | wp.org `tested`/`requires` not in REST. |
| Install Now | `wp_get_plugin_action_button` → admin-ajax `install-plugin` (`class-wp-plugin-install-list-table.php:562`) | partial — REST `POST /wp/v2/plugins {slug}` EXISTS (controller:47-65, create_item:273) but app exposes no install UI | missing (buildable) | The install-from-slug endpoint is available; only the browse/discovery data is blocked. |
| Install + Activate | as above w/ `status:'active'` | REST supports `POST {slug,status}` (controller:58-63); no UI | missing (buildable) | |
| Upload Plugin (.zip) | `install_plugins_upload` action → admin-ajax `upload-plugin` (`plugin-install.php:150-157, 167-174`) | absent | blocked | REST `create_item` accepts a wp.org `slug` ONLY (controller:52-57); no multipart/zip path. |
| More Details modal (sections) | thickbox `plugin-information` iframe; `plugins_api({sections:true})` | absent | blocked | No REST for plugin-information sections. |
| Dependencies notice on card | `get_dependencies_notice` (`class-wp-plugin-install-list-table.php:757-798`) | absent | blocked | `requires_plugins` from wp.org; no REST. |

### Plugin File Editor (`plugin-editor.php`)

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Plugin picker + file tree | `get_plugin_files()` (`plugin-editor.php`) | absent | blocked | No REST endpoint for plugin files. |
| Code editor (CodeMirror) | wp.codeEditor | absent | blocked | |
| Save file | POST form → `wp_edit_theme_plugin_file()` w/ sandbox validation | absent | blocked | No REST endpoint; nonce'd web POST only. |
| `DISALLOW_FILE_EDIT` empty state | editor disabled | N/A | missing | Not surfaced. |

## Functional divergences

Behaviors present in BOTH the installed-list screen and the shell, but implemented differently:

1. **Author rendering — link dropped.** Classic renders the author as a hyperlink to `AuthorURI` (`class-wp-plugins-list-table.php:1192-1201`). The shell strips all tags and renders plain text (`src/apps/plugins/index.js:174` projects `author: stripTags(r.author)`, and the renderer at `index.js:72` emits plain `<Text>`). `author_uri` is fetched (`index.js:175`) but never used. User-visible consequence: no click-through to the author's site from the list.

2. **Search scope is narrower.** Classic `_search_callback` matches the search term against *every* string field of the plugin (`class-wp-plugins-list-table.php:375-379`), so a search hits author, plugin URI, author URI, and textdomain too. The shell filters only on `name` + stripped description (`src/apps/plugins/index.js:148-156`). Consequence: searching by author name returns nothing in the shell.

3. **Error handling is terminal and replaces the list.** Classic shows a dismissible notice *above* the still-rendered table (`plugins.php:700-755`). The shell, on any mutation failure, unmounts the DataViews list entirely and shows a `Notice.Root` that persists until the next action attempt (`src/apps/plugins/index.js:307-315`; `app.md:24` calls this "terminal" by design). Consequence: a single failed deactivate hides the whole plugin list until the user retries something.

4. **Status surfaced as a column/filter vs. view tabs + row color.** Classic encodes active/inactive as the row CSS class and a tab strip with counts (`class-wp-plugins-list-table.php:1101`, `get_views`). The shell makes `status` an explicit text column with a filter dropdown carrying counts (`app.json:35`, `src/apps/plugins/index.js:184-205`). Equivalent information, different IA — the shell has no single "All" tab affordance; "all" is the no-filter state.

5. **Delete confirmation is a generic modal, not a per-plugin data-deletion enumeration.** Classic builds a confirmation *page* that lists each plugin and flags "(will also **delete its data**)" for uninstallable plugins via `is_uninstallable_plugin()` (`plugins.php:342-411`). The shell uses a one-line generic confirm modal (`src/apps/plugins/index.js:209-219`) with no per-plugin data-loss warning. `is_uninstallable_plugin` state is not in REST, so the warning can't be reproduced even if desired.

6. **Sortable columns added where classic has none.** `WP_Plugins_List_Table::get_sortable_columns()` returns `array()` (`class-wp-plugins-list-table.php:485-487`) — classic always sorts by Name. The shell sorts client-side on any of name/version/author/status (`src/apps/plugins/index.js:270-297`), with numeric collation for versions. This is a net enhancement, not a regression, but it is a behavioral divergence worth noting (e.g. version sort `1.2.10 > 1.2.9` is shell-only).

## API & platform blockers

The hard blockers — what the classic screens do that the shell **cannot** do through `/wp/v2/plugins` + `@wordpress/core-data`. Each verified against live 7.0 source.

1. **Plugin UPDATE (version bump / "update now" / bulk update) — no REST endpoint. [upstream]**
   `WP_REST_Plugins_Controller` exposes list / create(install-from-slug) / update(status only) / delete (controller:36-102). `update_item` changes *activation status* only (controller:461-485) — it never runs the upgrader. The actual version bump runs through admin-ajax `wp_ajax_update_plugin` (`wp-admin/includes/ajax-actions.php:4618`), which is `check_ajax_referer('updates')` nonce-gated and delegates to `Plugin_Upgrader::bulk_upgrade()`. There is no `register_rest_route` for plugin upgrades anywhere in `src/`. **Missing surface:** a REST route that runs `Plugin_Upgrader` for an installed plugin. Closing it shell-side ([shell]) would require either a custom `/wp-admin-workspaces/v1/plugin-update` proxy endpoint wrapping `Plugin_Upgrader`, or iframing `update.php?action=update-selected`.

2. **"Update available" indicator — update state absent from REST schema. [upstream]**
   The classic list flags updates from the `update_plugins` site transient (`class-wp-plugins-list-table.php:151-159, 200-208`). The REST item schema (controller:883-973) has no `update`, `new_version`, or `update-supported` field. Even read-only "an update is available" cannot be rendered. **Missing surface:** `new_version` / `update_available` fields on the plugin REST resource (or a `?context=edit` augmentation that folds in the transient).

3. **Auto-update toggle column (single + bulk) — no REST surface. [upstream]**
   Classic reads/writes the `auto_update_plugins` site option (`class-wp-plugins-list-table.php:116-121, 1314-1404`; `plugins.php:464-535`), and the toggle uses admin-ajax `wp_ajax_toggle_auto_updates` (`wp-admin/includes/ajax-actions.php:5554`). Verified: `auto_update_plugins` is **not** registered via `register_setting`/`show_in_rest` anywhere (`grep` over `src/wp-includes` + `src/wp-admin` returns nothing), so it is not reachable through `POST /wp/v2/settings` either. **Missing surface:** either `show_in_rest` on `auto_update_plugins`, or a dedicated auto-update REST route. [shell] interim: a custom `/wp-admin-workspaces/v1/plugin-auto-updates` endpoint writing the option.

4. **wordpress.org directory browse / search (the entire Add-New discovery flow) — not REST. [upstream]**
   `WP_Plugin_Install_List_Table::prepare_items` calls `plugins_api('query_plugins', …)` (`class-wp-plugin-install-list-table.php:241`), which (`wp-admin/includes/plugin-install.php:100-160`) issues an HTTP request to `http(s)://api.wordpress.org/plugins/info/1.2/`. This is **not** a WP REST endpoint; the response (`rating`, `num_ratings`, `active_installs`, `last_updated`, `icons`, `banners`, `short_description`, `sections`, `requires`/`tested`) is wp.org-shaped and never surfaced through `/wp/v2`. **Missing surface:** no REST proxy for `plugins_api`. [shell] options: (a) a custom `/wp-admin-workspaces/v1/plugins-directory` proxy that wraps `plugins_api`, or (b) call `api.wordpress.org/plugins/info/1.2/` directly from the browser. The browse/search/Featured/Popular/Recommended/Favorites/Beta tabs, cards, ratings, install counts, compatibility badges, and the More-Details modal are all blocked on this one surface.

5. **Upload-a-zip install — REST create accepts a slug ONLY. [upstream]**
   `WP_REST_Plugins_Controller::create_item` (controller:273) takes a wp.org `slug` (controller:52-57) and installs via `plugins_api('plugin_information')` + `Plugin_Upgrader::install($api->download_link)`. There is no multipart/file-upload path; the classic `.zip` upload goes through `update.php?action=upload-plugin` (admin-ajax `wp_ajax_upload_plugin`). **Missing surface:** a REST route that accepts an uploaded archive. [shell] interim: a custom `/wp-admin-workspaces/v1/plugin-upload` endpoint wrapping `Plugin_Upgrader::install` against the uploaded file, or iframe `plugin-install.php?tab=upload`.

6. **Install-from-slug endpoint EXISTS but is unused. [shell]**
   `POST /wp/v2/plugins { slug, status }` (controller:47-65, create_item:273-413) fully supports install + optional activate, returns 201 with the plugin record. This is **not** a blocker — it's a shell-side missing feature. A minimal "install by slug" UI (even without the directory browse) is buildable today.

7. **Plugin file editor — no REST. [upstream]**
   No REST route exists for `get_plugin_files()` / `wp_edit_theme_plugin_file()`; editing is a nonce'd web POST to `plugin-editor.php`. **Missing surface:** none expected (deprecated, dangerous). [shell] acceptable interim is `iframe:plugin-editor.php` or omission.

8. **Must-Use plugins + Drop-ins — not returned by REST. [upstream]**
   `get_items` iterates `get_plugins()` only (controller:137). `get_mu_plugins()` / `get_dropins()` (`class-wp-plugins-list-table.php:142-149`) are never exposed. **Missing surface:** mu-plugin / drop-in REST collections (or a parameter on `/wp/v2/plugins`).

9. **Paused-plugin recovery + Resume — no REST. [upstream]**
   `is_plugin_paused()` / `resume_plugin()` (`plugins.php:445-463`; `class-wp-plugins-list-table.php:939-954`) are web-request only. **Missing surface:** a `paused` field + a resume route.

10. **Plugin dependencies (Requires Plugins, WP 6.5+) — not REST-exposed. [upstream]**
    `WP_Plugin_Dependencies::has_unmet_dependencies` / `has_active_dependents` / `has_circular_dependency` gate the Activate/Deactivate/Delete buttons and emit "Required by:" / "Requires:" rows (`class-wp-plugins-list-table.php:779-782, 1282-1288`). None of this state is in the REST schema. Consequence: the shell will happily offer Deactivate on a plugin that has active dependents, and the REST `deactivate` may then fail server-side or break the dependent. **Missing surface:** dependency fields on the plugin resource.

11. **`recently_activated` option (Recently Active tab + Clear List) — no REST. [upstream]**
    Read/written as a plain option (`plugins.php:437-444`, `class-wp-plugins-list-table.php:181-196`). Not REST-registered.

12. **Per-plugin extensibility links (`plugin_action_links`, `plugin_row_meta`) — PHP filters, no REST. [upstream]**
    The near-universal per-plugin "Settings" row link is produced by the `plugin_action_links_{file}` filter (`class-wp-plugins-list-table.php:1075-1097`), evaluated in PHP at render time. There is no REST channel for these filter outputs, so the shell cannot show a plugin's Settings/Docs/Premium links in the row.

13. **Activation fatal-error sandbox scrape — web-only diagnostic. [upstream]**
    Classic re-runs the failed plugin in a sandbox via `error_scrape` inside an iframe to show the exact fatal output (`plugins.php:176-197, 685-698`). REST's `activate_plugin` returns a `WP_Error` (surfaced as a 500), so the *message* is available, but the iframe scrape + "disable and try again" recovery affordance is not reproducible via REST.

## DataViews / DataForms review

The app uses **DataViews** (read-only table; no DataForm). Usage is **idiomatic and consistent** with the other five entity-CRUD list apps:

- Imports from `@wordpress/dataviews/wp` (`src/apps/plugins/index.js:5`) per the project rule — correct, avoids the `Minified React error #130` trap.
- Uses the shared scaffolding correctly: `buildFields` (`_shared/dataviews/buildFields.mjs`), `buildActions` (`_shared/dataviews/buildActions.js`), `useEntityDataView` (state seed + resync + title-dedup + selection), and `createBulkConfirmModal` (`_shared/dataviews/createBulkConfirmModal.js`). No re-copied scaffolding.
- The `eligibilityOverrides.visit` escape hatch (`index.js:257-259`) is the documented, sanctioned pattern for a presence check (`!!item.pluginUri`) that JSON `eligibleWhen` can't express — `buildActions` honors it over the declarative `compileEligibility` (`buildActions.js:45-47`). Idiomatic.
- `elementCounts` is correctly wired: the app computes `statusCounts` client-side (`index.js:184-190`) and passes it through to `withElementCounts`, which folds the count into the filter label (`buildFields.mjs:105-116`). This is the right way to get "Active (5)" given DataViews has no native count slot.

**Non-idiomatic / fragile points specific to this app (all stem from the single-shot unpaginated read):**

1. **Manual client-side sort + paginate + filter outside DataViews.** Because the app hands DataViews a *pre-sliced* `paginatedData` (`index.js:324-330`) and computes `paginationInfo` itself (`index.js:299-305`), it must replicate DataViews' own sort/page logic by hand (`index.js:270-297`). DataViews is being used in a "controlled, dumb-render" mode where the host owns sort+page. This is a legitimate pattern for a fully client-side dataset, but it's fragile: the comment at `index.js:263-269` exists precisely because forgetting the manual sort makes column headers do nothing, and the page-clamp at `index.js:289-294` is a workaround for `view.page` outrunning a post-delete shrink. None of this is *wrong*, but it duplicates logic DataViews would do if it owned the full set. A cleaner alternative would be to hand DataViews the full filtered set and let it sort/paginate (DataViews supports client-side pagination natively), reserving manual work only for the description-aware search. The current split (search+filter in one memo, sort+page in another) is a maintenance hazard.

2. **Search re-implemented because it must hit the rendered description.** The app intentionally searches the stripped description that lives *inside* the name cell (`index.js:148-156`, comment at `263-269`), which DataViews' `enableGlobalSearch` can't reach because the description isn't its own field. This is a reasonable workaround but means `view.search` is applied twice-removed from DataViews' own search machinery. Not a misuse, but coupled tightly to the cell renderer.

No DataForm is used, and none is warranted — there is no single-record edit surface (status changes are one-shot actions, not a form). If the Add-New install-by-slug flow were built, a small DataForm or a plain dialog would suffice; DataViews itself would not cover directory browse (that's a card grid, outside DataViews' table/grid layouts unless modeled as a grid dataView against a custom directory endpoint).

## Recommendations / future work

**P1 — close the high-value gaps that need upstream REST work (file as upstream tickets):**

- **[upstream] Plugin update via REST.** Add a REST route (or extend `update_item` with an `update` action) that runs `Plugin_Upgrader` for an installed plugin, plus `new_version`/`update_available`/`update-supported` fields on the resource. Without it, the entire update flow (inline "update now", bulk update, Update-Available tab) stays blocked. Until then, the shell can iframe `update.php?action=update-selected` as an interim (matches classic's own iframe approach). Where: new controller route; shell consumes in `src/apps/plugins/`.
- **[upstream] Auto-update toggle via REST.** Register `auto_update_plugins` with `show_in_rest` (or a dedicated route) so the toggle column + bulk enable/disable are reachable. Verified not registered today. Interim [shell]: custom `/wp-admin-workspaces/v1/plugin-auto-updates` endpoint.
- **[upstream] Plugin-directory proxy.** The Add-New flow is the single biggest parity gap and is entirely blocked on `plugins_api` not being REST. Either expose a core REST wrapper for `plugins_api`, or [shell] ship a `/wp-admin-workspaces/v1/plugins-directory` proxy. This unblocks browse tabs, search, cards, ratings, install counts, compatibility, and the More-Details modal. Without it the shell cannot install anything except by typing a known slug.

**P2 — shell-side features buildable with TODAY's APIs (no upstream needed):**

- **[shell] Install-by-slug UI.** `POST /wp/v2/plugins { slug, status }` already works (controller:273). Ship at minimum a "type a slug → Install / Install & Activate" affordance + an "Add New Plugin" header action so the install path isn't entirely absent. Where: `src/apps/plugins/index.js` (header action) + a small new app or modal.
- **[shell] Use `author_uri` to link the author.** Trivial fix for divergence #1 — the field is already fetched (`index.js:175`); render the author as an anchor. Where: `index.js:72` renderer.
- **[shell] Broaden search to author.** Match the search term against `author` too (divergence #2). Where: `index.js:148-156` filter.
- **[shell] Render the PHP/WP-incompatibility row.** `requires_php`/`requires_wp` are in the REST schema (controller:955-966) but unused; the shell can show the "does not work with your version" inline state without any upstream change. Where: add fields to the projection (`index.js:167-178`) + a renderer.
- **[shell] Reconsider terminal error handling.** A dismissible banner *above* a still-rendered list (classic's behavior) is friendlier than unmounting the whole table on one failed action (divergence #3). Where: `index.js:307-315`.
- **[shell] Name-scoped action a11y labels.** DataViews actions use generic labels ("Activate"); classic interpolates the plugin name. Investigate whether DataViews exposes per-item label customization; if not, this is a DataViews limitation to flag. Where: `_shared/dataviews/buildActions.js`.

**P3 — lower-value or deferred:**

- **[shell] Let DataViews own sort+pagination** for the full client-side set instead of the manual sort/slice in `index.js:270-305`, reducing the fragile dual-memo logic (DataViews review point #1). Reserve manual work for the description-aware search only.
- **[upstream] Must-Use + Drop-ins REST collections**, **paused/Resume**, **dependency state**, **`recently_activated`**, and **`plugin_action_links`/`plugin_row_meta` exposure** — each needs a distinct upstream surface. These are low-frequency for most sites; document as known gaps. Must-use/drop-ins in particular matter for the developer-admin audience.
- **[shell] Plugin file editor** — keep as `iframe:plugin-editor.php` or omit (recommended; cap-gated, dangerous, deprecated).
- **[docs] Update `docs/screens/plugins.md`** line "Current shell coverage: none — `iframe:plugins.php` only" — it's stale now that a native DataViews installed list ships. Also note the controller uses `POST` (not `PUT`) for status updates; the spec's Actions table says `PUT /wp/v2/plugins/{plugin}` (rows for Activate/Deactivate) but the controller registers `EDITABLE` (POST/PUT/PATCH all accepted) and the shell sends `POST` (`index.js:114`) — harmless, but the spec should say "POST/PUT" to match.
