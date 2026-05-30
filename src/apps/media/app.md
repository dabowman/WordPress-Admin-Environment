# core:media

Prose accompanying `app.json#documentation` for the media library.

## Overview

MediaApp is the closest the shell gets to WordPress's classic Media Library. It's not built on DataViews because the grid is intentionally simpler — just tile thumbnails with a click-to-detail interaction, plus an upload button and a media-type filter. The detail modal handles per-attachment metadata editing (title, alt text, caption, description) and the destructive operations (copy URL, delete).

Two notable patterns:

- **Multipart upload via raw `apiFetch`.** `core-data`'s `saveEntityRecord` doesn't handle multipart well. Building a FormData manually + POSTing through `apiFetch` is the reliable path. Each file is its own request (no batch upload endpoint); files iterate sequentially in a `for...of` loop and we await each one. Each request is wrapped in its own `try/catch` so a single file's failure (oversize / disallowed MIME / quota) raises a per-file `createErrorNotice` (`Could not upload "<name>": <reason>`) without aborting the rest of the batch. The cache-invalidation pass only fires when at least one file uploaded successfully.
- **`key={item.id}` on the modal.** The detail modal owns local form state mirroring the entity's title/alt/caption/description. Without a key prop, switching from one item to another while the modal is open would carry over the previous values — wrong. With `key={item.id}` the modal remounts on each item, resetting its local state to that item's values.

## Architecture

`queryArgs` is `useMemo`-derived from `mediaType + page`. Per-page is fixed at 40 (a reasonable visual density for the 3-or-4 column grid). Pagination is local (Prev/Next + page counter), not URL-driven — refreshing returns to page 1.

The grid is native `<button>` per tile because `<img>` alone isn't keyboard-actionable. Each tile shows either:

- The thumbnail size's `source_url` for `media_type === 'image'`, with `alt={item.alt_text}`.
- A labeled file-type tile (e.g. `PDF`, `MP4`) for non-image attachments — derived from `mime_type.split('/').pop().toUpperCase()`.

The detail modal renders preview-left + form-right. Alt-text input only surfaces for images. The action row at the bottom splits left (copy URL, delete) from right (cancel, save).

## Rebuild guide

Two patterns worth preserving:

- **Multipart upload pattern.** Raw `fetch` (or your host's `apiFetch` equivalent) + `FormData`. Don't try to shoehorn through the entity-save abstraction.
- **Per-item modal key.** Whenever a modal mutates one-of-many records, pass `key={item.id}` so per-item state resets between openings. Saves a class of bugs.

A non-WPDS rebuild needs: grid layout (CSS `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` works directly), modal with size variant, text + textarea inputs, select for filtering, file input + click-trigger pattern, native `<button>` tile semantics, and clipboard API access.

## Known limitations

- **No drag-and-drop upload.** Click-to-pick only.
- **No bulk select.** Each delete is one-by-one through the detail modal.
- **No edit-in-place image editing** (crop, rotate, scale). wp-admin has this; the shell doesn't.
- **Pagination not URL-driven.** Refreshing returns to page 1; deep-linking to a specific page isn't supported.
- **No search.** Filter is media-type-only. wp-admin's media library has a search box + date filter; the shell omits both.
- **Type counts on the filter.** The media-type `SelectControl` options now carry counts (`Images (12)`, `All (40)`) via the shared `useEntityElementCounts` hook — one `per_page=1&_fields=id` request per type plus an unfiltered total for `All`, read off the `X-WP-Total` header. Reuses the same `withElementCounts` label helper as the DataViews apps even though Media renders a plain `SelectControl`, not DataViews.
- **Source URL is single-line.** Long URLs overflow visually; no clamp or scroll.
- **Copy URL relies on `navigator.clipboard`.** Insecure-origin contexts (HTTP-only dev sites) deny clipboard access; the error notice is the fallback.
