# Parity audit: plugin-registered menus & screens

**App / area:** cross-cutting — plugin admin UI ingestion (the classic-menu bridge + iframe-fallback + programmatic extension points)
**Classic counterpart:** `add_menu_page()` / `add_submenu_page()` (and the ten `add_*_page()` wrappers) → `$GLOBALS['menu']` / `$GLOBALS['submenu']` → `wp-admin/menu.php` assembly → `admin.php?page=<slug>` dispatch.
**Verdict:** **minor-gaps.** Third-party plugin UI *does* surface in the workspace, reliably, via auto-ingestion + a same-origin iframe that preserves the plugin's native HTML / JS / CSS / nonces / form posts. The gaps are at the edges — ordering fidelity, icon harvesting, screen-options/help-tab affordances, and the admin-bar / `admin_notices` surfaces — not in the core "does my page show up and work" contract.

---

## PART 1 — How wp-admin does it (WP 7.0, `/Users/davidbowman/Github/wordpress-develop`)

### 1.1 Registration APIs

`add_menu_page( $page_title, $menu_title, $capability, $menu_slug, $callback, $icon_url, $position )` — `src/wp-admin/includes/plugin.php:1391`. It:
- runs `$menu_slug = plugin_basename( $menu_slug )` (1394),
- stores `$admin_page_hooks[ $menu_slug ] = sanitize_title( $menu_title )` (1396),
- computes `$hookname = get_plugin_page_hookname( $menu_slug, '' )` → `toplevel_page_<slug>` (1398, def at `plugin.php:2139`),
- wires the callback: `if ( ! empty($callback) && ! empty($hookname) && current_user_can($capability) ) add_action( $hookname, $callback )` (1400),
- pushes a **6-element positional array** `array( $menu_title, $capability, $menu_slug, $page_title, 'menu-top '.$icon_class.$hookname, $hookname, $icon_url )` onto `$menu` (1412),
- handles `$position` collision with a deterministic `md5`-derived fractional offset (1430),
- returns the **`$hookname`** (1451) — this is the value plugins capture to hang `load-<hook>` / `admin_print_scripts-<hook>` / `add_screen_option` / `add_help_tab` on.

`add_submenu_page( $parent_slug, $page_title, $menu_title, $capability, $menu_slug, $callback, $position )` — `plugin.php:1486`. It:
- `plugin_basename`s both slugs (1490),
- **returns `false` early if `! current_user_can( $capability )`** and records `$_wp_submenu_nopriv[$parent][$slug] = true` (1497) — capability gating is per-item and happens at registration,
- the **first-submenu-equals-parent quirk** (1508): when a parent has no submenu yet AND the new child slug ≠ the parent slug, WP auto-prepends a synthetic submenu row pointing back at the parent (`array_slice($parent_menu, 0, 4)`), so the parent's top-level click target becomes its first child,
- inserts at `$position` (or appends) and `ksort()`s (1531-1556),
- returns `$hookname` (`<parenttype>_page_<slug>`, e.g. `settings_page_<slug>`) (1576).

The ten wrappers are all thin `add_submenu_page()` calls with a fixed parent (`plugin.php:1599-1846`):
| Wrapper | Parent slug |
|---|---|
| `add_management_page` | `tools.php` |
| `add_options_page` | `options-general.php` |
| `add_theme_page` | `themes.php` |
| `add_plugins_page` | `plugins.php` |
| `add_users_page` | `users.php` (or `profile.php` if `! edit_users`) |
| `add_dashboard_page` | `index.php` |
| `add_posts_page` | `edit.php` |
| `add_media_page` | `upload.php` |
| `add_pages_page` | `edit.php?post_type=page` |
| `add_comments_page` | `edit-comments.php` |
| `add_links_page` | `link-manager.php` |

### 1.2 Global data structures & menu assembly

`$GLOBALS['menu']`, `$GLOBALS['submenu']`, `$GLOBALS['_parent_pages']`, `$GLOBALS['_registered_pages']`, `$GLOBALS['admin_page_hooks']` are populated by the registration calls and consumed in `src/wp-admin/menu.php` + `src/wp-admin/includes/menu.php`:
- The static core menu is laid out in `wp-admin/menu.php` (Dashboard at `$menu[2]`, etc. — `menu.php:29`).
- `do_action('admin_menu')` fires (`includes/menu.php:168`) — this is where plugins' `add_menu_page()` calls land.
- **Capability prune** of submenus (`includes/menu.php:87-100`) then top-level (`includes/menu.php:175-200`).
- **Re-parent on inaccessible parent** (`includes/menu.php:107-136`): if the user can't see the original parent, the first accessible submenu becomes the new parent.
- **First-submenu-equals-parent collapse** (`includes/menu.php:184-191`): if a parent has exactly one submenu with the same destination, the submenu is dropped (so it renders as a plain top-level link).
- **Ordering:** `uksort( $menu, 'strnatcasecmp' )` (`includes/menu.php:280`) is the default — the numeric `$position` keys drive natural sort. Then the `custom_menu_order` / `menu_order` filters (`includes/menu.php:291-345`) allow full reordering when a plugin opts in via `add_filter('custom_menu_order','__return_true')`.
- **Separators** are `$menu` rows with class `wp-menu-separator` and a synthetic `separatorN` slug; adjacent separators are collapsed and a trailing separator dropped (`includes/menu.php:347-373`).
- **Access denial:** `if ( ! user_can_access_admin_page() ) wp_die(403)` (`includes/menu.php:375`).
- Network admin is an entirely separate structure built from `wp-admin/network/menu.php` (`admin.php:158-159`).

### 1.3 Rendering a plugin page

`admin.php?page=<slug>` dispatch — `src/wp-admin/admin.php:141-304`:
- `$plugin_page = plugin_basename( wp_unslash( $_GET['page'] ) )` (142),
- `$page_hook = get_plugin_page_hook( $plugin_page, $the_parent )` (189),
- `$hook_suffix = $page_hook` (210),
- `set_current_screen()` (217),
- fires `do_action( "load-{$page_hook}" )` (242),
- `require_once admin-header.php` (244) — which fires `do_action( 'admin_enqueue_scripts', $hook_suffix )` (`admin-header.php:123`), `admin_print_styles-{$hook_suffix}` (130), `admin_print_scripts-{$hook_suffix}` (144),
- fires `do_action( $page_hook )` (264) — **this is the registered callback, which `echo`es arbitrary server HTML**,
- `require_once admin-footer.php`, then `exit` (302-304).

So a plugin page is: a `$hook_suffix`-keyed asset-enqueue chain + a callback that echoes HTML. `add_screen_option()` and `WP_Screen->add_help_tab()` hang off `load-<hook>` and render into the `#screen-meta` flyout that `admin-header.php` prints.

### 1.4 Settings-API pages

`add_options_page()` + `add_settings_section()` + `add_settings_field()` + `register_setting()`. The callback renders `<form method="post" action="options.php">` + `settings_fields($group)` (prints the nonce + `option_page` hidden input) + `do_settings_sections($page)` (`includes/template.php:1766`). The POST goes to **`wp-admin/options.php`**, which:
- reads `$option_page = $_REQUEST['option_page']` (`options.php:27`),
- `check_admin_referer( "$option_page-options" )` — nonce (`options.php:246`),
- validates each posted key against `$allowed_options[$option_page]` (built from `register_setting` registrations via the `allowed_options` filter),
- saves, sets a `settings_errors` transient (`options.php:371`), and `wp_redirect( add_query_arg('settings-updated','true', wp_get_referer()) )` (`options.php:374-375`).

Crucially: `register_setting()`'s `show_in_rest` arg **defaults to `false`** (`src/wp-includes/option.php:2994` default array, `show_in_rest => false`). A plugin option is invisible to `wp/v2/settings` unless the plugin explicitly opts in — see API-blocker #1 below.

### 1.5 Icons & capability

Icon (`add_menu_page` param 6) is one of: a Dashicons class (`dashicons-chart-pie`), an absolute image URL, the literal `'none'` (CSS-only), or a `data:image/svg+xml;base64,…` URI that WP recolors to match the admin scheme (`plugin.php:1383-1387`). Empty → `dashicons-admin-generic` default (1405). Capability is param 3, enforced both at menu-render (`includes/menu.php`) and expected to be re-checked inside the callback.

---

## PART 2 — How the WP Admin Shell does it (`/Users/davidbowman/Github/WordPress-Admin-Environment`)

### 2.1 The classic-menu bridge (auto-ingestion)

`includes/cascade/class-wp-admin-workspaces-classic-menu-bridge.php`. It hooks `wp_admin_workspaces_data_plugin` at **priority 6** (`:781`) — after the menu-items/admin-routes/dashboard-widgets shims (priority 5) so an explicit registration wins on id collision.

`scan()` (`:178`) walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` (memoized by a serialized-signature cache, `:184-195`) and:
- **skips separators** (`wp-menu-separator` in class index 4, `:224-227`),
- **skips core slugs** via `is_core_slug()` (`:373`) — a static `$CORE_SLUGS` list (`:105-143`) covering every default top-level entry + common submenu scripts + `edit.php?post_type=<post|page|attachment>`, extensible via the `wp_admin_workspaces_classic_menu_core_slugs` filter (`:316`),
- reads `label` (entry[0], stripped of update-bubble `<span>`s by `strip_label()`, `:724`), `capability` (entry[1], default `read`, `:233`), `icon` (entry[6] via `map_icon()`, `:234`),
- derives a screen id `ingested-<slugified>` (`:430`) and a path `/admin/<slugified>` (`:400`, with a `$CORE_PATH_MAP` short-circuit `:75` and an `admin.php?page=` prefix strip).

It synthesizes two cascade additions per record in `contribute()` (`:497`):
1. **Genuine third-party top-level menus** (e.g. Gutenberg, WooCommerce, Yoast): a `screens[ingested-<slug>]` pointing at `iframe:<admin-url>` (`:559-571`) **as a sibling of the shell's own top-level screens** (NOT under the container), plus a bare `menu[ingested-<slug>]` entry (`bind_screens` fills label/icon/href later).
2. **Submenus parented to a CORE slug** the shell doesn't mirror (e.g. a plugin adding a page under `tools.php`): grouped under a shared **`menu.ingested`** container (label "Plugins", icon `plugins`, position 200 — `ensure_container()` `:598`), with a hidden stub parent screen + children synthesized by `synthesize_child()` (`:623`).

`synthesize_child()` (`:623`) routes **external `http(s)://` slugs** (Gutenberg's Support/Docs links) to anchor menu items (`href` + `external: true`), and everything else to an `iframe:<admin-url>`-backed screen.

`admin_url_for_slug()` (`:680`) mirrors core's `menu_page_url()`: a slug containing `.php` is a direct file (query string kept); anything else becomes `admin.php?page=<slug>`. This is what makes `iframe:` resolve to a *loadable* URL.

`map_icon()` (`:461`): `dashicons-foo` → `foo` (engine icon registry resolves it); `none` / `div` / `data:` / bare path → `null` → caller falls back to the literal `'menu'` icon.

A cache-invalidation signal hashes the scan output (`:797-812`) so a plugin (de)activation that changes the menu shape picks a fresh resolver cache bucket cross-request.

### 2.2 How an ingested screen renders

The ingested screen's `app` is `iframe:<url>`. That shorthand is rewritten to `core:iframe-fallback` + `config.url = <url>` in three places: the route synthesizer (`src/runtime/compile/synthesizeRoutes.mjs:57` → `translateIframeRef.mjs:15`), and the runtime mount catch-all (`src/runtime/regions/mountApp.js:341` and `:361`).

`src/apps/iframe-fallback/index.js` renders `<iframe src={adminUrl + config.url}>` (`:34-37`), and on `load` injects `CHROME_HIDE_CSS` (`src/apps/_shared/iframe/chromeHide.mjs:16`) into the iframe document to hide `#adminmenuwrap`, `#wpadminbar`, `#wpfooter`, content margins (`:144-150`). Same-origin (the wp-admin case) succeeds; cross-origin silently reveals chrome (`:114-119`). It also: keeps the iframe hidden behind a Spinner until the chrome-hide CSS is in (`:42`, `:178-188`); detects an in-iframe `wp-login.php` (session expiry) and forces a heartbeat poll so the shell's auth modal pops (`:126-142`); reloads on re-auth (`:81-107`); and installs `installIframeBridge` (`:56-74`) so in-iframe `target=_parent`/`_top` clicks route up.

### 2.3 The hijack & legacy redirect

`includes/class-wp-admin-workspaces-hijack.php` takes over the admin root at `admin_init` priority 0 (`:62`). Critically for plugin pages, `is_root_entry()` (`:151`) returns **false when `$_GET['page']` or `$_GET['action']` is set** (`:158`) — so `admin.php?page=<plugin-slug>` is **never** hijacked into the workspace render; it falls through to classic `admin.php` dispatch (§1.3). That is exactly what lets the iframe load the plugin's native page.

`passes_base_gates()` (`:89`) bails on `wp_admin_workspaces_is_chromeless_request()` (`:123`) — so a same-origin iframe load of a plugin page (which the browser tags `Sec-Fetch-Dest: iframe`) never re-enters the workspace → no nested-shell recursion.

`maybe_redirect_legacy()` (`:214`) redirects mapped *classic core* screens into the workspace, but **explicitly skips `?page=` plugin pages** (`:233`) and any `_wpnonce`'d action (`:233`, `:263`). So deep-linking `admin.php?page=woocommerce` in classic does **not** bounce to the workspace — only screens that declare `legacy_path` round-trip, and ingested plugin screens don't declare one.

### 2.4 The chromeless bridge (desktop-engine-only, but body-class is universal)

`includes/engines/core-desktop/bootstrap.php` loads unconditionally (`wp-admin-workspaces.php:138`). `wp_admin_workspaces_is_chromeless_request()` (`bootstrap.php:39`) returns true on `?wp_admin_workspaces_chromeless=1` OR `Sec-Fetch-Site: same-origin` + `Sec-Fetch-Dest: iframe`. It:
- adds a `wp-admin-workspaces-chromeless` body class for **any** chromeless request regardless of active engine (`bootstrap.php:58-63`),
- emits the 14-subsystem `chromeless-bridge.php` JS at `admin_footer` priority 1000 (`bootstrap.php:69`) — error/network observability, link interception, auth recovery, **and sub-system 12 screen-meta detection** (`chromeless-bridge.php:624`) which *detects* Screen Options / Help panels and posts them up, **but only `core:desktop-iframe`'s parent-side listener consumes them**. Under `core:default` the iframe-fallback app does not subscribe, so the detection is inert.

**Important nuance:** under the default engine, the iframe-fallback does NOT append `?wp_admin_workspaces_chromeless=1` (`index.js:37` just does `adminUrl + rawUrl`). Chrome-hiding there is the JS CSS injection, not the PHP bridge. But because the bridge detects via `Sec-Fetch-Dest: iframe` too, a default-engine iframe of a plugin page *will* still get the `wp-admin-workspaces-chromeless` body class and the bridge JS injected — harmless observability, no behavior change.

### 2.5 Programmatic extension points (the "do it deliberately" path)

| # | Surface | Entry |
|---|---|---|
| 3 | Register a first-class React app | `wp_admin_workspaces_register_app()` (`wp-admin-workspaces.php:151`) → `WP_Admin_Workspaces_Manifest_Registry` |
| 10 | Register a nav menu item | `wp_admin_workspaces_register_menu_item($id,$args)` (`wp-admin-workspaces.php:250`) → `WP_Admin_Workspaces_Menu_Items::register` (`class-wp-admin-workspaces-menu-items.php:89`); `to`/`label`/`icon`/`badge`/`parent`/`position`; id matching a screen auto-binds label/icon/permissions via `bind_screens()` (`:396`) |
| 11 | Register a URL route | `wp_admin_workspaces_register_admin_route($path,$args)` (`wp-admin-workspaces.php:276`) → `WP_Admin_Workspaces_Admin_Routes::register` (`class-wp-admin-workspaces-admin-routes.php:55`); `app`/`config`/`static_data`/`legacy_path` |
| 15 | Register a menu renderer | `wp_admin_workspaces_register_menu_renderer()` (`wp-admin-workspaces.php:200`) |

A plugin that wants **native** (non-iframe) shell UI registers an `app.json` (#3) + a menu item (#10) + a route (#11) pointing the route at its app id. A plugin that does nothing gets **auto-ingested** as an iframe (§2.1). Both paths flow through the same cascade + 4-layer capability gate.

**Timing caveat (documented):** registrations must land before the cascade resolver's first memoized run — `init` priority ≤ 9 or `plugins_loaded` (`wp-admin-workspaces.php:233-244`, `:266-271`). A registration after first resolve misses the current request; the cache-signal filters (`menu-items.php:666`, `admin-routes.php:259`, `classic-menu-bridge.php:797`) handle cross-request invalidation but not same-request late registration.

---

## PART 3 — Feature matrix & reliability analysis

### 3.1 Feature matrix

| wp-admin plugin-UI mechanism | Surfaced in shell? | How | What breaks / caveat |
|---|---|---|---|
| **Top-level menu** (`add_menu_page`) | ✅ Yes | Auto-ingested as a top-level `screens[ingested-*]` + `menu[ingested-*]` sibling (`classic-menu-bridge.php:559`) | Position is **not** carried — see ordering below |
| **Submenu under a plugin parent** (`add_submenu_page`, plugin parent) | ✅ Yes | Nested under the parent's ingested screen in `menu[].items` (`classic-menu-bridge.php:576-585`) | First-submenu-equals-parent quirk not reproduced (below) |
| **Submenu under a CORE parent** (e.g. `add_management_page`, `add_options_page` from a 3rd-party plugin) | ✅ Yes | Grouped under the shared `menu.ingested` "Plugins" container with a hidden stub parent (`classic-menu-bridge.php:516-551`) | Lands under "Plugins", **not** under the original Tools/Settings menu — placement diverges |
| **Menu icon** — Dashicon | ⚠️ Partial | `dashicons-foo` → `foo`, resolved by the engine icon registry (`map_icon` `:468`) | Only works if the engine's icon table has that name; unknown → generic `menu` fallback |
| **Menu icon** — `data:` SVG / image URL | ❌ No | `map_icon` returns `null` → `'menu'` fallback (`:476-481`) | Custom-branded plugin icons (WooCommerce, Yoast use SVG/PNG) all render as the generic icon. **Explicitly out-of-scope today** (`:46`) |
| **Position / order** (`$position`) | ❌ No | Bridge does not read entry numeric key or position (`scan()` `:213-253` ignores the `$menu` array key) | Ingested items sort by registration/iteration order + the container's fixed `position:200`, not the plugin's requested slot |
| **`custom_menu_order` / `menu_order` filter** | ❌ No | Bridge reads `$GLOBALS['menu']` *as populated by `admin_menu`*, but the `menu_order` sort runs later in `wp-admin/menu.php` which the bridge request never executes | A plugin's custom ordering is lost; shell menu order = admin.json/cascade order |
| **Per-item capability** | ✅ Yes | `capability` → `screens[].permissions.capabilities[]` (`:567`, `:644`); 4-layer cap gate + nav prune apply | Faithful. (Note: bridge reads entry[1] verbatim; the OR-semantic trust-tier model then governs.) |
| **Page callback HTML** (`echo`'d server markup) | ✅ Yes — **native** | The page is loaded as a real `admin.php?page=<slug>` request **inside the iframe** (`iframe-fallback/index.js:37`); the callback echoes its HTML natively | Renders inside an iframe, not "native React." Visual seam at the card edge; double scroll possible |
| **`admin_enqueue_scripts-$hook` / `admin_print_scripts-$hook` assets** | ✅ Yes | The iframe request IS a real admin request with the correct `$hook_suffix` (`admin.php:208-215` → `admin-header.php:123`) — the plugin's `$hook`-keyed CSS/JS enqueue fires natively inside the iframe | Faithful — this is the big win of the iframe approach |
| **`add_screen_option`** (per-page Screen Options) | ⚠️ Detected, not surfaced (default engine) | Bridge sub-system 12 detects the panel and posts it up (`chromeless-bridge.php:624`); only `core:desktop-iframe` consumes it. The panel itself still works *inside* the iframe if the user could reach the `#screen-meta` toggle — but the chrome-hide CSS hides `#wpadminbar`/menu, not `#screen-meta-links`, so the toggle is actually still present in the iframe body | Under `core:default`: the Screen Options/Help flyout renders inside the iframe (functional) but the shell provides no titlebar affordance for it. Under `core:desktop`: a titlebar control is wired |
| **Contextual Help tabs** (`add_help_tab`) | ⚠️ Same as Screen Options | Same `#screen-meta` mechanism; same detection-only treatment | Functional inside iframe, no shell-level affordance under default engine |
| **Settings-API page** (`add_options_page` + `register_setting`) | ✅ Yes — **native round-trip** | Page renders in iframe; `<form action="options.php">` POST is same-origin → `options.php` nonce-checks (`options.php:246`), saves, redirects to `wp_get_referer()+settings-updated` (`:374`) back inside the iframe | Fully works. NOT a native React form — see API-blocker #1 for why a React rebuild is impossible without plugin opt-in |
| **Admin-bar node** (`admin_bar_menu`) | ❌ No | The shell renders its own toolbar/`core:site-hub`; it does **not** mirror `$wp_admin_bar`. Only the shell's own classic-mode toggle node exists (`class-wp-admin-workspaces-classic-mode.php:124`) | A plugin's admin-bar entry (e.g. a cache-purge button, "Edit in Elementor") is invisible in the workspace. **[shell]** gap |
| **`admin_notices` echo** | ⚠️ Iframe-local only | A plugin's `admin_notices` callback echoes into the iframe document body, so it shows *inside* the iframed page. It does NOT bridge to the shell's `core:notices-banner` / snackbar | Notices on the dashboard / a native shell screen (where there's no iframe) never fire — the plugin's `admin_notices` hook only runs on classic page loads, and the workspace dashboard is a React render, not a classic `index.php` load |
| **Dashboard widget** (`wp_add_dashboard_widget`) | ✅ Yes — **harvested** (#134) | `WP_Admin_Workspaces_Dashboard_Bridge` runs `wp_dashboard_setup()` (forcing the `dashboard` screen so `add_meta_box` files boxes correctly), walks `$wp_meta_boxes['dashboard']`, skips the core widgets the shell ships native, and synthesizes a `core:dashboard-widget-classic` tile per surviving plugin widget. The tile lazily fetches the widget's `ob_start`-captured HTML from `GET /wp-admin-workspaces/v1/dashboard-widget/{id}`. The shell `wp_admin_workspaces_register_dashboard_widget()` API still exists for first-class native tiles. | A plugin's classic dashboard widget now surfaces on the shell dashboard automatically (captured HTML, admin trust). Limitation: JS-driven widgets degrade to static HTML; per-tile "Open classic dashboard" iframe is the fidelity fallback. |
| **Network-admin menu** | ❌ No | Hijack treats network admin as always-classic (`hijack.php:185`); bridge reads the site `$GLOBALS['menu']`, not `network/menu.php` | Network plugin pages are classic-only (documented alpha non-goal) |
| **`remove_menu_page` / `remove_submenu_page`** by another plugin | ✅ Indirectly | Those run during `admin_menu`, mutating `$GLOBALS['menu']` *before* the bridge scans it at priority 6 | Faithful — a removed item never reaches the scan |

### 3.2 The hard truths (settled with evidence)

**Q: Iframe or native?** **Iframe.** Ingested plugin pages mount `core:iframe-fallback` with `config.url = admin.php?page=<slug>` (`classic-menu-bridge.php:665` → `mountApp.js:341`). The plugin's own HTML/JS/CSS load natively. Parity of *rendering* is preserved; it is explicitly **not** a native React rebuild (and cannot be — the callback echoes opaque server HTML).

**Q: Is the iframe a real admin request with the correct `$hook_suffix`?** **Yes.** The iframe `src` is a normal `admin.php?page=<slug>` GET. `admin.php:189` resolves `$page_hook`, `admin.php:210` sets `$hook_suffix = $page_hook`, and `admin-header.php:123` fires `admin_enqueue_scripts` with that exact `$hook_suffix`. So `add_action('admin_enqueue_scripts', fn($hook)=>$hook==='toplevel_page_acme' && wp_enqueue_script(...))` fires correctly inside the iframe. **This is the single most important reliability fact: the iframe is a faithful admin request, not a sandboxed shell.**

**Q: Do nonces + admin-ajax + form posts work from inside the iframe?** **Yes.** The iframe is same-origin, same auth cookie. `admin-ajax.php` calls from the plugin's JS resolve against the real endpoint (and `admin-ajax.php` is on the hijack allowlist anyway — `hijack.php:43`). Settings-API form posts to `options.php` complete the full nonce-check → save → redirect cycle (`options.php:246`, `:374`) inside the iframe. `admin-post.php` likewise (allowlisted, `hijack.php:44`). The iframe-fallback even handles session-expiry mid-iframe by detecting the login form and forcing the shell auth modal (`index.js:126-142`).

**Q: Is the chrome hidden?** **Yes**, via `CHROME_HIDE_CSS` injected on load (`chromeHide.mjs:16`, applied `index.js:144-150`). Best-effort: cross-origin reveals chrome (rare for wp-admin). Note the CSS hides the admin menu/bar/footer but NOT `#screen-meta-links`, so Screen Options/Help remain reachable inside the frame.

### 3.3 Predictability / ordering

- **Position drift (real).** `scan()` ignores the `$menu` numeric key entirely (`classic-menu-bridge.php:213`). An ingested top-level item has no `position`, so it sorts by `menuTree.mjs` `orderTree` after positioned items — effectively appended in iteration order. A plugin that registered at `position: 3` (wanting to sit right after Dashboard) lands wherever the cascade order puts it. **[shell]**
- **First-submenu-equals-parent quirk: not reproduced, and arguably correct.** WP collapses a single same-destination submenu (`includes/menu.php:184-191`) and reuses the parent slug for the first child. The bridge doesn't replicate this — it reads `$GLOBALS['submenu']` *after* `admin_menu` but the collapse logic lives in `wp-admin/menu.php` which the iframe-less bridge request doesn't run. In practice the bridge synthesizes the parent screen from the top-level `$menu` row and nests `$submenu` children under it, which is cleaner than the quirk. But it means the *parent's own clickable landing page* (which in classic = its first child) may differ: the ingested parent screen points at `admin.php?page=<parent-slug>`, which is correct because `admin_url_for_slug` resolves it (`:680`). Low risk, but a plugin relying on the "parent link == first child" identity could see a different first view.
- **Separators: dropped (correct).** Bridge skips separator rows (`:224-227`); the shell's own menu IA supplies structure.
- **`custom_menu_order`: lost (real).** See matrix. The reorder filter fires in `wp-admin/menu.php`, never executed in the bridge's data-gathering request. **[shell]**

### 3.4 Settings-API specifically

A third-party `add_options_page()` + Settings API page:
- **Appears** under the shell's "Plugins" container (`menu.ingested`), NOT under the shell's Settings host — because the bridge groups all core-parented submenus under one container (`classic-menu-bridge.php:516`), and `options-general.php` is a core parent. So a plugin settings page is reachable but mis-placed (user looks under Settings, finds it under Plugins). **[shell]** placement gap.
- **Save round-trips correctly** through the iframe (evidence in §3.2). Functional parity preserved.

### 3.5 API blockers (the most important — what we *cannot* do via REST / core-data)

1. **[upstream] A plugin's Settings-API options are not in REST.** `register_setting`'s `show_in_rest` defaults to `false` (`option.php:2994`). The shell's native settings apps (`core:settings-*`) work only because *core* options opt into REST (`option.php:2818,2828,2838,…`). A third-party plugin's options are generally invisible to `wp/v2/settings`, so a **native React rebuild of a plugin settings page is impossible** without the plugin author adding `show_in_rest`. The iframe is the only faithful path. This is fundamental, not a shell shortcoming.
2. **[upstream] A plugin page callback echoes opaque server HTML.** There is no API — REST or otherwise — that returns "the rendered markup of `admin.php?page=<slug>`." The callback is an arbitrary `echo`. The only way to get it is to *execute the request*, i.e. the iframe. No core-data entity, no endpoint. A native rebuild would require the plugin to expose its own REST surface (which it may or may not have).
3. **[upstream] admin-ajax-only actions.** Many plugins ship `wp_ajax_<action>` handlers with no REST equivalent (`admin-ajax.php`, nonce-gated). `@wordpress/api-fetch` can technically hit admin-ajax, but there's no schema, no discovery, and the nonces are page-localized. Inside the iframe these work natively because the plugin's own JS carries the nonce; outside, the shell can't enumerate or call them. The shell does not (and cannot generically) bridge these.
4. **[upstream] `$GLOBALS['menu']` / `$submenu` are not exposed via REST.** The shell reads them server-side (PHP bridge) because there is no `wp/v2/admin-menu` endpoint. This is fine for the PHP-side bridge, but means **a headless/remote consumer of the shell config cannot reconstruct the plugin menu** — only an in-`wp-admin` request populates the globals (they're built by `admin_menu`, which only fires on admin page loads). A REST endpoint returning the assembled menu would let the shell (or any client) get plugin menus without a live admin request.
5. **[shell] Admin-bar nodes (`admin_bar_menu` → `$wp_admin_bar`) are not bridged.** `WP_Admin_Bar` *is* introspectable server-side (`$wp_admin_bar->get_nodes()`), so this is closable shell-side without upstream help — the shell just doesn't do it today.
6. **[shell] `admin_notices` are not bridged.** The `admin_notices` action fires during classic page render and echoes HTML; on a native shell screen there's no such render. Capturing them would require running the action in a buffer server-side and shipping the output — doable shell-side (with sanitization concerns) but not done.
7. **[shell] Menu icon `data:`/image-URL harvesting.** `map_icon` punts on non-Dashicon icons (`classic-menu-bridge.php:476`). The SVG/URL is right there in `$menu[6]`; the shell could register it into the icon system. Explicitly deferred (`:46`).
8. **[shell] Position / `menu_order` fidelity.** The numeric `$menu` key (and the `menu_order` filter result) is available server-side; the bridge just doesn't carry it. Closable shell-side.

---

## Prioritized recommendations

1. **[shell, high] Carry `$position` from the `$menu` numeric key into the ingested item's `position`.** `scan()` already iterates `$menu`; capture `$id` (the array key) and emit `position => (int) round($id)` so ingested items land near where the plugin asked. Closes the most visible drift. (`classic-menu-bridge.php:213`)
2. **[shell, high] Place core-parented plugin submenus under the matching shell menu, not a generic "Plugins" bucket.** A plugin `add_options_page()` should nest under the shell's Settings menu; `add_management_page()` under Tools. Map the core parent slug → the shell's menu id instead of always `menu.ingested`. (`classic-menu-bridge.php:516`)
3. **[shell, high] Bridge `admin_bar_menu` nodes into the shell toolbar.** Read `$wp_admin_bar->get_nodes()` server-side after `admin_bar_menu` fires and contribute them as toolbar items. Plugin admin-bar actions (cache purge, "Edit with…") are currently invisible. Fully closable without upstream.
4. **[shell, medium] Harvest `data:`/image-URL menu icons.** Register the embedded SVG / image URL into the icon registry so WooCommerce/Yoast/Elementor render with their real glyph instead of the generic `menu` icon. (`classic-menu-bridge.php:476`)
5. **[shell, medium] Surface Screen Options / Help affordance under `core:default`, not just `core:desktop`.** Sub-system 12 already detects + posts the panels (`chromeless-bridge.php:624`); wire the default-engine iframe-fallback's parent-side listener (or a region titlebar control) to consume `wp-admin-workspaces-screen-meta` the way `core:desktop-iframe` does. The data is already on the wire.
6. **[shell, medium] Bridge `admin_notices` for native shell screens.** Buffer the `admin_notices`/`all_admin_notices` output server-side, sanitize, and feed `core:notices-banner`. Especially the dashboard, where there's no iframe to carry them.
7. **[shell, low] Reproduce the first-submenu-equals-parent landing semantics** only if a concrete plugin breaks — current behavior is cleaner and the parent screen URL already resolves correctly.
8. **[upstream, strategic] Propose a `wp/v2/admin-menu` REST endpoint** returning the assembled `$menu`/`$submenu` (post-cap-prune, post-`menu_order`). This is the single upstream change that would let the shell — and any headless client — get plugin menus *with correct ordering and icons* without scraping PHP globals during a live admin request, and would also fix the cross-request / headless reconstruction gap (#4 above).
9. **[upstream, evangelism] Push plugin authors toward `show_in_rest` on `register_setting` and toward REST endpoints over admin-ajax.** This is the only path from "iframe parity" to "native React parity" for plugin settings/data. Document it in the plugin-author guide as the prerequisite for first-class (non-iframe) shell UI.

### Reliability bottom line for the "your admin UI will show up" promise

- **Will it show up?** Yes — every non-core top-level menu and submenu is auto-ingested; nothing requires the plugin author to do anything.
- **Will it work?** Yes — it loads as a real same-origin admin request, so the plugin's `$hook_suffix`-keyed assets, nonces, admin-ajax, and Settings-API/`admin-post.php` form posts all function natively inside the iframe.
- **Where will it be / what will it look like?** Less predictable — ordering can drift, core-parented settings pages land under "Plugins," custom icons fall back to a generic glyph, and admin-bar / `admin_notices` surfaces aren't bridged. None of these break functionality; they're polish + placement gaps, all closable shell-side except the two fundamental upstream truths (plugin settings not in REST, page HTML being opaque) that make the iframe the correct — not compromised — answer.
