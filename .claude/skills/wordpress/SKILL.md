---
name: wordpress
description: Umbrella/index skill for WordPress development. Use when a WordPress task is broad, cross-cutting, or it's unclear which specific WordPress sub-skill applies — this skill maps the task to the right one. Also use for high-level WordPress architecture questions, API-scope lookups (which API lives in which skill), or when you need to coordinate work across multiple sub-skills. When a task clearly fits one sub-skill, defer to it directly. Sub-skills: wordpress-plugin-development, wordpress-blocks, wordpress-block-markup, wordpress-block-themes, wordpress-interactivity, wordpress-core-data, wordpress-dataviews, wordpress-rest-api, wordpress-abilities-api, wordpress-design-system, wordpress-performance, wordpress-phpstan, wordpress-playground, wordpress-blueprint, wordpress-wpcli-ops, wordpress-plugin-directory-guidelines, wordpress-project-triage, remote-data-blocks (plugin-only), gutenberg-contributor.
---

# WordPress

Index skill for the WordPress ecosystem. This file routes unclear or cross-cutting work to the right sub-skill, documents the scope map, and anchors the version baseline.

**Baseline:** WordPress 6.5+; current: 6.9 (released December 2, 2025). Individual sub-skills state their own feature-specific minimums.

## ⚠ How to use this index

1. **Find the sub-skill** in the Quick Route table below.
2. **STOP. Invoke `Skill <sub-skill-name>` before editing code, generating schema, or answering API questions.** Do not proceed from this index alone.
3. **Do not rely on training data** for theme.json fields, block.json schema, Interactivity directives, REST routes, core block names, hook signatures, or any API surface. WordPress ships twice yearly; training data is typically 6–18 months stale and commonly wrong on new fields (e.g. `settings.border.radiusSizes` added WP 6.9 — absent from most training corpora).
4. **Before asserting a field/API does *not* exist**, check the live schema / handbook (`schemas.wp.org/trunk/theme.json`, `developer.wordpress.org/rest-api/reference/`, `make.wordpress.org/core/tag/dev-notes/`). Never make a negative claim from memory.

If a task clearly fits one sub-skill, skip this index entirely and load the sub-skill directly.

## Quick route

| Task | Skill |
|---|---|
| Building or modernizing a plugin (PHP, hooks, CPTs, security, wp.org) | `wordpress-plugin-development` |
| Building or extending a **custom** block (block.json, edit/save, supports, patterns) | `wordpress-blocks` |
| **Authoring content** with core blocks (serialized markup, fixing "invalid content" errors) | `wordpress-block-markup` |
| Building a block **theme** (theme.json, templates/parts/styles, Site Editor) | `wordpress-block-themes` |
| Adding **frontend interactivity** to a block (directives, store, client navigation) | `wordpress-interactivity` |
| Editor-side **data layer**: `@wordpress/data` stores, `core-data` entities, block bindings, `useEntityRecord`, `saveEditedEntityRecord`, undo/redo, `apiFetch` middleware | `wordpress-core-data` |
| Admin list/table/grid UIs with `@wordpress/dataviews` | `wordpress-dataviews` |
| Reading or writing WordPress data over HTTP (`/wp-json/`, custom endpoints, headless) | `wordpress-rest-api` |
| **WordPress Abilities API** (`wp_register_ability`, `wp-abilities/v1`, `@wordpress/abilities`) — WP 6.9+ | `wordpress-abilities-api` |
| Building UI with `@wordpress/components` / WordPress Design System (tokens, components, patterns) | `wordpress-design-system` |
| **Performance** profiling/optimization (autoload, object cache, queries, `wp profile`/`wp doctor`, Server-Timing) | `wordpress-performance` |
| **PHPStan** for plugins/themes (`phpstan.neon`, baselines, WP-specific typing, third-party stubs) | `wordpress-phpstan` |
| Spinning up disposable WP via Playground CLI (`@wp-playground/cli`, version switching, Xdebug) | `wordpress-playground` |
| Authoring **Playground Blueprint JSON** (declarative env setup, `installPlugin`, `runPHP`, `wp-cli` steps, bundles) | `wordpress-blueprint` |
| **WP-CLI ops** (search-replace, db export/import, multisite, cron, automation, `wp-cli.yml`) | `wordpress-wpcli-ops` |
| Reviewing a plugin against the **18 wp.org Plugin Directory Guidelines** (GPL, naming/trademark, trialware) | `wordpress-plugin-directory-guidelines` |
| **Triaging a WP repo** — what kind of project, tooling/test/version detection (deterministic JSON report) | `wordpress-project-triage` |
| Displaying remote-API data in Gutenberg without writing a custom block | `remote-data-blocks` |
| Contributing **to** the Gutenberg monorepo (core contributor workflow) | `gutenberg-contributor` |

## Sub-skill guide

### wordpress-plugin-development
Plugin-level scaffolding: plugin headers, activation/deactivation, CPTs and taxonomies, Settings API, admin menus, `$wpdb`, options, transients, post meta, WP-Cron, REST routes, admin-ajax, i18n, Plugin Check, wp.org distribution. **Load a specialized skill in addition** for deep block-specific work, DataViews UIs, or heavy REST API work — this skill owns the plugin shell around them.

### wordpress-blocks
Custom block development: `block.json`, `edit`/`save`, deprecation, block supports, patterns, variations, bindings and hooks declared *on* blocks, and how blocks consume theme.json.
- **Use it for** building or extending block types.
- **Don't use** for content authoring (`wordpress-block-markup`), for the Interactivity API deep-dive (`wordpress-interactivity`), or for theme.json itself (`wordpress-block-themes`).

### wordpress-block-markup
Writing the serialized block HTML that goes into `post_content`: delimiter format, attribute serialization, CSS class patterns, validation-safe whitespace, `metadata.bindings` for connecting core blocks to data. This skill is for *authoring*, not *building*.

### wordpress-block-themes
Theme-side work: `theme.json` v3, templates, parts, styles (including style variations and section styles), four-origin CSS cascade, Font Library, fluid typography, classic-to-block migration. Consumers of block APIs, not builders of them.

### wordpress-interactivity
Client-side behavior for blocks: directives (`data-wp-*`), stores, `withSyncEvent`, async generators, private stores, client-side navigation via the Interactivity Router. Server-rendered-first; reactivity comes from Preact Signals. Covers async patterns and navigation state-sync (merge vs reset) correctly.

### wordpress-core-data
Editor-side data layer: `@wordpress/data` primitives (`createReduxStore`, `useSelect`, `useDispatch`, thunks, resolvers, `createSelector`, `registry.batch`, scoped `subscribe`), `@wordpress/core-data` entities and hooks (`useEntityRecord`, `useEntityRecords`, `useEntityProp`, `useEntityBlockEditor`), Block Bindings (`registerBlockBindingsSource` / `register_block_bindings_source`, `core/post-meta`, `core/post-data`, `core/term-data`, pattern overrides), `apiFetch` + middleware + `/batch/v1`, `block_editor_rest_api_preload_paths`, undo/redo on `core-data`, `canUser` permissions, sidebar plugins / pre-publish panels, save-lock APIs, async / debounce / Suspense / abort, and migration off `withSelect` / `registerStore` / `source:'meta'` / `core/edit-post` toggles. Owns the four canonical stores (`core` / `core/editor` / `core/block-editor` / `core/preferences`).
- **Use it for** anything that touches editor state, entity reads/writes from JS, or wiring blocks to data via bindings.
- **Don't use** for HTTP-only consumption outside the editor (`wordpress-rest-api`), block scaffolding (`wordpress-blocks`), or frontend interactivity (`wordpress-interactivity`).

### wordpress-dataviews
`@wordpress/dataviews` components for admin list/table/grid UIs: `DataViews`, `DataForm`, `DataViewsPicker`, field definitions, view state, actions, free composition (10 subcomponents), extensibility API. Works in plugins and standalone React apps.

### wordpress-rest-api
The `/wp-json/` API surface: core endpoints, authentication (Application Passwords, cookies+nonce, JWT), `register_rest_route` / `register_rest_field`, `WP_REST_Controller`, batch operations, headless patterns, wp-admin automation. Covers both *consuming* and *extending* the REST API.

### remote-data-blocks
The Automattic/WPVIP Remote Data Blocks plugin: `HttpQuery`, output/input schemas, 4 integrations (Airtable, Google Sheets, Shopify, GitHub), block registration, patterns, hooks. Plugin-specific (requires **WP 6.7+**, PHP 8.1+).

### gutenberg-contributor
Working **inside** the Gutenberg monorepo: package boundaries, tests, Storybook Vite app, contribution workflow, experimental-API policy. **Not** for consuming Gutenberg APIs — use the other skills for that.

### wordpress-abilities-api
WP 6.9+ Abilities API: `wp_register_ability` / `wp_register_ability_category`, `meta.show_in_rest`, the `/wp-json/wp-abilities/v1/*` endpoints, and `@wordpress/abilities` on the JS side. Use whenever you're declaring agent-facing capabilities or diagnosing "ability not visible to client" issues. Pre-6.9 sites need the Abilities API plugin/package.

### wordpress-design-system
WordPress Design System (WPDS) — `@wordpress/components`, `@wordpress/ui`, design tokens, color/spacing/typography presets, component patterns. **Best paired with the WPDS MCP server** for canonical component/token lookup. Use for any UI built within the WP/Gutenberg/WooCommerce/Jetpack ecosystem; skip non-UI concerns (data fetching, i18n) and let the more specific skills handle those.

### wordpress-performance
Backend-only performance work: `wp doctor check`, `wp profile stage|hook|eval`, autoload bloat, persistent object cache, cron storms, remote HTTP calls, and Server-Timing / Query Monitor (headless via REST headers). Includes the WP 6.9 frontend perf wins (on-demand CSS for classic themes, zero render-blocking CSS for default-style block themes, raised inline-CSS limit) so profiling baselines aren't pre-6.9.

### wordpress-phpstan
PHPStan setup for plugin/theme/site repos: `phpstan.neon` paths/excludes, `szepeviktor/phpstan-wordpress` or `php-stubs/wordpress-stubs`, baseline as a migration tool (not a trash bin), WP-specific PHPDoc (`WP_REST_Request<...>`, hook callback `@param` types, array shapes for `$wpdb` results), third-party plugin stubs (`woocommerce-stubs`, `acf-pro-stubs`).

### wordpress-playground
WordPress Playground via `@wp-playground/cli` (Node ≥20.18): `server` (auto-mount plugins/themes), `run-blueprint`, `build-snapshot`, `--wp=`/`--php=` version pinning, `--xdebug` for IDE debugging, browser-only fragment/query-param launches. Ephemeral SQLite-backed — never against production data.

### wordpress-blueprint
Authoring **Playground Blueprint JSON**: top-level shape, shorthands (`login`, `plugins`, `siteOptions`, `constants`), resource types (`wordpress.org/plugins`, `git:directory`, `literal:directory`, `bundled`, `zip`), the full step catalog (`installPlugin`/`installTheme` with `pluginData`/`themeData` not the deprecated zip props, `runPHP` requiring `wp-load.php`, `wp-cli` step with hyphen), bundle layout, and the common-mistake table. Pair with `wordpress-playground` to actually run blueprints.

### wordpress-wpcli-ops
WP-CLI operations on real installs: safe `wp search-replace` sequence (export → dry-run → real → flush), `wp db export/import`, plugin/theme/user/content management, cron debugging, multisite (`--url=` vs `--network`), automation via `wp-cli.yml` and CI. Includes the safety guardrails (confirm env, target the right path/url, back up before destructive ops).

### wordpress-plugin-directory-guidelines
The 18 wp.org Plugin Directory guidelines, GPL compliance tables, naming/trademark rules, trialware/freemium evaluation. Load when reviewing a plugin for wp.org submission, evaluating an upsell flow, checking license headers, validating slugs, or answering "why was this rejected from wp.org". Complements `wordpress-plugin-development` (which builds the plugin) by enforcing the *distribution* rules.

### wordpress-project-triage
Deterministic JSON detector for any WP repo (plugin/theme/block-theme/core checkout/Gutenberg/full site). Run `node ~/.claude/skills/wordpress-project-triage/scripts/detect_wp_project.mjs` first to know what you're working with — kind, tooling (Composer, Node, `@wordpress/scripts`), tests (PHPUnit, Playwright, wp-env), version hints. Most other WP skills reference its output.

## Cross-cutting features — where they live

| Feature | Primary skill | Cross-refs |
|---|---|---|
| **Block Bindings API** (`register_block_bindings_source`, `metadata.bindings`, `core/post-meta` / `core/post-data` / `core/term-data` / `core/pattern-overrides`) | `wordpress-core-data` (`references/block-bindings.md`) | Block-side declaration in `wordpress-blocks`; authoring side in `wordpress-block-markup`; plugin-registration side in `wordpress-plugin-development` |
| **Editor data stores / state management** (`@wordpress/data`, `core-data`, custom Redux stores, `useSelect`/`useDispatch`/`useEntityRecord`, undo/redo) | `wordpress-core-data` | Plugin shell (CPT/meta registration) in `wordpress-plugin-development`; block-attribute declaration in `wordpress-blocks` |
| **`apiFetch` + `/batch/v1` + preload paths** (editor side) | `wordpress-core-data` (`references/rest-integration.md`) | HTTP-only / headless consumption in `wordpress-rest-api` |
| **Block Hooks** (`blockHooks`, `hooked_block_types`, `ignoredHookedBlocks`) | `wordpress-blocks` | Theme-side usage in `wordpress-block-themes`; PHP filters in `wordpress-plugin-development` |
| **REST API routes** (custom endpoints, auth) | `wordpress-rest-api` | Plugin scaffolding in `wordpress-plugin-development` |
| **Interactivity directives + stores** | `wordpress-interactivity` | Block-side opt-in in `wordpress-blocks`; server state registration in `wordpress-plugin-development` |
| **theme.json** | `wordpress-block-themes` | CSS-variable consumer contract for custom blocks in `wordpress-blocks/references/theme-json-integration.md` |
| **Block patterns** | `wordpress-blocks` (registration); `wordpress-block-markup` (authoring) | Theme-bundled patterns in `wordpress-block-themes` |
| **CPTs, taxonomies, post meta** | `wordpress-plugin-development` | Exposing them to blocks via bindings → `wordpress-blocks`; visibility in editor → `wordpress-core-data` |
| **Script Modules** | `wordpress-plugin-development` | Module usage from interactive blocks → `wordpress-interactivity`; `viewScriptModule` declaration in `wordpress-blocks` |
| **Plugin Check / build/release pipeline** | `wordpress-plugin-development` (`references/distribution.md`, `tooling.md`) | Plugin-Directory *policy* review → `wordpress-plugin-directory-guidelines` |
| **wp.org Plugin Directory rules** (GPL, naming, trademark, trialware, freemium) | `wordpress-plugin-directory-guidelines` | Plugin shell that must comply → `wordpress-plugin-development` |
| **Abilities API** (`wp_register_ability`, `wp-abilities/v1`, `@wordpress/abilities`) | `wordpress-abilities-api` | PHP registration shell → `wordpress-plugin-development`; client consumption pattern → `wordpress-core-data` |
| **WPDS / `@wordpress/components`** (Button, Modal, Notice, ToggleControl, Card, ToolbarButton, design tokens) | `wordpress-design-system` | Sidebar plugin / pre-publish panel composition → `wordpress-core-data`; admin list/table UIs → `wordpress-dataviews` |
| **Performance** (`wp doctor`, `wp profile`, autoload, object cache, cron storms, N+1, Server-Timing) | `wordpress-performance` | Run via WP-CLI → `wordpress-wpcli-ops`; env detection → `wordpress-project-triage` |
| **PHPStan / static analysis** (`phpstan.neon`, baselines, WP stubs, hook-callback typing, `WP_REST_Request<...>`) | `wordpress-phpstan` | Plugin-shell PHP being analyzed → `wordpress-plugin-development`; REST endpoint typing → `wordpress-rest-api` |
| **WP-CLI operations** (`wp search-replace`, `wp db`, `wp plugin`, `wp cron`, multisite, `wp-cli.yml`) | `wordpress-wpcli-ops` | Profiling commands → `wordpress-performance`; env detection → `wordpress-project-triage` |
| **Playground (disposable WP env)** | `wordpress-playground` (CLI) + `wordpress-blueprint` (JSON declaration) | Env detection (`@wp-playground/cli` signal) → `wordpress-project-triage` |
| **Project detection / triage** (kind, tooling, tests, version hints, Abilities-API usage, JSON report) | `wordpress-project-triage` | Run before any other skill in an unfamiliar repo |
| **6.9 frontend perf** (on-demand CSS for classic themes, zero render-blocking CSS for default-style block themes, raised inline-CSS limit) | `wordpress-block-themes` (in-skill section) | Profiling baselines → `wordpress-performance` |

## Routing decision tree

Use when the task doesn't map cleanly to a single skill:

1. **Is the deliverable PHP code in a plugin directory?** → start with `wordpress-plugin-development`. If the work inside the plugin is heavy REST, block, or interactivity work, also pull the specific skill.
2. **Is the deliverable a custom block?** → `wordpress-blocks`. Add `wordpress-interactivity` if the block needs frontend JS behavior. Add `wordpress-block-markup` if you're also writing patterns or static content.
3. **Is the deliverable serialized block HTML (content, not code)?** → `wordpress-block-markup`.
4. **Is the deliverable theme files?** → `wordpress-block-themes`.
5. **Is the deliverable an admin screen / list view?** → `wordpress-dataviews` for the component, `wordpress-plugin-development` for enqueueing and page registration, `wordpress-rest-api` for the data source.
6. **Is the deliverable HTTP consumption of a WordPress site (headless, automation, bulk ops)?** → `wordpress-rest-api`.
6a. **Is the deliverable editor-side state management** (custom Redux store, `useEntityRecord`/`useEntityProp`, sidebar plugin reading/writing meta, fixing `useSelect` loops or `null`-forever entity records, wiring a block to post meta via bindings, modernizing off `withSelect`/`source:'meta'`)? → `wordpress-core-data`. Pair with `wordpress-plugin-development` for the PHP `register_post_type` / `register_post_meta` side, with `wordpress-blocks` for the block-attribute declaration.
7. **Does the block need to display data from a remote HTTP API and the user has the Remote Data Blocks plugin available?** → `remote-data-blocks` (short-circuits a lot of custom-block and REST work).
8. **Is the task "fix a bug in Gutenberg" or "add a feature to the block editor itself"?** → `gutenberg-contributor`. Anything about *consuming* editor APIs is one of the other skills.
9. **Is the deliverable a UI built with `@wordpress/components` / WPDS tokens?** → `wordpress-design-system`. Pair with `wordpress-dataviews` for list/table UIs and `wordpress-core-data` for state.
10. **Performance investigation?** → `wordpress-performance`. Pair with `wordpress-wpcli-ops` if you need to run `wp doctor` / `wp profile` and `wordpress-project-triage` to confirm the env.
11. **Setting up PHPStan, fixing PHPStan errors?** → `wordpress-phpstan`.
12. **Need a disposable WP env (Playground)?** → `wordpress-playground` for the CLI; `wordpress-blueprint` for the JSON declaration.
13. **WP-CLI operational task** (search-replace, db ops, multisite)? → `wordpress-wpcli-ops`.
14. **Reviewing a plugin against wp.org Plugin Directory rules?** → `wordpress-plugin-directory-guidelines`. Load alongside `wordpress-plugin-development` when prepping for submission.
15. **Building or consuming Abilities API surfaces?** → `wordpress-abilities-api`.
16. **Unsure what kind of repo you're in?** → `wordpress-project-triage` first.

## Version notes

- **WordPress current:** 6.9 (December 2, 2025). Most features live in 6.5+ baseline.
- **New in 6.9:** `settings.border.radiusSizes` preset array (theme.json); `core/post-data` and `core/term-data` Block Bindings sources; Interactivity API unique-directive IDs (`---name` suffix); router asset auto-loading; `core/section`, `core/math`, `core/accordion`, `core/terms-query`, `core/comments-link`, `core/comments-count`, `core/time-to-read` blocks; Fit Text typography; Block Processor streaming parser; `block_bindings_supported_attributes` filter.
- **Stable in 6.8:** menus private by default in REST (`rest_menu_read_access` filter), speculative loading filters.
- **Stable in 6.5:** Block Bindings API, Interactivity API, `wp_register_block_types_from_metadata_collection`.
- **Stable in 6.4:** Block Hooks (`blockHooks` in block.json).
- The `gutenberg-contributor` skill tracks Gutenberg plugin trunk, not core version.

## When to NOT use this index skill

Skip this skill and go straight to a sub-skill when the task unambiguously fits one of them. The table above exists so Claude can confirm routing without loading this index first. This skill is best when: the user is new to the ecosystem, a task spans multiple skills, or a sub-skill's description didn't match cleanly.

## Verifying claims against upstream

When a sub-skill reference might be stale (WordPress ships major versions twice yearly), verify against these live sources before making definitive claims:

| Surface | Live source |
|---|---|
| `theme.json` schema | `https://schemas.wp.org/trunk/theme.json` |
| `block.json` schema | `https://schemas.wp.org/trunk/block.json` |
| REST API reference | `https://developer.wordpress.org/rest-api/reference/` |
| Block Editor handbook | `https://developer.wordpress.org/block-editor/` |
| Release dev-notes | `https://make.wordpress.org/core/tag/dev-notes/` |
| Per-release dev-notes (e.g. 6.9) | `https://make.wordpress.org/core/tag/dev-notes+6-9/` |
| Release field guide | `https://make.wordpress.org/core/{major}-{minor}-field-guide/` |
| Gutenberg source of truth | `https://github.com/WordPress/gutenberg` (trunk) |

**Rule:** a negative claim ("X isn't in the schema", "Y doesn't support Z") requires a live check. A positive claim from a sub-skill reference is acceptable if the reference is the authoritative location for that surface.
