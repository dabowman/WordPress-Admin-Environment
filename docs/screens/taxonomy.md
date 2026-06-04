# Screen Spec: Taxonomy (Categories, Tags, custom taxonomies)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/edit-tags.php` (list + add) + `wp-admin/term.php` (edit single) + `wp-admin/edit-tag-form.php` (form partial) + `WP_Terms_List_Table` (`wp-admin/includes/class-wp-terms-list-table.php`)
**Current workspace coverage:** `core:taxonomy` → `src/apps/taxonomy/index.js` (native; DataViews table + `@wordpress/dataviews` `DataForm` modal over the `taxonomy` entity, parameterized by `config.taxonomy` — defaults to `category`; registered in `src/runtime/registry/builtins.js`). See `src/apps/taxonomy/app.md`.

This spec describes the **semantic surface** of the Taxonomy management screen — list, add, edit, and delete terms — for any taxonomy registered with `show_in_rest: true` (Categories, Tags, custom taxonomies). It does not prescribe component names, CSS, or specific React APIs.

The screen is one app with two modes: split-pane list+add (default) and edit-single (reached via row Edit). The same component serves Categories (hierarchical), Tags (non-hierarchical), and any custom taxonomy. Differences are entirely data-driven from `WP_Taxonomy` — the `hierarchical` flag toggles parent select and indented tree display; `labels` provide every visible string.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `taxonomy` (parameterized; e.g. `taxonomy-category`, `taxonomy-post_tag`, `taxonomy-{tax}`) |
| Display name | `{taxonomy.labels.menu_name}` (e.g. "Categories", "Tags") |
| Original URLs | `/wp-admin/edit-tags.php?taxonomy={tax}` (list+add), `/wp-admin/term.php?taxonomy={tax}&tag_ID={id}` (edit) |
| Menu location | Submenu under the post type whose `register_post_type` includes the taxonomy (e.g. Posts → Categories, Posts → Tags); custom taxonomies follow their `register_taxonomy` setting |
| Submenu items | None — single screen per taxonomy |
| Parent app | None — top-level app instance per taxonomy |
| Sub-screens | Edit Term (single); inline Quick Edit on list rows |

The same screen serves any taxonomy with `show_ui: true` (admin visible) and `show_in_rest: true` (REST exposed). Both flags are required for workspace coverage. The `link_category` taxonomy (admin-only legacy from Links Manager) is excluded.

For taxonomies attached to multiple post types, the URL carries `?post_type={pt}` to scope the breadcrumb; the term list itself is unscoped (terms are global per taxonomy, not per post type).

---

## 2. Purpose

Browse, search, create, edit, and delete terms in a taxonomy. Primary entry point for content authors organizing content; secondary use by editorial managers cleaning up tag sprawl.

Jobs to be done:
- **See all terms** — list, search, paginate.
- **Add a term** — name, slug, parent (if hierarchical), description.
- **Bulk delete** — clean up unused or duplicate terms.
- **Edit a term** — rename, re-slug, re-parent, change description.
- **See term usage** — post count per term, link to posts using a term.
- **Reparent** (hierarchical only) — move a term under a different parent.

The Categories screen has one extra concern: the **default category** (option `default_category`) cannot be deleted, and posts whose only category was deleted fall back to the default.

---

## 3. Capabilities & access

Capabilities are taxonomy-specific, set in `register_taxonomy(..., 'capabilities' => [...])`. Defaults map to:

| Action | Default capability (post tag/category) | Source |
|---|---|---|
| View screen | `manage_categories` (alias `manage_terms` for custom tax) | `edit-tags.php` line 26 |
| Create term | `manage_categories` (alias `edit_terms`) | `edit-tags.php` line 83 |
| Edit term | `edit_term` (per term; usually maps to `manage_categories`) | `term.php` line 39 |
| Delete term | `delete_term` (per term) | `edit-tags.php` line 114 |
| Bulk delete | `manage_categories` (alias `delete_terms`) | `edit-tags.php` line 134 |
| Assign term to post | `edit_post` + `assign_term` | `WP_REST_Terms_Controller` does not check this (it's the post controller's job) |

For custom taxonomies, replace `manage_categories` with `$taxonomy->cap->manage_terms` etc. Always read `WP_Taxonomy::cap` rather than hardcoding.

**Permission-denied state:** if user lacks `manage_terms`, the menu entry is hidden. URL-direct access shows "Sorry, you are not allowed to manage terms in this taxonomy." Workspace mirrors with empty state.

**Per-row caps:** the list checks `delete_term` per row; rows the user can't delete render without checkbox. `edit_term` gates the row Edit action.

**Default category:** `wp_delete_term` refuses to delete the term whose id matches `get_option('default_category')`. The list/edit must surface this — render the default term with a "Default" badge and disable destructive actions.

---

## 4. Data model

### Primary entity
- **Type:** `taxonomy` term (`WP_Term`)
- **REST endpoint:** `GET /wp/v2/{rest_base}` where `rest_base` defaults to `categories` for `category`, `tags` for `post_tag`, or the taxonomy's registered `rest_base`
- **Single-record endpoint:** `GET /wp/v2/{rest_base}/{id}`
- **Controller:** `WP_REST_Terms_Controller`

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `name` | `name` | string | display + sortable; can include HTML entities (decoded server-side) |
| `slug` | `slug` | string | URL-safe; sortable |
| `description` | `description` | string | sortable; HTML allowed (sanitized) |
| `parent` | `parent` | int | hierarchical only; 0 = top-level |
| `count` | `count` | int | post count using this term; sortable |
| `link` | `link` | URL | frontend archive |
| `taxonomy` | `taxonomy` | string | the taxonomy slug |
| `meta` | `meta` | object | registered term meta fields |

### Query parameters
- `per_page` — 1–100; default 10 (core) or 20 (admin user setting)
- `page` — pagination
- `search` — full-text on name, slug, description
- `parent` — int, hierarchical taxonomies only; filter to children of a given term (`-1` for top-level only — actually `0` for top-level)
- `post` — int; filter to terms used on a specific post
- `slug` — string[]; filter by exact slugs
- `include` — int[]; specific ids
- `exclude` — int[]
- `hide_empty` — bool; default false
- `orderby` — `id`, `include`, `name` (default), `slug`, `include_slugs`, `term_group`, `description`, `count`
- `order` — `asc` (default) / `desc`
- `context=edit` — required for `meta` writes and full description; not strictly needed for list rendering
- `_fields` — restrict response

### Hierarchical display

Core renders hierarchical taxonomies (Categories) as an **indented tree** in the list, using PHP-side recursion. The REST list returns flat results; the workspace must build the tree client-side:

1. Fetch all top-level (`parent: 0`) terms.
2. For each term with a non-zero `count` of children, fetch children lazily (or up-front for small trees).
3. Render with indentation (`level-{n}` class or aria-level).

For very large category trees (1000+), this is expensive. Acceptable interim: paginate flat with breadcrumb display ("Foo > Bar > Baz" inline) and provide a separate "Tree view" toggle. Core's PHP recursion does not paginate elegantly either — when paged, parent rows are duplicated to provide context.

### Aggregate data

Header subtitle: total terms count. Source: `wp_count_terms($taxonomy)` (PHP). REST: read `X-WP-Total` from any list response.

Default-category id: `GET /wp/v2/settings` → `default_category`. Used to render "Default" badge and disable destructive actions on that term.

### Non-REST data (gaps)

- **Quick Edit save** — admin-ajax `inline-save-tax` action. REST equivalent: `PUT /wp/v2/{rest_base}/{id}` with subset of fields.
- **Reorder** (drag-to-reparent) — not in core. Plugin territory.
- **Term merge** — not in core. Plugin territory; out of scope.
- **Posts using this term** — `GET /wp/v2/{post_rest_base}?{taxonomy_query_var}={term_id}` (e.g. `?categories=5`); query var is `category` for category, `tag` for post_tag, or custom (`{taxonomy}.query_var`).

---

## 5. Layout regions (semantic)

### Default mode: split pane (Add + List)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ({taxonomy.labels.name}, e.g. "Categories")        │
│  └─ Subtitle: search results indicator                       │
├─────────────────────────┬───────────────────────────────────┤
│ ADD NEW {term} (LEFT)   │ LIST + FILTER (RIGHT)             │
│                         │                                    │
│  Form:                  │  Search input                      │
│   - Name (required)     │  Bulk action select + Apply        │
│   - Slug                │                                    │
│   - Parent (if hier.)   │  Table:                            │
│   - Description         │   - cb (selection)                 │
│   - {taxonomy meta}     │   - Name (with indent if hier.)    │
│   - Submit button       │   - Description                    │
│                         │   - Slug                           │
│                         │   - Count (link to posts)          │
│                         │  Per-row actions: Edit, Quick      │
│                         │   Edit, Delete, View               │
│                         │  Pagination + total                │
└─────────────────────────┴───────────────────────────────────┘
```

The split-pane layout applies to **both** hierarchical and non-hierarchical taxonomies (core does this consistently). The left pane is shown only if the user has `edit_terms` cap. If not, the right pane stretches full-width.

### Edit Term screen (single)

Reached via row Edit action or `?action=edit&tag_ID={id}` (legacy URL). Single full-width form:

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Edit Category" / "Edit Tag" / etc.)              │
├─────────────────────────────────────────────────────────────┤
│ FORM                                                         │
│  - Name (required)                                           │
│  - Slug                                                      │
│  - Parent (hierarchical only)                                │
│  - Description                                               │
│  - {taxonomy meta fields}                                    │
│  Footer:                                                     │
│   ├─ Update                                                  │
│   └─ Delete (right-aligned; hidden for default category)     │
└─────────────────────────────────────────────────────────────┘
```

### Bottom hint area

Core renders a one-paragraph hint below the list:
- Categories: "Deleting a category does not delete the posts in that category. Posts assigned only to deleted categories are reassigned to the default category."
- Tags: "Tags can be selectively converted to categories using the [tag-to-category converter]." (importer link; v1 omits)

The workspace preserves the Categories hint as a static info panel; tag converter link is omitted.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (initial) | First fetch | Skeleton rows |
| Loading (pagination) | Page change | Stale-while-revalidate |
| Empty (no terms ever) | total === 0, no search | Onboarding empty state in list pane: icon + "No {terms} yet" + focus the Add form |
| Empty (filtered) | total === 0 with search | "No {terms} match" + Clear search |
| Add submitting | Submit clicked | Disable form; show inline spinner near Submit button |
| Add error (duplicate slug) | Server returns `term_exists` | Inline error under slug field; preserve form state |
| Add success | Server 201 | Form clears; new row flashes in list |
| Edit submitting | Update clicked | Disable form |
| Edit error | Server error | Inline error banner at top of form; preserve edits |
| Delete confirming | User clicked Delete | Modal: "Delete '{name}'? Posts using only this term will be reassigned." |
| Delete protected | User tries to delete default category | Error toast: "The default category cannot be deleted." |
| Network error | 5xx / fetch fail | Banner; preserve form/list state |
| Permission denied | 401/403 | Empty state with link to Posts |

---

## 7. Actions

### Add form (left pane)
- **Submit** — `POST /wp/v2/{rest_base}` with `name`, `slug?`, `parent?`, `description?`, `meta?`. Returns 201 with new term. Required cap: `edit_terms`.

### Per-row actions

| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_term` | Navigation | Opens edit screen |
| Quick Edit | `edit_term` | Inline form | Inline name + slug edit; `PUT` |
| Delete | `delete_term` | Mutation | Confirmation modal; `DELETE /wp/v2/{rest_base}/{id}?force=true` (terms don't have trash) |
| View | public | External | Opens taxonomy archive in new tab; only when `taxonomy.public === true` |

The **default category** row hides Delete and renders a "Default" badge.

### Bulk actions

| Bulk action | Cap | Notes |
|---|---|---|
| Delete | `delete_terms` | Confirmation modal; parallel `DELETE` calls; default category excluded server-side (returns 500 — handle gracefully); continue-on-error |

Selection model: checkbox per row + select-all-on-page.

### Optimistic vs. blocking
- **Add term** — blocking (need new id back to render row)
- **Edit term** — optimistic for name/description; blocking for slug change (server may rewrite for uniqueness)
- **Quick Edit** — optimistic; row flashes "Saved"
- **Delete** — blocking; modal confirm

---

## 8. Filters, sort, search, pagination

### Filters

| Filter | Field | Operators | Source |
|---|---|---|---|
| Parent | `parent` | `is` | hierarchical only; rare; used for "show children of X" deep-link |
| Hide empty | `hide_empty: true` | bool | optional toggle |
| Search | `search` | match | matches name + slug + description |

Core has no first-class filter UI on this screen beyond search. The workspace can add hide-empty as a toggle and a "show children of" breadcrumb when `?parent=` is in URL.

### Sort
Default: `name asc` (non-hierarchical) or hierarchical-tree (hierarchical, when no `orderby` param). Sortable columns: `name`, `slug`, `description`, `count`. Switching sort on a hierarchical taxonomy collapses the tree to flat sorted view (matches core behavior).

### Search
Single full-text input. Maps to `?search=`. Debounced 300ms. Resets to page 1. **For hierarchical taxonomies**, search collapses the tree (core suppresses children fetch when search is active per `WP_Terms_List_Table::_rows`).

### Pagination
- Default page size: 20 (core admin user setting)
- Page X of Y, total count, prev/next, jump-to-page
- URL state: `?page=2`

---

## 9. Forms & inputs

### Add form

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text | yes | `name`; HTML entities allowed (server escapes) |
| Slug | text | no | `slug`; URL-safe; if empty server derives from name |
| Parent | select tree (hierarchical only) | no | `parent`; "None" option for top-level; uses `wp_dropdown_categories(hierarchical: true)` rendering — indented option labels |
| Description | textarea | no | `description`; some themes display |
| {meta fields} | per registration | per registration | from `register_term_meta` |

Core fires hooks for plugins to add fields:
- `{taxonomy}_pre_add_form`, `{taxonomy}_add_form_fields`, `{taxonomy}_add_form` — wrap form lifecycle
- For non-hierarchical also `add_tag_form_fields` (legacy)

### Edit form

Same fields as Add. Hierarchical: parent select **excludes the term itself and its descendants** to prevent cycles (`exclude_tree: $tag->term_id`).

Core fires hooks:
- `{taxonomy}_pre_edit_form`, `{taxonomy}_edit_form_fields`, `{taxonomy}_edit_form`

### Quick Edit (inline)

Subset only:
| Field | Type | Required |
|---|---|---|
| Name | text | yes |
| Slug | text | no |

Quick Edit does not include parent or description (matches core list-table inline edit behavior).

### Validation

- **Name** — non-empty after trim. Server returns `term_exists` (400) if name+parent collision exists.
- **Slug** — server enforces uniqueness within taxonomy. If user-provided slug collides, server appends `-2`, `-3`, etc. silently. Client should display the resulting slug after save.
- **Parent** — must be a valid term id in same taxonomy, or 0. Server validates.
- **Description** — accepts HTML; server runs `wp_filter_kses_post`-like sanitization based on user caps.

### Save semantics
- Add: `POST` blocking → on 201, append row + clear form
- Edit (full screen): `PUT` blocking → snackbar + return to list
- Quick Edit: `PUT` optimistic → row flash
- No autosave

---

## 10. Routing & URL state

### Original wp-admin URLs
- `edit-tags.php?taxonomy={tax}` — list + add
- `edit-tags.php?taxonomy={tax}&post_type={pt}` — scoped breadcrumb (UI only)
- `edit-tags.php?taxonomy={tax}&s={query}` — search
- `edit-tags.php?taxonomy={tax}&paged={n}` — pagination
- `edit-tags.php?taxonomy={tax}&orderby={col}&order={asc|desc}` — sort
- `term.php?taxonomy={tax}&tag_ID={id}` — edit (since 4.5)
- Legacy: `edit-tags.php?action=edit&taxonomy={tax}&tag_ID={id}` (302s to `term.php`)

### Recommended workspace URL state

```
#/taxonomy-{tax}                                    — list + add pane
#/taxonomy-{tax}?search=foo&page=2&sort=name:asc    — filtered
#/taxonomy-{tax}/{id}                               — edit term
#/taxonomy-{tax}?parent={id}                        — children of term (hierarchical)
```

The slug `taxonomy-{tax}` accommodates multiple instances per workspace (one per taxonomy registered to a post type the workspace exposes).

Browser back/forward must restore filters + edit-form state for the open form. Refresh restores list filters; in-progress add-form input may be lost (acceptable).

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)

| Trigger | Destination | Carry |
|---|---|---|
| Click row name | this screen, `/{id}` edit | term id |
| Click "Count" link | `posts` app, filtered | `?{taxonomy_query_var}={term_id}` (e.g. `?categories=5` or `?tags=12`) |
| "View" archive link | external URL | new tab |
| Parent term in breadcrumb | this screen, filtered | `?parent={id}` |

### Inbound

- From `posts` app: per-row taxonomy chips → this screen, single-term edit (or filter to that term)
- From `editor` / `simple-editor`: "Manage tags/categories" link from sidebar → this screen
- From command palette: quick navigation by taxonomy

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Add success | Snackbar: "{Term} '{name}' added" with Edit link |
| Add duplicate | Inline error under slug field; no snackbar |
| Edit saved | Snackbar: "{Term} updated" |
| Quick Edit saved | Inline row flash |
| Delete (single) | Modal confirm → snackbar "{Term} deleted" |
| Bulk delete | Modal confirm → snackbar "{N} {terms} deleted" + failure count |
| Default-category delete attempt | Error toast: "The default category cannot be deleted." |
| Network error | Banner + retry; preserve form state |
| Server-rewrote slug | Snackbar mention: "Saved as '{actual-slug}'" |

No undo for term delete (terms are not soft-deleted in core; a re-create requires fresh row).

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `/` | Focus list search |
| `n` | Focus Add Term name input |
| `↑↓` | Move row focus in list |
| `Space` | Toggle row selection |
| `Enter` (row focus) | Open edit screen |
| `Esc` | Close inline Quick Edit |
| `Cmd/Ctrl+A` | Select all on page |
| `Cmd/Ctrl+Enter` (in Add form) | Submit |

### ARIA & focus

- Form fields have explicit `<label for>`; the `aria-describedby` references inline help (`name-description`, `slug-description`, etc., matching core's pattern)
- Table: `role="table"` with sortable cells using `aria-sort`
- Hierarchical rows: `aria-level={n+1}` (top-level = 1) and `aria-setsize`/`aria-posinset` per group
- Add form: focus moves to Name input on initial mount (matches core's `document.forms.addtag['tag-name'].focus()`)
- After successful Add: focus returns to Name input (for next entry)
- After successful Edit (full screen): focus returns to the saved row in the list
- Quick Edit save: focus returns to the row's primary action
- Modal confirmations: focus trap + return on close

### Screen reader

- Sort changes announced
- "Term added: {name}" via live region after Add
- "Default category" badge announced as part of the row's accessible name
- Hierarchical level: "{name}, level {n}" in row's accessible name (when expanded tree visible)

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_edit-{taxonomy}_columns` | Add list columns | Replace with workspace `fields` extensibility |
| `manage_{taxonomy}_custom_column` | Render custom column | Replace with field-render registry |
| `{taxonomy}_row_actions` | Per-row actions | Replace with workspace `actions` registry (`core:taxonomy.row-actions` slot) |
| `quick_edit_custom_box` | Quick Edit custom fields | Replace with workspace field-level extensibility |
| `{taxonomy}_pre_add_form`, `{taxonomy}_add_form_fields`, `{taxonomy}_add_form` | Add-form lifecycle | Replace with `core:taxonomy.add-form` slot fills |
| `{taxonomy}_pre_edit_form`, `{taxonomy}_edit_form_fields`, `{taxonomy}_edit_form` | Edit-form lifecycle | Replace with `core:taxonomy.edit-form` slot fills |
| `taxonomy_parent_dropdown_args` | Parent select args | Replace with workspace parent-picker config |
| `bulk_actions-edit-{taxonomy}` | Bulk actions | Replace with workspace bulk-action registry |
| `after-{taxonomy}-table` | Below-list content (hint area) | Replace with `core:taxonomy.below-list` slot |
| `{taxonomy}_term_new_form_tag`, `{taxonomy}_term_edit_form_tag` | Form attribute injection | Drop — server-side only |
| `editable_slug` | Filter slug pre-display | Replace with workspace field-render config |

Plugin compatibility: third-party taxonomy plugins (custom term meta UIs, hierarchy enhancers) need migration to slot fills.

---

## 15. Mapping & implementation status

### Current workspace coverage

- **Source:** `core:taxonomy` → `src/apps/taxonomy/index.js`, registered in `src/runtime/registry/builtins.js`. Parameterized by `config.taxonomy` (defaults to `category`); mount the app once per taxonomy to surface tags / custom taxonomies.
- **What works:** native DataViews table with a `@wordpress/dataviews` `DataForm` create/edit modal (name / slug / description), search, sort, and bulk delete via `createBulkConfirmModal`. See `src/apps/taxonomy/app.md`.
- **Note:** the Gaps table below predates the native app (it still lists "Register `core:taxonomy` source" as a gap) and may overstate what's missing; treat `app.md` as canonical.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:taxonomy` source | High | Parameterized: `taxonomy: 'category'` etc.; one source serves all |
| Split-pane layout | High | Add (left) + List (right) |
| List with DataViews | High | Reuse the DataViews infrastructure used by `core:posts`/`core:users` |
| Hierarchical tree display | High | Recursive flat → tree client-side; indent rendering |
| Hierarchical-aware sort behavior | Medium | Switching sort collapses tree (mirror core) |
| Add term form | High | name + slug + parent (hier) + description; `POST` |
| Edit term screen | High | Full-width form; `PUT` |
| Quick Edit (name + slug) | Medium | Inline expand |
| Delete (single + bulk) | High | Modal confirm; default-category protection |
| Default category badge + protection | High | Read `default_category` from `/wp/v2/settings`; refuse delete |
| Search | High | `?search=` |
| Sort by name/slug/description/count | Medium | |
| Hide-empty toggle | Medium | `?hide_empty=true` |
| Count column with link to posts | Medium | Link to `posts` app filtered by term |
| Term meta field rendering | High | From `register_term_meta`; render via field registry |
| `wp_dropdown_categories`-equivalent parent picker | High | Indented select with cycle prevention on edit |
| View term archive (external link) | Low | When `taxonomy.public === true` |
| Below-list hint area for Categories | Low | Static info card |
| Slug-collision feedback after save | Medium | Show server-rewritten slug in snackbar |
| Permalink preview in edit form | Low | "URL: /category/{slug}/" preview |
| Per-post-type breadcrumb scope | Low | When taxonomy attached to multiple post types, breadcrumb shows scope |
| ARIA polish | High | Sortable announce, hier level, focus restoration |

### Acceptable interim

For v1 of any new workspace config, `iframe:edit-tags.php?taxonomy={tax}` is the explicit fallback. The `wp-admin-default` baseline already uses this. Mark configs with iframe taxonomy panels for replacement when `core:taxonomy` lands.

---

## 16. Out of scope

- **Term merge** (combine two terms into one, reassign posts) — not in core; popular plugin (Term Management Tools); out of v1
- **Drag-to-reparent** — not in core; out of v1
- **Bulk reparent** — out of v1
- **Term import/export** — Categories ↔ Tags converter is a separate importer, not this screen
- **Link Manager `link_category` taxonomy** — explicit skip (admin-only legacy)
- **Per-taxonomy permalink customization** — Settings → Permalinks concern
- **Taxonomy assignment UI** (the term-picker component used inside the post editor) — that lives in the editor, not here. The `core:taxonomy` source manages terms; the editor's term-picker consumes them
- **Term color / icon customization** — not in core; plugin territory
- **Term ordering** (`menu_order` for terms) — not in core; plugin territory

---

## 17. Reference

- Original PHP: `wp-admin/edit-tags.php` (list + add; also handles legacy `?action=edit` redirect to `term.php`), `wp-admin/term.php` (edit single, since 4.5)
- **Form partial:** `wp-admin/edit-tag-form.php` is the form rendered inside `wp-admin/term.php`, **not standalone** — it requires `$tag`, `$tax`, `$taxonomy`, and `$message` to be in scope, included via `require ABSPATH . 'wp-admin/edit-tag-form.php'`. The workspace's Edit Term screen replaces both files in one component.
- The Add form is **inline** within `edit-tags.php` (lines 438–608), not in `edit-tag-form.php`. The workspace's Add panel reproduces it without a partial split.
- Edit-tag messages: `wp-admin/includes/edit-tag-messages.php` provides the `$message` strings used by both the Add flow's redirect and the Edit screen
- Legacy redirect: `wp-admin/edit-tags.php?action=edit` 302s to `term.php` (as of WP 4.5)
- List table: `wp-admin/includes/class-wp-terms-list-table.php`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-terms-controller.php`
- REST schemas: `https://developer.wordpress.org/rest-api/reference/categories/`, `/tags/`, and per-taxonomy at `/wp-json/wp/v2/{rest_base}`
- `WP_Taxonomy::cap` definitions: `wp-includes/class-wp-taxonomy.php`
- `wp_dropdown_categories()` — parent select renderer used by core's add/edit forms
- Current workspace impl: **not yet registered.** Planned `core:taxonomy` source, parameterized by taxonomy slug
- Workspace config example: `workspaces/wp-admin-default.json` currently has `iframe:edit-tags.php?taxonomy=category` as the placeholder
