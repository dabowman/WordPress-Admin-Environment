# Desktop Mode → `core:desktop` Engine Port

**Date:** 2026-05-12
**Status:** Draft (research-grade plan; needs sign-off before P1 starts)
**Owner:** TBD
**Target:** v2.x branch (post v2.0.0-beta.2)
**Companion:** [`docs/research/desktop-mode-engine-feasibility.md`](../research/desktop-mode-engine-feasibility.md) — full feasibility study + risk validation backing the decisions here.

## Goal

Ship `core:desktop` — a third engine alongside `core:default` + `core:single-pane` — that reproduces [WordPress/desktop-mode](https://github.com/WordPress/desktop-mode)'s desktop-OS UX on top of the WP Admin Shell kernel. Admin screens open as draggable, resizable, minimizable windows in a wallpapered workspace with a dock built from the resolved admin.json nav tree.

Reuse existing `core:*` apps unchanged. Reuse cascade resolver, capability gating, URL routing, ThemeProvider seam, `compileStyles` hook. Add only the kernel generalizations the workspace metaphor strictly needs.

## Non-goals (this plan)

- **Plugin-author API compat** — no `wp.desktop.registerWindow()` emulation shim in P1/P2. Document a migration path from desktop-mode plugins; ship the shim in P3 if demand justifies.
- **Spaces / virtual desktops.** Single workspace. Defer.
- **Wallpapers (canvas/WebGL), widgets, AI Copilot, palette registry, drag bridge, presence, PWA, shared store, three layout modes.** Each lives as its own engine extension in P3+.
- **Replacing chrome apps for the bundled core engines.** `core:desktop` is additive — `core:default` and `core:single-pane` keep their current chrome-app set.
- **`<wpd-*>` Web Component library.** Apps already use WPDS. Skip the kit entirely.
- **Native-window plugin discovery from PHP** (`desktop_mode_register_window()` PHP API). Engine reads `app.json` discovery; no PHP-side window registry.

## Phasing

Three independent phases. Each ships behind feature flag; each is reviewable + revertable on its own.

| Phase | Scope | Effort | Ships |
|---|---|---|---|
| **P1 — Kernel generalizations** | Region placement vocab, multi-instance app mounts, `window` block schema | 3 days | Standalone PR. Benefits future engines beyond desktop. |
| **P2 — `core:desktop` MVP** | Workspace + iframe windows + dock + bridge subset. Single space. Reuse `core:*` apps. | 2.5–3.5 weeks | Demo on `shells/desktop-demo.json`. Bundled engine; opt-in per shell. |
| **P3 — Feature buildout** | Bridge full parity, spaces, wallpapers, widgets, drag, palette, AI, presence, native-window emulation shim | months | Each subsystem behind its own flag. |

P1 lands first regardless of P2 decision — the kernel changes have value to other engines (split-view editing in `core:default`, MDI metaphors).

---

## P1 — Kernel generalizations (3 days)

**Architecture pivot (2026-05-12).** Earlier draft added a `window-canvas` placement + multi-instance `instanceKey` routing slot + engine-side `CanvasRegion`/`DockRegion` slots. Replaced with a single, smaller generalization: **regions can host runtime-mutated child regions.** Windows become first-class child regions of a compositor region; multi-instance, per-window routing/dirty-state/trigger/cap scoping all fall out of existing region-ID-based machinery (spec §5.5 `parent/child` IDs already work). The dock is a plain `persistent` region with a navigation-renderer app — no new kernel concept.

Three small, generalizable additions remain. Each is independently testable.

### P1.T1 — `core:dynamic-children` platform service + runtime child API

**Goal.** A region template may declare `platform[ 'core:dynamic-children' ]: true`. The kernel exposes a mutation API the region's mounted app can consume to add/remove child regions at runtime. The kernel renders dynamic children through the same `<Region>` recursion as static `region.regions[]`, so they inherit ARIA roles, capability gating, theming scope, routing slots, dirty-state, triggerStore — every kernel service keyed by region ID.

**Why this replaces the earlier P1 trio.** Each window IS a region under this model:

- **Multi-instance** = two child regions with parent-namespaced IDs (`workspace/win-123`, `workspace/win-456`). No `instanceKey` plumbing — region ID is the namespace.
- **Routing** = each window region declares its own `routing.route-key`; `useRouteForRegion` already keys per region.
- **Dirty-state + triggerStore** = both already key by region ID. Per-window scoping is automatic.
- **Capability gating** = `<Region>`'s `userCan` fast-path runs per child. Free.
- **ARIA + theming** = child region declares its own `role`, picks up `styles.regions[regionId]` scoping.
- **Recursive composition** (window-containing-split) = existing spec §5.5 nested-region pattern.

**Files touched:**

- `src/runtime/regions/dynamicChildren.mjs` (new) — store + subscription. `createDynamicChildrenStore()` returns `{ add(parentId, key, decl), remove(parentId, key), list(parentId), subscribe(parentId, listener) }`. Pure ESM; testable in isolation. `add()` runs `validateRegion(decl)` before storing.
- `src/runtime/kernel-context.js` — store instance hung off kernel context; `useDynamicChildren(parentRegionId)` hook returns the live array via `useSyncExternalStore`.
- `src/runtime/regions/Region.js` — `renderChildren()` becomes a component (call it `<RegionChildren>`) that reads static `region.regions` AND merges in `useDynamicChildren(region.id)`. Static children render first; dynamic children append. React keys come from each child's `key` field.
- `src/runtime/regions/platformServices.mjs` — new accessor `hostsDynamicChildren(region)`.
- `docs/schemas/admin-engine-v2.json` — document the new platform service in the §146 prose (no enum addition needed; vocabulary is open).
- `docs/wp-admin-shell-design-spec.md` §5.3 + §5.5 — document the service + runtime children semantics. §5.5 already covers `parent/child` IDs; clarify that the parent half can be runtime-mutated.
- `tests/runtime/dynamicChildren.test.mjs` (new) — add/remove/list/subscribe + validation rejection + ID nesting.
- `tests/runtime/Region.test.mjs` (extend) — static + dynamic children render together; remove unmounts; React key stability.

**Acceptance:** A region with `platform[ 'core:dynamic-children' ]: true` whose mounted app calls `add('workspace', 'win-123', { id: 'win-123', role: 'region', app: 'core:posts', config: { postType: 'post' } })` produces a fully-functional sub-region with ID `workspace/win-123`. Its routing slot, dirty-state, triggerStore, capability gate, and ARIA role all operate exactly as if it had been declared statically. Two `add()` calls with different keys produce two independent React subtrees. Existing static-children-only regions render unchanged (zero performance regression for engines that never mutate children).

### P1.T2 — `window` block in `admin-app-v2.json`

**Goal.** Optional manifest block declaring window-mount defaults. Default engines ignore. `core:desktop` reads at mount.

**Files touched:**

- `docs/schemas/admin-app-v2.json` — add `properties.window`:
  ```jsonc
  "window": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "defaultSize": { "type": "object", "required": ["w","h"], "properties": { "w":{"type":"integer"}, "h":{"type":"integer"} } },
      "minSize":     { "$ref": "#/properties/window/properties/defaultSize" },
      "chrome":      { "type": "string" },
      "multiInstance": { "type": "boolean", "default": false },
      "icon":        { "type": "string" }
    }
  }
  ```
- `src/runtime/registry/source-types.js` — JSDoc typedef `AppManifestWindow`.
- `tests/schema/validate-shells.test.mjs` — add positive + negative fixtures.
- All bundled `core:*` apps that should open as windows under `core:desktop` get a `window` block (P2 work; manifest schema lands here).

**Acceptance:** schema sweep passes against existing + new app manifests; missing block validates fine; malformed block fails with a precise Ajv error.

### P1 deliverables

- Spec §5.3 + §5.5 prose updates documenting `core:dynamic-children`.
- Schema updates (`admin-engine-v2.json` prose, `admin-app-v2.json` `window` block).
- One new store module (`dynamicChildren.mjs`) + one new hook + one new platform-service accessor + `<RegionChildren>` extraction.
- ~150 LOC kernel changes + ~300 LOC tests.
- All existing shells render unchanged (P1 is purely additive — engines that never declare the service get zero behavior change).

---

## P2 — `core:desktop` MVP (2.5–3.5 weeks)

Workspace + iframe windows + dock + bridge MVP-subset. Single space. Reuse existing `core:*` apps.

### P2.T1 — Engine scaffolding (0.5 day)

Stand up the engine directory with the minimum surface to register.

**Files created:**

- `src/runtime/engines/core-desktop/index.js` — `EngineSource` export. Pulls in `Layout`, `compileStyles`, `WpdThemeProvider`, registers icons, side-effect imports `index.css`.
- `src/runtime/engines/core-desktop/engine.json` — manifest. Region templates (all standard placements; no new placement vocab):
  - `core:desktop-workspace` — `role: main`, `platform[ 'core:dynamic-children' ]: true`, `app: core:desktop-compositor`. Compositor is just an app.
  - `core:desktop-dock` — `role: navigation`, `app: core:desktop-dock-app`. Standard persistent region.
  - `core:desktop-wallpaper` — `role: presentation` (decorative).
- `src/runtime/engines/core-desktop/Layout.js` — top-level engine layout (wallpaper + dock + workspace + widget-column placeholder). React tree, ~80 LOC.
- `src/runtime/engines/core-desktop/index.css` — wallpaper + dock + window-frame structural CSS. Ported from `desktop-mode/assets/css/{desktop,windows,dock}.css` with `wp-admin-shell-` prefix.
- `src/runtime/registry/builtins.js` — register `core:desktop` engine + `core:desktop-compositor` + `core:desktop-dock-app` apps.
- `shells/desktop-demo.json` — demo shell using the engine.

**Acceptance:** switching to `desktop-demo` shows wallpaper background + empty dock + empty workspace. No windows yet.

### P2.T2 — Compositor app + WindowManager state class (5–6 days)

The single biggest port unit. See §8.1 in feasibility study for risk validation.

**Architecture.** `core:desktop-compositor` is a normal admin shell app — same shape as `core:posts`, `core:navigation`, etc. Mounted in the `core:desktop-workspace` region (which declares `core:dynamic-children`). On mount, the compositor:

1. Reads `useDynamicChildren('workspace')` API from kernel context.
2. Instantiates `WindowManager` state class (z-stack, focus, drag, resize, snap).
3. For each window opened, calls `add('workspace', winKey, windowRegionDecl)`. The window-region declaration nests TWO static children — `frame` (chrome) + `body` (user's app) — exploiting existing spec §5.5 recursive composition:
   ```js
   add('workspace', 'win-123', {
     role: 'region',
     style: { position: 'absolute', transform: 'translate(120px, 80px)', zIndex: 5 },
     regions: {
       frame: { role: 'presentation', app: 'core:desktop-window-frame',
                config: { windowId: 'win-123' } },
       body:  { role: 'region', app: 'core:posts',
                config: { postType: 'post' },
                routing: { 'route-key': 'win-123-route' } }
     }
   });
   ```
4. Kernel renders both children through normal `<Region>` recursion. Frame app draws titlebar + controls + resize handles; body region mounts the target app via `<MountedApp>` exactly like a top-level region. **Compositor renders nothing visible itself** — it's a controller that drives the dynamic-children store.

**Per-window URL state falls out** because the body region declares its own `routing.route-key`; `useRouteForRegion` already keys per region. **Per-window dirty-state, triggerStore, capability gating** all key by region ID `workspace/win-123/body`. No instanceKey concept needed anywhere.

**Drag/resize stays imperative** (upstream pattern). WindowManager updates `transform` directly via `document.querySelector('[data-region-id="workspace/win-123"]')` during pointer-move; on pointer-up it commits the new transform to the dynamic-children store, triggering React to re-render the region with the new `style.transform`. Pre-commit imperative DOM + post-commit store sync keeps the React tree quiet during drag.

**Strategy.** Port the **state class internals verbatim** from `desktop-mode/src/window-manager/*.ts` + `desktop-mode/src/window/index.ts`. Imperative DOM (drag/resize/snap) stays imperative — refs only, no React render on drag. Wrap with a thin React subscriber hook so the React tree re-renders only on stack mutations (open / close / focus / state). Adapt to call `add()` / `remove()` on the dynamic-children store instead of imperatively mounting React subtrees.

**Decisions to lock in before porting:**

1. **Web Components: keep or port?** Three side-effect imports in `desktop-mode/src/window/index.ts` lines 35–37 (`wpd-window-button`, `wpd-menu`, `wpd-tab-chip`). Default: **keep as Web Components**, bundle into engine. React + WC interop is fine. Saves ~150 LOC port; preserves upstream's keyboard-nav + focus-management plumbing. Re-evaluate if WC bundle conflicts with admin shell page.
2. **Activity-state indicator: ship or strip MVP?** ~260 LOC, couples to a `trackedFetch` contract. Default: **strip for MVP**. Add back in P3 with engine-side `trackedFetch` wrapper.

**Files created:**

- `src/runtime/engines/core-desktop/windowing/WindowManager.ts` — port of `desktop-mode/src/window-manager/index.ts` (1,200 LOC; siblings total 3,238 LOC across `arrange/desktops/geometry/overview/overview-constants/snap/snap-zones/split-overview/switcher`). Rename `desktop-mode-` CSS class prefix → `wp-admin-shell-` via sed. Drop `wp.desktop.*` JSDoc references.
- `src/runtime/engines/core-desktop/windowing/Window.ts` — port of `desktop-mode/src/window/index.ts` (2,800 LOC). Same prefix-rename. Strip activity-indicator subsystem (lines 135–181 + 1997–2222). Strip `wp.desktop` JSDoc.
- `src/runtime/engines/core-desktop/windowing/{dom,pointer,tabs,menus,loading,constants}.ts` — port of `desktop-mode/src/window/*.ts` (~2,118 LOC).
- `src/runtime/engines/core-desktop/windowing/{geometry,snap,snap-zones,arrange,desktops,overview,switcher,split-overview,overview-constants}.ts` — port of `desktop-mode/src/window-manager/*.ts`. `desktops.ts` ports but is reduced to single-default-space for MVP.
- `src/runtime/engines/core-desktop/windowing/useWindowManager.ts` — React subscriber hook. `useSyncExternalStore` reads `_stack`.
- `src/apps/desktop-compositor/index.js` + `app.json` — controller app. Mounts `WindowManager`, subscribes via `useWindowManager`, calls `useDynamicChildren('workspace').add/remove` per window-stack mutation. Returns `null` from render — it's headless. All visible DOM comes through the kernel's `<Region>` rendering of the dynamic children it added.
- `src/apps/desktop-window-frame/index.js` + `app.json` — frame chrome app. Renders titlebar (with target app title from kernel context or window-frame config), traffic-light controls (close/minimize/maximize), resize handles. Controls invoke handlers registered by the compositor (via a small `WindowManagerContext` provider) to mutate the window's store entry. Lives under `src/apps/` like other engine-bundled apps.
- `src/runtime/engines/core-desktop/ui/wpd-window-button.ts` + `wpd-menu.ts` + `wpd-tab-chip.ts` — port of upstream `desktop-mode/src/ui/components/{wpd-window-button,wpd-menu,wpd-tab-chip}` Web Components (D1 default = keep). Estimate ~150 LOC each + their Shadow-DOM CSS. Side-effect imports trigger `customElements.define()` before `Window` instantiates. CSS-class-prefix rename `desktop-mode-` → `wp-admin-shell-` via the same sed pass as windowing/.

**Test coverage.** Port relevant subset of upstream's 93-file vitest suite — initial scope:
- `window-lifecycle-hooks.test.ts`
- `window-manager-hooks.test.ts`
- `drag-unstate.test.ts`
- `arrange.test.ts`
- `switcher.test.ts`
- `native-windows-sync.test.ts`
- `native-window-hydrate.test.ts`

Adapt vitest → existing admin shell test harness OR add vitest to the dev deps (project already has `tests/runtime/*.mjs` but no vitest; one-line `package.json` addition).

**Acceptance:** Workspace mounts. `openWindow({ app: 'core:posts', postType: 'post' })` opens a draggable window containing `<PostsApp>`. Drag/resize/minimize/maximize/close work. Two windows of same app render with independent state (validates P1.T2). Session save/restore round-trips.

### P2.T3 — Dock (1.5 days)

**Strategy.** Dock is a plain `persistent` region with a `core:desktop-dock-app` mounted in it. Same kernel rendering path as NavigationApp in `core:default`. App reads resolved admin.json `navigation` tree from kernel context and renders dock UI.

**Files created:**

- `src/apps/desktop-dock-app/index.js` + `app.json` — dock app. Reads `useKernel().config.navigation`, renders rail. Clicking a nav item dispatches to `WindowManagerContext` (provided by `core:desktop-compositor`) to open a window of the linked app. Cross-app coordination via the WindowManager singleton, NOT through any new kernel API.
- `src/apps/desktop-dock-app/dock-rail-registry.ts` — port of `desktop-mode/src/dock-rail/*` (~520 LOC). Pluggable rail-renderer registry so plugin extensions can swap rendering.
- (Most of `desktop-mode/src/dock.ts`'s 1,989 LOC is built-in default renderer + drag-target machinery + dock-placement user prefs. MVP drops the user-pref dock-placement and drag bridge; ports ~600 LOC of default-renderer logic.)

**Acceptance:** Dock shows one tile per top-level nav item from the active shell. Clicking opens the linked app as a new window in the workspace. Existing nav items in `wp-admin-default.json` produce a working dock.

### P2.T4 — Iframe bridge (full 14-subsystem port, 6–7 days)

**Strategy.** Port **all 14 bridge sub-systems** from `desktop-mode/includes/render/chromeless-bridge.php`. This port is a deliberate stress test of the engine architecture — the more complexity it absorbs, the stronger the proof that engines can rebuild full UX paradigms on the kernel without forking.

**Sub-systems ported (all 14 from §8.2 table):**

1. Top-window escape hatch (40 LOC).
2. Error + unhandledrejection listeners → `wp-admin-shell-iframe-error` (60 LOC).
3. `fetch` wrap → `wp-admin-shell-iframe-network` (200 LOC).
4. `XMLHttpRequest.prototype` wrap (100 LOC).
5. `navigator.sendBeacon` wrap (60 LOC).
6. Auth-check force via `wp.heartbeat.connectNow()` (90 LOC).
7. Menu-changed signal — serialize `$menu` + harvest `#adminmenu` icons (140 LOC).
8. Bridge handshake + window-send/window-publish channels (200 LOC).
9. External link + admin-link interception (100 LOC).
10. Focus-request bridge (25 LOC).
11. **Command-palette harvest** — uses `wp.data.select('core/commands')` + `wp.element.renderToString` private APIs. Documented upstream as "deliberate hack." Accept WP-minor breakage as the cost of parity (500 LOC). Track upstream's mitigation; mirror their fix when WP private-API shape changes.
12. Screen-meta detection — Screen Options / Help reveal (100 LOC).
13. Auth-check recovery via jQuery heartbeat-tick (45 LOC).
14. Instrument-set listener — devtools header injection (40 LOC).

**Total: ~1,700 LOC of JS + ~250 LOC of PHP wrapper ≈ 1,950 LOC port.**

**Files created:**

- `includes/engines/core-desktop/chromeless-bridge.php` — full port of `desktop-mode/includes/render/chromeless-bridge.php` (2,406 LOC). PHP wrapper handles `is_admin()` gating, `admin_footer` hook, `$menu` payload serialization for sub-system #7, query-var detection. Heredoc'd JS contains all 14 sub-systems.
- `includes/engines/core-desktop/bootstrap.php` — engine PHP entry. Hooks `admin_footer` to emit the bridge inside chromeless iframes. Registers `wp_admin_shell_chromeless` query var.
- `src/runtime/engines/core-desktop/bridge/iframeBridge.ts` — parent-side handlers. Full port of `desktop-mode/src/window/iframe-bridge.ts` (594 LOC). All 28 postMessage handler cases.
- `src/runtime/engines/core-desktop/bridge/{connection,protocol,channels}.ts` — port of `desktop-mode/src/connection/*` (~640 LOC) + `desktop-mode/src/protocol/*` (~217 LOC). These port verbatim.
- `src/runtime/engines/core-desktop/bridge/window-channels.ts` — port of `desktop-mode/src/window-channels.ts` (360 LOC).
- `src/runtime/engines/core-desktop/bridge/command-bridge.ts` — parent-side glue for sub-system #11 (command harvest). Receives the iframe's command list (via `wp.element.renderToString`-flattened icons in postMessage payload), registers them into the engine's own command-palette app (or the kernel's `<BindingsConsumer>` registry — decide as part of P2.T4).
- `wp-admin-shell.php` — register `?wp_admin_shell_chromeless=1` query var; load engine bootstrap when active engine = `core:desktop`.

**Sub-system #11 (command harvest) — known fragility, accept + monitor.** The `wp.data.select('core/commands')` API + `wp.element.renderToString` are not officially public. Upstream documents this as "a deliberate hack" because no public API exists for parent-frame command harvest from a child iframe. Acceptance for this port: subscribe to Gutenberg + WP minors release notes; pin the upstream desktop-mode commit hash currently working; when it breaks, fix at the same time upstream does. Track in `docs/feedback.md` Inbox.

**Namespace rename pass.** Single sed pass renames all `desktop-mode-` / `desktop_mode_` strings across PHP wrapper + heredoc'd JS + every TS handler in one PR before merge. Covers:
- 28 postMessage type strings (`desktop-mode-*` → `wp-admin-shell-*`).
- Query var `desktop_mode_chromeless` → `wp_admin_shell_chromeless` (D4 default).
- CSS class prefix `desktop-mode-` → `wp-admin-shell-` (already covered for windowing/ + ui/).
- PHP hook prefix `desktop_mode_*` → `wp_admin_shell_*` for any retained hook names.
- JS API namespace `wp.desktop.*` references — strip from JSDoc; defer runtime emulation shim to P3.T4.

**Acceptance:** Opening a `core:desktop-iframe` window (see P2.T4a) with URL `wp-admin/index.php?wp_admin_shell_chromeless=1` shows admin page with chrome hidden. All 14 sub-systems exercised in smoke: title postMessages reach the window frame; fetch/XHR/sendBeacon observability events arrive; external links open as new window; 401/403 triggers auth-check recovery; Screen Options reveals; plugin-activate updates dock without F5; iframe commands appear in palette. Devtools instrument-set header injection works against a known endpoint.

### P2.T4a — `core:desktop-iframe` app (0.5 day)

**Strategy.** Fork `core:iframe-fallback` rather than extend it. Engines don't share apps unless the app is intentionally engine-agnostic. The current `core:iframe-fallback` (CSS-injection chrome hide) stays unchanged for `core:default` consumers (`core:editor`, `core:site-editor`).

**Files created:**

- `src/apps/desktop-iframe/index.js` + `app.json` — engine-owned iframe app. Renders `<iframe src={url + '?wp_admin_shell_chromeless=1'}>`, registers postMessage handler that forwards bridge messages to the engine's `iframeBridge.ts`. Used when compositor opens a target with no native admin shell app registered (typically plugin settings screens, admin-ajax-driven pages, anything reached by `href` from the dock).

**Future opportunity (not in this port).** The iframe+bridge pattern is potentially engine-agnostic — every engine that hosts legacy WP admin pages wants the same chromeless protocol + observability hooks. Worth promoting to a kernel platform service after `core:desktop` ships. Tracked as a P3+ idea, not in this port's scope.

**Acceptance:** Compositor's `openWindow({ href: '/wp-admin/options-discussion.php' })` spawns a `core:desktop-iframe` window. Bridge handshake completes; title postMessage updates the window frame.

### P2.T5 — Theming (`compileStyles` + `WpdThemeProvider`) (1.5 days)

**Strategy.** Engine ships its own ThemeProvider exposing `--wpd-*` token namespace. `compileStyles` maps admin.json chrome slots → scoped CSS variables on the engine wrapper. Bundled apps reused inside windows render with WPDS look (see DS-pluggability section below); this engine's contract is "chrome is desktop-native, contents are app-native." Optional WPDS-to-WPD token bridge ships as an aesthetic-alignment layer.

**Files created:**

- `src/runtime/engines/core-desktop/theme/WpdThemeProvider.js` — React context provider emitting `--wpd-*` CSS vars. Pattern matches `WpdsThemeProvider`. Does NOT depend on `@wordpress/theme.ThemeProvider` (desktop engine uses its own token system).
- `src/runtime/engines/core-desktop/theme/compileStyles.mjs` — `compileStyles(styles, tokens) → {top, scoped, subtrees}`. Maps admin.json `styles.theme.color.{primary,bg}`, `styles.theme.density`, chrome-slot overrides to `--wpd-*` CSS variables. Per-region/app subtrees too.
- `src/runtime/engines/core-desktop/theme/wpd-defaults.json` — token snapshot file (parallel to `wpds-defaults`). Built from upstream `assets/css/variables.css`.
- `src/runtime/engines/core-desktop/theme/wpdsBridge.mjs` — optional WPDS-to-WPD aesthetic bridge. Emits `--wpds-color-bg-surface-neutral: var(--wpd-window-body-bg)` and ~20 similar mappings for the highest-traffic WPDS color/dimension primitives. Reused default apps inheriting WPDS vars pick up desktop palette without code changes. **This bridge does NOT pretend to replace WPDS for default apps** — component-internal WPDS spacing/borders/etc. still apply. Bridge exists for visual coherence at the primitives layer, not as DS replacement. Engines that want full DS replacement for window contents ship their own non-WPDS apps (see DS-pluggability section).
- `src/runtime/engines/core-desktop/engine.json` (extends P2.T1 manifest) — top-level `default-styles` block (Phase C contract) carrying desktop chrome surface defaults: `chrome.canvas.{background,foreground}` (workspace bg), `chrome.dock.{background,foreground,border}`, `chrome.window-frame.{background,foreground,border,shadow}`. Synthetic `engine` origin merges these between `core` and `plugin`; admin.json wins on overlaps (per CLAUDE.md Phase C contract).
- `tests/runtime/compileStylesDesktop.test.mjs` — covers token cascade.

**Acceptance:** Shell config setting `styles.theme.color.bg` to `#1a1a1a` paints workspace background dark. Density `compact` shrinks window chrome dimensions. Per-region `styles.regions[id].theme` overrides apply only to that region's scope.

### P2.T6 — App manifest updates (0.5 day)

Add `window` blocks to existing `core:*` apps that benefit. Engine-agnostic — default engines ignore the block.

**App manifests updated:**

- `core:posts`, `core:editor`, `core:simple-editor`, `core:media`, `core:taxonomy`, `core:users`, `core:comments`, `core:settings`, `core:plugins`, `core:themes`, `core:tools`, `core:site-health`, `core:site-editor`, `core:dashboard`, `core:profile`, `core:appearance`, `core:iframe-fallback`.

Each gets a `window` block with sensible defaults (`defaultSize: {w:960,h:720}`, `minSize: {w:480,h:360}`, `multiInstance: true` for posts/editor/media, `multiInstance: false` for settings-like singletons).

**Acceptance:** Schema sweep passes. Default engines render unchanged. `core:desktop` engine reads the block on mount.

### P2.T7 — Demo shell + readiness (1 day)

- `shells/desktop-demo.json` — shell config exercising the engine: dock with full core nav, default workspace, default wallpaper, `core:desktop` engine active.
- `docs/v3-readiness.md` (or `v2.x-readiness.md` depending on versioning) — manual smoke checklist for desktop engine: window drag, resize, minimize/maximize/close, multi-window same-app, dock click, external-link interception, session save/restore, theming overrides, WPDS-to-WPD bridge sanity (open a PostsApp window, verify dark surface inherits from desktop palette).
- `docs/engines-and-design-systems.md` (new) — DS-pluggability contract: kernel DS-neutrality, three engine contracts for DS choice (reuse-WPDS / token-bridge / engine-native apps), WPDS-to-WPD bridge as reusable template, per-app refactor guide for engines wanting full DS replacement.
- Storybook entry under existing storybook (if present) demonstrating window chrome.
- `CLAUDE.md` updates documenting the engine + `core:dynamic-children` platform service + `window` schema block + new `includes/engines/<id>/` PHP convention + reference to new DS-pluggability doc.

**Acceptance:** Manual smoke pass per readiness doc. All P1+P2 tests pass.

### P2 deliverables

- New engine: ~6k LOC ported (Window + WindowManager + Dock + bridge + supporting siblings) + ~1.5k LOC new (Layout, theme provider, compile, engine bootstrap, compositor, frame app, dock app, desktop-iframe app).
- ~12k LOC of `desktop-mode/src/*.ts` ports across 30+ files.
- ~1,950 LOC of PHP + heredoc'd JS bridge port (full 14-subsystem parity).
- ~500 LOC test additions covering windowing lifecycle + full bridge protocol. Target: existing 587 → ~700 assertions after P1, ~850 after P2 (combined PHP + Node + ported vitest suite — bumped from earlier ~800 to reflect the full bridge port test coverage).
- One bundled shell: `shells/desktop-demo.json`.
- New PHP convention: `includes/engines/<engine-id>/` directory for engine-specific PHP (engine bootstrap, bridge wrapper). Parallel to existing `includes/cascade/` + `includes/origins/`. Document in CLAUDE.md "Project structure" section as part of P2.T7.
- **No chrome-app suppression mechanism needed.** Shells using `core:desktop` simply don't declare regions for nav/toolbar/site-hub. Existing `core:navigation` / `core:site-hub` / `core:toolbar-actions` apps stay where they are; desktop engine ships its own dock + frame + window-frame apps. (User's note: chrome apps SHOULD ultimately live in their owning engines, not in shared `src/apps/`. That refactor is broader scope than this port — track separately.)

### DS pluggability — engine vs app boundary

Surfaced 2026-05-12 while planning the desktop port's `WpdThemeProvider`. Documenting here because the contract was implicit before; making it explicit informs the desktop port + future engines.

**The kernel is DS-neutral.** Verified: zero `--wpds-*` / `@wordpress/ui` / `@wordpress/components` references in `src/runtime/*` outside `engines/`. Kernel owns cascade, routing, capability gating, region rendering primitive, ThemeProviderHost seam, bindings, dirty-state, icon registry — none of it consumes a DS.

**Engines are DS-pluggable for chrome.** Each engine ships its own ThemeProvider (`EngineSource.ThemeProvider` field), own `compileStyles` hook, own token namespace, own region templates. `core:default` chose WPDS; `core:single-pane` also chose WPDS; `core:desktop` chooses `--wpd-*`. Engines CAN ship any DS — Material, Tailwind, brand-locked — without kernel changes. This is the post-DS-decoupling promise (v2.0.0-beta.2), kept.

**Bundled default apps are WPDS-married, and that's intentional.** Verified: 58 files in `src/apps/` import `@wordpress/ui` or `@wordpress/components`; CSS reads `--wpds-*` tokens directly (PostsApp, MediaApp, CommentsApp, SettingsApp, etc.). These apps were authored *for* the `core:default` engine and assume its DS contract. **The WPDS dependency is a feature of using the default apps**, not a bug in the engine system.

**Three contracts for any engine, including desktop:**

| Engine wants… | Path | Cost |
|---|---|---|
| Default apps unchanged, accept WPDS inside windows + own DS for chrome | Reuse `src/apps/*` as-is; ship own `ThemeProvider`/`compileStyles` for chrome only | Cheapest. Mixed aesthetic (chrome = engine DS, contents = WPDS) — a coherent contract, like Linux WMs themed independently from GTK app contents. |
| Default apps with desktop palette bleeding into WPDS primitives | Reuse `src/apps/*` + ship WPDS-to-WPD token bridge (`wpdsBridge.mjs` — P2.T5). Bridge maps WPDS color/dimension slots to engine's tokens so WPDS vars resolve to engine's values | ~1 day. Aesthetic alignment at primitives layer; component-internal WPDS shapes (spacing, borders, radii baked into layered rules) still leak through. |
| Full DS replacement inside windows | Ship engine-native apps that import the engine's own components | Per-app refactor. Apps are well-encapsulated — refactor one at a time, never blocks engine launch. Companion: write `docs/refactoring-an-app-between-design-systems.md` covering the import-surface, CSS-token, and a11y-pattern moves. |

**Desktop port chooses contract #2** for MVP: reuse the 18 default apps inside windows + ship the optional WPDS-to-WPD bridge for color/dimension primitives. Document the visual contract honestly in `docs/v3-readiness.md` (P2.T7). Per-app port to non-WPDS components stays open as a P3+ exercise, picked off opportunistically.

**No app-side DS facade is planned.** That refactor — every app imports `<Button>` from a kernel-provided registry, engines populate — would massively reorganize the app source but provides limited additional pluggability over the per-app refactor path. The encapsulation of current apps means per-app conversion (when desired) is cheaper than the systemic facade.

**Documentation deliverable.** P2.T7 adds a new doc `docs/engines-and-design-systems.md` covering: (a) which kernel layers are DS-neutral vs DS-married, (b) the three contracts above, (c) the WPDS-to-WPD bridge pattern as reusable template, (d) per-app refactor guide for engines that want full DS replacement.

### P2 risk concentrations + mitigations

| Risk | Mitigation |
|---|---|
| Window class port introduces drag regressions | Port `drag-unstate.test.ts` + `window-lifecycle-hooks.test.ts` first; fix until green; then port the class. |
| Dynamic-children store churns on drag, re-renders every window | Imperative DOM during pointer-move; commit to store only on pointer-up. Document the contract in P1.T1 acceptance. |
| Per-window routing slots from many dynamic windows pollute URL | Each window region declares its own `routing.route-key`; URL slot vocabulary grows linearly with window count. Acceptable for MVP (typical 1–5 windows). Spec §6 already allows this. |
| Bridge protocol drift from upstream | Adopt `src/protocol/window-messages.ts` verbatim; track upstream releases in `docs/feedback.md` Inbox. |
| Sub-system #11 (command harvest) breaks on WP minor releases | Pin upstream desktop-mode commit currently working; subscribe to Gutenberg dev-notes; mirror upstream's fix when it breaks. Acceptable cost for full-parity port (locked decision — see D2). |
| `@wordpress/ui` Stack defensive rules clash with imported `wpd-*` Web Component styles | Test engine in isolation in a `shells/desktop-demo.json` BEFORE wiring chrome apps; spot conflicts in their natural habitat. |
| Compositor reads target-app title for frame titlebar via... what API? | New per-region "title" platform service? Or app exports `getTitle(config)`? Decide as part of P2.T2 — favor frame app reading region-context title-service if any registered; fallback to app id. |

---

## P3 — Feature buildout (months; per-subsystem flagged)

Each subsystem is independent. Order by user-visible value + risk concentration. Suggested sequence:

### P3.T1 — Spaces / virtual desktops (1 week)

Port `desktops.ts` properly. Multiple workspace region instances in the same `core:desktop-workspace` template — URL slot `?space={id}` picks active. Overview grid via separate region template `core:desktop-overview`.

### P3.T2 — Wallpapers (1.5 weeks)

Port `wallpapers/*` (~1,174 LOC TS + ~600 LOC PHP).
- CSS-preset wallpapers first.
- Canvas wallpapers + vendor-loader after. Pixijs etc.
- `desktop_mode_register_wallpaper()` → engine extension API: `wp_admin_shell_engine_register('core:desktop', 'wallpaper', $def)`.
- Wallpaper picker as an engine-bundled settings app.

### P3.T3 — Widgets (1 week)

Port `widgets/*` (~2,204 LOC). Right-column floating cards. Built-in clock first; plugin extension API after.

### P3.T4 — Native-window emulation shim (3 days)

Expose `window.wp.desktop.registerWindow()` as engine-side JS. Wraps `wp_admin_shell_register_app()` runtime-style. Document the lossy bits (no cascade origins, no manifest validation, no capability declaration cascading). For upstream-desktop-mode plugins that want to load unchanged.

### P3.T5 — AI Copilot (2 weeks)

Port `ai-copilot/*` + `ai/*` + `ai-assistant.ts` (~5k LOC TS + ~3.5k LOC PHP). Cmd+K palette. OpenAI agentic loop. Per-entity prompt filters. `desktop_mode_register_ai_tool()` → engine equivalent.

### P3.T6 — Drag bridge (1 week)

Port `drag/*` + `drag-bridge.ts` (~700 LOC). Media-library cross-iframe drag. Required for the cross-window drag-drop "north star."

### P3.T7 — Palette registry (3 days)

`wp.desktop.registerPalette()` → engine binding. Cycles Cmd+K through plugin overlays.

### P3.T8 — Presence (2 days)

Port `presence/*` (~300 LOC TS + ~250 LOC PHP). `wp.desktop.presence.*` → kernel-side `@wordpress/data` store (admin shell can host this beyond desktop engine).

### P3.T9 — PWA (3 days)

Port `pwa/*` (~800 LOC TS + ~300 LOC PHP). Service worker + manifest + install pill. `wp.desktop.notify()` local notifications.

### P3.T10 — Three layout modes (1 week)

Classic / Unified / Spatial. Port `desktop-layout.ts` (677 LOC). User OS-Setting toggles between modes.

### P3.T11 — Shared store (1 day)

Port `shared-store.ts` (317 LOC). `wp.desktop.createSharedStore` → kernel-side helper available to any engine.

---

## Cross-cutting decisions

These are not implementation tasks — they are choices that change scope. Status as of 2026-05-12: D2, D6 LOCKED; D1, D3, D4, D5 still default-resolvable.

### D1. Web Components vs WPDS-port for window chrome

**Question:** Keep `wpd-window-button`, `wpd-menu`, `wpd-tab-chip` as Web Components inside the engine, or rewrite as `@wordpress/ui` components?

**Default:** Keep WC. React+WC interop is fine; preserves upstream keyboard nav. Re-evaluate after MVP smoke.

**Trigger to switch:** WC bundle conflicts with admin shell page (cascade layer wars, custom-element registration collisions), or design wants engine to "look like WPDS." Cost: ~3 days.

### D2. Bridge scope: full 14-subsystem parity — LOCKED 2026-05-12

**Resolved.** Port all 14 sub-systems including the command-palette harvest (sub-system #11). Rationale: this port is a stress test of the engine architecture; the more complexity it absorbs, the stronger the proof that engines can rebuild full UX paradigms on the kernel. The command-harvest fragility (uses `wp.data` / `wp.element` private APIs that may break on WP minors) is accepted as ongoing maintenance cost — mirror upstream desktop-mode's fix when WP breaks the API shape. Tracked in P2.T4.

### D3. WindowManager port — file-by-file or rewrite-in-React-idiom

**Question:** Port `Window` class + `WindowManager` class as imperative TS + thin React subscriber, OR rewrite as a React Context + reducer pattern?

**Default:** Imperative port. Upstream's class-based shape is battle-tested; rewriting invites bugs that don't matter (state shape, not behavior).

**Trigger to rewrite:** Tests we want to keep don't survive the JSDOM port. Cost: +1 week; +unknown risk.

### D4. PHP bridge query var name

**Question:** Reuse `desktop_mode_chromeless` query var (compat with upstream desktop-mode plugins) or rename to `wp_admin_shell_chromeless`?

**Default:** Rename. Engine is engine; not pretending to be desktop-mode. Document for plugin authors migrating.

**Trigger to reuse:** Plugin author API compat (P3.T4 emulation shim) needs the same query var to survive. Cost: namespace pollution.

### D5. Vitest harness

**Question:** Adopt vitest project-wide for the ported tests, or convert each ported test to admin shell's existing `tests/runtime/*.mjs` shape?

**Default:** Adopt vitest. The 93-file upstream suite is the safety net; rewriting tests as we port loses the safety net during the most error-prone phase.

**Trigger to convert:** Vitest config doesn't coexist with `@wordpress/scripts`. Cost: +0.5 day to verify; +1–2 days fixup if collision.

### D6. TypeScript adoption — LOCKED 2026-05-12

**Resolved.** Adopt TypeScript scoped to `src/runtime/engines/core-desktop/**` (engine code) + `tests/engines/core-desktop/**` (ported vitest tests). Rest of repo stays JS/JSDoc. Rationale: makes the upstream desktop-mode port a copy-and-sed operation instead of a translation; future upstream syncs become diff-apply; tests modularity of the kernel by introducing a new language without spreading it project-wide.

**Toolchain bumps:**

- `tsconfig.json` at repo root, with `include` scoped to engine + ported-tests paths. `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `jsx: preserve`, `strict: true`, `noEmit: true` (Babel handles emission).
- `@wordpress/scripts` picks up `.ts` via its bundled `babel-preset-typescript` (v28+).
- `.eslintrc.js` adds an override for `*.ts` files using `@typescript-eslint/parser` + `@typescript-eslint/recommended`. Existing JS rules unchanged.
- CI gets a `tsc --noEmit` step (Babel erases types without checking; `tsc` is the safety net).
- Test runner: per D5, vitest natively handles TS — no extra config.

**What does NOT change:** `src/runtime/*` outside the engine dir, `src/apps/*`, `includes/*`, `tests/runtime/*.mjs`, `tests/parity/*.mjs`, `tests/schema/*.mjs`. The boundary is `src/runtime/engines/core-desktop/` only.

---

## Schedule

Assuming one engineer, locked decisions (D2 = full bridge parity, D6 = TS scoped to engine):

```
Week 1:         P1 (dynamic-children + window manifest block) + TS toolchain bump
                ──────────────────────────────────────
Week 2:         P2.T1 (scaffold) + P2.T2 first half (WindowManager core + Window class)
                ──────────────────────────────────────
Week 3:         P2.T2 continues — bindEvents, hydrateNative, animation lifecycle
                P2.T3 (dock) + P2.T5 (theming)
                ──────────────────────────────────────
Week 4:         P2.T4 first half — bridge PHP wrapper + sub-systems 1–10
                ──────────────────────────────────────
Week 5:         P2.T4 second half — sub-systems 11–14 (incl. command harvest)
                P2.T4a (desktop-iframe app) + P2.T6 (app manifests) + P2.T7 (demo shell)
                Smoke + readiness
                ──────────────────────────────────────
↓ ship P2; gather feedback; lock P3 priorities
```

Total: **~4.5 weeks for P1+P2** with locked decisions (vs ~3.5 weeks with the earlier 7-subsystem bridge scope; the extra week absorbs the 7 deferred bridge sub-systems + TS toolchain stand-up). P3 plays out over months in any preferred order.

---

## Done = Definition of Done

**P1:**
- `core:dynamic-children` platform service + `dynamicChildren.mjs` store + `useDynamicChildren` hook + `<RegionChildren>` extraction land.
- Spec §5.3 + §5.5 updates + `admin-app-v2.json` `window` block + `admin-engine-v2.json` prose.
- `tests/runtime/dynamicChildren.test.mjs` + `tests/runtime/Region.test.mjs` (static+dynamic merge case) pass.
- All bundled shells render unchanged.
- No new lint warnings.

**P2 (full-parity bridge port):**
- `shells/desktop-demo.json` boots; workspace + dock + wallpaper render.
- Opening + dragging + resizing + minimizing + maximizing + closing windows all work without console errors.
- Two windows of `core:posts` with different `postType` configs run side-by-side; URL state independent via per-window region `routing.route-key`; closing one does not affect the other.
- Session save/restore round-trips a multi-window layout.
- `core:desktop-iframe` windows render `?wp_admin_shell_chromeless=1` admin pages with chrome hidden.
- **All 14 bridge sub-systems verified in smoke:** error/network/beacon observability, external-link interception, auth-check force + recovery, menu-changed live-refresh on plugin activate, screen-meta reveal, command-palette harvest populating engine palette, instrument-set header injection.
- All ported vitest tests green.
- TypeScript `tsc --noEmit` passes; ESLint clean across `.ts` + `.js`.
- Manual smoke per readiness doc passes (including WPDS-to-WPD bridge sanity — PostsApp in a window inherits desktop palette).
- `CLAUDE.md` + `docs/wp-admin-shell-design-spec.md` + `docs/engines-and-design-systems.md` updated.

**P3 subsystem:**
- Each P3.Tx ships behind a feature flag in the engine.
- Each has its own readiness doc.
- Documentation updated per subsystem.

---

## Open questions for the owner

1. **Who owns this?** Solo engineer or split?
2. **What's the demo target?** Internal P2 post, public showcase, plugin-author preview build?
3. **Is `core:desktop` going into the bundled shell list, or shipping as a separate plugin that registers via `wp_admin_shell_register_engine()` (the §13 #5 extension surface)?** Affects how engine assets are enqueued.
4. **Versioning.** Does P1 land in v2.0.0-beta.3, or v2.1.x, or v3.x?
5. **Source-of-truth question.** Once `core:desktop` exists, do we contribute changes back upstream to desktop-mode, fork-and-diverge, or treat as one-way port?
6. **CLAUDE.md cleanup (separate task).** The "pinned by the v0 normalizer" line in CLAUDE.md ("Application sources" → System apps row) is stale — verified 2026-05-12 that all shells declare chrome apps explicitly. Remove during plan execution or before.
7. **Chrome-app relocation (separate, broader scope).** Today `core:navigation` / `core:site-hub` / `core:toolbar-actions` etc. live under shared `src/apps/`. User's stated principle: chrome apps SHOULD live in the engine that owns them. Move these into `src/runtime/engines/core-default/apps/` (and equivalent for `core-single-pane`) at some future refactor. Out of scope for this port.
