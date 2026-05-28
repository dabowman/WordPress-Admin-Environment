# core:users

Prose accompanying `app.json#documentation` for the user list.

## Overview

UsersApp is a DataViews list of WordPress users with a single, carefully-guarded bulk action: permanent delete with content reassignment. WordPress has no user trash, so deletion is irreversible — the app's responsibility is to make the consequences clear (modal copy varies by selection size + self-skip) and to ensure the request succeeds atomically (filter the acting user out before issuing the REST calls).

Read shape follows PostsApp: `useEntityRecords('root', 'user', queryArgs)` with `context: 'edit'`. Without `edit` context the response omits email + roles — those columns would render empty and any future role-edit feature would silently fail. Filter by role is wired up but only the `is` operator is honored (single-role filter); multi-role filtering would need REST-side `roles__in` support.

## Architecture

UsersApp reads its DataViews spec via `useDataView(screenId)`. The baseline (fields, default view, default layouts, actions) ships in `app.json#dataView` and is injected into the resolved tree post-merge by `WP_Admin_Shell_Data_View_Config::inject_app_baselines`. Override paths, in order:

1. **admin.json** — `settings.dataViews.root.user.<variant|_default>` wins as a whole-entry override (no per-field merge; same pattern as `settings.dataFields`). Site / role / user origins extend through the normal cascade.
2. **Filter** — `apply_filters('wp_admin_shell_data_view_config_root_user', $doc, 'root', 'user', '_default')` runs last; the per-variant `wp_admin_shell_data_view_config_root_user_<variant>` fires additionally when `variant !== '_default'`.

The JSON layer carries only the *shape* — locale-agnostic labels + structural flags. Render callbacks stay in `index.js`, keyed by spec id:

- **`buildFieldRenderers()`** maps `name` → `<Stack>` with display name + username, `email` → `<Text>`, `roles` → joined `<Text>`. Unknown ids fall through to DataViews' default renderer for the declared type.
- **`buildActions(actions, ctx)`** compiles each `dataView.actions[]` entry into the DataViews action shape. The `delete` id attaches the `RenderModal` body (self-delete guard + confirm UI); all other ids fall through with no callback (extension hook for plugin-contributed actions, deferred).
- **`buildFields(fields, renderers)`** compiles each `dataView.fields[]` entry into a DataViews field, copying through `enableGlobalSearch`, `enableHiding`, `enableSorting`, `elements`, `filterBy`, and attaching the matching renderer if one exists.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — labels reach DataViews in whatever locale the spec was authored in (English, by convention). UsersApp recovers per-locale labels via two small in-app tables keyed by spec id:

```js
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-shell' ),
	email: __( 'Email', 'wp-admin-shell' ),
	roles: __( 'Roles', 'wp-admin-shell' ),
	registered_date: __( 'Registered', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	delete: __( 'Delete', 'wp-admin-shell' ),
};
```

`buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`: the table wins for ids the app authored (translation tools see the `__()` literal at module load); the spec wins for ids the app doesn't know (plugin extension columns / actions keep whatever string the cascade supplied). Don't deduplicate this table across apps yet — premature; revisit after the entity-CRUD migration sweep lands.

### View-state resync

A small `useEffect` re-seeds local `view` state when the underlying triple changes on the same hook instance. UsersApp ships a single triple today, but the recipe matches PostsApp's so a future variant config (e.g. `?role=author`) picks up the new defaults without rewriting. The effect is keyed on the binding axis only, not on the resolved `dataView` itself, so in-session view edits aren't clobbered every time the cascade re-resolves.

### Title-field dedup

`dataView.defaultView.titleField` is `name`. DataViews renders the title cell from `view.titleField`; if `name` were also listed in `view.fields`, the table would render a second column for the same field. The `visibleView` memo strips the title id out of `view.fields` before handing the object to DataViews. Same recipe as PostsApp.

### Destructive modal

The destructive modal is rendered via DataViews' `RenderModal` shape so DataViews owns the focus trap + backdrop + dismiss. Inside the modal:

1. `currentUserId` is read from `window.wpAdminShell.userId` (injected by PHP).
2. `targets = items.filter((i) => i.id !== currentUserId)` — the acting user is stripped from the target set.
3. `skipped = items.length - targets.length` — used to surface the "(Your own account will be skipped.)" addendum.
4. If `targets.length === 0`, the modal renders the cannot-delete-yourself copy and disables the destructive button.

On confirm: `Promise.allSettled(targets.map(deleteEntityRecord(..., { force: true, reassign: currentUserId })))`, then `invalidateResolution('getEntityRecords', ['root', 'user', queryArgs])`. The result is bucketed: zero failures → success snackbar; partial failure → dismissible error notice with failed/total counts; all-failed → dismissible error notice with the first rejection's message.

## Rebuild guide

The data shape is straightforward; the architectural pattern worth preserving is the **self-action guard**:

- Identify the acting user via a host-injected global, store config, or a `whoami` REST call before the action fires.
- Strip the acting user out of bulk target sets for any operation that can't legally include them (delete, demote, role-change-to-lower).
- Surface the skip in the confirmation UI rather than silently filtering — users notice when their selection count shrinks.

A non-WPDS rebuild needs the same primitives as PostsApp (table + destructive modal + invalidation) plus access to the acting user's id. The DataViews spec can be reused verbatim from `app.json#dataView` (it carries no React) — only the renderer table needs porting.

## Known limitations

- No add-user flow. Adding a user requires a `POST /wp/v2/users` flow with role + email + password fields; that lands as a separate iteration alongside an invite-style UX.
- No edit-user flow. Click-row-name navigates nowhere; profile lives in `core:profile` for the acting user only.
- Role filter is single-select; the underlying REST endpoint accepts comma-separated roles in `?roles=`, but the queryArgs mapper only handles the `is` operator.
- Role **counts** now surface on the roles filter elements (`Editor (12)`) via the shared `useEntityElementCounts` hook — one lightweight `per_page=1&_fields=id` request per role, read off the `X-WP-Total` header. Role values come from the resolved spec `roles` elements, so the count set tracks whatever roles the shell exposes. Still rendered as filter-dropdown options, not the standalone tab strip wp-admin uses.
- No `send-password-reset` bulk action. wp-admin offers it on the Users screen; the v2 app does not surface a REST equivalent.
- No `change-role` bulk action. wp-admin's "Change role to…" dropdown above the list applies a new role to selected users; the v2 app doesn't ship this.
- No "View author's posts" row link. wp-admin's screen links each user row to a filtered post list; the v2 app surfaces neither the link nor any per-user post count.
- The plugin-contributed row-actions slot (`core:users.row-actions` per M4.5) is documented but not yet wired up.
- Roles filter `elements` are not declared in the manifest baseline because the available role list is site-dependent. Plugin authors wanting a typed dropdown can override `settings.dataViews.root.user._default.fields[id=roles].elements` in admin.json (whole-entry override semantics — restate the full spec) or hook `wp_admin_shell_data_view_config_root_user` to inject the live role list at filter time.
