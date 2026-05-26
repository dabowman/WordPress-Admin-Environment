# Desktop Mode as a `core:desktop` engine — feasibility study

**Date:** 2026-05-12
**Subject:** [WordPress/desktop-mode](https://github.com/WordPress/desktop-mode) (`/Users/davidbowman/Github/desktop-mode`, v0.8.3)
**Question:** Can desktop-mode's UX be rebuilt as a custom engine on the WP Admin Shell kernel? What changes are required?
**Verdict:** Feasible, well-aligned with the post-DS-decoupling engine architecture. Two small kernel generalizations + one substantial engine port. MVP ≈ 3–4 weeks; full parity ≈ months.

---

## 1. What desktop-mode actually is

A standalone WordPress plugin that replaces `/wp-admin` with a desktop-OS metaphor. Admin screens open as draggable, resizable, minimizable windows on a wallpapered desktop with a dock built from the admin menu. Opt-in per user.

### Tech stack

- **TypeScript + Vite IIFE bundles.** Two entry points: `desktop[.min].js` (shell) + `iframe-bridge[.min].js` (chromeless bridge). Source under `src/`; `assets/js/*.js` is build output, never hand-edited.
- **Web Components**, not React. ~25 `<wpd-*>` custom elements live under `src/ui/components/`, each with its own Shadow-DOM CSS. No Gutenberg, no `@wordpress/components`, no `@wordpress/ui`.
- **PHP plugin layer** registers windows, widgets, wallpapers, icons, commands, AI tools server-side and ships them to the shell via a `desktop-mode-plugins-changed` postMessage payload.
- **No Gutenberg runtime dependency.** Critical contrast with admin shell, which hard-requires the Gutenberg plugin for `@wordpress/ui` overlays.

### Scale

| File | LOC | Purpose |
|---|---|---|
| `src/desktop.ts` | 3,191 | Shell entry |
| `includes/render/chromeless-bridge.php` | 2,406 | Bridge script inside every iframe |
| `includes/render/shell.php` | 356 | Top-level shell markup |
| `src/window-manager/*` | ~2k | Drag/snap/arrange/overview/spaces |
| `src/window-chrome/*` | ~1.5k | Window frame, controls, slots, themes |
| `src/dock-rail/*` | — | Pluggable dock-rail renderer registry |

Public API surface: 252 `wp.desktop.*` references in `docs/javascript-reference.md`, 47 PHP hooks in `docs/hooks-reference.md`. Sizeable third-party contract.

### Feature inventory (shipped through 0.18.x)

- **Shell layout** — wallpaper layer + dock (left/right/bottom user pref) + widget column + workspace.
- **Window system** — iframe windows (every admin page via `?desktop_mode_chromeless=1`) + native windows (plugin-rendered into parent DOM via `desktop_mode_register_window()`). Both share drag, resize, minimize, maximize, close, fullscreen, detach-to-tab.
- **Multi-window** — z-stack, focus, session persistence (debounced REST writes to `/desktop-mode/v1/session`).
- **Virtual desktops ("Spaces")** — multiple desktops per user, overview grid switcher.
- **Arrange & snap** — cascade, tile, overview, snap-to-grid.
- **Three layout modes** — Classic (split dock), Unified (one rail), Spatial (desktop-icon grid).
- **Wallpaper registry** — CSS presets + canvas (WebGL/2D) wallpapers, collision-aware surface data.
- **Widget registry** — right-column floating cards; built-in clock.
- **Desktop icons** — wallpaper-layer shortcuts.
- **AI Copilot** — Cmd+K palette + OpenAI agentic loop + per-entity prompt filters + `desktop_mode_register_ai_tool()`.
- **Palette registry** — Cmd+K cycles through plugin-registered palettes.
- **Cross-frame drag bridge** — media-library drag across iframe boundaries via coordinated postMessage.
- **Toast notifications**, **OS Settings** native window, **postMessage bridge protocol**, **PWA install / service worker**, **presence tracking**.
- **`<wpd-*>` UI kit** for plugin authors.

### Architecture in one paragraph

Parent shell renders `<div id="desktop-mode-shell">` fixed-positioned over hidden classic admin chrome. Vite-built `desktop.min.js` mounts `WindowManager`, layout dispatcher, dock(s), wallpaper layer, widget layer. Every admin URL becomes an `<iframe src="?desktop_mode_chromeless=1">`; chromeless CSS hides admin bar + side menu + footer inside the iframe; an inline bridge script postMessages title/nav/screen-meta/focus/observability up to the parent. Native windows skip the iframe and let plugin JS render directly into a DOM container.

---

## 2. Admin shell architecture, in contrast

Recap of relevant pieces (full picture in `docs/wp-admin-shell-design-spec.md`):

- **Kernel = DS-neutral.** Cascade resolver + routing + capability gating + region rendering primitive + ThemeProviderHost seam + bindings + dirty-state + icon registry.
- **Engines own visual identity.** Layout React component, region templates, `compileStyles` hook, optional `ThemeProvider`. Currently `core:default` + `core:single-pane`.
- **Regions** declared via templates with `role` (ARIA) + `layout` (CSS subset) + `platform` (browser-analog services) + `routing` (URL slot). One-region-one-app, nested children allowed.
- **Apps** are React components with `app.json` manifest; registered via builtins + `wp_admin_shell_register_app()`.
- **Three artifacts** — `app.json` (per-app intrinsics), `engine.json` (engine + region templates), `admin.json` (install decisions).
- **Theming** = 4-tier model: theme seeds → nested region/app seeds → direct slot overrides → DTCG primitives. Engine's `compileStyles` translates slots into scoped CSS variables.

---

## 3. Compatibility analysis

### What collides

**Rendering paradigm.**
- Admin shell renders one React tree from kernel through engine Layout to apps. Single mount tree.
- Desktop-mode renders an imperative DOM tree with WindowManager managing z-order, drag, focus, mount/unmount imperatively. Multiple independent React/non-React mount points per window.
- The two can run on the same page (they're isolated bundles) but neither hosts the other natively. Decision point: which side owns the page mount?

**Region semantics.**
- Admin shell regions are **fixed-layout templates** declared at engine time. Sidebar always sits at the same position; toolbar always at the top.
- Desktop-mode workspace is **N runtime-spawned floating windows** in one canvas, user-positioned, multi-instance, position-persisted per user.
- Current `<Region>` primitive does not model "windowed canvas with M children mounted at runtime." Closest analogue: nested child regions, but those are still declaration-time.

**App identity.**
- Admin shell apps are singletons within a region. `MountedApp` resolves `appRef → registry → render` exactly once per region instance.
- Desktop-mode allows the same window-id to spawn multiple instances (e.g. two Posts windows side-by-side editing different post types).
- Kernel multi-instance support is missing.

**Component library.**
- Admin shell apps consume `@wordpress/ui` + `@wordpress/components` (WPDS). Hard Gutenberg dependency.
- Desktop-mode ships `<wpd-*>` Web Components with their own Shadow-DOM styling. Zero WPDS coupling.
- These are parallel, not interchangeable. Choice point per engine.

**Plugin author API.**
- Desktop-mode plugins call `wp.desktop.registerWindow()` (JS) or `desktop_mode_register_window()` (PHP). Imperative, runtime, render-callback-based.
- Admin shell plugins author `app.json` + a default-exported React component. Declarative, build-time, manifest-discovered.
- These are not compatible. An emulation shim is possible but lossy.

### What carries forward cleanly

- **Cascade resolver + capability gating.** "Which apps does this user see, with what config?" is identical in both. Six-origin merge applies unchanged.
- **URL routing.** `routing.route-key` already names URL slots; multi-window = multiple slots. Need slot namespacing per-window-id.
- **ThemeProvider seam.** `ThemeProviderHost` is already engine-pluggable. Desktop's `--wpd-*` token namespace plugs in the same way `--wpds-*` does. Engine ships its own `ThemeProvider` field on `EngineSource`.
- **`compileStyles` hook.** Translates admin.json chrome slots into scoped CSS variables. Desktop engine writes its own version targeting `--wpd-*`.
- **App manifest concept.** Desktop's `desktop_mode_register_window()` PHP args (`id`, `title`, `icon`, `capability`, `defaultSize`, `minSize`, `chrome`, `multiInstance`, `script`) overlap heavily with `app.json`. Need a new optional `window` block in `admin-app-v2.json`.
- **Iframe-fallback app.** `core:iframe-fallback` already mounts arbitrary admin URLs with chrome hidden via injected CSS. Desktop-mode's chromeless protocol generalizes this — the bridge is a richer version of the same idea.

---

## 4. Rebuild plan — engine `core:desktop`

### 4.1 Kernel additions (small, generalizable)

These changes are not desktop-specific; they generalize the kernel for any "many-apps-in-one-canvas" engine.

1. **New region placement vocab.** Two new platform-service placements:
   - `window-canvas` — region hosts M runtime-spawned app mounts. Engine owns positioning.
   - `dock` — region hosts navigation derived from admin.json nav tree, rendered by engine's pluggable rail renderer.
   - Spec §5.3 platform services extended. `placement()` returns the new values; new accessors `canvasOwnsMounts()`, `dockKind()`.

2. **Multi-instance app mounts.** Today `<MountedApp>` resolves `appRef → registry → render` once per region. Add `instanceKey` parameter so the same app id mounts N times with distinct route slots and distinct React subtrees. Routing slot namespaced as `?win-{instanceKey}-{route-key}=…` (consistent with sidebar drill-down convention).

3. **Optional `window` block in `admin-app-v2.json`.**
   ```json
   {
     "id": "core:posts",
     "window": {
       "defaultSize": { "w": 960, "h": 720 },
       "minSize": { "w": 480, "h": 360 },
       "chrome": "default",
       "multiInstance": true,
       "icon": "edit"
     }
   }
   ```
   Default engines ignore the block. `core:desktop` reads it when mounting into a `window-canvas` region.

4. **Optional `WindowManager` platform service.** Apps can request "open me as a new window of app X with config Y" the same way they request `triggerStore` today. Engines that ignore the service silently no-op. Apps that need it (e.g. AI Copilot opening a result in a new window) become engine-portable.

### 4.2 Engine `core:desktop` ships

The bulk of the work. Lives under `src/runtime/engines/core-desktop/`.

| Module | Responsibility | Port from |
|---|---|---|
| `index.js` | EngineSource + ThemeProvider field + builtins | new |
| `Layout.js` | Wallpaper layer + dock + workspace + widget column React tree | adapted from `desktop-mode/includes/render/shell.php` skeleton + `src/desktop.ts` init |
| `WindowManager.ts` | Z-stack, focus, session save, spaces, drag/snap/arrange. Imperative state class with React subscriber hook | `desktop-mode/src/window-manager/*` (~5–8k LOC port) |
| `WindowFrame.js` | Window chrome (titlebar/controls/resize handles), wraps `<MountedApp>` | `desktop-mode/src/window-chrome/*` |
| `Dock.js` | Pluggable rail renderer reading admin.json nav tree | `desktop-mode/src/dock-rail/*` |
| `iframeBridge.ts` | Chromeless bridge protocol (title/nav/screen-meta/focus/observability postMessage) | `desktop-mode/src/window/iframe-bridge.ts` |
| `chromeless-bridge.php` | Bridge inside every iframe + chromeless CSS | `desktop-mode/includes/render/chromeless-bridge.php` |
| `compileStyles.mjs` | Maps admin.json chrome slots → `--wpd-*` CSS variables | new, modeled on `core-default/compileStyles.mjs` |
| `WpdThemeProvider.js` | DS-neutral wrapper exposing `--wpd-*` tokens | new |
| `engine.json` | Region templates: `core:desktop-workspace`, `core:desktop-dock`, `core:desktop-widgets` | new |
| `index.css` | Wallpaper + dock + window-frame structural CSS | adapted from `assets/css/{desktop,windows,dock}.css` |

### 4.3 App layer

- **Reuse existing `core:*` apps unchanged.** PostsApp, MediaApp, CommentsApp, UsersApp, PluginsApp, ThemesApp, ToolsApp, SettingsApp, etc. all already React + WPDS. They mount inside window frames without modification. Annotate each app's manifest with the optional `window` block.
- **Drop the chrome apps when the active engine is desktop.** NavigationApp, SiteHubApp, ToolbarActionsApp, NoticesBannerApp don't render — their roles are absorbed by the desktop dock + window chrome.
- **Iframe-fallback gets the bridge.** Extend `core:iframe-fallback` (or fork as `core:desktop-iframe`) to ship the chromeless protocol so legacy admin pages title/nav/focus update the parent window frame.

### 4.4 Defer or drop for MVP

- **Spaces / virtual desktops.** Single workspace v1. Add behind a flag later.
- **AI Copilot, presence, drag bridge, palette registry, shared store, PWA.** Orthogonal subsystems. Ship as separate engine-side platform services in 0.x increments.
- **Wallpaper canvas/WebGL.** CSS-only wallpapers v1. Canvas wallpapers deferred — they introduce a vendor-loader dependency model the kernel doesn't have.
- **`<wpd-*>` Web Component library.** Not needed — apps are already WPDS React. Plugin authors writing engine-native UI use WPDS.
- **Native-window plugin API emulation.** Desktop-mode's `wp.desktop.registerWindow()` does not map to admin shell's app discovery model. Two options:
  - **(A) Emulation shim** — provide a `wp.desktop.registerWindow()` JS API in the engine that registers a temporary app at runtime. Lossy: app.json discovery features (cascade origins, manifest validation, capability declarations) bypass. Lets old desktop-mode plugins load with minor work.
  - **(B) Clean break** — document migration: `desktop_mode_register_window()` → `wp_admin_shell_register_app()` with a `window` block. Smaller engine surface, larger ecosystem cost.
  - Recommendation: **B for v1**, ship **A** behind a `compat: true` engine option later.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| WindowManager port introduces regressions vs. upstream | High | Port incrementally, test against desktop-mode's vitest suite (`tests/vitest/`), keep upstream as reference impl. |
| Multi-instance routing collides with sidebar drill-down slot conventions | Medium | Namespace per-window slots (`?win-{id}-…`) explicitly; document in spec §6. |
| `compileStyles` mapping admin.json slots → `--wpd-*` produces wrong cascade when both engines load on the same page | Medium | Engines are mutually exclusive per shell — only one mounts per request. Verify in kernel. |
| Bridge protocol drift from upstream desktop-mode | Medium | Adopt upstream's typed protocol (`src/protocol/window-messages.ts`) verbatim; track upstream releases. |
| Chromeless-bridge.php is 2,400 LOC and depends on WP admin internals | High | Port as a self-contained file, no admin shell coupling. Treat as a frozen artifact. |
| Performance regression — multi-window React renders + drag handlers | Medium | Drag in imperative DOM (refs only), React tree only re-renders on window list change. Match upstream's approach. |
| Plugin Check rejection on chromeless iframe injection | Low | Upstream already passes Plugin Check; mirror their hook order. |
| Gutenberg dependency leak — apps loaded in iframes still require Gutenberg | Low | Acceptable; admin shell already requires Gutenberg site-wide. |

---

## 6. Effort estimate

**MVP** (single workspace, iframe windows, basic dock from admin.json nav, no spaces / AI / wallpapers / widgets / plugin extensibility, reuse existing `core:*` apps):

- Kernel additions (§4.1): ~3 days
- WindowManager port: ~5–7 days
- Engine layout + WindowFrame + Dock React: ~3 days
- Bridge protocol port + PHP chromeless: ~3 days
- `compileStyles` + ThemeProvider + tokens: ~1 day
- Tests + smoke: ~2 days

**MVP total: ≈ 3–4 weeks.**

**Full parity** (spaces, AI copilot, drag bridge, palette, widgets, wallpapers w/ canvas, native-window emulation shim, presence, PWA, three layout modes): **months.** Each subsystem is 1–3 weeks on its own. Plugin author API compat is the long pole.

---

## 7. Recommendation

Build it. Desktop-mode is the ideal stress test for the post-DS-decoupling engine architecture — the kernel was deliberately rebuilt to be DS-neutral so that engines like this (a complete UX paradigm shift, with its own DS, its own region semantics, its own plugin API) could ship without forking the kernel. The two kernel additions required (windowed regions + multi-instance mounts) are reasonable generalizations, not desktop-specific hacks. They earn their place by also benefiting any future "MDI editor" or "multi-document workspace" engine.

Suggested phasing:

1. **Phase 1 — Kernel generalizations.** Region placement vocab + multi-instance mounts + `window` block schema. Land standalone; benefits the existing engines (e.g. `core:default` can use multi-instance for split-view editing).
2. **Phase 2 — `core:desktop` MVP.** Workspace + iframe windows + dock + bridge. Demo on `shells/desktop-demo.json`.
3. **Phase 3 — Feature buildout.** Spaces → wallpapers/widgets → drag bridge → palette → AI → emulation shim.

Risk-weighted call: phase 1 alone is high-value-low-cost. Decide on phase 2 after phase 1 lands and the kernel changes prove themselves.

---

## 8. Risk validation — deep read of the two biggest port units (2026-05-12 update)

Initial risk register flagged `src/window/index.ts` (2,800 LOC) and `includes/render/chromeless-bridge.php` (2,406 LOC) as the highest-risk port units. Read both end-to-end. Conclusions revise downward for `window/index.ts` and reframe `chromeless-bridge.php`.

### 8.1 `src/window/index.ts` — RISK: MEDIUM (was: HIGH)

**File shape.** 2,800 LOC defining one class `Window`. ~50 fields + ~45 methods. Acts as orchestrator — heavy lifting delegated to siblings under `src/window/*`:
- `dom.ts` (687) — element construction.
- `pointer.ts` (590) — drag/resize math.
- `iframe-bridge.ts` (594) — postMessage routing.
- `tabs.ts` (435), `menus.ts` (169), `loading.ts` (197), `constants.ts` (37).

Most methods are short. State accessors (`isMinimized`, `isMaximized`, `isFocused`, `isSnapped`, `isFullscreen`) are 5–15 LOC each. The bulk lives in: constructor (~600 LOC of init wiring), `bindEvents` (215), `close`/`destroy`/`_finalizeClose` (300), activity-indicator state machine (~260), animation lifecycle (~150).

**External coupling — measured, not assumed:**

| Coupling source | Count | Type |
|---|---|---|
| `wp.desktop.*` references | 9 | **All JSDoc only**. Zero runtime calls. |
| `@wordpress/*` imports | 0 | None. No React, no Gutenberg dep. |
| `wp.*` runtime calls | 0 | None in this file. |
| `<wpd-*>` Web Component side-effect imports | 3 | `wpd-window-button`, `wpd-menu`, `wpd-tab-chip` |
| Internal sibling imports | 16 | Pure-DOM utilities + registries |

The class is **DS-agnostic at the runtime level**. Its DOM coupling is to its own `desktop-mode-window--*` class namespace, owned by `dom.ts`.

**Real port hazards (ranked):**

1. **Activity-state machine** (lines 135–181 + 1997–2222, ~260 LOC). Drives the title-bar saving/pending indicator via `_markActivityStart` / `_markActivitySettled` / `_finalizeActivitySettle` + `MIN_SAVING_DISPLAY_MS = 1200` floor. Coupled to `wp.desktop.fetch( …, { signal } )` cancellation contract upstream. Engine either provides its own `trackedFetch` wrapper or **strip from MVP** (–260 LOC, –1 risk surface).
2. **Animation lifecycle** (lines 2393–2691). Three entry points (`close()`, `destroy()`, safety-net timeout) converge through `_finalizeClose()` guarded by `_isFinalized`. Pre-animation subscription teardowns separated from post-animation visible-DOM teardowns to avoid flash of default chrome during fade-out. High bug-density. Mitigated by `tests/vitest/window-lifecycle-hooks.test.ts` + `drag-unstate.test.ts`. Port behavior + tests together.
3. **`hydrateNative` native-render contract** (lines 623–757). Promise-aware, AbortSignal-aware, idempotent. Captures user teardown via `captureTeardown` whether sync, async, or no return. This is the surface plugin authors hook into. Must match upstream byte-for-byte if emulation shim ever ships.
4. **`bindEvents` selector queries** (lines 859–1074). 15+ hardcoded CSS selectors (`.desktop-mode-window__menu-btn`, `.desktop-mode-window__resize-handle`, etc.). All created by `dom.ts`. Rename to `wp-admin-shell-window__*` via sed; verify against `dom.ts`. ~30 minutes.
5. **PostMessage listener** (line 1072). One global `window.addEventListener('message', this._boundOnMessage)` per window. Delegates to `handleWindowMessage` in `iframe-bridge.ts`. Per-window scoping handled by message-source matching. No port concern; standard.
6. **Web Component side-effect imports** (lines 35–37). Forces `wpd-window-button` / `wpd-menu` / `wpd-tab-chip` to be defined before the class instantiates. Two options:
   - **(a) Keep Web Components.** React + WC interop is fine — render them as native tags in JSX. Bundle the three components into the engine. ~50 LOC each + their CSS.
   - **(b) Port to WPDS.** Map to `@wordpress/ui` `Button` / `Menu` / `Tabs`. More work; cleaner DS story. Engine becomes pure-React.

**Test coverage as safety net.** 93 vitest files in `tests/vitest/`. Window-specific:
- `window-lifecycle-hooks.test.ts`, `window-manager-hooks.test.ts`, `window-submenu.test.ts`, `native-window-hydrate.test.ts`, `native-windows-sync.test.ts`, `drag-unstate.test.ts`, `arrange.test.ts`, `desktops.test.ts`, `switcher.test.ts`, `connection-bridge.test.ts`, `observability.test.ts`.

Port the tests alongside the source. JSDOM-driven, no WP-specific harness required. The vitest config under `tests/vitest/` runs standalone.

**Revised verdict.** Initial framing ("load-bearing single file that has to land intact") still holds. Coupling concern was wrong — the file is more portable than its size suggested. Realistic effort: **5–7 days** to port + adapt class namespace + decide on `<wpd-*>` (a) vs (b). MVP optionally strips activity-indicator subsystem (–260 LOC, –1 day).

### 8.2 `includes/render/chromeless-bridge.php` — RISK: MEDIUM-HIGH (reframed)

**File shape.** 2,406 LOC total. ~250 LOC of PHP wrapper; **2,156 LOC is a single heredoc holding inline JS** (lines 239–2395, `$js = <<<'JS' … JS;`). The JS is `wp_print_inline_script_tag`'d into every chromeless admin page via `add_action( 'admin_footer', … )`. Server-substituted token `/*__DESKTOP_MODE_MENU_PAYLOAD__*/` carries the menu-builder JSON.

**This is not one "frozen artifact" — it is ten functional sub-systems inside a JS string.** Each is independently portable.

**Sub-system inventory:**

| # | Sub-system | LOC | WP coupling | Drop-cost if removed | MVP? |
|---|---|---|---|---|---|
| 1 | Top-window escape hatch (strip flag + reload if iframe is top window) | 40 | none | none | ✅ keep |
| 2 | Error + unhandledrejection listeners → `desktop-mode-iframe-error` | 60 | none | observability degraded | ✅ keep |
| 3 | `fetch` wrap → `desktop-mode-iframe-network` | 200 | none | observability degraded | ✅ keep |
| 4 | `XMLHttpRequest.prototype.send/open/setRequestHeader` wrap | 100 | none | admin-ajax not observed | ✅ keep |
| 5 | `navigator.sendBeacon` wrap | 60 | none | telemetry not observed | ⏸ defer |
| 6 | Auth-check force via `wp.heartbeat.connectNow()` | 90 | `wp.heartbeat` | slow session-expiry detection | ⏸ defer |
| 7 | Menu-changed signal (serialize $menu + harvest #adminmenu icons) | 140 | `$menu` global, jQuery-DOM | live plugin-activate refresh broken | ⏸ defer |
| 8 | Bridge handshake + window-send/window-publish channels | 200 | none | bridge protocol broken | ✅ keep |
| 9 | External link + admin-link interception → parent navigates | 100 | none | links break out of shell | ✅ keep |
| 10 | Focus-request bridge | 25 | none | tab-into-iframe loses focus | ✅ keep |
| 11 | Command-palette harvest (`getCommandLoaders` + `renderToString`) | 500 | **`wp.data` + `wp.element` private APIs** | Cmd+K shows shell only | ⏸ defer |
| 12 | Screen-meta detection + state | 100 | DOM-scrape only | Screen Options / Help broken | ⏸ defer |
| 13 | Auth-check recovery via jQuery heartbeat-tick | 45 | `window.jQuery` | re-auth requires manual reload | ⏸ defer |
| 14 | Instrument-set listener (devtools header injection) | 40 | none | devtools header inject broken | ⏸ defer |

**WP-coupling specifics (validated by grep):**

| Coupling | Lines | Used for | Replaceable? |
|---|---|---|---|
| `wp.data.select('core/commands')` + `getCommandLoaders` + `getCommands` | 1467, 1473, 1651 | Command harvest (#11) | No — but #11 is droppable for MVP |
| `wp.element.renderToString` | 1219, 1223 | Flatten React icons to SVG for postMessage clone (#11) | No — only used in #11 |
| `wp.heartbeat.connectNow()` | 427 | Force auth-check tick on 401/403 (#6) | Optional — auth-check still works without |
| `window.jQuery` | 2356 | `heartbeat-tick.wpdAuthRecover` event (#13) | Optional — wrapped in `if ( ! window.jQuery )` guard |
| `$menu` PHP global | 231 (`desktop_mode_build_menu_payload()`) | Live plugin-activate refresh (#7) | No — but #7 is droppable for MVP |
| `XMLHttpRequest.prototype` mutation | 600–682 | Network observability (#4) | Standard; conflicts with Sentry/NewRelic |

**Postmessage protocol — 28 distinct types** (validated by grep):

```
bridge-connection-ack/-request, bridge-disconnect, bridge-handshake/-ack,
bridge-publish, bridge-ready, broadcast, chromeless, commands-invoke/
-list/-subscribe/-unsubscribe, external-link, focus-request,
iframe-admin-link, iframe-error, iframe-network, instrument-set,
palette-cycle, plugins-changed, reauth-detected, screen-meta/-state,
soft-reloaded, toggle-panel, window-publish, window-send, window-switch
```

Each maps 1:1 to a handler in `src/window/iframe-bridge.ts`. Port message-by-message, independent.

**Real port hazards (ranked):**

1. **Command-palette harvest is documented upstream as "a deliberate hack."** From `AGENTS.md`: "there is no public API on `@wordpress/commands` for a parent frame to read and invoke commands from a child iframe." Uses private `wp.data` + `wp.element` APIs. ~500 LOC. **Drop for MVP** — removes the only hard `@wordpress/*` runtime dep in the bridge. Admin shell already has Cmd+K via `<BindingsConsumer>` + `triggerStore`; iframe windows can register their own commands via the engine instead of harvest.
2. **Global prototype mutation** for XHR/fetch/Beacon. Standard observability pattern; works; conflicts with other observability libs that wrap the same. Document precedence in engine docs.
3. **Menu-changed signal needs the chromeless iframe to fire from inside real admin context** (`is_admin()` evaluates true at plugin load). REST roundtrip cannot replicate this. **If the engine wants live plugin-activate refresh**, port this sub-system. If not, accept F5-after-activate as upstream initially did.
4. **`/*__DESKTOP_MODE_MENU_PAYLOAD__*/` token substitution** (line 2402). String-replace inside a 2k-LOC JS heredoc. Brittle but works. Engine-side, replace with a `wp_localize_script` data attribute on the bridge handle.
5. **Auth-check recovery (#6, #13).** Two paths, both optional. Skip for MVP — sessions expire fine without the optimization.

**MVP scope for the bridge port: sub-systems #1–4 + #8–10.** Approximately **800 LOC of JS** (out of 2,156 = ~37%). PHP wrapper (~250 LOC) ports unchanged. No `@wordpress/*` runtime dep. No private API. Total MVP bridge port: **~1,050 LOC** vs upstream's 2,406.

**Revised verdict.** Initial framing ("frozen artifact, port verbatim") was wrong. The bridge is not monolithic — it's a layered set of independent listeners glued by being in the same heredoc. **Port the layers we want; defer the brittle ones.** This drops the hardest dep (private `wp.data`/`wp.element` for command harvest) to phase 3 and removes the upstream "deliberate hack" from MVP.

Realistic effort: **3–4 days** for the MVP subset; **~7 days** for full parity including command harvest + menu-changed + auth-recovery.

### 8.3 Combined effect on overall estimate

Original MVP estimate was 3–4 weeks. After this deeper read:

| Phase | Original | Revised |
|---|---|---|
| Kernel additions (§4.1) | 3 days | 3 days |
| WindowManager port | 5–7 days | **5–6 days** (Window class less coupled than feared) |
| Engine layout + Dock + WindowFrame React | 3 days | 3 days |
| Bridge port (PHP + TS handlers) | 3 days | **3 days for MVP subset; ~7 if full parity** |
| `compileStyles` + ThemeProvider + tokens | 1 day | 1 day |
| Tests + smoke | 2 days | 2 days |
| **MVP total** | **~3–4 weeks** | **~2.5–3.5 weeks (MVP scope)** |

Net: estimate stable; **risk concentration moves**. Single biggest unknown is no longer "will Window class port?" — it is "do we ship full bridge parity (command harvest, menu-changed) in MVP or defer?" That call belongs to the user, not the porter.

### 8.4 What changed in the LOC-bucket table from §6

Adjustments to **Port w/ React wrapper** + **Port verbatim** buckets:

| Bucket | Before | After | Δ |
|---|---|---|---|
| Port verbatim (PHP `chromeless-bridge.php` MVP subset) | 2,406 | 1,050 | –1,356 |
| Defer past MVP (the dropped bridge sub-systems #5–7, #11–14) | — | +1,356 | +1,356 |
| Port + React wrapper (`Window` class — coupling lower than feared, framework unchanged) | 2,800 | 2,800 | 0 |
| **MVP touched total** | ~28k | **~26.5k** | –1.5k |
| **MVP port-share** | 85% | **~87%** | +2pp |

Slight improvement on already-positive bucket math. Bigger win is the **clarity of what gets deferred** — the brittle WP-private-API surface is now an explicit phase 3 decision instead of a porting hazard.

---

## Appendix A — Source files for reference

Read order if implementing:

1. `desktop-mode/AGENTS.md` — local gotchas, framework rules.
2. `desktop-mode/docs/architecture.md` — high-level tour.
3. `desktop-mode/src/desktop.ts` — shell entry, init sequence.
4. `desktop-mode/src/window-manager/index.ts` + siblings — state class to port.
5. `desktop-mode/src/window-chrome/` — window frame components.
6. `desktop-mode/includes/render/chromeless-bridge.php` — iframe-side bridge.
7. `desktop-mode/src/window/iframe-bridge.ts` — parent-side bridge.
8. `desktop-mode/src/dock-rail/` — pluggable rail renderer (good model for our dock).
9. `desktop-mode/docs/javascript-reference.md` — full `wp.desktop.*` surface.
10. `desktop-mode/docs/hooks-reference.md` — full PHP hook surface.

## Appendix B — Mapping table

Desktop-mode concept → admin shell equivalent:

| Desktop-mode | Admin shell |
|---|---|
| Shell HTML skeleton (`includes/render/shell.php`) | Engine `Layout.js` |
| WindowManager class | New engine-internal class + React subscriber hook |
| `desktop_mode_register_window()` | `wp_admin_shell_register_app()` + `window` block (or emulation shim) |
| Native window render callback | App default-exported React component |
| Iframe window + chromeless bridge | Enhanced `core:iframe-fallback` w/ bridge protocol |
| Dock | Engine region template `core:desktop-dock` reading admin.json nav |
| Wallpaper layer | Engine region template `core:desktop-wallpaper` (decorative) |
| Widget column | Engine region template `core:desktop-widgets` (decorative + plugin-extensible) |
| Spaces | Multiple workspace region instances; URL slot picks active |
| Cmd+K palette | `<BindingsConsumer>` + `triggerStore` already covers this; engine binds shortcut |
| `wp.desktop.confirm()` | App-level `<Modal>` + `useDialog`; no kernel work |
| `wp.desktop.fetch()` / `trackedFetch()` | `@wordpress/api-fetch` + activity-bus middleware (new engine service) |
| `<wpd-*>` Web Components | `@wordpress/ui` + `@wordpress/components` (different DS — engine choice) |
| OS Settings | Engine-bundled settings app, registered as a windowed app |
| Postmessage bridge protocol | Same protocol, ported verbatim |
| `desktop_mode_register_wallpaper()` | Engine extension API (out of scope MVP) |
| AI Copilot | Engine-side platform service (out of scope MVP) |
| `createSharedStore` | Kernel-side `@wordpress/data` store (already exists) |
| Presence | New engine-side platform service |
