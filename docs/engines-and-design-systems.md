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
  `<style>` block scoped to a wrapper `<div data-wpds-theme-provider-id>`.
  The attribute name is the cross-engine scope hook, not WPDS-specific
  despite the legacy name.
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

`core:desktop` ships under **contract #1** for v2.x — the WPDS-default
`ThemeProvider` fallback handles WPDS-flavored apps inside windows, and
the engine's chrome (workspace, dock, window frames, snap ghost) runs
on its own `--wp-admin-shell--chrome--*` slot vocabulary fed by
`compileStyles` + `engine.json#default-styles`. Contract #2 (the
WPDS→engine token bridge `wpdsBridge.mjs` from the original plan) is
documented as a follow-up — the chrome-vs-contents aesthetic split is
acceptable for the MVP and matches users' classic WM mental model.

## Documentation deliverables (where to look)

- **Kernel boundary** — `CLAUDE.md` § "Kernel is DS-neutral" rule.
- **Engine `compileStyles` shape** — `src/runtime/registry/source-types.js`
  JSDoc typedef + `src/runtime/styles/ThemeProviderHost.js` consumer.
- **Engine `default-styles` Phase C contract** —
  `docs/schemas/admin-engine-v2.json#/$defs/defaultStyles` +
  `includes/cascade/class-wp-admin-shell-resolver.php` synthetic
  origin merge.
- **WPDS-default ThemeProvider** —
  `src/runtime/styles/WpdsThemeProvider.js` (private-API unlock
  pattern; reused by `core:default` / `core:single-pane`).
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
