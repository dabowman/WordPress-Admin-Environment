# core:users

Prose accompanying `app.json#documentation` for the user list.

## Overview

UsersApp is a DataViews list of WordPress users with two carefully-guarded bulk actions — permanent delete with content reassignment, and **"Change role to…"** — plus per-row **Edit** and **View posts** navigation. WordPress has no user trash, so deletion is irreversible — the app's responsibility is to make the consequences clear (modal copy varies by selection size + self-skip) and to ensure the request succeeds atomically (filter the acting user out before issuing the REST calls). Both bulk actions strip the acting user from the target set: delete would orphan the acting account, and a self-demote would strip the admin's own caps mid-flight (the server-side `check_role_update` enforces the same).

The primary **username cell** mirrors classic wp-admin: a 32px avatar (from `avatar_urls['48']`) beside a stacked display-name link (to the edit surface), the username, and a `mailto:` email. The **Role** column renders translated role display names (sourced from the resolved `roles` field `elements`, falling back to a standard-role table) instead of raw slugs.

Read shape follows PostsApp: `useEntityRecords('root', 'user', queryArgs)` with `context: 'edit'`. Without `edit` context the response omits email + roles — those columns would render empty and any future role-edit feature would silently fail. Filter by role is wired up but only the `is` operator is honored (single-role filter); multi-role filtering would need REST-side `roles__in` support.

## Architecture

UsersApp reads its DataViews spec via `useDataView(screenId)`. The baseline (fields, default view, default layouts, actions) ships in `app.json#dataView` and is injected into the resolved tree post-merge by `WP_Admin_Workspaces_Data_View_Config::inject_app_baselines`. Override paths, in order:

1. **workspace.json** — `settings.dataViews.root.user.<variant|_default>` wins as a whole-entry override (no per-field merge; same pattern as `settings.dataFields`). Site / role / user origins extend through the normal cascade.
2. **Filter** — `apply_filters('wp_admin_workspaces_data_view_config_root_user', $doc, 'root', 'user', '_default')` runs last; the per-variant `wp_admin_workspaces_data_view_config_root_user_<variant>` fires additionally when `variant !== '_default'`.

The JSON layer carries only the *shape* — locale-agnostic labels + structural flags. Render callbacks stay in `index.js`, keyed by spec id:

- **`buildFieldRenderers(elementLabel)`** maps `name` → the avatar + name-link + username + mailto cell, `email` → a `mailto:` anchor, `roles` → a comma-joined list of **translated** role names (via `roleDisplayName(slug, elementLabel)`, where `elementLabel` is the `value`→`label` map built from the resolved `roles` field `elements`). Unknown ids fall through to DataViews' default renderer for the declared type.
- **`buildActions(actions, ctx)`** compiles each `dataView.actions[]` entry into the DataViews action shape:
  - `delete` → `RenderModal` (self-delete guard + confirm UI).
  - `change-role` → `RenderModal` built with the shared `createBulkEditModal` + `fieldsWithNoChange` (a single `role` select seeded to the "— No change —" sentinel). On Apply, the modal fans `saveEntityRecord('root','user', { id, roles:[role] })` across the (self-filtered) selection — REST `PUT /wp/v2/users/{id}` with a roles-only body needs only `promote_users`. The acting user is stripped via the shared host's `filterItems` option (`createBulkEditModal({ filterItems })`, mirroring `createBulkConfirmModal`) — no calling-a-component-as-a-function wrapper — and an all-self selection short-circuits to an info notice instead of a phantom "0 users updated" success.
  - `edit` → callback navigating to `#/users/{id}/edit` (the workspace binds that to `core:profile`).
  - `view` ("View posts") → callback navigating to `#/posts?author={id}` (router nav, never `window.location`, so the admin-link interceptor governs it). `core:posts` reads the `?author=` URL slot and seeds it once as an initial `author` view-filter — the same author-filter mechanism the Posts "Mine" tab uses — so the list is actually scoped to that author (REST `?author=N`), not just navigated to the unfiltered Posts screen.
  - Other ids fall through with no callback (extension hook for plugin-contributed actions, deferred).
- **`buildFields(fields, renderers)`** compiles each `dataView.fields[]` entry into a DataViews field, copying through `enableGlobalSearch`, `enableHiding`, `enableSorting`, `elements`, `filterBy`, and attaching the matching renderer if one exists.

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — labels reach DataViews in whatever locale the spec was authored in (English, by convention). UsersApp recovers per-locale labels via two small in-app tables keyed by spec id:

```js
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-workspaces' ),
	username: __( 'Username', 'wp-admin-workspaces' ),
	email: __( 'Email', 'wp-admin-workspaces' ),
	roles: __( 'Role', 'wp-admin-workspaces' ),
	registered_date: __( 'Registered', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-workspaces' ),
	view: __( 'View posts', 'wp-admin-workspaces' ),
	'change-role': __( 'Change role to…', 'wp-admin-workspaces' ),
	delete: __( 'Delete', 'wp-admin-workspaces' ),
};
```

`buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`: the table wins for ids the app authored (translation tools see the `__()` literal at module load); the spec wins for ids the app doesn't know (plugin extension columns / actions keep whatever string the cascade supplied). Don't deduplicate this table across apps yet — premature; revisit after the entity-CRUD migration sweep lands.

### View-state resync

A small `useEffect` re-seeds local `view` state when the underlying triple changes on the same hook instance. UsersApp ships a single triple today, but the recipe matches PostsApp's so a future variant config (e.g. `?role=author`) picks up the new defaults without rewriting. The effect is keyed on the binding axis only, not on the resolved `dataView` itself, so in-session view edits aren't clobbered every time the cascade re-resolves.

### Title-field dedup

`dataView.defaultView.titleField` is `name`. DataViews renders the title cell from `view.titleField`; if `name` were also listed in `view.fields`, the table would render a second column for the same field. The `visibleView` memo strips the title id out of `view.fields` before handing the object to DataViews. Same recipe as PostsApp.

### Destructive modal

The destructive modal is rendered via DataViews' `RenderModal` shape so DataViews owns the focus trap + backdrop + dismiss. Inside the modal:

1. `currentUserId` is read from `window.wpAdminWorkspaces.userId` (injected by PHP).
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

- **Add-user flow now lives in `core:user-new`** (the `users-new` screen), not here — a `POST /wp/v2/users` form. See `src/apps/user-new/app.md`.
- **No dedicated Edit User app.** The `edit` action + the username-cell link navigate to `#/users/{id}/edit`, which the `wp-admin-default` workspace binds to `core:profile` with `config.userId: "{id}"`. `core:profile` honors `config.userId` (editing the *target* user, falling back to the acting user only when absent), so Edit edits the right account — but it surfaces only the self-service profile fields. A purpose-built Edit User app (covering role, capabilities, send-password-reset) is still a parity gap.
- "View posts" links to `#/posts?author={id}` (the author-scoped Posts list — `core:posts` reads the `?author=` slot and seeds an initial `author` view-filter, so the list is genuinely filtered to that author rather than navigating to the full Posts screen). wp-admin also shows a per-user **post count** in that column; that count is PHP-only (`count_many_users_posts`) with no REST equivalent, so it is not rendered.
- Role filter is single-select; the underlying REST endpoint accepts comma-separated roles in `?roles=`, but the queryArgs mapper only handles the `is` operator.
- Role **counts** now surface on the roles filter elements (`Editor (12)`) via the shared `useEntityElementCounts` hook — one lightweight `per_page=1&_fields=id` request per role, read off the `X-WP-Total` header. Role values come from the resolved spec `roles` elements, so the count set tracks whatever roles the workspace exposes. Still rendered as filter-dropdown options, not the standalone tab strip wp-admin uses.
- No `send-password-reset` bulk action. wp-admin offers it on the Users screen; the v2 app does not surface a REST equivalent (no `retrieve_password` REST endpoint).
- **`change-role` bulk action shipped** ("Change role to…", `promote_users`-gated, self-demote-guarded). The role chooser is sourced from the resolved `roles` field `elements`; if a workspace ships no elements, the action falls back to the standard WordPress roles. The delete reassignment target remains hard-coded to the acting user (no chooser / no "delete all content" option) — that UI divergence is unchanged.
- The plugin-contributed row-actions slot (`core:users.row-actions` per M4.5) is documented but not yet wired up.
- Roles filter `elements` are not declared in the manifest baseline because the available role list is site-dependent. Plugin authors wanting a typed dropdown can override `settings.dataViews.root.user._default.fields[id=roles].elements` in workspace.json (whole-entry override semantics — restate the full spec) or hook `wp_admin_workspaces_data_view_config_root_user` to inject the live role list at filter time.
