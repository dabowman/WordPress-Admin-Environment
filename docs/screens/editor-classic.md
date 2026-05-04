# Screen Spec: Classic Editor (Post / Page / CPT)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/post.php` (router) + `wp-admin/post-new.php` (new entry) + `wp-admin/edit-form-advanced.php` (renderer)
**Current shell coverage:** None native. Reachable only as `iframe:post.php?post={id}&action=edit` when post-type's `use_block_editor_for_post` returns false.

This spec describes the **classic editor screen** — the TinyMCE-based meta-box layout that wp-admin renders when:

1. The post type doesn't support the block editor (`'show_in_rest' => false`, no `editor` support, or filtered out via `use_block_editor_for_post_type`).
2. The Classic Editor plugin is active and configured to override the block editor.
3. A user-level setting (Classic Editor plugin) opts an individual user out.

The core router is `wp-admin/post.php`'s `case 'edit':` branch; `edit-form-advanced.php` is loaded as a `require` partial when `use_block_editor_for_post( $post )` is false.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `editor-classic` |
| Display name | "Edit {Post type label}" / "Add New {Post type label}" |
| Original URL (edit) | `/wp-admin/post.php?post={id}&action=edit` |
| Original URL (new) | `/wp-admin/post-new.php?post_type={type}` |
| Note | This is a **partial template** in core — `edit-form-advanced.php` has no top-level slug. The router (`post.php`) chooses between `edit-form-blocks.php` and `edit-form-advanced.php`. |
| Menu location | None — reached from list, command palette, direct URL |
| Parent app | The post-type list screen |
| Sub-screens | Revisions (`revision.php`), Media library modal (Thickbox), Comment-reply modal |

The exact same screen serves every post type that lands on the classic branch — the differences are entirely data-driven from post-type registration.

---

## 2. Purpose

Author / edit / publish a post using the legacy meta-box layout and TinyMCE rich-text editor.

Jobs to be done:
- Author posts of types that don't support the block editor (legacy CPTs from older plugins).
- Restore the classic admin experience for users who actively prefer it.
- Edit attachments (`attachment` post type) — this is the only current core post type that always uses the classic editor.
- Maintain back-compat for plugins that integrate via meta-boxes only.

---

## 3. Capabilities & access

Identical to the block editor:

| Action | Capability |
|---|---|
| View screen | `edit_posts` (post-type's `cap.edit_posts`) |
| Edit | `edit_post` |
| Publish | `cap.publish_posts` |
| Delete | `cap.delete_post` |
| Use raw HTML | `unfiltered_html` |
| Upload media | `upload_files` |
| View "Custom Fields" panel | meta `enable_custom_fields` user-meta opt-in |

**Permission-denied state:** core `wp_die()` 403 ("Sorry, you are not allowed to edit this item."). Trash state same as block editor: 409 ("You cannot edit this item because it is in the Trash. Please restore it and try again.").

---

## 4. Data model

### Primary entity
- **Type:** `postType` / `{post_type}`
- **Save mechanism:** **Form POST** to `post.php` with `action=editpost` and full meta-box payload — **NOT REST**.
- **Form fields:** post title, content, slug, status, author, date, taxonomy assignments, post-meta, plus every custom meta-box's input.

### Server-side workflow (post-back, not REST)

1. User clicks Update / Publish / Save Draft / Move to Trash (different submit buttons in the Publish meta-box).
2. Browser submits the `<form name="post" action="post.php" method="post">` form.
3. `post.php` dispatches via `$action`:
   - `editpost` → `edit_post()` from `wp-admin/includes/post.php` → `wp_update_post()`.
   - `trash` / `untrash` / `delete` → `wp_trash_post()` / `wp_untrash_post()` / `wp_delete_post()`.
4. Server redirects back to `post.php?post={id}&action=edit&message={n}` with success message keyed by `$messages[$post_type][$message]`.
5. Page re-renders with success notice.

### Heartbeat / autosave (does not use REST)

- `admin-ajax.php?action=heartbeat` carries `data.wp_autosave` payload every ~15s when content is dirty.
- Autosave handler stores a revision via `wp_create_post_autosave()` PHP function.
- **No** `/wp/v2/{rest_base}/{id}/autosaves` interaction in the classic editor.

### Post lock

Same mechanism as block editor (heartbeat + `wp_check_post_lock`) — **non-REST**. Lock UI rendered by `_admin_notice_post_locked()` action, attached to `admin_footer` for multisite or sites with multiple users.

### Fields read at render

The classic editor renders directly from PHP `WP_Post` — no REST hydration required. Every meta-box accesses post via `global $post` / `get_post()`.

| Section | Source |
|---|---|
| Title | `$post->post_title` |
| Content (TinyMCE) | `$post->post_content` |
| Excerpt | `$post->post_excerpt` |
| Status | `$post->post_status` |
| Date | `$post->post_date` |
| Author | `$post->post_author` |
| Slug | `$post->post_name` |
| Categories | `wp_get_post_categories( $post->ID )` |
| Tags | `wp_get_post_tags( $post->ID )` |
| Featured image | post meta `_thumbnail_id` |
| Comment status | `$post->comment_status` |
| Ping status | `$post->ping_status` |
| Custom fields | `get_post_meta( $post->ID )` |
| Page parent / order / template | `$post->post_parent`, `$post->menu_order`, `_wp_page_template` meta |
| Post format | post meta `_post_format` (or `wp_get_object_terms` for `post_format` taxonomy) |

### Sample-permalink AJAX

Editing the slug uses `admin-ajax.php?action=sample-permalink` (jQuery-driven inline edit). Not REST.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER                                                           │
│  ├─ H1: "Edit {Post type label}" / "Add New {label}"            │
│  ├─ "Add New" page-title-action button (when on edit screen)    │
│  └─ <hr class="wp-header-end">                                  │
├─────────────────────────────────────────────────────────────────┤
│ NOTICES                                                          │
│  ├─ Updated banner (success message after save)                 │
│  ├─ Autosave-newer banner ("There is an autosave…")             │
│  └─ Connection-lost banner                                      │
├─────────────────────────────────────────────────────────────────┤
│ FORM (#post)  — single big <form action="post.php">             │
│ ┌───── COLUMN 1 (post-body-content) ─────┐ ┌─ COLUMN 2 (side) ─┐│
│ │  Title input (#title)                  │ │  Publish meta-box  ││
│ │   ↳ Permalink edit (#edit-slug-box)    │ │  Format meta-box   ││
│ │  TinyMCE editor (#postdivrich)         │ │  Categories box    ││
│ │   ↳ Visual / Code tabs                 │ │  Tags box          ││
│ │   ↳ Toolbar (formatting, links, media) │ │  Featured Image    ││
│ │   ↳ Word count / Last edited footer    │ │  Page Attributes   ││
│ │  Excerpt meta-box                      │ │   (hierarchical)   ││
│ │  Send Trackbacks meta-box              │ │  Slug              ││
│ │  Discussion meta-box                   │ │  Author            ││
│ │  Comments meta-box (replies inline)    │ │                    ││
│ │  Custom Fields meta-box                │ │                    ││
│ │  Revisions meta-box                    │ │                    ││
│ │  {plugin meta-boxes 'normal'/'advanced'}│ │  {plugin metaboxes}││
│ └─────────────────────────────────────────┘ └────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

The 1-column / 2-column choice is set via Screen Options (`add_screen_option( 'layout_columns' )`) and persisted as user-meta. Meta-boxes can be drag-reordered (jQuery UI Sortable) and collapsed; positions persisted.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial render | Server-rendered HTML; no skeleton needed |
| Empty (new post) | `auto-draft` status | Title placeholder; empty TinyMCE; status = "Auto Draft" |
| Dirty | TinyMCE `content_change` event | Save button text doesn't change but window has before-unload prompt |
| Saving | Form submit | Browser native loading state; full page reload |
| Saved | Server redirect with `?message={n}` | Success banner (e.g. "Post updated.") with View link |
| Save failed | wp_die exit from `edit_post()` | Full-page error |
| Has newer autosave | server detects autosave's `modified_gmt > post.modified_gmt` | Warning banner: "There is an autosave of this post that is more recent than the version below. View the autosave →" |
| Connection lost | jQuery heartbeat error | Banner: "Connection lost. Saving has been disabled until you are reconnected." |
| Locked by another user | `wp_check_post_lock` returns user id | Modal: "Currently editing" with avatar + name + Take Over / Cancel / Preview |
| Trash | `post_status === 'trash'` | wp_die 409 — cannot edit trash; restore first |
| Custom Fields pref off | user-meta `enable_custom_fields=0` | Custom Fields meta-box hidden (Screen Options to re-show) |

---

## 7. Actions

### Title bar
- **Add New** button — links to `post-new.php?post_type={type}` (when capability allows).

### Title input
- Bound to `post_title` field.

### Permalink editor (`#edit-slug-box`)
- Click "Edit" — reveals slug input + Save / Cancel buttons; AJAX preview via `admin-ajax.php?action=sample-permalink`.

### TinyMCE editor

| Surface | Behavior |
|---|---|
| **Visual tab** | WYSIWYG TinyMCE; toolbar-row 1 (B/I/strike, lists, blockquote, alignment, link, more, distraction-free) |
| **Code tab** | Plain textarea showing HTML source |
| **Toolbar Toggle** | Reveals second toolbar row (paragraph format, underline, justify, color, paste, undo/redo, special char) |
| **Add Media button** | Opens media modal (same as block editor) |
| **Word count** | Live word count below editor |
| **Last edited** | "Last edited by {user} on {date} at {time}" |
| **Distraction-free / Fullscreen** | TinyMCE fullscreen button (top-right of editor) |
| **Resize handle** | Bottom-right of editor — drag to resize editor height (persisted) |

### Publish meta-box (`submitdiv`)

The most important meta-box. Contents:

| Element | Behavior |
|---|---|
| **Save Draft** button | When `auto-draft` or `draft` — submits with `post_status: 'draft'` |
| **Preview** button | Opens preview in new tab (via `?preview=true&preview_id={id}&preview_nonce=…`) |
| **Status** ("Draft" / "Pending Review" / "Published" / "Privately published" / "Scheduled") | Inline edit reveals select |
| **Visibility** | Inline edit reveals radio: Public / Stick to top of blog (post type only) / Password protected (input) / Private |
| **Publish (immediately)** / **Schedule for** | Inline edit reveals date-time pickers (month/day/year/hour/minute selects). Future date → button label flips to **Schedule** |
| **Move to Trash** | Form-submit with `action=trash` — confirmation modal |
| **Update** / **Publish** / **Schedule** / **Submit for Review** | Primary action; label depends on status + caps (same matrix as block editor — see [`editor-block.md`](./editor-block.md) §7) |

### Format meta-box (post type, theme-supports `post-formats`)
Radio list: standard, aside, gallery, link, image, quote, status, video, audio, chat.

### Categories meta-box

Two tabs:
- **All Categories** — checkbox tree (hierarchical), most-used quick-pick.
- **Most Used** — weighted shortcut.
- "+ Add New Category" link reveals inline form (label + parent select + Add).

### Tags meta-box
Tag input (comma-separated). "Choose from the most used tags" link reveals tag cloud below.

### Featured Image meta-box
"Set featured image" link → opens media modal (Thickbox + jQuery — same modal as block editor's). After selection: thumbnail preview + "Remove featured image" link.

### Page Attributes meta-box (hierarchical post types)
- **Parent** select — list of all pages of this type.
- **Template** select — themed page templates.
- **Order** number input — `menu_order`.

### Slug meta-box (Screen Options to enable)
Single text input bound to `post_name`.

### Author meta-box (Screen Options to enable, when has `edit_others_posts`)
Author select; populated from users with `cap.edit_posts` for this type.

### Discussion meta-box (when post-type supports `comments`)
- Allow comments toggle (`comment_status`).
- Allow trackbacks/pingbacks toggle (`ping_status`).

### Comments meta-box (when post has comments)
List of comments inline with Quick Reply form. Inline action links: Approve / Spam / Trash / Edit / Reply.

### Send Trackbacks meta-box
- Textarea: comma-separated list of URLs.
- "Already pinged" list shown below.

### Custom Fields meta-box (off by default; Screen Options to enable)
- Tabular meta_key / meta_value editor.
- Inline form: Name (autocomplete from existing meta keys) + Value textarea + Add Custom Field button.
- Per-row: Update / Delete buttons.

### Excerpt meta-box (when post-type supports `excerpt`)
Textarea bound to `post_excerpt`.

### Revisions meta-box (when post-type supports `revisions` and post has any)
Read-only list: "{count} revisions". Each row: "Date — Author". Click navigates to revision compare screen.

### Plugin / advanced meta-boxes
Rendered via `do_meta_boxes( $post_type, 'normal'|'side'|'advanced', $post )`. Each plugin can register via `add_meta_box()`.

---

## 8. Filters, sort, search, pagination

N/A — single-record screen.

The closest features:
- **Categories meta-box "All / Most Used" tabs** — single facet switch.
- **Tags "most used"** — facet panel.
- **Custom Fields "Name" autocomplete** — searches post-meta keys.

---

## 9. Forms & inputs

The entire screen is one giant `<form>` POST:

```html
<form name="post" action="post.php" method="post" id="post">
  <input type="hidden" name="action" value="editpost">
  <input type="hidden" name="post_ID" value="{id}">
  <input type="hidden" name="post_type" value="{type}">
  <input type="hidden" name="original_post_status" value="…">
  <input type="hidden" name="active_post_lock" value="…">
  …all meta-box inputs…
  …nonces (`update-post_{id}`, `meta-box-order`, `closedpostboxes`, `samplepermalink`)…
</form>
```

Submit buttons differ by `name`:
- `name="save"` value="Save Draft" → server treats as `editpost` with status preservation.
- `name="publish"` value="Publish" → forces status to `publish` (or `pending` if user lacks cap).
- `name="wp-preview"` value="dopreview" → routes to `case 'preview'`.
- `name="deletepost"` → routes to `case 'delete'`.

### Validation
- Server-side. Failed validation → wp_die page (no inline error UI in classic).
- TinyMCE strips `<script>`/`<style>` for users without `unfiltered_html`.
- Nonce failure → wp_die "Are you sure you want to do this?".

### Save semantics
- **Single atomic POST** — all fields persisted together.
- No optimistic UI; full page reload after every save.
- Drafts auto-save every 15s via heartbeat-driven AJAX (returns autosave revision).

### Local storage backup
`_local_storage_notice()` sets up a localStorage backup of TinyMCE content. Revealed on connection-lost banner; restorable through the autosave-newer flow.

---

## 10. Routing & URL state

URL params:
- `?post={id}&action=edit` — edit
- `?action=editpost` (POST target) — save
- `?action=trash` / `?action=untrash` / `?action=delete` — destructive
- `?action=preview` — preview
- `?get-post-lock=1&_wpnonce=…` — take over lock
- `?meta-box-loader=true&meta-box-loader-nonce=…` — meta-box AJAX loader (used by block editor for back-compat)
- `?message={n}` — success banner key
- `?revision={id}` — used in success banner when restored from revision

Recommended shell URL state:
```
#/editor-classic?type=post&id=123
#/editor-classic?type=attachment&id=456
```

Hash changes between two posts must trigger lock release / reacquire.

---

## 11. Inter-app navigation

| Trigger | Destination |
|---|---|
| Save success → "View {Post type}" link in success banner | External tab → `link` |
| "Move to Trash" → form submit → server redirect | Back to list screen |
| "View revisions" / row in Revisions meta-box | `revisions` screen |
| "Manage Categories" / "Manage Tags" links | Taxonomy app |
| "Add Media" button → media modal selection | Media app modal (in-flow) |
| Comments meta-box → reply / edit links | Stays in editor for inline reply, or navigates to `comments` app |
| Page parent autocomplete | Stays in screen (no navigation) |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Successful save (post status `publish`) | Banner: "Post published. View post." (success) |
| Successful save (post status `draft`) | Banner: "Post draft updated. Preview post." |
| Successful save (`pending`) | Banner: "Post submitted. Preview post." |
| Successful schedule | Banner: "Post scheduled for: {date}. Preview post." |
| Trash success | Redirect back to list with `trashed=1&ids={id}` query — list shows snackbar |
| Permanent delete | Redirect back to list with `deleted=1` |
| Save failed | Full-page wp_die error |
| Permission denied | Full-page wp_die 403 |
| Lock conflict | Modal: "Currently editing — {User name}" with Take Over / Cancel / Preview |
| Connection lost (heartbeat) | Inline banner "Connection lost." with "This post is being backed up in your browser." |
| Has newer autosave | Banner above editor: "There is an autosave of this post that is more recent than the version below. View the autosave" |
| Custom field updated | Banner: "Custom field updated." |
| Custom field deleted | Banner: "Custom field deleted." |
| Restored from revision | Banner: "Post restored to revision from {date}." |

All success messages come from `$messages` array (lines 173–203 of `edit-form-advanced.php`). The keys 1–10 are post-type indexed; the URL param `?message={n}` selects one.

---

## 13. Accessibility & keyboard

### Keyboard shortcuts
| Key | Action |
|---|---|
| **Alt+F10** | Move focus to TinyMCE toolbar |
| **Alt+Shift+P** | Move focus to previous landmark |
| **Alt+Shift+N** | Next landmark |
| **Cmd/Ctrl+B** | Bold (in TinyMCE) |
| **Cmd/Ctrl+I** | Italic |
| **Cmd/Ctrl+U** | Underline (after toolbar-toggle) |
| **Cmd/Ctrl+K** | Insert link |
| **Cmd/Ctrl+S** | (No native save — pre-block-editor era; users save via Publish button click) |

### ARIA
- Each meta-box uses `role="region"` with the meta-box title as `aria-labelledby`.
- TinyMCE iframe has `role="application"` on the editor body.
- Drag-reorder of meta-boxes uses jQuery UI Sortable — limited keyboard support (a known issue).
- Comments meta-box live-replies use `aria-live="polite"`.

### Focus
- After save → reload → focus lands on banner heading region (browser-default).
- Permalink edit reveals → focus moves to slug input.
- Modal lock dialog traps focus.

### Pain points (rebuild opportunities)
- Meta-box drag-reorder is not keyboard accessible.
- TinyMCE color picker has poor screen reader support in some flows.
- No live region for "saving…" — users only know save happened after page reload.

---

## 14. Extension points

The classic editor's extension model is **PHP-side** and dwarfs the block editor's JS-side surface. Any rebuild must support these — they are how 15+ years of plugins extend the post editor.

| Hook | Purpose | Recommendation |
|---|---|---|
| `add_meta_box( id, title, callback, screen, context, priority, args )` | Register a meta-box | **Critical** — must support; render in shell-rendered card; honor context (normal/side/advanced) and priority |
| `add_action( 'edit_form_top', ... )` | Inject above title | Honor as slot |
| `add_action( 'edit_form_after_title', ... )` | Inject between title and content | Honor as slot |
| `add_action( 'edit_form_after_editor', ... )` | Inject between content and meta-boxes | Honor as slot |
| `add_action( 'submitpost_box', ... )` / `submitpage_box` | Inject before Publish meta-box | Honor as slot |
| `add_action( 'edit_form_advanced', ... )` / `edit_page_form` | After 'normal' meta-boxes | Honor as slot |
| `add_action( 'dbx_post_sidebar', ... )` | After all meta-boxes | Honor as slot |
| `do_action( 'post_edit_form_tag', $post )` | Modify form tag attributes (e.g. add `enctype` for file upload) | Honor — but rebuild may not need (REST handles uploads) |
| Filter `enter_title_here` | Title placeholder | Honor |
| Filter `post_updated_messages` | Custom save messages | Honor for status banners |
| Filter `wp_editor_settings` | TinyMCE settings | Honor |
| Filter `mce_buttons` / `mce_buttons_2` / `mce_external_plugins` | TinyMCE toolbar buttons | Honor — rebuild must integrate TinyMCE or accept feature loss |
| Filter `default_hidden_meta_boxes` | Default-hidden meta-boxes | Honor (mirror in shell prefs) |
| Filter `is_protected_meta` | Hide meta keys from Custom Fields panel | Honor |
| Filter `wp_revisions_to_keep` | Per-post revision retention | Honor (server-side concern, not screen) |

### Meta-box back-compat in a REST world
The block editor handles meta-boxes by rendering them server-side via `?meta-box-loader=true` and embedding the HTML in a hidden `#metaboxes` div, then on save the form posts as a side-channel. This pattern is the de-facto solution for the same problem in any rebuild. Document this clearly: classic-editor rebuild MUST mount a meta-box iframe loader OR accept that all classic plugins break.

---

## 15. Mapping & implementation status

### Current shell coverage
- **None native.** No `core:editor-classic` source exists.
- Reachable via `iframe:post.php?post={id}&action=edit` if shell config wires it. The shell's iframe-fallback CSS (in `IframeApp.js`) hides `#adminmenu`, `#wpadminbar`, `#wpfooter` to make the iframed editor feel native.

### Gaps (rebuild list)

| Gap | Priority | Notes |
|---|---|---|
| Native classic-editor app source | Low | Most modern shells will not expose this. Iframe fallback is the supported v1 approach |
| TinyMCE integration in shell | Low | Requires bundling TinyMCE assets and wiring `wp_editor()` equivalent. Major lift for marginal value |
| Meta-box host (rendered as cards in inspector or below editor) | Medium | If shell renders the screen natively, meta-box server-rendered HTML loader is the contract. Use `wp-admin/post.php?meta-box-loader=true` or build dedicated REST endpoint |
| Form-POST save → REST PUT translation | Medium | Translate "save form" semantics to `useEntityRecord` save. Form-only fields (e.g. `wp-preview`, `deletepost`) translate to specific REST writes |
| Sample-permalink AJAX → REST | Medium | `admin-ajax.php?action=sample-permalink` has no REST equivalent. Map to `PUT slug` + read `permalink_template` |
| Heartbeat autosave (PHP autosave revision) | Low | If shell hosts native classic, switch to `/wp/v2/{rest_base}/{id}/autosaves` instead |
| Per-user "use classic editor" preference | Low | Classic Editor plugin's user-meta toggle. Replicate via shell user-prefs `editor: 'block' \| 'classic'` |
| Plugin meta-box back-compat slots (`edit_form_top`, `submitpost_box`, etc.) | Medium | When mounting natively, must invoke equivalent server-side action chain |
| Quick Edit / Bulk Edit hooks (`quick_edit_show_taxonomy`, `quick_edit_custom_box`) | Low | Lives on list screen, not edit. Already covered by `posts.md` |

### Acceptable interim
Use `iframe:post.php?post={id}&action=edit` when the shell needs to support classic-editor post types. The iframe inherits all back-compat and most accessibility (modulo iframed focus quirks). Mark such configs explicitly in shell JSON so they're tracked for replacement.

---

## 16. Out of scope

- **TinyMCE 5/6 upgrade** — core ships TinyMCE 4. Out of shell scope.
- **Press This** — deprecated in 4.9, removed.
- **"Distraction Free Writing" (DFW)** — TinyMCE's old fullscreen mode. Visually subsumed by block-editor distraction-free mode.
- **Quick Press dashboard widget integration** — handled in dashboard widget code, not this screen.
- **Inline editing in lists (Quick Edit)** — covered by `posts.md`.

---

## 17. Reference

- Router: `wp-admin/post.php`
- New-post entry: `wp-admin/post-new.php`
- Renderer: `wp-admin/edit-form-advanced.php`
- Meta-box library: `wp-admin/includes/meta-boxes.php` (post_submit_meta_box at line 30, post_categories_meta_box at line 635, etc.)
- Edit-post handler: `wp-admin/includes/post.php` `edit_post()`
- Autosave handler: `wp-admin/includes/post.php` `wp_create_post_autosave()`
- TinyMCE wrapper: `wp_editor()` in `wp-includes/general-template.php`
- TinyMCE editor class: `wp-includes/class-wp-editor.php`
- Heartbeat refresh: `wp-includes/script-loader.php` heartbeat localization
- Meta-boxes register-and-do: `wp-admin/includes/meta-boxes.php` `register_and_do_post_meta_boxes()`
- Classic Editor plugin: `https://wordpress.org/plugins/classic-editor/`
- Block-editor branch (companion): `wp-admin/edit-form-blocks.php` and [`editor-block.md`](./editor-block.md)
