# Screen Spec: Media

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/upload.php` + `wp-admin/media-new.php` + `wp-admin/media.php` (deprecated redirect) + `wp-admin/media-upload.php` (modal picker iframe) + `WP_Media_List_Table` (`wp-admin/includes/class-wp-media-list-table.php`)
**Current workspace coverage:** `core:media` → `src/apps/media/index.js` (partial — see "Gaps" below)

This spec describes the **semantic surface** of the Media Library screen — list, grid, upload, edit (including image-edit canvas), and the embedded media-picker — so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

The Media screen unifies four legacy admin URLs into one app: list (`upload.php?mode=list`), grid (`upload.php?mode=grid`, the default since 6.3), upload (`media-new.php`), and edit-attachment (`upload.php?item={id}` since 6.3; previously `post.php?action=edit&post={id}`). The legacy `media.php` is a 301 redirect to `upload.php` and is not a separate surface.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `media` |
| Display name | "Media Library" |
| Original URLs | `/wp-admin/upload.php` (list/grid), `/wp-admin/media-new.php` (Add New), `/wp-admin/upload.php?item={id}` (Edit), `/wp-admin/media-upload.php` (modal picker iframe) |
| Menu location | Top-level "Media" |
| Submenu items | Library (this screen, list+grid+edit), Add New (separate `media-new` flow but typically opened as overlay) |
| Parent app | None — top-level app instance |
| Sub-screens | Edit Media (single attachment), Add New (upload), embedded modal picker (used by editor apps) |

The same screen serves images, audio, video, documents, spreadsheets, archives, and any custom-mime attachment. Differences between mime groups are entirely data-driven (preview rendering, edit affordances). Only images expose the image-edit canvas.

---

## 2. Purpose

Browse, search, filter, upload, edit metadata, edit images, and delete media files. Primary entry point for content authors uploading assets; secondary use as the **media picker** invoked from any editor app to insert into post content, set featured images, or attach files to entities.

Jobs to be done:
- **Find an asset I uploaded** — search by filename/title/alt-text, filter by type or date.
- **Upload new files** — drag-drop or file-picker, single or batch.
- **Edit an asset's metadata** — title, alt text, caption, description.
- **Edit an image** — rotate, flip, crop, scale; save as new copy or replace original.
- **Insert into content** — pick an asset (or upload one) from inside an editor app via the embedded picker.
- **Triage and clean up** — bulk delete unattached or outdated files; identify which post each attachment is "Uploaded to".
- **Get a shareable URL** — copy the public URL to clipboard.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `upload_files` | `upload.php` line 12 |
| Upload | `upload_files` | `media-new.php` line 15; REST `create_item_permissions_check` |
| Edit metadata | `edit_post` (per attachment) | `WP_REST_Attachments_Controller::update_item_permissions_check` |
| Edit image (canvas) | `upload_files` + `edit_post` | `WP_REST_Attachments_Controller::edit_media_item_permissions_check` |
| Delete | `delete_post` (per attachment) | `WP_REST_Posts_Controller::delete_item_permissions_check` |
| Detach from parent | `edit_post` (per attachment) | `WP_Media_List_Table::column_parent` |
| Filter to detached/unattached | `upload_files` | list table only |

**Permission-denied state:** if user lacks `upload_files`, the menu entry is hidden. URL-direct access shows "Sorry, you are not allowed to upload files." The workspace mirrors this with a "no access" empty state.

**Per-row caps:** the list view checks `edit_post`/`delete_post` per attachment so unauthorized rows render without checkbox or destructive actions but still appear in the list.

**Trash:** media has no trash by default. `MEDIA_TRASH` is an opt-in PHP constant (`define('MEDIA_TRASH', true)` in `wp-config.php`); without it, delete is permanent and immediate. v1 workspace assumes default behavior (no trash).

**Multisite:** site-level upload quota enforced server-side via `upload_size_limit` filter; no client logic required.

---

## 4. Data model

### Primary entity
- **Type:** `attachment` (post type, `post_status: 'inherit'`)
- **REST endpoint:** `GET /wp/v2/media`
- **Single-record endpoint:** `GET /wp/v2/media/{id}` — used by edit screen and detail modal
- **Image edit endpoint:** `POST /wp/v2/media/{id}/edit` — applies modifiers, **returns a new attachment** (does not mutate original)
- **Post-process endpoint:** `POST /wp/v2/media/{id}/post-process` — finalizes async subsize generation after upload
- **Controller:** `WP_REST_Attachments_Controller` extends `WP_REST_Posts_Controller`

### Fields used by the list / grid

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `title` | `title.rendered` (raw via `?context=edit`) | string | display + sortable |
| `slug` | `slug` | string | URL-safe basename |
| `date` | `date` / `date_gmt` / `modified` | ISO 8601 | sortable; default desc |
| `author` | `author` (id) / `_embedded.author[0]` | int / embedded user | filter + display |
| `media_type` | `media_type` | enum | `image`, `file` (REST simplification — only two values) |
| `mime_type` | `mime_type` | string | full MIME (e.g. `image/jpeg`) |
| `source_url` | `source_url` | URL | full file URL |
| `link` | `link` | URL | attachment page (frontend) |
| `media_details` | `media_details` | object | image: `width`, `height`, `file`, `sizes{}`, `image_meta{}` (EXIF); audio/video: `length`, `bitrate`, `dataformat`, etc. |
| `alt_text` | `alt_text` | string | image accessibility, also used in alt column |
| `caption` | `caption.rendered` (raw via `?context=edit`) | string | shown in detail modal |
| `description` | `description.rendered` (raw via `?context=edit`) | string | shown in detail modal |
| `post` | `post` | int | parent post id ("Uploaded to" column) |
| `featured_media` | n/a | n/a | media itself is never featured |
| `comment_status` | `comment_status` | enum | when attachment pages enabled |
| `missing_image_sizes` | `missing_image_sizes` | string[] | sizes still being generated post-upload |

### Query parameters (collection)
- `per_page` — 1–100; default 20 in core list, 80 in grid
- `page` — pagination
- `search` — full-text across title/content/excerpt; with `s` set, also matches **filename** when `wp_allow_query_attachment_by_filename` filter is true (REST adds this automatically)
- `media_type` — array of `image | audio | video | application | text` (6.9+ accepts arrays; previously single value)
- `mime_type` — array of full MIME strings (6.9+)
- `author` — single id or comma list
- `parent` — filter by parent post id (was `post_parent` in legacy)
- `parent_exclude` — for "unattached" filter use `parent: 0`
- `after` / `before` — ISO 8601 date range
- `orderby` — `date`, `modified`, `title`, `id`, `slug`, `author`, `parent`, `relevance` (search)
- `order` — `asc` / `desc`
- `context=edit` — required for raw `title`/`caption`/`description`, capabilities, `missing_image_sizes`
- `_embed=author,wp:post` — author + parent post in one round trip
- `_fields` — restrict response payload

### Aggregate data (mime-type filter counts)

The legacy filter dropdown shows mime-type buckets without counts in REST; admin's `wp_match_mime_types` derives them from `wp_count_attachments()` (PHP). REST has no first-class count endpoint.

REST workaround: parallel `HEAD /wp/v2/media?media_type={t}&per_page=1` and read `X-WP-Total`. Five requests for image/audio/video/application/text. Acceptable; flagged as gap.

### Non-REST data (gaps)

- **`wp_count_attachments()`** — per-mime aggregate; replicate via parallel HEAD calls.
- **`wp_get_image_editor()` capabilities** — which mimes the server's image editor supports. Hardcoded list in REST: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `image/heic` (6.9+).
- **Attachment pages enabled** — `wp_attachment_pages_enabled` option drives `link`/comments column visibility. Not exposed in `/wp/v2/settings`; check via `siteinfo` or omit feature.
- **EXIF beyond `media_details.image_meta`** — REST exposes `aperture`, `credit`, `camera`, `caption`, `created_timestamp`, `copyright`, `focal_length`, `iso`, `shutter_speed`, `title`, `orientation`, `keywords[]`. Anything else needs custom endpoint.

### Upload data flow

1. `POST /wp/v2/media` — multipart with `file` + metadata fields (`title`, `alt_text`, `caption`, `description`, `post`, `status`).
   - Headers: `Content-Disposition: attachment; filename="…"`, `Content-Type: {mime}`.
   - Or use `Content-Type: multipart/form-data` body with `file` field.
2. Server returns `201` with the attachment record. For images, subsize generation may be deferred (`missing_image_sizes` non-empty).
3. If deferred: client polls or fires `POST /wp/v2/media/{id}/post-process` with `action: 'create-image-subsizes'` to finalize.
4. Errors: `rest_upload_image_type_not_supported` (server can't resize this image format), `rest_cannot_create` (cap fail), `rest_upload_size_limit` (over `upload_size_limit`).

---

## 5. Layout regions (semantic)

### List/grid mode (default app surface)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Media Library")                                  │
│  ├─ Primary action: "Add New" (upload trigger)               │
│  └─ Layout switcher (grid / list)                            │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Type dropdown (All / Images / Audio / Video /            │
│  │   Documents / Spreadsheets / Archives / Mine /            │
│  │   Unattached / Trash if MEDIA_TRASH)                      │
│  ├─ Date dropdown (month list, derived)                      │
│  ├─ Search input (title/filename/alt-text)                   │
│  └─ "Bulk select" toggle (grid mode)                         │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW (visible when ≥1 row selected, list mode)    │
│  └─ Bulk action select + apply (Delete permanently)          │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  Grid: tiled thumbnails, click → detail modal                │
│  List: table — File (thumb+title+filename), Author,          │
│         Uploaded to, Date; sortable                          │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  ├─ Pagination                                               │
│  └─ Total count                                              │
└─────────────────────────────────────────────────────────────┘
```

### Detail modal (grid item click)

```
┌─────────────────────────────────────────────────────────────┐
│ MODAL: ATTACHMENT DETAILS                                    │
│  Left: preview (image/audio player/video player/file icon)   │
│  Right: metadata form                                        │
│   ├─ Filename, file type, size, dimensions, uploaded date    │
│   ├─ Alt Text (images)                                       │
│   ├─ Title                                                   │
│   ├─ Caption                                                 │
│   ├─ Description                                             │
│   ├─ File URL (read-only) + Copy URL                         │
│   ├─ "Uploaded to" link                                      │
│   ├─ "Edit Image" button (images only) → image-edit canvas   │
│   ├─ "View" attachment page                                  │
│   ├─ "Download File"                                         │
│   ├─ "Delete Permanently"                                    │
│   └─ "Edit more details" → full edit screen                  │
│  Footer: arrow nav (← prev / next →)                         │
└─────────────────────────────────────────────────────────────┘
```

Modal saves are autosaved (debounced) per field on blur/change. Esc dismisses; ←/→ navigate between adjacent media items.

### Edit Media screen (full)

Reached via "Edit more details" or `?item={id}` route. Same field set as detail modal but with full description rich editor and a sidebar containing:
- Save / Update button
- Permalink to attachment page
- Delete Permanently
- "Replace Media" affordance (plugin territory in core; see Gaps)

### Image-edit canvas (images only)

```
┌─────────────────────────────────────────────────────────────┐
│ IMAGE EDITOR                                                 │
│  Left: canvas with crop overlay                              │
│   - Drag to set crop region                                  │
│   - Aspect ratio inputs (W:H), free or locked                │
│   - Selection inputs (W, H pixels)                           │
│  Right: tools                                                │
│   ├─ Rotate counterclockwise / clockwise                     │
│   ├─ Flip horizontal / vertical                              │
│   ├─ Scale (input new W or H, locked aspect)                 │
│   ├─ Crop / Cancel crop                                      │
│   ├─ Undo / Redo                                             │
│   └─ Restore original (reverts to source file)               │
│  Footer:                                                     │
│   ├─ Apply edits to: ( ) Thumbnail only ( ) All sizes        │
│   │                  ( ) All sizes except thumbnail          │
│   ├─ Save button                                             │
│   └─ Cancel                                                  │
└─────────────────────────────────────────────────────────────┘
```

### Upload surface

```
┌─────────────────────────────────────────────────────────────┐
│ UPLOAD                                                       │
│  Drop zone (full-screen drag overlay or inline pane)         │
│   "Drop files to upload, or [Select Files]"                  │
│  Per-file row: thumbnail preview, filename, progress %,      │
│   error message if any, remove from queue                    │
│  Max size: derived from `upload_size_limit` (server)         │
└─────────────────────────────────────────────────────────────┘
```

### Embedded media-picker (called from editor apps)

This is the modal that `media-upload.php` serves as an iframe in core. In the workspace it is a **rendered overlay**, not an iframe — the same component as the Media app rendered in selection mode.

```
┌─────────────────────────────────────────────────────────────┐
│ MEDIA PICKER (modal/drawer)                                  │
│  Tabs: Upload Files | Media Library | Insert from URL        │
│  Filter bar (same as main library, scoped to compatible      │
│   mime types per caller)                                     │
│  Grid (single- or multi-select per caller)                   │
│  Right rail: selection details + insertion settings          │
│   - Title, alt, caption                                      │
│   - Size (thumbnail / medium / large / full / custom)        │
│   - Alignment (none / left / center / right)                 │
│   - Link to (none / file / attachment page / custom URL)     │
│  Footer: Insert into post / Use as featured / etc.           │
└─────────────────────────────────────────────────────────────┘
```

The picker reuses the Media app's data layer; **only the chrome and selection contract differ**. Caller passes: `multiple: bool`, `allowedTypes: string[]`, `selected: id[]`, `purpose: 'insert' | 'featured' | 'gallery' | 'attach'`, plus an `onSelect(items)` callback. v1 ships the picker as a separate slot fill; see Gaps.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (initial) | First fetch | Skeleton tiles (grid) or rows (list) |
| Loading (page change) | Pagination/filter | Stale-while-revalidate; subtle inline indicator |
| Empty (no media ever) | `total === 0` and no filters | Onboarding empty state: icon + "No media yet" + Upload CTA |
| Empty (filtered) | `total === 0` with filters | "No media match these filters" + Clear filters |
| Empty (Trash) | trash filter, 0 results | "Trash is empty" |
| Upload in progress | Active uploads | Persistent footer/banner with per-file progress |
| Upload error | `rest_upload_*` | Per-row error in upload queue; retry available |
| Subsize generation | `missing_image_sizes.length > 0` | Spinner badge on tile; Edit Image disabled until done |
| Image edit in progress | Save pending | Disable controls; spinner on Save |
| Image edit error | Server returns `rest_image_*_failed` | Inline error; preserve canvas state |
| Network error | Generic 5xx / fetch fail | Banner with retry; preserve filters/selection |
| Permission denied | 401/403 | "You don't have permission" empty state |
| Quota exceeded (multisite) | `upload_size_limit` reached | Persistent banner + per-upload error |

---

## 7. Actions

### Primary action (header)
- **Add New** — opens upload UI (drop zone or file picker). Required cap: `upload_files`.

### Per-row actions (list view)

| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_post` | Navigation | Opens edit screen / detail modal |
| Delete Permanently | `delete_post` | Mutation | `DELETE /wp/v2/media/{id}?force=true` (always force; no trash by default) |
| View | public | External | Opens attachment page in new tab; only if `wp_attachment_pages_enabled` |
| Copy URL | none | Client-side | `navigator.clipboard.writeText(source_url)` |
| Download file | none | External | `<a download href={source_url}>`; respects same-origin |
| Attach (unattached only) | `edit_post` | Mutation | Find-posts modal → `PUT /wp/v2/media/{id}` with `post: {id}` |
| Detach | `edit_post` | Mutation | `PUT /wp/v2/media/{id}` with `post: 0` |

### Detail-modal actions (grid)

Same as list row plus:
- **Edit Image** (images only) — opens image-edit canvas
- **Edit more details** — navigates to full edit screen
- **Arrow navigation** — prev/next within current filter result set

### Image-edit actions

Each modifier is queued client-side; a single REST call submits the batch.

| Action | Modifier | Args | Notes |
|---|---|---|---|
| Rotate left | `rotate` | `angle: -90` | counterclockwise |
| Rotate right | `rotate` | `angle: 90` | clockwise |
| Flip horizontal | `flip` | `flip.horizontal: true` | added in 6.9 |
| Flip vertical | `flip` | `flip.vertical: true` | 6.9 |
| Crop | `crop` | `left, top, width, height` (percentages 0-100) | applied after rotate/flip |
| Scale | (client-side resize via canvas) | new dimensions | server-side scale uses `WP_Image_Editor::resize`; not in `/edit` modifiers — REST `/edit` does not accept scale natively. Workaround: re-upload as new attachment, or skip scale in v1 |
| Restore original | (delete edited subsizes) | n/a | core does this via `wp-admin/includes/image-edit.php`; **not exposed in REST**. Documented gap. |

REST request shape (6.9+):
```json
POST /wp/v2/media/{id}/edit
{
  "src": "https://example.com/wp-content/uploads/2024/01/photo.jpg",
  "modifiers": [
    { "type": "rotate", "args": { "angle": 90 } },
    { "type": "flip", "args": { "flip": { "horizontal": true, "vertical": false } } },
    { "type": "crop", "args": { "left": 10, "top": 10, "width": 80, "height": 80 } }
  ]
}
```

Returns: a **new attachment record**. Callers must update references (e.g. featured_media on parent post) if they want to replace the original.

The legacy flat-args form (`x`, `y`, `width`, `height`, `rotation`, `flip{horizontal,vertical}`) is still accepted but deprecated since 6.9 in favor of `modifiers[]`.

### Bulk actions

| Bulk action | Behavior |
|---|---|
| Delete Permanently | Parallel `DELETE /wp/v2/media/{id}?force=true`; one confirmation; report partial failures |

Selection model: checkbox per row (list); "Bulk select" mode toggle in grid that turns tiles into selectable cards.

### Optimistic vs. blocking
- **Metadata save** (alt, title, caption, description) — optimistic, autosaved on blur/change
- **Delete** — blocking; show confirmation
- **Image edit save** — blocking; the response includes the new attachment id which the caller needs synchronously
- **Upload** — async with per-file progress; never blocks UI

---

## 8. Filters, sort, search, pagination

### Filters

| Filter | Field | Operators | Source of options |
|---|---|---|---|
| Type | `media_type[]` | `is`, `isAny` | Hard-coded: image, audio, video, document (application + text), spreadsheet (specific MIMEs), archive (specific MIMEs). Core's `wp_get_mime_types()` provides full mapping but groups are admin-only. |
| Mine | `author` (current user id) | `is` | Toolbar shortcut |
| Unattached | `parent: 0` | n/a | Single-value pseudo-filter |
| Trash | n/a (stash status) | n/a | Only when `MEDIA_TRASH` defined |
| Date | `after` + `before` | range | Month dropdown derived from earliest media |
| Author | `author` | `is`, `isAny` | `GET /wp/v2/users?per_page=100&who=authors` |
| Parent post | `parent` | `is` | rare; used by "view media for this post" deep-link |

Filters AND across fields, OR within multi-value.

### Sort
Default: `date desc`. Sortable: `title`, `author`, `parent`, `date` (`comment_count` legacy column omitted from default v1 list).

### Search
Single full-text input (`?search=`). Matches title, content, excerpt, **and filename** (REST auto-applies `wp_allow_query_attachment_by_filename`). Debounced 300ms. Resets to page 1.

### Pagination
- Default page size: 20 (list), 80 (grid)
- Page X of Y, total count, prev/next, jump-to-page
- URL state: `?page=2`

---

## 9. Forms & inputs

### Detail/edit metadata form

| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | post_title; defaults to filename basename on upload |
| Alternative Text | text | recommended for images | post meta `_wp_attachment_image_alt`; surfaced as `alt_text` in REST |
| Caption | text | no | post_excerpt |
| Description | rich text (or plain) | no | post_content; full edit screen uses block editor in core 6.5+, plain textarea historically |
| File URL | text (read-only) | n/a | `source_url` |
| Filename | (read-only display) | n/a | derived from `source_url` |
| File type | (read-only display) | n/a | `mime_type` |
| File size | (read-only display) | n/a | `media_details.filesize` (bytes) |
| Dimensions | (read-only display) | n/a | `media_details.width × height` (images/video) |
| Length | (read-only display) | n/a | `media_details.length_formatted` (audio/video) |
| Uploaded by | (read-only) | n/a | `author` (user link) |
| Uploaded to | post picker / link | no | `post`; "find posts" modal for change |

### Image-edit canvas inputs

| Input | Type | Notes |
|---|---|---|
| Crop region X | number (px) | 0..image width |
| Crop region Y | number (px) | 0..image height |
| Crop region W | number (px) | converted to % for REST |
| Crop region H | number (px) | converted to % for REST |
| Aspect ratio | "W:H" pair or "Free" | locks during drag |
| Rotation angle | enum | -90, 90, 180 (or repeated 90s) |
| Apply to | radio | thumbnail / all / all-except-thumbnail |
| Scale W / H | number (px) | locked aspect; client-side or skipped in v1 |

### Validation
- Server is authoritative. Client-side: alt-text length warning at 125 chars (a11y best practice), filename uniqueness handled server-side.
- Save semantics: `PUT /wp/v2/media/{id}` with changed fields. Optimistic.
- No autosave at the list level; autosave-on-blur in detail modal and edit screen.

---

## 10. Routing & URL state

### Original wp-admin URLs
- `upload.php?mode=list|grid` — view mode (persisted to user option `media_library_mode`)
- `upload.php?attachment-filter={value}` — type filter; values: `''`, `mine`, `detached`, `trash`, `post_mime_type:{mime}`
- `upload.php?m={YYYYMM}` — date filter
- `upload.php?author={id}` — author filter
- `upload.php?s={query}` — search
- `upload.php?paged={n}` — pagination
- `upload.php?orderby={col}&order={asc|desc}` — sort
- `upload.php?item={id}` — open detail modal/edit (6.3+)
- `media-new.php` — separate upload screen
- `media-upload.php?type={image|audio|video|file}&tab={type|library|gallery|...}` — modal picker (iframe, legacy)

### Recommended workspace URL state

```
#/media?layout=grid&type=image&author=2&search=banner&page=2&sort=date:desc
#/media/{id}                         — detail modal/edit
#/media/{id}/image-edit              — image-edit canvas
#/media/upload                       — upload UI (when modal/drawer)
```

Browser back/forward must restore filter state and modal stacking. Refresh restores filters but may close modal (acceptable). URL sharing reproduces the filtered view (and the detail modal if `/{id}` present).

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)

| Trigger | Destination | Carry |
|---|---|---|
| Click thumbnail (grid) | this screen, `/{id}` modal | id |
| Click title (list) | this screen, `/{id}` edit | id |
| "Uploaded to" link | `editor` / `posts` app | parent post id |
| Author link | this screen, filtered | `?author={id}` |
| "View" attachment page | external URL | new tab |
| "Edit Image" | this screen, `/{id}/image-edit` | id |

### Inbound (other apps → this screen)

- From `editor` app: media-picker overlay (selection mode) — calls `onSelect(items)` and dismisses
- From `posts` app: filter "media uploaded to {post}" — `?parent={id}`
- From `profile` app: avatar editor (separate flow; not media library)
- From command palette: quick navigation, optionally with filter

### Embedded picker contract

The picker is invoked, not navigated to. Caller passes:
```js
{
  multiple: false,
  allowedTypes: ['image'],
  selected: [12, 34],
  purpose: 'featured-image',
  onSelect: (attachments) => {...},
  onCancel: () => {...}
}
```

Selection state persists for the modal lifetime only (no URL state).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Upload progress | Persistent footer with per-file rows + overall % |
| Upload complete | Snackbar: "{filename} uploaded" with "View" link |
| Upload failed | Inline error in queue row + snackbar; retry button |
| Subsize generation done | Silent; tile re-renders with full thumbnail |
| Metadata saved | Subtle inline indicator ("Saved"); no snackbar (autosave) |
| Delete (single) | Confirmation modal then snackbar: "Deleted permanently" — no undo |
| Bulk delete | Confirmation then snackbar: "{N} deleted" with failure count if any |
| Image edit saved | Snackbar: "Image saved as new copy" + link to new attachment |
| Image edit failed | Inline banner with server error message |
| Copy URL | Snackbar: "URL copied to clipboard" (1.5s) |
| Detach/attach | Snackbar: "Attached to {post}" / "Detached" |

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `↑↓←→` | Move focus in grid; move row in list |
| `Space` | Toggle selection on focused tile/row |
| `Enter` | Open focused item (detail modal) |
| `Esc` | Close modal / cancel image edit / clear selection |
| `Cmd/Ctrl+A` | Select all on page (in bulk-select mode) |
| `Shift+Click` | Range select |
| Within modal: `←/→` | Prev/next item |
| Image canvas: `Esc` | Cancel current crop |

### ARIA & focus

- Grid: `role="grid"` with `role="gridcell"` per tile; `aria-rowindex`/`aria-colindex` for screen readers
- List: `role="table"` with sortable columns using `aria-sort`
- Detail modal: focus trap, return focus to triggering tile on close
- Image canvas crop region: announce dimensions on resize (live region)
- Upload progress: `aria-live="polite"` for status, `role="progressbar"` per file with `aria-valuenow`
- Alt text input: announce char count near 125-char a11y warning threshold
- "Edit Image" success focuses the new-attachment notification

### Screen reader

- "Uploading {filename}, {n}%" announced periodically
- Sort changes announced ("Sorted by Date, descending")
- Selection count: "{N} items selected" via live region
- Image-edit modifiers: announce on apply ("Rotated 90 degrees clockwise")

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_media_columns` | Add list columns | Replace with workspace `fields` extensibility |
| `manage_media_custom_column` | Render custom column | Replace with field-render registry |
| `media_row_actions` | Per-row action links | Replace with workspace `actions` registry (`core:media.row-actions` slot) |
| `manage_taxonomies_for_attachment_columns` | Show taxonomy columns | Replace with field registration tied to taxonomy data |
| `restrict_manage_posts` (with `post_type === 'attachment'`) | Filter dropdowns | Replace with workspace-level filter API |
| `attachment_fields_to_edit` | Add detail-modal fields | Replace with `core:media.detail-fields` slot |
| `attachment_fields_to_save` | Process detail-modal saves | n/a — direct REST writes |
| `media_upload_tabs` | Add picker tabs | Replace with `core:media.picker-tabs` slot |
| `media_upload_{type}` | Custom picker tab content | Replace with picker-tab slot fill component |
| `image_edit_thumbnails_separately` | Toggle "Apply to all/thumbnail/except" | n/a — exposed as form choice |
| `wp_handle_upload_prefilter` | Validate uploads | Server-side, unaffected by workspace |
| `wp_get_attachment_metadata` | Mutate metadata read | Server-side |
| `media_meta` | Display extra meta | Replace with detail-modal slot |

Plugin compatibility: third-party media plugins relying on `media_row_actions`, `attachment_fields_to_edit`, or media-popup tab filters will not work. Workspace ships its own slot-based extension API.

---

## 15. Mapping & implementation status

### Current workspace coverage

- **Source:** `core:media` → `src/apps/media/index.js`
- **What works:** grid layout, upload via `apiFetch`, detail modal (basic fields), delete with confirm
- **What does not:** list mode, image edit, bulk select+delete, type/date/author filters, search by filename, picker mode, attached/detached filter, progress-bar polish, multi-tab picker, EXIF display

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| List view layout | High | Table with thumb + filename + author + parent + date columns |
| Type filter (image/audio/video/document/spreadsheet/archive) | High | Hard-coded mime groups; counts via parallel HEAD calls |
| Date filter (month dropdown) | High | Derive from earliest upload |
| Author filter | High | User picker |
| Search by filename | High | Add `wp_allow_query_attachment_by_filename` filter; already on by default in REST attachments controller |
| Bulk select + bulk delete | High | Selection model + confirmation modal |
| Image-edit canvas | High | Crop + rotate + flip; `POST /wp/v2/media/{id}/edit` with modifiers |
| Image edit "Apply to" radio | High | thumbnail / all / all-except-thumbnail (server already supports separately) |
| Restore original | Medium | No REST endpoint; document as core gap |
| Scale image | Medium | Not in `/edit` modifiers; v1 skip or client-side resize-and-reupload |
| Subsize generation polling | Medium | Watch `missing_image_sizes`; auto `/post-process` if stuck |
| EXIF display in detail modal | Medium | `media_details.image_meta.*` |
| Audio/video preview in detail modal | Medium | Use `<audio>`/`<video>` with `source_url` |
| Document/file generic preview | Medium | Mime-typed icon + filename |
| Attached / Unattached filter (`parent: 0`) | Medium | |
| "Uploaded to" attach/detach affordances | Medium | post picker for attach |
| Copy URL action | Medium | `navigator.clipboard.writeText()` |
| Download file action | Low | `<a download>` |
| Embedded media picker (selection mode) | High | Reuse Media app with `mode: 'pick'`, `onSelect`, `allowedTypes`; replaces media-upload.php iframe |
| Picker tabs (Upload / Library / Insert from URL) | High | Tab UI; URL-tab uses `apiFetch` with `media_sideload_image` PHP equivalent (no REST equivalent — `media-sideload` ships in WP 6.5 admin AJAX only; gap) |
| Insert-into-post settings (size/align/link) | Medium | These are caller concerns; workspace exposes them in picker right-rail |
| Drag-drop full-window upload | Medium | Listen on document for `dragover`/`drop` |
| Upload progress UI | Medium | Replace ad-hoc with persistent footer |
| Quota indicator (multisite) | Low | Shows when `upload_size_limit` hit |
| Trash view (when `MEDIA_TRASH`) | Low | Default-off; opt-in |
| Featured-image picker integration | High | Wire picker into editor app's featured-image control |

### Acceptable interim

For v1 of any new workspace config, `iframe:upload.php?mode=grid` is acceptable as escape hatch. Mark the config explicitly. The image-edit canvas is the most substantive gap; iframe-fallback to `upload.php?item={id}&action=edit` is acceptable for v1 if the workspace's primary user is not an image-heavy editor.

---

## 16. Out of scope

- **Browser uploader fallback** (the `<input type="file">` one without plupload) — modern browsers no longer need it; v1 ships single uploader
- **Plupload-specific UI** — implementation detail
- **Find Posts modal for attaching** — replaced by inline post picker in detail modal
- **Comments column on attachments** — `wp_attachment_pages_enabled` is off by default in core 6.5+; deprioritize
- **Attachment taxonomies** (custom taxonomies attached to media via `register_taxonomy_for_object_type`) — supported via field registration but no first-class UI surface in v1
- **Compress on upload** (server-side image optimization) — handled by `wp_handle_upload` filters; transparent
- **WebP/AVIF generation strategy** — server-side
- **Media replace** (replace one file with another while preserving id/url) — not in core; plugin-only (Enable Media Replace)
- **Bulk metadata edit** — not in core media library; useful but defer
- **CDN integration** — out of workspace concern

---

## 17. Reference

- Original PHP: `wp-admin/upload.php` (list/grid), `wp-admin/media-new.php` (upload), `wp-admin/media.php` (deprecated 6.3 → redirects to upload.php)
- Embedded picker: `wp-admin/media-upload.php` is the iframe rendered as the legacy modal; **not a standalone screen** — the v1 picker is a non-iframe overlay component reusing Media app data with `mode: 'pick'`
- Upload handler: `wp-admin/async-upload.php` is the server-side handler invoked by plupload; **not a screen** — REST `POST /wp/v2/media` replaces it for the workspace
- List table: `wp-admin/includes/class-wp-media-list-table.php`
- Image edit (admin): `wp-admin/includes/image-edit.php` (render + non-REST AJAX endpoints `image-editor` action)
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php`
- REST schema: `https://developer.wordpress.org/rest-api/reference/media/`
- Image-edit endpoint added: 5.5.0; `flip` + `modifiers[]` added: 6.9.0
- Current workspace impl: `src/apps/media/index.js`
- Workspace config example: `workspaces/content-author.json`
