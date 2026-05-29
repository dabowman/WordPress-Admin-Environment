# Parity: Themes (core:themes)

> Audited 2026-05-29 against WordPress 7.0 core. Shell app: `src/apps/themes/`. Classic counterpart: `wp-admin/themes.php` + `wp-admin/theme-install.php` + `js/_enqueues/wp/theme.js` + `wp-admin/includes/theme.php` (`wp_prepare_themes_for_js`).

## Verdict

**Major gaps (bordering on Blocked by API).** The shell ships a clean DataViews grid/table over the installed-theme library and gets the read side right (screenshots, status, description, version, author, search, sort, pagination, details modal). But the entire **write/management surface of the classic screen is absent or broken**: there is no "Add New Theme" directory browse, no ZIP upload, no Delete, no Live Preview/Customize launch, no auto-update toggle, no broken-theme handling, no child-theme display, and no update notices. Most critically, the **Activate action is non-functional**: it POSTs to `/wp-admin-shell/v1/activate-theme`, an endpoint that **is not registered anywhere in the plugin's PHP** (verified by grep across the whole repo), so every activation throws and falls through to a wp-admin link that is **missing the required `_wpnonce`** and therefore bounces back without activating. The root cause is upstream: `WP_REST_Themes_Controller` is read-only (no `CREATABLE`/`EDITABLE`/`DELETABLE` routes) and theme activation, install, delete, and auto-update toggle are all server-side switches or admin-ajax actions with no REST equivalent. Closing parity needs both a shell-side custom REST controller *and* (for .org browse) a server-side `themes_api()` proxy.

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/themes.php` — installed-themes grid, theme-details modal (`tmpl-theme-single`), Activate / Live Preview / Customize / Delete / auto-update actions, broken-themes table. Not a list-table — it renders a `wp_clearfix` grid from `wp_prepare_themes_for_js()` (`wp-admin/includes/theme.php:647`) into Underscore templates (`tmpl-theme`, `tmpl-theme-single`) driven by `js/_enqueues/wp/theme.js`.
  - `wp-admin/theme-install.php` — the .org directory browse (Popular / Latest / Block Themes / Favorites tabs + feature-filter drawer + keyword search), per-card Install / Preview, and the Upload Theme (ZIP) toggle. Data comes from `themes_api()` brokered through admin-ajax (`wp_ajax_query_themes`), not REST.
- **REST / core-data surface the shell app uses:**
  - `useEntityRecords('root', 'theme', { context: 'edit', status: 'active,inactive' })` → `GET /wp/v2/themes` (`WP_REST_Themes_Controller`, `class-wp-rest-themes-controller.php`). **Read-only controller** — only `WP_REST_Server::READABLE` routes registered (lines 43–75).
  - `useDataView(screenId)` → resolved `settings.dataViews.root.theme._default` from the kernel config snapshot (or `/wp-admin-shell/v1/data-view`).
  - `apiFetch` POST to `/wp-admin-shell/v1/activate-theme` — **this endpoint does not exist** (no `register_rest_route` for it anywhere in `includes/`; the only theme-related server code is `add_action('switch_theme', …)` cache flushers).
  - `window.wpAdminShell.{siteUrl,adminUrl}` (`wp-admin-shell.php:508,510`) for the screenshot fallback URL and the wp-admin activate fallback link. Note: `app.md` claims a read of `window.wpAdminShell.activeTheme`, but **that global is not emitted** (verified by grep of `wp-admin-shell.php`); the app never actually reads it.
- **Project screen spec:** `docs/screens/themes.md` — full Tier-2 spec. Present and unusually thorough (it already enumerates the REST gaps and proposes the missing endpoints). Its "Current shell coverage" line is stale ("None — no `core:themes` source registered"), since `core:themes` now exists; that line should be refreshed.

## Feature parity matrix

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Installed-theme grid w/ screenshots | Grid of cards, screenshot via `$theme['screenshot'][0]` (`themes.php:436`) | DataViews grid, `mediaField: screenshot` (app.json:37), `screenshotUrl()` with `/wp-content/themes/{slug}/screenshot.png` fallback (`index.js:70`) | 🟢 full | Screenshot media-field trap (CLAUDE.md) is fixed — `wp-admin-default.json:656` redeclares the triple *with* `mediaField`. App also synthesizes a fallback URL when REST `screenshot` is empty. |
| Table/list view | None — grid only | DataViews `table` layout available (`defaultLayouts.table`, app.json:40) | 🟢 full (exceeds) | Shell adds a sortable table view classic never had. |
| Active-theme distinguished | Active card floats first + "Active:" label + wide detail block (`themes.php:597`) | Sorted `status` asc so active floats first (`VIEW_DEFAULTS.sort`, `index.js:51`); status renders "Active"/"Inactive" pill (`index.js:94`) | 🟡 partial | No dedicated wide "active theme" hero card with screenshot + actions; the active theme is just the first grid tile. |
| Theme-details modal | `tmpl-theme-single`: large screenshot, name, version, author+URI, description, **tags**, parent/child note, update notices, auto-update setting, actions (`themes.php:1050`) | `renderDetailsModal`: screenshot, name, description, version, author, "Theme site" link, Activate (`index.js:157`) | 🟡 partial | Missing: **tags**, **child-theme parent note**, update notices, auto-update control, Delete, Live Preview. Description is full in the modal (good); grid is truncated to 140 chars. |
| Activate | `<a>` to `themes.php?action=activate&stylesheet=…&_wpnonce=…` → server `switch_theme()` (`themes.php:20–35`, nonce'd link from `wp_prepare_themes_for_js`:`actions.activate`) | POST `/wp-admin-shell/v1/activate-theme` then `invalidateResolution` + snackbar; on error `window.location.href` to nonce-less `themes.php?action=activate…` (`index.js:127`) | 🔴 broken | **Endpoint not registered → always throws → falls back to a link missing `_wpnonce` → `check_admin_referer` fails → user bounced back, theme NOT activated.** See API blockers. |
| Live Preview / Customize | Block theme → `site-editor.php?wp_theme_preview={slug}`; classic → `customize.php` via `wp_customize_url()` (`theme.php` `$customize_action`, exposed as `actions.customize`) | None | 🔴 missing | No preview/customize launch for any theme. Shell *has* a `site-editor` screen + `customize` iframe screen but the themes app does not link a per-theme preview. Shell-closable (build the URL + `<a href>`). |
| Delete (inactive) | Per-theme `<a>` Delete in detail modal w/ JS confirm → `themes.php?action=delete` (cap `delete_themes`) OR admin-ajax `wp_ajax_delete_theme` (`themes.php:56`, `ajax-actions.php:4385`) | None | 🔴 missing | No Delete action declared in `app.json#dataView.actions`. Blocked by API (no REST DELETE on themes); needs shell endpoint or admin-ajax bridge + filesystem-credentials handling. |
| Add New Theme — .org directory browse | Full `theme-install.php` screen: Popular/Latest/Block Themes/Favorites tabs, feature-filter drawer, keyword search, infinite scroll; data via `themes_api()`→`wp_ajax_query_themes` (`theme-install.php`, `ajax-actions.php:3623`) | None — no screen exists | 🔴 missing | No `theme-install`/add-new screen anywhere in `shells/` or `src/`. Blocked: `themes_api()` is not REST and is cross-origin; needs a server-side proxy. |
| Upload Theme (ZIP) | "Upload Theme" toggle reveals `install_themes_upload()` form → multipart to `update.php` (`theme-install.php:178,195`) | None | 🔴 missing | No upload UI. Shell-closable via a custom multipart endpoint wrapping `Theme_Upgrader`, but no core REST surface. |
| Auto-update toggle (per theme) | Enable/Disable link in detail modal → `themes.php?action=enable-auto-update` (nonce `updates`) OR admin-ajax `wp_ajax_toggle_auto_updates`; stored in `auto_update_themes` site option (`themes.php:84–123`, `ajax-actions.php:5554`) | None | 🔴 missing | `auto_update_themes` is **not** `show_in_rest` (grep empty), and the toggle is admin-ajax only. Blocked by API. |
| Broken-theme handling | "Broken Themes" table listing incomplete themes with Resume / Delete / Install Parent Theme actions (`themes.php:668–767`) | None | 🔴 missing | `useEntityRecords('root','theme', status:'active,inactive')` never returns broken themes (core `wp_get_themes(['errors'=>true])` is a separate call). Blocked: REST `GET /wp/v2/themes` excludes errored themes; no `errors`/`status:broken` query param. |
| Resume paused theme | `<a>` Resume in broken table → `themes.php?action=resume` (cap `resume_theme`) (`themes.php:36–55`) | None | 🔴 missing | No REST; server-side `resume_theme()`. Blocked by API. Rare, low priority. |
| Theme update notices | Per-card + per-modal "New version available / Update now" + WP/PHP-incompat warnings, from `get_site_transient('update_themes')` (`themes.php:444–581`, `wp_prepare_themes_for_js` `updateResponse`/`hasUpdate`) | None | 🔴 missing | No `hasUpdate`/`updateResponse`/`compatibleWP`/`compatiblePHP` fields in REST schema. Blocked by API (server-only update transient). |
| WP/PHP-compatibility gating | "Cannot Activate" disabled state for incompatible themes (`themes.php:638`) | None — all inactive themes show Activate | 🔴 missing | Same blocker: `compatibleWP`/`compatiblePHP` not in REST. App would let a user attempt to activate an incompatible theme. |
| Child-theme relationship | "This is a child theme of {parent}" in detail modal; Delete suppressed when an active child exists (`themes.php:1237`, `theme.php` `$parents`) | None | 🟡 partial | REST *does* expose `template` (parent stylesheet, schema line 499) so the parent slug is reachable, but the app maps neither `template` nor renders the relationship. Shell-closable from existing data. |
| Tags display | Detail modal "Tags: …" from `tags.rendered` (`themes.php:1246`) | None | 🟡 partial | REST exposes `tags.rendered`/`tags.raw` (schema:593). App doesn't request/render them. Shell-closable. |
| Search | Live keyword search across name/description/author/tag (`theme.js`, `themes.php:138`) | DataViews search box; `filterSortAndPaginate` searches `enableGlobalSearch` fields = **name only** (`index.js:274`, app.json:42 only `name` has `enableGlobalSearch`) | 🟡 partial | Classic searches name + description + author + tags; shell searches name only. Description/author are present in `data` but not flagged searchable. Shell-closable (add `enableGlobalSearch` to those fields). |
| Sort | None in classic (alpha by name, server-side) | DataViews column sort on name/status/version/author (sortable fields) | 🟢 full (exceeds) | Shell adds user-controllable sort classic lacks. |
| Status filter / view tabs | No status tabs (themes are just active/inactive in the grid) | `status` field has `filterBy.operators:[isAny]` → DataViews filter (app.json:44) | 🟢 full (exceeds) | Shell offers an explicit active/inactive filter. |
| View counts | Header `<span class="theme-count">` = `count($themes)` (`themes.php:252`) | DataViews shows result count in its own footer/header | 🟢 full | Equivalent. |
| Pagination | None — all themes in one DOM render | DataViews client-side pagination over the single REST response; `filterSortAndPaginate` (`index.js:274`) | 🟢 full | `GET /wp/v2/themes` returns all themes in one request (`X-WP-TotalPages: 1`, controller line 221); client paginates. Fine for realistic theme counts. |
| Bulk actions | None | None | 🟢 full | Classic has no bulk theme actions; `selection` is wired but no bulk action declared — parity. |
| Quick Edit / Bulk Edit | None | None | 🟢 N/A | Not applicable to themes. |
| Screen Options (columns / per-page) | Per-page not applicable; no column toggle | DataViews field-visibility menu + per-page in view controls | 🟢 full (exceeds) | DataViews gives column show/hide classic never had. |
| Help tabs | Overview, Adding Themes, Previewing & Customizing, Auto-updates + help sidebar (`themes.php:131–211`) | None | 🔴 missing | Cross-cutting shell gap (no help-tab surface). Documentational; low parity weight. |
| Capability gating (view) | `switch_themes` OR `edit_theme_options`, else `wp_die(403)` (`themes.php:12`) | App `capabilities: ["switch_themes"]` (app.json:9); screen `permissions.capabilities:["switch_themes"]` (`wp-admin-default.json:914`) | 🟡 partial | Shell requires `switch_themes` only; classic also admits `edit_theme_options`-only users (read-only view). An editor who can customize but not switch themes sees the screen in classic, not in the shell. |
| Capability gating (per-action) | `delete_themes`, `install_themes`, `upload_themes`, `update_themes`, `resume_theme`, `customize` gate individual actions (`themes.php` throughout) | Only Activate exists, eligible when `status: inactive` (app.json:50) | 🔴 missing | Most gated actions don't exist in the app, so their caps are moot. The one action (Activate) doesn't re-check `switch_themes` client-side (relies on the dead endpoint). |
| Nonce / security | `check_admin_referer('switch-theme_{slug}')`, `check_ajax_referer('updates')` per action (`themes.php:22`, `ajax-actions.php`) | REST `X-WP-Nonce` (`wpAdminShell.nonce`) would cover a real endpoint; fallback link is **nonce-less** (`index.js:148`) | 🔴 broken | The fallback `themes.php?action=activate&stylesheet=…` omits `&_wpnonce=` → `check_admin_referer` dies. Documented limitation in `app.md`. |
| Empty state | `<p class="no-themes">No themes found.</p>` (`themes.php:666`) | DataViews built-in empty state | 🟢 full | Equivalent (DataViews renders its own "no results"). |
| Loading state | Synchronous PHP render (no spinner) | `<Spinner/>` while `themes === null`, then DataViews `isLoading` (`index.js:281`) | 🟢 full (exceeds) | Shell gates on `records !== null` per CLAUDE.md pattern. |
| Error state | `wp_die()` / admin notices | Activate failure silently redirects to wp-admin (no error notice); read errors fall to empty grid | 🟡 partial | No user-visible error notice on activate failure — it navigates away. A 404 on the dead endpoint is swallowed by the `catch`. |
| Multisite handling | Install gated to network admin; broken-themes hidden on multisite; network-activate flow (`themes.php:346,671`; `theme-install.php:19`) | None | 🔴 missing | No multisite awareness, no Network Activate. Out of scope per screen spec §16 but a real divergence. |
| Extensibility hooks | `wp_prepare_themes_for_js`, `pre_prepare_themes_for_js`, `theme_auto_update_setting_template`, `install_themes_tabs`, `install_themes_{$tab}` (`theme.php`, `theme-install.php`) | `wp_admin_shell_data_view_config_root_theme[_{variant}]` filter + admin.json `settings.dataViews` override | 🟡 partial | Shell offers DataView-shape extensibility (fields/actions/columns) but none of core's theme-specific data hooks. Different extension model. |
| a11y — action labels | Per-action `aria-label` ("Activate {name}", "View Theme Details for {name}", "Delete {name}") (`themes.php:584,620`) | DataViews owns grid/modal focus + a11y; action labels are generic ("Activate", "Details") | 🟡 partial | DataViews provides solid focus management and a focus-restoring modal (`app.json` a11y block), but lacks the per-theme-name aria-labels classic emits. |
| a11y — modal focus trap | `theme.js` manages overlay focus + prev/next/close buttons | DataViews `RenderModal` owns focus trap + restore-on-close | 🟢 full | DataViews handles this idiomatically; arguably cleaner than classic. No prev/next theme navigation in the shell modal, though. |

## Functional divergences

Behaviors present in both that work differently:

1. **Activate flow — optimistic REST vs. nonce'd navigation.**
   - Classic: a server-rendered `<a>` carrying `&_wpnonce=…` (`wp_prepare_themes_for_js` `actions.activate`, `theme.php`) that hits `themes.php:33 switch_theme()` and redirects to `themes.php?activated=true`.
   - Shell: `activate()` (`src/apps/themes/index.js:127–155`) POSTs to a custom endpoint, invalidates the core-data cache, and shows a snackbar — *if the endpoint existed*. Because it doesn't, the `catch` runs `window.location.href` to a **nonce-less** link.
   - **User-visible consequence:** clicking Activate appears to do nothing useful — the page reloads into wp-admin's themes list with the theme still inactive (the nonce check silently bounces). This is the single highest-impact divergence; it makes the app's only write action a no-op on a clean install.

2. **Active-theme presentation.**
   - Classic: the active theme gets a visually distinct wide hero block above the grid with its own action row (`themes.php:597`, `tmpl-theme-single` "Active Theme" label).
   - Shell: the active theme is an ordinary grid tile, merely sorted first (`index.js:51`), with an "Active" pill.
   - **Consequence:** less obvious which theme is live; no quick Customize/Site-Editor entry on the active theme.

3. **Search scope.**
   - Classic: searches name + description + author + tags (`themes.php:138` help text; `theme.js` filters across those).
   - Shell: `filterSortAndPaginate` only searches fields with `enableGlobalSearch: true`, and only `name` carries it (`app.json:42`).
   - **Consequence:** searching for an author name or a tag returns nothing in the shell even though those values are loaded into `data` (`index.js:240–241`).

4. **Screenshot URL resolution.**
   - Classic: uses exactly the REST/theme-object screenshot with a `?ver=` cache-buster (`themes.php:438`), and renders a `.blank` placeholder when absent.
   - Shell: when REST returns an empty `screenshot`, it *guesses* `/wp-content/themes/{slug}/screenshot.png` (`index.js:70–82`) and relies on the browser silently dropping a 404.
   - **Consequence:** generally an improvement (more themes show a thumbnail), but it can produce a broken-image flash for themes whose screenshot is `.jpg`/`.gif`/`.webp` or absent, where classic shows a clean blank tile.

5. **Capability surface for view access.**
   - Classic: `switch_themes` **OR** `edit_theme_options` may view (`themes.php:12`).
   - Shell: screen + app require `switch_themes` (`wp-admin-default.json:914`, `app.json:9`).
   - **Consequence:** a role granted only `edit_theme_options` (can customize, cannot switch) sees the Themes screen in classic but has it pruned from the shell nav.

## API & platform blockers

The hard parity blockers. Each verified against live WP 7.0 source.

1. **No theme-switch (activate) in core REST.** `[upstream]` (+ `[shell]` for the missing custom endpoint)
   - `WP_REST_Themes_Controller::register_routes()` registers only `READABLE` routes (`class-wp-rest-themes-controller.php:43–75`). There is no `POST`/`PUT` to switch the active theme. Activation is the server-side `switch_theme()` called from `themes.php:33`.
   - The shell's intended workaround — `POST /wp-admin-shell/v1/activate-theme` — **is not implemented**: a repo-wide grep for `activate-theme` / `register_rest_route` finds no such route (`includes/` has only `can`, `prefs`, `data-view`, `data-field-collections` controllers). So the documented "graceful fallback" is the *only* path, and it is itself broken (no nonce).
   - **To close:** `[shell]` register a `POST /wp-admin-shell/v1/activate-theme` endpoint (cap `switch_themes`, REST nonce, calls `switch_theme()`), OR at minimum `[shell]` inject `&_wpnonce=` into the fallback link by exposing a per-theme `wp_create_nonce('switch-theme_'.$slug)` (see `app.md` "Known limitations"). `[upstream]` the durable fix is a core `POST /wp/v2/themes/{stylesheet}` with a writable `status` field.

2. **No theme install / .org directory browse via REST.** `[upstream]` + `[shell]`
   - The Add-New screen uses `themes_api()` → `wp_ajax_query_themes` (`ajax-actions.php:3623`, cap `install_themes`) and `wp_ajax_install_theme` (`ajax-actions.php:4164`, `check_ajax_referer('updates')`, runs `Theme_Upgrader`). Both are **admin-ajax only**; `themes_api()` brokers the WordPress.org Themes API (`api.wordpress.org/themes/info/1.2/`), which is cross-origin and not exposed over REST.
   - **To close:** `[shell]` build a server-side proxy (`/wp-admin-shell/v1/themes-directory` wrapping `themes_api()`) + an install endpoint wrapping `Theme_Upgrader`, plus filesystem-credentials handling. `[upstream]` no core REST surface exists for either.

3. **No theme delete via REST.** `[upstream]` + `[shell]`
   - Delete is `themes.php:56 delete_theme()` or `wp_ajax_delete_theme` (`ajax-actions.php:4385`, `check_ajax_referer('updates')`, cap `delete_themes`, requires filesystem credentials). The REST controller has no `DELETABLE` route.
   - **To close:** `[shell]` custom `DELETE` endpoint. `[upstream]` durable fix is `DELETE /wp/v2/themes/{stylesheet}`.

4. **No auto-update toggle via REST; option not exposed.** `[upstream]`
   - Toggle is `wp_ajax_toggle_auto_updates` (`ajax-actions.php:5554`) writing the `auto_update_themes` site option. That option is **not** registered with `show_in_rest` (grep of `option.php` returns nothing), so `GET/POST /wp/v2/settings` can neither read nor write it, and there's no per-theme toggle endpoint.
   - **To close:** `[upstream]` register `auto_update_themes` for REST (or add a dedicated endpoint), OR `[shell]` a custom endpoint wrapping `update_site_option`.

5. **No theme-update / compatibility data in REST.** `[upstream]`
   - `hasUpdate`, `update`, `updateResponse.compatibleWP/PHP`, `compatibleWP`, `compatiblePHP` all come from `get_site_transient('update_themes')` + `is_wp_version_compatible()` server-side (`theme.php` `wp_prepare_themes_for_js`). None are fields in the REST theme schema (`class-wp-rest-themes-controller.php:478–693`).
   - **Consequence:** the shell can show neither "update available" notices nor "Cannot Activate" gating for incompatible themes — it would happily let a user try to activate a theme that fails WP/PHP requirements.
   - **To close:** `[upstream]` add `update_available`/`compatibility` fields to the themes REST schema (proposed in `docs/screens/themes.md:115`).

6. **Broken/errored themes are absent from REST.** `[upstream]`
   - Classic lists them via `wp_get_themes(['errors'=>true])` (`themes.php:670`). `GET /wp/v2/themes::get_items()` iterates `wp_get_themes()` (no `errors`) and classifies only `active`/`inactive` (controller:207); the `status` enum is `['inactive','active']` only (schema:644). Broken themes never appear.
   - **To close:** `[upstream]` a `status: broken` / `errors` query param + schema, or a dedicated endpoint.

7. **Live Preview / Customize URLs are server-computed.** `[shell]` (mostly)
   - `wp_prepare_themes_for_js` computes `actions.customize` server-side: block themes → `site-editor.php?wp_theme_preview={slug}`, classic → `wp_customize_url($slug)` (`theme.php`). REST exposes `is_block_theme` (schema:557) but not the prebuilt preview URL.
   - **To close:** `[shell]` derive the URL client-side from `is_block_theme` + `stylesheet` and render an `<a href>` (so the admin-link interceptor handles it). No core change needed — but note the shell currently doesn't even request `is_block_theme`.

8. **Active-theme global not emitted (minor).** `[shell]`
   - `app.md` documents a read of `window.wpAdminShell.activeTheme`, but `wp-admin-shell.php:506–564` does not emit it (grep confirms). The app actually derives active-ness from the record's `status` field, so this is a doc bug, not a runtime one — but a rebuild following `app.md` would look for a non-existent global.

## DataViews / DataForms review

The app uses **DataViews** (no DataForm). Usage is largely idiomatic and consistent with the other five entity-CRUD apps:

- **Correct controlled-component pattern.** `view`/`setView` come from the shared `useEntityDataView` hook; the app calls `filterSortAndPaginate(data, view, fields)` itself (`index.js:274`) because DataViews is fully controlled — this is the documented requirement and is done right (search/filter/sort/pager all operate client-side over the one REST page).
- **Correct import path.** `import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews/wp'` (`index.js:9`) — matches the CLAUDE.md rule (never bare `@wordpress/dataviews`).
- **Correct identity + loading gate.** `getItemId={ item => item.id }` with `id = stylesheet` (`index.js:297`), and a `<Spinner/>` gate on `themes === null` before mounting DataViews (`index.js:281`) — both per the documented patterns.
- **Shared scaffolding used correctly.** `buildFields` (with `elementFallbacks.status`), `buildActions` (with `modals.details` + `callbacks.activate`), and the LABELS tables follow the prototype in `src/apps/posts/index.js`. `buildActions` (`_shared/dataviews/buildActions.js:50`) wires the Details modal via `RenderModal` and Activate via `callback` — clean.

Gaps / fragility:

- **Action eligibility leans only on `status`.** `activate` is `eligibleWhen: { status: 'inactive' }` (app.json:50). There's no eligibility for compatibility (can't be — data absent, blocker #5) and no `delete`/`live-preview` actions at all. The app under-uses the action surface DataViews offers.
- **`elementsFromLabels(STATUS_LABELS)` is sound** for the status filter enum, but `name` being the *only* `enableGlobalSearch` field (app.json:42) is the search-parity gap above — a one-line fix to flag `description`/`author` searchable.
- **`paginationInfo` is honest here** (one REST page, client pagination) — not the hard-coded `totalPages: 1` anti-pattern `app.md:92` worries about; `filterSortAndPaginate` returns real `paginationInfo`.
- **No misuse of DataForm** — and none is warranted; there's no single-record theme edit form in scope. The details modal is correctly a plain `<Stack>` of `<Text>`, not a DataForm (themes have no editable fields over REST anyway).

Net: the DataViews usage is correct and idiomatic; the parity gap is **scope** (missing actions/fields), not misuse.

## Recommendations / future work

**P1 — make Activate actually work (the headline bug).**
- `[shell]` Register `POST /wp-admin-shell/v1/activate-theme` in a new `includes/class-wp-admin-shell-themes-rest.php`: permission `current_user_can('switch_themes')`, REST-nonce protected, validates `wp_get_theme($stylesheet)->exists() && ->is_allowed()`, calls `switch_theme()`. This removes the dependency on the broken fallback. (`src/apps/themes/index.js:130` already targets this path.)
- `[shell]` As a belt-and-suspenders, fix the fallback link in `index.js:146–151` to carry a real `&_wpnonce=` — expose a `wp_create_nonce('switch-theme_'.$slug)` per theme (e.g. fold into the `root/theme` REST response via `register_rest_field`, or a small map in `wpAdminShell`). Until one of these lands, the app's only write action is a no-op.
- `[shell]` Show an error `Notice` on activate failure instead of silently `window.location.href`-ing away (`index.js:145`).

**P1 — fix the doc/spec drift.**
- `[shell]` `app.md` claims a `window.wpAdminShell.activeTheme` read that doesn't exist — remove or implement. `docs/screens/themes.md:5` "Current shell coverage: None" is stale — update to reflect `core:themes`.

**P2 — close the cheap read-side gaps (no upstream needed).**
- `[shell]` Add `enableGlobalSearch: true` to `description` and `author` in `app.json` (and the `wp-admin-default.json` redeclaration) so search matches classic scope.
- `[shell]` Map `template` → render a child-theme "This is a child theme of {parent}" line in the details modal (`index.js:157`); data is already in REST (`schema:499`).
- `[shell]` Request + render `tags.rendered` and `is_block_theme` (extend the `useEntityRecords` projection at `index.js:228`); use `is_block_theme` to add a **Live Preview / Customize** `<a href>` action (block → `site-editor.php?wp_theme_preview=…`, classic → `customize.php?…`) routed through the admin-link interceptor.
- `[shell]` Admit `edit_theme_options` as an alternative view cap on the screen `permissions` (`wp-admin-default.json:912`) to match `themes.php:12`.

**P2 — Delete + auto-update via shell endpoints.**
- `[shell]` Custom `DELETE /wp-admin-shell/v1/theme/{stylesheet}` (cap `delete_themes`, filesystem-credentials aware) + a destructive `delete` action via the shared `createBulkConfirmModal` factory. Suppress when the theme has an active child (mirror `theme.php` `$parents` logic).
- `[shell]` Custom auto-update toggle endpoint wrapping `update_site_option('auto_update_themes', …)`, surfaced as a per-row toggle or modal control.

**P3 — Add-New (directory browse + upload) screen.**
- `[shell]` New `theme-install` screen + app: a `/wp-admin-shell/v1/themes-directory` proxy wrapping `themes_api()` (the .org browse), an install endpoint wrapping `Theme_Upgrader`, and a multipart upload endpoint. Largest effort; entirely net-new server surface. Consider an interim `iframe:theme-install.php` escape-hatch screen (like the existing `fonts`/`widgets` iframe screens) to restore the capability immediately while the native version is built.

**P3 — broken-theme, resume, update-notice, multisite Network-Activate.**
- `[upstream]` These need REST schema extensions (`status: broken`/`errors`, `update_available`, compatibility flags) or remain admin-ajax/server-only. Track as upstream proposals (already enumerated in `docs/screens/themes.md:112–116`). Low frequency; lowest priority. Interim: rely on the classic `themes.php` round-trip via `legacy_path` for these edge operations.
