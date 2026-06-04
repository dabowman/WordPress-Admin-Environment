# core:profile

Prose accompanying `app.json#documentation` for the profile editor.

## Overview

ProfileApp is the simplest write-path in the workspace: a flat form over `useEntityRecord('root', 'user', userId)`. The edited user is `config.userId` when the screen supplies one (the `/users/{id}/edit` route interpolates `{id}` into `config.userId`, so the `core:users` Edit action + username link edit the *target* user), falling back to the acting user (`window.wpAdminWorkspaces.userId`, injected by PHP) for the self-service `/profile` screen. Without either the app renders a permission-denied fallback. The form populates from the entity record on first paint, accumulates edits via `edit({ <field>: value })`, and flushes via `save()` when the user clicks Save Changes.

## Architecture

The display name field is the only non-trivial bit. WordPress's user UI lets you pick `display_name` from a generated option set — username, first, last, first+last, last+first, nickname, current name — and this app reproduces that. The option list is built in render via a small `addOption` helper that dedupes empty + duplicate values.

Save flow:

1. `await save()` from `useEntityRecord`.
2. On success: `createSuccessNotice('Profile updated.', { type: 'snackbar' })`.
3. On error: `createErrorNotice(err.message, { isDismissible: true })`.

Notice routing: success → snackbar (auto-dismiss), failure → dismissible banner (sticky until the user clears).

## Application Passwords

Below the form, `ApplicationPasswords.js` reproduces wp-admin's Application Passwords block (`user-edit.php:790-883`): list, add (one-time plaintext reveal), revoke one, revoke all. It is **not** a `DataForm` or `useEntityRecord` consumer — it's a list-of-records CRUD whose create response returns the plaintext `password` exactly once and is never re-fetchable (`WP_REST_Application_Passwords_Controller`, `controller:625`), so it drives the nested `/wp/v2/users/{userId}/application-passwords` endpoint imperatively with `api-fetch` and holds the revealed value in local state.

- **List:** `GET .../application-passwords` on mount; a centered Spinner while in flight.
- **Create:** `POST .../application-passwords { name }` → reveal panel (readonly value + Copy via `navigator.clipboard` + Dismiss), then re-list.
- **Revoke one:** `DELETE .../application-passwords/{uuid}` behind a confirm Modal.
- **Revoke all:** `DELETE .../application-passwords` behind a confirm Modal.
- **Availability:** the controller gates server-side (HTTPS required, Basic-Auth-incompatible, capability). A failed list GET renders an inline unavailable notice and hides the create form instead of crashing the profile form.
- **Scope:** manages `userId`'s passwords (the acting user on `/profile`). Managing another user's needs `edit_user`; the REST controller enforces it.

## Rebuild guide

The "form over an entity record" pattern is generic. For a non-`core-data` rebuild:

- Treat the entity as a single state object with an `edited` overlay. Edits accumulate locally; only flush on save.
- Track `hasEdits` derived from `JSON.stringify(edited) !== JSON.stringify(record)` if your store doesn't expose it.
- Disable the save button while `!hasEdits || isSaving`. Show a loading state on the button while saving.
- Route success + failure through the host's notice system.

A non-WPDS rebuild needs text input + email input + URL input + select + textarea + button primitives. All standard.

## Known limitations

- **No password change.** WordPress wp-admin's profile page includes a password section; this app omits it. Password updates need the dedicated endpoint with the current-password confirm step.
- **No two-factor.** Out of scope (no core REST surface). Application Passwords are now supported — see above.
- **App-password rename not surfaced.** The controller supports `PUT .../{uuid}` (rename); this UI only lists / creates / revokes, matching the most common wp-admin flows. Add an inline rename later if needed.
- **No avatar customization.** WordPress uses Gravatar; this app shows nothing about it.
- **Admin-email change differs from wp-admin.** REST saves email directly; wp-admin uses a confirm-by-link flow. We don't surface this distinction beyond a description on the field.
- **Profile is current-user-only.** No editing-another-user flow exists; that would need to live in `core:users` (with `edit_users` cap gating) and a different mount.
