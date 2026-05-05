# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

**v1.0.0-beta.1 tagged at `df5fcb5` on `main` (PR #32 merged).** All five v1 milestones (M1 kernel rebuild → M2 cascade → M3 tokens → M4 apps → M5 ship) landed.

**v2 migration in flight on `feat/wp-admin-shell-v2`.** v2 architecture is a substantial refinement of v1 — three artifacts (`app.json` + `engine.json` + `admin.json`) replace the single-file shape; region typing moves from `kind` enum to `role` + `layout` + `platform` + `routing`; one-region-one-app with nested regions replaces `contains[]`; selection event bus removed; shell-level slot/fill removed; navigation is URL-driven (the URL is the full app state; routable regions declare `routing.route-key` naming the URL slot they read from; plain `<a href>` links navigate; `target` keeps native HTML meaning — no shell-specific overload, decided 2026-05-04 superseding the prior 2026-05-01 `<a target>`-as-region-selector idea). Cascade, token system, and capability gating carry forward largely unchanged. The migration directive at `docs/plans/wp-admin-shell-v2-migration-directive.md` is the active plan; master spec at `docs/wp-admin-shell-design-spec.md` (2026-05-01, refined 2026-05-04) is authoritative. v1 prior-state spec preserved at `docs/archive/wp-admin-shell-design-spec-2026-04-29.md`; v1 plan at `docs/archive/wp-admin-shell-v1-plan.md`.

**v1 architecture (current shipping baseline, being migrated).** PHP `WP_Admin_Shell_Resolver` (in `includes/cascade/`) merges five admin.json origins (core / plugin / site / role / user) with restrict-only enforcement and `userCustomizable` filtering, hands the resolved tree to a JS kernel (`src/runtime/kernel.js`) that picks a layout engine from a registry, renders each declared region through the generic `<Region>` renderer (V2.M2 task 2), and mounts apps inside regions via `MountedApp`, plus emits `<style id="wp-admin-shell-tokens">` at `:root` from the styles tree. Capability gating is four-layer (region fast-path → app gate → source-cap floor → REST observation); navigation prunes recursively. Shell switching is option-write + page-reload. Default install shell is `wp-admin-default` — every wp-admin screen rendered as an iframe gated by capability.

**Test surface.** `tests/php/run-cascade-tests.php` (22), `run-selection-tests.php` (5), `run-cap-tests.php` (54), `run-shape-tests.php` (82), `run-manifest-tests.php` (60 — V2.M1 + V2.M2 task 1 boot-time engine load), all via `wp eval-file`. `tests/schema/validate-shells.test.mjs` (26 — admin-v1 + admin-v2 + admin-app-v2 + admin-engine-v2) via `node`. `tests/parity/wpds-snapshot.test.mjs` (4) via `node`. `run-selection-tests.php` will be deleted as part of V2.M4 (selection bus removal). Browser-side perf + a11y manual passes tracked in `docs/v1-readiness.md` and `docs/v1-perf-baseline.md`; v2 will evolve these in place.

**Hard runtime dep:** Gutenberg plugin (declared via `Requires Plugins: gutenberg` header). `@wordpress/ui` overlay components use private APIs whose allowlist only Gutenberg supplies. Without Gutenberg, the shell renders empty.

## Before modifying code

1. Load these skills (symlinked in `.claude/skills/`):
   - `/wordpress-rest-api` — REST API endpoints, authentication, `_fields`/`_embed`, entity records
   - `/wordpress-dataviews` — DataViews component for PostsApp: fields, views, actions, filtering
   - `/gutenberg-contributor` — `@wordpress/*` package APIs, package boundaries, build tooling
2. Read `docs/plans/wp-admin-shell-v2-migration-directive.md` — **active v2 plan**. Five-milestone migration (V2.M1 manifests → V2.M2 region vocabulary → V2.M3 routing → V2.M4 selection-bus + slot removal + app manifests → V2.M5 second engine + tokens.json + ship). Read first before any v2 work.
3. Read `docs/wp-admin-shell-design-spec.md` — **master design spec** (2026-05-01, URL-routing refined 2026-05-04). Authoritative. Three artifacts; `role`/`layout`/`platform`/`routing` region vocabulary; nested regions; one-region-one-app; URL-driven navigation with per-region `route-key` (no HTML-attribute overload); no selection bus; no shell-level slots.
4. Read the three v2 schemas — `docs/schemas/admin-v2.json`, `docs/schemas/admin-app-v2.json`, `docs/schemas/admin-engine-v2.json`. JSON Schema 2020-12 with full inline doc. When prose and schema disagree, schema wins.
5. Read `docs/post-editor-sketch.md` — worked example decomposing the post editor into v2. Surfaces platform-service additions (`dirty-state`, `block-navigation-on-dirty`).
6. Read `docs/research/schema-exercise-findings.md` — runtime validation directive (what the schema can't validate, runtime must). Drives V2.M1 task 5.
7. Skim `docs/archive/wp-admin-shell-design-spec-2026-04-29.md` — superseded v1 architecture, kept as the contract the current shipping code was built against.
8. Skim `docs/archive/wp-admin-shell-v1-plan.md` — completed v1 milestone plan. Useful as a template for comparing the v2 migration shape.
9. Read `docs/schemas/admin-v1.json` — still-load-bearing v1 schema. Every shipped shell + test fixture references it. Stays valid until V2.M2 migrates the bundled shells.
10. Skim `docs/admin-json-schema.md` — original v0/flat schema reference (cascade still reads v0). The v0 normalizer's output shape changes in V2.M4.
11. Read `docs/admin-json-api-validation.md` — REST API coverage analysis per application source. Cross-version.
12. Skim `docs/feedback.md` — running triage log (Inbox / Triaged / In progress / Done). Per directive §2 #4: do **not** fix items proactively during the migration — clean migration first, triage on v2 baseline second.
13. Consult `docs/screens/` — per-screen functional specs (42 files). Tier-2 functional specs covering every wp-admin screen. Source of truth when (re)building any `core:*` app or evaluating REST coverage.
14. Read `docs/research/app-validation-2026-05-04.md` — WPDS / REST / core-data compliance audit of every `src/apps/*` and `src/runtime/apps/*` (validated 2026-05-04, remediation merged at `a29a32e`). Captures the destructive-button fallback pattern, DataViews `/wp` import path, and known WPDS 0.12.0 gaps (no `tone="critical"`, no `variant="ghost"`, no `Text weight/size/color`, no SnackbarList port).

## Key rules

- **WPDS components: prefer `@wordpress/ui` (next-gen WPDS) over `@wordpress/components` whenever an equivalent exists.** Both are part of WPDS — `@wordpress/ui` is built on Base UI + the WPDS token system (`--wpds-*` CSS variables) and is in `@wordpress/dependency-extraction-webpack-plugin`'s `BUNDLED_PACKAGES`, so it bundles with no extra config. Fall back to `@wordpress/components` as of `0.12.0` for: `RadioControl`, `CheckboxControl`, `SelectControl` (also needed for native `<optgroup>` support), `Spinner`, `Divider` (`__experimentalDivider`), `TextareaControl`, `Modal`, `Item`/`ItemGroup`, `__experimentalGrid`, `FormToggle`, `KeyboardShortcuts`, and `Button as DestructiveButton` w/ `isDestructive` (no critical tone in WPDS 0.12). No custom component libraries.
- **Gutenberg plugin is a hard runtime dependency.** Any `@wordpress/ui` overlay component (`Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, form `Select`/`Autocomplete`) transitively imports `@wordpress/theme`, which calls `__dangerousOptInToUnstableAPIsOnlyForCoreModules` against `wp.privateApis`. WP 6.9 core's allowlist excludes `@wordpress/theme`/`@wordpress/ui`/`@wordpress/dataviews`; the Gutenberg plugin overrides `wp-private-apis` with one that includes them. Without Gutenberg, those modules throw at load and the shell renders empty. Local dev: `gutenberg` is in `.wp-env.json`'s `plugins` array. Production: declare a `Requires Plugins: gutenberg` header (or detect-and-conditionally-render) before shipping.
- Component-mapping cheat sheet (use `@wordpress/ui` left side when available; verified against `@wordpress/ui` 0.12.0 source):
  - `Button` (`tone="brand|neutral"`, `variant="solid|outline|minimal|unstyled"`, `size="default|compact|small"`, `loading`) replaces `@wordpress/components` `Button` (`variant="primary"` → `tone="brand" variant="solid"`; `variant="secondary"` → `tone="neutral" variant="solid"`; `variant="tertiary"` → `tone="neutral" variant="outline"`; `variant="link"` → `variant="minimal"`; `isBusy` → `loading`). **No `tone="critical"` and no `variant="ghost"` in 0.12** — for destructive actions keep legacy `Button as DestructiveButton` w/ `isDestructive`. **No `icon`/`label`/`showTooltip` props** — render `<Icon/>` as a child + `aria-label`, or use `IconButton` (has `tooltip`/`shortcut`).
  - `InputControl` (`label`, `description`, `value`, `onChange(e)`) replaces `TextControl` — onChange takes a DOM event, not the raw value (`e.target.value`).
  - `Stack` (`direction`, `gap="xs|sm|md|lg|xl|2xl|3xl"`, `align`, `justify`, `wrap` — CSS string `"wrap"`, not boolean) replaces `__experimentalVStack` / `__experimentalHStack`. `spacing={N}` legacy prop maps to `gap` token names; `flex` style props map to `align`/`justify` (CSS values, not legacy `alignment`).
  - `Text` (`variant="heading-2xl|xl|lg|md|sm|body-xl|lg|md|sm"`, `render={ <h2/> }` to set the tag) replaces `__experimentalHeading` and `__experimentalText`. **No `weight`/`size`/`color` props** — use `<strong>` child or className for emphasis/muted.
  - `Notice.Root` (`intent="info|warning|success|error|neutral"`) + `Notice.Description` + `Notice.Actions` + `Notice.CloseIcon` replaces `Notice`. No `NoticeList` aggregator — render `notices.map(<Notice.Root/>)`. `SnackbarList` has no WPDS port; keep legacy.
  - `Badge` w/ `intent="success|warning|error|neutral"` replaces hand-rolled status pills.
  - Other namespaced replacements when needed: `Card.*` (Root/Header/Title/Content), `Dialog.*`, `Drawer.*`, `Tabs.*`, `Tooltip.*`, `Popover.*`, `EmptyState.*`, `Collapsible.*`. `Modal` from `@wordpress/components` has no clean Dialog port for complex modals — keep legacy where migration would be risky.
- All data fetching uses `@wordpress/core-data` (`useEntityRecords`, `useEntityRecord`). No raw `fetch()`.
- Exception: `@wordpress/api-fetch` is used for non-entity operations (media upload, auto-draft creation).
- Always pass `context: 'edit'` on entity queries that need raw field values. Without it, `view` context is used and `title`/`content`/`excerpt` return only `rendered`, not `raw` — edits silently break.
- `deleteEntityRecord('postType', name, id)` without extra args sends posts to trash. Pass `force: true` for permanent delete. Media and taxonomy terms have no trash and require `force: true`.
- No external npm dependencies. Only `@wordpress/*` packages (loaded as externals by `@wordpress/scripts`).
- Config is passed to JS via `wp_add_inline_script` + `wp_json_encode` (not `wp_localize_script` — it coerces types).
- The `iframe:` escape hatch is a feature, not a compromise. The EditorApp and site-editor use it for MVP.

### Recurring patterns to enforce in review

These three patterns drive most of the bugs caught in code review. Codified here so reviewers and reviewees share the same expectations.

- **Null-guard entity records before reading.** `useEntityRecord('root', 'site')` returns `{ record: null, ... }` while loading. Reading `record.foo` without a guard crashes on first paint. Pattern:
  ```jsx
  const { record, editedRecord, edit, save, hasEdits, isSaving } =
      useEntityRecord( 'root', 'site' );
  if ( ! record ) {
      return <Spinner />;
  }
  ```
  `useEntityRecords` (plural) returns `{ records: null }` similarly — always check before iterating.

- **Refresh state after mutations.** When you `deleteEntityRecord` / `saveEntityRecord` outside `useEntityRecord`'s built-in `save()`, the local `useEntityRecords` cache may not invalidate. Pattern:
  ```jsx
  import { useDispatch } from '@wordpress/data';
  import { store as coreStore } from '@wordpress/core-data';
  const { invalidateResolution } = useDispatch( coreStore );
  // After delete/save:
  invalidateResolution( 'getEntityRecords', [ 'root', 'media', queryArgs ] );
  ```
  If you're maintaining shadow state (`useState` mirroring an entity field), reset it whenever the entity record updates. For modals that mutate one-of-many records, also pass `key={item.id}` so per-item state resets between openings.

- **Icon names go through `iconMap`.** Strings like `"post"`, `"page"`, `"comment"` resolve via `src/runtime/config/iconMap.js`. `resolveIcon` falls back to the `wordpress` icon and emits a dev-mode console warning on misses (M5 #14). When adding a new icon name, add the mapping to `iconMap.js` first; the warn-on-miss surfaces typos in browser console without a dedicated lint pass.

- **DataViews import path.** Use `import { DataViews } from '@wordpress/dataviews/wp';` — NOT bare `'@wordpress/dataviews'`. The bare path risks `Minified React error #130` in plugin contexts. Affected: PostsApp, TaxonomyApp, UsersApp, CommentsApp, PluginsApp.

- **Site title source-of-truth.** Read site title via `useEntityRecord('root','site').record.title` (with `decodeEntities` from `@wordpress/html-entities`). Fall back to `window.wpAdminShell?.siteName` only as last resort.

- **Self-delete guard on bulk user delete.** Filter out the acting user (`window.wpAdminShell?.userId`) before sending REST. Reassign-to-self fails server-side and the bulk request errors silently mid-flight.

- **`@wordpress/ui` layered CSS gotcha.** Component CSS is injected at module-load via `document.head.appendChild`, wrapped in `@layer wp-ui-utilities, wp-ui-components, wp-ui-compositions, wp-ui-overrides`. Per the cascade-layer spec, **unlayered rules win against any layered rule regardless of specificity** — and WP-admin loads many unlayered stylesheets (common.css, forms.css, dashboard.css, theme resets) that can stomp `@wordpress/ui` defaults.
  - **Theme `@wordpress/ui` by overriding the WPDS tokens it consumes, NOT by overriding rendered colors per component.** The shell does this via the chrome → WPDS bridge in `src/runtime/styles/compileStyles.js` (`CHROME_WPDS_BINDINGS`): each chrome surface (sidebar / toolbar / site-hub) maps `chrome.<surface>.<slot>` → a `--wpds-*` interactive token, scoped under the surface's container class (`.wp-admin-shell-nav, .wp-admin-shell-site-hub` etc.). `@wordpress/ui` Buttons / IconButtons / Stacks inside the scope inherit the chrome palette automatically. **Do not** add `.wp-admin-shell-*-button { color: ... }` rules — extend the bindings table instead.
  - When a layered rule like `Stack`'s `display: flex` gets stomped, the component falls back to `display: block` and children flow vertically regardless of the inline `flex-direction: row` style. The shell ships a defensive unlayered rule in `src/index.css`: `.wp-admin-shell [class*="__stack"] { display: flex }`. Do not remove it without first verifying the cascade layer applies in every shell DOM context (especially inside `<button>` content models).
  - Pass explicit `align="center"` to `<Stack direction="row">` calls that contain icon + text. The browser default `align-items: stretch` can render SVGs at unexpected heights inside flex containers.
  - **`href` on `@wordpress/ui` Button / IconButton requires `render={<a href={...}/>}`.** Both wrap `@base-ui/react` Button which always renders a native `<button>` and silently drops `href` — clicks don't navigate. Use the `render` prop to swap the underlying element. Add `target` / `rel` to the `<a>` directly.
  - **Anchor-rendered chrome buttons need an unlayered color override.** WP-admin's `colors/<scheme>/colors.css` ships an unlayered `a { color: var(--wp-admin-theme-color) }` rule. `@wordpress/ui` Button's color is layered (`@layer wp-ui-components`) and loses. The shell ships scoped anchor color rules in `src/index.css` (`.wp-admin-shell-{nav,toolbar,site-hub} a { color: var(--wpds-color-fg-interactive-neutral) }`) for the same scopes the chrome → WPDS bridge populates. Symmetric `:hover/:focus/:active → -active` rules cover state transitions.
  - **`@wordpress/icons` SVGs need `fill: currentColor` forced.** `@wordpress/icons` Icon clones the SVG and sets `width`/`height` but does NOT add `fill="currentColor"` (`@wordpress/ui`'s Icon does). Library SVGs (e.g. `wordpress`) have no `fill` attribute → browser default black. The shell ships `.wp-admin-shell-{nav,toolbar,site-hub} svg { fill: currentColor }` to unify behavior.
  - **Ellipsis-in-flex pattern for `@wordpress/ui` Button text content.** `@wordpress/ui` Button is `inline-flex` by default. To make the text truncate inside a constrained flex parent (e.g. the site-hub title): the Button's wrapper div needs `display: flex; min-width: 0;` AND the Button needs `flex-grow: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The wrapper's `min-width: 0` overrides the default flex-item `min-width: auto`; the wrapper's `display: flex` is what makes the Button's `flex-grow: 1` actually stretch.
  - Custom CSS that targets `@wordpress/ui`-rendered DOM should NOT use the legacy `.components-button` / `.components-item` chains (those are `@wordpress/components` classes that don't appear on `@wordpress/ui` output). Use the `wp-admin-shell-*` class alone, or the `button` element selector inside a chrome wrapper. When the rendering can be either `<button>` or `<a>` (e.g. via `render` prop), use `:is(button, a)`.

- **DataViews uses `@wordpress/dataviews/wp` plus a CSS copy.** Webpack copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`; PHP enqueues `dataviews.css` separately. The `/wp` subpath is the runtime-private export that registers DataViews against `wp.privateApis` correctly.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
```

## Testing

273 assertions across seven suites — all run before merge. The two regressions surfaced during review (`settings.defaultRoute` / `settings.applications` reader-path drift) are now covered by the shape + smoke-target suites.

```bash
# Node — schema + WPDS parity + runtime
npm run test:schema      # 26 — Ajv against admin-v1.json (legacy beta) + admin-v2.json + admin-app-v2.json + admin-engine-v2.json (bundled shells + positive/negative fixtures)
npm run test:parity      # 4  — WPDS slot-list drift detector
npm run test:runtime     # 20 — V2.M2 task 3 resolveRegion merge: passthrough, role/platform/style precedence, nested children, map iteration

# PHP — wp-env CLI container
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php    # 22
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php   # 60 — V2.M1 manifest validator + registry + resolver, V2.M2 boot-time engine load
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-selection-tests.php  # 5
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php        # 54
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php      # 82
```

**Pure-JS runtime modules go in `.mjs` files** so node test scripts (`tests/runtime/*`) can `import()` them directly without a webpack/jest harness. Webpack's default extension list (`['.wasm', '.js', ...]`) does **not** include `.mjs`, so importing a `.mjs` module from app code requires the explicit extension at the import site (e.g. `import { resolveRegion } from './regions/resolveRegion.mjs'`). The convention applies only to side-effect-free utility modules; React components stay `.js`.

`run-shape-tests.php` walks every bundled shell through the resolver and asserts structural invariants (engine + regions + applications + defaultRoute resolves). Catches the v1-canonical-path-drift bug class. Runtime React-component smoke (JSDOM) tracked in issue #30.

Test layering matches `WP_Theme_JSON_*Test`'s pattern: schema validation, fixture-driven unit, end-to-end shape, plus pending JSDOM mount. Add a fixture before fixing the next runtime-reader bug — never in the fix commit.

## Webpack externals

`webpack.config.js` extends the default `@wordpress/scripts` config with a `copy-webpack-plugin` step that copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`. The dep-extraction plugin's defaults handle the rest — `@wordpress/dataviews` and `@wordpress/ui` are both in the upstream `BUNDLED_PACKAGES` list and bundle themselves; everything else externalizes to `wp.*`.

### `@wordpress/ui` requires the Gutenberg plugin

`@wordpress/ui` and `@wordpress/theme` opt into private APIs via `__dangerousOptInToUnstableAPIsOnlyForCoreModules`. WP core 6.9's runtime allowlist (`CORE_MODULES_USING_PRIVATE_APIS`) is a 16-package set that does **not** include `@wordpress/ui`/`@wordpress/theme`/`@wordpress/dataviews`. The list and the `allowCoreModule` helper are not exported on `wp.privateApis`, so we cannot extend the allowlist from outside.

The **Gutenberg plugin** ships its own `wp-private-apis` script bundle (`build/scripts/private-apis/`) that overrides core's. Its allowlist (verified on Gutenberg 23.0.1) includes `@wordpress/ui`, `@wordpress/theme`, `@wordpress/dataviews`, `@wordpress/fields`, `@wordpress/admin-ui`, `@wordpress/views` and more, with the `'I acknowledge…'` consent string those packages send. With Gutenberg active, every `@wordpress/ui` component loads cleanly.

Without Gutenberg, overlay components throw at module-load time — the throw fires inside the import graph before React mounts, so the entire shell renders empty with no React error boundary catching it. `Notice.CloseIcon → IconButton → Tooltip → themePrivateApis` is one of several chains that breaks.

**Implication:** Gutenberg is a hard runtime dependency. `.wp-env.json` includes `gutenberg` in its `plugins` array. Distribution must declare `Requires Plugins: gutenberg` (or detect-and-conditionally-render a `@wordpress/components` fallback when missing).

**Past failed workaround — don't repeat:** bundling `@wordpress/private-apis` to control the allowlist creates a *separate registry* from the runtime `wp.privateApis`. `@wordpress/dataviews` (also bundled) then tries to `unlock()` objects locked by `wp.components` in the runtime registry → `"Cannot unlock an object that was not locked before"`.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── shells/                  # Bundled admin.json configurations
│   ├── wp-admin-default.json  # DEFAULT install shell — wp-admin mirror w/ capability-gated apps
│   ├── developer-admin.json   # Demo: native v1 apps (users / comments / settings / site-editor)
│   ├── content-author.json    # Demo: minimal writer shell (collapsed nav)
│   └── client-portal.json     # Demo: branded shell (logo, red accent, scoped nav)
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP
│   ├── class-wp-admin-shell-config.php           # Read-only wrapper around merged tree
│   ├── class-wp-admin-shell-can-rest.php         # /wp-admin-shell/v1/can/{cap}
│   ├── class-wp-admin-shell-prefs-rest.php       # /wp-admin-shell/v1/user-prefs
│   ├── class-wp-admin-shell-selection-rest.php   # /wp-admin-shell/v1/selection[/{scope}]
│   ├── class-wp-admin-shell-cli.php              # `wp admin-shell …` commands
│   ├── cascade/                                  # Cascade resolver
│   │   ├── class-wp-admin-shell-resolver.php     # Two-phase merge + load_origins
│   │   ├── class-wp-admin-shell-merge.php        # merge_authoritative + plain merge w/ tombstones
│   │   ├── class-wp-admin-shell-customizable.php # userCustomizable filter (default-deny)
│   │   ├── class-wp-admin-shell-cache.php        # WP_Object_Cache + transient w/ hash keying
│   │   └── class-wp-admin-shell-config-validator.php  # configSchema cache
│   └── origins/
│       └── class-wp-admin-shell-origin-core.php  # v0 → v1 normalize + empty baseline + chrome defaults
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminShell.config) and mounts result
│   ├── index.css            # All custom CSS (layout, nav, apps)
│   ├── runtime/             # v1 kernel — registry-driven, replaces MVP src/shell/*
│   │   ├── kernel.js        # Top-level mount: registry + normalizer + engine + region resolution
│   │   ├── kernel-context.js  # KernelProvider exposing { registry, config } to all sources
│   │   ├── registry/
│   │   │   ├── createRegistry.js   # Kind-checked registry (app | engine — region kind retired in V2.M2 task 2), dup-rejection
│   │   │   ├── builtins.js         # Imperative registration of every core:* source
│   │   │   └── source-types.js     # JSDoc typedefs for SourceProps (no runtime)
│   │   ├── engines/
│   │   │   └── core-site-editor-layout/
│   │   │       ├── index.js        # EngineSource definition
│   │   │       └── Layout.js       # Arranges regions: dark chrome + elevated cards
│   │   ├── regions/                # V2.M2 task 2: single declaration-driven renderer
│   │   │   ├── Region.js           # Generic <Region>: dispatches sidebar/toolbar/content/preview/overlay/drawer behaviors off region.source until v1 shells retire (V2.M2 task 7)
│   │   │   ├── regionKind.js       # getRegionKind(region) → persistent | overlay | drawer; replaces RegionSource.regionKind for engine bucketing
│   │   │   ├── resolveRegion.mjs   # V2.M2 task 3: pure-JS template merge (declaration, engine) → resolved region. Imported by kernel + tests/runtime/. Pure ESM (`.mjs`) so node test harness can import without bundling.
│   │   │   └── mountApp.js         # Shared <MountedApp> resolver: appRef → registry → render
│   │   ├── routing/
│   │   │   ├── router.js           # Hash router, RouterProvider, useRoute, navigate, navigateRoute
│   │   │   └── useRoute.js         # Re-export
│   │   ├── selection/              # Cross-region selection event bus
│   │   │   ├── store.js            # core/admin-shell/selection Redux store
│   │   │   ├── useSelection.js     # Subscriber hook
│   │   │   └── persist.js          # apiFetch bridge to selection REST endpoint
│   │   ├── slots/                  # Render slots (Slot/Fill) + data slots (useSlotItems)
│   │   ├── styles/                 # Token compiler + compat bridge + density + WPDS baseline
│   │   ├── capabilities/userCan.js # userCan() sync + checkCan() async via /can REST
│   │   ├── config/iconMap.js       # icon name → @wordpress/icons (dev-warn on miss)
│   │   ├── shell-switching.js      # window.wpAdminShell.switchShell(slug) plumbing
│   │   └── apps/                   # System apps (sidebar / toolbar / overlay / appearance)
│   │       ├── NavigationApp.js      # core:navigation — recursive cap-prune
│   │       ├── SiteHubApp.js         # core:site-hub
│   │       ├── ToolbarActionsApp.js  # core:toolbar-actions
│   │       ├── CommandPickerApp.js   # core:command-picker (signs into @wordpress/commands)
│   │       ├── PreviewPaneApp.js     # core:preview-pane
│   │       ├── NoticesApp.js         # core:notices-banner + core:notices-snackbar
│   │       ├── AppearanceApp.js      # core:appearance — userCustomizable-driven prefs UI
│   │       ├── SiteEditorApp.js      # core:site-editor iframe adapter (v2 native mount)
│   │       └── _components/          # Sidebar* + SiteIcon presentational helpers
│   └── apps/                # User-facing apps (registered via builtins.js)
│       ├── PostsApp.js / SimpleEditorApp.js / EditorApp.js / MediaApp.js / TaxonomyApp.js
│       ├── ProfileApp.js / IframeApp.js
│       ├── UsersApp.js / CommentsApp.js
│       ├── DashboardApp.js / PluginsApp.js / ThemesApp.js / ToolsApp.js / SiteHealthApp.js
│       ├── SettingsApp.js                  # core:settings composable host
│       └── SettingsGeneralApp.js / SettingsWritingApp.js / SettingsReadingApp.js / SettingsDiscussionApp.js
├── tests/
│   ├── php/                 # wp eval-file: cascade (22), selection (5), cap (54)
│   └── parity/              # node: WPDS slot-drift detector (4)
├── scripts/snapshot-wpds.mjs   # Regenerate src/runtime/styles/wpds-defaults/<wpds>.json
├── build/                   # webpack output (gitignored)
└── docs/                    # spec, plan, schemas, readiness, perf-baseline, archive
```

## Application sources

| Source | Component | Native? | Cap floor | Notes |
|---|---|---|---|---|
| `core:posts` | PostsApp | ✅ | — | DataViews table; `config.postType` |
| `core:simple-editor` | SimpleEditorApp | ✅ | — | Substack-style; title + 9 blocks + auto-save |
| `core:editor` | EditorApp | iframe | — | `post.php?post={id}&action=edit`. v2 native mount. |
| `core:media` | MediaApp | ✅ | — | Grid, upload, detail modal |
| `core:taxonomy` | TaxonomyApp | ✅ | — | DataViews + create/edit/delete terms |
| `core:profile` | ProfileApp | ✅ | — | `useEntityRecord('root','user',userId)` |
| `core:users` | UsersApp | ✅ | `list_users` | DataViews + bulk delete with reassign + self-delete guard |
| `core:comments` | CommentsApp | ✅ | `moderate_comments` | DataViews + approve/spam/trash via partial saveEntityRecord |
| `core:settings` | SettingsApp | partial | `manage_options` | Composable host; native general/writing/reading/discussion + iframed permalinks/media/privacy |
| `core:settings-general` | SettingsGeneralApp | ✅ | — | Standalone version of the General panel (legacy entry; kept registered) |
| `core:dashboard` | DashboardApp | ✅ | — | Site overview cards; recent posts/drafts/comments |
| `core:plugins` | PluginsApp | ✅ | `activate_plugins` | DataViews on `'root','plugin'` entity; activate/deactivate via REST |
| `core:themes` | ThemesApp | ✅ | `switch_themes` | DataViews on `'root','theme'` entity |
| `core:tools` | ToolsApp | ✅ | — | Linker cards to import/export/site-health |
| `core:site-health` | SiteHealthApp | ✅ | — | `/wp-site-health/v1/tests/{id}` runner |
| `core:site-editor` | SiteEditorApp | iframe | `edit_theme_options` | `site-editor.php` adapter; v2 native mount |
| `core:appearance` | AppearanceApp | ✅ | — | User-prefs UI driven by `userCustomizable` |
| `core:iframe-fallback` | IframeApp | iframe | — | URL relative to `adminUrl`, chrome hidden via injected CSS |
| System apps | various | — | — | `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar` — pinned by the v0 normalizer |

### `core:simple-editor` notes

- Substack-style minimal editor — title + content only. Featured image, taxonomy, excerpt, scheduling, etc. are deferred to a future post settings panel.
- Allowed blocks (9): `core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`.
- Composes `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList` (inline, not iframed — keeps editor styles in the shell DOM).
- Block registration via `registerCoreBlocks()` is gated by a module-level idempotent guard (`getBlockTypes().length === 0`).
- Settings: `allowedBlockTypes`, `bodyPlaceholder`, `__experimentalBlockPatterns: []`, `__experimentalBlockPatternCategories: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize: '680px'`.
- Auto-save: 2s debounce on `hasEdits`; cancellable timer ref so Publish flushes immediately. Status indicator: `Unsaved changes` / `Saving…` / `Saved` (auto-fades) / `Save failed`.
- Publish button label flips between `Publish` and `Update` based on `record.status`.
- New-post flow seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->` into `content` because WP rejects fully-empty posts (`Content, title, and excerpt are empty`). EditorApp has the same latent bug — fix when touched.
- PHP enqueues `wp-block-editor`, `wp-block-library`, `wp-format-library` styles on the shell page so block chrome and default block styles render.
- Title is a native `<input>` outside the block tree (not a "title block"); Tab/Enter from the title focuses the first contenteditable in the body.

## Navigation

The sidebar supports two navigation modes:

- **Flat items**: `{ "app": "posts" }`, `{ "separator": true }`, `{ "group": "Label", "items": [...] }`, `{ "label": "...", "href": "...", "external": true }`
- **Drill-down screens**: `{ "screen": "id", "label": "...", "icon": "...", "description": "...", "items": [...] }` — renders as a nav item with chevron that slides to a sub-screen with back button

Screens support slide animations (0.14s CSS keyframes) and focus restoration after back navigation.

## Multi-area layout

The content region supports a split layout with primary content + preview cards:

- Set `contentWidth` on an app config to constrain the primary card width
- Set `preview` on an app config to the ID of another app to render in a secondary preview card
- Both panels float as elevated white cards on the dark chrome background

Example: `{ "id": "pages", "source": "core:posts", "config": { "postType": "page", "contentWidth": 480, "preview": "editor" } }`

## Shell switching

The active shell config is stored in `wp_admin_shell_active_shell` option (registered with `show_in_rest`). The MVP wrote `wp_admin_shell_active_config`; the resolver reads the new key first and falls back to the legacy key. Switchable via:
- Settings page (`wp-admin/admin.php?page=wp-admin-shell-settings`)
- Toolbar dropdown (saves via `POST /wp/v2/settings`, then reloads)

## Manual smoke before tagging

Per `docs/v1-readiness.md`. Required before any v1.0.0-beta.x cut:

1. Cap gating across roles (subscriber → admin) — visual confirmation that `wp-admin-default` matches what wp-admin would surface natively.
2. Cold-mount perf measurement → fill `docs/v1-perf-baseline.md`.
3. a11y: keyboard pass, VoiceOver pass on macOS, axe against rendered DOM.
4. Each bundled shell renders + Cmd+K palette + shell switching + form-save (PHP 8.1+).
5. Notices: snackbar on success, dismissible banner on error.
