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

The role `<select>` options come from the resolved `root/user` dataView spec, read via `useDataView({ kind: 'root', name: 'user' })` — the `roles` field's `elements` (translated, admin.json-controlled). When the spec ships no elements (a lean override), the app falls back to the standard WordPress roles (`subscriber` … `administrator`). The default selection is `subscriber` when present (WordPress' default new-user role), else the last element.

### Submit

`onSubmit` is a blocking `saveEntityRecord`:

1. The informational `send_user_notification` flag is stripped from the payload (it is **not** in the REST create schema — see below).
2. The single `roles` select value is wrapped into an array (`roles: [ value ]`) — REST expects an array.
3. `saveEntityRecord` **resolves `undefined`** on a REST failure (it does not throw). A falsy record means the create failed: the app reads `getLastEntitySaveError('root', 'user')`, shows a dismissible error notice, and keeps the form. On success it shows a snackbar and `navigate('#/users/{id}/edit')`.

This mirrors the `CreateBody` half of the shared `createEntityFormModal`, but as a full screen (not a DataViews `RenderModal`), because Add New User is a routable screen, not a row action on the list.

## Rebuild guide

A non-WPDS / non-React port needs:

- A create form with the eight fields above; only `username` / `email` / `password` are required.
- The role list — ideally from the same `root/user` dataView `elements` so the surfaced set stays admin.json-driven, else the standard roles.
- A `POST /wp/v2/users` with `{ username, email, first_name, last_name, url, password, roles: [role] }`. Wrap the role in an array.
- The resolve-`undefined`-on-error gotcha: check the returned record (or the equivalent error selector / response status) before declaring success.
- Navigation to the new user's edit surface on success.

## Known limitations

- **Welcome-email toggle is cosmetic.** The "Send the new user an email about their account" checkbox is offered for parity, but `send_user_notification` is **not** in the REST create schema (`POST /wp/v2/users` calls `wp_insert_user()`, which does not send the notification). The flag is stripped from the payload and ignored server-side — the standard welcome / set-password email is not sent. Closing this needs an upstream `send_user_notification` arg on the create endpoint (`docs/parity/users.md` blocker #5).
- **No dedicated Edit User app.** On success the app navigates to `#/users/{id}/edit`, which the `wp-admin-default` shell binds to `core:profile` with `config.userId`. `core:profile` was authored for the acting user's own profile; using it as a generic edit surface is the current stopgap (shared with the `core:users` Edit action).
- **No locale field.** wp-admin's create form offers a user-locale select; the REST create path accepts `locale` but the form does not surface it yet.
- **No weak-password confirmation.** wp-admin requires a "Confirm use of weak password" checkbox for short passwords; this form has no client-side strength meter and relies on the server's password handling. The generated default is 16 random chars.
- **Single-site only.** No multisite Add-Existing-User / invite branch (internal PHP, no REST).
