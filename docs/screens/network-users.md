# Screen Spec: Network Users (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/users.php` (Network Users list)
- `wp-admin/network/user-new.php` (Add User network-wide)
- `wp-admin/network/user-edit.php` (delegates to `wp-admin/user-edit.php`)
- `wp-admin/includes/class-wp-ms-users-list-table.php`

**Current workspace coverage:** None — `core:users` exists for single-site only.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_network_users`.

This spec describes the **semantic surface** of the network-level users screen, the network-add-user form, and the multisite extensions to the user-edit profile (Super Admin checkbox + per-site role list).

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-users` |
| Display name | "Users" (network context) |
| Original URLs | `/wp-admin/network/users.php`, `/wp-admin/network/user-new.php`, `/wp-admin/network/user-edit.php?user_id={n}` |
| Menu location | `menu[10]` in `wp-admin/network/menu.php` |
| Submenu items | All Users (list), Add User (sub-screen) |
| Parent app | None — top-level network app |
| Sub-screens | List (default), Add User, Edit User, Delete-with-reassign confirmation |

The workspace's existing `core:users` (DataViews + bulk delete with reassign) is single-site-scoped (`/wp/v2/users` against the current blog). The network-users screen pierces per-blog scoping by querying with `blog_id => 0`.

---

## 2. Purpose

Manage the entire network's user population: search, filter (super admins only), create network-wide accounts, edit profiles (with a network-only Super Admin checkbox + per-site role view), reassign-and-delete users, and triage spam users.

Jobs to be done:
- **Find any user across all sites** — search by login/email/etc.; results are network-scoped, not per-site.
- **Create a network user** — without auto-binding to a specific site.
- **Promote / demote super admins** — single privilege toggle accessible only here.
- **Triage spam users** — mark/unmark spam (cascades to all of their sites optionally).
- **Delete users with content reassign** — explicit per-site reassignment step.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View list | `manage_network_users` | `wp-admin/network/users.php` line 13 |
| Search list | `manage_network_users` | `prepare_items()` |
| Create user | `create_users` | `wp-admin/network/user-new.php` line 13 |
| Edit user (open profile) | `manage_network_users` | inferred from `get_edit_user_link` |
| Save edits to other users | `edit_users` (single-site cap) on the network's main site | `user-edit.php` |
| Toggle Super Admin | `manage_network_options` | `is_super_admin()`, `grant_super_admin()`, `revoke_super_admin()` |
| Mark / unmark spam | `manage_network_users` (refuses on super admins) | `users.php` lines 82–117, 119–149 |
| Delete user | `manage_network_users` AND `delete_users` AND `delete_user($id)` | `users.php` lines 187, 211 |
| Bulk delete | same | `users.php` line 64 |

**Super-admin protection:** spamming a super admin is rejected with `wp_die()`: "Warning! User cannot be modified. The user {login} is a network administrator."

**Permission-denied state:** core `wp_die()` 403. Workspace renders no-access empty state.

---

## 4. Data model

### Primary entity
- **Type:** user (`WP_User`)
- **REST endpoint:** `GET /wp/v2/users` — works **but** requires care:
  - Pass `?context=edit` to receive privileged fields (`email`, `roles`, `capabilities`).
  - The endpoint respects the **request's blog context**; in network admin core uses `WP_User_Query` with `blog_id => 0` to bypass per-site filtering. The REST controller does not expose a `blog_id=0` query parameter — this is a known gap.
  - Cap floor: `list_users` (single-site) or `manage_network_users`. The network-list screen's authoritative cap is the latter.

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `username` | `username` (edit context) / `slug` | string | display |
| `name` | `name` | string | display name |
| `email` | `email` (edit context) | string | display |
| `registered` | `registered_date` | datetime | sortable |
| `super_admin` | derived from `get_super_admins()` | bool | filter facet "Super Admin" |
| `blogs` | derived from `get_blogs_of_user($id, true)` | array of `WP_Site` | per-row column rendering one row per site with role badge |
| `spam` | `meta.spam` (1 = spam) | bool | bulk-action target |

Note: `roles[]` on `/wp/v2/users` returns the **current request blog**'s roles for that user. To list per-site roles in the `blogs` column, the workspace needs to iterate `get_blogs_of_user()` and call `get_userdata($user_id)` switched into each site — there is no REST surface for this.

### Status filter facets
Source: hard-coded — only "All" and "Super Admin" tabs. Counts: `get_user_count()` (network total) and `count(get_super_admins())`.

### Query parameters (list)
- `s` — search (login / email / display name)
- `role` — only `super` is a valid filter at network level (or empty/all)
- `orderby` — `id`, `login`, `email`, `name`, `registered`
- `order` — `ASC` / `DESC`
- `paged` — pagination
- Wildcard `*` — wraps search by default unless network is `wp_is_large_network('users')`

### Edit User (multisite extras)

The base profile form is `wp-admin/user-edit.php` (same as single-site). Multisite adds:

| Section | Fields | Notes |
|---|---|---|
| Super Admin Privileges | checkbox: "Grant this user super admin privileges for the Network." | Only visible to current super admins editing other users; not shown for self. Backed by `grant_super_admin()` / `revoke_super_admin()`. |
| Sites | per-site list with role select per site | Read-only display in core's profile screen; role changes happen via per-site Edit Site → Users tab (see `network-sites.md`). |

### Add User form fields
| Field | Type | Required | Notes |
|---|---|---|---|
| `user[username]` | text | yes | lowercased, regex-validated by `wpmu_validate_user_signup()` |
| `user[email]` | email | yes | validated for email-domain banlist + uniqueness |
| (no password input) | — | — | A password reset link is emailed; password is `wp_generate_password(12)` server-side |

Save handler: `user-new.php?action=add-user`, calls `wpmu_create_user()` then redirects with `update=added`. Fires `network_user_new_created_user` action.

### Delete-with-reassign data model

`confirm_delete_users()` renders a per-site form: for each site the user belongs to, the admin chooses "Delete all content" or "Attribute all content to: {select another user from that site}".

POST shape (form-encoded):
```
delete[<blog_id>][<user_id>] = 'reassign' | 'delete'
blog[<user_id>][<blog_id>]   = <new_user_id>   // when reassigning
user[]                       = <user_id>        // confirms which users
```

Action: `users.php?action=dodelete`, nonce `ms-users-delete`.

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| List network-wide users | `GET /wp/v2/users?context=edit` | **Partial** — works, but `blog_id=0` semantics aren't expressible. Single-blog scoping leaks. |
| Get a user | `GET /wp/v2/users/{id}?context=edit` | Works. |
| Create user | `POST /wp/v2/users` (cap: `create_users`) | **Partial** — creates network user, but doesn't run `wpmu_validate_user_signup()` (banlist / blocked-domains / illegal-names checks). Workspace needs to either run validation client-side or call a custom endpoint. |
| Update user | `PUT /wp/v2/users/{id}` | Works for basic fields. Does **not** expose Super Admin toggle. |
| Toggle Super Admin | None | **GAP** — `grant_super_admin()` / `revoke_super_admin()` are PHP-only. Need custom endpoint. |
| Mark spam | None | **GAP** — `wp_update_user()` with `spam=1` works in PHP, but the REST `update_item_permissions_check` does not whitelist the `spam` meta. |
| Delete user (simple) | `DELETE /wp/v2/users/{id}?force=true&reassign={target}` | Works. **`reassign` is a single integer**, applied network-wide — this does NOT match the per-site reassignment that core's confirm screen offers. **GAP for true parity.** |
| Per-site role read | None at network scope | **GAP** — `roles[]` on `/wp/v2/users` is request-blog-scoped. |
| `get_blogs_of_user()` data | None | **GAP** — no REST surface for "which sites does this user belong to". |
| `wpmu_validate_user_signup()` | None | **GAP** — needed for parity with Add User validation. |

Network users is the second-largest REST gap behind sites. Plan custom endpoints for super-admin toggle, spam toggle, per-site reassignment delete, and signup validation.

---

## 5. Layout regions (semantic)

### Network Users list
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Users")                                          │
│  └─ Primary action: "Add User" (cap: create_users)           │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Tabs: All | Super Admin (counts)                         │
│  ├─ Search input                                             │
│  └─ View switcher: list / excerpt                            │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  └─ Confirm Email (legacy, signup-only) | Mark as spam |     │
│     Not spam | Delete                                        │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  └─ Table: [cb] | Username | Name | Email | Registered |    │
│            Sites                                             │
│            "Sites" cell renders one row per blog with role   │
│            and "Edit" / "View" links per site                │
└─────────────────────────────────────────────────────────────┘
```

### Add User (network)
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Add User"                                           │
│ FORM:                                                        │
│  - Username                                                  │
│  - Email                                                     │
│  - Helper: "A password reset link will be sent..."           │
│ SUBMIT                                                       │
└─────────────────────────────────────────────────────────────┘
```

### Edit User (network deltas over single-site profile)
```
[ … standard profile fields … ]

┌─ Super Admin (only when editing OTHERS) ───────────────────┐
│  [ ] Grant this user super admin privileges for the Network│
└────────────────────────────────────────────────────────────┘

┌─ Sites ────────────────────────────────────────────────────┐
│  Per site: site name | role select (read-only here) | Edit │
└────────────────────────────────────────────────────────────┘

[ Save ]
```

### Delete-with-reassign confirmation
```
┌─────────────────────────────────────────────────────────────┐
│ "Confirm Deletion" (full-screen interstitial)                │
│                                                              │
│  For each user × each site they belong to:                   │
│    ◯ Delete all content                                      │
│    ◯ Attribute all content to: [user picker for that site]   │
│                                                              │
│  [ Confirm Deletion ] (nonce: ms-users-delete)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton rows |
| Empty | No users (impossible — current user always exists) | "No users found." |
| Empty filtered | Search yields 0 | Same; clear-search affordance |
| Confirm-delete interstitial | Per-row Delete or bulk Delete | Dedicated page with reassign forms |
| Add user: validation error | banned email domain / username taken / illegal name | Inline form errors from `wpmu_validate_user_signup()` |
| Tried to spam super admin | `is_super_admin($id)` true | `wp_die()` blocking screen |
| Tried to delete user 1 | `id <= 1` | Silent redirect — UI should hide Delete for that user |
| Self-edit Super Admin | viewing own profile | Section hidden |

---

## 7. Actions

### List header
- **Add User** — navigate to Add User. Cap: `create_users`.

### Per-row actions
| Action | Cap | Notes |
|---|---|---|
| Edit | `manage_network_users` | Opens user-edit profile (multisite-extended) |
| Delete | `manage_network_users` + `delete_users` + `delete_user($id)` | Confirm-with-reassign interstitial |
| Mark as Spam | `manage_network_users` | Refuses on super admins |
| Not Spam | `manage_network_users` | Same |

### Bulk actions
| Bulk action | Behavior |
|---|---|
| Confirm Email | Confirms unconfirmed signups (legacy WPMU signup queue; rare in modern multisite) |
| Mark as spam | Per user → `wp_update_user(['spam' => '1'])`; optionally cascades to user's blogs via `propagate_network_user_spam_to_blogs` filter |
| Not spam | Reverse |
| Delete | Renders confirm-with-reassign interstitial |

### Add User
- **Add User** submit — `wpmu_validate_user_signup()` then `wpmu_create_user()`. On success, redirect with success notice + edit link.

### Edit User (multisite extras)
- Toggle Super Admin checkbox → `grant_super_admin()` / `revoke_super_admin()`
- Per-site role list is read-only here (mutate via `network-sites` Edit Site → Users tab)

---

## 8. Filters, sort, search, pagination

### Filters
| Filter | Field | Values |
|---|---|---|
| Role | `role` | empty (All) or `super` (Super Admins) |

### Sort
Sortable columns: `id`, `login`, `email`, `name`, `registered`. Default `id desc` for large networks; otherwise unset.

### Search
- Single `s` input
- Wildcard auto-wrapping (`*term*`) unless network is large (`wp_is_large_network('users')`)
- Server matches `user_login`, `user_email`, `user_url`, `user_nicename`, `display_name`

### Pagination
- Default page size: per-user screen option `users_network_per_page` (default 20)
- Large network: `count_total = false` (no total / no last-page link)

---

## 9. Forms & inputs

### Add User
| Field | Type | Required | Validation |
|---|---|---|---|
| `user[username]` | text | yes | alphanumeric + underscore, 4–60 chars, not in `illegal_names`, not already taken |
| `user[email]` | email | yes | valid email, not in `banned_email_domains`, in `limited_email_domains` if set, not already taken |

`wpmu_validate_user_signup()` is the authoritative validator; returns `WP_Error` on failure.

### Edit User
- All single-site profile fields (see `wp-admin/user-edit.php`)
- + Super Admin checkbox (when applicable)
- + Sites read-only list

### Delete confirmation
| Field | Type | Required |
|---|---|---|
| `delete[blog_id][user_id]` | radio: `delete` or `reassign` | yes per site |
| `blog[user_id][blog_id]` | user picker (within that blog) | required when `reassign` |

---

## 10. Routing & URL state

Original wp-admin URL params:
- List: `?s={query}&role={role}&orderby={col}&order={dir}&paged={n}`
- Add: `/user-new.php?update=added&user_id={n}`
- Edit: `/user-edit.php?user_id={n}`
- Delete confirm: `/users.php?action=deleteuser&id={n}` or POST to `/users.php?action=allusers` with `action=delete`

Recommended workspace hash:
```
#/network-users?role=super&s=alice&page=2
#/network-users/add
#/network-users/{id}
#/network-users/{id}/delete   ← confirm-with-reassign
```

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click username | Edit User profile | user id |
| Click site name in row | `network-sites` Edit Site → Info | site id |
| "Edit" link beside site name | `network-sites` Edit Site → Users (focused on that user) | site id + user id |
| Add User success | back to Add User with success notice + "Edit user" link |

### Inbound
| Origin | Behavior |
|---|---|
| `network-dashboard` "Create a New User" | Land on Add User |
| `network-dashboard` Search Users | Land on list with `?s={query}` |
| `network-sites` Edit Site → Users → click username | Land on Edit User |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| User created | "User added." + "Edit user" deep link |
| Bulk spam | "Users marked as spam." |
| Bulk not-spam | "Users removed from spam." |
| Single delete | "User deleted." |
| Bulk delete | "Users deleted." |
| Add user form error | Inline error notice with messages from `WP_Error` |
| Tried to spam super admin | Blocking page |

No undo for delete (content is reassigned or destroyed; not reversible).

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `/` | Focus search |
| `↑`/`↓` | Move row focus |
| `Space` | Toggle selection |
| `Enter` | Open Edit User |

### ARIA
- Row checkboxes: `aria-label="Select {username}"`.
- "Sites" cell renders a sub-list of sites; mark up as `<ul>` with each site as `<li>`.
- Confirm-delete interstitial: focus trap; per-site fieldsets with `<legend>` naming the site.
- Super Admin checkbox: `aria-describedby` linking to a paragraph that explains the privilege.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wpmu_users_columns` (filter, see list table) | Add columns | Replace with `fields` API |
| `manage_users-network_columns` | Same | Same |
| `network_user_new_form` (action) | Append fields to Add User | Slot |
| `network_user_new_created_user` (action) | After user created | Event bus |
| `propagate_network_user_spam_to_blogs` (filter) | Cascade spam → blogs | Document; opt-in toggle |
| `users_list_table_query_args` (filter) | Modify `WP_User_Query` args | Replace with `dataSource.queryArgs` |
| `handle_network_bulk_actions-{screen}` | Custom bulk actions | Replace with workspace action registry |

---

## 15. Mapping & implementation status

### Current workspace coverage
- Single-site `core:users` exists. Network-scoped users is **not** covered.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Network-scoped user list (`blog_id=0`) | High | REST `/wp/v2/users` doesn't expose this; need custom endpoint or workspace-side multi-blog assembly |
| Super Admin column / facet | High | Read-only column trivial; mutation needs custom endpoint |
| Super Admin toggle on profile | High | `grant_super_admin` / `revoke_super_admin` not REST |
| Spam toggle | Medium | Custom endpoint or extend `/wp/v2/users` |
| Per-site reassign-on-delete | High | REST `force=true&reassign={id}` is single-target; core flow allows per-site mapping |
| `wpmu_validate_user_signup()` parity | High | Banlist / illegal-names / domain-restrict checks not replicated by REST |
| Sites column with per-site role badges | Medium | Cross-blog role lookup; no REST surface |
| Network-add-user form | Medium | Validation + welcome email |
| Confirm-email bulk action | Low | Legacy signup-queue; rarely populated |

### Acceptable interim
`iframe:network/users.php` and `iframe:network/user-{new,edit}.php` for v1.

---

## 16. Out of scope

- **Confirm-email bulk action** for unconfirmed signups (`wp_signups` table) — legacy WPMU; ship if data is present, defer otherwise.
- **`/wp-admin/network/profile.php`** — thin wrapper that redirects current user to `user-edit.php?user_id=current`. Mention only here and in `network-dashboard.md`.
- **`/wp-admin/network/privacy.php`** — wrapper for the privacy guide; not a user screen.
- **Bulk role change at network level** — core only offers role change per-site (in Edit Site → Users).

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/users.php`
  - `wp-admin/network/user-new.php`
  - `wp-admin/network/user-edit.php` (delegates to `wp-admin/user-edit.php`)
- List table: `wp-admin/includes/class-wp-ms-users-list-table.php`
- Confirm-delete UI: `wp-admin/includes/ms.php::confirm_delete_users()`
- PHP API: `wpmu_create_user`, `wpmu_validate_user_signup`, `wpmu_delete_user`, `grant_super_admin`, `revoke_super_admin`, `is_super_admin`, `get_super_admins`, `add_user_to_blog`, `remove_user_from_blog`, `get_blogs_of_user`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php` (single-site scoping)
- Single-site profile screen (related): `wp-admin/profile.php` / `wp-admin/user-edit.php`
- Single-site users spec (related): consult workspace's existing `core:users` source
