# Parity: Appearance (`core:appearance`)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: `src/apps/appearance/`. Classic counterpart: `wp-admin/themes.php` (group root) + `customize.php`, `widgets.php`, `nav-menus.php`, `theme-editor.php`, plus `site-editor.php` and `font-library.php`.

## Verdict

**Major gaps.** The audit surfaces a **naming/scope mismatch** that dwarfs the per-screen comparison: the workspace's `core:appearance` app is **not** an Appearance-menu hub at all. It is a *user-preferences* screen (workspace density / accent color / default-route) backed by `/wp-admin-workspaces/v1/user-prefs` (`src/apps/appearance/index.js:67-246`). It has no classic wp-admin counterpart. The actual wp-admin **Appearance** menu group — Themes, Editor/Design/Patterns, Customize, Fonts, Widgets, Menus, Header, Background, Theme File Editor (`wp-admin/menu.php:209-288`) — is split across the workspace as: `core:themes` (separate app, separate audit), `core:site-editor` (iframe), `iframe:customize.php`, `iframe:widgets.php`, a `font-library` iframe, and **three screens that are entirely missing** (Menus, Header, Background) plus the Theme File Editor relocated under Tools. Of the missing/iframed items, **Menus and Widgets are fully REST-rebuildable today** (`/wp/v2/menus` + `/wp/v2/menu-items` + `/wp/v2/menu-locations`; `/wp/v2/widgets` + `/wp/v2/sidebars` + `/wp/v2/widget-types`), the **Customizer is a hard `[upstream]` blocker** (admin-ajax framework, zero REST), and the **Theme File Editor is a hard `[upstream]` blocker** (admin-ajax file-write, zero REST). On top of that, the `core:appearance` user-prefs app and the `customize`/`widgets` screens are effectively **orphaned in navigation** (see Functional divergences).

## Counterpart mapping

### The workspace `core:appearance` app
- **Classic screen:** *none.* It is a workspace-specific user-prefs UI. The closest analogue in wp-admin is **Admin Color Scheme** on `profile.php` (`personal_options` → `admin_color`) — but that writes the `admin_color` user-meta and re-skins wp-admin's own CSS, whereas this app writes `wp_admin_workspaces_user_prefs` meta consumed by the cascade resolver's `user` origin. Different surface entirely.
- **REST / core-data the workspace app uses:** `GET/POST/DELETE /wp-admin-workspaces/v1/user-prefs` (`includes/class-wp-admin-workspaces-prefs-rest.php:26-107`); reads `config.styles.customizable` + `config.styles` + `config['default-route']` from the resolved kernel config (`src/apps/appearance/index.js:68-108`). No `@wordpress/core-data` entities; uses `@wordpress/api-fetch` directly.
- **Project screen spec:** **MISSING** — there is no `docs/screens/appearance.md`. That is correct: the app has no classic counterpart, so a tier-2 wp-admin spec would have nothing to mirror. (Flagging it as a doc gap only insofar as the app's *name* collides with the wp-admin menu group — see Recommendations P1.)

### The wp-admin Appearance menu group (what a parity-minded reader expects "Appearance" to mean)
- **Group root:** `wp-admin/themes.php`, powered by `WP_Themes_List_Table` (no list table for the grid — themes render via `WP_MS_Themes_List_Table` only on network admin; single-site uses a JS grid). Top-level menu `$menu[60]` targets `themes.php`; capability `switch_themes` (fallback `edit_theme_options`) (`wp-admin/menu.php:207-209`).
- **Submenu items** (`wp-admin/menu.php:225-288`, `wp-includes/functions.php:5466-5481`):

  | Slot | Item | Target | Capability | Condition |
  |---|---|---|---|---|
  | 5 | Themes | `themes.php` | `switch_themes`/`edit_theme_options` | always |
  | 6 | Editor / Design / Patterns | `site-editor.php` (`?p=/pattern` for the Patterns variant) | `edit_theme_options` | block theme → "Editor"; classic + stylebook → "Design"; classic no-stylebook → "Patterns" |
  | 7 | Customize | `customize.php` | `customize` | not a block theme, OR a plugin registered `customize_register` |
  | 8 | Widgets | `widgets.php` | `edit_theme_options` | `current_theme_supports('widgets')` |
  | 9 | Fonts | `font-library.php` | `edit_theme_options` | always |
  | 10 | Menus | `nav-menus.php` | `edit_theme_options` | `current_theme_supports('menus') \|\| current_theme_supports('widgets')` |
  | 15 | Header | `customize.php?autofocus[control]=header_image` | `switch_themes`/`edit_theme_options` | `current_theme_supports('custom-header') && current_user_can('customize')` |
  | 20 | Background | `customize.php?autofocus[control]=background_image` | `switch_themes`/`edit_theme_options` | `current_theme_supports('custom-background') && current_user_can('customize')` |
  | 101 | Theme File Editor | `theme-editor.php` (→ Tools for block themes) | `edit_themes` | not multisite |

- **REST / core-data surfaces for the rebuildable group members:**
  - Themes — `/wp/v2/themes` (`WP_REST_Themes_Controller`); workspace uses entity `root/theme`.
  - Site Editor — templates/parts/global-styles via `/wp/v2/templates`, `/wp/v2/template-parts`, `/wp/v2/global-styles`; workspace iframes it anyway.
  - **Menus** — `/wp/v2/menus` (`WP_REST_Menus_Controller`, namespace `wp/v2`), `/wp/v2/menu-items` (`WP_REST_Menu_Items_Controller`; the `nav_menu_item` post type registers `show_in_rest => true`, `rest_base => 'menu-items'` at `post.php:150-184`), `/wp/v2/menu-locations` (`WP_REST_Menu_Locations_Controller`, `class-wp-rest-menu-locations-controller.php:25-26`).
  - **Widgets** — `/wp/v2/widgets` (`WP_REST_Widgets_Controller:41-42`), `/wp/v2/sidebars` (`WP_REST_Sidebars_Controller:35-36`), `/wp/v2/widget-types` (`WP_REST_Widget_Types_Controller:25-26`, with `/encode` and `/render` sub-routes).
  - **Fonts** — `/wp/v2/font-families` + `/wp/v2/font-collections` + nested `font-faces` (rebuildable; workspace iframes it).
- **Project screen specs** (these DO exist and explicitly note "Current workspace coverage: None"): `docs/screens/themes.md`, `docs/screens/menus.md`, `docs/screens/widgets.md`, `docs/screens/theme-file-editor.md`, `docs/screens/fonts.md`, `docs/screens/network-themes.md`.

## Feature parity matrix

This matrix covers the **wp-admin Appearance group as a whole**, since "Appearance" is the audited scope. The workspace's own `core:appearance` user-prefs app has no wp-admin equivalent and is matrixed separately at the end.

### Appearance group members

| Feature | wp-admin behavior | Workspace | Status | Notes |
|---|---|---|---|---|
| **Appearance top-level → Themes** | Clicking "Appearance" navigates to `themes.php` (`menu.php:209`) | `appearance` menu node has `items` but no working self-link; clicking it drills into the sub-group, it does NOT land on Themes | partial | `bind_screens` stamps `href:#/appearance` onto the node (`class-wp-admin-workspaces-menu-items.php:516-528`), but the drilldown renderer treats any node with `items` as a container, not a link (`SidebarDrilldownRenderer.js:147-174`). Divergence below. |
| **Themes (grid, activate, details, search)** | `themes.php` JS grid | `core:themes` DataViews app (`src/apps/themes/index.js`) | full | Separate audit. Present in menu at `appearance.items.themes`. |
| **Site Editor / Design / Patterns** | `site-editor.php` React app | `core:site-editor` (iframe, `mode:takeover`) — menu label "Editor" | partial | Iframed, not rebuilt. Patterns variant (`?p=/pattern`) not separately surfaced. Separate audit. |
| **Customize (Customizer)** | `customize.php` live-preview framework | `iframe:customize.php` screen exists (`wp-admin-default.json:934-945`) but is **not in the menu tree** | blocked + missing | Orphaned screen (reachable only by typing `/customize`). Even if linked, the Customizer has **no REST** — admin-ajax only. Hard `[upstream]` blocker. |
| **Fonts (Font Library)** | `font-library.php` React modal | `core:iframe-fallback` pointed at `themes.php?page=font-library-wp-admin` (`wp-admin-default.json:958-971`) | partial | Iframed. REST exists (`/wp/v2/font-families`) so it is rebuildable; currently not rebuilt. |
| **Widgets** | `widgets.php` (block editor since 5.8) | `iframe:widgets.php` screen exists (`wp-admin-default.json:946-957`) but is **not in the menu tree** | partial + orphaned | Orphaned screen. REST fully present (`/wp/v2/widgets`, `/sidebars`, `/widget-types`) → rebuildable. |
| **Menus (classic nav menus)** | `nav-menus.php` drag-drop editor | **Absent.** No screen, no menu entry, no iframe. | missing | Fully REST-rebuildable (`/wp/v2/menus` + `/menu-items` + `/menu-locations`). `docs/screens/menus.md` exists. Biggest single workspace-side gap. |
| **Header image** | `customize.php?autofocus[control]=header_image` | Absent | blocked + missing | Routes into the Customizer → no REST. Hard `[upstream]` blocker. Classic-theme-only (`custom-header` support). |
| **Background image** | `customize.php?autofocus[control]=background_image` | Absent | blocked + missing | Routes into the Customizer → no REST. Hard `[upstream]` blocker. Classic-theme-only (`custom-background` support). |
| **Theme File Editor** | `theme-editor.php` code editor | `iframe:theme-editor.php` under **Tools** menu (`wp-admin-default.json:1125-1136`), not Appearance | partial | Iframed, relocated to Tools (matches block-theme placement, `menu.php:280-288`). No REST → hard `[upstream]` blocker for a rebuild. |
| **Block-theme vs classic-theme conditional menu** | wp-admin shows/hides Customize, Widgets, Menus, Header, Background based on theme support + `wp_is_block_theme()` (`menu.php:227-262`) | Workspace menu is static JSON; same items render regardless of active theme | missing | Workspace has no theme-support introspection to mirror the conditional menu. See divergence below. |

### Appearance group — cross-cutting affordances

| Feature | wp-admin behavior | Workspace | Status | Notes |
|---|---|---|---|---|
| Theme-update count badge | "Appearance" + "Themes %s" carry an update-count span (`menu.php:217-225`) | No badge on the Appearance/Themes menu node | missing | Count comes from `wp_get_update_data()` — exposed via `/wp/v2/themes` `update`? No: update counts are not in the themes REST schema. `[workspace]` could compute from a custom endpoint; partial `[upstream]` for a clean count field. |
| Capability gating (group) | `switch_themes` (fallback `edit_theme_options`) on the group; per-item caps vary (`customize`, `edit_theme_options`, `edit_themes`) | `appearance` screen gated on `switch_themes` (`wp-admin-default.json:900-904`); per-screen caps set (`customize`/`edit_theme_options`/`edit_themes`) | full | Caps largely match. Note the workspace never falls back `switch_themes`→`edit_theme_options` the way `menu.php:207` does; an editor without `switch_themes` sees no Appearance group at all. Minor divergence. |
| Menu icon | Dashicon `dashicons-admin-appearance` | `icon:"appearance"` → registered as `brush` (`icons.js:72`) | full | Appearance icon resolves. But `themes` and `typography`(Fonts) icon names are **not** registered (`icons.js`), so those items fall back to the default WordPress glyph. Minor visual gap. |
| Empty / error state | Each screen renders its own wp_die on cap failure | Iframe screens render the classic wp_die inside the frame; missing screens render nothing | partial | For Menus/Header/Background there is no screen, so no empty state — they simply don't exist. |
| Extensibility hooks | `customize_register`, `widgets_init`, `register_nav_menus`, theme-support gates; `add_theme_page()` plugin items | Classic-menu bridge ingests `add_theme_page()` items into the workspace menu automatically (CLAUDE.md "Classic wp-admin menu bridge") | partial | Plugin-added Appearance submenu items DO surface via the bridge. But the bridge cannot reconstruct the *native* conditional items (Customize/Widgets/Menus) — those are added by core in `menu.php`, then the workspace's static JSON re-declares only a subset. |

### The workspace `core:appearance` user-prefs app (no wp-admin counterpart)

| Feature | Behavior | Status | Notes |
|---|---|---|---|
| Density toggle | Radio: default / compact / comfortable → `POST {styles:{density}}` | n/a | Workspace-only. Gated on `styles.customizable` allowing `density` (`index.js:91,166-188`). |
| Accent color | Hex text input; writes `color.bg.interactive.brand.strong` + `strong-active` (`index.js:190-218`) | n/a | Workspace-only. Plain `^#[0-9a-fA-F]{6}$` validation — not a real color picker. |
| Default-route override | Text input → `POST {'default-route':value}` (`index.js:220-232`) | n/a | Workspace-only. |
| Reset | `DELETE /user-prefs` wipes all overrides (`index.js:131-146`) | n/a | All-or-nothing; no per-field revert. |
| Loading / no-controls / saving states | Spinner; "no customizable settings" copy; disabled controls | n/a | Documented in `app.json#documentation.states`. |
| Reachable from menu | The `/appearance` screen mounting this app is **not** linked anywhere users can click | **broken** | See Functional divergences — this is the most consequential finding for this app specifically. |

## Functional divergences

1. **The audited app is mis-scoped vs its name.** wp-admin "Appearance" is a theme/widgets/menus group rooted at `themes.php` (`menu.php:209`). The workspace's `core:appearance` (`src/apps/appearance/index.js:13` docblock: "user-prefs UI") is a density/accent/default-route preferences screen. A reviewer (or an workspace.json author) reading "Appearance" will reasonably expect the wp-admin group and find a personalization panel instead. *Consequence:* conceptual collision; the app id squats the obvious name for a real Appearance hub that does not exist.

2. **`core:appearance` is orphaned in navigation.** The `appearance` screen (`path:/appearance`, `app:core:appearance`) is bound to the `appearance` menu node, but that node also has `items` (themes / site-editor / fonts) (`wp-admin-default.json:1327-1341`). `bind_screens_to_tree` stamps `href:#/appearance` onto the node (`includes/cascade/class-wp-admin-workspaces-menu-items.php:516-528`), but `ExpandedNavigation` in the drilldown renderer treats *any* node with `items` as a slide-in container whose click opens the sub-screen rather than navigating to its own href (`src/apps/navigation/_renderers/SidebarDrilldownRenderer.js:147-174`). The drilldown sub-screen header renders only a "back" link (`SidebarDrilldownRenderer.js:152-156`), no "open Appearance settings" affordance. *Consequence:* the user-prefs app is reachable **only by manually typing `/appearance`** (or via a command/shortcut if one is wired) — there is no clickable path in the default workspace.

3. **`customize` and `widgets` screens are orphaned too.** Both exist in `screens` (`wp-admin-default.json:934,946`) but neither appears in the `menu` tree (the `appearance` group lists only `themes`/`site-editor`/`fonts`, lines 1330-1339). *Consequence:* like #2, reachable only by typing `/customize` or `/widgets`. wp-admin surfaces both as first-class submenu links (`menu.php:247`, `functions.php:5475-5477`).

4. **No theme-aware conditional menu.** wp-admin shows Customize / Widgets / Menus / Header / Background **only** when the active theme declares the matching support and (for the Customizer-backed ones) the user can `customize` (`menu.php:227-262`). The workspace's menu is static workspace.json with no `wp_is_block_theme()` / `current_theme_supports()` introspection. *Consequence:* on a block theme the workspace would (if these were in the menu) show Customize/Widgets/Menus even though core hides them; on a classic theme it omits Menus/Header/Background even though core shows them. The workspace currently sidesteps this only by omitting most of them.

5. **Theme File Editor placement.** wp-admin puts the Theme File Editor under Appearance for classic themes and Tools for block themes (`menu.php:280-288`). The workspace hard-codes it under Tools (`wp-admin-default.json:1125-1136, 1397-1399`). *Consequence:* for a classic theme the workspace's placement diverges from wp-admin (Tools vs Appearance) — acceptable given block themes are the default, but a divergence.

6. **Accent-color control is a naive hex field, not the Customizer color picker.** wp-admin's Customizer offers a full color control with palette + alpha. The workspace app uses a plain `InputControl` validated by regex (`src/apps/appearance/index.js:190-218`). *Consequence:* worse UX, but this is workspace-only personalization, not a wp-admin parity item — noted for completeness (app.md "Color picker is naive").

## API & platform blockers

The hard blockers, each verified against live 7.0 source:

| # | What wp-admin does | Missing surface | Tag |
|---|---|---|---|
| B1 | **Customizer save / load / preview** (`customize.php`) | **No REST whatsoever.** The Customizer is a self-contained admin-ajax framework: `wp_ajax_customize_save`, `customize_trash`, `customize_refresh_nonces`, `customize_load_themes`, `customize_override_changeset_lock`, `customize_dismiss_autosave_or_lock` (`wp-includes/class-wp-customize-manager.php:385-392`). Settings are nonce-gated changesets stored as a `customize_changeset` post; live preview runs a full front-end iframe with `customize_messenger`. There is **no `/wp/v2/customize*` endpoint** and no `register_rest_route` in the manager. | **[upstream]** — a REST rebuild is impossible without core adding a Customizer REST surface (which is unlikely; core is deprioritizing the Customizer in favor of the Site Editor). Workspace's correct move is the iframe escape hatch (already done) — *but it must be linked in the menu* (`[workspace]`). |
| B2 | **Header image** (`customize.php?autofocus[control]=header_image`) | Same as B1 — it is a Customizer deep-link. The `custom-header` theme feature has a REST-exposed component only via theme `theme_supports` (read-only); **setting** the header image is Customizer-only ajax (or the legacy `custom-header.php` admin-ajax `wp_ajax_*custom-header*`). | **[upstream]** |
| B3 | **Background image** (`customize.php?autofocus[control]=background_image`) | Same as B1/B2 — Customizer deep-link; `custom-background` setting writes are Customizer/admin-ajax only. | **[upstream]** |
| B4 | **Theme File Editor** read/write (`theme-editor.php`) | **No REST.** File listing + write go through admin-ajax `wp_ajax_edit_theme_plugin_file` → `wp_edit_theme_plugin_file()` (`wp-admin/includes/ajax-actions.php:4910-4911`), nonce-gated, with a fatal-error auto-rollback loopback that requires a same-origin admin request. No `/wp/v2/*` file endpoint exists. Also gated by `DISALLOW_FILE_EDIT`. | **[upstream]** — a rebuild needs a new REST file-edit endpoint (core won't add one; this screen is being deprioritized). Iframe is the only viable path. |
| B5 | **Theme update count badge** on Appearance/Themes | The count comes from `wp_get_update_data()` (`menu.php:214,217-221`). The `/wp/v2/themes` schema does **not** expose an update-available field or a count. | **[upstream]** for a clean field; **[workspace]** workaround possible via a custom endpoint wrapping `wp_get_update_data()`. |
| B6 | **Block-theme / theme-support introspection for the conditional menu** (`wp_is_block_theme()`, `current_theme_supports('widgets'\|'menus'\|'custom-header'\|'custom-background')`) | `/wp/v2/themes` exposes `theme_supports` for the **active** theme (read-only), which *does* include `widgets` / `menus` / `custom-header` / `custom-background` / `block-templates`. So the data exists. The blocker is **workspace-side**: the menu is static workspace.json with no mechanism to gate items on live theme support. | **[workspace]** — the data is REST-available; the workspace would need a server-side menu-gating pass (or a `wp_admin_workspaces_data` filter) that reads theme supports and prunes Appearance items accordingly. |

**Rebuildable-without-blockers (i.e. NOT API blockers — these are missing features the workspace COULD build today):**

| Item | REST surface (verified) | Tag |
|---|---|---|
| **Menus** (nav-menus) | `/wp/v2/menus` (`WP_REST_Menus_Controller`), `/wp/v2/menu-items` (`nav_menu_item` post type, `rest_controller_class => WP_REST_Menu_Items_Controller`, `post.php:150-184`), `/wp/v2/menu-locations` (`class-wp-rest-menu-locations-controller.php:25-26`). Drag-order, nesting (`parent`/`menu_order`), location assignment all writable. | **[workspace]** — full rebuild feasible; `docs/screens/menus.md` already specs it. |
| **Widgets** (block widgets) | `/wp/v2/widgets`, `/wp/v2/sidebars`, `/wp/v2/widget-types` (+ `/encode`, `/render`) — `WP_REST_Widgets_Controller:41`, `WP_REST_Sidebars_Controller:35`, `WP_REST_Widget_Types_Controller:25,73,105`. | **[workspace]** — rebuild feasible (though block-widget editing implies hosting the block editor, which is itself heavy; the iframe is a defensible interim). |
| **Fonts** (Font Library) | `/wp/v2/font-families`, `/wp/v2/font-collections`, nested `/font-faces`. | **[workspace]** — rebuild feasible; currently iframed. |
| **Per-user accent → wp-admin Admin Color Scheme** parity | `admin_color` is a registered user-meta exposed on `/wp/v2/users/me` (`meta`/`admin_color` is a settable user field). | **[workspace]** — the workspace's accent control could optionally write `admin_color` too, but it intentionally targets the workspace token system instead. |

## DataViews / DataForms review

**N/A for `core:appearance`.** The user-prefs app hand-rolls a small `Stack` of `RadioControl` + `InputControl` + `Button` (`src/apps/appearance/index.js:150-243`) — appropriate for a 3-control settings panel; DataForm would be overkill and its flat field model fits poorly with the deep token paths (`styles.color.bg.interactive.brand.strong`). The app.md already acknowledges this. One observation: the accent "color picker" is a raw hex `InputControl`; if the team wants parity with the Customizer's color control, a real color-picker component (not DataForm) is the lever.

For the **Appearance group as a whole**: a rebuilt **Menus** screen is a strong DataViews/DataForm candidate only partially — the menu *list* (pick which menu to edit) fits DataViews, but the core drag-reorder/nest tree editor is bespoke and outside DataViews' table/grid/list layouts. A rebuilt **Widgets** screen is essentially a block-editor host, not a DataViews surface. So DataViews helps the *list/picker* workspaces of these screens but not their core editing canvases. The audited app does not touch `_shared/dataviews/*` or `_shared/forms/*`.

## Recommendations / future work

**P1 — resolve the naming/scope collision and fix the orphaned screens (workspace-side).**
- *What:* Decide whether `core:appearance` should keep the "Appearance" name. Recommend **renaming the user-prefs app** (e.g. `core:preferences` / "Preferences" or "Personalize") so "Appearance" is free for a real wp-admin-style group, and surface the prefs app under the user menu or Settings where personalization belongs.
- *Why:* The current id squats the most discoverable name for a hub that doesn't exist, and the prefs app is itself unreachable by click (Functional divergence #2).
- *Where:* `src/apps/appearance/` (id + title), `workspaces/wp-admin-default.json:894-905` (screen/menu binding).
- *Also P1:* **Link the orphaned `customize` and `widgets` screens** into the Appearance menu group, or remove them. They exist as screens but no menu item points at them (`wp-admin-default.json:934,946` vs the `appearance.items` block at `1327-1341`). Workspace-side, trivial JSON fix.
- *Also P1:* Either give the `appearance` group node a real landing (drop the parent `href` and accept it's a container) **or** add a distinct leaf item that navigates to `/appearance`. The current state — `href` stamped but unreachable because the node has `items` — is a latent bug (`SidebarDrilldownRenderer.js:147-174`).

**P2 — rebuild Menus (workspace-side, no API blocker).**
- *What:* A native `core:menus` app over `/wp/v2/menus` + `/wp/v2/menu-items` + `/wp/v2/menu-locations`.
- *Why:* nav-menus is still heavily used on classic themes, it is **fully REST-rebuildable**, and there is **zero workspace coverage** today (not even an iframe) — the single biggest functional hole in the Appearance group. `docs/screens/menus.md` already specs the surface.
- *Where:* new `src/apps/menus/`; screen + menu entry in `workspaces/wp-admin-default.json` Appearance group; gate on theme support per B6.
- *Caveat:* the drag-reorder/nest tree editor is bespoke (not DataViews); the menu picker can use DataViews.

**P2 — theme-aware conditional Appearance menu (workspace-side).**
- *What:* A `wp_admin_workspaces_data` server pass that reads the active theme's `theme_supports` (from `/wp/v2/themes` or directly via `current_theme_supports()` server-side) and `wp_is_block_theme()`, then prunes/shows Customize / Widgets / Menus / Header / Background to match `menu.php:227-262`.
- *Why:* closes Functional divergence #4 so the workspace's Appearance menu matches what wp-admin would actually display for the active theme.
- *Where:* a new cascade callback alongside `bind_screens` (`includes/cascade/class-wp-admin-workspaces-menu-items.php`), or the classic-menu bridge.

**P2 — register missing Appearance icons (workspace-side, cosmetic).**
- *What:* Add `themes`, `customize`, `widgets`, `typography` to the `core:default` icon table.
- *Why:* `themes` (Themes) and `typography` (Fonts) menu items currently fall back to the default glyph (`src/runtime/engines/core-default/icons.js` registers only `appearance`→`brush`).
- *Where:* `src/runtime/engines/core-default/icons.js`.

**P3 — keep Customizer / Header / Background / Theme File Editor as iframes (upstream-blocked).**
- *What:* Leave the iframe escape hatch in place for the Customizer (B1) and Theme File Editor (B4); add iframe screens for Header (B2) and Background (B3) deep-links **if** a target workspace uses a classic theme that supports them, gated by P2's theme introspection.
- *Why:* these have **no REST** and are upstream-blocked; a native rebuild is not feasible and (for the Customizer/Theme File Editor) not on core's roadmap. The iframe is the correct, documented escape hatch.
- *Where:* `workspaces/wp-admin-default.json` (screens already exist for customize/theme-editor; add header/background iframe screens only behind the theme-support gate).

**P3 — rebuild Fonts and Widgets natively (workspace-side, no API blocker, lower urgency).**
- *What:* `core:fonts` over `/wp/v2/font-families|collections|faces`; native Widgets over `/wp/v2/widgets|sidebars|widget-types`.
- *Why:* both are REST-rebuildable; both are currently iframed, which is acceptable. Lower priority than Menus because the iframe works and block-widget editing implies hosting the block editor (heavy). Defer unless a target workspace needs a non-iframe path.
- *Where:* new `src/apps/fonts/`, `src/apps/widgets/`.
