# core:themes

Prose accompanying `app.json#documentation` for the themes browser.

## Overview

ThemesApp surfaces every installed theme through a DataViews host bound to the `root/theme` entity. The default layout is **grid** (screenshot tiles with name + status + truncated description); the secondary **table** layout offers sortable columns for power users. Status sorts ascending by default so the lone `active` theme floats above the `inactive` block — DataViews' built-in pagination, filtering, and selection take it from there.

Activation runs through an out-of-band custom endpoint because WordPress core REST does not expose a theme-switch operation natively — and falls back to wp-admin's classic activate link when the endpoint is missing. This **graceful-fallback** pattern is the most interesting thing here: when an optimized native path can't be guaranteed (custom endpoint missing, plugin gated, etc.), the right answer is often "navigate the user back into wp-admin to complete the action" rather than failing loudly. The user gets the correct outcome with one extra page load — preferable to a broken Activate button.

## Architecture

Four pieces of state drive the app:

1. **`viewConfig`** — pulled via `useViewConfig('root', 'theme', config.variant)`. Carries the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#viewConfig` and reaches the resolved cascade via `inject_app_baselines`. Sites and plugins override via admin.json `viewConfigs.root.theme._default` (or a named variant) or the `wp_admin_shell_view_config_root_theme` filter. **Field renderers and action callbacks live in the React layer** — the spec carries data only; `buildFieldRenderers()` and `buildActions()` in `index.js` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `viewConfig.defaultView`. Owned by the app; DataViews calls `onChangeView(next)` on every user-driven change.
3. **`themes`** — the raw entity records from `useEntityRecords('root', 'theme', { context: 'edit', status: 'active,inactive' })`.
4. **`data`** — a `useMemo` projection of `themes` into the flat row shape DataViews wants (`{ id, name, screenshot, status, description, version, author, theme_uri, rawRecord }`). `id` is the stylesheet (themes are keyed by slug, not numeric id).

The Activate action calls a `useCallback` `activate(theme)` that:

1. POSTs `/wp-admin-shell/v1/activate-theme` with `{ stylesheet }`.
2. On success: `invalidateResolution` on the theme query + emits a success snackbar.
3. On failure: `window.location.href = adminUrl + 'themes.php?action=activate&stylesheet=...'` so the user lands in wp-admin's flow.

The Details action uses DataViews' `RenderModal` shape — DataViews owns the focus trap, backdrop, and dismiss handling. Inside the modal the app renders the full description + version + author + Theme site link + an inline Activate button (visible only when `status !== 'active'`).

## View-config integration (C2)

ThemesApp consumes the C2 view-config primitive (spec §13 #7). The cascade flow mirrors PostsApp's:

1. **Baseline** lives in `app.json#viewConfig`. `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **Admin.json overrides** under `viewConfigs.root.theme.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline.
3. **Filter overrides** run last via `wp_admin_shell_view_config_root_theme` (`..._{$variant}` when present). Useful for dynamic mutations that JSON can't express.
4. **ThemesApp consumes** via `useViewConfig('root', 'theme', config.variant)` → `{ config, isLoading }`. The hook reads from `window.wpAdminShell.config.viewConfigs` synchronously when present; otherwise falls through to `/wp-admin-shell/v1/view-config`.

The renderer tables (`buildFieldRenderers`, `buildActions`, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. View-config overrides that introduce an unfamiliar field id fall through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (declared but inert).

### Translation recipe

View-configs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#viewConfig` and admin.json overrides reach DataViews with raw strings in whatever locale the spec was authored in. ThemesApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    name:        __( 'Name',        'wp-admin-shell' ),
    screenshot:  __( 'Screenshot',  'wp-admin-shell' ),
    status:      __( 'Status',      'wp-admin-shell' ),
    description: __( 'Description', 'wp-admin-shell' ),
    version:     __( 'Version',     'wp-admin-shell' ),
    author:      __( 'Author',      'wp-admin-shell' ),
};

const ACTION_LABELS = {
    activate: __( 'Activate', 'wp-admin-shell' ),
    details:  __( 'Details',  'wp-admin-shell' ),
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
- **Custom theme-switch endpoint** (or fall back to wp-admin's `themes.php?action=activate&stylesheet=...&_wpnonce=…` link). Rebuilds need their own server-side hook.
- **Action modal** that DataViews-style accepts `{ items, closeModal, onActionPerformed }`. Any modal primitive works; the contract is open-on-invoke, await close.

Two patterns to preserve:

- `context: 'edit'` is **required** for the read — without it the description and author render as decoded HTML.
- Stylesheet (slug) is the row identity, not a numeric id. Set `getItemId={ ( item ) => item.id }` where `id = stylesheet`.

## Known limitations

- No install / upload flow. Adding themes happens in wp-admin.
- No theme preview (live preview via Customizer or block-theme preview).
- Screenshots are loaded directly from the theme record; no resizing or `srcset`.
- Description truncation is hard 140 chars in the grid card. Full description lives in the details modal.
- The fallback URL flow loses the user's place in the shell; we don't restore it on return.
- **The classic-activate fallback link is missing `_wpnonce`.** `themes.php?action=activate&stylesheet=…` requires a fresh nonce or it silently bounces back to the themes list without activating. Per `docs/research/app-validation-2026-05-04.md`, this fallback path should either (a) call `wp_create_nonce('switch-theme_'.stylesheet)` from PHP and inject the resulting `&_wpnonce=…` into the link, or (b) route through a small PHP shim that performs the activation server-side. Until then, the fallback is best-effort only.
- DataViews' built-in client-side pagination is used (the full theme list returns in one request); the `paginationInfo` is hard-coded to `totalPages: 1` because themes-per-install rarely exceeds the page size.

Parity gaps versus `docs/screens/themes.md` not surfaced in the v2 app:

- No "Add New Theme" upload affordance.
- No live-preview / customizer launch.
- No multisite "Network Activate" action variant.
- No theme-update notice integration.
- No theme delete action — wp-admin's row Delete + capability gate are not wired up here.
