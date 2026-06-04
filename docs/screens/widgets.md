# Screen Spec: Widgets (block-based)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/widgets.php` → `wp-admin/widgets-form-blocks.php` (block-based, default since WP 5.8) or `wp-admin/widgets-form.php` (classic, when block widgets disabled)
**Current workspace coverage:** None. Reachable today only via `iframe:widgets.php`.

This spec describes the **semantic surface** of the block-based Widgets screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

**Scope:** the **block-based Widgets editor** introduced in WP 5.8 — the only path being rebuilt. The classic widgets form is deprecated for new development. Block themes typically don't use widgets at all (widget areas are template parts in the Site Editor); this screen is most relevant to classic themes that registered legacy `sidebar` widget areas.

**Block-theme deemphasis:** if `wp_use_widgets_block_editor()` returns `true` and the active theme registers no sidebars, the screen renders an empty state. The workspace should detect this and surface the screen only when sidebars are registered.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `widgets` |
| Display name | "Widgets" |
| Original URL | `/wp-admin/widgets.php` |
| Menu location | Submenu of Appearance |
| Submenu items | None — single screen |
| Parent app | Appearance group |
| Sub-screens | None |

The screen is gated on `current_theme_supports('widgets')`. Classic themes that register sidebars satisfy this; pure block themes typically don't.

---

## 2. Purpose

Edit the contents of theme-registered widget areas (sidebars). Each area is a block editor surface restricted to legacy widgets and a curated subset of blocks. Widgets render on the front-end wherever the theme calls `dynamic_sidebar()`.

Jobs to be done:
- **Add a recent posts widget to the footer sidebar** — Footer sidebar → "+" → search "Recent Posts" → insert.
- **Migrate a Text widget to a Paragraph block** — open existing Text widget → "Convert to blocks".
- **Reorder widgets in a sidebar** — drag block in list.
- **Remove a widget** — block toolbar → Remove.
- **Save all changes across sidebars** — single "Update" action.
- **Compare what's where** — sidebar headers list area name + description from `register_sidebar()`.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_theme_options` | `widgets.php` lines 15–21 |
| Edit widgets / sidebars | `edit_theme_options` | controllers below |
| Read widget types | `edit_theme_options` | `WP_REST_Widget_Types_Controller` |

**Permission-denied state:** core renders `wp_die()` 403. Mirror with empty state.

**Theme support gate:** `widgets.php` line 23 hard-fails if `current_theme_supports('widgets')` is false. Mirror by hiding/disabling the menu entry when unsupported.

**Multisite:** no special handling at the screen level.

---

## 4. Data model

### Primary entities
| Entity | REST endpoint | Notes |
|---|---|---|
| Sidebars (widget areas) | `GET /wp/v2/sidebars` | One row per registered sidebar. Read mostly; PUT updates `widgets[]` ordering. |
| Widgets (instances) | `GET /wp/v2/widgets` | One row per widget instance. CRUD. |
| Widget types | `GET /wp/v2/widget-types` | Read-only catalog of widget classes available to instantiate. |

### Fields used (sidebar)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | string | sidebar key from `register_sidebar()` |
| `name` | `name` | string | display name |
| `description` | `description` | string | display |
| `class` | `class` | string | wrapper class on front-end |
| `before_widget` / `after_widget` / `before_title` / `after_title` | strings | n/a (server uses) |
| `status` | `status` | enum | `active` / `inactive` |
| `widgets` | `widgets[]` | string[] | ordered widget IDs (e.g. `recent-posts-2`, `block-12`) |

### Fields used (widget instance)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | string | unique ID like `block-12` (block-based) or `recent-posts-2` (legacy) |
| `id_base` | `id_base` | string | widget class base ID (`recent-posts`, `block`) |
| `sidebar` | `sidebar` | string | which sidebar contains it |
| `rendered` | `rendered` | string | front-end HTML (read-only) |
| `rendered_form` | `rendered_form` | string | classic admin form HTML (legacy widgets only) |
| `instance.encoded` | `instance.encoded` | string | Base64-encoded instance settings (legacy widgets) |
| `instance.hash` | `instance.hash` | string | hash of instance for tampering protection |
| `instance.raw` | `instance.raw` | object | raw settings (block-based widgets only — block attrs JSON) |

### Fields used (widget type)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | string | matches `id_base` |
| `name` | `name` | string | display |
| `description` | `description` | string | display |
| `is_multi` | `is_multi` | bool | supports multiple instances per sidebar |
| `classname` | `classname` | string | CSS class |

### Encode / render endpoints
- `POST /wp/v2/widget-types/{id}/encode` — encodes form data into instance settings (legacy widget save flow).
- `POST /wp/v2/widget-types/{id}/render` — renders preview HTML for the form.

These are used by the Legacy Widget block to wrap classic widgets in the block editor.

### Block registration on this screen
The block editor here is restricted: only certain blocks plus a `core/legacy-widget` block (which can wrap any classic widget). Block schemas are bootstrapped server-side via `wp.blocks.unstable__bootstrapServerSideBlockDefinitions` (see `widgets-form-blocks.php` line 50).

### Non-REST data (gaps)
- **Block-Directory installs** — disabled on this screen by design (`widgets-form-blocks.php` line 36 removes the directory enqueue).
- **`accessibility mode`** — classic-only feature; not surfaced in block editor.
- **Sidebar registration** — themes/plugins call `register_sidebar()` in PHP. No REST endpoint to add new sidebars at runtime.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (toolbar-style)                                       │
│  ├─ Title ("Widgets")                                        │
│  ├─ "+" inserter button                                      │
│  ├─ List view toggle                                         │
│  ├─ Undo / Redo                                              │
│  └─ "Update" button                                          │
├─────────────────────────────────────────────────────────────┤
│ INSERTER PANEL (left, when toggled)                          │
│  ├─ Search                                                   │
│  ├─ Tabs: Blocks | Patterns | Reusable                       │
│  └─ Block / pattern / widget cards                           │
├─────────────────────────────────────────────────────────────┤
│ EDITOR (center)                                              │
│  └─ Stacked sidebar sections (one per registered sidebar)    │
│      Per-sidebar:                                            │
│      ├─ Header: name + description + collapse toggle         │
│      ├─ Block list (BlockEditorProvider scoped per sidebar)  │
│      └─ "+" between blocks for in-place insertion            │
├─────────────────────────────────────────────────────────────┤
│ INSPECTOR (right, when block selected)                       │
│  └─ Block-level settings (attributes)                        │
└─────────────────────────────────────────────────────────────┘
```

### Empty states
- **No sidebars registered:** "Your theme has no widget areas. Widgets cannot be configured."
- **No widgets in a sidebar:** placeholder block + "Click + to add a block."

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton sidebars |
| Empty (no sidebars) | `total === 0` on `/sidebars` | "Your theme has no widget areas." |
| Dirty | Any block change | "Update" enabled + per-sidebar dirty indicator |
| Saving | Update clicked | Button → "Saving…"; progress per sidebar |
| Save failure (partial) | Some sidebars failed | Per-sidebar error inline |
| Conflict | Server returned newer state | Modal: "Reload?" |
| Permission denied | 403 | Empty state |
| Block-Directory disabled notice | Hidden by design | n/a |
| Legacy widget loading | Form rendered for legacy widget | Inline loading inside block |
| Block invalid | Block validation fails | Recovery prompt: "Attempt block recovery" |

---

## 7. Actions

### Top-bar actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Insert block | `edit_theme_options` | Mutation (deferred) | Adds to current sidebar |
| Toggle list view | none | UI | Outline of all sidebars + blocks |
| Undo / Redo | `edit_theme_options` | Mutation (in store) | Block editor history |
| Update | `edit_theme_options` | Mutation (multi-entity) | Saves all dirty sidebars + widgets |

### Per-block (canvas) actions
| Action | Type |
|---|---|
| Move up/down | Mutation |
| Duplicate | Mutation |
| Remove | Mutation |
| Convert to blocks (Legacy Widget) | Mutation |
| Lock | Mutation (block attribute) |

### Per-sidebar actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Collapse / expand | none | UI | Visual only |
| Clear all widgets | `edit_theme_options` | Mutation | Deletes all widgets in sidebar |

### Bulk actions
N/A at this layer; the editor's Update is effectively a bulk operation across sidebars.

### Optimistic vs. blocking
- **Block edits (in canvas)** — optimistic until Update.
- **Update** — blocking. Multi-entity save with progress.

---

## 8. Filters, sort, search, pagination

### Inserter panel
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | block / widget name | substring | client-side |
| Tab | category | `is` | Blocks / Patterns / Reusable |

### Sidebars list
N/A — all registered sidebars are rendered. No filter.

### Sort
- Sidebars: order from `wp_get_sidebars_widgets()`; not configurable in the editor.
- Within a sidebar: drag-defined.

### Search
- Inserter: debounced client-side over preloaded widget-types + blocks.

### Pagination
- N/A — all data preloaded.

---

## 9. Forms & inputs

### Per-block attributes
Driven by each block's `block.json`. Common shapes:
- Text inputs, color pickers, number inputs, dropdowns.

### Legacy widget form
Rendered server-side via `POST /wp/v2/widget-types/{id}/render` and saved via `POST /wp/v2/widget-types/{id}/encode`. The workspace embeds the rendered HTML inside the Legacy Widget block.

### Sidebar-level "settings"
N/A — sidebars themselves have no editable settings on this screen (name/description come from `register_sidebar()`).

### Validation
- Block validation enforced by block.json schemas.
- Server validates `widgets[]` array on sidebar PUT.
- Save semantics: PUT each dirty sidebar with new `widgets[]`; POST/PUT each dirty widget.

### Save semantics
"Update" performs:
1. Diff dirty entities.
2. POST `/wp/v2/widgets` for each new widget.
3. PUT `/wp/v2/widgets/{id}` for each modified widget.
4. DELETE `/wp/v2/widgets/{id}?force=true` for each removed.
5. PUT `/wp/v2/sidebars/{id}` to persist `widgets[]` ordering.

Order matters — sidebar PUT must follow widget POSTs so referenced IDs exist.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/widgets.php` (no params; SPA owns state).

Workspace hash routing:
```
#/widgets                               # default landing (all sidebars)
#/widgets/{sidebar-id}                  # focus / scroll to sidebar
#/widgets/{sidebar-id}/{widget-id}      # focus a specific widget
```

Browser back/forward must restore selection. Refresh must restore unsaved state if possible (block editor persists draft state). Sharing URL must reproduce.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| "Manage with Live Preview" link | external (Customizer) | `?autofocus[panel]=widgets` — **skip per project rules** |
| "Switch to block editor" / "Disable block editor" (legacy theme prompts) | external | n/a |

### Inbound
- From admin menu Appearance → Widgets → screen.
- From command palette → screen.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Update success | Snackbar: "Widgets updated" |
| Update partial failure | Snackbar: "{N} sidebars updated, {M} failed" + retry button |
| Block invalid | Inline recovery prompt within block |
| Network error | Banner; preserve dirty state |
| Permission error | Banner |
| Sidebar cleared | Snackbar: "{Sidebar Name} cleared" + Undo |

Undo: per-edit Undo (Cmd+Z) within the block editor stack. Undo across save boundary not supported.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Cmd/Ctrl+S` | Update (save all) |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / Redo |
| `Cmd/Ctrl+Shift+Alt+T` / `Y` | Move block before / after (block editor standard) |
| `Esc` | Exit selection |
| `Cmd/Ctrl+Alt+H` | List view |

### ARIA & focus
- Sidebar headers: `<h2>` with `aria-controls` pointing to the block list.
- Inserter: `role="dialog"` with focus trap.
- After Update: focus returns to Update button; live region announces success.
- Block selection: announced.
- List view: `role="tree"` with proper levels.

### Screen reader
- Insertion announces "Inserted Recent Posts in Footer Sidebar".
- Save status announced.

---

## 14. Extension points

| Hook | Purpose | Recommendation |
|---|---|---|
| `register_sidebar()` (PHP function) | Theme/plugin registers a widget area | Preserve — server-side. |
| `register_widget()` (PHP function) | Register a legacy widget class | Preserve. |
| `register_block_type()` for widget-area-allowed blocks | Block widgets | Preserve. |
| `widget_block_edit_render` filter | Customize legacy widget render | Preserve. |
| `widget_types_to_hide_from_legacy_widget_block` | Hide legacy widgets in block UI | Preserve. |
| `enqueue_block_editor_assets` | Add scripts | Replace with workspace `core:widgets.assets` slot. |
| `sidebar_admin_setup` action | Pre-render hook | Drop — workspace owns chrome. |
| `widgets_admin_page` action | Render extras | Replace with `core:widgets.before` slot. |

Plugin compatibility note: legacy widget classes continue to work via the Legacy Widget block. Plugins that customized the classic admin form may need migration to block-based equivalents.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** none registered.
- **Workaround:** `iframe:widgets.php`. Works; block widgets editor inside iframe.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Register `core:widgets` app source | Low (block themes don't need this) | Iframe acceptable indefinitely for classic theme support |
| Native mount of `@wordpress/edit-widgets` | Medium (v2) | Same package-collision concerns as Site Editor |
| Sidebar list rendering | Medium | One stacked editor per sidebar |
| Inserter panel | Medium | Reuses block editor inserter |
| Update flow (multi-entity save) | Medium | PUT/POST/DELETE sequence |
| Legacy widget block embed | Medium | Forms rendered via REST encode/render endpoints |
| List view | Low | Inherits from block editor |
| Theme-without-widgets gating | Medium | Hide menu entry; display gracefully |
| Block Directory disable | Low | Server already disables; workspace needs to mirror |
| Keyboard shortcuts | Medium | Standard block editor set |
| ARIA polish | Medium | Sidebar landmarks |

### Acceptable interim
For v1 of any new workspace config, `iframe:widgets.php` is acceptable as an escape hatch. Most workspaces will not surface this — block themes don't use widgets, classic themes are explicitly out of scope for v1 polish.

---

## 16. Out of scope

- **Customizer "Manage with Live Preview"** — legacy/Customizer; deprecated per project rules.
- **Accessibility mode** — classic-form-only feature; the block editor has its own accessibility.
- **Classic widgets form (`widgets-form.php`)** — covered only in iframe; not natively rebuilt.
- **Block Directory installs from this screen** — explicitly disabled by core (line 36).
- **Sidebar registration UI** — `register_sidebar()` is server-side only.

---

## 17. Reference

- Original PHP entry: `wp-admin/widgets.php`
- Block-based form: `wp-admin/widgets-form-blocks.php`
- Classic form: `wp-admin/widgets-form.php` (out of scope)
- Helper: `wp-admin/includes/widgets.php`
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-widgets-controller.php` (namespace `wp/v2`, base `widgets`)
  - `wp-includes/rest-api/endpoints/class-wp-rest-sidebars-controller.php` (namespace `wp/v2`, base `sidebars`)
  - `wp-includes/rest-api/endpoints/class-wp-rest-widget-types-controller.php` (namespace `wp/v2`, base `widget-types`)
- Block editor settings: `get_legacy_widget_block_editor_settings()` in `wp-includes/blocks/widget-area.php`
- Cross-link: [`menus.md`](./menus.md) — peer "Appearance" classic surface
- Cross-link: [`site-editor-templates.md`](./site-editor-templates.md) — block-theme equivalent (template parts)
