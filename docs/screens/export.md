# Screen Spec: Export

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/export.php` + `wp-admin/includes/export.php` (the WXR generator)
**Current workspace coverage:** None. The bundled `wp-admin-default.json` baseline exposes the original via `iframe:export.php`.

This spec describes the **semantic surface** of the WordPress Export screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `export` |
| Display name | "Export" |
| Original URL | `/wp-admin/export.php` (download trigger: `/wp-admin/export.php?download=true&...`) |
| Menu location | Sub-item of "Tools" menu |
| Parent app | `tools` group |
| Sub-screens | Personal Data Export — see `personal-data.md` (separate flow, accessible from Tools menu directly, not nested here) |

The screen produces a single artifact: a **WXR (WordPress eXtended RSS)** XML file containing posts, pages, comments, custom fields, terms, navigation menus, and custom post types of the user's choice. The browser downloads the file directly from the same URL with `?download=true`.

---

## 2. Purpose

Generate a portable XML archive of selected site content for import into another WordPress install or for backup.

Jobs to be done:
- **Migrate content to a new site** — full export, import on the destination.
- **Back up a subset of posts** — export only by author, date range, or category.
- **Hand off to a developer** — export a clean copy for local development.
- **Archive media metadata** (URLs, not files) — export attachment records.
- **Move content per privacy law** — for a single user's data, see `personal-data.md` (different surface).

The export does **not** include uploaded media files themselves — only their metadata (URLs and attachment records). The destination site downloads media on import via the WordPress Importer plugin's "Download and import file attachments" toggle.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `export` | `export.php` line 12 |
| Download export | `export` (re-checked on download) | (same) |
| Export specific post type | `export` (no per-type cap split in core) | `export_wp()` |
| Export Personal Data | `export_others_personal_data` (separate screen) | see `personal-data.md` |

Default `export` cap is granted to administrators only. Editors and below cannot reach the screen.

**Permission-denied state:** core uses `wp_die( 'Sorry, you are not allowed to export the content of this site.' )`. Workspace renders 403 view.

**Multisite:** no special handling — runs per-site, exports current site's content only.

---

## 4. Data model

### Form input → export args

The export form is a single `<form method="get">` with a `download` flag. Submission is a same-page GET with these params:

| Field | Maps to `export_wp()` arg | Notes |
|---|---|---|
| `download=true` | (trigger) | Required to bake the file |
| `content` | `args['content']` | One of: `all`, `post` (selected via `posts`), `page` (selected via `pages`), `attachment`, or any custom post type slug with `can_export => true` |
| `cat` | `args['category']` | Posts only, single category id |
| `post_author` | `args['author']` | Posts only, single author id |
| `post_start_date` | `args['start_date']` | Posts only, YYYY-MM |
| `post_end_date` | `args['end_date']` | Posts only |
| `post_status` | `args['status']` | Posts only |
| `page_author` | `args['author']` | Pages only |
| `page_start_date` / `page_end_date` | `args['start_date']` / `args['end_date']` | Pages only |
| `page_status` | `args['status']` | Pages only |
| `attachment_start_date` / `attachment_end_date` | `args['start_date']` / `args['end_date']` | Attachments only |

Filter: `export_args` lets plugins mutate the args before generation.

### Lookups for form options

| Form field | REST source | Notes |
|---|---|---|
| Categories dropdown (posts) | `GET /wp/v2/categories?per_page=100&hide_empty=false` | Original PHP uses `wp_dropdown_categories()` directly |
| Authors dropdown (posts) | `GET /wp/v2/users?who=authors&has_published_posts=post&per_page=100` | Original uses raw `$wpdb` to find distinct `post_author` for that post type — best emulated with the `has_published_posts` users param |
| Authors dropdown (pages) | `GET /wp/v2/users?has_published_posts=page&per_page=100` | Same |
| Date dropdown options | Custom SQL in `export_date_options()` (distinct YEAR + MONTH) | **No REST equivalent.** Workaround: query `GET /wp/v2/posts?per_page=1&order=asc&_fields=date` and `&order=desc` for earliest and latest dates, then enumerate months in JS. Acceptable. |
| Post statuses | `GET /wp/v2/statuses` | Returns `internal: false` filtered list |
| Custom post types (`can_export: true`) | `GET /wp/v2/types` then filter | Need to check `_builtin: false` and a flag indicating exportability — REST does not expose `can_export`. **Gap.** Workaround: include all non-builtin types and let server-side filter at export time. |

### Output: WXR file

The download response is `Content-Type: text/xml; charset=UTF-8` with `Content-Disposition: attachment; filename={sitename}.WordPress.{date}.xml`. File contains:
- `<channel>` metadata (site title, link, description, language, version)
- `<wp:author>` per author
- `<wp:category>` per category
- `<wp:tag>` per tag
- `<wp:term>` per custom taxonomy term (including `nav_menu`)
- `<item>` per post: title, link, pubDate, dc:creator, content:encoded, excerpt:encoded, postmeta, comments, attachments

Generator: `export_wp()` in `wp-admin/includes/export.php`. Streams to STDOUT; large sites can produce multi-megabyte files. No size limit imposed.

### REST coverage

**No first-class REST endpoint for WXR generation.**
- The closest is `GET /wp-block-editor/v1/export` (template export for block themes) — completely different artifact (theme files, not content).
- Generation happens entirely server-side via `export_wp()`.

**Gap:** to rebuild natively, the workspace needs a custom REST endpoint (`POST /wp-admin-workspaces/v1/export`) that wraps `export_wp()` and streams the result. Alternatively, the existing PHP page can be invoked directly (form GET to `export.php?download=true`) — works fine even when the rest of admin is replaced.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Export")                                         │
├─────────────────────────────────────────────────────────────┤
│ INTRO PARAGRAPHS                                             │
│  ├─ "When you click the button below…"                       │
│  ├─ "This format, which is called WordPress eXtended RSS…"   │
│  └─ "Once you've saved the download file…"                   │
├─────────────────────────────────────────────────────────────┤
│ SECTION HEADING                                              │
│  └─ "Choose what to export"                                  │
├─────────────────────────────────────────────────────────────┤
│ FORM (single fieldset, radio-driven)                         │
│  ├─ ◉ All content (radio)                                    │
│  │   └─ Description: "all of your posts, pages, comments…"   │
│  ├─ ○ Posts (radio)                                          │
│  │   └─ Filters (slide-down when selected):                  │
│  │       ├─ Categories: dropdown                             │
│  │       ├─ Authors: dropdown                                │
│  │       ├─ Date range: start + end month dropdowns          │
│  │       └─ Status: dropdown                                 │
│  ├─ ○ Pages (radio)                                          │
│  │   └─ Filters: Authors, Date range, Status                 │
│  ├─ ○ {Custom Post Type X} (radio, repeated for each CPT)    │
│  │   └─ No filters in core form                              │
│  └─ ○ Media (radio)                                          │
│      └─ Filters: Date range only                             │
├─────────────────────────────────────────────────────────────┤
│ SUBMIT                                                       │
│  └─ "Download Export File" button                            │
└─────────────────────────────────────────────────────────────┘
```

The radio-driven slide-down filter UX (jQuery `slideUp` / `slideDown`) is dated. Rebuild can replace with a simpler "show the active type's filter group only" pattern.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading lookups | First mount | Skeleton on dropdowns |
| Default | Loaded | Form with "All content" selected |
| Filter group active | User selects "Posts" / "Pages" / "Media" | That group's filter sub-form expands; others collapse |
| Submitted (downloading) | User clicks button | Browser triggers file download; form remains mounted |
| Empty post type | CPT with no posts | Date dropdown becomes "no items" / disabled |
| Empty author list | Post type has no posts | Author dropdown shows only "All" |
| Permission denied | User lacks `export` | 403 view |

Notably: there is **no** "preview" or "estimated file size" state. Download starts immediately on submit.

---

## 7. Actions

### Primary action
- **Download Export File** — submits form, triggers WXR generation and download. Cap: `export`. No confirmation dialog (download is non-destructive).

### Filter inputs (no separate save action)
All filter changes are local state until submit. No autosave, no preview.

### Optimistic vs. blocking
- **Generation** is server-side blocking. For very large sites, can take 10s+ before download starts. No progress indicator in core. Rebuild should add a loading state on the submit button ("Generating…") and clear it when the download header arrives.

---

## 8. Filters, sort, search, pagination

N/A — the screen has no list to filter/sort/search. Form filters are inputs, not list filters.

The export itself has filters (category, author, date range, status), but they apply to the export query, not to a visible list on this screen.

---

## 9. Forms & inputs

### Form fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | radio | yes | Default: `all`. Value set: `all`, `posts`, `pages`, `attachment`, plus any registered CPT slug |
| `cat` (posts only) | select | no | Default: 0 (all). Hierarchical; uses `wp_dropdown_categories` |
| `post_author` (posts only) | select | no | Default: 0. Lists distinct authors who have posted in this type |
| `post_start_date`, `post_end_date` (posts only) | select | no | Default: 0. Format: `YYYY-MM` |
| `post_status` (posts only) | select | no | Default: 0 (all). Filtered to `internal: false` |
| `page_author`, `page_start_date`, `page_end_date`, `page_status` (pages only) | select | no | Same shapes |
| `attachment_start_date`, `attachment_end_date` (media only) | select | no | Same shape |
| `download` | hidden | yes | Always `true`; the trigger flag |

Multiple authors selection: original form allows `multi: true` on `wp_dropdown_users`, but the URL handling parses `(int) $_GET['post_author']` (single id only) — so the `multi` is presentational and only the last selected author matters. Rebuild should pick: drop multi-select, or fix server side. **Gap.**

Validation: server-side. Empty filters are interpreted as "no constraint" (all of that dimension).

---

## 10. Routing & URL state

Original URL pattern:
- `/wp-admin/export.php` — form view.
- `/wp-admin/export.php?download=true&content=posts&cat=5&post_author=2&post_start_date=2026-01&post_end_date=2026-04&post_status=publish` — download.

Refresh and back-button do not preserve form state in core (`<form method="get">` GET-encodes everything but the form starts blank on each page load). Rebuild can preserve form state via workspace route state.

Recommended workspace URL:
- `#/export` — form view.
- Submit downloads via `apiFetch` POST to a custom workspace endpoint, or by triggering a same-tab `window.location.assign('export.php?download=true&...')` for the legacy path.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| (None — screen is a leaf) | — | — |

### Inbound

- Tools menu → Export.
- Cross-link from `import.md` (the inverse operation).
- Cross-link from `personal-data.md` (different export surface — for a single user's data, not site-wide).

After download, no auto-navigation. User stays on form.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Download triggered | (None in core.) Browser shows native download progress. |
| Generation error (rare) | (Not surfaced in core.) Server returns blank or errors mid-stream — corrupted XML. |
| Empty result | WXR is still generated with empty channel; browser still downloads. |

Rebuild should add:
- Submit button loading state ("Generating…") while waiting for first response byte.
- Error toast if `apiFetch`-based variant errors (custom REST endpoint).
- Optional success toast after download completes (rough — no completion event from browser native download).

---

## 13. Accessibility & keyboard

### Keyboard
- `Tab` moves between radios → dropdowns → submit.
- Arrow keys move within radio group (default browser).
- `Enter` on submit triggers download.

### ARIA & focus
- Radio group: `<fieldset>` + `<legend class="screen-reader-text">Content to export</legend>`.
- Each radio has `aria-describedby` pointing at its description paragraph (e.g. `aria-describedby="all-content-desc"`).
- Filter sub-fieldsets each have `<legend class="screen-reader-text">` describing what the group is (e.g. "Date range:").
- Date dropdown fieldsets have nested `<legend>` ("Date range:").
- After radio change, focus stays on radio — sub-form expands without taking focus.
- Submit button outside fieldset, focusable as last form element.

### Screen reader
- Each radio's description is read after its label.
- Filter dropdowns have explicit `<label>` elements.

### Note on jQuery slide
The original uses `slideUp/slideDown` (300ms). For users with `prefers-reduced-motion`, this should be skipped. Rebuild should respect that media query.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `export_args` (filter) | Modify export args before generation | **Preserve** at PHP layer |
| `export_filters` (action, fires at end of form) | Add custom filter UI panels | Replace with workspace slot `core:export.filters` |
| `register_post_type( …, can_export => true )` | Make a CPT exportable | **Preserve** — this is the canonical extensibility |
| `export_wxr_skip_postmeta` (filter) | Exclude postmeta keys | Preserve at PHP layer |
| `wxr_export_skip_commentmeta` | Exclude commentmeta | Preserve |

Plugin compatibility note: WooCommerce, BuddyPress, and other plugins extend export via `register_post_type` flags + `export_filters` action. Both surfaces should be supported. The `export_filters` slot will receive a tiny number of plugin-rendered fieldsets in practice.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** none.
- **What works:** `iframe:export.php` works as an `iframe:` escape hatch (e.g. in the `wp-admin-default` baseline).

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:export` AppSource | Medium | Form is simple; lookups all REST-able with workarounds |
| Date-range dropdown options endpoint | High | No REST equivalent for `export_date_options()`'s YEAR+MONTH distinct query. Either: (a) compute client-side from earliest/latest post dates per type, (b) add a custom REST endpoint |
| `can_export` flag in `/wp/v2/types` | Medium | Currently not exposed; rebuild must filter all CPTs and rely on server-side enforcement |
| Custom REST endpoint for export generation | Medium | `POST /wp-admin-workspaces/v1/export` would let the rebuild stream the WXR through `apiFetch` and surface a real loading state |
| Submit-button loading state | Low | Trivial UX win once REST endpoint exists |
| Author multi-select handling | Low | Original form's `multi: true` is broken (single int parsed). Rebuild should drop multi-select |
| Slot for `export_filters` | Medium | Plugin compat |
| Per-status check for non-empty types | Low | Show "no items in this date range" state |

### Acceptable interim
`iframe:export.php` is the v1 implementation. Form is small enough that a native rebuild is straightforward but low-priority — exports are infrequent (monthly or less for most sites).

For workspaces targeting power users, a **Quick Export** command in the command palette (`Cmd+K → "Export all content"`) that triggers `export.php?download=true&content=all` is a valuable lightweight addition — no UI rebuild needed.

---

## 16. Out of scope

- **Personal Data Export** (per-user GDPR/CCPA exports) — see `personal-data.md`.
- **Theme export** (block-theme → ZIP) — different surface, `wp-block-editor/v1/export`.
- **Backup files** (full DB + uploads ZIP) — not in core; plugin territory (UpdraftPlus, BackupBuddy).
- **Scheduled / recurring exports** — not in core.
- **Cloud-destination exports** (S3, Dropbox) — not in core.
- **Per-format exports** (CSV, JSON, Markdown) — not in core; WXR is the only first-party format.
- **Author-anonymization in export** — not in core.

---

## 17. Reference

- Original PHP: `wp-admin/export.php`
- WXR generator: `wp-admin/includes/export.php` (`export_wp()`)
- WP-CLI alternative: `wp export --post_type=post --start_date=2026-01-01 --end_date=2026-04-30 --filename_format='{site}.{date}.wxr'`
- WordPress Importer plugin (consumes WXR): `https://wordpress.org/plugins/wordpress-importer/`
- REST controllers used for form lookups:
  - `wp-includes/rest-api/endpoints/class-wp-rest-categories-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-post-statuses-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-post-types-controller.php`
- Help docs: `https://wordpress.org/documentation/article/tools-export-screen/`
- Cross-link: `import.md` (the inverse operation)
- Cross-link: `personal-data.md` (per-user export, distinct surface)
