# Screen Spec: Posts (and any post-type list)

**Status:** Tier 2 — full spec. Serves as the template for all other tier-2 specs.
**Source PHP:** `wp-admin/edit.php` + `WP_Posts_List_Table` (`wp-admin/includes/class-wp-posts-list-table.php`)
**Current workspace coverage:** `core:posts` → `src/apps/posts/index.js` (partial — see "Gaps" below)

This spec describes the **semantic surface** of the Posts list screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `posts` (also `pages`, plus one per public CPT) |
| Display name | "Posts" / "Pages" / `{post_type.labels.menu_name}` |
| Original URL | `/wp-admin/edit.php` (Posts), `/wp-admin/edit.php?post_type=page` (Pages), `/wp-admin/edit.php?post_type={cpt}` (CPTs) |
| Menu location | Top-level (Posts, Pages); CPT placement depends on `menu_position` |
| Submenu items | All Posts (this screen), Add New (separate `post-new` screen), Categories, Tags |
| Parent app | None — this screen is a top-level app instance |
| Sub-screens | Edit Post (`editor` app), Categories/Tags (`taxonomy` app) |

The **same** screen serves Posts, Pages, and every public custom post type. Differences are entirely data-driven from the post-type registration: capabilities, supported taxonomies, supported features (`thumbnail`, `comments`, `author`, `excerpt`).

---

## 2. Purpose

Browse, search, filter, triage, and bulk-manage posts of a given type. Primary entry point for content authors. Secondary use: editorial managers reviewing pending submissions and triaging trash.

Jobs to be done:
- **Find a post I'm working on** — search by title, filter by status, sort by date.
- **Triage incoming submissions** — filter to "Pending", review, approve or reject.
- **Bulk operations** — re-categorize, change author, move many to trash.
- **Quick status changes** — publish a draft, unpublish, schedule, restore from trash.
- **Navigate into editing** — fastest path from list → edit a single post.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_posts` (or post-type's `cap.edit_posts`) | `menu.php`, `edit.php` |
| View own only (non-editor roles) | `read` + post ownership check | `WP_Posts_List_Table::prepare_items` |
| Create | `cap.create_posts` | edit.php "Add New" button |
| Edit any post | `cap.edit_others_posts` | per-row Edit action |
| Edit own | `cap.edit_posts` | per-row Edit |
| Publish | `cap.publish_posts` | status change action |
| Delete any | `cap.delete_others_posts` | Trash / Delete Permanently |
| Delete own | `cap.delete_posts` | Trash own posts |

**Permission-denied state:** if user lacks `edit_posts`, the menu entry is hidden by core. If they reach the URL anyway, core shows a generic "you don't have permission" message. The workspace should mirror this — render a "no access" empty state, not blank.

**Multisite:** no special handling at the list level. Capability checks already incorporate site context.

---

## 4. Data model

### Primary entity
- **Type:** `postType` / `{post_type}` (e.g. `post`, `page`, custom)
- **REST endpoint:** `GET /wp/v2/{rest_base}` (default `posts`, `pages`, or post-type's `rest_base`)
- **Single-record endpoint:** `GET /wp/v2/{rest_base}/{id}` — **not used in list view**, used by detail/preview pane if any

### Fields used by the list
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `title` | `title.rendered` (raw also via `?context=edit`) | string | display + sortable |
| `status` | `status` | string | filterable; values: `publish`, `draft`, `pending`, `private`, `future`, `trash`, `auto-draft`, `inherit` |
| `author` | `author` (id), `_embedded.author[0]` (object) | int / embedded user | filter dropdown + display |
| `date` | `date` (publish) / `date_gmt` / `modified` | ISO 8601 | sortable; semantics depend on status |
| `link` | `link` | URL | "View" action target |
| `featured_media` | `featured_media` (id), `_embedded["wp:featuredmedia"]` | int / embedded media | thumbnail column when post-type supports `thumbnail` |
| `comment_status` | `comment_status` | enum | drives Comments column visibility |
| `categories` / `tags` | `categories[]`, `tags[]` | int[] | optional columns, filterable |
| `sticky` | `sticky` | bool | "post" type only |
| `parent` | `parent` | int | hierarchical post types only (pages) |
| `menu_order` | `menu_order` | int | hierarchical post types — sortable |
| `format` | `format` | string | post formats theme support |
| `password` | `password` (write-only via `?context=edit`) | string | shows lock indicator if set |

### Query parameters
- `per_page` — page size (1–100; default 10 in core, 20 in our PostsApp)
- `page` — pagination
- `search` — full-text search across title/content/excerpt
- `status` — comma-separated; `any` for all-but-trash; `trash` for trash view
- `author` — single ID or comma list
- `categories` / `tags` — taxonomy filters
- `orderby` — `date`, `modified`, `title`, `id`, `menu_order`, `comment_count`, `author`
- `order` — `asc` / `desc`
- `context=edit` — required to receive `title.raw`, `password`, capabilities, and full status set
- `_embed=author,wp:featuredmedia,wp:term` — hydrate related data in one round trip
- `_fields` — restrict response to needed fields (perf)

### Aggregate data
The list table also displays per-status **counts** in the status filter row: "All (123) | Published (98) | Draft (15) | Pending (3) | Trash (7)".
- Source: `wp_count_posts({post_type})` (PHP) — no first-class REST equivalent
- REST workaround: `GET /wp/v2/{rest_base}?status=draft&per_page=1` and read `X-WP-Total` header per status. Six requests total. Acceptable but flagged as a gap.
- Trash count requires `status=trash` + `edit_others_posts` cap.

### Non-REST data (gaps)
- **Quick Edit save** — uses admin-ajax (`inline-save` action). REST equivalent: `PUT /wp/v2/{rest_base}/{id}` with subset of fields. Use REST.
- **"Restore from Trash"** — REST: `PUT /wp/v2/{rest_base}/{id}` with `status: 'draft'` (or previous status). Core stores previous status in post meta `_wp_trash_meta_status`; not exposed via REST. Restoring always sends to draft is acceptable, with caveat in changelog.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Posts" / type label)                             │
│  ├─ Primary action: "Add New {Post}"                         │
│  └─ Secondary: import/export shortcuts (optional)            │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Status tabs with counts (All | Published | Draft | …)    │
│  ├─ Search input (full-text)                                 │
│  ├─ Date dropdown (month)                                    │
│  ├─ Author dropdown                                          │
│  ├─ Taxonomy dropdowns (Categories, Tags) — post type aware  │
│  └─ Layout switcher (table / grid / list)                    │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW (visible when ≥1 row selected)               │
│  └─ Bulk action select + apply                               │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  └─ Table / grid / list of posts                             │
│     - selection checkboxes                                   │
│     - sortable columns                                       │
│     - per-row inline actions (Edit, Quick Edit, Trash, View) │
│     - row click → detail / editor                            │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  ├─ Pagination                                               │
│  └─ Total count                                              │
└─────────────────────────────────────────────────────────────┘
```

Optional **preview pane** (right-docked) — core does not have this; the workspace adds it via `preview` config. When enabled:
- Selecting a row shows post preview/edit in adjacent pane
- Primary list region constrains to `contentWidth`

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (initial) | First fetch | Skeleton rows or spinner; preserve layout to avoid jump |
| Loading (page change) | Pagination/filter change | Subtle inline indicator; keep previous data visible (stale-while-revalidate) |
| Empty (no posts ever) | `total === 0` and no filters | Onboarding empty state: icon + "No posts yet" + primary CTA |
| Empty (filtered) | `total === 0` with filters | "No posts match these filters" + "Clear filters" action |
| Error | Network/REST error | Inline banner with retry; preserve filter state |
| Permission denied | 401/403 | "You don't have permission to view posts" + back link |
| Trash view, empty | `?status=trash` and 0 results | "Trash is empty" |
| Stale (read-only) | Post-type doesn't support edit cap | List visible, actions hidden, "Read only" badge |

---

## 7. Actions

### Primary action (header)
- **Add New** — navigates to `editor` app with new auto-draft. Required cap: `cap.create_posts`.

### Per-row actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_post` | Navigation | Default click target on title; opens editor |
| Quick Edit | `edit_post` | Inline form | Toggle row into edit mode for title/slug/author/date/categories/tags/status — no editor navigation |
| View | `read_post` (public) | External | Opens published URL in new tab; only when `status === 'publish'` or has preview link |
| Trash | `delete_post` | Mutation | `status: 'trash'`; confirmation modal for destructive action; not a hard delete |
| Restore | `delete_post` | Mutation | Only in Trash view; sets `status: 'draft'` |
| Delete Permanently | `delete_post` | Mutation | Only in Trash view; `DELETE /wp/v2/{rest_base}/{id}?force=true`; double-confirm |
| Duplicate (optional) | `create_posts` | Mutation | Not in core; common plugin extension. Skip for v1. |

### Bulk actions
Selection model: checkbox per row + "select all on page" + "select all matching" (latter rare in core, common in modern UIs).

| Bulk action | Behavior |
|---|---|
| Edit (Bulk Edit) | Opens inline form to change author, status, format, comments, sticky, categories, tags across all selected. **Only mutates fields the user explicitly changes.** |
| Move to Trash | `status: 'trash'` for each selected; single confirmation |
| Delete Permanently (Trash view) | Hard delete each; double-confirm |
| Restore (Trash view) | `status: 'draft'` for each |

Implementation: parallel REST PUT/DELETE calls with progress and partial-failure reporting. Stop-on-error vs. continue-on-error: continue, report failures at the end.

### Optimistic vs. blocking
- **Trash, Restore, status change** — optimistic. Show immediate UI update, roll back on error.
- **Delete Permanently** — blocking. Wait for server confirmation; consequences are unrecoverable.
- **Bulk Edit** — blocking. Show progress; user expects atomic-feeling completion.

---

## 8. Filters, sort, search, pagination

### Filters
| Filter | Field | Operators | Source of options |
|---|---|---|---|
| Status | `status` | `is`, `isAny` | Hard-coded enum + post-type registered statuses |
| Author | `author` | `is`, `isAny` | `GET /wp/v2/users?per_page=100&who=authors` |
| Date | `after` + `before` | range | Month dropdown derived from posts' date span (core uses month list) |
| Categories | `categories` | `isAny`, `isAll`, `isNone` | `GET /wp/v2/categories?per_page=100` |
| Tags | `tags` | `isAny` | `GET /wp/v2/tags?per_page=100` (or async-search for high-cardinality) |
| Format | `format` | `is`, `isAny` | Theme-supported formats |
| Sticky | `sticky` | `is` | post type only |

Filters combine with **AND** semantics across fields, **OR** within a single multi-value field.

### Sort
Default: `date desc`. Sortable columns: `title`, `author`, `date`, `modified`, `comment_count`, `menu_order` (hierarchical).

### Search
Single full-text input. Maps to `?search=`. Debounced (300ms) before fetch. Search resets to page 1.

### Pagination
- Default page size: 20 (core uses 20; user-configurable up to 100 via screen options)
- Show page X of Y, total count, prev/next, jump-to-page input
- Preserve filters and sort across page changes
- URL state: `?page=2` reflects current page so deep-links work

---

## 9. Forms & inputs

This is a list screen — primary form is **Quick Edit** (inline) and **Bulk Edit** (inline form mutating selected rows).

### Quick Edit fields (single row)
| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | |
| Slug | text | no | derived from title if blank |
| Date | datetime | no | drives publish/schedule |
| Password | text | no | empty = no protection |
| Author | user picker | yes | populated from authors who can write this type |
| Categories | multi-select tree | no | post type only |
| Tags | tag input | no | post type only |
| Parent | post picker | no | hierarchical types only |
| Order | number | no | hierarchical types only |
| Template | select | no | hierarchical types with templates |
| Status | select | yes | filtered to caps user has |
| Sticky | bool | no | post type only |
| Allow comments | bool | no | when post-type supports |
| Allow pingbacks | bool | no | when post-type supports |

### Bulk Edit fields
Same field set, with a "—No change—" sentinel state. Only changed fields are sent.

Validation: server-side (REST) is authoritative. Client-side: required fields, slug uniqueness can be skipped (server resolves).

### Save semantics
- Quick Edit save: `PUT /wp/v2/{rest_base}/{id}` with subset of fields → optimistic update on success
- Bulk Edit save: parallel PUTs; report failures
- No autosave at the list level

---

## 10. Routing & URL state

Original wp-admin URL params:
- `?post_type={type}` — selects the post type
- `?post_status={status}` — status filter
- `?orderby=`, `?order=` — sort
- `?author={id}` — author filter
- `?cat={id}`, `?tag_id={id}` — taxonomy filters
- `?m={YYYYMM}` — month filter
- `?s={query}` — search
- `?paged={n}` — pagination
- `?action={action}&post={id}` — destination for row actions

The workspace uses hash-based routing under `#/posts` (or `#/{app-id}`). Recommended URL state:
```
#/posts?status=draft&author=2&search=hello&page=2&sort=date:desc
```

Browser back/forward must restore filter state. Refresh must restore filter state. Sharing the URL must reproduce the filtered view.

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)
| Trigger | Destination | Carry |
|---|---|---|
| Click row title | `editor` app | post type + post id |
| Click "Add New" | `editor` app | post type + new auto-draft id |
| Click "View" | external URL (`link`) | new tab |
| Click author name | this screen, filtered | `?author={id}` |
| Click category/tag | this screen, filtered | `?categories={id}` or `?tags={id}` |
| Click date | this screen, filtered | `?m={YYYYMM}` |
| "Edit comments" link in row | `comments` app | `?post={id}` |

### Inbound (other apps → this screen)
- From `editor` "back" button → return to filtered list (preserve referring filters)
- From taxonomy (`categories` / `tags`) screens → list filtered by that term
- From command palette → quick navigation, optionally with filter

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Single trash | Snackbar: "Moved to trash" + "Undo" button (5s) |
| Bulk trash | Snackbar: "{N} moved to trash" + "Undo" |
| Restore | Snackbar: "Restored" |
| Permanent delete | Snackbar: "Deleted permanently" — no undo |
| Quick Edit save | Inline row flash + snackbar "Updated" |
| Bulk Edit save | Snackbar: "{N} updated" with failure count if any |
| Network error | Banner above list, persistent until dismissed or retry succeeds |
| Permission error mid-action | Inline error on row + snackbar |

Undo for trash: keep last operation in memory for 5s; "Undo" reissues a `status` change back to previous status.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `n` (when not in input) | New post |
| `↑` / `↓` | Move row focus |
| `Space` | Toggle selection on focused row |
| `Enter` | Open focused row |
| `Esc` | Close Quick Edit / clear selection |
| `Cmd/Ctrl+A` | Select all on page |
| `Shift+Click` | Range select |

### ARIA & focus
- Table: `role="table"` with `role="row"`, `role="columnheader"` (sortable cells use `aria-sort`)
- Grid layout: use `role="grid"`/`role="gridcell"` only if implementing grid keyboard nav
- Selection checkboxes have `aria-label` describing the row
- Status filter tabs: `role="tablist"` + counts in accessible name
- Bulk action bar: announced via live region when it appears
- After Quick Edit save: focus returns to the saved row's title
- After delete: focus moves to next row (or prev if last)
- Modal confirmations: focus trap + return on close
- Loading state: `aria-busy="true"` on the data region

### Screen reader
- Column sort changes announced ("Sorted by date, descending")
- Row count changes announced when filters apply
- "Selected N items" announced via live region

---

## 14. Extension points (core hooks)

Core list-table exposes these. Decide for each whether the workspace preserves them, replaces with workspace-level extensibility, or drops.

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_{post_type}_posts_columns` | Add/remove columns | **Replace** with a workspace-level `fields` extensibility API on the app config |
| `manage_{post_type}_posts_custom_column` | Render custom column cell | Replace with field `render` registry |
| `manage_edit-{post_type}_sortable_columns` | Mark columns sortable | Replace with field config `enableSorting` |
| `bulk_actions-edit-{post_type}` | Add bulk actions | Replace with workspace `actions` registry, `supportsBulk: true` |
| `views_edit-{post_type}` | Add status filter tabs | Replace with workspace-level filter tab API |
| `post_row_actions` / `page_row_actions` | Per-row action links | Replace with workspace `actions` registry |
| `restrict_manage_posts` | Filter dropdowns above table | Replace with workspace-level filter API |
| `posts_clauses` / `posts_where` | Modify query | Drop — REST handles via filters or custom endpoints |
| `quick_edit_show_taxonomy` | Quick Edit field visibility | Replace with workspace field-level conditional rendering |

Plugin compatibility note: third-party plugins relying on the original hooks won't work in the workspace. Document this prominently. Provide a migration shim only if/when ecosystem demand justifies it.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** `core:posts` → `src/apps/posts/index.js`
- **What works:** list, search, status filter (single/multi), pagination, sort by date, edit/view/trash actions, bulk trash
- **Layout:** table (DataViews `table` type)

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Status counts in filter tabs | High | Requires 6 parallel HEAD/list requests or new aggregate endpoint |
| Quick Edit | High | Inline form per row; major UX feature |
| Bulk Edit | High | Inline form for bulk mutation |
| Author filter | High | Requires user fetch for picker |
| Date filter | High | Month dropdown |
| Taxonomy filters (categories, tags) | High | Requires term fetch |
| Trash view (status=trash) + Restore + Delete Permanently | Medium | Distinct sub-state |
| Featured image column | Medium | When post-type supports thumbnail |
| Comment count column | Medium | When post-type supports comments |
| Sticky indicator | Low | post-only |
| Hierarchical view (pages) | Medium | Tree display + reorder |
| Format column | Low | Theme-supported formats |
| Password indicator | Low | |
| Undo snackbar for trash | Medium | UX expectation in modern apps |
| Keyboard shortcuts | Medium | `/`, `n`, arrow nav |
| ARIA polish | High | Sort announcements, selection live region |
| Layout: grid | Medium | DataViews `grid` type configured but no card layout defined |
| Layout: list | Low | Compact alternative |
| Inline navigation to filtered views (click author, click term) | Low | |

### Acceptable interim
For v1 of any new workspace config, `iframe:edit.php?post_type={type}` is acceptable as an escape hatch. Mark such configs explicitly so they're tracked for replacement.

---

## 16. Out of scope

- **Press This** — deprecated, not rebuilt.
- **List vs. Excerpt view toggle** (core's "Screen Options") — superseded by DataViews layout switcher.
- **Per-user column visibility persistence to user meta** — v1 stores in localStorage; per-user persistence is a follow-up.
- **Post locking / "Currently editing"** indicator — defer to editor app; not surfaced in list for v1.

---

## 17. Reference

- Original PHP: `wp-admin/edit.php`
- List table: `wp-admin/includes/class-wp-posts-list-table.php`
- Quick Edit: `wp-admin/includes/class-wp-posts-list-table.php::inline_edit()`
- Bulk Edit handler (admin-ajax): `wp-admin/includes/ajax-actions.php::wp_ajax_inline_save()`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`
- REST schema: `https://developer.wordpress.org/rest-api/reference/posts/`
- Current workspace impl: `src/apps/posts/index.js`
- Workspace config example: `workspaces/content-author.json`

---

## Spec template usage

This document is the canonical structure for tier-2 specs. To create a spec for another screen:

1. Copy this file to `docs/screens/{slug}.md`.
2. Replace section content but keep section order and headings.
3. If a section doesn't apply (e.g. "Forms & inputs" for a pure read-only screen), keep the heading and write "N/A — read-only screen" so reviewers can see it was considered, not omitted.
4. Section 15 ("Gaps") is the actionable part — this becomes the rebuild ticket list.
5. Cross-link related screens in section 11 (Inter-app navigation).
