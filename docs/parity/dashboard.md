# Parity: Dashboard (core:dashboard / core:dashboard-host)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace apps: `src/apps/dashboard/`, `src/apps/dashboard-host/`, `src/apps/dashboard-widget-quick-draft/`, `src/apps/dashboard-widget-recent-posts/`. Widget registry: `includes/cascade/class-wp-admin-workspaces-dashboard-widgets.php`. Classic counterpart: `wp-admin/index.php` (boots `wp-admin/_index.php`) + `wp-admin/includes/dashboard.php` (`wp_dashboard_setup`).

## Verdict

**Major gaps.**

The workspace ships *two unrelated* dashboard implementations and neither approaches the classic dashboard's surface:

1. **`core:dashboard`** — a single React landing screen (greeting + 3 quick-action buttons + 4 stat cards + 2 list cards). It is registered in `builtins.js:146` but **used in no bundled workspace** (verified: `grep '"core:dashboard"' workspaces/` returns nothing). It is dead code from the perspective of `wp-admin-default.json`.
2. **`core:dashboard-host`** — the widget grid that the default workspace actually mounts (`workspaces/wp-admin-default.json:682-708`). It renders exactly **two** bundled widgets: Quick Draft and Recent Drafts. There is no At a Glance, no Activity feed (recent comments + inline moderation), no WordPress Events and News, no Site Health summary, no Welcome panel, no browser/PHP nags. There is no collapse, no drag-reorder, no Screen Options (column count / per-widget show-hide), and no per-widget configure control.

The classic dashboard registers up to ten core widgets via `wp_dashboard_setup` (`dashboard.php:20-166`) plus an open-ended plugin ecosystem through `wp_add_dashboard_widget`. The single largest blocker is structural: **third-party widgets register a PHP `$callback` that `echo`es arbitrary server HTML** (`dashboard.php:188-234`), which the workspace's React kernel fundamentally cannot execute. The workspace substitutes its own `wp_admin_workspaces_register_dashboard_widget()` registry (extension point #13) that mounts React app widgets in a grid — a clean architecture, but one that surfaces **zero** of the existing plugin dashboard widgets in the WordPress ecosystem (Yoast, Jetpack, WooCommerce, Akismet, etc.). The widget-registration gap alone is enough to classify this Major.

## Counterpart mapping

- **Classic screen:** `wp-admin/index.php` → `wp-admin/_index.php`; the dashboard body is rendered by `wp_dashboard()` (`includes/dashboard.php:260-287`), which calls `do_meta_boxes()` across four columns (`normal` / `side` / `column3` / `column4`). Widgets are registered as meta boxes by `wp_dashboard_setup()` (`dashboard.php:20`) via `wp_add_dashboard_widget()` (`dashboard.php:188`). There is no list-table — the dashboard is a meta-box screen.
- **Core widget callbacks (all in `includes/dashboard.php`):**
  - At a Glance — `wp_dashboard_right_now()` (`:300`)
  - Activity — `wp_dashboard_site_activity()` (`:935`) → `wp_dashboard_recent_posts()` (`:985`) + `wp_dashboard_recent_comments()` (`:1075`) → `_wp_dashboard_recent_comments_row()` (`:711`)
  - Quick Draft — `wp_dashboard_quick_press()` (`:549`) + `wp_dashboard_recent_drafts()` (`:630`)
  - WordPress Events and News — `wp_dashboard_events_news()` (`:1313`) → `wp_print_community_events_markup()` (`:1367`) + `wp_dashboard_primary()` (`:1538`)
  - Site Health Status — `wp_dashboard_site_health()` (`:1973`)
  - Welcome panel — `wp_welcome_panel()` (in `wp-admin/includes/template.php`, rendered from `_index.php`)
  - Browser/PHP nags — `wp_dashboard_browser_nag()` (`:1723`), `wp_dashboard_php_nag()` (`:1874`)
- **REST / core-data surface the workspace uses:**
  - `core:dashboard`: `useEntityRecord('root','user', id)` (greeting); `useEntityRecords('postType','post', …)` ×2 (publish count + draft list); `useEntityRecords('postType','page', …)` (page count); `useEntityRecords('root','comment', {status:'hold'})` (pending count + list); `useEntityRecords('root','user', …)` (user count). Counts read `X-WP-Total` via `.totalItems` (`src/apps/dashboard/index.js:68-72,137-152`).
  - `core:dashboard-widget-recent-posts`: `useEntityRecords('postType','post', RECENT_DRAFTS_QUERY)` (`index.js:19`, query in `query.mjs`).
  - `core:dashboard-widget-quick-draft`: `saveEntityRecord('postType','post', {status:'draft'})` + `invalidateResolution` (`index.js:38-52`).
  - `core:dashboard-host`: reads `config.screens[screenId].apps[]` (kernel config) + `window.wpAdminWorkspaces.manifests.apps` — no REST (`index.js:77-94`).
- **Project screen spec:** `docs/screens/dashboard-home.md` — **present and excellent** (24 KB, tier-2). It documents the full classic surface, REST mapping per widget, and the aggregate gaps. (Note: its "Current workspace coverage: None" line is stale — `core:dashboard` and the host now exist; it predates them.) `network-dashboard.md` also exists for multisite (out of scope here).

## Feature parity matrix

Status legend: 🟢 full · 🟡 partial · 🔴 missing · ⛔ blocked by API.

### Screen-level / interaction layer

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Dashboard as default landing | `wp-admin/` → dashboard | `default-screen: dashboard-home` → `core:dashboard-host` grid (`wp-admin-default.json:10,682`) | 🟢 | Lands on the grid, not `core:dashboard`. |
| Multi-column layout (1–4 cols) | `wp_dashboard()` renders 4 postbox-containers; `columns-N` class (`dashboard.php:262-282`) | CSS Grid `repeat(auto-fill, minmax(280px,1fr))` (`dashboard-host/index.css:3`) | 🟡 | Responsive auto-flow, not user-chosen column count. |
| Screen Options: column count (1–4) | `WP_Screen->get_columns()`; persisted in `screen_layout_dashboard` user meta | None | 🔴 | No Screen Options surface at all. |
| Screen Options: per-widget show/hide | `metaboxhidden_dashboard` user meta; checkboxes in Screen Options | None | 🔴 | Widgets are fixed by workspace.json `apps[]`. |
| Collapse / expand a widget | Postbox toggle; persisted in `closedpostboxes_dashboard` user meta | None — tile header is a static `<span>` (`dashboard-host/index.js:118-122`) | 🔴 | No collapse affordance. |
| Drag-to-reorder widgets | jQuery UI sortable → `POST admin-ajax.php?action=meta-box-order` (`ajax-actions.php:1988`), `meta-box-order_dashboard` meta | None — order is workspace.json `apps[]` order + `position` override (`composeScreenWidgets.mjs`) | 🔴 | Documented out of scope (`dashboard-host/app.json` constraint `no-runtime-mutation`). |
| Help tab | Contextual help via `WP_Screen` | None | 🔴 | Kernel has no help-tab surface. (Spec §7 marks help "omit in v1".) |
| Welcome panel | `wp_welcome_panel()`, dismiss via `?welcome=0` → `show_welcome_panel` user meta | None | 🔴 | Not ported (`dashboard/app.json` constraint `no-welcome-panel`). |
| Browser-out-of-date nag | `wp_dashboard_browser_nag()` (`:1723`), `wp_check_browser_version()` | None | ⛔ | `wp_check_browser_version` is PHP-only, no REST. |
| PHP-update nag | `wp_dashboard_php_nag()` (`:1874`), `wp_check_php_version()`, cap `update_php` | None | ⛔ | `wp_check_php_version` is PHP-only, no REST. |
| Capability gating (per widget) | Each `wp_add_dashboard_widget` is cap-gated inline (`edit_posts`, `view_site_health_checks`, `create_posts`, `update_php`) | Per-app capability floor (4-layer gating via `MountedApp`); `core:dashboard-widget-quick-draft` declares `edit_posts` (`app.json:9`) | 🟡 | Mechanism present; only 2 widgets exist to gate. `core:dashboard` itself has no cap floor (lands on `read`). |
| Empty state | "No dashboard widgets" only if none registered (rare) | "No dashboard widgets are registered." (`dashboard-host/index.js:96-107`) | 🟢 | Host empty state. |
| Error state (per widget) | Each widget renders independently; a PHP fatal in one can white-screen the page | Per-widget React error isolation not implemented; relies on kernel | 🟡 | No per-tile error boundary; a throwing widget app could break the grid. |

### At a Glance widget

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Published post count | `wp_count_posts('post')->publish` (`dashboard.php:307`) | `core:dashboard` only: `?per_page=1&status=publish` → `X-WP-Total` (`dashboard/index.js:68,137`) | 🟡 | Present in dead `core:dashboard`; **absent from the host the workspace actually uses.** |
| Published page count | `wp_count_posts('page')->publish` | `core:dashboard` only (`index.js:70,144`) | 🟡 | Same — host has no At a Glance widget. |
| Comment count (approved) | `wp_count_comments()->approved` (`:337`) | Not rendered (workspace shows pending only) | 🔴 | Approved-comment count not surfaced. |
| Comments-in-moderation count | `wp_count_comments()->moderated` (`:347`) | `core:dashboard` only: `?status=hold&per_page=1` → `X-WP-Total` (`index.js:71,145`) | 🟡 | Present in dead app, absent from host. |
| WordPress version | `get_bloginfo('version')` in "X runs WordPress N.N" line | None | 🔴 | Not surfaced. `GET /` exposes no version field in REST index (no `version` key). |
| Active theme name | `wp_get_theme()` | None | 🟡 | `GET /wp/v2/themes?status=active` exists; just not used. |
| Search-engines-discouraged notice | `! get_option('blog_public')`, cap `manage_options` (`:380-411`) | None | 🟡 | `GET /wp/v2/settings`→`blog_public` exists; not used. |
| Click count → filtered list | Links to `edit.php?post_status=publish&post_type=post` (`:322`), `edit-comments.php` | `core:dashboard` stat cards are non-clickable (`StatCard` has no link) | 🔴 | Counts don't navigate. |
| Cap-gate count links | Plain `<span>` when no `edit_posts` (`:331`) | N/A (no links) | — | |
| `dashboard_glance_items` filter (plugin rows) | Plugins inject extra `<li>` (`:368`) | None | ⛔ | No REST surface; PHP-only filter. |

### Activity widget

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Recently Published posts | `wp_dashboard_recent_posts(status=publish, max=5)` (`:948`) | None | 🟡 | `?status=publish&per_page=5&orderby=date&order=desc` is trivially feasible; not built. |
| Publishing Soon (scheduled) | `wp_dashboard_recent_posts(status=future, max=5, order=ASC)` (`:939`) | None | 🟡 | REST `status=future` is queryable (needs `context=edit` + cap); not built. |
| Recent comments list | `wp_dashboard_recent_comments()` (`:1075`), 5 items, all types, spam-filtered | None in host; `core:dashboard` shows pending-only list (`index.js:247-287`) | 🟡 | Workspace list is `status=hold` only, not the mixed recent-comments feed. |
| Inline comment: Approve | `comment.php?action=approvecomment` + nonce `approve-comment_{id}` (`:741`) | None | 🟡 | Feasible via `PUT /wp/v2/comments/{id} {status:'approve'}` (verified `:1830-1837`); workspace only links "Moderate all" → `#/comments`. |
| Inline comment: Unapprove | `unapprovecomment` + nonce (`:742`) | None | 🟡 | `PUT {status:'hold'}` feasible. |
| Inline comment: Reply | Inline JS reply form → posts comment (`:770`) | None | 🟡 | `POST /wp/v2/comments {parent}` feasible. |
| Inline comment: Edit | `comment.php?action=editcomment` (`:763`) | None | 🟡 | Could navigate to `#/comments`. |
| Inline comment: Spam | `spamcomment` + delete nonce (`:779`) | None | 🟡 | `PUT {status:'spam'}` feasible (`:1839-1840`). |
| Inline comment: Trash | `trashcomment` + delete nonce (`:797`) | None | 🟡 | `DELETE /wp/v2/comments/{id}` (force=false) feasible (`:1085-1093`). |
| Inline comment: Delete Permanently | `deletecomment` when `EMPTY_TRASH_DAYS===0` (`:789`) | None | 🟡 | `DELETE ?force=true` feasible. |
| "No activity yet!" empty state | `dashboard.php:961` | N/A | 🔴 | No Activity widget to be empty. |

### Quick Draft widget

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Title + content + Save Draft | `wp_dashboard_quick_press()` form posting to `post.php?action=post-quickdraft-save` (`:581-618`, handler `post.php:73`) | `core:dashboard-widget-quick-draft` form → `saveEntityRecord` (`index.js:38-44`) | 🟢 | REST create draft is feasible and idiomatic. |
| Empty-content rejection workaround | Server wraps content in `<!-- wp:paragraph -->` and `<br/>`s newlines (`post.php:99-105`) | Seeds `<!-- wp:paragraph --><p></p>…` when blank (`index.js:41-43`) | 🟢 | Matches behavior (workspace does not `<br/>`-convert multiline, minor). |
| Behavior after save | Re-renders form + Recent Drafts inline; **stays on dashboard** (`post.php:107-108`) | **Navigates away** to `#/posts/{id}/edit` (`index.js:66`) | 🟡 | Functional divergence — see below. |
| Recent Drafts list (below form) | `wp_dashboard_recent_drafts()`, `author=current_user`, `posts_per_page=4`, orderby modified (`:630-650`) | `core:dashboard-widget-recent-posts` — separate tile; `per_page:5`, **no author filter** (`query.mjs`) | 🟡 | Shows *all* users' drafts, not just the current author's. See divergences. |
| Cross-widget refresh after save | Same screen re-render; trivially consistent | `invalidateResolution('getEntityRecords', ['postType','post', RECENT_DRAFTS_QUERY])` (`index.js:48-52`) | 🟢 | Workspace wires explicit invalidation; query shapes pinned in `query.mjs` to prevent drift. |
| Nonce / security | `add-post` nonce + `check_admin_referer('add-post')` (`:613`, `post.php:81`) | core-data `apiFetch` nonce middleware | 🟢 | Equivalent. |
| Reuses cached auto-draft `post_ID` | `dashboard_quick_press_last_post_id` user option (`:557-578`) | Always creates a fresh draft | 🟡 | Divergence — workspace can orphan auto-drafts; spec §7 deems this acceptable. |

### WordPress Events and News widget

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Nearby events by location | `wp_print_community_events_markup()` (`:1367`); geo via `WP_Community_Events::get_events()` → `wp_remote_get('http://api.wordpress.org/events/1.0/')` (`class-wp-community-events.php:101`), proxied through `admin-ajax.php?action=get_community_events` (`ajax-actions.php:368`) | None | ⛔ | See blockers — admin-ajax + server geo-IP, not REST. |
| Change location (city input) | `community-events-location` user meta via the same ajax action (`ajax-actions.php:408`) | None | ⛔ | User meta not in REST. |
| WordPress news RSS | `wp_dashboard_primary()` (`:1538`) → `wordpress.org/news/feed/` + `planet.wordpress.org/feed/`, server-cached (`wp_dashboard_cached_rss_widget`) | None | ⛔ | RSS fetch+parse is server-side; no REST proxy. |
| Meetups / WordCamps / News footer links | Static external links (`:1322-1357`) | None | 🟡 | Trivially portable as static links; not built. |

### Site Health Status widget

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Pass/fail summary ring + counts | `wp_dashboard_site_health()` (`:1973`) reads transient `health-check-site-status-result` (good/recommended/critical) | None | 🟡 | `core:site-health` is a separate app; dashboard shows no summary. The async tests run via `/wp-site-health/v1/tests/*` REST (feasible to compose); the *cached aggregate transient* itself is not in REST. |

### Plugin widget extensibility (the big one)

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Register a widget | `wp_add_dashboard_widget($id, $name, $callback, …)` — `$callback` echoes arbitrary server HTML (`dashboard.php:188-234`) | `wp_admin_workspaces_register_dashboard_widget($id, $args)` — `$args['script']` registers a **React app** (`class-wp-admin-workspaces-dashboard-widgets.php:83`) | ⛔ | Fundamentally different contract — see blockers. |
| Surface existing plugin widgets (Yoast/Jetpack/WooCommerce) | Automatic — they call `wp_add_dashboard_widget` | **Not surfaced at all** | ⛔ | No bridge ingests `$wp_meta_boxes['dashboard']`. Contrast the classic-menu bridge, which *does* ingest `add_menu_page`. |
| Per-widget configure control | `$control_callback` + `_wp_dashboard_control_callback`, cap `edit_dashboard`, posts via `admin-ajax.php?action=dashboard-widgets` (`:201-234`, `ajax-actions.php:420`) | None | 🔴 | Workspace registry has no control/config concept. |
| Widget placement/size/position | `$context` (`normal`/`side`/`column3`/`column4`) + `$priority` | `slot:'grid'` + `slotHints.{defaultSize,minSize,position}`; per-entry `size`/`position` override (`composeScreenWidgets.mjs:120-137`) | 🟡 | Different model; grid cells vs. column buckets. |
| Hide a registered widget | `remove_meta_box($id, 'dashboard', $context)` | `hidden:true` → cascade `__tombstone` (`class-…-dashboard-widgets.php:228-233`) | 🟢 | Tombstone equivalent works (tested). |

## Functional divergences

Behaviors present in both but implemented differently.

1. **Quick Draft post-save navigation.** Classic re-renders the Quick Draft form + Recent Drafts list *in place* and the user stays on the dashboard (`wp-admin/post.php:107-108` calls `wp_dashboard_quick_press()` then `exit`). The workspace widget calls `navigate('#/posts/{id}/edit')` (`src/apps/dashboard-widget-quick-draft/index.js:66`), ejecting the user into the full block editor. **Consequence:** the workspace's "quick draft" is really a "start a draft then edit it" flow — you cannot fire off several quick drafts in a row from the dashboard, which is the classic widget's primary use case.

2. **Recent Drafts author scope.** Classic `wp_dashboard_recent_drafts()` filters `author => get_current_user_id()` (`dashboard.php:635`) — you see *only your own* drafts. The workspace's `RECENT_DRAFTS_QUERY` (`src/apps/dashboard-widget-recent-posts/query.mjs`) has **no author filter**, so it shows the most recently modified drafts site-wide. **Consequence:** on a multi-author site an editor sees other authors' drafts in their "recent drafts" tile — a privacy/expectation divergence and a behavior change versus classic. (Also: classic shows 3–4 with a "+N more"; the workspace shows up to 5 flat.)

3. **Recent comments scope.** Classic Activity shows the 5 most recent comments of *all* statuses (approved + pending), spam-filtered, with per-row moderation (`dashboard.php:1075-1143`). The workspace's `core:dashboard` comment card shows `status:'hold'` only (`src/apps/dashboard/index.js:54,71`) — pending comments, no approved ones, and no inline actions. **Consequence:** the workspace card is a "pending queue" preview, not an activity log; it omits the "what got published / commented recently" signal entirely. (And this card lives only in the unused `core:dashboard` app — the host shows nothing.)

4. **Two divergent dashboards, one unused.** Classic has a single dashboard. The workspace has `core:dashboard` (rich-ish landing) and `core:dashboard-host` (grid). The default workspace wires only the host (`workspaces/wp-admin-default.json:687-701`), so the stat cards / greeting / draft+comment cards of `core:dashboard` **never render** for a default install. **Consequence:** the more feature-complete of the two implementations is effectively dead; anyone reading `core:dashboard` and assuming it's "the dashboard" is misled. The host is leaner than `core:dashboard` is leaner than wp-admin.

5. **Quick Draft content newline handling.** Classic converts `\n` to `<br/>` inside the paragraph block when wrapping (`wp-admin/post.php:101-104`). The workspace seeds an empty paragraph only when blank and otherwise sends the raw textarea value as `content` (`index.js:41-43`), letting the server treat it as freeform block content. **Consequence:** minor — multiline quick drafts may render as one run-on paragraph rather than line breaks.

## API & platform blockers

The hard parity blockers — what wp-admin does that the workspace cannot do through REST/core-data. Each verified against live 7.0 source.

1. **⛔ [workspace] Third-party dashboard widgets register a PHP render callback that echoes arbitrary HTML — unbridgeable to React, and *not even surfaced*.** `wp_add_dashboard_widget($widget_id, $widget_name, $callback, …)` (`wp-admin/includes/dashboard.php:188-234`) stores a PHP callable that `echo`es server-rendered markup; `wp_dashboard()` runs it via `do_meta_boxes()` (`:271-280`). The workspace kernel renders React app trees, not server HTML strings, so it cannot execute these callbacks. **The workspace substitutes its own React-app registry** (`wp_admin_workspaces_register_dashboard_widget`, `includes/cascade/class-wp-admin-workspaces-dashboard-widgets.php:83`) which is a fine architecture — but **no bridge reads `$GLOBALS['wp_meta_boxes']['dashboard']`** to surface the existing PHP widgets. This is the *opposite* of how the workspace treats menus: the classic-menu bridge ingests every plugin's `add_menu_page()` automatically (`docs/code-map.md`, CLAUDE.md "Classic wp-admin menu bridge"). No equivalent exists for dashboard widgets. **Tag [workspace]** because the gap is closeable on the workspace side via one of two routes — both imperfect: (a) an `iframe:index.php` fallback tile with chrome hidden (renders the *whole* classic dashboard in an iframe; coarse), or (b) a per-widget bridge that captures each registered widget's `$callback` output to an HTML string and ships it to an `iframe`/`dangerouslySetInnerHTML` tile (loses the widget's JS — e.g. WP Events' geo lookup, Site Health's async ring — and is a security surface). **Size of the gap:** very large. The dashboard is one of the most widely extended screens in the ecosystem; a default workspace install shows Yoast/Jetpack/WooCommerce/Akismet dashboard widgets **not at all**. This is the headline parity finding.

2. **⛔ [upstream] At a Glance / Activity counts have no aggregate REST endpoint.** `wp_count_posts()` (`dashboard.php:307`) and `wp_count_comments()` (`:337`) return per-status counts in one call. REST has no equivalent. The documented workaround is `?per_page=1` + read `X-WP-Total` (verified the header is set: `class-wp-rest-posts-controller.php:518`; exposed for CORS at `class-wp-rest-server.php:391`). The workspace uses exactly this (`src/apps/dashboard/index.js:137-152`). **Consequence:** one HTTP round trip *per status per post type* — a 4-status × N-post-type fan-out where classic does one DB query. Tagged [upstream]: a `wp_count_posts`/`wp_count_comments` REST endpoint would fix this for the dashboard, the posts list, and several other screens (cross-cutting, see `dashboard-home.md` §15). Note the workspace does not even fetch approved-comment count or WP version, so it is *under*-using what REST does allow.

3. **⛔ [upstream] WordPress Events (nearby meetups/WordCamps) is admin-ajax + server geo-IP, not REST.** `wp_ajax_get_community_events()` (`wp-admin/includes/ajax-actions.php:368`) checks the `community_events` nonce, resolves the user's location server-side (geo-IP from `$_SERVER` inside `WP_Community_Events`), and proxies to `wp_remote_get('http://api.wordpress.org/events/1.0/')` (`class-wp-community-events.php:101`). **The workspace cannot replicate this:** (a) it's an `admin-ajax` action, not a REST route; (b) geo-IP resolution happens on the server from the request IP — a browser `fetch` to `api.wordpress.org` would geolocate the *user's* IP differently and has no nonce/auth path; (c) the chosen location persists in `community-events-location` user meta, which is **not registered for REST** (verified: no `register_meta` for it). The screen spec's optimistic "CORS allows direct browser fetch" (`dashboard-home.md:377`) understates this — the events *list* might be CORS-fetchable, but the location resolution + persistence are server-only. Tagged [upstream]: needs a REST endpoint wrapping `WP_Community_Events`.

4. **⛔ [upstream] WordPress news RSS is server-fetched + server-cached, no REST proxy.** `wp_dashboard_primary()` (`dashboard.php:1538`) fetches and parses `wordpress.org/news/feed/` + `planet.wordpress.org/feed/` server-side via `wp_dashboard_cached_rss_widget()` (transient-cached). There is no REST endpoint that returns parsed feed items, and a browser cannot reliably fetch+parse arbitrary RSS cross-origin. Tagged [upstream] (or [workspace] if the team accepts an external direct fetch with a client-side XML parser and no caching).

5. **⛔ [upstream] Browser-/PHP-update nags are PHP-only.** `wp_check_browser_version()` (used at `dashboard.php:29`) and `wp_check_php_version()` (`:42`) compute upgrade recommendations server-side (the PHP check hits `api.wordpress.org`, server-cached). Neither result is exposed via REST. **Consequence:** the workspace cannot show the "your browser/PHP is out of date" banners without reimplementing browser detection client-side (possible, lower fidelity) and a new REST surface for the PHP check (impossible client-side). Tagged [upstream] for the PHP nag; the browser nag is [workspace]-reimplementable.

6. **⛔ [upstream] Site Health summary reads a server transient.** `wp_dashboard_site_health()` (`dashboard.php:1973`) reads the `health-check-site-status-result` transient — the cached aggregate of the async tests. While the *individual* async tests are REST-exposed (`/wp-site-health/v1/tests/{name}`, per `dashboard-home.md:71`), the **cached summary score is not** in REST, so the workspace would have to re-run all async tests client-side to compute the ring. Tagged [upstream]: a `/wp-site-health/v1/status-summary` endpoint returning the transient would close it.

7. **⛔ [upstream] Welcome panel dismissal writes `show_welcome_panel` user meta, not in REST.** Classic dismisses via `?welcome=0` (handled in `_index.php`) writing the `show_welcome_panel` user meta. Verified: that meta is **not** `register_meta`'d for REST (no match in source). `dashboard-home.md:103` lists `show_welcome_panel`, `metaboxhidden_dashboard`, `closedpostboxes_dashboard`, `meta-box-order_dashboard`, `screen_layout_dashboard` as **all** non-REST per-user state — only `community-events-location` is registered, and even that isn't `show_in_rest`. **Consequence:** every piece of dashboard per-user customization (welcome dismissal, widget hide, collapse, reorder, column count) is gated behind admin-ajax. Tagged [upstream]: `register_meta(..., show_in_rest:true)` on these keys, or a workspace-side per-user prefs store (the workspace already has a `prefs` REST controller — `includes/*-rest.php` — so the *persistence* is [workspace]-solvable even if the canonical core meta isn't).

8. **🟡 [upstream] Inline comment moderation maps to REST but loses nonce-bound list semantics.** The Activity widget's per-row Approve/Spam/Trash links carry per-comment nonces and `data-wp-lists` directives for inline DOM swaps (`dashboard.php:736-804`). These are *functionally* replicable via `PUT /wp/v2/comments/{id} {status}` and `DELETE` (verified the controller honors `approve`/`hold`/`spam`/`trash`: `class-wp-rest-comments-controller.php:1830-1846`, and `status` is a free-string query param with no enum so `status=hold` lists fine). So this is **not** a hard blocker — it's a missing feature (see matrix). Listed here only to record that the nonce/`data-wp-lists` machinery has no workspace analog and the REST path is the correct substitute.

## DataViews / DataForms review

**N/A — and arguably a missed opportunity.**

Neither dashboard app uses `@wordpress/dataviews` or `DataForm`. Given the dashboard is a fixed read-mostly surface with hard-coded queries (spec §8: "no filter/sort/search"), DataViews would be overkill for the cards/lists — this is the right call. The Quick Draft form is a 2-field form; `DataForm` (`src/apps/_shared/forms/`) could host it, but the hand-rolled `<form>` (`src/apps/dashboard-widget-quick-draft/index.js:78-111`) is reasonable for two fields and matches the "doesn't fit DataForm's flat field model" exceptions the project already carves out (e.g. `settings-general`). One minor note: the recent-comments and recent-drafts lists in `core:dashboard` are hand-rolled `Stack` maps — fine at this scale, no DataViews misuse to flag.

The genuine architectural observation is unrelated to DataViews: the dashboard-host is a *parallel* widget-grid framework (`composeScreenWidgets.mjs` + `MountedApp` tiles) that deliberately forgoes the kernel's `useDynamicChildren` store (documented in `dashboard-host/index.js:20-30`). That's a sound decision for a config-driven grid, but it's why drag-reorder/collapse will require net-new work rather than reusing an existing primitive.

## Recommendations / future work

**P1 — close the credibility gaps (workspace-side, no upstream needed):**

1. **Build the At a Glance + Activity widgets as grid tiles**, and wire them into `wp-admin-default.json`'s `dashboard-home.apps[]`. The data is already proven feasible (`core:dashboard` does the counts; comments/posts queries are trivial). Promote the count logic out of the dead `core:dashboard` into reusable widget apps. *Where:* new `src/apps/dashboard-widget-glance/` + `dashboard-widget-activity/`; register in `builtins.js`; add to the workspace screen. *Why:* the host currently shows two tiles where classic shows six-plus; this is the most visible parity gap a user notices on first login.
2. **Add inline comment moderation to the Activity (recent comments) tile** — Approve/Unapprove/Spam/Trash via `PUT`/`DELETE /wp/v2/comments/{id}`. Reuse the comments app's row-action callbacks (`src/apps/comments/`). *Why:* it's a core dashboard interaction, fully REST-feasible (verified controller support), and currently entirely absent.
3. **Resolve the two-dashboard confusion.** Either wire `core:dashboard` into a workspace, or fold its useful pieces (greeting, stat cards) into the host as widgets and delete the standalone app. *Where:* `workspaces/wp-admin-default.json` + `builtins.js:146`. *Why:* shipping a registered-but-unused richer dashboard is a maintenance trap and misleads readers.
4. **Fix Recent Drafts author scope** — add `author: window.wpAdminWorkspaces.userId` to `RECENT_DRAFTS_QUERY` (`src/apps/dashboard-widget-recent-posts/query.mjs`). *Why:* current behavior leaks other authors' drafts on multi-author sites — a real behavior divergence from classic, not just a cosmetic gap. (Workspace-side one-liner.)

**P2 — surface plugin widgets (the headline blocker):**

5. **Build a classic dashboard-widget bridge.** Mirror the classic-menu bridge: walk `$GLOBALS['wp_meta_boxes']['dashboard']` at a `wp_admin_workspaces_data_plugin` hook, and for each registered widget contribute a grid tile that renders the widget via a chromeless `iframe:index.php#<widget-id>` (or a captured-HTML tile). *Where:* new `includes/cascade/class-wp-admin-workspaces-dashboard-bridge.php` alongside the existing widgets registry. *Why:* without this, a default workspace shows **zero** of the ecosystem's dashboard widgets — the single biggest parity hole. *Tag:* [workspace], but note the iframe approach loses widget JS; a true fix is coarse either way. Document the limitation in `app.md`.
6. **Quick Draft: stay on the dashboard after save** (or make it configurable). Replace `navigate(...)` (`dashboard-widget-quick-draft/index.js:66`) with a reset-form + success-snackbar + invalidate path so consecutive quick drafts work like classic. *Why:* restores the widget's actual purpose. *Tag:* [workspace].

**P3 — interaction layer + remaining widgets (mostly upstream-gated):**

7. **WordPress Events and News tile** — needs an [upstream] REST endpoint wrapping `WP_Community_Events` (geo-IP + location meta) and an RSS-proxy endpoint, OR ship a degraded client-side-fetch version (no geo, no caching) plus the static Meetups/WordCamps/News footer links (those are free). *Why:* full parity is upstream-blocked; partial is workspace-doable.
8. **Site Health summary tile** — either compose the per-test REST endpoints client-side, or request an [upstream] `/wp-site-health/v1/status-summary` returning the cached transient. *Why:* avoids re-running all async tests in the browser.
9. **Screen Options analog** (per-widget show/hide + column count) and **collapse/drag-reorder**, persisted via the workspace's existing `prefs` REST controller rather than the non-REST core meta. *Where:* `dashboard-host/index.js` + a prefs read/write. *Why:* matches classic customization; [workspace]-solvable because the workspace owns its own prefs store even though core's `metaboxhidden_dashboard`/`closedpostboxes_dashboard`/`screen_layout_dashboard` meta are [upstream]-not-in-REST.
10. **Welcome panel + nags** — Welcome panel is static content + one toggle (persist in workspace prefs, [workspace]); browser nag is client-reimplementable ([workspace]); PHP nag needs an [upstream] REST surface for `wp_check_php_version()`. Lowest priority; deprecated-feeling UX per the spec.

**Doc maintenance:** `docs/screens/dashboard-home.md:5,364-366` says "Current workspace coverage: None / `core:dashboard` is not yet registered" — stale; the apps now exist. Update the "Mapping & implementation status" section to reflect `core:dashboard` + the host, and record which is actually wired.
