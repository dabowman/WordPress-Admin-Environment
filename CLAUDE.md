# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

- **v1.0.0-beta.1** tagged at `df5fcb5` on `main` (PR #32). v1 milestones M1–M5 landed.
- **v2.0.0-beta.1** tagged at `01cc512` on `feat/wp-admin-shell-v2`. V2.M1–M5 done; manual smoke signed off 2026-05-06 (`docs/v2-readiness.md`). Migration directive's full Definition of Done met. Post-tag spec-§15 polish (bindings runtime, six orphan apps registered, `wp_admin_shell_register_template`, `wp_admin_shell_register_shell`, schema-hosting note, spec §9.1 worked-example test) landed on the branch.
- **v2.0.0-beta.2** tagged at `147011c` on `main` after the DS-decoupling refactor (three-phase rewrite making the kernel DS-neutral; see the `project_ds_decoupling_2026_05_12` memory). Wrap-up sweep also renamed `shells/v1-demo.json` → `v2-demo.json` and refreshed test totals. Native `@wordpress/edit-{post,site}` mount deferred to v2.x — see `SiteEditorApp.js` for blockers.
- **C2 view-config + field-collections** landed on `feat/c2-view-config` (2026-05-14). New `viewConfigs` + `fieldCollections` blocks in admin-v2; per-app `viewConfig` block in admin-app-v2; cascade-resolved triples `(kind, name, variant)` with `_default` representing the base view; `wp_admin_shell_view_config_{kind}_{name}[_{variant}]` filter on the resolved doc; ref-wins-inline-overrides field merge; `wp_admin_shell_register_field_collection()` PHP API; `useViewConfig(kind, name, variant?, {fallback})` React hook; `/wp-admin-shell/v1/view-config` + `/view-config/variants` + `/field-collections` REST endpoints. PostsApp migrated as proof — reads its DataViews spec via the hook with inline fallback (no behavior change when no override is registered). Five renderer apps' worth of CRUD screens collapse to JSON spec + filter overrides on this primitive once the rest follow. See `project_c2_view_config_design` memory + `docs/research/ciab-primitives-cascade-integration.md`.

**v2 architecture (current branch).** Three artifacts replace v1's single-file shape: `app.json` (per-app intrinsics, ships with app code) + `engine.json` (engine + region templates) + `admin.json` (install decisions only). Region typing is `role` (ARIA) + `layout` (CSS subset) + `platform` (browser-analog services) + `routing` (URL participation) — `kind` enum retired. One-region-one-app with nested child regions replaces `contains[]`. Selection event bus and shell-level slot/fill removed (app-internal slots survive). Navigation is URL-driven — routable regions declare `routing.route-key` naming the URL slot they read; plain `<a href>` navigates; `target` keeps native HTML meaning. Cascade resolver, token compiler, and capability gating carry forward. Two engines ship: `core:default` + `core:single-pane`. DTCG `tokens.json` resolver: PHP `WP_Admin_Shell_Tokens` deep-merges site → theme → plugin → core; pure-ESM `tokensResolver.mjs` flattens + resolves curly-brace aliases + coerces 8 DTCG leaf/composite types. All 5 bundled shells in canonical v2 shape.

**Pipeline (PHP → JS).** `WP_Admin_Shell_Resolver` merges six admin.json origins (core / engine / plugin / site / role / user) with restrict-only enforcement + `customizable` filtering (legacy `userCustomizable` read one cycle). The synthetic `engine` origin sits between `core` and `plugin` and carries the active engine manifest's `default-styles` block (Phase C); admin.json wins on every overlapping key. Resolved tree feeds `src/runtime/kernel.js` which picks engine from registry, renders regions through generic `<Region>` (→ `ModalRegion` | `PersistentRegion` from platform services), mounts apps via `MountedApp`, and wraps the tree in `<ThemeProviderHost engineSource isRoot>` so token overrides cascade through the DOM tree, not via global `:root` pollution. Capability gating is four layers: region fast-path → app gate → source-cap floor → REST observation; nav prunes recursively. Shell switching is option-write + reload. Default install shell `wp-admin-default` mirrors wp-admin via capability-gated iframe routes.

**Theming model (4 tiers, DS-neutral kernel).** `src/runtime/styles/ThemeProviderHost.js` is the kernel's single seam to whatever ThemeProvider the active engine ships. Engines export an optional `ThemeProvider` field on their `EngineSource`; absent provider = host falls back to `WpdsThemeProvider` (`src/runtime/styles/WpdsThemeProvider.js`) which is core-default's contribution, NOT a kernel default. The fallback only fires because `WpdsThemeProvider` is imported by the bundled core engines today; a non-WPDS engine plugin replaces it wholesale. `WpdsThemeProvider` unlocks the real `@wordpress/theme.ThemeProvider` by piggybacking on `@wordpress/edit-site`'s allowlist entry (the package's `__dangerousOptInToUnstableAPIsOnlyForCoreModules` does string-match-only verification), then `unlock(wpTheme.privateApis).ThemeProvider`. Sites without Gutenberg + WPDS engines render empty (no fallback path — removed at v2.0.0-beta.2; the `Requires Plugins: gutenberg` header advertises the contract for the bundled WPDS engines specifically). The host wraps the inner provider in a render-error boundary; if a third-party engine's provider throws during render, the host swaps to `WpdsThemeProvider` and logs a console warning. **Engine-pluggable style compiler:** the engine source MAY ship a `compileStyles(styles, tokens) → {top, scoped, subtrees}` hook (`src/runtime/engines/core-default/compileStyles.mjs` for the WPDS-flavored compiler). The host calls it and emits the three buckets as a sibling `<style>` block scoped to a wrapper `<div data-wpds-theme-provider-id={id}>`. Engines omitting the hook get zero scoped overrides — provider owns all token plumbing directly. Author customization paths, in order of preference: (1) **seeds** under `styles.theme.{color.{primary,bg}, cursor.control, density}` — engine ThemeProvider's responsibility to interpret; (2) **nested seeds** under `styles.regions[id].theme` and `styles.applications[id].theme` — `<Region>` and `<MountedApp>` wrap content in nested `<ScopedThemeProvider>` reading the engine's provider from kernel context; (3) **direct slot overrides** under `styles.{color,border,dimension,elevation,font}` (top-level + per-region/app) — escape hatch the engine's `compileStyles` translates into provider-scoped CSS variables; (4) **DTCG `tokens.json` primitives** — independent of ThemeProvider, useful as named primitives consumable from any of the above via `{tokens.x.y}` aliases. Chrome extension layer (`--wp-admin-shell--chrome--*`) stays parallel for shell-only concepts WPDS doesn't cover (sidebar width, site-hub icon size, etc.) — bundled-engine-only concern, lives in core-default's compiler. Density extraction lives in `ThemeProviderHost`'s `pickDensity()` — pulls `styles.theme.density` first, falls back to legacy `styles.density`, and passes whatever string the author authored straight through to the engine's `ThemeProvider`. DS-vocabulary validation (the `default|compact|comfortable` enum) lives in `WpdsThemeProvider`, NOT the kernel — a Material/Tailwind engine receives the raw string and interprets per its own rules.

**How tokens reach DOM.** Two paths (both engine-side now, not kernel): (a) **engine template `default-style`** — `core:default` engine emits values like `var(--wp-admin-shell--chrome--sidebar--background, var(--wpds-color-bg-surface-neutral))` as **inline style** on each region's `<div>`. `resolveRegion.mjs` merges template `default-style` into `region.style`, and `Region.js`'s `toReactStyle` helper kebab→camelCases the keys and applies them as React `style={...}`. The two-arg `var()` chain means: chrome var wins when authored; falls back to WPDS slot when chrome layer is empty. (b) **engine `index.css` class rules** — `core:default/index.css` ships the chrome-anchor/svg/Stack-defensive overrides + the engine root paint (`.wp-admin-shell-layout` background+color via `--wp-admin-shell--chrome--canvas--{background,foreground}` slots, same fallback chain). Single-pane engine paints its root through the same canvas slot for parity. Non-WPDS engines ship none of these. Kernel `src/index.css` is ~10 lines: body positioning + a11y forbidden fallback structure only. The `chrome.canvas.*` slot is the author entry point for shell-wide background/foreground; `chrome.{sidebar,toolbar,site-hub,content}.*` cover per-surface chrome. **Inside WPDS-flavored app/engine code, don't hardcode hex colors** — use `var(--wpds-*)` directly so ThemeProvider seeds flow through. App-level CSS audited 2026-05-06; no remaining hardcoded hex colors in `src/apps/**/*.js` inline styles.

**Test surface (843 assertions).** PHP via `wp eval-file`: `run-cascade-tests.php` (29), `run-cap-tests.php` (54), `run-shape-tests.php` (111 — known-engines list extended with `core:desktop` 2026-05-12), `run-manifest-tests.php` (67), `run-tokens-tests.php` (13), `run-engine-defaults-tests.php` (22), `run-cap-gating-smoke.php` (5 — per-role nav-prune smoke for `wp-admin-default`, v2 region-tree walker), `run-chromeless-bridge-tests.php` (13 — PHP gate + body-class + script-emission contract for `core:desktop` chromeless bridge), `run-view-config-tests.php` (44 — field-collections registry + view-config resolver + ref-wins-inline merge + filter machinery + variants_for discovery + cascade contribution + `inject_app_baselines` manifest→core-origin path + duplicate-id rejection). Node: `tests/schema/validate-shells.test.mjs` (79 — sweeps shells/manifests/engine-manifests/tokens against admin-v1 + admin-v2 + admin-app-v2 + admin-engine-v2 + tokens-v1; 30 bundled app manifests incl. `core:desktop-iframe`, three bundled engines incl. `core:desktop`, positive + negative fixtures), `tests/parity/wpds-snapshot.test.mjs` (4), `tests/runtime/*` (18 files, 330 assertions — resolveRegion + validateRegion + platformServices + matchRoute + dirtyState + tokensResolver + compileStylesTokens + bindings parser + triggerStore + spec §9.1 worked example + registry ThemeProvider validation + engine default-styles defensive merge + icon-registry contract + dynamicChildren store + chromeless-bridge envelope contract + `shouldRenderRegion` cap-gate + resolveRegion×gate integration pipeline + view-config `mergeFields` + view-config `hydrateInline`), `tests/engines/core-desktop/*` (TS via Node `--experimental-strip-types`; 77 assertions — WindowManager state machine + snap geometry + compileStyles + dockRailRegistry). Browser-side perf + a11y manual passes per `docs/v1-readiness.md` + `docs/v1-perf-baseline.md`.

**Hard runtime dep:** Gutenberg plugin (declared via `Requires Plugins: gutenberg`). `@wordpress/ui` overlay components use private APIs whose allowlist only Gutenberg supplies. Without it, shell renders empty.

## Before modifying code

1. Load skills (symlinked in `.claude/skills/`): `/wordpress-rest-api`, `/wordpress-dataviews`, `/gutenberg-contributor`.
2. Read `docs/wp-admin-shell-design-spec.md` — **master spec** (2026-05-01, URL-routing refined 2026-05-04). Authoritative. When prose and schema disagree, schema wins.
3. Read the three v2 schemas: `docs/schemas/admin-v2.json`, `admin-app-v2.json`, `admin-engine-v2.json` (JSON Schema 2020-12, fully inline-documented). Canonical `$id`s point at `schemas.wp.org/admin/v1.json` etc.; see `docs/v2-readiness.md` "Schema hosting" for the beta-cycle raw-GitHub URL.
4. Read `docs/plans/wp-admin-shell-v2-migration-directive.md` — active v2 plan (V2.M1 manifests → M2 region vocab → M3 routing → M4 selection-bus + slot removal + app manifests → M5 second engine + tokens.json + ship).
5. Read `docs/post-editor-sketch.md` — worked example decomposing post editor into v2; surfaces `dirty-state` + `block-navigation-on-dirty` platform services.
6. Read `docs/research/schema-exercise-findings.md` — what schema can't validate, runtime must.
7. Read `docs/admin-json-api-validation.md` — REST API coverage per app source.
8. Consult `docs/screens/` — 42 tier-2 functional specs covering every wp-admin screen. Source of truth when (re)building any `core:*` app. Gaps section = REST rebuild tickets.
9. Read `docs/research/app-validation-2026-05-04.md` — WPDS / REST / core-data audit of every `src/apps/*` (chrome + content apps; the V2.M5 `src/runtime/apps/` directory was consolidated into `src/apps/`). Remediation merged at `a29a32e`. Captures destructive-button fallback, DataViews `/wp` import path, WPDS 0.12 gaps (no `tone="critical"`, no `variant="ghost"`, no `Text weight/size/color`, no SnackbarList port).
10. Skim `docs/feedback.md` — Inbox/Triaged/In-progress/Done triage log. Per directive §2 #4: don't fix items proactively during migration — clean migration first, triage on v2 baseline second.
11. Read `docs/engines-and-design-systems.md` — kernel-vs-engine-vs-app DS boundary + three contracts (reuse-WPDS, token-bridge, engine-native apps). Authoritative for any work on a non-WPDS engine.
12. Read `docs/desktop-engine-readiness.md` if working on `core:desktop` — manual smoke checklist + known issues + automated test gates for the engine.
13. For any bundled app, read `src/apps/<id>/app.json#documentation` + `src/apps/<id>/app.md` — per-app contract introduced 2026-05-13. `documentation` block (schema: `admin-app-v2.json#appDocumentation` $def around line 265) is machine-readable: purpose, `rebuilds` (matching `docs/screens/*.md` slug or omitted for shell-only apps), `data.reads/writes` (with `via`: `core-data`/`api-fetch`/`window-global`/`external`/`commands`/`kernel-config`), `url.{reads-slots,writes-slots,navigates}`, `states[]`, `interactions[]`, `a11y`, `constraints[]`, `design-system-leakage[]`. Sibling `app.md` carries the prose — overview, architecture, rebuild guide for a non-WPDS / non-React port, known limitations (must include parity gaps versus the matched `docs/screens/*.md`). Update both whenever touching an app's behavior; `design-system-leakage` covers UI packages + data-binding packages + DS-adjacent helpers, but excludes framework primitives (`@wordpress/element`, `@wordpress/i18n`, `@wordpress/data`) and intra-app relative imports.
14. Archived for reference (skim only when needed): `docs/archive/wp-admin-shell-design-spec-2026-04-29.md`, `docs/archive/wp-admin-shell-v1-plan.md`, `docs/schemas/admin-v1.json`, `docs/admin-json-schema.md` (v0 flat).

## Key rules

- **Kernel is DS-neutral.** No `--wpds-*` token, no `@wordpress/ui` import, no `@wordpress/icons` import, no chrome class name (`.wp-admin-shell-nav`, `.wp-admin-shell-toolbar`, etc.) appears in kernel code (`src/runtime/*` outside `src/runtime/engines/`). The kernel owns: cascade resolver, routing, capability gating, region rendering primitive, ThemeProviderHost seam, bindings, dirty-state, icon **registry** (engines populate), **dynamic-children store** (regions opting into `platform[ 'core:dynamic-children' ]` host runtime-mutated child regions via `useDynamicChildren(parentRegionId)`; kernel renders them through the same `<Region>` recursion as static `region.regions[]`, so per-window routing/dirty-state/triggerStore/cap-gating/theming-scope all key per child region ID — see spec §5.5). Anything DS-specific lives inside an engine. **Test before adding kernel code: would a hypothetical Material Design engine plugin loading alongside this plugin still work?** If your change tightens the kernel to WPDS, it goes in `src/runtime/engines/core-default/` instead. See spec §3 + §4.2 + §13.1.
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

843 assertions — all run before merge.

```bash
# Node
npm run test:schema      # 79 — Ajv: admin-v1 + admin-v2 + admin-app-v2 + admin-engine-v2 + tokens-v1 sweeps (+ C2 viewConfigs / fieldCollections fixtures)
npm run test:parity      #  4 — WPDS slot-list drift detector
npm run test:runtime     # 330 — 18 files chained: resolveRegion + validateRegion + platformServices + matchRoute + dirtyState + tokensResolver + compileStylesTokens + bindings + spec-worked-example + registry ThemeProvider + engine defaults + icon-registry + dynamicChildren store + chromeless-bridge envelope contract + shouldRenderRegion + resolver-gate pipeline + view-config mergeFields + view-config hydrateInline
npm run test:engines     # 77 — TS WindowManager + snap + compileStyles + dockRailRegistry (core:desktop engine)

# PHP — wp-env CLI container
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php          #  29
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php         #  67
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php              #  54
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php            # 111
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-tokens-tests.php           #  13
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-engine-defaults-tests.php  #  22
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php       #   5
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-chromeless-bridge-tests.php #  13
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-view-config-tests.php      #  44
```

**Pure-JS runtime modules go in `.mjs` files** so node test scripts (`tests/runtime/*`) can `import()` them directly without a webpack/jest harness. Webpack's default `resolve.extensions` (from `@wordpress/scripts`) does NOT include `.mjs`, so importing a `.mjs` module from app code requires the explicit extension at the import site (e.g. `import { resolveRegion } from './regions/resolveRegion.mjs'`). Convention applies only to side-effect-free utility modules; React components stay `.js`.

`run-shape-tests.php` walks every bundled shell through the resolver and asserts structural invariants (engine + regions + applications + defaultRoute resolves). Catches v1-canonical-path-drift bugs (always read `config.settings?.X || config.X` for any v0/v1 shell field — bare `config.X` only works in v2). Runtime React-component smoke (JSDOM) tracked in issue #30.

Test layering matches `WP_Theme_JSON_*Test`'s pattern: schema validation, fixture-driven unit, end-to-end shape, plus pending JSDOM mount. Add a fixture before fixing the next runtime-reader bug — never in the fix commit.

## Webpack externals

`webpack.config.js` extends `@wordpress/scripts` defaults with one `copy-webpack-plugin` step copying `node_modules/@wordpress/dataviews/build-style/style.css` → `build/dataviews.css`. The dep-extraction plugin handles the rest — `@wordpress/dataviews` and `@wordpress/ui` are in upstream `BUNDLED_PACKAGES` and bundle themselves; everything else externalizes to `wp.*`.

**Past failed workaround — don't repeat:** bundling `@wordpress/private-apis` to control the allowlist creates a *separate registry* from runtime `wp.privateApis`. `@wordpress/dataviews` (also bundled) then fails to `unlock()` objects locked by `wp.components` → `"Cannot unlock an object that was not locked before"`. Gutenberg plugin overriding `wp-private-apis` is the only working answer.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (copies dataviews CSS to build/)
├── shells/                  # Bundled admin.json configurations (all in v2 shape — no settings.*, no kind/contains/source)
│   ├── wp-admin-default.json  # DEFAULT install shell — wp-admin mirror w/ capability-gated nav items + iframe-fallback routes
│   ├── developer-admin.json   # Demo: native v2 apps (users / comments / settings / site-editor) + drill-down design nav
│   ├── content-author.json    # Demo: minimal writer shell (collapsed nav)
│   ├── client-portal.json     # Demo: branded shell (logo, red accent, scoped nav)
│   └── v2-demo.json           # Canonical-shape demo
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── includes/                # PHP
│   ├── class-wp-admin-shell-config.php           # Read-only wrapper around merged tree
│   ├── class-wp-admin-shell-can-rest.php         # /wp-admin-shell/v1/can/{cap}
│   ├── class-wp-admin-shell-prefs-rest.php       # /wp-admin-shell/v1/user-prefs
│   ├── class-wp-admin-shell-view-config-rest.php # /wp-admin-shell/v1/view-config + /view-config/variants (C2)
│   ├── class-wp-admin-shell-field-collections-rest.php # /wp-admin-shell/v1/field-collections (C2)
│   ├── class-wp-admin-shell-cli.php              # `wp admin-shell …` commands
│   ├── cascade/                                  # Cascade resolver
│   │   ├── class-wp-admin-shell-resolver.php     # Two-phase merge + load_origins
│   │   ├── class-wp-admin-shell-merge.php        # merge_authoritative + plain merge w/ tombstones
│   │   ├── class-wp-admin-shell-customizable.php # `customizable` filter (default-deny); reads legacy `userCustomizable` for one cycle
│   │   ├── class-wp-admin-shell-cache.php        # WP_Object_Cache + transient w/ hash keying
│   │   ├── class-wp-admin-shell-config-validator.php  # configSchema cache
│   │   ├── class-wp-admin-shell-field-collections.php # C2 field-collections registry + cascade contribution
│   │   └── class-wp-admin-shell-view-config.php  # C2 view-config resolver: triple lookup + ref-wins-inline merge + filter machinery
│   └── origins/
│       └── class-wp-admin-shell-origin-core.php  # v0 → v1 normalize + empty baseline + chrome defaults
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — calls kernel(window.wpAdminShell.config) and mounts result
│   ├── index.css            # Bootstrap CSS only — body positioning, defensive Stack rule, chrome anchor/svg color overrides, cap-gate fallback. Engine + per-app CSS lives with the engine/app it belongs to (see below).
│   ├── runtime/             # v1 kernel — registry-driven, replaces MVP src/shell/*
│   │   ├── kernel.js        # Top-level mount: registry + normalizer + engine + region resolution
│   │   ├── kernel-context.js  # KernelProvider exposing { registry, config } to all sources
│   │   ├── registry/
│   │   │   ├── createRegistry.js   # Kind-checked registry (app | engine — region kind retired in V2.M2 task 2), dup-rejection
│   │   │   ├── builtins.js         # Imperative registration of every core:* source
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
│   │   │   └── mountApp.js         # Shared <MountedApp> resolver: appRef → registry → render
│   │   ├── routing/                # URL-decomposer router, routes-block matcher
│   │   │   ├── router.js           # RouterProvider (hashchange + Navigation API navigatesuccess), useRoute, useRouteForRegion(region, routesBlock), navigate(href).
│   │   │   ├── matchRoute.mjs      # Pure ESM: matchPattern, matchRoute (most-specific-wins), interpolate, parseHash, readSlot, isValidRoutePattern.
│   │   │   └── useRoute.js         # Re-export
│   │   ├── styles/                 # ThemeProviderHost (engine-pluggable seam, owns DS-neutral density extraction) + WpdsThemeProvider (core-default's contribution; owns WPDS density enum). compileStyles + wpds-defaults snapshot moved to core-default in P1; density.js retired (kernel no longer writes `data-wpds-density` — the real `@wordpress/theme.ThemeProvider` handles attribute emission internally via its `density` prop).
│   │   ├── capabilities/userCan.js # userCan() sync + checkCan() async via /can REST
│   │   ├── config/iconMap.js       # DS-neutral icon registry: registerIcons(table, {fallback}) + resolveIcon(name). Engines populate at module load.
│   │   ├── viewConfig/             # C2 view-config + field-collections client (spec §13 #7-8)
│   │   │   ├── useViewConfig.js    # React hook: useViewConfig(kind, name, variant?, {fallback}) → {config, isLoading}. Inline-snapshot fast path + /wp-admin-shell/v1/view-config REST fallback.
│   │   │   └── mergeFields.mjs     # Pure ref-wins-inline-overrides field merge. Mirror of WP_Admin_Shell_View_Config::merge_fields.
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
| `core:posts` | PostsApp | ✅ | — | DataViews table; `config.postType` |
| `core:simple-editor` | SimpleEditorApp | ✅ | — | Substack-style; title + 9 blocks + auto-save |
| `core:editor` | EditorApp | iframe | — | `post.php?post={id}&action=edit`. Native `@wordpress/edit-post` mount deferred to v2.x — see `SiteEditorApp.js` for blockers. |
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
| `core:site-health` | SiteHealthApp | ✅ | `view_site_health_checks` | `/wp-site-health/v1/tests/{id}` runner |
| `core:site-editor` | SiteEditorApp | iframe | `edit_theme_options` | `site-editor.php` adapter. Native `@wordpress/edit-site` mount deferred to v2.x; five blockers (preferences-store / commands / full-screen CSS / hash-router collisions, edit-site not in BUNDLED_PACKAGES) documented in `SiteEditorApp.js`. |
| `core:appearance` | AppearanceApp | ✅ | — | User-prefs UI driven by `customizable` |
| `core:iframe-fallback` | IframeApp | iframe | — | URL relative to `adminUrl`, chrome hidden via injected CSS |
| System apps | various | — | — | `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-palette`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar`, `core:user-menu` — each shell declares them explicitly in admin.json regions (no v0 normalizer auto-pinning) |
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

## Extension points (spec §13)

Eight extension surfaces, all in place:

1. **Filter merged config.** PHP `apply_filters( 'wp_admin_shell_data', $config )` runs after the cascade resolves; per-origin `wp_admin_shell_data_{origin}` runs during the merge.
2. **Filter per-origin configs.** `wp_admin_shell_data_core` / `_plugin` / `_site` / `_role` / `_user`.
3. **Register a `plugin:*` app.** PHP `wp_admin_shell_register_app( $manifest_or_path )` or convention-path discovery (`{plugin}/apps/{name}/app.json`).
4. **Register a region template.** PHP `wp_admin_shell_register_template( $engine_id, $template_id, $template )` — extends an existing engine's template catalog at runtime. Validates engine exists, template id matches the namespaced pattern, body has a string `role`.
5. **Register an engine.** PHP `wp_admin_shell_register_engine( $manifest_or_path )` or convention-path discovery (`{plugin}/engines/{name}/engine.json`). Engine modules MAY export an optional JS-side `ThemeProvider` field on their `EngineSource` (`src/runtime/registry/source-types.js`) — when present, `ThemeProviderHost` mounts it instead of the WPDS default. Use this to ship an entirely different design system (Material, Tailwind tokens, brand-locked palette) without touching kernel code. Render-time errors in a custom provider trip the host's error boundary and silently fall back to WPDS so the shell still paints. Engine manifests MAY also declare a top-level `default-styles` block (Phase C; see `docs/schemas/admin-engine-v2.json#defaultStyles`) — same shape as admin.json `styles` minus `regions`/`applications`/`branding`. The PHP resolver injects a synthetic `engine` origin between `core` and `plugin` carrying these defaults; admin.json wins on every overlapping key. Use this to ship the engine's visual identity (palette, density, chrome surface bindings) so consuming shells stop having to repeat the rules.
6. **Register a complete shell.** PHP `wp_admin_shell_register_shell( $slug, $admin_json )` for runtime-computed shells. Programmatic registrations win over file-based shells of the same slug; site/role/user origins still merge on top via the same cascade.
7. **Filter a view-config (C2).** Each `(kind, name[, variant])` triple resolves through the 6-origin cascade (via the `viewConfigs` top-level block in admin.json or the app manifest's `viewConfig` baseline), then runs through `apply_filters( "wp_admin_shell_view_config_{$kind}_{$name}", $doc, $kind, $name, $variant )` plus `..._{$variant}` when present. Variant key `_default` represents the unqualified base; variants resolve independently (no implicit parent merge) — CIAB convention preserved. Apps consume via the `useViewConfig(kind, name, variant?, {fallback})` React hook; built-in fallback ships with the app, cascade/filter overrides win. Filter naming mirrors CIAB's `next_admin_entity_view_config_*` with a `s/next_admin_entity_view_config_/wp_admin_shell_view_config_/g` rename for mechanical migration.
8. **Register a field collection (C2).** PHP `wp_admin_shell_register_field_collection( $id, $kind, $name, $fields, $fields_module )` — registers a named field bundle bound to `(kind, name)` (or universal when `name === null`). Contributes through the `plugin` origin so site/role/user overrides can extend or replace via admin.json's `fieldCollections` block. View-configs reference a collection via `fieldsRef`; the resolver merges fields ref-wins-inline-overrides — collection provides the base, inline `fields` shallow-merges per-id, inline-only ids append after the base. `fieldsModule` is reserved for forward-compat; the C2 runtime does not load it (one-time dev warning when declared). Filter `wp_admin_shell_data_plugin` runs after the contribution, so plugin authors can still mutate fields via the regular cascade entry point.

JS-side surfaces:

- `useDirtyState( regionId, isDirty, { blocksNavigation } )` — reports unsaved-changes status; `<NavigationGuard>` honors it across `beforeunload` + Navigation API + hashchange-revert.
- `bindings` block in admin.json — declares `[{shortcut, invoke}]`. `<BindingsConsumer>` wires keystrokes to triggerable apps via the `triggerStore`. Only triggerable regions register their open handlers.
- `useViewConfig( kind, name, variant?, { fallback } )` — reads the resolved view-config triple. Synchronous when the inline `window.wpAdminShell.config` snapshot already carries the triple; falls through to `/wp-admin-shell/v1/view-config` REST for triples registered after page load. Returns `{ config, isLoading }`.

## Manual smoke before tagging

Per `docs/v1-readiness.md`. Required before any v1.0.0-beta.x cut:

1. Cap gating across roles (subscriber → admin) — visual confirmation that `wp-admin-default` matches what wp-admin would surface natively.
2. Cold-mount perf measurement → fill `docs/v1-perf-baseline.md`.
3. a11y: keyboard pass, VoiceOver pass on macOS, axe against rendered DOM.
4. Each bundled shell renders + Cmd+K palette + shell switching + form-save (PHP 8.1+).
5. Notices: snackbar on success, dismissible banner on error.
