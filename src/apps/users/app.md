# core:users

Prose accompanying `app.json#documentation` for the user list.

## Overview

UsersApp is a DataViews list of WordPress users with a single, carefully-guarded bulk action: permanent delete with content reassignment. WordPress has no user trash, so deletion is irreversible — the app's responsibility is to make the consequences clear (modal copy varies by selection size + self-skip) and to ensure the request succeeds atomically (filter the acting user out before issuing the REST calls).

Read shape follows PostsApp: `useEntityRecords('root', 'user', queryArgs)` with `context: 'edit'`. Without `edit` context the response omits email + roles — those columns would render empty and any future role-edit feature would silently fail. Filter by role is wired up but only the `is` operator is honored (single-role filter); multi-role filtering would need REST-side `roles__in` support.

## Architecture

Sortby field aliasing: DataViews sends `view.sort.field` matching the column id; the queryArgs mapper passes it through with a special case for `registered_date` (column id matches REST orderby alias). For a custom column whose REST orderby alias differs, expand this map.

The destructive modal is rendered via DataViews' `RenderModal` shape so DataViews owns the focus trap + backdrop + dismiss. Inside the modal:

1. `currentUserId` is read from `window.wpAdminShell.userId` (injected by PHP).
2. `targets = items.filter((i) => i.id !== currentUserId)` — the acting user is stripped from the target set.
3. `skipped = items.length - targets.length` — used to surface the "(Your own account will be skipped.)" addendum.
4. If `targets.length === 0`, the modal renders the cannot-delete-yourself copy and disables the destructive button.

On confirm: `Promise.all(targets.map(deleteEntityRecord(..., { force: true, reassign: currentUserId })))`, then `invalidateResolution('getEntityRecords', ['root', 'user', queryArgs])`, then a success snackbar. On error, a dismissible error notice with `err.message`.

## Rebuild guide

The data shape is straightforward; the architectural pattern worth preserving is the **self-action guard**:

- Identify the acting user via a host-injected global, store config, or a `whoami` REST call before the action fires.
- Strip the acting user out of bulk target sets for any operation that can't legally include them (delete, demote, role-change-to-lower).
- Surface the skip in the confirmation UI rather than silently filtering — users notice when their selection count shrinks.

A non-WPDS rebuild needs the same primitives as PostsApp (table + destructive modal + invalidation) plus access to the acting user's id.

## Known limitations

- No add-user flow. Adding a user requires a `POST /wp/v2/users` flow with role + email + password fields; that lands as a separate iteration alongside an invite-style UX.
- No edit-user flow. Click-row-name navigates nowhere; profile lives in `core:profile` for the acting user only.
- Role filter is single-select; the underlying REST endpoint accepts comma-separated roles in `?roles=`, but the queryArgs mapper only handles the `is` operator.
- The plugin-contributed row-actions slot (`core:users.row-actions` per M4.5) is documented but not yet wired up.
