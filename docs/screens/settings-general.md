# Screen Spec: Settings — General

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-general.php` (form), `wp-admin/options.php` (legacy save handler)
**Current shell coverage:** `core:settings-general` → `src/apps/settings-general/index.js` (M4 — REST-native, partial; admin-email confirmation flow is the main gap)

This spec describes the **semantic surface** of the General Settings screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-general` |
| Display name | "General" / "General Settings" |
| Original URL | `/wp-admin/options-general.php` |
| Menu location | Settings → General (top item, default landing for the Settings menu) |
| Submenu items | N/A — this is itself a Settings submenu entry |
| Parent app | `core:settings` (composable host since M4) |
| Sub-screens | None. Site Icon picker is an inline media modal, not a separate screen. |

The General panel is the canonical landing screen for site identity (title, tagline, icon), URLs, administrator contact, membership policy, language, and date/time formatting. Every WordPress install has it; multisite hides URL and admin-email fields.

---

## 2. Purpose

Set the foundational metadata of the site — what it is called, where it lives, who admins it, and how dates/times are presented to readers. Most fields here are read by themes, the REST API root, and email notifications.

Jobs to be done:
- **Brand the site** — set title, tagline, and site icon (favicon + app icon).
- **Move the site** — change WordPress and Site URLs after a domain change (single-site only).
- **Hand off the site** — transfer the admin email, with confirmation guarding accidental lockout.
- **Open registration** — allow self-signup and pick the role new users get.
- **Localize** — set language, timezone, and date/time formats globally.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-general.php` line 15 |
| Save settings | `manage_options` | `WP_REST_Settings_Controller::get_item_permissions_check` |
| Edit `siteurl`/`home` | `manage_options` AND `! defined('WP_SITEURL')` / `! defined('WP_HOME')` | options.php disables when constants set |
| Confirm new admin email | URL hash sent to new address | options.php lines 58–73 |

**Permission-denied state:** `current_user_can( 'manage_options' )` fails → core uses `wp_die()` with translated string. Shell should render a 403 inline.

**Multisite:** WP/Site URL fields are hidden entirely. Admin email is managed separately at the Network level (single-site `admin_email` is still the contact for that site, but URL changes happen via Network admin). Membership / Default Role checkboxes are also hidden — those are network-level decisions.

---

## 4. Data model

### Primary entity
- **Type:** root settings (singleton)
- **REST endpoint:** `GET /wp/v2/settings`
- **Update endpoint:** `POST /wp/v2/settings` (or PUT/PATCH — controller uses `EDITABLE`)

### REST-exposed fields (this panel)

Verified against `register_initial_settings()` in `wp-includes/option.php` (lines 2741–2855) and `WP_REST_Settings_Controller::get_registered_options()`.

| Form field | Option name | REST key | Type | Default | Notes |
|---|---|---|---|---|---|
| Site Title | `blogname` | `title` | string | "" | renamed in REST |
| Tagline | `blogdescription` | `description` | string | "Just another WordPress site" | renamed in REST |
| WordPress Address (URL) | `siteurl` | `url` | string (uri) | install URL | single-site only; **read-only in REST when `WP_SITEURL` defined** |
| Site Address (URL) | `home` | `home` | string | install URL | single-site only; exposed via `register_setting( show_in_rest )` shim (PR #202) |
| Administration Email Address | `admin_email` | `email` | string (email) | install email | single-site only; **REST writes directly** without confirmation flow |
| Site Language | `WPLANG` | `language` | string | `en_US` | locale code |
| Timezone | `timezone_string` | `timezone` | string | "" | IANA city name OR empty when UTC offset used |
| Date Format | `date_format` | `date_format` | string | `F j, Y` | PHP `date()` format string |
| Time Format | `time_format` | `time_format` | string | `g:i a` | PHP `date()` format string |
| Week Starts On | `start_of_week` | `start_of_week` | integer | 1 (Monday) | 0–6, locale-defaulted |

### Non-REST options (legacy form save only — gaps)

| Option | Form field | Type | Notes |
|---|---|---|---|
| `site_icon` | Site Icon | int (attachment ID) | Picked via media modal. **Not in REST settings**. Workaround: `POST /wp/v2/media` to upload, then `update_option('site_icon', $id)`. Some hosts expose `site_logo` block-theme equivalent. |
| `gmt_offset` | (Timezone, fallback) | float | Used when `timezone_string` is empty. Written via `rest_pre_update_setting` filter (PR #202): a `UTC±X` selection stores `gmt_offset` and clears `timezone_string`; an IANA city selection stores `timezone_string` and leaves `gmt_offset` alone. |
| `new_admin_email` | (transient holder) | string | Written to during email-change flow; cleared on confirmation. |
| `adminhash` | (transient holder) | array | `{ hash: string, newemail: string }` — hash compared to `?adminhash=` URL param to verify ownership. |

> **Fixed in #202 (issue #106):** `home`, `users_can_register`, and `default_role` were previously not `show_in_rest` and were silently discarded on save. The plugin now registers `show_in_rest` shims for all three so they pass through `/wp/v2/settings` correctly. `gmt_offset` is handled separately via the `rest_pre_update_setting` filter described above.

### Aggregate data
- Available timezones: `wp_timezone_choice()` (PHP) → list of cities + UTC offsets. No REST endpoint; either render statically (DateTimeZone::listIdentifiers) or expose via shell custom endpoint.
- Available languages: `wp_get_available_translations()` + `get_available_languages()`. No REST endpoint.
- Editable roles: derivable from `GET /wp/v2/users/?context=edit` schema or shell custom endpoint.
- Date/time format previews: pure client-side formatting using current locale.

### Admin email confirmation flow
Original flow (PHP):
1. User submits new value in `new_admin_email` form field.
2. Core saves `{hash, newemail}` to `adminhash` option, sends email to new address with `?adminhash={hash}` link.
3. New owner clicks link → `options.php?adminhash=...` → core verifies, copies `newemail` to `admin_email`, deletes `adminhash`/`new_admin_email`.
4. Cancel link in admin: `options.php?dismiss=new_admin_email`.

REST `email` field bypasses this entirely — `POST /wp/v2/settings { email: 'new@x' }` sets `admin_email` instantly with no confirmation.

**Recommendation:** the shell should mirror the legacy flow by writing to `new_admin_email` (non-REST option) and triggering the confirmation email. Requires custom endpoint or AJAX to `wp-admin/options.php?action=update&option_page=general`.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("General")                                        │
├─────────────────────────────────────────────────────────────┤
│ FORM (single column or two-column form-table)                │
│  ├─ Site Title              [text input]                     │
│  ├─ Tagline                 [text input + helper]            │
│  ├─ Site Icon               [thumbnail + Choose/Remove]      │
│  ├─ WordPress Address (URL) [url input — disabled if const.] │
│  ├─ Site Address (URL)      [url input + helper]             │
│  ├─ Administration Email    [email input + pending notice]   │
│  ├─ Membership              [checkbox: Anyone can register]  │
│  ├─ New User Default Role   [select]                         │
│  ├─ Site Language           [select with translation icons]  │
│  ├─ Timezone                [grouped select: cities + UTC]   │
│  │   ├─ live "Universal time is …" / "Local time is …"       │
│  │   └─ DST notice + next transition                         │
│  ├─ Date Format             [radio list + Custom + preview]  │
│  ├─ Time Format             [radio list + Custom + preview]  │
│  └─ Week Starts On          [select 0–6, locale labels]      │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes button                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch of `/wp/v2/settings` | Skeleton form with disabled inputs |
| Idle | Loaded, no edits | Inputs reflect server state; Save button disabled |
| Editing | User changes any field | Save button enabled; "unsaved changes" hint |
| Saving | Save in flight | Save button busy; inputs locked |
| Saved | Save success | Snackbar via `core/notices`; Save disabled until next edit |
| Error | REST 4xx/5xx | Inline notice above form; preserve user edits |
| Permission denied | 403 from REST | Render 403 view; do not show form |
| Pending admin email change | `new_admin_email !== admin_email` AND `new_admin_email` set | Inline notice "There is a pending change of the admin email to {x}." with Cancel link |
| URL constants defined | `WP_SITEURL` / `WP_HOME` defined in wp-config | Field disabled with explanation |

---

## 7. Actions

### Primary action
- **Save Changes** — `POST /wp/v2/settings` with the diff of changed REST fields. `site_icon` is non-REST and requires a fallback (see §15 Gaps). `home`, `users_can_register`, `default_role`, and `gmt_offset` are handled via `show_in_rest` shims + the `rest_pre_update_setting` filter (PR #202).

### Secondary actions
- **Choose Site Icon** — opens media modal scoped to images ≥512×512.
- **Remove Site Icon** — clears `site_icon` option.
- **Cancel pending admin email change** — POST to `options.php?dismiss=new_admin_email` (nonce required) → deletes `adminhash` + `new_admin_email`.

### No bulk / per-row actions — N/A for a settings panel.

### Optimistic vs. blocking
- **Save Changes** — blocking. Show progress; do not advance UI until server confirms.
- **Pending email cancel** — optimistic. Rollback on failure.

---

## 8. Filters, sort, search, pagination

N/A — settings panel has no list of items to filter, sort, search, or paginate.

---

## 9. Forms & inputs

This is the dominant section for a settings spec.

### Site Title
- Type: text
- REST: `title` (writable)
- Required: no (empty allowed; HTML stripped)
- Max length: none enforced; UI may cap at ~60 for display
- Validation: trimmed; HTML tags stripped via `sanitize_option('blogname')`

### Tagline
- Type: text
- REST: `description` (writable)
- Required: no
- Helper: "In a few words, explain what this site is about. Example: 'Just another WordPress site.'"

### Site Icon
- Type: media picker (attachment ID)
- REST: **not exposed**
- Required: no
- Validation: image; ≥512×512px recommended; square preferred (auto-cropped if not)
- UI: thumbnail preview + "Choose / Change Site Icon" + "Remove Site Icon" buttons

### WordPress Address (URL)
- Type: url
- REST: `url` (writable when `WP_SITEURL` undefined; **always read-only in MS**)
- Required: yes
- Validation: valid URL with scheme; no trailing slash recommended
- Disabled when `WP_SITEURL` constant defined → display constant value as readonly with helper text explaining override.

### Site Address (URL)
- Type: url
- REST: `home` (writable via `register_setting( show_in_rest )` shim, PR #202)
- Required: yes
- Validation: valid URL with scheme
- Helper: "Enter the same address here unless you want your site home page to be different from your WordPress installation directory."
- Disabled when `WP_HOME` constant defined.

### Administration Email Address
- Type: email
- REST: `email` (writable, but bypasses confirmation flow)
- Original form field name: `new_admin_email` (the staging slot)
- Validation: valid email syntax; mailbox not verified at submit
- Pending state: when `new_admin_email !== admin_email`, render "There is a pending change of the admin email to {x}. Cancel" notice

### Membership (single-site only)
- Type: checkbox
- Option: `users_can_register` (1/0)
- REST: `users_can_register` (writable via `register_setting( show_in_rest )` shim, PR #202)
- Label: "Anyone can register"

### New User Default Role (single-site only)
- Type: select
- Option: `default_role`
- REST: `default_role` (writable via `register_setting( show_in_rest )` shim, PR #202)
- Options: from `get_editable_roles()`, with `administrator` and `editor` excluded by default (filterable via `default_role_dropdown_excluded_roles`)
- Default: `subscriber`

### Site Language
- Type: select with country/locale flags or translation icons
- REST: `language` (writable)
- Options: union of installed languages + downloadable translations (filtered by `install_languages` cap and `wp_can_install_language_pack()`)
- Default: `en_US`
- Side effect on save: if language is downloadable but not installed, core triggers download. Shell must replicate this or surface the limitation.

### Timezone
- Type: grouped select (continent → city, then UTC offsets)
- REST: `timezone` (writable, IANA city string)
- Fallback option: `gmt_offset` (float, written when string is empty)
- UI hints below select:
  - "Universal time is `{HH:MM:SS}`."
  - "Local time is `{HH:MM:SS}`."
  - "This timezone is currently in daylight saving time." / "…in standard time."
  - "Daylight saving time begins on: `{date}`." OR "Standard time begins on: `{date}`." OR "This timezone does not observe daylight saving time."

### Date Format
- Type: radio list with custom freeform fallback
- REST: `date_format` (writable)
- Default radio options (filterable via `date_formats`):
  - `F j, Y` → "April 30, 2026"
  - `Y-m-d` → "2026-04-30"
  - `m/d/Y` → "04/30/2026"
  - `d/m/Y` → "30/04/2026"
  - `d.m.Y` → "30.04.2026" (added 6.8.0)
  - Custom → freeform input
- Live preview below input
- Validation: PHP `date()` format string; client may render preview, server is authoritative

### Time Format
- Same shape as Date Format.
- Default options (filterable via `time_formats`):
  - `g:i a` → "8:14 am"
  - `g:i A` → "8:14 AM"
  - `H:i` → "08:14"
  - Custom → freeform input

### Week Starts On
- Type: select 0–6
- REST: `start_of_week` (writable)
- Labels from `WP_Locale::get_weekday(i)` — locale-aware

### Save semantics
- Single Save button at the bottom.
- Diff-based save: only changed fields submitted.
- Two requests if non-REST options are touched (REST batch + AJAX/options.php for legacy fields).
- Validation: server-side authoritative; client-side limited to type/format checks (URL shape, email shape).
- No autosave; explicit Save only.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/options-general.php`.

Optional query strings:
- `?updated=true` / `?updated=false` — render success/error notice (legacy form post redirect)
- `?adminhash={hash}` — confirm pending admin email change (handled by `options.php`, redirects to options-general)
- `?dismiss=new_admin_email` — cancel pending email change (handled by options.php)

Shell hash route: `#/settings/general` (or whatever the shell config assigns).

URL state is minimal — settings screens have no filter/sort/page state. Deep-link to a specific field via fragment (`#site-title`) is a nice-to-have.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click language docs link | external | URL |
| Click "create a Pages" hint (multisite hidden) | `pages` app | new |
| Click pending email confirm/cancel link | options.php redirect → returns here | hash + nonce |

### Inbound
- From `core:settings` host → renders this panel.
- From toolbar / command palette → direct navigation.
- From "About" / install wizard completion screens → deep-link.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar via `core/notices`: "Settings saved." (success) |
| Save failure (network) | Banner above form: "Failed to save. Try again." |
| Save failure (validation) | Inline error per field + summary banner |
| Pending email change | Persistent inline notice above field with Cancel link |
| Email change confirmed | Snackbar: "Administration email updated." (after redirect from confirm link) |
| Email change canceled | Snackbar: "Administration email change canceled." |
| Site icon uploaded | Inline preview update; no snackbar (immediate) |
| Language download in progress | Inline progress; "Downloading translation files…" |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `Cmd/Ctrl+S` | Save (when changes pending) |
| `Esc` | Cancel pending discard (with confirmation if dirty) |
| `Space` | Toggle Membership checkbox / radio selection |
| `↑` / `↓` in radio group | Move between Date/Time format options |

### ARIA & focus
- `<form>` wrapper with `aria-label="General settings"`.
- Each field grouped in `<fieldset><legend>` for screen readers (Date Format, Time Format, Membership).
- Pending email notice uses `role="status"` so it is announced.
- Save button: `aria-disabled="true"` when no edits, `aria-busy="true"` while saving.
- Site Icon: media modal traps focus; close returns focus to "Choose Site Icon" button.
- Date/Time format radios: `aria-describedby` pointing to live preview span.
- Validation errors: `aria-invalid="true"` on field + `aria-describedby` to error message.

### Screen reader
- Format previews announced via `aria-live="polite"` region: "Preview: April 30, 2026".
- After save: "Settings saved" announced.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `whitelist_options` / `allowed_options` | Add option keys to the `general` save group | Replace with shell-level "additional fields" on the panel registration. |
| `default_role_dropdown_excluded_roles` | Filter roles in default-role select | Honor when reading roles from REST schema; allow shell-level filter override. |
| `date_formats` | Add date-format choices | Replace with panel-level prop; load via REST is unnecessary since these are static. |
| `time_formats` | Add time-format choices | Same. |
| `pre_option_{option}` / `option_{option}` | Hijack per-option read | Drop — REST handles. |
| `update_option_{option}` | React to updates | Plugin server-side concerns; not relevant to UI. |
| `do_settings_fields( 'general', 'default' )` | Plugin-added fields | **Replace** with `core:settings.panels` slot for `general` — plugins register custom field descriptors. |

Plugin-added fields via `add_settings_field()` with section `general` are the most commonly broken extension by an SPA replacement. Document the slot shim or accept the gap.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:settings-general` → `src/apps/settings-general/index.js`
- **What works:** Title, Tagline, Timezone (city/`timezone_string` only), Date Format, Time Format, Week Starts On, Language read-only display. Saves via `useEntityRecord('root','site')`. Uses WPDS (`@wordpress/ui` `InputControl`, `Stack`) + `@wordpress/components` (`SelectControl` for optgroup support).
- **Notices:** wired to `core/notices` since M4.

#### Known deviations (current shell)

| Control | Option | Deviation |
|---|---|---|
| Administration Email | `email` (`admin_email`) | The `email` field *is* REST-writable, but writing it changes `admin_email` **instantly**, bypassing core's confirm-by-link flow (`new_admin_email` pending option + verification email). A typo locks the admin out of email-gated recovery with no undo. Tracked in `docs/parity/roadmap.md` group B-P2 (issue #160). |

> **Fixed in #202 (issue #106):** `home`, `users_can_register`, `default_role`, and manual UTC-offset (`gmt_offset`) were previously silently no-op on save because those options lacked `show_in_rest`. The plugin now registers `show_in_rest` shims for all four via `register_setting()`, and a `rest_pre_update_setting` filter routes `UTC±X` timezone selections to `gmt_offset` while IANA city selections update `timezone_string` — matching classic wp-admin behaviour.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Site Icon picker | High | Requires media modal + `update_option('site_icon')` (non-REST). |
| Admin Email confirmation flow | High | REST writes directly without confirmation. Need to write to `new_admin_email` instead, trigger confirmation email (server side). |
| Pending email change notice + Cancel | High | Bound to above. |
| Language install-on-select | Medium | Detect "downloadable" entries; trigger install on save; show progress. |
| Timezone DST hints | Medium | Live "Universal time is…" + DST transition info. |
| Custom Date/Time format with freeform input + preview | Medium | Currently radios only; freeform "Custom" is missing. |
| Multisite-aware field hiding | Medium | Hide URL fields, Membership, Default Role on `is_multisite()`. |
| WP_SITEURL / WP_HOME constant detection | Medium | Disable URL fields with explanation. |
| Plugin-extended fields via `add_settings_field` | Low | `core:settings.panels` slot exists; needs a sub-slot for inner fields, or accept the gap. |
| Settings save error per-field surfacing | Medium | Currently all-or-nothing. |

### Acceptable interim
For shells that need full parity, `iframe:options-general.php` is the escape hatch. Not currently used because M4 native is preferred.

---

## 16. Out of scope

- **Multisite Network → Settings** — separate screen at the network level, not part of this panel. Covered by `network/settings.php`.
- **`blog_charset`** — only shown when `is_utf8_charset()` returns false; effectively dead code in modern installs. Not rebuilding.
- **`gmt_offset` as standalone control** — only used as fallback when `timezone_string` is empty. Hidden behind the unified Timezone select.
- **Site Icon detail editing (alt text, replacement)** — handled by media modal, not this panel.
- **Old "Date and Time" preview spinner** — JS-based async preview was a workaround for sync rendering; client-side date-fns covers it now.

---

## 17. Reference

- Original PHP form: `wp-admin/options-general.php`
- Save handler: `wp-admin/options.php` (lines 90–200 for `allowed_options['general']`, 58–80 for adminhash flow)
- Settings registration: `wp-includes/option.php::register_initial_settings()` lines 2742–2855
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- REST API reference: `https://developer.wordpress.org/rest-api/reference/settings/`
- Current shell impl: `src/apps/settings-general/index.js`
- Settings host: `src/apps/settings/index.js`
- Doc reference: `docs/admin-json-api-validation.md` for API coverage analysis
