# core:plugins

Prose accompanying `app.json#documentation` for the plugin manager.

## Overview

PluginsApp lists every installed plugin and surfaces the activate / deactivate / delete actions with `activate_plugins` capability gating. Unlike most DataViews apps in the shell, the read is one-shot — there's no server-side pagination (REST returns the full list in a single request), so search + status filter run client-side against `data` in `useMemo`. This is fine because plugin counts are typically tens, not thousands.

Mutations split between two layers:

- **Reads** go through `core-data`'s `useEntityRecords('root', 'plugin')` so the entity layer caches the full list.
- **Writes** go through `apiFetch` directly because the plugin endpoint accepts a `{ status }` PATCH shape that doesn't map cleanly to `saveEntityRecord`. After each mutation, `invalidateResolution('getEntityRecords', ['root', 'plugin', query])` is fired manually so the entity layer refetches.
- **Install** is the one write that DOES go through `core-data` — it's a create against the collection, which `saveEntityRecord('root', 'plugin', { slug, status })` maps cleanly (the shared `createEntityFormModal` create mode owns that call). It still invalidates the same query so the new plugin appears.

## Add New Plugin

A toolbar above the DataViews list carries two header actions:

- **Add New Plugin** opens a small install-by-slug form built with the shared `createEntityFormModal` create mode (`src/apps/_shared/dataviews/EntityFormModal.js`), hosted in a `@wordpress/components` `Modal`. The `DataForm` collects a wordpress.org directory `slug` (required) and an "Activate after install" boolean. `toRecord` maps the form data to the REST payload `{ slug, status }` — `status: 'active'` when activate is checked, else `'inactive'`. The create body POSTs `/wp/v2/plugins` via `saveEntityRecord`, shows a success snackbar / error notice, and `onSaved` invalidates `root/plugin` so the list refreshes. The factory returns a bare body (no `<Modal>`), so the app wraps it in its own `Modal`; `closeModal` flips the app's `isInstalling` state. Create mode ignores `items`, so it's passed `items={[]}`.
- **Upload plugin (.zip)** opens a `Modal` hosting the shared `UnavailableViaApi` (`kind="action"`). The REST `create_item` controller accepts a wordpress.org `slug` only — there is no multipart/file path — so the zip-upload flow has no clean REST surface. The fallback links to classic `plugin-install.php?tab=upload` (via the capture-phase admin-link interceptor), a copy-paste `wp plugin install <path-to-zip>` WP-CLI command, and an advisory agent prompt. This is the documented no-API fallback treatment.

## Architecture

The DataViews spec — fields, default view, default layouts, actions — comes from the dataView primitive at `(root, plugin, <variant|_default>)`. The app's `dataView` block in `app.json` is the baseline; admin.json `settings.dataViews.root.plugin.<variant|_default>` and the `wp_admin_shell_data_view_config_root_plugin[_<variant>]` filter override per-field. The hook call is `useDataView(screenId)`.

Field renderers and action callbacks stay in `index.js`, keyed by spec id. `buildFields(dataView.fields, fieldRenderers)` and `buildActions(dataView.actions, { setPluginStatus, deletePlugins })` compile the JSON specs into DataViews shape — unknown spec ids fall through (renderer absent → DataViews built-in renderer; callback absent → action is decorative). The single `RenderModal` is keyed on `spec.id === 'delete'` because the destructive confirm flow needs JSX that JSON can't carry.

Eligibility is mostly declarative via `eligibleWhen` (`{ status: 'inactive' }` / `{ status: ['active','network-active'] }`). The `visit` action's "has plugin URI" check isn't expressible in equality/membership form, so an `eligibilityOverrides[ 'visit' ]` table in `index.js` shadows the declarative spec for that one id.

The client-side filter compares against the search string in name + stripped description. `stripTags()` runs once at projection time. The status filter accepts both array (`isAny`) and scalar (`is`) operator shapes.

Error handling is **terminal**: when a mutation fails, the app replaces the table with an error notice and stays there until the next action attempt clears it. This is more conservative than other DataViews apps in the shell (which surface dismissible banners) — plugin-state corruption is high-consequence enough that a noisy error feels right.

Plugin paths (`hello-dolly/hello.php`) carry slashes; `encodeURIComponent` is mandatory before interpolating into the REST path.

### Translation recipe

DataView specs ship as locale-agnostic JSON (spec §13 #7), so the cascade reaches DataViews with raw English labels regardless of the user's locale. PluginsApp keeps two `__()`-wrapped tables — `FIELD_LABELS` and `ACTION_LABELS` — keyed by spec id. `buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`: the table wins for ids the app authored (translation tools see the literal at module load), the spec wins for ids the app doesn't know (third-party extension columns / actions keep whatever string the cascade supplied). `STATUS_LABELS` maps the categorical `status` values (`active` / `inactive` / `network-active`) to localized strings the same way.

## Rebuild guide

The architectural pattern worth preserving: **single-shot read + manual invalidation on write**. For a non-`core-data` rebuild:

- Issue one `GET /wp/v2/plugins?context=edit` on mount; cache the response.
- Run search + filter client-side against the cached list.
- On activate/deactivate/delete, fire the REST call, then **refetch** (not patch the local cache — let the server be the source of truth).
- During refetch, the table can either show the previous state (optimistic) or a spinner (pessimistic). Shell uses the latter via `isLoading`.

A non-WPDS rebuild needs the standard DataViews equivalents plus an error banner primitive. The dataView primitive is independent of the design system — a non-React rebuild reads the resolved doc from `GET /wp-admin-shell/v1/data-view?kind=root&name=plugin&variant=_default` and consumes the same `fields[]` / `actions[]` arrays.

## Known limitations

- Install-by-slug is supported (the "Add New Plugin" header action), but the full **Add New** directory browse — search wordpress.org, Featured/Popular/Recommended/Favorites tabs, plugin cards with ratings/active-installs/compatibility — is not ported. That's blocked on a missing REST surface: `plugins_api()` is not exposed through `/wp/v2`. (Parity gap vs `docs/screens/plugins.md`.)
- **Zip upload has no clean REST surface** — `POST /wp/v2/plugins` `create_item` accepts a wordpress.org `slug` only. The "Upload plugin (.zip)" header action falls back to the shared `UnavailableViaApi` affordance (classic `plugin-install.php?tab=upload` + WP-CLI + agent prompt) rather than uploading in-app. (Parity gap vs `docs/screens/plugins.md`.)
- No update flow. WordPress shows an "Update available" indicator + bulk update; the app reads `version` but doesn't compare against the .org repository version. (Parity gap vs `docs/screens/plugins.md`.)
- Network-active deactivation falls through the multisite delegation chain; we don't verify the multisite path actually completes.
- The activate path doesn't surface a fatal-error rollback. If activation triggers a PHP error, WordPress traps it and returns `update`/`network_active` state; we don't currently parse that response to show a contextual error.
- DataView `eligibleWhen` only expresses equality / membership. Predicates that need code (e.g. `visit` requires a non-empty `pluginUri`) live in the `eligibilityOverrides` table in `index.js`. A third-party action declared via `settings.dataViews.root.plugin._default.actions` can only express its eligibility declaratively unless the consuming app ships matching code.
- Status **counts** surface on the status filter elements (`Active (5)`, `Inactive (2)`). Because the read is one-shot and unpaginated, these are derived client-side from `records` in a `useMemo` — no extra count requests, unlike the server-paginated list apps. Rendered as filter-dropdown options, not a standalone tab strip.
