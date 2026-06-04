# Screen Spec: Settings — Media

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-media.php`, `wp-admin/options.php` (legacy save handler)
**Current workspace coverage:** Not implemented in v1. `core:settings-media` source slot reserved; falls back to `iframe:options-media.php` if workspace config requests it.

This spec describes the **semantic surface** of the Media Settings screen.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-media` |
| Display name | "Media" / "Media Settings" |
| Original URL | `/wp-admin/options-media.php` |
| Menu location | Settings → Media |
| Submenu items | N/A |
| Parent app | `core:settings` |
| Sub-screens | None |

---

## 2. Purpose

Configure the dimensions WordPress uses when generating thumbnail / medium / large image variants on upload, and choose whether to organize uploaded files into year/month subfolders.

Jobs to be done:
- **Tune image breakpoints** — set Thumbnail / Medium / Large dimensions to match a theme's needs.
- **Crop thumbnails** — toggle exact-dimension crop vs. proportional fit.
- **Filesystem layout** — opt out of date-based subfolders if the theme/CDN expects flat paths.
- **Multisite quota** — when applicable, manage upload size budget.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-media.php` line 12 |
| Save settings | `manage_options` | REST controller |

**Permission-denied state:** `wp_die()`.

**Multisite:** Adds an "Uploading Files" quota panel and may suppress `upload_path`/`upload_url_path` editing. Network admin controls site-level upload size limits separately.

---

## 4. Data model

### Primary entity
- REST endpoint: `GET/POST /wp/v2/settings`

### REST-exposed fields

Verified against `wp_admin_settings_api_init()` and image size registrations. Image-size fields are registered in `wp_admin_init` rather than `register_initial_settings`; check `WP_REST_Settings_Controller::get_registered_options()` output for the live list. **As of WP 6.x, image size options are not in `register_initial_settings()`**, but several core plugins/Gutenberg patches add them. Treat them as **non-REST in core 6.9** — gap.

| Form field | Option name | REST key | Type | Default | Notes |
|---|---|---|---|---|---|
| (intentionally empty — see "Non-REST" below) | | | | | |

**Confirm at runtime:** call `GET /wp/v2/settings` against the target site and check which keys appear. Some hosts and Jetpack/Gutenberg expose them.

### Non-REST options (legacy form save only — gaps)

| Option | Form field | Type | Default | Notes |
|---|---|---|---|---|
| `thumbnail_size_w` | Thumbnail Width | int | 150 | min 0 |
| `thumbnail_size_h` | Thumbnail Height | int | 150 | min 0 |
| `thumbnail_crop` | Crop thumbnail to exact dimensions | bool | true | |
| `medium_size_w` | Medium Max Width | int | 300 | min 0 |
| `medium_size_h` | Medium Max Height | int | 300 | min 0 |
| `large_size_w` | Large Max Width | int | 1024 | min 0 |
| `large_size_h` | Large Max Height | int | 1024 | min 0 |
| `uploads_use_yearmonth_folders` | Organize uploads in month/year folders | bool | true | |
| `upload_path` | Store uploads in this folder | string | `wp-content/uploads` | only editable when non-default; multisite-aware |
| `upload_url_path` | Full URL path to files | string | "" | only editable when non-default |
| `image_default_size` | Default image size when inserting | string enum | `medium` | hidden by default; some installs surface it |
| `image_default_align` | Default image alignment | string | `none` | hidden |
| `image_default_link_type` | Default link target on image insert | string | "" | hidden |

The image-default fields (`image_default_*`) appear in `allowed_options['media']` but are not rendered in the default form — they exist for plugins to add via `do_settings_fields`.

### Aggregate data
- Available image sizes registered by the active theme (`add_image_size`) — relevant for Gutenberg block options but not this panel.
- Multisite upload quota: `get_space_allowed()` and `get_space_used()` — separate panel typically.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Media")                                          │
├─────────────────────────────────────────────────────────────┤
│ SECTION "Image sizes"                                        │
│  ├─ Description: "The sizes listed below determine the       │
│  │   maximum dimensions in pixels…"                          │
│  ├─ Thumbnail size                                           │
│  │    ├─ Width  [number]                                     │
│  │    ├─ Height [number]                                     │
│  │    └─ ☐ Crop thumbnail to exact dimensions                │
│  ├─ Medium size                                              │
│  │    ├─ Max Width  [number]                                 │
│  │    └─ Max Height [number]                                 │
│  └─ Large size                                               │
│       ├─ Max Width  [number]                                 │
│       └─ Max Height [number]                                 │
├─────────────────────────────────────────────────────────────┤
│ SECTION "Embeds" (only when wp_settings['media']['embeds'])  │
│  └─ Plugin-extended fields                                   │
├─────────────────────────────────────────────────────────────┤
│ SECTION "Uploading Files" (single-site only)                 │
│  ├─ Store uploads in this folder [text — conditional]        │
│  ├─ Full URL path to files       [text — conditional]        │
│  └─ ☐ Organize my uploads into month- and year-based folders │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes                                             │
└─────────────────────────────────────────────────────────────┘
```

`upload_path` / `upload_url_path` are only rendered when their values are non-default — preventing accidental edits on standard installs.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton |
| Idle / Editing / Saving / Saved / Error | Standard | |
| Permission denied | 403 | 403 view |
| Multisite | `is_multisite()` | Hide "Uploading Files" section entirely |
| Custom upload path | `upload_url_path` set OR `upload_path !== 'wp-content/uploads'` | Show editable path inputs above the year/month checkbox |
| Embeds section empty | `$wp_settings['media']['embeds']` not registered | Hide the Embeds section header |

---

## 7. Actions

### Primary action
- **Save Changes** — All fields here are non-REST in core 6.9. Save via workspace custom endpoint or sequential `update_option` calls (under `manage_options` capability).

### No bulk / per-row / inline actions.

---

## 8. Filters, sort, search, pagination

N/A.

---

## 9. Forms & inputs

### Thumbnail size
- `thumbnail_size_w` — number, min 0, step 1, default 150 (px)
- `thumbnail_size_h` — number, min 0, step 1, default 150 (px)
- `thumbnail_crop` — checkbox, default true; helper: "(normally thumbnails are proportional)"
- Validation: width and height must be ≥0; zero means "do not generate this size".

### Medium size
- `medium_size_w` — number, min 0, default 300
- `medium_size_h` — number, min 0, default 300
- Labels: "Max Width" / "Max Height" (proportional fit, not crop)

### Large size
- `large_size_w` — number, min 0, default 1024
- `large_size_h` — number, min 0, default 1024
- Labels: "Max Width" / "Max Height"

### Embeds (filter-extended)
- Empty by default. Plugins inject via `add_settings_field('media', …, 'embeds')`.
- The workspace may render an empty placeholder or hide the section when no extensions are registered.

### Store uploads in this folder (conditional)
- Type: text (LTR forced)
- Option: `upload_path` (string)
- Default: `wp-content/uploads` (hidden when default)
- Helper: "Default is `wp-content/uploads`"
- Validation: relative or absolute path; server resolves and verifies writability.

### Full URL path to files (conditional)
- Type: text (LTR forced)
- Option: `upload_url_path` (string)
- Default: "" (hidden when default)
- Helper: "Configuring this is optional. By default, it should be blank."
- Validation: URL or empty.

### Organize my uploads into month- and year-based folders
- Type: checkbox
- Option: `uploads_use_yearmonth_folders` (bool)
- Default: true
- Helper: none in core; recommended addition: "Existing files will not be moved."

### Save semantics
- Single Save button.
- All-non-REST save: prefer one POST to a workspace custom endpoint that batches the `update_option` calls.
- Validation: server authoritative.

---

## 10. Routing & URL state

Original URL: `/wp-admin/options-media.php`. Workspace hash: `#/settings/media`. No query state.

---

## 11. Inter-app navigation

### Outbound
- None typical from this panel; no per-row links.

### Inbound
- From `core:settings` host.
- From media library "Replace existing image variants on settings change" prompt (post-MVP feature).
- From a theme onboarding flow that recommends specific image sizes.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar: "Media settings saved." |
| Save failure | Inline notice |
| Setting change that requires regeneration | Optional banner: "You may want to regenerate existing images for the new sizes." (informational; core does NOT auto-regenerate) |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between numeric inputs |
| `↑` / `↓` in number input | Increment/decrement |
| `Cmd/Ctrl+S` | Save |

### ARIA & focus
- Each size group inside `<fieldset><legend>` (Thumbnail / Medium / Large size).
- Crop checkbox: `aria-describedby` for helper text.
- Width/Height inputs: paired labels; both visible.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `do_settings_fields( 'media', 'default' )` | Plugin-added fields under Image Sizes | `core:settings.panels` slot |
| `do_settings_fields( 'media', 'embeds' )` | Plugin-added fields under Embeds | Slot |
| `do_settings_fields( 'media', 'uploads' )` | Plugin-added fields under Uploading Files | Slot |
| `wp_get_additional_image_sizes` (read-only) | Theme-added sizes | Display informationally; not editable here |

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** `core:settings-media` reserved; not yet implemented.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Thumbnail / Medium / Large size inputs | High | All non-REST. |
| Thumbnail crop checkbox | High | Non-REST. |
| `uploads_use_yearmonth_folders` | High | Non-REST. |
| `upload_path` / `upload_url_path` (custom path) | Low | Edge case; only shown when non-default. |
| Embeds plugin-extended section | Low | Slot system. |
| Multisite "Uploading Files" suppression | Medium | Conditional render. |
| Image regeneration prompt | Low | Nice-to-have UX add. |

### Acceptable interim
`iframe:options-media.php` covers full parity at zero implementation cost. Given how rarely admins touch these values, iframe is reasonable for v1.

---

## 16. Out of scope

- **Image regeneration** — separate concern (plugin like Regenerate Thumbnails); not part of Settings UI.
- **CDN/offload settings** — third-party plugin domain.
- **Multisite Network → Settings → Upload Settings** — separate network-level screen.
- **Theme-registered image sizes (`add_image_size`)** — read-only presentation; not editable here.

---

## 17. Reference

- Original PHP form: `wp-admin/options-media.php`
- Save handler: `wp-admin/options.php` lines 130–141 for `allowed_options['media']`
- Settings registration: image-size fields registered in admin, not in `register_initial_settings`. See `wp-admin/includes/admin.php` and `wp-admin/options.php` for the allowed list.
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php` (verify exposure at runtime)
- REST API reference: `https://developer.wordpress.org/rest-api/reference/settings/`
- Current workspace impl: not yet implemented; reserved as `core:settings-media` source slot.
