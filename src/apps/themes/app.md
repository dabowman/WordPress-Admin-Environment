# core:themes

Prose accompanying `app.json#documentation` for the themes browser.

## Overview

ThemesApp surfaces every installed theme through a DataViews host bound to the `root/theme` entity. The default layout is **grid** (screenshot tiles with name + status + truncated description); the secondary **table** layout offers sortable columns for power users. Status sorts ascending by default so the lone `active` theme floats above the `inactive` block — DataViews' built-in pagination, filtering, and selection take it from there.

Activation runs through an out-of-band custom endpoint (`POST /wp-admin-workspaces/v1/activate-theme`, gated on `switch_themes`) because WordPress core REST does not expose a theme-switch operation natively. On failure the app surfaces an error snackbar and keeps the user in place rather than navigating away — see the known-limitations note below.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Carries the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` and reaches the resolved cascade via `inject_app_baselines`. Sites and plugins override via workspace.json `settings.dataViews.root.theme.<variant|_default>` or the `wp_admin_workspaces_data_view_config_root_theme[_<variant>]` filter. **Field renderers and action callbacks live in the React layer** — the spec carries data only; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `dataView.defaultView`. Owned by the app; DataViews calls `onChangeView(next)` on every user-driven change.
3. **`themes`** — the raw entity records from `useEntityRecords('root', 'theme', { context: 'edit', status: 'active,inactive' })`.
4. **`data`** — a `useMemo` projection of `themes` into the flat row shape DataViews wants (`{ id, name, screenshot, status, description, version, author, theme_uri, template, tags, isBlockTheme, rawRecord }`). `id` is the stylesheet (themes are keyed by slug, not numeric id). A sibling `themeNames` memo (`{ stylesheet → name }`) lets a child theme's modal name its parent.

The Activate action calls a `useCallback` `activate(theme)` that:

1. POSTs `/wp-admin-workspaces/v1/activate-theme` with `{ stylesheet }`.
2. On success: `invalidateResolution` on the theme query + emits a success snackbar; returns `true`.
3. On failure: emits an error snackbar with the decoded WP_Error message (no navigation away); returns `false`.

The inline Activate button in the details modal awaits that boolean and only calls `closeModal()` on `true`, so a failed activation keeps the modal open (with the error snackbar) rather than dismissing as if it succeeded.

The Details action uses DataViews' `RenderModal` shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app renders the full description + version + author + Theme site link + an inline Activate button (visible only when `status !== 'active'`), plus the read-side parity additions below.

### Details-modal read-side parity (issue #137)

- **Child-theme parent.** When the record's `template` (parent stylesheet) differs from its own `stylesheet`, the modal shows "This is a child theme of {parent}", resolving the parent's display name through the `themeNames` lookup (falling back to the raw slug). Non-child themes always have `template === stylesheet` from the REST API — a truthy `template` alone is not the signal; the `template !== stylesheet` check is required.
- **Tags.** The theme's tags (`tags.raw`, falling back to splitting `tags.rendered`) render as a comma-joined "Tags: …" line.
- **Live Preview.** Inactive themes get a Live Preview link via `customize.php?theme={slug}`. Both block and classic themes use the Customizer path — the Customizer is in the hijack endpoint allowlist and correctly previews the chosen theme. The native block-theme path (`site-editor.php?wp_theme_preview={slug}`) is intentionally NOT used: the kernel's admin-link interceptor routes `site-editor.php` to the workspace `/site-editor` route and strips the `?wp_theme_preview` param, which would open the active theme's editor rather than previewing the selected one. `livePreviewUrl()` reads the admin base from `window.wpAdminWorkspaces.adminUrl`.

## DataView integration (C2 / v3 restored)

ThemesApp consumes the dataView primitive (spec §13 #7). The cascade flow mirrors PostsApp's:

1. **Baseline** lives in `app.json#dataView`. `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **workspace.json overrides** under `settings.dataViews.root.theme.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline.
3. **Filter overrides** run last via `wp_admin_workspaces_data_view_config_root_theme` (`..._{$variant}` when present). Useful for dynamic mutations that JSON can't express.
4. **ThemesApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminWorkspaces.config` snapshot synchronously when present; otherwise falls through to `/wp-admin-workspaces/v1/data-view?screen=<id>`.

The renderer tables (`buildFieldRenderers`, `buildActions`, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. DataView overrides that introduce an unfamiliar field id fall through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (declared but inert).

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#dataView` and workspace.json overrides reach DataViews with raw strings in whatever locale the spec was authored in. ThemesApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    name:        __( 'Name',        'wp-admin-workspaces' ),
    screenshot:  __( 'Screenshot',  'wp-admin-workspaces' ),
    status:      __( 'Status',      'wp-admin-workspaces' ),
    description: __( 'Description', 'wp-admin-workspaces' ),
    version:     __( 'Version',     'wp-admin-workspaces' ),
    author:      __( 'Author',      'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
    activate: __( 'Activate', 'wp-admin-workspaces' ),
    details:  __( 'Details',  'wp-admin-workspaces' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;   // fields
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;  // actions
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions keep whatever string the cascade supplied. STATUS_LABELS plays the same role for the `active`/`inactive` enumeration — the `status` renderer maps record values to translated strings; the table also seeds the field's `elements` array when the spec doesn't declare one.

Modal copy (Theme site / Close / Activate / Version / Author labels) lives as inline JSX `__()` literals and translates normally — only spec-supplied DataViews label fields needed the recipe.

## Rebuild guide

For a non-WPDS / non-DataViews rebuild:

- **List/grid component** with media-aware grid cards + sortable table fallback. MUI's `DataGrid` works for the table half; the grid half is a flex/grid layout + media field renderer.
- **REST/core-data adapter** that exposes `root/theme` records with `{ context: 'edit', status: 'active,inactive' }`.
- **Custom theme-switch endpoint.** The workspace ships `WP_Admin_Workspaces_Themes_REST` (`POST /wp-admin-workspaces/v1/activate-theme`, gated on `switch_themes`, validates the stylesheet via `wp_get_theme()` then calls `switch_theme()`). Rebuilds need their own equivalent server-side hook — WordPress core REST exposes no theme-switch operation (upstream parity #143).
- **Action modal** that DataViews-style accepts `{ items, closeModal, onActionPerformed }`. Any modal primitive works; the contract is open-on-invoke, await close.

Two patterns to preserve:

- `context: 'edit'` is **required** for the read — without it the description and author render as decoded HTML.
- Stylesheet (slug) is the row identity, not a numeric id. Set `getItemId={ ( item ) => item.id }` where `id = stylesheet`.

## Known limitations

- No install / upload flow. Adding themes happens in wp-admin.
- Live Preview is now a details-modal link for inactive themes (issue #137) — both block and classic themes use `customize.php?theme={slug}` (the Customizer correctly previews any theme including block themes, and is in the hijack allowlist). There is no in-app preview canvas; the link navigates out to the classic Customizer surface. The native block-theme path (`site-editor.php?wp_theme_preview`) is not used because the kernel's admin-link interceptor strips the query param (known limitation; deferred until the Site Editor route supports a `wp_theme_preview` pass-through).
- Screenshots are loaded directly from the theme record; no resizing or `srcset`.
- Description truncation is hard 140 chars in the grid card. Full description lives in the details modal.
- Activation runs entirely through the workspace REST endpoint (`WP_Admin_Workspaces_Themes_REST`); apiFetch sends the REST nonce automatically. On failure the app surfaces an error snackbar instead of navigating away, so the user keeps their place in the workspace.
- DataViews' built-in client-side pagination is used (the full theme list returns in one request); the `paginationInfo` is hard-coded to `totalPages: 1` because themes-per-install rarely exceeds the page size.

Parity gaps versus `docs/screens/themes.md` not surfaced in the v2 app:

- No "Add New Theme" upload affordance.
- No multisite "Network Activate" action variant.
- No theme-update notice integration.
- No theme delete action — wp-admin's row Delete + capability gate are not wired up here.
