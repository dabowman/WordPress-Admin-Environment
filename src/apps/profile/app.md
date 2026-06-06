# core:profile

Prose accompanying `app.json#documentation` for the profile editor.

## Overview

ProfileApp is the simplest write-path in the workspace: a flat form over `useEntityRecord('root', 'user', userId)`. The edited user is `config.userId` when the screen supplies one (the `/users/{id}/edit` route interpolates `{id}` into `config.userId`, so the `core:users` Edit action + username link edit the *target* user), falling back to the acting user (`window.wpAdminWorkspaces.userId`, injected by PHP) for the self-service `/profile` screen. Without either the app renders a permission-denied fallback. The form populates from the entity record on first paint, accumulates edits via `edit({ <field>: value })`, and flushes via `save()` when the user clicks Save Changes.

The `DataForm` covers eight fields: first / last / nickname, display name, email, website, biographical info, and **interface language** (`locale`). Below it sits an **Account Management** section containing the new-password fields (new + confirm). Both surface settings that are REST-writable today but were previously absent from the workspace; see the caveats under *Known limitations*.

## Architecture

The display name field is the only non-trivial bit. WordPress's user UI lets you pick `display_name` from a generated option set — username, first, last, first+last, last+first, nickname, current name — and this app reproduces that. The option list is built in render via a small `addOption` helper that dedupes empty + duplicate values.

**Interface language.** The `locale` field is a plain `select` whose options come from PHP (`wp_admin_workspaces_get_profile_languages()`, exposed at `window.wpAdminWorkspaces.profileLanguages`). The list is intentionally limited to **Site Default + English + already-installed locales** — exactly the set the REST `locale` enum accepts (`en_US` + `get_available_languages()`, plus `''` for site default). Because the profile form is self-service (every user mounts it), the PHP helper skips the translations-API HTTP fetch entirely unless a non-English locale is actually installed.

**New password.** `password` is *write-only* — REST never returns it — so it cannot live in the entity record's pending edits. It is held in component `useState` (new + confirm) and saved via a direct one-shot `saveEntityRecord('root','user',userId,{password})` call that **never touches `edit()`** (the shared entity edits). This isolation ensures a failed or abandoned password save cannot linger in the edits and be silently committed on a later, unrelated click of Save Changes. A pending password alone does **not** report dirty-state to the kernel — it is local state until save. A confirm-mismatch `Notice` is cleared immediately when the user retypes **either** password field (onChange on both fields), so it does not linger after the user fixes the mismatch.

`useEntitySave` is called with entity coords (`{ kind: 'root', name: 'user', recordId: userId }`). This means a REST 4xx/5xx on the profile fields (e.g. invalid email) is caught via `getLastEntitySaveError` and surfaces as an error banner. Password-save failures are caught via a `try/catch` around `saveEntityRecord` and also surface as an error banner — the form does **not** clear the password fields on a server-rejected save so the user can retry.

Save flow (`onSave`):

1. If a new password is present and the confirm does not match → show an inline error `Notice` and abort.
2. **Step 1 — Profile field edits:** if `hasEdits`, call `await save()` from `useEntityRecord` (wrapped by `useEntitySave` with entity coords). `useEntitySave` checks `getLastEntitySaveError('root', 'user', userId)` after resolving; a server error surfaces as an error notice and returns `false` → `onSave` returns early.
3. **Step 2 — Password (when entered):** call `await saveEntityRecord('root','user',userId,{ password: newPassword })` directly. This is a separate REST call and the password never entered the entity's pending edit queue. On failure: `createErrorNotice(err.message || 'Failed to save password.', { isDismissible: true })` + return (password fields remain filled for retry).
4. On full success: if profile edits were saved (Step 1 ran), `useEntitySave` already showed the success snackbar. If only a password was saved (Step 1 skipped), `createSuccessNotice('Profile updated.', { type: 'snackbar' })` is called manually. Password fields are cleared.

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
- **No per-field cap gating for editing another user.** The app accepts `config.userId` (interpolated by the `/users/{id}/edit` route) so the `core:users` Edit action + username link can target a named user. REST enforces the `edit_users` cap server-side; the app itself does not add a client-side gate or per-field restriction beyond what the REST response exposes.
