# core:taxonomy

Prose accompanying `app.json#documentation` for the taxonomy term manager.

## Overview

TaxonomyApp manages categories, tags, and any custom taxonomy through a single DataViews table + modal pair. The default mount targets `category`; shells that want to surface multiple taxonomies mount the app once per taxonomy with different `config.taxonomy` values (and optionally a `config.title` override for the page heading). The `DEFAULT_TAXONOMY_LABEL` map handles `category` / `post_tag` naming; custom taxonomies fall back to the raw slug unless `config.title` is provided.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` bound to `(taxonomy, category)` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via admin.json `settings.dataViews.taxonomy.<name>.<variant|_default>` or the `wp_admin_shell_data_view_config_taxonomy_<name>[_<variant>]` filter. For `post_tag` and custom taxonomies the manifest baseline does not apply — those triples consume cascade-only entries or filter overrides (bundled `developer-admin.json` ships a baseline for `post_tag`). **Field renderers and action callbacks live in the React layer** — the spec carries data; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `dataView.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. Owned by the app; DataViews calls `onChangeView(next)` whenever the user changes anything. A `useEffect` keyed on `[taxonomy, variant]` resyncs the view when the triple flips on the same hook instance so a `category` → `post_tag` rebind doesn't inherit the previous triple's filters/sort.
3. **`editTerm` / `isCreating`** — modal toggles for the term editor. The same `TermEditModal` covers create and edit; only the payload `id` field and submit button label differ. Form state lives inside the modal via `useState` so the parent doesn't observe in-progress edits and state cleans up on unmount.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('taxonomy', config.taxonomy, queryArgs)`. `context: 'edit'` keeps `description` populated.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, name, slug, count, description, parent, rawRecord }`). Term `name` may contain HTML entities — `decodeEntities` mirrors wp-admin's `wp_specialchars_decode` display. The original record is kept on `rawRecord` so the row-name renderer and edit action can pass it to the modal without re-fetching.

The delete-confirm modal is implemented via DataViews' `RenderModal` action shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app uses WPDS `Stack` + `Text` for layout and copy, with the destructive primary button falling back to legacy `@wordpress/components` `Button as DestructiveButton` because WPDS 0.12 has no `tone="critical"`. The action's `id` (`delete`) is what `buildActions()` keys off; plugins overriding the dataView can keep / rename / drop the action via their filter, and the React layer simply skips ids it has no callback for.

Notice routing: success messages go through `@wordpress/notices` as snackbars (auto-dismiss), failures as dismissible banners. The `notices-snackbar` + `notices-banner` apps render them in their respective regions.

## DataView integration (C2 / v3 restored)

TaxonomyApp consumes the dataView primitive (spec §13 #7). The cascade flow mirrors PostsApp:

1. **Baseline** lives in `app.json#dataView` bound to `(taxonomy, category)` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **Admin.json overrides** under `settings.dataViews.taxonomy.<name>.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins swap columns, change default page size, hide the delete action, etc., without forking the app. The bundled `developer-admin.json` ships a baseline for `(taxonomy, post_tag)` so the Tags mount renders parity columns; sites that surface other taxonomies (custom taxonomies, `nav_menu`) add their own entries the same way.
3. **Filter overrides** run last via `wp_admin_shell_data_view_config_taxonomy_<name>[_<variant>]`. Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **TaxonomyApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminShell.config` snapshot synchronously when present; otherwise falls through to `/wp-admin-shell/v1/data-view?screen=<id>` REST.

The renderer tables (`buildFieldRenderers`, `buildActions`, action callbacks keyed by `spec.id`) stay app-side. Any dataView override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives — `app.json#dataView` and admin.json `settings.dataViews` overrides reach DataViews with raw strings in whatever locale the spec was authored in. TaxonomyApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    name:        __( 'Name',        'wp-admin-shell' ),
    slug:        __( 'Slug',        'wp-admin-shell' ),
    count:       __( 'Count',       'wp-admin-shell' ),
    description: __( 'Description', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
    edit:   __( 'Edit',   'wp-admin-shell' ),
    delete: __( 'Delete', 'wp-admin-shell' ),
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

- Hierarchical taxonomies (categories) ignore `parent`. Term creation always lands at the root; editing surfaces no parent picker. A future iteration would add a tree-picker for hierarchical taxonomies.
- No bulk update — only bulk delete.
- The slug field is editable on edit but the REST endpoint may renormalize it server-side. We don't reflect the normalized value back into the form after save.
- Term content count (`count`) is read-only; clicking it does not filter posts by the term.
- No default-category protection. wp-admin disables Delete on the site's default category (option `default_category`); the v2 app surfaces a Delete action that the REST endpoint will reject server-side without a clear UX cue.
- No term-reassignment on delete. wp-admin's term delete offers "Reassign to another term" before deleting; the v2 app deletes outright and posts get reparented to the default term by core's fallback.

Parity gaps versus `docs/screens/taxonomy.md` not surfaced in the v2 app:

- No split-pane Add form. wp-admin renders Add new in a left pane next to the list; the v2 app uses a modal toggled by an Add-new button in the toolbar.
- No Quick Edit (inline name + slug edit on row toggle).
- No hierarchical tree display for categories. wp-admin recurses into a parent-indented tree; the v2 app renders flat sorted rows. Switching sort on a hierarchical taxonomy already collapses the wp-admin tree, so the flat view matches the sorted state but loses the default tree view.
- No parent picker on Add / Edit (cycle-prevention `exclude_tree` not surfaced).
- No `wp_dropdown_categories`-style indented option labels.
- No default-category badge / delete protection.
- No "View" archive link per row for public taxonomies.
- No term-archive count link that drills into the `posts` app filtered by term.
- No `meta` field rendering from `register_term_meta`.
- No hide-empty toggle.
- No Categories-only below-list hint area ("Deleting a category does not delete posts…").
- No slug-collision feedback after save (when server appends `-2` etc.).
- No keyboard shortcuts (`/` to focus search, `n` to focus Add form).
- ARIA polish: no `aria-level` / `aria-setsize` for hierarchical rows, no per-row Default-category announcement.
