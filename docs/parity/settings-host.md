# Parity: Settings host + missing panels (core:settings)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: `src/apps/settings/`. Classic counterpart: the whole **Settings** menu group — `wp-admin/options-general.php`, `options-writing.php`, `options-reading.php`, `options-discussion.php`, `options-media.php`, `options-permalink.php`, `options-privacy.php` (+ the shared `options.php` Settings-API save handler).

## Verdict

**Blocked by API** (for the three missing native panels) / **At parity via iframe** (for the screens overall).

`core:settings` is a composing host, not a 1:1 screen, so "parity" splits by panel. The four native panels (General / Writing / Discussion / Reading) reach near-parity because every option they touch is REST-exposed by `register_initial_settings()` (verified `option.php:2741-2960`). The three missing panels — **Media, Permalinks, Privacy** — are shipped as **iframed classic screens** (`iframe:options-media.php` etc.) and therefore reach *functional* parity at zero implementation cost, but native rebuilds are blocked: **none** of their options are in `/wp/v2/settings`, and Permalinks + Privacy carry server-side side effects (rewrite-rule flush, `.htaccess`/`web.config` writes, `wp_insert_post`, a distinct capability) that the REST settings controller cannot express. Media is the one panel that is REST-blocked but *trivially* workspace-closable (plain `update_option`s, no side effects). The host itself has two real divergences: it keeps the active-panel id in `useState` rather than the URL (refresh loses your place), and it has **no plugin-panel registry** so `add_options_page()` settings cannot slot into the host (they surface separately via the classic-menu bridge as iframed `ingested-*` screens).

## Counterpart mapping

| Concern | Classic | Powered by |
|---|---|---|
| General | `wp-admin/options-general.php` | `options.php` Settings-API save (`allowed_options['general']`) |
| Writing | `wp-admin/options-writing.php` | `options.php` (`allowed_options['writing']`) |
| Reading | `wp-admin/options-reading.php` | `options.php` (`allowed_options['reading']`) |
| Discussion | `wp-admin/options-discussion.php` | `options.php` (`allowed_options['discussion']`) |
| **Media** | `wp-admin/options-media.php` | `options.php` (`allowed_options['media']`) — plain `update_option`s |
| **Permalinks** | `wp-admin/options-permalink.php` | **its own POST handler** (NOT `options.php`); `WP_Rewrite` setters + `flush_rewrite_rules()` + `.htaccess`/`web.config` writers |
| **Privacy** | `wp-admin/options-privacy.php` (Settings) + `wp-admin/privacy-policy-guide.php` (Policy Guide tab) | **its own POST handler**; `update_option` + `wp_insert_post` + `WP_Privacy_Policy_Content` (server-only class) |

**REST / core-data surface the workspace uses.**
- Native panels: `GET/POST /wp/v2/settings` via `useEntityRecord('root','site')` (e.g. `settings-general/index.js:22-23`). Controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`. Permission gate: `current_user_can('manage_options')` (`class-wp-rest-settings-controller.php:67-69`).
- Missing panels: **no REST**. The host mounts `IframeApp` (`src/apps/iframe-fallback/index.js`) pointed at the classic PHP screen with chrome-hide CSS injected. `iframe:options-media.php` is rewritten to `core:iframe-fallback` + `config.url` by `src/runtime/compile/translateIframeRef.mjs:20-23` (also `mountApp.js:341-363`).
- The plugin ships **no** custom settings endpoint — verified: the only `register_rest_route` calls are prefs / can / data-view / data-field-collections (`includes/*-rest.php`). There is no `/wp-admin-workspaces/v1/settings/*`.

**Project screen specs.** All seven exist and are detailed: `docs/screens/settings-general.md`, `settings-writing.md`, `settings-reading.md`, `settings-discussion.md`, `settings-media.md`, `settings-permalinks.md`, `settings-privacy.md`. **No doc gap.** (The specs were written against 6.x and explicitly flag the REST gaps as "verify at runtime / non-REST in core 6.9" — this audit confirms they remain non-REST in **7.0**.)

## Feature parity matrix

### A. The host (`core:settings`) as a composer

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| Panel set | 7 Settings submenu items (General/Writing/Reading/Discussion/Media/Permalinks/Privacy) | `BUILTIN_PANELS` array of all 7 (`settings/index.js:44-87`) | full | One-for-one with wp-admin's submenu. |
| Panel navigation chrome | wp-admin left-rail submenu under "Settings" | Vertical `ItemGroup`/`Item` nav, left column (`settings/index.js:128-145`) | full | Two-column composer; nav owns its own inset (`index.css:8-18`). |
| Active-panel persistence | Each submenu item is its own URL (`options-media.php`) — refresh stays put | Active id in `useState`, seeded from `segments[0]` only on first mount (`index.js:99-100`) | partial | **Divergence** — refresh/deep-link loses the active panel (returns to first). See Functional divergences. |
| Unknown sub-route | wp-admin 404s / redirects to a real screen | Silent fallback to `panels[0]` (`index.js:106-107`) | partial | No "panel not found" notice; documented v1 compromise. |
| Empty state | N/A (always has panels) | "No settings panels are available." when allowlist empties (`index.js:109-115`) | full | Workspace-only edge case for `config.panels:[]`. |
| Capability gating | Per-screen `manage_options` (`manage_privacy_options` for Privacy — see §blockers) | Uniform `manage_options` floor on the app + each panel (`app.json:9-11`, `index.js:48,52,...`) | partial | Privacy's distinct cap is collapsed to `manage_options`. |
| Plugin-added settings pages (`add_options_page`) | Appear as submenu items under Settings | **Not** slotted into the host; surface separately as `ingested-*` iframed screens via the classic-menu bridge | partial | See Functional divergences + API & platform. |
| Save / dirty-state | Per-screen `submit_button()` form POST | Delegated to each native panel; host declares `platform: { core:dirty-state: true }` (`app.json:12-14`) | full | Host is stateless re: data; panels own saving. |

### B. Settings — Media (`options-media.php` → iframed in workspace)

Classic source fully read: `wp-admin/options-media.php:1-169`.

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| View capability | `manage_options` (`options-media.php:12`) | iframe inherits classic gate; workspace screen also `manage_options` | full | |
| Thumbnail width/height | `thumbnail_size_w` / `thumbnail_size_h` number inputs (`options-media.php:64-67`) | Iframed only — no native field | blocked | Not in `/wp/v2/settings`; see §blockers. |
| Crop thumbnail to exact dimensions | `thumbnail_crop` checkbox (`options-media.php:69-70`) | Iframed only | blocked | Non-REST. |
| Medium max width/height | `medium_size_w` / `medium_size_h` (`options-media.php:79-82`) | Iframed only | blocked | Non-REST. |
| Large max width/height | `large_size_w` / `large_size_h` (`options-media.php:91-94`) | Iframed only | blocked | Non-REST. |
| Organize uploads in month/year folders | `uploads_use_yearmonth_folders` checkbox (`options-media.php:149-152`) | Iframed only | blocked | Non-REST. |
| Custom upload path / URL (conditional) | `upload_path` / `upload_url_path`, shown only when non-default (`options-media.php:122-142`) | Iframed only | blocked | Non-REST + conditional-render logic is server-side. |
| Embeds plugin section | `do_settings_fields('media','embeds')` when registered (`options-media.php:105-111`) | Iframed only | blocked | Plugin extension via Settings API; no REST. |
| Multisite "Uploading Files" suppression | Whole section hidden when `is_multisite()` (`options-media.php:113`) | Iframed (classic logic intact) | full | Iframe preserves it. |
| Save | `submit_button()` → POST `options.php` (`options-media.php:52,162`) | Iframed (classic save) | full-via-iframe / blocked-native | Plain `update_option`; trivially workspace-closable. |
| Help tab / sidebar | "Overview" tab + docs links (`options-media.php:31-43`) | Not surfaced (iframe hides chrome) | missing | Help tabs dropped across all iframed panels. |

### C. Settings — Permalinks (`options-permalink.php` → iframed in workspace)

Classic source read: `wp-admin/options-permalink.php:1-200` (+ form region beyond 200).

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| View capability | `manage_options` (`options-permalink.php:12`) | iframe + `manage_options` screen | full | |
| Permalink structure radios (Plain/Day&name/Month&name/Numeric/Post name) | Radio group writing `permalink_structure` (`options-permalink.php:104-126`) | Iframed only | blocked | `permalink_structure` not in REST; saving flushes rewrite rules. |
| Custom structure + tag buttons | Freeform input + `%year%`/`%postname%`/… buttons (filter `available_permalink_structure_tags`) | Iframed only | blocked | Non-REST; tag list is a server filter. |
| Category base / Tag base | `category_base` / `tag_base` text (`options-permalink.php:128-146`) | Iframed only | blocked | Non-REST; saved via `WP_Rewrite::set_*_base()`. |
| Save | **Own POST handler** w/ nonce `update-permalink`, `WP_Rewrite::set_permalink_structure()` → `flush_rewrite_rules()` (`options-permalink.php:101-147`) | Iframed (classic handler) | full-via-iframe / blocked-native | Hard upstream blocker — see §blockers. |
| `.htaccess` / `web.config` writability + rule echo | Server detection (Apache/IIS/nginx/caddy), writability test, `mod_rewrite_rules()` echo into textarea when not writable (`options-permalink.php:149-200`) | Iframed (classic logic) | full-via-iframe / blocked-native | Pure server-side computation — no REST surface. |
| Multisite blog-prefix handling | `/blog` prefix preserved on subdirectory main site (`options-permalink.php:89-93,114-118`) | Iframed (intact) | full | |
| Help tabs (3) + nginx docs sidebar | `add_help_tab` ×3 (`options-permalink.php:20-69`) | Not surfaced | missing | Chrome hidden. |

### D. Settings — Privacy (`options-privacy.php` → iframed in workspace)

Classic source fully read: `wp-admin/options-privacy.php:1-322` (+ `privacy-policy-guide.php`).

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| View capability | **`manage_privacy_options`** (`options-privacy.php:12`) — maps to `manage_options` single-site, `manage_network` multisite (`capabilities.php:797-799`) | iframe + workspace screen gates on `manage_options` | partial | Distinct cap collapsed; see §blockers/divergences. |
| Settings / Policy Guide tabs | `?tab=policyguide` reloads into `privacy-policy-guide.php` (`options-privacy.php:16-19,161-175`) | Iframed (both tabs, classic nav) | full-via-iframe | Native rebuild would need its own tab nav. |
| Page picker | `wp_dropdown_pages(['draft','publish'])` writing `wp_page_for_privacy_policy` (`options-privacy.php:296-313`) | Iframed only | blocked | Option not in REST; page list IS REST-gettable (`/wp/v2/pages`). |
| "Use This Page" | POST `set-privacy-page` + nonce `set-privacy-page`, `update_option` (`options-privacy.php:53-80`) | Iframed (classic) | full-via-iframe / blocked-native | Option write not REST-exposed. |
| Create new Privacy Policy page | POST `create-privacy-page` + nonce, `wp_insert_post` seeded w/ default content, redirect to editor (`options-privacy.php:81-111`) | Iframed (classic) | full-via-iframe / partially-workspace-closable | Page creation IS REST (`POST /wp/v2/pages`); seeding text is server-only. |
| Selected-page validity (deleted / trashed) | Re-checks each load, surfaces error + restore link (`options-privacy.php:114-145`) | Iframed (intact) | full | |
| Edit / View / Preview links to current policy | Conditional Edit/View or Edit/Preview links (`options-privacy.php:206-236`) | Iframed (intact) | full | |
| Policy Guide accordion (default + plugin text) | `WP_Privacy_Policy_Content::privacy_policy_guide()` iterating `wp_add_privacy_policy_content()` contributions (`privacy-policy-guide.php`) | Iframed (intact) | full-via-iframe / blocked-native | Server-only class; no REST. |
| Copy Suggested Text | Clipboard button per section | Iframed (classic JS) | full | |
| `<noscript>` JS-required notice | `wp_admin_notice` hide-if-js (`options-privacy.php:181-188`) | N/A (workspace requires JS) | n/a | |

## Functional divergences

1. **Active panel lives in `useState`, not the URL.** wp-admin gives each Settings page a distinct URL (`options-media.php`); refresh/bookmark/back-button keep you on the same panel. The host reads `segments[0]` only as the *initial* `useState` seed (`settings/index.js:99-100`) and never writes back on `setActive` (`index.js:133`). User-visible consequence: clicking "Privacy" then refreshing returns you to "General"; you cannot bookmark `#/settings/privacy` *through the host*. (The default workspace sidesteps this by giving each panel its own top-level screen — `workspaces/wp-admin-default.json:1162-1237` — so this only bites workspaces that route through the host's internal nav. The app's own `app.md:39` and `constraints[0]` flag it.) NavigationApp's `?screen=` URL-slot pattern is the documented fix.

2. **Unknown sub-route silently falls back instead of 404-ing.** `#/settings/nonexistent` lands on `panels[0]` (`index.js:106-107`) with no notice. wp-admin would 404. Low-impact, documented v1 behavior.

3. **Privacy capability is collapsed to `manage_options`.** Classic gates Privacy on `manage_privacy_options` (`options-privacy.php:12`), a *separate* meta-cap that defaults to `manage_options` but can be granted independently to a Privacy-Officer role (`capabilities.php:797-799`). The workspace screen + host panel both hard-code `manage_options` (`workspaces/wp-admin-default.json:1228-1237`, `settings/index.js:84`). Consequence: a user granted only `manage_privacy_options` (and not `manage_options`) can reach Privacy in wp-admin but is locked out of the workspace's Privacy panel; conversely the workspace never *adds* the privacy cap as an OR alternative. The iframe itself still enforces the real classic cap, so the security floor is correct — only the *workspace-side* gating is coarser than core.

4. **Plugin `add_options_page()` settings do not appear in the host.** In wp-admin a plugin settings page registered under `options-general.php` shows as a Settings submenu item. The host's `BUILTIN_PANELS` is a closed module constant (`index.js:44-87`) with **no plugin registry** (the slot/fill extension was retired — `index.js:38-41`, `app.md:40`). Such pages are instead picked up by the **classic-menu bridge**: its second pass synthesizes an `ingested-options-general-php` *container* (label "Settings") whose children are the plugin's non-core submenu entries (`class-wp-admin-workspaces-classic-menu-bridge.php:255-295`, `scan_children` at `:341-363`), each routed to `/admin/<slugified>` as an `iframe:`-style classic screen. User-visible consequence: a plugin's settings page surfaces in the workspace menu, but in a **second "Settings" group** separate from the native Settings host nav, and opens iframed rather than as a sibling panel. (Cross-reference the plugin-menus parity doc for the bridge's full behavior.)

5. **Help tabs and contextual help sidebars are dropped on every iframed panel.** Media/Permalinks/Privacy all register `add_help_tab` + `set_help_sidebar` (`options-media.php:31-43`, `options-permalink.php:20-69`, `options-privacy.php:35-48`). The iframe chrome-hide CSS suppresses the help dropdown, so this guidance is invisible in the workspace. Applies to all iframed screens, not just Settings.

## API & platform blockers

The core fact, verified against live 7.0 source: **`/wp/v2/settings` exposes only the settings whose `register_setting()` carries a non-empty `show_in_rest`.** `WP_REST_Settings_Controller::get_registered_options()` skips everything else (`class-wp-rest-settings-controller.php:217-264`, esp. `:221-223`). The complete list of REST-exposed settings is `register_initial_settings()` (`option.php:2741-2960`):

- general: `title, description, url, email, timezone, date_format, time_format, start_of_week, language`
- writing: `use_smilies, default_category, default_post_format`
- reading: `posts_per_page, show_on_front, page_on_front, page_for_posts`
- discussion: `default_ping_status, default_comment_status`

A repo-wide grep confirms **none** of the Media/Permalink/Privacy options register `show_in_rest` anywhere in core. Therefore:

| # | Blocker | Missing surface | Tag |
|---|---|---|---|
| 1 | **Media image sizes** — `thumbnail_size_w/h`, `thumbnail_crop`, `medium_size_w/h`, `large_size_w/h` | Not in `/wp/v2/settings` (absent from `register_initial_settings`). No REST field, no dedicated controller. | **[workspace]** — closable without core: register them with `show_in_rest` via `register_setting()`, **or** hook `rest_pre_get_setting` / `rest_pre_update_setting` (`class-wp-rest-settings-controller.php:98,169`), **or** ship a small `/wp-admin-workspaces/v1/settings/media` endpoint doing `update_option`. No side effects on save (`options-media.php` writes via `options.php` Settings API only). The screen spec already plans this (`docs/screens/settings-media.md:201`). |
| 2 | **Media uploads folder** — `uploads_use_yearmonth_folders` (+ conditional `upload_path` / `upload_url_path`) | Not in `/wp/v2/settings`. The conditional-visibility logic for `upload_path`/`upload_url_path` (shown only when non-default) is computed server-side (`options-media.php:122-148`). | **[workspace]** — same mechanisms as #1. The conditional-render rule is workspace-replicable from `get_option` values. |
| 3 | **Permalink structure** — `permalink_structure`, `category_base`, `tag_base` | Not in `/wp/v2/settings`. More importantly, *saving* is **not** a plain option write: it runs `WP_Rewrite::set_permalink_structure()` → `flush_rewrite_rules()` (`options-permalink.php:121-147`) and conditionally **writes the server's `.htaccess` / `web.config`** (`options-permalink.php:149-171`). The REST settings controller can only `update_option` (`class-wp-rest-settings-controller.php`), so even registering these with `show_in_rest` would set the option **without** flushing rewrite rules or writing the rewrite config — leaving the site with stale URLs. | **[upstream]** for a clean REST path (core would need a permalinks endpoint that wraps the rewrite flush + filesystem writers). **[workspace]** is *partially* possible: a custom `/wp-admin-workspaces/v1/settings/permalinks` endpoint can replicate the `WP_Rewrite` setters + `flush_rewrite_rules()` + `.htaccess` writability detection + `mod_rewrite_rules()` echo (this is what `docs/screens/settings-permalinks.md:225` proposes). The `.htaccess` write itself is filesystem-permission-gated and inherently non-REST-idiomatic. Until built, iframe is the right call. |
| 4 | **`.htaccess` / `web.config` writability state + generated rules** | Computed entirely server-side: server detection (`$is_nginx`/`$is_caddy`/`iis7_supports_permalinks()`), `is_writable()` checks, and `WP_Rewrite::mod_rewrite_rules()` (`options-permalink.php:149-200`). No REST representation of any of this exists. | **[upstream]** (or part of the #3 workspace endpoint's response payload). |
| 5 | **Privacy policy page selection** — `wp_page_for_privacy_policy` | Not in `/wp/v2/settings`. Written by a custom POST handler with nonce `set-privacy-page` (`options-privacy.php:53-80`). | **[workspace]** — `update_option`-backed with no side effects; closable via `show_in_rest` registration or a small endpoint. The *page list* it picks from is already REST (`GET /wp/v2/pages?status=draft,publish&context=edit`). |
| 6 | **Privacy page creation w/ default content** | `wp_insert_post` of a draft Page seeded with `WP_Privacy_Policy_Content::get_default_content()` (`options-privacy.php:87-96`). | **[workspace, partial]** — page creation is REST (`POST /wp/v2/pages`). But the **seed content** comes from a server-only PHP class (`class-wp-privacy-policy-content.php`), which is not REST-exposed; the workspace would have to call a shim endpoint to fetch the default policy text + plugin contributions. |
| 7 | **Privacy Policy Guide content** — default + plugin-contributed sections | `WP_Privacy_Policy_Content::privacy_policy_guide()` iterating `wp_add_privacy_policy_content( $plugin, $text )` registrations (`privacy-policy-guide.php` / `class-wp-privacy-policy-content.php`). No REST endpoint surfaces this aggregated HTML. | **[upstream]** for a REST endpoint; **[workspace]** for a shim that calls the class server-side. Content-heavy + tightly coupled to plugin registration — iframe is the pragmatic choice. |
| 8 | **`manage_privacy_options` capability** | The cap exists and is `current_user_can`-checkable, but the workspace screen hard-codes `manage_options` in `permissions.capabilities` (`workspaces/wp-admin-default.json:1228-1237`). | **[workspace]** — add `manage_privacy_options` to the Privacy screen's OR-set in workspace.json. The kernel's OR-semantic cap eval already supports it. |
| 9 | **Plugin settings pages into the host** | No plugin-panel registry on `core:settings` (`index.js:38-41`); the slot/fill extension was retired. | **[workspace]** — reintroduce a panel registry (planned for "v2.x" per `app.md:40`), or accept the classic-menu-bridge's `ingested-*` iframe path as the surfacing mechanism. |
| 10 | **Help tabs / contextual help** for any settings screen | `WP_Screen::add_help_tab()` content is rendered by `admin-header.php`; not exposed via REST. | **[upstream]** to get help-tab content over REST; **[workspace]** is impractical without re-authoring each tab's copy. Currently dropped on iframed panels. |

## DataViews / DataForms review

**N/A for the host.** `core:settings` itself renders no DataViews/DataForm — it is a layout composer using `@wordpress/ui` `Stack` + `@wordpress/components` `ItemGroup`/`Item` for the nav (`settings/index.js:4-8,122-145`). This is idiomatic: WPDS 0.12 has no `ItemGroup`/`Item` port, so the `__experimental*` fallback with a file-scoped eslint pragma (`index.js:1`) follows the project's documented convention. The `Item` nav uses `onClick` (not `href`) for in-app panel switching, which is correct here since the panels aren't separate routes — though note this is the same `Item`-renders-`<button>` behavior the project flags elsewhere (it's intentional for non-navigational tab switching).

For the *missing native panels* (if rebuilt rather than iframed), `DataForm` would be the right tool — and the sibling native panels already prove the pattern: the project's "single-record edit forms use `DataForm`" rule names profile / taxonomy-term / reading / writing / discussion. A native **Media** panel maps cleanly to `DataForm` over `useEntityRecord('root','site')` with integer/boolean fields (once the options are REST-registered per blocker #1). **Privacy**'s page picker maps to a `DataForm` select sourced from `/wp/v2/pages`. **Permalinks** does *not* fit `DataForm` (radio-with-embedded-custom-input + tag buttons + server-side `.htaccess` echo) — it would be hand-rolled like `settings-general` (which `CLAUDE.md` notes "stays hand-rolled" for analogous reasons). No misuse or anti-pattern observed in the host.

## Recommendations / future work

**P1 — Native Media panel (workspace-side, high value, low cost).** Build `core:settings-media` as a `DataForm`/hand-rolled native panel. Requires first registering the 8 media options with `show_in_rest` (a tiny PHP `register_setting` block in the plugin — **[workspace]**, no core change) or a `/wp-admin-workspaces/v1/settings/media` endpoint. No save side effects, so this is the cheapest missing panel to bring to full native parity and removes one iframe. Where: new `src/apps/settings-media/`, PHP registration alongside `includes/`. Tracked in `docs/screens/settings-media.md:267-278`.

**P2 — Move host active-panel state into the URL.** Mirror NavigationApp's `?screen=` slot so refresh/deep-link/back-button preserve the active panel (`settings/index.js:99-100,133`). Pure workspace-side; closes Functional divergence #1. Low effort, removes a documented v1 compromise.

**P2 — Add `manage_privacy_options` to the Privacy screen's permission OR-set.** One-line workspace.json change (`workspaces/wp-admin-default.json:1228-1237`) so a dedicated-Privacy-Officer role can reach the panel, matching `options-privacy.php:12`. Workspace-side. Closes divergence #3 / blocker #8.

**P2 — Native Privacy panel (page picker + create).** The page-select half is workspace-closable (`GET /wp/v2/pages` for the list + a shim/`show_in_rest` for `wp_page_for_privacy_policy`; create via `POST /wp/v2/pages`). The Policy-Guide accordion needs a server shim to expose `WP_Privacy_Policy_Content` output (**[workspace]** shim or **[upstream]** endpoint). Partial native parity is achievable; the guide can stay iframed initially. Where: `src/apps/settings-privacy/`, per `docs/screens/settings-privacy.md`.

**P3 — Permalinks: keep iframed, or build a custom endpoint.** This is the genuine **[upstream]** gap — REST `/wp/v2/settings` structurally cannot flush rewrite rules or write `.htaccess`. A workspace-side `/wp-admin-workspaces/v1/settings/permalinks` endpoint (wrapping `WP_Rewrite` setters + `flush_rewrite_rules()` + writability detection + rule echo, returning `{ writable, server, rules, message }`) is the only native path and is non-trivial; recommend deferring and keeping the iframe (`docs/screens/settings-permalinks.md:305-306` concurs). Long-term, file an upstream request for a permalinks REST controller.

**P3 — Re-introduce a plugin-panel registry on `core:settings`.** Lets `add_options_page()` settings (or `plugin:*` apps) slot as host panels instead of surfacing as a separate `ingested-*` "Settings" group (Functional divergence #4). Workspace-side; the host was explicitly designed to allow this once the surface stabilizes (`app.md:40`). Until then, document the classic-menu-bridge path as the supported mechanism.

**P3 — Surface help-tab content.** All iframed panels drop the classic help tabs (divergence #5). A general fix (expose `WP_Screen` help content, or a per-panel help affordance in the workspace) benefits every iframed screen, not just Settings. Likely **[upstream]** for a REST surface.
