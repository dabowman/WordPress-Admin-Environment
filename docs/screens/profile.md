# Screen Spec: Profile (own profile + edit-another-user)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/profile.php` (own-profile shim), `wp-admin/user-edit.php` (the real form, shared), `wp-admin/includes/user.php` (`edit_user()` save handler), `wp-includes/user.php` (email-confirm flow + contact-method / display-name helpers)
**Current shell coverage:** `core:profile` → `src/apps/profile/index.js` (partial — a 7-field self-only `DataForm`; see "Gaps")

This spec describes the **semantic surface** of the Profile screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

Profile and its admin-facing twin Edit User are a **single template** (`user-edit.php`) that branches on whether you are editing yourself or someone else. `profile.php` is a 17-line shim that defines `IS_PROFILE_PAGE` then `require`s `user-edit.php` (`profile.php:14-17`). This spec owns the **form** surface (both branches) and the per-user account-management affordances. The surrounding users **list** + **add-user** + **authorize-application** screens live in the cluster spec `docs/screens/users.md`; the two specs deliberately overlap on the shared form and cross-reference each other. Single-site context — multisite-specific behavior (Super Admin grant, site-membership removal) is called out where relevant; network-admin-only variants are out of scope.

> **Why this exists separately from `users.md`.** The combined users cluster spec covers the form, but the **own-vs-other-user branching** and the **email pending-change confirmation flow** get only light treatment there. Those two behaviors are the security-relevant heart of the Profile screen, so they are documented in full here (§3, §4 → "Email confirmation flow", §6, §9). `users.md` remains authoritative for the list/add/authorize surfaces.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `profile` |
| Display name | "Profile" (own) / "Edit User {Name}" (another user) |
| Original URL | `/wp-admin/profile.php` (own); `/wp-admin/user-edit.php?user_id={id}` (another) |
| Menu location | Top-level "Profile" for non-admins; under Users → Profile for admins. Edit User is unmenued — reached per-row from the users list. |
| Submenu items | None |
| Parent app | `core:profile` is standalone (self-only); a future `core:user-edit` would mount under `core:users` |
| Sub-screens | Application Passwords (a section within the form, not a separate route) |

One template serves two jobs. The branch key in core is `IS_PROFILE_PAGE` (true on `profile.php`) plus `current_user_can( 'edit_users' )` / `current_user_can( 'edit_user', $user_id )`. The shell's `core:profile` only implements the own-profile branch; the edit-another-user branch has no shell home yet (see §15).

---

## 2. Purpose

Let a logged-in user manage their own account — name, contact info, bio, password, language, interface preferences, sessions, and application passwords — and let an administrator edit those same fields (plus role and capabilities) for any other user.

Jobs to be done:
- **Set how I appear** — first/last name, nickname, and the public display name.
- **Update my contact info** — email (own-profile: confirmation-gated) and website.
- **Tune my admin experience** — color scheme, visual-editor toggle, syntax highlighting, keyboard shortcuts, toolbar-on-front, interface language.
- **Manage my security** — change password, revoke other login sessions, create/revoke application passwords.
- **Write a bio** — biographical info shown publicly by some themes.
- **(Admin) Change another user's role** — promote/demote, view extra capabilities, send a password-reset link, grant Super Admin (multisite).

---

## 3. Capabilities & access

This is where own-vs-other diverges most. The same template renders a different field set depending on **who** is being edited and **who** is doing the editing.

| Action | Capability | Source |
|---|---|---|
| Edit own profile | `read` + implicitly-granted `edit_user` for self | `user-edit.php:135` |
| Edit another user (full form) | `edit_users` (general) **AND** `edit_user` for that specific id | `user-edit.php:135,194` |
| Change another user's role | `promote_users` (general) **AND** `promote_user` for that user | `user-edit.php:449-472` |
| Send another user a reset link | `edit_user` + `wp_is_password_reset_allowed_for_user( $user )` | `user-edit.php:732-752` |
| Grant / revoke Super Admin (multisite) | `manage_network_options` | `user-edit.php:474-481` |
| List own application passwords | `list_app_passwords` | `WP_REST_Application_Passwords_Controller::get_items_permissions_check` |
| Create / read / edit / delete app password | `create_app_password` / `read_app_password` / `edit_app_password` / `delete_app_password` | controller |

**Own-vs-other branching — the conditional surface:**

| Field / section | Own profile (`IS_PROFILE_PAGE`) | Editing another user |
|---|---|---|
| Personal Options (color scheme, editor toggles, language) | shown | shown (admin sets them on the target) |
| Email | shown **with confirm-by-link flow** (see §4) | shown, **writes directly** (no confirm) |
| Role select | hidden (you cannot change your own role here) | shown when editor has `promote_user` |
| "You cannot remove your own role" guard | n/a | enforced via `err_admin_role` if admin edits self through this path |
| Super Admin checkbox (multisite) | hidden | shown to network admins |
| Account Management → New Password | shown | shown |
| "Send password reset" button | hidden (own user resets via the lost-password flow) | shown to admins |
| Sessions → "Log Out Everywhere Else" | shown (destroys *other* sessions, keeps current) | "Log Out Everywhere" (destroys *all*, incl. the target's current) |
| Application Passwords | shown for self | shown for the target user |
| Additional Capabilities (read-only) | hidden | shown when caps exceed roles, gated on `additional_capabilities_display` filter |
| `show_user_profile` / `personal_options` hooks | fire | do **not** fire (only `edit_user_profile` fires) |

**Permission-denied states:**
- Lacking `edit_user` for the target id: `wp_die( 'Sorry, you are not allowed to edit this user.' )`. Shell renders a 403 inline.
- Own profile is always reachable by any logged-in user (`read`).
- Application Passwords section is hidden entirely when `wp_is_application_passwords_available_for_user( $user )` is false (no HTTPS, or disabled by filter, or Basic-Auth-protected site).

**Shell reality:** `core:profile` is **self-only by construction** — `userId` is always `window.wpAdminShell.userId` (`index.js:25`), so it always targets the acting user (effectively `/wp/v2/users/me`). REST `update_current_item_permissions_check` enforces the floor. The edit-another-user branch (role, capabilities, reset-link, Super Admin) has no shell home.

---

## 4. Data model

### Primary entity
- **Type:** user
- **REST endpoint:** `GET/POST /wp/v2/users/{id}` (or `/wp/v2/users/me` for self) via `WP_REST_Users_Controller`
- **core-data:** `useEntityRecord( 'root', 'user', userId )` (`index.js:26`)

### Fields used by the form

| Section | Field | REST path | Type | Writable via REST? | Notes |
|---|---|---|---|---|---|
| Personal Options | Disable visual editor | `meta.rich_editing` | bool (`'true'`/`'false'`) | **no** | Not in REST users schema; `edit_user()` reads `$_POST` (`includes/user.php:135`). |
| Personal Options | Disable syntax highlighting | `meta.syntax_highlighting` | bool | **no** | Shown only to code-editing caps. Same gap (`includes/user.php:136`). |
| Personal Options | Admin color scheme | `meta.admin_color` | enum | **no** | `fresh`/`light`/`modern`/`blue`/`coffee`/`ectoplasm`/`midnight`/`ocean`/`sunrise`. UI is a pure `do_action('admin_color_scheme_picker')`; no data API. |
| Personal Options | Keyboard shortcuts (comment moderation) | `meta.comment_shortcuts` | bool | **no** | `includes/user.php:141`. |
| Personal Options | Show Toolbar when viewing site | `meta.show_admin_bar_front` | bool | **no** | `includes/user.php:138`. |
| Personal Options | Interface Language | `locale` | string | **yes** | In schema + writable (`class-wp-rest-users-controller.php:1468`, `:1225`). The *language-pack download on save* sub-feature is wp-admin-only. |
| Name | Username | `username` | string | read-only | `edit` context; immutable after creation. |
| Name | First Name | `first_name` | string | yes | |
| Name | Last Name | `last_name` | string | yes | |
| Name | Nickname (required) | `nickname` | string | yes | Classic rejects empty on update (`includes/user.php:156-158`); REST does **not** enforce non-empty. |
| Name | Display name publicly as | `name` | string (select) | yes | `name` → `display_name` in `prepare_item_for_database()`. Options are a generated permutation set (see §9). |
| Contact | Email | `email` | string (email) | yes (direct) | **Own-profile: confirmation-gated in classic** (see below). REST writes `user_email` immediately. |
| Contact | Website | `url` | string (url) | yes | Classic normalizes bare host → `http://`; REST `esc_url_raw` does not prepend a scheme. |
| Contact | Custom contact methods | `meta.{name}` | string | **no** | Pure `apply_filters('user_contactmethods')` output; never `register_meta`'d, so invisible to REST. |
| About | Biographical Info | `description` | string (textarea) | yes | |
| About | Profile Picture / Gravatar | `avatar_urls` | object | read-only | `{ "24","48","96": URL }`. Editing is external (Gravatar). |
| Account | New Password | `password` | string (write-only) | yes | REST accepts any non-`\` string; no pass1/pass2 match, no strength gate, no current-password re-auth. |
| Account | Sessions | (computed) `WP_Session_Tokens` | int | **no** | No REST surface for the count or for destruction. |
| Account | Application Passwords | `/wp/v2/users/{id}/application-passwords` | nested resource | yes | Separate controller — full CRUD (see below). |
| Other-user only | Role | `roles` | string[] | yes | `check_role_update` (`:1230`, `:1257`). |
| Other-user only | Additional Capabilities | `capabilities` / `extra_capabilities` | object | read-only | `:1514-1525`. |
| Other-user only | Super Admin (multisite) | `grant_super_admin` | bool | **no** | Network-admin context; not REST-exposed. |

### Email confirmation flow (own profile) — documented in full

This is the single most security-relevant divergence and the reason Profile warrants its own spec.

**Classic (own profile):**
1. User types a new email and submits. `send_confirmation_on_profile_email()` (`wp-includes/user.php:3845`), hooked to `personal_options_update` (`admin-filters.php:127`), intercepts the save.
2. The new address is **not** written to `user_email`. Instead it is staged in the `_new_email` user meta (`{ hash, newemail }`) and a confirmation link is emailed to the **new** address.
3. While staged, the form shows an inline notice: *"There is a pending change of your email to {new}."* with a **Cancel** link (`user-edit.php:559-594`).
4. The address activates only when the recipient clicks the link → `profile.php?newuseremail={hash}` → core verifies the hash, copies `newemail` into `user_email`, and clears the staging meta (`user-edit.php:107-129`).
5. Cancel: `profile.php?dismiss={user_id}_new_email&_wpnonce={nonce}` deletes the `_new_email` meta.

**Editing another user (admin):** no confirmation — the admin's save writes `user_email` directly. The confirm flow is own-profile-only.

**REST / shell reality:** `POST /wp/v2/users/me { email }` writes `user_email` **immediately** — `personal_options_update` never fires over REST, there is no `_new_email` staging, no confirmation email, and no Cancel affordance. There is **no REST endpoint** to initiate, confirm, or cancel a staged email change. *Consequence:* in the shell, anyone with an open authenticated session can change the account email instantly, with no second-factor email confirmation — both a parity gap and a security-posture regression versus classic own-profile. This is a hard upstream blocker (the REST users controller would need to route own-email writes through the confirm flow, or expose a dedicated endpoint).

### Application Passwords data model

Nested resource under `users`. Reachable today — **not** blocked.

- **Endpoint:** `/wp/v2/users/{user_id}/application-passwords` (`{user_id}` may be numeric or `me`)
- **Controller:** `WP_REST_Application_Passwords_Controller`

| Field | Type | Notes |
|---|---|---|
| `uuid` | string | server-generated id |
| `app_id` | string | optional UUID v5 from the app |
| `name` | string | required label (e.g. "iPhone Calendar") |
| `password` | string | returned **once** in the create response (`controller:625`) — never re-fetchable |
| `created` | datetime (GMT) | read-only |
| `last_used` | datetime / null | read-only |
| `last_ip` | string / null | read-only |

Routes: `GET` (list), `POST` (create — response includes `password` once), `GET/PUT/DELETE .../{uuid}` (single read / rename / revoke), `DELETE` (revoke all), `GET .../introspect` (the calling app introspects itself).

### Aggregate / external data
- **Available languages:** `wp_get_available_translations()` + `get_available_languages()` (PHP). No REST endpoint — needs a shell preload/custom surface to populate the language select.
- **Admin color schemes:** `$_wp_admin_css_colors` PHP global; no REST surface. The picker row only renders when `count($_wp_admin_css_colors) > 1`.
- **Session count:** `WP_Session_Tokens::get_all()` — no REST surface.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Profile" / "Edit User {Name}")                   │
├─────────────────────────────────────────────────────────────┤
│ PERSONAL OPTIONS                                             │
│  ├─ Disable visual editor          [checkbox]                │
│  ├─ Disable syntax highlighting    [checkbox; code caps]     │
│  ├─ Admin color scheme             [radio swatches; >1 only] │
│  ├─ Keyboard shortcuts             [checkbox]                │
│  ├─ Show Toolbar on front          [checkbox]                │
│  └─ Interface Language             [select]                  │
├─────────────────────────────────────────────────────────────┤
│ NAME                                                         │
│  ├─ Username                       [readonly]                │
│  ├─ Role           (other-user only, when promote_user)      │
│  ├─ Super Admin    (multisite network admin only)            │
│  ├─ First Name                     [text]                    │
│  ├─ Last Name                      [text]                    │
│  ├─ Nickname (required)            [text]                    │
│  └─ Display name publicly as       [select; permutations]    │
├─────────────────────────────────────────────────────────────┤
│ CONTACT INFO                                                 │
│  ├─ Email   [email; own-profile shows pending-change notice] │
│  ├─ Website                        [url]                     │
│  └─ {custom contact methods}       [text rows]               │
├─────────────────────────────────────────────────────────────┤
│ ABOUT YOURSELF / ABOUT THE USER                              │
│  ├─ Biographical Info              [textarea]                │
│  └─ Profile Picture (Gravatar)     [read-only avatar + link] │
├─────────────────────────────────────────────────────────────┤
│ ACCOUNT MANAGEMENT                                           │
│  ├─ New Password (generate/type) + Repeat + weak confirm     │
│  ├─ Send Reset Link    (other-user only, admin)              │
│  └─ Sessions: Log Out Everywhere [Else]                      │
├─────────────────────────────────────────────────────────────┤
│ APPLICATION PASSWORDS                                        │
│  ├─ Create: name input + Add Application Password            │
│  ├─ One-time reveal of the new password (copy)               │
│  └─ List: name | created | last used | last IP | Revoke      │
│       + Revoke All                                           │
├─────────────────────────────────────────────────────────────┤
│ ADDITIONAL CAPABILITIES   (other-user only; rare)            │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Update Profile / Update User                             │
└─────────────────────────────────────────────────────────────┘
```

The shell `core:profile` renders only: a heading, then a `DataForm` covering **First/Last Name, Nickname, Display Name, Email, Website, Biographical Info**, then a single Save button (`index.js:129-156`). Everything else above is absent.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch / `!record` | Skeleton form (classic) / centered `<Spinner/>` (shell, `index.js:121-127`) |
| Idle | Loaded, no edits | Inputs reflect server; Save disabled (shell: `!hasEdits`) |
| Editing | Any field changed | Save enabled |
| Saving | Save in flight | Save busy (shell: `loading` + `disabled`) |
| Saved (success) | Save resolves | Classic: `?updated` banner "Profile updated."; shell: success snackbar via `useEntitySave` |
| Save error | REST 4xx/5xx | Classic: per-field `WP_Error` list; shell: single error banner (`err.message`) |
| **Email change pending (own profile)** | `_new_email` meta set | Inline notice "There is a pending change of your email to {new}." + Cancel link. **Shell: not surfaced** (no REST staging). |
| Editing super admin (multisite network) | `is_super_admin( target )` | Top banner: "This user has super admin privileges." |
| App passwords unsupported | `wp_is_application_passwords_available_for_user()` false | Section hidden + explanatory paragraph (no HTTPS / disabled) |
| App password just created | After `POST` | One-time reveal with copy button — never re-fetchable |
| Permission denied | `edit_user` fails (other-user) | Classic `wp_die`; shell guards only missing `userId` global ("Profile unavailable: missing user context", `index.js:108-119`), not a server 403 — which core-data surfaces as a perpetual spinner |

---

## 7. Actions

| Action | Cap | Type | Behavior |
|---|---|---|---|
| Update Profile / Update User | `edit_user` for target | Mutation (blocking) | `POST /wp/v2/users/{id}` with the changed-field diff. Shell: async `save()`, disabled until `hasEdits`. |
| Generate password | none (client) | Helper | `wp_generate_password(24)` seed populates the field; user can edit. |
| Cancel password change | none | Helper | Clears password fields; nothing sent on save. |
| Send Reset Link (other-user) | `edit_user` + `wp_is_password_reset_allowed_for_user` | Mutation | **Gap in REST** — classic uses admin-ajax `send-password-reset` / `retrieve_password()`. Needs a shell proxy endpoint. |
| Log Out Everywhere Else (own) | `read` | Mutation | **Gap in REST** — admin-ajax `destroy-sessions` → `WP_Session_Tokens::destroy_others()`. Destroys *other* sessions, keeps current. |
| Log Out Everywhere (other-user) | `edit_user` | Mutation | Same gap; `destroy_all()` — logs the target out everywhere including their current session. |
| Add Application Password | `create_app_password` | Mutation | `POST .../application-passwords { name, app_id? }`. Response **once** includes `password` — display + copy immediately, store nothing. |
| Revoke Application Password | `delete_app_password` | Mutation | `DELETE .../application-passwords/{uuid}`. Irreversible. |
| Revoke All Application Passwords | `delete_app_passwords` | Mutation | `DELETE .../application-passwords`. |
| Cancel pending email change (own) | none | Mutation | **Gap in REST** — `?dismiss={id}_new_email`; deletes `_new_email` meta. |

### Optimistic vs. blocking
- **Profile update** — blocking; full form save.
- **Password / app-password create / revoke** — blocking. Create reveals the password once; revoke is irreversible.
- **Sessions destroy** — blocking with explicit confirmation.

---

## 8. Filters, sort, search, pagination

N/A for the form itself. The **Application Passwords** sub-section is a small list (name / created / last used / last IP) but is not filtered, sorted, or paginated in core — it renders as a plain table with a Revoke action per row and a Revoke-All button.

---

## 9. Forms & inputs

The form is the screen. Field shapes (the not-already-covered semantics):

### Display name publicly as (the only non-trivial control)
- Type: `select` constrained to a generated permutation set — there is no free-text entry.
- **Classic** (`user-edit.php:521-551`) builds options keyed `display_nickname, display_username, [display_firstname], [display_lastname], [display_firstlast], [display_lastfirst]`, then **prepends** the current `display_name` only if not already present, then `array_map('trim')` + `array_unique`. Nickname leads; the current value surfaces first only when distinct.
- **Shell** (`index.js:37-77`) pushes in order `username, first_name, last_name, first+last, last+first, nickname, name` (current value **last**), deduping by value. *Divergence:* different ordering (username first vs. nickname first) and the current `name` lands at the end rather than the front — so the pre-selected entry can differ between the two UIs for the same record.
- **"Trapped select" caveat:** when the name parts collapse to a single option, the select still renders and offers no other choice (matches classic in spirit). DataForm has no "free-text-or-pick" combo to mirror that display-name is *constrained* to permutations — acceptable.

### Email (own profile)
- Type: `email`. Own-profile is **confirmation-gated** — see §4. `aria-describedby="email-description"` links the confirm-by-link explanation. The shell omits this descriptive text and writes directly.

### Website
- Type: `url` in classic (normalizes bare host → `http://`); the shell uses a plain `text` control and sends whatever is typed. `example.com` saves as `example.com` (no scheme) in the shell vs. `http://example.com` classic — different stored value; can break author-link rendering.

### Nickname
- Required in classic (rejected empty on update, `includes/user.php:156-158`). The shell neither marks it required nor sets `aria-required`, and REST does not enforce non-empty — so a blank nickname can save via the shell where classic blocks it.

### New Password (Account Management)
- Generate (`wp_generate_password(24)`), show/hide, pass1/pass2 match, weak-password confirm checkbox, and a zxcvbn strength meter — **all client-side in classic**. REST `password` accepts any non-`\` string with no match/strength/confirm gate and no current-password re-auth. A basic password field + client-side confirm/meter is buildable shell-side (B9 is not a hard blocker).

### Save semantics
- Single Save (classic: `submit_button('Update Profile')`, full POST + redirect; shell: async `save()`).
- Diff-based — only changed fields submitted.
- Server-side (REST / `edit_user()`) validation is authoritative.

### DataForm note (shell)
The app uses `DataForm` from `@wordpress/dataviews/wp` idiomatically (`data={editedRecord}` + `onChange={edit}`). The `fields` array is `useMemo`'d on five specific `editedRecord.*` keys with an `eslint-disable react-hooks/exhaustive-deps` (`index.js:99-106`) — a deliberate perf hedge so rebuilding the field controls doesn't fire on every unrelated keystroke. It does **not** reuse `_shared/forms/EntityDataForm.js` because it needs the dynamic display-name options. Personal Options would be a reasonable DataForm fit **if** the underlying meta were REST-exposed (blockers below); Application Passwords should **not** be a DataForm — it's a list-of-records CRUD with a create-once-reveal flow, closer to the six entity-CRUD apps in `src/apps/_shared/dataviews/`.

---

## 10. Routing & URL state

Original wp-admin URLs:
- `/wp-admin/profile.php` — own profile
- `/wp-admin/profile.php?updated=true` — post-save
- `/wp-admin/profile.php?newuseremail={hash}` — confirm pending email change
- `/wp-admin/profile.php?dismiss={id}_new_email&_wpnonce={nonce}` — cancel pending email change
- `/wp-admin/user-edit.php?user_id={id}&updated=true&wp_http_referer={return}` — edit another user

Recommended shell hash routing:
```
#/profile
#/user-edit?user_id=42         (future core:user-edit)
```

The own-profile route carries no state. The email-confirm (`?newuseremail=`) and cancel (`?dismiss=`) deep-links have no shell equivalent (no REST staging flow). Refresh and back/forward must restore the form's loaded state.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| "change on Gravatar" link | external (gravatar.com) | new tab |
| Pending email confirm/cancel link (own) | `profile.php` redirect → returns here | hash + nonce |

### Inbound
- Header avatar in the shell toolbar → `core:profile`.
- Command palette / user menu → `core:profile`.
- (Future) per-row "Edit" from `core:users` → `core:user-edit?user_id={id}`.
- From a "set new password" email link → password-reset screen (auth flow, out of scope).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Profile saved | Classic: dismissible banner "Profile updated." Shell: success snackbar (`useEntitySave`). |
| Save error | Classic: per-field `WP_Error` list. Shell: single dismissible error banner. |
| Email change pending (own) | Inline notice "There is a pending change of your email to {new}." + Cancel. **Shell: absent.** |
| Email change confirmed | Banner "Email updated." (after the confirm-link redirect) |
| Email change cancelled | Banner "Email change cancelled." |
| Application password created | One-time inline reveal + copy button; persistent until dismissed. **Critical — never re-fetchable.** |
| Application password revoked | Snackbar "Application password revoked." |
| Self-cannot-demote (admin editing self via edit-user) | Banner error "You cannot remove your own role." |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `Cmd/Ctrl+S` | Save (when changes pending) |
| `Space` | Toggle a checkbox / select a radio (Personal Options, color scheme) |
| `↑` / `↓` in radio group | Move between admin color schemes |

### ARIA & focus
- Section headings are `<h2>`; the admin color scheme is a radio group with proper `<fieldset>`/`<legend>`.
- Password fields: `aria-describedby` to the strength meter (`pass-strength-result`); strength changes announced via `aria-live="polite"`.
- Email field (own): `aria-describedby="email-description"` for the confirm-by-link explanation; the pending-change notice uses a live region so it is announced on load.
- Application password copy: `aria-live="assertive"` for the one-time reveal.
- Sessions destroy: `aria-live="assertive"` (mirrors the original `<td aria-live="assertive">`).
- Required-field indicators: "(required)" on Nickname + Email should also map to `aria-required="true"`.
- Gravatar `<img>`: "Avatar of {name}" alt.

**Shell gaps:** DataForm fields are not marked required; no `aria-required` on Nickname/Email; no descriptive text / live region on the email field; no help-tab equivalent (classic ships a 7-paragraph overview help tab at `user-edit.php:60-74`).

---

## 14. Extension points (core hooks)

Decide for each whether to preserve, replace with a shell slot, or drop.

| Hook | Purpose | Recommendation |
|---|---|---|
| `personal_options` | Append to Personal Options table | Replace with `core:profile.personal-options` slot |
| `profile_personal_options` | Self-edit only | Same |
| `show_user_profile` | After Personal Options on **self** | Replace with slot (own-profile only) |
| `edit_user_profile` | After Personal Options on **others** | Replace with slot (other-user only) |
| `personal_options_update` / `edit_user_profile_update` | Pre-save self / other | n/a — REST handles the write (note: this is exactly why the email-confirm flow doesn't fire over REST) |
| `user_contactmethods` (filter) | Add contact-method fields | Preserve via custom REST user-meta registration (B3) |
| `wp_create_application_password_form` | Inside the create-app-password form | Replace with `core:application-passwords.form` slot |
| `additional_capabilities_display` | Toggle Additional Capabilities visibility | Preserve as a server-side check |
| `admin_color_scheme_picker` | Render color-scheme radios | Replace with a shell appearance picker fed by registered schemes |
| `user_profile_picture_description` | Filter the Gravatar caption | Drop or preserve |
| `show_password_fields` | Toggle password fields | Preserve |
| `wp_is_password_reset_allowed_for_user` | Disable reset for specific users | Preserve |
| `enable_edit_any_user_configuration` | Multisite per-site cap gate | Preserve as a server-side check |

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:profile` → `src/apps/profile/index.js` — a self-only `DataForm` over `useEntityRecord('root','user', userId)` covering **first_name, last_name, nickname, name (display), email, url, description**. Optimistic edits; success snackbar + error banner via `useEntitySave`; declares `core:dirty-state` so the sibling NavigationGuard reads `hasEdits`.
- **No source for the edit-another-user branch** (role, capabilities, Super Admin, reset-link).

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Application Passwords (list / add-with-once-reveal / revoke / revoke-all) | **High** | The single biggest **unbuilt-but-reachable** feature. Full CRUD controller exists. Use `api-fetch` (the one-time `password` needs imperative handling), consider a `DataViews` list. **Shell-side, no upstream change.** |
| Interface Language (`locale`) field | High | In REST, writable; trivially added to the existing `DataForm`. Needs a language-list preload surface. Language-pack-download-on-save stays wp-admin-only. **Shell-side.** |
| Basic password-change field (+ client confirm + strength meter) | High | `password` is REST-writable; document no current-password re-auth + no server weak-gate. **Shell-side** (B9 not a hard blocker). |
| Username (read-only) + avatar/Gravatar (read-only) display | Medium | Cheap parity wins; both REST-readable. **Shell-side.** |
| Personal Options (color scheme, editor toggles, shortcuts, toolbar) | Medium | Blocked — meta not in REST. **B1–B2:** [upstream] `register_meta(... show_in_rest ...)`, **or** [shell] bridge through `WP_Admin_Shell_Prefs_REST` to `update_user_meta`. |
| **Email pending-change confirmation flow + Cancel** | Medium | **B4** — own-email REST writes are immediate, bypassing the confirm-by-link safeguard. Security-relevant. [upstream] to route through the flow; **document loudly now**. |
| Field-level error mapping | Medium | Map `WP_Error` `data.params` to per-field messages instead of one banner. **Shell-side.** |
| Nickname-required + URL normalization | Medium | Mark required + normalize bare host on save. **Shell-side.** |
| Plugin contact methods → REST | Low | **B3** — core auto-registration is the clean fix. [upstream] preferred. |
| Session "Log Out Everywhere Else" | Low | **B5** — no REST endpoint over `WP_Session_Tokens`. [upstream] blocked. |
| Send password-reset link (admin → user) | Low | **B6** — admin-ajax only; also moot until an edit-other flow exists. [upstream]. |
| Edit-another-user flow (role, capabilities) | — | The entire admin-editing-another-user half of `user-edit.php` has no home. Belongs in a new `core:user-edit` under `core:users` with `edit_user`/`promote_user` gating; `roles` is REST-writable. **Shell-side (large).** |
| Help tab | Low | No engine help-tab surface; cross-cutting shell gap. |

### API & platform blockers (summary)

The hard blockers — what classic does that the shell **cannot** do through REST / `@wordpress/core-data` today (full evidence in `docs/parity/profile.md`):

- **B1** Admin color scheme — `admin_color` meta has no `show_in_rest`; picker is a pure `do_action` with no data API.
- **B2** Personal Options prefs (`rich_editing`, `syntax_highlighting`, `comment_shortcuts`, `show_admin_bar_front`) — user meta, none `show_in_rest`.
- **B3** Plugin contact methods — `user_contactmethods` filter output, never `register_meta`'d.
- **B4** Email pending-change confirmation flow — hooked to `personal_options_update`, which does not fire on REST writes; no staging/confirm/cancel endpoint. **Security-relevant.**
- **B5** Session destruction — admin-ajax `destroy-sessions`; no REST surface for tokens or count.
- **B6** Admin-initiated password reset — admin-ajax `send-password-reset`.
- **B7** Avatar upload — `avatar_urls` read-only; Gravatar is external.
- **B8** Super Admin grant + create-time new-user-email toggle — not REST-exposed.
- **B9** Weak-password confirm + strength meter — client-side-only in classic; REST accepts any string. (Buildable shell-side; flagged for completeness, not a hard blocker.)

**Not blockers (buildable shell-side):** Application Passwords (full CRUD), Interface Language (`locale`), basic password change, role write + capabilities read (for a future edit-other flow), username + avatar display.

### Acceptable interim
`iframe:profile.php` is an acceptable escape hatch for a shell needing full parity until Personal Options / Application Passwords are built natively.

---

## 16. Out of scope

- **Users list / Add User / Authorize Application** — covered by `docs/screens/users.md` (this spec owns only the form + per-user account management).
- **Network admin Users screen** (`network/users.php`) — separate spec.
- **Login / signup / password-recovery flows** — auth concern, distinct from admin.
- **Personal data export / erase** — separate spec (`docs/screens/personal-data.md`).
- **Two-factor authentication** — plugin-extended; not in core.
- **WordPress.com identity / account linking** — out of core scope.

---

## 17. Reference

- Original PHP:
  - `wp-admin/profile.php` (own-profile shim — `define('IS_PROFILE_PAGE', true); require user-edit.php;`)
  - `wp-admin/user-edit.php` (the shared form, ~1025 lines)
  - `wp-admin/includes/user.php` → `edit_user( $user_id )` (the authoritative save handler)
  - `wp-includes/user.php` (`send_confirmation_on_profile_email`, `wp_get_user_contact_methods`, display-name + locale helpers)
  - `wp-admin/includes/misc.php` → `admin_color_scheme_picker()`
  - `wp-admin/includes/ajax-actions.php` → `wp_ajax_destroy_sessions()`
- List table (Application Passwords): `wp-admin/includes/class-wp-application-passwords-list-table.php`
- REST controllers:
  - `wp-includes/rest-api/endpoints/class-wp-rest-users-controller.php`
  - `wp-includes/rest-api/endpoints/class-wp-rest-application-passwords-controller.php`
- REST API reference:
  - `https://developer.wordpress.org/rest-api/reference/users/`
  - `https://developer.wordpress.org/rest-api/reference/application-passwords/`
- Current shell impl: `src/apps/profile/index.js` (+ `app.json` / `app.md`)
- Parity audit (full evidence, divergences, blockers): `docs/parity/profile.md`
- Cross-link: `docs/screens/users.md` (list / add / authorize cluster), `docs/screens/settings-general.md` (the analogous admin-email confirm-flow gap), `docs/screens/personal-data.md` (privacy export/erase)
</content>
</invoke>
