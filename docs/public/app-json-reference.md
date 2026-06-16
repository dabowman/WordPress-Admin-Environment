# app.json Reference

`app.json` is the manifest that describes a WP Admin Workspaces app: an admin surface (a posts list, an editor, a command palette, a settings panel) that mounts into a region of a workspace. The manifest ships alongside the app's code (its script and style assets) and is discovered at the convention path `{plugin}/apps/{name}/app.json`, or registered programmatically through `wp_admin_workspaces_register_app()`.

Manifests contain only intrinsic, install-independent declarations: the app's ARIA role, the platform services it requests from its hosting engine, the WordPress capabilities required to mount it, the configuration schema it accepts when `workspace.json` passes values, the slots it exposes for in-screen sub-mounts, and a baseline `dataView` family if the app renders an entity list. Manifests deliberately do not declare layout, geometry, keystroke bindings, or which install they belong to — those are install decisions and live in `workspace.json`.

This reference covers the app manifest schema (`workspace-app.json`).

## In this article

- [JSON Schema](#json-schema)
- [id](#id)
- [version](#version)
- [title](#title)
- [description](#description)
- [designSystem](#designsystem)
- [role](#role)
- [platform](#platform)
- [capabilities](#capabilities)
- [config-schema](#config-schema)
- [extension-points](#extension-points)
- [script](#script)
- [style](#style)
- [window](#window)
- [slots](#slots)
- [slotHints](#slothints)
- [dataView](#dataview)
- [documentation](#documentation)

## JSON Schema

`app.json` manifests validate against a published JSON Schema. Reference it from the top of every file so IDEs can offer completion and inline error reporting:

```json
{
	"$schema": "https://schemas.wp.org/workspace-app.json",
	"id": "plugin:acme/orders",
	"version": 3,
	"title": "Orders",
	"role": "main",
	"script": "acme-orders"
}
```

The schema is also available in-repo at [`docs/schemas/workspace-app.json`](../schemas/workspace-app.json) for offline tooling. Relative `$schema` paths are accepted (mirroring the `block.json` convention).

**Required fields:** `id`, `version`, `title`, `role`, `script`. All other top-level fields are optional. `additionalProperties` is `false` — unknown top-level fields are a validation error.

**Conditional rule:** `platform.core:block-navigation-on-dirty: true` requires `platform.core:dirty-state: true`. Apps that don't track dirty state cannot block navigation on it.

## id

Globally unique app identifier. Format: `{namespace}:{name}`. The `core` namespace is reserved for apps shipped with the WP Admin Workspaces plugin; the `plugin` namespace requires `plugin:{slug}/{name}` where `slug` matches the contributing plugin's directory name. Names within a namespace are kebab-case.

Examples: `core:command-palette`, `core:posts`, `plugin:woocommerce/orders`, `plugin:acme/team-dashboard`.

The runtime registry rejects duplicate ids; plugins extending core apps must use a different id and have `workspace.json` route to their version.

| Property | Description                                                                                                  | Type   | Default |
|----------|--------------------------------------------------------------------------------------------------------------|--------|---------|
| id       | Namespaced app id matching `^(core:[a-z][a-z0-9]*(-[a-z0-9]+)*\|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9]*(-[a-z0-9]+)*)$`.                | string | —       |

## version

Manifest schema version this document conforms to. v3 is the current shape (paired with the v3 `workspace.json` schema); manifests still declaring `version: 1` or `version: 2` are read through the v1/v2 reader path. Bump only on breaking changes to this app's manifest contract (e.g., field renames, type changes). Adding optional fields does not require a version bump. The runtime accepts higher versions with a warning and best-effort load.

| Property | Description                                                                       | Type    | Default |
|----------|-----------------------------------------------------------------------------------|---------|---------|
| version  | Manifest version, integer `>= 1`. v3 is the current shape; v1/v2 remain readable. | integer | —       |

## title

Human-readable name of the app, shown in command palettes, navigation menus, error messages, and developer tooling. Translatable. Should be short — typically two or three words.

| Property | Description                       | Type   | Default |
|----------|-----------------------------------|--------|---------|
| title    | Short display name. Translatable. | string | —       |

## description

Optional human-readable description of what the app does. Used in `workspace.json` authoring tools, plugin install screens, and ecosystem directories. Translatable. One sentence to a short paragraph.

| Property    | Description                            | Type   | Default |
|-------------|----------------------------------------|--------|---------|
| description | One-sentence to one-paragraph summary. | string | —       |

## designSystem

Design system the app's render tree emits components from. Free-form string by convention: `@wordpress/ui` (WPDS — what every `core:*` app uses), `mui` (Material Design), `chakra`, `radix`, `custom`. Apps are bound to their design system because they import its component primitives directly; mounting a `@wordpress/ui` app inside a Material engine produces visually inconsistent results. The kernel emits a dev-mode warning when the active engine's declared `designSystem` differs from a mounted app's. Apps that don't declare a value are treated as DS-unknown and skip the mismatch check.

| Property      | Description                                       | Type   | Default |
|---------------|---------------------------------------------------|--------|---------|
| designSystem  | Free-form DS identifier, e.g. `@wordpress/ui`.    | string | —       |

## role

The app's primary ARIA role when mounted into a region. Drives engine specialization: engines that recognize the role apply specialized chrome (e.g., a `navigation` app gets sidebar treatment in the wp-default engine). Roles outside an engine's specializes-roles list fall through to the engine's default arrangement.

Common values: `main`, `dialog`, `navigation`, `complementary`, `banner`, `contentinfo`, `region`, `search`. Any valid WAI-ARIA 1.2 role is accepted. Avoid widget roles (`button`, `checkbox`, etc.) — those describe controls, not regions or apps.

| Property | Description                                | Type   | Default |
|----------|--------------------------------------------|--------|---------|
| role     | WAI-ARIA 1.2 landmark or `dialog`/`region`. | string | —       |

## platform

Platform service requests. The app declares which engine-provided services it needs — modality, focus management, dismissal handling, dirty-state tracking, keyboard triggerability. Each field maps to a service the browser/OS would provide if this were a website running in a browser. Engines declare in their own manifest which services they implement; an app requesting a service the active engine does not honor still mounts, but the unhonored request is a no-op (with a logged warning in development).

```json
{
	"platform": {
		"core:modal": true,
		"core:dismiss-on": [ "Escape", "backdrop-click" ],
		"core:autofocus-target": "input[type='search']",
		"core:triggerable": true
	}
}
```

### Platform request fields

| Property                          | Description                                                                                                                                                                  | Type    | Default |
|-----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| core:modal                        | Render with focus trapped, ARIA modal applied, backdrop scrim when the engine supports it. Browser analog: `<dialog>.showModal()`.                                          | boolean | `false` |
| core:dismiss-on                   | Triggers that unmount the region. Array of `Escape`, `backdrop-click`, `outside-click`, `navigation`.                                                                        | array   | —       |
| core:autofocus-target             | CSS selector inside the rendered DOM that should receive focus on mount. Browser analog: HTML `autofocus`.                                                                  | string  | —       |
| core:triggerable                  | App accepts being invoked by an `workspace.json#bindings` keystroke. Browser analog: HTML `commandfor`/`command`.                                                                | boolean | `false` |
| core:persists-across-navigation   | Region survives URL-driven changes to other regions. Use for navigation sidebars, status bars, persistent panels.                                                            | boolean | `false` |
| core:dirty-state                  | App may report unsaved-changes state via the runtime's dirty-state API. Browser analog: `beforeunload`.                                                                      | boolean | `false` |
| core:block-navigation-on-dirty    | Engines show a confirmation dialog before unmounting while dirty. Requires `core:dirty-state: true`.                                                                         | boolean | `false` |

## capabilities

WordPress capabilities required to mount this app. The user must have all listed capabilities; missing any one suppresses the app. This is the floor for any consumer — `workspace.json` cannot lower this requirement, only add to it. Capabilities are validated against `core-data`'s `canUser()` for entity caps and a custom REST endpoint for non-entity caps. Empty array means no capability is required (rare; even the command palette typically requires `read`).

Examples: `[ "edit_posts" ]`, `[ "manage_options", "upload_files" ]`.

| Property     | Description                                                                                  | Type             | Default |
|--------------|----------------------------------------------------------------------------------------------|------------------|---------|
| capabilities | Array of WordPress capability names. The user must hold all of them for the app to mount.   | array of string  | `[]`    |

## config-schema

JSON Schema document describing the shape of the `config` object that `workspace.json` passes to this app at mount time (either via a region's `config` field or via a route's `config` field). The runtime validates the merged config against this schema before mounting; validation failure prevents mount and surfaces an authoring error.

```json
{
	"config-schema": {
		"type": "object",
		"properties": {
			"post-type": { "type": "string", "default": "post" },
			"per-page": { "type": "integer", "minimum": 5, "maximum": 100, "default": 20 }
		},
		"required": [ "post-type" ]
	}
}
```

| Property      | Description                                                              | Type   | Default |
|---------------|--------------------------------------------------------------------------|--------|---------|
| config-schema | Inline JSON Schema (draft 2020-12) used to validate the passed `config`. | object | —       |

## extension-points

Documentary listing of slot/fill points, filter hooks, and other React or PHP extension surfaces this app exposes to plugins. Not load-bearing: the runtime does not read or enforce this field. Included for IDE tooling, ecosystem documentation, and machine-readable discovery of app extensibility.

Keys are extension-point identifiers (e.g., `PluginSidebar`, `PluginDocumentSettingPanel`); values are the WordPress package or hook namespace where the extension is registered.

| Property         | Description                                                                                  | Type   | Default |
|------------------|----------------------------------------------------------------------------------------------|--------|---------|
| extension-points | Map of extension-point id → package/hook namespace consumers register against.               | object | —       |

## script

WordPress script handle for this app's JavaScript bundle. Must already be registered with WordPress (via `wp_register_script`) before the manifest references it. The runtime enqueues this handle when the app mounts, supporting WordPress's standard dependency resolution and code-splitting. Same pattern as `block.json`'s `editorScript`.

| Property | Description                                                              | Type   | Default |
|----------|--------------------------------------------------------------------------|--------|---------|
| script   | Registered script handle matching `^[a-z][a-z0-9-]*$`.                   | string | —       |

## style

Optional WordPress style handle for this app's CSS. Enqueued alongside the script when the app mounts. Apps with no dedicated styles (relying entirely on WPDS tokens for theming) may omit this field.

| Property | Description                                                       | Type   | Default |
|----------|-------------------------------------------------------------------|--------|---------|
| style    | Registered style handle matching `^[a-z][a-z0-9-]*$`.             | string | —       |

## window

Optional window-mount hints for engines that mount this app inside a window-frame region (windowed / MDI / desktop-style engines). Default engines (sidebar + toolbar + content) ignore the block entirely. Engines consult these fields on mount and apply sensible defaults if any field is missing.

```json
{
	"window": {
		"defaultSize": { "w": 960, "h": 720 },
		"minSize": { "w": 480, "h": 360 },
		"multiInstance": true,
		"icon": "post"
	}
}
```

### Window fields

| Property        | Description                                                                                                                          | Type    | Default |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| defaultSize     | Preferred initial window size in CSS pixels. `{ w, h }` — both required when set; integers `>= 1`.                                    | object  | —       |
| minSize         | Minimum window size in CSS pixels. `{ w, h }` — both required when set; integers `>= 1`. The compositor enforces this floor when the user resizes. | object  | engine policy (typically `{ w: 320, h: 240 }`) |
| chrome          | Engine-defined window chrome style identifier. Unrecognized values fall back to the engine's default chrome.                          | string  | engine default |
| multiInstance   | When `true`, the app may be opened as multiple simultaneous windows with independent state. When `false`, re-opening focuses the existing window. | boolean | `false` |
| icon            | Icon registry name (resolved by the active engine's icon table). Used for window-frame titlebar, taskbar/dock entry, overview switcher. | string  | generic app icon |

## slots

Optional. Apps that host sub-mount-points (dashboard hosts, layout containers) declare the named slots they expose to other apps in the same screen's `apps[]` array. Each entry under `slots` is keyed by a kebab-case slot id and requires a `label`; `description` and `accepts` are optional.

```json
{
	"slots": {
		"grid": {
			"label": "Dashboard Grid",
			"description": "Tile grid that lays widgets out by CSS Grid auto-flow.",
			"accepts": "widget"
		}
	}
}
```

A screen mounting `core:dashboard-host` (which declares a `grid` slot) gains the `grid` slot for use by any other app in the screen with `apps[i].slot: "grid"`.

| Property    | Description                                                                                                                                                              | Type   | Default |
|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| label       | **Required.** Human-readable slot name, surfaced in IDE auto-completion and cascade-audit reports. Translatable.                                                          | string | —       |
| description | Optional one-line description of what mounts in this slot and how the slot host arranges its children. Translatable.                                                       | string | —       |
| accepts     | Hint to authoring tools about what belongs in the slot: `app` (full screen-style apps), `widget` (tile-style widgets sized via `slotHints`), or `any`. Not load-bearing.   | string | `"app"` |

## slotHints

Optional. Size + position defaults the app prefers when it is mounted into a grid-style slot exposed by another app or engine. New in v3 — replaces the v2 `dashboardWidget` block by separating intrinsic defaults (this block) from per-install placement (`screens[id].apps[i]` entries). Every field is overrideable by the placing entry (`screens[id].apps[].size` / `position`); slot hosts that don't understand grid sizing ignore the block entirely. Widget identity (title, hidden-state) lives on the `screens[id].apps[i]` entry that places the widget.

```json
{
	"slotHints": {
		"defaultSize": { "w": 2, "h": 1 },
		"minSize":     { "w": 1, "h": 1 },
		"position":    "auto"
	}
}
```

| Property      | Description                                                                                                                                          | Type             | Default       |
|---------------|------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|---------------|
| defaultSize   | Initial `{ w, h }` size in grid cells. Both `w` and `h` required when set; integers `>= 1`.                                                          | object           | `{ w: 1, h: 1 }` |
| minSize       | Floor `{ w, h }` size in grid cells. Both required when set; integers `>= 1`. The host clamps `workspace.json` overrides to this floor.                  | object           | `{ w: 1, h: 1 }` |
| position      | `"auto"` (auto-flow) or explicit `{ row, col }` (1-indexed CSS Grid coordinates). Both `row` and `col` required when an object is given.             | string \| object | `"auto"`      |

## dataView

Optional. The app's baseline `dataView` family — the `(kind, name)` pair it primarily renders, plus a `variants: { <id>: <doc> }` family that ships the complete variant set (`_default` plus drafts / pending / trash / active / inactive / etc.) in a single block. The PHP resolver injects each declared variant into `settings.dataViews[kind][name][variant]` at the `core` origin so workspace.json cascade origins (site, role, user) can override per-triple. Apps that don't render an entity list (command palette, dashboard host, simple editor, iframe wrappers) omit this block.

See [`docs/dataview-config.md`](../dataview-config.md) for the consumer-facing reference: the 3-axis registry, the `extends` chain, filter hooks, REST endpoints, and the `useDataView` React hook.

```json
{
	"dataView": {
		"kind": "postType",
		"name": "post",
		"variants": {
			"_default": {
				"fieldsRef":   "core/post-fields",
				"defaultView": { "type": "table", "perPage": 25 },
				"actions":     [ { "id": "edit", "label": "Edit", "isPrimary": true } ]
			},
			"drafts": {
				"extends":     "_default",
				"defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "draft" } ] }
			}
		}
	}
}
```

### dataView fields

`kind` and `name` are required. `variants._default` is required when `variants` is declared.

| Property        | Description                                                                                                                                                  | Type    | Default |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| kind            | Entity kind, matching `@wordpress/core-data` kinds (`postType`, `root`, `taxonomy`, etc.). Pattern: `^[A-Za-z][A-Za-z0-9_-]*$`. Required.                     | string  | —       |
| name            | Entity name (`post`, `page`, `user`, `comment`). Pattern: `^[A-Za-z][A-Za-z0-9_-]*$`. Required.                                                              | string  | —       |
| variants        | Map of variant id → dataView doc. Must include `_default` (the unqualified base). Variants resolve independently — opt into inheritance via `extends`.        | object  | —       |

### variant entry

Each entry under `variants` is a complete dataView document. The shape mirrors `@wordpress/dataviews`' `<DataViews>` + `<DataForm>` props.

| Property        | Description                                                                                                                                                  | Type    | Default |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| extends         | Optional. Variant id to inherit from. Recursive, cycle-safe, max depth 10. Resolution: shallow-merge per-field over the resolved parent doc.                  | string  | —       |
| fieldsRef       | Reference to a `settings.dataFields` entry id (in workspace.json) or a programmatically-registered collection.                                                    | string  | —       |
| fields          | Field descriptors. Each entry requires `id`, `type`, `label`.                                                                                                | array   | —       |
| titleField      | Field id used as the row title.                                                                                                                              | string  | —       |
| defaultView     | Initial DataViews `view` object (`type`, `search`, `filters`, `page`, `perPage`, `sort`, `fields`, `titleField`, `layout`).                                  | object  | —       |
| defaultLayouts  | DataViews `defaultLayouts` prop. Keys are layout ids (`table`, `grid`, etc.); values are layout-specific config objects.                                     | object  | —       |
| actions         | Action descriptors. Each entry requires `id`, `label`.                                                                                                       | array   | —       |

## documentation

Documentation contract: machine-readable description of what the app does at runtime, intended for reviewers, ecosystem tooling, and authors rebuilding the app on a different design system or framework. Not load-bearing: the runtime does not read or enforce any field here.

The contract pairs with a sibling `app.md` prose document — structured facts live here, narrative explanation lives in markdown.

### Top-level documentation fields

| Property               | Description                                                                                                                                                    | Type   | Default |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| purpose                | One-paragraph plain-English description of what the app does and who it serves. Longer than `description`. Translatable.                                       | string | —       |
| rebuilds               | Slug of the tier-2 screen specification under `docs/screens/` this app rebuilds (e.g. `dashboard-home`, `posts`). Omitted for workspace-only apps.                  | string | —       |
| data                   | Data dependencies. Splits into `reads` and `writes`.                                                                                                            | object | —       |
| url                    | URL participation contract. Splits into `reads-slots`, `writes-slots`, `navigates`.                                                                             | object | —       |
| states                 | User-visible runtime states the app cycles through (`loading`, `empty`, `error`, `ready`, `saving`, `saved`, `with-edits`, `permission-denied`).                | array  | —       |
| interactions           | User actions the app responds to. Each entry is a trigger → effect pair, with optional guards.                                                                  | array  | —       |
| a11y                   | Accessibility contract: focus management, app-owned keyboard shortcuts, screen-reader affordances.                                                              | object | —       |
| constraints            | Framework-, WPDS-, or WordPress-specific gotchas a reimplementation must account for.                                                                            | array  | —       |
| design-system-leakage  | Specific `@wordpress/*` imports the app cannot do without. A rebuild on a non-WPDS DS must provide functional equivalents for every entry.                       | array  | —       |

### documentation.data.reads (entry shape)

Each read entry requires `source` and `via`.

| Property   | Description                                                                                                                                                            | Type   | Default |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| source     | REST endpoint (`/wp/v2/posts`), `core-data` entity path (`postType/post`, `root/site`), external URL, or window-global property (`window.wpAdminWorkspaces.user`). Required. | string | —       |
| via        | One of `core-data`, `api-fetch`, `window-global`, `external`, `commands`, `kernel-config`. Required.                                                                  | string | —       |
| context    | REST context: `view`, `edit`, or `embed`. `edit` is required for any field whose `raw` value will be edited.                                                          | string | —       |
| purpose    | What this read is for in the app's flow.                                                                                                                               | string | —       |
| fields     | Notable fields read from the record (e.g. `[ "title.raw", "status", "author", "date" ]`).                                                                              | array  | —       |
| query      | Notable query args the app passes. Dynamic args document the keys, not the values.                                                                                     | object | —       |

### documentation.data.writes (entry shape)

Each write entry requires `source`, `via`, and `operation`.

| Property   | Description                                                                                                                                                            | Type   | Default |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| source     | REST endpoint or `core-data` entity path. Required.                                                                                                                    | string | —       |
| via        | One of `core-data`, `api-fetch`, `external`. Required.                                                                                                                 | string | —       |
| operation  | Mutation kind: `create`, `update`, `partial-update`, `delete`, `trash`, `bulk-delete`, `bulk-update`, `upload`, `custom`. Required.                                    | string | —       |
| purpose    | What this write is for (e.g. `Approve a pending comment`).                                                                                                              | string | —       |
| invalidates| Cache keys or entity queries that must be invalidated after the write. `core-data`'s `useEntityRecord` short-circuits the same store; `useEntityRecords` queries do not — list the entity paths explicit invalidation must hit. | array  | —       |

### documentation.url

| Property      | Description                                                                                                              | Type             | Default |
|---------------|--------------------------------------------------------------------------------------------------------------------------|------------------|---------|
| reads-slots   | Named URL query slots the app reads. `_self` = primary hash path; named slots are e.g. `screen`, `detail`.               | array of string  | —       |
| writes-slots  | Named URL query slots the app writes through the router (e.g. NavigationApp writes `screen` for drill-down state).       | array of string  | —       |
| navigates     | Route patterns the app navigates to via `navigate()` or anchor hrefs. Patterns use `{param}` placeholders.                | array of string  | —       |

### documentation.states (entry shape)

Each state entry requires `id` and `renders`.

| Property | Description                                                                                          | Type   | Default |
|----------|------------------------------------------------------------------------------------------------------|--------|---------|
| id       | State identifier, kebab-case (`loading`, `empty`, `error`, `ready`, `saving`, etc.). Required.       | string | —       |
| when     | Condition that puts the app into this state (e.g. `records === null`, `hasEdits && isSaving`).        | string | —       |
| renders  | Short prose describing what the user sees. Reimplementations target this output, not the component. Required. | string | —       |

### documentation.interactions (entry shape)

Each interaction entry requires `trigger` and `effect`.

| Property | Description                                                                                                  | Type   | Default |
|----------|--------------------------------------------------------------------------------------------------------------|--------|---------|
| trigger  | User input or system event (e.g. `Click row title`, `Press Cmd+S`, `Submit Quick Draft form`). Required.     | string | —       |
| effect   | State change, navigation, or mutation that results (e.g. `Navigate to #/posts/{id}/edit`). Required.          | string | —       |
| guards   | Capability checks, eligibility checks, or invariants enforced before the effect runs.                         | array  | —       |

### documentation.a11y

| Property         | Description                                                                                                          | Type   | Default |
|------------------|----------------------------------------------------------------------------------------------------------------------|--------|---------|
| focus-management | How the app manages focus on mount, route changes, modal open/close, and post-action transitions.                    | string | —       |
| keyboard         | App-owned keyboard shortcuts. Each entry is `{ keys, action }` — both fields required. Workspace-level bindings are out of scope. | array  | —       |
| screen-reader    | Live regions, `aria-live` announcements, `aria-current` usage, and other screen-reader-specific affordances.          | string | —       |

### documentation.constraints (entry shape)

Each constraint requires `concern` and `note`.

| Property | Description                                                                                                                              | Type   | Default |
|----------|------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| concern  | Short identifier for the constraint (e.g. `null-guard-records`, `dataviews-import-path`, `self-delete-guard`). Required.                  | string | —       |
| note     | What the constraint is and what a reimplementation must do to honor it. Required.                                                         | string | —       |

### documentation.design-system-leakage (entry shape)

Each leakage entry requires `import` and `purpose`.

| Property | Description                                                                                                                              | Type   | Default |
|----------|------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| import   | Bare-import path the app loads (e.g. `@wordpress/dataviews/wp`, `@wordpress/ui#Button`, `@wordpress/icons#trash`). Required.              | string | —       |
| purpose  | What the import provides and why the app needs it. Required.                                                                              | string | —       |
