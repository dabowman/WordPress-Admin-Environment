# Screen Spec: Settings — Permalinks

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-permalink.php` (custom handler — does **not** use `options.php`)
**Current workspace coverage:** Not implemented in v1. Falls back to `iframe:options-permalink.php` when configured.

This spec describes the **semantic surface** of the Permalinks screen. Notably, this is the **only** Settings screen in core that handles its own POST instead of routing through `options.php` — because changing permalinks requires `flush_rewrite_rules()` and may need to write to `.htaccess` / `web.config`.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-permalinks` |
| Display name | "Permalinks" / "Permalink Settings" |
| Original URL | `/wp-admin/options-permalink.php` |
| Menu location | Settings → Permalinks |
| Submenu items | N/A |
| Parent app | `core:settings` |
| Sub-screens | None |

---

## 2. Purpose

Choose the URL structure for posts and archives. Optionally customize the slug prefix used for category and tag archives. After saving, WordPress regenerates rewrite rules and (when permitted) updates the server's URL-rewriting config file.

Jobs to be done:
- **Improve URLs** — switch from `?p=123` to `/post-name/` for SEO and shareability.
- **Match a content schema** — date-based, ID-based, or fully custom structures with tags like `%category%/%postname%`.
- **Brand archives** — replace `/category/` and `/tag/` slugs with site-specific terms.
- **Diagnose .htaccess writability** — see the rules to paste manually when WordPress can't write the config.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-permalink.php` line 12 |
| Save | `manage_options` + nonce `update-permalink` | options-permalink.php line 102 |
| .htaccess auto-write | filesystem writability of `home_path . .htaccess` | options-permalink.php lines 159–171 |
| web.config auto-write | `iis7_supports_permalinks()` + writability | options-permalink.php lines 149–156 |

**Permission-denied state:** `wp_die()` with translated string.

**Multisite:** Permalink structure is restricted by the network's URL scheme (subdomain vs. subdirectory). Plain permalinks are not allowed on multisite. The form silently strips `/blog` prefix on the main site of subdirectory installs to keep paths clean.

---

## 4. Data model

### Primary entity
- Post handler: `options-permalink.php` itself (NOT `options.php`).
- Nonce action: `update-permalink`.

### REST-exposed fields

The permalink options are **not registered with `show_in_rest`** in `register_initial_settings()`. Verification against `WP_REST_Settings_Controller::get_registered_options()` output confirms they are absent. Treat all fields here as **non-REST**.

### Non-REST options (legacy form save only — gaps)

| Option | Form field | Type | Default | Notes |
|---|---|---|---|---|
| `permalink_structure` | Permalink structure | string | "" (Plain) on new installs; `'/%year%/%monthnum%/%day%/%postname%/'` on upgraded sites | Saved via `WP_Rewrite::set_permalink_structure()`; triggers `flush_rewrite_rules()` |
| `category_base` | Category base | string | "" (uses `/category/`) | Saved via `WP_Rewrite::set_category_base()` |
| `tag_base` | Tag base | string | "" (uses `/tag/`) | Saved via `WP_Rewrite::set_tag_base()` |

### Side effects on save
1. `WP_Rewrite::set_permalink_structure()` updates the option and re-derives related rules.
2. `flush_rewrite_rules()` regenerates `rewrite_rules` option.
3. If the server is **Apache** and `.htaccess` is writable, core writes the new rules.
4. If **IIS7** and `web.config` is writable, core writes new rules.
5. If **Nginx** or **Caddy**, core never writes config. Rules must be applied via the server's config file.
6. If filesystem isn't writable, core surfaces the rules in a `<textarea>` for manual copy-paste.

### Default structure presets

| ID | Label | Value pattern | Example URL |
|---|---|---|---|
| `plain` | Plain | "" | `https://example.com/?p=123` |
| `day-name` | Day and name | `/%year%/%monthnum%/%day%/%postname%/` | `https://example.com/2026/04/30/sample-post/` |
| `month-name` | Month and name | `/%year%/%monthnum%/%postname%/` | `https://example.com/2026/04/sample-post/` |
| `numeric` | Numeric | `/archives/%post_id%` | `https://example.com/archives/123` |
| `post-name` | Post name | `/%postname%/` | `https://example.com/sample-post/` |
| Custom | Custom Structure | freeform | (depends) |

(`archives` is i18n via `_x('archives', 'sample permalink base')`.)

### Available structure tags
Filterable via `available_permalink_structure_tags`:

| Tag | Meaning |
|---|---|
| `%year%` | Four-digit year |
| `%monthnum%` | Two-digit month |
| `%day%` | Two-digit day |
| `%hour%` | Hour 0–23 |
| `%minute%` | Minute 0–59 |
| `%second%` | Second 0–59 |
| `%post_id%` | Post unique ID |
| `%postname%` | Sanitized post slug |
| `%category%` | Lowest-numbered category slug |
| `%author%` | Sanitized author username |

Plugins commonly add `%customtaxonomy%`-style tags via the filter.

### .htaccess / web.config status
- `$writable` — bool; whether config is auto-writable
- `$using_index_permalinks` — bool; whether structure includes `/index.php` prefix
- `$htaccess_update_required` — bool; whether the rules in the file differ from generated rules
- `$is_nginx` / `$is_caddy` / `$iis7_permalinks` — server detection booleans

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Permalinks")                                     │
├─────────────────────────────────────────────────────────────┤
│ INTRO PARAGRAPH                                              │
│  └─ Documentation link + tag examples                        │
├─────────────────────────────────────────────────────────────┤
│ SECTION "Common Settings"                                    │
│  └─ Permalink structure                                      │
│       ◯ Plain          [example URL]                         │
│       ◯ Day and name   [example URL]                         │
│       ◯ Month and name [example URL]                         │
│       ◯ Numeric        [example URL]                         │
│       ◯ Post name      [example URL]                         │
│       ◯ Custom Structure                                     │
│           └─ [text input — preview of base URL prefix]       │
│           └─ Available tags row (clickable buttons)          │
├─────────────────────────────────────────────────────────────┤
│ SECTION "Optional"                                           │
│  ├─ Helper paragraph                                         │
│  ├─ Category base [text input]                               │
│  └─ Tag base       [text input]                              │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes                                             │
├─────────────────────────────────────────────────────────────┤
│ POST-FORM (single-site only, when applicable)                │
│  └─ .htaccess / web.config rules to copy if not writable     │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton |
| Idle / Editing / Saving / Saved | Standard | |
| Saved + writable .htaccess | Apache + writable | Snackbar: "Permalink structure updated." |
| Saved + non-writable .htaccess | Apache + not writable + rules differ | Banner: "You should update your `.htaccess` file now." + textarea with rules |
| Saved + IIS7 + writable | IIS7 + writable | Snackbar + secondary instruction to remove write access |
| Saved + IIS7 + non-writable | IIS7 + not writable | Textarea with `web.config` rules and rewrite snippet |
| Saved + Nginx | Server detected | Plain success snackbar; no autowrite; documentation link in help sidebar |
| Saved + Caddy | Server detected | Same as Nginx |
| Multisite + main site of subdirectory install | Special URL handling | `/blog` prefix automatically added/preserved |
| Permission denied | 403 | 403 view |

---

## 7. Actions

### Primary action
- **Save Changes** — POST to `options-permalink.php` (NOT `options.php`) with nonce `update-permalink`. Triggers `flush_rewrite_rules()`. Returns 302 redirect to `?settings-updated=true`.

### Secondary actions
- **Click a structure tag button** (in Custom mode) — appends/removes the tag from the custom-structure input. Pure client-side mutation; no save.
- **Copy rules to clipboard** — when the textarea of fallback rules appears, allow copy-to-clipboard.

### Optimistic vs. blocking
- **Save Changes** — blocking. Permalink rewrites have site-wide impact; user must see confirmation before navigating.

---

## 8. Filters, sort, search, pagination

N/A.

---

## 9. Forms & inputs

### Permalink structure (radio + custom)
- Type: radio group with embedded text input for "Custom"
- Option: `permalink_structure` (string)
- Required: yes (Plain accepts "")
- Helper: "Including the `%postname%` tag makes links easy to understand…"
- Behavior:
  - Selecting a preset radio sets the option to its value pattern.
  - Selecting Custom focuses the freeform input; current `permalink_structure` populates it.
  - Tag buttons toggle inclusion of `%tag%` substrings in the input.
- Validation:
  - Sanitized via `sanitize_option('permalink_structure')`.
  - Multiline `/+` collapsed to single `/`.
  - `#` characters stripped.
  - Must be empty (Plain) or contain at least one structure tag.
  - On multisite, certain prefixes (`/blog/`) are preserved or stripped depending on subdomain/subdirectory mode.

### Category base
- Type: text
- Option: `category_base` (string)
- Default: "" (renders as `/category/` in URLs)
- Validation: sanitized as path; leading slash added; multisite blog-prefix preserved when applicable.
- UI: optional `<code>` prefix shown ahead of the input on multisite to indicate where the prefix lands.

### Tag base
- Type: text
- Option: `tag_base` (string)
- Default: "" (renders as `/tag/`)
- Validation: same as Category base.

### Save semantics
- Custom POST handler at `/wp-admin/options-permalink.php`.
- Nonce: `update-permalink`.
- After save, redirect to `options-permalink.php?settings-updated=true`.
- For workspace rebuild: implement a custom REST endpoint (`/wp-admin-workspaces/v1/settings/permalinks`) that wraps the same logic — set values via `WP_Rewrite` setters, call `flush_rewrite_rules()`, return a structured result with `{ writable: bool, server: 'apache'|'iis7'|'nginx'|'caddy', rules: string|null, message: string }`.

---

## 10. Routing & URL state

Original URL: `/wp-admin/options-permalink.php`. Query state: `?settings-updated=true`.

Workspace hash: `#/settings/permalinks`.

---

## 11. Inter-app navigation

### Outbound
- Documentation links → external.

### Inbound
- From `core:settings` host.
- From a "broken links after migration" diagnostic flow.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success (writable) | Snackbar: "Permalink structure updated." |
| Save success (non-writable, Apache) | Persistent banner: "Your `.htaccess` file is not writable…" + rules textarea |
| Save success (non-writable, IIS) | Persistent banner: "Your `web.config` file is not writable…" + rules textarea |
| Save success (Nginx/Caddy) | Snackbar + help link to nginx/caddy documentation |
| Validation error | Inline notice |
| .htaccess written but write-access remains | Optional warning: "Permalink structure updated. Remove write access on `.htaccess` file now!" — only in IIS path; Apache leaves this to admin discretion |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between radios, custom input, tag buttons, optional inputs, save |
| `↑` / `↓` in radio group | Move radio selection |
| `Enter` on tag button | Toggle tag in custom-structure input |
| `Cmd/Ctrl+S` | Save |

### ARIA & focus
- Radio fieldset `<fieldset class="structure-selection"><legend>Permalink structure</legend>`.
- Custom-structure input: `aria-describedby="permalink-custom"` to point at the prefix `<code>` element.
- Each tag button: `aria-label` containing the explanation text plus `data-added` / `data-removed` / `data-used` strings for live announcements.
- Live region `<div id="custom_selection_updated" aria-live="assertive" class="screen-reader-text">` announces tag add/remove.
- Fallback rules textarea: `readonly` + `aria-describedby` to the explanation paragraph.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `available_permalink_structure_tags` | Add or remove tag buttons | Honor — pull current list when rendering Custom mode |
| `pre_update_option_permalink_structure` etc. | Hijack option write | Server-side concern; honor on backend |
| `do_settings_fields( 'permalink', 'optional' )` | Plugin fields under Optional | `core:settings.panels` slot |

---

## 15. Mapping & implementation status

### Current workspace coverage
- Not implemented; reserved as `core:settings-permalinks` source slot.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Permalink structure radio + custom + tag buttons | High | All non-REST; needs custom workspace endpoint |
| Category base / Tag base | High | Non-REST |
| .htaccess / web.config writability detection + rule echo | High | Server-detection logic must move into custom endpoint response |
| Multisite blog-prefix handling | Medium | Subdirectory main-site preserves `/blog/` |
| Tag buttons live announcement | Medium | A11y polish |
| Server-specific docs link in sidebar | Low | Nginx/Caddy/IIS variants |

### Acceptable interim
`iframe:options-permalink.php` is the recommended fallback. Permalinks UX has unique server-side coupling (writes to filesystem, flushes rewrite cache) that is hard to fully decouple from the wp-admin runtime. Iframe is acceptable until a custom endpoint is built.

---

## 16. Out of scope

- **Per-post-type rewrite slug** — registered in code (`register_post_type`); not editable from this panel.
- **Per-taxonomy rewrite slug beyond category/tag** — same; not in this panel.
- **Pretty Permalinks at the network level** — multisite Network admin concern.
- **Rewrite rule debugger / Rewrite Rules Inspector plugin** — third-party.

---

## 17. Reference

- Original PHP form + handler: `wp-admin/options-permalink.php` (handles its own POST)
- `WP_Rewrite` class: `wp-includes/class-wp-rewrite.php`
- `flush_rewrite_rules()`: `wp-includes/rewrite.php`
- `iis7_supports_permalinks()`: `wp-admin/includes/misc.php`
- Settings registration: not in `register_initial_settings`. Allowed options not in `options.php` — handled directly by options-permalink.php.
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php` (does NOT cover permalinks)
- Documentation: `https://wordpress.org/documentation/article/customize-permalinks/`
- Current workspace impl: not yet implemented.
