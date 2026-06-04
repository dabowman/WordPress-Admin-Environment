# WP Admin Workspaces — Parity Audit

This directory holds a feature-parity audit of the bundled WP Admin Workspaces apps against the screens they replace in classic wp-admin. It was conducted **2026-05-29 against WordPress 7.0 core** (`/Users/davidbowman/Github/wordpress-develop`). **Methodology:** one agent per app (or per cross-cutting area), each producing a feature-by-feature comparison matrix against the classic counterpart, classifying every gap as a workspace-side build task or a genuine API blocker (and, where relevant, a `@wordpress/dataviews` / `DataForm` component limitation), citing live 7.0 source for each blocker. Verdicts below are taken verbatim from the per-app docs.

Each doc grades on the same scale: **minor-gaps** (near parity; gaps are polish or integration-seam), **major-gaps** (substantial functionality missing, though often buildable), **blocked-by-api** (the dominant blocker is a missing REST/core surface upstream). The companion [roadmap.md](roadmap.md) turns these findings into a prioritized backlog.

## Status table

Sorted most-severe first (blocked-by-api and major-gaps at top).

| App | Classic counterpart | Verdict | Headline blocker | Doc |
|---|---|---|---|---|
| **core:settings-writing** | options-writing.php + options.php | 🔴 blocked-by-api | Post-via-Email / Update Services / `default_link_category` / `use_balanceTags` are editable in classic only via the legacy `$allowed_options` allowlist the REST settings controller never reads — no `show_in_rest` | [settings-writing.md](settings-writing.md) |
| **core:settings-discussion** | options-discussion.php + options.php | 🔴 blocked-by-api | 23 of 25 Discussion options have no `show_in_rest`, so `/wp/v2/settings` never surfaces them — the single largest settings gap (closable workspace-side via `register_setting`) | [settings-discussion.md](settings-discussion.md) |
| **core:settings (host + Media/Permalinks/Privacy)** | options-general/writing/reading/discussion/media/permalink/privacy | 🔴 blocked-by-api | Media/Permalinks/Privacy panels are iframed because none of their options are in `/wp/v2/settings`; Permalinks is a hard blocker (saving flushes rewrite rules + writes `.htaccess` server-side) | [settings-host.md](settings-host.md) |
| **core:tools (Import/Export/Privacy)** | tools.php + import.php + export.php + export/erase-personal-data.php | 🔴 blocked-by-api | A static link-card landing page by necessity — Import/Export/Personal-data have no REST or core-data surface (Export streams WXR via `export_wp()` with no route; the `user_request` post type has no `show_in_rest`), so the workspace iframes wp-admin; cards also hard-navigate out via `window.location.href` | [tools.md](tools.md) |
| **core:posts (Posts & Pages)** | edit.php + WP_Posts_List_Table + inline-edit-post.js | 🟠 major-gaps | Idiomatic DataViews list but missing Quick Edit, Bulk Edit, status/Mine tab strip, sticky, comment bubble, post-lock, Pages tree; most buildable, true blockers are post-lock + per-row comment count | [posts.md](posts.md) |
| **core:media (Media Library)** | upload.php + media-new.php + WP_Media_List_Table + image-edit.php | 🟠 major-gaps | Minimal grid + metadata modal; missing list table, image editor, bulk actions, drag-drop, search/filters — ~half buildable (incl. crop/rotate/flip via `/edit`); narrow blockers (in-place save, scale, restore, batch delete) | [media.md](media.md) |
| **core:taxonomy (Categories/Tags)** | edit-tags.php + term.php + WP_Terms_List_Table | 🟠 major-gaps | Flat list missing hierarchy + parent picker; bundled workspace ships **Tags with an empty DataView** (regression). Blockers: reassign-on-delete, custom-tax default-term protection | [taxonomy.md](taxonomy.md) |
| **core:users** | users.php + user-new.php + WP_Users_List_Table | 🟠 major-gaps | Thin list with one action (delete-and-reassign-to-self); missing add-user, edit-nav, change-role bulk, send-reset. Blockers: no password-reset REST, no login sort, no post/role counts, multisite | [users.md](users.md) |
| **core:comments** | edit-comments.php + WP_Comments_List_Table + edit-comments.js | 🟠 major-gaps | Solid moderation list but no inline Reply, Quick Edit, full Edit screen, or Author email/URL/IP/avatar; default workspace ships a degraded action set (drops Unapprove, adds an inert Reply) | [comments.md](comments.md) |
| **core:plugins** | plugins.php + plugin-install.php + plugin-editor.php | 🟠 major-gaps | Only the installed-plugin manager; the whole Add-New directory, update flow, auto-update, file editor, must-use/drop-ins, dependency gating are absent — most are hard REST blockers | [plugins.md](plugins.md) |
| **core:themes** | themes.php + theme-install.php | 🟠 major-gaps | Read-side grid is strong, but the whole management surface is absent or broken — **Activate POSTs to an unregistered endpoint and silently fails** (nonce-less fallback) | [themes.md](themes.md) |
| **core:profile** | profile.php + user-edit.php + user.php | 🟠 major-gaps | Minimal 7-field form; omits Personal Options, Account Management, Application Passwords (fully REST-reachable but unbuilt), contact methods, avatar, edit-other-user | [profile.md](profile.md) |
| **core:settings-general** | options-general.php + options.php | 🟠 major-gaps | Renders 4 controls (Site Address, anyone-can-register, default role, manual UTC offset) that are silent no-ops because core 7.0 doesn't REST-register those options; Site Icon + admin-email confirm absent | [settings-general.md](settings-general.md) |
| **core:settings-reading** | options-reading.php + options.php | 🟠 major-gaps | Only 3 of 6 reading options round-trip; `posts_per_rss` + `rss_use_excerpt` render as live fields that silently discard input (no `show_in_rest`); `blog_public` omitted | [settings-reading.md](settings-reading.md) |
| **core:dashboard / dashboard-host** | index.php + dashboard.php | 🟠 major-gaps | Two divergent dashboards (rich app no workspace mounts + thin 2-widget host that ships); none of At a Glance / Activity / Events / Site Health / Welcome; third-party widgets surface not at all | [dashboard.md](dashboard.md) |
| **Block Editor (core:editor + core:simple-editor)** | post.php + post-new.php + edit-form-blocks.php | 🟠 major-gaps | Iframe editor is near-parity but has broken seams (dirty-state declared-not-wired, no iframeBridge, no session recovery); simple-editor writes published posts to the live record where core would autosave | [block-editor.md](block-editor.md) |
| **core:site-health** | site-health.php + class-wp-site-health.php + class-wp-debug-data.php | 🟠 major-gaps | Thin runner for the 5 async tests only; omits ~22 sync tests, the entire Info/debug tab, the score donut, severity grouping — and the missing tests + debug report have no REST surface | [site-health.md](site-health.md) |
| **core:appearance (Appearance group)** | themes.php (group root) + customize/widgets/nav-menus/theme-editor/font-library | 🟠 major-gaps | `core:appearance` is a mis-named user-prefs panel, not the Appearance hub; Customize+Widgets orphaned, Menus/Header/Background missing; Customizer + Theme File Editor are hard blockers | [appearance.md](appearance.md) |
| **core:site-editor** | site-editor.php + @wordpress/edit-site SPA | 🟢 minor-gaps | One-line iframe delegation → full parity by inheritance; all gaps are at the seam (no workspace exit, no deep-linking, no dirty-state bridge, fragile chrome-hide CSS) | [site-editor.md](site-editor.md) |
| **system & chrome apps** | admin bar + admin notices + chrome | 🟢 minor-gaps | Mostly workspace-native by design, but two real gaps: third-party admin-bar nodes are rendered-but-buried (no bridge), and plugin `admin_notices` HTML is echoed-but-never-surfaced | [system-and-chrome-apps.md](system-and-chrome-apps.md) |
| **plugin menus & screens** | add_menu_page / add_submenu_page / admin menu | 🟢 minor-gaps | Plugin UI reliably surfaces via auto-ingestion + a faithful same-origin iframe; gaps are placement/ordering/icons/screen-options + unbridged admin-bar & `admin_notices` | [plugin-menus-and-screens.md](plugin-menus-and-screens.md) |
| **DataViews / DataForm limits** | cross-cutting component layer | 🟢 minor-gaps | Shared harness is idiomatic; the parity ceiling is genuine DataViews limits (inline edit, bulk edit, custom operators, row DnD), but a meaningful tranche is closeable today with unused v14 APIs | [dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md) |

## Cross-cutting themes

The same handful of root causes recur across nearly every doc. Grouping them clarifies where one fix unblocks many apps.

### Recurring API blockers

**1. REST settings-coverage gaps (`show_in_rest` defaults to false).** The single most common blocker. The REST settings controller (`WP_REST_Settings_Controller::get_registered_options`) only surfaces options registered with `show_in_rest`; everything else is silently dropped on PATCH while `useEntityRecord.save()` still reports success. This produces *silent no-op fields* — controls that render, accept input, claim "Settings saved.", and discard the value. It blocks:
- **settings-discussion** — 23 of 25 options ([settings-discussion.md](settings-discussion.md)).
- **settings-writing** — Post-via-Email block, Update Services, `default_link_category`, `use_balanceTags` ([settings-writing.md](settings-writing.md)).
- **settings-reading** — `posts_per_rss`, `rss_use_excerpt`, `blog_public` ([settings-reading.md](settings-reading.md)).
- **settings-general** — `home`, `users_can_register`, `default_role`, `gmt_offset`, `site_icon`, `new_admin_email` ([settings-general.md](settings-general.md)).
- **settings host (Media/Privacy)** — media image sizes, uploads-folder, `wp_page_for_privacy_policy` ([settings-host.md](settings-host.md)).
- **plugin settings pages** — a third-party plugin's options are invisible to REST unless the author opts in, so a native rebuild is impossible — the iframe is the only faithful path ([plugin-menus-and-screens.md](plugin-menus-and-screens.md)).

Critically, *most* of these are closable workspace-side today via `register_setting(..., ['show_in_rest'=>true])` on `rest_api_init` (core options) — `get_registered_options` reads the live registry — without any upstream change. Only the Settings-API field-enumeration (`do_settings_fields`/`do_settings_sections`) and server-side section-visibility filters truly need upstream work.

**2. No-REST-for-X write actions.** Many classic actions invoke a PHP function that has no REST wrapper:
- **password reset** — `retrieve_password()` is admin-only; no endpoint ([users.md](users.md), [profile.md](profile.md)).
- **theme activate / delete** — themes controller is read-only (`switch_theme()` is server-side); the app even POSTs to an *unregistered* workspace endpoint and silently fails ([themes.md](themes.md)).
- **plugin update / auto-update toggle** — real upgrade is `Plugin_Upgrader` via admin-ajax; `auto_update_plugins` not `show_in_rest` ([plugins.md](plugins.md)).
- **term reassign-on-delete** — REST `delete_item` calls `wp_delete_term` with no `reassign` arg ([taxonomy.md](taxonomy.md)).
- **post lock / restore-from-revision / draft preview-nonce** — admin-ajax + Heartbeat + post-meta only ([posts.md](posts.md), [block-editor.md](block-editor.md)).
- **session destruction, email-change confirm flow, HTTPS migration** — admin-ajax / wp-admin POST actions only ([profile.md](profile.md), [settings-general.md](settings-general.md), [site-health.md](site-health.md)).
- **content export / import / privacy-data requests** — `export.php` streams WXR via `export_wp()` then `die()`s with no `register_rest_route`; importers run server-side; the `user_request` post type is registered without `show_in_rest` ([tools.md](tools.md)).

**3. admin-ajax-only operations.** Operations with no schema, no discovery, and page-localized nonces: WordPress Events widget, plugin/theme upgrades, image-edit live preview + restore, session destroy, `wp_ajax_<action>` plugin handlers. They work natively *inside* an iframe but can't be enumerated or called from native React ([dashboard.md](dashboard.md), [media.md](media.md), [plugin-menus-and-screens.md](plugin-menus-and-screens.md)).

**4. The .org directory APIs are not REST.** `plugins_api()` / `themes_api()` issue cross-origin HTTP to api.wordpress.org and are *not* WP REST endpoints; the wp.org-shaped fields (ratings, active installs, compatibility, sections, icons) never appear in `/wp/v2`. This blocks the entire Add-New browse/search/cards/More-Details flow for both plugins and themes — requiring a workspace-side proxy ([plugins.md](plugins.md), [themes.md](themes.md)).

**5. Server-rendered HTML with no data model.** A plugin page callback `echo`es opaque server markup; the WP_Admin_Bar node tree and pending `admin_notices` are `do_action`+echo with no fetchable structure; classic dashboard widgets register a PHP `$callback` that echoes HTML. The React kernel can't execute these, so the iframe (or a server-side `get_nodes()` / output-buffer bridge) is the only path ([plugin-menus-and-screens.md](plugin-menus-and-screens.md), [system-and-chrome-apps.md](system-and-chrome-apps.md), [dashboard.md](dashboard.md)).

**6. File-write / `.htaccess` / rewrite-flush operations.** Saving Permalinks runs `WP_Rewrite::set_permalink_structure()` → `flush_rewrite_rules()` and writes `.htaccess`/`web.config`; the REST settings controller can only `update_option`, so it structurally cannot reproduce these side effects. The Theme File Editor and Plugin File Editor write files via nonce-gated admin-ajax (and are gated by `DISALLOW_FILE_EDIT`). These are genuine hard blockers, not workspace shortcomings ([settings-host.md](settings-host.md), [appearance.md](appearance.md), [plugins.md](plugins.md)).

**7. No aggregate-count endpoints.** `wp_count_posts` / `wp_count_comments` / `wp_count_attachments` / `count_users` are PHP-only; the workspace fakes per-status/role counts with N `?per_page=1` + `X-WP-Total` requests (one per status/role/type). Correct but N+1 at scale; flagged across posts, comments, media, users, dashboard ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md) §1.2).

### Recurring DataViews / DataForm limitations

Catalogued authoritatively in [dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md) against `@wordpress/dataviews@14.0.0`. The harness itself is idiomatic; these are *component* ceilings (or unused v14 features):

- **No inline Quick Edit / editable-cell primitive** — `Field.Edit` is only used by DataForm + the filter widget, never an in-place table cell. Blocks Quick Edit (posts, taxonomy, comments), and inline comment Reply. Pragmatic stand-in: a `RenderModal` + `DataForm`. **(upstream)**
- **No bulk-edit-form primitive** — bulk actions are action-only; "edit N fields on M rows" must be hand-rolled as a bulk modal. Blocks posts Bulk Edit, users "Change role to…". **(upstream primitive / workspace workaround)**
- **No hierarchical/indented rows wired** — v14 *shipped* `getItemLevel` + `View.showLevels`, but the workspace renders categories and the Pages tree flat and the term form has no parent picker. **Closeable today**, no API blocker (client-side tree-sort).
- **No native count slot on filter elements** — wp-admin's status tab strip (`All|Mine|Published…` with counts) is emulated by folding the count into the option label, yielding a dropdown not a tab strip, at N+1 request cost. **(upstream count slot / workspace 1-request endpoint)**
- **Closed operator set** — `OPERATORS` is a fixed array with no register function; custom filter semantics can't be expressed. (Note: `before`/`after`/`between`/`inThePast` *do* exist and are simply unwired — date/category/format filters are closeable today.) **(upstream)**
- **No row drag-reorder API** — `enableMoving` covers columns only; blocks nav-menu/widgets/`menu_order` screens. **(upstream)**
- **No expandable/inline detail-row API** — substituted by a `RenderModal` "Details" action. **(upstream)**
- **No `<optgroup>` in select / no media-library-picker Edit control / no range slider** — forces hand-rolled `@wordpress/components` controls (Site Language, Timezone, Site Icon). CLAUDE.md already mandates settings-general stay hand-rolled. **(upstream native / workspace escape hatch)**
- **Form validation unwired** — fields declare `isValid` rules but `EntityDataForm` never passes `validity` / calls `useFormValidity`; Save gates on `hasEdits` only. **Closeable today.**
- **View state not persisted** — the resync `useEffect` re-seeds from `defaultView` on every navigation, so Screen-Options-equivalent column-hide/sort/perPage choices are lost on reload despite the workspace having a `/prefs` REST surface. **Closeable today** — the biggest Screen Options gap.
- **Dead `isDestructive` metadata** — `buildActions` still sets `compiled.isDestructive`, which DataViews' Action type ignores (styling happens inside the app's own modal). Harmless but misleading; cross-cutting across all six list apps.

## Dedicated cross-cutting docs

Two docs are not about a single app but about a shared surface:

- **[plugin-menus-and-screens.md](plugin-menus-and-screens.md)** — How third-party plugin admin UI surfaces in the workspace. Verdict **minor-gaps**: the classic-menu bridge auto-ingests every `add_menu_page`/`add_submenu_page` registration into a faithful same-origin iframe (correct `$hook_suffix`, nonces, admin-ajax, Settings-API form posts all work natively). The gaps are placement/ordering/icon-harvesting/screen-options and the unbridged admin-bar + `admin_notices` surfaces — not the "does my page show up and work" contract.

- **[dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md)** — The component-level parity ceiling shared by every entity-CRUD app. Verdict **minor-gaps**: the shared `_shared/dataviews` + `_shared/forms` harness is idiomatic and correct; the real ceiling is genuine `@wordpress/dataviews@14.0.0` limitations (inline edit, bulk edit, custom operators, row DnD, count slots, optgroups), but a meaningful tranche (hierarchical rows, date/category/format filters, view persistence, form-validation wiring) is closeable today with v14 APIs the workspace simply hasn't adopted.
