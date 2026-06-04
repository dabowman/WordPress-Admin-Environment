# Screen Spec: Fonts (Font Library)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/font-library.php` (entry; delegates to `wp_font_library_wp_admin_render_page()` shipped via Gutenberg build files)
**Current workspace coverage:** None — no `core:fonts` source registered. Reachable today only via `iframe:font-library.php` or by drilling into Site Editor → Styles → Typography.

This spec describes the **semantic surface** of the Font Library so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

The Font Library landed in WordPress 6.5 and is the canonical surface for managing site-installed fonts that any block theme can consume. It supersedes the Site Editor's typography panel for font management; the Styles panel reads from this library.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `fonts` |
| Display name | "Fonts" |
| Original URL | `/wp-admin/font-library.php` |
| Menu location | Submenu of Appearance |
| Submenu items | None — single screen with internal tabs (Library / Upload / Install collection) |
| Parent app | Appearance group |
| Sub-screens | Per-family detail (face list with manage UI) |

The Font Library is conceptually a single SPA-style screen with three modes:
- **Library** — installed font families (default landing).
- **Install Fonts** — browse a font collection (Google Fonts is the default), pick families and specific weights/styles to install.
- **Upload** — upload local font files (woff/woff2/ttf/otf).

---

## 2. Purpose

Browse, install, and remove fonts available to all block themes on the site. Pick which weights and styles to install per family (avoids bloating the site with unused variants). Upload custom font files for proprietary or self-hosted fonts. View the read-only set of fonts bundled by the active theme.

Jobs to be done:
- **See what fonts are installed** — Library tab → grid of installed families.
- **Add a Google Font** — Install Fonts → Google Fonts collection → search → pick family → choose weights/styles → install.
- **Add a custom corporate font** — Upload tab → drop .woff2 files → assign to a family + style + weight → install.
- **Remove a font I no longer use** — Library → click family → Delete.
- **See which fonts the theme already provides** — Library → "Theme fonts" section (read-only).
- **Switch the install collection source** — Install Fonts → tab between collections.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_theme_options` | `font-library.php` lines 13–19 |
| List font families | `edit_theme_options` (mapped via `wp_font_family` post type) | `WP_REST_Font_Families_Controller` |
| Install / remove font family | `edit_theme_options` | controller |
| List / create / delete font face | `edit_theme_options` | `WP_REST_Font_Faces_Controller` |
| Read font collections | logged-in user with theme-options access | `WP_REST_Font_Collections_Controller` |

**Permission-denied state:** core renders `wp_die()` 403. Mirror with a "no access" empty state.

**Multisite:** no special handling at this screen level. Each site has its own font library; the network admin equivalent is not separately surfaced.

**Gutenberg dependency note:** `font-library.php` lines 22–28 explicitly bail with a 503 if `wp_font_library_wp_admin_render_page()` (a Gutenberg-shipped function) is not present. The Font Library screen is gated on Gutenberg availability — matches the project's existing hard runtime dependency on Gutenberg (per `CLAUDE.md`).

---

## 4. Data model

### Primary entity: font family
- **Type:** `wp_font_family` post type (private, internal-only)
- **REST endpoint:** `GET /wp/v2/font-families`
- **Single record:** `GET /wp/v2/font-families/{id}` (id is integer)
- **Mutation:** `POST /wp/v2/font-families`, `PUT /wp/v2/font-families/{id}`, `DELETE /wp/v2/font-families/{id}?force=true`

### Fields used by the family list (`?context=edit`)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | post ID |
| `theme_json_version` | `theme_json_version` | int | currently 3 (LATEST_THEME_JSON_VERSION_SUPPORTED) |
| `font_family_settings.name` | `font_family_settings.name` | string | display name ("Inter") |
| `font_family_settings.slug` | `font_family_settings.slug` | string | unique slug ("inter") |
| `font_family_settings.fontFamily` | `font_family_settings.fontFamily` | string | CSS `font-family` value, may include fallbacks |
| `font_family_settings.preview` | `font_family_settings.preview` | URL | optional preview image |
| `font_family_settings.fontFace[]` | (separate collection) | array | array of face descriptors loaded via faces endpoint |

The `font_family_settings` object is JSON-encoded for POST/PUT — important quirk: schema validates the encoded JSON string, then the controller decodes server-side.

### Secondary entity: font face
- **Type:** `wp_font_face` post type (private, child of `wp_font_family` via `post_parent`)
- **REST endpoint:** `GET /wp/v2/font-families/{font_family_id}/font-faces`
- **Single record:** `GET /wp/v2/font-families/{font_family_id}/font-faces/{id}`
- **Mutation:** `POST` (create with file upload), `DELETE` (remove face)

### Fields used (face)
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | |
| `parent` | `parent` | int | font family ID |
| `font_face_settings.fontFamily` | `font_face_settings.fontFamily` | string | CSS family ref |
| `font_face_settings.fontStyle` | `font_face_settings.fontStyle` | enum | `normal` / `italic` / `oblique [angle]` |
| `font_face_settings.fontWeight` | `font_face_settings.fontWeight` | string/int | `100`–`900`, `normal`, `bold`; numeric strings supported |
| `font_face_settings.src` | `font_face_settings.src` | string or string[] | URL(s) or file reference(s) |
| `font_face_settings.fontDisplay` | `font_face_settings.fontDisplay` | enum | `auto` / `block` / `swap` / `fallback` / `optional` |
| `font_face_settings.unicodeRange` | `font_face_settings.unicodeRange` | string | optional |
| `font_face_settings.fontStretch` | `font_face_settings.fontStretch` | string | optional |
| `font_face_settings.ascentOverride`, `descentOverride`, `lineGapOverride`, `sizeAdjust` | string | optional CSS values |
| `font_face_settings.preview` | URL | optional |

Like family settings, `font_face_settings` is JSON-encoded for POST.

### Tertiary entity: font collection
- **REST endpoint:** `GET /wp/v2/font-collections`
- **Single record:** `GET /wp/v2/font-collections/{slug}` (slug regex: `[\/\w-]+`)

### Fields used (collection)
| Field | Notes |
|---|---|
| `slug` | unique identifier ("google-fonts") |
| `name` | display |
| `description` | display |
| `categories[]` | `{ slug, name }` array |
| `font_families[]` | array of family declarations matching `font_family_settings` shape, each with embedded `fontFace[]` |

The default Google Fonts collection ships with WordPress 6.5+. Collections can be added programmatically via `wp_register_font_collection()`.

### Theme-bundled fonts (read-only)
Theme fonts are not posts. They live in `theme.json` under `settings.typography.fontFamilies`. Read via:
- `GET /wp/v2/global-styles/themes/{stylesheet}` → `settings.typography.fontFamilies[]`

These fonts cannot be deleted from the Font Library (no DB row) — managing them is the theme's responsibility. The workspace should render them in a separate "Theme fonts" section with no destructive actions.

### Non-REST data (gaps)
- **Multipart file upload for face creation** — `POST /wp/v2/font-families/{id}/font-faces` accepts multipart with `file-{N}` fields keyed against `src` references inside `font_face_settings`. No JSON-only path; client must use `FormData`.
- **Font usage count** — no REST surface tells you which themes / blocks use a given face. "Safe to delete?" is unanswerable from the API alone.
- **Custom font collection installation** — `WP_Font_Collection::load_from_json()` (loaded from a URL or file path) is server-side only. Adding a non-default collection requires a plugin call to `wp_register_font_collection()`. No REST endpoint to add/remove collections at runtime.

---

## 5. Layout regions (semantic)

### Library mode (default)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Fonts")                                          │
│  └─ Action cluster: "Upload" / "Install Fonts"               │
├─────────────────────────────────────────────────────────────┤
│ THEME FONTS (read-only section)                              │
│  └─ Family rows (name, sample, "Theme" badge)                │
├─────────────────────────────────────────────────────────────┤
│ INSTALLED FONTS                                              │
│  └─ Family rows (name, sample, face count, click to manage)  │
├─────────────────────────────────────────────────────────────┤
│ EMPTY STATE                                                  │
│  └─ "No custom fonts installed yet" + "Install Fonts" CTA    │
└─────────────────────────────────────────────────────────────┘
```

### Install Fonts mode (modal or sub-screen)
```
┌─────────────────────────────────────────────────────────────┐
│ MODAL HEADER                                                 │
│  ├─ Tabs: Collections (one tab per registered collection)    │
│  └─ Close                                                    │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Search (filters family list)                             │
│  └─ Category dropdown (e.g. Serif / Sans-serif / Display)    │
├─────────────────────────────────────────────────────────────┤
│ FAMILY LIST                                                  │
│  └─ Row per family: name + sample + checkbox / drill-in      │
├─────────────────────────────────────────────────────────────┤
│ FAMILY DETAIL (right pane or drilldown)                      │
│  ├─ Sample (live)                                            │
│  ├─ Variants table (per face: weight × style)                │
│  │   - Each row checkable                                    │
│  └─ "Install (N)" button                                     │
└─────────────────────────────────────────────────────────────┘
```

### Upload mode (modal or sub-screen)
```
┌─────────────────────────────────────────────────────────────┐
│ MODAL HEADER                                                 │
│  └─ "Upload font files"                                      │
├─────────────────────────────────────────────────────────────┤
│ DROPZONE                                                     │
│  └─ Drop or click to add .woff / .woff2 / .ttf / .otf        │
├─────────────────────────────────────────────────────────────┤
│ STAGED FILES                                                 │
│  ├─ Per-file row:                                            │
│  │   - Filename                                              │
│  │   - Auto-detected family / weight / style (editable)      │
│  │   - Remove                                                │
│  └─ "Install (N)" button                                     │
└─────────────────────────────────────────────────────────────┘
```

### Family detail (within Library)
```
┌─────────────────────────────────────────────────────────────┐
│ FAMILY HEADER                                                │
│  ├─ Name + sample text (editable size)                       │
│  └─ Action: Delete family                                    │
├─────────────────────────────────────────────────────────────┤
│ FACES TABLE                                                  │
│  ├─ Columns: Style / Weight / Source / Preview               │
│  └─ Per-face actions: Delete face                            │
├─────────────────────────────────────────────────────────────┤
│ ADD FACE BUTTON                                              │
│  └─ Opens upload-or-pick mode scoped to this family          │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading library | First fetch | Skeleton family rows |
| Empty library | No installed family rows | "No custom fonts installed" + Install / Upload CTAs |
| Loading collection | Switch tab in Install mode | Spinner above family list |
| Empty collection | Filter yields nothing | "No fonts match" |
| Collection unavailable | API or local read failure | "Could not load collection. Try again." |
| Installation in progress | Install clicked | Per-row progress; modal stays open |
| Installation success | All faces installed | Snackbar + library refreshes |
| Installation failure (partial) | Some faces failed | Per-face error inline + retry-each |
| Upload in progress | Files dropped, Install clicked | Per-file progress |
| Upload validation error | File extension / size invalid | Inline error per file |
| Delete confirmation | Delete clicked | Modal: "Delete {family}? Removes N faces." |
| Permission denied | 403 | "You don't have permission to manage fonts" |

---

## 7. Actions

### Header actions (Library)
- **Install Fonts** — opens Install modal. Cap: `edit_theme_options`.
- **Upload** — opens Upload modal. Cap: `edit_theme_options`.

### Per-row actions (Library — installed only)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Manage | `edit_theme_options` | Navigation | Drills into family detail |
| Delete | `edit_theme_options` | Mutation | Removes family + cascading faces; double-confirm |

### Per-row actions (Library — theme fonts)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Preview | none | View | Read-only inspection |

### Family detail actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Add face | `edit_theme_options` | Mutation | Upload or pick from collection |
| Delete face | `edit_theme_options` | Mutation | DELETE on `wp_font_face` |
| Rename family | `edit_theme_options` | Mutation | PUT on `wp_font_family` |
| Edit fontFamily CSS value | `edit_theme_options` | Mutation | PUT on `wp_font_family` |

### Install modal actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Switch tab (collection) | none | Navigation | Switch active collection |
| Search | none | Filter | Local search |
| Filter by category | none | Filter | Local filter |
| Toggle face checkbox | none | Selection | Pick weights/styles |
| Install | `edit_theme_options` | Mutation | Bulk: POST family + cascading faces |

### Upload modal actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Drop / pick files | none | Stage | Adds to staged list |
| Edit per-file metadata | none | Stage | Family / weight / style |
| Remove staged file | none | Stage | |
| Install | `edit_theme_options` | Mutation | Multipart POST with files |

### Bulk actions (Library)
N/A — core surfaces single-family delete only. Workspace may add bulk delete as a follow-up.

### Optimistic vs. blocking
- **Install** — blocking. May be slow (multiple HTTP downloads server-side for collection installs).
- **Delete** — blocking with confirmation.
- **Rename** — optimistic.
- **Per-face delete** — blocking with confirmation.

---

## 8. Filters, sort, search, pagination

### Library
| Filter | Field | Operators | Source |
|---|---|---|---|
| Source (Theme / Custom) | computed | `is` | derived from origin (theme.json read or `wp_font_family` row) |
| Search | name | substring | client-side |

### Install modal
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search | family name | substring | client-side over collection JSON |
| Category | category slug | `is`, `isAny` | from collection's `categories[]` |
| Collection | tab | `is` | from `font-collections` endpoint |

### Sort
- Library: alphabetical by family name (theme fonts first, then custom).
- Install collection: alphabetical (collection-defined order acceptable).

### Search
Debounced 150ms; client-side. Collections preload all entries.

### Pagination
Library: typically <50 rows; render full list. Install modal: collection has full list; no server pagination.

---

## 9. Forms & inputs

### Per-file metadata in Upload mode
| Field | Type | Required | Notes |
|---|---|---|---|
| Family name | text | yes | Auto-detected from filename; user-correctable |
| fontFamily CSS value | text | yes | Auto-detected; usually equals name with fallback |
| Style | select | yes | normal / italic / oblique |
| Weight | select or number | yes | 100–900 in increments of 100, plus normal/bold |
| Display | select | no | auto / swap / block / fallback / optional |
| Source file | file | yes | The dropped/picked file |

### Validation
- **File type:** `.woff2`, `.woff`, `.ttf`, `.otf` (server enforces; pre-check client-side).
- **File size:** subject to PHP `upload_max_filesize`; pre-check client-side.
- **fontFamily / fontFace settings:** validated by `validate_font_family_settings()` and `validate_font_face_settings()` (see `class-wp-rest-font-families-controller.php` lines 89–130; `class-wp-rest-font-faces-controller.php` lines 198–245).
- **src URL or file reference:** must validate as URL or match a `file-{N}` request param.

### Save semantics
- **Install from collection:** one POST per family, then per-face POST creates child records.
- **Upload custom:** multipart POST with `font_face_settings` JSON + `file-{N}` parts. Server uploads files, rewrites `src` to actual URLs.
- **Family delete cascade:** deleting a family removes its faces (`force=true` on family DELETE). Faces have no trash state.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/font-library.php` (no params; SPA owns sub-state).

The workspace uses hash-based routing under `#/fonts`. Recommended URL state:
```
#/fonts                                   # library landing
#/fonts/{family-slug}                     # family detail
#/fonts/install                           # install modal
#/fonts/install/{collection-slug}         # collection picker
#/fonts/install/{collection-slug}/{family-slug} # family detail in install
#/fonts/upload                            # upload mode
```

Browser back/forward must restore mode + selection. Refresh must restore. Sharing URL must reproduce the view.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| "Use in Styles" (within family detail) | `core:site-editor` Styles → Typography | family slug |
| Click theme font row | `core:site-editor` Styles | family slug |

### Inbound
- From Site Editor Styles "Manage fonts" link → Fonts library
- From command palette → library or install modal
- From admin menu Appearance → Fonts → library

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Install (single family) | Snackbar: "{Family} installed" |
| Install (multi-family) | Snackbar: "{N} families installed" + failure count if any |
| Delete family | Snackbar: "{Family} removed" (no undo — face records gone) |
| Delete face | Snackbar: "{Style Weight} removed" |
| Upload progress | Modal-internal phase indicator: "Uploading…" / "Installing…" |
| Upload validation error | Inline error per file in modal |
| Network error | Banner; preserve modal state |
| Permission error | Inline + dismissable |

Undo: not supported. Removing a font face deletes the file from disk; reinstall requires re-upload or re-pick from collection.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `Esc` | Close modal / back to library |
| `Tab` / `Shift+Tab` | Move focus |
| `Enter` | Open focused row |
| `Space` | Toggle face checkbox |

### ARIA & focus
- Family list: `role="list"`.
- Faces table: `role="table"` with `role="row"` and column headers.
- Modal: `role="dialog"` + focus trap + return.
- After install: focus returns to library; new families announced.
- After delete: focus moves to next row.
- Loading: `aria-busy="true"` on the relevant region.

### Screen reader
- Sample text labeled "Sample of {family}".
- Variant rows include weight + style in accessible name ("Inter Bold Italic").
- Install progress announced via live region.

---

## 14. Extension points

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_register_font_collection()` (PHP function) | Register a custom collection | Preserve — server-side registration is the right surface. |
| `default_font_collection` filter (where present) | Override default Google Fonts collection URL | Preserve. |
| `wp_font_dir` filter | Change font upload location | Preserve. |
| `font_face_dir` filter | Change face storage | Preserve. |

Plugin compatibility note: the Font Library's extension model is server-side and unaffected by the workspace. Any plugin registering collections continues to work.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** none registered.
- **Workaround:** `iframe:font-library.php`. Works but inherits the Gutenberg dependency check; requires Gutenberg active.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Register `core:fonts` app source | High | New app component on top of `/wp/v2/font-families` |
| Library list (theme + installed sections) | High | Two-section layout |
| Family detail screen | High | Faces table + delete |
| Install modal with collection tabs | High | Reads `/wp/v2/font-collections` |
| Google Fonts default collection | High | Ships with core; auto-available |
| Upload modal with file dropzone + metadata form | High | Multipart upload with `FormData` |
| Per-file auto-detection of family/weight/style | Medium | Client-side parse of file metadata or filename heuristic |
| Bulk install of selected variants | High | Multi-POST with progress |
| Delete family / face | High | DELETE endpoints |
| Theme fonts read-only section | Medium | Reads `global-styles/themes/{stylesheet}.settings.typography.fontFamilies` |
| Sample text editor | Low | "Almost before we knew it..." default; user-editable |
| Search + category filter | Medium | Client-side over collection |
| Custom collection registration UI | Out of scope | Plugin territory |
| Usage indicator ("used by N styles") | Low | No data source today; gap |
| Keyboard shortcuts | Medium | `/`, Esc, arrow nav in lists |
| ARIA polish | High | Live regions for install progress, dialog roles |

### Acceptable interim
For v1 of any new workspace config, `iframe:font-library.php` is acceptable as an escape hatch (assuming Gutenberg is active). Mark such configs explicitly so they're tracked for replacement.

---

## 16. Out of scope

- **Per-block font picker** — lives inside Site Editor Styles → Blocks.
- **Font subsetting / WOFF compression** — not provided by core; deferred to plugin territory.
- **Font preview text editor** — minor convenience, not in core.
- **Font versioning** — Font Library does not version-control families; deferred.
- **Font sharing across multisite** — each site has its own library; defer to v2 multisite work.

---

## 17. Reference

- Original PHP: `wp-admin/font-library.php` (loads Gutenberg-shipped renderer)
- Render function: `wp_font_library_wp_admin_render_page()` (in Gutenberg build)
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-font-families-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-font-faces-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-font-collections-controller.php`
- Post type registrations: `wp-includes/post.php` lines 596–658 (`wp_font_family`, `wp_font_face`)
- Library backend: `wp-includes/fonts/class-wp-font-library.php`
- Collection class: `wp-includes/fonts/class-wp-font-collection.php`
- Face resolver: `wp-includes/fonts/class-wp-font-face-resolver.php`
- Face renderer: `wp-includes/fonts/class-wp-font-face.php`
- Utils: `wp-includes/fonts/class-wp-font-utils.php`
- Cross-link: [`site-editor-styles.md`](./site-editor-styles.md) — Typography panel reads from this library
