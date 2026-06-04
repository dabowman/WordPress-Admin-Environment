# Parity: User Profile (core:profile)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: `src/apps/profile/`. Classic counterpart: `wp-admin/profile.php` (own profile) + `wp-admin/user-edit.php` (admin editing another user) + `wp-admin/includes/user.php` (`edit_user()`) + `wp-includes/user.php` (helpers, email-confirm flow).

## Verdict

**Major gaps.** The workspace's `core:profile` is a deliberately minimal 7-field form (first name, last name, nickname, display name, email, website, bio) over `useEntityRecord('root','user', userId)`. The classic Profile screen is one of the densest forms in wp-admin: it has **five section groups** (Personal Options, Name, Contact Info, About Yourself, Account Management) plus, on `user-edit.php`, Role / Additional Capabilities / new-user email. The workspace omits all of Personal Options (admin color scheme, keyboard shortcuts, toolbar-on-front, disable visual/syntax-highlight, **interface language**), all of Account Management (password change, Log Out Everywhere Else, Application Passwords), the email pending-change confirmation flow, plugin-added contact methods, the avatar/Gravatar block, and the entire admin-editing-another-user path (role, capabilities). Several omissions are genuine **REST/platform blockers** ([upstream]): the Personal Options prefs (`admin_color`, `rich_editing`, `syntax_highlighting`, `comment_shortcuts`, `show_admin_bar_front`) are user meta with no `show_in_rest`; session destruction is admin-ajax-only; the email-confirm flow is wired to a wp-admin POST action and never fires over REST. But the largest single gap — **Application Passwords** — is *not* blocked (`/wp/v2/users/<id>/application-passwords` is a complete CRUD controller); it's simply unbuilt. `name` (display), `first/last/nickname`, `email`, `url`, `description`, `password`, `roles`, and `locale` are all writable via REST today, so most of the form is reachable; the app just doesn't surface it.

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/profile.php` (own profile) — a 17-line shim that defines `IS_PROFILE_PAGE` then `require`s `user-edit.php` (`profile.php:14-17`).
  - `wp-admin/user-edit.php` — the real form (1025 lines). One template serves both own-profile and edit-another-user, branching on `IS_PROFILE_PAGE` / `current_user_can('edit_users')`.
  - `wp-admin/includes/user.php` → `edit_user( $user_id )` (`user.php:30-250`) — the authoritative save handler. Enumerates every processed field: role, email, url, first/last/nickname, display_name, description, contact methods, locale, rich_editing, syntax_highlighting, admin_color, show_admin_bar_front, comment_shortcuts, use_ssl, pass1/pass2.
  - No list-table for the form itself; the **Application Passwords** sub-block uses `WP_Application_Passwords_List_Table` (`user-edit.php:867-870`).
  - Email pending-change: `send_confirmation_on_profile_email()` (`wp-includes/user.php:3845`), hooked to `personal_options_update` (`wp-admin/includes/admin-filters.php:127`); confirmation execution in `user-edit.php:107-129`.
  - Admin color scheme: `admin_color_scheme_picker()` (`wp-admin/includes/misc.php:1004`), hooked to the `admin_color_scheme_picker` action by default (`wp-admin/includes/admin-filters.php:43`); the table row only renders if `count($_wp_admin_css_colors) > 1 && has_action('admin_color_scheme_picker')` (`user-edit.php:334`).
  - Session destruction: `wp_ajax_destroy_sessions()` (`wp-admin/includes/ajax-actions.php` ~`3985-4012`), admin-ajax action `destroy-sessions`.
- **REST / core-data surface the workspace app uses:**
  - `useEntityRecord('root','user', userId)` → `GET/POST /wp/v2/users/<id>` (`WP_REST_Users_Controller`). `userId` is `window.wpAdminWorkspaces.userId` (`src/apps/profile/index.js:25`), so it always targets the acting user — effectively `/wp/v2/users/me`.
  - Writes `first_name`, `last_name`, `nickname`, `name`, `email`, `url`, `description` (all in the REST schema; see `class-wp-rest-users-controller.php:1419-1461`). `name` maps to `display_name` in `prepare_item_for_database()` (`class-wp-rest-users-controller.php:1197-1199`).
- **Project screen spec:** `docs/screens/profile.md` — the dedicated Tier-2 Profile spec (own profile + edit-another-user form + per-user account management; own-vs-other branching and the email-confirm flow covered in full). `docs/screens/users.md` remains the cluster spec for the list + add-user + authorize-application surfaces; the two overlap on the shared edit/profile form and cross-reference each other. (Recommendation #12 below — now resolved.)

## Feature parity matrix

Status legend: full / partial / missing / blocked.

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| **Section: Personal Options** | | | | |
| Disable visual editor | Checkbox `rich_editing` ('true'/'false' meta) (`user-edit.php:299-308`) | absent | missing-blocked | `rich_editing` meta not in REST schema; `edit_user()` reads `$_POST['rich_editing']` (`includes/user.php:135`). [upstream] or [workspace] register_meta. |
| Disable syntax highlighting | Checkbox `syntax_highlighting`, shown only to code-editing caps (`user-edit.php:323-332`) | absent | missing-blocked | `syntax_highlighting` meta not in REST (`includes/user.php:136`). [upstream]/[workspace]. |
| Admin color scheme picker | Radio swatches via `admin_color_scheme_picker` action; row gated on >1 scheme (`user-edit.php:334-354`, `misc.php:1004`) | absent | blocked | `admin_color` is user meta, **not** in REST users schema; UI is a pure `do_action` emitting HTML + a nonce'd `save-color-scheme` ajax. No data endpoint. [upstream] (expose meta) and [workspace] (build picker). |
| Keyboard shortcuts (comment moderation) | Checkbox `comment_shortcuts` (`user-edit.php:357-367`) | absent | missing-blocked | `comment_shortcuts` meta not in REST (`includes/user.php:141`). [upstream]/[workspace]. |
| Show Toolbar when viewing site | Checkbox `admin_bar_front` → `show_admin_bar_front` meta (`user-edit.php:369-377`) | absent | missing-blocked | `show_admin_bar_front` meta not in REST (`includes/user.php:138`). [upstream]/[workspace]. |
| Interface Language | `wp_dropdown_languages` select; can trigger language-pack download (`user-edit.php:379-412`) | absent | partial-missing | `locale` **is** in REST schema (`class-wp-rest-users-controller.php:1468`) and writable (`prepare_item_for_database` line 1225). Reachable today; workspace just doesn't render it. Language-pack install on save is wp-admin-only ([upstream] for that sub-feature). |
| `personal_options` / `profile_personal_options` hooks | Plugin extension point (`user-edit.php:414-438`) | absent | missing | No equivalent extension seam in the workspace form. |
| **Section: Name** | | | | |
| Username (read-only) | `<input readonly>` + "Usernames cannot be changed" (`user-edit.php:444-447`) | absent | missing | `username` is in REST (`edit` context, readonly-ish). Workspace shows no username at all. Low-stakes but a parity gap. |
| First Name | text (`user-edit.php:483-492`) | text field `first_name` (`index.js:57-60`) | full | |
| Last Name | text (`user-edit.php:494-503`) | text field `last_name` (`index.js:61-65`) | full | |
| Nickname (required) | text, marked required (`user-edit.php:505-514`) | text field `nickname` (`index.js:66-70`) | partial | Workspace does not mark required nor validate non-empty; `edit_user()` rejects empty nickname on update (`includes/user.php:156-158`) but REST `update_item` does not enforce it, so a blank nickname can save via the workspace where it can't via classic. |
| Display name publicly as | `<select>` of permutations: nickname, username, first, last, first+last, last+first, current display (`user-edit.php:516-553`) | `<select>` `name` with generated options (`index.js:37-77`) | partial | See Functional divergences — option-set ordering differs, dedup differs, and the workspace can render a select that traps the user. |
| **Section: Contact Info** | | | | |
| Email | type=email; **own-profile shows confirm-by-link notice**; pending-change inline notice + Cancel link (`user-edit.php:559-594`) | type=email `email` (`index.js:78-82`) | partial-blocked | REST writes email **directly** (no confirm). The confirmation flow + pending-change banner + Cancel are wp-admin-only (`send_confirmation_on_profile_email` on `personal_options_update`). See blockers. |
| Website | type=url (`user-edit.php:596-599`) | text field `url` (`index.js:83-87`) | partial | `url` is in REST and writable. Workspace uses `type: 'text'` not a URL control; classic normalizes bare host → `http://` (`includes/user.php:83-90`), workspace does not. |
| Plugin contact methods (`user_contactmethods`) | Dynamic rows per filter (`user-edit.php:601-624`); each label filterable via `user_{$name}_label` | absent | blocked | Contact methods are pure `apply_filters('user_contactmethods')` output (`wp-includes/user.php:3035`), **never** `register_meta`'d, so they're invisible to the REST users schema. [upstream] to bridge to REST. |
| **Section: About Yourself** | | | | |
| Biographical Info | textarea, "may be shown publicly" (`user-edit.php:630-634`) | textarea `description`, rows 5 (`index.js:88-93`) | full | |
| Profile Picture / Gravatar | `get_avatar()` render + "change on Gravatar" link, gated on `show_avatars` option (`user-edit.php:636-668`) | absent | missing-blocked | `avatar_urls` is read-only in REST (`class-wp-rest-users-controller.php:1544`). Display is buildable [workspace]; editing is inherently external (Gravatar). [upstream]/external for upload. |
| `user_profile_picture_description` filter | Plugin extension point (`user-edit.php:654-663`) | absent | missing | No seam. |
| **Section: Account Management** | | | | |
| New Password (generate + Set New Password) | Button reveals generated 24-char pw, show/hide, cancel, pass2 confirm, weak-password checkbox (`user-edit.php:688-728`) | absent | partial-blocked | `password` **is** writable via REST (`class-wp-rest-users-controller.php:1505`, set in `prepare_item_for_database` line 1188). So a basic password field is buildable [workspace]. But the **weak-password confirm gate, pass1/pass2 match, and zxcvbn strength meter** are classic-form-only; REST accepts any password (only rejects `\`, see `check_user_password`). No current-password re-auth on either side. |
| Send Reset Link (admin → other user) | Button, admin-only, ajax `send-password-reset` (`user-edit.php:732-752`) | absent | missing-blocked | Reset-link generation is admin-ajax (`send-password-reset`), not REST. [upstream]. Also moot since workspace has no edit-other-user path. |
| Sessions: Log Out Everywhere Else | Button → admin-ajax `destroy-sessions` → `$sessions->destroy_others()` (`user-edit.php:754-787`, `ajax-actions.php` `wp_ajax_destroy_sessions`) | absent | blocked | **No REST endpoint** for session tokens; admin-ajax only. [upstream]. Count of sessions also has no REST surface. |
| Application Passwords: list | `WP_Application_Passwords_List_Table` (`user-edit.php:865-871`) | absent | missing | **Not blocked.** `GET /wp/v2/users/<id>/application-passwords` exists (`class-wp-rest-application-passwords-controller.php:40-43`). Buildable [workspace]. |
| Application Passwords: add | "New Application Password Name" + Add button; reveals plaintext once (`user-edit.php:833-852`, JS template `tmpl-new-application-password` 992-1018) | absent | missing | **Not blocked.** `POST .../application-passwords` returns `password` once (`controller:625`). Buildable [workspace]. |
| Application Passwords: revoke / revoke-all | List-table row Revoke + Revoke-all | absent | missing | **Not blocked.** `DELETE .../application-passwords/<uuid>` (single) + `DELETE .../application-passwords` (all) (`controller:52-54, 95-97`). Buildable [workspace]. |
| App-passwords availability gating | `wp_is_application_passwords_available_for_user()`, HTTPS-required, Basic-Auth-incompatible notices (`user-edit.php:790-883`) | absent | missing | Controller enforces caps server-side; workspace would need to mirror availability checks for UX. |
| `wp_create_application_password_form` hook | Plugin extension point (`user-edit.php:840-849`) | absent | missing | No seam. |
| **Section: edit-other-user only (`user-edit.php`)** | | | | |
| Role select | `wp_dropdown_roles` gated on `promote_user` cap (`user-edit.php:449-472`) | absent | missing | `roles` is writable via REST with `check_role_update` (`class-wp-rest-users-controller.php:1230, 1257`). Buildable [workspace] but belongs in `core:users` edit-other flow, which doesn't exist (profile is self-only). |
| Additional Capabilities (read) | Lists extra caps when caps > roles, gated on `additional_capabilities_display` filter (`user-edit.php:929-957`) | absent | missing | `capabilities` + `extra_capabilities` are readonly in REST (`class-wp-rest-users-controller.php:1514-1525`). Display buildable [workspace]; editing not exposed. |
| Super Admin grant (multisite network admin) | Checkbox (`user-edit.php:474-481`) | absent | missing-blocked | `grant_super_admin` is not REST-exposed; network-admin context. [upstream]. |
| "Send the new user an email" | `send_user_notification` checkbox on **user-new.php** create flow (`includes/user.php:236`) | absent | missing | Belongs to user-creation (`core:users`/user-new), not the profile editor. REST `create_item` does not expose the notify toggle. [upstream] for the toggle. |
| **Cross-cutting** | | | | |
| Save / submit | `submit_button('Update Profile')`, full POST + redirect (`user-edit.php:962`) | "Save Changes" button, async `save()` (`index.js:144-152`) | full | Async; disabled until `hasEdits`, shows loading. |
| Success feedback | `?updated` → admin notice "Profile updated." (`user-edit.php:215-237`) | success snackbar via `useEntitySave` (`useEntitySave.js:29`) | full | Different mechanism, equivalent UX. |
| Error feedback | `WP_Error` rendered as admin notice list (`user-edit.php:252-259`) | error banner with `err.message` (`useEntitySave.js:31-33`) | partial | Workspace surfaces a single error string; classic shows per-field WP_Error messages with `form-field` targeting. No field-level error mapping in workspace. |
| Capability gating | `current_user_can('edit_user', $user_id)` (`user-edit.php:135, 194`) | implicit — `userId` is always self; REST `update_current_item_permissions_check` enforces (`controller:865`) | full | Self-only by construction; server enforces. |
| Nonce / CSRF | `wp_nonce_field('update-user_'.$id)` + `check_admin_referer` (`user-edit.php:287, 133`) | core-data/api-fetch sends `X-WP-Nonce` automatically | full | Different mechanism, equivalent protection. |
| Dirty-state / unsaved-changes guard | Browser default `beforeunload`? No — classic relies on full-page POST | `app.json` declares `core:dirty-state: true`; relies on sibling NavigationGuard reading `hasEdits` (`app.json:9-11`, `app.md:34`) | full | Workspace arguably better here (in-SPA nav guard). |
| Help tab | `add_help_tab('overview', ...)` 7-paragraph help (`user-edit.php:60-74`) | absent | missing | No help-tab equivalent; cross-cutting workspace gap (no engine help-tab surface). |
| Screen options | none on this screen | n/a | n/a | Profile has no screen-options panel. |
| Empty / loading state | n/a (server-rendered) | centered `<Spinner/>` while `!record` (`index.js:121-127`) | full | |
| Permission-denied state | `wp_die('Sorry, you are not allowed...')` | "Profile unavailable: missing user context" when `!userId` (`index.js:108-119`) | partial | Workspace only guards missing `userId` global, not a server 403 (which core-data surfaces as the entity never resolving → perpetual spinner). |
| a11y: required-field indication | "(required)" on nickname + email (`user-edit.php:506, 560`) | none | missing | DataForm fields not marked required; no `aria-required`. |
| a11y: email-change live region | `aria-describedby="email-description"` (`user-edit.php:563`) | none | missing | No descriptive text on workspace email field. |

## Functional divergences

Behaviors present in **both** but implemented differently, with user-visible consequences.

1. **Display-name option set: ordering, contents, and the "trapped select".**
   - *Classic* (`user-edit.php:521-551`): builds the option array keyed `display_nickname, display_username, [display_firstname], [display_lastname], [display_firstlast], [display_lastfirst]`, then **prepends** the current `display_name` only if it isn't already present, then `array_map('trim')` + `array_unique`. So nickname leads; the current value is surfaced first only when distinct.
   - *Workspace* (`index.js:37-77`): pushes in order `username, first_name, last_name, first+last, last+first, nickname, name` (current value last), deduping by value. **Different ordering** (username first, nickname near-last; classic has nickname first, username second) and the current `name` lands at the end rather than the front.
   - *Consequence:* a user accustomed to wp-admin sees a different default order; the pre-selected option may differ; and the documented "trapped select" (`app.json:115-117`) — if name parts collapse to a single option, the select still renders and offers no other choice — matches classic behavior in spirit but the divergent ordering means the *selected* entry can differ between the two UIs for the same user record.

2. **Email change is immediate vs. confirmation-gated (own profile).**
   - *Classic* (`user-edit.php:562-566`): on **own** profile, typing a new email and saving does **not** change it immediately — `send_confirmation_on_profile_email()` (`wp-includes/user.php:3845`) stores `_new_email` meta and sends a confirm link; the address activates only when the user clicks the link (`user-edit.php:107-120`). An inline "pending change … Cancel" notice shows meanwhile.
   - *Workspace* (`index.js:78-82` → REST `prepare_item_for_database` `class-wp-rest-users-controller.php:1180-1182`): the email is written **directly** to `user_email` with no confirmation step (the `personal_options_update` hook never fires over REST).
   - *Consequence:* a security-relevant divergence — in the workspace, anyone with an open authenticated session can change the account email instantly (no second-factor email confirm). This is both a parity gap and a security-posture regression versus classic own-profile. See blockers.

3. **Website URL normalization absent.**
   - *Classic* (`includes/user.php:83-90`): empty or `http://` → cleared; bare host gets `http://` prepended; validates against allowed protocols.
   - *Workspace*: plain `type:'text'` field; whatever the user types is sent as `url`. REST sanitizes (`esc_url_raw`) but does not prepend a scheme.
   - *Consequence:* a user typing `example.com` saves `example.com` (no scheme) in the workspace, vs. `http://example.com` in classic — different stored value, may break author-link rendering.

4. **Error rendering granularity.**
   - *Classic*: `edit_user()` returns a `WP_Error` with per-field `form-field` data; `user-edit.php:252-259` lists every message.
   - *Workspace* (`useEntitySave.js:31-33`): catches and shows a single `err.message` banner.
   - *Consequence:* multi-field validation failures (e.g. duplicate email + blank nickname) show one message in the workspace, all of them in classic.

5. **Nickname required enforcement.**
   - *Classic* rejects an empty nickname on update (`includes/user.php:156-158`).
   - *Workspace* does not mark or validate it; REST `update_item` doesn't enforce non-empty nickname.
   - *Consequence:* the workspace can save a blank nickname that classic would block.

## API & platform blockers

The hard parity blockers — what classic does that the workspace **cannot** do through REST / `@wordpress/core-data` today. Verified against live 7.0 source.

| # | Capability | Missing surface | Tag | Evidence |
|---|---|---|---|---|
| B1 | **Admin color scheme** | `admin_color` is user meta with **no `show_in_rest`**. The REST users schema (`get_item_schema`) has no `admin_color` property. The picker UI is a pure `do_action('admin_color_scheme_picker')` emitting `<input name="admin_color">` radios + a `save-color-scheme` nonce — there is no data API. | [upstream] (register the meta `show_in_rest`) + [workspace] (build a picker; the swatch palettes/`$_wp_admin_css_colors` are also PHP-global, not REST) | schema `class-wp-rest-users-controller.php:1404-1525` (no `admin_color`); `edit_user()` reads `$_POST['admin_color']` `includes/user.php:137`; picker `misc.php:1004-1062`; hook `admin-filters.php:43`. |
| B2 | **Personal Options prefs** (`rich_editing`, `syntax_highlighting`, `comment_shortcuts`, `show_admin_bar_front`) | All four are user meta processed by `edit_user()` from `$_POST`, but **none** is registered with `show_in_rest`. The only user `register_meta(... show_in_rest ...)` in core is `persisted_preferences` (editor UI state), not these. | [upstream] (expose via `register_meta`) **or** [workspace] (register them on the workspace's own `/wp-admin-workspaces/v1/user-prefs` endpoint, which currently stores only `wp_admin_workspaces_user_prefs`) | `includes/user.php:135-141`; `_get_additional_user_keys()` lists them `wp-includes/user.php:3006`; only meta with `show_in_rest` is `persisted_preferences` `wp-includes/user.php:5206-5229`. |
| B3 | **Plugin contact methods** | `wp_get_user_contact_methods()` returns pure `apply_filters('user_contactmethods')` output and the values are stored as user meta, but the framework never `register_meta`s them — so they don't appear in the REST `meta` field nor as top-level schema properties. | [upstream] (core would need to auto-register contact-method meta with `show_in_rest`, or the workspace + each plugin would) | filter `wp-includes/user.php:3016-3035`; classic iterates them `user-edit.php:601-624`; `edit_user()` saves them `includes/user.php:109-113`. |
| B4 | **Email pending-change confirmation flow** | `send_confirmation_on_profile_email()` is hooked to `personal_options_update` — a **wp-admin POST action that does not fire on REST writes**. REST writes `user_email` immediately with no `_new_email` staging, no confirm email, no Cancel affordance. There is no REST endpoint to initiate/confirm/cancel a staged email change. | [upstream] (REST users controller would need to route own-email changes through the confirm flow, or expose a dedicated endpoint) | flow `wp-includes/user.php:3845-3961`; hook `admin-filters.php:127`; confirm execution `user-edit.php:107-129`; REST direct-write `class-wp-rest-users-controller.php:1180-1182`. **Security-relevant** (see divergence #2). |
| B5 | **Session destruction ("Log Out Everywhere Else")** | No REST endpoint exists for `WP_Session_Tokens`. Destruction is admin-ajax action `destroy-sessions` → `$sessions->destroy_others()` / `destroy_all()`. The session **count** (used to show/disable the button) also has no REST surface. | [upstream] (needs a REST endpoint over `WP_Session_Tokens`) | `wp_ajax_destroy_sessions()` `wp-admin/includes/ajax-actions.php` ~3985-4012; rendered `user-edit.php:754-787`; no `endpoints/*session*` controller exists. |
| B6 | **Send password-reset link (admin → user)** | Admin-ajax `send-password-reset`, not REST. (Also moot for `core:profile` since it has no edit-other-user path.) | [upstream] | `user-edit.php:732-752`. |
| B7 | **Avatar upload** | `avatar_urls` is **readonly** in REST; WordPress core has no avatar upload (Gravatar is an external service). | external / [upstream] (only fixable if core adds local avatars) | `class-wp-rest-users-controller.php:1544-1550` (`readonly: true`); Gravatar link `user-edit.php:644-649`. |
| B8 | **Super Admin grant + new-user-email toggle** | `grant_super_admin`/`revoke_super_admin` not REST-exposed; the create-time `send_user_notification` toggle is not in `create_item`'s schema. | [upstream] | `user-edit.php:474-481`; `includes/user.php:236`. |
| B9 | **Weak-password confirm + strength meter** | The pass1/pass2 match, zxcvbn strength meter, and `pw_weak` confirm checkbox are entirely client-side in classic; REST `password` accepts any string (only rejects backslash via `check_user_password`) with no confirm/strength gate. | [workspace] (a strength meter + confirm can be built client-side; not a hard blocker — flagged for completeness) | `user-edit.php:688-728`; REST `class-wp-rest-users-controller.php:1505-1513`. |

**Not blockers (buildable workspace-side — important to call out):**
- **Application Passwords** — full CRUD controller exists: `GET`/`POST`/`DELETE`(all) on `/wp/v2/users/(me|<id>)/application-passwords` and `GET`/`PUT`/`DELETE` on `.../<uuid>` (`class-wp-rest-application-passwords-controller.php:34-99`, schema `:794-851`). `POST` returns the plaintext `password` exactly once (`:625`). This is the single biggest **unbuilt-but-reachable** feature.
- **Interface Language (`locale`)** — in REST schema + writable (`class-wp-rest-users-controller.php:1468`, `:1225`). Only the *language-pack download on save* is wp-admin-only.
- **Password change (basic)** — `password` writable via REST (`:1188`).
- **Role + capabilities (read), role (write)** — `roles` writable with `check_role_update` (`:1230`, `:1257`); `capabilities`/`extra_capabilities` readable (`:1514`). Belongs in a `core:users` edit-other flow, which doesn't exist.
- **Username display, profile-picture display** — `username` (`edit` context) and `avatar_urls` are readable. Display-only is trivial.

## DataViews / DataForms review

The app uses **`DataForm`** from `@wordpress/dataviews/wp` (`index.js:5, 136-141`). Usage is **largely idiomatic** but has a few notes:

- **Field shape is correct.** Each field declares `id`/`type`/`label`; the display-name field uses `Edit: 'select'` + `elements: options`, and the bio uses `Edit: { control: 'textarea', rows: 5 }` (`index.js:71-93`). These are valid DataForm control overrides per the `@wordpress/dataviews` field API.
- **`data`/`onChange` wiring is correct.** `data={editedRecord}` + `onChange={edit}` matches the documented contract — DataForm's `onChange` returns the same partial-object shape `useEntityRecord`'s `edit` consumes (codified in the shared `EntityDataForm.js:66-71` and CLAUDE.md's DataForm rule). The app inlines this rather than reusing `EntityDataForm` because it needs the dynamic `useMemo`-built fields array.
- **Anti-pattern / fragility — fields rebuilt in render with a hand-tuned dep list.** `fields` is `useMemo`'d on five specific `editedRecord.*` keys with an `eslint-disable react-hooks/exhaustive-deps` (`index.js:99-106`). This is a deliberate perf hedge (rebuilding the fields array — including the `Edit` controls — on every keystroke would re-render the whole form), but it's fragile: the dependency list must stay manually in sync with the option-generation logic. A cleaner approach would compute only the `elements` array in the memo and keep the static field definitions hoisted out of render.
- **Generated-options UX gap is a DataForm limitation, not a misuse.** The "trapped select" (a select that renders even when there's exactly one option) is inherent to using a `select` control for display-name; DataForm has no "free-text-or-pick" combo control to mirror the fact that WordPress's display name is *constrained* to permutations. Acceptable.
- **Does it use DataForm where it should?** Yes for the seven fields it covers. For the **missing** sections, DataForm would be a reasonable fit for Personal Options (toggles + a language `select`) **if** the underlying meta were REST-exposed (blockers B1–B2). **Application Passwords** should **not** be a DataForm — it's a list-of-records CRUD with a create-once-reveal flow; that's a `DataViews` list + a small create form (or a bespoke component), closer to the six entity-CRUD apps in `src/apps/_shared/dataviews/`.
- **Shared scaffolding:** the app uses `useEntitySave` (`_shared/forms/useEntitySave.js`) correctly. It does **not** use `EntityDataForm` (`_shared/forms/EntityDataForm.js`) — justified by the dynamic fields requirement. No fragile workaround in the shared layer itself.

## Recommendations / future work

**P1 — high value, mostly workspace-side, unblocks the biggest gaps:**

1. **Build Application Passwords management** (list + add-with-once-reveal + revoke + revoke-all). *Why:* it's the single largest feature that is fully REST-reachable today and completely absent. *Where:* new sub-app or a section appended to `core:profile`; consume `/wp/v2/users/me/application-passwords` via `api-fetch` (the create response's one-time `password` needs imperative handling, so this is `api-fetch`, not a pure `useEntityRecord`). Consider a `DataViews` list. **Workspace-side**, no upstream change.
2. **Add the Interface Language (`locale`) field.** *Why:* in-REST, writable, trivially added to the existing `DataForm`, and a real everyday setting. *Where:* `src/apps/profile/index.js` fields array — add a `select` whose `elements` come from a preloaded available-languages list (the language list itself may need a small REST/preload surface; `locale` write is already supported). Note the language-pack-download-on-save sub-feature stays wp-admin-only. **Workspace-side** (with a possible small [workspace] endpoint for the language list).
3. **Add a basic password-change field** (with client-side confirm + a strength meter). *Why:* `password` is REST-writable; a profile editor with no password change is a glaring omission. *Where:* `index.js`. Be explicit in `app.md` that there's no current-password re-auth (matches REST) and no weak-password server gate. **Workspace-side** (B9 is not a hard blocker).
4. **Surface username (read-only) and the avatar/Gravatar block (read-only).** *Why:* cheap parity wins; both are REST-readable. *Where:* `index.js`. **Workspace-side.**

**P2 — needs an upstream/REST change or a workspace-side meta bridge:**

5. **Expose Personal Options prefs to REST** (`admin_color`, `rich_editing`, `syntax_highlighting`, `comment_shortcuts`, `show_admin_bar_front`). *Why:* blockers B1–B2; these are core wp-admin behaviors. *Where:* either [upstream] `register_meta(... show_in_rest ...)` in core, **or** [workspace] register them on the workspace's `WP_Admin_Workspaces_Prefs_REST` (`includes/class-wp-admin-workspaces-prefs-rest.php`) writing through to `update_user_meta` so a future Personal Options panel can read/write them. The workspace-side bridge is the pragmatic path and keeps it self-contained. **Mixed — prefer [workspace] bridge.**
6. **Decide the email-change posture and document it loudly.** *Why:* B4 + divergence #2 is a security-relevant deviation (instant email change, no confirm). *Where:* either (a) [upstream] route own-email REST writes through the confirm flow, or (b) [workspace] add a description +, if feasible, a client-initiated confirm step; at minimum document the difference prominently in `app.md` (currently a single line). **Prefer [upstream]; document now [workspace].**
7. **Plugin contact methods → REST.** *Why:* B3; extensibility parity. *Where:* [upstream] core auto-registration is the clean fix; a workspace-side bridge would have to enumerate `wp_get_user_contact_methods()` and register each as REST meta. Lower priority. **[upstream] preferred.**

**P3 — lower priority / structural:**

8. **Session "Log Out Everywhere Else."** *Why:* B5; a real security affordance. *Where:* needs an [upstream] REST endpoint over `WP_Session_Tokens` (none exists). Until then, unbuildable cleanly. **[upstream] blocked.**
9. **Add field-level error mapping.** *Why:* divergence #4 — surface per-field REST validation errors instead of a single banner. *Where:* `useEntitySave.js` / the DataForm integration; map `WP_Error` `data.params` to field messages. **Workspace-side.**
10. **Mark nickname/email required + add URL normalization.** *Why:* divergences #3, #5 — close small validation gaps. *Where:* `index.js` field defs (`isRequired`) + a small URL-normalize on save. **Workspace-side.**
11. **Edit-another-user flow (role, capabilities) in `core:users`.** *Why:* the entire admin-editing-another-user half of `user-edit.php` has no home. *Where:* a new `core:user-edit` mount under `core:users` with `edit_user`/`promote_user` gating; `roles` is REST-writable. **Workspace-side** (large).
12. ~~**Author a dedicated `docs/screens/profile.md`** or expand the profile coverage in `users.md`.~~ **Done** — `docs/screens/profile.md` now exists as a full Tier-2 spec covering the own-vs-other branching + email-confirm flow; `users.md` cross-links it.
