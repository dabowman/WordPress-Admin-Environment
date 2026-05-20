# core:posts

Substantive prose accompanying `app.json#documentation`. Structured facts (REST sources, states, interactions, DS imports) live in the manifest; this document captures the *why* — composition decisions, trade-offs, and rebuild guidance.

## Overview

PostsApp is the canonical DataViews host in the shell. Every bundled shell that surfaces a post-type list (`wp-admin-default`, `developer-admin`, `content-author`, `v2-demo`) mounts an instance of `core:posts` and either leaves the default `postType: "post"` or overrides it (`pages`, `wp_block`). The component itself is intentionally thin: it pulls rows through `useEntityRecords`, declares the DataViews `fields` / `actions` / `view` shape, and lets the DataViews package own everything else — layout switching, pagination, sort, selection, action modals, the empty state.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via admin.json `settings.dataViews.postType.post.<variant|_default>` or the `wp_admin_shell_data_view_config_postType_post[_<variant>]` filter. **Field renderers and action callbacks live in the React layer** — the spec only carries data; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `dataView.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. Owned by the app; DataViews calls `onChangeView(next)` whenever the user changes anything.
3. **`queryArgs`** — derived from `view + config.status` via `useMemo`. Maps DataViews concepts (filter operators, sort direction) to REST query arguments. The `_embed=author` arg lets one round trip cover the author column without a second request per row.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('postType', config.postType, queryArgs)`. Reading `totalItems` + `totalPages` keeps DataViews' pagination footer accurate without a separate count call.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, title, status, date, author, link, rawRecord }`). The original record is kept on `rawRecord` so future row actions can read fields the projection doesn't surface.

The trash-confirm modal is implemented via DataViews' `RenderModal` action shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app uses WPDS `Stack` + `Text` for layout and copy, with the destructive primary button falling back to legacy `@wordpress/components` `Button as DestructiveButton` because WPDS 0.12 has no `tone="critical"`. The action's `id` (`trash`) is what `buildActions()` keys off; plugins overriding the dataView can keep / rename / drop the action via their filter, and the React layer simply skips ids it has no callback for.

## DataView integration (C2 / v3 restored)

PostsApp is the canonical consumer of the dataView primitive (spec §13 #7). The cascade flow:

1. **Baseline** lives in `app.json#dataView` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple. The manifest baseline ships `_default` plus the `drafts` / `pending` / `trash` variant family; each variant gets injected as its own triple.
2. **Admin.json overrides** under `settings.dataViews.postType.post.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins swap columns, change default page size, hide the trash action, etc., without forking the app.
3. **Filter overrides** run last via `wp_admin_shell_data_view_config_postType_post` (always fires) plus `wp_admin_shell_data_view_config_postType_post_<variant>` (fires when `variant !== '_default'`). Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **PostsApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminShell.config` snapshot synchronously when present (per-screen `_resolved` stamp is the fast path); otherwise falls through to `/wp-admin-shell/v1/data-view?screen=<id>` REST. `_resolvedFieldsRef` is stamped on the doc when a `fieldsRef` resolved against a `settings.dataFields` entry so downstream debug can trace where columns came from.

The renderer tables (`buildFieldRenderers`, `buildActions`, `RENDERERS` keyed by field id, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. Any dataView override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping. Field collections referenced via `fieldsRef` resolve client-side too, sharing the same `mergeFields` ref-wins-inline-overrides logic as the PHP resolver.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#dataView` and admin.json `settings.dataViews` overrides reach DataViews with raw strings in whatever locale the spec was authored in. PostsApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    title:  __( 'Title',  'wp-admin-shell' ),
    status: __( 'Status', 'wp-admin-shell' ),
    author: __( 'Author', 'wp-admin-shell' ),
    date:   __( 'Date',   'wp-admin-shell' ),
};

const ACTION_LABELS = {
    edit:  __( 'Edit',          'wp-admin-shell' ),
    view:  __( 'View',          'wp-admin-shell' ),
    trash: __( 'Move to Trash', 'wp-admin-shell' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;   // fields
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;  // actions
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions (ids the app didn't author) keep whatever string the cascade supplied. That preserves the third-party authoring path: a plugin that adds a `meta:hero_color` column controls its own label via the spec; a plugin that swaps the bundled `title` column relabels it via either an `app.json` LABELS contribution (future) or a `wp_admin_shell_data_view_config_postType_post` filter that wraps the label in `__()` PHP-side.

This pattern is the documented recovery for the C2 i18n regression and is the gating contract for the entity-CRUD migration sweep — TaxonomyApp / UsersApp / CommentsApp / PluginsApp / ThemesApp ship the same shape.

Two adjacent paths remain available for richer cases:

1. **Server-side filter.** `wp_admin_shell_data_view_config_postType_post` PHP callback wraps labels in `__()`. Best for plugins shipping a localized override of the bundled spec without forking the React app.
2. **Render-time helper that owns both halves.** A future shared utility (`compileLabels(spec, LABELS)`) could deduplicate across entity-CRUD apps. Premature today; revisit after the migration sweep lands.

Action callback copy (modal text inside `RenderModal`, inline button labels) lives as JSX `__()` literals and translates normally — only the spec-supplied DataViews `label` field needed the recipe.

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
