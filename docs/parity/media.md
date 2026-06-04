# Parity: Media Library (core:media)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: `src/apps/media/`. Classic counterpart: `wp-admin/upload.php` (list + grid), `wp-admin/media-new.php` (uploader), `wp-admin/media.php` (deprecated 301 redirect), `wp-admin/includes/class-wp-media-list-table.php` (list table), `wp-admin/includes/image-edit.php` + `src/js/_enqueues/lib/image-edit.js` (image editor), `src/js/_enqueues/wp/media/*` (Backbone grid/modal).

## Verdict

**Major gaps.** `src/apps/media/index.js` is a deliberately minimal grid: a paginated thumbnail wall + a media-type `SelectControl` (with counts) + a click-to-pick upload button + a metadata-edit modal (title / alt / caption / description) + single-item delete + copy URL. Classic wp-admin ships two full modes (a sortable list table with 5+ columns, row actions, and bulk delete; *and* the Backbone grid with an autosaving attachment-details modal), an inline image editor (crop / rotate / flip / scale / restore / per-size targeting), a drag-drop multi-file uploader with per-file progress and error rows, search, date / author / attached / unattached / Mine filters, attach/detach to a post, and bulk select + bulk delete. The workspace covers maybe a third of that surface. Crucially, **most of the missing surface is buildable with the current REST API** — including image editing, which the audit flagged as the biggest unknown: WP exposes `POST /wp/v2/media/{id}/edit` with a `modifiers[]` (crop / rotate / flip) contract. The genuine API blockers are narrow and specific (in-place save, per-size targeting, scale, restore-original, batch delete, count aggregate), all enumerated below.

## Counterpart mapping

- **Classic screen(s):**
  - List + grid host: `wp-admin/upload.php` (mode switch at lines 131-251 for grid, 253-466 for list).
  - List table: `WP_Media_List_Table` — `wp-admin/includes/class-wp-media-list-table.php`. Columns: `get_columns()` (lines 364-424); sortable: `get_sortable_columns()` (429-437); views/filters: `get_views()` (148-198) + `views()` (301-359); bulk actions: `get_bulk_actions()` (203-222); row actions: `_get_row_actions()` (802-908); attach/detach: `column_parent()` (608-661) + `current_action()` (260-274).
  - Grid + attachment-details modal: Backbone in `src/js/_enqueues/wp/media/grid.js` + `views.js` + `models.js` + the shared `media-views`/`media-models` (enqueued via `wp_enqueue_media()` in `upload.php:141`).
  - Uploader: `wp-admin/media-new.php` (plupload drag-drop form, `media_upload_form()` at line 78).
  - Image editor: render + AJAX in `wp-admin/includes/image-edit.php`; canvas JS in `src/js/_enqueues/lib/image-edit.js`; AJAX handlers `wp_ajax_image_editor()` (`ajax-actions.php:2688`) + `wp_ajax_imgedit_preview()` (`ajax-actions.php:255`).
- **REST / core-data surface the workspace uses:**
  - `GET /wp/v2/media` via `useEntityRecords('root','media', queryArgs)` — `src/apps/media/index.js:57-62`. Query: `per_page:40`, `page`, `context:'edit'`, optional `media_type` (index.js:45-55).
  - Per-type filter counts via `useEntityElementCounts('root','media','media_type',[…])` — `src/apps/media/_shared/dataviews/useEntityElementCounts.js` (one `per_page:1&_fields:id` request per type, total read from `X-WP-Total`).
  - Upload via raw `apiFetch({ path:'/wp/v2/media', method:'POST', body: FormData })` — index.js:105-149 (one request per file).
  - Metadata save via `saveEntityRecord('root','media', { id, title, alt_text, caption, description })` — index.js:386-405.
  - Delete via `deleteEntityRecord('root','media', id, { force:true })` — index.js:151-177.
  - Controller: `WP_REST_Attachments_Controller extends WP_REST_Posts_Controller` (`wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`).
- **Project screen spec:** `docs/screens/media.md` (Tier 2, full). **Note** — the spec predates the type-count feature (`useEntityElementCounts`), which has since landed; refresh its coverage notes (tracked in the screen spec's Gaps).

## Feature parity matrix

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| **Grid view** | Backbone grid of tiles; default mode since 6.3 (`upload.php:137`) | Thumbnail grid of native `<button>` tiles (index.js:282-315) | 🟡 partial | Workspace grid is non-selectable; classic grid has a "Bulk select" mode |
| **List view (table)** | Sortable table: File / Author / Uploaded to / Date / (Comments) columns (`class-wp-media-list-table.php:364-424`) | None | ❌ missing | No list mode at all; buildable with DataViews `layout:'table'` |
| **Grid/list toggle** | `view_switcher($mode)` persists to user option `media_library_mode` (`upload.php:133-138`) | None | ❌ missing | Workspace is grid-only |
| **Sortable columns** | title / author / parent / date / comment_count (`get_sortable_columns():429`) | None (grid has no headers) | ❌ missing | `orderby` REST param supports date/title/author/parent — fully achievable |
| **Search** | `?s=` over title/content/excerpt + **filename** (`views():345-356`; REST auto-adds `wp_allow_query_attachment_by_filename` at controller line 111-113) | None | ❌ missing | REST-ready: `search=` param matches filename automatically |
| **Type filter** | All / Images / Audio / Video / Documents / Spreadsheets / Archives via mime-group dropdown (`get_views():148-198`) | `SelectControl`: All / Images / Video / Audio / Documents (index.js:26-32) | 🟡 partial | Workspace omits Spreadsheet/Archive sub-groups; uses coarse `media_type` not `post_mime_type:` |
| **Type filter counts** | List table view links have no counts in REST; admin derives from `wp_count_attachments()` (PHP) | Counts on each option, e.g. "Images (12)" (index.js:91-98 + `withElementCounts`) | ✅ full | Workspace actually **exceeds** classic grid here (grid mode shows no counts) |
| **Date filter** | `months_dropdown('attachment')` → `?m=YYYYMM` (`extra_tablenav():239`) | None | ❌ missing | REST `after`/`before` params exist (posts-controller:2983, 3014) — achievable |
| **Author filter** | Click author link → `?author={id}` (`column_author():545`) | None | ❌ missing | REST `author[]` param (posts-controller:2996) — achievable |
| **"Mine" filter** | `?attachment-filter=mine` (`get_views():183`) | None | ❌ missing | REST `author=<currentUserId>` — achievable (`window.wpAdminWorkspaces.userId`) |
| **"Unattached" filter** | `?attachment-filter=detached` → `post_parent = 0` (`get_views():181`; constructor:52) | None | ❌ missing | REST `parent[]=0` → maps to `post_parent__in` (posts-controller:256) — achievable |
| **Trash filter/view** | Only when `MEDIA_TRASH` constant defined (`get_views():189-195`) | None | ⚪ n/a | Off by default; media has no trash without the opt-in constant |
| **Pagination** | `WP_List_Table` pager; per-page via Screen Options (`upload.php:364`) | Prev / Next + "X / Y" (index.js:317-347) | 🟡 partial | Fixed `per_page:40`, no jump-to-page, **not URL-driven** (refresh → page 1) |
| **Upload (click-to-pick)** | Plupload + browser fallback (`media-new.php:78`) | Hidden `<input type="file" multiple>` → `apiFetch` per file (index.js:105-149) | 🟡 partial | Works, but minimal |
| **Drag-drop upload** | Full-window drop zone, multi-file (`media-new.php:53` help text; plupload) | None | ❌ missing | App.md "Known limitations" confirms: click-to-pick only |
| **Upload progress** | Per-file progress bar + queue rows (plupload `media-items`) | Button `loading` state only (index.js:225) | 🟡 partial | No per-file %, no queue UI |
| **Upload error handling** | Per-file error row; `wp_die()` server-side on hard fail | Per-file `try/catch` → `createErrorNotice` (`Could not upload "<name>": <reason>`); batch continues past a failed file (index.js) | ✅ full | Resolved: each failed file surfaces its own dismissible error notice instead of a silent rejection |
| **Add-New dedicated screen** | `media-new.php` full uploader | Reachable as `iframe:media-new.php` menu child (`wp-admin-default.json:867`) | 🟡 partial | Iframe escape hatch only; MediaApp toolbar has no link to it |
| **Attachment-details modal** | Backbone modal: preview + metadata + Edit Image + arrow nav, **autosaved** | `Modal` (preview + 4 fields + actions), **explicit Save** (index.js:368-508) | 🟡 partial | No autosave, no arrow nav, no Edit Image, fewer fields |
| → Title | text, autosave | `InputControl`, save on submit (index.js:429-433) | ✅ full | |
| → Alt text (images) | text, autosave | `InputControl`, images only (index.js:434-440) | ✅ full | |
| → Caption | text, autosave | `TextareaControl` (index.js:441-446) | ✅ full | |
| → Description | text, autosave | `TextareaControl` (index.js:447-452) | ✅ full | |
| → File URL + Copy | read-only URL + copy button (`_get_row_actions():863`) | `source_url` text + Copy URL button (index.js:453-476) | 🟡 partial | URL shown single-line (overflows; app.md notes this); copy works |
| → Dimensions (W×H) | shown in modal sidebar (`media_details.width/height`) | None | ❌ missing | `media_details.width/height` returned by REST (controller:949) — data available, not displayed |
| → File size | shown (`media_details.filesize`, also top-level `filesize` 7.0) | None | ❌ missing | Both `media_details.filesize` and `filesize` (controller:1231) available |
| → Filename | shown | None | ❌ missing | `filename` top-level field (controller:1224, new 7.0) available |
| → EXIF / metadata | aperture, camera, ISO, shutter, focal length, etc. (`media_details.image_meta`) | None | ❌ missing | `media_details.image_meta` returned (controller:949) — data available, not displayed |
| → Uploaded by (author) | author link in modal/list (`column_author():539`) | None | ❌ missing | `author` field available (+ `_embed`) — not read |
| → Uploaded to (parent) | "Uploaded to" link + Attach/Detach (`column_parent():608`) | None | ❌ missing | `post` field available (controller:989) — not read |
| → Audio/video preview | `<audio>`/`<video>` player in modal | Shows `mime_type` text only (index.js:423-425) | ❌ missing | `source_url` available; just needs a player element |
| → "Edit more details" / full edit | link to `?item={id}` edit screen | None | ❌ missing | |
| **Inline image editor** | Crop / rotate L+R / flip H+V / scale / restore / undo-redo / per-size target (`image-edit.js`; `wp_save_image():913`) | None | ❌ missing | **Partially REST-buildable** — see API blockers; crop/rotate/flip via `/edit`, but scale/restore/in-place/target are admin-ajax-only |
| **Bulk select** | Checkboxes (list) / "Bulk select" mode (grid) (`column_cb():447`) | None | ❌ missing | |
| **Bulk delete (permanent)** | `delete` bulk action, N× `wp_delete_attachment()` (`upload.php:327-341`) | Single-item delete only (index.js:151-177) | ❌ missing | Buildable as N parallel `DELETE …?force=true`; no `/batch` (see blockers) |
| **Single delete (permanent)** | Row action "Delete Permanently" with JS confirm (`_get_row_actions():837`) | Modal Delete button, `force:true`, **no confirm dialog** (index.js:477-485) | 🟡 partial | Works but skips the confirmation classic shows |
| **Attach to a post** | "Attach" → find-posts modal → set `post_parent` (`column_parent():650`; `upload.php:287`) | None | ❌ missing | REST: `PATCH` `post` field (writable, controller:1202); no post-picker UI |
| **Detach from a post** | "Detach" link → `post_parent = 0` (`column_parent():629`) | None | ❌ missing | REST: `PATCH` `post:0` — achievable |
| **Copy URL** | Clipboard button per row (`_get_row_actions():863`) | `navigator.clipboard.writeText` + snackbar (index.js:179-196) | ✅ full | |
| **Download file** | `<a download>` row action (`_get_row_actions():875`) | None | ❌ missing | Trivial `<a download href={source_url}>` |
| **View attachment page** | "View" row action → permalink (`_get_row_actions():850`) | None | ❌ missing | Only when `wp_attachment_pages_enabled` |
| **Taxonomy columns** | Category/tag/custom-tax columns when `show_admin_column` (`get_columns():371-395`) | None | ❌ missing | Rare; attachment taxonomies |
| **Comments column** | When `wp_attachment_pages_enabled` (`get_columns():401`) | None | ⚪ n/a | Off by default in 7.0 |
| **Empty state** | "No media files found." (`no_items():288`) | "No media items found." + Upload CTA (index.js:250-278) | ✅ full | Workspace arguably nicer (onboarding CTA) |
| **Error state** | `wp_die()` / admin notice | Upload + copy-URL errors surface notices; delete/save errors still uncaught (index.js) | 🟡 partial | Upload now surfaces per-file error notices; save/delete failures still surface none |
| **Loading state** | n/a (server render) | Centered `Spinner` while resolving (index.js:243-249) | ✅ full | |
| **Capability gating** | `upload_files` to view; per-row `edit_post`/`delete_post` (`upload.php:12`; `column_cb():451`) | Screen-level `upload_files` (`wp-admin-default.json:859`); REST enforces per-item | 🟡 partial | No per-tile cap check; relies on REST 403 (silent) |
| **Nonce / security** | `bulk-media` nonce on actions; `media-form` on upload (`upload.php:260`; `media-new.php:31`) | `apiFetch`/core-data inject the REST nonce automatically | ✅ full | Handled by the data layer |
| **Screen Options (per-page / column toggle)** | `add_screen_option('per_page')` + column hide/show (`upload.php:364`) | None | ❌ missing | Fixed `per_page:40`; no column config |
| **Help tabs** | Overview / Available Actions / Attaching Files + sidebar (`upload.php:366-404`) | None | ❌ missing | No help affordance in workspace |
| **Extensibility hooks** | `manage_media_columns`, `media_row_actions`, `attachment_fields_to_edit`, `restrict_manage_posts`, etc. | None (hand-rolled, not DataViews) | ❌ missing | Plugin columns/actions/fields do not surface; no slot API |
| **a11y: grid keyboard** | `role="grid"`/`gridcell`, arrow nav | Native `<button>` tiles (Tab/Enter), modal focus trap (app.json a11y) | 🟡 partial | Keyboard-actionable but no grid roles / arrow nav / aria-current |
| **a11y: sort announce** | `aria-sort` on headers | n/a (no list) | ⚪ n/a | |
| **Subsize-generation handling** | `missing_image_sizes` + `/post-process` to finalize | None | ❌ missing | Newly-uploaded image may show a stale/placeholder thumb until subsizes finish; no polling |

## Functional divergences

Behaviors present in both that work differently:

1. **Metadata save is explicit, not autosaved.** Classic's attachment-details modal autosaves each field on change/blur (`upload.php:192` help text: "Any changes you make to the attachment details will be automatically saved"). The workspace modal mirrors fields into local `useState` and persists only on the **Save** button (`src/apps/media/index.js:386-405`). User-visible consequence: edits are lost if the user closes the modal (Cancel / Esc / backdrop) without clicking Save — a behavior classic users won't expect.

2. **Delete shows no confirmation.** Classic's permanent-delete row action carries `onclick='return showNotice.warn();'` (`class-wp-media-list-table.php:835`, when not using trash). The workspace fires `deleteEntityRecord(..., { force:true })` immediately on the modal's Delete click with no confirm step (`index.js:477-485`). Consequence: a misclick permanently deletes a file (media has no trash). The workspace's own DataViews bulk apps use `createBulkConfirmModal` for exactly this, but Media (not DataViews-based) skips it.

3. ~~**Upload has no error path.**~~ **Resolved (#103).** Classic surfaces per-file plupload errors and `wp_die()`s on a hard server failure (`media-new.php:34`). The workspace's `handleUpload` previously wrapped the loop in `try { … } finally { setIsUploading(false) }` with no `catch`, so an upload that 4xx/5xx'd (oversize file, disallowed MIME, quota) rejected silently. Each `apiFetch` is now wrapped in its own `try/catch` that fires `createErrorNotice` (`Could not upload "<name>": <reason>`) and lets the batch continue past the failed file; cache invalidation runs only when at least one file uploaded.

4. **Coarse type filter using `media_type` vs. mime groups.** Classic filters on `post_mime_type:` strings and exposes Spreadsheets/Archives sub-buckets derived from `wp_match_mime_types()` (`class-wp-media-list-table.php:161-179`). The workspace filters on the 5-value `media_type` enum (`index.js:26-32`) — "Documents" collapses `application/*` and there is no spreadsheet/archive distinction. Consequence: narrower filtering granularity, though for most users the coarse buckets suffice.

5. **Pagination not URL-addressable.** Classic encodes `?paged=N` (bookmarkable, back/forward works). The workspace holds `page` in `useState` (`index.js:40`); refresh or deep-link always lands on page 1 (app.md "Known limitations" confirms). Consequence: cannot share/bookmark a deep page; browser Back doesn't restore page position.

6. **Thumbnail freshness after upload.** Classic relies on synchronous (or `/post-process`-finalized) subsize generation. The workspace invalidates the list query after upload (`index.js:123-140`) but never reads `missing_image_sizes` nor calls `/post-process`; a large image whose subsizes are deferred can render with `source_url` (full-size) as the tile or a broken/placeholder thumb until a later refetch. Consequence: occasional momentarily-wrong thumbnails on slow servers.

## API & platform blockers

The hard parity blockers. Each verified against live 7.0 source.

1. **Image edit — in-place save (replace the original, keep the same attachment ID).** `[upstream]`
   Classic `wp_save_image()` edits the original file and, with `IMAGE_EDIT_OVERWRITE`, overwrites it in place, recording `_wp_attachment_backup_sizes` so the same attachment ID and URL are preserved (`wp-admin/includes/image-edit.php:913-1002`). The REST `/edit` route **always creates a brand-new attachment** — `unset($new_attachment_post->ID)` then `wp_insert_attachment(...)` (`class-wp-rest-attachments-controller.php:773-789`). There is no REST surface to mutate the original in place. Consequence: editing a featured image via REST yields a new ID; every reference (post content, `featured_media`) must be re-pointed by the caller. **Missing surface:** no `replace`/in-place mode on `POST /wp/v2/media/{id}/edit`.

2. **Image edit — scale (resize the full image).** `[upstream]`
   Classic supports `do=scale` → `WP_Image_Editor::resize()` on the full image (`wp-admin/includes/image-edit.php:933, 938-962`; AJAX `wp_ajax_image_editor` case `'scale'` at `ajax-actions.php:2710`). The REST `/edit` `modifiers[]` enum is **only** `flip` / `rotate` / `crop` (`class-wp-rest-attachments-controller.php:1646-1745`) — there is no `scale`/`resize` modifier. **Missing surface:** a `scale`/`resize` modifier (or dimension args) on the `/edit` route. (`docs/screens/media.md:320` already documents this gap.)

3. **Image edit — per-size targeting ("Apply to: All sizes / Thumbnail only / All except thumbnail").** `[upstream]`
   Classic reads `$_REQUEST['target']` + the `image_edit_thumbnails_separately` filter to apply edits to a subset of sizes (`wp-admin/includes/image-edit.php:932, 936, 998`). The REST `/edit` route takes no `target` arg and regenerates all subsizes from the edited image. **Missing surface:** a `target`/size-scope arg on `/edit`.

4. **Image edit — restore original.** `[upstream]`
   Classic `wp_restore_image()` reverts to the backed-up original and regenerates sizes (`wp-admin/includes/image-edit.php:810`; AJAX case `'restore'` at `ajax-actions.php:2712`). **No REST endpoint exists** for restore. **Missing surface:** a `POST /wp/v2/media/{id}/restore` (or equivalent). (`docs/screens/media.md:321` documents this.)

5. **Image edit — live preview.** `[upstream]`
   Classic renders an interactive preview of pending crop/rotate via `wp_ajax_imgedit_preview()` (`ajax-actions.php:255`) without committing. REST has no preview endpoint; a workspace editor must render the preview entirely client-side (canvas) before POSTing `/edit`. **Missing surface:** none planned — client-side canvas is the expected path, but it's non-trivial work, so flagged.

6. **Bulk delete via the batch endpoint.** `[upstream]`
   The attachments controller sets `protected $allow_batch = false` (`class-wp-rest-attachments-controller.php:25`), unlike the posts controller's `array('v1'=>true)` (`class-wp-rest-posts-controller.php:48`). So media cannot be deleted through `POST /batch/v1`; a bulk delete must be N parallel `DELETE /wp/v2/media/{id}?force=true` requests. **Workaround is fully viable** (the workspace's `createBulkConfirmModal` already does `Promise.allSettled` over per-item mutations) — so this is a soft blocker, but worth noting the absence of true batch.

7. **Per-type / per-status count aggregate.** `[upstream]` (with `[workspace]` workaround in place)
   Classic derives filter counts from `wp_count_attachments()` (PHP); **no REST endpoint exposes attachment counts** (grep of `wp-includes/rest-api/` for `wp_count_attachments` → none). The workspace's workaround — one `per_page:1&_fields:id` request per type, reading `X-WP-Total` (`_shared/dataviews/useEntityElementCounts.js`) — is in place and works, but costs N round-trips. **Missing surface:** a counts endpoint or an aggregations response on `/wp/v2/media`.

8. **"Insert from URL" / sideload an image from a remote URL.** `[upstream]`
   Classic's media modal has an "Insert from URL" tab; programmatic sideload uses `media_sideload_image()` (admin-side). There is **no REST endpoint** to ingest a remote URL into the library. **Missing surface:** a `POST /wp/v2/media` mode accepting a `source_url` to sideload. (Relevant only when the workspace builds the embedded picker; `docs/screens/media.md:595` flags it.)

**NOT blockers (verified achievable via current REST) — these are missing-feature gaps, tagged `[workspace]`:**

- **Image edit: crop / rotate / flip.** `POST /wp/v2/media/{id}/edit` accepts `modifiers:[{type:'crop'|'rotate'|'flip', args:{…}}]` (`class-wp-rest-attachments-controller.php:1635-1745`; `flip` added 6.9). The audit's headline question — "is crop/rotate exposed via REST?" — **yes**. The workspace just hasn't built the canvas.
- **EXIF / metadata read.** `media_details.image_meta` (aperture, camera, ISO, shutter, focal length, orientation, etc.) is returned in the schema (`controller:1195-1200`, populated at `:949`). Read-only — no write — but display parity is fully reachable.
- **Alt / caption / description / title save.** All writable via `PATCH /wp/v2/media/{id}` (schema `:1125-1178`; `alt_text` persisted to `_wp_attachment_image_alt` at `:477`). Workspace already does this.
- **Unattached filter.** `parent[]=0` → `post_parent__in` (`posts-controller:256`); WP_Query honors `post_parent__in => [0]`. Achievable.
- **Mine / author / date / search filters + sort.** `author[]`, `after`/`before`, `s`, `orderby` all on the inherited collection params (`posts-controller:2983-3120`). Search matches filenames automatically (`controller:111-113`). Achievable.
- **Attach / detach.** `post` field is writable (`controller:1202`, context view/edit, not readonly); `PATCH post:{id}` attaches, `post:0` detaches. Achievable.
- **Bulk delete with force.** `DELETE …?force=true` works per-item (media has no trash); only *batched* delete is blocked (#6). Achievable as parallel requests.
- **Subsize finalize.** `POST /wp/v2/media/{id}/post-process` with `action:'create-image-subsizes'` (`controller:518-528`). Achievable.

## DataViews / DataForms review

**The Media app does NOT use DataViews or DataForm — and arguably should.**

The app hand-rolls its grid (`<div class="…__grid">` of `<button>` tiles, `index.js:282-315`), its filter (`SelectControl`, `:211-220`), and its pagination (Prev/Next, `:317-347`). The workspace's other six entity-CRUD apps (posts / taxonomy / users / comments / plugins / themes) all consume `@wordpress/dataviews` via `src/apps/_shared/dataviews/*` and gain — for free — a sortable table layout *and* a media/grid layout, search, multi-axis filters, bulk-select with confirm modals (`createBulkConfirmModal.js`), per-page controls, view persistence, and the `manage_*_columns`-style extensibility the screen spec wants (`docs/screens/media.md:546-560`). DataViews ships a first-class `layout:'grid'` with a `mediaField` precisely for media-wall UIs (the themes app already uses it).

Anti-patterns / fragilities in the current hand-rolled approach:

- **`media_type` enum filter, not `post_mime_type`.** The `MEDIA_TYPE_OPTIONS` (`index.js:26-32`) can't express classic's spreadsheet/archive buckets. A DataViews `filters` definition over `mime_type` with `operator:'isAny'` would close this.
- **Count plumbing reused out of context.** `withElementCounts` + `useEntityElementCounts` are imported from the DataViews shared dir into a non-DataViews app (`index.js:18-22`). It works (the helpers are layout-agnostic), but it's a sign the app is reaching for DataViews infrastructure piecemeal — adopting DataViews wholesale would make this idiomatic rather than a one-off.
- **No selection model.** Bulk delete is impossible without one; DataViews provides selection out of the box (`useEntityDataView.js` wires it).

The detail modal hand-rolls form controls (`InputControl` ×2, `TextareaControl` ×2). The workspace's convention (CLAUDE.md) is single-record edits via `DataForm` + `src/apps/_shared/forms/EntityDataForm.js` + `useEntitySave.js`. Media's modal predates / sidesteps that pattern. Migrating it to `EntityDataForm` would also give it the success-snackbar / error-notice save handler it currently lacks (closing divergence #3 for the metadata path), plus consistent field rendering.

**Verdict on DataViews fit:** Media is the strongest candidate in the codebase for a DataViews migration it never received. The grid-tile UX it wants is exactly DataViews `layout:'grid'`; the bulk/filter/sort/search gaps above are all things DataViews supplies. The non-DataViews choice is defensible for a minimal v1 (app.md frames it as "intentionally simpler"), but it is the root cause of roughly half the matrix's ❌ rows.

## Recommendations / future work

**P1 — high impact, mostly workspace-side, unblocks the bulk of the matrix**

1. **Migrate MediaApp to `@wordpress/dataviews` with `layout:'grid'` + `layout:'table'`.** *(workspace)* Adopt `src/apps/_shared/dataviews/*` like the other six list apps. Immediately yields: list/grid toggle, sortable columns, selection model, search, filters, and the extensibility hooks the screen spec calls for. Where: replace `src/apps/media/index.js` grid/filter/pagination with `useEntityDataView` + a `DataViews` mount. This is the single highest-leverage change.
2. **Bulk select + bulk delete with confirmation.** *(workspace)* Falls out of #1 plus `createBulkConfirmModal` (`_shared/dataviews/createBulkConfirmModal.js`); delete is N parallel `DELETE …?force=true` (no batch endpoint — blocker #6, but the parallel pattern is the established workaround). Add the self-safe `force:true` everywhere (already correct).
3. ~~**Add `catch` to `handleUpload` + per-file error surfacing.**~~ **Done (#103).** Each `apiFetch` in `src/apps/media/index.js` is wrapped in its own `try/catch` so a failed file produces a `createErrorNotice` instead of a silent unhandled rejection; the batch continues past the failure. Resolves divergence #3.
4. **Search, date, author, Mine, Unattached filters.** *(workspace)* All REST-ready (`author[]`, `after`/`before`, `s`, `parent[]=0`). Wire as DataViews `filters`/`search` after #1.
5. **Inline image editor (crop / rotate / flip).** *(workspace)* Build a canvas editor that POSTs `modifiers[]` to `/wp/v2/media/{id}/edit`. Crop/rotate/flip are fully supported (controller:1635-1745). Surface "Edit Image" in the detail modal for `media_type==='image'`. Note the response is a **new attachment** (blocker #1) — design the UX around "saves as a copy" and let the caller re-point references.

**P2 — fills out the detail modal and uploader**

6. **Enrich the detail modal: dimensions, file size, filename, EXIF, uploaded-by, uploaded-to, audio/video preview.** *(workspace)* All data is already in the `media_details`/`filesize`/`filename`/`author`/`post` REST fields (controller:949, 989, 1030-1035) — just read and render them. Add `<audio>`/`<video>` for non-image previews.
7. **Drag-drop multi-file upload + per-file progress queue.** *(workspace)* Listen for `dragover`/`drop` on the app root; render a queue with per-file status. Upload remains `apiFetch` per file. Optionally also add a toolbar link to the existing `iframe:media-new.php`.
8. **Attach / detach to a post.** *(workspace)* `PATCH post:{id}` / `post:0` (controller:1202). Needs a post-picker UI (could reuse a core-data `useEntityRecords('postType','post')` search).
9. **Autosave the metadata form (or at least migrate to `EntityDataForm`).** *(workspace)* Closes divergence #1 and gives consistent save feedback. Use `_shared/forms/EntityDataForm.js`.
10. **Delete confirmation dialog.** *(workspace)* Closes divergence #2 — even outside bulk, single delete should confirm (media is trash-less).
11. **URL-driven pagination + filter state.** *(workspace)* Move `page`/`mediaType` into URL slots per the workspace's URL-as-state principle (CLAUDE.md); fixes divergence #5 and enables deep-links.
12. **Subsize-generation polling.** *(workspace)* After upload, if `missing_image_sizes` is non-empty, poll or call `POST /{id}/post-process` (controller:518); fixes divergence #6.

**P3 — parity polish / upstream asks**

13. **Image edit: scale, per-size target, restore-original, in-place save.** *(upstream — blockers #1-#4)* File/track WP core REST tickets to add a `scale` modifier, a `target` arg, a restore route, and an in-place/replace mode to the attachments controller. Until then, the workspace's image editor will diverge from classic on these four operations; document them as known gaps in `app.md`.
14. **Attachment counts endpoint.** *(upstream — blocker #7)* Request a REST aggregations/count surface for `/wp/v2/media` to replace the N-request `useEntityElementCounts` workaround.
15. **"Insert from URL" sideload endpoint.** *(upstream — blocker #8)* Needed only when the embedded media picker is built.
16. **Download file + View attachment-page actions.** *(workspace)* Trivial `<a download>` / permalink links in the detail modal/row actions.
17. **Help affordance + Screen-Options equivalent (per-page, column toggle).** *(workspace)* Lower priority; DataViews per-page/field config (#1) covers most of Screen Options.
18. **Fix doc drift in `docs/screens/media.md`.** *(workspace)* Update the stale `src/apps/MediaApp.js` references (lines 5, 568, 634) to `src/apps/media/index.js`, and refresh the coverage notes now that type-count filters have landed.
