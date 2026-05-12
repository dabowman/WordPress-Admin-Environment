# Screen Spec: Site Editor (overview + canvas + save flow)

**Status:** Tier 2 — full spec. Split across three files due to scope.
**Source PHP:** `wp-admin/site-editor.php`
**Current shell coverage:** `core:site-editor` → `src/runtime/apps/SiteEditorApp.js` — iframe-backed adapter (M4). Native `@wordpress/edit-site` mount deferred to v2 (per `wp-admin-shell-v1-plan.md` §M4 risk: four package-collision issues are individually tractable but bundled exceed the v1 calendar).

This spec describes the **semantic surface** of the Site Editor SPA. It does not prescribe component names, CSS, or specific React APIs.

This file covers: entry, hub navigation, editor canvas, multi-entity save flow, zoom-out / pattern-insertion mode, Pages from Site Editor.

**Companion files:**
- [`site-editor-styles.md`](./site-editor-styles.md) — Global Styles deep dive (typography, colors, layout, blocks panel, style variations, sections, revisions).
- [`site-editor-templates.md`](./site-editor-templates.md) — Templates / Template Parts / Patterns / Navigation list views.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `site-editor` |
| Display name | "Editor" (admin menu); "Site Editor" (full name) |
| Original URL | `/wp-admin/site-editor.php` |
| Menu location | Submenu of Appearance |
| Submenu items | None — internal hub provides own navigation |
| Parent app | Appearance group |
| Sub-screens | Design hub / Templates / Template Parts / Patterns / Navigation / Styles / Pages — each with list and edit modes |

The Site Editor is a **SPA**, not a stack of separate pages. Sub-screens are internal routes, not separate admin pages. The shell wraps the SPA's outer chrome but lets the inner SPA own everything from the second-level navigation inward.

**Block-theme requirement:** The Site Editor only works on block themes. Classic themes get redirected to Customizer (out of scope here). Detect with `wp_is_block_theme()` (PHP) or by checking the active theme's `is_block_theme` flag from `/wp/v2/themes?status=active`.

---

## 2. Purpose

Edit every visual aspect of a block theme — templates that drive page rendering, template parts (header/footer/general), reusable patterns, navigation menus, global typography/color/layout styles, and individual pages. Replaces both the Customizer and `theme-editor.php` for block themes.

Jobs to be done:
- **Edit the homepage** — open Pages → Front Page (or Templates → Home) → block editor.
- **Change site-wide typography or colors** — Styles → Typography / Colors → save.
- **Add a footer link** — Patterns → Footer template part → edit → save.
- **Replace the navigation menu** — Navigation → swap or edit current menu.
- **Try a pre-designed style variation** — Styles → Browse styles → activate.
- **Compare and revert a styles change** — Styles → Revisions → choose snapshot → restore.
- **Create a new template** — Templates → "+ Add New Template" → choose type (404, archive, single, etc.).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_theme_options` | `site-editor.php` lines 14–20 |
| Edit templates | `edit_theme_options` (post-type cap mapping) | `register_post_type('wp_template', …)` in `wp-includes/post.php` |
| Edit template parts | `edit_theme_options` | `register_post_type('wp_template_part', …)` |
| Edit patterns (`wp_block`) | `edit_posts` (default for `wp_block`) | `wp-includes/post.php` |
| Edit navigation (`wp_navigation`) | `edit_theme_options` | `wp-includes/post.php` line ~570 |
| Edit global styles | `edit_theme_options` (custom: `edit_others_posts` mapped) | `WP_REST_Global_Styles_Controller::permissions_check` |
| Edit pages | `edit_pages` / `edit_others_pages` / `publish_pages` | post-type `page` defaults |
| Export theme | `edit_theme_options` | `WP_REST_Edit_Site_Export_Controller` |

**Permission-denied state:** core renders `wp_die()` with 403. Mirror this with a "no access" empty state.

**Multisite:** site-level capability checks suffice; no special multisite handling at the SPA level.

---

## 4. Data model

The Site Editor reads and writes many entities. This file lists the top-level set used by the canvas + save flow. Per-entity field detail lives in the companion files.

### Entities edited
| Entity | REST endpoint | Post type / object | Notes |
|---|---|---|---|
| Templates | `/wp/v2/templates` | `wp_template` | Theme-bundled (read-only, file-backed) and user (DB-backed, override theme) |
| Template Parts | `/wp/v2/template-parts` | `wp_template_part` | Same dual model as templates |
| Patterns (user) | `/wp/v2/blocks` | `wp_block` | DB-backed reusable patterns |
| Patterns (theme) | `/wp/v2/block-patterns/patterns` | `WP_REST_Block_Patterns_Controller` | Read-only; declared in theme `patterns/` |
| Pattern categories | `/wp/v2/block-patterns/categories` | n/a | Read-only |
| Navigation | `/wp/v2/navigation` | `wp_navigation` | DB-backed menu blocks |
| Navigation fallback | `/wp-block-editor/v1/navigation-fallback` | n/a | Resolves first/best nav for empty state |
| Global Styles (user) | `/wp/v2/global-styles/{id}` | `wp_global_styles` | One per active theme; ID from `WP_Theme_JSON_Resolver::get_user_global_styles_post_id()` |
| Global Styles (theme) | `/wp/v2/global-styles/themes/{stylesheet}` | n/a | Read-only theme.json compilation |
| Style variations | `/wp/v2/global-styles/themes/{stylesheet}/variations` | n/a | Read-only; theme `styles/*.json` |
| Global Styles revisions | `/wp/v2/global-styles/{id}/revisions` | n/a | Versioned snapshots |
| Pages | `/wp/v2/pages` | `page` | Standard pages REST |
| Settings (front-page, posts-page) | `/wp/v2/settings` | n/a | `page_on_front`, `page_for_posts`, `show_on_front` |
| Site icon / logo | `/wp/v2/settings` | n/a | `site_icon`, `site_logo` (media IDs) |
| Active theme | `/wp/v2/themes?status=active` | n/a | Resolves `stylesheet` for global-styles paths |
| Export ZIP | `/wp-block-editor/v1/export` | n/a | Streams theme ZIP including user changes |

### Preload (server-side)
`site-editor.php` uses `block_editor_rest_api_preload()` to warm a fixed set of REST paths into the page (lines 181–238). Replicate this pattern in the shell — the SPA expects these paths to be hot. Notable preloads:
- `/wp/v2/types/wp_template?context=edit`
- `/wp/v2/types/wp_template_part?context=edit`
- `/wp/v2/templates?context=edit&per_page=-1`
- `/wp/v2/template-parts?context=edit&per_page=-1`
- `/wp/v2/themes?context=edit&status=active`
- `/wp/v2/global-styles/{id}?context=edit`
- `/wp/v2/global-styles/themes/{stylesheet}?context=view`
- `/wp/v2/global-styles/themes/{stylesheet}/variations?context=view`
- `/wp/v2/navigation?per_page=100&order=desc&orderby=date&status[0]=publish&status[1]=draft`
- `/wp/v2/settings`
- `/wp/v2/block-patterns/categories`
- `/?_fields=description,gmt_offset,home,…,page_for_posts,page_on_front,show_on_front` — site root for read-only site facts

### Block editor settings
Server-computed settings injected via `wp.editSite.initializeEditor( "site-editor", settings )`:
- `siteUrl`, `postsPerPage`
- `styles` — block editor stylesheets (`get_block_editor_theme_styles()`)
- `defaultTemplateTypes` — array of `{slug, title, description}` from `get_default_block_template_types()`
- `defaultTemplatePartAreas` — `header` / `footer` / `uncategorized`
- `supportsLayout` — `wp_theme_has_theme_json()`
- `__experimentalAdditionalBlockPatterns`, `…BlockPatternCategories` — back-compat
- All registered server-side block schemas (`wp.blocks.unstable__bootstrapServerSideBlockDefinitions`)
- All registered block bindings sources

### Non-REST data (gaps)
- **Block schema bootstrap** — server pushes block definitions inline. Shell must replicate or the canvas won't recognize server-registered blocks.
- **Theme export ZIP** — `POST /wp-block-editor/v1/export` returns a `application/zip` body, not JSON. Handle as a file download.
- **`/wp/v2/templates/lookup`** — resolves a slug to the matching template (e.g. `?slug=front-page` or `?slug=page-{slug}`). Used to choose which template renders a given URL.

---

## 5. Layout regions (semantic)

The Site Editor renders as a **two-pane SPA**: a left **Hub** (compact navigator) and a right **Canvas** (frame or list view). When editing, the Hub collapses and the Canvas expands.

### Hub mode (default landing)
```
┌──────────────────┬──────────────────────────────────────────┐
│ HUB (collapsible)│ CANVAS / LIST                            │
│  ├─ Site icon    │  ├─ Site preview iframe (front page)     │
│  ├─ Site title   │  └─ Or list view per sub-screen          │
│  ├─ Back arrow   │                                           │
│  ├─ Section nav: │                                           │
│  │  - Design     │                                           │
│  │  - Navigation │                                           │
│  │  - Styles     │                                           │
│  │  - Pages      │                                           │
│  │  - Templates  │                                           │
│  │  - Patterns   │                                           │
│  └─ "View site"  │                                           │
└──────────────────┴──────────────────────────────────────────┘
```

### Edit mode
```
┌──────────┬───────────────────────────────────┬──────────────┐
│ TOOLBAR  │ CANVAS                            │ INSPECTOR    │
│ (top-bar)│  ├─ Block-editor iframe           │ (right-dock) │
│  ├─ Back │  ├─ Selected block toolbar        │  ├─ Block    │
│  ├─ Title│  └─ Block list                    │  ├─ Document │
│  ├─ Save │                                   │  │  - Sticky │
│  ├─ Undo │                                   │  │  - Tax    │
│  ├─ Redo │                                   │  │  - Templ. │
│  ├─ View │                                   │  └─ Styles   │
│  └─ ⋯    │                                   │              │
├──────────┴───────────────────────────────────┤              │
│ LIST VIEW (toggleable left dock)             │              │
│  └─ Outline of blocks                        │              │
└────────────────────────────────────────────────────────────┘
```

### Zoom-out / pattern-insertion mode
Replaces the inspector with a pattern picker dock. Canvas zooms to ~50%. Used to insert full-page patterns, especially during initial template setup.
```
┌──────────┬───────────────────────────────────┬──────────────┐
│ TOOLBAR  │ ZOOMED CANVAS                     │ PATTERN PICK │
│          │  └─ Drop zones between sections   │  ├─ Search   │
│          │                                   │  ├─ Categories
│          │                                   │  └─ Pattern   │
│          │                                   │     thumbnails│
└──────────┴───────────────────────────────────┴──────────────┘
```

### Preview viewport sizes
Canvas supports three preview viewports: **Desktop**, **Tablet**, **Mobile**. Toolbar dropdown switches; canvas frame width adjusts. No DPR change.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading initial | First mount | Full-screen skeleton with hub silhouette |
| Loading entity | Navigate to template/page | Inline loading bar in canvas |
| Empty navigation | No `wp_navigation` published | Fallback resolved via `/wp-block-editor/v1/navigation-fallback` |
| Empty pages list | `total === 0` | Empty state + "Create page" CTA |
| Empty patterns | `total === 0` | "No patterns yet" + "Create pattern" CTA |
| Edit mode dirty | One+ entities modified | Save button enabled + count badge |
| Saving | Save clicked | Save button → "Saving…" + progress; canvas locked |
| Save failed | Network or validation error | Per-entity error inline + "Try again" toolbar action |
| Conflict | Server returned newer version | Modal: "This was modified elsewhere. Discard or overwrite?" |
| Theme not block-theme | `is_block_theme === false` | Redirect to Customizer (legacy); shell shows "Block themes only" empty state |
| Permission denied | 403 | "You don't have permission to edit theme options" |
| Pause / fatal error in editor | Iframe crashes | Error boundary; "Reload editor" button |
| Read-only template (theme-file-backed) | Editing a non-customized theme template | Banner: "You're viewing a template from your theme. Edits will create a customized version." Save creates a `wp_template` row, "reverting to original" deletes it. |
| Customized template | Has DB row | "Revert to theme" action available |
| Pre-publish flow | First save | Modal listing every entity to be saved |

---

## 7. Actions

### Toolbar actions (edit mode)
| Action | Type | Notes |
|---|---|---|
| Back to Hub | Navigation | Returns to whichever sub-screen was active |
| Document title | Inline edit | Click to rename (templates only); pages use post title |
| Save | Mutation (multi-entity) | Opens pre-publish checklist if first save; otherwise direct save |
| Undo / Redo | Mutation | History managed in `core/block-editor` store |
| View viewport | Toggle | Desktop / Tablet / Mobile |
| List view | Toggle | Left dock with block outline |
| More menu (⋯) | Menu | Distraction-free, top toolbar fixed, code editor mode, copy all blocks, keyboard shortcuts |
| Inspector toggle | Toggle | Right dock: Block / Document / Styles tabs |

### Hub actions
| Action | Type | Notes |
|---|---|---|
| Switch sub-screen | Navigation | Design / Navigation / Styles / Pages / Templates / Patterns |
| View site | External | Opens published site (`home_url()`) in new tab |
| Edit site icon / logo | Inline | Triggers media picker; updates settings |

### List-mode actions
Per sub-screen — see companion specs.

### Per-block actions (canvas)
| Action | Type |
|---|---|
| Move up/down | Mutation |
| Duplicate | Mutation |
| Delete | Mutation |
| Insert before/after | Mutation |
| Group | Mutation |
| Convert to pattern (`wp_block`) | Mutation — creates new entity |
| Convert to template part | Mutation — creates new entity |
| Lock | Mutation (block attribute) |

### Optimistic vs. blocking
- **Block edits in canvas** — optimistic (local store) until Save.
- **Save** — blocking. Multi-entity transaction with progress.
- **Discard changes** — optimistic, undoable via Undo stack.
- **Revert template to theme** — blocking. Requires DELETE on `wp_template`.

---

## 8. Filters, sort, search, pagination

The hub is a navigator, not a filterable list — see companion specs for sub-screen filter/sort behavior.

### Pre-publish save checklist
| Aspect | Behavior |
|---|---|
| Group | One row per dirty entity |
| Toggle | Per-entity checkbox to opt out of saving |
| Default | All checked |
| Action | "Save" applies all checked; preserves opt-outs as still-dirty |

---

## 9. Forms & inputs

The canvas is a form for the entity being edited (template, page, pattern, navigation). Field set is per-entity (see companion files).

### Universal canvas inputs
- **Block content** — managed by `@wordpress/block-editor`'s `BlockEditorProvider` + `BlockList`.
- **Document title** — for templates: short string, slug-like. For pages: post title. For patterns: name.
- **Document slug** — auto-derived; editable in inspector.

### Site icon / logo (Hub)
| Field | Type | Notes |
|---|---|---|
| Site icon | media (image, square, ≥512px) | Updates `site_icon` in settings |
| Site logo | media (image) | Updates `site_logo` in settings |
| Site title | text | Updates `name` in settings |
| Tagline | text | Updates `description` in settings |

### Save semantics
- **Save** — multi-entity. Iterates dirty entities; each issues a `PUT` (or `POST` for new patterns/navigation) to its REST endpoint.
- **Validation** — per-entity, server-side; show errors inline in the checklist.
- **Atomicity** — best-effort, not transactional. Failed entities remain dirty.

---

## 10. Routing & URL state

Original wp-admin URL params (consolidated by `_wp_get_site_editor_redirection_url()` in `site-editor.php` lines 22–111):

The post-6.8 canonical URL pattern is `site-editor.php?p={path}`:
- `?p=/` — Hub landing
- `?p=/page` — Pages list
- `?p=/page/{id}` — Edit page
- `?p=/template` — Templates list
- `?p=/wp_template/{id}` — Edit template
- `?p=/pattern` — Patterns list (also includes template parts after 6.5)
- `?p=/wp_block/{id}` — Edit user pattern
- `?p=/wp_template_part/{id}` — Edit template part
- `?p=/styles` — Global Styles
- `?p=/styles&section=/css` — Deep-link to CSS section in Styles
- `?p=/navigation` — Navigation list
- `?p=/wp_navigation/{id}` — Edit navigation
- `?canvas=edit` — opens edit mode immediately on supported routes

Pre-6.8 params (still redirected): `postType`, `postId`, `path`.

The shell uses hash-based routing under `#/site-editor`. Recommended URL state:
```
#/site-editor                              # hub landing
#/site-editor/templates                    # templates list
#/site-editor/templates/{id}               # edit template
#/site-editor/styles                       # styles panel
#/site-editor/styles/typography            # nested styles section
#/site-editor/styles/css                   # deep-link CSS editor
#/site-editor/pages                        # pages list
#/site-editor/pages/{id}?canvas=edit       # edit page
```

Browser back/forward must restore sub-screen + selection. Refresh must restore. Sharing the URL must reproduce the view.

**Iframe-backed v1:** the shell forwards hash changes into the iframe's `?p=` param via `postMessage` and listens for outbound URL changes to keep the shell hash in sync.

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)
| Trigger | Destination | Carry |
|---|---|---|
| Click "View site" | external | `home_url()` |
| Click page in pages list → "Edit in Posts editor" | `core:posts` | `?postType=page&id={id}` |
| Click "Themes" in hub menu | `core:themes` | none |
| Click "Templates" in hub menu | this screen, sub-route | `templates` |
| Click block author / extending plugin | `core:plugins` (future) | plugin slug |
| Export theme ZIP | external download | none |

### Inbound (other apps → this screen)
- From Themes "Customize" / "Live Preview" (block theme) → site-editor with optional preview-only mode
- From admin menu "Editor" → hub landing
- From command palette → hub or specific sub-screen
- From Pages app → site-editor edit mode for the selected page

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success (single entity) | Snackbar: "Saved" |
| Save success (multi-entity) | Snackbar: "{N} items saved" |
| Save failure (partial) | Banner above canvas listing failed entities + retry-each |
| Save failure (network) | Persistent banner; preserve dirty state |
| Conflict (409) | Modal: "Discard local / Overwrite remote / Cancel" |
| Permission error | Banner; redirect to hub |
| Theme exported | Snackbar: "Theme exported" + filename link |
| Template reverted | Snackbar: "Reverted to theme version" + Undo |
| Custom template created | Snackbar: "Template created" |
| Block insertion via pattern | No snackbar; canvas flashes inserted blocks |
| Style variation activated | Snackbar: "{Variation Name} applied" + Undo |

Undo for save: not directly — saved entities are the new baseline. Undo within the editor (Cmd+Z) reverses block-level changes; saving recreates them.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` | Undo / Redo |
| `Cmd/Ctrl+K` | Open command palette |
| `Cmd/Ctrl+B` / `I` / `U` | Bold / Italic / Underline (text blocks) |
| `Esc` | Exit selection / close modal / leave list view |
| `Cmd/Ctrl+/` | Show keyboard shortcuts panel |
| `Cmd/Ctrl+Alt+H` | List view toggle |
| `Cmd/Ctrl+Shift+,` | Inspector toggle |
| `Tab` / `Shift+Tab` | Move block focus |
| `Enter` | Insert paragraph after selected block |

### ARIA & focus
- Iframe canvas: `title` attribute describes editor.
- Block toolbar: floating, `role="toolbar"`.
- Inspector tabs: `role="tablist"` with `role="tab"` and `aria-selected`.
- Save modal: `role="dialog"` with focus trap.
- After save: focus returns to Save button; announcement via live region.
- After Undo/Redo: announcement via live region.

### Screen reader
- Document title changes announced.
- Block selection changes announced ("Heading block selected").
- Save status announced ("Saving…", "Saved").

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `block_editor_settings_all` | Modify editor settings | **Replace** with shell-level editor-settings registry. |
| `block_editor_rest_api_preload_paths` | Add preloaded REST paths | Replace with shell-level preload registry. |
| `enqueue_block_editor_assets` | Enqueue editor scripts/styles | Replace with `core:site-editor.assets` slot. |
| `register_block_type` (server-side) | Add custom block | Preserve — block registration is the canonical extensibility surface. |
| `register_block_pattern` | Add patterns | Preserve. |
| `theme.json` filters (`wp_theme_json_data_*`) | Modify theme.json data | Preserve — these are theme-system concerns. |
| `default_template_types` | Add template type definitions | Preserve. |

Plugin compatibility note: most third-party block / pattern / theme.json extensibility continues to work through Gutenberg's own registries. Shell-specific UI hooks (e.g. additional toolbar items) require migration.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:site-editor` → `src/runtime/apps/SiteEditorApp.js`
- **Strategy:** iframe-backed adapter. Loads `/wp-admin/site-editor.php` in an iframe with chrome-hiding CSS injected.
- **What works:** Full Site Editor functionality through iframe — all hub sub-screens, canvas editing, save flows, styles, revisions.
- **What doesn't:** No selection bridge into the shell's `useSelection`. No native shell command-palette integration. Hash routing is one-way (shell → iframe).

### Gaps vs. this spec (path to v2 native mount)
| Gap | Priority | Notes |
|---|---|---|
| Native `@wordpress/edit-site` mount | High (v2) | Four package collisions — see plan §M4 risk. Tracked individually as: (a) `wp-edit-site` script registration on shell page, (b) `wp-private-apis` registry isolation, (c) block editor store conflicts with shell's preview-region, (d) command palette double-registration. |
| Hub navigation surface in shell | Medium | If kept iframed, shell hub menu duplicates iframe hub nav — acceptable for v1, awkward. |
| Selection bridge | Medium | iframe → shell selection bus via postMessage |
| Hash sync | Low | Bidirectional hash sync via postMessage |
| Command palette merge | Medium | Iframe runs its own palette; shell's `core:command-palette` should forward Cmd+K into the iframe when it has focus, otherwise show shell commands. |
| REST preload via shell | Low | Replicate `block_editor_rest_api_preload()` from shell PHP for performance. |
| Theme export download | Low | Surface `POST /wp-block-editor/v1/export` as a shell command. |

### Acceptable interim
v1 ships with the iframe-backed adapter. Native mount is a v2 milestone. See companion specs for what list views inside the iframe look like — the shell may eventually surface those independently while keeping the canvas iframed.

---

## 16. Out of scope

- **Customizer** — legacy/classic-theme; deprecated per project rules.
- **Distraction-free mode toggle** — preserved as iframed toolbar action; not surfaced in shell chrome.
- **Block code editor mode** (HTML view) — preserved inside iframe; not surfaced.
- **Welcome guide modal** — first-run tutorial; not rebuilt.
- **Theme test drive** (live preview without activation, classic) — Customizer-only.

---

## 17. Reference

- Original PHP: `wp-admin/site-editor.php`
- URL redirector: `_wp_get_site_editor_redirection_url()` in `site-editor.php` lines 22–111
- Block editor settings: `wp-includes/block-editor.php::get_block_editor_settings()`
- Default template types: `wp-includes/block-template-utils.php::get_default_block_template_types()`
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-templates-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-global-styles-revisions-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-block-patterns-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-navigation-fallback-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-edit-site-export-controller.php`
- Post types: `wp-includes/post.php` (`wp_template`, `wp_template_part`, `wp_block`, `wp_navigation`, `wp_global_styles`)
- Templates registry: `wp-includes/class-wp-block-templates-registry.php`
- Theme JSON resolver: `wp-includes/class-wp-theme-json-resolver.php`
- Current shell impl: `src/runtime/apps/SiteEditorApp.js`
- Shell config example: `shells/developer-admin.json`
- Companion: [`site-editor-styles.md`](./site-editor-styles.md)
- Companion: [`site-editor-templates.md`](./site-editor-templates.md)
- Cross-link: [`themes.md`](./themes.md)
