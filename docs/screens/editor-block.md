# Screen Spec: Block Editor (Post / Page / CPT) — Overview, Header, Canvas

**Status:** Tier 2 — full spec, split into four files.
**Source PHP:** `wp-admin/post.php` (router) + `wp-admin/post-new.php` (new entry) + `wp-admin/edit-form-blocks.php` (renderer)
**JS package surface:** `@wordpress/edit-post`, `@wordpress/editor`, `@wordpress/block-editor`, `@wordpress/blocks`, `@wordpress/core-data`, `@wordpress/commands`, `@wordpress/preferences`, `@wordpress/notices`
**Current workspace coverage:** `core:editor` → `src/apps/editor/index.js` (iframe escape hatch into `wp-admin/post.php`); `core:simple-editor` → `src/apps/simple-editor/index.js` (native, restricted block set, no inspector). **Native full block editor not yet workspace-mounted.**

This is the largest screen in WordPress. The spec is split into four files. Read them in order:

1. **`editor-block.md`** (this file) — overview, capabilities, data model, header, canvas, save flow, post lock, autosave
2. **[`editor-block-inspector.md`](./editor-block-inspector.md)** — Document and Block sidebars, every panel, plugin extensibility surfaces (`PluginDocumentSettingPanel`, `PluginPostStatusInfo`, `PluginSidebar`, etc.)
3. **[`editor-block-modes.md`](./editor-block-modes.md)** — list view, code editor, distraction-free, fullscreen, spotlight, zoom-out, patterns inserter, command palette
4. **[`editor-block-data.md`](./editor-block-data.md)** — REST endpoints used, preload paths, batch endpoint, autosave/revisions integration, `_embed`, allowed/disallowed blocks

This document describes the **semantic surface** of the block editor so an agent can rebuild it in any UI library or framework.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `editor` (when split into workspace apps: `core:editor`) |
| Display name | "Edit Post" / "Edit Page" / `{post_type.labels.edit_item}` / "Add New {label}" |
| Original URL (edit) | `/wp-admin/post.php?post={id}&action=edit` |
| Original URL (new) | `/wp-admin/post-new.php?post_type={type}` |
| Menu location | None — reached from list screens, command palette, or direct URL |
| Parent app | The post-type list screen (`posts`, `pages`, `{post_type}`) |
| Sub-screens | Revisions (`revision.php`), Media library modal, link picker, navigation menu picker |
| Embedded contexts | Site Editor reuses the same canvas to edit `wp_template`, `wp_template_part`, `wp_block`, `wp_navigation` |

The same screen serves every post type whose post-type registration sets `'show_in_rest' => true` and either `supports['editor']` or otherwise satisfies `use_block_editor_for_post()`. The post-type registration drives every variation — supported features (`title`, `editor`, `excerpt`, `thumbnail`, `revisions`, `comments`, `author`, `page-attributes`, `post-formats`, `custom-fields`), supported taxonomies, capabilities, and labels.

---

## 2. Purpose

Compose, edit, and publish a single post-typed entity. Primary surface for content creation in WordPress.

Jobs to be done:
- **Author a new post** from blank or template; structure with blocks; insert media; publish.
- **Edit an existing post** — update content, change status, schedule, change visibility, swap featured image.
- **Triage editorial flow** — switch between draft / pending review / scheduled / published; handoff via post lock.
- **Recover from interruption** — resume from autosave; restore from revision; reopen after browser crash.
- **Configure document properties** — slug, excerpt, taxonomy, author, page parent, template.
- **Preview before publishing** — desktop / tablet / mobile previews; "View Site" once published.
- **Collaborate** — see when another user is editing; take over the lock; leave Notes (6.9+).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| Reach screen at all | `edit_posts` (post-type's `cap.edit_posts`) | `post.php` permission gate |
| Edit a specific post | `edit_post` mapped to `cap.edit_post` (own) or `cap.edit_others_posts` | `post.php` line ~138 |
| Edit a published post | `cap.edit_published_posts` | core meta-cap map |
| Edit a private post | `cap.edit_private_posts` | core meta-cap map |
| Create new | `cap.edit_posts` AND `cap.create_posts` | `post-new.php` line ~58 |
| Publish | `cap.publish_posts` | submit-meta-box gate; without it, status caps to `pending` |
| Delete | `cap.delete_post` (variant by ownership/status) | move-to-trash button |
| Use raw HTML in content | `unfiltered_html` | `kses` strips otherwise |
| Edit theme/global styles from canvas | `edit_theme_options` | global styles preload context |
| Manage post locks (steal lock) | `edit_post` | `wp_set_post_lock` honors anyone with `edit_post` |
| View revisions panel | `edit_post` AND post-type supports `revisions` | revisions panel gate |
| Upload media | `upload_files` | media modal gate |

**Permission-denied state:** unauthorized users see core's `wp_die()` 403 page. The workspace should mirror with a 403 view inside the editor region, preserving the surrounding workspace chrome.

**Trash state:** if `post.status === 'trash'`, core blocks the editor with HTTP 409 ("You cannot edit this item because it is in the Trash. Please restore it and try again."). The workspace should treat trash posts as not editable; offer a Restore action that issues `PUT { status: 'draft' }`.

**Multisite:** same caps apply per site. No special multisite workspace behavior at this screen.

---

## 4. Data model

### Primary entity
- **Type:** `postType` / `{post_type}`
- **Endpoint:** `GET/PUT /wp/v2/{rest_base}/{id}` (`WP_REST_Posts_Controller`)
- **New post flow:** `POST /wp/v2/{rest_base}` with `status: 'auto-draft'` returns a numeric ID; subsequent edits issue PATCH-equivalent `PUT` calls against that ID until first user-initiated publish/save.

### Core fields read/written
| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | URL key; assigned on auto-draft create |
| `title` | `title.raw` (write), `title.rendered` (display preview) | string | Requires `?context=edit` to receive `raw` |
| `content` | `content.raw` / `content.rendered` / `content.block_version` | string + int | Block markup string (HTML-with-comments). `block_version` = 1 if any blocks, 0 otherwise |
| `excerpt` | `excerpt.raw` / `excerpt.rendered` | string | When post-type supports `excerpt` |
| `status` | `status` | enum | `auto-draft`, `draft`, `pending`, `private`, `future`, `publish`, `trash` |
| `date` / `date_gmt` | `date`, `date_gmt` | ISO 8601 | Publish date for `publish`; scheduled date for `future` |
| `modified` / `modified_gmt` | `modified`, `modified_gmt` | ISO 8601 | Read-only; server-set on save |
| `slug` | `slug` | string | URL slug; auto-derived from title if blank |
| `link` | `link` | URL | Read-only; canonical permalink |
| `author` | `author` | int | User ID |
| `password` | `password` | string | Empty = no protection; only present in `?context=edit` |
| `featured_media` | `featured_media` | int | 0 = none |
| `comment_status` | `comment_status` | `open`/`closed` | When supports `comments` |
| `ping_status` | `ping_status` | `open`/`closed` | When supports `trackbacks` |
| `format` | `format` | enum | `standard`/`aside`/`gallery`/etc. when theme supports |
| `sticky` | `sticky` | bool | Post type `post` only |
| `parent` | `parent` | int | Hierarchical post types only |
| `menu_order` | `menu_order` | int | Hierarchical types |
| `template` | `template` | string | Page template slug |
| `categories` / `tags` | `categories[]`, `tags[]` | int[] | Taxonomy term IDs |
| `meta` | `meta.{key}` | object | Only registered post-meta with `'show_in_rest' => true` |
| `permalink_template` | `permalink_template` | string | Server-rendered permalink with `%postname%` placeholder; `?context=edit` only |
| `generated_slug` | `generated_slug` | string | Server's slug suggestion before save |

### Required query/header parameters
- `context=edit` — required to receive `*.raw`, `permalink_template`, `password`, full status set, `meta.{key}` for editable meta
- `_embed=author,wp:featuredmedia,wp:term` — used by some sidebar panels (author display, featured image preview)
- `_locale=user` — admin uses the user's locale rather than site locale
- `X-WP-Nonce` header — required for all writes (`wpApiSettings.nonce` in core)

### Related entities
| Entity | Endpoint | Used for |
|---|---|---|
| Post-type def | `/wp/v2/types/{type}?context=edit` | Capability flags, supported features, `viewable`, `template`, `template_lock` |
| Taxonomies | `/wp/v2/taxonomies?context=view` | Discover taxonomies attached to this post-type |
| Categories / tags | `/wp/v2/categories`, `/wp/v2/tags` | Taxonomy panels (autocomplete, hierarchy tree) |
| Users | `/wp/v2/users?who=authors` | Author picker |
| Media | `/wp/v2/media` | Featured image picker, content media insertion |
| Settings | `/wp/v2/settings` | Site title/description for global styles, `posts_per_page`, etc. |
| Block types | `/wp/v2/block-types` | Server-registered dynamic blocks (PHP-rendered) |
| Block patterns | `/wp/v2/block-patterns/patterns` | Pattern inserter |
| Pattern categories | `/wp/v2/block-patterns/categories` | Pattern inserter grouping |
| Reusable blocks (synced patterns) | `/wp/v2/blocks` | "My Patterns" tab in inserter; saved as `wp_block` post type |
| Templates | `/wp/v2/templates` | Template selector when `supportsTemplateMode` |
| Template lookup | `/wp/v2/templates/lookup?slug={slug}` | Resolve which template renders this post |
| Global styles | `/wp/v2/global-styles/{user-styles-id}` | Theme styles (read-only without `edit_theme_options`) |
| Autosaves | `/wp/v2/{rest_base}/{id}/autosaves` | Per-user autosave revisions |
| Revisions | `/wp/v2/{rest_base}/{id}/revisions` | Revision history |

### Aggregate / derived data
- **Word count** — client-computed from rendered content via `@wordpress/wordcount`.
- **Time to read** — derived from word count.
- **Outline** — derived from heading-block traversal (List View "Document Overview" tab).
- **Block count** — `select( blockEditorStore ).getGlobalBlockCount()` — displayed in document overview.

### Non-REST data (gaps)
- **Post lock acquire / heartbeat** — `admin-ajax.php?action=heartbeat` carries `data.wp_autosave` + `data.wp-refresh-post-lock`. No REST equivalent. Documented as gap.
- **Post lock takeover** — POST to `admin-ajax.php?action=wp-remove-post-lock` (not REST).
- **Meta-boxes (back-compat)** — rendered server-side via `meta-box-loader=true&meta-box-loader-nonce=…` against `post.php`; result iframed/injected into the editor. Not REST; tracked as gap.

---

## 5. Layout regions (semantic)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER (interface-skeleton header)                                           │
│  ┌────────── LEFT ──────────┐  ┌─── CENTER ───┐  ┌────── RIGHT ──────────┐   │
│  │ Inserter toggle (+)      │  │ Save status  │  │ Save / Publish button │   │
│  │ Tools toggle (Edit/Sel)  │  │ Saving…      │  │ Settings sidebar btn  │   │
│  │ Undo  /  Redo            │  │ Saved        │  │ Options menu (kebab)  │   │
│  │ List View toggle         │  └──────────────┘  └───────────────────────┘   │
│  │ Document Overview        │                                                │
│  │ Breadcrumbs (zoom-out)   │                                                │
│  └──────────────────────────┘                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ NOTICES REGION (banner + snackbar via @wordpress/notices)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ INSERTER PANEL (slides in from left when toggled)                            │
│  ├─ Tabs: Blocks | Patterns | Media (6.5+) | Synced patterns                 │
│  ├─ Search                                                                    │
│  └─ Block / pattern grid                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ LIST VIEW PANEL (slides in from left when toggled — alt to Inserter)         │
│  ├─ Tabs: List View | Outline                                                │
│  └─ Tree of blocks with drag handles                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ CANVAS                                                                        │
│  ├─ Title input (large; placeholder "Add title")                             │
│  ├─ Block list (WYSIWYG, theme-styled, optional iframe)                      │
│  │  └─ Block toolbar (floating, anchored to active block)                    │
│  ├─ Appender ("+" at end)                                                    │
│  └─ Selected-block contextual UI (draggable position handle, alignment)      │
├──────────────────────────────────────────────────────────────────────────────┤
│ INSPECTOR SIDEBAR (slides in from right when toggled — see editor-block-     │
│  inspector.md for full panel breakdown)                                      │
│  ├─ Tabs: Document | Block                                                   │
│  ├─ Document tab: Status & Visibility, Schedule, URL, Author, Featured image,│
│  │  Excerpt, Discussion, Page attributes, Categories, Tags, plugin panels    │
│  └─ Block tab: block-specific controls + Advanced (anchor, additional CSS)   │
├──────────────────────────────────────────────────────────────────────────────┤
│ STATUS BAR (footer; shown when block selected in default editor)             │
│  └─ Block breadcrumb trail                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

The site-editor variant of this canvas additionally shows a **Site Hub** in the upper-left and switches the title input out for a **template name** chip.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (cold start) | Hard refresh | Skeleton header + canvas loading state; preload paths populate `core-data` immediately |
| Loading (post fetch) | Hash change to a different post id | Spinner overlay on canvas; header chrome remains responsive |
| Empty (new post) | `status === 'auto-draft'`, no content | Empty title placeholder + bodyPlaceholder ("Type / to choose a block") |
| Dirty (unsaved) | `core/editor.isEditedPostDirty()` true | "Save draft" button enabled; before-unload prompt armed; status text = "Save draft" |
| Saving | Action dispatched | Button → `loading`; status text = "Saving…" |
| Saved (clean) | Successful save | "Saved" status pill; auto-fades after ~2s |
| Save failed | REST error | Inline notice in banner region with retry; status text = "Save failed" |
| Autosaving | `editor.savePost({ isAutosave: true })` | Status text = "Saving" without disabling buttons |
| Locked by another user | `lock_details.isLocked === true` | Modal blocking entire screen with avatar + name + "Take Over" / "Cancel" / "Preview" |
| Lock taken over (passive) | Heartbeat reports remote lock | Modal: "Someone else has taken over editing of this post" |
| Connection lost | Heartbeat fails | Inline banner: "Connection lost. Saving has been disabled until you are reconnected." Local backup announced |
| Has newer autosave | autosave's `modified_gmt` > post's `modified_gmt` | Banner: "There is an autosave of this post that is more recent than the version below. View the autosave →" |
| Pre-publish flow | User clicks Publish on draft | Inline panel slides in over inspector with checks |
| Post-publish flow | First successful publish from draft | Inline panel: "Post published" + URL copy + share + Add new |
| Editor JS disabled | `<noscript>` | "The block editor requires JavaScript. Please enable JavaScript in your browser settings, or activate the Classic Editor plugin." |
| Trash | `status === 'trash'` | Editor blocked; show "This post is in the trash" with Restore CTA |

---

## 7. Actions

### Header — left cluster

| Action | Trigger | Behavior |
|---|---|---|
| **Toggle inserter** | Click `+` | Slides inserter panel from left; closes List View if open |
| **Tools menu** (Edit / Select) | Edit/Select toggle | Edit mode: default, blocks accept text input. Select mode: click selects block (no text editing) |
| **Undo** | Cmd/Ctrl+Z | `core/editor.undo()` — replays previous edit step; disabled at history start |
| **Redo** | Cmd/Ctrl+Shift+Z | `core/editor.redo()`; disabled when no future steps |
| **Toggle List View** | Click list-view icon / Shift+Alt+O | Slides List View panel from left; closes inserter if open |
| **Document Overview** (within List View) | Tab inside List View | Outline of headings + word count + character count |

### Header — center

- **Save status indicator** — text + icon. States: idle (no text) / "Save draft" (button-equivalent affordance) / "Saving…" / "Saved" (auto-fades) / "Save failed".
- **Breadcrumbs** — block ancestry chain when active block selected; clicking a crumb selects that ancestor. In zoom-out mode, breadcrumbs replace the title.

### Header — right cluster

| Action | Cap | Behavior |
|---|---|---|
| **Save Draft** | `edit_post` | When `status` is `auto-draft` or `draft`, persists draft. Disabled when clean. |
| **Switch to Draft** | `edit_post` | When `status === 'publish'`, reverts to draft (with confirmation). |
| **Preview** | `edit_post` | Dropdown: Desktop / Tablet / Mobile (changes canvas viewport width); "Preview in new tab" (saves as autosave then opens `?preview=true&preview_id={id}&preview_nonce=…`); "View Site" (opens `link` in new tab; only when `status === 'publish'`) |
| **Publish** / **Schedule** / **Update** / **Submit for review** | varies (see below) | Primary action; label depends on state |
| **Settings** (sidebar toggle) | none | Toggles inspector sidebar on/off |
| **Options** (kebab/more menu) | none | See Options menu below |

### Primary action label state machine

| Post status | User has `publish_posts` | Has post date in future | Button label |
|---|---|---|---|
| `auto-draft`, `draft` | yes | no | **Publish** |
| `auto-draft`, `draft` | yes | yes | **Schedule** |
| `auto-draft`, `draft` | no | — | **Submit for Review** |
| `pending` | yes | no | **Publish** |
| `pending` | yes | yes | **Schedule** |
| `pending` | no | — | **Save as pending** |
| `publish` | yes | — | **Update** (only when dirty) |
| `private` | yes | — | **Update** (only when dirty) |
| `future` (scheduled) | yes | — | **Update** or **Schedule** if date changed |

Clicking **Publish** / **Schedule** opens the **Pre-publish panel** (unless dismissed via preference) — see section 9.

### Block toolbar (floating, anchored to active block)

| Action | Behavior |
|---|---|
| **Block-type icon (transform)** | Opens Transform menu: convert to compatible block types (e.g. paragraph → heading) |
| **Drag handle** | Drag block to reorder |
| **Move up / Move down** | Vertical reorder (keyboard accessible) |
| **Block-specific controls** | E.g. heading level (H1–H6), paragraph alignment, image alt-text quick edit |
| **Alignment** | None / Left / Center / Right / Wide / Full |
| **Options (more)** kebab | Copy / Duplicate / Insert before / Insert after / Move to / Edit as HTML / Add to reusable / Group / Lock / Remove |
| **Group** | Wraps selection in `core/group` block |
| **Copy** | Copy block markup to clipboard |
| **Copy styles / Paste styles** | 6.5+ — copy attribute-style fields (color, typography, spacing, border) and paste onto another block |
| **Lock** | Modal: prevent removal / prevent movement |
| **Convert to pattern** (synced or unsynced) | Saves as `wp_block` for synced, in-line copy for unsynced |
| **Edit as HTML** | Renders block source code editor inline within the canvas |

### Canvas interactions

| Trigger | Behavior |
|---|---|
| Click empty area | Inserts default block (`core/paragraph`) at click point |
| `/` at empty paragraph | Slash-command inline inserter (filtered list of blocks) |
| Type | Enters text in active rich-text field |
| Drag block from inserter | Drops at indicated position |
| Drop file from OS | Auto-creates image/video/file/embed block depending on type |
| Click block | Selects single block (toolbar appears) |
| Shift+Click | Range select |
| Cmd/Ctrl+A inside block | Select content of block; second Cmd/Ctrl+A selects whole block |
| Cmd/Ctrl+Click | Multi-select non-adjacent blocks |
| Drag selection rectangle | Marquee select |
| Cmd/Ctrl+C / Cut | Copy / cut selected block(s) |
| Cmd/Ctrl+V | Paste; smart-paste detects URL → embed, image data → image block |
| Backspace at start of empty block | Merge with previous block |
| Enter | Split block / new paragraph below |
| Cmd/Ctrl+F | Find/Replace overlay (6.5+) |
| Esc | Deselect block / leave text-edit mode |

### Options menu (header right kebab)

Grouped by section:

**View**
- Top toolbar — anchors block toolbars to the header bar instead of floating
- Distraction free — hides UI chrome while typing
- Spotlight mode — dims non-active blocks
- Fullscreen mode — hides workspace chrome

**Editor**
- Visual editor (default)
- Code editor — switches canvas to a textarea showing block markup

**Tools**
- Manage patterns — opens `wp_block` list (or pattern manager when in site editor)
- Keyboard shortcuts — modal listing every shortcut (Cmd+Shift+H)
- Welcome guide — re-show first-run tour

**Plugins**
- Each registered `PluginMoreMenuItem` appears here

**Preferences**
- Opens preferences modal (general / blocks / panels / shortcuts tabs)

---

## 8. Filters, sort, search, pagination

N/A — single-record screen, not a list. The closest match is the **inserter** search (filter by block name across registered blocks) and the **patterns** filter (by category) — both documented in [`editor-block-modes.md`](./editor-block-modes.md).

---

## 9. Forms & inputs

### Title input
- Type: contenteditable rich-text field (single line; Enter creates the first paragraph block).
- Field: `title.raw`.
- Placeholder: filtered via `enter_title_here` hook; default "Add title".
- Submit-on-blur: no — debounced edit; persisted on next save.
- Tab/Enter from title focuses the first content block.

### Body content
- Type: block-list editor.
- Field: `content.raw`.
- Placeholder per block-type; canvas-level placeholder filtered via `write_your_story` hook (default "Type / to choose a block").
- Allowed blocks: governed by `allowedBlockTypes` editor setting and per-post-type templates. Plugins filter via `allowed_block_types_all`.

### Pre-publish panel

Activated by clicking Publish on a draft. Contents:

| Section | Default content | Hideable | Plugin-extensible |
|---|---|---|---|
| Are you ready to publish? | Yes/No question + summary | no | yes (`PrePublishPanel` slot) |
| Visibility | Public / Private / Password protected radio + password input | no | no |
| Publish | "Immediately" / "Set a date" toggle revealing date-time picker | no | no |
| Suggestion | Permalink preview with editable slug + edit button | no | no |
| Suggestion | Featured image (if missing) | yes | no |
| Suggestion | Excerpt prompt (if empty) | yes | no |
| Suggestion | Tags prompt (if empty + post-type supports) | yes | no |
| Always show pre-publish checks | Toggle preference | no | no |

Footer buttons: **Cancel** | **Publish/Schedule**.

### Post-publish panel

Replaces pre-publish on success.

| Element | Behavior |
|---|---|
| Confirmation heading | "{Post type label} published." |
| Post URL | Read-only field with copy button |
| Permalink edit | Inline text field; debounced PUT to `slug` |
| Add new {post_type} | Navigates to new auto-draft |
| Social-share buttons | Plugin-extension area |
| View Post | Opens `link` in new tab |

### Save semantics (single source of truth)

- **Edits are tracked locally** in `core/editor` store as `edits` keyed by `{kind, name, id}`.
- **Save = `editor.savePost()`** which dispatches `core/core-data` `saveEntityRecord` against `postType:{type}:{id}`.
- **Auto-draft → draft transition** happens automatically on first save with title or content.
- **`status` is editable separately** from save: clicking Publish first sets `status: 'publish'`, then issues the save. Clicking Save Draft on a published post would not change status (Switch to Draft does that explicitly).
- **Optimistic concurrency:** none. Last write wins.

Validation:
- Server (REST) is authoritative.
- Client validates: required fields per registered post-type schema, password-when-status-is-private rule, schedule date in future.
- Empty-content rule: WP rejects fully empty content + title + excerpt with `Content, title, and excerpt are empty`. Editor seeds an empty paragraph block on new posts to dodge this.

---

## 10. Routing & URL state

### Original wp-admin URL params
- `?post={id}&action=edit` — edit existing post
- `?post_type={type}` (on post-new.php) — new post of type
- `?get-post-lock=1&_wpnonce=…` — force-take lock (steal flow)
- `?meta-box-loader=true&meta-box-loader-nonce=…` — meta-box AJAX iframe loader (back-compat)
- `?action=preview` (on `post.php`) — preview-link redirect

### Workspace URL state under the Tier 1 decision

Per `docs/block-editor-native-port.md`, the default workspace does NOT host this screen — the editor's URLs are the classic ones above, reached by a real top-level navigation (handoff). The recommendation below applies only to a workspace that opts into hosting an editor screen (the iframe embed today, the Tier 2 chromeless endpoint later, or a Tier 3 purpose-built editor):

```
#/editor?type=post&id=123
#/editor?type=post&new=1                  ← creates auto-draft on mount
#/editor?type=page&id=8&panel=block       ← inspector tab
#/editor?type=post&id=123&fullscreen=1
```

Hash params drive: post identity, optional inspector tab, mode flags (fullscreen, distraction-free, spotlight). Hash changes between two posts of the same type should be treated as navigation (not in-app param change) so post-lock cleanup runs.

Browser back must offer to discard unsaved changes (matches before-unload prompt).

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)
| Trigger | Destination | Carry |
|---|---|---|
| Click "← Back" / workspace back button | List screen for this post type | Restore previous filter state |
| Click "View" (post-publish) | External tab → `link` | — |
| Click "Manage all reusable blocks" / "Manage patterns" | `posts` filtered to `wp_block` post type, or site-editor patterns | — |
| Featured image picker → "Manage Media" | `media` app | — |
| Author picker (if user picker links out) | `users` app filtered to authors | — |
| "View revisions" (revisions panel) | `revisions` screen | post id, current revision |
| Categories panel "Manage Categories" link | `taxonomy` screen for category | — |
| Plugin sidebar links | varies | varies |

### Inbound (other apps → this screen)
- From posts list `Edit` row action → opens with `id`.
- From posts list `Add New` button → opens with `new=1` (creates auto-draft).
- From command palette → "Edit post: {title}" enters with `id`.
- From revisions screen "← Go to editor" link → returns to editor with `id`.
- From Site Editor "Edit page" template-edit handoff → opens that post's content with template context flag.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Successful save (manual) | Snackbar: "Draft saved." / "Post updated." / "Post published." (status-aware text); `View Post` link in snackbar when published |
| Successful schedule | Snackbar: "Post scheduled for {date}." with link |
| Successful publish | Pre-publish/post-publish panel takes over (replaces snackbar) |
| Save failed | Persistent banner above canvas: "Updating failed. {error message}" with Retry |
| Autosave success | Silent (no UI by default) |
| Autosave failure | Inline subtle indicator near save status: "Backed up locally" |
| Has newer autosave | Banner: "There is an autosave of this post that is more recent…" + restore link |
| Connection lost | Banner: "Connection lost. Saving has been disabled until you are reconnected. This post is being backed up in your browser." |
| Connection restored | Auto-dismiss banner; resume heartbeat |
| Lock taken | Modal blocking entire screen; user dismissed only by preview / take over / cancel |
| Lock taken over by other user | Modal: "{User} has taken over editing." + Read only / Take Over Anyway |
| Block error (block save validation) | Inline error in block: "This block contains unexpected or invalid content." + Attempt Recovery / Convert to HTML |
| Validation error (e.g. invalid date) | Inline error in pre-publish field |
| Trash on success | Snackbar: "1 post moved to trash." + Undo (5s) + redirect to list |
| Comment moderation note | (Plugin-extensible inline notice) |

Snackbar service: `@wordpress/notices` `core/notices` — `createInfoNotice / createSuccessNotice / createErrorNotice`.

---

## 13. Accessibility & keyboard

### Keyboard shortcuts (`@wordpress/keycodes`)

**Global**
| Key | Action |
|---|---|
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+Shift+,` | Toggle settings sidebar |
| `Shift+Alt+O` | Toggle list view |
| `Cmd/Ctrl+Shift+H` | Show keyboard shortcuts modal |
| `Cmd/Ctrl+Shift+\` | Toggle top toolbar |
| `Cmd/Ctrl+Shift+Alt+F` | Toggle fullscreen |
| `Cmd/Ctrl+Shift+Alt+M` | Toggle code editor |
| `Cmd/Ctrl+Alt+/` | Distraction-free mode |
| `Cmd/Ctrl+K` | Command palette |

**Block / canvas**
| Key | Action |
|---|---|
| `/` (empty paragraph) | Slash-command inserter |
| `Cmd/Ctrl+A` | Select block content; second press = select all blocks at level |
| `Cmd/Ctrl+D` | Duplicate selected block(s) |
| `Cmd/Ctrl+Shift+D` | Remove selected block(s) (alt: Backspace on whole-block selection) |
| `Cmd/Ctrl+Shift+T` | Insert block before |
| `Cmd/Ctrl+Alt+T` | Insert block after |
| `Esc` | Deselect block / leave text-edit |
| `Enter` | Split block (in rich text) |
| `Tab` (inside title) | Move to first block |
| `Alt+F10` | Move focus to block toolbar |
| `Alt+Shift+N` (regions nav) | Move focus to next region |
| `Alt+Shift+P` (regions nav) | Move focus to previous region |
| `↑ / ↓` (block selected, not editing) | Move focus to adjacent block |

**Rich-text formatting (within text fields)**
| Key | Action |
|---|---|
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+U` | Underline |
| `Cmd/Ctrl+K` | Insert link |
| `Cmd/Ctrl+Shift+K` | Remove link |
| `Cmd/Ctrl+.` | Inline code |
| `[[` | Quick page link autocomplete |
| `Cmd/Ctrl+Shift+H` | Show all shortcuts |

### ARIA & focus

- `interface-skeleton` regions are landmark roles: `role="banner"` (header), `role="region"` aria-label "Editor content" (canvas), `role="region"` aria-label "Editor settings" (inspector), `role="contentinfo"` (footer breadcrumb bar).
- Block toolbar uses `role="toolbar"` with `aria-label` derived from the active block name.
- List View uses `role="treegrid"` with row/cell semantics.
- Status pill announces via `aria-live="polite"` on save state changes ("Saved", "Saving…").
- Notices use `role="alert"` (errors) or `role="status"` (success).
- Pre-publish panel traps focus until Cancel/Publish.
- Lock modal traps focus.
- After save, focus returns to last-active block (or Save button if focus was there).
- After Publish, focus moves to post-publish panel "Copy Link" button.

### Screen reader expectations
- Save state announced.
- Block insertion announced ("Paragraph block added").
- Block deletion announced.
- Selection range announced ("3 blocks selected").
- Outline depth announced in List View navigation.

---

## 14. Extension points (core hooks)

The block editor extension surface is **JavaScript-side**, not PHP-side. Any rebuild must surface equivalent slots; otherwise plugins like Yoast SEO, Jetpack, ACF break.

### JS slots (must be supported in any rebuild)

| Slot | Purpose | Detail |
|---|---|---|
| `PluginDocumentSettingPanel` | Add a panel under the Document inspector tab | See [`editor-block-inspector.md`](./editor-block-inspector.md) |
| `PluginPostStatusInfo` | Add a row inside the Status panel | See `editor-block-inspector.md` |
| `PluginPostPublishPanel` | Pre-publish suggestion or post-publish action | Section 9 |
| `PluginPrePublishPanel` | Pre-publish-only panel | Section 9 |
| `PluginSidebar` + `PluginSidebarMoreMenuItem` | Full alternate sidebar pinned next to Settings; toggled from Options menu | Plugin-owned drawer |
| `PluginMoreMenuItem` | Item in the Options/More menu | Section 7 |
| `PluginBlockSettingsMenuItem` | Item in block-toolbar More menu | Per-block extensibility |
| `BlockControls` (within registered block) | Custom block toolbar buttons | Block-internal |
| `InspectorControls` (within registered block) | Custom Block tab fields | Block-internal |
| `RichTextToolbarButton` | Button in rich-text format toolbar | Format extensibility |
| `useBlockEditingMode` filter | Restrict block editability per context | 6.2+ |

### PHP filters / actions still relevant
| Hook | Purpose | Recommendation |
|---|---|---|
| `use_block_editor_for_post_type` | Force classic editor on certain post types | Honor — gate native vs iframe-fallback per post type |
| `use_block_editor_for_post` | Per-post override | Honor |
| `replace_editor` | Plugin replaces editor entirely | Drop — incompatible with workspace, document |
| `block_editor_settings_all` | Modify editor settings array | Replace with workspace-level setting injection |
| `allowed_block_types_all` | Restrict block set | Honor — pass through |
| `block_categories_all` | Add/modify block categories | Honor |
| `enqueue_block_editor_assets` | Enqueue scripts/styles | **Critical** — third-party editor extensions register their slot fills here |
| `enter_title_here` | Title placeholder | Honor |
| `write_your_story` | Body placeholder | Honor |
| `default_post_format` | Default format on new post | Honor |
| `register_block_type_args` | Modify block-type args | Honor at server registration time |
| `meta-boxes_*` family | Meta-box injection | Render in iframe-loader iframe; track as gap for v2 native solution |

### Server-side block bindings
6.5+ block bindings sources are preloaded into `wp.blocks` at editor load via `get_all_registered_block_bindings_sources()`. Rebuild must call `registerBlockBindingsSource()` for each, or call the `_fields` endpoint that returns the same list and register at boot.

---

## 15. Mapping & implementation status

### Current workspace coverage

| App | What works | Cap |
|---|---|---|
| `core:editor` | Iframes `wp-admin/post.php?post={id}&action=edit`; `EditorApp.js` injects CSS to hide wp-admin chrome (`#adminmenu`, `#wpadminbar`, `#wpfooter`) | `edit_post` |
| `core:simple-editor` | Native `BlockEditorProvider` with **9 allowed blocks** (paragraph, heading, image, quote, list, list-item, code, separator, embed). Title input + body. Debounced 2s autosave. Publish/Update button. **No inspector. No list view. No patterns. No featured image. No taxonomy. No revisions. No code editor.** | `edit_post` |

### Known deviations (current workspace)

These are behaviors that work but diverge from core — distinct from the unbuilt gaps below.

| Deviation | Impact | Correct behavior |
|---|---|---|
| **Missing "newer autosave" recovery banner** | `core:simple-editor` does not compare `modified_gmt` of the live record against the user's most-recent autosave revision on load. Core shows a banner — "There is an autosave of this post that is more recent than the version below. View the autosave →" — when the autosave is newer. Without it, a crash or tab-close during a published-post edit silently loses the autosave recovery path. | On mount, fetch `GET /wp/v2/{rest_base}/{id}/autosaves?author={userId}&per_page=1` and compare `autosave.modified_gmt` vs `post.modified_gmt`; show the recovery banner when the autosave is newer. Tracked in `docs/parity/roadmap.md` group A-P1. |

> **Fixed in #198 (issue #101):** The 2s debounce previously PUT the live record on every keystroke-debounce for all post statuses, clobbering published content. `autosaveTarget()` in `src/apps/simple-editor/autosave.mjs` now status-gates the write: `draft`/`auto-draft` flush the parent record in place (matching core), everything else routes to `POST …/autosaves` and leaves the live record untouched.

### Gaps vs. this spec

This is the v2 milestone. Each row is one or more rebuild tickets.

| Gap | Priority | Notes |
|---|---|---|
| Native full-canvas inserter (Blocks/Patterns/Media tabs) | High | Wraps `@wordpress/block-editor` `Inserter` |
| Block toolbar (transform, alignment, options, group, lock) | High | `BlockToolbar` from `@wordpress/block-editor` mounts within block-list region |
| Inspector sidebar Document tab | High | See [`editor-block-inspector.md`](./editor-block-inspector.md) |
| Inspector sidebar Block tab | High | `BlockInspector` |
| List View / Document Overview | High | `__experimentalListView` |
| Pre-publish + post-publish panels | High | `PostPublishPanel` from `@wordpress/editor` |
| Save status indicator + Publish button state machine | High | `PostSavedState` + `PostPublishButton` |
| Preview dropdown (desktop/tablet/mobile + view-site) | Medium | `PostPreviewButton` + `__experimentalPreviewOptions` |
| Save Draft / Switch to Draft | High | `PostSwitchToDraftButton` |
| Undo / Redo | High | `EditorHistoryUndo`, `EditorHistoryRedo` |
| Code editor mode | Medium | `CodeEditor` from `@wordpress/editor` |
| Distraction-free mode | Medium | Preference + chrome hide CSS class |
| Fullscreen mode | Low | Toggle on workspace root `is-fullscreen-mode` |
| Spotlight mode | Low | Preference; dim non-active blocks via class on canvas |
| Zoom-out mode | Medium | 6.5+; canvas scale transform + breadcrumbs |
| Find/Replace overlay | Medium | 6.5+; `EditorFindReplace` |
| Notes (collaborative) | Low | 6.9+ feature; per-block annotation; needs collab data layer |
| Pre-publish checks (image/excerpt/tags suggestions) | Medium | `PostPublishPanelPrepublish` slot fills |
| Post lock acquire + heartbeat refresh | High | Currently iframed app inherits core's. Native rebuild must implement: `wp_set_post_lock` equivalent (no REST), heartbeat tick |
| Post lock take-over flow | High | Modal + steal action (no REST equivalent — gap) |
| Autosave (60s) + heartbeat-driven backup | High | `/wp/v2/{rest_base}/{id}/autosaves` |
| "Autosave is newer than current" recovery banner | High | Compare modified_gmt; offer restore |
| Local-storage autosave (sessionStorage backup when offline) | Medium | `@wordpress/editor` ships `localAutosaveSet/Get` |
| Revisions panel link → revision screen | High | Honor when post-type supports `revisions` |
| Featured image picker | High | `PostFeaturedImage` |
| Taxonomy panels (categories tree, tags autocomplete) | High | `PostTaxonomies` flat or hierarchical |
| Author picker | Medium | `PostAuthor` |
| Slug + permalink editor | Medium | `PostSlug` + `PostPermalink` |
| Excerpt panel | Medium | `PostExcerpt` |
| Discussion panel | Medium | `PostDiscussionPanel` |
| Page attributes (parent, template, order) | Medium | `PageAttributesPanel` |
| Post format picker (when theme supports) | Low | `PostFormat` |
| Sticky toggle (post type only) | Low | `PostSticky` |
| Visibility (public/private/password) | High | `PostVisibility` |
| Schedule date-time picker | High | `PostSchedule` |
| Custom Fields panel | Low | `PostCustomFields`; user-meta gated |
| Plugin slot host: `PluginDocumentSettingPanel` | High | Without this, all SEO/SEM/marketing plugins break |
| Plugin slot host: `PluginPostStatusInfo` | High | |
| Plugin slot host: `PluginSidebar` | High | |
| Plugin slot host: `PluginMoreMenuItem` | High | |
| Plugin slot host: `PluginPrePublishPanel` / `PluginPostPublishPanel` | Medium | |
| Plugin slot host: `BlockControls` / `InspectorControls` | High | These work automatically when the canvas is a real `@wordpress/block-editor` BlockEditorProvider — only broken if workspace renders blocks itself |
| Meta-boxes (back-compat) iframe loader | Medium | Rendered server-side via `meta-box-loader=true`; mount in inspector or below canvas |
| REST preload (block editor preload paths) | High | Without preload, cold-start fetch waterfall kills perf — see [`editor-block-data.md`](./editor-block-data.md) |
| Server-registered block schemas bootstrap | High | `wp.blocks.unstable__bootstrapServerSideBlockDefinitions(...)` — required for dynamic blocks |
| Server-registered block bindings sources | Medium | 6.5+ |
| Block patterns registration (PHP-registered → JS) | Medium | `__experimentalAdditionalBlockPatterns` |
| Allowed-blocks honoring (post-type templates / `allowed_block_types_all`) | High | Already in MVP for SimpleEditorApp; widen to full set |
| `unfiltered_html` cap honoring | Medium | Without cap, raw HTML is `kses`-filtered server-side |
| Keyboard shortcuts modal (Cmd+Shift+H) | Medium | `KeyboardShortcutHelpModal` |
| Block-error recovery UI | Medium | When server-stored markup doesn't validate against client block-type, offer "Attempt block recovery" / "Convert to HTML" |

### Acceptable interim
For workspaces that do not need the full block editor, the existing `core:editor` iframe escape hatch is the supported v1 fallback. `core:simple-editor` is the supported native option for restricted-content authoring (newsletter posts, link-in-bio, etc.).

---

## 16. Out of scope

- **Nested editor instances** (editor inside editor) — defer to site-editor decomposition.
- **Multi-user real-time co-editing** — WP core does not have it; Notes (6.9+) is async.
- **Mobile editor** — separate React Native codebase; not addressed by web workspace.
- **Old TinyMCE classic editor inside the block editor** — see [`editor-classic.md`](./editor-classic.md) for the classic editor; the `core/freeform` block embeds TinyMCE for classic-block back-compat but the wrapping editor remains the block editor.
- **Block development / `block.json` authoring tools** — handled by Gutenberg's site editor / wp-scripts; not part of this screen.
- **Post Lock heartbeat polling refactor to REST** — core gap. Track upstream.

---

## 17. Reference

- Router PHP: `wp-admin/post.php`
- New-post entry: `wp-admin/post-new.php`
- Block editor renderer: `wp-admin/edit-form-blocks.php`
- Editor-load JS hook: `do_action( 'enqueue_block_editor_assets' )`
- Posts REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`
- Autosaves REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-autosaves-controller.php`
- Revisions REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php`
- Block-patterns REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-patterns-controller.php`
- Block-types REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-types-controller.php`
- Block-renderer REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-renderer-controller.php`
- URL details: `wp-includes/rest-api/endpoints/class-wp-rest-url-details-controller.php`
- Navigation fallback: `wp-includes/rest-api/endpoints/class-wp-rest-navigation-fallback-controller.php`
- Editor JS package: Gutenberg `packages/edit-post/src/editor.js`, `packages/editor/src/components/`
- Current iframe workspace impl: `src/apps/editor/index.js`
- Current native workspace impl: `src/apps/simple-editor/index.js`
- WordPress 6.9 dev notes: `https://make.wordpress.org/core/tag/dev-notes+6-9/`
- WordPress 6.8 dev notes: `https://make.wordpress.org/core/tag/dev-notes+6-8/`
- WordPress 6.7 dev notes: `https://make.wordpress.org/core/tag/dev-notes+6-7/`

**Continue reading:**
- [`editor-block-inspector.md`](./editor-block-inspector.md) — inspector sidebar full panel breakdown
- [`editor-block-modes.md`](./editor-block-modes.md) — list view, code editor, distraction-free, fullscreen, spotlight, zoom-out, patterns, command palette
- [`editor-block-data.md`](./editor-block-data.md) — REST endpoints, preload, batch, autosave / revisions integration
