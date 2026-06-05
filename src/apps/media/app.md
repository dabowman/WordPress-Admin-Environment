# core:media

Prose accompanying `app.json#documentation` for the media library.

## Overview

MediaApp is a DataViews host over the `root/media` (attachment) entity — grid + table layouts, search, the media-type / author / date filters, selection, and bulk delete — sharing the same `src/apps/_shared/dataviews/` scaffolding as the other six list apps (posts / taxonomy / users / comments / plugins / themes). Two things make Media different from those apps:

1. **An image-specific media-field renderer.** The `thumbnail` field branches: `media_type === 'image'` renders the attachment's thumbnail `source_url`; everything else renders a labeled file-type tile (`PDF`, `MP4`, …) derived from `mime_type.split('/').pop().toUpperCase()`. The other list apps never need this branch.
2. **An upload affordance.** DataViews has no upload slot, so the upload control lives in a toolbar **above** the DataViews mount.

Metadata editing is extracted into a **host-agnostic `MediaDetails` component** (`MediaDetails.js`) so it can later live in a modal, an inspector, or a side-pane without a rewrite.

## Architecture

### List (DataViews)

`index.js` wires the shared harness:

- `useDataView(screenId)` resolves the `root/media/_default` dataView doc (baseline declared in `app.json#dataView`, injected post-merge by `inject_app_baselines`).
- `useEntityDataView` owns `view` + `selection` (local state; URL slots are deferred to #136).
- `buildQueryArgs(view, QUERY_MAPPING, staticArgs)` maps the DataViews `view` → REST query args: `search → search`, `sort → orderby/order`, pagination → `per_page`/`page`, the `type` filter → `media_type`, and the `author` filter → `author`. The Type filter is **single-select** (`filterBy.operators: ["is"]`) because the attachments controller's `media_type` is a single-value enum (`image | video | audio | text | application`) — a multi-select CSV (`media_type=image,video`) 400s. The static args also carry `_embed: 'author'` so each record exposes `_embedded.author[0].name` for the Author column (the raw `record.author` is a bare numeric id; the column falls back to an em dash while the embed resolves). The **Mine** and **Unattached** toolbar toggles are pseudo-filters (no DataViews filter UI) merged as static args — `author={currentUserId}` and `parent=0` respectively. The Mine toggle is hidden when `window.wpAdminWorkspaces.userId` is missing, since the filter would otherwise no-op.
- **Mine ↔ author-filter coherence.** Mine and the `author` dropdown filter both scope by author, so the app keeps exactly **one author scope active at a time** (the two would otherwise contradict — `buildQueryArgs` applies the dropdown value *on top* of static args, so a picked author would silently win while Mine still rendered checked). The rule: (1) when an `author` view-filter is active (`activeAuthorFilterValue(view.filters)` returns a value), the Mine static `author` arg is **skipped** — the explicit filter is the single source of author scope; (2) the Mine toggle's checked state is **derived** (`mineChecked`), not a standalone boolean: checked only when the active author scope is the current user — `String(authorFilterValue) === String(currentUserId)` when a filter is active, else the raw `showMine`; (3) toggling Mine **drops** any active `author` filter from `view.filters` in **both** directions — ON so Mine takes over the axis cleanly, OFF so a Mine that read checked only because the dropdown pointed at the current user actually unchecks (otherwise the toggle would snap back checked: an inert toggle); (4) the clearing is **symmetric** — a `useEffect` keyed on `authorFilterActive` calls `setShowMine(false)` the moment an `author` dropdown filter becomes active, so the underlying `showMine` state can never sit latently `true` beneath a dropdown filter. Without (4), clearing the dropdown filter would silently resurface the user's OWN media (the latent `showMine` re-applying `author=currentUserId`) instead of returning to all media. Type / Unattached / date / search are orthogonal and untouched.
- **Author filter (#132).** The `author` field is `is`-only with options supplied by a `getElements` provider (`getAuthorElements`) — one `resolveSelect(coreStore).getEntityRecords('root','user', { who: 'authors', per_page: 100, _fields: 'id,name' })` mapped to `{ value: id, label: name }` and cached after the first filter-open (mirrors the Posts lane's taxonomy element providers). The field `type` is `text` to match the rendered cell (the embedded author display name); the filter `value` is the numeric user id, which the `is` operator passes straight to REST `author`. This also resolves the #109 round-1 nit where the `author` field declared a `filterBy` with no options or query mapping — it is now wired and functional.
- **Date filter (#132).** The `date` field exposes the `before`/`after` operators (`filterBy.operators: ["before","after"]`). `buildQueryArgs` only speaks `is`/`isAny`, so a supplemental `applyDateFilters(args, view.filters)` pass maps the date filter to the attachments controller's REST `before` / `after` ISO params — the same supplement pattern the Posts lane uses. It is a one-sided date bound (`before X` OR `after Y`, not a two-ended range — DataViews holds one filter per field).
- `buildFields` / `buildActions` compile the field + action specs, with `FIELD_LABELS` / `ACTION_LABELS` in-app `__()` tables (the cascade reaches DataViews with raw English labels regardless of locale).
- The media-type filter elements carry counts (`Images (12)`) via the shared `useEntityElementCounts` hook + `buildFields`' `elementCounts` — one `per_page=1&_fields=id` request per type, total read off `X-WP-Total`.
- **DataViews is gated on `records !== null`** — a centered `<Spinner/>` covers the window between first render and the resolver kicking off; DataViews handles its own loading state for subsequent filters / pagination.
- The list app carries `wp-admin-workspaces-app--fill` (full-bleed); the DataViews background is handled engine-side (`--wp-dataviews-color-background`).

### Upload

Multipart upload via raw `apiFetch` — the documented exception to the core-data rule (`saveEntityRecord` doesn't handle multipart well). Each file is its own request in a sequential `for...of` loop, each wrapped in its own `try/catch` so one file's failure (oversize / disallowed MIME / quota) raises a per-file `createErrorNotice` without aborting the batch. When ≥1 file uploads, a success snackbar fires and the cache-invalidation pass (`refreshAfterMutation`) refreshes both the list query and the per-type counts.

### MediaDetails (host-agnostic)

`MediaDetails.js` owns, in one presentation-agnostic unit:

1. **Entity binding** — `useEntityRecord('root','media', id)` with the buffered `edit()` / `save()` / `hasEdits`, threaded through the shared `useEntitySave` so a server-reported error keeps the host open.
2. **Preview slot** — a `<MediaPreview>` sibling sub-component (image thumbnail, `<audio>`/`<video>` player, or a file-type tile), composed *next to* the form, never fused into it. For image attachments it carries an **Edit Image** button that swaps in the inline `ImageEditor` (#125) — see below.
3. **Metadata `DataForm`** — title, alt-text (images only, via `form` `isVisible`), caption, description. The `fields` / `form` split lets a future host vary only the `form` layout (compact panel here; expanded sections in a pane) while reusing the same field set + validation.
4. **Actions** — Copy URL, Delete (permanent, `force: true`), and an explicit Save.

The HOST (`MediaDetailsModal` in `index.js`) supplies only chrome — the `@wordpress/components` Modal frame + `onClose` + an `onMutated` invalidation callback. Swapping that host for a region / inspector / side-pane must not touch `MediaDetails.js`.

**Commit strategy.** The data flow is autosave-ready: `edit()` buffers every keystroke and the entity exposes `save()` / `hasEdits`, so a future autosaving host (a side-pane, the #119 document-settings sidebar) can wire a debounced/on-blur `save()` without touching the component. Today's modal host renders an explicit Save button (the reassurance superset). Choosing the buffered-edit data flow now is what avoids a rewrite when the pane lands. A shared `useEntityAutosave` should be promoted only when a second autosaving consumer actually needs it — not before (per #109's `_shared/forms` boundary note).

### Inline image editor (#125)

`ImageEditor.js` fills the `MediaDetails` preview slot when the user clicks **Edit Image** on an image attachment (host-agnostic, exactly like `MediaDetails` itself — it renders in the details modal today and could render in a region / inspector pane later, per `docs/dataviews-interaction-patterns.md`). It does crop / rotate / flip and saves via `POST /wp/v2/media/{id}/edit`.

- **REST contract is factored out.** The pure mapping from editor state (clockwise rotation, horizontal/vertical flip, crop rectangle) to the `modifiers[]` array is in `imageEditorModel.mjs` — `buildModifiers`, `normalizeCrop` / `isMeaningfulCrop`, `rotateBy`, `displayDimensions`, and the crop-drag math (`moveCrop` / `resizeCrop`). It's a side-effect-free `.mjs` so the node harness pins it (`tests/runtime/image-editor-model.test.mjs`) without a webpack/jest pass.
- **Modifier order = REST-apply order.** `buildModifiers` emits `rotate → flip → crop`, the exact order the controller applies them, and drops every no-op (no rotation, no flip, full-frame crop) so the array is empty precisely when there's nothing to save. The clockwise rotation passes straight through as the REST `angle` (the controller negates it internally before GD's counter-clockwise rotate, so a clockwise UI value saves clockwise).
- **Preview fidelity.** The `<canvas>` composes the same rotate → flip → crop order (rotate inner, flip outer so a point rotates first and mirrors second). Its intrinsic size is the post-rotation bounding box (`displayDimensions` swaps W/H at 90°/270°), so the crop overlay's percentages — read against the canvas — are exactly the basis the controller multiplies its crop percentages against. What the user sees is what the server produces.
- **Crop UI.** A draggable selection box with four corner resize handles, all geometry in percent of the stage (so it stays aligned regardless of how the canvas is display-scaled). Pointer capture keeps a drag tracking when the cursor leaves the handle; `moveCrop` / `resizeCrop` clamp to the frame and enforce a minimum size.
- **Saves as a NEW attachment.** The `/edit` route always inserts a new attachment (no in-place REST mode — `docs/parity/media.md` blocker #1). The editor says so ("Saves a copy — the original is kept") and hands the new attachment up via `onSaved(newAttachment)`. `MediaDetails` fires a snackbar, invalidates the host list, and bubbles the new id through `onReplaced` so `MediaDetailsModal` re-keys to the new attachment. Callers must not assume the attachment id survives an edit.
- **Why `apiFetch`.** The `/edit` route is an action that returns a new attachment, not a standard entity update — the same documented exception as multipart upload. The canvas only *draws* the source (never reads pixels back via `toDataURL`/`getImageData`), so a tainted cross-origin (CDN) image still previews.

Only crop / rotate / flip are wired, because the `/edit` `modifiers[]` enum supports nothing else — scale, per-size targeting, restore-original, and in-place save are admin-ajax-only (`docs/parity/media.md` blockers #1–#4) and remain known gaps.

### Delete

Media has no trash, so single + bulk delete both go through `createBulkConfirmModal` with `deleteEntityRecord('root','media', id, { force: true })`, a "permanently delete" confirmation, `Promise.allSettled` over the targets, and partial-failure reporting. No self-delete guard (that's a Users concern). `MediaDetails` also exposes a single Delete inside the editor.

## Extension seams (deferred work)

These are intentional, documented seams — do **not** build them in this app:

- **#125 image editor** — *done.* `ImageEditor.js` fills the `MediaDetails` preview slot (crop / rotate / flip via `POST /wp/v2/media/{id}/edit`, saving a new attachment). See the *Inline image editor* section above. Scale / per-size target / restore / in-place save stay out (REST blockers).
- **#136 URL slots** — filter / pagination / the open-detail item move to URL state (`?layout=`, `?type=`, `?search=`, `?page=`, `/{id}`). Today `view` + `editingId` are local `useState`; `useEntityDataView` is already the swap point.
- **#132 fuller filters** — *done.* Date (`after`/`before`) + a functional author picker land here alongside `type` / Mine / Unattached. `QUERY_MAPPING.filters.author` maps the `author` filter to REST `author`; `applyDateFilters` supplements `buildQueryArgs` for the `before`/`after` date operators; author options resolve lazily via the `getAuthorElements` `getElements` provider. A category filter is not applicable (attachments have no category taxonomy).

## Rebuild guide (non-WPDS / non-React)

A non-WPDS rebuild needs: a DataViews-equivalent grid+table host (search / sort / filter / pagination / selection / per-row + bulk actions / action modal); a media-field renderer that branches image-thumbnail vs. file-type tile; an upload toolbar above the list (multipart POST per file, per-file error surfacing); a host-agnostic details unit binding a single attachment with buffered edit + explicit/auto save, a separable preview slot, a metadata form (title / alt — images only / caption / description), and Copy URL + permanent Delete; an inline image editor in the preview slot (canvas preview composing rotate → flip → crop in that order, a percent-based crop selection, and a `POST /wp/v2/media/{id}/edit` save that re-points to the new attachment it returns — the pure `modifiers[]` mapping is reusable from `imageEditorModel.mjs`); and clipboard API access.

Preserve two patterns:

- **Multipart upload via raw api-fetch + FormData** — don't shoehorn through the entity-save abstraction.
- **`MediaDetails` decoupled from its host** — the entity binding + form + actions live in the unit; the host supplies only chrome. This is what lets the #125 image editor and a future side-pane drop in without a rewrite.

## Known limitations / parity gaps vs. `docs/screens/media.md`

- **Image-edit canvas** (crop / rotate / flip) lands here (#125) in `ImageEditor.js`. **Scale, per-size targeting, restore-original, and in-place save are NOT available** — the REST `/edit` `modifiers[]` enum only supports crop/rotate/flip and always saves a new attachment (`docs/parity/media.md` blockers #1–#4). wp-admin's editor does all of those; the workspace diverges here until those REST surfaces exist.
- **Flip requires WordPress 6.9+.** The `flip` modifier was added to the `/wp/v2/media/{id}/edit` `modifiers[]` `oneOf` schema in WP 6.9. The plugin's floor is `Requires at least: 6.7` (6.7/6.8 are supported via the Gutenberg private-API fallback), and on those versions a `flip` edit returns `rest_invalid_param` (400) — and because the route validates `modifiers[]` per-item, a flip would fail the *entire* rotate+flip+crop edit, not just the flip. So **the flip-horizontal / flip-vertical tool buttons are hidden below 6.9** (gated on `window.wpAdminWorkspaces.supportsImageFlip`, set PHP-side via `version_compare( get_bloginfo('version'), '6.9', '>=' )`); crop and rotate work on every supported version. When a save does error, the editor surfaces the REST body's `err?.message` in an error Notice (falling back to a generic string only when the body has none).
- **Filters.** Type / Mine / Unattached / author / date-range land here (#132). The author filter is a DataViews single-select (`is`) over content authors rather than wp-admin's month dropdown for dates — the date filter is a one-sided `before`/`after` bound instead. Attachments have no category taxonomy, so there is no category filter.
- **No URL state.** Filters / pagination / open-detail are local; deep-linking + back/forward restoration deferred to #136.
- **No embedded media picker** (selection mode, `media-upload.php` insert-into-post). Out of scope (separate / iframe).
- **No drag-and-drop upload** — click-to-pick only.
- **No "Uploaded to" attach/detach** affordance, no EXIF display, no subsize-generation polling. wp-admin has these; the workspace omits them for now.
- **No per-row capability gating** — wp-admin hides checkbox / destructive actions on rows the user can't edit/delete; the workspace relies on the screen-level `upload_files` floor.
- **Copy URL relies on `navigator.clipboard`** — insecure-origin (HTTP-only dev) contexts deny access; the error notice is the fallback.
