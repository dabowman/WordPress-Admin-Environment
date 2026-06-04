# Screen Spec: Themes

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/themes.php` (installed grid) + `wp-admin/theme-install.php` (browse/install) + `wp-admin/includes/class-wp-theme-install-list-table.php`
**Current workspace coverage:** `core:themes` → `src/apps/themes/index.js` (native; DataViews grid + table over the `root/theme` entity, registered in `src/runtime/registry/builtins.js`). See `src/apps/themes/app.md`. Add-new (.org browse) / ZIP upload remain iframe-only.

This spec describes the **semantic surface** of the Themes screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

The screen is a single conceptual surface with two modes — **Installed** (the local theme library) and **Add new** (.org browse + ZIP upload). Treat them as one app with an internal mode switch, mirroring how core links them.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `themes` |
| Display name | "Themes" / "Add Themes" (mode-dependent) |
| Original URL | `/wp-admin/themes.php` (installed), `/wp-admin/theme-install.php` (add new) |
| Menu location | Submenu of Appearance |
| Submenu items | Themes (this screen), Editor (Site Editor), Patterns, Customize (legacy) |
| Parent app | Appearance group |
| Sub-screens | Theme detail (modal), Add New (mode switch), Live Preview / Customize (Site Editor or Customizer) |

The same screen serves block themes, classic themes, and child themes. Differences are entirely data-driven from `is_block_theme`, `parent`, and theme support flags.

---

## 2. Purpose

Browse the installed theme library, see which theme is active, switch between themes, install new themes from the WordPress.org directory, upload a ZIP, and remove unused themes. Secondary use: enabling/disabling per-theme auto-updates and reviewing parent/child relationships.

Jobs to be done:
- **See what's installed and which is active** — at-a-glance grid with the active theme distinguished.
- **Switch active theme** — single action with confirmation if destructive.
- **Preview before activating** — Live Preview (classic) or Site Editor preview (block themes).
- **Discover new themes** — search the .org directory by keyword, popularity, recency, feature tags, or favorites.
- **Install from a ZIP** — for paid/private themes not on .org.
- **Remove inactive themes** — disk hygiene; security best practice.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `switch_themes` OR `edit_theme_options` | `themes.php` lines 12–18 |
| Activate a theme | `switch_themes` | `themes.php` lines 20–35 |
| Delete a theme | `delete_themes` (single-site); `manage_network_themes` (multisite) | `themes.php` lines 56–83 |
| Install from .org | `install_themes` | `theme-install.php` line 15 |
| Upload ZIP | `upload_themes` (multisite-aware; falls back to `install_themes` on single-site) | `theme-install.php` line 178 |
| Resume a paused theme | `resume_theme` (per-theme cap) | `themes.php` lines 36–55 |
| Toggle auto-updates | `update_themes` AND `wp_is_auto_update_enabled_for_type('theme')` | `themes.php` lines 84–123 |
| Customize / Live Preview | `edit_theme_options` AND `customize` | `themes.php` lines 171–184 |

**Permission-denied state:** if user lacks both `switch_themes` and `edit_theme_options`, core renders `wp_die()`. Mirror this — render a "no access" empty state, not blank.

**Multisite:** theme installation is gated to network admin (`theme-install.php` lines 19–22 redirect to `network_admin_url('theme-install.php')`). The workspace should detect `is_multisite() && ! is_network_admin()` and either redirect to the network screen or show an inline notice with a deep link. Per-site enabling/disabling via `WPMU_PLUGIN_DIR` rules is out of scope for v1 (see Out of scope).

---

## 4. Data model

### Primary entity
- **Type:** Theme (not a custom post type — themes are filesystem-derived)
- **REST endpoint:** `GET /wp/v2/themes` (`WP_REST_Themes_Controller`)
- **Single-record endpoint:** `GET /wp/v2/themes/{stylesheet}` — `stylesheet` may include a slash for child themes (e.g. `twentytwentyfour/child`); regex pattern `[^\/:<>\*\?"\|]+(?:\/[^\/:<>\*\?"\|]+)?`

### Fields used by the installed grid
| Field | REST path | Type | Notes |
|---|---|---|---|
| `stylesheet` | `stylesheet` | string | unique identifier; URL-safe with one optional slash |
| `template` | `template` | string | parent stylesheet for child themes; equals `stylesheet` for non-child |
| `name` | `name.rendered` / `name.raw` | string | display |
| `description` | `description.rendered` / `description.raw` | string | display |
| `author` | `author.rendered` / `author.raw` | string | display |
| `author_uri` | `author_uri.rendered` / `author_uri.raw` | URL | optional link |
| `theme_uri` | `theme_uri.rendered` / `theme_uri.raw` | URL | optional link |
| `version` | `version` | string | semver-ish |
| `screenshot` | `screenshot` | URL | thumbnail; may be empty |
| `tags` | `tags.rendered[]` / `tags.raw[]` | string[] | feature tags |
| `textdomain` | `textdomain` | string | i18n domain |
| `requires_wp` | `requires_wp` | string | minimum WP version |
| `requires_php` | `requires_php` | string | minimum PHP version |
| `is_block_theme` | `is_block_theme` | bool | drives "Editor" vs "Customize" action |
| `status` | `status` | string | `active` or `inactive` |
| `theme_supports` | `theme_supports.{...}` | object | per-feature support map (`align-wide`, `formats`, `post-thumbnails`, etc.) |

### Active-theme summary (top of grid)
The active theme is rendered as a wide detail block above the grid: large screenshot, name, version, author, description, tags, and contextual actions (Customize / Site Editor / theme-specific links). Source: same record, filtered by `?status=active`.

### Query parameters
- `status` — `active` returns only the current theme; omitted returns all installed
- `context` — `view` (default) returns rendered fields; `edit` returns raw + rendered

### Add-new screen data
The .org browse mode does **not** use `/wp/v2/themes`. It calls the **WordPress.org Themes API** (`api.wordpress.org/themes/info/1.2/`) via `themes_api()` server-side, brokered through admin-ajax (`wp_ajax_query_themes`, `wp_ajax_install_theme`, `wp_ajax_delete_theme`).

| Add-new field | Source | Notes |
|---|---|---|
| `id` (slug) | .org API | matches future installed `stylesheet` |
| `name`, `author`, `version`, `description` | .org API | display |
| `screenshot_url` | .org API | preview thumbnail |
| `preview_url` | .org API | iframe preview src |
| `download_link` | .org API | ZIP URL |
| `rating`, `num_ratings` | .org API | star block |
| `homepage` | .org API | external link |
| `installed` | client-side derived | match `id` against installed `stylesheet` list |
| `compatible_wp` | client-side or .org API | gates Activate/Install button |
| `compatible_php` | client-side or .org API | gates Activate/Install button |

### Non-REST data (gaps)
- **`POST /wp/v2/themes`** — does not exist. Activation, install, delete, upload all go through admin-ajax. The workspace should propose `POST /wp/v2/themes/{stylesheet}/activate`, `POST /wp/v2/themes` (install from .org slug), `POST /wp/v2/themes/upload` (multipart), `DELETE /wp/v2/themes/{stylesheet}` as the v2 surface.
- **Auto-updates list** — stored in site option `auto_update_themes` (`get_site_option('auto_update_themes')`). Read via `GET /wp/v2/settings` if added to the auto-updates registration; today only the toggle endpoint exists at `wp_ajax_toggle_auto_updates`.
- **Theme update notices** — `wp_get_update_data()` populates the in-page banner. REST has no per-theme update endpoint; use `GET /wp/v2/themes` extended with an `update_available` field as a gap proposal.
- **WordPress.org Themes API** — public, unauthenticated, but cross-origin. The workspace will need a server-side proxy at `/wp-admin-workspaces/v1/themes-directory` that wraps `themes_api()`. Document as a v1 gap.

---

## 5. Layout regions (semantic)

### Installed mode
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Themes")                                         │
│  ├─ Primary action: "Add New Theme"                          │
│  └─ Search input (filters installed grid)                    │
├─────────────────────────────────────────────────────────────┤
│ ACTIVE THEME BLOCK                                           │
│  ├─ Large screenshot (left)                                  │
│  ├─ Name + version + author                                  │
│  ├─ Description                                              │
│  ├─ Tags                                                     │
│  ├─ Parent/child indicator                                   │
│  └─ Action cluster: Customize / Editor / theme-specific      │
├─────────────────────────────────────────────────────────────┤
│ GRID                                                         │
│  └─ Card per theme (screenshot, name, version, hover-revealed│
│      Activate / Live Preview / Theme Details)                │
├─────────────────────────────────────────────────────────────┤
│ EMPTY STATE                                                  │
│  └─ "No themes match your search"                            │
└─────────────────────────────────────────────────────────────┘
```

### Add-new mode
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Add Themes")                                     │
│  ├─ Action: "Upload Theme" (toggles upload form)             │
│  └─ Back to "Themes"                                         │
├─────────────────────────────────────────────────────────────┤
│ UPLOAD FORM (collapsed by default)                           │
│  ├─ File input (.zip)                                        │
│  └─ "Install Now"                                            │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Sort tabs: Featured | Popular | Latest | Block Themes |  │
│  │           Favorites                                       │
│  ├─ Search                                                   │
│  ├─ "Feature Filter" toggle (drawer with checkbox groups)    │
│  └─ Favorites: WP.org username input                         │
├─────────────────────────────────────────────────────────────┤
│ FEATURE FILTER DRAWER (when expanded)                        │
│  └─ Grouped checkboxes (Subject, Features, Layout)           │
├─────────────────────────────────────────────────────────────┤
│ GRID                                                         │
│  └─ Card per theme (screenshot, name, author, Install button,│
│      Preview button, install/active overlay)                 │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination (infinite scroll in core, paged acceptable)   │
└─────────────────────────────────────────────────────────────┘
```

### Theme detail modal
Shared between modes. Slideshow of screenshots (single screenshot for most themes), name, version, author, description, tags, ratings (add-new only), Activate / Install / Live Preview / Delete.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading installed | First fetch | Card-shaped skeleton grid; preserve layout |
| Loading add-new | Tab change or search | Inline spinner above grid; prior results visible |
| Empty installed | `total === 1` (only active theme) | Active theme block + "Add New Theme" CTA below |
| Empty filtered | Search yields nothing | "No themes match your search" + clear button |
| Empty add-new | .org returns 0 | "No themes found. Try a different search." |
| Error (network) | Fetch failure | Inline banner with retry; preserve filter state |
| Error (.org down) | `themes_api()` returns WP_Error | "WordPress.org is unavailable. Try again later." |
| Permission denied | 403 from REST | "You don't have permission to manage themes." |
| Installation in progress | Install button clicked | Card overlay with progress text + spinner |
| Installation success | AJAX returns success | Card flips to "Installed" + Activate button |
| Installation failure | AJAX returns error | Inline error in card with retry |
| Activation in progress | Activate clicked | Card overlay; whole grid disabled |
| Activation success | Reload | Snackbar "Theme activated" + active block updates |
| Theme deletion confirmation | Delete clicked | Modal: "Delete {name}? This cannot be undone." |
| Theme paused | `theme.errors() === 'theme_paused'` | Card shows "Paused — Resume" affordance |
| Incompatible WP/PHP | `compatible_wp === false` or `compatible_php === false` | Card disabled with "Cannot install/activate" + reason |
| Upload in progress | ZIP submitted | Modal with WP_Filesystem progress lines |

---

## 7. Actions

### Header actions
- **Add New Theme** — switches to add-new mode (or opens it as a sub-screen). Required cap: `install_themes`.
- **Upload Theme** (add-new mode) — toggles upload form. Required cap: `install_themes`.

### Per-card actions (installed)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Theme Details | none | Modal | Opens detail modal; no destructive effect |
| Activate | `switch_themes` | Mutation | Activates this theme. Confirmation NOT required by core, but the workspace SHOULD prompt because the result is sitewide. |
| Live Preview | `edit_theme_options` + `customize` | Navigation | Classic themes: Customizer with `theme={stylesheet}`. Block themes: Site Editor preview mode. |
| Customize | `edit_theme_options` + `customize` | Navigation | Active theme only. Same destinations as Live Preview. |
| Delete | `delete_themes` | Mutation | Inactive themes only. Double-confirm. Cannot delete the active theme or its parent (if active is a child). |
| Resume | `resume_theme` | Mutation | Paused themes only. Restarts a fatal-errored theme. |
| Enable / Disable auto-updates | `update_themes` | Mutation | Per-theme toggle. |

### Per-card actions (add-new)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Preview | none | Modal | Iframe preview from `preview_url` |
| Install | `install_themes` | Mutation | Downloads ZIP, extracts to `wp-content/themes/`. Shows progress. |
| Install + Activate | `install_themes` + `switch_themes` | Mutation | Two-step combined; only after install succeeds |

### Bulk actions
N/A — core does not have bulk actions on the themes screen. Workspace may add bulk delete and bulk auto-update toggle as a follow-up.

### Optimistic vs. blocking
- **Activate** — blocking. Sitewide consequences; require server confirmation before reflecting in UI.
- **Delete** — blocking. Filesystem mutation, double-confirm.
- **Install** — blocking with progress streaming. Shows download/extract phases.
- **Auto-update toggle** — optimistic. Lightweight option write.
- **Resume** — blocking. Filesystem read on next request.

---

## 8. Filters, sort, search, pagination

### Installed filters
| Filter | Field | Operators | Source of options |
|---|---|---|---|
| Search | `name` + `description` + `author` + `tags` | substring | Live filter on local list |
| Status | `status` | `is` | `active` / `inactive` (implicit; UI distinguishes the active card visually) |

### Add-new filters
| Filter | Field | Operators | Source of options |
|---|---|---|---|
| Sort | implicit | `is` | `featured` / `popular` / `new` (Latest) / `block-themes` / `favorites` |
| Search | keyword | substring | .org API `search` param |
| Feature Filter | `tags` | `isAll` | `get_theme_feature_list()` — grouped by Subject / Features / Layout |
| Favorites | username | `is` | .org API `user` param; cached in user meta `wporg_favorites` |

### Sort
Installed: alphabetical by name (active theme always first).
Add-new: per the sort tab (server-driven).

### Search
Single full-text input. Installed: debounced client-side (150ms). Add-new: debounced server-side (300ms) via .org API.

### Pagination
Installed: no pagination — full list rendered (theme counts are typically <50).
Add-new: core uses infinite scroll; paged is acceptable. Default page size 36 (matches core).

---

## 9. Forms & inputs

### Upload theme form
| Field | Type | Required | Notes |
|---|---|---|---|
| Theme zip file | file (`.zip`) | yes | Multipart upload; max size = `upload_max_filesize` |

Validation: server validates ZIP structure (`unzip_file()`), required `style.css` header (`Theme Name`), and prevents path traversal. Client-side: extension + file size pre-check.

Save semantics: blocking. Show progress phases (uploading → unzipping → installing). Success flips to "Installed — Activate?" prompt. Failure shows the WP_Error message verbatim.

### Wporg favorites form
| Field | Type | Required | Notes |
|---|---|---|---|
| WordPress.org username | text | yes | Persisted to user meta `wporg_favorites`; nonce-protected |

### Activation confirmation
| Field | Type | Required | Notes |
|---|---|---|---|
| Confirm checkbox | bool | optional | "I understand this will change my live site" — workspace-added; not in core |

### Delete confirmation
| Field | Type | Required | Notes |
|---|---|---|---|
| Confirm | text match | yes | Type theme name to confirm; workspace-added safety; not in core |

---

## 10. Routing & URL state

Original wp-admin URL params:
- `themes.php?activated=true` — flash after activation
- `themes.php?deleted=true` — flash after delete
- `themes.php?action=activate&stylesheet={slug}&_wpnonce={n}` — activation handler
- `themes.php?action=delete&stylesheet={slug}&_wpnonce={n}` — delete handler
- `themes.php?action=resume&stylesheet={slug}&_wpnonce={n}` — resume handler
- `theme-install.php?tab={popular|new|block-themes|favorites|search|upload}` — sort tab
- `theme-install.php?search={q}` — search query
- `theme-install.php?browse={tag}` — feature filter
- `theme-install.php?theme={slug}` — direct deep-link to detail modal

The workspace uses hash-based routing under `#/themes`. Recommended URL state:
```
#/themes                                  # installed grid
#/themes?search=portfolio                 # filtered installed
#/themes/{stylesheet}                     # detail modal
#/themes/add                              # add-new mode
#/themes/add?sort=block-themes&search=blog
#/themes/add/{slug}                       # detail of .org theme
```

Browser back/forward must restore mode + filters. Refresh must restore mode + filters. Sharing the URL must reproduce the view.

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)
| Trigger | Destination | Carry |
|---|---|---|
| Click "Customize" / "Live Preview" (block theme) | `core:site-editor` | `?theme={stylesheet}` (preview mode) |
| Click "Customize" / "Live Preview" (classic theme) | external (Customizer) | `?theme={stylesheet}` |
| Click "Editor" on active block theme | `core:site-editor` | none |
| Click theme author URL | external | new tab |

### Inbound (other apps → this screen)
- From Site Editor "Switch theme" (block themes) — return to themes grid
- From an update notification → themes grid filtered to themes-with-updates
- From command palette → quick navigation, optionally with search query

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Activation success | Snackbar: "{Theme Name} activated" + "Customize" link |
| Activation failure | Banner: "Could not activate {name}: {reason}" |
| Delete success | Snackbar: "{name} deleted" |
| Delete failure | Banner with retry |
| Install start | Modal with phased progress (download → unzip → install) |
| Install success | Modal closes; card updates to "Installed"; snackbar "{name} installed" |
| Install failure | Modal shows error; "Try Again" button |
| Upload too large | Inline form error before submit |
| Upload structure invalid | Server-returned WP_Error rendered in modal |
| Auto-update toggled | Snackbar: "Auto-updates enabled for {name}" |
| WP/PHP incompatible | Persistent inline notice on card |
| Theme paused detected | Persistent banner above grid: "{name} caused a fatal error and was paused." |
| Network error mid-action | Banner; preserve user state; retry |

Undo for delete: not supported — filesystem mutation. Surface a "View deleted theme on .org" link as a partial recovery.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `n` (when not in input) | Add new theme |
| `Tab` / `Shift+Tab` | Move card focus |
| `Enter` | Open theme detail modal on focused card |
| `Esc` | Close modal / clear search |
| `Arrow keys` (in detail modal) | Previous / Next theme |

### ARIA & focus
- Grid: `role="list"` with `role="listitem"` cards (not `role="grid"` — single-column-keyboard nav not appropriate).
- Active theme card: `aria-current="true"` and visible "Active" badge.
- Hover-revealed actions must be keyboard-reachable (focus shows them).
- Detail modal: `role="dialog"` + focus trap + `aria-labelledby` on theme name.
- After delete: focus moves to the next card (or active block if last).
- After activate: focus moves to active theme block.
- Loading state: `aria-busy="true"` on the grid container.

### Screen reader
- Card label includes theme name + "(Active)" when active.
- Install progress announced via live region: "Installing {name}, downloading…", "Unzipping…", "Done."
- Sort tab change announced.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `themes_api` / `themes_api_args` | Modify .org API requests | **Drop** — server-side only; workspace proxy controls this. |
| `theme_action_links` / `theme_action_links_{stylesheet}` | Per-theme action links | Replace with workspace `actions` slot keyed by `core:themes.theme-actions`. |
| `wp_prepare_themes_for_js` | Munge data sent to JS | Replace with workspace field-level `render` registry. |
| `install_themes_tabs` | Add/remove sort tabs | Replace with workspace-level filter API. |
| `install_themes_table_api_args_{tab}` | Modify .org request per tab | Drop — replaced by workspace proxy + tab definitions. |
| `current_screen` listeners adding scripts | Add UI | Replace with `core:themes.before` / `.after` slots. |

Plugin compatibility note: third-party plugins relying on the original hooks won't work in the workspace. Document this prominently. Provide a migration shim only if/when ecosystem demand justifies it.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** `core:themes` → `src/apps/themes/index.js`, registered in `src/runtime/registry/builtins.js`.
- **What works:** native installed-themes browser — DataViews grid (default) + table layout over the `root/theme` entity, with Activate via the custom `POST /wp-admin-workspaces/v1/activate-theme` endpoint (cap-gated on `switch_themes`); on failure it surfaces an error snackbar and keeps the user in the workspace. See `src/apps/themes/app.md`.
- **What's still iframe-only:** Add-new (.org browse) and ZIP upload (`iframe:theme-install.php`).
- **Note:** the Gaps table below predates the native app (it still lists "Register `core:themes`" as a gap) and may overstate what's missing; treat `app.md` as canonical.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Register `core:themes` app source | High | New app component on top of `/wp/v2/themes` |
| Active theme block | High | Distinct UI region above grid |
| Theme grid (cards) | High | DataViews `grid` layout candidate |
| Theme detail modal | High | Slideshow + meta + actions |
| Activate action | High | Needs new REST endpoint `POST /wp/v2/themes/{stylesheet}/activate` (gap) |
| Delete action | High | Needs new `DELETE /wp/v2/themes/{stylesheet}` (gap) |
| Add-new mode (.org browse) | High | Needs server-side proxy `/wp-admin-workspaces/v1/themes-directory` |
| Sort tabs (popular/new/block-themes/favorites) | High | Maps to .org API `browse` param |
| Feature filter | High | Group of checkboxes; .org `tag` array |
| Search | High | Live + .org search |
| ZIP upload | High | Needs `POST /wp/v2/themes/upload` (gap; admin-ajax `upload-theme` today) |
| Install progress | Medium | Phased progress UI; admin-ajax `install-theme` |
| Auto-update toggles | Medium | New REST surface needed (option `auto_update_themes`) |
| Theme paused / Resume | Low | Edge case; surfaces only when `theme.errors()` is non-empty |
| Multisite gating + redirect | Medium | Detect and route correctly |
| Compatibility warnings (WP/PHP) | Medium | Reads `requires_wp` / `requires_php` from theme record |
| Live Preview / Customize routing | High | Branch on `is_block_theme` |
| Favorites WP.org username persistence | Low | User meta `wporg_favorites` |
| Theme update banner | Medium | `wp_get_update_data()` equivalent via REST |
| Keyboard shortcuts | Medium | `/`, `n`, arrow nav in modal |
| ARIA polish | High | `aria-current` for active, live regions for install progress |

### Acceptable interim
For v1 of any new workspace config, `iframe:themes.php` is acceptable as an escape hatch. Mark such configs explicitly so they're tracked for replacement.

---

## 16. Out of scope

- **Per-site theme enabling/disabling on multisite** — managed in network admin via `WPMU_PLUGIN_DIR`; defer to v2 multisite work.
- **Theme update execution** — handled by the broader "Updates" screen (`update-core.php`); themes screen only surfaces availability and toggles.
- **Customizer** — legacy/classic-theme deprecated per project rules; only block-theme path is rebuilt natively.
- **Theme rating submission** — read-only display; submitting ratings goes to .org.
- **Per-theme network enable/disable UI** — multisite-only; v1 redirects to network admin.

---

## 17. Reference

- Original PHP: `wp-admin/themes.php`, `wp-admin/theme-install.php`
- Helper functions: `wp-admin/includes/theme.php`, `wp-admin/includes/theme-install.php`
- AJAX handlers: `wp-admin/includes/ajax-actions.php` (`wp_ajax_query_themes`, `wp_ajax_install_theme`, `wp_ajax_update_theme`, `wp_ajax_delete_theme`, `wp_ajax_toggle_auto_updates`)
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-themes-controller.php`
- REST schema: `https://developer.wordpress.org/rest-api/reference/themes/`
- WordPress.org Themes API: `https://api.wordpress.org/themes/info/1.2/` (read-only, public)
- Theme registration: `wp-includes/class-wp-theme.php`
- Cross-link: `docs/screens/site-editor.md` (block-theme Live Preview / Customize destination)
- Cross-link: `docs/screens/theme-file-editor.md` (Edit code action)
