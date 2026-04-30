# Screen Spec: Settings — Writing

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-writing.php` (form), `wp-admin/options.php` (legacy save handler)
**Current shell coverage:** `core:settings-writing` → `src/apps/settings-panels/SettingsWritingApp.js` (M4 — REST-native, partial; Post via Email and Update Services unimplemented per current scope)

This spec describes the **semantic surface** of the Writing Settings screen so an agent can rebuild it in any UI library or framework.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-writing` |
| Display name | "Writing" / "Writing Settings" |
| Original URL | `/wp-admin/options-writing.php` |
| Menu location | Settings → Writing |
| Submenu items | N/A |
| Parent app | `core:settings` |
| Sub-screens | None |

---

## 2. Purpose

Configure defaults applied to newly authored posts and configure side channels for posting (legacy email-to-post and ping/update services). This panel has the highest density of deprecated or rarely used fields in modern WordPress.

Jobs to be done:
- **Set new-post defaults** — default category and post format for the editor.
- **Toggle real-time collaboration** — enable shared editing on supported posts.
- **Configure post-via-email** — POP3 mailbox to harvest content from (legacy, opt-out via filter).
- **Notify update services** — ping aggregators on publish (legacy, ignored when site is non-public).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-writing.php` line 12 |
| Save settings | `manage_options` | REST controller |
| Edit Update Services list | `manage_options` AND `blog_public === '1'` | options-writing.php line 232 |

**Permission-denied state:** `wp_die()` with translated message.

**Multisite:** No special handling — same fields visible. Some Post-via-email fields gated by capability for that subsite.

---

## 4. Data model

### Primary entity
- REST endpoint: `GET/POST /wp/v2/settings`

### REST-exposed fields

Verified against `register_initial_settings()` in `wp-includes/option.php` (lines 2857–2898).

| Form field | Option name | REST key | Type | Default | Notes |
|---|---|---|---|---|---|
| Default Post Category | `default_category` | `default_category` | integer | 1 (Uncategorized) | term ID |
| Default Post Format | `default_post_format` | `default_post_format` | string | `0` (standard) | enum from `get_post_format_strings()` |
| Real-time Collaboration | `wp_collaboration_enabled` | `wp_collaboration_enabled` | boolean | false | new in 6.x; `wp_is_collaboration_allowed()` gates display |
| Convert emoticons (legacy) | `use_smilies` | `use_smilies` | boolean | true | only registered when `initial_db_version < 32453` (very old installs) |

### Non-REST options (legacy form save only — gaps)

| Option | Form field | Type | Notes |
|---|---|---|---|
| `use_balanceTags` | "Auto-correct invalidly nested XHTML" | bool | Legacy formatting fix; only shown for ancient installs. |
| `default_link_category` | Default Link Category | int | Only shown when `link_manager_enabled` (Link Manager plugin active). Term ID from `link_category` taxonomy. |
| `mailserver_url` | Mail Server | string | Post via email |
| `mailserver_port` | Mail Server Port | int | Post via email |
| `mailserver_login` | Login Name | string | Post via email |
| `mailserver_pass` | Password | string | Post via email; rendered with show/hide toggle |
| `default_email_category` | Default Mail Category | int | Post via email |
| `ping_sites` | Update Services | string (newline-separated URLs) | Only when `blog_public === '1'` |

### Filters that gate sections
- `enable_post_by_email_configuration` (default true) — set to `false` to hide entire Post via Email block. Common in modern hosting plugins.
- `enable_update_services_configuration` (default true) — set to `false` to hide Update Services block.
- `wp_is_collaboration_allowed()` — gates the collaboration toggle.

### Aggregate data
- Categories: `GET /wp/v2/categories?per_page=100&hide_empty=false&context=edit` — populates Default Post Category dropdown (hierarchical).
- Post formats: derived from `get_post_format_strings()` minus `standard`. Values: `aside`, `gallery`, `link`, `image`, `quote`, `status`, `video`, `audio`, `chat`. **Theme support gated** — only show formats the active theme supports (`get_theme_support('post-formats')`). Not exposed via REST cleanly; a custom shell endpoint or theme support inspection is needed.
- Link categories: `GET /wp/v2/link_categories` — only when Link Manager exists; safely skip otherwise.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Writing")                                        │
├─────────────────────────────────────────────────────────────┤
│ FORM section "Default writing"                               │
│  ├─ Formatting (legacy, hidden on modern installs)           │
│  ├─ Default Post Category    [select w/ hierarchy]           │
│  ├─ Default Post Format      [select]                        │
│  ├─ Collaboration            [checkbox or warning notice]    │
│  └─ Default Link Category    [select — conditional]          │
├─────────────────────────────────────────────────────────────┤
│ FORM section "Post via email"  (filter-gated)                │
│  ├─ Intro paragraph + 3 random password suggestions          │
│  ├─ Mail Server      [text + Port small input]               │
│  ├─ Login Name       [text]                                  │
│  ├─ Password         [text + show/hide toggle]               │
│  └─ Default Mail Category [select]                           │
├─────────────────────────────────────────────────────────────┤
│ FORM section "Update Services"  (filter-gated)               │
│  ├─ Helper text                                              │
│  └─ Update services list  [textarea, 3 rows]                 │
│        OR notice "WordPress is not notifying any …"          │
│        when blog_public != 1                                 │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes button                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton form |
| Idle | Loaded, no edits | Save disabled |
| Editing | Field changed | Save enabled |
| Saving | Save in flight | Save busy; inputs disabled |
| Saved | Save success | Snackbar via `core/notices` |
| Error | REST 4xx/5xx | Inline notice |
| Permission denied | 403 | 403 view |
| Collaboration disabled | `wp_is_collaboration_allowed()` false | Inline warning notice replaces checkbox: "Real-time collaboration has been disabled." |
| Update Services suppressed | `blog_public !== '1'` | Read-only notice + link to Reading Settings instead of textarea |
| Post via email disabled | `enable_post_by_email_configuration` filter returns false | Whole section hidden |

---

## 7. Actions

### Primary action
- **Save Changes** — `POST /wp/v2/settings` for REST keys; AJAX/PHP fallback for non-REST keys.

### Secondary actions
- **Reveal password** — toggle Post via Email password input visibility.
- **Generate random password** — three suggestions provided in helper text; click to copy (UI affordance only — not a save action).

### No bulk / per-row actions — N/A.

### Optimistic vs. blocking
- **Save Changes** — blocking.

---

## 8. Filters, sort, search, pagination

N/A — settings panel.

---

## 9. Forms & inputs

### Default Post Category
- Type: select with hierarchy indentation
- REST: `default_category` (writable)
- Required: yes (defaults to Uncategorized term)
- Options: all `category` terms (`hide_empty: 0`, `orderby: 'name'`, `hierarchical: true`)
- Validation: term ID must exist; server falls back to default if not.

### Default Post Format
- Type: select
- REST: `default_post_format` (writable; `0` represents Standard)
- Required: yes
- Options: `Standard` + theme-supported formats from `get_post_format_strings()`
- Empty/non-supported: render `Standard` only when theme supports no formats.
- Validation: enum-checked server-side.

### Real-time Collaboration
- Type: checkbox
- REST: `wp_collaboration_enabled` (writable)
- Helper: "Enable early access to real-time collaboration. Real-time collaboration may affect your website's performance."
- Visibility gate: `wp_is_collaboration_allowed()` — when false, replace input with a warning notice.

### Default Link Category (conditional)
- Type: select
- Option: `default_link_category`
- REST: **not exposed**
- Visibility gate: `get_option('link_manager_enabled')` — only when Link Manager plugin or compatibility shim is active.

### Mail Server (Post via email)
- Type: text + small text for port
- Options: `mailserver_url` (string), `mailserver_port` (int)
- REST: **not exposed**
- Default: `mail.example.com` / `110`
- Validation: URL/host shape; port 0–65535.

### Login Name (Post via email)
- Type: text (LTR forced)
- Option: `mailserver_login` (string)
- REST: **not exposed**
- Default: `login@example.com`

### Password (Post via email)
- Type: password with show/hide toggle
- Option: `mailserver_pass` (string)
- REST: **not exposed**
- Default: `password`
- UI: standard password reveal pattern with `data-pw` attribute carrying current value when toggled visible.

### Default Mail Category (Post via email)
- Same as Default Post Category but writes to `default_email_category`.
- REST: **not exposed**.

### Update Services (`ping_sites`)
- Type: textarea, 3 rows, large-text class
- Option: `ping_sites` (string, newlines separate URLs)
- REST: **not exposed**
- Visibility: only when `blog_public === '1'`.
- Validation: each non-empty line must be a valid URL. Invalid lines stripped server-side.

### Save semantics
- Single Save button at bottom.
- REST + non-REST mixed save: REST batch + per-option fallback for non-exposed.
- No autosave.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/options-writing.php`. No query state. `?settings-updated=true` flag for legacy form post redirect.

Shell hash route: `#/settings/writing`.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click "site visibility settings" link in suppressed Update Services notice | `settings-reading` panel | none |
| Click documentation links | external | URL |
| Default Post Category → category management | `categories` taxonomy app | none |

### Inbound
- From `core:settings` host.
- Command palette.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar: "Settings saved." |
| Save partial failure | Banner: "Some settings could not be saved." with per-field details |
| Collaboration disabled by config | Inline warning notice (persistent until config changes) |
| Update Services suppressed | Inline info notice with link to Reading panel |
| Email password copied | Brief snackbar: "Password copied" (when click-to-copy is implemented) |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `Cmd/Ctrl+S` | Save when changes pending |
| `Space` | Toggle checkboxes |

### ARIA & focus
- Each section uses `<h2>` heading + `<fieldset>` grouping.
- Mail server password input has `aria-label="Mail server password"` plus toggle button with `aria-label="Show password"` / "Hide password".
- Update Services textarea has `aria-describedby` pointing to helper paragraph above.
- Suppressed-section notices use `role="status"`.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `enable_post_by_email_configuration` | Hide/show Post via Email | Honor — render section conditionally |
| `enable_update_services_configuration` | Hide/show Update Services | Honor |
| `do_settings_fields( 'writing', 'default' )` | Plugin-added fields under "Default" | `core:settings.panels` sub-slot or accept gap |
| `do_settings_fields( 'writing', 'remote_publishing' )` | Deprecated section | Drop |
| `do_settings_fields( 'writing', 'post_via_email' )` | Plugin-added Post via Email fields | Drop or accept gap |
| `wp_is_collaboration_allowed()` | Gate collaboration toggle | Honor |

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:settings-writing` → `src/apps/settings-panels/SettingsWritingApp.js`
- **What works:** Default Post Category and Default Post Format via REST. Saves through `core/notices`.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Real-time Collaboration toggle | Medium | REST-exposed; just needs UI wire-up. |
| Post via email section | Low | Legacy; recommend hiding via `enable_post_by_email_configuration` filter in shell deployments. Non-REST. |
| Update Services section | Low | Legacy; non-REST; gated by `blog_public`. |
| Default Link Category | Low | Only relevant if Link Manager plugin used. |
| `use_smilies`, `use_balanceTags` | Low | Only on ancient installs (`initial_db_version < 32453`). Skip. |
| Theme-supported post formats filter | Medium | Currently shows all formats; should restrict to active theme's supported formats. |
| Plugin-added Settings API fields | Low | `do_settings_fields` extensibility broken in shell. |

### Acceptable interim
`iframe:options-writing.php` covers parity for any shell needing full surface.

---

## 16. Out of scope

- **Press This bookmarklet** — removed in WP 4.9+; not rebuilt.
- **`use_balanceTags` and `use_smilies`** — only registered for very old installs; not surfaced.
- **Post via Email POP3 worker** — server-side cron; unaffected by UI rebuild beyond credential collection.

---

## 17. Reference

- Original PHP form: `wp-admin/options-writing.php`
- Save handler: `wp-admin/options.php` lines 151–157 for `allowed_options['writing']`
- Settings registration: `wp-includes/option.php` lines 2857–2898
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- REST API reference: `https://developer.wordpress.org/rest-api/reference/settings/`
- Current shell impl: `src/apps/settings-panels/SettingsWritingApp.js`
- Settings host: `src/apps/SettingsApp.js`
