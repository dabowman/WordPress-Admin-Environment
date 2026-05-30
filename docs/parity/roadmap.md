# WP Admin Shell — Parity Roadmap

Prioritized backlog synthesized from the per-app parity audits ([README.md](README.md)), conducted 2026-05-29 against WordPress 7.0 core. Grouped by the kind of work required:

- **(A) Shell-side work we can do now** — no API blocker; pure shell engineering.
- **(B) Upstream WP core / REST API gaps** — file these with the specific missing endpoint/field/option.
- **(C) `@wordpress/dataviews` + DataForm feature requests** — component-layer asks.
- **(D) Documentation gaps** — missing/stale `docs/screens` specs and app docs.

Tags: `[shell]` closeable in this repo; `[upstream]` needs WordPress core/REST; `[dataviews]` needs the component package. Within each group, P1 = highest parity value / correctness, P3 = polish.

---

## (A) Shell-side work we can do now (no API blocker)

### P1 — correctness bugs + highest-value missing functionality

1. **Register `POST /wp-admin-shell/v1/activate-theme` (or inject a real `&_wpnonce=`).** *core:themes.* The Activate action POSTs to an endpoint that is **not registered anywhere**, then falls back to a nonce-less wp-admin link that silently fails — theme activation is non-functional on a clean install. Also surface an error Notice on failure instead of silently navigating away. ([themes.md](themes.md))

2. **Fix the bundled-shell Comments regression.** *core:comments.* `wp-admin-default.json` redeclares the comment dataView triple and wins outright, **dropping the `unapprove` action and adding an inert callback-less `reply` action** — the shipped default can't un-approve from the list and the Reply button does nothing. Restore `unapprove`, remove/implement `reply`, and add explicit `type:'comment'` to harden against pings leaking. ([comments.md](comments.md))

3. **Fix the empty Tags DataView.** *core:taxonomy.* `wp-admin-default.json` never declares the `taxonomy.post_tag` triple and the app baseline binds only to `category`, so the Tags screen renders **zero columns and zero actions** — a blank, broken table. Declare `post_tag._default` mirroring the category baseline *completely* (partial redeclaration silently drops keys), and/or add a built-in field fallback in the app. A regression, not a gap. ([taxonomy.md](taxonomy.md))

4. **Fix the `isAny` role-filter drop.** *core:users.* The `administrators` variant declares its role filter with operator `isAny` but the queryArgs mapper only handles `is`, so that filter — and any multi-select role filter — is silently dropped from the REST query. Map `isAny`→`args.roles = value.join(',')` (REST `role__in` already supports it). A correctness bug. ([users.md](users.md))

5. **Stop simple-editor auto-saving PUBLISHED posts to the live record.** *core:simple-editor.* The 2s debounce PUTs the live published record where core would write a safe per-user autosave — a data-integrity divergence. Gate the debounce to draft/pending and route published autosaves to `POST .../autosaves`, or disable auto-save for published. ([block-editor.md](block-editor.md))

6. **Wire (or remove) core:editor's declared dirty-state + install `iframeBridge` + port session-expiry recovery.** *core:editor.* `core:dirty-state` is declared in the manifest but never wired, so a sidebar click discards unsaved iframe edits with no confirm; `installIframeBridge` (already used by iframe-fallback) is absent, so View-Post / post-trash redirects break out of the workspace; a mid-edit timeout shows a stripped login form silently. ([block-editor.md](block-editor.md))

7. **Add `catch` + per-file error notice to media upload.** *core:media.* `handleUpload` has `try/finally` but no `catch`, so a failed upload (oversize / bad MIME / quota) rejects silently with no notice. ([media.md](media.md))

8. **Wire the already-declared-but-inert Posts trash actions + a Trash view.** *core:posts.* Restore + Delete-Permanently are declared in `app.json` but have no callbacks in `index.js`, so they're inert. Wire `updateEntityRecord(status:'draft')` and `deleteEntityRecord(force:true)`. ([posts.md](posts.md))

9. **Fix the Site Health correctness bugs.** *core:site-health.* The Authorization-header test doesn't send the `Authorization: Basic` probe header (wrong result), and failed/unavailable tests are scored as *critical* instead of *recommended* like classic — making the (already-incomplete) score actively misleading. ([site-health.md](site-health.md))

10. ✅ **Done — stop rendering silently-broken settings controls (backed with shims).** *core:settings-general / settings-reading.* Controls for `home`, `users_can_register`, `default_role`, manual UTC offset (general) and `posts_per_rss`, `rss_use_excerpt` (reading) rendered, accepted input, showed "Settings saved.", and discarded the value because those options aren't `show_in_rest`. **All six are now backed shell-side** (`wp-admin-shell.php`): `home`/`users_can_register`/`default_role` + `posts_per_rss`/`rss_use_excerpt` get `register_setting(show_in_rest)` shims, and the manual UTC offset is routed to `gmt_offset` via a `rest_pre_update_setting` filter (mirroring `wp-admin/options.php`). `blog_public` / `site_icon` remain separate gaps. ([settings-general.md](settings-general.md), [settings-reading.md](settings-reading.md))

11. **Build the Posts Bulk Edit panel.** *core:posts.* The single biggest functional gap; a DataForm-driven panel batching `updateEntityRecord` over changed fields only (status/author/sticky/parent/format/comment_status/categories/tags — all REST-writable). ([posts.md](posts.md))

12. **Build Application Passwords management.** *core:profile.* List / add-with-once-reveal / revoke / revoke-all via `/wp/v2/users/me/application-passwords` — fully REST-reachable, the biggest absent-but-reachable Profile feature. ([profile.md](profile.md))

13. **Migrate MediaApp to `@wordpress/dataviews` (grid + table).** *core:media.* The single highest-leverage Media change — adopt `_shared/dataviews/*` to unblock list view, sort, search, filters, selection, bulk delete (via `createBulkConfirmModal`, N parallel `DELETE ?force=true`). Wire search + date + author + Mine + Unattached(`parent[]=0`) filters (all REST-ready). ([media.md](media.md))

14. **Add the "Change role to…" bulk action.** *core:users.* `RenderModal` + role SelectControl → per-target `PUT /wp/v2/users {id,roles}` (needs only `promote_user`, enforces self-demote guard). Fully REST-supported; highest-impact missing user action. ([users.md](users.md))

### P2 — meaningful parity, shell-side

15. **Add the status/Mine/Sticky view-tab strip to Posts; surface comment status views as tabs.** Reuse the existing count engine; sticky is fully REST-exposed (field + query param + cap link). ([posts.md](posts.md), [comments.md](comments.md))

16. **Render the Comments Author column fully** (email mailto + author URL + IP + avatar) and **render the Users username cell** (avatar from `avatar_urls`, mailto email, translated role display names instead of raw slugs) — all fields already on the records. ([comments.md](comments.md), [users.md](users.md))

17. **Wire the missing Comments status verbs** — Not Spam (unspam), Restore (untrash) via the existing status-PATCH path; Delete Permanently via `force:true`. ([comments.md](comments.md))

18. **Build inline Reply + Quick Edit + full single-comment Edit** using the shared `_shared/forms` DataForm scaffolding (all fields REST-writable via PATCH). ([comments.md](comments.md))

19. **Hierarchical parent picker + tree display for Categories.** DataForm integer field + async indented elements from `/wp/v2/{rest_base}?per_page=100`; client-side tree build + depth-prefix name renderer + `aria-level`. REST `parent` fully supported. ([taxonomy.md](taxonomy.md))

20. **Default-category protection for `category`.** Read `default_category` from `GET /wp/v2/settings`; badge that row and make it delete-ineligible. ([taxonomy.md](taxonomy.md))

21. **Build native `core:settings-media`.** Register the 8 media options with `show_in_rest` (no save side effects) + a DataForm/hand-rolled panel — cheapest missing Settings panel to bring to full native parity, removes one iframe. ([settings-host.md](settings-host.md))

22. **Ship a `manage_options`-gated `/wp-admin-shell/v1` settings shim** replicating `sanitize_option` for the blocked writing/discussion options, then expand the DataForms — the only path to true field parity short of upstream. (Discussion is closable via `register_setting` alone, see B-P1.) ([settings-writing.md](settings-writing.md), [settings-discussion.md](settings-discussion.md))

23. **Build the document-settings sidebar for simple-editor** via the existing `core:editor.sidebar` Slot (featured image / taxonomy / excerpt / slug / visibility / schedule / author / discussion / page attributes — all REST-reachable), unblocking the Publish/Schedule state machine. ([block-editor.md](block-editor.md))

24. **Build a native `core:menus` app** over `/wp/v2/menus` + `/wp/v2/menu-items` + `/wp/v2/menu-locations` — fully REST-rebuildable, zero shell coverage today, biggest Appearance functional hole. ([appearance.md](appearance.md))

25. **Add a `wp_admin_shell_data` pass that prunes the Appearance menu by `theme_supports` + `wp_is_block_theme()`** (active-theme `theme_supports` is REST-readable); rename `core:appearance` (the user-prefs panel) to free the "Appearance" name and fix its orphaned-screen wiring. ([appearance.md](appearance.md))

26. **Build the single-site Add New User flow** (`POST /wp/v2/users`) into the existing-but-empty `core:users-new` screen; wire row navigation to an Edit User app + "View posts" row action. ([users.md](users.md))

27. **Add Interface Language (locale) + a basic password-change field to Profile** (both REST-writable; document the no-reauth / no-server-weak-gate caveats). ([profile.md](profile.md))

28. **Add a custom `GET /wp-admin-shell/v1/site-health/tests` + `/info` endpoint** wrapping `WP_Site_Health::get_tests()` and `WP_Debug_Data::debug_data()` server-side — unblocks the ~22 missing sync tests, plugin extensibility, the score donut, severity grouping, and the entire Info tab (server-only PHP, but the shell can wrap it). ([site-health.md](site-health.md))

29. **Build the inline image editor (crop/rotate/flip)** POSTing `modifiers[]` to `/wp/v2/media/{id}/edit` — fully REST-supported (note the response is a *new* attachment). ([media.md](media.md))

30. **Install-by-slug UI + "Add New Plugin" header action.** `POST /wp/v2/plugins {slug,status}` already works — no upstream needed. ([plugins.md](plugins.md))

31. **Carry `$position` from the `$menu` numeric key into ingested plugin items + nest core-parented plugin submenus under the matching shell menu** (Settings/Tools, not a generic "Plugins" bucket) + **harvest `data:`/image-URL menu icons**. ([plugin-menus-and-screens.md](plugin-menus-and-screens.md))

32. **Bridge `admin_bar_menu` nodes into the shell toolbar** (`$wp_admin_bar->get_nodes()` is introspectable server-side) and **surface plugin `admin_notices`** by buffering the hook output into `core:notices-banner` — both fully closable without upstream; their absence silently breaks the feedback loop for every un-ported plugin. ([system-and-chrome-apps.md](system-and-chrome-apps.md), [plugin-menus-and-screens.md](plugin-menus-and-screens.md))

33. **Make `+New` (toolbar-actions) dynamic** from `GET /wp/v2/types?context=edit` + create-cap gating, matching wp-admin's runtime post-type enumeration. ([system-and-chrome-apps.md](system-and-chrome-apps.md))

### P3 — polish / lower value

34. **Wire `useFormValidity` into `EntityDataForm`** (pass `validity`, gate Save on it) — fields already declare `isValid` rules that are currently inert across all form apps. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md))

35. **Persist DataViews `view` (column-hide/sort/perPage) to user prefs** via the existing `/prefs` REST so Screen-Options-equivalent state survives navigation/reload — the biggest Screen Options gap. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md), [posts.md](posts.md))

36. **Wire date/category/format filters** on Posts (operators + REST `before`/`after`/`categories`/`format` all exist — just unwired in the `view→queryArgs` memo); same for Media. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md), [posts.md](posts.md))

37. **Resolve the two-dashboard confusion + fix the cross-author draft leak.** Either wire `core:dashboard` into a shell or fold it into the host and delete it; add `author:userId` to the Recent Drafts query (a one-liner — currently shows all users' drafts site-wide). Build At a Glance + Activity tiles. ([dashboard.md](dashboard.md))

38. **Build a classic dashboard-widget bridge** mirroring the classic-menu bridge (walk `$GLOBALS['wp_meta_boxes']['dashboard']` → iframe/captured-HTML tiles) to surface plugin dashboard widgets; document the JS-loss limitation. ([dashboard.md](dashboard.md))

39. **Drop the dead `isDestructive` mapping** in `_shared/dataviews/buildActions.js` (DataViews ignores it) — cross-cutting across all six list apps. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md))

40. **Move host/Settings active-panel + Media pagination/filter state into URL slots** (mirror NavigationApp) so refresh/deep-link survive; add `manage_privacy_options` to the Privacy screen's OR-set. ([settings-host.md](settings-host.md), [media.md](media.md))

41. **Smaller read-side wins:** Plugins author link via `author_uri` + broaden search to author + render PHP/WP-incompat row from existing `requires_*` fields; Themes `enableGlobalSearch` on description/author + child-theme parent from `template` + tags + Live Preview link via `is_block_theme`; Posts state badges + status-aware date label; Comments config.post deep-link + Pings filter; build the Add-New screens (plugins/themes) behind a `themes_api`/`plugins_api` proxy or interim iframe. ([plugins.md](plugins.md), [themes.md](themes.md), [posts.md](posts.md), [comments.md](comments.md))

42. **Route `core:tools` landing cards through `navigate()` instead of `window.location.href`.** *core:tools.* The cards hard-navigate out of the workspace (`index.js:108-115`) even though `wp-admin-default.json` already defines in-shell iframe screens at `/tools/import` etc.; they should `navigate()` to the screen id. Also fixes a CLAUDE-rule violation (no `window.location.href` for workspace links). A small correctness/UX fix despite the P3 placement. ([tools.md](tools.md))

---

## (B) Upstream WP core / REST API gaps to file

### P1 — blocks whole feature areas; affects multiple apps

1. **`show_in_rest` on the legacy settings options** (`register_initial_settings()`, `wp-includes/option.php`). The single largest cross-cutting blocker. Specifically missing: **Discussion** — 23 options (`default_pingback_flag`, `require_name_email`, `comment_registration`, `close_comments_for_old_posts`, `close_comments_days_old`, `thread_comments`, `thread_comments_depth`, `page_comments`, `comments_per_page`, `comment_order`, `comments_notify`, `moderation_notify`, `comment_moderation`, `comment_previously_approved`, `comment_max_links`, `moderation_keys`, `disallowed_keys`, `show_avatars`, `avatar_rating`, `avatar_default`, …); **Writing** — `mailserver_url/port/login/pass`, `default_email_category`, `ping_sites`, `default_link_category`, `use_balanceTags`; **Reading** — `posts_per_rss`, `rss_use_excerpt`, `blog_public`; **General** — `home`, `users_can_register`, `default_role`, `gmt_offset`, `site_icon`, `new_admin_email`; **Media** — `thumbnail_size_w/h`, `thumbnail_crop`, `medium_size_w/h`, `large_size_w/h`, `uploads_use_yearmonth_folders`. *Affected: all four settings panels + the settings host.* ([settings-discussion.md](settings-discussion.md), [settings-writing.md](settings-writing.md), [settings-reading.md](settings-reading.md), [settings-general.md](settings-general.md), [settings-host.md](settings-host.md))

2. **A REST surface for the Settings API field registry** (`do_settings_fields` / `do_settings_sections` / `$wp_settings_fields`). With no REST projection, plugin-registered settings fields can never render natively in any settings panel — the single largest *structural* settings blocker. *Affected: every settings panel + native plugin settings rebuilds.* ([settings-writing.md](settings-writing.md), [settings-host.md](settings-host.md), [plugin-menus-and-screens.md](plugin-menus-and-screens.md))

3. **A plugin-update REST surface** — run `Plugin_Upgrader::bulk_upgrade` over REST + add `update`/`new_version`/`update_available` fields to the plugin item schema. Unblocks inline update-now, bulk update, and the Update-Available indicator (the real upgrade is admin-ajax-only today). *Affected: core:plugins.* ([plugins.md](plugins.md))

4. **A `.org` directory proxy / REST wrapper for `plugins_api()` + `themes_api()`** — the biggest single gap for both Add-New flows (browse/search/cards/ratings/active-installs/compatibility/More-Details). `plugins_api`/`themes_api` issue cross-origin HTTP to api.wordpress.org and are not REST. (Interim: shell-side `/wp-admin-shell/v1/plugins-directory` + `/themes-directory` proxies.) *Affected: core:plugins, core:themes.* ([plugins.md](plugins.md), [themes.md](themes.md))

5. **Writable theme status + DELETE on the themes controller.** `WP_REST_Themes_Controller` is read-only; theme activation (`switch_theme()`) and deletion have no REST route. Add a writable `status` (activate) and `DELETE /wp/v2/themes/{stylesheet}`. *Affected: core:themes (Activate is non-functional today).* ([themes.md](themes.md))

6. **A password-reset REST action** wrapping `retrieve_password()` (e.g. `POST /wp/v2/users/{id}/password-reset`). No endpoint exists; classic calls `retrieve_password()` directly. *Affected: core:users (bulk + row action), core:profile.* ([users.md](users.md), [profile.md](profile.md))

### P2 — blocks a specific high-value feature

7. **Expose post-lock status via REST** (a read field / computed `_fields=lock` returning holder + freshness, with a refresh path) — `wp_check_post_lock`/`wp_set_post_lock` are admin-only + Heartbeat-driven. Add the same for the editor: a `lock` acquire/refresh/takeover surface. Without it, "X is currently editing" and concurrent-edit protection are impossible. *Affected: core:posts, core:editor, core:simple-editor.* ([posts.md](posts.md), [block-editor.md](block-editor.md))

8. **Add `comment_count` (+ pending) to the REST posts schema** — only `comment_status` + an embeddable replies link exist today; the per-row comment bubble requires N requests otherwise. *Affected: core:posts.* ([posts.md](posts.md))

9. **Auto-update toggle via REST** — register `auto_update_plugins` / `auto_update_themes` with `show_in_rest` (verified *not* registered today, so `POST /wp/v2/settings` can't reach them) or a dedicated route; the real toggle is admin-ajax `wp_ajax_toggle_auto_updates`. *Affected: core:plugins, core:themes.* ([plugins.md](plugins.md), [themes.md](themes.md))

10. **`login`/`username` in the REST users `orderby` enum + mapping** (`class-wp-rest-users-controller.php:1605-1616`) — `WP_User_Query` can order by login but the controller doesn't expose it, so the shell can't match classic's default sort. *Affected: core:users.* ([users.md](users.md))

11. **Aggregate-count endpoints / fields** — expose `count_users` + `wp_get_users_with_no_role` (role tabs + "No role" bucket), per-user `post_count` (`count_many_users_posts`), and post/comment/attachment status counts (`wp_count_posts`/`wp_count_comments`/`wp_count_attachments`). Replaces the N+1 `X-WP-Total` workaround everywhere. *Affected: core:users, core:posts, core:comments, core:media, core:dashboard.* ([users.md](users.md), [dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md) §1.2)

12. **`reassign` param on the terms DELETE controller** — REST `delete_item` calls `wp_delete_term` with no args, so "reassign posts to another term before deleting" is impossible; also expose custom-tax `default_term_{taxonomy}` (or a per-term protected flag) and a distinct protected-default error code. *Affected: core:taxonomy.* ([taxonomy.md](taxonomy.md))

13. **Image-edit REST extensions** — a `scale`/`resize` modifier, a per-size `target` arg, a restore-original route, and an in-place/replace mode on `POST /wp/v2/media/{id}/edit` (which today always creates a new attachment). *Affected: core:media.* ([media.md](media.md))

14. **A restore-from-revision REST route + `preview_nonce` in the posts schema** — revision read/delete are REST but *restore* is a nonce-gated wp-admin POST; draft preview URLs can't be built natively. *Affected: core:editor, core:simple-editor.* ([block-editor.md](block-editor.md))

15. **`send_user_notification` arg on `POST /wp/v2/users`** + multisite invite/remove/delete surfaces (DELETE returns 501 on multisite; `add_existing_user_to_blog`/`remove_user_from_blog` have no REST). *Affected: core:users.* ([users.md](users.md))

### P3 — structural / strategic upstream asks

16. **A `wp/v2/admin-menu` REST endpoint** returning the assembled, cap-pruned, `menu_order`-sorted `$menu`/`$submenu` — gives correct plugin-menu ordering + icons + headless reconstruction without scraping PHP globals during a live admin request. *Affected: plugin menus.* ([plugin-menus-and-screens.md](plugin-menus-and-screens.md))

17. **A data model + REST surface for the WP_Admin_Bar node tree and pending admin notices** — both are `do_action`+echo today with no fetchable structure, blocking faithful chrome integration for any alternative admin. *Affected: system/chrome apps, plugin menus.* ([system-and-chrome-apps.md](system-and-chrome-apps.md), [plugin-menus-and-screens.md](plugin-menus-and-screens.md))

18. **Site Health over REST** — the ~22 direct/sync tests + the full `WP_Debug_Data` report have no REST endpoint (only per-id async tests + directory-sizes); a bare `/wp-site-health/v1/tests` index would also expose plugin-contributed tests. *Affected: core:site-health.* ([site-health.md](site-health.md))

19. **Surface `WP_Screen` help-tab content over REST** — dropped on every iframed panel; benefits all screens. *Affected: cross-cutting.* ([settings-host.md](settings-host.md), multiple)

20. **An attachment-count aggregate + an insert-from-URL sideload endpoint; lift attachments `allow_batch=false`** for true batch delete. *Affected: core:media.* ([media.md](media.md))

21. **A Permalinks REST controller** (or accept that it stays iframed) — `/wp/v2/settings` structurally cannot flush rewrite rules or write `.htaccess`. Likewise the Theme/Plugin File Editor (file-write via admin-ajax, gated by `DISALLOW_FILE_EDIT`) — genuine hard blockers. *Affected: settings host, core:appearance, core:plugins.* ([settings-host.md](settings-host.md), [appearance.md](appearance.md), [plugins.md](plugins.md))

22. **Confirmation flows over REST** — route own-email writes through the confirm-by-link flow (REST writes `admin_email`/`user_email` instantly, bypassing the lockout safeguard); also session-destroy and HTTPS-migration endpoints. *Affected: core:profile, core:settings-general.* ([profile.md](profile.md), [settings-general.md](settings-general.md))

23. **REST surfaces for Tools — content Export, Import, and Privacy requests.** A WXR export route wrapping `export_wp()` (today `export.php` streams the file with no `register_rest_route`); a way to enumerate/run importers (server-side admin code today); and `show_in_rest` (or a dedicated controller) for the `user_request` post type that drives personal-data export/erasure (admin-ajax + wp-cron only). Until then Tools stays iframed. *Affected: core:tools.* ([tools.md](tools.md))

---

## (C) `@wordpress/dataviews` + DataForm feature requests

All against `@wordpress/dataviews@14.0.0`. The harness is idiomatic; these are component ceilings. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md))

### P1

1. **Inline-edit / editable-cell primitive for the table layout** (reuse `Field.Edit` for in-place cell edit, with row-level commit/cancel). The single biggest parity unlock — enables Quick Edit (posts, taxonomy, comments), Bulk Edit, and inline comment Reply. Today there is **no** in-list editing primitive. *Affected: posts, taxonomy, comments.*

### P2

2. **Native count slot on filter `elements`** (`Option.count`) + a "primary filter as tab strip" presentation, so wp-admin status tabs with counts stop riding the label string and stop costing N+1 requests. *Affected: posts, comments, users.*

3. **A bulk-edit-form primitive** (apply N fields to M selected rows) — bulk actions are action-only today; everyone hand-rolls a bulk modal. *Affected: posts, users.*

4. **Option groups (`<optgroup>`) in `select`/`adaptiveSelect`** so grouped selects (Site Language, Timezone) don't force a hand-rolled `@wordpress/components` control. *Affected: settings-general, settings host.*

5. **Operator-registration API** (mirror of how actions/fields are passed, but for `OPERATORS` — the set is closed today) so custom filter semantics are expressible. *Affected: cross-cutting list apps.*

### P3

6. **Row reorder / drag-and-drop API** (`onReorder` + drag handle) — column moving exists (`enableMoving`), row moving does not; blocks nav-menu / widgets / `menu_order` screens. *Affected: future core:menus, widgets.*

7. **Expandable / inline detail-row API** (substituted by a `RenderModal` "Details" action today). *Affected: themes, multiple.*

8. **A media-library-picker `Edit` control + a range/slider control in `FORM_CONTROLS`** (the `media` type is display-only today). *Affected: settings-media, settings-general (Site Icon), profile (avatar).*

---

## (D) Documentation gaps

### P1 — docs that contradict shipped behavior / live REST

1. **Fix settings-panel docs that falsely list dead fields as REST-backed.** `docs/screens/settings-reading.md` + the reading app's `app.json`/`app.md` list `posts_per_rss` & `rss_use_excerpt` as REST reads/writes (they're not); `docs/screens/settings-discussion.md` claims `default_pingback_flag` is REST-exposed (only 2 of 25 options are) and `docs/screens/settings-writing.md` lists a non-existent `wp_collaboration_enabled` field. ([settings-reading.md](settings-reading.md), [settings-discussion.md](settings-discussion.md), [settings-writing.md](settings-writing.md))

2. **Fix "Current shell coverage: None" / stale-app-path lines** in `docs/screens/dashboard-home.md`, `docs/screens/themes.md`, `docs/screens/plugins.md`, `docs/screens/taxonomy.md` (says "Not implemented" but the app exists), and the `src/apps/settings-panels/*` → `src/apps/settings-*/index.js` path drift across multiple screen specs + the stale `src/apps/MediaApp.js` references in `docs/screens/media.md`. ([dashboard.md](dashboard.md), [themes.md](themes.md), [plugins.md](plugins.md), [taxonomy.md](taxonomy.md), [media.md](media.md))

3. **Fix app.md claims of non-existent window globals.** themes `app.md` references a `window.wpAdminShell.activeTheme` read never emitted by `wp-admin-shell.php`; verify and remove. ([themes.md](themes.md))

### P2 — missing screen specs

4. **Author `docs/screens/editor-classic.md`** — the block/classic post editor (`core:editor` + `core:simple-editor`) has no dedicated screen spec. ([block-editor.md](block-editor.md))

5. **Author a dedicated `docs/screens/profile.md`** — Profile is currently only a sub-section of `users.md`; own-vs-other-user branching and the email-confirm flow get light coverage. ([profile.md](profile.md))

### P3 — accuracy touch-ups

6. **Correct factual errors in existing specs:** `docs/screens/comments.md:123` wrongly claims REST rejects `status:'any'` (it works in 7.0); `docs/screens/site-health.md` §4 should drop `utf8mb4_support` and move `page_cache` to async; remove the settings-discussion custom-endpoint recommendation in favor of `register_setting`; document the simple-editor instant-email-change / live-record-autosave deviations and the settings-general no-op bindings + manual-offset-revert blocker. ([comments.md](comments.md), [site-health.md](site-health.md), [settings-discussion.md](settings-discussion.md), [block-editor.md](block-editor.md), [settings-general.md](settings-general.md))

---

## Top 5 biggest parity risks

- **Silently-broken settings + settings-API REST gap.** Across four settings panels (and every third-party plugin settings page), controls render, accept input, claim "Settings saved.", and discard the value because the option isn't `show_in_rest`. Discussion alone has 23 dead fields. This is invisible data loss — the worst failure mode — and the largest single blocker. Mitigable shell-side for *core* options via `register_setting` shims (A-P1 #10, A-P2 #21-22, B-P1 #1), but the Settings-API field registry needs upstream (B-P1 #2). ([settings-discussion.md](settings-discussion.md), [settings-writing.md](settings-writing.md), [settings-reading.md](settings-reading.md), [settings-general.md](settings-general.md))

- **Two shipped, user-facing regressions/no-ops in the default shell.** Theme **Activate** POSTs to an unregistered endpoint and silently fails to activate; the **Tags** screen renders a blank table (empty DataView); the default-shell **Comments** action set drops Unapprove and ships an inert Reply button. These are *worse than missing features* — they look present and don't work. All shell-side (A-P1 #1-3). ([themes.md](themes.md), [taxonomy.md](taxonomy.md), [comments.md](comments.md))

- **simple-editor writes published posts to the live record + editor integration seams are broken.** A debounced auto-save PUTs the live published record where core writes a safe per-user autosave (data-integrity risk); `core:editor` declares dirty-state but never wires it (sidebar clicks discard unsaved edits), has no iframeBridge, and no session-expiry recovery. Mostly shell-side (A-P1 #5-6), with post-lock + revision-restore + preview-nonce as upstream backstops (B-P2 #7, #14). ([block-editor.md](block-editor.md))

- **Quick Edit / Bulk Edit / inline Reply are blocked by a missing DataViews primitive.** wp-admin's most-used editing affordances have no editable-cell primitive in `@wordpress/dataviews` — the data is fully REST-writable, but the UX requires either an upstream inline-edit primitive (C-P1 #1) or a hand-rolled `RenderModal`+`DataForm` stand-in. Affects posts, taxonomy, and comments. ([dataviews-dataforms-limitations.md](dataviews-dataforms-limitations.md), [posts.md](posts.md), [comments.md](comments.md))

- **Entire admin-management surfaces are absent and largely upstream-blocked.** Plugin update + auto-update + the whole `.org` Add-New directory flow (browse/search/ratings); theme activate/delete/install; per-user post counts and password reset; the bulk of Site Health diagnostics; classic dashboard widgets and the unbridged admin-bar + `admin_notices`. These need a mix of upstream REST work (B-P1 #3-6, B-P2) and shell proxies/bridges, and represent the largest *volume* of missing functionality. ([plugins.md](plugins.md), [themes.md](themes.md), [users.md](users.md), [site-health.md](site-health.md), [dashboard.md](dashboard.md), [system-and-chrome-apps.md](system-and-chrome-apps.md))
