# core:profile

Prose accompanying `app.json#documentation` for the profile editor.

## Overview

ProfileApp is the simplest write-path in the workspace: a flat form over `useEntityRecord('root', 'user', userId)`. The edited user is `config.userId` when the screen supplies one (the `/users/{id}/edit` route interpolates `{id}` into `config.userId`, so the `core:users` Edit action + username link edit the *target* user), falling back to the acting user (`window.wpAdminWorkspaces.userId`, injected by PHP) for the self-service `/profile` screen. Without either the app renders a permission-denied fallback. The form populates from the entity record on first paint, accumulates edits via `edit({ <field>: value })`, and flushes via `save()` when the user clicks Save Changes.

The `DataForm` covers eight fields: first / last / nickname, display name, email, website, biographical info, and **interface language** (`locale`). Below it sits a small **new-password** section (new + confirm). Both surface settings that are REST-writable today but were previously absent from the workspace; see the caveats under *Known limitations*.

## Architecture

The display name field is the only non-trivial bit. WordPress's user UI lets you pick `display_name` from a generated option set — username, first, last, first+last, last+first, nickname, current name — and this app reproduces that. The option list is built in render via a small `addOption` helper that dedupes empty + duplicate values.

**Interface language.** The `locale` field is a plain `select` whose options come from PHP (`wp_admin_workspaces_get_profile_languages()`, exposed at `window.wpAdminWorkspaces.profileLanguages`). The list is intentionally limited to **Site Default + English + already-installed locales** — exactly the set the REST `locale` enum accepts (`en_US` + `get_available_languages()`, plus `''` for site default). Because the profile form is self-service (every user mounts it), the PHP helper skips the translations-API HTTP fetch entirely unless a non-English locale is actually installed.

**New password.** `password` is *write-only* — REST never returns it — so it cannot live in the entity record. It is held in component `useState` (new + confirm) and, only at save time, validated for a match and folded into the edits via `edit({ password })` immediately before `save()` reads them (the `edit()` dispatch is synchronous against the core-data store, the same path the form fields take). A pending password alone does **not** report dirty-state to the kernel — it is local state until save. On success the fields are cleared.

Save flow (`onSave`):

1. If a new password is present and the confirm does not match → show an inline error `Notice` and abort.
2. If it matches → `edit({ password: newPassword })`.
3. `await save()` from `useEntityRecord` (wrapped by `useEntitySave`).
4. On success: `createSuccessNotice('Profile updated.', { type: 'snackbar' })` + password fields cleared.
5. On error: `createErrorNotice(err.message, { isDismissible: true })`.

Notice routing: success → snackbar (auto-dismiss), failure → dismissible banner (sticky until the user clears).

## Rebuild guide

The "form over an entity record" pattern is generic. For a non-`core-data` rebuild:

- Treat the entity as a single state object with an `edited` overlay. Edits accumulate locally; only flush on save.
- Track `hasEdits` derived from `JSON.stringify(edited) !== JSON.stringify(record)` if your store doesn't expose it.
- Disable the save button while `!hasEdits || isSaving`. Show a loading state on the button while saving.
- Route success + failure through the host's notice system.

A non-WPDS rebuild needs text input + email input + URL input + select + textarea + button primitives. All standard.

## Known limitations

- **Password change has no re-auth and no server weak-password gate.** The new-password field writes `password` straight through `WP_REST_Users_Controller`, which requires **no current-password re-authentication** and applies **no weak-password / strength gate** — it accepts any password except those containing a backslash (`check_user_password`). This app only enforces a client-side confirm-match. The classic wp-admin pass1/pass2 + zxcvbn strength meter + `pw_weak` confirm checkbox are intentionally **not** reproduced (they are entirely client-side in classic; REST has no equivalent). This is a deliberate REST-parity tradeoff, not an oversight.
- **Interface Language offers installed locales only.** The `locale` select lists Site Default + English + already-installed languages. Installing a downloadable language pack as a side effect of saving is a **wp-admin-only** sub-feature and is not offered here (the REST `locale` enum would reject an uninstalled locale anyway). Note REST resolves `locale` via `get_user_locale()`, so a site-default user reads back the *resolved* site locale rather than an empty value; selecting **Site Default** writes the reset.
- **No application passwords / two-factor.** Out of scope. (`/wp/v2/users/<id>/application-passwords` is a complete REST controller and is the single largest unbuilt-but-reachable gap — tracked separately.)
- **No avatar customization.** WordPress uses Gravatar; this app shows nothing about it.
- **Admin-email change differs from wp-admin.** REST saves email directly; wp-admin uses a confirm-by-link flow. We don't surface this distinction beyond a description on the field.
- **Profile is current-user-only.** No editing-another-user flow exists; that would need to live in `core:users` (with `edit_users` cap gating) and a different mount.
