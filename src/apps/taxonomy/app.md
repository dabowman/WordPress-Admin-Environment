# core:taxonomy

Prose accompanying `app.json#documentation` for the taxonomy term manager.

## Overview

TaxonomyApp manages categories, tags, and any custom taxonomy through a single DataViews table + modal pair. The default mount targets `category`; workspaces that want to surface multiple taxonomies mount the app once per taxonomy with different `config.taxonomy` values (and optionally a `config.title` override for the page heading). The `DEFAULT_TAXONOMY_LABEL` map handles `category` / `post_tag` naming; custom taxonomies fall back to the raw slug unless `config.title` is provided.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` bound to `(taxonomy, category)` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via workspace.json `settings.dataViews.taxonomy.<name>.<variant|_default>` or the `wp_admin_workspaces_data_view_config_taxonomy_<name>[_<variant>]` filter. For `post_tag` and custom taxonomies the manifest baseline does not apply — those triples consume cascade-only entries or filter overrides (bundled `developer-workspace.json` ships a baseline for `post_tag`). **Field renderers and action callbacks live in the React layer** — the spec carries data; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — owned by the shared `useEntityDataView()` hook (`src/apps/_shared/dataviews/`), seeded from `VIEW_DEFAULTS` + `dataView.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. DataViews calls `onChangeView(next)` whenever the user changes anything. The hook's resync `useEffect` (keyed `[screenId, taxonomy]`) reseeds the view when the triple flips on the same hook instance so a `category` → `post_tag` rebind doesn't inherit the previous triple's filters/sort. Field/action compilation also runs through the shared `buildFields` / `buildActions`; the delete confirm is built with `createBulkConfirmModal`.
3. **`editTerm` / `isCreating`** — modal toggles for the term editor. The same `TermEditModal` covers create and edit; only the payload `id` field and submit button label differ. The modal renders a `@wordpress/dataviews` `DataForm` (name / slug / description, plus a `parent` integer picker for hierarchical taxonomies) over one local `data` `useState`, so the parent doesn't observe in-progress edits and state cleans up on unmount.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('taxonomy', config.taxonomy, queryArgs)`. `context: 'edit'` keeps `description` populated.
5. **`hierarchical`** — read from `useEntityRecord('root', 'taxonomy', config.taxonomy).record.hierarchical` (`GET /wp/v2/taxonomies/{taxonomy}`). Drives the indented tree + the parent picker. Loading returns `record: null` → defaults to flat, so the table paints without blocking on this secondary fetch.
6. **`allTerms`** — a second `useEntityRecords('taxonomy', config.taxonomy, { per_page: 100, _fields: 'id,name,parent' }, { enabled: hierarchical })`, fetched only for hierarchical taxonomies. Independent of the paged/sorted/searched list so the depth tree + parent options reflect every term, not just the current page.
7. **`defaultCategoryId`** — `useEntityRecord('root', 'site').record.default_category`, read for the `category` taxonomy only. The matching row gets a `Default` badge and is removed from delete eligibility.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, name, slug, count, description, parent, rawRecord }`). Term `name` may contain HTML entities — `decodeEntities` mirrors wp-admin's `wp_specialchars_decode` display. The original record is kept on `rawRecord` so the row-name renderer and edit action can pass it to the modal without re-fetching. The edit modal seeds `name` / `description` from `rawRecord` through `decodeEntities` too, so an entity-bearing term (`Foo &amp; Bar`) shows decoded in the inputs and doesn't double-encode on re-save.

### Hierarchical display + parent picker (issue #115)

`src/apps/taxonomy/termTree.mjs` is a pure helper (`buildTermTree` + `flattenTreeOrder` + `indentLabel`, no imports → node-importable, unit-tested by `tests/runtime/taxonomy-term-tree.test.mjs`). `buildTermTree` flattens the `allTerms` flat list into depth-first order, annotating each node with its `depth`; orphan terms (parent off the 100-item page) fall back to roots, and a visited-set guard breaks self-/cyclic-parent loops so a corrupt tree can't drop terms or spin forever. `flattenTreeOrder` maps that tree to its depth-first id sequence. The tree is built **once** per `[hierarchical, allTerms]` change (single `termTree` memo); `depthById`, the indented `parentElements`, and the row reordering below all derive from it.

The name-column renderer indents each row by `depth` and emits a visually-hidden `Level N` (`screen-reader-text`, 1-based) for nested rows so assistive tech hears the nesting; flat / top-level rows render unindented with no extra announcement. It deliberately does **not** emit `role="treeitem"` / `aria-level`: the rows live inside a DataViews `<table>` with no ancestor `role="tree"`, so a lone `treeitem` would be an orphaned (invalid) ARIA containment that degrades screen-reader output.

**Default view renders true tree order when the tree fits on one page.** The REST list comes back flat-alphabetical (`orderby=name&order=asc`) — the WP terms endpoint has no hierarchical orderby. So in the default view (`showDepth`: hierarchical taxonomy, name-ascending sort, page 1, no active search, **and the whole tree on one page** — `totalItems <= perPage`) the page's rows are reordered client-side into the `termTree` depth-first sequence (via `flattenTreeOrder`) before they reach DataViews, so a parent renders immediately above its indented children — matching wp-admin's `WP_Terms_List_Table` recursion. Rows whose id falls outside the tree window (e.g. beyond the 100-term cap) sort last, stably. The `totalItems <= perPage` gate matters because REST pages alphabetically, not by tree: on a multi-page tree, page 1 holds only the alphabetically-first `perPage` terms, and reordering just those could float an indented child whose parent sorts onto page 2. Under any **other** sort, a later page, an active search, **or a tree that spans more than one page**, the list falls back to the flat REST order with **no indentation** (`showDepth` is false), mirroring wp-admin collapsing the tree on non-default views — so an indented child never appears without its parent visible above it. Larger trees that exceed `perPage` paginate alphabetically (flat); true client-side tree pagination is future work.

`indentLabel` prefixes the parent-picker option labels with one em-dash per level, mirroring `wp_dropdown_categories`. The `parent` DataForm field is `type: 'integer'` with the indented `elements` (a `None` (0) option first); on edit, the term excludes itself from the options to prevent a trivial self-parent cycle. `handleSave` only sends `parent` for hierarchical taxonomies. DataViews' table layout has no native nesting, so this is a depth-prefix render, not true row nesting — the documented component constraint.

### Default-category protection (issue #116)

Categories only. `default_category` is the single default-term option exposed at `GET /wp/v2/settings` (custom taxonomies' `default_term_{taxonomy}` is not REST-readable — see app.json constraint `default-category-rest-only`). The name renderer paints a neutral `Default` Badge on that row, and the `delete` action carries an `eligibilityOverrides[ 'delete' ]` (via the shared `buildActions` path) of `( item ) => item.id !== defaultCategoryId`, so Delete is hidden on the default row and it can never enter a bulk-delete batch. This pre-empts the opaque REST 500 WordPress returns when something tries to delete the default category.

The delete-confirm modal is implemented via DataViews' `RenderModal` action shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app uses WPDS `Stack` + `Text` for layout and copy, with the destructive primary button falling back to legacy `@wordpress/components` `Button as DestructiveButton` because WPDS 0.12 has no `tone="critical"`. The action's `id` (`delete`) is what `buildActions()` keys off; plugins overriding the dataView can keep / rename / drop the action via their filter, and the React layer simply skips ids it has no callback for.

Notice routing: success messages go through `@wordpress/notices` as snackbars (auto-dismiss), failures as dismissible banners. The `notices-snackbar` + `notices-banner` apps render them in their respective regions.

## DataView integration (C2 / v3 restored)

TaxonomyApp consumes the dataView primitive (spec §13 #7). The cascade flow mirrors PostsApp:

1. **Baseline** lives in `app.json#dataView` bound to `(taxonomy, category)` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **Admin.json overrides** under `settings.dataViews.taxonomy.<name>.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins swap columns, change default page size, hide the delete action, etc., without forking the app. The bundled `developer-workspace.json` ships a baseline for `(taxonomy, post_tag)` so the Tags mount renders parity columns; sites that surface other taxonomies (custom taxonomies, `nav_menu`) add their own entries the same way.
3. **Filter overrides** run last via `wp_admin_workspaces_data_view_config_taxonomy_<name>[_<variant>]`. Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **TaxonomyApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminWorkspaces.config` snapshot synchronously when present; otherwise falls through to `/wp-admin-workspaces/v1/data-view?screen=<id>` REST.

The renderer tables (`buildFieldRenderers`, `buildActions`, action callbacks keyed by `spec.id`) stay app-side. Any dataView override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives — `app.json#dataView` and workspace.json `settings.dataViews` overrides reach DataViews with raw strings in whatever locale the spec was authored in. TaxonomyApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    name:        __( 'Name',        'wp-admin-workspaces' ),
    slug:        __( 'Slug',        'wp-admin-workspaces' ),
    count:       __( 'Count',       'wp-admin-workspaces' ),
    description: __( 'Description', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
    edit:   __( 'Edit',   'wp-admin-workspaces' ),
    delete: __( 'Delete', 'wp-admin-workspaces' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;   // fields
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;  // actions
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions (ids the app didn't author) keep whatever string the cascade supplied. Modal copy, the Add-new button label, and the destructive-confirm copy are plain JSX `__()` literals and translate normally — only the spec-supplied DataViews `label` field needs the recipe.

## Rebuild guide

Reuses the same primitives as PostsApp (DataViews + destructive modal). The unique addition is the **form modal pattern**:

- Modal wraps a column of inputs (name, slug, description).
- Save button is `loading` while the request is in flight, `disabled` until name is non-empty.
- On success, parent invalidates the parent query *and* fires a snackbar notice via `@wordpress/notices`.
- On error, parent fires a dismissible banner notice — error message comes from `err.message` with a fallback.

A non-WPDS rebuild needs:

- A **list/grid view component** with built-in filtering, sorting, pagination, selection, and per-row + bulk actions (DataViews equivalent).
- A **REST/core-data adapter** that returns `{ rows, total, isLoading }` for the `taxonomy/<name>` entity at `context: 'edit'`.
- A **Modal/Dialog component** with focus trap + Esc close + backdrop.
- Text + textarea inputs, a save button with a loading state, and a notice bus equivalent.
- A **destructive-action confirm modal** keyed on the `delete` action id.

Two patterns to preserve:

- `context: 'edit'` is required so `description` is populated for the column renderer.
- `deleteEntityRecord` must pass `{ force: true }` — taxonomies have no trash. Without `force` the REST endpoint 400s.

## Known limitations

- The hierarchy tree + parent picker are capped at the 100-term REST `per_page`. Taxonomies with more than 100 terms paginate the main list normally, but terms beyond the first 100 fall outside the indented tree / parent options. Tree-fetch pagination is a future enhancement (issue #115).
- Cycle prevention on edit only excludes the edited term itself, not its whole subtree (`exclude_tree`). Reparenting a term under one of its own descendants is not blocked client-side; the REST endpoint accepts it (WordPress does not reject the loop on the terms controller), so a deep cycle is possible until upstream `exclude_tree` parity is added.
- No bulk update — only bulk delete.
- The slug field is editable on edit but the REST endpoint may renormalize it server-side. We don't reflect the normalized value back into the form after save.
- Term content count (`count`) is read-only; clicking it does not filter posts by the term.
- Default-category protection covers `category` only. Custom hierarchical taxonomies' `default_term_{taxonomy}` is not REST-exposed, so their default term can't be pre-protected — the opaque REST 500 still surfaces on delete (upstream gap).
- No term-reassignment on delete. wp-admin's term delete offers "Reassign to another term" before deleting; the v2 app deletes outright and posts get reparented to the default term by core's fallback.

Parity gaps versus `docs/screens/taxonomy.md` not surfaced in the v2 app:

- No split-pane Add form. wp-admin renders Add new in a left pane next to the list; the v2 app uses a modal toggled by an Add-new button in the toolbar.
- No Quick Edit (inline name + slug edit on row toggle).
- Tree display is a depth-prefix render (indentation + em-dash + visually-hidden `Level N`), not true row nesting — DataViews' table layout has no native hierarchy, and no ancestor `role="tree"` exists to hold a real `treeitem`. The default view (name-ascending, page 1, no search, whole tree on one page) reorders the page's rows into depth-first tree order so a parent renders immediately above its indented children (mirroring wp-admin); switching sort, paging, searching, or exceeding one page (`totalItems > perPage`) collapses the rows back to flat REST order with no indentation, so an indented child never floats without its parent. Larger trees paginate alphabetically (flat). Subtree cycle-prevention (`exclude_tree`) is not surfaced — only the edited term excludes itself.
- No "View" archive link per row for public taxonomies.
- No term-archive count link that drills into the `posts` app filtered by term.
- No `meta` field rendering from `register_term_meta`.
- No hide-empty toggle.
- No Categories-only below-list hint area ("Deleting a category does not delete posts…").
- No slug-collision feedback after save (when server appends `-2` etc.).
- No keyboard shortcuts (`/` to focus search, `n` to focus Add form).
- ARIA polish: nested rows announce a visually-hidden `Level N` (no `role="treeitem"` / `aria-level` — invalid inside the DataViews table with no `role="tree"` ancestor), and not `aria-setsize` / `aria-posinset`; the Default badge is visible-only with no dedicated per-row screen-reader announcement.
