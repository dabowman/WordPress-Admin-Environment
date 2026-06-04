# Screen Spec: Network Sites (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/sites.php` (Sites list)
- `wp-admin/network/site-new.php` (Add Site)
- `wp-admin/network/site-info.php` (Edit Site → Info tab)
- `wp-admin/network/site-users.php` (Edit Site → Users tab)
- `wp-admin/network/site-themes.php` (Edit Site → Themes tab)
- `wp-admin/network/site-settings.php` (Edit Site → Settings tab)
- `wp-admin/includes/class-wp-ms-sites-list-table.php`

**Current workspace coverage:** None.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_sites`.

This spec describes the **semantic surface** of the Sites list, the Add Site form, and the four-tab Edit Site experience. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-sites` |
| Display name | "Sites" |
| Original URLs | `/wp-admin/network/sites.php`, `/wp-admin/network/site-new.php`, `/wp-admin/network/site-info.php?id={n}`, `/wp-admin/network/site-users.php?id={n}`, `/wp-admin/network/site-themes.php?id={n}`, `/wp-admin/network/site-settings.php?id={n}` |
| Menu location | `menu[5]` (Sites top-level) in `wp-admin/network/menu.php` |
| Submenu items | All Sites (this list), Add Site (sub-screen) |
| Parent app | None — top-level network app |
| Sub-screens | List (default), Add Site, Edit Site (tabs: Info / Users / Themes / Settings) |

A single workspace app covers all six PHP files. The four Edit-Site tabs share `network_edit_site_nav()` chrome and a common `?id={blog_id}` parameter.

---

## 2. Purpose

Manage the population of sites on the network: list, search, filter by lifecycle status, create, edit metadata, manage per-site users / themes / wp_options, and trash/spam/archive sites.

Jobs to be done:
- **List and find sites** — search by domain/path/IP/ID, filter by status (Public / Archived / Mature / Spam / Flagged for Deletion).
- **Triage problem sites** — mark as spam, archive, flag for deletion.
- **Create a new site** — bound to an admin email (existing user becomes admin; new user otherwise).
- **Edit a site's metadata** — URL, registered date, attribute flags.
- **Manage a site's users** — add existing user, create new user-on-site, change role, remove from site.
- **Manage a site's theme allow-list** — toggle which non-network-enabled themes the site can pick from.
- **Edit raw site options** — direct `wp_options` editor, dangerous escape hatch.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View list | `manage_sites` | `wp-admin/network/sites.php` line 13 |
| Add site | `create_sites` | `wp-admin/network/site-new.php` line 16 |
| Edit site (any tab) | `manage_sites` AND `can_edit_network($site->site_id)` | `site-info.php` lines 13/31, similar in others |
| Delete site (per-row) | `delete_sites` AND `delete_site` (meta-cap, per-site) | `sites.php` line 161 |
| Bulk delete | `delete_site` per site | `sites.php` line 182 |
| Mark spam / not spam | `manage_sites` | implicit via `update_blog_status` |
| Archive / unarchive | `manage_sites` | implicit |
| Flag for deletion / unflag | `manage_sites` | implicit |
| Mark mature / not mature | `manage_sites` | implicit |
| Add existing user to site (Users tab) | `promote_users` (filter on site) | `site-users.php` line 334 |
| Create new user on site (Users tab) | `create_users` | `site-users.php` line 371 |
| Remove user from site | `remove_users` | `site-users.php` line 119 |
| Promote / change role on site | `promote_users` AND `promote_user($user_id)` | `site-users.php` lines 143/169 |
| Enable / disable theme on site | `manage_sites` | `site-themes.php` line 13 |

**Main-site protections:** the network's main site cannot be deleted, archived, marked spam, flagged for deletion, or have its domain/path changed (`is_main_site($id)` checks throughout). The list table omits the row checkbox for the main site.

**Permission-denied state:** core does `wp_die()` 403 throughout. Workspace should render a "no access" empty state.

---

## 4. Data model

### Primary entity
- **Type:** site / blog (`WP_Site`)
- **REST endpoint:** **NONE.** There is no `WP_REST_Sites_Controller` in WordPress 6.9 core. This is the largest single gap in network-admin REST coverage. All operations on this screen go through admin-post.php form posts and `wpmu_*` PHP functions.

### Fields used by the list

| Field | Source (PHP) | Type | Notes |
|---|---|---|---|
| `blog_id` | `WP_Site::blog_id` | int | row key |
| `domain` | `WP_Site::domain` | string | sortable; primary visible cell |
| `path` | `WP_Site::path` | string | sortable in subdirectory installs |
| `registered` | `WP_Site::registered` | datetime | sortable |
| `last_updated` | `WP_Site::last_updated` | datetime | sortable |
| `public` | `WP_Site::public` (0/1) | bool | filter facet |
| `archived` | `WP_Site::archived` (0/1) | bool | filter facet, "site state" badge |
| `mature` | `WP_Site::mature` (0/1) | bool | filter facet, badge |
| `spam` | `WP_Site::spam` (0/1) | bool | filter facet, badge |
| `deleted` | `WP_Site::deleted` (0/1) | bool | filter facet, "Flagged for Deletion" badge |
| `users` (count) | derived: `count_users($blog_id)` | int | per-row column |

### Status filter facets
Source: `wp_count_sites()` returns `['all', 'public', 'archived', 'mature', 'spam', 'deleted', 'empty']`. Tabs render only when count > 0.

### Query parameters (list)

- `s` — search; matches against IP (`wp_registration_log`), numeric ID, or `path` (in subdirectory installs) / `domain`.
- `status` — one of `public | archived | mature | spam | deleted` (or empty/all)
- `orderby` — `blogname` (resolves to `domain` or `path`), `lastupdated`, `registered`, `blog_id`
- `order` — `ASC` / `DESC`
- `paged` — pagination
- Wildcard `*` — supported in search

### Edit Site → Info tab fields
| Field | Source | Type | Editable on main site? |
|---|---|---|---|
| `url` (domain + path + scheme) | `parse_url($details->siteurl)` | URL | No (locked) |
| `registered` | `WP_Site::registered` | datetime string | yes |
| `last_updated` | `WP_Site::last_updated` | datetime string | yes |
| Attributes: `public` | bool | checkbox | yes |
| Attributes: `archived` | bool | checkbox | not shown on main site |
| Attributes: `spam` | bool | checkbox | not shown on main site |
| Attributes: `deleted` (Flagged for Deletion) | bool | checkbox | not shown on main site |
| Attributes: `mature` | bool | checkbox | yes |

Save handler: form post to `site-info.php?action=update-site`, calls `update_blog_details($id, $blog_data)` then optionally syncs `home` / `siteurl` options.

### Edit Site → Users tab data
- Lists users belonging to the site via `WP_Users_List_Table` (single-site users table, but switched into the target site context via `switch_to_blog($id)`).
- Search via `?s=`.
- Per-row: per-site role, last login (if available).
- Forms: "Add Existing User" (looks up by username), "Add New User" (creates user + adds to site).

### Edit Site → Themes tab data
- `WP_MS_Themes_List_Table` filtered to `site_id = $id`.
- Lists only themes that are **not** network-enabled — the message reads "Network enabled themes are not shown on this screen."
- Each theme is enabled-or-disabled on this specific site via the `allowedthemes` site option.

### Edit Site → Settings tab data
- Direct query: `SELECT * FROM {prefix}options WHERE option_name NOT LIKE '\_%' AND option_name NOT LIKE '%user_roles'`.
- Renders every public option as a labelled `<input>` or `<textarea>` (textarea when value contains a newline).
- Serialized values are read-only and shown as `SERIALIZED DATA` placeholder.
- `siteurl` and `home` are read-only on the main site.
- Save: bulk `update_option()` per posted key inside `switch_to_blog()`.

### Add Site form fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `blog[domain]` | text | yes | "Site Address" — subdomain segment if `is_subdomain_install()`, subdirectory segment otherwise. Lowercase a–z, 0–9, hyphen only. Reserved-word check in subdirectory mode. |
| `blog[title]` | text | yes | Site title |
| `WPLANG` | select | no | Site language; offers downloadable language packs if filesystem-writable |
| `blog[email]` | email | yes | Admin email. If exists, user becomes admin. If new, a user is auto-created with `wpmu_create_user()` (random 12-char password emailed). |

Save handler: form post to `site-new.php?action=add-site`, calls `wpmu_create_blog()` + `wpmu_welcome_notification()`.

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| List sites | None | **GAP** — no `/wp/v2/sites` controller. Workaround: custom workspace endpoint that wraps `WP_Site_Query`. |
| Get single site | None | **GAP** — same. |
| Create site | None | **GAP** — `wpmu_create_blog()` is PHP-only; no REST. |
| Update site details | None | **GAP** — `update_blog_details()` is PHP-only. |
| Delete site | None | **GAP** — `wpmu_delete_blog()` is PHP-only. |
| Status flags (archive/spam/mature/deleted) | None | **GAP** — `update_blog_status()` is PHP-only. |
| Add user to site | None | **GAP** — `add_user_to_blog()` is PHP-only. `POST /wp/v2/users` only creates network-level. |
| Change role on site | `PUT /wp/v2/users/{id}` with `roles[]` works **only against the request's current blog** — i.e. requires switching the request blog ID, which the REST stack does not support cross-site. **GAP for the network-admin Edit Site → Users tab.** |
| Remove user from site | None | **GAP** — `remove_user_from_blog()` is PHP-only. |
| Per-site theme allowlist | None | **GAP** — toggles `allowedthemes` site option, no REST. |
| Edit a site's `wp_options` | `GET /wp/v2/settings` exposes only registered settings; raw option editor has no REST | **GAP** — by design, raw option editing is unsafe. |

This screen is the single largest REST gap in core. A v1 workspace implementation must either ship custom endpoints (`/wp-admin-workspaces/v1/network/sites/*`) or render the original PHP screens in iframe.

---

## 5. Layout regions (semantic)

### Sites list
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Sites")                                          │
│  └─ Primary action: "Add Site" (cap: create_sites)           │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Status tabs: All | Public | Archived | Mature | Spam |   │
│  │                Flagged for Deletion (counts in label)     │
│  ├─ Search input (search Sites)                              │
│  └─ View switcher: list / excerpt                            │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW (visible when ≥1 row selected)               │
│  └─ Bulk action select + apply                               │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                   │
│  └─ Table: [checkbox] | URL | Last Updated | Registered |    │
│            Users                                             │
│            Per-row hover actions: Edit · Dashboard · Visit · │
│            Deactivate · Archive · Spam · Delete              │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination + total                                       │
└─────────────────────────────────────────────────────────────┘
```

### Add Site
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Add Site"                                           │
│ FORM (vertical):                                             │
│  - Site Address (URL) [+ domain prefix/suffix preview]       │
│  - Site Title                                                │
│  - Site Language (if any languages present)                  │
│  - Admin Email (with helper: "A new user will be created...")│
│ SUBMIT: "Add Site"                                           │
└─────────────────────────────────────────────────────────────┘
```

### Edit Site (all tabs)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Edit Site: {blogname}"                              │
│ Subtitle actions: Visit | Dashboard                          │
│                                                              │
│ TABS: [Info] [Users] [Themes] [Settings]   ← network_edit_site_nav │
├─────────────────────────────────────────────────────────────┤
│ TAB BODY (content varies)                                    │
│                                                              │
│  Info: form-table with URL, dates, Attributes fieldset       │
│  Users: list-table + Add Existing + Add New forms            │
│  Themes: list-table of non-network-enabled themes            │
│  Settings: form-table built from raw wp_options rows         │
│                                                              │
│ SUBMIT (Info / Settings tabs)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading list | First fetch | Skeleton rows |
| Empty list | `total === 0` | "No sites found." |
| Empty filtered | filter yields 0 | Same message; clear-filter affordance |
| Confirmation interstitial | Single destructive action (delete / archive / deactivate / spam / mature) | Dedicated confirm screen with explanatory notice; `sites.php?action=confirm&action2={op}` |
| Bulk-delete confirmation | Bulk delete on multiple sites | Dedicated confirm page listing all targets |
| Edit Site: invalid ID | `id` missing/invalid | "Invalid site ID." 404-ish |
| Edit Site: nonexistent | `get_site($id)` returns null | "The requested site does not exist." |
| Edit Site: cross-network | `can_edit_network()` false | 403 |
| Add Site: domain conflict | `username_exists($domain)` | "The domain or path entered conflicts with an existing username." |
| Add Site: reserved word (subdir) | matches `get_subdirectory_reserved_names()` | Lists reserved names |

---

## 7. Actions

### List header
- **Add Site** — navigate to Add Site sub-screen. Cap: `create_sites`.

### Per-row actions (on hover)
| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `manage_sites` | Navigation | Opens Edit Site Info tab |
| Dashboard | `manage_sites` | External | Opens `get_admin_url($id)` |
| Visit | none (public) | External | Opens `get_home_url($id, '/')` |
| Deactivate (Flag for Deletion) | `manage_sites` | Mutation | Confirms → `update_blog_status($id, 'deleted', '1')` |
| Activate (Unflag) | `manage_sites` | Mutation | Reverse |
| Archive | `manage_sites` | Mutation | `update_blog_status($id, 'archived', '1')` |
| Unarchive | `manage_sites` | Mutation | Reverse |
| Spam | `manage_sites` | Mutation | `update_blog_status($id, 'spam', '1')` |
| Not Spam | `manage_sites` | Mutation | Reverse |
| Mature / Not Mature | `manage_sites` | Mutation | Hidden in default UI; only the legacy code path checks the `confirm` nonce |
| Delete | `delete_sites` AND `delete_site` (meta) | Destructive | Confirm interstitial → `wpmu_delete_blog($id, true)` |

The main site renders only a subset (Edit / Dashboard / Visit) and no row checkbox.

### Bulk actions
| Bulk action | Behavior |
|---|---|
| Mark as spam | Iterate selected → `update_blog_status($id, 'spam', '1')` |
| Not spam | Reverse |
| Delete | Confirm interstitial → `wpmu_delete_blog($id, true)` for each |

Note: core does **not** offer Activate / Deactivate / Archive / Unarchive / Mark Mature / Not Mature as bulk actions in the default list. Only Spam / Not Spam / Delete are bulkable.

### Add Site action
- **Add Site** submit — see § 9. Mutation: `wpmu_create_blog()`.

### Edit Site → Info actions
- **Save Changes** submit — `update_blog_details()` + maybe sync `home` / `siteurl`.

### Edit Site → Users actions
- **Add Existing User** submit (Username + Role)
- **Add New User** submit (Username + Email + Role)
- Per-row "Remove" (cap: `remove_users`)
- Bulk "Remove" + "Change role to ..." (cap: `promote_users`)

### Edit Site → Themes actions
- Per-row "Enable" / "Disable" — toggles `allowedthemes` site option.
- Bulk "Network Enable" / "Network Disable" (within site context).

### Edit Site → Settings actions
- **Save Changes** — bulk `update_option()` for every posted key.
- Per-field warnings: serialized non-string values are read-only; `siteurl`/`home` are read-only on main site.

### Optimistic vs. blocking
- **Status flags** (spam/archive/etc.) — could be optimistic; core uses confirm interstitials, which is blocking.
- **Delete** — blocking, double-confirm.
- **Add Site / Edit Site forms** — blocking with full-form validation.

---

## 8. Filters, sort, search, pagination

### Filters (list)
| Filter | Field | Source |
|---|---|---|
| Status | `status` query var | hard-coded enum |
| Restrict-manage-sites hook | extension point — `restrict_manage_sites` action | plugin-driven |

### Sort
Sortable: `blogname` (domain or path), `lastupdated`, `registered` (which uses `blog_id` internally).

### Search
Single `s` input. Heuristics in `WP_MS_Sites_List_Table::prepare_items()`:
- Matches IPv4 → looks up via `wp_registration_log.IP`
- Numeric only (no wildcard) → matches `ID`
- Otherwise → `search` arg (matches `domain` in subdomain installs, `path` in subdirectory installs)
- Wildcard `*` extends to LIKE matching

### Pagination
- Default page size: per-user screen option (`sites_network_per_page`, default 20)
- Large networks (`wp_is_large_network()` true): no found_rows, no total count

---

## 9. Forms & inputs

### Add Site (full)
See § 4 → Add Site form fields.

Validation rules:
- Domain regex: `^([a-zA-Z0-9-])+$` (then lowercased)
- Subdir mode: must not be in `get_subdirectory_reserved_names()`
- Email required; `is_email()` check
- Title required

Side effects on submit:
- If email matches existing user → user becomes site admin.
- If email is new → `wpmu_create_user()` generates random 12-char password, sends welcome email with password.
- `wpmu_new_site_admin_notification()` + `wpmu_welcome_notification()` fire.

### Edit Site → Info
See § 4 → Info tab fields. Save handler: `site-info.php?action=update-site`, nonce `edit-site`.

### Edit Site → Users → Add Existing User
| Field | Type | Required |
|---|---|---|
| `newuser` | text (autocomplete via `wp-suggest-user`) | yes |
| `new_role` | select (site's roles, default = site's `default_role`) | yes |

### Edit Site → Users → Add New User
| Field | Type | Required |
|---|---|---|
| `user[username]` | text | yes |
| `user[email]` | email | yes |
| `new_role` | select | yes |

A password reset link is emailed to the new user; no password input on the form.

### Edit Site → Settings
- Auto-rendered from `wp_options` rows. Each row becomes a labelled input. No client-side validation; server `update_option()` is authoritative.

---

## 10. Routing & URL state

Original wp-admin URL params:
- List: `?s={query}&status={status}&orderby={col}&order={dir}&paged={n}`
- Add: `/site-new.php`
- Edit Info: `/site-info.php?id={n}`
- Edit Users: `/site-users.php?id={n}&s={query}&paged={n}`
- Edit Themes: `/site-themes.php?id={n}&s={query}`
- Edit Settings: `/site-settings.php?id={n}`
- Action confirm: `/sites.php?action=confirm&action2={op}&id={n}`

Recommended workspace hash:
```
#/network-sites?status=spam&s=acme&page=2
#/network-sites/add
#/network-sites/{id}/info
#/network-sites/{id}/users?s=alice
#/network-sites/{id}/themes
#/network-sites/{id}/settings
```

Browser back / refresh / share must restore the tab and filters.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click site URL in row | Edit Site → Info | site id |
| "Dashboard" row action | external admin URL of that site | new tab |
| "Visit" row action | external public URL of that site | new tab |
| "Add Site" header CTA | Add Site sub-screen | none |
| Edit Site → "Visit" / "Dashboard" subtitle | external | new tab |
| Edit Site Users tab → "Edit user profile" link in user row | `network-users` (Edit User) | user id |

### Inbound
| Origin | Behavior |
|---|---|
| `network-dashboard` "Create a New Site" | Land on Add Site form |
| `network-dashboard` Search Sites | Land on list with `?s={query}` |
| `network-users` Edit User → site list rows ("Edit" link beside a site name) | Land on Edit Site → Info |
| Add Site success | Snackbar offers "Visit Dashboard" / "Edit Site" links |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Add site success | Notice: "Site added. Visit Dashboard | Edit Site" with deep links |
| Site info updated | Notice: "Site info updated." |
| Site marked spam (single) | Notice: "Site marked as spam." |
| Bulk spam | Notice: "Sites marked as spam." |
| Site deleted (single, after confirm) | Notice: "Site permanently deleted." |
| Bulk delete (after confirm) | Notice: "Sites permanently deleted." |
| Site archived | "Site archived." |
| Site unarchived | "Site unarchived." |
| Flag for deletion | "Site flagged for deletion." |
| Flag removed | "Site deletion flag removed." |
| Edit Site → Users: User added | "User added." |
| Edit Site → Users: Role change | "Changed roles." |
| Edit Site → Users: User removed | "User removed from this site." |
| Edit Site → Users: Username not found | "Enter the username of an existing user." |
| Edit Site → Users: Already member | "User is already a member of this site." |
| Edit Site → Themes: Bulk enable | "{N} themes enabled." |
| Site options updated | "Site options updated." |

Destructive actions: no undo. Core uses confirmation interstitials instead.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search (workspace-level) |
| `↑` / `↓` | Move row focus in list |
| `Space` | Toggle selection on focused row |
| `Enter` | Open Edit Site for focused row |
| `Tab` | Cycle through tab strip in Edit Site |

### ARIA
- Tabs in Edit Site: `role="tablist"` with each tab as `role="tab"` and `aria-selected`. Body: `role="tabpanel"` referenced by `aria-labelledby`.
- Status filter row: `role="tablist"` with counts in accessible name (e.g. "Spam, 3 sites").
- Row checkboxes: `aria-label="Select {site URL}"`.
- Confirmation interstitials: focus-trap + return on cancel.
- Attributes fieldset on Info tab: `<fieldset>` + `<legend>` (already correct in core).

### Screen reader
- After save, a polite live region announces the success notice.
- Tab change announces the tab name.
- Site state badges (Archived / Spam / Mature / Flagged) read inline with the URL via core's `site_states()`.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `ms_sites_list_table_query_args` (filter) | Modify `get_sites()` args | Replace with workspace-level `dataSource.queryArgs` |
| `wpmu_blogs_columns` (filter) | Add/remove list columns | Replace with workspace `fields` API |
| `restrict_manage_sites` (action) | Inject filter widgets above list | Replace with workspace-level filter API |
| `manage_sites_extra_tablenav` (action) | After-filter tablenav append | Same |
| `wpmublogsaction` (action) | Per-row action column | Replace with workspace `actions` registry |
| `network_sites_updated_message_{action}` (filter) | Custom action notices | Replace with workspace notice API |
| `network_site_new_form` (action) | Append fields to Add Site form | Replace with workspace form-extension API |
| `network_site_info_form` (action) | Append fields to Edit Info | Same |
| `network_site_users_after_list_table` (action) | After Users tab list | Slot |
| `show_network_site_users_add_existing_form` (filter) | Hide Add Existing form | Replace with config flag |
| `show_network_site_users_add_new_form` (filter) | Hide Add New form | Same |
| `network_site_users_created_user` (action) | After user-on-site create | Event bus |
| `wpmu_update_blog_options` (action) | After raw options save | Event bus |
| `wpmueditblogaction` (action) | Append to Edit Site Settings tab | Slot |
| `handle_network_bulk_actions-{screen}` (filter) | Custom bulk actions | Replace with workspace action registry |
| `propagate_network_user_spam_to_blogs` (filter) | Cascade spam status to user's sites | Document; no UI surface needed |

---

## 15. Mapping & implementation status

### Current workspace coverage
- None.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `network-sites` source (list + sub-screens) | High | Top-level network app |
| Custom REST endpoints for sites CRUD | High | Wraps `WP_Site_Query`, `wpmu_create_blog`, `update_blog_details`, `wpmu_delete_blog`, `update_blog_status` |
| Add-site form with auto-user-create flow | High | Cross-cuts users + sites |
| Edit Site tab strip | High | Four tabs share same id param |
| Per-site user list (cross-blog `WP_User_Query`) | High | Need `add_user_to_blog`, `remove_user_from_blog`, role-on-site mutation endpoints |
| Per-site theme allowlist | Medium | `allowedthemes` option toggle endpoint |
| Raw options editor | Low / risky | Direct `wp_options` editor; consider keeping iframe fallback |
| Confirmation interstitials | Medium | Modal + nonce equivalent |
| Site state badges (Archived / Spam / Mature) | Medium | Core renders inline — preserve |
| Search heuristics (IP / numeric / wildcard) | Medium | Port from `prepare_items()` |
| Mature / Not Mature toggles | Low | Hidden in default UI; defer |

### Acceptable interim
`iframe:network/sites.php` and `iframe:network/site-{tab}.php` with chrome hidden for v1.

---

## 16. Out of scope

- **Mature site UI** — core hides this in the default list; only confirm-nonce preserved for back-compat.
- **Auto-create-user-from-domain fallback** in Add Site (when email is new and `username_exists($domain)`) — preserve the error message but don't surface as a flow.
- **`wp_is_large_network()` truncated mode** — core skips counts and ordering. Workspace may render the same way for >10k sites.
- **`primary_blog` user-meta sync on add-site** — automatic; no UI.

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/sites.php` (list + action handlers + confirmation interstitials)
  - `wp-admin/network/site-new.php`
  - `wp-admin/network/site-info.php`
  - `wp-admin/network/site-users.php`
  - `wp-admin/network/site-themes.php`
  - `wp-admin/network/site-settings.php`
- List table: `wp-admin/includes/class-wp-ms-sites-list-table.php`
- Per-site users list table (shared): `wp-admin/includes/class-wp-users-list-table.php` (consumed via `switch_to_blog()`)
- Per-site themes list table: `wp-admin/includes/class-wp-ms-themes-list-table.php` (with `site_id` set)
- PHP API: `wpmu_create_blog`, `wpmu_delete_blog`, `update_blog_details`, `update_blog_status`, `add_user_to_blog`, `remove_user_from_blog`, `wpmu_create_user`, `wpmu_welcome_notification`
- Tab nav helper: `network_edit_site_nav()` in `wp-admin/includes/ms.php`
- Site count: `wp_count_sites()` in `wp-includes/ms-functions.php`
- Network Sites REST gap reference: no `class-wp-rest-sites-controller.php` exists in `wp-includes/rest-api/endpoints/` as of WP 6.9.
