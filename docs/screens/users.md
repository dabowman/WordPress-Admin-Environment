# Screen Spec: Users (list, add, edit, profile, application-password authorization)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/users.php`, `wp-admin/user-new.php`, `wp-admin/user-edit.php`, `wp-admin/profile.php`, `wp-admin/authorize-application.php`, `WP_Users_List_Table` (`wp-admin/includes/class-wp-users-list-table.php`)
**Current workspace coverage:** `core:users` → DataViews list (M4), `core:profile` → `src/apps/profile/index.js` (partial — see "Gaps").

This spec describes the **semantic surface** of the user-management screens so an agent can rebuild them in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs. Single-site context — multisite-specific behavior is called out where relevant; network-admin-only variants are out of scope.

The five screens are documented as one app cluster (`core:users`) because they share an entity (`users`), capabilities, and REST surface. The plausible workspace mapping is:
- `core:users` → list (default route)
- `core:user-new` → add user (existing-user invite + new-user create flows)
- `core:user-edit` → edit any user (admin-only)
- `core:profile` → edit own profile (every logged-in user)
- `core:authorize-application` → application password authorization handshake

`core:user-edit` and `core:profile` share a single underlying form. Differences are conditional rendering (admin-only fields hidden when `IS_PROFILE_PAGE`, editor-only fields visible otherwise).

> **Profile has its own spec.** The own-vs-other-user branching and the email pending-change confirmation flow are documented in full in **`docs/screens/profile.md`**. This cluster spec remains authoritative for the list / add-user / authorize-application surfaces; the two overlap on the shared edit/profile form and cross-reference each other.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug (cluster) | `users` |
| Display name | "Users", "Add User", "Edit User", "Profile", "Authorize Application" |
| Original URLs | `/wp-admin/users.php`, `/wp-admin/user-new.php`, `/wp-admin/user-edit.php?user_id={id}`, `/wp-admin/profile.php`, `/wp-admin/authorize-application.php` |
| Menu location | Top-level "Users" (admin); top-level "Profile" (non-admin); Authorize App is unmenued, reached only via OAuth-style redirect |
| Submenu items | All Users, Add New User, Profile |
| Parent app | None |
| Sub-screens | Edit User (per row), Application Passwords (within Profile / Edit User) |

The same form serves Edit User and Profile. Personal Options + Account Management sections behave differently when the form is editing self vs. editing someone else.

---

## 2. Purpose

Manage the people who can sign in to a WordPress site: list them, invite or create new ones, edit their profile, change their role, reset their password, manage their application passwords, and let third-party applications request access via OAuth-style password handshake.

Jobs to be done:
- **Find a user** — search by username/email, filter by role.
- **Invite a teammate** (multisite) — send invitation email by username/email.
- **Create a new user** (single-site) — username + email + role + password.
- **Change my profile** — name, email, password, language preference, admin color.
- **Change another user's role** — bulk or per-row.
- **Send password reset** — admin-initiated reset email.
- **Delete a user and reassign their content** — single-site only.
- **Manage application passwords** — create new, revoke existing.
- **Authorize an external app to access my account** — approve / deny an incoming auth request.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View users list | `list_users` | `users.php` line 13 |
| Edit any user (full form) | `edit_users` (general) + `edit_user` for the specific user | `user-edit.php` line 135 |
| Edit own profile | `read` + automatically granted `edit_user` for self | `user-edit.php` |
| Create new user | `create_users` | `user-new.php` line 20 (single-site); `create_users` OR `promote_users` (multisite) |
| Promote / change role | `promote_users` general + `promote_user` for specific user | `users.php` `promote` action |
| Delete user | `delete_users` general + `delete_user` for specific user | `users.php` `delete` / `dodelete` actions |
| Remove user from site (multisite) | `remove_user` for the user | `users.php` `remove` action |
| Reset another user's password | `edit_user` + `wp_is_password_reset_allowed_for_user` | per-row "Send password reset" |
| List own application passwords | `list_app_passwords` | `WP_REST_Application_Passwords_Controller::get_items_permissions_check` |
| Create app password | `create_app_password` | controller `create_item` |
| Read specific app password | `read_app_password` | controller |
| Edit app password | `edit_app_password` | controller |
| Delete app password | `delete_app_password` / `delete_app_passwords` | controller |
| Network: grant/revoke super admin | `manage_network_options` | `user-edit.php` line 175 |
| Authorize application | `read` + `wp_is_application_passwords_available_for_user` | `authorize-application.php` |

**Permission-denied states:**
- Lacking `list_users`: `wp_die` with "Sorry, you are not allowed to list users." Workspace mirrors via 403 view.
- Lacking `edit_user` for specified id: `wp_die` "Sorry, you are not allowed to edit this user."
- Application passwords unsupported (no HTTPS, `wp_is_application_passwords_available()` false): the section is hidden and authorization page errors out with 501.
- Self-cannot-delete: in single-site, the row's Delete action is hidden when `user_id === current_user_id`. In multisite, Remove is hidden similarly.
- Self-cannot-demote: changing your own role to one without `promote_users` is rejected with `err_admin_role`.
- `wp_is_application_passwords_available_for_user($user)` — site-protected by Basic Auth disables the feature.

**Multisite:**
- Invite-existing-user flow: in multisite, Add User defaults to inviting an already-registered network user by email. The "Add New User" subform is gated by `create_users` (which only Super Admins have by default in multisite).
- Site-level role changes don't delete the user from the network — Remove only revokes site membership.
- Network admin offers a separate Users screen (`network/users.php`) — out of scope here.
- Super Admin badge appears in row + form when `is_super_admin($user_id)` is true.

---

## 4. Data model

### Primary entity
- **Type:** user
- **REST endpoint:** `GET /wp/v2/users`
- **Single-record endpoints:**
  - `GET /wp/v2/users/{id}` — any user (cap-gated)
  - `GET /wp/v2/users/me` — current user shortcut
- **Controller:** `WP_REST_Users_Controller` (`wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`)

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `username` | `username` | string | login; immutable after creation; only in `edit` context |
| `name` | `name` | string | display name (publicly visible) |
| `first_name` | `first_name` | string | `edit` context |
| `last_name` | `last_name` | string | `edit` context |
| `email` | `email` | string | `edit` context |
| `url` | `url` | string | website |
| `description` | `description` | string | bio |
| `link` | `link` | URL | author archive |
| `slug` | `slug` | string | `user_nicename` |
| `avatar_urls` | `avatar_urls` | object `{ "24": URL, "48": URL, "96": URL }` | Gravatar by default |
| `roles` | `roles` | string[] | `edit` context only; usually one role |
| `capabilities` | `capabilities` | object `{cap: bool}` | full `allcaps` map; `edit` context |
| `extra_capabilities` | `extra_capabilities` | object | direct `caps` on the user (excludes role-derived) |
| `locale` | `locale` | string | user language |
| `nickname` | `nickname` | string | `edit` context |
| `meta` | `meta` | object | registered user meta |

### Query parameters
- `per_page` — page size (1–100; default 10)
- `page` — pagination
- `search` — `WP_User_Query` searches `ID`, `user_login`, `user_nicename`, `user_email`, `display_name`. Wildcards added automatically.
- `roles` — comma-separated; `?roles=editor,author`
- `who=authors` — only users who can write any post-type with `show_in_rest`
- `capabilities` — comma-separated cap list (requires `list_users`)
- `orderby` — `id`, `name`, `slug`, `email`, `url`, `registered_date`, `include`, `include_slugs`. `email` and `registered_date` require `list_users`.
- `order` — `asc` / `desc`
- `context=edit` — required to receive `username`, `email`, `roles`, `capabilities`, `first_name`, `last_name`, `nickname`, `locale`, `meta`
- `_embed` — none for users (no first-class embedded resources)

### Aggregate data — role counts

The role filter row shows: `All (N) | Administrator (N) | Editor (N) | Author (N) | Contributor (N) | Subscriber (N) | No role (N) | {custom roles}`.

- Source: `count_users()` in PHP — returns `total_users` and per-role counts including `none` for users with no role on the current site.
- REST exposure: **gap.** `count_users()` is not exposed via REST. Workarounds:
  - 6+ requests to `/wp/v2/users?roles={role}&per_page=1` reading `X-WP-Total`. Fine for small role sets.
  - Custom `/wp-admin-workspaces/v1/user-counts` proxy.
- Large-network fallback: `wp_is_large_user_count()` returns true when total > 10000; core then suppresses counts entirely. Mirror this in workspace.

### Fields used by the edit / profile form

In addition to the list fields:

| Section | Field | REST path | Type | Notes |
|---|---|---|---|---|
| Personal Options | Visual editor | `meta.rich_editing` (legacy) | bool | Stored as `'true'`/`'false'` strings on user meta. **Gap** — not in REST users schema by default. Custom user meta. |
| Personal Options | Syntax highlighting | `meta.syntax_highlighting` | bool | Same gap. |
| Personal Options | Admin color scheme | `meta.admin_color` | string | enum: `fresh` / `light` / `modern` / `blue` / `coffee` / `ectoplasm` / `midnight` / `ocean` / `sunrise`. **Gap.** |
| Personal Options | Keyboard shortcuts | `meta.comment_shortcuts` | bool | "Enable for comment moderation". **Gap.** |
| Personal Options | Toolbar (front of site) | `meta.show_admin_bar_front` | bool | **Gap.** |
| Personal Options | Language | `locale` | string | exposed in REST; uses available languages. |
| Name | Username | `username` | string | readonly after creation |
| Name | First name | `first_name` | string | |
| Name | Last name | `last_name` | string | |
| Name | Nickname | `nickname` | string | required |
| Name | Display name publicly as | `name` | string | dropdown of permutations of nickname/login/firstname/lastname/full |
| Contact Info | Email | `email` | string | |
| Contact Info | Website | `url` | string | |
| Contact Info | Custom contact methods | `meta.{name}` | string | extended via `wp_get_user_contact_methods` filter |
| About | Biographical info | `description` | string | textarea |
| About | Profile picture | (read) `avatar_urls` | URL | not editable in WordPress; Gravatar-controlled |
| Account Management | New password | `password` | string | write-only; `edit` context |
| Account Management | Sessions | (read) computed | int | count of `WP_Session_Tokens` |
| Account Management | Application Passwords | `/wp/v2/users/{id}/application-passwords` | nested resource | separate controller |

**Personal Options gap:** the Visual Editor / Syntax Highlighting / Admin Color / Keyboard Shortcuts / Toolbar fields are stored as user meta but not registered in the default REST users schema. Workspace needs either:
- Custom REST user meta registration that exposes them through `meta`, or
- A custom `/wp-admin-workspaces/v1/user-prefs/{id}` endpoint.

The existing M5 user prefs endpoint (`/wp-admin-workspaces/v1/user-prefs`) handles workspace-specific prefs only (density, accent, default route). Core wp-admin prefs are a separate concern.

### Application Passwords data model

Nested resource under `users`.

- **Endpoint:** `/wp/v2/users/{user_id}/application-passwords` (where `{user_id}` may be a numeric id or `me`)
- **Controller:** `WP_REST_Application_Passwords_Controller`

| Field | Type | Notes |
|---|---|---|
| `uuid` | string | unique identifier; generated server-side |
| `app_id` | string | optional UUID v5 provided by the application |
| `name` | string | required; human-readable label (e.g. "iPhone Calendar") |
| `password` | string | only returned **once** in the create response (`edit` context) |
| `created` | datetime (GMT ISO 8601) | readonly |
| `last_used` | datetime or null | readonly |
| `last_ip` | string or null | readonly |

Routes:
- `GET /wp/v2/users/{user_id}/application-passwords` — list
- `POST /wp/v2/users/{user_id}/application-passwords` — create; response includes `password` field once
- `GET /wp/v2/users/{user_id}/application-passwords/{uuid}` — single
- `PUT /wp/v2/users/{user_id}/application-passwords/{uuid}` — update name
- `DELETE /wp/v2/users/{user_id}/application-passwords/{uuid}` — revoke single
- `DELETE /wp/v2/users/{user_id}/application-passwords` — revoke all
- `GET /wp/v2/users/{user_id}/application-passwords/introspect` — return the password used for the current request (the calling app can introspect itself)

### Authorize Application data model

Not a stored resource — a one-shot interaction.

| Field | Source | Notes |
|---|---|---|
| `app_name` | URL `?app_name=` | requesting app's display name |
| `app_id` | URL `?app_id=` | optional UUID v5 supplied by the app |
| `success_url` | URL `?success_url=` | redirect target on approval; receives `?site_url=&user_login=&password=` |
| `reject_url` | URL `?reject_url=` | redirect target on denial (or `success_url + '?success=false'` if absent) |

Validation: `wp_is_authorize_application_password_request_valid()` (`wp-admin/authorize-application.php` line 83) checks the URL is well-formed and not pointing to the current site.

---

## 5. Layout regions (semantic)

### 5a. Users list

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Users")                                          │
│  └─ Primary action: "Add New User"                           │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Role tabs with counts (All | Admin | Editor | …          │
│  │      | No role | {custom})                                │
│  └─ Search input                                             │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  ├─ Bulk action select (Delete / Send password reset /       │
│  │   Remove [multisite])                                     │
│  ├─ Apply                                                    │
│  ├─ "Change role to…" select + Change button                 │
│  └─ Bulk count                                               │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION (table)                                          │
│  └─ Columns: cb | Username (avatar+login) | Name | Email |   │
│              Role | Posts | (custom)                         │
│              per-row actions: Edit / Delete (or Remove) /    │
│              View / Send password reset                      │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination + total                                       │
└─────────────────────────────────────────────────────────────┘
```

### 5b. Add User

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Add User" or "Add Existing User")                │
├─────────────────────────────────────────────────────────────┤
│ MULTISITE: ADD EXISTING USER (when promote_users)            │
│  ├─ Email or Username                                        │
│  ├─ Role                                                     │
│  ├─ Skip Confirmation Email (Super Admin only)               │
│  └─ Add Existing User                                        │
├─────────────────────────────────────────────────────────────┤
│ ADD NEW USER (when create_users)                             │
│  ├─ Username (required, immutable)                           │
│  ├─ Email (required)                                         │
│  ├─ First Name (single-site only)                            │
│  ├─ Last Name (single-site only)                             │
│  ├─ Website (single-site only)                               │
│  ├─ Language (single-site only, when languages installed)    │
│  ├─ Password (single-site only) — generate / type            │
│  ├─ Repeat Password                                          │
│  ├─ Confirm use of weak password (when applicable)           │
│  ├─ Send User Notification (single-site only)                │
│  ├─ Role                                                     │
│  ├─ Skip Confirmation Email (multisite Super Admin only)     │
│  └─ Add User                                                 │
└─────────────────────────────────────────────────────────────┘
```

### 5c. Edit User / Profile (shared form)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Profile" / "Edit User {Name}")                   │
│  └─ "Add User" link (Edit User only, for admins)             │
├─────────────────────────────────────────────────────────────┤
│ PERSONAL OPTIONS                                             │
│  ├─ Visual Editor (disable WYSIWYG)                          │
│  ├─ Syntax Highlighting (disable; only when editing code)    │
│  ├─ Administration Color Scheme (radio of named schemes)     │
│  ├─ Keyboard Shortcuts (comment moderation)                  │
│  ├─ Toolbar (Show when viewing site)                         │
│  └─ Language                                                 │
├─────────────────────────────────────────────────────────────┤
│ NAME                                                         │
│  ├─ Username (readonly)                                      │
│  ├─ Role (Edit User only, when user has promote_user cap)    │
│  ├─ Super Admin (network admin only)                         │
│  ├─ First Name                                               │
│  ├─ Last Name                                                │
│  ├─ Nickname (required)                                      │
│  └─ Display name publicly as (select)                        │
├─────────────────────────────────────────────────────────────┤
│ CONTACT INFO                                                 │
│  ├─ Email (required; self-edit triggers confirmation flow)   │
│  ├─ Website                                                  │
│  └─ {Custom contact methods from wp_get_user_contact_methods}│
├─────────────────────────────────────────────────────────────┤
│ ABOUT YOURSELF / ABOUT THE USER                              │
│  ├─ Biographical Info (textarea)                             │
│  └─ Profile Picture (Gravatar; read-only)                    │
├─────────────────────────────────────────────────────────────┤
│ ACCOUNT MANAGEMENT                                           │
│  ├─ New Password (generate or type) + Repeat                 │
│  ├─ Confirm use of weak password (when applicable)           │
│  ├─ Password Reset (Edit User: "Send Reset Link" button)     │
│  └─ Sessions (Log Out Everywhere Else / Log Out Everywhere)  │
├─────────────────────────────────────────────────────────────┤
│ APPLICATION PASSWORDS                                        │
│  ├─ Create form: name input + Add Application Password       │
│  ├─ Newly-created password reveal (one-time)                 │
│  └─ Existing list: name | created | last used | last IP |    │
│       Revoke action; Revoke All button                       │
├─────────────────────────────────────────────────────────────┤
│ ADDITIONAL CAPABILITIES (rare; when user has direct caps)    │
│  └─ Comma-separated list of caps; "Denied: {cap}" prefix     │
│      for false-valued caps                                   │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Update Profile / Update User                             │
└─────────────────────────────────────────────────────────────┘
```

### 5d. Authorize Application

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Authorize Application")                          │
├─────────────────────────────────────────────────────────────┤
│ AUTH CARD                                                    │
│  ├─ "An application would like to connect to your account."  │
│  ├─ "{App name} would like to access your account."          │
│  ├─ Multisite: scope explanation (one site / N sites / all)  │
│  ├─ Logged-in-as banner ({user_login})                       │
│  └─ Application name input (only when ?app_name absent)      │
├─────────────────────────────────────────────────────────────┤
│ ACTIONS                                                      │
│  ├─ Approve (button, primary)                                │
│  └─ Cancel / Deny (button, secondary)                        │
└─────────────────────────────────────────────────────────────┘
```

On approve: a new application password is created via `WP_Application_Passwords::create_new_application_password`, then either redirected to `success_url?site_url=&user_login=&password=` or, when no `success_url`, displayed in-page (one-time reveal). On deny: redirect to `reject_url`.

---

## 6. States

### Users list

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch | Skeleton rows |
| Empty | `total === 0` | "No users found." |
| Empty (filtered) | filter yields 0 | same with hint to clear |
| Permission denied | `list_users` missing | 403 view |
| Multisite single-site, no `manage_network_users` | normal users.php | "Remove" replaces "Delete"; no add-new-user form |
| Large user count | `wp_is_large_user_count()` | role counts suppressed |

### Add User

| State | Display |
|---|---|
| Submission in progress | Disabled button + spinner |
| Existing-user invite sent | "Invitation email sent to user." |
| Existing-user added (Super Admin no-confirmation) | "User has been added to your site." + Edit link |
| User does not exist (multisite) | "The requested user does not exist." |
| User already member | "That user is already a member of this site." |
| New user created | "User added." |
| Email taken | inline error |
| Username taken | inline error |
| Username invalid (chars) | inline error from `validate_username` |
| Weak password not confirmed | inline error |

### Edit User / Profile

| State | Display |
|---|---|
| Loading | Skeleton form |
| Submitted, success | Banner: "Profile updated." or "User updated." (dismissible) |
| Submitted, error (e.g. email duplicate) | Banner: error list; field-level errors next to inputs |
| Email change pending (self-edit) | Inline notice: "There is a pending change of your email to {new}." + Cancel link |
| Editing super admin (network admin context) | Top banner: "This user has super admin privileges." |
| App passwords unsupported | section hidden + explanatory paragraph (no HTTPS / disabled by filter) |
| App password just created | Inline success notice with one-time password reveal + copy button |

### Authorize Application

| State | Display |
|---|---|
| Invalid request (validation failed) | `wp_die` with reason |
| Site uses Basic Auth | 501 error: "not currently compatible with application passwords" |
| Application Passwords disabled for this user | 501 error |
| Approval submitted | redirect to success URL or in-page password reveal |
| Denial submitted | redirect to reject URL or admin home |

---

## 7. Actions

### Users list — primary

| Action | Cap | Destination |
|---|---|---|
| Add New User | `create_users` (or `promote_users` on multisite) | `core:user-new` |

### Users list — per-row

| Action | Cap | Type | Notes |
|---|---|---|---|
| Edit | `edit_user` for target | Navigation | `core:user-edit?user_id={id}` |
| Delete | `delete_user` (single-site, not self) | Mutation | Two-step: confirmation page asks how to handle the user's content (delete all / reassign to another user). `DELETE /wp/v2/users/{id}` requires `force=true` and accepts `reassign={target_id}`. |
| Remove | `remove_user` (multisite) | Mutation | Removes site membership but preserves user on the network. |
| View | none | External | Author archive `link`; new tab. |
| Send password reset | `edit_user` + `wp_is_password_reset_allowed_for_user` | Mutation | **Gap in REST** — core uses `users.php?action=resetpassword`, which calls `retrieve_password()`. Workspace needs `POST /wp-admin-workspaces/v1/users/{id}/password-reset` proxy. |
| View posts | none | Navigation | `core:posts?author={id}` |

### Users list — bulk

Selection model: checkbox per row + select all + select all matching (rare). Self cannot be selected for delete on single-site.

| Bulk action | Cap | Behavior |
|---|---|---|
| Delete (single-site) | `delete_users` | Confirmation page asks "delete all posts" / "reassign to another user". Then for each: `DELETE /wp/v2/users/{id}?force=true&reassign={target}`. |
| Remove (multisite) | `remove_users` | Strip site membership for selected. |
| Send password reset | `edit_users` | For each: trigger reset email. Same gap as per-row. |
| Change role | `promote_users` | "Change role to…" dropdown above table; on Apply, `PUT /wp/v2/users/{id}` `{ roles: [role] }` for each. The `none` option clears roles. |

### Add User actions

| Action | Cap | Behavior |
|---|---|---|
| Add Existing User (multisite invite) | `promote_users` | Looks up by email/username, sends invitation email with confirmation link. **Gap in REST** — `add_existing_user_to_blog` is internal. |
| Add Existing User (Super Admin no-confirm) | `manage_network_users` | Adds without email confirmation. Same gap. |
| Add User (single-site create) | `create_users` | `POST /wp/v2/users` `{ username, email, password, first_name, last_name, url, locale, roles, meta }`. Optional `send_user_notification`. **Email-notification flag is not in REST schema** — gap. |

### Edit User / Profile actions

| Action | Cap | Behavior |
|---|---|---|
| Update Profile / Update User | `edit_user` for target | `PUT /wp/v2/users/{id}` with all changed fields. |
| Generate password | none (client-side) | `wp_generate_password(24)` server-side seed; client populates field; user can edit. |
| Cancel password change | none | Resets password fields to empty; nothing sent on save. |
| Send Reset Link (Edit User) | `edit_user` + `wp_is_password_reset_allowed_for_user` | Same gap as list. |
| Log Out Everywhere Else (Profile) | `read` | **Gap in REST** — core uses `WP_Session_Tokens::destroy_others`. Custom `POST /wp-admin-workspaces/v1/users/me/sessions/destroy-others` needed. |
| Log Out Everywhere (Edit User) | `edit_user` + super-admin or admin | Same gap; destroys all sessions including current (so the user is logged out everywhere). |
| Add Application Password | `create_app_password` | `POST /wp/v2/users/{id}/application-passwords` `{ name, app_id? }`. Response **once** includes `password` — UI must display and copy this immediately, store nothing. |
| Revoke Application Password | `delete_app_password` | `DELETE /wp/v2/users/{id}/application-passwords/{uuid}`. |
| Revoke All Application Passwords | `delete_app_passwords` | `DELETE /wp/v2/users/{id}/application-passwords`. |
| Cancel pending email change (self) | none | `?dismiss={user_id}_new_email` — deletes `_new_email` user meta. **Gap in REST**. |

### Authorize Application actions

| Action | Behavior |
|---|---|
| Approve | Create app password via internal API, redirect to `success_url?site_url=&user_login=&password={one-time}` or display password in-page. |
| Cancel / Deny | Redirect to `reject_url` (or admin home). |

### Optimistic vs. blocking
- **Role change (single)** — optimistic with rollback.
- **Role change (bulk)** — blocking with progress; users expect a confirm.
- **Delete user** — blocking, double-confirmed (must choose reassign target).
- **Profile update** — blocking; full form submission.
- **Application password create / revoke** — blocking. Create reveals the password once; revoke is irreversible.

---

## 8. Filters, sort, search, pagination

### Filters

| Filter | Field | Operators | Source |
|---|---|---|---|
| Role | `roles` | `is`, `isAny` | `wp_roles()` enumerable + `none` for users with no role |
| Search | implicit | full-text | substring across login / nicename / email / display_name (server uses wildcards) |

### Sort
Sortable columns (per `WP_Users_List_Table::get_sortable_columns()`): Username (`login`), Email (`email`).

REST orderby supports more: `id`, `name`, `slug`, `email`, `url`, `registered_date`, `include`, `include_slugs`. `email` and `registered_date` require `list_users`.

Default: `username asc` (core).

### Search
Single full-text input. Submits via form GET (`?s={query}`). Debounce 300ms in modern workspace. Resets to page 1.

### Pagination
- Default page size: 20 (user-configurable via screen options up to a sane limit; core stores `users_per_page` user meta)
- URL state: `?paged={n}`. Modern workspace uses `?page={n}` to match REST naming.

---

## 9. Forms & inputs

### Add User — multisite invite

| Field | Type | Required | Notes |
|---|---|---|---|
| Email or Username | email/text | yes | Auto-suggest enabled when `wp_is_large_network('users')` is false and Super Admin (controlled by `autocomplete_users_for_site_admins` filter). |
| Role | select | yes | `wp_dropdown_roles(default_role)` |
| Skip Confirmation Email | checkbox | no | Super Admin only |

### Add User — new user create (single-site)

| Field | Type | Required | Notes |
|---|---|---|---|
| Username | text (60 max, ltr, no autocapitalize, no autocorrect, autocomplete=off) | yes | Validates via `validate_username`; immutable after creation. |
| Email | email | yes | |
| First Name | text | no | |
| Last Name | text | no | |
| Website | url | no | |
| Language | select | no | from `get_available_languages()`; `site-default` option |
| Password | password (with show/hide + generate button + 24-char default) | yes | Strength meter; `wp_generate_password(24)` seed. |
| Repeat Password | password | yes (when shown) | hidden when generator is used |
| Confirm use of weak password | checkbox | conditional | required when strength is weak |
| Send User Notification | checkbox | no | "Send the new user an email about their account" |
| Role | select | no (defaults to `default_role` option) | |

### Profile / Edit User form

The form is large; key fields not already covered:

| Section | Field | Type | Required |
|---|---|---|---|
| Personal Options | Disable visual editor | checkbox | no |
| Personal Options | Disable syntax highlighting | checkbox | no |
| Personal Options | Admin color scheme | radio of named themes | no |
| Personal Options | Keyboard shortcuts | checkbox | no |
| Personal Options | Show toolbar on front | checkbox | no |
| Personal Options | Language | select | no |
| Name | Username | text (readonly) | yes (display) |
| Name | Role | select (Edit User only) | yes |
| Name | Super Admin | checkbox (network admin only) | no |
| Name | First name | text | no |
| Name | Last name | text | no |
| Name | Nickname | text | yes |
| Name | Display name publicly as | select | yes |
| Contact | Email | email | yes |
| Contact | Website | url | no |
| Contact | {custom contact methods} | text | no |
| About | Biographical info | textarea | no |
| Account | New password | password (generate/type) | no |
| Account | Repeat password | password | conditional |
| Account | Confirm use of weak password | checkbox | conditional |
| Application Passwords | New name | text | yes (within create form) |

### Save semantics

| Form | Verb / endpoint |
|---|---|
| Create user (single-site) | `POST /wp/v2/users` |
| Update user / profile | `PUT /wp/v2/users/{id}` (or `PATCH` semantics — REST accepts both) |
| Delete user with reassign | `DELETE /wp/v2/users/{id}?force=true&reassign={target_id}` |
| Bulk role change | `PUT /wp/v2/users/{id}` per user |
| Send password reset (admin-initiated) | gap — custom endpoint |
| Log out other sessions (self) | gap — custom endpoint |
| Log out all sessions (admin → other user) | gap — custom endpoint |
| Cancel pending email change (self) | gap — custom endpoint |
| Personal Options (rich_editing, admin_color, etc.) | gap — register meta or custom endpoint |
| Create app password | `POST /wp/v2/users/{id}/application-passwords` |
| Update app password | `PUT /wp/v2/users/{id}/application-passwords/{uuid}` |
| Revoke app password | `DELETE /wp/v2/users/{id}/application-passwords/{uuid}` |
| Revoke all app passwords | `DELETE /wp/v2/users/{id}/application-passwords` |
| Authorize application | non-REST (POST to `authorize-application.php`); `WP_Application_Passwords::create_new_application_password` server-side |

### Validation
Server-side (REST) is authoritative. Client-side: required fields, password match, weak-password confirmation.

---

## 10. Routing & URL state

Original wp-admin URLs:
- `/wp-admin/users.php?role={slug}`
- `?s={query}` — search
- `?paged={n}` — pagination
- `?orderby={login|email}&order={asc|desc}`
- `?action={delete|remove|resetpassword|promote}&user={id}` (or `users[]={id}` for bulk)
- `/wp-admin/user-new.php?update={add|addnoconfirmation|addexisting|...}&user_id={id}` — post-action redirect
- `/wp-admin/user-edit.php?user_id={id}&updated=true&wp_http_referer={return}`
- `/wp-admin/profile.php?updated=true`
- `/wp-admin/profile.php?newuseremail={hash}` — email-change confirmation link
- `/wp-admin/profile.php?dismiss={id}_new_email&_wpnonce={nonce}` — cancel pending email change
- `/wp-admin/authorize-application.php?app_name={name}&app_id={uuid}&success_url={url}&reject_url={url}`

Recommended workspace hash routing:
```
#/users?role=editor&search=jane&page=2
#/user-new
#/user-edit?user_id=42
#/profile
#/authorize-application?app_name=ExampleApp&app_id=abcd-1234&success_url=...
```

Browser back/forward must restore filter state. Refresh must restore. Sharing the URL must reproduce the view.

`authorize-application.php` arrives with arbitrary external `success_url` / `reject_url`; treat with care, do not validate as same-origin.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| "Add New User" | `core:user-new` | none |
| Per-row "Edit" | `core:user-edit` | user_id |
| Per-row "View" | external | author archive URL |
| Per-row "View posts" / Posts column | `core:posts` | `?author={id}` |
| Per-row "Edit comments" (custom column) | `core:comments` | `?author={id}` (if comments app supports) |
| Send password reset (success) | back to list | `?update=resetpassword` analog |
| Authorize Application "Cancel" | `reject_url` (external) | new tab or replace |
| Authorize Application "Approve" | `success_url` (external) | with credentials |
| Header avatar in toolbar (workspace-level) | `core:profile` | none |

### Inbound

- From `core:posts` filter "by author {Name}" → `core:users` filtered by id, or back to `core:user-edit`.
- From `core:comments` row → `core:user-edit`.
- From email "set new password" link → password reset screen (out of scope; auth flow).
- From OAuth-style external redirect to `authorize-application.php` → only inbound from outside the workspace.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| User invited (multisite) | Banner: "Invitation email sent to user." |
| User added (no-confirmation) | Banner with Edit link |
| User created (single-site) | Banner: "User added." |
| User deleted | Banner: "{N} user(s) deleted." |
| Bulk role changed | Banner: "{N} users' role changed." |
| Password reset email sent | Banner: "Password reset email sent." |
| Profile saved | Banner: "Profile updated." (dismissible) |
| Email change pending | Inline notice on form: "Pending change of your email to {new}." |
| Email change confirmed | Banner: "Email updated." |
| Email change cancelled | Banner: "Email change cancelled." |
| Application password created | One-time inline reveal w/ copy button + persistent until dismissed. **Critical** — never re-fetchable. |
| Application password revoked | Snackbar: "Application password revoked." |
| Application authorization approved | Browser redirect or in-page password reveal |
| Application authorization denied | Browser redirect or "Authorization rejected." |
| Self-cannot-demote | Banner error: "You cannot remove your own role." |

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `n` (when not in input) | New user |
| `↑` / `↓` | Move row focus |
| `Space` | Toggle selection |
| `Enter` | Open focused row |
| `Esc` | Cancel modal / clear selection |

### ARIA & focus

- Role tabs: `role="tablist"` with counts in accessible name.
- Form sections: `<h2>` headings; admin color scheme is a radio group with proper `<fieldset>` / `<legend>`.
- Password fields: `aria-describedby` links to strength meter (`pass-strength-result`); strength changes announced via `aria-live="polite"`.
- Application password copy: `aria-live="assertive"` for one-time reveal.
- Sessions destroy: `aria-live="assertive"` per the original `<td aria-live="assertive">`.
- Edit User form has the screen-reader-only "User updated" announcement after save.
- Authorize Application: action buttons must have unambiguous labels (Approve / Deny — not "Yes" / "No").
- Field-required indicators: `<span class="description">(required)</span>` should also map to `aria-required="true"`.

### Screen reader

- "Avatar of {name}" alt on Gravatar images.
- Bulk action results announced via live region: "Deleted 3 users."
- Email-change-pending notice announced when form loads.

---

## 14. Extension points (core hooks)

Decide for each whether to preserve, replace with workspace-level extensibility, or drop.

| Hook | Purpose | Recommendation |
|---|---|---|
| `users_list_table_query_args` | Modify user query | Replace with workspace list-query filter |
| `manage_users_columns` / `manage_users_custom_column` | Add columns | Replace with workspace field registry |
| `bulk_actions-users` | Bulk actions | Replace with workspace `actions` registry |
| `user_row_actions` | Per-row actions | Replace with `core:users.row-actions` slot (already wired in M4) |
| `restrict_manage_users` | Filter dropdowns above table | Replace with workspace filter API |
| `manage_users_extra_tablenav` | Extra table-nav UI | Replace with slot |
| `personal_options` | Append to Personal Options table | Replace with `core:profile.personal-options` slot |
| `profile_personal_options` | Self-edit only | Same |
| `show_user_profile` | After Personal Options on self | Replace with slot |
| `edit_user_profile` | After Personal Options on others | Replace with slot |
| `personal_options_update` | Pre-save self | n/a — REST handles |
| `edit_user_profile_update` | Pre-save other | n/a — REST handles |
| `user_new_form` | Inside Add User form | Replace with `core:user-new.form` slot |
| `user_edit_form_tag` | Form tag attributes | Drop |
| `user_contactmethods` (filter) | Add contact methods | Preserve via custom REST user meta registration |
| `wp_create_application_password_form` | Inside create-app-password form | Replace with `core:application-passwords.form` slot |
| `additional_capabilities_display` | Toggle Additional Capabilities visibility | Preserve |
| `enable_edit_any_user_configuration` | Multisite per-site cap gate | Preserve as a server-side check |
| `admin_color_scheme_picker` | Render color scheme radios | Replace with workspace appearance picker (fed by registered schemes) |
| `user_profile_picture_description` | Filter Gravatar caption | Drop or preserve |
| `show_password_fields` | Toggle password fields | Preserve |
| `wp_is_password_reset_allowed_for_user` | Disable reset for specific users | Preserve |

Plugin compatibility note: most useful hooks for end-user plugins are `user_row_actions`, `personal_options`, `edit_user_profile`, `show_user_profile`, `manage_users_columns`, `manage_users_custom_column`. M4 already wires `core:users.row-actions` slot. The profile-form slots are part of the v2 extensibility pass.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source `core:users`** → DataViews list (M4): list, search, role filter (single/multi), pagination, sort, bulk delete with reassign-content step, edit/view/trash actions.
- **Source `core:profile`** → `src/apps/profile/index.js`: name, email, biographical info, contact info via `useEntityRecord('root', 'user', userId)`. Optimistic edits.
- **No source for `core:user-new`, `core:user-edit`, `core:authorize-application`.**

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Role counts in filter tabs | High | 6+ HEAD requests or custom endpoint. |
| Add User (single-site create form) | High | `POST /wp/v2/users`. `send_user_notification` flag is gap. |
| Add Existing User (multisite invite) | Medium | No REST equivalent. Custom endpoint. |
| Edit User (full admin form, separate from Profile) | High | Mostly same component as Profile with extra Role field + admin sections. |
| Personal Options section | High | rich_editing / syntax_highlighting / admin_color / comment_shortcuts / show_admin_bar_front not in REST users schema. Register as `meta` or build `/wp-admin-workspaces/v1/user-prefs/{id}`. |
| Display name dropdown | Medium | Computed locally from first/last/nickname/login permutations. |
| Password change form | High | REST accepts `password`. Strength meter reproducible client-side via `zxcvbn` (already loaded as `password-strength-meter`). Generate-password helper needed. |
| Send password reset (admin-initiated) | Medium | Custom endpoint. |
| Sessions destroy (own / other) | Medium | Custom endpoint. |
| Pending email change confirmation flow (self) | Low | Custom endpoints + URL handling for `?newuseremail=` and `?dismiss=`. |
| Application Passwords create | High | One-time password reveal UX is critical. |
| Application Passwords list | High | Last-used + last-IP display. |
| Application Passwords revoke | High | Per-row + revoke-all. |
| `core:authorize-application` screen | High | Implement as a top-level workspace route (no menu entry) reachable from external redirect. Validates request, exchanges for app password, redirects to `success_url`. |
| Custom contact methods (`wp_get_user_contact_methods`) | Low | Plugin extension; preserve via custom REST user meta. |
| Multisite Super Admin badge + grant/revoke | Low | Network admin context only. |
| Multisite Skip Confirmation Email checkbox | Low | Multisite Super Admin only. |
| `core:profile.personal-options` slot for plugin extensibility | Low | v2 extensibility pass. |
| Additional Capabilities display | Low | Rare; informational. |
| Self-cannot-demote guard | Medium | Client-side preflight; server enforces too. |
| Username validation (single-site create) | Medium | `validate_username` rules. |
| Avatar / Gravatar display | n/a | Already used by ProfileApp. |
| Personal data export / erase trigger | n/a | Cross-link to `personal-data.md` (separate spec, not yet written). |
| 2FA | n/a | Not in core; out of scope. |

### Acceptable interim
- `iframe:user-new.php`, `iframe:user-edit.php?user_id={id}`, `iframe:authorize-application.php` are acceptable escape hatches for v1.
- `iframe:profile.php` is an acceptable interim if the existing `core:profile` does not yet cover Personal Options.

---

## 16. Out of scope

- **Network admin Users screen** (`network/users.php`, `WP_MS_Users_List_Table`) — separate spec.
- **Login / signup / password recovery flows** — auth concern, distinct from admin.
- **Personal data export / erase** — separate spec (`personal-data.md`).
- **Two-factor authentication** — plugin-extended; not in core.
- **Single-sign-on integrations** — plugin territory.
- **WordPress.com user identity / account linking** — out of core scope.
- **Network-only Privacy / cookie compliance UI** — separate spec.

---

## 17. Reference

- Original PHP:
  - `wp-admin/users.php`
  - `wp-admin/user-new.php`
  - `wp-admin/user-edit.php`
  - `wp-admin/profile.php` (essentially `define('IS_PROFILE_PAGE', true); require user-edit.php;`)
  - `wp-admin/authorize-application.php`
- List table:
  - `wp-admin/includes/class-wp-users-list-table.php`
  - `wp-admin/includes/class-wp-application-passwords-list-table.php`
- User CRUD:
  - `wp-admin/includes/user.php` (`edit_user`, `wp_delete_user`)
  - `wp-includes/user.php` (`wp_create_user`, `wp_update_user`, `wp_signon`, `WP_User_Query`)
  - `wp-includes/class-wp-user.php`
  - `wp-includes/class-wp-application-passwords.php`
  - `wp-includes/class-wp-session-tokens.php`
  - `wp-includes/user-functions.php` (`get_userdata`, `count_users`)
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-application-passwords-controller.php`
- REST schema reference:
  - `https://developer.wordpress.org/rest-api/reference/users/`
  - `https://developer.wordpress.org/rest-api/reference/application-passwords/`
- Capability map: `wp-includes/class-wp-roles.php`, `wp-admin/includes/capabilities.php` (`map_meta_cap` cases for `delete_user`, `edit_user`, `promote_user`, `remove_user`, `list_app_passwords`, `read_app_password`, `edit_app_password`, `delete_app_password`)
- Authorize Application validators: `wp-includes/user.php::wp_is_authorize_application_password_request_valid`
- Current workspace impls:
  - `src/apps/profile/index.js`
  - `core:users` registration in `src/runtime/registry/builtins.js`
- Cross-link: `docs/screens/posts.md` (analogous list pattern), `docs/screens/plugins.md` (analogous list-with-detail pattern), `docs/screens/personal-data.md` (privacy export/erase — pending)
