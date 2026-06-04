# Screen Spec: Block Editor — Inspector Sidebar (Document & Block tabs)

**Status:** Tier 2 — companion to [`editor-block.md`](./editor-block.md). Read that first.
**Source PHP:** `wp-admin/edit-form-blocks.php` (preload paths + `meta-box-loader` URL); inspector itself is JS-only.
**JS package surface:** `@wordpress/editor` (`PluginDocumentSettingPanel`, `PluginPostStatusInfo`, `PluginSidebar`, `PostFeaturedImage`, `PostExcerpt`, `PostTaxonomies`, `PostPermalink`, `PostSchedule`, `PostVisibility`, `PostAuthor`, `PostSlug`, `PostFormat`, `PostSticky`, `PageAttributesPanel`, `PostDiscussionPanel`, `PostCustomFields`); `@wordpress/block-editor` (`BlockInspector`, `InspectorControls`).

This document covers the Settings sidebar — the right-docked panel that toggles via the Settings button, Cmd/Ctrl+Shift+, or `core/edit-post.toggleEditorPanelOpened`. Two tabs: **Document** and **Block**.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `editor.inspector` (sub-region of editor screen) |
| Display name | "Editor settings" |
| Visibility | Optional; toggleable; preference-persisted |
| Plugin sidebars | Multiple `PluginSidebar` instances appear as additional tabs/icons next to Settings |

---

## 2. Purpose

Configure document-level metadata (the things that aren't blocks) and block-specific attributes that don't fit on the floating block toolbar.

Jobs to be done:
- Set status / visibility / schedule.
- Edit slug / view permalink.
- Pick author / featured image / excerpt.
- Manage taxonomies (categories, tags, custom).
- Configure page attributes (parent, template, order).
- Tweak block-specific style options (color, typography, dimensions, border, position).
- Surface plugin-extended fields (Yoast SEO scores, Jetpack post-by-email, ACF fields).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| Open inspector | none beyond editor access | Toggle is preference |
| Edit Author | `edit_others_posts` for the post type | `PostAuthor` only renders the picker if user has cap |
| Edit Status to `publish` | `cap.publish_posts` | Otherwise capped to `pending` |
| Set sticky | `edit_others_posts` | post-type post only |
| Edit slug / permalink | `edit_post` + post-type `public` | Slug field hidden when post-type isn't viewable |
| Pick / change featured image | `upload_files` (to upload) + `edit_post` | `post_thumbnail_meta_box` cap behavior in classic; same in block editor's media modal |
| Discussion (open/close comments) | post-type supports `comments` | Panel hidden otherwise |
| Page attributes (parent / order / template) | `edit_others_posts` (parent picker) + post-type hierarchical / has-templates | Panel adapts |
| Custom Fields panel | `enable_custom_fields` user-meta opt-in | Hidden by default per user preference |
| Edit registered post-meta | `auth_callback` of each `register_post_meta` | Per-meta gate |

---

## 4. Data model

The inspector mutates the **same primary entity** (`postType:{type}:{id}`) documented in [`editor-block.md`](./editor-block.md) section 4. No additional REST endpoint is exclusive to the inspector; secondary endpoints (`/wp/v2/users`, `/wp/v2/categories`, `/wp/v2/tags`, `/wp/v2/media`) are read-only references.

Specific field bindings:

| Inspector control | Field on `postType` | Side endpoint |
|---|---|---|
| Status panel — Status select | `status` | — |
| Status panel — Visibility | `status` (`private`) + `password` | — |
| Status panel — Schedule | `date` (in future for `future` status) | — |
| Status panel — URL/Permalink | `slug`, `link`, `permalink_template` (read), `generated_slug` (read) | — |
| Status panel — Author | `author` | `GET /wp/v2/users?who=authors&per_page=100` |
| Featured Image panel | `featured_media` | `/wp/v2/media` |
| Excerpt panel | `excerpt.raw` | — |
| Discussion panel | `comment_status`, `ping_status` | — |
| Page Attributes panel | `parent`, `menu_order`, `template` | `/wp/v2/{rest_base}` (parent picker), `availableTemplates` from editor settings |
| Categories panel | `categories[]` | `/wp/v2/categories` (list + create on-the-fly) |
| Tags panel | `tags[]` | `/wp/v2/tags` |
| Custom taxonomy panel (per registered) | `{taxonomy.rest_base}[]` | `/wp/v2/{taxonomy.rest_base}` |
| Post Format | `format` | — |
| Sticky toggle | `sticky` | — |
| Custom Fields | `meta` | — |
| Plugin-registered registered-meta panel | `meta.{key}` | `register_post_meta` defines |

Server-rendered meta-boxes back-compat: rendered via `_wpMetaBoxUrl` (`post.php?post={id}&action=edit&meta-box-loader=true&meta-box-loader-nonce=…`). Result is HTML serialized into a hidden `#metaboxes` div, then mounted into specific inspector regions. Not REST.

---

## 5. Layout regions (semantic)

```
┌────────── INSPECTOR SIDEBAR ──────────┐
│ HEADER                                │
│  ┌─ Tabs ──────────────────────┐ × │  ← Settings tabs + close
│  │ Document  Block             │   │
│  └────────────────────────────┘     │
├───────────────────────────────────────┤
│ TAB: Document (default for empty sel) │
│  ├─ [plugin slot: PluginPostStatusInfo top extension area] │
│  ├─ Summary panel (consolidated 6.4+) │
│  │   ├─ Status & Visibility           │
│  │   ├─ Publish (Schedule)            │
│  │   ├─ URL / Permalink / Slug        │
│  │   ├─ Author                        │
│  │   ├─ [PluginPostStatusInfo slot]   │
│  │   ├─ Trash                         │
│  │   └─ Stick to top of blog (post)   │
│  ├─ Featured image                    │
│  ├─ Excerpt                           │
│  ├─ Discussion                        │
│  ├─ Page attributes (page / hier.)    │
│  ├─ Categories                        │
│  ├─ Tags                              │
│  ├─ {custom taxonomies}               │
│  ├─ Post Format                       │
│  ├─ Custom Fields (gated by pref)     │
│  ├─ {PluginDocumentSettingPanel slots}│
│  ├─ {meta-boxes side-context iframes} │
│  └─ Post Type panel (non-Posts CPTs)  │
├───────────────────────────────────────┤
│ TAB: Block (when block selected)      │
│  ├─ Block icon + name + description   │
│  ├─ {Block's own InspectorControls}   │
│  │   - Settings group (block-specific)│
│  │   - Color group                    │
│  │   - Typography group               │
│  │   - Dimensions group               │
│  │   - Border group                   │
│  │   - Position (sticky) group        │
│  ├─ Advanced panel                    │
│  │   ├─ HTML anchor                   │
│  │   └─ Additional CSS class(es)      │
│  └─ Block lock summary                │
└───────────────────────────────────────┘
```

Each panel is collapsible (preference-persisted via `core/preferences` key `inactivePanels`). The Options menu under Editor offers a Preferences modal where each panel is toggleable on/off entirely.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Default (Document tab, nothing selected) | New post / empty selection | Document tab visible; Block tab disabled with empty-state ("No block selected") |
| Default (Block tab, single block selected) | Click a block | Auto-switches to Block tab; shows block controls |
| Multi-select | Ctrl/Cmd-click multiple blocks | Block tab shows a generic "Multiple blocks selected" message |
| Plugin sidebar active | User opened a `PluginSidebar` | Plugin sidebar replaces Document/Block tabs; user can toggle back via gear icon |
| Closed | User closes inspector | Hidden; gear icon in header remains |
| Locked block | Selected block has lock | Lock indicator + "Cannot edit" message in Block tab; controls disabled |
| Loading author / taxonomy lists | Initial fetch | Spinner inside that panel |
| Permission denied (e.g. cannot edit author) | Cap-failed control | Field rendered read-only |

---

## 7. Actions

### Document tab — Status & Visibility panel

| Action | Behavior |
|---|---|
| Status select | Switches between Draft, Pending review, Private. (Publish/Schedule via Publish button, not here.) |
| Visibility | Public / Private / Password protected. Password reveals input. |
| Publish (date/time) | Date-time picker. Setting future date → `Publish` button becomes `Schedule`. |
| Move to trash | Confirmation → `DELETE /wp/v2/{rest_base}/{id}` (without `force`). Redirects to list. |
| Stick to top (post type only) | Toggles `sticky`. |

### Document tab — URL / Permalink

| Action | Behavior |
|---|---|
| Click URL | Opens slug-edit drawer: input bound to `slug`; preview generated permalink. |
| Save slug | `PUT /wp/v2/{rest_base}/{id}` with `slug`. |
| Click View link | Opens canonical URL in new tab (only for `publish`). |

### Document tab — Author

| Action | Behavior |
|---|---|
| Author dropdown | Picker; populated from `/wp/v2/users?who=authors`. Only visible if `edit_others_posts`. |

### Document tab — Featured image panel

| Action | Behavior |
|---|---|
| Click placeholder / Set featured image | Opens media modal (`@wordpress/media-utils` MediaUpload). |
| Replace | Re-opens media modal with current selection. |
| Remove | Sets `featured_media: 0`. |

### Document tab — Excerpt

| Action | Behavior |
|---|---|
| Textarea | Bound to `excerpt.raw`. Auto-grows. Help text: "Write an excerpt (optional)" + "Learn more about manual excerpts". |

### Document tab — Discussion

| Action | Behavior |
|---|---|
| Allow comments toggle | `comment_status` `open`/`closed` (when post-type supports `comments`). |
| Allow pingbacks & trackbacks toggle | `ping_status`. |

### Document tab — Page Attributes (hierarchical post types)

| Action | Behavior |
|---|---|
| Parent select | Async picker over `/wp/v2/{rest_base}?per_page=100`. Page tree. |
| Template select | From `editorSettings.availableTemplates` (PHP-supplied). |
| Order number input | `menu_order` integer. |

### Document tab — Categories panel

| Action | Behavior |
|---|---|
| Hierarchical tree | Multi-select checkboxes. Inline "Add new category" creates via `POST /wp/v2/categories`. |
| Search filter | Client-side filter on fetched list. |

### Document tab — Tags panel

| Action | Behavior |
|---|---|
| Tag input (token-input) | Autocomplete from `/wp/v2/tags?search=…`. Free-form entries create new tags on save (when cap allows). |
| Most used | Optional facet — "Choose from most used tags". |

### Document tab — Post Format (post type only, theme-supported)

Radio list of theme-supported formats: standard, aside, gallery, link, image, quote, status, video, audio, chat.

### Document tab — Custom Fields (opt-in)

Tabular `meta_key` / `meta_value` editor. Toggles on at user-meta `enable_custom_fields=1`. Mounts the back-compat `postcustom` meta-box.

### Block tab

The Block tab content is **defined by the active block's `InspectorControls`**. Standard panel groups:

| Group | Source | Examples |
|---|---|---|
| Settings | `<InspectorControls>` (default group) | Heading level select, alignment, link target, etc. |
| Color | block.json `supports.color` + theme palette | Text, Background, Link colors |
| Typography | block.json `supports.typography` | Font family, size, line-height, letter spacing |
| Dimensions | block.json `supports.spacing` | Padding, margin, block spacing |
| Border | block.json `supports.__experimentalBorder` | Width, style, color, radius |
| Position | block.json `supports.position` | Sticky positioning |
| Advanced | always shown | HTML anchor (`id`), Additional CSS class(es) (`className`) |

Each panel is collapsible. Plugins extend via `__experimentalPanel` slots (`PanelBody` placement) per-block.

### Plugin sidebars (`PluginSidebar`)

A plugin can register an alternate sidebar:
- Triggered by a `PluginSidebarMoreMenuItem` in Options menu OR a pinned button next to Settings gear (default behavior).
- When active, it replaces the Document/Block tabs entirely.
- Carries its own header (icon + title + close X).
- Body is plugin-rendered React tree.

---

## 8. Filters, sort, search, pagination

N/A — inspector is property-edit, not list. Internal pickers (author, parent, taxonomy) have inline search/autocomplete documented in section 7.

---

## 9. Forms & inputs

All inputs follow the **edit-on-blur or debounced** pattern: changes mutate `core-data` `edits` immediately; `editor.savePost()` flushes to REST.

| Input | Type | Validation |
|---|---|---|
| Status select | enum select | client-side gate (no `publish` without cap) |
| Visibility radio | radio group | password required when "Password protected" |
| Password text | password input | client-side: non-empty if visibility=password |
| Date picker | datetime | client-side: future date for Schedule path |
| Slug | text input | server validates uniqueness; display generated_slug as preview |
| Author select | searchable user select | — |
| Featured media | media picker | — |
| Excerpt | textarea | — |
| Comment status / Ping status | toggle | — |
| Parent | searchable post select | server validates non-self, non-cycle |
| Template | select | option list from editor settings |
| Menu order | number | integer |
| Categories tree | checkbox tree | multi-select |
| Tags | token input | comma-separated |
| Format | radio | — |
| Custom field key / value | inputs | meta `auth_callback` enforces |
| Block-tab controls | varies per block | — |
| Anchor | text input | client-side: HTML id format |
| Additional CSS classes | text input | — |

### Save semantics
- Edits are local until next `savePost`.
- The Publish button flushes all pending edits AND transitions status.
- Most fields persist on save without their own affordance — no per-field Save button.
- Featured image, taxonomy, and meta save with the next post save (no separate REST call).

---

## 10. Routing & URL state

The workspace may persist inspector tab in hash:

```
#/editor?type=post&id=123&panel=document
#/editor?type=post&id=123&panel=block
#/editor?type=post&id=123&panel=plugin:yoast-seo
```

Closed inspector preserved in user preference (`core/preferences` key `isComplementaryAreaVisible`). The workspace may shadow this in `userCustomizable` via the `core:appearance` prefs surface.

---

## 11. Inter-app navigation

| Trigger | Destination | Carry |
|---|---|---|
| Trash from Status panel | List screen for this post type | confirmation snackbar |
| "Manage Categories" link | `taxonomy` app (category) | — |
| "Manage Tags" link | `taxonomy` app (tag) | — |
| Set / Replace Featured Image | Media modal (in-app, not navigation) | — |
| "Edit revisions" / "View revisions" link (revisions panel within Status panel) | `revisions` screen | post id |
| Plugin sidebar links | varies | varies |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Status change accepted | No discrete notice — flows into save action |
| Trash from inspector | Snackbar: "1 post moved to trash." with Undo |
| Featured image upload progress | Inline progress in panel |
| Featured image upload error | Inline error in panel |
| Tag creation (new free-form tag) | Silent on success; error if name exists with different slug |
| Save failed for a meta field with auth_callback denial | Server returns 403; surface as inline error in that panel |

---

## 13. Accessibility & keyboard

- Inspector toggle keyboard shortcut: Cmd/Ctrl+Shift+,.
- Tabs ("Document" / "Block") use `role="tablist"`; arrow-key navigation between tabs.
- Each panel is a `<button>`-headed disclosure. Enter / Space toggles open/closed.
- Plugin sidebars announced via aria-live when activated/deactivated.
- Focus management: switching from Document → Block (via canvas selection) does not steal focus; focus remains where user has it. Switching tabs by user click moves focus to the first focusable in the panel.
- All text inputs have associated `<label>`. Help text uses `aria-describedby`.
- Media modal traps focus.
- Color picker, font-family picker exposed with combobox semantics where applicable.

---

## 14. Extension points

Inspector is the **primary plugin extension surface** of the editor. A rebuild that omits these slots breaks every editor-extending plugin in the WP ecosystem.

| Slot | Purpose | Where it appears |
|---|---|---|
| `PluginDocumentSettingPanel` | Plugin panel under Document tab | After core panels, before custom fields |
| `PluginPostStatusInfo` | Single row inside Status & Visibility panel | Below Author |
| `PluginPostPublishPanel` | Pre/post publish panels | Pre-publish or post-publish |
| `PluginPrePublishPanel` | Only pre-publish | — |
| `PluginSidebar` + `PluginSidebarMoreMenuItem` | Full alternate sidebar | Adjacent to Settings |
| `PluginMoreMenuItem` | Item in Options menu | Header right kebab |
| `BlockControls` (within block) | Block toolbar buttons | Floating block toolbar |
| `InspectorControls` (within block) | Block tab fields | Block tab |
| `InspectorAdvancedControls` | Block tab Advanced section | Bottom of Block tab |
| `BlockSettingsMenuControls` | Block toolbar More menu | Per-block more menu |

These slots are implemented via `@wordpress/components` `Slot/Fill`. A non-React rebuild must provide a compatible slot/fill registry that React-based plugins can target — practically, this means the rebuild must include `@wordpress/components`/`@wordpress/element` even if the host workspace is in a different framework.

### Filters worth honoring
- `editor.PostFeaturedImage.imageSize` — filter the image size used for the panel preview.
- `editor.PostTaxonomyType` — replace the rendering of a specific taxonomy panel.
- `editor.preview.preferredViewport` — set initial preview device.
- Per-block: `blocks.registerBlockType` filters that augment `supports`, `attributes`.

---

## 15. Mapping & implementation status

### Current workspace coverage
- The native `core:simple-editor` ships **no inspector at all** — it has only title + restricted block list.
- The iframe `core:editor` inherits the full inspector via the iframe.

### Gaps (rebuild list)

| Gap | Priority | Notes |
|---|---|---|
| Settings sidebar workspace + tabs + close button | High | `ComplementaryArea` from `@wordpress/interface` |
| Document tab — Status & Visibility panel | High | `PostVisibility` + `PostSwitchToDraftButton` + `PostTrash` |
| Document tab — Schedule | High | `PostSchedule` |
| Document tab — URL / Permalink / Slug editor | High | `PostURL` + `PostSlug` |
| Document tab — Author picker | Medium | `PostAuthor` |
| Document tab — Featured Image | High | `PostFeaturedImage` (uses `MediaUploadCheck` + `MediaUpload`) |
| Document tab — Excerpt | Medium | `PostExcerpt` |
| Document tab — Discussion | Medium | `PostDiscussionPanel` |
| Document tab — Page attributes | Medium | `PageAttributesPanel` |
| Document tab — Categories | High | `PostTaxonomies` (hierarchical) |
| Document tab — Tags | High | `PostTaxonomies` (flat) |
| Document tab — Custom taxonomies | Medium | `PostTaxonomies` per registered taxonomy |
| Document tab — Post Format | Low | `PostFormat` |
| Document tab — Sticky toggle | Low | `PostSticky` |
| Document tab — Custom Fields panel | Low | `PostCustomFields` |
| Document tab — Trash button | Medium | `PostTrash` |
| Block tab — `BlockInspector` host | High | `BlockInspector` from `@wordpress/block-editor`; renders all `InspectorControls` automatically |
| Block tab — Advanced panel | Medium | Anchor + CSS classes; built into block-editor |
| Plugin slot: `PluginDocumentSettingPanel` | High | Without this, hundreds of plugins fail |
| Plugin slot: `PluginPostStatusInfo` | High | |
| Plugin slot: `PluginSidebar` + tab/icon host | High | |
| Plugin slot: `PluginPrePublishPanel` / `PluginPostPublishPanel` | Medium | |
| Plugin slot: `PluginMoreMenuItem` | High | |
| Meta-boxes side-context iframe loader | Medium | Server renders, client iframes |
| Panel collapse-state persistence | Medium | `core/preferences` key `inactivePanels` |
| Per-panel show/hide preference | Medium | Preferences modal "Document" tab |
| Inspector tab keyboard nav | Medium | Arrow keys between Document / Block tabs |

---

## 16. Out of scope

- **Real-time collaborative cursors** — not in core.
- **Plugin auto-discovery** — plugins register slot-fills at script load. Workspace merely hosts the slots.
- **Inspector inside iframe canvas** — inspector renders in workspace DOM, canvas is iframed (default block editor pattern). Workspace rebuild should keep this split so `wp.privateApis` consents continue to work.

---

## 17. Reference

- Inspector composition: Gutenberg `packages/edit-post/src/components/sidebar/`
- Document tab implementation: `packages/edit-post/src/components/sidebar/post-status/`, `packages/edit-post/src/components/sidebar/last-revision/`
- Block tab implementation: `packages/block-editor/src/components/block-inspector/`
- Slot definitions: `packages/edit-post/src/components/sidebar/plugin-document-setting-panel/`
- `PluginSidebar`: `packages/edit-post/src/components/sidebar/plugin-sidebar/`
- Preferences store: `packages/preferences/src/store/`
- Posts REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`
- Per-meta gating: `register_post_meta()` `auth_callback` and `show_in_rest` schema

**Companion files:**
- [`editor-block.md`](./editor-block.md) — overview, header, canvas, save flow, post lock, autosave
- [`editor-block-modes.md`](./editor-block-modes.md) — list view, code editor, distraction-free, fullscreen, spotlight, zoom-out, patterns, command palette
- [`editor-block-data.md`](./editor-block-data.md) — REST endpoints, preload, batch, autosave / revisions integration
