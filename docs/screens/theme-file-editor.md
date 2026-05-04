# Screen Spec: Theme File Editor

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/theme-editor.php` (paired conceptually with `plugin-editor.php`, which is specced separately under Plugins)
**Current shell coverage:** None. Reachable today only via `iframe:theme-editor.php` and only when `DISALLOW_FILE_EDIT` is not set.

This spec describes the **semantic surface** of the Theme File Editor so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

**Posture:** core has been deprioritizing this screen for years. Production sites are encouraged to set `define('DISALLOW_FILE_EDIT', true)` in `wp-config.php`, which removes the menu entry entirely. The shell should surface this screen only when explicitly enabled and only for advanced shells (e.g. `developer-admin`). It is not appropriate for `content-author` or `client-portal`.

This spec covers **theme file editing only**. The plugin file editor (`plugin-editor.php`) is structurally identical and lives in the Plugins screen specs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `theme-file-editor` |
| Display name | "Theme File Editor" / "Edit Themes" |
| Original URL | `/wp-admin/theme-editor.php` |
| Menu location | Submenu of Appearance |
| Submenu items | None |
| Parent app | Appearance group |
| Sub-screens | Per-file edit (selection drives content) |

The screen is **disabled** in three scenarios:
1. `DISALLOW_FILE_EDIT` constant defined and true (recommended for production).
2. Multisite: redirected to network admin (`theme-editor.php` lines 12–15).
3. User lacks `edit_themes` capability.

---

## 2. Purpose

In-browser editor for the active theme's PHP / CSS / JS / JSON files. Save edits with a built-in PHP syntax safety net (auto-rollback on fatal errors). Browse the theme's file tree, switch between files, and look up function documentation for PHP files.

Jobs to be done (advanced/dev only):
- **Quick CSS tweak** — open `style.css` → edit → Update File.
- **Diagnose a header bug** — open `header.php` → inspect.
- **Switch to a different theme to inspect its files** — Theme picker → Select.
- **Look up a function** — open PHP file → Documentation dropdown → "Look Up".

Most of this work is better done in `core:site-editor` Styles → Additional CSS (for CSS) or in a code editor on disk. The shell should treat this screen as an escape hatch, not a primary workflow.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_themes` | `theme-editor.php` lines 17–19 |
| Edit / save file | `edit_themes` AND file is writable | `wp_edit_theme_plugin_file()` |
| List themes in picker | `wp_get_themes(['errors' => null])` | line 295 |

**Permission-denied state:** core renders `wp_die()`. Mirror.

**`DISALLOW_FILE_EDIT` gate:** when set, `current_user_can('edit_themes')` returns false in core. The shell should detect this constant via PHP-side capability map injection and hide the menu entry. Reaching the route directly should render an explanatory empty state pointing to alternative workflows (Site Editor for CSS, child themes for code).

**Multisite:** redirects to network admin. Individual site admins can't edit theme files.

---

## 4. Data model

The Theme File Editor has **no REST API**. It uses synchronous form POST to `theme-editor.php` and relies on `admin-ajax`-style handlers internally.

### Server-side primitives
- `wp_get_themes(['errors' => null])` — list of installed themes (filesystem read).
- `wp_get_theme($stylesheet)` — single theme metadata.
- `wp_get_theme_file_editable_extensions($theme)` — array of allowed extensions: `['php', 'css', 'js', 'json']` typically; filterable via `wp_theme_editor_filetypes`.
- `WP_Theme::get_files($type, $depth)` — list theme files matching a type and depth.
- `wp_make_theme_file_tree($files)` — build a hierarchical tree from a flat path list.
- `wp_print_theme_file_tree($tree)` — render the tree as a `<ul role="tree">`.
- `wp_edit_theme_plugin_file(array $args)` — write file with PHP syntax check; returns `WP_Error` on failure.
- `validate_file_to_edit($file, $allowed_files)` — guard against path traversal.

### Effective fields rendered
| Field | Source | Notes |
|---|---|---|
| Active stylesheet | `get_stylesheet()` | Defaults editor target |
| Theme list | `wp_get_themes()` | Picker dropdown |
| File tree | `wp_make_theme_file_tree()` | Sidebar tree, organized by extension |
| File content | `fread()` on the absolute path | Plain text |
| File writable flag | `is_writable($file)` | Drives "Update File" button visibility |
| Theme errors | `$theme->errors()` | Banner above tree |
| Recently edited | `get_user_option('recently_edited')` (cache; not surfaced as a list in the UI) | Updated via `update_recently_edited($file)` |

### Save semantics — the "PHP syntax safety net"
On POST, `wp_edit_theme_plugin_file()`:
1. Backs up current file content to a temp path.
2. Writes the new content.
3. Issues a `wp_remote_post()` self-request with a sentinel scoped to detect fatal errors.
4. If a fatal occurs, restores the backup. Returns `WP_Error` with the error message.
5. Otherwise commits.

This is what makes in-browser PHP editing not catastrophic in practice. Any rebuild **must** preserve this safety net.

### Non-REST data (gaps)
The entire screen is a gap:
- **No `GET /wp/v2/theme-files`** — does not exist.
- **No `PUT /wp/v2/theme-files/{path}`** — does not exist.
- **No syntax-check endpoint** — `wp_edit_theme_plugin_file()` is internal only.
- **Recommendation:** propose a `wp-admin-shell/v1/theme-files` namespace as a v2 surface:
  - `GET /theme-files?theme={stylesheet}` → tree
  - `GET /theme-files/{path}?theme={stylesheet}` → file content + writable + size + mtime
  - `PUT /theme-files/{path}?theme={stylesheet}` → write with safety-net (calls `wp_edit_theme_plugin_file()`)

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Edit Themes")                                    │
│  └─ Theme picker: select + "Select" button                   │
├─────────────────────────────────────────────────────────────┤
│ STATE BANNER                                                 │
│  ├─ "File edited successfully" (after save)                  │
│  ├─ "There was an error… {message}" (on save failure)        │
│  ├─ CSS-specific notice ("There is no need to change your CSS│
│  │   here — use Site Editor / Customizer")                   │
│  ├─ Minified-stylesheet warning                              │
│  ├─ Child theme parent-file warning                          │
│  └─ Theme broken banner (theme errors)                       │
├─────────────────────────────────────────────────────────────┤
│ TWO-PANE EDITOR                                              │
│  ┌─────────────┬───────────────────────────────────────────┐ │
│  │ FILE TREE   │ EDITOR                                    │ │
│  │  (left)     │  ├─ Title: "Editing {theme} ({active|in.})│ │
│  │  ├─ stylesh.│  ├─ Subtitle: "File: {path}"              │ │
│  │  ├─ funcs.  │  ├─ CodeMirror textarea                   │ │
│  │  ├─ tree:   │  ├─ Documentation dropdown (PHP only)     │ │
│  │  │   PHP/   │  ├─ "Update File" button (or read-only msg│ │
│  │  │   CSS/   │  │  if not writable)                      │ │
│  │  │   JS/    │  └─ "Theme is paused" / errors inline     │ │
│  │  │   JSON   │                                           │ │
│  │  └─ Parent  │                                           │ │
│  │    theme   │                                           │ │
│  │    notice   │                                           │ │
│  └─────────────┴───────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ FIRST-VISIT WARNING DIALOG                                   │
│  ├─ "Heads up! Direct edits are not recommended."            │
│  ├─ Child theme suggestion                                   │
│  └─ Buttons: "Go back" / "I understand"                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First entry | Skeleton tree + editor |
| Empty (theme has no editable files) | Tree empty | "No editable files in this theme." |
| File loaded | File selected | Content in editor + Update enabled |
| Read-only (file not writable) | `is_writable() === false` | Editor read-only + message about file permissions |
| Dirty | User edits | Update button enabled |
| Saving | Update clicked | "Saving…"; lock editor |
| Save success | Server returns 200 | Notice "File edited successfully" |
| Save failure (PHP fatal) | Safety net rolled back | Notice "Error while updating: {fatal message}" + content preserved |
| Save failure (write permission) | `is_writable() === false` | Inline notice + steps to fix |
| Save failure (validation) | File path mismatch | "File does not exist" |
| Theme broken | `$theme->errors()` non-empty | Banner: "This theme is broken." |
| First visit | Session-scoped | Warning dialog blocking editor; dismiss via "I understand" + dismissed_wp_pointers user meta |
| Permission denied | `! current_user_can('edit_themes')` or `DISALLOW_FILE_EDIT` | Empty state |
| Multisite | not network admin | Redirect to network admin |
| CSS file with site-editor alternative | File extension `.css` and block theme | Inline notice with deep link to Site Editor CSS panel |
| Minified stylesheet | sibling `.min.css` exists | Warning: "This unminified stylesheet may not be served." |

---

## 7. Actions

### Header actions
- **Switch theme** — Select dropdown + "Select" button. Loads target theme's tree (preserves stylesheet via `theme=` param).

### Editor actions
| Action | Cap | Type | Notes |
|---|---|---|---|
| Update File | `edit_themes` + writable | Mutation | POST with safety net |
| Look Up function | none | External | Opens `https://api.wordpress.org/core/handbook/...` for selected function |

### Tree actions
| Action | Type | Notes |
|---|---|---|
| Click file | Selection | Loads content into editor |
| Expand / collapse folder | UI | Tree-only; via `aria-expanded` |

### Bulk actions
N/A — single-file editing.

### Optimistic vs. blocking
- **Save** — blocking. PHP safety net runs server-side; client must wait. Show progress.
- **File switch** — blocking on read; warn if dirty edits unsaved.

---

## 8. Filters, sort, search, pagination

### Tree
| Filter | Field | Operators | Source |
|---|---|---|---|
| Search (shell-added) | filename / path | substring | client-side |

Core has no filter or search — the tree is fixed. The shell may add a filename filter as a usability improvement.

### Sort
- Tree: ordered by `wp_make_theme_file_tree()` — `style.css` and `functions.php` pinned to top, then alphabetical by extension group.

### Pagination
N/A.

---

## 9. Forms & inputs

### Editor textarea
| Field | Type | Required | Notes |
|---|---|---|---|
| `newcontent` | textarea (CodeMirror) | yes | File content |
| `file` | hidden text | yes | Relative file path |
| `theme` | hidden text | yes | Stylesheet |
| `nonce` | hidden text | yes | `edit-theme_{stylesheet}_{file}` action |

### Theme picker
| Field | Type | Required | Notes |
|---|---|---|---|
| Theme | select | yes | List of installed themes from `wp_get_themes()` |

### First-visit warning
| Field | Type | Required | Notes |
|---|---|---|---|
| Acknowledge | button click | yes | Persists `theme_editor_notice` to `dismissed_wp_pointers` user meta |

### Validation
- Server: `validate_file_to_edit()` blocks path traversal; PHP safety net catches fatal errors.
- Client (shell-added): warn on:
  - Editing the active theme directly (suggest child theme).
  - Editing a parent theme from a child theme context.
  - Editing minified stylesheets when an unminified sibling exists.

### Save semantics
- Blocking POST (or `PUT /wp-admin-shell/v1/theme-files/{path}` when v2 API exists).
- Server runs safety net (see §4).
- On success: editor stays on file with success notice; content reflects saved state.
- On fatal: original content restored; error notice shown.

---

## 10. Routing & URL state

Original wp-admin URL params:
- `theme-editor.php` — defaults to active theme + `style.css`
- `theme-editor.php?theme={stylesheet}` — switch theme
- `theme-editor.php?theme={stylesheet}&file={relative-path}` — open specific file
- `theme-editor.php?...&a=1` — flash success after redirect

Shell hash routing:
```
#/theme-file-editor                                 # active theme + style.css
#/theme-file-editor/{stylesheet}                    # switch theme
#/theme-file-editor/{stylesheet}/{file-path}        # specific file
```

`{file-path}` is URL-encoded (slashes become `%2F`).

Browser back/forward must restore selection. Refresh must restore. Sharing URL must reproduce.

**Dirty-state navigation:** if the user has unsaved edits and tries to navigate, prompt: "Discard changes?"

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| CSS file notice → Site Editor link | `core:site-editor` Styles → CSS | none |
| CSS file notice → Customizer link (classic theme) | external (Customizer) | autofocus param |
| Function documentation "Look Up" | external | new tab to wordpress.org docs |
| Theme picker (switch theme) | self | `theme={stylesheet}` |
| First-visit "Go back" | referrer page | preserved via `wp_get_referer()` |

### Inbound
- From admin menu Appearance → Theme File Editor → screen.
- From command palette (advanced shells only) → screen.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Inline notice: "File edited successfully" |
| Save failure (PHP fatal) | Inline notice with error code preformatted |
| Save failure (other) | Inline error |
| Theme paused / errors | Persistent banner above tree |
| File not writable | Persistent inline message; no Update button |
| Child theme parent-file edit | Inline warning ("This is a file in your current parent theme") |
| Minified stylesheet | Persistent warning |
| First visit | Modal warning (one-time) |

Undo: not supported. Per-file revert is best-effort (re-load from disk via tree click — but unsaved buffer is lost).

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` (in editor) | Inserts a tab character (CodeMirror behavior) |
| `Esc` then `Tab` | Move focus out of editor |
| `Esc` `Esc` (screen reader, forms mode) | Exit forms mode |
| `Cmd/Ctrl+S` | Save (shell-added; not in core) |

### ARIA & focus
- Tree: `role="tree"` with `aria-labelledby="theme-files-label"`.
- Tree items: `role="treeitem"` with `aria-expanded` and `aria-level`.
- Editor: `aria-describedby` pointing to keyboard help text (`editor-keyboard-trap-help-1` through `-4`).
- First-visit dialog: `role="dialog"` with focus trap.
- After save: focus returns to Update button; live region announces success.

### Screen reader
- File switch announced.
- Save success / failure announced.
- Editing inside the textarea is a known accessibility hazard — core's keyboard help text (`editor-keyboard-trap-help-*`) explicitly addresses screen readers entering forms mode.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_theme_editor_filetypes` filter | Allow / restrict editable extensions | Preserve. |
| `wp_edit_theme_plugin_file` (function) | Save with safety net | Preserve — must be the save path. |
| `validate_file_to_edit` (function) | Path traversal guard | Preserve. |
| `dismissed_wp_pointers` user meta | Track first-visit dismissal | Preserve. |
| `screen_options_show_screen` filter | Show/hide screen options | Drop — shell owns chrome. |

Plugin compatibility note: theme file edits don't have hookable extensibility around the editor UI. The few filters that exist are server-side and continue to work.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** none registered.
- **Workaround:** `iframe:theme-editor.php`. Works only when `DISALLOW_FILE_EDIT` is unset.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Propose REST surface `/wp-admin-shell/v1/theme-files` | High | Without it, native rebuild is awkward (form POST only). Specs the endpoint above. |
| Register `core:theme-file-editor` app source | Low | Only relevant for `developer-admin`-style shells |
| Tree component | Medium | `role="tree"` semantic is non-trivial |
| Code editor integration | Medium | Use any code-editor library; not a `@wordpress/*` package fit. CodeMirror or Monaco; user choice. |
| PHP syntax safety net surfacing | High | Critical UX — safety must be visible |
| Theme picker | Medium | Reuse REST `/wp/v2/themes` |
| First-visit warning | High | Match core's prominence |
| `DISALLOW_FILE_EDIT` detection | High | Hide menu entry server-side |
| Multisite redirect | High | Match core's behavior |
| CSS file → Site Editor deep link | Medium | Inline notice |
| Function documentation lookup (PHP) | Low | Surfaces the `wp_doc_link_parse()` behavior |
| Recently-edited file list | Low | Currently invisible to users; could be surfaced |
| Diff against last save | Low | Better than current core; gap proposal |

### Acceptable interim
For v1 of any shell config, `iframe:theme-editor.php` is acceptable as an escape hatch and is the recommended approach. Most shells will not surface this at all (`content-author`, `client-portal`). Only `developer-admin` should include it, gated on `! defined('DISALLOW_FILE_EDIT')`.

---

## 16. Out of scope

- **Plugin file editor** — same code shape; specced separately under `plugins.md`.
- **Diff view between revisions** — not provided by core.
- **Git integration** — out of scope.
- **In-browser file upload to themes directory** — not provided by core; use the Themes screen ZIP upload.
- **Multi-file editing tabs** — single-file at a time in core.
- **`DISALLOW_FILE_EDIT` toggle UI** — constant must be defined in `wp-config.php`; never expose as a runtime toggle.

---

## 17. Reference

- Original PHP: `wp-admin/theme-editor.php`
- Save handler: `wp-admin/includes/file.php::wp_edit_theme_plugin_file()`
- Path traversal guard: `wp-admin/includes/file.php::validate_file_to_edit()`
- File tree builder: `wp-admin/includes/template.php::wp_make_theme_file_tree()`, `wp_print_theme_file_tree()`
- Recently-edited tracker: `wp-admin/includes/file.php::update_recently_edited()`
- Documentation parser: `wp-admin/includes/misc.php::wp_doc_link_parse()`
- Code editor enqueue: `wp-admin/includes/general-template.php::wp_enqueue_code_editor()`
- Constant docs: `https://developer.wordpress.org/advanced-administration/wordpress/edit-files/`
- Cross-link: `plugins.md` — sibling Plugin File Editor spec
- Cross-link: [`site-editor-styles.md`](./site-editor-styles.md) — recommended alternative for CSS edits
- Cross-link: [`themes.md`](./themes.md) — recommended alternative for ZIP-based theme updates
