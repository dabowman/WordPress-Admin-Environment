# Engines and design systems

How the WP Admin Shell separates design-system concerns across the
kernel, engines, and apps — and what plugin authors can swap.

Surfaced 2026-05-12 while planning the desktop engine port. Codified
2026-05-14 with the desktop engine shipping as the first non-WPDS
chrome consumer.

## Layers

The shell renders in three logical layers:

```
┌─────────────────────────────────────────────────────────┐
│  kernel  (DS-neutral)                                   │
│   - cascade resolver, routing, capability gating        │
│   - region rendering primitive, ThemeProviderHost seam  │
│   - bindings, dirty-state, icon registry                │
│   - dynamic-children store                              │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │  engine  (DS-pluggable, chrome scope)           │   │
│   │   - Layout component                            │   │
│   │   - ThemeProvider (optional)                    │   │
│   │   - compileStyles (optional)                    │   │
│   │   - icon table                                  │   │
│   │   - engine.json templates + default-styles      │   │
│   │                                                 │   │
│   │   ┌─────────────────────────────────────────┐   │   │
│   │   │  app  (DS-married to its author choice) │   │   │
│   │   │   - React component                     │   │   │
│   │   │   - app.json + window block             │   │   │
│   │   │   - imports its components / tokens     │   │   │
│   │   └─────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Kernel — DS-neutral

The kernel owns the cascade resolver, routing, capability gating,
region rendering primitive, `ThemeProviderHost` seam, bindings,
dirty-state, icon registry, and dynamic-children store. None of it
consumes a design system.

Verified: zero `--wpds-*` / `@wordpress/ui` / `@wordpress/components`
references in `src/runtime/*` outside `engines/`. The icon registry
is populated by the active engine at module-load; the kernel sees
only opaque names.

**Test before adding kernel code:** would a hypothetical Material
Design engine plugin loading alongside this plugin still work?
If your change tightens the kernel to WPDS, it goes in
`src/runtime/engines/core-default/` instead.

### Engines — DS-pluggable for chrome

Each engine ships its own:

- `EngineSource.ThemeProvider` field (optional) — React component the
  host wraps around the engine's tree.
- `EngineSource.compileStyles` hook (optional) — emits `{top, scoped,
  subtrees}` CSS-variable buckets the host renders as a sibling
  `<style>` block scoped to a wrapper `<div data-theme-scope-id>`.
  The attribute is the cross-engine scope hook (renamed from the
  pre-PR-#49 `data-wpds-theme-provider-id` to drop the misleading
  DS-specific prefix).
- Own token namespace — `core:default` and `core:single-pane` use
  `--wpds-*`; `core:desktop` uses `--wp-admin-shell--chrome--*` slots
  consumed by inline CSS variable fallbacks. A Material engine would
  ship its own `--md-*` namespace and a token resolver.
- Own region templates in `engine.json` (default-style block,
  platform services, role).
- Own icon table.

Engines can ship any DS — Material, Tailwind, brand-locked — without
kernel changes. This is the post-DS-decoupling promise (v2.0.0-beta.2),
kept.

### Apps — DS-married, intentionally

The 30 bundled apps under `src/apps/` import `@wordpress/ui` or
`@wordpress/components` directly; their CSS reads `--wpds-*` tokens.
These apps were authored *for* the `core:default` engine and assume
its DS contract.

**The WPDS dependency is a feature of using the default apps, not a
bug in the engine system.** An engine that wants a fully non-WPDS UI
surface ships its own apps that import its own components.

## Three contracts for any engine

When an engine wants to differ from the default's DS, it picks one of:

| Engine wants… | Path | Cost |
|---|---|---|
| Default apps unchanged, accept WPDS inside windows + own DS for chrome | Reuse `src/apps/*` as-is; ship own `ThemeProvider`/`compileStyles` for chrome only | Cheapest. Mixed aesthetic (chrome = engine DS, contents = WPDS) — a coherent contract, like Linux WMs themed independently from GTK app contents. |
| Default apps with engine palette bleeding into WPDS primitives | Reuse `src/apps/*` + ship a token bridge that maps WPDS color/dimension slots to engine tokens | ~1 day. Aesthetic alignment at primitives layer; component-internal WPDS spacing/borders still leak through. |
| Full DS replacement inside windows | Ship engine-native apps that import the engine's own components | Per-app refactor. Apps are well-encapsulated — refactor one at a time, never blocks engine launch. |

`core:desktop` ships under **contract #1** for v2.x — the engine
itself declines to ship a `ThemeProvider`, so `ThemeProviderHost`
mounts a neutral pass-through wrapper around the tree (PR-#49 Stage 4;
pre-Stage-4, the host fell back to `WpdsThemeProvider`). WPDS-flavored
apps inside windows still consume `--wpds-*` tokens via their own
`@wordpress/ui` / `@wordpress/components` CSS imports — those tokens
resolve against `@wordpress/ui`'s built-in defaults without engine-
level seed propagation. The engine's chrome (workspace, dock, window
frames, snap ghost) runs on its own `--wp-admin-shell--chrome--*` slot
vocabulary fed by `compileStyles` + `engine.json#default-styles`.
Contract #2 (the WPDS→engine token bridge `wpdsBridge.mjs` from the
original plan) is documented as a follow-up — the chrome-vs-contents
aesthetic split is acceptable for the MVP and matches users' classic
WM mental model. An engine that wants the WPDS seeds (color.primary /
density / cursor) propagated into its windows ships
`EngineSource.ThemeProvider = WpdsThemeProvider` from the core-default
sibling and gets the full WPDS surface for free.

## Documentation deliverables (where to look)

- **Kernel boundary** — `CLAUDE.md` § "Kernel is DS-neutral" rule.
- **Engine `compileStyles` shape** — `src/runtime/registry/source-types.js`
  JSDoc typedef + `src/runtime/styles/ThemeProviderHost.js` consumer.
- **Engine `default-styles` Phase C contract** —
  `docs/schemas/admin-engine.json#/$defs/defaultStyles` +
  `includes/cascade/class-wp-admin-shell-resolver.php` synthetic
  origin merge.
- **WPDS-flavored ThemeProvider** —
  `src/runtime/engines/core-default/WpdsThemeProvider.js` (private-API
  unlock pattern; shipped by `core:default` via
  `EngineSource.ThemeProvider`, reused by `core:single-pane` via
  sibling import). Relocated out of the kernel in PR-#49 Stage 4 so
  the kernel never imports a DS-specific provider — engines opt into
  shell theming by shipping a `ThemeProvider`; absence falls back to
  a neutral pass-through wrapper inside `ThemeProviderHost`.
- **Desktop engine compiler** —
  `src/runtime/engines/core-desktop/compileStyles.mjs` (smaller
  vocabulary, no WPDS bridge).
- **Per-app DS refactor guide** — TBD when the first engine commits
  to contract #3. Skeleton: enumerate the app's `@wordpress/*`
  imports, swap to the engine's equivalents, port the CSS-token
  consumers, re-audit a11y patterns.

## When NOT to use the engine API

- For an app that needs different chrome inside an existing engine
  → ship an app, not an engine. Engines are about the shell shape;
  apps are about the surface inside.
- For a brand re-skin of `core:default` → use `styles.chrome.*` in
  admin.json. Slot overrides flow through the engine's compileStyles
  without code.
- For a one-off layout tweak → declare a new region template inside
  the existing engine's `engine.json` rather than forking the engine.

## Theming model — author customization paths

`ThemeProviderHost` is the kernel's single seam to the active engine's
`ThemeProvider`. Absent provider → neutral pass-through wrapper
(`NeutralProvider`), no DS injected. The host wraps the inner provider
in a render-error boundary; a throwing third-party provider swaps to
the neutral wrapper + console error so the shell still paints. The host
emits `<div data-theme-scope-id={id}>` around children with a sibling
`<style data-theme-scope-detail={id}>` carrying engine-compiled scoped
CSS. Verified by `tests/runtime/kernel-no-ds-import.test.mjs`.

Author customization, in order of preference:

1. **Seeds** — `styles.theme.{color.{primary,bg}, cursor.control,
   density}`. The engine's `ThemeProvider` interprets them.
2. **Nested seeds** — `styles.regions[id].theme` /
   `styles.applications[id].theme`. `<Region>` / `<MountedApp>` wrap
   content in a nested `<ScopedThemeProvider>` reading the engine's
   provider from kernel context.
3. **Direct slot overrides** — `styles.{color,border,dimension,
   elevation,font}` (top-level + per-region/app). Escape hatch the
   engine's `compileStyles` translates into provider-scoped CSS vars.
4. **DTCG `tokens.json` primitives** — provider-independent named
   primitives, consumable from any of the above via `{tokens.x.y}`.

Density: `ThemeProviderHost.pickDensity()` (helper `themeScope.mjs`)
pulls `styles.theme.density`, falls back to `styles.density`, passes
the raw string to the engine's provider. The `default|compact|
comfortable` enum validation lives in `WpdsThemeProvider`, NOT the
kernel — a Material/Tailwind engine interprets the raw string itself.

Slot/Fill substrate (`<SlotFillProvider>` from `@wordpress/components`)
lives in each engine's `Layout.js`, NOT the kernel. Bundled engines all
ship it so notices snackbar / modals / `core:editor.sidebar` work; a
non-WPDS engine omits it.

## How tokens reach DOM (core:default / core:single-pane)

Two engine-side paths (never kernel):

- **Engine template `default-style`** — `core:default` emits values
  like `var(--wp-admin-shell--chrome--sidebar--background,
  var(--wpds-color-bg-surface-neutral))` as inline style on each
  region's `<div>`. `resolveRegion.mjs` merges template `default-style`
  into `region.style`; `Region.js`'s `toReactStyle` kebab→camelCases
  and applies as React `style={...}`. The two-arg `var()` chain: chrome
  var wins when authored, falls back to the WPDS slot when empty.
- **Engine `index.css` class rules** — `core:default/index.css` ships
  chrome-anchor/svg/Stack-defensive overrides + engine root paint
  (`.wp-admin-shell-layout` bg+color via
  `--wp-admin-shell--chrome--canvas--{background,foreground}`).
  Single-pane paints its root through the same canvas slot. Non-WPDS
  engines ship none of these.

Kernel `src/index.css` is ~10 lines: body positioning + a11y fallback
only. `chrome.canvas.*` is the author entry point for shell-wide
bg/fg; `chrome.{sidebar,toolbar,site-hub,content}.*` cover per-surface
chrome. Inside WPDS-flavored app/engine code, never hardcode hex —
use `var(--wpds-*)` so provider seeds flow through.

## `@wordpress/ui` layered-CSS gotchas (bundled WPDS engines)

`@wordpress/ui` injects component CSS at module-load wrapped in
`@layer wp-ui-utilities, wp-ui-components, wp-ui-compositions,
wp-ui-overrides`. Per the cascade-layer spec, **unlayered rules win
against any layered rule regardless of specificity** — and WP-admin
loads many unlayered stylesheets (common.css, forms.css, dashboard.css,
theme resets) that stomp `@wordpress/ui` defaults.

- **Theme by overriding the WPDS tokens it consumes, NOT rendered
  colors per component.** The chrome → WPDS bridge in
  `core-default/compileStyles.mjs` (`CHROME_WPDS_BINDINGS`) maps each
  chrome surface's `chrome.<surface>.<slot>` → a `--wpds-*` interactive
  token, scoped under the surface container class (`.wp-admin-shell-nav,
  .wp-admin-shell-site-hub`, …). Buttons/IconButtons/Stacks inside
  inherit the chrome palette automatically. **Do not** add
  `.wp-admin-shell-*-button { color }` rules — extend the bindings
  table. Engine-private; a non-WPDS engine ships its own.
- **`Stack` stomped to `display: block`** → children flow vertically
  regardless of inline `flex-direction: row`. `core:default/index.css`
  ships a defensive unlayered `.wp-admin-shell [class*="__stack"]
  { display: flex }`. Don't remove without verifying the cascade layer
  applies in every shell DOM context (esp. inside `<button>`).
- Pass explicit `align="center"` to `<Stack direction="row">` with icon
  + text — default `align-items: stretch` mis-sizes SVGs in flex.
- **`href` on `@wordpress/ui` Button / IconButton requires
  `render={<a href={...}/>}`** — both wrap `@base-ui/react` Button which
  renders a native `<button>` and drops `href`. Add `target`/`rel` to
  the `<a>` directly.
- **Anchor-rendered chrome buttons need an unlayered color override** —
  WP-admin's `colors/<scheme>/colors.css` ships unlayered
  `a { color: var(--wp-admin-theme-color) }`; `@wordpress/ui` Button's
  color is layered and loses. `core:default/index.css` ships scoped
  anchor color rules (`.wp-admin-shell-region--{sidebar,toolbar} a,
  .wp-admin-shell-site-hub a { color: var(--wpds-color-fg-interactive-
  neutral) }`) + symmetric `:hover/:focus/:active → -active`.
- **`@wordpress/icons` SVGs need `fill: currentColor` forced** —
  `@wordpress/icons` Icon sets `width`/`height` but not `fill`
  (`@wordpress/ui`'s Icon does). `core:default/index.css` ships
  `.wp-admin-shell-region--{sidebar,toolbar} svg,
  .wp-admin-shell-site-hub svg { fill: currentColor }`.
- **Ellipsis-in-flex** — `@wordpress/ui` Button is `inline-flex`. To
  truncate text in a constrained flex parent (site-hub title): wrapper
  div needs `display: flex; min-width: 0;` AND Button needs
  `flex-grow: 1; min-width: 0; overflow: hidden; text-overflow:
  ellipsis; white-space: nowrap`.
- Custom CSS targeting `@wordpress/ui` DOM must NOT use
  `.components-button` / `.components-item` (those are
  `@wordpress/components` classes). Use the `wp-admin-shell-*` class or
  the `button` element selector inside a chrome wrapper; when render can
  be `<button>` or `<a>`, use `:is(button, a)`.

## Region-scoped theming — the `RegionThemedSubtree` seam

Region/app theming uses a *nested* `@wordpress/theme.ThemeProvider`
(via `<ScopedThemeProvider>`). That provider emits ONLY custom
properties (`--wpds-*` + `--wp-components-*`) on a `display:contents`
element — it never sets `color`, and its tokens don't reach
`document.body` portals. So a nested region (e.g. light content over a
dark-root shell) had two leaks, both fixed by wrapping NON-root provider
children in `RegionThemedSubtree`:

1. **Inherited foreground leak.** The engine paints `color` at the
   layout root (shell-*root* ramp) and `color` inherits. A nested region
   that doesn't re-set `color` leaks the root foreground into its text.
   Components setting their own color from a token (`@wordpress/ui`
   Text/InputControl) looked right; ones relying on inherited `color`
   (`@wordpress/components` Items, icons via `currentColor`, headings)
   rendered light-on-light. Fix: a `display:contents` wrapper with
   `color: var(--wpds-color-fg-content-neutral)` re-establishes the
   region ramp foreground (background NOT set — each surface paints its
   own).
2. **Portaled overlays.** `@wordpress/components` `Popover` (dropdowns,
   `SelectControl` menus, DataViews filter comboboxes) body-portals →
   inherits root theme. Fix: `Popover.__unstableSlotNameProvider` + a
   per-instance-named `Popover.Slot` inside the subtree; Popover prefers
   a matching named Slot over its body portal.

Root/chrome popovers keep body-portaling (correctly root-themed).
**Known gap:** `@wordpress/components` `Modal` uses its own body portal
independent of the Popover slot — Modal overlays (DataViews
`RenderModal`, bulk-confirm) inherit root theme on bg + color; NOT
covered. Engine-private — a non-WPDS engine ships its own strategy.
