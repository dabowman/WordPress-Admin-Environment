# Theme Provider Overhaul

**Date:** 2026-05-06
**Status:** Draft
**Owner:** TBD
**Target:** v2.x branch (post v2.0.0-beta.1, pre v2.0.0-beta.2)

## Goal

Three coordinated changes to the v2 theming pipeline:

- **A. Drop the hand-rolled fallback ThemeProvider.** Gutenberg is a hard runtime dependency per CLAUDE.md; the fallback path is dead code that doubles the surface area.
- **B. Make the ThemeProvider an engine intrinsic.** Engines export an optional `ThemeProvider` component (same prop contract). Default engine ships with the WPDS-backed provider; alternative engines can ship their own design system (Material, Tailwind tokens, brand-locked palette, etc.) without touching kernel code.
- **C. Promote engine-level seed defaults.** `engine.json` declares `default-styles` (theme seeds + chrome surface palette). Resolver merges them beneath admin.json `styles`. Bundled shells stop duplicating the dark-chrome palette.

Net result: one code path through theming, theming becomes part of the engine's identity, shells get smaller and more focused on install decisions instead of palette plumbing.

## Non-goals

- Changing the public token names (`--wpds-*`, `--wp-admin-shell--chrome--*`).
- Changing the resolver cascade (core / plugin / site / role / user) — engine defaults sit at a separate layer applied during engine resolution, not as a sixth origin.
- Replacing `@wordpress/theme.ThemeProvider`. The default engine still piggybacks the private-API allowlist; the change is structural, not behavioral.
- Per-region custom theme providers. Scoped overrides keep the same provider as the shell root; only the engine boundary is pluggable. (Future extension if a use case emerges.)

## Architecture

### Provider contract

Engines export an optional `ThemeProvider` whose props are:

```ts
type EngineThemeProviderProps = {
    isRoot: boolean;
    styles: AdminJsonStyles;        // merged engine.default-styles + admin.json styles
    tokens: TokensJson;             // resolved DTCG token map
    density: 'default' | 'compact' | 'comfortable';
    children: React.ReactNode;
};
```

The component must:

1. Render `children` inside a wrapper element carrying `data-wpds-theme-provider-id` (or an engine-specified equivalent attribute, declared in `engine.json#theme-provider.scope-attribute`).
2. Emit any seed-derived CSS for tier-1 / tier-2 inputs (`styles.theme.*` and nested region/app `theme` blocks).
3. Honor `density` — either set `data-wpds-density={density}` on its wrapper or apply equivalent design-system-specific density semantics.

Tier-3 slot overrides (`styles.color`, `styles.border`, etc.), the chrome → WPDS bridge, and per-region/app scoped overrides remain shell concerns. The kernel emits them as a sibling `<style>` block scoped to the provider's wrapper id, regardless of which provider is active. Engine providers don't need to reimplement them.

### Engine module shape

```js
// src/runtime/engines/core-default/index.js
import Layout from './Layout';
import { WpdsThemeProvider } from './WpdsThemeProvider';
import './index.css';

export default {
    kind: 'engine',
    id: 'core:default',
    title: 'Default',
    Component: Layout,
    ThemeProvider: WpdsThemeProvider,   // ← new optional field
};
```

`WpdsThemeProvider` is what `ShellThemeProvider`'s real-provider path becomes after the move. Pure relocation, no behavior change.

### Default fallback when engine omits `ThemeProvider`

If an engine doesn't ship one, the kernel uses `WpdsThemeProvider` from `core:default` as the platform default. This keeps the WPDS surface universally available even for stripped-down third-party engines that only customize layout. A future option flag (`engine.json#theme-provider.opt-out: true`) can disable the platform default for engines that genuinely render their own untouched DOM (e.g. an iframe-only engine).

### Engine default-styles

`engine.json` gets a new `default-styles` object. Same shape as admin.json `styles`, but limited to:

- `theme.color.{primary, bg}`
- `theme.cursor.control`
- `theme.density`
- `chrome.*` (sidebar / toolbar / site-hub bindings)
- Top-level slot overrides (`color`, `border`, `dimension`, `elevation`, `font`)

Excluded (admin.json domain only):

- `regions[…]` — engines don't know which regions a shell will declare
- `applications[…]` — same
- `branding.*` — install-decision metadata, not visual identity

### Merge semantics

PHP `WP_Admin_Shell_Resolver` runs:

```
core (origin)
  → plugin
  → site
  → role
  → user
  → wp_admin_shell_data filter
  → engine resolution (read config.engine, load engine manifest)
  → engine default-styles deep-merged UNDER config.styles  ← new step
  → final tree
```

Engine defaults sit at the bottom of the styles tree (admin.json beats them on every key). They never affect non-style fields (regions, applications, capabilities, navigation). The merge is a pure deep-merge with no tombstones — engine defaults are origin-less; if a shell wants nothing, it sets the slot to an explicit empty value.

JS-side mirror: `src/runtime/kernel.js` could perform the same merge on the resolved tree as a defensive step, but the PHP-side merge is authoritative. Tests cover both.

## File-by-file impact

### Phase A — drop fallback

| File | Change |
|---|---|
| `src/runtime/styles/ShellThemeProvider.js` | Delete `FallbackProvider`, `buildFallbackCss`, `projectThemeSeedsToWpdsSlots`. Throw a dev-warned empty render when `RealThemeProvider === null`. Rename remaining real-path code to `WpdsThemeProvider`. |
| `src/runtime/styles/compatBridge.js` | Delete entire file. `@wordpress/theme/src/use-theme-provider-styles.ts:120-129` emits the same aliases. |
| `src/runtime/kernel.js` | No change yet (Phase B handles relocation). |
| `CLAUDE.md` | Replace "two-tier" theming description with "engine-supplied ThemeProvider, default = WPDS". Note that Gutenberg-missing now renders empty (was: degraded fallback). |
| Changelog | Add breaking-note: "v2.0.0-beta.2 removes the no-Gutenberg fallback. Sites without the Gutenberg plugin will render an empty shell." |

### Phase B — engine-supplied ThemeProvider

| File | Change |
|---|---|
| `src/runtime/registry/source-types.js` | Add `ThemeProvider?: React.ComponentType<EngineThemeProviderProps>` to the `EngineSource` typedef. |
| `src/runtime/registry/createRegistry.js` | Validate `ThemeProvider` is a function when present (registry already kind-checks). |
| `src/runtime/engines/core-default/WpdsThemeProvider.js` | New file. Receives the unlock + scoped detail CSS logic from `ShellThemeProvider.js`. |
| `src/runtime/engines/core-default/index.js` | Import + export `ThemeProvider: WpdsThemeProvider`. |
| `src/runtime/engines/core-single-pane/index.js` | Same — single-pane shares the WPDS provider. (Could optionally export `ThemeProvider: WpdsThemeProvider` from a shared module to avoid duplication.) |
| `src/runtime/styles/ThemeProviderHost.js` | New thin wrapper. Reads `engineSource.ThemeProvider || PlatformDefaultThemeProvider`. Renders the chosen provider with the merged styles. Owns the scoped detail `<style>` emission so engines don't have to. |
| `src/runtime/styles/ShellThemeProvider.js` | Slim to a re-export of `ThemeProviderHost` for backward-compat in tests. May delete entirely if no callers remain. |
| `src/runtime/styles/ScopedThemeProvider.js` (split out) | Reads engine's `ThemeProvider` from kernel context (already has access via `useKernel`). Wraps subtrees with the engine's provider, not always the WPDS one. |
| `src/runtime/kernel.js` | Replace `<ShellThemeProvider>` mount with `<ThemeProviderHost engineSource={engineSource} …>`. Pass the engine source through to context so `Region` / `MountedApp` can use the same provider for nested scopes. |
| `src/runtime/regions/Region.js` | `ScopedRegionTheme` reads engine.ThemeProvider via `useKernel()`; calls `<ScopedThemeProvider>` which delegates internally. |
| `src/runtime/regions/mountApp.js` | Same pattern. |
| Test: `tests/runtime/themeProviderHost.test.mjs` | New. Asserts engine.ThemeProvider takes priority; platform default used when absent; opt-out flag respected. |
| Test: `tests/parity/wpds-snapshot.test.mjs` | Verify default engine still emits expected slot list (no regression). |
| `docs/wp-admin-shell-design-spec.md` | Section §6 (engines) — document `ThemeProvider` as part of the engine contract. New §6.x "Engine ThemeProvider" subsection. |

### Phase C — engine default-styles

| File | Change |
|---|---|
| `docs/schemas/admin-engine-v2.json` | Add `default-styles` property at the top level. Schema mirrors admin-v2's `styles` but restricts `regions`/`applications` (set `additionalProperties: false` and explicit `not` for those keys; or just whitelist allowed keys). |
| `src/runtime/engines/core-default/engine.json` | Add `default-styles` block: dark-chrome palette migrated from `developer-admin.json` + `client-portal.json` + `wp-admin-default.json` overlap. Authoritative dark-chrome lives here. |
| `src/runtime/engines/core-single-pane/engine.json` | Add minimal `default-styles` matching its mobile-first idiom. |
| `includes/cascade/class-wp-admin-shell-resolver.php` | After main cascade resolves `engine`, load engine manifest, deep-merge `engine.default-styles` under `tree.styles`. New private method `apply_engine_defaults`. Engine load path already exists for region templates — reuse `WP_Admin_Shell_Engine_Manifest` accessor. |
| `src/runtime/manifests.js` | Engine manifest loader picks up `default-styles` field for JS consumption (currently picks up `templates`); minor extension. |
| `src/runtime/kernel.js` | Defensive JS-side merge in case PHP path is bypassed. Single line: `const shellStyles = deepMerge(engineManifest.defaultStyles || {}, config.styles || {})`. |
| `shells/wp-admin-default.json` | Drop dark-chrome palette where it duplicates `core:default` defaults. Keep only the wp-admin-mirror specifics. |
| `shells/developer-admin.json` | Same — dark-chrome dies, only the demo overrides remain (red accent etc.). |
| `shells/client-portal.json` | Same. Logo + branded-red accent stay; chrome scaffold inherits engine. |
| `shells/v1-demo.json` | Touch only if the cascade-test fixtures are sensitive to the styles tree shape. May need inverse adjustments to the test expectations. |
| `shells/content-author.json` | Likely no changes — minimal shell, doesn't author dark-chrome. |
| Test: `tests/php/run-tokens-tests.php` | Add 4 assertions: engine defaults apply when absent in admin.json; admin.json wins on overlap; engine.regions/applications never leaks; switching engine swaps defaults. |
| Test: `tests/php/run-shape-tests.php` | New invariant: every bundled shell still resolves to a tree with `styles.theme.color.bg` defined post-merge. |
| Test: `tests/runtime/engineDefaults.test.mjs` | New. Pure-ESM test on the JS-side defensive merge. |
| Test: `tests/schema/validate-shells.test.mjs` | Already sweeps engine manifests — extend to validate `default-styles` on `core:default` + `core:single-pane`. |
| `docs/wp-admin-shell-design-spec.md` | §4 (cascade) — document engine-defaults as a layer applied during engine resolution. §6 (engines) — `default-styles` as part of the engine contract. |
| `docs/v2-readiness.md` | Note the new merge step in the resolver flow diagram. |

## Migration order

1. **Phase A — drop fallback.** Lowest blast radius. Pure deletion plus rename. Land first; ship as part of v2.0.0-beta.2.
2. **Phase B — engine-supplied ThemeProvider.** Refactor only; default engine ships the WPDS provider that already exists, just relocated. Behavior identical for `core:default` and `core:single-pane`. Land second.
3. **Phase C — engine default-styles.** Real semantics change. Land last so any shell-rendering regression is bisectable to this commit alone.

Each phase is independently shippable and testable. Don't bundle.

## Tests at completion

- 527 → expected ~537 assertions:
  - +4 PHP (engine defaults merge)
  - +1 PHP (post-merge styles invariant)
  - +3 Node runtime (engine defaults JS-side, ThemeProviderHost contract)
  - +2 Node schema (engine default-styles validation on bundled engines)
- Manual smoke: render every bundled shell pre/post Phase C, visual diff. No pixel changes expected — engine defaults reproduce the palette shells previously declared.
- Storybook (if added later): a `core:tailwind` example engine demonstrates that swapping `ThemeProvider` produces a non-WPDS palette without touching kernel code.

## Risks

| Risk | Mitigation |
|---|---|
| Sites without Gutenberg silently render empty after Phase A. | Detect at PHP load time; emit an admin notice via `admin_notices` linking to the Gutenberg plugin install. Already implied by `Requires Plugins: gutenberg` header — Phase A formalizes the contract. |
| Third-party engines ship a broken `ThemeProvider` that throws at mount. | Wrap in `<ErrorBoundary>` inside `ThemeProviderHost`. On error, fall back to platform default with a console warning; shell still renders. |
| Engine default-styles diverge from shell expectations (e.g. shell author assumes "no styles set" means white background, but engine default supplies dark). | Document the merge order explicitly in `docs/wp-admin-shell-design-spec.md` §4. Existing shells migrated by hand — every dark-chrome rule that disappears from a shell is replaced by an engine default of the same value, so visual output is invariant. |
| Schema-extension authors miss the new `default-styles` field. | `validate-shells.test.mjs` sweeps every bundled engine manifest; CI fails if the schema isn't followed. Extension authors get the same treatment when they ship through `wp_admin_shell_register_engine`. |
| Engine `ThemeProvider` opt-out flag introduces a third no-WPDS path. | Defer to a future RFC. Phase B does not introduce the flag — only the optional component. |

## Out of scope (defer)

- Per-region / per-app custom ThemeProvider override — keeps engine boundary as the only seam for now.
- Tooling for engine authors (CLI scaffolder, story for testing custom providers).
- Theming presets (light/dark variant of `core:default` shipped alongside the dark default).
- Migration of `--wp-admin-shell--chrome--*` token names into the WPDS namespace. Chrome-extension layer stays parallel.

## Definition of Done

- All three phases shipped on `feat/wp-admin-shell-v2`.
- Test count up by ~10 assertions; all green.
- Bundled shells render visually identical to v2.0.0-beta.1.
- `core:default` engine ships its dark-chrome palette in `engine.json#default-styles`.
- `developer-admin.json`, `client-portal.json`, `wp-admin-default.json` no longer carry duplicated dark-chrome rules.
- A demo "alt-engine" PR (separate, follow-up) demonstrates a non-WPDS provider mounting cleanly through the new contract — proves the seam works in practice.
- Spec §4 + §6 + readiness docs updated.
- Changelog notes the no-Gutenberg-fallback removal as a breaking change against v1.x → v2.0.0-beta.2 migration.
