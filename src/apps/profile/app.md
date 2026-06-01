# core:profile

Prose accompanying `app.json#documentation` for the profile editor.

## Overview

ProfileApp is the simplest write-path in the shell: a flat form over `useEntityRecord('root', 'user', userId)`. The edited user is `config.userId` when the screen supplies one (the `/users/{id}/edit` route interpolates `{id}` into `config.userId`, so the `core:users` Edit action + username link edit the *target* user), falling back to the acting user (`window.wpAdminShell.userId`, injected by PHP) for the self-service `/profile` screen. Without either the app renders a permission-denied fallback. The form populates from the entity record on first paint, accumulates edits via `edit({ <field>: value })`, and flushes via `save()` when the user clicks Save Changes.

## Architecture

The display name field is the only non-trivial bit. WordPress's user UI lets you pick `display_name` from a generated option set — username, first, last, first+last, last+first, nickname, current name — and this app reproduces that. The option list is built in render via a small `addOption` helper that dedupes empty + duplicate values.

Save flow:

1. `await save()` from `useEntityRecord`.
2. On success: `createSuccessNotice('Profile updated.', { type: 'snackbar' })`.
3. On error: `createErrorNotice(err.message, { isDismissible: true })`.

Notice routing: success → snackbar (auto-dismiss), failure → dismissible banner (sticky until the user clears).

## Rebuild guide

The "form over an entity record" pattern is generic. For a non-`core-data` rebuild:

- Treat the entity as a single state object with an `edited` overlay. Edits accumulate locally; only flush on save.
- Track `hasEdits` derived from `JSON.stringify(edited) !== JSON.stringify(record)` if your store doesn't expose it.
- Disable the save button while `!hasEdits || isSaving`. Show a loading state on the button while saving.
- Route success + failure through the host's notice system.

A non-WPDS rebuild needs text input + email input + URL input + select + textarea + button primitives. All standard.

## Known limitations

- **No password change.** WordPress wp-admin's profile page includes a password section; this app omits it. Password updates need the dedicated endpoint with the current-password confirm step.
- **No application passwords / two-factor.** Out of scope.
- **No avatar customization.** WordPress uses Gravatar; this app shows nothing about it.
- **Admin-email change differs from wp-admin.** REST saves email directly; wp-admin uses a confirm-by-link flow. We don't surface this distinction beyond a description on the field.
- **Profile is current-user-only.** No editing-another-user flow exists; that would need to live in `core:users` (with `edit_users` cap gating) and a different mount.
