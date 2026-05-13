# core:taxonomy

Prose accompanying `app.json#documentation` for the taxonomy term manager.

## Overview

TaxonomyApp manages categories, tags, and any custom taxonomy through a single DataViews table + modal pair. The default mount targets `category`; shells that want to surface multiple taxonomies mount the app once per taxonomy with different `config.taxonomy` values (and optionally a `config.title` override for the page heading). The default `DEFAULT_TAXONOMY_LABEL` map handles `category` / `post_tag` naming; custom taxonomies fall back to the raw slug unless `config.title` is provided.

## Architecture

Three state slots:

1. **`view`** — DataViews controlled state (same shape as PostsApp).
2. **`editTerm`** — the term currently being edited, or `null` when not editing. Set from the table by clicking a row name or the Edit action.
3. **`isCreating`** — boolean flag for the create variant of the same modal.

The modal (`TermEditModal`) is rendered conditionally when `editTerm || isCreating`. It uses a single component for both create + edit because the field set is identical — only the `id` payload field and the submit button label differ. Form state lives inside the modal via `useState`, which is the right call here: the parent doesn't need to observe in-progress edits, and the modal unmounts on close so state cleanup is free.

Notice routing: success messages go through `@wordpress/notices` as snackbars (auto-dismiss), failures as dismissible banners. The `notices-snackbar` + `notices-banner` apps render them in their respective regions.

## Rebuild guide

Reuses the same primitives as PostsApp (DataViews + destructive modal). The unique addition is the **form modal pattern**:

- Modal wraps a column of inputs (name, slug, description).
- Save button is `loading` while the request is in flight, `disabled` until name is non-empty.
- On success, parent invalidates the parent query *and* fires a snackbar notice via `@wordpress/notices`.
- On error, parent fires a dismissible banner notice — error message comes from `err.message` with a fallback.

A non-WPDS rebuild needs: a Modal/Dialog component (focus trap + Esc close + backdrop), text + textarea inputs, a save button with a loading state, and a notice bus equivalent.

## Known limitations

- Hierarchical taxonomies (categories) ignore `parent`. Term creation always lands at the root; editing surfaces no parent picker. A future iteration would add a tree-picker for hierarchical taxonomies.
- No bulk update — only bulk delete.
- The slug field is editable on edit but the REST endpoint may renormalize it server-side. We don't reflect the normalized value back into the form after save.
- Term content count (`count`) is read-only; clicking it does not filter posts by the term.
