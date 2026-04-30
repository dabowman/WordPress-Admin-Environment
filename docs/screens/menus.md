# Screen Spec: Menus (classic nav menus)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/nav-menus.php` + `wp-admin/includes/nav-menu.php`
**Current shell coverage:** None. Reachable today only via `iframe:nav-menus.php`.

This spec describes the **semantic surface** of the classic Menus screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

**Scope:** classic navigation menus only — the legacy `nav_menu` taxonomy and `nav_menu_item` post type. Block themes use the **Navigation block** (`wp_navigation` post type) inside the Site Editor instead. Cross-link: [`site-editor-templates.md`](./site-editor-templates.md) for the block-theme equivalent.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `menus` |
| Display name | "Menus" |
| Original URL | `/wp-admin/nav-menus.php` |
| Menu location | Submenu of Appearance |
| Submenu items | Edit Menus (default tab) / Manage Locations (tab when locations registered) |
| Parent app | Appearance group |
| Sub-screens | Per-menu edit (default), Manage Locations tab |

The screen is gated on theme support: `current_theme_supports('menus') || current_theme_supports('widgets')`. Themes that declare neither show "Your theme does not support navigation menus or widgets."

---

## 2. Purpose

Compose, edit, and assign classic nav menus. Each menu is a `nav_menu` term holding an ordered, optionally-nested list of `nav_menu_item` entries. Menus are bound to **theme-registered locations** — most classic themes register a "Primary" location, sometimes "Footer" or "Social". Block themes typically don't register locations (the Navigation block subsumes the concept) but the screen still renders if the user explicitly visits it.

Jobs to be done:
- **Add a Pages link to my main menu** — Pages panel → check pages → "Add to Menu" → drag to position → Save.
- **Reorder a menu** — drag-rearrange in the structure pane → Save.
- **Nest sub-items** — drag horizontally to indent → Save.
- **Add a custom external link** — Custom Links panel → URL + label → "Add to Menu".
- **Remove an item** — expand item → Remove.
- **Assign a menu to the Primary location** — toggle location checkbox in menu settings → Save. Or use Manage Locations tab.
- **Create a new menu** — "create a new menu" link → enter name → Save.
- **Delete a menu** — Delete Menu link in settings → confirm.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_theme_options` | `nav-menus.php` lines 22–29 |
| Create / update / delete menu | `edit_theme_options` | same |
| Assign menu to location | `edit_theme_options` | `set_theme_mod('nav_menu_locations', …)` |
| Manage Locations tab | `edit_theme_options` | `nav-menus.php` line 518 |

**Permission-denied state:** core renders `wp_die()` 403. Mirror with empty state.

**Multisite:** no special handling at the screen level.

**Theme support gate:** detect `current_theme_supports('menus')` (PHP) or absence of registered locations and degrade gracefully — render the screen with a warning that no locations are registered, but still allow menu editing.

---

## 4. Data model

### Primary entity: nav menu (taxonomy term)
- **Type:** `nav_menu` taxonomy
- **REST endpoint:** `GET /wp/v2/menus`
- **Single record:** `GET /wp/v2/menus/{id}`
- **Mutation:** `POST /wp/v2/menus`, `PUT /wp/v2/menus/{id}`, `DELETE /wp/v2/menus/{id}?force=true`

### Fields used (menu term, `?context=edit`)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | term ID |
| `name` | `name` | string | display name (also the input "Menu Name") |
| `slug` | `slug` | string | derived from name |
| `description` | `description` | string | optional |
| `locations` | `locations[]` | string[] | array of location keys this menu is assigned to (registered theme locations) |
| `auto_add` | `auto_add` | bool | "Automatically add new top-level pages to this menu" |
| `meta` | `meta.*` | object | n/a typically |

### Secondary entity: menu item
- **Type:** `nav_menu_item` post type
- **REST endpoint:** `GET /wp/v2/menu-items`
- **Single record:** `GET /wp/v2/menu-items/{id}`
- **Mutation:** `POST /wp/v2/menu-items`, `PUT /wp/v2/menu-items/{id}`, `DELETE /wp/v2/menu-items/{id}?force=true`

### Fields used (menu item)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | post ID |
| `title.raw` / `title.rendered` | `title.{r,raw}` | string | label |
| `url` | `url` | string | link target |
| `status` | `status` | string | `publish` |
| `attr_title` | `attr_title` | string | `title=` attribute |
| `description` | `description` | string | optional |
| `type` | `type` | enum | `taxonomy` / `post_type` / `post_type_archive` / `custom` |
| `type_label` | `type_label` | string | display ("Page", "Category", "Custom Link") |
| `object` | `object` | string | post type or taxonomy slug; `custom` for free-form links |
| `object_id` | `object_id` | int | linked entity ID |
| `parent` | `parent` | int | nesting via parent menu item ID (0 = root) |
| `menu_order` | `menu_order` | int | ordering within siblings |
| `target` | `target` | enum | `_blank` or empty |
| `classes` | `classes[]` | string[] | CSS classes to attach |
| `xfn` | `xfn` | string | space-separated rel attribute values |
| `menus` | `menus` | int | the parent `nav_menu` term ID |
| `meta` | `meta.*` | object | extensible |

### Tertiary entity: menu location
- **REST endpoint:** `GET /wp/v2/menu-locations`
- **Single record:** `GET /wp/v2/menu-locations/{location}`

### Fields used (location)
| Field | Notes |
|---|---|
| `name` | location key ("primary", "footer") |
| `description` | display name (`get_registered_nav_menus()`) |
| `menu` | currently-assigned menu ID, 0 if none |

Locations are registered by themes via `register_nav_menus()`. The endpoint lists what the active theme declared.

### Item-adder data sources
The left panels need lists of candidates:
| Panel | REST endpoint | Notes |
|---|---|---|
| Pages | `GET /wp/v2/pages?per_page=100&status=publish&_fields=id,title,link` | "Most Recent" / "View All" / "Search" sub-tabs |
| Posts | `GET /wp/v2/posts?per_page=100&status=publish&_fields=id,title,link` | same sub-tabs |
| Custom Links | none | client-only; user types URL + label |
| Categories | `GET /wp/v2/categories?per_page=100&_fields=id,name,link` | |
| Tags | `GET /wp/v2/tags?per_page=100&_fields=id,name,link` | |
| Plugin-registered | varies | core extensibility via `wp_nav_menu_item_taxonomy_meta_box` etc. |

### Non-REST data (gaps)
- **Bulk reorder** — REST has no "reorder" endpoint. Each item must PUT individually with new `menu_order` and/or `parent`. Acceptable but slow for large menus.
- **Drag-drop nesting** — same as above; PUT per moved item.
- **Item type metadata for the adder panels** — registered post types and taxonomies needs filtering to those marked `show_in_nav_menus`. Reads from `GET /wp/v2/types` and `GET /wp/v2/taxonomies` but with an additional client-side filter.

---

## 5. Layout regions (semantic)

### Edit Menus tab (default)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Menus")                                          │
│  └─ Tabs: "Edit Menus" | "Manage Locations" (if any reg.)    │
├─────────────────────────────────────────────────────────────┤
│ MENU SELECTOR ROW                                            │
│  ├─ "Select a menu to edit:" select + "Select" button        │
│  └─ "or create a new menu" link                              │
├─────────────────────────────────────────────────────────────┤
│ TWO-PANE EDITOR                                              │
│  ┌─────────────┬───────────────────────────────────────────┐ │
│  │ LEFT (item  │ RIGHT (menu structure)                    │ │
│  │  adders)    │  ├─ "Menu Name" input                     │ │
│  │ ├─ Pages    │  ├─ Empty state ("Add menu items…")       │ │
│  │ ├─ Posts    │  └─ Sortable, nestable item list          │ │
│  │ ├─ Custom   │      └─ Per-item:                         │ │
│  │ │   Links   │          - Title input                    │ │
│  │ ├─ Categories│         - Type label                     │ │
│  │ ├─ Tags     │          - Expander → settings (URL,      │ │
│  │ │           │            attr-title, target, classes,   │ │
│  │ │           │            rel, description, parent ref,  │ │
│  │ │           │            "Move up/down/left/right",     │ │
│  │ │           │            "Remove")                      │ │
│  └─────────────┴───────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ MENU SETTINGS                                                │
│  ├─ Auto-add pages (checkbox)                                │
│  ├─ Display location checkboxes (per registered location)    │
│  └─ Footer actions: Delete Menu / Save Menu                  │
└─────────────────────────────────────────────────────────────┘
```

### Manage Locations tab
```
┌─────────────────────────────────────────────────────────────┐
│ TABLE                                                        │
│  ├─ Column: Theme Location (name + description)              │
│  └─ Column: Assigned Menu (select dropdown of all menus,     │
│             plus "Edit" / "Use new menu" inline links)       │
├─────────────────────────────────────────────────────────────┤
│ FOOTER ACTION                                                │
│  └─ "Save Changes"                                           │
└─────────────────────────────────────────────────────────────┘
```

### Empty states
- **No menus exist:** show creation flow inline ("Create your first menu below").
- **No items in selected menu:** "Add menu items from the column on the left."
- **No locations registered:** Manage Locations tab hidden.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton structure pane |
| Empty (no menus) | `total === 0` on `/menus` | Inline create form |
| Empty (selected menu has no items) | `menu.items === 0` | "Add items from the left" |
| Dirty | Item added / moved / edited | "Save Menu" enabled + unsaved-changes badge |
| Saving | Save clicked | Button → "Saving…"; disable structure |
| Save failure | Server error | Inline error banner above structure |
| Conflict | Concurrent edit (rare) | Modal: "This menu was modified elsewhere. Reload?" |
| Delete confirmation | Delete clicked | Modal: "Delete {name}? Removes N items." |
| Locations changed unsaved | Toggle a location | Indicator on Settings panel |
| Theme without locations | `num_locations === 0` | Settings panel shows "Your theme has no menu locations." |
| Permission denied | 403 | Empty state |

---

## 7. Actions

### Top-bar actions
- **Switch tab** — Edit Menus ↔ Manage Locations.
- **Select menu to edit** — switches the structure pane.
- **Create new menu** — switches structure pane to creation mode.

### Menu-level actions (footer)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Save Menu | `edit_theme_options` | Mutation | Persists name + items + locations + auto_add |
| Delete Menu | `edit_theme_options` | Mutation | Confirm modal; also unassigns from any locations |

### Per-item actions (in structure)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit settings (expand) | none | UI | Reveals per-item form |
| Drag to reorder | `edit_theme_options` | Mutation (on save) | Sortable + nestable |
| Move Up / Down / Left / Right | `edit_theme_options` | Mutation | Keyboard-accessible alternative to drag |
| Remove | `edit_theme_options` | Mutation (on save) | Marks for deletion; cascades on save |
| Cancel | none | UI | Collapse settings without applying |

### Add-item actions (left panels)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Search panel content | none | Filter | |
| Toggle items via checkbox | none | Selection | |
| "Add to Menu" button | `edit_theme_options` | Mutation (deferred) | Adds selected items to structure (not persisted until Save) |
| "Select All" | none | Selection | |
| Pagination / load more | none | Filter | for Pages / Posts panels |

### Manage Locations tab actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Change menu assignment | `edit_theme_options` | Selection | Per-row select |
| Save Changes | `edit_theme_options` | Mutation | Bulk PUT to `theme_mod nav_menu_locations` |

### Bulk actions
N/A — core does not surface bulk multi-menu operations.

### Optimistic vs. blocking
- **Item add / reorder / remove (pre-save)** — optimistic (local).
- **Save Menu** — blocking. Multi-PUT/POST operation; show progress.
- **Delete Menu** — blocking with confirmation.
- **Location assign** — optimistic.

---

## 8. Filters, sort, search, pagination

### Item-adder panels
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search (Pages / Posts / Categories / Tags) | name / title | substring | per-endpoint `?search=` |
| Sub-tab (Pages / Posts) | n/a | mode | "Most Recent" (date desc), "View All" (id asc), "Search" (search mode) |
| Pagination | `?page` | per panel | 50 per page typical |

### Structure pane
No filters in the structure pane — full menu rendered.

### Sort
- Adder panels: per sub-tab (most recent / all / search relevance).
- Structure pane: drag-defined order via `menu_order` + `parent`.

### Search
- Adder panels: debounced 300ms; `?search=` for the relevant endpoint.

### Pagination
- Adder panels: paginated.
- Structure pane: not paginated; menus are bounded in size by practical UX.

---

## 9. Forms & inputs

### Menu name
| Field | Type | Required | Notes |
|---|---|---|---|
| Menu Name | text | yes | Top of structure pane |

### Per-item settings (expanded form)
| Field | Type | Required | Notes |
|---|---|---|---|
| Navigation Label | text | yes | Display text |
| URL | text | conditional | Only for `custom` type; otherwise auto-derived from `object_id`/`object` |
| Title Attribute | text | no | `attr_title` |
| Open link in new tab | checkbox | no | maps to `target=_blank` |
| CSS Classes | text | no | space-separated `classes[]` |
| Link Relationship (XFN) | text | no | space-separated `xfn` |
| Description | textarea | no | |
| Move action group | buttons | no | Up / Down / Left / Right |
| Remove | button | no | Marks for deletion |
| Cancel | button | no | Collapse without applying |
| Original / Parent | label | no | Read-only — shows source object name |

### Menu Settings
| Field | Type | Notes |
|---|---|---|
| Auto-add pages | checkbox | `auto_add` |
| Display location | checkbox per registered location | toggles `locations[]` |

### Add Custom Link panel
| Field | Type | Required | Notes |
|---|---|---|---|
| URL | text | yes | Defaults to `https://` |
| Link Text | text | yes | |

### Validation
- Menu name: required, 1+ chars.
- URL (custom links): `wp_http_validate_url()` server-side.
- Per-item title: required.
- Server validates capability + nonce on each mutation.

### Save semantics
- "Save Menu" performs:
  1. PUT `/wp/v2/menus/{id}` for menu-level fields (name, locations, auto_add).
  2. POST `/wp/v2/menu-items` for new items.
  3. PUT `/wp/v2/menu-items/{id}` for each modified item (parent, menu_order, settings).
  4. DELETE `/wp/v2/menu-items/{id}?force=true` for each removed item.
- Atomicity: best-effort; partial failure leaves partial state. Show per-step errors.

---

## 10. Routing & URL state

Original wp-admin URL params:
- `nav-menus.php` — default landing (most recently edited menu)
- `nav-menus.php?menu={id}` — specific menu
- `nav-menus.php?action=edit&menu={id}` — explicit edit mode
- `nav-menus.php?action=locations` — Manage Locations tab
- `nav-menus.php?action=delete&menu={id}` — delete (POST)

Shell hash routing:
```
#/menus                        # default (most recent menu)
#/menus/{id}                   # edit menu
#/menus/locations              # Manage Locations tab
#/menus/new                    # creation mode
```

Browser back/forward must restore selection. Refresh must restore. Sharing URL must reproduce.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click "Edit" on a Page in the Pages adder | `core:posts` | postType=page, id |
| Click "View" on a saved menu item | external | item URL |
| Theme-options screen link | `core:site-editor` (block themes) or `core:appearance` (classic) | none |

### Inbound
- From admin menu Appearance → Menus → menus screen.
- From Customizer (legacy) "Edit Menus" link → menus screen.
- From command palette → menus screen, optionally with menu ID.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Menu saved | Snackbar: "{Menu Name} saved" |
| Menu created | Snackbar: "Menu created" |
| Menu deleted | Snackbar: "Menu deleted" |
| Item added | Inline confirmation in structure pane (item highlights briefly) |
| Item removed | No snackbar; row crosses out until Save |
| Save failure (per-item) | Inline error per item in structure |
| Network error | Banner above editor; preserve dirty state |
| Permission error | Inline + sticky banner |
| Conflict | Modal: "Reload" / "Cancel" |

Undo: not supported by core; structure pane has no Undo stack. Adding an Undo for last-add / last-remove would be a shell-level enhancement.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| Move Up / Down / Left / Right | Per-item buttons (not just drag) — re-order via keyboard |
| `Esc` | Cancel item edit |
| `Tab` / `Shift+Tab` | Move focus through items |
| `Enter` (on item) | Toggle expand/collapse |

### ARIA & focus
- Structure list: `role="list"`; items `role="listitem"` with `aria-level` reflecting nesting.
- Drag handles: `role="button"` with `aria-grabbed` (deprecated but still announced) — use Move buttons as authoritative keyboard path.
- Per-item form: `role="region"` with `aria-labelledby` on the title.
- After Save: focus returns to Save button; live region announces success.
- Adder panels: `role="tablist"` for the panel sections.

### Screen reader
- Drag operations announce position changes via live region ("Moved 'About' under 'Pages', position 2").
- Expand/collapse announced.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_nav_menu_meta_boxes_to_remove` | Hide adder panels | Replace with shell `core:menus.adders` slot. |
| `wp_nav_menu_item_post_type_meta_box` / `…taxonomy_meta_box` | Custom adder panels | Replace with shell adder-panel registry. |
| `wp_setup_nav_menu_item` filter | Modify item attributes | Preserve — runs on read regardless of UI. |
| `nav_menu_item_args` | Modify per-item display args | Preserve. |
| `nav_menu_meta_box_object` | Filter post types/taxonomies in adders | Replace with shell registry filter. |
| `wp_edit_nav_menu_walker` | Customize structure-pane walker | Drop — shell owns the structure pane. |

Plugin compatibility note: many third-party menu plugins extend the adder panels via the meta-box hooks. Migration path: shell exposes an adder-panel registry plugins call instead.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** none registered.
- **Workaround:** `iframe:nav-menus.php`. Works; classic UI inside iframe.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Register `core:menus` app source | Medium | New app on top of `/wp/v2/menus` + `/wp/v2/menu-items` |
| Block-theme deemphasis | High | Most users on block themes don't need this; surface only when locations registered |
| Two-pane structure editor | High | Drag-and-drop + nesting is non-trivial |
| Adder panels (Pages / Posts / Custom Links / Categories / Tags) | High | Multi-source REST aggregation |
| Per-item settings expansion | High | Inline form |
| Save Menu (multi-step orchestration) | High | Sequence of PUT/POST/DELETE with progress |
| Manage Locations tab | High | Separate sub-screen |
| Auto-add pages toggle | Medium | Post-create action |
| Theme-options-aware location list | High | Reads `/wp/v2/menu-locations` |
| Keyboard reorder buttons | High | Move Up/Down/Left/Right |
| Drag-and-drop reorder | Medium | Library-level decision (HTML5 DnD is acceptable) |
| Pagination in adder panels | Medium | "View All" mode |
| Search in adder panels | High | Per-panel search |
| Multilingual / language-pack support | Low | Inherits via theme-mod scope |
| Plugin extensibility (slots) | Low | Adder-panel registry |
| Empty-state guidance | Medium | First-run onboarding |
| Live preview of menu | Out of scope | Customizer-only feature |

### Acceptable interim
For v1 of any new shell config, `iframe:nav-menus.php` is acceptable as an escape hatch. Block themes typically don't need this surface — prefer pointing users to `core:site-editor` Navigation list (cross-link).

---

## 16. Out of scope

- **Live preview in Customizer** — legacy Customizer only; deprecated per project rules.
- **Block-theme nav** — covered by `core:site-editor` and the Navigation list (`wp_navigation` post type) — see [`site-editor-templates.md`](./site-editor-templates.md).
- **Mega-menu plugins' own UIs** — third-party; out of scope for core spec.
- **Multilingual menu duplication** — plugin territory (WPML, Polylang).

---

## 17. Reference

- Original PHP: `wp-admin/nav-menus.php`
- Helper functions: `wp-admin/includes/nav-menu.php`
- Walker: `wp-admin/includes/class-walker-nav-menu-edit.php`
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-menus-controller.php` (extends taxonomies controller; namespace `wp/v2`, base `menus`)
  - `wp-includes/rest-api/endpoints/class-wp-rest-menu-items-controller.php` (extends posts controller; namespace `wp/v2`, base `menu-items`)
  - `wp-includes/rest-api/endpoints/class-wp-rest-menu-locations-controller.php` (namespace `wp/v2`, base `menu-locations`)
- Taxonomy / post type registrations: `wp-includes/nav-menu.php`
- Cross-link: [`site-editor-templates.md`](./site-editor-templates.md) — block-theme Navigation equivalent
- Cross-link: [`widgets.md`](./widgets.md) — peer "Appearance" classic surface
