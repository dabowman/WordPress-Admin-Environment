# `core:desktop` engine — readiness checklist

P2 readiness for the windowed desktop engine. Lives alongside
`docs/archive/v1-readiness.md` and `docs/archive/v2-readiness.md`. This document
captures what must be green before the engine can be tagged or
merged to `main`.

## Scope

P1 (kernel `core:dynamic-children` platform service) + P2 (engine
scaffolding, WindowManager, drag / resize / snap, dock-rail registry,
desktop-iframe app, 14-subsystem chromeless bridge, theming hook,
window manifest blocks). Detailed phase plan in
[`docs/archive/plans/2026-05-12-desktop-engine-port.md`](archive/plans/2026-05-12-desktop-engine-port.md).

## Automated gates

Run before every merge. All must be green:

```bash
npm run lint:js
npm run lint:ts
npm run test:schema      # 70
npm run test:parity      # 4
npm run test:runtime     # ~277 across 13 files
npm run test:engines     # 63 (TS via Node --experimental-strip-types)
npm run build            # webpack production build, 3 pre-existing size warnings allowed

npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cascade-tests.php          # 29
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cap-tests.php              # 54
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-shape-tests.php            # 111
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-manifest-tests.php         # 67
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-tokens-tests.php           # 13
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-engine-defaults-tests.php  # 22
```

Combined: **709 assertions**.

## Manual smoke

Switch the active workspace to `developer` via the workspace-picker. Run
through every section below. Mark blockers in
[`docs/feedback.md`](feedback.md).

### Boot

- [ ] Workspace paints: wallpaper layer, empty workspace, dock visible.
- [ ] Dock launchers render with the correct icons (Posts, Media,
      Users, Settings, Site Health, Permalinks).
- [ ] Console: no errors at boot.
- [ ] No regions duplicate or stack-overlap.

### Window lifecycle

- [ ] Click each launcher — corresponding window opens.
- [ ] Each window opens at its app-manifest `window.defaultSize` (e.g.
      Editor ≥ 1200×820, Profile ≈ 720×640).
- [ ] Posts / Media / Editor (`multiInstance: true`) → second click
      opens a NEW window.
- [ ] Users / Settings / Site Health (`multiInstance: false`) →
      second click focuses the EXISTING window, doesn't stack.
- [ ] Close button removes the window from the workspace and the
      dock's live-window tile group.
- [ ] Minimize hides the window; the dock tile shows a dim state.
- [ ] Clicking the minimized window's dock tile restores + focuses.
- [ ] Maximize fills the workspace; double-clicking the titlebar
      toggles maximize / restore.

### Drag

- [ ] Pointerdown on a titlebar (off the controls) starts a drag.
- [ ] Drag is smooth — no React re-render stutter; ~60fps.
- [ ] Releasing commits the new rect (window stays at the drop spot).
- [ ] Clicking a control button (close / min / max) does NOT start
      a drag.
- [ ] Maximized windows do not drag.

### Resize

- [ ] Each of the 8 handles (N / S / E / W / NE / NW / SE / SW)
      shows the right cursor on hover.
- [ ] Drag a handle — window resizes live without re-render stutter.
- [ ] Releasing commits the new rect.
- [ ] Trying to resize below an app's `window.minSize` clamps; the
      opposite edge stays stable.
- [ ] Maximized windows do not show resize handles.

### Snap

- [ ] Dragging near the workspace top edge shows a full-screen ghost
      overlay.
- [ ] Dragging near the workspace left / right edge shows a half-
      screen ghost overlay.
- [ ] Releasing inside a zone commits the snapped rect.
- [ ] Releasing outside any zone commits the dragged rect.
- [ ] Ghost cleans up on every release (no stragglers).

### Focus

- [ ] Clicking a buried window raises it to the top.
- [ ] Clicking inside an iframe window (via the chromeless bridge's
      focus-request) raises it to the top.
- [ ] The dock's live-window tile shows the active state (larger
      indicator dot) on the topmost normal window.

### Theming

- [ ] Default desktop palette renders (dark canvas, blue wallpaper,
      translucent dock).
- [ ] Adding `styles.chrome.dock.background: "#ff0000"` to
      `developer.json` repaints the dock red — slot override
      flows through `compileStyles`.
- [ ] Adding `styles.theme.color.bg: "#1a1a2e"` repaints the canvas
      via the `theme.color.bg` ergonomic seed.
- [ ] Explicit `styles.chrome.canvas.background` wins over the seed
      in the cascade.

### Iframe + bridge

- [ ] Click "Permalinks" launcher → iframe window opens loading
      `/wp-admin/options-permalink.php?wp_admin_workspaces_chromeless=1`.
- [ ] Parent console shows `[core:desktop-iframe] bridge message
      wp-admin-workspaces-iframe-ready …` followed by
      `wp-admin-workspaces-iframe-network …` for each REST call.
- [ ] Clicking an external link in the iframe opens a new browser
      tab.
- [ ] Clicking a same-origin wp-admin link in the iframe spawns a
      new workspace window with that URL.
- [ ] Clicking inside the iframe raises its window in the z-stack.
- [ ] Pages with Screen Options / Help reveal show `screen-meta`
      messages in the parent console.

### KNOWN ISSUES (do not block merge)

- **Command-palette harvest (bridge sub-system 11) is a stub.** Plan
  §D2 accepts the upstream WP-private-API breakage cost, but the
  parent workspace's `core:command-palette` app isn't wired to consume
  iframe commands yet either. Full harvester follows the parent
  consumer wiring.
- **Instrument-set header integration** is storage-only — the
  fetch / XHR wraps don't merge `__wpAdminWorkspacesInstrument.headers`
  into outgoing requests yet, and observed network reports don't
  capture request / response headers. Devtools widgets that push
  state into `__wpAdminWorkspacesInstrument` see their writes round-trip
  but can't act on the data via the bridge until the wrap
  integration ships.

## DS pluggability

See [`docs/engines-and-design-systems.md`](engines-and-design-systems.md)
for the kernel-vs-engine-vs-app design-system boundary and the three
contracts available to alternate engines (reuse-WPDS, token-bridge,
engine-native apps). The desktop engine uses contract #1: bundled
apps render with the WPDS-default `ThemeProvider` inside windows;
the desktop engine ships its own chrome via `default-styles` +
`compileStyles`.

## P3 deferred items

Not in this readiness — each lands behind its own flag with its
own readiness pass:

- Verbatim upstream WindowManager port (~6 kLOC TS) — only land
  if the hand-rolled MVP misses needed behaviors.
- Spaces / virtual desktops, wallpapers (canvas / WebGL), widgets.
- AI Copilot, drag bridge, palette registry, presence, PWA, three
  layout modes, shared store, native-window emulation shim.

See the plan doc for ordering and effort estimates.
