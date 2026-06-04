# Parity: Posts & Pages (core:posts)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: `src/apps/posts/`. Classic counterpart: `src/wp-admin/edit.php`, `src/wp-admin/includes/class-wp-posts-list-table.php`, `src/js/_enqueues/admin/inline-edit-post.js`.

## Verdict

**Major gaps.** `core:posts` is a solid, idiomatic DataViews list with a working trash flow and live status counts, and it reaches the same `/wp/v2/posts|pages` data the classic screen mutates. But it is missing the two highest-value editing affordances of the classic screen — **Quick Edit** and **Bulk Edit** — plus the **status/Mine view-tab strip**, **sticky handling**, **comment-count bubble**, **post-lock indicator**, **hierarchical Pages tree**, and **column filters** (date / category / format). Crucially, the great majority of these are *not* API-blocked: status, author, sticky, comment_status, parent, menu_order, template, format, categories and tags are all read/writable through `/wp/v2/posts`, and category/tag/date/author filtering and capability discovery are all exposed. They are simply un-built. The genuine API blockers are narrow: **post locking** (admin-only, Heartbeat-driven), the **per-row comment count** (no scalar REST field), and a **first-class status-counts endpoint** (worked around with N count requests). So the headline is "lots of buildable parity work, two real upstream blockers," not "blocked by API."

## Counterpart mapping

- **Classic screen(s):**
  - `src/wp-admin/edit.php` — the screen controller; handles bulk-action dispatch (`trash` / `untrash` / `delete` / `edit`), enqueues `inline-edit-post` + `heartbeat`, registers Screen Options + help tabs.
  - `src/wp-admin/includes/class-wp-posts-list-table.php` — `WP_Posts_List_Table` (extends `WP_List_Table`); owns columns, sortable columns, status views + counts, row actions, bulk actions, the comment bubble, post-lock display, and the Quick/Bulk Edit hidden-row markup (`inline_edit()`, lines 1617-2150).
  - `src/js/_enqueues/admin/inline-edit-post.js` — the Quick Edit / Bulk Edit client; saves via admin-ajax `inline-save` (`wp_ajax_inline_save`, `ajax-actions.php:2067`).
  - `src/wp-admin/includes/post.php` — `bulk_edit_posts()` (the Bulk Edit server handler), `wp_check_post_lock()` / `wp_set_post_lock()` (lines 1715-1760).
  - `src/wp-admin/includes/template.php` — `_post_states()` / `get_post_states()` (line 2254+) for the title-cell state badges (Sticky / Draft / Pending / Private / Front Page …).
- **REST / core-data surface the workspace app uses:**
  - `useEntityRecords('postType', config.postType, queryArgs)` → `GET /wp/v2/posts` (or `/pages`, or any post type's `rest_base`), `context=edit`, `_embed=author` (`src/apps/posts/index.js:147`).
  - `useDataView(screenId)` → resolved DataView doc (kernel-config fast path, `/wp-admin-workspaces/v1/data-view` fallback).
  - `useEntityElementCounts('postType', postType, 'status', …)` → one `GET …?status=X&per_page=1&_fields=id` per status, reads `X-WP-Total` (`src/apps/_shared/dataviews/useEntityElementCounts.js`).
  - `deleteEntityRecord('postType', postType, id)` (no `force`) → `DELETE /wp/v2/posts/{id}` = trash (`src/apps/posts/index.js:212`).
- **Project screen spec:** `docs/screens/posts.md` exists (23 KB, thorough — it independently flags the AJAX/Quick-Edit gap, the counts workaround, and the restore-to-draft caveat). Not MISSING.

## Feature parity matrix

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| **Title column** | `column_title()` — linked title to editor, state badges, lock info, optional excerpt; `class-wp-posts-list-table.php:1090` | `Button variant="minimal"` linking to `editHref()`; `index.js:85` | 🟡 partial | No state badges, no parent breadcrumb, no excerpt mode. |
| **Author column** | `column_author()` — links to author-filtered list; `:1281` | `Text` of `_embedded.author[0].name`; `index.js:96` | 🟡 partial | Plain text, not a clickable author filter; no "(no author)" fallback styling. |
| **Date column** | `column_date()` — status-aware label ("Published"/"Scheduled"/"Last Modified"/"Missed schedule") + date/time; `:1190` | `datetime` field, raw `record.date`; declared in `app.json` | 🟡 partial | DataViews renders a single datetime; no status-aware label, no "Missed schedule" warning. |
| **Status column** | Not a standalone column in classic — status shown via badges + date label | `Text` mapping status→label; `index.js:93` | ➕ divergence | Workspace adds a dedicated Status column classic doesn't have (reasonable). |
| **Categories column** | `column_default()` taxonomy links; shown for `post`; `:1308` | absent | ❌ missing | Buildable: terms come via `_embed`/`wp:term` or `categories` field. |
| **Tags column** | taxonomy links; `:1311` | absent | ❌ missing | Buildable (`tags` field / `wp:term`). |
| **Comments column (bubble)** | `column_comments()` + `comments_bubble()` — pending/approved count linking to comments screen; `:1261` | absent | ⛔ blocked (count) | `comment_count` is **not** a REST field on `/wp/v2/posts`; only an embeddable `replies` link (`wp/v2/comments?post=ID`). [upstream] for a scalar field; [workspace] possible via per-row count. |
| **Custom plugin columns** | `manage_{post_type}_posts_columns` + `manage_…_custom_column` hooks; `:738` | via dataView field cascade + `register_rest_field` | 🟡 partial | Workspace has a column-extension path (dataView fields), but plugin columns that compute server-side HTML have no bridge unless exposed via REST. |
| **Sortable: Title** | `get_sortable_columns()` `title`; `:780` | `enableSorting` not set on title (default) | 🟡 partial | Sort by title is REST-supported (`orderby=title`); just not enabled on the field. |
| **Sortable: Date** | default sort `date desc`; `:783` | `sort: { field: 'date', direction: 'desc' }`; `index.js:72` | ✅ full | Matches. |
| **Sortable: Comments (comment_count)** | sortable; `:782` | absent (no comments column) | ❌ missing | `orderby=comment_count` is REST-supported. |
| **Sortable: Parent / menu_order** | `parent` sortable; hierarchical default `menu_order title`; `:774` | absent | ❌ missing | `orderby=menu_order` REST-supported. |
| **Search** | `?s=` free text | DataViews search → `args.search`; `index.js:124` | ✅ full | Title-field global search; maps to REST `search`. |
| **Status view tabs (All / Mine / Published / Draft / Pending / Scheduled / Trash / Sticky) with live counts** | `get_views()` subsubsub strip with `wp_count_posts` counts; `:289` | counts folded into status **filter dropdown** labels ("Published (12)"); no tab strip; no Mine; no Sticky tab | 🟡 partial | Counts work (via N `X-WP-Total` calls). Rendered as a filter, not the classic tab strip. "Mine" and "Sticky" tabs absent. See blockers + recs. |
| **"Mine" view** | author=current-user filter + count; auto-applied for low-priv users; `:104`, `:312` | absent | 🟡 partial | Buildable: `author=` filter + count. The *auto-scope for non-`edit_others_posts` users* is a behavioral divergence (see below). |
| **Sticky filter / sticky toggle / sticky badge** | Sticky view + `_post_states` badge + Quick/Bulk Edit toggle; `:394`, `template.php:2333` | absent | 🟡 partial | **Not API-blocked** — `sticky` is a full REST field + `sticky` query param + `wp:action-sticky` cap link (`class-wp-rest-posts-controller.php:2750`, `:3144`, `:2891`). Purely un-built. |
| **Date dropdown filter (months)** | `months_dropdown()` via `extra_tablenav()`; `:574` | absent | ❌ missing | Buildable client-side: month → `after`/`before` ISO range (REST `after`/`before` supported, `:277`). |
| **Category filter dropdown** | `categories_dropdown()`; `:464` | absent | ❌ missing | Buildable: `categories` collection param is registered for `post` (`:1705`). |
| **Post-format filter dropdown** | `formats_dropdown()`; `:502` | absent | ❌ missing | Buildable: `format` query param (`:358`). |
| **Pagination** | `WP_List_Table` pager; per_page from screen option | DataViews `paginationInfo` from `totalItems`/`totalPages`; `index.js:272` | ✅ full | Matches; uses `X-WP-TotalPages`. |
| **Per-page (Screen Options)** | `edit_{post_type}_per_page` user meta; `:173` | hardcoded `perPage: 20`; user can change in-session via DataViews but it does **not persist** | 🟡 partial | DataViews lets the user change page size, but there's no Screen-Options-equivalent persisted preference. |
| **Screen Options: column show/hide** | per-user hidden-columns meta | DataViews field visibility toggle (in-session) | 🟡 partial | DataViews has a column toggle, but no persisted per-user preference like wp-admin. |
| **Screen Options: list vs excerpt mode** | `mode=excerpt` toggle (`posts_list_mode`); `:157` | DataViews table↔grid (different concept) | ➕ divergence | DataViews grid ≠ excerpt mode; no excerpt-in-list view. |
| **Row action: Edit** | links to editor; `:1484` | `edit` callback → `navigate(editHref)`; `index.js:251` | ✅ full | Matches (for `post`/`page`; CPTs with slug ids unhandled — see divergences). |
| **Row action: Quick Edit** | inline editinline button → JS row editor; `:1503` | absent | ⛔ blocked (component) | No DataViews inline-edit primitive available in this app; the *save* (`PUT /wp/v2/posts/{id}`) is fully REST-doable, but the inline-row UX is not provided by `@wordpress/dataviews` in a way the workspace uses. [workspace] (build a modal/inline DataForm). |
| **Row action: Trash** | `get_delete_post_link()` (nonced GET); `:1522` | `trash` modal → `deleteEntityRecord` no-force; `index.js:199` | ✅ full | Matches (trash semantics). Classic uses a confirm-less nonced link; workspace adds a confirm modal (improvement). |
| **Row action: Restore (untrash)** | shown in Trash; `wp_untrash_post`; `:1514` | absent (trash variant declares `restore` but no callback wired in `index.js`) | 🟡 partial | `restore` action exists in `app.json` `trash` variant but `index.js` provides **no `restore` callback** → inert. Buildable via `updateEntityRecord(status:'draft')`; note classic restores to *previous* status (see blockers). |
| **Row action: Delete Permanently** | shown in Trash / when trash disabled; `:1532` | absent (declared in `app.json` `trash` variant, no callback) | 🟡 partial | `delete-permanent` action declared but no callback in `index.js` → inert. Buildable via `deleteEntityRecord(..., { force: true })`. |
| **Row action: View** | published posts → permalink; `:1555` | `view` callback → `window.open(item.link)`; gated `status==='publish'`; `index.js:253` | 🟡 partial | Matches for published. Classic also offers **Preview** for draft/pending/future via `get_preview_post_link()` — workspace has no Preview. |
| **Row action: Preview (drafts)** | `get_preview_post_link()` for pending/draft/future; `:1545` | absent | ❌ missing | Buildable: build a preview-nonce link or open the editor's preview. (Preview link generation is partly admin-side; `_embed`/REST doesn't hand you a ready preview URL — see notes.) |
| **Bulk action: Bulk Edit** | inline multi-row field editor; `bulk_edit_posts()`; `:440`, `inline_edit()` | absent | ⛔ blocked (component) | No inline bulk-edit UI. Underlying field writes (status/author/sticky/parent/format/comment_status/categories/tags) are **all REST-doable** via batched `updateEntityRecord`. [workspace] (build a DataForm-driven bulk panel). |
| **Bulk action: Move to Trash** | `trash` doaction; `:448` | `trash` modal `supportsBulk: true`; `index.js:199` | ✅ full | Matches; `Promise.allSettled` over deletes. |
| **Bulk action: Restore** | `untrash` in Trash; `:438` | declared in `app.json` `trash` variant `supportsBulk`, no callback | 🟡 partial | Inert until a `restore` callback is wired. |
| **Bulk action: Delete Permanently** | `delete` in Trash / trash-off; `:446` | declared, no callback | 🟡 partial | Inert until wired (`force: true`). |
| **Empty Trash button** | `submit_button('Empty Trash', 'delete_all')`; `:606` | absent | ❌ missing | Buildable: query all trashed ids, batch `force` delete (classic does it server-side in one query). |
| **Empty state** | `no_items()` → post-type's `not_found` / `not_found_in_trash` labels; `:220` | DataViews built-in empty state | 🟡 partial | Generic DataViews empty state, not the post-type-specific labels. |
| **Error state** | wp-admin redirects / `wp_die` on failure | partial-failure snackbar on bulk trash; `index.js:228` | 🟡 partial | No top-level load-error banner (spec calls for one); DataViews shows nothing distinct on a failed list fetch. |
| **Help tabs** | Overview / Screen Content / Available Actions / Bulk actions + sidebar; `edit.php:249` | absent | ❌ missing | No help-tab equivalent in the workspace. |
| **Capability gating (screen)** | `ajax_user_can()` = `edit_posts`; `:144` | screen `permissions` + 4-layer kernel gating | ✅ full | Gated at screen level via workspace.json. |
| **Capability gating (per-row action)** | per-post `current_user_can('edit_post'/'delete_post', id)`; `:1479`, `:1512` | static `eligibleWhen` by status only; `app.json` actions | 🟡 partial | Workspace gates by *status*, not per-row capability. REST exposes `wp:action-*` link rels (`action-sticky`, `action-assign-author`, `action-publish`) for per-row caps, unused. |
| **Checkbox / selection cap** | `wp_list_table_show_post_checkbox` (only if `edit_post`); `:1039` | DataViews selection (all rows selectable) | 🟡 partial | No per-row checkbox suppression for non-editable rows. |
| **Nonces / security** | `bulk-posts` nonce on bulk dispatch; `inlineeditnonce` for Quick Edit; `:77` | REST cookie nonce via `@wordpress/api-fetch` | ✅ full | core-data handles `_wpnonce`/`X-WP-Nonce`; equivalent security. |
| **Extensibility: column hooks** | `manage_*_columns`, taxonomy column filter | dataView `fields` cascade + `fieldsRef` | 🟡 partial | Different model; server-rendered custom-column HTML not bridged. |
| **Extensibility: row/bulk action hooks** | `post_row_actions` / `page_row_actions` / `bulk_actions-*` | dataView `actions` cascade + filters | 🟡 partial | Reachable via workspace.json/filters, but PHP action-link hooks aren't ingested. |
| **Extensibility: `restrict_manage_posts`** | custom filter dropdowns; `:593` | none | ❌ missing | No bridge for plugin-injected filter controls. |
| **a11y: row landmark / aria-sort** | `WP_List_Table` `role`/`aria-sort` | DataViews owns table a11y + announcements | 🟡 partial | DataViews provides its own; not the wp-admin-specific live-region copy (spec note). |
| **Post-lock indicator ("X is currently editing")** | `wp_check_post_lock()` + `.wp-locked` row + locked avatar; `:1119`, `:1427` | absent | ⛔ blocked (API) | No REST surface to read who holds a lock for a set of posts. Heartbeat/admin-only. [upstream]. |

## Functional divergences

Behaviors present in both but implemented differently:

1. **Status counts: filter-dropdown labels vs. subsubsub tab strip.**
   - Classic renders a horizontal link strip `All (N) | Mine (N) | Published (N) | Draft (N) | …` above the table (`get_views()`, `class-wp-posts-list-table.php:289-427`) where each tab is a one-click view switch with an `aria-current` active state.
   - Workspace folds counts into the **status filter dropdown** option labels via `withElementCounts()` (`src/apps/_shared/dataviews/buildFields.mjs:105`) seeded by `useEntityElementCounts` (`src/apps/posts/index.js:153`).
   - **Consequence:** the user must open the status filter to see/switch status, and there is no one-click "All / Mine / Sticky" affordance. Counts are also global (search-independent) by design, matching wp-admin's link counts but diverging from a filtered view's intuition.

2. **Counts cost: one `wp_count_posts` query vs. N REST requests.**
   - Classic computes every status count in a single `wp_count_posts($post_type, 'readable')` call (`:299`).
   - Workspace fires one `GET ?status=X&per_page=1&_fields=id` per status value (6 values in `STATUS_VALUES`) and reads `X-WP-Total` (`useEntityElementCounts.js:44-58`).
   - **Consequence:** 6 extra HTTP round trips on first paint per list. Acceptable, but heavier than classic and flagged in `docs/screens/posts.md:99`.

3. **"Mine" auto-scope for low-privilege users is not replicated.**
   - Classic forces `author=current_user` for users **without** `edit_others_posts` when no explicit view is chosen (`__construct()`, `:104-110`), so a Contributor lands on *their* posts.
   - Workspace always queries `status: config.status || 'any'` with no author scoping (`index.js:119`).
   - **Consequence:** a Contributor in the workspace sees the full readable list by default rather than just their own, a subtle authorization-UX divergence (the REST layer still filters by *read* capability, so they won't see private others'-posts content, but the default framing differs).

4. **Restore semantics: workspace would restore to draft, classic restores to previous status.**
   - Classic `wp_untrash_post()` restores to the pre-trash status stored in `_wp_trash_meta_status` (`edit.php:147-167`).
   - Workspace's `restore` action is currently inert (no callback in `index.js`), but the documented intent (`app.md:91`, `docs/screens/posts.md:105`) is `status: 'draft'`.
   - **Consequence (if built as documented):** a previously-published post restored from trash would come back as a draft, not republished. A real but accepted divergence (REST doesn't expose the previous-status meta).

5. **Trash UX: confirm modal vs. immediate nonced link.**
   - Classic Trash is a direct nonced GET link (`get_delete_post_link()`, `:1522`) — no confirmation, recoverable from Trash; classic relies on an *Undo* snackbar after the redirect.
   - Workspace opens a confirm modal first (`createBulkConfirmModal`, `index.js:199`) and shows no Undo.
   - **Consequence:** workspace trades wp-admin's "act-then-undo" for "confirm-then-act"; arguably better, but no Undo path exists (spec `docs/screens/posts.md:308` wants Undo).

6. **Editor navigation only handles `post`/`page`.**
   - `editHref()` hardcodes `page → /pages/`, everything else → `/posts/` (`index.js:36-39`). Site-editor post types (`wp_template`, `wp_block`, `wp_navigation`) have slug-shaped ids and no edit route.
   - **Consequence:** binding `core:posts` to `wp_block` (as `app.md:7` says some workspaces do) produces broken edit links. Documented limitation (`app.md:90`).

## API & platform blockers

The hard parity blockers — what the classic screen does that cannot be done through `/wp/v2/*` + `@wordpress/core-data` today. Verified against live 7.0 source.

1. **Post locking — "{user} is currently editing".** `[upstream]`
   - Classic calls `wp_check_post_lock($post->ID)` per row (`class-wp-posts-list-table.php:1119`, `:1427`) to render the locked avatar + `.wp-locked` row, and refreshes via the **Heartbeat API** (`add_filter('heartbeat_received', 'wp_check_locked_posts')`, `admin-filters.php:78`). `wp_check_post_lock`/`wp_set_post_lock` live in `wp-admin/includes/post.php:1715-1760` (admin-only).
   - **Missing surface:** there is **no REST endpoint** that returns lock holders for a set of posts. The only REST touchpoint is `class-wp-rest-autosaves-controller.php:232`, which *reads* a lock as an internal guard but does not expose it. The lock is stored in `_edit_lock` post meta but is not registered with `show_in_rest`, and even if it were, resolving the holder + the 150-second freshness window is server logic.
   - **To close:** upstream a `wp:lock`/`_edit_lock` read field or a `/wp/v2/posts?_fields=lock` computed field (+ a way to refresh). Until then the workspace cannot warn that a post is being edited.

2. **Per-row comment count (the comment bubble).** `[upstream]` (preferred) / `[workspace]` (workaround)
   - Classic shows approved/pending comment counts via `column_comments()` → `comments_bubble()` (`:1261`), with pending counts batch-loaded by `get_pending_comments_num()` (`:833`).
   - **Missing surface:** `comment_count` is **not** a field on the REST posts schema — grepping `class-wp-rest-posts-controller.php` for `comment_count` returns nothing in `prepare_item_for_response`/schema. Only `comment_status` (open/closed) is exposed (`:2072`), plus an embeddable `replies` link to `wp/v2/comments?post=ID` (`:2258`).
   - **To close:** `[upstream]` register a `comment_count` (and ideally a pending count) REST field on posts; or `[workspace]` fire a `GET /wp/v2/comments?post=ID&status=approved&per_page=1` per row and read `X-WP-Total` (expensive at list scale — one request per visible row).

3. **First-class status counts.** `[workspace]` (worked around) / `[upstream]` (ideal)
   - Classic gets all status counts in one `wp_count_posts()` call (`:299`).
   - **Missing surface:** no REST endpoint returns post counts grouped by status. The workspace's `useEntityElementCounts` already works around this with N `per_page=1` + `X-WP-Total` requests.
   - **To close:** `[workspace]` accept the N-request cost (current), or `[upstream]` add a counts endpoint (e.g. `GET /wp/v2/posts/counts`).

4. **Quick Edit / Bulk Edit inline UI.** `[workspace]` (the UI), not API-blocked for data
   - Classic Quick/Bulk Edit (`inline_edit()`, `:1617-2150`) edit title, slug, date, author, password, private, parent, menu_order, template, categories, tags, comment/ping status, **status, sticky, format**. Quick Edit saves via admin-ajax `wp_ajax_inline_save` (`ajax-actions.php:2067`); Bulk Edit posts to `bulk_edit_posts()`.
   - **Data side is NOT blocked:** every one of those fields is read/writable through `/wp/v2/posts` — `status`, `title`, `slug`, `date`, `author`, `password`, `parent` (`:1447`), `menu_order` (`:1466`), `template` (`:828`/`:2084`), `format` (`:824`/`:2093`), `comment_status` (`:1471`), `sticky` (`:2750`), and taxonomy terms (`categories`/`tags` write params). A batched `updateEntityRecord` per selected row reproduces Bulk Edit exactly.
   - **What's missing is the *UI primitive*:** the workspace does not surface DataViews' inline edit, and there is no inline-row or bulk-panel editor. This is a `[workspace]` build (a DataForm-driven modal / panel), not an API gap. Tagging it "blocked (component)" in the matrix means *the affordance is absent*, not that the API can't do it.

5. **Preview link for unpublished posts.** `[workspace]` mostly
   - Classic builds a nonced preview URL via `get_preview_post_link()` for draft/pending/future (`:1545`).
   - REST does not hand you a ready-to-use preview URL; the workspace would need to construct `?preview=true&preview_id=ID&preview_nonce=…` (the preview nonce is generable client-side via the editor's existing flow) or route into the editor's preview. Minor and `[workspace]`-closeable, with a small nonce wrinkle.

Not blockers (explicitly verified buildable through REST, currently un-built): **sticky** (field + query param + cap link, `:2750`/`:3144`/`:2891`), **categories/tags filters** (collection params registered for `post`, `:1705`), **date-range filter** (`after`/`before`, `:277`), **author filter** (`author` param, `:2996`), **format filter** (`format` param, `:358`), **restore** (`PUT status`), **delete-permanently** (`DELETE force=true`, `:139`), **Empty Trash** (batch `force` delete), **per-row capability gating** (`wp:action-*` link rels, `:2364-2394`), **sortable title/comment_count/menu_order** (`orderby`, `:254`).

## DataViews / DataForms review

The app uses DataViews; **usage is idiomatic and matches the documented shared-scaffolding contract.** It does **not** use DataForm (this is a list, not a form), which is correct.

- **Import path** — `import { DataViews } from '@wordpress/dataviews/wp'` (`index.js:7`), the runtime-private export, exactly per `CLAUDE.md` (avoids minified React #130). ✅
- **Controlled view + selection** — delegated to the shared `useEntityDataView` (`_shared/dataviews/useEntityDataView.js`), which correctly: seeds `view` from `VIEW_DEFAULTS` ∪ resolved `defaultView`; resyncs on `[screenId, postType]` (not on `dataViewConfig`, avoiding clobbering in-session edits); strips the `titleField` from `view.fields` to prevent a duplicate title column; and resets `selection` on screen flip so a stale selection can't target absent ids. All four behaviors are correct and well-reasoned. ✅
- **Field / action compilation** — `buildFields` / `buildActions` (`_shared/dataviews/`) implement the LABELS-table i18n recovery (`FIELD_LABELS`/`ACTION_LABELS` win for app-authored ids, spec label wins for plugin ids via `??`), per `app.md`. Clean. ✅
- **Loading gate** — renders a `<Spinner/>` while `records === null` then mounts DataViews with `isLoading={isResolving}` (`index.js:282`), correctly covering the first-paint window where `isResolving` is false but `records` is null (a documented recurring trap). ✅
- **Destructive confirm modal** — `createBulkConfirmModal` uses DataViews' `RenderModal` action shape, `Promise.allSettled` (one failure doesn't collapse the batch), a re-entry/busy guard, and a `finally` to clear busy state — robust. ✅
- **`getItemId`** — `item.id.toString()` (`index.js:298`), matches the string-id expectation. ✅

**Component / pattern limitations that block parity here (DataViews-side):**
- **No inline-edit wired.** `@wordpress/dataviews` *does* support an editable-field flow, but this app does not use it (`app.md:88` confirms). Quick Edit parity is therefore a DataViews-feature-adoption + DataForm-in-modal task, not impossible.
- **No native count slot on filter elements.** The workspace folds counts into element *labels* (`withElementCounts`) because DataViews has no first-class count display on filter options. Functional but a workaround; the result is a dropdown rather than wp-admin's tab strip. This is a genuine DataViews limitation for the subsubsub-tab UX. `[upstream DataViews]` if a tab-with-count view is wanted.
- **Status filter is single-value in practice.** The field declares `filterBy.operators: ['isAny']` (`app.json:55`) but `queryArgs` only maps `isAny` (join with `,`) and `is` (`index.js:128-138`) — fine, but no multi-status UI is surfaced beyond the dropdown. Minor.
- **No fragile workarounds found** in `_shared/*`. The shared helpers are clean and pinned by `tests/runtime/dataviews-shared.test.mjs`.

Not applicable: DataForm (correctly unused for the list).

## Recommendations / future work

Prioritized. Each: what / why / where / workspace-vs-upstream.

**P1 — highest parity value, mostly workspace-side**

1. **Wire the already-declared Trash-variant actions (Restore, Delete Permanently) + a Trash view.** They are declared in `app.json` (`trash` variant) but have **no callbacks** in `index.js`, so they're inert. Add `restore` (`updateEntityRecord(status:'draft')`) and `delete-permanent` (`deleteEntityRecord(..., { force:true })`) callbacks, plus a way to reach the Trash filter. *Where:* `src/apps/posts/index.js` (callbacks), workspaces' dataView. *Workspace-side.* Note restore-to-draft caveat (blocker #4).
2. **Build Bulk Edit.** The single biggest functional gap. A DataForm-driven panel/modal that, on confirm, batches `updateEntityRecord` per selected row over the changed fields only (status / author / sticky / parent / format / comment_status / categories / tags — all REST-writable). *Where:* new `src/apps/posts/` component + `_shared/forms`. *Workspace-side* (data fully supported).
3. **Add the status/Mine view-tab strip (or restyle counts as tabs).** Replace/augment the filter-dropdown counts with a one-click tab strip incl. **Mine** (`author=current_user`) and **Sticky** (`sticky=true`). *Where:* workspace config + possibly an engine-side tab affordance or DataViews view list. *Workspace-side*; the count engine already exists.
4. **Sticky support (filter + badge + Quick/Bulk toggle).** `sticky` is fully REST-exposed. Add a sticky filter, a Sticky state badge in the title cell, and sticky in Bulk/Quick Edit. *Where:* `index.js` field renderers + bulk panel. *Workspace-side.*

**P2 — meaningful gaps, workspace-side with some nuance**

5. **Quick Edit (inline single-row edit).** Adopt DataViews editable fields or a per-row DataForm modal saving via `PUT /wp/v2/posts/{id}`. *Where:* `src/apps/posts/`. *Workspace-side* for data; DataViews-feature-adoption for UI.
6. **Column filters: date (month), category, format, author.** All REST-supported (`after`/`before`, `categories`, `format`, `author`). Map a month picker to an ISO range. *Where:* `index.js` `queryArgs` + DataViews filters config. *Workspace-side.*
7. **Comment-count bubble.** *Workspace-side* interim: per-row `GET /wp/v2/comments?post=ID&per_page=1` + `X-WP-Total` (costly). *Upstream-preferred:* register a `comment_count` REST field. *Where:* `index.js` + `[upstream]` `class-wp-rest-posts-controller.php`.
8. **Per-row capability gating.** Consult `wp:action-*` link rels (`action-publish`, `action-sticky`, `action-assign-author`) to enable/disable per-row actions and suppress checkboxes on non-editable rows, instead of status-only `eligibleWhen`. *Where:* `buildActions` eligibility overrides reading `_links`. *Workspace-side.*
9. **State badges + status-aware date label + Missed-schedule warning.** Reproduce `_post_states` (Sticky/Draft/Pending/Private/Front Page/Posts Page) in the title cell (front-page/posts-page need a `/wp/v2/settings` cross-read) and the date column's status-aware label. *Where:* `index.js` renderers. *Workspace-side.*
10. **Preview link for draft/pending/future.** Construct a preview URL or route into the editor preview. *Where:* `index.js` `view`/new `preview` action. *Workspace-side* (minor nonce wrinkle).
11. **Hierarchical Pages tree.** Pages currently render flat. DataViews has no native tree; either build an indented renderer keyed on `parent`/`menu_order` or accept the flat divergence. *Where:* `index.js` when `postType==='page'`. *Workspace-side*, but needs a tree affordance (possible `[upstream DataViews]` ask for hierarchy support).

**P3 — polish / lower value**

12. **Persisted Screen Options (per-page + column visibility).** Persist DataViews page size + visible fields as a per-user preference (e.g. via `@wordpress/preferences` or user meta) to mirror `edit_{post_type}_per_page`. *Where:* `useEntityDataView` + a prefs store. *Workspace-side.*
13. **Empty Trash bulk button.** Query trashed ids, batch `force` delete. *Where:* `index.js`. *Workspace-side.*
14. **Undo snackbar after trash.** Restore the trashed ids on click; mirrors wp-admin's "Move to trash · Undo". *Where:* `createBulkConfirmModal`/`index.js`. *Workspace-side.*
15. **Post-type-specific empty + error states, help content.** Use the post type's `not_found`/`not_found_in_trash` labels; add a load-error banner; consider a help affordance. *Where:* `index.js`. *Workspace-side.*

**Upstream (WordPress / REST) asks**

16. **`[upstream]` Expose post-lock status via REST** (blocker #1) — a read field or computed `_fields=lock` returning holder + freshness, ideally with a refresh path. Without it, "X is currently editing" is impossible in the workspace.
17. **`[upstream]` Add `comment_count` (and pending count) to the REST posts schema** (blocker #2) — eliminates the per-row count requests.
18. **`[upstream]` (optional) A status-counts endpoint** (blocker #3) — replaces the N `X-WP-Total` requests with one call.
