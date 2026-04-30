# Screen Spec: Site Editor — Global Styles

**Status:** Tier 2 — full spec. Companion to [`site-editor.md`](./site-editor.md).
**Source PHP:** `wp-admin/site-editor.php` (entry); rendering inside `@wordpress/edit-site` package.
**Current shell coverage:** Inherited from `core:site-editor` iframe adapter.

This file covers the **Global Styles** sub-screen of the Site Editor: typography, colors, layout, blocks panel, style variations, section styles, additional CSS, and revisions. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `site-editor/styles` |
| Display name | "Styles" |
| Original URL | `/wp-admin/site-editor.php?p=/styles` |
| Menu location | Inside Site Editor hub |
| Submenu items | Browse styles / Typography / Colors / Layout / Blocks / Additional CSS / Sections / Revisions |
| Parent app | `core:site-editor` |
| Sub-screens | All sub-panels are nested routes within Styles |

---

## 2. Purpose

Edit the active theme's `wp_global_styles` record — site-wide typography, colors, layout, and per-block style overrides. Browse pre-defined style variations shipped by the theme. Compare and revert styles via revisions. Override individual block styles. Add custom CSS.

Jobs to be done:
- **Try a style variation** — Browse styles → click variation → Activate.
- **Change body font** — Typography → Text → Font family / size.
- **Change link color** — Colors → Links → pick from palette.
- **Adjust default content width** — Layout → Content size.
- **Override a single block's appearance** — Blocks → Heading → font weight.
- **Compare current to last week's styles** — Revisions → pick snapshot → Restore.
- **Add a one-off CSS rule** — Additional CSS → paste rule.
- **Style a single section consistently** — Sections → choose section → adjust.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View styles | `edit_theme_options` | `WP_REST_Global_Styles_Controller::get_item_permissions_check` |
| Edit user styles | `edit_theme_options` (mapped via `wp_global_styles` post type meta caps) | `wp-includes/post.php` |
| Read theme styles + variations | `edit_theme_options` | controller |
| List revisions | `edit_theme_options` | `WP_REST_Global_Styles_Revisions_Controller` |
| Restore revision | `edit_theme_options` | revisions controller |

**Permission-denied state:** matches parent Site Editor — `wp_die()` 403.

---

## 4. Data model

### Primary entity: user global styles
- **Type:** `wp_global_styles` post type (one row per active theme)
- **REST endpoint:** `GET /wp/v2/global-styles/{id}` and `PUT /wp/v2/global-styles/{id}`
- **ID resolution:** `WP_Theme_JSON_Resolver::get_user_global_styles_post_id()` returns the ID for the active theme; site-editor.php injects this as `$active_global_styles_id` (line 174).

### Secondary entities
| Entity | REST endpoint | Notes |
|---|---|---|
| Theme styles | `GET /wp/v2/global-styles/themes/{stylesheet}` | Read-only; the compiled theme.json output |
| Style variations | `GET /wp/v2/global-styles/themes/{stylesheet}/variations` | Read-only; theme's `styles/*.json` files |
| Revisions | `GET /wp/v2/global-styles/{id}/revisions` | Per-revision snapshot |
| Single revision | `GET /wp/v2/global-styles/{id}/revisions/{rev_id}` | For diffing / restore |

### Fields used (`wp_global_styles` record, `?context=edit`)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | post ID |
| `title.raw` | `title.raw` | string | typically theme stylesheet |
| `settings` | `settings` | object | `theme.json` `settings` shape — color palette, typography presets, layout, spacing, etc. |
| `styles` | `styles` | object | `theme.json` `styles` shape — actual style values (color, typography, spacing, elements, blocks) |
| `_links.wp:action-edit-css` | `_links` | rel | Capability indicator |

The `settings` and `styles` objects are deep nested. The full schema lives in `wp-includes/class-wp-theme-json-schema.php`.

### Variations entity
Each variation is a partial `theme.json` shape:
| Field | Notes |
|---|---|
| `title` | "Solar", "Moss", etc. |
| `settings` | Override subset of theme settings |
| `styles` | Override subset of theme styles |

Activating a variation means PUT to user global styles with the variation's payload merged into the existing user record.

### Revisions entity
| Field | Notes |
|---|---|
| `id` | revision ID |
| `parent` | the global-styles post ID |
| `date` | ISO 8601 |
| `author` | user ID |
| `is_latest` | bool — convenience flag for the current state |
| `settings`, `styles` | snapshot of state at that revision |

Revisions are pruned by `wp_revisions_to_keep()` defaults; for `wp_global_styles` the default is "all" but configurable.

### Non-REST data (gaps)
- **Diff between revisions** — no REST endpoint returns a structured diff. Client must fetch two revisions and diff client-side.
- **Restore a revision** — implemented as PUT user-global-styles with the revision's payload. There is no `POST .../revisions/{id}/restore` endpoint.
- **Per-section style scopes** — section styles use the `theme.json` `styles.blocks.{name}` and section variations under `styles.variations`. No dedicated REST surface; lives within `styles`.

---

## 5. Layout regions (semantic)

Styles renders inside the Site Editor canvas as a **stacked navigation panel** on the left and a **live preview iframe** on the right.

```
┌─────────────────┬───────────────────────────────────────────┐
│ STYLES PANEL    │ PREVIEW                                   │
│  (left dock)    │  ├─ Live preview iframe of the front page │
│                 │  └─ Updates on debounce as edits happen   │
│  ┌── Section ── │                                           │
│  │ Browse styles│                                           │
│  │ Typography   │                                           │
│  │ Colors       │                                           │
│  │ Layout       │                                           │
│  │ Shadows      │                                           │
│  │ Blocks       │                                           │
│  │ Additional   │                                           │
│  │   CSS        │                                           │
│  │ Revisions    │                                           │
│  └──────────────│                                           │
│  Footer:        │                                           │
│  ├─ Save        │                                           │
│  └─ Reset       │                                           │
└─────────────────┴───────────────────────────────────────────┘
```

### Browse styles panel
Grid of variation cards. Each card renders a mini live preview of the variation applied to the current theme.
```
┌───┬───┬───┐
│ v1│ v2│ v3│
├───┼───┼───┤
│ v4│ v5│ v6│
└───┴───┴───┘
```

### Typography panel
- Text — font family / size / line height / letter spacing / weight / appearance
- Headings — same set, plus per-level (H1–H6) overrides
- Captions / Buttons — element-specific
- Link — element-specific (color + decoration)

### Colors panel
- Palette — theme palette + custom additions (color picker grid)
- Background / Text / Caption / Button / Heading / Link / Hover-link — per-role color slot
- Gradients — palette of gradients (theme + custom)
- Duotone — image filter palette

### Layout panel
- Content size (`layout.contentSize`)
- Wide size (`layout.wideSize`)
- Padding (top/right/bottom/left, linkable)
- Margin (linkable)
- Block spacing (`spacing.blockGap`)

### Shadows panel
- Theme + custom shadow tokens
- Per-token preview swatch + name + CSS value

### Blocks panel
List of registered block types. Click a block → opens that block's style panel (typography / colors / layout / borders / shadows scoped to that block). Changes write to `styles.blocks.{name}` in the user global styles.

### Additional CSS panel
- Single textarea / code editor for raw CSS
- Stored as `styles.css` string in user global styles
- Lints unsupported `@` rules (no `@import`, etc.)

### Sections panel (WP 6.6+)
Theme-defined named section variations. Apply per-section styles independently of the rest of the theme.

### Revisions panel
List of revisions, newest first. Selecting a revision shows a side-by-side preview. Action: "Apply" restores it as a new edit (creates a new revision on save).

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First entry | Skeleton panel |
| Empty (initial styles) | New install / fresh theme | Default theme styles loaded; no user record yet |
| Dirty | Edit made | Save button enabled; preview updates after debounce (~500ms) |
| Saving | Save clicked | "Saving…" + button disabled |
| Save failed | Network/validation | Inline error in panel; preserve dirty state |
| Variation activated | Variation card clicked | All panels reflect new values; dirty until saved |
| Revision restored | Restore clicked | Equivalent to "load this snapshot as the current edit"; dirty until saved |
| Reset | "Reset to theme defaults" clicked | Confirmation modal; PUT empties user `settings` + `styles` |
| CSS lint error | Additional CSS panel | Inline error under textarea |
| Theme has no theme.json | Active theme is classic | Styles panel hidden; "Block themes only" message |

---

## 7. Actions

### Panel actions
| Action | Type | Notes |
|---|---|---|
| Activate variation | Mutation | Merge variation into user record + dirty |
| Edit individual setting | Mutation (local until Save) | E.g. choose font, color |
| Save | Blocking mutation | PUT to `/wp/v2/global-styles/{id}` |
| Reset | Mutation | Empty `settings` + `styles` (PUT with empties); confirm modal |
| Restore revision | Mutation (local until Save) | Loads revision's payload as current edit |
| Add custom color / font / shadow | Mutation | Adds to user `settings` palette |
| Remove custom palette entry | Mutation | Confirms if used; offers cascade fix |
| Open Block panel | Navigation | Drills into per-block styles |
| Open Section panel | Navigation | Drills into per-section styles |

### Per-block actions (within Blocks panel)
| Action | Type |
|---|---|
| Reset block to theme defaults | Mutation |
| Apply preset (e.g. "Use heading font") | Mutation |
| Browse block style variations (theme-defined) | Mutation |

### Optimistic vs. blocking
- **All edits** — optimistic (local store) until Save.
- **Save** — blocking. Single PUT.
- **Restore revision** — optimistic; commits on next Save.
- **Reset to defaults** — blocking with confirmation; immediate PUT (no save step).

---

## 8. Filters, sort, search, pagination

### Variations grid
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | variation title | substring | client-side filter |

### Revisions list
| Filter | Field | Operators | Source |
|---|---|---|---|
| Author | `author` | `is` | per-user |
| Date range | `date` | `between` | client-side |

Pagination: revisions paginated (default 20 per page) via `?page` + `?per_page` on the revisions endpoint.

### Sort
- Variations: theme-defined order.
- Revisions: descending date (newest first); not configurable.

---

## 9. Forms & inputs

### Typography Text panel (representative)
| Field | Type | Notes |
|---|---|---|
| Font family | select (theme + custom) | Pulls from `settings.typography.fontFamilies` |
| Font size | size input + presets | Presets from `settings.typography.fontSizes` |
| Line height | number | unitless or em |
| Letter spacing | size input | rem/px/em |
| Font appearance | combo | weight + style (regular/italic/bold/etc.) |
| Decoration | enum | none / underline |
| Text transform | enum | none / capitalize / uppercase / lowercase |

### Colors panel
| Field | Type | Notes |
|---|---|---|
| Color picker | color | HEX/RGB/HSL/HSLA |
| Palette swatch | clickable | Selects existing palette entry |
| Add custom color | mutation | Adds to user palette |
| Clear color | mutation | Removes value |

### Additional CSS panel
| Field | Type | Notes |
|---|---|---|
| CSS textarea | code | Stored as `styles.css` |

Validation: server-side via `WP_Theme_JSON::sanitize()` strips disallowed CSS. Client-side: light lint (no `@import`, no `<script>`).

### Save semantics
- All panel edits write to a single user `wp_global_styles` record.
- Save: PUT `/wp/v2/global-styles/{id}` with full `settings` + `styles` payload (server replaces; not partial).
- Validation: server-side. Errors shown inline.

---

## 10. Routing & URL state

Original wp-admin URL params:
- `?p=/styles` — Styles landing
- `?p=/styles&section=/typography` — typography panel
- `?p=/styles&section=/typography/text` — Text sub-panel
- `?p=/styles&section=/colors`
- `?p=/styles&section=/layout`
- `?p=/styles&section=/blocks`
- `?p=/styles&section=/blocks/core/heading` — per-block panel
- `?p=/styles&section=/css` — Additional CSS
- `?p=/styles/revisions` — revisions list

The shell hash routing:
```
#/site-editor/styles
#/site-editor/styles/typography
#/site-editor/styles/typography/text
#/site-editor/styles/colors
#/site-editor/styles/blocks/core/heading
#/site-editor/styles/css
#/site-editor/styles/revisions
#/site-editor/styles/revisions/{rev_id}
```

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Open block style → "Edit this block in canvas" | parent `core:site-editor` canvas | block name |
| "Browse all theme styles" | self, variations grid | none |

### Inbound
- From hub menu "Styles" → Styles landing
- From command palette → specific Styles panel
- From an editor block toolbar "Set as default for all" → Blocks panel for that block

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar: "Styles saved" |
| Save failure | Inline error in panel + retry |
| Variation applied | Snackbar: "{Variation Name} applied" + Undo |
| Revision restored | Snackbar: "Restored. Save to keep." + Undo |
| Reset to defaults | Snackbar: "Reset to theme defaults" + Undo |
| Custom color added | Inline confirmation |
| Custom palette entry removed | Inline confirmation; if in use, "Replaced N references" |
| CSS lint warning | Inline warning under textarea |

Undo: per-edit Undo via Cmd+Z within the editor; revisions are the durable history.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Cmd/Ctrl+S` | Save (delegates to parent canvas save) |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / Redo |
| `Esc` | Back to parent panel |
| `Tab` / `Shift+Tab` | Move focus through panel rows |

### ARIA & focus
- Panel header: `<h2>` describing the panel; back button has `aria-label="Back to Styles"`.
- Color picker: native + custom; ensure picker is `role="dialog"` with focus trap.
- Variation cards: `role="button"` + `aria-pressed` for current.
- Revisions list: `role="list"`; selected revision has `aria-current="true"`.

### Screen reader
- Color value changes announced ("Background color set to #FFFFFF").
- Save success announced via live region.

---

## 14. Extension points

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_theme_json_data_user` | Modify user theme.json on read | Preserve — theme-system concern. |
| `wp_theme_json_data_theme` | Modify theme.json on read | Preserve. |
| `wp_theme_json_data_default` | Modify default theme.json | Preserve. |
| `block_editor_settings_all` | Add custom controls | Replace with shell extension API. |

Plugin compatibility note: theme.json filters work unchanged because they run in PHP independent of the editor UI.

---

## 15. Mapping & implementation status

### Current shell coverage
- Inherited from `core:site-editor` iframe; no native shell surface.

### Gaps vs. this spec (path to v2 native or shell-surface)
| Gap | Priority | Notes |
|---|---|---|
| Native Styles panel mount | High (v2) | Same package-collision blockers as parent Site Editor. |
| Variations preview cards | Medium | Could be surfaced as a shell widget independent of the canvas; reads `/wp/v2/global-styles/themes/{stylesheet}/variations`. |
| Revisions list UI | Medium | Could surface as `core:global-styles-revisions` app for power users. |
| Additional CSS as standalone editor | Low | Reads/writes `styles.css` field; could ship as `core:custom-css` app. |
| Section styles | Low | Theme-feature-dependent. |

---

## 16. Out of scope

- **Per-user style preferences** — global styles are sitewide; per-user theming lives in `core:appearance` (shell-level).
- **Theme.json schema validation UI** — server enforces; no client surface.
- **Imports/exports of style snapshots** — covered by theme export ZIP at the parent level.
- **Customizer "Additional CSS"** — legacy/classic-theme-only; not rebuilt.

---

## 17. Reference

- Original PHP entry: `wp-admin/site-editor.php` line 174 (active global-styles ID resolution)
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-revisions-controller.php`
- Theme JSON resolver: `wp-includes/class-wp-theme-json-resolver.php`
- Theme JSON schema: `wp-includes/class-wp-theme-json-schema.php`
- Sanitization: `wp-includes/class-wp-theme-json.php::sanitize()`
- Block templates registry: `wp-includes/class-wp-block-templates-registry.php`
- Companion: [`site-editor.md`](./site-editor.md), [`site-editor-templates.md`](./site-editor-templates.md)
