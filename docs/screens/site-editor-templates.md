# Screen Spec: Site Editor — Templates / Template Parts / Patterns / Navigation lists

**Status:** Tier 2 — full spec. Companion to [`site-editor.md`](./site-editor.md).
**Source PHP:** `wp-admin/site-editor.php` (entry); list views inside `@wordpress/edit-site` package.
**Current shell coverage:** Inherited from `core:site-editor` iframe adapter.

This file covers four **list-view sub-screens** of the Site Editor: Templates, Template Parts, Patterns (user + theme), and Navigation. Each list shares the same DataViews-style surface; differences are entity-driven. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `site-editor/templates`, `site-editor/template-parts`, `site-editor/patterns`, `site-editor/navigation` |
| Display name | "Templates" / "Template Parts" / "Patterns" / "Navigation" |
| Original URL | `/wp-admin/site-editor.php?p=/template`, `?p=/pattern` (parts + patterns share since 6.5), `?p=/navigation` |
| Menu location | Inside Site Editor hub |
| Submenu items | List view → edit single |
| Parent app | `core:site-editor` |

---

## 2. Purpose

Browse, search, filter, edit, duplicate, delete, and rename the four block-theme-managed entities. Provide a structured alternative to opening each item directly through the canvas. Surface theme-bundled vs user-customized via a "source" filter.

Jobs to be done:
- **Find a template** — Templates list → search "single" → click → edit.
- **Revert a customized template** — Templates list → row action "Reset" → confirm.
- **Add a new 404 template** — Templates list → "+ Add New" → choose 404 → start editing.
- **Group patterns** — Patterns list → assign category → done.
- **Convert a user pattern to a synced pattern** — Patterns list → edit → toggle "Synced".
- **Swap the active navigation menu** — Navigation list → choose another menu → assign to header part.
- **Find footer parts** — Template Parts list → filter by area: Footer.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View Templates | `edit_theme_options` | post type `wp_template` |
| View Template Parts | `edit_theme_options` | post type `wp_template_part` |
| View Patterns (user) | `edit_posts` | post type `wp_block` |
| View Patterns (theme, read-only) | none required to read | block patterns controller |
| View Navigation | `edit_theme_options` | post type `wp_navigation` (cap mapped to theme options) |
| Create | per-entity `create_posts` cap | post type registration |
| Edit | per-entity `edit_posts` cap | post type registration |
| Delete | per-entity `delete_posts` cap | post type registration |

**Permission-denied state:** mirror the parent Site Editor's behavior.

---

## 4. Data model

Each list is a thin wrapper around a REST collection.

### Templates
- **Type:** `wp_template`
- **REST endpoint:** `GET /wp/v2/templates`
- **Single record:** `GET /wp/v2/templates/{id}` where `{id}` is `theme//slug` (e.g. `twentytwentyfour//single`)

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | string | `{stylesheet}//{slug}` |
| `slug` | `slug` | string | template slug (`single`, `home`, `404`) |
| `theme` | `theme` | string | originating stylesheet |
| `type` | `type` | string | always `wp_template` |
| `source` | `source` | enum | `theme` / `custom` / `plugin` |
| `origin` | `origin` | enum | indicates origin theme |
| `title.rendered` / `title.raw` | `title.{r,raw}` | string | display |
| `description` | `description` | string | display |
| `status` | `status` | string | `publish` typically |
| `content.raw` / `content.block_version` | `content.{raw,bv}` | string/int | block markup |
| `has_theme_file` | `has_theme_file` | bool | true if backed by a theme file |
| `is_custom` | `is_custom` | bool | user-created |
| `author` | `author` | int | user-customized only |
| `modified` | `modified` | ISO 8601 | last edit |
| `area` | (template parts only) | string | `header` / `footer` / `uncategorized` |

### Default template types
Server provides `defaultTemplateTypes` (from `get_default_block_template_types()`):
- `index`, `home`, `front-page`, `single`, `singular`, `page`, `archive`, `author`, `category`, `tag`, `taxonomy`, `date`, `search`, `404`, `attachment`, `embed`, `single-{post_type}`, `single-{post_type}-{slug}`, `taxonomy-{tax}`, `taxonomy-{tax}-{term}`, `category-{slug}`, `tag-{slug}`, `author-{slug}`, `page-{slug}`, `page-{id}`

Each has `title` + `description`.

### Template Parts
- **Type:** `wp_template_part`
- **REST endpoint:** `GET /wp/v2/template-parts`

Same field set as templates plus:
| Field | REST path | Notes |
|---|---|---|
| `area` | `area` | `header` / `footer` / `uncategorized` (extensible via `default_template_part_areas` filter) |

### Patterns (user)
- **Type:** `wp_block`
- **REST endpoint:** `GET /wp/v2/blocks`

| Field | REST path | Notes |
|---|---|---|
| `id` | `id` | int |
| `slug` | `slug` | string |
| `title` | `title.{r,raw}` | display |
| `content` | `content.{raw,r}` | block markup |
| `status` | `status` | `publish` / `draft` / `private` |
| `wp_pattern_sync_status` | `wp_pattern_sync_status` | `''` (synced) or `'unsynced'` |
| `wp_pattern_category` | `wp_pattern_category[]` | term IDs in `wp_pattern_category` taxonomy |
| `meta` | `meta.*` | n/a typically |

### Patterns (theme, read-only)
- **REST endpoint:** `GET /wp/v2/block-patterns/patterns` and `GET /wp/v2/block-patterns/categories`

Returns theme-declared and core-shipped patterns. Distinct field shape:
| Field | Notes |
|---|---|
| `name` | unique pattern name |
| `title`, `description` | display |
| `content` | block markup |
| `categories[]` | category names |
| `viewportWidth` | for preview rendering |
| `blockTypes[]` | which blocks may insert this |
| `inserter` | bool — show in inserter |

### Navigation
- **Type:** `wp_navigation`
- **REST endpoint:** `GET /wp/v2/navigation`
- **Fallback:** `GET /wp-block-editor/v1/navigation-fallback`

| Field | REST path | Notes |
|---|---|---|
| `id` | `id` | int |
| `slug` | `slug` | string |
| `title` | `title.{r,raw}` | display |
| `content` | `content.{raw,r}` | nested `core/navigation-link` block markup |
| `status` | `status` | `publish` / `draft` |

### Pattern categories
- **REST endpoint:** `GET /wp/v2/block-patterns/categories` (theme + core)
- **User taxonomy:** `wp_pattern_category` (a custom taxonomy on `wp_block`); REST: `GET /wp/v2/wp_pattern_category` if registered (post-WP 6.5)

### Non-REST data (gaps)
- **Theme template availability map** — to render "+ Add New Template" picker, the SPA reads `defaultTemplateTypes` from preloaded settings. No REST equivalent; use the same server-injected array.
- **Slug uniqueness check** — server enforces during create; client-side check requires fetching all slugs.
- **Pattern category assignment** — done via `wp_pattern_category` taxonomy term assignments on the `wp_block` post.

---

## 5. Layout regions (semantic)

Each list shares the layout. Primary differences are columns and filters.

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Templates" / "Patterns" / etc.)                  │
│  └─ Primary action: "+ Add New ..."                          │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Layout switcher (table / grid)                           │
│  ├─ Search                                                   │
│  ├─ Per-list filters (see §8)                                │
│  └─ Sort                                                     │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW (when ≥1 row selected)                       │
│  └─ Bulk action select + apply                               │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION (table or grid)                                  │
│  └─ Item rows / cards                                        │
└─────────────────────────────────────────────────────────────┘
```

### Per-list columns (table layout)

**Templates:**
| Column | Field |
|---|---|
| Title | `title.rendered` |
| Description | `description` |
| Source | `source` (Theme / Custom / Plugin) |
| Author | `author` (only when source = Custom) |

**Template Parts:**
| Column | Field |
|---|---|
| Title | `title.rendered` |
| Area | `area` |
| Source | `source` |

**Patterns:**
| Column | Field |
|---|---|
| Title | `title.rendered` |
| Sync status | `wp_pattern_sync_status` (Synced / Not synced) |
| Category | `wp_pattern_category` (joined names) |
| Source | `theme` vs `custom` (computed) |

**Navigation:**
| Column | Field |
|---|---|
| Title | `title.rendered` |
| Status | `status` |
| Date | `modified` |

### Grid layout
All four lists support a thumbnail-style grid where each item renders a small block-preview iframe (uses `BlockEditorProvider` in read-only mode + `BlockPreview`).

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton rows / cards |
| Empty (Templates) | No customized + no theme file | "No templates" + "+ Add New" CTA |
| Empty (Patterns user) | No `wp_block` rows | "No patterns yet" + "+ Add New" |
| Empty filtered | Search yields nothing | "No matches" + "Clear filters" |
| Loading single (edit transition) | Click row | Inline spinner; navigate to canvas |
| Permission denied | 403 | Empty state with denial message |
| Theme-only filter active | "Source: Theme" | Read-only view; row actions limited |

---

## 7. Actions

### Header actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Add New Template | `edit_theme_options` | Mutation → Navigate | Modal: pick template type from `defaultTemplateTypes` |
| Add New Template Part | `edit_theme_options` | Mutation → Navigate | Modal: title + area picker |
| Add New Pattern | `edit_posts` | Mutation → Navigate | Modal: title + category + sync toggle |
| Add New Navigation | `edit_theme_options` | Mutation → Navigate | Creates an empty `wp_navigation` post |
| Manage all template parts (legacy) | n/a | Navigation | Returns to parts list |

### Per-row / per-card actions
**Templates:**
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_theme_options` | Navigation | Opens canvas |
| Rename | `edit_theme_options` | Inline edit | Custom only |
| Reset (revert to theme) | `delete_posts` | Mutation | Custom-overriding-theme only; `DELETE /wp/v2/templates/{id}` |
| Delete | `delete_posts` | Mutation | Custom-only (no theme file); permanent |
| Duplicate | `edit_theme_options` | Mutation | Copies as new custom |
| View | n/a | External | Opens template's URL preview |

**Template Parts:**
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_theme_options` | Navigation | |
| Rename | `edit_theme_options` | Inline edit | Custom only |
| Reset | `delete_posts` | Mutation | Custom-overriding-theme |
| Delete | `delete_posts` | Mutation | Custom only |
| Duplicate | `edit_theme_options` | Mutation | |

**Patterns:**
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_posts` | Navigation | User patterns only |
| Rename | `edit_posts` | Inline edit | |
| Duplicate | `edit_posts` | Mutation | |
| Move to trash | `delete_posts` | Mutation | User patterns; `status: 'trash'` |
| Delete permanently | `delete_posts` | Mutation | `?force=true` |
| Toggle sync status | `edit_posts` | Mutation | Update `wp_pattern_sync_status` |
| Assign to category | `edit_posts` | Mutation | `wp_pattern_category` taxonomy |
| Export as JSON | n/a | Download | Standard pattern export |
| Import JSON | `edit_posts` | Mutation | Create from upload |

**Navigation:**
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_theme_options` | Navigation | |
| Rename | `edit_theme_options` | Inline edit | |
| Duplicate | `edit_theme_options` | Mutation | |
| Delete | `delete_posts` | Mutation | Permanent |

### Bulk actions
Selection model: checkbox per row + "select all on page".

| Bulk action | Applies to | Behavior |
|---|---|---|
| Move to Trash | Patterns | `status: 'trash'` per selected |
| Delete Permanently | Patterns (Trash view), Custom Templates / Parts, Navigation | Hard delete |
| Reset (revert) | Custom Templates / Parts | DELETE per selected |
| Assign to category | Patterns | Multi-PUT |

### Optimistic vs. blocking
- **Single rename / sync toggle / category assign** — optimistic.
- **Reset / delete** — blocking with confirmation.
- **Bulk** — blocking with progress + per-item failure reporting.

---

## 8. Filters, sort, search, pagination

### Templates filters
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | title + slug | substring | client + server |
| Source | `source` | `is`, `isAny` | enum: `theme` / `custom` / `plugin` |
| Author | `author` | `is`, `isAny` | `GET /wp/v2/users` |

### Template Parts filters
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | title | substring | |
| Area | `area` | `is`, `isAny` | enum + theme-extended |
| Source | `source` | `is` | |

### Patterns filters
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | title + content | substring | |
| Sync status | `wp_pattern_sync_status` | `is` | enum: synced / unsynced |
| Category | `wp_pattern_category` | `isAny`, `isAll` | `GET /wp/v2/wp_pattern_category` |
| Source | computed | `is` | user / theme / core |

### Navigation filters
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | title | substring | |
| Status | `status` | `is`, `isAny` | enum |

### Sort
- Templates / Parts: `title` asc default.
- Patterns: `modified` desc default.
- Navigation: `modified` desc default.
- Sortable: title, modified, date (per entity).

### Search
Debounced 300ms; `?search=` for REST endpoints. Pattern theme list filters client-side (already loaded).

### Pagination
Default page size 30. URL param `?page=`.

---

## 9. Forms & inputs

### "Add New Template" modal
| Field | Type | Required | Notes |
|---|---|---|---|
| Template type | select | yes | from `defaultTemplateTypes` |
| Specific entity (when type is `single-{post_type}` etc.) | post / term picker | conditional | resolves slug |

### "Add New Template Part" modal
| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | |
| Area | select | yes | header / footer / uncategorized |

### "Add New Pattern" modal
| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | |
| Category | multi-select | no | from `wp_pattern_category` |
| Synced | bool | no | toggles `wp_pattern_sync_status` |

### "Add New Navigation" modal
| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | |
| Start from menu | optional | no | imports from a classic `nav_menu` term (one-time conversion) |

### Validation
Server-side validation per entity. Client-side validates required fields and slug syntax.

### Save semantics
- Add New: blocking; navigate to edit on success.
- Inline rename: optimistic.
- Bulk: blocking with per-item progress.

---

## 10. Routing & URL state

Original wp-admin URL params (post-6.8):
- `?p=/template` — templates list
- `?p=/wp_template/{id}` — edit template
- `?p=/pattern` — patterns + parts list (combined since 6.5)
- `?p=/wp_block/{id}` — edit user pattern
- `?p=/wp_template_part/{id}` — edit template part
- `?p=/navigation` — navigation list
- `?p=/wp_navigation/{id}` — edit navigation
- `?canvas=edit` — open in edit mode

Shell hash routing:
```
#/site-editor/templates
#/site-editor/templates/{id}
#/site-editor/templates/{id}?canvas=edit
#/site-editor/template-parts
#/site-editor/template-parts/{id}
#/site-editor/patterns
#/site-editor/patterns/{id}
#/site-editor/navigation
#/site-editor/navigation/{id}
```

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click row | parent canvas (edit mode) | entity ID |
| Click "Edit in Posts" (patterns) | `core:posts` | post ID |
| Click theme template author | `core:users` profile | user ID |

### Inbound
- From parent canvas "Browse all templates" → templates list.
- From command palette → specific list.
- From admin menu → list view default.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Template / part created | Snackbar: "{Type} created" + open in editor |
| Template reset | Snackbar: "Reverted to theme version" + Undo (sets dirty for save) |
| Template deleted | Snackbar: "Template deleted" |
| Pattern created | Snackbar: "Pattern created" |
| Pattern sync toggled | Snackbar: "Pattern is now synced/unsynced" + Undo |
| Bulk action completed | Snackbar: "{N} items {action}ed" with failure count if any |
| Permission error | Inline error per row + snackbar |
| Network error | Banner above list, persistent |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `n` | Add new |
| `↑` / `↓` | Move row focus |
| `Enter` | Open focused row |
| `Space` | Toggle selection |
| `Esc` | Clear selection / close modal |
| `Cmd/Ctrl+A` | Select all on page |

### ARIA & focus
- Table: `role="table"`; sort cells `aria-sort`.
- Grid: `role="list"`.
- Selection live region announces "Selected N items".
- Confirmation modals: `role="dialog"` + focus trap + return.
- After delete: focus next row.

---

## 14. Extension points

| Hook | Purpose | Recommendation |
|---|---|---|
| `default_template_types` | Template type registry | Preserve. |
| `default_template_part_areas` | Template part area registry | Preserve. |
| `register_block_pattern` / `register_block_pattern_category` | Theme/plugin patterns | Preserve. |
| `wp_pattern_category` taxonomy | User pattern grouping | Preserve. |

---

## 15. Mapping & implementation status

### Current shell coverage
- Inherited from `core:site-editor` iframe; no native shell surface.

### Gaps vs. this spec (paths to v2 native or shell surfaces)
| Gap | Priority | Notes |
|---|---|---|
| Native list views | Medium (v2) | Each could ship as a standalone shell app: `core:templates`, `core:template-parts`, `core:patterns`, `core:navigation`. Reuses DataViews. Doesn't require the canvas mount. |
| `core:patterns` standalone | High | Most-requested; pure REST, no editor canvas needed for the list. |
| `core:templates` standalone | Medium | List + reset action workable without canvas. |
| `core:navigation` standalone | Medium | List + rename + delete. Edit punts to canvas. |
| `core:template-parts` standalone | Low | Less common entry point. |
| Pattern import/export | Low | JSON file flow. |

The list-view surfaces are pure REST + DataViews. The canvas is the hard problem (see parent spec). Splitting them lets v1 ship list-only apps even while the canvas remains iframed.

---

## 16. Out of scope

- **Block-editor canvas itself** — covered by parent spec.
- **Pattern directory (.org browse)** — `block_directory` API; not surfaced in list views by core.
- **Reusable-block legacy migration** — `wp_block` post type pre-existed; pattern UI now subsumes it. Migration done in 6.3.
- **Per-template revisions** — templates have revisions; UI is in canvas, not list.

---

## 17. Reference

- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-templates-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-block-patterns-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-blocks-controller.php` (re-uses Posts controller for `wp_block`)
  - `wp-includes/rest-api/endpoints/class-wp-rest-navigation-fallback-controller.php`
- Post type registrations: `wp-includes/post.php` (`wp_template`, `wp_template_part`, `wp_block`, `wp_navigation`)
- Template utils: `wp-includes/block-template-utils.php` (`get_default_block_template_types()`, `get_allowed_block_template_part_areas()`)
- Templates registry: `wp-includes/class-wp-block-templates-registry.php`
- Companion: [`site-editor.md`](./site-editor.md), [`site-editor-styles.md`](./site-editor-styles.md)
- Cross-link: [`menus.md`](./menus.md) — classic-theme nav menus surface
