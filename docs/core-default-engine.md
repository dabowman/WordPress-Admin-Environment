# core:default — engine.json v3 sketch

Working draft. Shows how the flagship engine declares its `modes` catalog, alongside the v2 surface (region templates, honored platform services).

## Top-level shape

```json
{
	"$schema": "https://schemas.wp.org/admin-engine/v3.json",
	"id": "core:default",
	"version": 3,
	"title": "WP Default",
	"description": "Sidebar + toolbar + content + preview. The flagship admin chrome.",

	"designSystem": "@wordpress/ui",

	"specializes-roles": [ "main", "navigation", "banner", "complementary" ],

	"honored-platform": [
		"core:modal",
		"core:dismiss-on",
		"core:autofocus-target",
		"core:triggerable",
		"core:persists-across-navigation",
		"core:dirty-state",
		"core:block-navigation-on-dirty",
		"core:trigger"
	],

	"default-arrangement": "wp-chrome",

	"script": "wp-admin-workspaces-engine-default",
	"style":  "wp-admin-workspaces-engine-default-css",

	"menu-renderer": "sidebar-drilldown",

	"modes": {
		"default":  { /* see below */ },
		"focus":    { /* see below */ },
		"takeover": { /* see below */ },
		"modal":    { /* see below */ }
	},

	"templates": {
		"core:sidebar":     { /* role: navigation, persistent */ },
		"core:toolbar":     { /* role: banner */ },
		"core:site-hub":    { /* role: banner */ },
		"core:content":     { /* role: main, routable */ },
		"core:preview":     { /* role: complementary, routable */ },
		"core:palette":     { /* role: dialog, modal slot */ },
		"core:notices":     { /* role: status, persistent */ }
	},

	"default-styles": { /* WPDS theme seeds, chrome bindings */ }
}
```

## New v3 fields

### `menu-renderer`

Names the strategy the engine uses to render the resolved `menu` block. Required for any engine that wants screens to appear in a menu. `core:default` declares `"menu-renderer": "sidebar-drilldown"`.

**How it drives rendering.** `buildRuntimeConfig` copies the active engine's `menu-renderer` onto the runtime config. The bundled `core:navigation` app reads it, orders + prunes the `menu` tree once, then dispatches to the renderer registered under that id (kernel registry `src/runtime/config/menuRendererRegistry.js`). Built-in and plugin renderers resolve through the identical path — that's the seam a non-WPDS engine plugs into without touching kernel code.

| Value | Behavior | Owner |
|-------|----------|-------|
| `sidebar-drilldown` | Items render in a sidebar nav; `parent` produces a slide-in sub-screen with a back link. Honors `config.collapsed` (icon rail). | `core:navigation` (bundled) |
| `sidebar-tree`      | Items render in a sidebar nav as an expandable in-place tree; branches seed open when they contain the active route. | `core:navigation` (bundled) |
| `dock`              | Items render as tiles in a dock rail; `parent` produces a folder. | `core:desktop` — rendered by its own `core:desktop-dock-app`, **not** via `core:navigation`. The field on `core:desktop` is declarative intent; a workspace that mounts `core:navigation` under the desktop engine sees no `dock` renderer registered and falls back to `sidebar-drilldown`. |
| `drawer`            | Items render in a collapsible-accordion drawer; `parent` produces a section. | `core:single-pane` — registered from the engine module (`DrawerRenderer.js`) so it travels with the engine on extraction. |
| `none`              | The engine ignores `menu` entirely; `core:navigation` renders nothing. Authors must use `regions` / `routes` escape hatches. | — |
| absent              | No field → `core:navigation` falls back to `sidebar-drilldown` (back-compat for engines predating the field). | — |

**Plugin renderers.** Renderer ids are global — an engine *names* a renderer; a plugin *supplies* it under a `plugin:{slug}/{name}` id (core ids are reserved). The renderer is a React component; the registry is JS-side. A plugin registers the component against the kernel's published surface from a script handle, and declares that handle to PHP so the workspace enqueues it on the admin-workspace page:

```php
// PHP — declare the renderer + the script that registers its component.
wp_admin_workspaces_register_menu_renderer( 'plugin:my/breadcrumb-menu', array(
    'script' => 'my-breadcrumb-menu', // wp_register_script'd, deps: [ 'wp-admin-workspaces' ]
) );
```

```js
// JS (in that script) — register the component.
window.wpAdminWorkspaces.registerMenuRenderer( 'plugin:my/breadcrumb-menu', MyBreadcrumbMenu );
```

Every renderer component receives the same props: `{ items, currentPrimary, navConfig }` — the host-pruned + ordered menu tree, the active URL primary path, and the per-region nav config block. It returns React.

**Timing caveat.** The kernel mounts synchronously when its bundle runs. Bundled + engine-owned renderers register via a direct ESM import, so they're race-free. A loose plugin script enqueued *after* the kernel bundle can miss the first paint — robustly fixing that needs a published kernel import surface (tracked in `docs/feedback.md`, kernel-import-surface gap).

### `modes`

Catalog of named chrome modes a screen can request via `screens[id].mode`. The engine maps each mode to per-region states.

Each mode entry shape:

| Field         | Type              | Description                                                                                              |
|---------------|-------------------|----------------------------------------------------------------------------------------------------------|
| `label`       | string            | Human-readable name for tooling + cascade audit reports.                                                  |
| `description` | string            | Optional one-line summary of the mode's intent.                                                          |
| `extends`     | string            | Optional. Name of another mode in the catalog. The new mode inherits the parent's region states and overrides per-field. Inheritance depth limit: 10. |
| `regions`     | object            | Region-id-keyed map of region-state objects. The schema for region-state is engine-defined.              |
| `chrome`      | object            | Optional engine-level chrome flags that aren't tied to a specific region (e.g. global density override). |
| `modal`       | boolean           | When true, this mode is a modal overlay. The current screen stays mounted underneath; chrome flags are ignored. |

### Plugin-contributed modes

Plugins extend an engine's mode catalog via filter:

```php
add_filter( 'wp_admin_workspaces_engine_modes_core:default', function( $modes ) {
    $modes['kiosk'] = [
        'label'   => 'Kiosk',
        'extends' => 'takeover',
        'regions' => [ 'detail' => [ 'hidden' => true ] ],
    ];
    return $modes;
} );
```

The filter contributes through the `plugin` cascade origin. Site/role/user origins can still select modes via `screens[id].mode`. Filter runs before workspace resolution; mode references that don't resolve at resolve time produce a diagnostic.

## `core:default` mode catalog

Full bodies for each mode:

```json
{
	"modes": {
		"default": {
			"label": "Default",
			"description": "Full workspace chrome — toolbar + sidebar (with nested site-hub) + content; the detail panel shows when a mirror-routed app is mounted.",
			"regions": {
				"sidebar": { "hidden": false, "compact": false },
				"toolbar": { "hidden": false, "compact": false },
				"content": { "hidden": false, "fullWidth": false },
				"detail":  { "hidden": false }
			}
		},

		"focus": {
			"label": "Focus",
			"description": "Strip the sidebar (and its nested site-hub) + the detail panel; compact the toolbar to its essential affordances; content fills the width. Editor and authoring surfaces.",
			"regions": {
				"sidebar": { "hidden": true },
				"toolbar": { "compact": true },
				"content": { "hidden": false, "fullWidth": true },
				"detail":  { "hidden": true }
			}
		},

		"takeover": {
			"label": "Takeover",
			"description": "All workspace chrome hidden — toolbar + sidebar + detail panel gone, content fills the viewport. Customizer, full-screen apps.",
			"regions": {
				"sidebar": { "hidden": true },
				"toolbar": { "hidden": true },
				"content": { "hidden": false, "fullWidth": true },
				"detail":  { "hidden": true }
			}
		},

		"modal": {
			"label": "Modal Overlay",
			"description": "Mount as overlay on top of the current screen. Chrome state of underlying screen unchanged.",
			"modal": true
		}
	}
}
```

### Region-state vocabulary (engine-defined)

For `core:default`, region-state objects accept:

| Key         | Type    | Applies to              | Meaning                                                                                       |
|-------------|---------|-------------------------|-----------------------------------------------------------------------------------------------|
| `hidden`    | boolean | every region            | Hide via CSS (`display: none` or transform-offscreen). Mount tree unchanged.                  |
| `compact`   | boolean | toolbar, sidebar        | Reduced height/width chrome. Sidebar collapses to icons; toolbar shrinks to back + save only. |
| `fullWidth` | boolean | content                 | Allow content to expand into the space normally occupied by hidden regions.                    |

Other engines define their own vocabulary. `core:desktop` adds `pinned`, `floating`, `tiled` for dock + window-frame regions. `core:single-pane` adds `drawerOpen`.

## How screens consume the catalog

Resolver pipeline:

1. Screen mounts. Active `screens[id].mode` value read (default: `"default"`).
2. Active engine looked up. `engine.json#modes[mode]` retrieved.
3. If the mode has `extends`, the chain is resolved bottom-up: each level deep-merges over its parent. Inheritance depth limit: 10. Circular refs produce a diagnostic.
4. Resolved mode's `regions` block merged with the screen's own `regions` override (screen wins per-field). Result is the resolved region-state map.
5. Each region's wrapper (`<Region>`) reads its state from the resolved map and applies the engine's region-state vocabulary to its rendered DOM (CSS class + data attributes).
6. Region apps stay mounted regardless of `hidden`/`compact` — visibility is paint-only.

Pseudo-code:

```js
function resolveMode( screenId, engineManifest, screens ) {
	const screen = screens[ screenId ];
	const mode = resolveModeChain( engineManifest.modes, screen.mode || 'default' );
	if ( mode.modal ) {
		return { modal: true, regions: null };          // overlay, no chrome change
	}
	const merged = deepMerge( mode.regions, screen.regions || {} );
	return { modal: false, regions: merged };
}
```

## Engine-author guidelines

- **Ship at least `default` + one alternate.** Most engines need a focus or takeover variant; otherwise screens can never request reduced chrome.
- **Document region-state vocabulary in the engine README.** Authors writing screen-level `regions` overrides depend on knowing which keys an engine accepts.
- **Match the spec's intent across engines.** A `focus` mode should mean "minimize chrome" regardless of engine. A `core:desktop` engine's `focus` could collapse the dock to a hover-revealed strip; a `core:single-pane` `focus` could just hide the drawer toggle. Different paintings, same intent.
- **`modal` mode is the only one that doesn't change chrome state.** Use it for overlays only; don't recycle the name for other purposes.
- **Don't bake content padding into the region mount.** `core:default` renders the app mount (`.wp-admin-workspaces-region__app`) flush — no padding. The mount is non-addressable (no template hook, no `regions[id].style` path), so a default there can't be removed per-app and forces full-bleed apps (DataViews, iframes) to opt out. Apps own their inset via the shared `wp-admin-workspaces-app--inset` utility (themeable through `styles.chrome.content.inset`); the kernel special-cases no app for layout. See `docs/engines-and-design-systems.md` → "Region content padding."
- **Put a region's whole flat box model in `default-style`; reserve `index.css` for what inline style can't express.** Template `default-style` is emitted as inline style on the region wrapper and is the *only* surface `regions[id].style` overrides can merge into, so every flat `property: value` (layout literals included) belongs there. `index.css` is for selectors / pseudo-classes / descendant targeting / cascade-layer fixes / queries only. Within `default-style`, give a property a named chrome slot (`var(--wp-admin-workspaces--chrome--…, var(--wpds-…))`) only when it's worth a stable by-name author knob; leave design-system-tracking values (radius, elevation, rhythm) as bare `--wpds-*`, and layout mechanics as literals. Full value-tier model + the JSON-vs-CSS rationale in `docs/engines-and-design-systems.md` → "`default-style` value tiers + what's themeable."

## Region slotting

`Layout.js` dispatches the resolved top-level regions into the chrome shape via the pure `slotRegions.mjs` helper (node-tested by `tests/runtime/core-default-slot-regions.test.mjs`). Slot assignment is by **role**, with the region id as a tiebreaker — not by literal id — so the engine's `specializes-roles` declaration actually pays off:

| Slot      | Claimed by role | id tiebreaker |
|-----------|-----------------|---------------|
| `toolbar` | `banner`        | `toolbar`     |
| `sidebar` | `navigation`    | `sidebar`     |
| `content` | `main`          | `content`     |
| `detail`  | `complementary` | `detail`      |
| `preview` | *(no role)*     | `preview` (id-only — there is no `core:preview` template) |

Matching order per slot: (1) role + id, (2) role alone (any id), (3) id-only fallback. A workspace that names its main region `dashboard` (role `main`) lands in the content slot instead of falling through to the straggler bucket.

Modal regions (`platform.core:modal` / `role: dialog`, e.g. the command palette) always render in the overlay layer. Of the remaining chrome regions, **dynamic-children hosts render inside the content (`areas`) row** — that is the engine's real mount point for a `core:dashboard-grid` region (`platform.core:dynamic-children: true`). Everything else (the notices banners, which fix-position themselves) renders as a straggler at the layout root.

## Chrome → WPDS bridge (asymmetric by design)

`compileStyles.mjs` `CHROME_WPDS_BINDINGS` re-themes `@wordpress/ui` components inside a chrome surface by scoping `--wpds-*` overrides to that surface's container selector. The table covers **four** surfaces only:

| `chrome.<surface>` | Bound? | Why |
|--------------------|--------|-----|
| `canvas`           | ✅ (`foreground`) | `@wordpress/ui` content rendered directly under the layout root. `canvas.background` is intentionally *not* bound — it would darken the elevated `core:main` / `core:detail` cards (see the inline note in `compileStyles.mjs`). |
| `sidebar`          | ✅ (`foreground`, `item.*`) | Nav + site-hub interactive chrome. |
| `toolbar`          | ✅ (`foreground`, `foreground-active`) | Topbar interactive chrome. |
| `site-hub`         | ✅ (`foreground`) | Site-hub foreground. |
| `content`          | ❌ **unbound** | The content region is the elevated **card** — its surface is WPDS-default (`--wpds-color-bg-surface-neutral`) on purpose. App content inside it should read the standard WPDS palette, not a re-themed chrome palette. Authoring `chrome.content.*` slots still feeds the engine `index.css` / template `default-style` (e.g. `content.inset`, `content.card-*`), but it does **not** retheme `@wordpress/ui` inside the content region. |

So `chrome.content.*` is consumed by templates and CSS (card background/radius/shadow/inset) but is **not** in the WPDS-bridge table — authoring it won't shift `@wordpress/ui` token values inside the content card. This asymmetry is deliberate (content = neutral card surface); it is noted here so authors don't expect content-scoped `@wordpress/ui` re-theming.

## Cascade implications

`engine.json#modes` is engine-shipped. Site authors override via `screens[id].mode` (mode selection) + `screens[id].regions` (per-field override on top of the mode).

If a site author wants to override the mode itself (e.g. redefine what `focus` means across all screens), they edit their own engine.json fork — or the engine accepts workspace.json-side `engine-modes` overrides at the install layer. Open design question: is per-install mode redefinition load-bearing, or is screen-level override enough? Lean: screen-level is enough for v3; revisit if real authoring need surfaces.

## Resolved decisions

The following items were locked during Phase 2 design (see `schema-sketch.md`):

- **Mode inheritance via `extends`** — supported from v3. Inheritance depth limit: 10.
- **Plugin-contributed modes** — via `wp_admin_workspaces_engine_modes_{engineId}` filter at plugin origin.
- **Plugin-contributed menu renderers** — registered via `wp_admin_workspaces_register_menu_renderer()`. Engine's `menu-renderer` field accepts plugin namespace ids.
- **Mode transitions** — engine-owned and undocumented. Schema does not declare transition behavior; engines ship their own animation internally.
- **Modal stacking** — engine-managed LIFO stack. Topmost owns focus + Escape; closing dismisses just topmost. Engines that don't support stacking fall back to "exclusive modal" semantics.

## Open questions

Remaining lower-priority items for follow-up spec work:

1. **Per-install mode override.** Whether the workspace can redefine what `focus` means at the install level (vs only choosing which screens use `focus`). Lean: screen-level `regions` override is sufficient; revisit if real authoring need surfaces.

2. **Animation contract.** Spec needs to formalize the expectation that mode transitions are smooth + interruptible across engines, even though specifics are engine-owned. Documentation, not schema.

3. **Per-renderer capability declarations.** Each engine `menu-renderer` should document what it supports (max nesting depth, separator rendering, drilldown vs accordion). Spec needs a contract table.
