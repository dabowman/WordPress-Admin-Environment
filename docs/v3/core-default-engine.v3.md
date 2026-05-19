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

	"script": "wp-admin-shell-engine-default",
	"style":  "wp-admin-shell-engine-default-css",

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

Names the strategy the engine uses to render the resolved `menu` block. Required for any engine that wants screens to appear in a menu.

| Value | Behavior |
|-------|----------|
| `sidebar-drilldown` | Items render in a sidebar nav; `parent` produces a slide-in sub-screen with a back link. (`core:default`.) |
| `sidebar-tree`      | Items render in a sidebar nav as an expandable tree. |
| `dock`              | Items render as tiles in a dock rail; `parent` produces a folder. (`core:desktop` uses this.) |
| `drawer`            | Items render in a collapsible drawer; `parent` produces an accordion section. (`core:single-pane`.) |
| `none`              | The engine ignores `menu` entirely. Authors must use `regions` / `routes` escape hatches. |

Plugin-contributed renderer ids (`plugin:my/breadcrumb-menu`) are allowed. Plugins register the renderer at runtime:

```php
wp_admin_shell_register_menu_renderer( 'plugin:my/breadcrumb-menu', $callback );
```

The engine's render path consults the renderer registry. Plugin renderers receive the resolved menu tree + active screen id as arguments and return rendered React or markup.

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
add_filter( 'wp_admin_shell_engine_modes_core:default', function( $modes ) {
    $modes['kiosk'] = [
        'label'   => 'Kiosk',
        'extends' => 'takeover',
        'regions' => [ 'site-hub' => [ 'hidden' => true ] ],
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
			"description": "Full workspace chrome — sidebar, toolbar, site-hub, content.",
			"regions": {
				"sidebar":  { "hidden": false, "compact": false },
				"toolbar":  { "hidden": false, "compact": false },
				"site-hub": { "hidden": false },
				"content":  { "hidden": false, "fullWidth": false },
				"preview":  { "hidden": false }
			}
		},

		"focus": {
			"label": "Focus",
			"description": "Strip the sidebar; compress the toolbar to a back link + save indicator. Editor and authoring surfaces.",
			"regions": {
				"sidebar":  { "hidden": true },
				"toolbar":  { "compact": true },
				"site-hub": { "hidden": false },
				"content":  { "hidden": false, "fullWidth": true },
				"preview":  { "hidden": true }
			}
		},

		"takeover": {
			"label": "Takeover",
			"description": "All workspace chrome hidden. Full-viewport screen. Customizer, full-screen apps.",
			"regions": {
				"sidebar":  { "hidden": true },
				"toolbar":  { "hidden": true },
				"site-hub": { "hidden": true },
				"content":  { "hidden": false, "fullWidth": true },
				"preview":  { "hidden": true }
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
| `minimal`   | boolean | toolbar                 | Same as `compact` but stricter — only essential affordances.                                   |
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

## Cascade implications

`engine.json#modes` is engine-shipped. Site authors override via `screens[id].mode` (mode selection) + `screens[id].regions` (per-field override on top of the mode).

If a site author wants to override the mode itself (e.g. redefine what `focus` means across all screens), they edit their own engine.json fork — or the engine accepts admin.json-side `engine-modes` overrides at the install layer. Open design question: is per-install mode redefinition load-bearing, or is screen-level override enough? Lean: screen-level is enough for v3; revisit if real authoring need surfaces.

## Resolved decisions

The following items were locked during Phase 2 design (see `schema-sketch.md`):

- **Mode inheritance via `extends`** — supported from v3. Inheritance depth limit: 10.
- **Plugin-contributed modes** — via `wp_admin_shell_engine_modes_{engineId}` filter at plugin origin.
- **Plugin-contributed menu renderers** — registered via `wp_admin_shell_register_menu_renderer()`. Engine's `menu-renderer` field accepts plugin namespace ids.
- **Mode transitions** — engine-owned and undocumented. Schema does not declare transition behavior; engines ship their own animation internally.
- **Modal stacking** — engine-managed LIFO stack. Topmost owns focus + Escape; closing dismisses just topmost. Engines that don't support stacking fall back to "exclusive modal" semantics.

## Open questions

Remaining lower-priority items for follow-up spec work:

1. **Per-install mode override.** Whether the workspace can redefine what `focus` means at the install level (vs only choosing which screens use `focus`). Lean: screen-level `regions` override is sufficient; revisit if real authoring need surfaces.

2. **Animation contract.** Spec needs to formalize the expectation that mode transitions are smooth + interruptible across engines, even though specifics are engine-owned. Documentation, not schema.

3. **Per-renderer capability declarations.** Each engine `menu-renderer` should document what it supports (max nesting depth, separator rendering, drilldown vs accordion). Spec needs a contract table.
