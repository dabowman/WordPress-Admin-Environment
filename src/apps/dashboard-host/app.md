# core:dashboard-host

A widget-grid controller. Mounts inside any region (typically one using the `core:dashboard-grid` engine template) and renders every app that declares a `dashboardWidget` manifest block as a tile in a CSS Grid.

## Architecture

```
┌────────────────────────────────────────────────────┐
│ Region: <template: core:dashboard-grid>            │
│   ┌── region__app ─────────────────────────────┐   │
│   │ <core:dashboard-host>                      │   │
│   │   ├ Tile (core:dashboard-widget-recent-…) │   │
│   │   ├ Tile (core:dashboard-widget-quick-…)  │   │
│   │   └ Tile (plugin:foo/sales-stats)         │   │
│   └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

The host reads two inputs:

1. **Manifest registry** — every app whose `app.json` declares a `dashboardWidget` block is a candidate widget. The block carries the app's intrinsic preferences: `title`, `defaultSize`, `minSize`, `position`.
2. **admin.json `dashboardWidgets`** — per-id overrides. Authors hide widgets they don't want (`hidden: true`), resize them, or pin them to explicit grid cells.

`composeWidgets(manifests, overrides)` merges the two with admin.json winning per-property. Hidden widgets drop out; size + position resolve.

## Layout

The `core:dashboard-grid` template paints the grid:

```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
grid-auto-rows: minmax(160px, auto);
gap: var(--wpds-dimension-padding-lg);
```

Tiles set inline `grid-column: span N` / `grid-row: span M` from their resolved `defaultSize`. Explicit `{row, col}` positions translate to `grid-row-start` / `grid-column-start` so authors can pin tiles to specific cells; collisions resolve via DOM order (later widgets win).

## Rebuild guide (non-WPDS / non-React)

A rebuild needs:

- A read of the per-app `dashboardWidget` block — same shape as in `admin-app-v2.json#dashboardWidget`.
- A read of admin.json `dashboardWidgets` (top-level block).
- A merge equivalent to `composeWidgets.mjs` — admin.json wins per-property, `hidden: true` removes, `defaultSize` clamped to `minSize`.
- A grid container with `display: grid` + auto-fill columns at the design-system's card-grid breakpoint.
- A way to mount the widget app inside each tile — for the shell, this is `<MountedApp>` which threads cap gating + theming. Rebuilds need an equivalent.

## Known limitations

- **No drag-to-reorder.** Widget order is config-driven (matches CIAB's parallel dashboard-widgets system). Authors reorder via admin.json `position`.
- **No WP-core dashboard bridge.** Legacy widgets registered via `wp_add_dashboard_widget()` don't render here — they emit jQuery-bound HTML and need a separate bridge. Deferred per the Track C plan.
- **No min-height enforcement at the widget level.** `minSize` clamps `defaultSize` but the CSS grid's `grid-auto-rows: minmax(160px, auto)` sets the floor uniformly. A widget asking for `minSize: { w: 1, h: 2 }` gets 2 grid-row spans, not 2× the row-min.

## Parity gaps vs `docs/screens/dashboard-home.md`

The host does NOT rebuild the wp-admin dashboard home — it ships an extensible widget grid. The original `core:dashboard` app (`src/apps/dashboard/`) still rebuilds `dashboard-home`; the C4 host is parallel infrastructure.
