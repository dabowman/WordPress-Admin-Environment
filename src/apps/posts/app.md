# core:posts

Substantive prose accompanying `app.json#documentation`. Structured facts (REST sources, states, interactions, DS imports) live in the manifest; this document captures the *why* — composition decisions, trade-offs, and rebuild guidance.

## Overview

PostsApp is the canonical DataViews host in the shell. Every bundled shell that surfaces a post-type list (`wp-admin-default`, `developer-admin`, `content-author`, `v2-demo`) mounts an instance of `core:posts` and either leaves the default `postType: "post"` or overrides it (`pages`, `wp_block`). The component itself is intentionally thin: it pulls rows through `useEntityRecords`, declares the DataViews `fields` / `actions` / `view` shape, and lets the DataViews package own everything else — layout switching, pagination, sort, selection, action modals, the empty state.

## Architecture

Three pieces of state drive the app:

1. **`view`** — a local `useState` mirroring the DataViews controlled shape. Holds search string, active filters, page, perPage, sort, fields, and layout. Owned by the app; DataViews calls `onChangeView(next)` whenever the user changes anything.
2. **`queryArgs`** — derived from `view + config.status` via `useMemo`. Maps DataViews concepts (filter operators, sort direction) to REST query arguments. The `_embed=author` arg lets one round trip cover the author column without a second request per row.
3. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('postType', config.postType, queryArgs)`. Reading `totalItems` + `totalPages` keeps DataViews' pagination footer accurate without a separate count call.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, title, status, date, author, link, rawRecord }`). The original record is kept on `rawRecord` so future row actions can read fields the projection doesn't surface.

The trash-confirm modal is implemented via DataViews' `RenderModal` action shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app uses WPDS `Stack` + `Text` for layout and copy, with the destructive primary button falling back to legacy `@wordpress/components` `Button as DestructiveButton` because WPDS 0.12 has no `tone="critical"`.

## Rebuild guide

A rebuild on a non-WPDS / non-DataViews stack needs to provide:

- A **list/grid view component** with built-in filtering, sorting, pagination, selection, and per-row + bulk actions. DataViews is the heavy lift — for Material, MUI's `DataGrid` is the closest equivalent; for Tailwind/Vue, TanStack Table + your own action menu.
- A **REST/core-data adapter** that returns `{ rows, total, isLoading }` for a query shape compatible with WordPress REST. The shell's `core-data` reads return `useEntityRecords`'s `{ records, isResolving, totalItems, totalPages }` shape — a Vue rebuild would expose the same triple from a Pinia store.
- A **destructive-action confirm modal**. Re-use whatever modal primitive the host DS provides; the contract is: open on action invocation, render confirmation copy, await async confirm, close, then let the list refresh.
- An **icon set** covering pencil/external/trash equivalents for row actions.

Two patterns to preserve:

- `context: 'edit'` is **required** on the read — without it `title.raw` is missing and the title cell renders decoded HTML. Any inline-edit feature added later would silently fail.
- `deleteEntityRecord` without `force` **trashes**, matching wp-admin behavior. Don't switch to a hard delete without surfacing a separate "Delete permanently" action.

## Known limitations

- No inline edit (DataViews supports it; not wired up here).
- Status filter is a single-select today. The `filterBy.operators: ['isAny']` declaration exists but the queryArgs mapper only handles the `isAny`/`is` operators against the `status` field.
- Site-editor post types (`wp_template`, `wp_block`, `wp_navigation`) navigate through `editHref()` but `editHref()` only special-cases `page`. Their URL-encoded slug-shaped IDs would need a new edit pattern + decode step; deferred until those screens land.
- The trash action is hard-coded. A future iteration may surface restore / delete-permanently as separate eligible actions once the post is in trash status.

Parity gaps versus `docs/screens/posts.md` not surfaced in the v2 app:

- No status-count tabs (`All (N) | Mine (N) | Published (N) | Drafts (N) | Pending (N) | Trash (N)`). DataViews `totalItems` covers the active filter only.
- No author / date / taxonomy column filters. wp-admin offers a separate dropdown per axis; the v2 app exposes only the status filter.
- No trash view + Restore + Delete Permanently actions. Trashed posts are filtered out by `status: any` and the app never surfaces them.
- No undo snackbar after trash. We emit a plain success notice; wp-admin offers "Move to trash · Undo".
- No keyboard shortcuts (J/K navigation, X to select, T to trash). DataViews has no built-in shortcut layer.
- No hierarchical pages tree. The Pages screen in wp-admin indents child pages under parents; DataViews renders a flat list ordered by `menu_order` and date.
- No grid-card layout polish (cover image, excerpt). DataViews ships a grid variant but the v2 fields config doesn't emit a thumbnail / excerpt-aware card template.
- No "Quick Edit" inline form. wp-admin's row toggle for status / author / sticky / template is not wired up.
- No bulk-edit row picker (status / author / sticky / category / tag).
- ARIA + screen-reader polish: DataViews ships its own announcements; the v2 app doesn't layer on the wp-admin-specific live-region copy.
