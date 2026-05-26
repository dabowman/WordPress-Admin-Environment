# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

Pre-release. Nothing has shipped publicly; there is no installed base. admin.json
has a single shape — `workspace` / `settings` / `screens` / `menu` / `commands` —
read natively by the runtime. See `docs/wp-admin-shell-design-spec.md` (runtime
architecture), `docs/schema-sketch.md` (admin.json shape), and the JSON Schemas
at `docs/schemas/{admin,admin-app,admin-engine,tokens}.json`.

**v3 architecture (current shape).** Three artifacts replace v1's single-file shape: `app.json` (per-app intrinsics, ships with app code) + `engine.json` (engine + region templates + modes + slots) + `admin.json` (install decisions only). v3 admin.json shape: `workspace` (engine + default-screen + branding + notices + persistent widgets) + `settings` (registries — `dataViews` 3-axis + `dataFields`) + `screens` (id-keyed map of every screen with `apps[]`, `path`, `slot`, `mode`, `permissions`, `dataViewRef`, `preload`) + `menu` (nested tree with implicit screen binding) + `commands` (id-keyed shortcuts + palette entries) + `styles` (theme.json-shaped) + `preload` + `regions` (escape hatch) + `routes` (escape hatch). The v2 region vocabulary (`role` + `layout` + `platform` + `routing`) carries forward unchanged — one-region-one-app with nested child regions, URL-driven navigation, `routing.route-key` naming the URL slot a region reads, plain `<a href>` navigation, `target` keeping native HTML meaning. Three engines ship: `core:default` + `core:single-pane` + `core:desktop`. DTCG `tokens.json` resolver: PHP `WP_Admin_Shell_Tokens` deep-merges site → theme → plugin → core; pure-ESM `tokensResolver.mjs` flattens + resolves curly-brace aliases + coerces 8 DTCG leaf/composite types. All 7 bundled shells in canonical v3 shape.

**Pipeline (PHP → JS).** `WP_Admin_Shell_Resolver` merges six admin.json origins (core / engine / plugin / site / role / user) with restrict-only enforcement + `customizable` filtering (legacy `userCustomizable` read one cycle). The synthetic `engine` origin sits between `core` and `plugin` and carries the active engine manifest's `default-styles` block; admin.json wins on every overlapping key. The resolver serializes the author-shape doc, stamping each screen's resolved `dataView._resolved` as the last step (`WP_Admin_Shell_Data_View_Config::stamp_screen_data_views`). Cascade is `null`-tombstone-aware at any depth; arrays merge by `id`. The resolved doc feeds `src/runtime/kernel.js`, which derives the runtime surfaces — `engine`, `routes`, `regions`, `default-route`, `commands` — from the `workspace` / `screens` / `menu` / `commands` blocks + the engine's `defaultRegions` (`src/runtime/compile/`), then picks the engine from the registry, renders regions through generic `<Region>` (→ `ModalRegion` | `PersistentRegion` from platform services), mounts apps via `MountedApp`, and wraps the tree in `<ThemeProviderHost engineSource isRoot>` so token overrides cascade through the DOM tree, not via global `:root` pollution. Capability gating is four layers: region fast-path → app gate → source-cap floor → REST observation; nav prunes recursively. v3 permissions are OR-semantic with trust tiers (see `docs/schema-sketch.md` Permissions section). Shell switching is option-write + reload. Default install shell `wp-admin-default` mirrors wp-admin via capability-gated iframe routes plus the classic wp-admin menu bridge.

**Theming model (4 tiers, DS-neutral kernel).** `src/runtime/styles/ThemeProviderHost.js` is the kernel's single seam to whatever ThemeProvider the active engine ships. Engines export an optional `ThemeProvider` field on their `EngineSource`; absent provider = host falls back to a **neutral pass-through wrapper** (`NeutralProvider` inside the host) that renders children + any engine-supplied scoped CSS, but mounts NO design-system provider. Engines opt into shell theming by shipping a working `ThemeProvider`; the kernel never silently injects a WPDS (or any other DS) fallback. The relocated WPDS-backed provider lives at `src/runtime/engines/core-default/WpdsThemeProvider.js` — core-default ships it via `EngineSource.ThemeProvider`, and `core:single-pane` reuses it by importing from the core-default sibling. `WpdsThemeProvider` unlocks the real `@wordpress/theme.ThemeProvider` by piggybacking on `@wordpress/edit-site`'s allowlist entry (the package's `__dangerousOptInToUnstableAPIsOnlyForCoreModules` does string-match-only verification), then `unlock(wpTheme.privateApis).ThemeProvider`. Sites without Gutenberg + WPDS engines render empty (no fallback path — removed at v2.0.0-beta.2; the `Requires Plugins: gutenberg` header advertises the contract for the bundled WPDS engines specifically). The host wraps the inner provider in a render-error boundary; if a third-party engine's provider throws during render, the host swaps to the same neutral pass-through wrapper and logs a console error — the shell still paints, but engine theming won't apply until the engine ships a working provider. **DOM attribute:** the host emits `<div data-theme-scope-id={id}>` around children (sibling sibling `<style data-theme-scope-detail={id}>` carries the engine-compiled scoped CSS). Verified by `tests/runtime/kernel-no-ds-import.test.mjs`. **Engine-pluggable style compiler:** the engine source MAY ship a `compileStyles(styles, tokens) → {top, scoped, subtrees}` hook (`src/runtime/engines/core-default/compileStyles.mjs` for the WPDS-flavored compiler). The host calls it and emits the three buckets as a sibling `<style>` block scoped to the `data-theme-scope-id` wrapper. Engines omitting the hook get zero scoped overrides — provider owns all token plumbing directly. Author customization paths, in order of preference: (1) **seeds** under `styles.theme.{color.{primary,bg}, cursor.control, density}` — engine ThemeProvider's responsibility to interpret; (2) **nested seeds** under `styles.regions[id].theme` and `styles.applications[id].theme` — `<Region>` and `<MountedApp>` wrap content in nested `<ScopedThemeProvider>` reading the engine's provider from kernel context; (3) **direct slot overrides** under `styles.{color,border,dimension,elevation,font}` (top-level + per-region/app) — escape hatch the engine's `compileStyles` translates into provider-scoped CSS variables; (4) **DTCG `tokens.json` primitives** — independent of ThemeProvider, useful as named primitives consumable from any of the above via `{tokens.x.y}` aliases. Chrome extension layer (`--wp-admin-shell--chrome--*`) stays parallel for shell-only concepts WPDS doesn't cover (sidebar width, site-hub icon size, etc.) — bundled-engine-only concern, lives in core-default's compiler. Density extraction lives in `ThemeProviderHost`'s `pickDensity()` (and its pure-helper sibling `themeScope.mjs`) — pulls `styles.theme.density` first, falls back to legacy `styles.density`, and passes whatever string the author authored straight through to the engine's `ThemeProvider`. DS-vocabulary validation (the `default|compact|comfortable` enum) lives in `WpdsThemeProvider`, NOT the kernel — a Material/Tailwind engine receives the raw string and interprets per its own rules. **Slot/Fill substrate:** `<SlotFillProvider>` (from `@wordpress/components`) lives in each engine's `Layout.js`, NOT in the kernel — bundled engines (`core:default`, `core:single-pane`, `core:desktop`) all ship the wrap so `@wordpress/components` Slot/Fill consumers (notices snackbar, modals, simple-editor's `core:editor.sidebar`) work uniformly. A non-WPDS engine that doesn't use `@wordpress/components` Slot/Fill omits the wrap; the kernel imposes nothing.

**How tokens reach DOM.** Two paths (both engine-side now, not kernel): (a) **engine template `default-style`** — `core:default` engine emits values like `var(--wp-admin-shell--chrome--sidebar--background, var(--wpds-color-bg-surface-neutral))` as **inline style** on each region's `<div>`. `resolveRegion.mjs` merges template `default-style` into `region.style`, and `Region.js`'s `toReactStyle` helper kebab→camelCases the keys and applies them as React `style={...}`. The two-arg `var()` chain means: chrome var wins when authored; falls back to WPDS slot when chrome layer is empty. (b) **engine `index.css` class rules** — `core:default/index.css` ships the chrome-anchor/svg/Stack-defensive overrides + the engine root paint (`.wp-admin-shell-layout` background+color via `--wp-admin-shell--chrome--canvas--{background,foreground}` slots, same fallback chain). Single-pane engine paints its root through the same canvas slot for parity. Non-WPDS engines ship none of these. Kernel `src/index.css` is ~10 lines: body positioning + a11y forbidden fallback structure only. The `chrome.canvas.*` slot is the author entry point for shell-wide background/foreground; `chrome.{sidebar,toolbar,site-hub,content}.*` cover per-surface chrome. **Inside WPDS-flavored app/engine code, don't hardcode hex colors** — use `var(--wpds-*)` directly so ThemeProvider seeds flow through. App-level CSS audited 2026-05-06; no remaining hardcoded hex colors in `src/apps/**/*.js` inline styles.

**Test surface.** Node suites (`npm run test:schema` / `test:parity` / `test:runtime` / `test:engines`) run without a container; the PHP fixture suites (`tests/php/run-*.php`) run via `wp eval-file` in the wp-env CLI container. See the Testing section below for the full command list. Known coverage gap: no JSDOM mount test for the React kernel (`<Region>` / `<ThemeProviderHost>`) — runtime synthesis is covered by `tests/runtime/build-runtime-config.test.mjs`, but full component render is a manual browser pass.

**Hard runtime dep:** Gutenberg plugin (declared via `Requires Plugins: gutenberg`). `@wordpress/ui` overlay components use private APIs whose allowlist only Gutenberg supplies. Without it, shell renders empty.

## Before modifying code

1. Load skills (`/dvdbwmn-wordpress:wordpress` WordPress index skill): `/wordpress-rest-api`, `/wordpress-dataviews`, `/gutenberg-contributor`.
2. Read `docs/wp-admin-shell-design-spec.md` — **master spec** (2026-05-01, URL-routing refined 2026-05-04). Authoritative for runtime architecture (region vocabulary, URL routing, capability gating, extension points). When prose and schema disagree, schema wins.
3. Read `docs/schema-sketch.md` — **v3 design doc.** Canonical reference for the v3 admin.json shape (`workspace` / `settings` / `screens` / `menu` / `commands`), permissions OR-semantic with trust tiers, modes catalog with `extends`, 3-tier slot vocabulary, programmatic workspace registration. The master spec covers runtime contracts that survive v2 → v3 unchanged; this doc covers the v3 schema reshape on top of them.
4. Read the schemas: `docs/schemas/admin.json`, `admin-app.json`, `admin-engine.json`, `tokens.json` (JSON Schema 2020-12, fully inline-documented).
7. Read `docs/dataview-config.md` — author-facing guide for the dataView primitive (3-axis registry: `kind/name/variant`, `extends` chain, filter hooks, REST endpoints, React hook overloads, field collections).
8. Read `docs/core-default-engine.md` — engine contract worked example for `core:default`: modes catalog, slots, region templates, default-styles.
10. Read `docs/archive/post-editor-sketch.md` (historical) — worked example decomposing the post editor into the region vocabulary; surfaces `dirty-state` + `block-navigation-on-dirty` platform services.
11. Read `docs/research/schema-exercise-findings.md` — what schema can't validate, runtime must.
12. Read `docs/admin-json-api-validation.md` — REST API coverage per app source.
13. Consult `docs/screens/` — 42 tier-2 functional specs covering every wp-admin screen. Source of truth when (re)building any `core:*` app. Gaps section = REST rebuild tickets.
14. Read `docs/research/app-validation-2026-05-04.md` — WPDS / REST / core-data audit of every `src/apps/*`. Captures destructive-button fallback, DataViews `/wp` import path, WPDS 0.12 gaps (no `tone="critical"`, no `variant="ghost"`, no `Text weight/size/color`, no SnackbarList port).
15. Skim `docs/feedback.md` — Inbox/Triaged/In-progress/Done triage log.
16. Read `docs/engines-and-design-systems.md` — kernel-vs-engine-vs-app DS boundary + three contracts (reuse-WPDS, token-bridge, engine-native apps). Authoritative for any work on a non-WPDS engine.
17. Read `docs/desktop-engine-readiness.md` if working on `core:desktop` — manual smoke checklist + known issues + automated test gates.
18. Read the public reference docs in `docs/public/` when authoring or reviewing admin.json / app.json / engine.json files — `admin-json-reference.md`, `app-json-reference.md`, `engine-json-reference.md`. Point at the schemas.
19. For any bundled app, read `src/apps/<id>/app.json#documentation` + `src/apps/<id>/app.md` — per-app contract introduced 2026-05-13. `documentation` block (schema: `admin-app.json#appDocumentation`) is machine-readable: purpose, `rebuilds` (matching `docs/screens/*.md` slug or omitted for shell-only apps), `data.reads/writes` (with `via`: `core-data`/`api-fetch`/`window-global`/`external`/`commands`/`kernel-config`), `url.{reads-slots,writes-slots,navigates}`, `states[]`, `interactions[]`, `a11y`, `constraints[]`, `design-system-leakage[]`. Sibling `app.md` carries the prose — overview, architecture, rebuild guide for a non-WPDS / non-React port, known limitations (must include parity gaps versus the matched `docs/screens/*.md`). Update both whenever touching an app's behavior.
20. Historical / archived (skim only when investigating legacy behavior): v2 plan at `docs/archive/plans/wp-admin-shell-v2-migration-directive.md`; archived spec at `docs/archive/wp-admin-shell-design-spec-2026-04-29.md`; v1 plan at `docs/archive/wp-admin-shell-v1-plan.md`; v0 flat schema notes at `docs/admin-json-schema.md`.

## Key rules

- **Kernel is DS-neutral.** No `--wpds-*` token, no `@wordpress/components` import, no `@wordpress/ui` import, no `@wordpress/icons` import, no `@wordpress/dataviews` import, no chrome class name (`.wp-admin-shell-nav`, `.wp-admin-shell-toolbar`, etc.) appears in kernel code (`src/runtime/*` outside `src/runtime/engines/`). The kernel owns: cascade resolver, routing, capability gating, region rendering primitive, ThemeProviderHost seam (mounts the active engine's `ThemeProvider` if shipped, else falls back to a neutral pass-through wrapper — never a DS-specific default), bindings, dirty-state, icon **registry** (engines populate), **dynamic-children store** (regions opting into `platform[ 'core:dynamic-children' ]` host runtime-mutated child regions via `useDynamicChildren(parentRegionId)`; kernel renders them through the same `<Region>` recursion as static `region.regions[]`, so per-window routing/dirty-state/triggerStore/cap-gating/theming-scope all key per child region ID — see spec §5.5). Slot/Fill substrate lives in each engine's `Layout.js`, NOT in the kernel — bundled engines wrap their layout in `<SlotFillProvider>` from `@wordpress/components`. Anything DS-specific lives inside an engine. **Test before adding kernel code: would a hypothetical Material Design engine plugin loading alongside this plugin still work?** If your change tightens the kernel to WPDS, it goes in `src/runtime/engines/core-default/` instead. Verified via `tests/runtime/kernel-no-ds-import.test.mjs` — adds a forbidden import to a kernel file and the test catches it in CI. See spec §3 + §4.2 + §13.1.
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

- **Icon names go through the kernel icon registry.** `src/runtime/config/iconMap.js` is a DS-neutral registry exposing `registerIcons(table, {fallback})` and `resolveIcon(name)`. The active engine populates it at module load — `core:default` ships the @wordpress/icons table in `src/runtime/engines/core-default/icons.js` and calls `registerIcons(iconTable, {fallback: fallbackIcon})` from its `index.js`. App-side imports unchanged: `import { resolveIcon } from '../../runtime/config/iconMap'`. `resolveIcon` falls back to the engine-registered fallback and dev-warns once per unknown name. Adding a new icon: edit the engine's `icons.js` (or whichever engine you're authoring), not the kernel registry.

- **DataViews import path.** Use `import { DataViews } from '@wordpress/dataviews/wp';` — NOT bare `'@wordpress/dataviews'`. The bare path risks `Minified React error #130` in plugin contexts. Affected: PostsApp, TaxonomyApp, UsersApp, CommentsApp, PluginsApp.

- **Site title source-of-truth.** Read site title via `useEntityRecord('root','site').record.title` (with `decodeEntities` from `@wordpress/html-entities`). Fall back to `window.wpAdminShell?.siteName` only as last resort.

- **Self-delete guard on bulk user delete.** Filter out the acting user (`window.wpAdminShell?.userId`) before sending REST. Reassign-to-self fails server-side and the bulk request errors silently mid-flight.

- **`@wordpress/components` Item renders `<button>` when `onClick` is defined.** `build-module/item-group/item/hook.mjs` does `as = onClick !== undefined ? 'button' : 'div'` — the `href` prop is silently dropped. `SidebarNavigationItem` forces `as="a"` when href is set so anchor-style navigation (browser-native click, middle-click new tab, right-click "Copy link") works. Same trap exists for any `Item`-based nav: pass `as="a"` explicitly when href is the primary action.

- **`@wordpress/ui` layered CSS gotcha.** Component CSS is injected at module-load via `document.head.appendChild`, wrapped in `@layer wp-ui-utilities, wp-ui-components, wp-ui-compositions, wp-ui-overrides`. Per the cascade-layer spec, **unlayered rules win against any layered rule regardless of specificity** — and WP-admin loads many unlayered stylesheets (common.css, forms.css, dashboard.css, theme resets) that can stomp `@wordpress/ui` defaults.
  - **Theme `@wordpress/ui` by overriding the WPDS tokens it consumes, NOT by overriding rendered colors per component.** The shell does this via the chrome → WPDS bridge in `src/runtime/engines/core-default/compileStyles.mjs` (`CHROME_WPDS_BINDINGS`): each chrome surface (sidebar / toolbar / site-hub) maps `chrome.<surface>.<slot>` → a `--wpds-*` interactive token, scoped under the surface's container class (`.wp-admin-shell-nav, .wp-admin-shell-site-hub` etc.). `@wordpress/ui` Buttons / IconButtons / Stacks inside the scope inherit the chrome palette automatically. **Do not** add `.wp-admin-shell-*-button { color: ... }` rules — extend the bindings table instead. This compiler is engine-private; a non-WPDS engine ships its own.
  - When a layered rule like `Stack`'s `display: flex` gets stomped, the component falls back to `display: block` and children flow vertically regardless of the inline `flex-direction: row` style. `core:default/index.css` ships a defensive unlayered rule: `.wp-admin-shell [class*="__stack"] { display: flex }`. Do not remove it without first verifying the cascade layer applies in every shell DOM context (especially inside `<button>` content models). The rule moved out of kernel `src/index.css` because it's `@wordpress/ui`-specific.
  - Pass explicit `align="center"` to `<Stack direction="row">` calls that contain icon + text. The browser default `align-items: stretch` can render SVGs at unexpected heights inside flex containers.
  - **`href` on `@wordpress/ui` Button / IconButton requires `render={<a href={...}/>}`.** Both wrap `@base-ui/react` Button which always renders a native `<button>` and silently drops `href` — clicks don't navigate. Use the `render` prop to swap the underlying element. Add `target` / `rel` to the `<a>` directly.
  - **Anchor-rendered chrome buttons need an unlayered color override.** WP-admin's `colors/<scheme>/colors.css` ships an unlayered `a { color: var(--wp-admin-theme-color) }` rule. `@wordpress/ui` Button's color is layered (`@layer wp-ui-components`) and loses. `core:default/index.css` ships scoped anchor color rules (`.wp-admin-shell-region--{sidebar,toolbar} a, .wp-admin-shell-site-hub a { color: var(--wpds-color-fg-interactive-neutral) }`) for the same scopes the chrome → WPDS bridge populates. Symmetric `:hover/:focus/:active → -active` rules cover state transitions. These moved out of kernel `src/index.css` to keep kernel DS-neutral.
  - **`@wordpress/icons` SVGs need `fill: currentColor` forced.** `@wordpress/icons` Icon clones the SVG and sets `width`/`height` but does NOT add `fill="currentColor"` (`@wordpress/ui`'s Icon does). Library SVGs (e.g. `wordpress`) have no `fill` attribute → browser default black. `core:default/index.css` ships `.wp-admin-shell-region--{sidebar,toolbar} svg, .wp-admin-shell-site-hub svg { fill: currentColor }` to unify behavior.
  - **Ellipsis-in-flex pattern for `@wordpress/ui` Button text content.** `@wordpress/ui` Button is `inline-flex` by default. To make the text truncate inside a constrained flex parent (e.g. the site-hub title): the Button's wrapper div needs `display: flex; min-width: 0;` AND the Button needs `flex-grow: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The wrapper's `min-width: 0` overrides the default flex-item `min-width: auto`; the wrapper's `display: flex` is what makes the Button's `flex-grow: 1` actually stretch.
  - Custom CSS that targets `@wordpress/ui`-rendered DOM should NOT use the legacy `.components-button` / `.components-item` chains (those are `@wordpress/components` classes that don't appear on `@wordpress/ui` output). Use the `wp-admin-shell-*` class alone, or the `button` element selector inside a chrome wrapper. When the rendering can be either `<button>` or `<a>` (e.g. via `render` prop), use `:is(button, a)`.

- **DataViews uses `@wordpress/dataviews/wp` plus a CSS copy.** Webpack copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`; PHP enqueues `dataviews.css` separately. The `/wp` subpath is the runtime-private export that registers DataViews against `wp.privateApis` correctly.

- **Apps don't add their own ARIA landmark element.** Region wrappers already render `<div role={region.role}>` (e.g. `core:sidebar` declares `role: "navigation"` in `engine.json`). An app component nesting its own `<nav>`, `<main>`, `<aside>`, etc. inside doubles the landmark in the a11y tree. NavigationApp dropped its outer `<nav class="wp-admin-shell-nav__landmark">` for this reason.

- **`[aria-current="true"]` is the sole authority for the active state.** Don't also emit a `.is-active` className when an item is the current route. CSS targets `[aria-current="true"]`; the redundant class causes drift when the two get out of sync. SidebarNavigationItem only sets the attribute now.

- **Sidebar drill-down state belongs in the URL.** Sub-screens (the `{ screen, items }` shape in nav config) are URL-addressable via the `?screen=<id>` query slot, NOT `useState`. NavigationApp reads `useRoute().params.screen` and writes via a small `navigateScreen(id|null)` helper that preserves the current primary path. Deep-links and refresh-survives. Multiple sidebars in one shell would collide on the slot — namespace later (`?nav-{regionId}-screen=…`) if needed. Corollary of the URL-as-state principle (spec §6 / §18).

- **Sidebar internals mirror `@wordpress/edit-site/src/components/sidebar*` class naming, swapping the top-level prefix `edit-site` → `wp-admin-shell`.** That maps `edit-site-sidebar-navigation-{screen,item}` → `wp-admin-shell-sidebar-navigation-{screen,item}`, drilldown indicator class is `__drilldown-indicator` (not `__chevron`), description is a `<div>` not `<p>`. When porting more elements from edit-site, keep the names (and BEM modifiers like `.has-footer` on `__main`) one-for-one — that lets the Gutenberg sidebar source serve as the structural reference.

- **Cascade trust-tier rule for security-sensitive blocks.** Six origins merge in order: `core` → `engine` → `plugin` → `site` → `role` → `user`. Trust tier splits them at the site/role boundary: `core`/`engine`/`plugin`/`site` may add+remove permissions, drop entries via null tombstones, declare any block shape; `role`/`user` are CONSUMER origins and shrink-only — they can REMOVE caps/roles from `screens[].permissions` but never grow the OR-set. The merge engine has three flavors: `merge()` (additive, tombstones no-op + WP_DEBUG notice; used for role/user), `merge_with_tombstones()` (additive but tombstones honored; used for site), `merge_authoritative()` (full structural replace; used for core/engine/plugin). When adding a new top-level admin.json block, ask: is it security-sensitive (gates an action, declares an app, controls capability)? If yes — add the path to `WP_Admin_Shell_Customizable::DENY_PATTERNS` so consumer origins can't write it even with a matching allowlist entry. The four current entries (`screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, `workspace.engine`) are the security gates that survive even author-declared `customizable` allowlists. Trust-tier enforcement on `screens[].permissions` runs in `WP_Admin_Shell_Permissions::enforce_origin_tier()` against the merged baseline before each consumer-origin merge — same place to add new permissions-bearing fields.

- **Entity-CRUD apps wrap dataView labels in in-app `LABELS = { id: __('...') }` tables.** DataView docs ship as locale-agnostic JSON primitives (spec §13 #7); the cascade reaches DataViews with raw English labels regardless of the user's locale. Each entity-CRUD app keeps two small tables — `FIELD_LABELS` and `ACTION_LABELS` — in its `index.js`, keyed by id. `buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`: the table wins for ids the app authored (translation tools see the `__()` literal at module load), the spec wins for ids the app doesn't know (plugin extension columns and actions keep whatever string the cascade supplied). Reference: `src/apps/posts/index.js` `FIELD_LABELS` / `ACTION_LABELS` + `buildFields` / `buildActions` (PostsApp is the documented prototype). Pair with a `useEffect` that resyncs DataViews `view` state on `[postType, variant]` flip when the same hook instance hosts multiple triples — `useState` initializer runs once, so a triple flip otherwise inherits the prior triple's `perPage` / `sort` / `filters`. v3 entity-CRUD apps read the resolved doc via `useDataView(screenId)` (or `useDataView({ kind, name, variant })` for the registry-direct entry point that restores v2 `useViewConfig` semantics).

- **`wp_admin_shell_data` core callback priorities are documented.** The shell ships two callbacks on the post-cascade filter: `WP_Admin_Shell_Menu_Items::bind_screens` at priority **5** (resolves menu items → screens) and `WP_Admin_Shell_Data_View_Config::inject_app_baselines` at priority **6** (folds app `dataView` baselines into resolved screens). Order matters — baselines attach to screens that already exist, so screens-first. Plugin authors contributing screens, menu items, or dataView entries via filters should prefer the per-origin `wp_admin_shell_data_{origin}` hooks at priority 5 — those fire before the merge + before either of the above callbacks. See `docs/schema-sketch.md` for the filter-ordering contract.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
npm run lint:js  # eslint via wp-scripts (clean baseline as of 2026-05-07)
npm run lint:ts  # tsc --noEmit; type-checks the core:desktop engine sources
```

TypeScript is scoped to `src/runtime/engines/core-desktop/**` + `tests/engines/core-desktop/**` per D6 of the desktop engine port plan. `tsconfig.json`'s `include` is intentionally narrow — the rest of the repo stays JS/JSDoc. Emission is handled by `@wordpress/babel-preset-default` (which already pulls in `@babel/preset-typescript`) inside `wp-scripts build`; `tsc --noEmit` runs as the type-check safety net. Test scripts under `tests/engines/core-desktop/*.ts` execute via Node's native type-stripping (`node --experimental-strip-types`), no compile step required.

## Lint conventions

`.eslintrc.js` extends `@wordpress/eslint-plugin/recommended` (canonical WP Core JS config — same one Gutenberg uses). Three documented overrides; do not loosen further without justification:

- **`@wordpress/no-unsafe-wp-apis`** — kept enabled at config level. Files importing `__experimental*` from `@wordpress/components` (per-component fallback for WPDS 0.12 gaps) carry a file-scoped pragma at the top:

  ```js
  /* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalDivider has no @wordpress/ui 0.12 port. */
  ```

  Per-file is deliberate — keeps each fallback's reason inline + audit-able. Don't move this to project rules.

- **`jsx-a11y/heading-has-content`** + **`jsx-a11y/anchor-has-content`** — disabled project-wide. Known false-positive on `@wordpress/ui`'s polymorphic `render` prop pattern (`<Text variant="heading-md" render={ <h2 /> }>{ children }</Text>`). The rule inspects the JSX literal `<h2 />` in isolation and can't see that the rendered output inherits `children`. Browser-rendered HTML always has content; the rule disable is a known-false-positive waiver, not a blanket a11y waiver.

- **`import/no-extraneous-dependencies`** — disabled for `webpack.config.js` / `tests/**` / `scripts/**` only (these import from `@wordpress/scripts`'s nested deps, which is fine).

Coding-standard adherence — tabs (matches WP JS coding standards), single quotes, brace style, JSDoc with types — all enforced by `@wordpress/eslint-plugin` defaults. The `--fix` pass also tabifies JSON files (shells, schemas, fixtures); that's WP-Core-canonical and intentional. Don't fight it.

JSDoc convention for React function components with destructured props: `@param {Object} root0` + `@param {*} root0.<key>` for each destructured prop. Auto-generated by eslint --fix when JSDoc precedes the function.

## Testing

~2055 assertions — all run before merge.

```bash
# Node
npm run test:schema      # Ajv: admin + admin-app + admin-engine + tokens sweeps (shells / manifests / fixtures)
npm run test:parity      #   4 — WPDS slot-list drift detector
npm run test:runtime     # 917 — runtime modules chained: resolveRegion + validateRegion + platformServices + matchRoute (+ mirror-mode slot synthesis) + dirtyState + tokensResolver + compileStylesTokens + bindings + bindings-consumer-rebind + spec-worked-example + registry ThemeProvider + registry lazy-app + engine defaults + icon-registry + dynamicChildren store + chromeless-bridge envelope contract + shouldRenderRegion + resolver-gate pipeline + data-view mergeFields + data-view hydrateInline (3-axis triple + extends chain + fieldsRef merge) + data-view-deprecation-shims + data-view-lru + composeWidgets + compose-screen-widgets + command-palette compile + mode-resolution + theme-provider-host + kernel-no-ds-import (filesystem-walked kernel allowlist + 4-import-shape pattern coverage + pattern self-tests)
npm run test:engines     #  77 — TS WindowManager + snap + compileStyles + dockRailRegistry (core:desktop engine)

# PHP — wp-env CLI container
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php            #  40 — adds a `user-switchable` kebab-form assertion via the desktop-demo.v3 fixture
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php           #  67
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php                #  54
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php              # 133
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-tokens-tests.php             #  13
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-engine-defaults-tests.php    #  22
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php         #  39 — v3 screen + menu capability gating, OR-semantic cap/role eval, monotonic role-walk, per-role user fixturing
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-chromeless-bridge-tests.php  #  13
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-tests.php          # 106
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-rest-tests.php     #  10 — `/data-view` screen-scoped permission floor (subscriber 403 on admin-only screens, 404 on unknown screen, 401 logged-out, triple-keyed lookups keep logged-in floor)
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-mode-resolution-tests.php    #  20
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-classic-menu-bridge-tests.php #  66
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-preload-tests.php            #  22
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-menu-route-shims-tests.php   #  70
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-security-cascade-tests.php   #  57 — trust-tier enforcement on screens[].permissions + null-tombstone gating (incl. ignored-consumer-tombstone no-pollution) + customizable per-field walker w/ hardcoded deny-list + filter_v3_block list-shape preservation (commands[]/preload[]/routes[]/screens[].apps[]) + is_safe_href protocol-relative reject incl. whitespace-leading (incl. form-feed) and backslash variants
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-dashboard-widgets-tests.php  #  56
```

**Pure-JS runtime modules go in `.mjs` files** so node test scripts (`tests/runtime/*`) can `import()` them directly without a webpack/jest harness. Webpack's default `resolve.extensions` (from `@wordpress/scripts`) does NOT include `.mjs`, so importing a `.mjs` module from app code requires the explicit extension at the import site (e.g. `import { resolveRegion } from './regions/resolveRegion.mjs'`). Convention applies only to side-effect-free utility modules; React components stay `.js`.

`run-shape-tests.php` walks every bundled shell through the resolver and asserts structural invariants (engine + regions + applications + defaultRoute resolves). Catches v1-canonical-path-drift bugs (always read `config.settings?.X || config.X` for any v0/v1 shell field — bare `config.X` only works in v2). Runtime React-component smoke (JSDOM) tracked in issue #30.

Test layering matches `WP_Theme_JSON_*Test`'s pattern: schema validation, fixture-driven unit, end-to-end shape, plus pending JSDOM mount. Add a fixture before fixing the next runtime-reader bug — never in the fix commit.

## Webpack externals

`webpack.config.js` extends `@wordpress/scripts` defaults with one `copy-webpack-plugin` step copying `node_modules/@wordpress/dataviews/build-style/style.css` → `build/dataviews.css`. The dep-extraction plugin handles the rest — `@wordpress/dataviews` and `@wordpress/ui` are in upstream `BUNDLED_PACKAGES` and bundle themselves; everything else externalizes to `wp.*`.

**Past failed workaround — don't repeat:** bundling `@wordpress/private-apis` to control the allowlist creates a *separate registry* from runtime `wp.privateApis`. `@wordpress/dataviews` (also bundled) then fails to `unlock()` objects locked by `wp.components` → `"Cannot unlock an object that was not locked before"`. Gutenberg plugin overriding `wp-private-apis` is the only working answer.

**Code-split chunks.** `src/runtime/registry/builtins.js` registers every non-system app with `load: () => import(/* webpackChunkName: "app-<id>" */ '../../apps/<id>')`. Webpack emits one `build/app-<id>.js` per app + auto-extracts shared deps into vendor chunks (`build/<numeric-id>.js`). Chunk-loading uses `publicPath: 'auto'` (webpack 5 default) — the runtime infers the chunk base URL from `document.currentScript.src` of the boot `index.js`, so no PHP-side `__webpack_public_path__` injection is needed as long as the boot script enqueue path stays under `build/`. CSS for lazy apps emits as sibling `build/app-<id>.css` files and is auto-injected by MiniCssExtractPlugin's runtime when the JS chunk loads — no PHP enqueue needed per-app. Pre/post numbers in `docs/perf-baseline.md` Bundle-size table.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── shells/                  # Bundled admin.json configurations (all in v3 shape — workspace/screens/menu)
│   ├── wp-admin-default.json     # DEFAULT install shell — wp-admin mirror w/ capability-gated screens + iframe-fallback screens
│   ├── developer-admin.json      # Demo: native apps (users / comments / settings / site-editor) + drill-down menu containers
│   ├── content-author.json       # Demo: minimal writer shell (collapsed nav)
│   ├── client-portal.json        # Demo: branded shell (logo, red accent, scoped nav)
│   ├── canonical-demo.json       # Demo: canonical admin.json shape on core:default
│   ├── single-pane-demo.json     # Demo: core:single-pane engine
│   └── desktop-demo.json         # Demo: core:desktop engine
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP
│   ├── class-wp-admin-shell-config.php           # Read-only wrapper around merged tree
│   ├── class-wp-admin-shell-can-rest.php         # /wp-admin-shell/v1/can/{cap}
│   ├── class-wp-admin-shell-prefs-rest.php       # /wp-admin-shell/v1/user-prefs
│   ├── class-wp-admin-shell-data-view-rest.php   # /wp-admin-shell/v1/data-view + /data-view/variants + deprecation alias /screen-view (v3)
│   ├── class-wp-admin-shell-data-field-collections-rest.php # /wp-admin-shell/v1/field-collections (reads settings.dataFields)
│   ├── class-wp-admin-shell-cli.php              # `wp admin-shell …` commands
│   ├── cascade/                                  # Cascade resolver
│   │   ├── class-wp-admin-shell-resolver.php     # Multi-origin merge + load_origins; null-tombstone aware
│   │   ├── class-wp-admin-shell-merge.php        # merge_authoritative + plain merge w/ tombstones
│   │   ├── class-wp-admin-shell-customizable.php # `customizable` filter (default-deny); reads legacy `userCustomizable` for one cycle
│   │   ├── class-wp-admin-shell-cache.php        # WP_Object_Cache + transient w/ hash keying
│   │   ├── class-wp-admin-shell-config-validator.php  # configSchema cache
│   │   ├── class-wp-admin-shell-classic-menu-bridge.php # Classic wp-admin menu bridge: walks $GLOBALS['menu']/['submenu'] at wp_admin_shell_data_plugin priority 6 → synthesizes screens[ingested-<slug>] + menu.ingested.items[]. Filter `wp_admin_shell_classic_menu_core_slugs` extends skip list.
│   │   ├── class-wp-admin-shell-modes.php        # v3 engine modes catalog resolver + `extends` chain (depth 10, cycle-safe) + plugin-contributed modes via `wp_admin_shell_engine_modes_{engineId}` filter
│   │   ├── class-wp-admin-shell-permissions.php  # v3 permissions resolver: OR-semantic capabilities + roles, super-admin magic, trust-tier cascade (core/engine/plugin/site may add/remove; role/user may only remove)
│   │   ├── class-wp-admin-shell-data-field-collections.php # v3 data-field-collections registry + cascade contribution (renamed from field-collections; legacy `wp_admin_shell_register_field_collection()` survives as a deprecation wrapper one cycle)
│   │   ├── class-wp-admin-shell-data-view-config.php  # v3 3-axis data-view-config resolver: `(kind, name, variant|_default)` lookup + extends chain + ref-wins-inline merge + per-base + per-variant filter machinery (renamed from view-config; legacy `wp_admin_shell_view_config_*` filter still fires alongside with `_deprecated_hook` notice for one cycle; v2 `viewConfigs` block → `_doing_it_wrong` warning via `warn_legacy_view_configs()` at priority 999)
│   │   ├── class-wp-admin-shell-preload.php      # REST preload: collect across origins + dedupe + hydrate via rest_preload_api_request + emit on wp-api-fetch
│   │   ├── class-wp-admin-shell-menu-items.php   # menu-item registration: nav-region resolver + cascade contribution
│   │   └── class-wp-admin-shell-admin-routes.php # admin-route registration: cascade contribution
│   └── origins/
│       └── class-wp-admin-shell-origin-core.php  # v0 → v1 normalize + empty baseline + chrome defaults
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminShell.config) and mounts result
│   ├── index.css            # Bootstrap CSS only — body positioning, defensive Stack rule, chrome anchor/svg color overrides, cap-gate fallback. Engine + per-app CSS lives with the engine/app it belongs to (see below).
│   ├── runtime/             # v1 kernel — registry-driven, replaces MVP src/shell/*
│   │   ├── kernel.js        # Top-level mount: registry + normalizer + engine + region resolution
│   │   ├── kernel-context.js  # KernelProvider exposing { registry, config } to all sources
│   │   ├── registry/
│   │   │   ├── createRegistry.js   # Kind-checked registry (app | engine — region kind retired), dup-rejection. Accepts eager `{ Component }` and lazy `{ load: () => Promise }` app shapes; `resolveComponent(id)` returns a per-id cached Promise that the mount path feeds into `React.lazy()` (React.lazy memoizes resolved component on the Promise — no separate sync cache needed); `invalidateComponent(id)` clears the cache so the retry path can re-fire a failed `load()`. Descriptor is never mutated after register — `Component XOR load` invariant holds for life. Engines are eager-only.
│   │   │   ├── builtins.js         # Imperative registration of every core:* source. Lazy by default (`{ load: () => import(/* webpackChunkName: "app-<id>" */ '../../apps/<id>') }`); the five always-mounted chrome apps (navigation, site-hub, toolbar-actions, notices-banner, notices-snackbar) stay eager.
│   │   │   └── source-types.js     # JSDoc typedefs for SourceProps (no runtime)
│   │   ├── engines/                # Per-engine modules. Each ships index.js (EngineSource def + side-effect imports its index.css), Layout.js (React layout component), engine.json (manifest w/ region templates + default-style CSS), index.css (engine-specific layout idiom CSS).
│   │   │   ├── core-default/        # Flagship: dark chrome + elevated cards (toolbar/sidebar/content/preview)
│   │   │   ├── core-single-pane/    # Mobile-first: appbar + collapsible nav drawer
│   │   │   └── core-desktop/        # Windowed engine. Adds windowing/ subdir (TS): WindowManager state class + WindowManagerContext + hooks. icons.js + Layout.js + index.css mirror sibling engines' shape; Layout wraps tree in WindowManagerProvider.
│   │   ├── regions/                # Single declaration-driven renderer
│   │   │   ├── Region.js           # Generic <Region>: GenericRegion → ModalRegion (backdrop + focus trap + ARIA modal + dismiss + autofocus) or PersistentRegion (landmark) composed from platform services. Recursive cap fast-path. Renders `region.regions` children with id `parent/child` (spec §5.5).
│   │   │   ├── regionKind.js       # Derives bucket (persistent | overlay | drawer) from platformServices.placement(region).
│   │   │   ├── platformServices.mjs # Pure-ESM spec §5.3 accessors (isModal, dismissTriggers, autofocusSelector, persistsAcrossNavigation, isTriggerable, triggerShortcut, wantsDirtyState, blocksNavigationOnDirty, placement) — reads region.platform/role.
│   │   │   ├── resolveRegion.mjs   # Pure-ESM template merge (declaration, engine) → resolved region. Recursive child resolution with MAX_REGION_DEPTH=10 + visited-templates set.
│   │   │   ├── validateRegion.mjs  # validateRegion + sanitizeRegion enforce `app` xor `routing.route-key` (spec §5.4). Kernel logs violation + drops `app` so URL routing wins.
│   │   │   └── mountApp.js         # Shared <MountedApp> resolver: appRef → registry → render. Branches on `sourceDef.Component`: eager apps render directly (no Suspense, no boundary — render errors propagate honestly); lazy apps wrap in `<AppErrorBoundary>` + `<Suspense fallback={<AppLoading/>}>` with the resolved component arriving via `React.lazy()` memoized in a per-id `lazyAppCache`. The boundary's `isChunkLoadError()` filter only catches load failures (`ChunkLoadError`, `Loading chunk …`, `createRegistry: load() …`) — render-time crashes inside resolved apps re-throw so they surface upstream with their real stack. Retry button calls `registry.invalidateComponent(id)` + clears the lazy cache so the next render genuinely re-fires `load()`.
│   │   ├── routing/                # URL-decomposer router, routes-block matcher
│   │   │   ├── router.js           # RouterProvider (hashchange + Navigation API navigatesuccess), useRoute, useRouteForRegion(region, routesBlock), navigate(href).
│   │   │   ├── matchRoute.mjs      # Pure ESM: matchPattern, matchRoute (most-specific-wins), interpolate, parseHash, readSlot, isValidRoutePattern.
│   │   │   └── useRoute.js         # Re-export
│   │   ├── styles/                 # ThemeProviderHost (engine-pluggable seam) + themeScope.mjs (pure helpers — `pickDensity`, `hasThemeContent`, `scopedSelector`, `buildScopedDetailCss`, `THEME_SCOPE_ATTRIBUTE`/`THEME_SCOPE_DETAIL_ATTRIBUTE` constants). Host falls back to a neutral pass-through wrapper when an engine declines a `ThemeProvider`; WpdsThemeProvider relocated to `engines/core-default/WpdsThemeProvider.js` (PR-#49 Stage 4); single-pane reuses it via sibling import. compileStyles + wpds-defaults snapshot moved to core-default in P1.
│   │   ├── capabilities/userCan.js # userCan() sync + checkCan() async via /can REST
│   │   ├── config/iconMap.js       # DS-neutral icon registry: registerIcons(table, {fallback}) + resolveIcon(name). Engines populate at module load.
│   │   ├── dataView/               # v3 data-view-config + data-field-collections client (spec §13 #7-8, restoration)
│   │   │   ├── useDataView.js      # React hook overloaded: useDataView(screenId) OR useDataView({kind, name, variant}, {fallback}) → {config, isLoading}. Inline-snapshot fast path + /wp-admin-shell/v1/data-view REST fallback. Re-exports deprecated `useScreenView` + `useViewConfig` aliases for one release cycle.
│   │   │   ├── hydrateInline.mjs   # Pure 3-axis triple hydrate: extends chain (cycle + depth-cap, max depth 10) + fieldsRef merge + inline screen overlay deep-merge. Mirror of WP_Admin_Shell_Data_View_Config::resolve_data_view_triple / resolve_screen_data_view. Re-exports `hydrateInlineScreenView` deprecation alias.
│   │   │   ├── mergeFields.mjs     # Pure ref-wins-inline-overrides field merge. Mirror of WP_Admin_Shell_Data_View_Config::merge_fields.
│   │   │   └── deprecation.mjs     # One-shot console.warn for the v2→v3 hook/fn rename — fires when NODE_ENV !== 'production' OR window.wpAdminShell.debug === true.
│   │   ├── modes/                  # v3 engine modes (default/focus/takeover/modal + plugin-contributed)
│   │   │   ├── resolveMode.mjs     # Pure ESM: resolveMode(modesCatalog, modeName) → { regions: {…} } w/ extends chain (depth 10, cycle-safe). Mirror of WP_Admin_Shell_Modes::resolve.
│   │   │   └── useMode.js          # React hook: useMode(screenId) → { mode, regions }. Reads resolved engine modes from kernel context + active screen.mode.
│   │   └── shell-switching.js      # window.wpAdminShell.switchShell(slug) plumbing
│   └── apps/                # All shell-bundled apps (registered via builtins.js)
│       └── <id>/                           # one dir per app id; everything for the app lives here
│           ├── index.js                    #   React component (default export); imports './index.css' side-effect
│           ├── app.json                    #   manifest (declares source id, capabilities, platform, etc.) — includes `documentation` block (machine-readable rebuild contract)
│           ├── app.md                      #   prose docs — overview, architecture, rebuild guide, known limitations (with parity gaps vs docs/screens/*.md)
│           ├── index.css                   #   app-specific structural CSS (optional)
│           └── (helpers/_components/)      #   single-app-only helpers colocate with their consumer
│
│       Same shape as engines/. Convention for plugin:* apps (spec §13 #3)
│       matches: app dir contains app.json + index.js + optional index.css.
│       Webpack picks up CSS through the dependency graph; tree-shakes
│       unused apps' CSS automatically. Apps that don't ship CSS
│       (command-palette, preview-pane, appearance, etc.) skip index.css
│       and just expose index.js. notices-banner + notices-snackbar are
│       independent dirs — each ships its own index.js + index.css.
│       navigation/index.js bundles its drill-down helpers (Screen/Item/
│       Button + slide keyframes) into its own index.css; the Sidebar*
│       presentational helpers live under navigation/_components/.
│       site-hub/SiteIcon.js is a sibling of site-hub/index.js. Settings
│       sub-panels (SettingsDiscussionApp / Reading / Writing) live
│       inside settings/ as siblings of the host index.js (no separate
│       manifests — internal helpers, not registered apps). Rule of
│       thumb: presentational helper used by exactly one app belongs
│       inside that app's dir; promote to a shared location only when
│       a second consumer appears.
├── tests/
│   ├── php/                 # wp eval-file: cascade (22), selection (5), cap (54)
│   ├── parity/              # node: WPDS slot-drift detector (4)
│   ├── runtime/             # node: pure-ESM runtime modules (resolveRegion / validateRegion / …)
│   ├── schema/              # node: Ajv sweeps over shells + manifests
│   └── engines/             # TS engine tests; run via `node --experimental-strip-types`
├── scripts/snapshot-wpds.mjs   # Regenerate src/runtime/styles/wpds-defaults/<wpds>.json
├── build/                   # webpack output (gitignored)
└── docs/                    # spec, plan, schemas, readiness, perf-baseline, archive
```

## Application sources

| Source | Component | Native? | Cap floor | Notes |
|---|---|---|---|---|
| `core:posts` | PostsApp | ✅ | — | DataViews table; `config.postType`. v3 dataView consumer (`useDataView(screenId)`; reads resolved `(postType, <name>, variant)` triple via inline-snapshot fast path + `/wp-admin-shell/v1/data-view` REST fallback). |
| `core:simple-editor` | SimpleEditorApp | ✅ | — | Substack-style; title + 9 blocks + auto-save |
| `core:editor` | EditorApp | iframe | — | `post.php?post={id}&action=edit`. Native `@wordpress/edit-post` mount deferred to v2.x — see `SiteEditorApp.js` for blockers. |
| `core:media` | MediaApp | ✅ | — | Grid, upload, detail modal |
| `core:taxonomy` | TaxonomyApp | ✅ | — | DataViews + create/edit/delete terms. v3 dataView consumer (`useDataView(screenId)` reads resolved `(taxonomy, <name>, variant)` triple); manifest baseline binds `(taxonomy, category)`, other taxonomies consume cascade-only entries (`developer-admin.json` ships `(taxonomy, post_tag)`). |
| `core:profile` | ProfileApp | ✅ | — | `useEntityRecord('root','user',userId)` |
| `core:users` | UsersApp | ✅ | `list_users` | DataViews + bulk delete with reassign + self-delete guard; v3 dataView consumer on `(root, user, variant)` triple via `useDataView(screenId)`. |
| `core:comments` | CommentsApp | ✅ | `moderate_comments` | DataViews + approve/spam/trash via partial saveEntityRecord. v3 dataView consumer on `(root, comment, variant)` triple via `useDataView(screenId)`. |
| `core:settings` | SettingsApp | partial | `manage_options` | Composable host; native general/writing/reading/discussion + iframed permalinks/media/privacy |
| `core:settings-general` | SettingsGeneralApp | ✅ | — | Standalone version of the General panel (legacy entry; kept registered) |
| `core:dashboard` | DashboardApp | ✅ | — | Site overview cards; recent posts/drafts/comments |
| `core:plugins` | PluginsApp | ✅ | `activate_plugins` | DataViews on `'root','plugin'` entity; activate/deactivate via REST. v3 dataView consumer on `(root, plugin, variant)` triple via `useDataView(screenId)`. |
| `core:themes` | ThemesApp | ✅ | `switch_themes` | DataViews on `'root','theme'` entity. v3 dataView consumer on `(root, theme, variant)` triple via `useDataView(screenId)`; grid layout default with screenshot tiles + Activate / Details actions. |
| `core:tools` | ToolsApp | ✅ | — | Linker cards to import/export/site-health |
| `core:site-health` | SiteHealthApp | ✅ | `view_site_health_checks` | `/wp-site-health/v1/tests/{id}` runner |
| `core:site-editor` | SiteEditorApp | iframe | `edit_theme_options` | `site-editor.php` adapter. Native `@wordpress/edit-site` mount deferred to v2.x; five blockers (preferences-store / commands / full-screen CSS / hash-router collisions, edit-site not in BUNDLED_PACKAGES) documented in `SiteEditorApp.js`. |
| `core:appearance` | AppearanceApp | ✅ | — | User-prefs UI driven by `customizable` |
| `core:iframe-fallback` | IframeApp | iframe | — | URL relative to `adminUrl`, chrome hidden via injected CSS |
| System apps | various | — | — | `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu` — each shell declares them explicitly in admin.json regions / workspace widgets (no v0 normalizer auto-pinning). **`core:command-palette`** reads `commands[]` directly + synthesizes "Go to X" entries from `screens[id]` via `compileCommands.mjs` (replaces v2 routes-block iteration). Emitted palette names are `core/admin-shell/palette-<encoded-id>` (unified across commands[] + screens[] for first-write-wins dedup). |
| `core:dashboard-host` | DashboardHostApp | ✅ | — | v3 widget-grid controller. Reads `screens[id].apps[]` with `slot: "grid"` (v3 shape, replaces v2 `dashboardWidgets` block). Uses the app-declared `grid` slot from `app.json#slots`. Size + position hints come from app-manifest `slotHints` + per-entry `size`/`position` overrides. Pure compiler `src/apps/dashboard-host/composeScreenWidgets.mjs` resolves the screen's widget list (legacy `composeWidgets.mjs` retained for v2 shells); `wp_admin_shell_register_dashboard_widget()` API survives — under the hood contributes a screen-app entry with `slot: "grid"` into the target screen. The v3 compiler folds legacy `dashboardWidgets` admin.json blocks into `screens[dashboard-widgets].apps[]` at resolve time with a `_doing_it_wrong` notice under `WP_DEBUG`. Bundled mount: `/dashboard/home` screen in `developer-admin`. |
| `core:dashboard-widget-recent-posts` | DashboardWidgetRecentPostsApp | ✅ | `edit_posts` | Example widget. Lists five most recent post drafts (`postType/post`, `status: draft`, orderby modified desc, context: edit). Click → `#/posts/{id}/edit`. |
| `core:dashboard-widget-quick-draft` | DashboardWidgetQuickDraftApp | ✅ | `edit_posts` | Example widget. Title + textarea + Save Draft button. On submit creates a draft via `saveEntityRecord`, invalidates the recent-drafts query, navigates to `#/posts/{id}/edit`. Empty body seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->` to satisfy WP's empty-post rejection. |
| Desktop engine apps | `core:desktop-compositor`, `core:desktop-dock-app`, `core:desktop-window-frame`, `core:desktop-iframe` | ✅ | — | `core:desktop` engine apps (P2 complete on `feat/desktop-engine-p2-mvp`). **Compositor** drives the kernel's dynamic-children store from a `WindowManager` TS class (`src/runtime/engines/core-desktop/windowing/`); each open window becomes a child region whose decl nests `frame` + `body` static grandchildren. **Frame** owns the titlebar + traffic-light controls + 8 resize handles + drag (titlebar) + snap-to-edge ghost (top → full, left/right → half). Drag/resize/snap all use the imperative-pointer pattern: mutate the window region's inline `style.transform` / `inline-size` / `block-size` during pointermove (no React re-render), commit one rect via `WindowManager.setRect` on pointerup. **Dock** renders via a pluggable renderer registry (`dockRailRegistry.ts`) — bundled `'default'` paints launcher tiles + live-window tiles; plugin authors register alternates and point `regions.dock.config.renderer` at the name. Launcher click respects the app manifest's `window.multiInstance` (false → focus existing, true → always open new). **Iframe app** wraps any wp-admin URL with `?wp_admin_shell_chromeless=1` so the PHP chromeless bridge (`includes/engines/core-desktop/chromeless-bridge.php`) attaches its 14-subsystem JS — observability (error / fetch / XHR / beacon wraps + auth-check force), navigation (external + admin link interception, focus-request, top-window escape, screen-meta detection), recovery (auth-check via `heartbeat-tick`), instrumentation (devtools header injection slot). Parent listener in `core:desktop-iframe` routes `focus-request` → `focusWindow`, `admin-link` → new shell window, `external-link` → native new tab. Command-palette harvest (sub-system 11) ships as a stub — the parent palette consumer isn't wired yet. Window region animates `transform` / `inline-size` / `block-size` (180ms ease) so snap commits, restore-from-pinned, and maximize toggles glide; live drag/resize stamps `data-dragging="true"` to suppress the transition during the imperative-pointer write path. |

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

v3 navigation reads the resolved `menu` tree (engine-agnostic IA — nested items keyed at every depth). The `core:navigation` app maps the menu tree onto the engine's renderer:

- **`sidebar-drilldown`** (`core:default`): items with `items` become drilldown nodes; clicking slides into a sub-screen with a back link.
- **`sidebar-tree`**: items with `items` become expandable tree nodes.
- **`dock`** (`core:desktop`): items with `items` become folders.
- **`drawer`** (`core:single-pane`): items with `items` become accordion sections.

Item key matching a screen id implicitly binds the item to that screen — `label`/`icon`/`permissions` flow through. Items without a screen binding declare their own `label`/`icon`/`href`/`separator: true`. Drill-down children do NOT inherit parent icon — each item explicit.

**Drilldown state in URL slot `?screen=<id>`** (NOT `useState`). NavigationApp reads `useRoute().params.screen` and writes via `navigateScreen(id|null)`. `__root` sentinel = user explicitly closed via back button. Path-based inference reopens drilldown when URL primary matches a child's href.

Screens support slide animations (0.14s CSS keyframes) and focus restoration after back navigation. The sidebar internals mirror `@wordpress/edit-site/src/components/sidebar*` class naming (prefix `edit-site` → `wp-admin-shell`) — see Recurring patterns above for the convention.

**Classic wp-admin menu bridge** ingests every third-party plugin's `add_menu_page()` / `add_submenu_page()` registrations into both the `screens` block AND the `menu` tree automatically. Yoast SEO, Advanced Custom Fields, WooCommerce extensions, etc. surface in the shell's menu without writing a single `wp_admin_shell_register_menu_item()` call. The bridge walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` at `wp_admin_shell_data_plugin` priority 6 and synthesizes `screens[ingested-<slug>]` + `menu.ingested.items[<id>]` entries.

## Multi-area layout

v3 multi-app screens declare multiple apps inside engine-declared slots via `screens[id].apps[]`. One app receives the URL slot via `routing.mode: "mirror"`; the rest are static layout decorations.

```jsonc
{
    "screens": {
        "posts": {
            "path": "/posts",
            "app": "core:posts",
            "apps": [
                { "id": "list",    "app": "core:posts" },
                { "id": "preview", "app": "core:editor", "slot": "detail", "routing": { "mode": "mirror" } }
            ]
        }
    }
}
```

The v3 compiler synthesizes route configs for each `apps[]` entry, slotted into the appropriate URL slot. Entries with a `slot` emit `@<slot>/<path>` slot-namespaced routes; engine regions declaring `routing.route-key: "<slot>"` resolve them via the slot resolution mode (`mirror` = synthesizes slot value as `@<route-key><primary>` from the URL primary path; `query` = reads `?<key>=...` URL query param). Mirror-mode regions emit `data-app-mounted="true|false"` so engine CSS can collapse empty containers.

v2-style decoration via app-level `contentWidth` / `preview` config keys is still honored (legacy escape hatch) but new shells should use the v3 multi-app shape.

## Shell switching

The active shell config is stored in `wp_admin_shell_active_shell` option (registered with `show_in_rest`). The MVP wrote `wp_admin_shell_active_config`; the resolver reads the new key first and falls back to the legacy key. Switchable via:
- Settings page (`wp-admin/admin.php?page=wp-admin-shell-settings`)
- Toolbar dropdown (saves via `POST /wp/v2/settings`, then reloads)

## Extension points (spec §13)

Fourteen extension surfaces, all in place:

1. **Filter merged config.** PHP `apply_filters( 'wp_admin_shell_data', $config )` runs after the cascade resolves; per-origin `wp_admin_shell_data_{origin}` runs during the merge.
2. **Filter per-origin configs.** `wp_admin_shell_data_core` / `_plugin` / `_site` / `_role` / `_user`.
3. **Register a `plugin:*` app.** PHP `wp_admin_shell_register_app( $manifest_or_path )` or convention-path discovery (`{plugin}/apps/{name}/app.json`).
4. **Register a region template.** PHP `wp_admin_shell_register_template( $engine_id, $template_id, $template )` — extends an existing engine's template catalog at runtime. Validates engine exists, template id matches the namespaced pattern, body has a string `role`.
5. **Register an engine.** PHP `wp_admin_shell_register_engine( $manifest_or_path )` or convention-path discovery (`{plugin}/engines/{name}/engine.json`). Engine modules MAY export an optional JS-side `ThemeProvider` field on their `EngineSource` (`src/runtime/registry/source-types.js`) — when present, `ThemeProviderHost` mounts it instead of the WPDS default. Use this to ship an entirely different design system (Material, Tailwind tokens, brand-locked palette) without touching kernel code. Render-time errors in a custom provider trip the host's error boundary and silently fall back to WPDS so the shell still paints. Engine manifests MAY also declare a top-level `default-styles` block (Phase C; see `docs/schemas/admin-engine-v2.json#defaultStyles`) — same shape as admin.json `styles` minus `regions`/`applications`/`branding`. The PHP resolver injects a synthetic `engine` origin between `core` and `plugin` carrying these defaults; admin.json wins on every overlapping key. Use this to ship the engine's visual identity (palette, density, chrome surface bindings) so consuming shells stop having to repeat the rules.
6. **Register a complete shell.** PHP `wp_admin_shell_register_shell( $slug, $admin_json )` for runtime-computed shells. Programmatic registrations win over file-based shells of the same slug; site/role/user origins still merge on top via the same cascade.
7. **Filter a dataView config.** Each `(kind, name, variant|_default)` triple resolves through the 6-origin cascade (via the `settings.dataViews` block in admin.json or the app manifest's `dataView` baseline + `variants: { <id>: ... }` family), then runs through `apply_filters( "wp_admin_shell_data_view_config_{$kind}_{$name}", $doc, $kind, $name, $variant )` plus the per-variant suffix `wp_admin_shell_data_view_config_{$kind}_{$name}_{$variant}` when `variant !== '_default'`. Variants resolve independently — no implicit `_default` merge; authors who want the v2-style merge declare `"extends": "_default"` on the variant entry (recursive, cycle-safe, max depth 10). Apps consume via the overloaded `useDataView(screenId)` (screen-keyed) or `useDataView({kind, name, variant?})` (registry-direct) React hook; built-in fallback ships with the app, cascade/filter overrides win. **Deprecation shims (one release cycle, removed in v3.1):** v2 filter `wp_admin_shell_view_config_{kind}_{name}[_{variant}]` fires alongside the new name + emits a one-time `_deprecated_hook` notice; v2 REST `/wp-admin-shell/v1/screen-view` aliases to `/data-view` with an `X-WP-Deprecated` header; v2 JS hook `useScreenView` re-exports from `useDataView` with a one-shot dev `console.warn`.
8. **Register a data-field collection.** PHP `wp_admin_shell_register_data_field_collection( $id, $kind, $name, $fields, $fields_module )` — registers a named field bundle bound to `(kind, name)` (or universal when `name === null`). Contributes through the `plugin` origin so site/role/user overrides can extend or replace via admin.json's `settings.dataFields` block (renamed from v2 top-level `fieldCollections`; lives under `settings` alongside `settings.dataViews` for symmetry). DataView docs reference a collection via `fieldsRef`; the resolver merges fields ref-wins-inline-overrides — collection provides the base, inline `fields` shallow-merges per-id, inline-only ids append after the base. `fieldsModule` is reserved for forward-compat ESM script-modules support; the runtime does not load it (one-time dev warning when declared). Filter `wp_admin_shell_data_plugin` runs after the contribution, so plugin authors can still mutate fields via the regular cascade entry point. **Deprecation shim:** v2 public function `wp_admin_shell_register_field_collection()` survives as a thin wrapper calling the new name + emits a one-time `_doing_it_wrong` notice in `WP_DEBUG`; removed in v3.1.
9. **Declare REST preloads.** Top-level `preload[]` block in admin.json — entries are either string paths (`"/wp/v2/users/me"`, GET-shorthand) or `[ path, method ]` tuples where method is `GET` or `OPTIONS`. `WP_Admin_Shell_Preload::inject()` (hooked inside `admin_enqueue_scripts` on the shell page only) walks every cascade origin's `preload[]` through the existing `wp_admin_shell_data_{origin}` filter chain, concatenates them additively, dedupes by exact `path|method`, hydrates the list through `rest_preload_api_request`, and ships the resulting cache as inline script attached to `wp-api-fetch` (`wp.apiFetch.use( wp.apiFetch.createPreloadingMiddleware( ... ) )`) — landing before the main `wp-admin-shell` script enqueue so the middleware is in place when `@wordpress/core-data` resolvers fire. Cascade is *additive only* (preload entries carry no user-meaningful identity, so site/role/user simply append; no override semantics). Each `rest_preload_api_request` call is wrapped in a `Throwable` catch — a single failing path doesn't poison the rest of the bundle. Conditional preloads belong inside a `wp_admin_shell_data_{origin}` filter callback that mutates the array on `current_user_can()` / feature flags.
10. **Register a nav menu item.** PHP `wp_admin_shell_register_menu_item( $id, $args )`. Args (`to` / `label` / `icon` / `badge` / `parent` / `parent_type` / `position`); the shell adds an optional `region` arg (defaults to the first `core:navigation` region in the resolved tree) and an optional `capability` arg (flows through the 4-layer cap model). `parent_type=drilldown` nests under a `screen` parent (existing shell nav primitive); `parent_type=dropdown` falls back to drilldown with a `WP_DEBUG` notice (shell nav has no dropdown today). Contributes through `wp_admin_shell_data_plugin` at priority 5 so plugin authors using the same filter at default priority 10 still win. Duplicate ids return `WP_Error`; no `unregister`. Items targeting a non-existent region drop silently.
11. **Register an admin route.** PHP `wp_admin_shell_register_admin_route( $path, $args )` — args `( $path, [ 'app' => …, 'config' => […], 'static_data' => […], 'gc_time' => … ] )`. `app` replaces `content_module`, `static_data` is folded into `config` for forward compatibility, and `gc_time` is accepted but ignored (TanStack-specific cache GC, no shell equivalent — emits a one-time `WP_DEBUG` notice per path). Contributes through `wp_admin_shell_data_plugin` at priority 5 onto the `routes` block; admin.json wins on per-path collision. Path validates against the same pattern admin-v2 uses (`^/[A-Za-z0-9_/{}\-*]*$`). Duplicate paths return `WP_Error`.
12. **Contribute a cache-invalidation signal.** PHP filter `wp_admin_shell_cache_signals` (signature: `apply_filters( 'wp_admin_shell_cache_signals', array $signals, array $context )`) lets a contributor inject its own fingerprint into the resolver's cache key. Default signals cover disk + option + user-meta surfaces only — anything held in static class state (programmatic shim registries, runtime-computed origins, in-memory snapshots) is invisible to the default key and risks stale cache across requests when its shape changes. C3 menu-item + admin-route registries each hook the filter and contribute `md5( wp_json_encode( $registry ) )`. Plugins holding their own static state should hook the same filter rather than calling `WP_Admin_Shell_Cache::flush()` defensively.
13. **Register a dashboard widget.** PHP `wp_admin_shell_register_dashboard_widget( $id, $args )`. Two flavors: **override-only** ships `{ position?, defaultSize?, minSize?, title?, hidden? }` to retune placement/size for an app already in the manifest registry; **standalone** additionally ships `{ script, role?, capabilities?, dashboardWidget? }` and the registry synthesizes a minimal app manifest, queuing it for forwarding to `wp_admin_shell_register_app()` at `init` priority 7 (lazy-flushed earlier on first `wp_admin_shell_data_plugin` apply) so mu-plugin / early-`plugins_loaded` callers fire safely before the manifest-registry class loads. Top-level args win per-property over `args['dashboardWidget']` so one resolved override flows to both override + manifest. Two merge layers stack: (1) admin.json `dashboardWidgets[id]` wins entirely over the PHP-registered override (entry-replacement, same pattern as `settings.dataFields`); (2) the resolved override merges per-property over the app manifest's `dashboardWidget` block at render time via `composeWidgets()` — admin.json winning each field. The host (`core:dashboard-host`) is the consumer: it reads every manifest declaring a `dashboardWidget` block + admin.json overrides and renders the survivors as tiles. Widgets are apps — existing 4-layer cap gating + theming + source-cap floor apply without a separate gating layer. See spec §13 #13.
14. **Filter the classic wp-admin menu bridge skip-list.** PHP filter `wp_admin_shell_classic_menu_core_slugs` lets plugins/sites add wp-admin slugs the shell already covers natively (so the bridge skips them). Default list covers core wp-admin pages — `index.php`, `edit.php`, `upload.php`, `themes.php`, etc. Filter passes the raw list; non-string entries are filtered out (`array_filter( …, 'is_string' )`). Filter dispatch is memoized request-scoped — adding a callback at runtime won't take effect mid-request, but tests can call `WP_Admin_Shell_Classic_Menu_Bridge::reset()` to drain the memo. The bridge itself walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` at `wp_admin_shell_data_plugin` priority 6 and synthesizes `screens[ingested-<slug>]` + `menu.ingested.items[<id>]` for every third-party plugin entry. `iframe:<slug>` app refs are emitted verbatim and translated to `core:iframe-fallback` + `config.url` by the v3 compiler at the end of `compile()`. The bridge contributes a `classic_menu_bridge` signal to `wp_admin_shell_cache_signals` so plugin (de)activation between requests picks a different cache bucket.

JS-side surfaces:

- `useDirtyState( regionId, isDirty, { blocksNavigation } )` — reports unsaved-changes status; `<NavigationGuard>` honors it across `beforeunload` + Navigation API + hashchange-revert.
- `bindings` block in admin.json — declares `[{shortcut, invoke}]`. `<BindingsConsumer>` wires keystrokes to triggerable apps via the `triggerStore`. Only triggerable regions register their open handlers.
- `useDataView( screenIdOrTriple, { fallback } )` — overloaded: pass a screen id string for per-screen lookup, or a `{ kind, name, variant? }` object for registry-direct lookup (restores v2 `useViewConfig` semantics). Synchronous when the inline `window.wpAdminShell.config` snapshot already carries the resolved doc; falls through to `/wp-admin-shell/v1/data-view?screen=<id>` or `/wp-admin-shell/v1/data-view?kind=X&name=Y&variant=Z` REST for entries registered after page load. Returns `{ config, isLoading }`. Deprecated v2 names `useViewConfig` + `useScreenView` re-export from this module with a one-shot dev `console.warn`; removed in v3.1.

## Manual smoke before tagging

Per `docs/archive/v1-readiness.md` (historical). Required before a release cut:

1. Cap gating across roles (subscriber → admin) — visual confirmation that `wp-admin-default` matches what wp-admin would surface natively.
2. Cold-mount perf measurement → fill `docs/perf-baseline.md`.
3. a11y: keyboard pass, VoiceOver pass on macOS, axe against rendered DOM.
4. Each bundled shell renders + Cmd+K palette + shell switching + form-save (PHP 8.1+).
5. Notices: snackbar on success, dismissible banner on error.
