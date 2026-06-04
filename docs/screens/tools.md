# Screen Spec: Tools

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/tools.php` (Available Tools landing) + `wp-admin/network.php` (Network Setup) + `wp-admin/ms-delete-site.php` (multisite subsite self-delete)
**Current workspace coverage:** None. Bundled `developer-workspace.json` exposes the original via `iframe:tools.php`.

This spec covers three logical sub-screens that all live under the Tools menu in core wp-admin:

1. **Tools / Available Tools** — landing page with a Categories/Tags converter pointer. Press This is dropped per legacy.
2. **Network Setup** — single-site → multisite enablement wizard.
3. **Delete Site** (multisite only) — per-subsite self-delete confirmation flow.

Three sections share Section 11 (Inter-app navigation) and Section 14 (Extension points). Sections 1, 3, 4, 6, 7, 9 split per sub-screen.

---

## 1. Identity

| Sub-screen | Slug | Display name | Original URL | Menu location |
|---|---|---|---|---|
| Tools / Available Tools | `tools` | "Available Tools" / "Tools" | `/wp-admin/tools.php` | Top-level "Tools" menu first item |
| Network Setup | `tools-network` | "Create a Network of WordPress Sites" / "Network Setup" | `/wp-admin/network.php` (single-site) or `/wp-admin/network/setup.php` (network admin) | Sub-item of "Tools" on single-site; sub-item of "Settings" on network admin |
| Delete Site | `tools-delete-site` | "Delete Site" | `/wp-admin/ms-delete-site.php` | Sub-item of "Tools" on multisite subsite |

| Field | Value |
|---|---|
| Parent app | "Tools" group (when workspace config groups them) |
| Sub-screens | None (each is leaf) |

The three sub-screens are discrete, low-traffic surfaces. Most workspaces should hide them entirely (developer-admin only) or use `iframe:` fallback indefinitely — this is administration-grade infrastructure that most users never touch.

---

## 2. Purpose

### Tools / Available Tools
Catch-all "miscellaneous tools" landing. Historically hosted Press This and the Categories/Tags Converter; today it is mostly a directory pointing to other screens. Plugins use the `tool_box` action to inject panels here.

Jobs to be done:
- **Convert categories ↔ tags** — link out to the converter on the Import screen.
- **(Plugin-injected)** — host plugin-supplied tool cards (`tool_box` action target).

### Network Setup
Convert a single-site WordPress install into a multisite network. Two-step process: configuration form → generated `wp-config.php` and `.htaccess` snippets to copy. Inherently file-system-coupled; requires `WP_ALLOW_MULTISITE` constant.

Jobs to be done:
- **Choose network style** — subdomain vs. subdirectory.
- **Provide network name + admin email** — populate initial network meta.
- **Receive code snippets** — copy specific lines into `wp-config.php` and `.htaccess`.

### Delete Site
Multisite-only. Lets a subsite admin request permanent deletion of their own site via an emailed confirmation link.

Jobs to be done:
- **Permanently delete my subsite** — initiate the email-confirmation flow.
- **Confirm deletion** — click the emailed link to actually trigger `wpmu_delete_blog()`.

---

## 3. Capabilities & access

| Sub-screen | Action | Capability | Source |
|---|---|---|---|
| Tools | View screen | `edit_posts` (default cap for Tools menu) | `menu.php` |
| Tools | See Cat/Tag converter card | `import` AND (`category.cap.manage_terms` OR `post_tag.cap.manage_terms`) | `tools.php` line 67–70 |
| Network Setup | Access | `setup_network` | `network.php` line 18 |
| Network Setup | Required system state | `WP_ALLOW_MULTISITE === true` (constant in `wp-config.php`) | `network.php` line 41 |
| Delete Site | Access screen | `delete_site` | `ms-delete-site.php` line 16 |
| Delete Site | Submit deletion request | `delete_site` + nonce `delete-blog` | (same) |
| Delete Site | Confirm deletion (via email link) | hash equality with `delete_blog_hash` option | `ms-delete-site.php` lines 20–32 |

**Permission-denied:** all three use `wp_die()` with screen-specific messages. Workspace renders 403 for each.

**Multisite specifics:**
- Network Setup on multisite redirects single-site URL → network admin URL. On a non-multisite install with `MULTISITE` constant defined, the screen blocks with "Network creation panel is not for WordPress MU networks."
- Delete Site is multisite-only — `wp_die( 'Multisite support is not enabled.' )` on single-site.

---

## 4. Data model

### Tools / Available Tools
- No first-party data. Static page rendering 0–1 informational cards plus the `tool_box` action's plugin-injected output.
- REST: **none**. Plugins emit HTML directly.

### Network Setup
**Step 1 input:**

| Field | Source | Notes |
|---|---|---|
| `subdomain_install` | radio (form input) | Bool; only available if `allow_subdomain_install()` returns true |
| `sitename` | text input | Network title (defaults to `get_option('blogname')`) |
| `email` | email input | Network admin email (defaults to `get_option('admin_email')`) |

**Step 1 → step 2 server-side action:** `populate_network()` writes:
- `wp_sitemeta` rows: `site_name`, `admin_email`, `subdomain_install`, etc.
- `wp_blogs` first row.
- `wp_users` super-admin link.

**Step 2 output:** dynamically generated text snippets for:
- `wp-config.php` — `MULTISITE`, `SUBDOMAIN_INSTALL`, `DOMAIN_CURRENT_SITE`, `PATH_CURRENT_SITE`, `SITE_ID_CURRENT_SITE`, `BLOG_ID_CURRENT_SITE`.
- `.htaccess` — rewrite rules for the chosen install style.

**REST: none.** All workflow runs through the form POST.

### Delete Site
- Reads: `get_site()` (current `WP_Site` object), `wp_get_current_user()`.
- Writes: `delete_blog_hash` site option (random 20-char string) on form submit.
- Reads on confirm: `delete_blog_hash` option compared against `?h=` query.
- On confirm: `wpmu_delete_blog( get_current_blog_id() )` permanently deletes the site (drops blog tables, removes uploads).
- Sends email via `wp_mail()` with `delete_site_email_content` filter.
- REST: **none.**

---

## 5. Layout regions (semantic)

### Tools / Available Tools
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Tools")                                          │
├─────────────────────────────────────────────────────────────┤
│ CARDS                                                        │
│  ├─ Categories and Tags Converter card (cap-gated)           │
│  └─ Plugin-injected cards via `tool_box` action               │
└─────────────────────────────────────────────────────────────┘
```

### Network Setup (step 1)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Create a Network of WordPress Sites")            │
├─────────────────────────────────────────────────────────────┤
│ PRECONDITIONS NOTICE                                         │
│  ├─ Pretty-permalinks check                                  │
│  └─ Plugin/theme deactivation reminder                       │
├─────────────────────────────────────────────────────────────┤
│ FORM                                                         │
│  ├─ Subdomain / Subdirectory radio (or fixed display)        │
│  ├─ Network Title input                                      │
│  ├─ Network Admin Email input                                │
│  └─ Submit ("Install")                                       │
└─────────────────────────────────────────────────────────────┘
```

### Network Setup (step 2)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title (same)                                             │
├─────────────────────────────────────────────────────────────┤
│ SUCCESS SUMMARY                                              │
│  └─ "Enabling the Network" intro                             │
├─────────────────────────────────────────────────────────────┤
│ CODE BLOCK 1: wp-config.php                                  │
│  ├─ Pre-formatted snippet (selectable text)                  │
│  └─ "Copy" button                                            │
├─────────────────────────────────────────────────────────────┤
│ CODE BLOCK 2: .htaccess                                      │
│  ├─ Pre-formatted snippet                                    │
│  └─ "Copy" button                                            │
├─────────────────────────────────────────────────────────────┤
│ NEXT-STEPS NOTICE                                            │
│  └─ "Once you add this code and refresh, log in again"       │
└─────────────────────────────────────────────────────────────┘
```

### Delete Site
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Delete Site")                                    │
├─────────────────────────────────────────────────────────────┤
│ DESTRUCTIVE WARNING                                          │
│  └─ "If you do not want to use {network} any more …"         │
├─────────────────────────────────────────────────────────────┤
│ FORM                                                         │
│  ├─ Confirmation checkbox ("I'm sure I want to permanently   │
│  │   delete my site, and I am aware …")                      │
│  └─ Submit ("Delete My Site Permanently")                    │
├─────────────────────────────────────────────────────────────┤
│ POST-SUBMIT STATE                                            │
│  └─ "Thank you. Please check your email …"                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

### Tools
| State | Trigger | Display |
|---|---|---|
| Default | First mount | Cards + `tool_box` output |
| No tools | User lacks `import` and `manage_terms`, no plugin tools | Just title and empty space |

### Network Setup
| State | Trigger | Display |
|---|---|---|
| Constant missing | `WP_ALLOW_MULTISITE` not defined | `wp_die` "You must define WP_ALLOW_MULTISITE …" |
| Already multisite | `is_multisite() && !MULTISITE` | `wp_die` "Network creation panel is not for MU networks" |
| Step 1 (form) | First view | Form |
| Step 1 (validation error) | Submit with invalid email/sitename | Form re-rendered with `WP_Error` notice |
| Step 1 (no wildcard DNS warning) | Subdomain install + DNS check fails | Step 2 with warning prepended |
| Step 2 (success) | After `populate_network()` | Code snippets |
| Pre-flight (PHP/permalinks) | Permalinks not pretty | Inline warning that pretty permalinks must be enabled first |

### Delete Site
| State | Trigger | Display |
|---|---|---|
| Default | First mount | Warning + form |
| Submitted (email sent) | POST `?action=deleteblog&confirmdelete=1` | "Thank you. Check email." replaces form |
| Confirmation link clicked (valid hash) | GET `?h={hash}` matching `delete_blog_hash` | `wp_die` success: "your site has been deleted" |
| Confirmation link clicked (stale hash) | GET `?h={...}` not matching | `wp_die` "Sorry, the link you clicked is stale" |

---

## 7. Actions

### Tools
- **Click "Import" link** → navigate to `import.md`.
- **Click plugin-injected card actions** — depend on plugin.

### Network Setup
| Action | Cap | Endpoint / form |
|---|---|---|
| Submit step 1 form | `setup_network` + `install-network-1` nonce | `POST network.php` with `subdomain_install`, `sitename`, `email` |
| Copy `wp-config.php` snippet | (none) | client-side clipboard |
| Copy `.htaccess` snippet | (none) | client-side clipboard |

### Delete Site
| Action | Cap | Endpoint / form |
|---|---|---|
| Toggle confirmation checkbox | (none) | client state — submit disabled until checked |
| Submit deletion request | `delete_site` + `delete-blog` nonce | `POST ms-delete-site.php` with `action=deleteblog` + `confirmdelete=1` |
| Click emailed link | `delete_site` + hash equality | `GET ms-delete-site.php?h={hash}` → calls `wpmu_delete_blog()` |

### Optimistic vs. blocking
All three sub-screens are blocking. Network Setup writes config; Delete Site writes the hash and then irreversibly drops blog tables. Optimistic UI is inappropriate.

---

## 8. Filters, sort, search, pagination

N/A — none of the three sub-screens render lists. The Tools landing card list is plugin-injected and unsorted.

---

## 9. Forms & inputs

### Tools
N/A — landing page has no forms.

### Network Setup form

| Field | Type | Required | Notes |
|---|---|---|---|
| Subdomain Install | radio | yes | Hidden when `allow_subdomain_install()` is false (e.g. localhost, `127.0.0.1`, single-segment domains). Defaults to subdirectory in that case. |
| Network Title | text | yes | Defaults to existing site title; user-editable. Max length: post-meta `string` (no enforced cap). |
| Network Admin Email | email | yes | Defaults to existing admin email. Validated server-side via `sanitize_email()`. |
| `_wpnonce` | hidden | yes | `install-network-1` |

Validation: server-side only. Empty values produce a `WP_Error` returned from `populate_network()` and re-rendered via `network_step1()`.

### Delete Site form

| Field | Type | Required | Notes |
|---|---|---|---|
| `confirmdelete` | checkbox | yes | Must be checked or PHP path doesn't trigger send-email branch |
| `action` | hidden | yes | Value `deleteblog` |
| `_wpnonce` | hidden | yes | `delete-blog` |

Validation: server-side only. Unchecked checkbox → form re-rendered without action.

---

## 10. Routing & URL state

### Tools
- `/wp-admin/tools.php` — landing.
- (Plugin-injected sub-pages can register `?page=foo` and route through this entry, but the registered targets are different sub-screens.)

### Network Setup
- `/wp-admin/network.php` — single-site entry.
- `/wp-admin/network/setup.php` — network admin entry (after multisite is enabled).
- POST to same URL — server detects step 1 vs. step 2 from POST body presence and `network_domain_check()` result.

### Delete Site
- `/wp-admin/ms-delete-site.php` — initial form.
- `/wp-admin/ms-delete-site.php?h={hash}` — confirmation link from email.

Recommended workspace URLs:
- `#/tools`
- `#/tools/network-setup`
- `#/tools/delete-site` (with optional `?h={hash}` for confirmation)

The confirmation hash arriving in the URL must work even when the user is not currently logged in (link is visited from email, possibly in a fresh browser). Workspace rebuild must support a "logged-out confirmation" code path or fall back to iframe for this specific URL pattern.

---

## 11. Inter-app navigation

### Outbound

| Sub-screen | Trigger | Destination | Carry |
|---|---|---|---|
| Tools | Cat/Tag converter card link | `import` app | (none) |
| Tools | Plugin-injected card links | varies | depends on plugin |
| Network Setup step 2 | "Login again" link | login (after admin closes browser to refresh) | — |
| Network Setup | Help docs link | external `developer.wordpress.org` | new tab |
| Delete Site | (no outbound on success — `wp_die` ends session) | — | — |

### Inbound

- Tools menu top-level click → Tools landing.
- Settings → Network Setup (network admin) sub-item.
- "My Sites" sub-page on multisite → Delete Site for that subsite.
- Email link with `?h={hash}` → Delete Site confirmation branch.

---

## 12. Notifications & feedback

### Tools
- No first-party notifications. Plugin-injected cards may render their own.

### Network Setup
- Step-1 errors: inline `WP_Error` notice (e.g. "no wildcard DNS").
- Step-2 success: implicit (snippets present means it worked); no toast.
- Filesystem-issue errors (rare): inline error.

### Delete Site
- After form submit: full-page replacement with "Thank you. Please check your email …".
- After hash visit (success): full-page `wp_die()` "your site has been deleted".
- After hash visit (stale): full-page `wp_die()` "the link you clicked is stale".
- Email body is templated — `delete_site_email_content` filter customizes.

---

## 13. Accessibility & keyboard

### Tools
- Card list is a series of `<div class="card">` with `<h2>` headings.
- Plugin cards inherit accessibility from the plugin.
- No keyboard shortcuts.

### Network Setup
- Form fields each have `<label>`.
- Radio group has `<fieldset>` + `<legend>`.
- Code snippets in step 2 are `<pre>` with `aria-label="wp-config.php contents"` (rebuild should add).
- Copy buttons announce "Copied!" via live region.
- Submit button at form bottom; `Enter` submits.

### Delete Site
- Destructive form must have explicit checkbox; submit must be disabled (or visibly noted) until checked.
- Confirmation copy is bold + `<strong>`-wrapped.
- Form has `name="deletedirect"` (legacy) — rebuild should not rely on form name.
- Focus trap not needed (full-page form).
- After submit: focus moves to "Thank you" heading, screen reader announces.

---

## 14. Extension points (core hooks)

| Hook | Sub-screen | Purpose | Recommendation |
|---|---|---|---|
| `tool_box` | Tools | Render plugin tool cards | **Replace** with workspace-level slot `core:tools.cards` |
| `delete_site_email_content` | Delete Site | Filter email body | **Preserve** at PHP layer (pure server-side) |
| `wpmu_drop_tables` | Delete Site | Filter list of dropped tables | Preserve at PHP layer |
| `delete_blog` (action) | Delete Site | Run before deletion | Preserve |
| `populate_network` filters | Network Setup | Inject extra options | Preserve |
| `allow_subdomain_install` | Network Setup | Override subdomain radio visibility | Preserve |

Plugin compatibility note: WooCommerce, ManageWP, and other tooling-heavy plugins use `tool_box` to add cards. The workspace rebuild should expose a `tools.cards` slot to keep parity. Cards are simple — title, description, action label, action URL.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** none.
- **What works:** `iframe:tools.php` / `iframe:network.php` / `iframe:ms-delete-site.php` work in `developer-admin` workspace with chrome hidden.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:tools` AppSource | Low | Low-traffic; iframe acceptable indefinitely |
| Register `core:tools-network` AppSource | Low | Once-per-install action; iframe acceptable |
| Register `core:tools-delete-site` AppSource | Low | Multisite only; iframe acceptable, but the email-link confirmation requires workspace to support `?h=` deep-links to the iframed page — verify the iframe URL passes through query params |
| Slot API for `tool_box` cards | Medium | Improves plugin compat |
| REST endpoint for network-setup config snippets | Low | Niche; one-time use |
| REST endpoint for delete-site request | Low | Same |
| Confirmation-link logged-out flow | Medium | Email link → `?h={hash}` must work when workspace is bypassed (login wall) — confirm fallback to original PHP page or expose a public confirmation URL |

### Acceptable interim
All three sub-screens via `iframe:` — recommended for v1. Document in workspace config that these are infrastructure surfaces and iframe is the canonical implementation.

---

## 16. Out of scope

- **Press This bookmarklet** — removed from core.
- **WordPress Importer / Exporter shortcuts** — covered by `import.md` and `export.md`.
- **Site Health link from Tools menu** — separate `site-health.md`.
- **Personal data tools (export / erase)** — separate `personal-data.md`.
- **Network admin "Sites" / "Users" / "Themes" / "Plugins" / "Settings"** — separate network-admin specs (deferred).
- **Delete Site logged-out confirmation** — handled via PHP fallback; not native workspace.
- **Reverting multisite back to single-site** — not provided by core; manual operation.

---

## 17. Reference

### Tools
- Original PHP: `wp-admin/tools.php`
- Help docs: `https://wordpress.org/documentation/article/tools-screen/`

### Network Setup
- Original PHP: `wp-admin/network.php`
- Helpers: `wp-admin/includes/network.php`
- `populate_network()`: `wp-admin/includes/schema.php`
- Constants: `WP_ALLOW_MULTISITE`, `MULTISITE`, `SUBDOMAIN_INSTALL`, `DOMAIN_CURRENT_SITE`, `PATH_CURRENT_SITE`
- Help docs: `https://developer.wordpress.org/advanced-administration/multisite/create-network/`

### Delete Site
- Original PHP: `wp-admin/ms-delete-site.php`
- Site option used: `delete_blog_hash`
- Email filter: `delete_site_email_content`
- Deletion function: `wpmu_delete_blog()` in `wp-includes/ms-blogs.php`
- Help docs: `https://developer.wordpress.org/advanced-administration/multisite/`
