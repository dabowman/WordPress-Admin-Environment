# engine.json Reference

`engine.json` is the manifest that describes a WP Admin Shell engine: the spatial + chrome layer of the shell that reads a region tree assembled by the runtime and renders it to DOM. The manifest declares which ARIA roles the engine specializes for, which platform services it implements, the catalog of region templates it ships, the catalog of chrome modes screens may request, the workspace + screen slots it exposes, the strategy it uses to render the workspace menu, and the identifier of its default arrangement algorithm.

The default engine `core:default` ships with the shell plugin alongside `core:single-pane` and `core:desktop`. Alternative engines (plugin-contributed) implement the same contract differently and may ship their own design system, chrome conventions, and arrangement algorithm.

Manifests are discovered at the convention path `{plugin}/engines/{name}/engine.json` or registered programmatically through `wp_admin_shell_register_engine()`.

This reference covers the engine manifest schema (`admin-engine.json`). Engines declare three top-level blocks the kernel honors: `menu-renderer`, `slots`, `modes`.

## In this article

- [JSON Schema](#json-schema)
- [id](#id)
- [version](#version)
- [title](#title)
- [description](#description)
- [designSystem](#designsystem)
- [specializes-roles](#specializes-roles)
- [honored-platform](#honored-platform)
- [templates](#templates)
- [modes](#modes)
- [slots](#slots)
- [menu-renderer](#menu-renderer)
- [default-arrangement](#default-arrangement)
- [defaultRegions](#defaultregions)
- [script](#script)
- [style](#style)
- [styles](#styles)
- [default-styles](#default-styles)

## JSON Schema

`engine.json` manifests validate against a published JSON Schema. Reference it from the top of every file so IDEs can offer completion and inline error reporting:

```json
{
	"$schema": "https://schemas.wp.org/admin-engine.json",
	"id": "plugin:acme/desktop",
	"version": 3,
	"title": "Acme Desktop",
	"specializes-roles": [ "main", "navigation", "complementary" ],
	"honored-platform": [ "core:modal", "core:dismiss-on", "core:dynamic-children" ],
	"templates": {
		"plugin:acme/window": {
			"role": "region",
			"platform": { "core:dynamic-children": true }
		}
	},
	"modes": {
		"default":  { "regions": {} },
		"focus":    { "regions": { "sidebar": { "hidden": true } } },
		"takeover": { "regions": { "sidebar": { "hidden": true }, "toolbar": { "hidden": true } } }
	},
	"default-arrangement": "floating-windows",
	"script": "acme-desktop-engine"
}
```

The schema is also available in-repo at [`docs/schemas/admin-engine.json`](../schemas/admin-engine.json) for offline tooling. Relative `$schema` paths are accepted (mirroring the `block.json` convention).

**Required fields:** `id`, `version`, `title`, `specializes-roles`, `honored-platform`, `templates` (must contain at least one template), `default-arrangement`, `script`, `modes`. All other top-level fields are optional. `additionalProperties` is `false` — unknown top-level fields are a validation error.

## id

Globally unique engine identifier. Same format as app ids: `core:{name}` for engines shipped with the WP Admin Shell plugin, `plugin:{slug}/{name}` for plugin-contributed engines.

Examples: `core:default`, `core:single-pane`, `core:desktop`, `plugin:tiling-pro/dwindle`. The runtime registry rejects duplicate ids.

| Property | Description                                                                                              | Type   | Default |
|----------|----------------------------------------------------------------------------------------------------------|--------|---------|
| id       | Namespaced engine id matching `^(core:[a-z][a-z0-9-]*\|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*)$`.          | string | —       |

## version

Engine manifest schema version (currently `3`). Bump only on breaking changes to this engine's manifest contract.

| Property | Description                                       | Type    | Default |
|----------|---------------------------------------------------|---------|---------|
| version  | Manifest version. Must be `3` for the current shape. | integer | —       |

## title

Human-readable name of the engine. Shown in shell-switcher UI, plugin install screens, and developer tooling. Translatable.

| Property | Description                       | Type   | Default |
|----------|-----------------------------------|--------|---------|
| title    | Display name. Translatable.       | string | —       |

## description

Optional human-readable description of what the engine does and what shell experiences it suits. One sentence to a short paragraph. Translatable.

| Property    | Description                            | Type   | Default |
|-------------|----------------------------------------|--------|---------|
| description | One-sentence to one-paragraph summary. | string | —       |

## designSystem

Design system this engine ships with. Free-form string by convention: `@wordpress/ui` (WPDS — what `core:default` and `core:single-pane` use), `mui` (Material Design), `chakra`, `radix`, `custom`. The kernel emits a dev-mode warning when a mounted app's `designSystem` differs from this engine's, signaling a visual-mismatch risk. Engines that don't declare a value are treated as DS-unknown and skip the mismatch check.

| Property      | Description                                       | Type   | Default |
|---------------|---------------------------------------------------|--------|---------|
| designSystem  | Free-form DS identifier, e.g. `@wordpress/ui`.    | string | —       |

## specializes-roles

ARIA roles this engine recognizes and specializes for. A region whose `role` is in this list receives engine-shipped chrome treatments (default styling, default platform behaviors, position in the default arrangement). Roles outside this list still mount, but fall through to the engine's default arrangement algorithm with author-provided styling and no engine-specific chrome.

Authors discover what an engine does well by reading this list. Empty list is valid (an engine that treats every region the same).

```json
{
	"specializes-roles": [ "main", "navigation", "banner", "complementary" ]
}
```

| Property           | Description                                                                                                          | Type             | Default |
|--------------------|----------------------------------------------------------------------------------------------------------------------|------------------|---------|
| specializes-roles  | Array of WAI-ARIA 1.2 role names this engine ships specialized chrome and arrangement for. `uniqueItems: true`.       | array of string  | —       |

## honored-platform

Platform service requests this engine implements. An app declaring a `platform.{service}: true` request gets that service only if the active engine lists it here. Apps requesting unhonored services still mount; the unhonored requests are no-ops with a logged warning in development. The list grows additively in minor spec versions; engines ship updates as the spec adds services they choose to implement.

The v1 core platform service vocabulary:

| Service                              | What honoring it means                                                                                          |
|--------------------------------------|------------------------------------------------------------------------------------------------------------------|
| core:modal                           | Render with focus trap + ARIA modal + backdrop scrim.                                                            |
| core:dismiss-on                      | Wire `Escape` / outside-click / navigation triggers to unmount the region.                                      |
| core:autofocus-target                | Move focus to the named element on mount.                                                                       |
| core:triggerable                     | Allow `admin.json#bindings` to invoke regions running this app.                                                 |
| core:persists-across-navigation      | Keep the region mounted across URL changes to other regions.                                                    |
| core:dirty-state                     | Query the mounted app for unsaved-changes state.                                                                 |
| core:block-navigation-on-dirty       | Show a confirm dialog before unmounting while the app reports dirty.                                            |
| core:trigger                         | Honor declarative trigger hints on regions / templates.                                                          |
| core:dynamic-children                | Allow the mounted app to add/remove child regions at runtime via `useDynamicChildren(regionId)`. Required for windowed / MDI / desktop engines. |

Plugin-contributed services use the `plugin:{slug}/{name}` namespace.

| Property           | Description                                                                                                       | Type             | Default |
|--------------------|-------------------------------------------------------------------------------------------------------------------|------------------|---------|
| honored-platform   | Array of platform service names this engine implements. `uniqueItems: true`. Items match `^(core:[a-z][a-z0-9-]*\|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*)$`. | array of string  | —       |

## templates

Region-template catalog. Authors instantiate these templates from `admin.json` by referencing the template id in a region's `template` field. Each template encapsulates a region's role, platform service requests, default styling, and (optionally) a child region structure.

Template ids match `^(core:[a-z][a-z0-9-]*|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*)$` — same namespace pattern as apps and engines. The catalog must contain at least one template (`minProperties: 1`) — an engine with no templates would be unusable. `additionalProperties: false` on both the catalog and each template body.

```json
{
	"templates": {
		"core:sidebar": {
			"role": "navigation",
			"default-style": {
				"inline-size": "240px",
				"block-size": "100%",
				"background": "{styles.chrome.sidebar.background}",
				"color": "{styles.chrome.sidebar.foreground}"
			}
		},
		"core:content": {
			"role": "main",
			"default-style": { "flex-grow": 1 }
		}
	}
}
```

### Region template fields

| Property        | Description                                                                                                                                                                  | Type    | Default |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| role            | The ARIA role the resulting region carries when instantiated. Drives engine specialization. Required.                                                                          | string  | —       |
| platform        | Default platform service requests for regions instantiated from this template. Authors can override individual fields when instantiating.                                       | object  | —       |
| default-style   | Default CSS applied to regions instantiated from this template. Values may be literal CSS strings or token aliases (`{styles.chrome.sidebar.background}`).                     | object  | —       |
| regions         | Nested child regions, addressable as `{parent}/{child}` in `admin.json`. Each child has the full template contract.                                                            | object  | —       |

### Region template platform requests

Same shape as the app manifest's `platform` block, applied at the region level. When a region and its mounted app both declare the same platform service, the region's declaration is the floor: the engine honors the strictest combined request.

| Property                          | Description                                                                                                            | Type    | Default |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------------|---------|---------|
| core:modal                        | Render with focus trapped, ARIA modal applied, backdrop scrim when supported.                                          | boolean | `false` |
| core:dismiss-on                   | Array of `Escape`, `backdrop-click`, `outside-click`, `navigation`.                                                    | array   | —       |
| core:autofocus-target             | CSS selector for the element that should receive focus on mount.                                                       | string  | —       |
| core:triggerable                  | Region may be invoked by an `admin.json#bindings` keystroke.                                                          | boolean | `false` |
| core:persists-across-navigation   | Region survives URL-driven changes to other regions.                                                                   | boolean | `false` |
| core:dirty-state                  | Mounted app may report unsaved-changes state.                                                                          | boolean | `false` |
| core:block-navigation-on-dirty    | Show confirmation before unmount when dirty. Requires `core:dirty-state`.                                              | boolean | `false` |
| core:dynamic-children             | Mounted app may add / remove child regions at runtime via `useDynamicChildren(regionId)`.                              | boolean | `false` |
| core:trigger                      | Declarative trigger hint (`{ shortcut: "Mod+K" }`). The actual binding lives in `admin.json#bindings`.                | object  | —       |

## modes

**Required (v3).** The engine's catalog of chrome modes screens may request. Each mode declares per-region states (`hidden`, `compact`, `minimal`, `fullWidth`, etc.). Authors point a screen at a mode via `screens[id].mode`; the engine renders the region states accordingly.

```json
{
	"modes": {
		"default":  { "regions": {} },
		"focus": {
			"regions": {
				"sidebar":  { "hidden": true },
				"toolbar":  { "compact": true }
			}
		},
		"takeover": {
			"regions": {
				"sidebar":  { "hidden": true },
				"toolbar":  { "hidden": true },
				"site-hub": { "hidden": true }
			}
		},
		"modal":    { "regions": {} },
		"focus-tight": {
			"extends": "focus",
			"regions": { "site-hub": { "hidden": true } }
		}
	}
}
```

| Property      | Description                                                                                                                                                  | Type   | Default |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| modes         | Map of mode name → mode definition. Must contain a `default` key (schema-enforced). The other three conventional names (`focus`, `takeover`, `modal`) are unenforced conventions. Plugin engines may add their own.                          | object | —       |
| modes.<name>.regions | Map of region id → state object. State keys (`hidden`, `compact`, etc.) are engine-defined.                                                          | object | —       |
| modes.<name>.extends | Optional. Inherit from another mode in the catalog. Recursive, cycle-safe, max depth 10.                                                              | string | —       |

Plugins may extend the catalog via the `wp_admin_shell_engine_modes_{engineId}` PHP filter — see [`docs/v3/schema-sketch.md`](../v3/schema-sketch.md#plugin-contributed-modes).

## slots

Engine-declared mount points beyond the kernel-reserved `_self` and `palette`. Each slot has a scope (`workspace`, `screen`, or `both`) that controls where it's allowed. The active engine's slots union with kernel-reserved slots and app-declared slots to form the resolved vocabulary for a workspace.

```json
{
	"slots": {
		"detail":         { "description": "Detail / inspector pane in a paired-region layout.",     "scope": "both" },
		"inspector":      { "description": "Right-side property inspector.",                           "scope": "both" },
		"toolbar":        { "description": "Persistent toolbar slot.",                                 "scope": "workspace" },
		"sidebar-footer": { "description": "Bottom of sidebar.",                                       "scope": "workspace" },
		"status-bar":     { "description": "Bottom-of-viewport status strip.",                         "scope": "workspace" }
	}
}
```

| Property             | Description                                                                                       | Type   | Default |
|----------------------|---------------------------------------------------------------------------------------------------|--------|---------|
| slots                | Map of slot id → `{ description, scope }`. Slot ids are kebab-case.                              | object | —       |
| slots.<id>.scope     | `"workspace"`, `"screen"`, or `"both"`. Required — no default.                                     | string | —       |
| slots.<id>.description | Human-readable description for tooling.                                                          | string | —       |

See [`docs/v3/schema-sketch.md#slots`](../v3/schema-sketch.md#slots) for the slot vocabulary design rationale.

## menu-renderer

Identifier of the strategy the engine uses to render the workspace `menu` tree. Schema enum: `sidebar-drilldown` (`core:default`), `sidebar-tree`, `dock` (`core:desktop`), `drawer` (`core:single-pane`), `none` (explicit opt-out — engine ignores the `menu` block; authors drive navigation through `regions` / `routes`), or a plugin-namespaced renderer (`plugin:{slug}/{name}`) registered via `wp_admin_shell_register_menu_renderer( $id, $callback )`. Omitting the field is equivalent to `none`. Plugin renderers that fail to resolve at activation time fall back to `none` with a dev-mode warning.

| Property        | Description                                                                                              | Type   | Default |
|-----------------|----------------------------------------------------------------------------------------------------------|--------|---------|
| menu-renderer   | Renderer id. One of `sidebar-drilldown` / `sidebar-tree` / `dock` / `drawer` / `none` / `plugin:{slug}/{name}`. | string | `"none"` (when field omitted) |

## default-arrangement

Identifier for the engine's spatial arrangement algorithm — a documentation marker, not configuration the runtime reads. The actual algorithm is implementation in the engine's script. Authors and tooling reference this name when describing how the engine behaves.

Conventional values: `wp-chrome` (sidebar + topbar + content), `tiling-dwindle` (Hyprland-style tiling), `floating-windows` (draggable resizable windows), `single-pane` (one region visible at a time). New names accumulate as engines are written; the schema does not enumerate them.

| Property             | Description                                                                  | Type   | Default |
|----------------------|------------------------------------------------------------------------------|--------|---------|
| default-arrangement  | Kebab-case identifier for the arrangement algorithm.                          | string | —       |

## defaultRegions

Engine-shipped baseline region tree. The v3 compiler merges this with `workspace.widgets[]` + per-screen overrides to produce the runtime regions map. Each region declaration follows the same shape as a region instantiated in admin.json — see [§5 of the design spec](../wp-admin-shell-design-spec.md#5-region-vocabulary).

```json
{
	"defaultRegions": {
		"sidebar": {
			"template": "core:sidebar",
			"app":      "core:navigation"
		},
		"main": {
			"template": "core:main",
			"routing":  { "route-key": "_self" }
		},
		"detail": {
			"template": "core:detail",
			"routing":  { "route-key": "detail", "mode": "mirror" }
		},
		"palette": {
			"template": "core:overlay",
			"app":      "core:command-palette"
		}
	}
}
```

| Property         | Description                                                                                                                                                  | Type   | Default |
|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| defaultRegions   | Map of region id → region declaration. Region declarations follow the runtime region vocabulary (template / role / layout / platform / routing / app / config / nested regions). | object | —       |

## script

WordPress script handle for this engine's JavaScript bundle. Must be registered with WordPress before the manifest references it. The runtime enqueues this when the engine activates.

| Property | Description                                                              | Type   | Default |
|----------|--------------------------------------------------------------------------|--------|---------|
| script   | Registered script handle matching `^[a-z][a-z0-9-]*$`.                   | string | —       |

## style

Optional WordPress style handle for this engine's primary CSS. Engines may rely entirely on WPDS tokens and the chrome extension namespace for styling, in which case this is omitted. Engines with their own structural CSS (grid templates, animation, layout-specific pseudo-elements) declare a style handle here.

| Property | Description                                                              | Type   | Default |
|----------|--------------------------------------------------------------------------|--------|---------|
| style    | Registered style handle matching `^[a-z][a-z0-9-]*$`.                    | string | —       |

## styles

Optional list of additional CSS bundles the engine wants enqueued whenever it's the active engine. Use for design-system token files (e.g. WPDS baseline), component-library CSS (e.g. DataViews stylesheet), or any other non-bundled CSS the engine depends on. Loaded by the kernel only when this engine matches `admin.json#engine`. The single `style` field above is the engine's own primary stylesheet handle; this array covers everything else.

```json
{
	"styles": [
		{ "handle": "wp-admin-shell-wpds-tokens", "src": "build/wpds-tokens.css" },
		{ "handle": "wp-admin-shell-dataviews-css", "src": "build/dataviews.css", "deps": [ "wp-components" ] }
	]
}
```

### Styles entry

`handle` and `src` are required.

| Property | Description                                                                                                                                                 | Type             | Default |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|---------|
| handle   | WordPress style handle. Must match `^[a-z][a-z0-9-]*$` and be unique across all enqueued engines. Convention: `<plugin-slug>-<engine-name>-<asset>`. Required. | string           | —       |
| src      | URL or plugin-relative path to the CSS file. Plugin-relative paths resolve against the engine's plugin URL. Required.                                       | string           | —       |
| deps     | Optional dependency handles enqueued before this one.                                                                                                        | array of string  | —       |

## default-styles

Optional engine-supplied seed defaults for the shell's `styles` tree. When the runtime mounts this engine, the resolver deep-merges this object UNDER the resolved `admin.json#styles` (`admin.json` wins on every overlapping key). Engines use this to ship their characteristic visual identity (dark-chrome palette, brand-locked accent, density preset) so individual shells stop having to repeat the same theme rules.

Limited to the `theme`, `chrome`, and direct slot overrides (`color`, `border`, `dimension`, `elevation`, `font`). Per-region (`regions`) and per-app (`applications`) scopes are `admin.json`-only — engines don't supply install-decision metadata. `branding` is also `admin.json`-only.

```json
{
	"default-styles": {
		"theme": {
			"color": { "primary": "#3858e9", "bg": "#1e1e1e" },
			"density": "compact"
		},
		"chrome": {
			"sidebar": {
				"background": "{color.gray.900}",
				"foreground": "{color.gray.50}"
			}
		}
	}
}
```

### default-styles fields

| Property   | Description                                                                                                                              | Type   | Default |
|------------|------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| theme      | ThemeProvider seed inputs. Keys typically present: `color.primary`, `color.bg`, `cursor.control`, `density`.                              | object | —       |
| chrome     | Chrome surface palette (sidebar / toolbar / site-hub bindings). The chrome → WPDS bridge picks these up as `--wpds-*` overrides scoped to each surface. | object | —       |
| color      | Direct WPDS color slot overrides.                                                                                                         | object | —       |
| border     | Direct WPDS border slot overrides.                                                                                                        | object | —       |
| dimension  | Direct WPDS dimension slot overrides.                                                                                                     | object | —       |
| elevation  | Direct WPDS elevation slot overrides.                                                                                                     | object | —       |
| font       | Direct WPDS font slot overrides.                                                                                                          | object | —       |
