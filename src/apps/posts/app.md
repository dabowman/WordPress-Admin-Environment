# core:posts

Substantive prose accompanying `app.json#documentation`. Structured facts (REST sources, states, interactions, DS imports) live in the manifest; this document captures the *why* — composition decisions, trade-offs, and rebuild guidance.

## Overview

PostsApp is the canonical DataViews host in the workspace. Every bundled workspace that surfaces a post-type list (`wp-admin-default`, `developer-admin`, `content-author`, `canonical-demo`) mounts an instance of `core:posts` and either leaves the default `postType: "post"` or overrides it (`pages`, `wp_block`). The component itself is intentionally thin: it pulls rows through `useEntityRecords`, declares the DataViews `fields` / `actions` / `view` shape, and lets the DataViews package own everything else — layout switching, pagination, sort, selection, action modals, the empty state.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via workspace.json `settings.dataViews.postType.post.<variant|_default>` or the `wp_admin_workspaces_data_view_config_postType_post[_<variant>]` filter. **Field renderers and action callbacks live in the React layer** — the spec only carries data; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `dataView.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. Owned by the app; DataViews calls `onChangeView(next)` whenever the user changes anything.
3. **`queryArgs`** — derived from `view + config.status` via `useMemo`. The shared `buildQueryArgs(view, QUERY_MAPPING, staticArgs)` ([`_shared/dataviews/buildQueryArgs.mjs`](../_shared/dataviews/buildQueryArgs.mjs)) translates the declarative `status` / `author` / `categories` / `format` filter mapping into REST params; a small supplemental pass (`applyDateFilters`) wires the date `before` / `after` operators that `buildQueryArgs` doesn't speak, and the Sticky tab's boolean `sticky` param is applied off the raw filters. The `_embed=author` arg lets one round trip cover the author column without a second request per row.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('postType', config.postType, queryArgs)`. Reading `totalItems` + `totalPages` keeps DataViews' pagination footer accurate without a separate count call.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, title, status, date, author, link, rawRecord }`). The original record is kept on `rawRecord` so future row actions can read fields the projection doesn't surface.

**Author scope (`?author=` → `config.author` → seeded author filter).** The Users screen's "View posts" row action navigates to `#/posts?author=N`. PostsApp resolves the author id from `useRoute().params.author` (the URL query slot), falling back to `config.author` — declared on the `posts` screen as `"{author}"`. (The primary content region resolves on `_self` = the URL primary path, and `_self` interpolation only carries *path* params, so the `?author=` query value reaches the app via `useRoute()`, not via config interpolation; `config.author` is honored for any future region wired with a `query`-mode slot route that *does* interpolate it.) A valid positive id is seeded **once** as an initial `author` view-filter (`{ field: 'author', operator: 'is', value: N }`) — the exact filter shape the "Mine" tab toggles — folded into `viewDefaults.filters`, a transient axis. `buildQueryArgs` (via `QUERY_MAPPING.filters.author`) then emits `?author=N` to REST, scoping the list. Because it's transient (not durable), saved view-prefs never overwrite it; clearing it in the filter UI is respected until a screen flip re-seeds. The literal `"{author}"` placeholder (interpolation miss) coerces to no filter via the positive-int guard.

Status-filter **counts** ride a separate, shared hook: `useEntityElementCounts('postType', postType, 'status', STATUS_VALUES)` fires one `per_page=1&_fields=id` request per status and returns `{ value: count }`. `buildFields` folds that map into the status field's `elements` (`elementCounts` option → the pure `withElementCounts` helper), so the count shows in the filter label without a DataViews-native count slot. Counts are global by design — they ignore the active search/page so they read like wp-admin's status links rather than re-fetching on every keystroke.

The trash-confirm modal is implemented via DataViews' `RenderModal` action shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app uses WPDS `Stack` + `Text` for layout and copy, with the destructive primary button falling back to legacy `@wordpress/components` `Button as DestructiveButton` because WPDS 0.12 has no `tone="critical"`. The action's `id` (`trash`) is what `buildActions()` keys off; plugins overriding the dataView can keep / rename / drop the action via their filter, and the React layer simply skips ids it has no callback for.

## DataView integration (C2 / v3 restored)

PostsApp is the canonical consumer of the dataView primitive (spec §13 #7). The cascade flow:

1. **Baseline** lives in `app.json#dataView` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple. The manifest baseline ships `_default` plus the `drafts` / `pending` / `trash` variant family; each variant gets injected as its own triple.
2. **Admin.json overrides** under `settings.dataViews.postType.post.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins swap columns, change default page size, hide the trash action, etc., without forking the app.
3. **Filter overrides** run last via `wp_admin_workspaces_data_view_config_postType_post` (always fires) plus `wp_admin_workspaces_data_view_config_postType_post_<variant>` (fires when `variant !== '_default'`). Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **PostsApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminWorkspaces.config` snapshot synchronously when present (per-screen `_resolved` stamp is the fast path); otherwise falls through to `/wp-admin-workspaces/v1/data-view?screen=<id>` REST. `_resolvedFieldsRef` is stamped on the doc when a `fieldsRef` resolved against a `settings.dataFields` entry so downstream debug can trace where columns came from.

The renderer tables (`buildFieldRenderers`, `buildActions`, `RENDERERS` keyed by field id, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. Any dataView override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping. Field collections referenced via `fieldsRef` resolve client-side too, sharing the same `mergeFields` ref-wins-inline-overrides logic as the PHP resolver.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#dataView` and workspace.json `settings.dataViews` overrides reach DataViews with raw strings in whatever locale the spec was authored in. PostsApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    title:  __( 'Title',  'wp-admin-workspaces' ),
    status: __( 'Status', 'wp-admin-workspaces' ),
    author: __( 'Author', 'wp-admin-workspaces' ),
    date:   __( 'Date',   'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
    edit:  __( 'Edit',          'wp-admin-workspaces' ),
    view:  __( 'View',          'wp-admin-workspaces' ),
    trash: __( 'Move to Trash', 'wp-admin-workspaces' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;   // fields
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;  // actions
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions (ids the app didn't author) keep whatever string the cascade supplied. That preserves the third-party authoring path: a plugin that adds a `meta:hero_color` column controls its own label via the spec; a plugin that swaps the bundled `title` column relabels it via either an `app.json` LABELS contribution (future) or a `wp_admin_workspaces_data_view_config_postType_post` filter that wraps the label in `__()` PHP-side.

This pattern is the documented recovery for the C2 i18n regression and is the gating contract for the entity-CRUD migration sweep — TaxonomyApp / UsersApp / CommentsApp / PluginsApp / ThemesApp ship the same shape.

Two adjacent paths remain available for richer cases:

1. **Server-side filter.** `wp_admin_workspaces_data_view_config_postType_post` PHP callback wraps labels in `__()`. Best for plugins shipping a localized override of the bundled spec without forking the React app.
2. **Render-time helper that owns both halves.** A future shared utility (`compileLabels(spec, LABELS)`) could deduplicate across entity-CRUD apps. Premature today; revisit after the migration sweep lands.

Action callback copy (modal text inside `RenderModal`, inline button labels) lives as JSX `__()` literals and translates normally — only the spec-supplied DataViews `label` field needed the recipe.

## View tabs, Bulk Edit, and column filters (wave 2)

Three parity affordances landed together, all driven by the shared `_shared/dataviews/*` scaffolding (no per-app re-copy):

### View-tab strip (#111)

A `ViewTabs` strip ([`_shared/dataviews/ViewTabs.js`](../_shared/dataviews/ViewTabs.js)) renders above the list with **All / Mine / Published / Draft / Pending / Sticky** segments. Each segment carries a `filter` (`{ field, operator, value }`) — the `view.filters` entry the tab applies — and a live count.

- **Counts** come from `useEntityElementCounts`, fanned across the REST fields the tabs span: one call for the status values, one keyed `status=any` (the All total), one `author={currentUserId}` (Mine), one `sticky=true` (Sticky). They are merged into a single `{ filterValue: count }` map keyed exactly the way `mergeSegmentCounts` looks them up (the segment's `filter.value`). Counts resolve asynchronously — a segment shows its plain label until its total lands (no "0" flash).
- **Active segment** is *derived from the live `view.filters`*, not a separate `useState` — author/sticky filters take precedence over a status filter so Mine/Sticky stay highlighted, falling back to the matching status segment, else `all`. This keeps the strip in sync with deep-linked or default filters.
- **Clicking** a tab rewrites `view.filters`: it drops any existing status/author/sticky filter, applies the segment's filter (All clears the status scope entirely rather than pinning a `status=any` chip), and resets to page 1. Date / categories / format filters are preserved.
- **"Mine" is gated on `window.wpAdminWorkspaces?.userId`** — absent (e.g. an unexpected anon context) and the segment is omitted. The classic "auto-scope Mine for users without `edit_others_posts`" behavior is still not replicated (a separate parity gap).

### Bulk Edit (#107)

The `bulk-edit` action (`supportsBulk: true`, declared in `app.json`) attaches the shared `createBulkEditModal` ([`_shared/dataviews/BulkEditModal.js`](../_shared/dataviews/BulkEditModal.js)) via `buildActions(..., { modals: { 'bulk-edit': … } })`. The modal renders a DataForm over **status / author / sticky / parent / format / comment_status / categories / tags**.

- Every field is seeded to the `NO_CHANGE` sentinel; `fieldsWithNoChange` injects the `— No change —` option for the four `elements`-backed selects (status / sticky / format / comment_status). The non-elements fields (author / parent integers, categories / tags CSV-of-ids text) supply a `getValue` that maps the sentinel to an empty input so the literal sentinel never renders.
- **Touch-then-clear is no-change.** Because the sentinel maps to `''` for display, focusing and then blanking a free-text field stores `''` (not the sentinel) — which `computeBulkPayload` would treat as a real edit, writing `author=undefined` or, worse, `parent=0` (removing a post's parent). `bulkToRecord` defends against this: it drops empty-string `author` / `parent` / `categories` / `tags` keys *before* coercion, so only a non-empty value counts as a change.
- On Apply, the modal's `computeBulkPayload` reduces the form to only the changed fields, and a `Promise.allSettled` fans `saveEntityRecord` over the selection with `{ id, ...toRecord(payload) }`. `bulkToRecord` coerces the form values to REST shapes — sticky `'true'`/`'false'` → boolean, author/parent → int, categories/tags CSV → positive-int array. Partial failures keep the failed rows selected and the staged values intact for a retry.
- `onApplied` invalidates the list + status-count resolutions so the table and the tab/filter counts refresh.

Quick Edit (single-row inline) is still not wired — Bulk Edit is the first inline-editing affordance.

### Column filters (#132)

`categories` and `format` are declared as filterable text fields (`filterBy.operators: ['is']`) and wired through the `QUERY_MAPPING` to the REST `categories` / `format` params; `date` declares `before` / `after` operators wired through `applyDateFilters` to REST's `before` / `after` ISO params. These columns are filter-only — they carry `enableHiding: false` so a user can't toggle them on as (blank) columns — mirroring wp-admin's filter dropdowns rather than always-on columns. Author filtering rides the existing `author` mapping (also used by the Mine tab).

A categorical (`is`) filter renders its dropdown from the field's `elements` (static) or `getElements` (async). Those two fields ship neither in `app.json`, so `index.js` supplies them at compile time via the shared `buildFields` harness:

- **`format`** — a finite known set. `elementFallbacks: { format: elementsFromLabels( FORMAT_LABELS ) }` feeds the dropdown a static option list.
- **`categories`** — dynamic. `getElements: { categories: makeTaxonomyElements( 'category' ) }` hands DataViews an async provider that resolves the `category` taxonomy through core-data (`resolveSelect(coreStore).getEntityRecords('taxonomy', 'category', …)`, never a raw `fetch`) and maps the terms to `{ value: id, label: name }`, cached per taxonomy so re-opening the filter doesn't re-resolve. `buildFields` grew a `getElements` passthrough (id → async provider) for this — shared, pinned by `tests/runtime/dataviews-shared.test.mjs`.

Both option sets are wired **only when `config.postType === 'post'`** — `format` / `categories` are `post`-only REST params, so on the Pages screen the dropdowns would have nothing to resolve. (See "Post-type gating" below.)

The `date` filter is a **one-sided date bound**, not a two-ended range: DataViews holds one filter per field, so a user applies `before X` *or* `after Y`, not both simultaneously. `applyDateFilters` maps whichever operator is active to the matching REST param.

### Post-type gating (Pages / CPTs)

PostsApp is rebindable to any post type via `config.postType`, but `sticky` / `format` / `categories` / `tags` are only registered REST params for post types that support those features (the default `post`, not `page`). WP REST silently *ignores* unregistered query params rather than erroring, which would make those affordances misleading no-ops on the Pages list:

- The **Sticky view-tab** segment is only pushed when `postType === 'post'`, and its count query passes an empty value set (so no `?sticky=true` request that would otherwise count *all* pages).
- The post-only **bulk-edit fields** (`sticky` / `format` / `categories` / `tags`) are filtered out of both `buildBulkEditFields( postType )` and `buildBulkEditForm( postType )` for non-`post` post types.
- The **`format` static / `categories` dynamic filter options** are only wired for `postType === 'post'`.

This mirrors how classic wp-admin hides Sticky / Format on the Pages list. The gate is `postType === 'post'` rather than a live post-type-supports lookup because `window.wpAdminWorkspaces` doesn't expose per-post-type supports today; a richer capability check can swap in here later without touching the call sites.

## Rebuild guide

A rebuild on a non-WPDS / non-DataViews stack needs to provide:

- A **list/grid view component** with built-in filtering, sorting, pagination, selection, and per-row + bulk actions. DataViews is the heavy lift — for Material, MUI's `DataGrid` is the closest equivalent; for Tailwind/Vue, TanStack Table + your own action menu.
- A **REST/core-data adapter** that returns `{ rows, total, isLoading }` for a query shape compatible with WordPress REST. The workspace's `core-data` reads return `useEntityRecords`'s `{ records, isResolving, totalItems, totalPages }` shape — a Vue rebuild would expose the same triple from a Pinia store.
- A **destructive-action confirm modal**. Re-use whatever modal primitive the host DS provides; the contract is: open on action invocation, render confirmation copy, await async confirm, close, then let the list refresh.
- An **icon set** covering pencil/external/trash equivalents for row actions.

Two patterns to preserve:

- `context: 'edit'` is **required** on the read — without it `title.raw` is missing and the title cell renders decoded HTML. Any inline-edit feature added later would silently fail.
- `deleteEntityRecord` without `force` **trashes**, matching wp-admin behavior. Don't switch to a hard delete without surfacing a separate "Delete permanently" action.

## Known limitations

- No inline (per-row) Quick Edit — DataViews supports it but only **Bulk Edit** (multi-row, modal) is wired today.
- Status filter is a single-select today. The `filterBy.operators: ['isAny']` declaration exists but the queryArgs mapper only handles the `isAny`/`is` operators against the `status` field.
- Site-editor post types (`wp_template`, `wp_block`, `wp_navigation`) navigate through `editHref()` but `editHref()` only special-cases `page`. Their URL-encoded slug-shaped IDs would need a new edit pattern + decode step; deferred until those screens land.
- The `trash` variant adds `restore` and `delete-permanent` actions (status-gated to trashed rows). `restore` calls `saveEntityRecord(..., { status: 'draft' })` — REST exposes no pre-trash status meta, so a restored post lands on draft rather than its previous status (accepted divergence; see `docs/parity/posts.md` blocker #4). `delete-permanent` confirms, then calls `deleteEntityRecord(..., { force: true })`. Surface the variant via a screen with `dataViewRef: "postType/post/trash"` (the `wp-admin-default` workspace ships a Posts → Trash screen for this).

Parity gaps versus `docs/screens/posts.md` not surfaced in the v2 app:

- Status **counts** surface both on the status filter elements (`Published (12)`, `Draft (3)`) AND on the **view-tab strip** (`All | Mine | Published | Draft | Pending | Sticky`) added in wave 2 (#111) — one lightweight `per_page=1&_fields=id` request per value, read off the `X-WP-Total` header, global (search/page-independent) to mirror wp-admin's status links. Remaining gap: no Scheduled / Trash tabs in the strip (Trash has its own variant + screen), and "Mine" is not auto-scoped for low-privilege users.
- Author / date / category / format **filters are now wired** (#132) — `categories` (dynamic taxonomy options via `getElements`) / `format` (static option list) as `is`-filter columns, `date` as a one-sided `before`/`after` bound (one filter per field — not a two-ended range), `author` via the Mine tab + mapping. `categories` / `format` options are only wired for `postType === 'post'`. wp-admin's per-axis *dropdown* chrome (month picker, category select) is approximated through DataViews' generic filter UI rather than the classic bespoke dropdowns; tag filtering and the months-list affordance are not yet surfaced.
- Trash view + Restore + Delete Permanently are now wired (trash variant + the `wp-admin-default` Posts → Trash screen). Remaining gap: no **Empty Trash** bulk button, and restore lands on draft rather than the pre-trash status (REST limitation).
- No undo snackbar after trash. We emit a plain success notice; wp-admin offers "Move to trash · Undo".
- No keyboard shortcuts (J/K navigation, X to select, T to trash). DataViews has no built-in shortcut layer.
- No hierarchical pages tree. The Pages screen in wp-admin indents child pages under parents; DataViews renders a flat list ordered by `menu_order` and date.
- No grid-card layout polish (cover image, excerpt). DataViews ships a grid variant but the v2 fields config doesn't emit a thumbnail / excerpt-aware card template.
- No "Quick Edit" inline form. wp-admin's per-row toggle for status / author / sticky / template is not wired up (Bulk Edit covers the multi-row case).
- **Bulk Edit is now wired** (#107) — a DataForm panel over status / author / sticky / parent / format / comment_status / categories / tags, writing only the changed fields (post-only fields are dropped for non-`post` post types). Gaps versus classic Bulk Edit: no title/slug/date/password fields, and the author/parent/categories/tags inputs take raw IDs rather than autocomplete pickers.
- ARIA + screen-reader polish: DataViews ships its own announcements; the v2 app doesn't layer on the wp-admin-specific live-region copy.
