# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

> Migration history, deprecation windows, release status, and dated provenance live in `CHANGELOG.md`, not here. This file is the canonical description of the codebase as it stands.

## Architecture

Three artifacts drive the shell: `app.json` (per-app intrinsics, ships with app code) + `engine.json` (engine + region templates + modes + slots) + `admin.json` (install decisions only). The kernel reads `admin.json` natively.

**admin.json shape:** `workspace` (engine + default-screen + branding + notices + persistent widgets) + `settings` (registries — `dataViews` 3-axis + `dataFields`) + `screens` (id-keyed map of every screen with `apps[]`, `path`, `slot`, `mode`, `permissions`, `dataViewRef`, `preload`) + `menu` (nested tree with implicit screen binding) + `commands` (id-keyed shortcuts + palette entries) + `styles` (theme.json-shaped) + `preload` + `regions` (escape hatch) + `routes` (escape hatch).

**Region vocabulary:** `role` + `layout` + `platform` + `routing` — one-region-one-app with nested child regions, URL-driven navigation, `routing.route-key` naming the URL slot a region reads, plain `<a href>` navigation, `target` keeping native HTML meaning.

Three engines ship: `core:default` + `core:single-pane` + `core:desktop`. Seven bundled shells in `shells/`.

**Tokens.** DTCG `tokens.json` resolver: PHP `WP_Admin_Shell_Tokens` deep-merges site → theme → plugin → core; pure-ESM `tokensResolver.mjs` flattens + resolves curly-brace aliases + coerces 8 DTCG leaf/composite types.

**Pipeline (PHP → JS).** `WP_Admin_Shell_Resolver` merges six admin.json origins (core / engine / plugin / site / role / user) with restrict-only enforcement + `customizable` filtering. The synthetic `engine` origin sits between `core` and `plugin` and carries the active engine manifest's `default-styles` block; admin.json wins on every overlapping key. The resolver serializes the author-shape doc, stamping each screen's resolved `dataView._resolved` last (`WP_Admin_Shell_Data_View_Config::stamp_screen_data_views`). Cascade is `null`-tombstone-aware at any depth; arrays merge by `id`. The resolved doc feeds `src/runtime/kernel.js`, which derives the runtime surfaces — `engine`, `routes`, `regions`, `default-route`, `commands` — from the blocks + the engine's `defaultRegions` (`src/runtime/compile/`), picks the engine from the registry, renders regions through generic `<Region>` (→ `ModalRegion` | `PersistentRegion`), mounts apps via `MountedApp`, and wraps the tree in `<ThemeProviderHost engineSource isRoot>` so token overrides cascade through the DOM, not global `:root`. Capability gating is four layers: region fast-path → app gate → source-cap floor → REST observation; nav prunes recursively. Permissions are OR-semantic with trust tiers (see `docs/schema-sketch.md`). Default baseline `wp-admin-default` mirrors wp-admin via capability-gated iframe routes + the classic wp-admin menu bridge.

**Workspace as primary entry (0.1.0).** A valid `wp-content/admin.json` is a **partial override** loaded into the `plugin` slot on top of the `wp-admin-default` baseline, which now fills the `core` slot (theme.json model — file declares deltas, baseline supplies the rest). `WP_Admin_Shell_Origin_File` loads + partial-permissively validates the file (decodes to a JSON object; malformed/absent → null → bare baseline). `wp_admin_shell_workspace_active()` (file present OR explicit `wp_admin_shell_active_shell` option, AND the `wp_admin_shell_workspace_enabled` option not explicitly false) gates `WP_Admin_Shell_Hijack`, which at `admin_init` priority 0 takes over the admin root (`/wp-admin/`, `index.php`, bare `admin.php`) — rendering the shell via WordPress's own `admin-header.php`/`admin-footer.php` — and redirects mapped classic screens (`screens[].legacy_path`/`legacy_query`/`legacy_params`) into the workspace (GET-only). The legacy `admin.php?page=wp-admin-shell` entry is removed. Classic stays reachable via `WP_Admin_Shell_Hijack::ENDPOINT_ALLOWLIST` (RPC/install/update/customizer/network, extensible via `wp_admin_shell_hijack_allowlist`), the cap-gated `?classic=1` session cookie (`WP_Admin_Shell_Classic_Mode`), and the persistent **Settings → Workspace** toggle (workspace-side `core:settings-workspace` DataForm + the parallel classic Settings → WP Admin Shell page that writes the same option). `passes_base_gates` bails on `wp_admin_shell_is_chromeless_request()` so iframed classic pages never re-enter the workspace — no nested-shell recursion. Workspace→classic link clicks are caught by the kernel's capture-phase `adminLinkInterceptor` (maps to a workspace route via `window.wpAdminShell.adminRoutes` = `WP_Admin_Shell_Admin_Routes::legacy_map()`, else passes through); in-iframe clicks route up through the chromeless bridge's parent-side `iframeBridge` (target=_parent / _top → iframe navigation, same-origin guarded). The bundled `shells/*` are starter templates copied into `wp-content/admin.json`; `wp_admin_shell_active_shell` survives as a back-compat trigger only. Distribution: `npm run build:zip` (wp-scripts `plugin-zip` + the `package.json` `files` allowlist) produces `wp-admin-shell.zip`. See `docs/alpha-readiness.md`.

**Theming (4 tiers, DS-neutral kernel).** `src/runtime/styles/ThemeProviderHost.js` is the kernel's single seam to the active engine's `ThemeProvider`; absent provider = neutral pass-through wrapper, never a DS-specific default. The WPDS-backed provider (`engines/core-default/WpdsThemeProvider.js`, reused by single-pane) unlocks `@wordpress/theme.ThemeProvider` via the private-API allowlist. Author paths, in order: seeds (`styles.theme.*`) → nested seeds (`styles.regions[id].theme` / `styles.applications[id].theme`) → direct slot overrides (`styles.{color,border,…}`) → DTCG `tokens.json` primitives. Engines may ship a `compileStyles(styles, tokens) → {top, scoped, subtrees}` hook; the host emits the buckets in a sibling `<style>` scoped to `<div data-theme-scope-id>`. **Inside WPDS-flavored app/engine code, never hardcode hex — use `var(--wpds-*)`.** Full mechanics, the token-to-DOM paths, the `@wordpress/ui` layered-CSS gotchas, and the `RegionThemedSubtree` seam live in **`docs/engines-and-design-systems.md`** — read it before touching engine CSS or theming.

**Runtime private-API dep (version-gated):** `@wordpress/ui` overlay components use private APIs whose allowlist the loaded `wp-private-apis` script must include. **WordPress 7.0+ ships that allowlist (and bundles `@wordpress/theme`) in core** — verified against the 7.0 release (`wp-includes/js/dist/private-apis.js` `CORE_MODULES_USING_PRIVATE_APIS` now lists `@wordpress/theme`, `@wordpress/ui`, `@wordpress/dataviews`; consent string unchanged). **WordPress 6.7–6.9 do not** — there only the Gutenberg plugin's `wp-private-apis` override supplies it. The gate is `wp_admin_shell_dependencies_met()` (true on WP ≥ 7.0 via `wp_admin_shell_core_supplies_private_apis()`, else falls back to detecting the Gutenberg plugin); when unmet the hijack stands down + an admin notice fires and the shell renders empty. The plugin no longer declares `Requires Plugins: gutenberg` (a static header can't express "only < 7.0"); the runtime guard handles every version. Note: core 7.0 does NOT externalize `wp-ui`/`wp-admin-ui`/`wp-dataviews` as script handles, so those stay bundled by this plugin (no change).

## Before modifying code

1. Load skills (`/dvdbwmn-wordpress:wordpress` WordPress index skill): `/wordpress-rest-api`, `/wordpress-dataviews`, `/gutenberg-contributor`.
2. Read `docs/wp-admin-shell-design-spec.md` — **master spec.** Authoritative for runtime architecture (region vocabulary, URL routing, capability gating, extension points). When prose and schema disagree, schema wins.
3. Read `docs/schema-sketch.md` — **design doc.** Canonical reference for the admin.json shape (`workspace` / `settings` / `screens` / `menu` / `commands`), permissions OR-semantic with trust tiers, modes catalog with `extends`, 3-tier slot vocabulary, programmatic workspace registration.
4. Read the schemas: `docs/schemas/admin.json`, `admin-app.json`, `admin-engine.json`, `tokens.json` (JSON Schema 2020-12, fully inline-documented).
5. Read `docs/dataview-config.md` — author-facing guide for the dataView primitive (3-axis registry: `kind/name/variant`, `extends` chain, filter hooks, REST endpoints, React hook overloads, field collections).
6. Read `docs/core-default-engine.md` — engine contract worked example for `core:default`: modes catalog, slots, region templates, default-styles.
7. Read `docs/admin-json-api-validation.md` — REST API coverage per app source.
8. Consult `docs/screens/` — 43 tier-2 functional specs covering every wp-admin screen. Source of truth when (re)building any `core:*` app. Gaps section = REST rebuild tickets.
9. Skim `docs/feedback.md` — Inbox/Triaged/In-progress/Done triage log.
10. Read `docs/engines-and-design-systems.md` — kernel-vs-engine-vs-app DS boundary + three contracts (reuse-WPDS, token-bridge, engine-native apps). Authoritative for any work on a non-WPDS engine.
11. Read `docs/desktop-engine-readiness.md` if working on `core:desktop` — manual smoke checklist + known issues + automated test gates.
12. Read the public reference docs in `docs/public/` when authoring or reviewing admin.json / app.json / engine.json files — `admin-json-reference.md`, `app-json-reference.md`, `engine-json-reference.md`. Point at the schemas.
13. For any bundled app, read `src/apps/<id>/app.json#documentation` + `src/apps/<id>/app.md`. The `documentation` block (schema: `admin-app.json#appDocumentation`) is machine-readable: purpose, `rebuilds` (matching `docs/screens/*.md` slug or omitted for shell-only apps), `data.reads/writes` (with `via`: `core-data`/`api-fetch`/`window-global`/`external`/`commands`/`kernel-config`), `url.{reads-slots,writes-slots,navigates}`, `states[]`, `interactions[]`, `a11y`, `constraints[]`, `design-system-leakage[]`. Sibling `app.md` carries the prose — overview, architecture, rebuild guide for a non-WPDS / non-React port, known limitations (must include parity gaps versus the matched `docs/screens/*.md`). Update both whenever touching an app's behavior.
14. Historical / archived docs (skim only when investigating legacy behavior) live under `docs/archive/` — worked examples (`post-editor-sketch.md` surfaces `dirty-state` + `block-navigation-on-dirty` services), prior plans, prior specs, and prior schema notes. Verify any finding against live source before acting.

## Key rules

- **Kernel is DS-neutral.** No `--wpds-*` token, no `@wordpress/components` import, no `@wordpress/ui` import, no `@wordpress/icons` import, no `@wordpress/dataviews` import, no chrome class name (`.wp-admin-shell-nav`, `.wp-admin-shell-toolbar`, etc.) appears in kernel code (`src/runtime/*` outside `src/runtime/engines/`). The kernel owns: cascade resolver, routing, capability gating, region rendering primitive, ThemeProviderHost seam (mounts the active engine's `ThemeProvider` if shipped, else falls back to a neutral pass-through wrapper — never a DS-specific default), bindings, dirty-state, icon **registry** (engines populate), **dynamic-children store** (regions opting into `platform[ 'core:dynamic-children' ]` host runtime-mutated child regions via `useDynamicChildren(parentRegionId)`; kernel renders them through the same `<Region>` recursion as static `region.regions[]`, so per-window routing/dirty-state/triggerStore/cap-gating/theming-scope all key per child region ID — see spec §5.5). Slot/Fill substrate lives in each engine's `Layout.js`, NOT in the kernel — bundled engines wrap their layout in `<SlotFillProvider>` from `@wordpress/components`. Anything DS-specific lives inside an engine. **Test before adding kernel code: would a hypothetical Material Design engine plugin loading alongside this plugin still work?** If your change tightens the kernel to WPDS, it goes in `src/runtime/engines/core-default/` instead. Verified via `tests/runtime/kernel-no-ds-import.test.mjs` — adds a forbidden import to a kernel file and the test catches it in CI. See spec §3 + §4.2 + §13.1.
- **WPDS components: prefer `@wordpress/ui` (next-gen WPDS) over `@wordpress/components` whenever an equivalent exists.** Both are part of WPDS — `@wordpress/ui` is built on Base UI + the WPDS token system (`--wpds-*` CSS variables) and is in `@wordpress/dependency-extraction-webpack-plugin`'s `BUNDLED_PACKAGES`, so it bundles with no extra config. Fall back to `@wordpress/components` as of `0.12.0` for: `RadioControl`, `CheckboxControl`, `SelectControl` (also needed for native `<optgroup>` support), `Spinner`, `Divider` (`__experimentalDivider`), `TextareaControl`, `Modal`, `Item`/`ItemGroup`, `__experimentalGrid`, `FormToggle`, `KeyboardShortcuts`, and `Button as DestructiveButton` w/ `isDestructive` (no critical tone in WPDS 0.12). No custom component libraries.
- **Gutenberg plugin is a hard runtime dependency.** Any `@wordpress/ui` overlay component (`Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, form `Select`/`Autocomplete`) transitively imports `@wordpress/theme`, which calls `__dangerousOptInToUnstableAPIsOnlyForCoreModules` against `wp.privateApis`. WP 6.9 core's allowlist excludes `@wordpress/theme`/`@wordpress/ui`/`@wordpress/dataviews`; the Gutenberg plugin overrides `wp-private-apis` with one that includes them. Without Gutenberg, those modules throw at load and the shell renders empty. Local dev: `gutenberg` is in `.wp-env.json`'s `plugins` array. Production: declare a `Requires Plugins: gutenberg` header (or detect-and-conditionally-render) before shipping.
- Component-mapping cheat sheet (use `@wordpress/ui` left side when available; verified against `@wordpress/ui` 0.12.0 source):
  - `Button` (`tone="brand|neutral"`, `variant="solid|outline|minimal|unstyled"`, `size="default|compact|small"`, `loading`) replaces `@wordpress/components` `Button` (`variant="primary"` → `tone="brand" variant="solid"`; `variant="secondary"` → `tone="neutral" variant="solid"`; `variant="tertiary"` → `tone="neutral" variant="outline"`; `variant="link"` → `variant="minimal"`; `isBusy` → `loading`). **No `tone="critical"` and no `variant="ghost"` in 0.12** — for destructive actions keep `Button as DestructiveButton` w/ `isDestructive`. **No `icon`/`label`/`showTooltip` props** — render `<Icon/>` as a child + `aria-label`, or use `IconButton` (has `tooltip`/`shortcut`).
  - `InputControl` (`label`, `description`, `value`, `onChange(e)`) replaces `TextControl` — onChange takes a DOM event, not the raw value (`e.target.value`).
  - `Stack` (`direction`, `gap="xs|sm|md|lg|xl|2xl|3xl"`, `align`, `justify`, `wrap` — CSS string `"wrap"`, not boolean) replaces `__experimentalVStack` / `__experimentalHStack`. `spacing={N}` legacy prop maps to `gap` token names; `flex` style props map to `align`/`justify` (CSS values, not legacy `alignment`).
  - `Text` (`variant="heading-2xl|xl|lg|md|sm|body-xl|lg|md|sm"`, `render={ <h2/> }` to set the tag) replaces `__experimentalHeading` and `__experimentalText`. **No `weight`/`size`/`color` props** — use `<strong>` child or className for emphasis/muted.
  - `Notice.Root` (`intent="info|warning|success|error|neutral"`) + `Notice.Description` + `Notice.Actions` + `Notice.CloseIcon` replaces `Notice`. No `NoticeList` aggregator — render `notices.map(<Notice.Root/>)`. `SnackbarList` has no WPDS port; keep `@wordpress/components`.
  - `Badge` w/ `intent="success|warning|error|neutral"` replaces hand-rolled status pills.
  - Other namespaced replacements when needed: `Card.*` (Root/Header/Title/Content), `Dialog.*`, `Drawer.*`, `Tabs.*`, `Tooltip.*`, `Popover.*`, `EmptyState.*`, `Collapsible.*`. `Modal` from `@wordpress/components` has no clean Dialog port for complex modals — keep it where migration would be risky.
- All data fetching uses `@wordpress/core-data` (`useEntityRecords`, `useEntityRecord`). No raw `fetch()`.
- Exception: `@wordpress/api-fetch` is used for non-entity operations (media upload, auto-draft creation).
- Always pass `context: 'edit'` on entity queries that need raw field values. Without it, `view` context is used and `title`/`content`/`excerpt` return only `rendered`, not `raw` — edits silently break.
- `deleteEntityRecord('postType', name, id)` without extra args sends posts to trash. Pass `force: true` for permanent delete. Media and taxonomy terms have no trash and require `force: true`.
- No external npm dependencies. Only `@wordpress/*` packages (loaded as externals by `@wordpress/scripts`).
- Config is passed to JS via `wp_add_inline_script` + `wp_json_encode` (not `wp_localize_script` — it coerces types).
- The `iframe:` escape hatch is a feature, not a compromise. The EditorApp and site-editor use it.

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

- **Icon names go through the kernel icon registry.** `src/runtime/config/iconMap.js` is a DS-neutral registry exposing `registerIcons(table, {fallback})` and `resolveIcon(name)`. The active engine populates it at module load — `core:default` ships the @wordpress/icons table in `src/runtime/engines/core-default/icons.js` and calls `registerIcons(iconTable, {fallback: fallbackIcon})` from its `index.js`. App-side imports: `import { resolveIcon } from '../../runtime/config/iconMap'`. `resolveIcon` falls back to the engine-registered fallback and dev-warns once per unknown name. Adding a new icon: edit the engine's `icons.js` (or whichever engine you're authoring), not the kernel registry.

- **DataViews import path.** Use `import { DataViews } from '@wordpress/dataviews/wp';` — NOT bare `'@wordpress/dataviews'`. The bare path risks `Minified React error #130` in plugin contexts. Affected: PostsApp, TaxonomyApp, UsersApp, CommentsApp, PluginsApp.

- **Site title source-of-truth.** Read site title via `useEntityRecord('root','site').record.title` (with `decodeEntities` from `@wordpress/html-entities`). Fall back to `window.wpAdminShell?.siteName` only as last resort.

- **Self-delete guard on bulk user delete.** Filter out the acting user (`window.wpAdminShell?.userId`) before sending REST. Reassign-to-self fails server-side and the bulk request errors silently mid-flight.

- **`@wordpress/components` Item renders `<button>` when `onClick` is defined.** `build-module/item-group/item/hook.mjs` does `as = onClick !== undefined ? 'button' : 'div'` — the `href` prop is silently dropped. `SidebarNavigationItem` forces `as="a"` when href is set so anchor-style navigation (browser-native click, middle-click new tab, right-click "Copy link") works. Same trap exists for any `Item`-based nav: pass `as="a"` explicitly when href is the primary action.

- **`@wordpress/ui` layered-CSS gotchas + region-scoped theming.** `@wordpress/ui` injects component CSS under `@layer wp-ui-*`, and unlayered WP-admin stylesheets stomp it regardless of specificity. There are ~8 recurring traps (Stack `display:flex` stomp, `href` needs `render={<a/>}`, anchor color override, SVG `fill:currentColor`, ellipsis-in-flex, theme-via-tokens-not-rendered-colors) plus the `RegionThemedSubtree` seam (foreground leak + portaled-overlay fixes for nested regions). All documented in **`docs/engines-and-design-systems.md`** — consult it before writing or debugging any engine/chrome CSS. These are engine-private; the kernel stays DS-neutral.

- **Standardized screen chrome lives in the shared `<Page>` component (`src/apps/_shared/Page.js`).** A shell-local port of `@wordpress/admin-ui`'s `Page`: a flex column with an optional header (`title` / `subTitle` / right-aligned `actions` / `badges` / a shell-local `before` left-slot, divided by a bottom border) above a content area. Content is full-bleed by default (a flex column so `DataViews` fills the region); pass `hasPadding` for the themeable inset + own scroll (native / form screens). The prop names deliberately **mirror `@wordpress/admin-ui` `Page`** (`title`/`subTitle`/`actions`/`badges`/`children`/`hasPadding`/`headingLevel`) so a future swap to the upstream component is near-mechanical once WordPress core ships `wp.adminUi` + `wp.styleRuntime` as externals and we move to `@wordpress/ui` 0.14+. We CANNOT consume the real dependency yet: its CSS needs the absent `wp.styleRuntime` external, it requires `@wordpress/ui ^0.14` (we're on 0.12), and its `NavigableRegion` would double the kernel's region landmark. Two upstream features are intentionally dropped here — the `NavigableRegion` landmark (the kernel region already supplies `role`; apps must not double it) and the `SidebarToggleSlot`. Consumers: list apps (`plugins` / `taxonomy` / `media` — full-bleed) and form apps (`profile` / `settings-*` panels — `hasPadding`, via `EntityDataForm`'s `title`). The DS-neutral kernel never imports it (it's WPDS-flavored app space). Pure structure logic is factored into `pageClasses.mjs` and pinned by `tests/runtime/page.test.mjs`. NOT for `editor` / `simple-editor` / `dashboard-widget-classic` (a different nav-bar / in-widget pattern). Engine details + the why-not-the-dependency analysis are inline in `Page.js`.
- **Region content is flush by default — apps own their padding via `wp-admin-shell-app--inset` (or `<Page hasPadding>`).** The `core:default` engine mount (`.wp-admin-shell-region__app`) adds NO padding; content sits flush to the region card edge. The mount is engine-internal and non-addressable (no template hook, no `regions[id].style` path), so a default baked there can't be removed per-app — that's why a blanket padding is wrong. Form / native screens opt into breathing room by adding the shared `wp-admin-shell-app--inset` class (`src/apps/_shared/app.css`) to their root element + `import '../_shared/app.css'`; it pads via `var(--wp-admin-shell--chrome--content--inset, var(--wpds-dimension-padding-2xl))` (author-retunable through `styles.chrome.content.inset`) and sets `box-sizing: border-box`. DataViews list apps (which carry `wp-admin-shell-app--fill`) and iframe apps stay full-bleed — the card's own `border-radius` + clipping `overflow` rounds flush children, so no per-iframe corner handling is needed. The kernel does NOT special-case any app for layout: the old hardcoded `is-fullscreen` app-ID list in `Region.js` was removed. Composers (the `core:settings` host) don't pad their panel slot — each panel self-pads (now via its own `<Page hasPadding>`, which also gives every settings sub-screen a titled header bar) so it renders identically standalone and in-host. When adding a native app that should have padding, add the class; don't reintroduce an engine-level default. Full mechanics in **`docs/engines-and-design-systems.md`**.

- **Engine CSS overriding a property a template sets inline needs `!important`.** Region template `default-style` blocks are applied as INLINE style on the region wrapper, so any `index.css` rule overriding a property a `default-style` also carries silently loses without `!important`. This defeated the v3 **mode region-state** rules across all three engines: `data-mode-hidden`'s `display: none` lost to the chrome templates' inline `display: flex`, and `data-mode-full-width`/`compact` lost to the inline box model — modes emitted the correct `data-mode-*` attributes but never painted (a hidden region still computed `display: flex`). Mode-state display/sizing/padding rules now carry `!important` (matching the `data-app-mounted` mirror-collapse rule). **Exception:** do NOT add `!important` to a property no template sets inline when a sibling rule must out-rank it — `core:desktop`'s dock compact `transform`/`opacity` stays unprefixed so its `:hover`/`:focus-within` reveal wins (`!important` would freeze the dock collapsed). Details in **`docs/engines-and-design-systems.md`** → "Engine CSS that overrides an inline `default-style` property".

- **DataViews uses `@wordpress/dataviews/wp` plus a CSS copy.** Webpack copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`; PHP enqueues `dataviews.css` separately. The `/wp` subpath is the runtime-private export that registers DataViews against `wp.privateApis` correctly. That package CSS paints `.dataviews-wrapper { background-color: var(--wp-dataviews-color-background, #fff) }` — an unset variable hard-codes the list panel **white** over the region card. `core:default/index.css` scopes the override knob to the region mount (`.wp-admin-shell-region__app .dataviews-wrapper { --wp-dataviews-color-background: transparent }`) so the card background shows through; set the *variable*, not `background-color`, so the sticky toolbar's `inherit` follows. Engine-side (DS-specific class), never kernel. Full mechanics + value-tier model in `docs/engines-and-design-systems.md`.

- **Apps don't add their own ARIA landmark element.** Region wrappers already render `<div role={region.role}>` (e.g. `core:sidebar` declares `role: "navigation"` in `engine.json`). An app component nesting its own `<nav>`, `<main>`, `<aside>`, etc. inside doubles the landmark in the a11y tree. NavigationApp dropped its outer `<nav class="wp-admin-shell-nav__landmark">` for this reason.

- **`[aria-current="true"]` is the sole authority for the active state.** Don't also emit a `.is-active` className when an item is the current route. CSS targets `[aria-current="true"]`; the redundant class causes drift when the two get out of sync. SidebarNavigationItem only sets the attribute.

- **Sidebar drill-down state belongs in the URL.** Sub-screens (the `{ screen, items }` shape in nav config) are URL-addressable via the `?screen=<id>` query slot, NOT `useState`. NavigationApp reads `useRoute().params.screen` and writes via a small `navigateScreen(id|null)` helper that preserves the current primary path. Deep-links and refresh survive. Multiple sidebars in one shell would collide on the slot — namespace later (`?nav-{regionId}-screen=…`) if needed. Corollary of the URL-as-state principle (spec §6 / §18).

- **Sidebar internals mirror `@wordpress/edit-site/src/components/sidebar*` class naming, swapping the top-level prefix `edit-site` → `wp-admin-shell`.** That maps `edit-site-sidebar-navigation-{screen,item}` → `wp-admin-shell-sidebar-navigation-{screen,item}`, drilldown indicator class is `__drilldown-indicator` (not `__chevron`), description is a `<div>` not `<p>`. When porting more elements from edit-site, keep the names (and BEM modifiers like `.has-footer` on `__main`) one-for-one — that lets the Gutenberg sidebar source serve as the structural reference.

- **Cascade trust-tier rule for security-sensitive blocks.** Six origins merge in order: `core` → `engine` → `plugin` → `site` → `role` → `user`. Trust tier splits them at the site/role boundary: `core`/`engine`/`plugin`/`site` may add+remove permissions, drop entries via null tombstones, declare any block shape; `role`/`user` are CONSUMER origins and shrink-only — they can REMOVE caps/roles from `screens[].permissions` but never grow the OR-set. The merge engine has three flavors: `merge()` (additive, tombstones no-op + WP_DEBUG notice; used for role/user), `merge_with_tombstones()` (additive but tombstones honored; used for site), `merge_authoritative()` (full structural replace; used for core/engine/plugin). When adding a new top-level admin.json block, ask: is it security-sensitive (gates an action, declares an app, controls capability)? If yes — add the path to `WP_Admin_Shell_Customizable::DENY_PATTERNS` so consumer origins can't write it even with a matching allowlist entry. The four current entries (`screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, `workspace.engine`) are the security gates that survive even author-declared `customizable` allowlists. Trust-tier enforcement on `screens[].permissions` runs in `WP_Admin_Shell_Permissions::enforce_origin_tier()` against the merged baseline before each consumer-origin merge — same place to add new permissions-bearing fields.

- **Entity-CRUD apps wrap dataView labels in in-app `LABELS = { id: __('...') }` tables.** DataView docs ship as locale-agnostic JSON primitives (spec §13 #7); the cascade reaches DataViews with raw English labels regardless of the user's locale. Each entity-CRUD app keeps two small tables — `FIELD_LABELS` and `ACTION_LABELS` — in its `index.js`, keyed by id. `buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`: the table wins for ids the app authored (translation tools see the `__()` literal at module load), the spec wins for ids the app doesn't know (plugin extension columns and actions keep whatever string the cascade supplied). Reference: `src/apps/posts/index.js` `FIELD_LABELS` / `ACTION_LABELS` (PostsApp is the documented prototype). Entity-CRUD apps read the resolved doc via `useDataView(screenId)` (or `useDataView({ kind, name, variant })` for the registry-direct entry point).

- **Entity-CRUD DataViews scaffolding is shared in `src/apps/_shared/dataviews/` — do NOT re-copy it per app.** The six list apps (posts / taxonomy / users / comments / plugins / themes) share `compileEligibility` + `buildFields` / `buildActions` / `VIEW_DEFAULTS` / view-resync `useEffect` / selection wiring instead of each carrying a byte-identical copy. The scaffolding lives in app space, not `src/runtime/`, because it imports `@wordpress/dataviews` + `@wordpress/components` + `resolveIcon` (the kernel must stay DS-neutral). The harness: `compileEligibility.mjs` (pure), `buildFields.mjs` (`buildFields(specs, { labels, renderers, elementFallbacks })` + `elementsFromLabels`; `elementFallbacks: { status: … }` covers the status-column enum), `buildActions.js` (`buildActions(specs, { labels, callbacks, modals, eligibilityOverrides })` — `modals[id]` wins → `RenderModal`, else `callbacks[id]` → `callback`; `eligibilityOverrides[id]` beats the declarative `eligibleWhen`), `useEntityDataView.js` (owns `view` state seeded from `VIEW_DEFAULTS` + resolved `defaultView`, the resync `useEffect` keyed `[screenId, ...resyncKeys]`, **title-dedup** of the returned `view`, and `selection`), and `createBulkConfirmModal.js` (the destructive-confirm `RenderModal` factory — `Promise.allSettled` over `mutate`, with `getMessage`/`confirmLabel`/`onSettled`/`filterItems`/`isConfirmDisabled` injected; users' self-delete guard rides `filterItems`). Each app keeps only its entity-specific bits (record→display mapping, `view`→REST query translation, mutation callbacks, field renderers, `FIELD_LABELS` / `ACTION_LABELS`). Pure helpers are pinned by `tests/runtime/dataviews-shared.test.mjs`.

- **Single-record edit forms use `@wordpress/dataviews` `DataForm`, not hand-rolled controls.** profile, the taxonomy term modal, and the reading/writing/discussion settings panels render `DataForm` (`data` = `editedRecord` / local state, `onChange` = `edit` / `setData` — DataForm's `onChange` returns the same partial shape `edit` wants). Shared shell in `src/apps/_shared/forms/`: `EntityDataForm.js` (`useEntityRecord` + null-guard spinner + `DataForm` + Save button; pass `entity` / `fields` / `form` / `messages`), `useEntitySave.js` (the try/catch → success-snackbar / error-notice save handler), `eventValue.mjs` (`e.target.value` for `@wordpress/ui` controls that still need hand-rolling). DataForm value-mapping idioms: `open`/`closed` ↔ boolean via `getValue`/`setValue`; string ↔ int via the same; conditional fields via `isVisible(item)`. **`settings-general` stays hand-rolled** (+ shared helpers) — its Language/Timezone `<optgroup>` selects and date/time preset-or-custom radio don't fit DataForm's flat field model. **Full-screen forms wear `<Page>` chrome** (see the `<Page>` bullet): `EntityDataForm` renders inside `<Page title hasPadding>` when given a `title` (the standalone/settings-panel case) and falls back to a plain inset block when `title` is omitted (embedded/modal use). The Save button stays at the bottom of the form **content** — it is NOT a `Page` header action. The form's `className` (e.g. a `max-width`) rides the form body, not the `Page` root, so the full-width header bar isn't constrained. Hand-rolled `profile` / `settings-general` / `settings-workspace` follow the same shape: `<Page title hasPadding>` wrapping the field `Stack` + bottom Save.

- **`wp_admin_shell_data` core callback priorities are documented.** The shell ships two callbacks on the post-cascade filter: `WP_Admin_Shell_Menu_Items::bind_screens` at priority **5** (resolves menu items → screens) and `WP_Admin_Shell_Data_View_Config::inject_app_baselines` at priority **6** (folds app `dataView` baselines into resolved screens). Order matters — baselines attach to screens that already exist, so screens-first. Plugin authors contributing screens, menu items, or dataView entries via filters should prefer the per-origin `wp_admin_shell_data_{origin}` hooks at priority 5 — those fire before the merge + before either of the above callbacks. See `docs/schema-sketch.md` for the filter-ordering contract.

- **Menu screen-binding dedupe is shallowest-wins.** `bind_screens` runs a pre-pass over the merged menu tree: if the same screen id appears at multiple depths (e.g. an override declares `menu.profile` at the top level while the baseline ships it nested at `menu.users.items.profile`), the shallowest occurrence survives and the deeper duplicates are dropped. Only screen-bound ids (keys matching a resolved screen) participate — manual menu items with explicit `href`/`label` and a distinct id are never deduped. Authors who want a screen pinned in two surfaces (e.g. main nav AND a quick-access shortcut menu) declare the second entry under a different id with an explicit `href`, which skips the binding and the dedupe.

- **Entity-CRUD apps gate DataViews on `records !== null`.** Each of the six entity-CRUD apps renders a centered `<Spinner/>` while `useEntityRecords` is still resolving (records=null) and only mounts `<DataViews/>` once the first response arrives. `isLoading={isResolving}` on DataViews alone isn't enough — there's a moment between first render and the resolver kicking off where `isResolving` is still false AND `records` is null AND `data=[]`, and DataViews' empty-state renders. The Spinner gate covers that window; DataViews handles its own loading state for subsequent filters / pagination.

- **A shell that redeclares a `settings.dataViews` triple wins OUTRIGHT — partial redeclaration silently drops app-baseline keys.** `inject_app_baselines` injects an app's `app.json#dataView` baseline (with its `mediaField`, full field defs, field flags, actions) **only when nothing in the cascade already declared that `(kind, name, variant)` triple** — declared triples are authoritative with **no deep-merge**. So if a bundled shell or admin.json carries a *leaner* copy of the triple, the app baseline is skipped entirely and any key the shell omitted is gone from the resolved doc. This bit `themes`: `wp-admin-default.json` redeclared `root/theme/_default` without `defaultView.mediaField`, so the DataViews grid found no media field (`rendersMediaField` falsy) and rendered the gray placeholder for every theme — the screenshot renderer never ran (fixed in `c9a3708`). When a shell redeclares an entity-CRUD app's triple, mirror the app's `app.json` baseline **completely** (every field def + `defaultView.mediaField`/`titleField`/`sort`), or don't redeclare it at all and let the baseline inject. Same trap for all six list apps.

- **Workspace links never bypass the admin-link interceptor.** Navigate within the shell with the router (`navigate()` / `<a href="#/route">`) and link to classic wp-admin with a real `<a href="/wp-admin/...">` — never `window.location.assign('/wp-admin/...')`. The capture-phase `src/runtime/navigation/adminLinkInterceptor` only sees anchor clicks: it maps a `/wp-admin/...` href to a workspace route (via `window.wpAdminShell.adminRoutes`) or lets it through, and a programmatic `location` assignment skips that logic entirely (full reload out of the workspace). The classic-mode toggle (`?classic=1|0`) and RPC endpoints are deliberately passed through; new full-page escape hatches should ride the same `<a href>` path so the interceptor's allowlist governs them. A classic screen that should round-trip into the workspace declares `legacy_path` (+ optional `legacy_query`/`legacy_params`) on its screen so both the JS interceptor and the PHP redirect (`WP_Admin_Shell_Hijack`) agree.

- **Route `config` keys must spell exactly the key the app reads — there is no schema enforcement to catch a mismatch.** `useRouteForRegion` passes `interpolate(matched.config, matched.params)` to the app: only keys the screen's `config` block declares survive, and the app's `config-schema` is stored but never validated at mount (`mountApp.js` / `Region.js` don't consult it). So a screen that captures `/posts/{id}/edit` must write `"config": { "id": "{id}" }` because `EditorApp` reads `config.id` — writing `"postId": "{id}"` leaves `config.id` undefined, `Number(undefined)` is `NaN`, and the app's `! postId` loading guard never clears: **stuck spinner, no error**. This bit the default shell post/page-edit screens (fixed by aligning to `id`; `single-pane-demo.json` was already correct). When wiring a route to an app, read the app's `index.js` for the `config.*` keys it consumes and match them exactly; don't trust the route-param name or the prose docs.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
npm run lint:js  # eslint via wp-scripts
npm run lint:ts  # tsc --noEmit; type-checks the core:desktop engine sources
```

TypeScript is scoped to `src/runtime/engines/core-desktop/**` + `tests/engines/core-desktop/**`. `tsconfig.json`'s `include` is intentionally narrow — the rest of the repo stays JS/JSDoc. Emission is handled by `@wordpress/babel-preset-default` (which already pulls in `@babel/preset-typescript`) inside `wp-scripts build`; `tsc --noEmit` runs as the type-check safety net. Test scripts under `tests/engines/core-desktop/*.ts` execute via Node's native type-stripping (`node --experimental-strip-types`), no compile step required.

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

All suites run before merge.

```bash
# Node
npm run test:schema      # Ajv: admin + admin-app + admin-engine + tokens sweeps (shells / manifests / fixtures)
npm run test:parity      # WPDS slot-list drift detector
npm run test:runtime     # pure-ESM runtime modules (resolveRegion / validateRegion / routing / dataView / modes / build-runtime-config / theme-provider-host / kernel-no-ds-import / admin-link-interceptor / iframe-bridge / …)
npm run test:engines     # TS WindowManager + snap + compileStyles + dockRailRegistry (core:desktop engine)

# PHP — wp-env CLI container
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php              # author-shape assertions: workspace/screens block presence, screen primary-app validity, unique paths, default-screen names a real screen
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-tokens-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-engine-defaults-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php          # screen + menu capability gating, OR-semantic cap/role eval, monotonic role-walk, per-role user fixturing
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-chromeless-bridge-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-rest-tests.php      # /data-view screen-scoped permission floor (subscriber 403 on admin-only screens, 404 on unknown screen, 401 logged-out, triple-keyed lookups keep logged-in floor)
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-mode-resolution-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-classic-menu-bridge-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-preload-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-menu-route-shims-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-appearance-menu-tests.php       # issue #121: Appearance-menu prune by theme support (block-theme keeps Editor / classic keeps Customize+Widgets+Menus, Background/Header gated on add_theme_support) + reusable workspace.theme-support block-theme signal stamped pre-bind_screens
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-security-cascade-tests.php    # trust-tier enforcement on screens[].permissions + null-tombstone gating (incl. ignored-consumer-tombstone no-pollution) + customizable per-field walker w/ hardcoded deny-list + block list-shape preservation (commands[]/preload[]/routes[]/screens[].apps[]) + is_safe_href protocol-relative reject incl. whitespace-leading (incl. form-feed) and backslash variants
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-dashboard-widgets-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-settings-shims-tests.php       # issue #106: register_setting(show_in_rest) shims for home/users_can_register/default_role + posts_per_rss/rss_use_excerpt, and rest_pre_update_setting routing manual UTC offset → gmt_offset
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-alpha-trigger-tests.php       # wp-content/admin.json override: partial-permissive load, baseline-in-core merge, workspace_active truth table, mtime cache signal
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-alpha-routing-tests.php       # workspace hijack decision (root-entry / allowlist / context guard), classic-mode cookie + admin-bar node, classic→workspace legacy-redirect mapping, runtime private-API dependency version gate (WP ≥ 7.0 supplies the allowlist in core; < 7.0 falls back to the Gutenberg plugin)
```

**Pure-JS runtime modules go in `.mjs` files** so node test scripts (`tests/runtime/*`) can `import()` them directly without a webpack/jest harness. Webpack's default `resolve.extensions` (from `@wordpress/scripts`) does NOT include `.mjs`, so importing a `.mjs` module from app code requires the explicit extension at the import site (e.g. `import { resolveRegion } from './regions/resolveRegion.mjs'`). Convention applies only to side-effect-free utility modules; React components stay `.js`.

`run-shape-tests.php` walks every bundled shell through the resolver and asserts author-shape invariants (`workspace` + `screens` present; each screen declares a valid primary app via shorthand `app` or `apps[0]`; screen paths unique; `workspace.default-screen` names a real screen). Runtime-surface synthesis (regions/routes/default-route/commands) lives JS-side and is covered by `tests/runtime/build-runtime-config.test.mjs`. Runtime React-component smoke (JSDOM) is a pending gap — see `CHANGELOG.md`.

Test layering matches `WP_Theme_JSON_*Test`'s pattern: schema validation, fixture-driven unit, end-to-end shape, plus pending JSDOM mount. Add a fixture before fixing the next runtime-reader bug — never in the fix commit.

## Webpack externals

`webpack.config.js` extends `@wordpress/scripts` defaults with one `copy-webpack-plugin` step copying `node_modules/@wordpress/dataviews/build-style/style.css` → `build/dataviews.css`. The dep-extraction plugin handles the rest — `@wordpress/dataviews` and `@wordpress/ui` are in upstream `BUNDLED_PACKAGES` and bundle themselves; everything else externalizes to `wp.*`.

**Past failed workaround — don't repeat:** bundling `@wordpress/private-apis` to control the allowlist creates a *separate registry* from runtime `wp.privateApis`. `@wordpress/dataviews` (also bundled) then fails to `unlock()` objects locked by `wp.components` → `"Cannot unlock an object that was not locked before"`. Gutenberg plugin overriding `wp-private-apis` is the only working answer.

**Code-split chunks.** `src/runtime/registry/builtins.js` registers every non-system app with `load: () => import(/* webpackChunkName: "app-<id>" */ '../../apps/<id>')`. Webpack emits one `build/app-<id>.js` per app + auto-extracts shared deps into vendor chunks (`build/<numeric-id>.js`). Chunk-loading uses `publicPath: 'auto'` (webpack 5 default) — the runtime infers the chunk base URL from `document.currentScript.src` of the boot `index.js`, so no PHP-side `__webpack_public_path__` injection is needed as long as the boot script enqueue path stays under `build/`. CSS for lazy apps emits as sibling `build/app-<id>.css` files and is auto-injected by MiniCssExtractPlugin's runtime when the JS chunk loads — no PHP enqueue needed per-app. Bundle-size numbers in `docs/perf-baseline.md`.

## Project structure

Skeletal top level (full file-by-file annotations + the application-source table in **`docs/code-map.md`**):

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point
├── webpack.config.js        # Copies dataviews CSS to build/
├── shells/                  # 7 bundled admin.json configs (wp-admin-default + 6 demos)
├── includes/                # PHP
│   ├── *-rest.php           # REST controllers (can / prefs / data-view / field-collections)
│   ├── cascade/             # Resolver, merge, customizable, cache, permissions, modes, data-view-config, classic-menu-bridge, preload, menu-items, admin-routes
│   └── origins/             # core origin baseline
├── src/
│   ├── index.js / index.css # Entry + bootstrap CSS (~10 lines)
│   └── runtime/             # DS-neutral kernel
│       ├── kernel.js, kernel-context.js
│       ├── registry/        # createRegistry (eager Component XOR lazy load), builtins, source-types
│       ├── engines/         # core-default / core-single-pane / core-desktop (each: index.js + Layout.js + engine.json + index.css)
│       ├── regions/         # Region.js, resolveRegion.mjs, validateRegion.mjs, platformServices.mjs, mountApp.js
│       ├── routing/         # router.js, matchRoute.mjs
│       ├── styles/          # ThemeProviderHost + themeScope.mjs
│       ├── capabilities/, config/iconMap.js
│       ├── dataView/        # useDataView, hydrateInline.mjs, mergeFields.mjs
│       ├── modes/           # resolveMode.mjs, useMode.js
│       └── shell-switching.js
│   └── apps/<id>/           # one dir per app: index.js + app.json (+ documentation block) + app.md + optional index.css
├── tests/                   # php / parity / runtime / schema / engines
├── scripts/snapshot-wpds.mjs
├── build/                   # webpack output (gitignored)
└── docs/                    # spec, schemas, code-map, engines-and-design-systems, screens, archive
```

Per-app helper used by exactly one app colocates in that app's dir; promote to a shared location only when a second consumer appears.

## Application sources

26 bundled apps under `src/apps/` — `core:posts` / `simple-editor` / `editor` (iframe) / `media` / `taxonomy` / `profile` / `users` / `comments` / `settings` (composable host) / `settings-general` / `settings-writing` / `settings-reading` / `settings-discussion` (standalone native panels, also imported by the host) / `dashboard` / `plugins` / `themes` / `tools` / `site-health` / `site-editor` (iframe) / `appearance-preferences` / `iframe-fallback`, the system apps (`navigation`, `site-hub`, `toolbar-actions`, `command-palette`, `preview-pane`, `notices-banner`, `notices-snackbar`, `user-menu`), the dashboard host + example widgets, and the `core:desktop-*` engine apps. The six entity-CRUD list apps (posts / taxonomy / users / comments / plugins / themes) are dataView consumers sharing `src/apps/_shared/dataviews/` scaffolding (see Key rules).

Full table — components, native/iframe, cap floors, per-app behavior, `core:simple-editor` block list — in **`docs/code-map.md`**. Per-app contract in each app's `app.json#documentation` + `app.md`. Desktop apps in **`docs/desktop-engine-readiness.md`**.

## Navigation

Navigation reads the resolved `menu` tree (engine-agnostic IA — nested items keyed at every depth). The `core:navigation` app is a **dispatcher**: it orders + prunes the tree once (via the pure, DS-neutral `src/runtime/menu/menuTree.mjs` helpers — `orderTree`/`pruneMenu`/`hashPrimary`/etc., node-importable, no `window`), then hands the shaped tree to the renderer the active engine names via its `engine.json` `menu-renderer` field. `buildRuntimeConfig` stamps `menu-renderer` onto the runtime config; dispatch resolves the renderer id through the **kernel menu-renderer registry** (`src/runtime/config/menuRendererRegistry.js`, mirror of `iconMap`: DS-neutral, holds opaque Component refs, first-write-wins). Renderer components receive `{ items, currentPrimary, navConfig }`. Bundled + engine-owned renderers `registerMenuRenderer(id, Component)` via direct ESM import at module load (race-free); `plugin:*` renderers register through `window.wpAdminShell.registerMenuRenderer` (published in `src/index.js`).

- **`sidebar-drilldown`** (`core:default`, default fallback when the field is absent): items with `items` become drilldown nodes; clicking slides into a sub-screen with a back link. Honors `config.collapsed` (icon rail). Bundled in `core:navigation` (`_renderers/SidebarDrilldownRenderer.js`).
- **`sidebar-tree`**: items with `items` become expandable in-place tree nodes (auto-expand active ancestors; expand-state is local `useState`, NOT URL). Bundled (`_renderers/SidebarTreeRenderer.js`).
- **`dock`** (`core:desktop`): rendered by the separate `core:desktop-dock-app`, **not** via `core:navigation` — the engine field is declarative intent only; no `dock` renderer is registered in the nav registry.
- **`drawer`** (`core:single-pane`): collapsible accordion sections. Registered from the **engine module** (`engines/core-single-pane/DrawerRenderer.js`), self-contained (depends only on kernel `iconMap`/`menuTree` + WPDS) so it travels with the engine when it's extracted to a plugin.
- **`none`**: `core:navigation` renders nothing — engine drives nav through `regions`/`routes`.

The PHP entry point `wp_admin_shell_register_menu_renderer( $renderer_id, $args )` (spec §13 #15; `WP_Admin_Shell_Menu_Renderers`) declares a `plugin:{slug}/{name}` id + the `$args['script']` handle that registers the component, and enqueues the script on the shell page. **Timing caveat:** the kernel mounts synchronously, so loose plugin-script registration can race the first paint — robust support needs a published kernel import surface (tracked in `docs/feedback.md`, the same gap blocking `core:single-pane`/`core:desktop` engine extraction).

Item key matching a screen id implicitly binds the item to that screen — `label`/`icon`/`permissions` flow through. Items without a screen binding declare their own `label`/`icon`/`href`/`separator: true`. Drill-down children do NOT inherit parent icon — each item explicit.

**Drilldown state in URL slot `?screen=<id>`** (NOT `useState`). NavigationApp reads `useRoute().params.screen` and writes via `navigateScreen(id|null)`. `__root` sentinel = user explicitly closed via back button. Path-based inference reopens drilldown when URL primary matches a child's href.

Screens support slide animations (0.14s CSS keyframes) and focus restoration after back navigation. The sidebar internals mirror `@wordpress/edit-site/src/components/sidebar*` class naming (prefix `edit-site` → `wp-admin-shell`) — see Recurring patterns above for the convention.

**Classic wp-admin menu bridge** ingests every third-party plugin's `add_menu_page()` / `add_submenu_page()` registrations into both the `screens` block AND the `menu` tree automatically. Yoast SEO, Advanced Custom Fields, WooCommerce extensions, etc. surface in the shell's menu without writing a single `wp_admin_shell_register_menu_item()` call. The bridge walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` at `wp_admin_shell_data_plugin` priority 6 and synthesizes `screens[ingested-<slug>]` + `menu.ingested.items[<id>]` entries.

## Multi-area layout

Multi-app screens declare multiple apps inside engine-declared slots via `screens[id].apps[]`. One app receives the URL slot via `routing.mode: "mirror"`; the rest are static layout decorations.

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

The compiler synthesizes route configs for each `apps[]` entry, slotted into the appropriate URL slot. Entries with a `slot` emit `@<slot>/<path>` slot-namespaced routes; engine regions declaring `routing.route-key: "<slot>"` resolve them via the slot resolution mode (`mirror` = synthesizes slot value as `@<route-key><primary>` from the URL primary path; `query` = reads `?<key>=...` URL query param). Mirror-mode regions emit `data-app-mounted="true|false"` so engine CSS can collapse empty containers.

App-level `contentWidth` / `preview` config keys are also honored as a decoration escape hatch; new shells should use the multi-app shape above.

## Shell switching

The active shell config is stored in the `wp_admin_shell_active_shell` option (registered with `show_in_rest`). Under the 0.1.0 file-trigger model, `wp-content/admin.json` wins over the option, so the user-menu switcher and `switchShell()` JS are gated on `window.wpAdminShell.workspaceFileActive`: the switcher hides + `switchShell()` throws when a file override is present (writing the option would be a silent no-op). Switching paths when no file is present:
- User-menu dropdown — only when more than one bundled shell sets `user-switchable: true` (saves via `POST /wp/v2/settings`, then reloads).
- `window.wpAdminShell.switchShell(slug)` — same path, exposed for command-palette / programmatic use.

## Extension points (spec §13)

Fifteen surfaces, all in place. Spec §13 + `docs/public/{admin,app,engine}-json-reference.md` are canonical; this is the index.

| # | Surface | Entry point |
|---|---|---|
| 1 | Filter merged config | `apply_filters( 'wp_admin_shell_data', $config )` (post-cascade); per-origin during merge |
| 2 | Filter per-origin configs | `wp_admin_shell_data_{core,plugin,site,role,user}` |
| 3 | Register a `plugin:*` app | `wp_admin_shell_register_app( $manifest_or_path )` or `{plugin}/apps/{name}/app.json` |
| 4 | Register a region template | `wp_admin_shell_register_template( $engine_id, $template_id, $template )` |
| 5 | Register an engine | `wp_admin_shell_register_engine( … )` or `{plugin}/engines/{name}/engine.json`. May ship JS `EngineSource.ThemeProvider` + `engine.json#default-styles` (synthetic `engine` origin; admin.json wins overlaps) |
| 6 | Register a complete shell | `wp_admin_shell_register_shell( $slug, $admin_json )` — programmatic wins over file-based of same slug |
| 7 | Filter a dataView config | `wp_admin_shell_data_view_config_{kind}_{name}[_{variant}]` per `(kind, name, variant)` triple; consume via `useDataView()` |
| 8 | Register a data-field collection | `wp_admin_shell_register_data_field_collection( $id, $kind, $name, $fields, $fields_module )`; admin.json `settings.dataFields` overrides; `fieldsRef` merges ref-wins-inline |
| 9 | Declare REST preloads | `preload[]` block (string path or `[path, method]`); additive across origins, deduped, hydrated via `rest_preload_api_request` on `wp-api-fetch` |
| 10 | Register a nav menu item | `wp_admin_shell_register_menu_item( $id, $args )` (`to`/`label`/`icon`/`badge`/`parent`/`parent_type`/`position` + shell's `region`/`capability`); priority 5; dup id → `WP_Error` |
| 11 | Register an admin route | `wp_admin_shell_register_admin_route( $path, $args )` (`app`/`config`/`static_data`; `gc_time` ignored); priority 5; path `^/[A-Za-z0-9_/{}\-*]*$` |
| 12 | Contribute a cache-invalidation signal | `wp_admin_shell_cache_signals` filter — hook it if you hold static state (vs defensive `WP_Admin_Shell_Cache::flush()`) |
| 13 | Register a dashboard widget | `wp_admin_shell_register_dashboard_widget( $id, $args )` — override-only or standalone; admin.json `dashboardWidgets[id]` wins, then `composeWidgets()` per-property over manifest. Widgets are apps (4-layer cap gating applies) |
| 14 | Filter classic-menu-bridge skip-list | `wp_admin_shell_classic_menu_core_slugs` — request-scoped memo (`…Bridge::reset()` in tests); bridge synthesizes `screens[ingested-<slug>]` + `menu.ingested.items[]` at priority 6 |
| 15 | Register a menu renderer | `wp_admin_shell_register_menu_renderer( $renderer_id, $args )` (`WP_Admin_Shell_Menu_Renderers`) — global `plugin:{slug}/{name}` id (core ids reserved) + `$args['script']` handle enqueued on the shell page; the script calls `window.wpAdminShell.registerMenuRenderer(id, Component)`. An engine names a renderer via `engine.json` `menu-renderer`; `core:navigation` dispatches on it (component props `{ items, currentPrimary, navConfig }`). No cache signal (registration doesn't alter the resolved tree). Loose-script timing caveat per the Navigation section |

JS-side surfaces:

- `useDirtyState( regionId, isDirty, { blocksNavigation } )` — reports unsaved-changes status; `<NavigationGuard>` honors it across `beforeunload` + Navigation API + hashchange-revert.
- `bindings` block in admin.json — declares `[{shortcut, invoke}]`. `<BindingsConsumer>` wires keystrokes to triggerable apps via the `triggerStore`. Only triggerable regions register their open handlers.
- `useDataView( screenIdOrTriple, { fallback } )` — overloaded: pass a screen id string for per-screen lookup, or a `{ kind, name, variant? }` object for registry-direct lookup. Synchronous when the inline `window.wpAdminShell.config` snapshot already carries the resolved doc; falls through to `/wp-admin-shell/v1/data-view?screen=<id>` or `/wp-admin-shell/v1/data-view?kind=X&name=Y&variant=Z` REST for entries registered after page load. Returns `{ config, isLoading }`.

## Manual smoke before tagging

Required before a release cut:

1. Cap gating across roles (subscriber → admin) — visual confirmation that `wp-admin-default` matches what wp-admin would surface natively.
2. Cold-mount perf measurement → fill `docs/perf-baseline.md`.
3. a11y: keyboard pass, VoiceOver pass on macOS, axe against rendered DOM.
4. Each bundled shell renders + Cmd+K palette + shell switching + form-save (PHP 8.1+).
5. Notices: snackbar on success, dismissible banner on error.
