# Parity Audit — System & Chrome Apps

**App(s):** `core:navigation`, `core:command-palette`, `core:site-hub`, `core:toolbar-actions`, `core:user-menu`, `core:notices-banner`, `core:notices-snackbar`, `core:preview-pane`, `core:iframe-fallback`, `core:settings-workspace`, and the four `core:desktop-*` engine apps (`desktop-compositor`, `desktop-dock-app`, `desktop-iframe`, `desktop-window-frame`).

**wp-admin counterpart:** Cross-cutting **chrome** — the wp-admin **Admin Bar** (`src/wp-includes/class-wp-admin-bar.php` + the default nodes in `src/wp-includes/admin-bar.php`) and **Admin Notices** (`admin_notices` / `all_admin_notices` / `network_admin_notices` / `user_admin_notices` hooks fired in `src/wp-admin/admin-header.php:299-321`). There is **no single wp-admin "screen"** these map to.

---

## Verdict

**Status: minor-gaps** for the chrome category as a whole — but with **two real, ship-affecting gaps** that are *not* shell-native-by-design choices:

1. **Third-party admin-bar nodes are not bridged into the shell.** Every plugin that calls `WP_Admin_Bar::add_node()` via the `admin_bar_menu` hook (WooCommerce cart/account, Jetpack, caching-plugin "Purge cache", SEO "Edit with…", environment switchers, etc.) renders into a real `#wpadminbar` element that the shell's full-viewport React layout **visually covers**. The user cannot reach those actions inside the workspace. This is an **[upstream]-shaped** gap that the shell can only partially close itself.

2. **Plugin `admin_notices` HTML is rendered but visually buried.** Because the workspace renders *through* `admin-header.php` (`includes/class-wp-admin-shell-hijack.php:358`), the `admin_notices` / `all_admin_notices` hooks **do fire** and plugins **do echo** their server-rendered notice `<div>`s into `#wpbody-content` — but those land *outside* the React `core:notices-banner` app (which only reads the JS `core/notices` store), above/behind the 100vw/100vh shell root. They are not surfaced in the shell's notice UI. **[shell]**-closeable in part; full fidelity is **[upstream]**.

Everything else in this category is **at-parity or shell-native-by-design**: the site-hub / toolbar-actions / user-menu trio re-implements the *useful* admin-bar nodes (+New, site name, Howdy/account, search→palette) as first-class React affordances driven by `admin.json`; `command-palette`, `preview-pane`, `iframe-fallback`, `settings-workspace`, and the `desktop-*` apps have **no wp-admin counterpart** and parity is explicitly not a goal.

---

## Per-app table

| App | wp-admin analog | Surfaces it? | Gap |
|---|---|---|---|
| **`core:navigation`** | Admin **Menu** (`#adminmenu`, `wp-admin/menu.php` + `WP_Admin_Bar` site/appearance submenus) | Yes — reads the resolved `menu` tree | **See the dedicated `docs/parity/plugin-menus-and-screens.md`** — not duplicated here. The classic admin-bar's *menu-adjacent* submenus (site-name → Themes/Widgets/Menus/Customize, edit-site, customize) are partly covered by the menu, partly by the gaps below. |
| **`core:command-palette`** | The **command palette** (`wp_admin_bar_command_palette_menu`, `src/wp-includes/admin-bar.php:947`; `@wordpress/commands`) | Yes — contributes commands to `@wordpress/commands`; the package owns the portal UI | **At-parity / shared infra.** WP 7.0's own admin-bar palette node and the shell both feed the same `@wordpress/commands` store. Shell-native command set derived from `config.commands[]` + `config.screens[]`. No gap. |
| **`core:site-hub`** | Admin-bar **WP-logo node** (`wp_admin_bar_wp_menu`, line 125) + **site-name node** (`wp_admin_bar_site_menu`, line 362) | Partial — site icon → dashboard, site title → front-end, palette toggle | **Missing:** the wp-logo About/WordPress.org/Docs/Support/Feedback submenu (line 156-233); the site-name → **Visit Site / Dashboard / Themes / Widgets / Menus / Customize** submenu. **No update/notification badge** (self-documented in `src/apps/site-hub/app.md:33`). No mobile back-arrow variant (`app.md:34`). |
| **`core:toolbar-actions`** | Admin-bar **+New menu** (`wp_admin_bar_new_content_menu`, line 1012) | Partial — only the two hard-coded `COMMAND_HREFS` (`core/new-post` → `#/posts/new`, `core/new-page` → `#/pages/new`) (`src/apps/toolbar-actions/index.js:21-24`) | **Functional divergence + missing feature.** wp-admin's +New is **dynamic**: it enumerates every `show_in_admin_bar` post type (`get_post_types`), plus Media, Link, User, and multisite Site, each cap-gated. The shell renders a **static author-declared list** with a 2-entry command map; CPTs/Media/Link/User/Site never appear unless an admin.json author hard-codes hrefs. No `onClick`-only actions (all resolve to URLs). |
| **`core:user-menu`** | Admin-bar **My-Account / "Howdy" menu** (`wp_admin_bar_my_account_item` line 262 + `wp_admin_bar_my_account_menu` line 302) | Partial — avatar + Profile + Log out + (optional) shell switcher | **Missing:** the account submenu's **Edit Profile** link is present, but wp-admin's "Howdy, {name}" header node, the **My Sites** menu (multisite, `wp_admin_bar_my_sites_menu` line 550), and any third-party account-menu additions are absent. Reads `window.wpAdminShell.user` (no avatar size/2x, no display-name fallback chain beyond `displayName`). |
| **`core:notices-banner`** | `admin_notices` / `all_admin_notices` server-rendered notice HTML | **No** — reads only the JS `core/notices` store (`type: 'default'`) | **Major gap (cross-cutting).** Cannot render PHP-echoed plugin notices (see focused section). Only surfaces notices created via `wp.data.dispatch('core/notices').createNotice()`. |
| **`core:notices-snackbar`** | (no wp-admin analog — transient toast) | Yes — `core/notices` store (`type: 'snackbar'`) | **Shell-native.** wp-admin has no snackbar primitive in classic screens (Gutenberg editor does). No gap; uses legacy `SnackbarList` (no WPDS 0.12 port). |
| **`core:preview-pane`** | (no wp-admin analog) | Yes | **Shell-native by design.** Reads another region's URL slot → `core-data` entity → JSON preview. Spec §6.4. Not a wp-admin concept. |
| **`core:iframe-fallback`** | (no wp-admin analog — it *is* the bridge to classic screens) | Yes | **Shell-native escape hatch.** Mounts any wp-admin URL in a chrome-hidden iframe. This is the parity mechanism for un-rebuilt screens, not a screen itself. |
| **`core:settings-workspace`** | (no wp-admin analog) | Yes | **Shell-native.** A workspace-on/off toggle over `/wp/v2/settings`. The parallel classic **Settings → WP Admin Shell** page (`wp-admin-shell.php`) is the only true wp-admin counterpart, and it writes the same option. No gap. |
| **`core:desktop-compositor`** | (no wp-admin analog) | Yes (headless) | **Shell-native by design.** Engine-owned MDI window manager. No wp-admin counterpart. |
| **`core:desktop-dock-app`** | (no wp-admin analog) | Yes | **Shell-native.** Dock/launcher for the windowed engine. No wp-admin counterpart. |
| **`core:desktop-iframe`** | (no wp-admin analog) | Yes | **Shell-native.** Chromeless-protocol iframe for desktop windows. Forks `iframe-fallback`. No wp-admin counterpart. |
| **`core:desktop-window-frame`** | (no wp-admin analog) | Yes | **Shell-native.** Window titlebar + traffic-light controls + resize handles. No wp-admin counterpart. |

---

## Focused gap #1 — Third-party admin-bar nodes are not bridged

### What wp-admin does

`WP_Admin_Bar` is initialized on `admin_init` (`_wp_admin_bar_init`, `src/wp-includes/default-filters.php:694`) and rendered into `#wpadminbar` at `in_admin_header` priority 0 (`default-filters.php:702` → `wp_admin_bar_render`). The bar's contents come from the **`admin_bar_menu` action**, to which core adds its default nodes with explicit priorities (`src/wp-includes/class-wp-admin-bar.php:648-674`, `add_menus()`):

- `wp_admin_bar_my_account_menu` (0), `wp_admin_bar_wp_menu` (10), `wp_admin_bar_my_sites_menu` (20), `wp_admin_bar_site_menu` (30), `wp_admin_bar_edit_site_menu`/`customize_menu` (40), `wp_admin_bar_updates_menu` (50), `wp_admin_bar_command_palette_menu` (55), `wp_admin_bar_comments_menu` (60), `wp_admin_bar_new_content_menu` (70), `wp_admin_bar_edit_menu` (80).

**Third-party plugins extend the bar by hooking `admin_bar_menu` and calling `$wp_admin_bar->add_node()`.** This is *the* documented extension point (e.g. WooCommerce, Jetpack, WP Super Cache "Delete Cache", Query Monitor's entire menu, Yoast "SEO" node, multilingual switchers). There is no REST surface that enumerates the assembled node tree — it is built per-request in PHP from a `do_action` and rendered straight to HTML.

### What the shell does

When the workspace is active, the hijack renders the React root **inside `admin-header.php`** (`includes/class-wp-admin-shell-hijack.php:358-360`):

```php
require_once ABSPATH . 'wp-admin/admin-header.php';
echo '<div id="wp-admin-shell"></div>';
require_once ABSPATH . 'wp-admin/admin-footer.php';
```

Consequences:

- `is_admin_bar_showing()` is true in admin (`src/wp-includes/admin-bar.php:1423`), so `wp_admin_bar_render` **runs** and `#wpadminbar` — **including every third-party node** — is emitted into the DOM.
- But the engine layout root `.wp-admin-shell-layout` is `height: 100vh; width: 100vw; overflow: hidden` (`src/runtime/engines/core-default/index.css:21-27`), mounted inside `#wpbody-content`. It **visually covers** the admin bar. The nodes exist in the a11y/DOM tree but are not reachable in the workspace UI.
- The shell ships **no admin-bar bridge.** The only `admin_bar_menu` hook the plugin registers is the classic-mode toggle node (`includes/class-wp-admin-shell-classic-mode.php:46,124`) — and that node is added to the *classic* bar (it only shows the "Classic wp-admin" / "↩ Back to workspace" link). There is no code that reads `$GLOBALS['wp_admin_bar']->get_nodes()` and feeds them into `core:toolbar-actions` / `core:user-menu` / the menu.
- Confirmed by repo-wide search: the only `WP_Admin_Bar` references are the classic-mode toggle and a doc note (`grep admin_bar includes/ src/` → `class-wp-admin-shell-classic-mode.php` only).

Note the contrast with the **classic-menu bridge** (`includes/cascade/class-wp-admin-shell-classic-menu-bridge.php`), which *does* ingest third-party `add_menu_page()`/`add_submenu_page()` registrations into the shell menu. There is **no analogous bridge for `admin_bar_menu`**.

### Gap classification

- **Type 3 — API blocker, tagged [shell] (partial) + [upstream] (full).**
  - The node tree is server-side state assembled from a `do_action('admin_bar_menu', $wp_admin_bar)`. There is **no REST endpoint** that returns the assembled `WP_Admin_Bar` node tree. **[upstream]** to expose one.
  - However, the shell *renders through `admin-header.php`*, so `$GLOBALS['wp_admin_bar']` **is fully populated in PHP at render time.** The shell could walk `$wp_admin_bar->get_nodes()` server-side and serialize the node tree (id / title / href / parent / meta) into the inline config the way it already serializes `adminRoutes` and `capabilities`. That makes it **[shell]-closeable** without any core change — a "third-party admin-bar bridge" mirroring the classic-menu bridge.
  - Caveat (genuinely **[upstream]**/lossy): node `title` is **arbitrary HTML** (icons, count bubbles, `<span class="ab-icon">`), `meta` carries `onclick` JS handlers (`class-wp-admin-bar.php:581-598`), and some nodes render via `meta['html']`. A faithful bridge can surface label+href cleanly but cannot replicate `onclick`-driven nodes (e.g. a cache-purge that POSTs via inline JS) or live-updating count bubbles without per-plugin knowledge. Self-documented precedent: `core:toolbar-actions` "has no `onClick`-only callback action" (`app.json` `no-onclick-actions` constraint).

### Impact

Any site relying on admin-bar actions from plugins (cache purge, environment badge, "Edit in {builder}", Jetpack stats shortcut, WooCommerce store-status, multisite My-Sites) loses those affordances in the workspace. For multisite specifically, **My Sites** (`wp_admin_bar_my_sites_menu`) is entirely absent — and network admin is an explicit alpha non-goal (`includes/class-wp-admin-shell-hijack.php:185`).

---

## Focused gap #2 — Plugin `admin_notices` HTML is not surfaced

### What wp-admin does

`admin-header.php` fires four notice hooks inside `#wpbody-content` (`src/wp-admin/admin-header.php:293-321`):

```php
do_action( 'network_admin_notices' );  // network admin
do_action( 'user_admin_notices' );     // user admin
do_action( 'admin_notices' );          // site admin
do_action( 'all_admin_notices' );      // all contexts
```

Plugins hook these and **`echo` server-rendered HTML** (`<div class="notice notice-success is-dismissible">…</div>`). This is how the overwhelming majority of plugins (and core itself — update nags, "Settings saved", PHP-version warnings, license reminders, setup wizards) communicate. The dismiss behavior for `is-dismissible` notices is wp-admin JS (`common.js`) posting to `admin-ajax.php` (`wp_ajax_dismiss-wp-pointer` and per-plugin AJAX dismiss handlers); persistence is per-plugin (user meta / options).

### What the shell does

- `core:notices-banner` reads **only** the `@wordpress/notices` JS store, filtered to `type: 'default'` (`src/apps/notices-banner/index.js:24-30`). `core:notices-snackbar` reads the same store, `type: 'snackbar'`.
- Because the workspace renders through `admin-header.php`, the four notice hooks **do fire** and plugin notice HTML **is echoed** into `#wpbody-content` — i.e. into the DOM *above/around* `<div id="wp-admin-shell">` but **outside** the React tree. The `core:notices-banner` app never sees them (they were never in the `core/notices` store). With the 100vh/100vw shell root, that PHP-echoed HTML is either visually buried behind the shell or shoves the shell root down in normal flow — either way it is not integrated into the workspace's notice UI.
- Repo search confirms **no DOM-scrape / no hook capture**: the only `admin_notices` reference in the plugin is a comment explaining the Gutenberg-missing fallback (`includes/class-wp-admin-shell-hijack.php:104`).

### Gap classification

- **Type 3 — API blocker, tagged [upstream] (full) + [shell] (partial).**
  - Server-rendered notice HTML is produced by a `do_action` + `echo`. There is **no REST endpoint** and **no data structure** for "pending admin notices" — they are ephemeral echoed strings. **[upstream]** to model admin notices as data (a long-standing core gap; the closest is the unrelated `admin_notices` → block-based notices proposals).
  - **[shell]-partial:** since the shell renders through `admin-header.php`, it *could* buffer the `admin_notices`/`all_admin_notices` output (e.g. `ob_start()` around the hook, or render the hooks into a hidden container and relocate that node into the React notice region). That surfaces the HTML but: (a) it's raw HTML of unknown trust/markup, (b) dismiss buttons wired to `admin-ajax.php` + wp-admin `common.js` need that JS present and the `.notice` DOM structure intact, (c) styling assumes the classic `.notice` stylesheet. A clean bridge is non-trivial and lossy.

### Impact

The single most common plugin↔user communication channel in WordPress is invisible in the workspace. "Settings saved", update-required nags, license/activation banners, plugin onboarding callouts, security warnings — none appear in `core:notices-banner`. Only apps explicitly ported to dispatch `core/notices` (the shell's own settings/CRUD apps) produce in-shell notices. This is arguably the **highest-impact parity gap in the entire chrome category** because it silently breaks the feedback loop for every un-ported plugin.

---

## Other notes (lower priority)

- **+New is static, not dynamic (`core:toolbar-actions`).** wp-admin's +New enumerates post types at runtime (`wp_admin_bar_new_content_menu`, `admin-bar.php:1015-1051`); the shell's toolbar renders an author-declared list with a 2-entry `COMMAND_HREFS` map (`index.js:21-24`). **Type 2 (missing feature, [shell]-closeable):** the data is fully REST-available (`GET /wp/v2/types?context=edit` exposes post types + create caps via `canUser`), so a dynamic +New is buildable today without core changes. Currently the burden is on the admin.json author to hand-list CPTs.
- **At-a-Glance / updates / comments admin-bar count bubbles.** wp-admin shows a moderation count on the comments node (`wp_admin_bar_comments_menu`, `admin-bar.php:1107-1117`) and an update count on the updates node (`wp_admin_bar_updates_menu`, line 1216). The shell surfaces no equivalent live badges in chrome (the site-hub `app.md:33` explicitly notes the missing update badge). **Type 2 (missing feature, [shell]):** comment-moderation count is REST-derivable (`GET /wp/v2/comments?status=hold` → `X-WP-Total` header); update counts are partly REST-exposed (`/wp/v2/plugins`, theme updates) but the aggregate "X updates" nag historically depends on `wp_get_update_data()` (server-only transient aggregation) — that aggregate is **[upstream]**-ish, though per-type counts can be assembled client-side.
- **User-menu has no avatar 2x / display-name fallback chain.** Reads `window.wpAdminShell.user.displayName` only (`src/apps/user-menu/index.js:21`); wp-admin's account node builds "Howdy, {display_name}" + avatar via `get_avatar` with size negotiation. Cosmetic; **Type 1 (divergence)**.
- **`core:preview-pane` renders raw JSON, not a rendered preview.** `src/apps/preview-pane/index.js:63-76` dumps `JSON.stringify(record)` for non-post entities and a JSON config for unmatched shapes. This is a deliberate MVP per the file header (spec §6.4 / V2.M4). Not a wp-admin parity item (no analog) — flagged only so it's not mistaken for a finished preview surface.
- **`core:command-palette` parity is actually favorable.** WP 7.0 ships its own admin-bar command-palette node (`wp_admin_bar_command_palette_menu`, `admin-bar.php:947`) feeding `@wordpress/commands`; the shell feeds the *same* store, so the two compose rather than conflict.

---

## Recommendations

1. **[shell] Build an admin-bar bridge mirroring the classic-menu bridge.** Walk `$GLOBALS['wp_admin_bar']->get_nodes()` at render time (it's populated because the shell renders through `admin-header.php`) and serialize label/href/parent/meta into the inline config, then surface third-party nodes in `core:toolbar-actions` (or a dedicated chrome region). Accept the documented loss of `onclick`-JS nodes + live count bubbles. This closes the largest *actionability* gap without any core change. Precedent: `includes/cascade/class-wp-admin-shell-classic-menu-bridge.php`.
2. **[shell] Surface plugin `admin_notices` in `core:notices-banner`.** Buffer the `admin_notices` + `all_admin_notices` hook output (the hooks already fire in `admin-header.php`) and relocate/parse it into the React notice region, or render the hooks into a contained DOM node the shell hoists. Preserve the `.notice` markup + `common.js` so `is-dismissible` AJAX dismiss keeps working. This restores the single most common plugin↔user channel. **Highest priority** — its absence silently breaks feedback for every un-ported plugin.
3. **[upstream] File two core REST asks:** (a) an endpoint that returns the assembled `WP_Admin_Bar` node tree as data (no equivalent exists), and (b) a data model for pending admin notices (the `do_action`+`echo` design makes notices un-fetchable). Both would let *any* alternative admin (not just this shell) integrate chrome faithfully. Tag in `docs/feedback.md`.
4. **[shell] Make `core:toolbar-actions` +New dynamic** from `GET /wp/v2/types?context=edit` (+ create-cap gating via `canUser`) instead of the static 2-entry `COMMAND_HREFS` map, so CPTs/Media/Users surface automatically — matching wp-admin's runtime enumeration.
5. **[shell] Add comment-moderation + update count badges** to the chrome (comments count from `GET /wp/v2/comments?status=hold` `X-WP-Total`; updates from `/wp/v2/plugins` + theme endpoints), restoring the admin-bar bubbles the site-hub app.md flags as missing.
6. **No action needed** for `command-palette`, `notices-snackbar`, `preview-pane`, `iframe-fallback`, `settings-workspace`, and the four `desktop-*` apps — confirmed shell-native with no wp-admin counterpart; parity is not a goal.
