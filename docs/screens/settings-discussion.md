# Screen Spec: Settings — Discussion

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-discussion.php`, `wp-admin/options.php` (legacy save handler)
**Current shell coverage:** `core:settings-discussion` → `src/apps/settings-discussion/index.js` (M4 — REST-native, partial; majority of fields are non-REST and require fallback)

This spec describes the **semantic surface** of the Discussion Settings screen. This panel has the largest non-REST surface area of any Settings screen — only two of ~24 options are REST-exposed.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-discussion` |
| Display name | "Discussion" / "Discussion Settings" |
| Original URL | `/wp-admin/options-discussion.php` |
| Menu location | Settings → Discussion |
| Submenu items | N/A |
| Parent app | `core:settings` |
| Sub-screens | None |

---

## 2. Purpose

Configure comment behavior, moderation rules, notification preferences, and avatar display.

Jobs to be done:
- **Set comment defaults** — open/closed by default, pingbacks on/off.
- **Tighten moderation** — auto-hold heavy-link comments, keyword blocklist, registration requirement.
- **Manage notifications** — what triggers an email to the admin.
- **Configure threading and pagination** — depth, page size, order.
- **Display avatars** — show or hide, max content rating, default placeholder.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-discussion.php` line 11 |
| Save settings | `manage_options` | REST controller |

**Permission-denied state:** `wp_die()`.

**Multisite:** Adds extra context for `comment_registration` ("Signup has been disabled. Only members of this site can comment.") when `users_can_register` is off.

---

## 4. Data model

### Primary entity
- REST endpoint: `GET/POST /wp/v2/settings`

### REST-exposed fields

Only two fields here are exposed to REST. Verified against `register_initial_settings()` in `wp-includes/option.php` (lines 2944–2971).

| Form field | Option name | REST key | Type | Default | Notes |
|---|---|---|---|---|---|
| Allow link notifications from other blogs | `default_ping_status` | `default_ping_status` | string | `open` | enum `open`/`closed` |
| Allow people to submit comments on new posts | `default_comment_status` | `default_comment_status` | string | `open` | enum `open`/`closed` |

### Non-REST options (legacy form save only — gaps)

The bulk of the panel.

| Option | Form field | Type | Default | Notes |
|---|---|---|---|---|
| `default_pingback_flag` | Attempt to notify any blogs linked from the post | bool | true | Ping outgoing links on publish. **NOT** `show_in_rest` — legacy form/option save only. |
| `require_name_email` | Comment author must fill out name and email | bool | true | |
| `comment_registration` | Users must be registered and logged in to comment | bool | false | |
| `close_comments_for_old_posts` | Automatically close comments on old posts | bool | false | |
| `close_comments_days_old` | Close comments when post is how many days old | int | 14 | nested under above |
| `show_comments_cookies_opt_in` | Show comments cookies opt-in checkbox | bool | true | |
| `thread_comments` | Enable threaded (nested) comments | bool | true | |
| `thread_comments_depth` | Number of levels for threaded comments | int (2–`thread_comments_depth_max`, default max 10) | 5 | nested |
| `page_comments` | Break comments into pages | bool | false | |
| `comments_per_page` | Top level comments per page | int | 50 | nested |
| `default_comments_page` | Comments page to display by default | string `newest`/`oldest` | newest | nested |
| `comment_order` | Comments to display at the top of each page | string `asc`/`desc` | asc | nested |
| `comments_notify` | Anyone posts a comment | bool | true | Email-me-whenever group |
| `moderation_notify` | A comment is held for moderation | bool | true | Email-me-whenever group |
| `wp_notes_notify` | Anyone posts a note | bool | true | Email-me-whenever group; new in 6.x |
| `comment_moderation` | Comment must be manually approved | bool | false | "Before a comment appears" group |
| `comment_previously_approved` | Comment author must have a previously approved comment | bool | true | "Before a comment appears" group |
| `comment_max_links` | Hold a comment if it contains N or more links | int | 2 | |
| `moderation_keys` | Comment Moderation keyword list | string (newline-separated) | "" | textarea |
| `disallowed_keys` | Disallowed Comment Keys (Trash) | string (newline-separated) | "" | textarea |
| `show_avatars` | Show Avatars | bool | true | |
| `avatar_rating` | Maximum Rating | string `G`/`PG`/`R`/`X` | G | |
| `avatar_default` | Default Avatar | string enum | `mystery` | enum: `mystery`, `blank`, `gravatar_default`, `identicon`, `wavatar`, `monsterid`, `retro`, `robohash`, `initials`, `color` (filterable) |

### Aggregate data
- Maximum thread depth: `apply_filters('thread_comments_depth_max', 10)` — default 10. Theme/plugin can override.
- Avatar default options: `apply_filters('avatar_defaults', $list)` — themes can extend.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Discussion")                                     │
├─────────────────────────────────────────────────────────────┤
│ FORM section "Comments"                                      │
│  ├─ Default post settings                                    │
│  │    ☐ Notify linked blogs (default_pingback_flag)          │
│  │    ☐ Allow link notifications (default_ping_status)       │
│  │    ☐ Allow comments (default_comment_status)              │
│  │    helper: "Individual posts may override these…"         │
│  ├─ Other comment settings                                   │
│  │    ☐ Comment author must fill out name and email          │
│  │    ☐ Users must be registered and logged in to comment    │
│  │    ☐ Automatically close comments on old posts            │
│  │       └─ days input (nested)                              │
│  │    ☐ Show comments cookies opt-in checkbox                │
│  │    ☐ Enable threaded (nested) comments                    │
│  │       └─ depth select (nested)                            │
│  ├─ Comment Pagination                                       │
│  │    ☐ Break comments into pages                            │
│  │       ├─ comments_per_page (nested)                       │
│  │       ├─ default_comments_page select (nested)            │
│  │       └─ comment_order select (nested)                    │
│  ├─ Email me whenever                                        │
│  │    ☐ Anyone posts a comment                               │
│  │    ☐ A comment is held for moderation                     │
│  │    ☐ Anyone posts a note (wp_notes_notify, new)           │
│  ├─ Before a comment appears                                 │
│  │    ☐ Comment must be manually approved                    │
│  │    ☐ Comment author must have a previously approved one   │
│  ├─ Comment Moderation                                       │
│  │    ├─ links count input                                   │
│  │    └─ moderation_keys textarea                            │
│  └─ Disallowed Comment Keys                                  │
│       └─ disallowed_keys textarea                            │
├─────────────────────────────────────────────────────────────┤
│ FORM section "Avatars"                                       │
│  ├─ Avatar Display ☐ Show Avatars                            │
│  ├─ Maximum Rating  ◯ G  ◯ PG  ◯ R  ◯ X (gated by show)     │
│  └─ Default Avatar  ◯ Mystery / Blank / Gravatar Logo / …    │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes                                             │
└─────────────────────────────────────────────────────────────┘
```

Nested affordances visually indented; PHP version uses `<ul><li>` under the parent label.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton form |
| Idle / Editing / Saving / Saved / Error | Same as other panels | Standard |
| Avatars hidden | `show_avatars === 0` | Maximum Rating + Default Avatar groups receive `hide-if-js` (visually hidden, still in form for save round-trip) |
| Threaded comments off | `thread_comments === 0` | Depth select disabled |
| Comments not paginated | `page_comments === 0` | Per-page / order selects disabled |
| Multisite + signup off | `is_multisite() && ! users_can_register` | Inline note: "Signup has been disabled. Only members of this site can comment." beside `comment_registration` |

---

## 7. Actions

### Primary action
- **Save Changes** — single REST POST to `/wp/v2/settings`. The two exposed keys save today; the remaining ~22 are unblocked by re-registering each option with `register_setting( 'discussion', $option, [ 'show_in_rest' => … ] )` (the option's existing `sanitize_callback` still runs), so they fold into the same POST. No custom endpoint needed.

### No bulk / per-row / inline actions.

---

## 8. Filters, sort, search, pagination

N/A.

---

## 9. Forms & inputs

### Default post settings (group of 3 checkboxes)
- `default_pingback_flag` — **NOT** REST exposed (legacy form/option save only); bool checkbox
- `default_ping_status` — REST exposed; checkbox writes "open" or "closed" string
- `default_comment_status` — REST exposed; checkbox writes "open" or "closed" string
- Helper: "Individual posts may override these settings. Changes here will only be applied to new posts."

### Other comment settings (group)
- `require_name_email` — checkbox
- `comment_registration` — checkbox; multisite signup-off note conditionally appears
- `close_comments_for_old_posts` — checkbox
  - `close_comments_days_old` — number, min 0, default 14
- `show_comments_cookies_opt_in` — checkbox
- `thread_comments` — checkbox
  - `thread_comments_depth` — select, 2..max (default max 10)

### Comment Pagination
- `page_comments` — checkbox
  - `comments_per_page` — number, min 0, default 50
  - `default_comments_page` — select: `newest`/`oldest` (labels "last page"/"first page")
  - `comment_order` — select: `asc`/`desc` (labels "older"/"newer")

### Email me whenever
- `comments_notify` — checkbox
- `moderation_notify` — checkbox
- `wp_notes_notify` — checkbox (new in 6.x)

### Before a comment appears
- `comment_moderation` — checkbox
- `comment_previously_approved` — checkbox

### Comment Moderation
- `comment_max_links` — number, min 0, embedded in sentence: "Hold a comment in the queue if it contains [N] or more links."
- `moderation_keys` — textarea, large; one word/phrase/IP per line; substring match.

### Disallowed Comment Keys
- `disallowed_keys` — textarea, large; same format as moderation keys; matched comments go to Trash, not moderation.

### Avatars
- `show_avatars` — checkbox; toggles visibility of subordinate groups
- `avatar_rating` — radio group: G / PG / R / X (with descriptive labels)
- `avatar_default` — radio group with image previews:
  - `mystery` — Mystery Person
  - `blank` — Blank
  - `gravatar_default` — Gravatar Logo
  - `identicon` — Identicon (Generated)
  - `wavatar` — Wavatar (Generated)
  - `monsterid` — MonsterID (Generated)
  - `retro` — Retro (Generated)
  - `robohash` — RoboHash (Generated)
  - `initials` — Initials (Generated)
  - `color` — Color (Generated)
  - Plus any added via `avatar_defaults` filter.

### Save semantics
- Single Save button.
- REST handles 2 fields today; the ~22 remaining are reachable through the same `/wp/v2/settings` POST once each option is re-registered via `register_setting( 'discussion', $option, [ 'show_in_rest' => … ] )`. The Settings-API `sanitize_option` path runs server-side regardless, so no custom `/wp-admin-workspaces/v1/options/discussion` endpoint is required — prefer the `register_setting` shim over a bespoke endpoint or 22 sequential AJAX requests.
- Validation: server authoritative. Client may pre-validate numeric mins/enum values.

---

## 10. Routing & URL state

Original URL: `/wp-admin/options-discussion.php`. Shell hash: `#/settings/discussion`. No query state.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click "moderation queue" link in Comment Moderation helper | `comments` app | `?status=hold` |
| Documentation links | external | URL |

### Inbound
- From `core:settings` host.
- From a comment notification email link (deep-link to settings).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar: "Settings saved." |
| Save partial failure | Banner with per-section detail |
| Avatars toggled off | Inline tween hide of dependent groups |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `Space` | Toggle checkbox / select radio |
| `Cmd/Ctrl+S` | Save |

### ARIA & focus
- Each field group inside `<fieldset><legend>`.
- Nested controls (days, depth, pagination subset) use `aria-describedby` to parent label and are disabled when parent checkbox is off.
- Avatar default radios: each `<label>` includes the `<img>` preview as visible content; alt text describes the avatar style.
- `role="status"` for sign-up-disabled inline note.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `thread_comments_depth_max` | Set max depth value | Honor when populating depth select |
| `avatar_defaults` | Add avatar style options | Honor when listing defaults |
| `default_avatar_select` | Filter rendered HTML of the radio list | Drop — replace with structured data |
| `do_settings_fields( 'discussion', 'default' )` | Plugin-added fields under "Other comment settings" | `core:settings.panels` slot |
| `do_settings_fields( 'discussion', 'avatars' )` | Plugin-added fields under "Avatars" | `core:settings.panels` slot |

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:settings-discussion` → `src/apps/settings-discussion/index.js`
- **What works:** the two REST-exposed keys (default_ping_status, default_comment_status). Saves via `core/notices`.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| All non-REST options (~22 fields) | High | Single biggest gap of any settings panel. Closable shell-side via `register_setting( show_in_rest )` shims (no custom endpoint needed) — see §7 Save semantics. |
| Threaded comments + depth dependency | Medium | UI conditional logic |
| Comment pagination dependency group | Medium | UI conditional logic |
| Avatar Display → toggles avatar groups | Medium | Conditional |
| `wp_notes_notify` toggle | Medium | New 6.x option, not yet in shell |
| Avatar previews per default style | Medium | Renders 10 actual `<img>` tags from gravatar with `force_default` |
| Multisite signup-off note | Low | Conditional inline note |
| `do_settings_fields` plugin extensions | Low | Slot system available |

### Acceptable interim
`iframe:options-discussion.php` for full parity. This is currently the **most likely** candidate for the iframe escape hatch given the surface size.

---

## 16. Out of scope

- **Per-post Discussion meta panel** — that's the post editor's "Discussion" panel, not this screen.
- **Per-comment moderation actions** — covered by `comments` app spec.
- **Akismet / antispam plugin settings** — third-party, not this panel.

---

## 17. Reference

- Original PHP form: `wp-admin/options-discussion.php`
- Save handler: `wp-admin/options.php` lines 103–129 for `allowed_options['discussion']`
- Settings registration: `wp-includes/option.php` lines 2944–2971
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- REST API reference: `https://developer.wordpress.org/rest-api/reference/settings/`
- Current shell impl: `src/apps/settings-discussion/index.js`
