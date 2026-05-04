# Screen Spec: Network Settings (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/settings.php` (Network Settings)
- `wp-admin/network/setup.php` (delegates to `wp-admin/network.php` — installer / config snippet generator)

**Current shell coverage:** None.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_network_options` (Settings) or `setup_network` (Setup).

This spec describes the **semantic surface** of the network-wide settings screen and the network setup screen (the latter generates `wp-config.php` + `.htaccess` snippets after `wp core multisite-install`). It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-settings` |
| Display name | "Settings" (network context) |
| Original URLs | `/wp-admin/network/settings.php`, `/wp-admin/network/setup.php` |
| Menu location | `menu[25]` in `wp-admin/network/menu.php` (cap: `manage_network_options`) |
| Submenu items | Network Settings (this screen), Network Setup (only when `MULTISITE` and `WP_ALLOW_MULTISITE` defined) |
| Parent app | None — top-level network app |
| Sub-screens | Settings (default tab), Setup (snippet generator) |

The `network-setup.php` (rendered via `wp-admin/network.php`) is shown only on the brief window between "started multisite install" and "finished editing wp-config.php / .htaccess". After install completion most networks never visit it again.

---

## 2. Purpose

Configure network-wide behavior: identity (title, admin email), registration policy (open / closed / signup-with-blog / signup-without-blog), site-creation defaults (welcome emails, first post/page/comment), upload limits, default site language, and which admin menus appear for site administrators (the `menu_items[plugins]` toggle is the canonical example).

Setup screen: render the htaccess + wp-config.php snippets a network operator must paste after running `wp core multisite-install` or the legacy install path.

Jobs to be done:
- **Set / change Network Title and Network Admin Email** (with confirm-by-email flow for the address).
- **Open / close registration** (none / user / blog / both).
- **Restrict registrations** by name banlist or email-domain allow/banlist.
- **Customize the welcome emails** that go out on site/user create.
- **Set per-site upload limits** (space, file types, max file size).
- **Choose the default network language**.
- **Toggle which menus site admins see** (only `Plugins` ships in core).
- **Render config snippets** (Setup) needed to enable multisite at the file-system level.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View Settings | `manage_network_options` | `wp-admin/network/settings.php` line 16 |
| Save Settings | `manage_network_options` | same |
| Confirm new admin-email link | implicit (hash matches in URL) | same lines 25–35 |
| Cancel pending email change | nonce `dismiss_new_network_admin_email` | same lines 36–42 |
| View Setup screen | `setup_network` | `wp-admin/network.php` |
| Install language pack on save | `install_languages` AND `wp_can_install_language_pack()` | same line 112 |

**Permission-denied state:** core `wp_die()` 403. Shell renders no-access state.

---

## 4. Data model

### Storage
All values are **site options** (`wp_sitemeta`), read via `get_site_option()` and written via `update_site_option()`. They are network-scoped, not blog-scoped.

### Settings option keys

#### Operational Settings
| Option | Type | Notes |
|---|---|---|
| `site_name` | string | Network title |
| `admin_email` | email | Network admin email (read-only here; `new_admin_email` triggers confirm flow) |
| `new_admin_email` | email | Pending email change (transient until confirmed) |
| `network_admin_hash` | array | `{hash, newemail}` for confirm flow; consumed by `?network_admin_hash=...` URL |

#### Registration Settings
| Option | Type | Values |
|---|---|---|
| `registration` | enum | `none` / `user` / `blog` / `all` |
| `registrationnotification` | enum | `yes` / `no` (only the checked state writes `'yes'`; unchecked writes `'no'`) |
| `add_new_users` | bool (1/0) | Allow site admins to add new users (vs. only invite existing) |
| `illegal_names` | string (space-separated) | Banned site names |
| `limited_email_domains` | string (newline-separated) | Allowlist for email domains on registration |
| `banned_email_domains` | string (newline-separated) | Banlist for email domains |

#### New Site Settings (welcome / first-content)
| Option | Type | Notes |
|---|---|---|
| `welcome_email` | text (long) | Email body for new site owners |
| `welcome_user_email` | text (long) | Email body for new users |
| `first_post` | text (long) | Body of the first post seeded on new sites |
| `first_page` | text (long) | Body of the first page |
| `first_comment` | text (long) | Body of the first comment |
| `first_comment_author` | string | Author display name |
| `first_comment_email` | email | Author email |
| `first_comment_url` | URL | Author URL |

#### Upload Settings
| Option | Type | Notes |
|---|---|---|
| `upload_space_check_disabled` | bool (0/1, **inverted in UI**: checkbox checked = 0) | When 0, per-site upload-space limit applies |
| `blog_upload_space` | int (MB) | Per-site upload quota |
| `upload_filetypes` | string (space-separated) | Allowed extensions, default `jpg jpeg png gif` |
| `fileupload_maxk` | int (KB) | Max single-file upload size, default 300 |

#### Language Settings
| Option | Type | Notes |
|---|---|---|
| `WPLANG` | string | Default site language (e.g. `en_US` = empty string; `de_DE` for German) |

If `install_languages` cap and writable filesystem, the dropdown can install missing language packs on save.

#### Menu Settings
| Option | Type | Notes |
|---|---|---|
| `menu_items` | assoc array `{key: '1'}` | Which admin menus site admins can access. Default: `{'plugins': '1'}` enables/disables the per-site Plugins menu. Extensible via `mu_menu_items` filter. |

### Setup screen data
- `is_subdomain_install()` — affects which snippet is rendered.
- `get_network()->domain`, `get_network()->path` — printed in snippets.
- Two textareas: `wp-config.php` snippet, `.htaccess` snippet (or `web.config` on IIS).
- "Copy to clipboard" affordance per textarea.

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| Read network options | None | **GAP** — `WP_REST_Settings_Controller` (`/wp/v2/settings`) reads only **registered settings**, and these are blog-options, not site-options (sitemeta). None of `site_name`, `admin_email` (network), `welcome_email`, etc. are exposed. |
| Write network options | None | **GAP** — same. |
| Confirm pending admin email | None | **GAP** — `?network_admin_hash=...` is admin-side only. |
| Cancel pending admin email | None | **GAP** — nonce-protected admin redirect. |
| `mu_menu_items` data | None | **GAP**. |
| Install language pack | None | **GAP** — `wp_download_language_pack()` is PHP-only. |

The settings controller does not expose site options. To rebuild this screen the shell must ship custom endpoints (e.g. `/wp-admin-shell/v1/network/options`), enumerate the option keys above, and apply server-side validation matching the form handler in `network/settings.php`.

For the Setup screen, the snippet rendering is purely a function of network state (subdomain vs. subdirectory + domain + path); no mutation. Read-only endpoint suffices.

---

## 5. Layout regions (semantic)

### Network Settings
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Network Settings"                                   │
│ (Pending-email banner if applicable)                         │
├─────────────────────────────────────────────────────────────┤
│ FORM (single page, multiple section headers):                │
│                                                              │
│  Operational Settings                                        │
│   - Network Title                                            │
│   - Network Admin Email (with pending-change inline notice)  │
│                                                              │
│  Registration Settings                                       │
│   - Allow new registrations (radio: none / user / blog / all)│
│   - Registration notification (checkbox)                     │
│   - Add Users (checkbox)                                     │
│   - Banned Names                                             │
│   - Limited Email Registrations                              │
│   - Banned Email Domains                                     │
│                                                              │
│  New Site Settings                                           │
│   - Welcome Email                                            │
│   - Welcome User Email                                       │
│   - First Post / Page / Comment                              │
│   - First Comment Author / Email / URL                       │
│                                                              │
│  Upload Settings                                             │
│   - Site upload space (checkbox + MB)                        │
│   - Upload file types (space-separated)                      │
│   - Max upload file size (KB)                                │
│                                                              │
│  Language Settings                                           │
│   - Default Language                                         │
│                                                              │
│  Menu Settings                                               │
│   - Enable administration menus (checkbox per `mu_menu_items`)│
│                                                              │
│  [ Save Changes ] (single submit at bottom)                  │
└─────────────────────────────────────────────────────────────┘
```

### Network Setup
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Create a Network of WordPress Sites"                │
│  (only if not yet "fully set up"; otherwise shows snippets)  │
├─────────────────────────────────────────────────────────────┤
│ Step 1: Choose subdomain vs. subdirectory (if not chosen)    │
│ Step 2: Network Title + Network Admin Email                  │
│ Step 3: Snippet preview                                      │
│   - wp-config.php block (textarea, copy button)              │
│   - .htaccess block (textarea, copy button)                  │
│   - Reminder to log in again after pasting                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First render | Skeleton form |
| Pending email change | `new_admin_email` set and != `admin_email` | Inline notice on Network Admin Email row: "There is a pending change of the network admin email to {email}." + "Cancel" link |
| Email change confirmed | `?network_admin_hash` matches stored hash | Success notice; option promoted to `admin_email` |
| Email change cancelled | `?dismiss=new_network_admin_email&_wpnonce=...` | Success notice; pending hash deleted |
| Save success | Form POST 302 with `?updated=true` | "Settings saved." notice |
| Subdomain install + registration disabled | UI shows description: "set NOBLOGREDIRECT in wp-config.php to a URL you will redirect..." | Inline description |
| Setup screen, install incomplete | `is_multisite()` may still be true but `wp-config.php` not yet edited | Snippet panels visible |
| Setup screen, install complete | All snippets present | Setup screen still renders snippets read-only |

---

## 7. Actions

### Settings form
- **Save Changes** — single submit, POSTs all fields together.
- **Cancel** pending admin email — link with nonce.
- (Implicit) Confirm pending admin email — link clicked from email; lands on Settings with success.

### Setup screen
- **Copy to clipboard** per snippet block (no server mutation).
- **Re-Save Permalinks reminder** — link to the per-site permalinks screen for sites that need rules regenerated.

### Optimistic vs. blocking
- **Save Changes** — blocking. The server may reject (e.g. invalid email, banned domain malformed); show inline errors near the field.
- **Email confirm / cancel** — blocking; redirects with notice.

---

## 8. Filters, sort, search, pagination

N/A — this is a settings form, not a list.

---

## 9. Forms & inputs

### Operational
| Field | Type | Required |
|---|---|---|
| `site_name` | text | yes |
| `new_admin_email` | email | no (writes only when changed) |

### Registration
| Field | Type | Required |
|---|---|---|
| `registration` | radio (`none` / `user` / `blog` / `all`) | yes |
| `registrationnotification` | checkbox (writes `'yes'` / `'no'`) | no |
| `add_new_users` | checkbox | no |
| `illegal_names` | text (space-separated) | no |
| `limited_email_domains` | textarea (newline-separated) | no |
| `banned_email_domains` | textarea (newline-separated) | no |

### New Site
| Field | Type | Required |
|---|---|---|
| `welcome_email` | textarea | no |
| `welcome_user_email` | textarea | no |
| `first_post` | textarea | no |
| `first_page` | textarea | no |
| `first_comment` | textarea | no |
| `first_comment_author` | text | no |
| `first_comment_email` | text | no |
| `first_comment_url` | text (URL) | no |

### Upload
| Field | Type | Required |
|---|---|---|
| `upload_space_check_disabled` | checkbox (inverted) | no |
| `blog_upload_space` | number (MB, min 0) | yes (when limit enabled) |
| `upload_filetypes` | text (space-separated) | yes |
| `fileupload_maxk` | number (KB, min 0) | yes |

### Language
| Field | Type | Required |
|---|---|---|
| `WPLANG` | select | no |

### Menu
| Field | Type | Required |
|---|---|---|
| `menu_items[plugins]` | checkbox | no |

(plus any additional keys returned by the `mu_menu_items` filter)

### Setup
No mutating fields (snippet generator only reads network state).

### Validation
Server-side only. Client may pre-warn on email format / number range. Save handler:
- Loops over a fixed allowlist of option keys (see `network/settings.php` lines 86–109)
- Fills "checked / unchecked" defaults so unchecked checkboxes write `0` / `'no'`
- Calls `update_site_option($key, $value)` for each
- Fires `update_wpmu_options` action

---

## 10. Routing & URL state

Original URL params:
- `?updated=true` — success notice
- `?network_admin_hash={hash}` — confirm pending email
- `?dismiss=new_network_admin_email&_wpnonce={nonce}` — cancel pending

Recommended shell hash:
```
#/network-settings
#/network-settings/setup
```

The confirm-email link comes in via standard URL (server-rendered), not hash; the shell needs to handle the query param at boot.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination |
|---|---|
| Setup link (when shown) | `/network-settings/setup` |
| "Documentation on Network Settings" link | external |
| Help sidebar links | external |

### Inbound
| Origin | Behavior |
|---|---|
| `network-dashboard` (after install) | Redirect to Setup if applicable |
| Email confirm-link from inbox | URL with `?network_admin_hash={hash}` |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Settings saved | "Settings saved." (success notice) |
| Pending admin email change | Inline warning notice on the email field |
| Email change confirmed | Success notice on next load |
| Email change cancelled | Success notice |
| Invalid input | Inline error per field (server-side enforced; shell can preview) |

No undo for settings — server overwrites on each save.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` | Move through fields |
| `Cmd/Ctrl+S` | Save (shell-level shortcut) |

### ARIA
- Section headers (`Operational Settings`, etc.) are `<h2>`; group their fields with `<section aria-labelledby>` so screen readers announce the section name when entering the group.
- Radio groups use `<fieldset>` + `<legend>` (already correct in core).
- Pending-email inline notice: `role="status"` so the announcement comes through.
- Description text below inputs: link via `aria-describedby`.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `mu_menu_items` (filter) | Add menu-toggle checkboxes | Replace with shell `network-settings.menu-items` slot |
| `wpmu_options` (action) | Append to settings form before submit | Slot |
| `update_wpmu_options` (action) | After save | Event bus |

---

## 15. Mapping & implementation status

### Current shell coverage
- None.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `network-settings` source | High | Top-level network app |
| Custom REST endpoint exposing site-options whitelist | High | None of these options are in `/wp/v2/settings` |
| Pending-email confirm/cancel flow | Medium | Hash-based URL handling |
| Language pack download on save | Low | Falls back to "saved without download" if filesystem read-only |
| Setup snippet generator | Low | Read-only; iframe acceptable |
| `mu_menu_items` extensibility | Medium | Slot for plugin-added toggles |

### Acceptable interim
`iframe:network/settings.php` and `iframe:network/setup.php` for v1.

---

## 16. Out of scope

- **Per-site language settings** — that lives on Edit Site → Settings or per-site `options-general.php`. The network setting is the **default** seeded on new sites.
- **Plugin-added settings** — render via `wpmu_options` action slot rather than coding into the spec.
- **Automatic language pack install** when filesystem is read-only — fail silently per core.
- **WordPress Setup screen prompt** during initial install — out of scope; the shell only runs after install.

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/settings.php`
  - `wp-admin/network/setup.php` (delegates to `wp-admin/network.php`)
- PHP API: `get_site_option`, `update_site_option`, `delete_site_option`, `wp_download_language_pack`
- Site options whitelist: `wp-admin/network/settings.php` lines 86–109
- Confirm-email flow: `wp-admin/includes/ms.php::send_confirmation_on_profile_email` (single-site equivalent), inline in `network/settings.php` for network admin
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php` (does NOT expose these options)
- Setup snippet generator: `wp-admin/includes/network.php::network_step1`, `network_step2`
