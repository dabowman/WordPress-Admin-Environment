# core:user-new

Prose accompanying `app.json#documentation` for the native Add New User screen.

## Overview

`core:user-new` is the native single-site "Add New User" form. It replaces the legacy `iframe:user-new.php` mount on the `core:users-new` screen (`/users/new`). It renders a `DataForm` create flow and `POST`s a new user to `/wp/v2/users` via `saveEntityRecord('root', 'user', payload)`, then navigates to the new user's edit screen on success.

It rebuilds the **single-site** half of wp-admin's `user-new.php` createuser form (`docs/screens/user-new.md` / the Users cluster in `docs/screens/users.md`). The multisite Add-Existing-User / invite flow is out of scope — those paths (`add_existing_user_to_blog`, `wpmu_signup_user`) are internal PHP with no REST equivalent.

## Architecture

The form is a local-state create draft (no entity record exists yet), seeded once in `useState`:

```js
{ username, email, first_name, last_name, url, password, roles, send_user_notification }
```

Fields are a flat `DataForm` field array; `useFormValidity(data, fields, form)` gates the submit button on the three required fields (`username`, `email`, `password`). `DataForm`'s `onChange` returns the same partial shape, merged into the draft via `setData(prev => ({ ...prev, ...edits }))`.

### Role options

The role `<select>` options come from the resolved `root/user` dataView spec, read via `useDataView({ kind: 'root', name: 'user' })` — the `roles` field's `elements` (translated, workspace.json-controlled). When the spec ships no elements (a lean override), the app falls back to the standard WordPress roles (`subscriber` … `administrator`). The default selection is `subscriber` when present (WordPress' default new-user role), else the **lowest-privilege** standard role the set carries — never the last/most-privileged element. Because `useState`'s lazy initializer freezes the seed from the first-paint `defaultRole`, a `useEffect` re-seeds `data.roles` if `defaultRole` changes after a late (REST-fallback) `useDataView` resolve — guarded by a `roleDirtied` ref so an explicit admin pick is preserved.

### Submit

`onSubmit` is a blocking `saveEntityRecord`:

1. The informational `send_user_notification` flag is stripped from the payload (it is **not** in the REST create schema — see below).
2. The single `roles` select value is wrapped into an array (`roles: [ value ]`) — REST expects an array.
3. `saveEntityRecord` **resolves `undefined`** on a REST failure (it does not throw). A falsy record means the create failed: the app reads `getLastEntitySaveError('root', 'user')`, shows a dismissible error notice, and keeps the form. On success it shows a snackbar and `navigate('#/users/{id}/edit')`.

This mirrors the `CreateBody` half of the shared `createEntityFormModal`, but as a full screen (not a DataViews `RenderModal`), because Add New User is a routable screen, not a row action on the list.

## Rebuild guide

A non-WPDS / non-React port needs:

- A create form with the eight fields above; only `username` / `email` / `password` are required.
- The role list — ideally from the same `root/user` dataView `elements` so the surfaced set stays workspace.json-driven, else the standard roles.
- A `POST /wp/v2/users` with `{ username, email, first_name, last_name, url, password, roles: [role] }`. Wrap the role in an array.
- The resolve-`undefined`-on-error gotcha: check the returned record (or the equivalent error selector / response status) before declaring success.
- Navigation to the new user's edit surface on success.

## Known limitations

- **Welcome-email toggle is a disabled, off no-op.** The "Send the new user an email about their account" checkbox is rendered **read-only and off**, with helper text noting the welcome email isn't sent on create yet — rather than an interactive default-on control that does nothing. `send_user_notification` is **not** in the REST create schema (`POST /wp/v2/users` calls `wp_insert_user()`, which does not send the notification); it is stripped from the payload and ignored server-side, so the standard welcome / set-password email is not sent. Closing this needs an upstream `send_user_notification` arg on the create endpoint (`docs/parity/users.md` blocker #5).
- **Generated password is the user's only credential — generated with a CSPRNG.** Because no welcome / set-password email is sent on the REST create path (above), the generated default IS the stored password whenever the admin leaves the field unchanged. It is generated with `window.crypto.getRandomValues` (not `Math.random()`); the admin can still override it before submitting.
- **No dedicated Edit User app.** On success the app navigates to `#/users/{id}/edit`, which the `wp-admin-default` workspace binds to `core:profile` with `config.userId: "{id}"`. `core:profile` honors `config.userId` (editing the new user, not the acting admin), so the post-create redirect lands on the right account — but it surfaces only the self-service profile fields, so a purpose-built Edit User app is still a parity gap (shared with the `core:users` Edit action).
- **No locale field.** wp-admin's create form offers a user-locale select; the REST create path accepts `locale` but the form does not surface it yet.
- **No weak-password confirmation.** wp-admin requires a "Confirm use of weak password" checkbox for short passwords; this form has no client-side strength meter and relies on the server's password handling. The generated default is 16 chars from a CSPRNG (`window.crypto.getRandomValues`).
- **Single-site only.** No multisite Add-Existing-User / invite branch (internal PHP, no REST).
