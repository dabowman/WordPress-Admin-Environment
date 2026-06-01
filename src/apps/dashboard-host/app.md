# core:dashboard-host

A widget-grid controller and the workspace's **dashboard screen** app. Mounts as a screen's primary app (the bundled `dashboard-home` screen, or a `dashboard-widgets` screen) and renders every co-mounted app carrying `slot: "grid"` as a tile in a CSS Grid, beneath a greeting header.

This app **replaces the retired `core:dashboard` monolith** (issue #133 — "fold + delete"). The monolith's greeting + At-a-Glance + Activity + Recent Drafts were decomposed into host chrome (the greeting) plus four bundled default-tile apps.

## Default tile set

The bundled `wp-admin-default` shell mounts these four tiles on `dashboard-home`:

- **`core:dashboard-widget-at-a-glance`** — site-wide counts (posts / pages / pending comments / users). Aggregate, NOT author-scoped.
- **`core:dashboard-widget-activity`** — recently published posts + comments awaiting moderation. Site-wide.
- **`core:dashboard-widget-recent-posts`** — Recent Drafts, **author-scoped** to the acting user (`author: userId` + `enabled: !!userId`, fail-closed; issue #217). Drafts never leak across authors.
- **`core:dashboard-widget-quick-draft`** — title + body mini form that creates a draft and opens the editor.

The **greeting is host chrome** — a `<header>` above the grid rendering a time-of-day greeting + the acting user's display name (read via `useEntityRecord('root','user', userId)`). It is deliberately NOT a tile (issue #133 design note).

## Architecture

```
Screen: dashboard-home
  apps: [
    { id: "host",         app: "core:dashboard-host"                                  },
    { id: "at-a-glance",  app: "core:dashboard-widget-at-a-glance",  slot: "grid"     },
    { id: "activity",     app: "core:dashboard-widget-activity",     slot: "grid"     },
    { id: "recent-posts", app: "core:dashboard-widget-recent-posts", slot: "grid"     },
    { id: "quick-draft",  app: "core:dashboard-widget-quick-draft",  slot: "grid"     },
  ]

┌────────────────────────────────────────────────────┐
│ Region: core:main                                  │
│   ┌── region__app ─────────────────────────────┐   │
│   │ <core:dashboard-host config={ screenId }>  │   │
│   │   ├ Greeting header (host chrome)          │   │
│   │   ├ Tile (at-a-glance → MountedApp)        │   │
│   │   ├ Tile (activity    → MountedApp)        │   │
│   │   ├ Tile (recent-posts → MountedApp)       │   │
│   │   └ Tile (quick-draft  → MountedApp)       │   │
│   └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

The host reads three inputs:

1. **`config.screenId`** — injected by the v3 compiler when a route mounts this app (the compiler always adds `screenId` to the route's config). Tells the host which screen to look up.
2. **`config.screens[screenId].apps[]`** — the workspace's screen definition. The host filters this array to entries carrying `slot: "grid"`.
3. **`window.wpAdminShell.manifests.apps`** — the per-mount app manifest. Each widget app's `slotHints` block supplies size + position defaults.

`composeScreenWidgets({ screen, manifests })` builds the resolved tile list. Per-entry `size` / `position` override the manifest's `slotHints` per-property at the install layer.

## v3 vs v2

- **v2** read manifest `dashboardWidget` blocks + admin.json's top-level `dashboardWidgets` overrides. Both have been retired in v3; placement now follows the uniform screen-app model.
- **v3** dissolves the C4 widget API into `screens[id].apps[]` with `slot: "grid"`. Apps still ship intrinsic defaults — through the new `slotHints` block on app manifests — but install-layer placement lives on the screen-app entry.
- The v3 compiler ships a back-compat path (`translate_v2_dashboard_widgets`) that folds v2-shape `dashboardWidgets` into the `dashboard-widgets` screen's `apps[]` when both are present. Authors get one cycle to migrate; `_doing_it_wrong` fires under `WP_DEBUG`.

## Slot vocabulary

The host declares a single slot — `grid` — in its `app.json#slots`. The slot is screen-scoped: other apps in the screen's `apps[]` array reference it via their `slot` field. Apps in a screen that the host doesn't preside over ignore the slot vocabulary.

The slot's `accepts: "widget"` hint tells authoring tools that widgets — apps shipping `slotHints` — are the natural fit.

## Layout

```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
grid-auto-rows: minmax(160px, auto);
gap: var(--wpds-dimension-padding-lg);
```

Tiles set inline `grid-column: span N` / `grid-row: span M` from their resolved `defaultSize`. Explicit `{row, col}` positions translate to `grid-row-start` / `grid-column-start` so authors can pin tiles to specific cells; collisions resolve via DOM order (later widgets win).

## Programmatic registration

`wp_admin_shell_register_dashboard_widget($id, $args)` survives untouched as a public API. Under the hood it contributes a screen-app entry into `screens[dashboard-widgets].apps[]` (or whatever `$args['screen']` names), pointing at `$id` with `slot: "grid"` and any supplied `size` / `position`.

Two flavors as before:

- **Override flavor** — `$args` carries placement only. The app must already be registered separately.
- **Standalone flavor** — `$args` additionally carries `script` (+ optional `role`, `capabilities`, `slotHints`). The function synthesizes a minimal app manifest with `slotHints` derived from the args.

Tombstones — `$args['hidden'] = true` translates to a cascade `__tombstone` marker that drops a matching entry id from the resolved screen.

## Rebuild guide (non-WPDS / non-React)

A rebuild needs:

- A read of `config.screens[screenId].apps[]` filtered by `slot === 'grid'`.
- A read of each entry's referenced manifest's `slotHints` block — same shape as `admin-app-v3.json#/$defs/slotHints`.
- A merge equivalent to `composeScreenWidgets({ screen, manifests })` — per-entry `size`/`position` override `slotHints` per-property; `defaultSize` clamped to `minSize`.
- A grid container with `display: grid` + auto-fill columns at the design-system's card-grid breakpoint.
- A way to mount the widget app inside each tile — for the shell, this is `<MountedApp>` which threads cap gating + theming. Rebuilds need an equivalent.

## Known limitations

- **No drag-to-reorder.** Widget order is config-driven. Authors reorder via the entry order in `apps[]` and `position` overrides.
- **No WP-core dashboard bridge.** Legacy widgets registered via `wp_add_dashboard_widget()` don't render here — they emit jQuery-bound HTML and need a separate bridge. Deferred.
- **No min-height enforcement at the widget level.** `minSize` clamps `defaultSize` but the CSS grid's `grid-auto-rows: minmax(160px, auto)` sets the floor uniformly. A widget asking for `minSize: { w: 1, h: 2 }` gets 2 grid-row spans, not 2× the row-min.
- **Single grid per screen.** The host expects to be one of the apps in a single screen. Multiple grids on the same screen (e.g., split-view with two separate widget regions) aren't modeled — declare a second screen if needed.

## Parity gaps vs `docs/screens/dashboard-home.md`

The host **is** the workspace dashboard home now — the retired `core:dashboard` monolith (`src/apps/dashboard/`, deleted in #133) was folded into this host plus the four default-tile apps above. Remaining gaps versus wp-admin's dashboard:

- **No WP-core dashboard-widget bridge.** Plugin widgets registered via `wp_add_dashboard_widget()` (jQuery-bound HTML) don't render here — that bridge is tracked in #134, which depends on this fold.
- **No "Welcome" / Site Health / Events-and-News widgets.** Only the four canonical tiles ship by default.
- **At-a-Glance counts don't deep-link** to their filtered list screens yet.
- **No drag-to-reorder** — widget order is config-driven via `apps[]` order + `position` overrides.
