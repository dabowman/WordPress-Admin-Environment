# workspace.json Reference

`workspace.json` is the install-decision file that describes a single WP Admin Workspaces workspace: which engine renders it, the screens the workspace exposes, the menu hierarchy that surfaces those screens, the keyboard commands and palette entries, persistent chrome widgets, REST preloads, and the styles that brand the install. Anything intrinsic to apps or engines belongs in their respective manifests (`app.json`, `engine.json`) — `workspace.json` is the layer that combines them into a shipped admin experience.

Multiple `workspace.json` files can coexist on a site (one per workspace). The active workspace is selected per-site, per-role, or per-user through the cascade.

This reference covers the workspace.json workspace schema (`workspace.json`).

## In this article

- [JSON Schema](#json-schema)
- [Top-level shape](#top-level-shape)
- [version](#version)
- [$wpds](#wpds)
- [name](#name)
- [title](#title)
- [description](#description)
- [user-switchable](#user-switchable)
- [engine / default-screen / frame](#engine--default-screen--frame)
- [theme-support](#theme-support)
- [settings](#settings)
- [screens](#screens)
- [menu](#menu)
- [commands](#commands)
- [styles](#styles)
- [preload](#preload)
- [regions / routes](#regions--routes-escape-hatches)
- [customizable](#customizable)

## JSON Schema

`workspace.json` documents validate against a published JSON Schema. Reference it from the top of every file so IDEs can offer completion and inline error reporting:

```json
{
	"$schema": "https://schemas.wp.org/workspace.json",
	"version": 3,
	"$wpds": "6.9",
	"name": "my-workspace",
	"engine": "core:default",
	"default-screen": "dashboard-home",
	"screens": {
		"dashboard-home": {
			"label": "Home",
			"path": "/dashboard/home",
			"app": "iframe:index.php"
		}
	}
}
```

The schema is also available in-repo at [`docs/schemas/workspace.json`](../schemas/workspace.json) for offline tooling. Relative `$schema` paths are accepted (mirroring the `block.json` convention).

**Required fields:** `version`, `$wpds`, `name`, `engine`, `screens`. All other top-level fields are optional. `additionalProperties` is `false` — unknown top-level fields are a validation error.

## Top-level shape

| Block | Role | Cascade behavior |
|-------|------|-----------------|
| `engine` | Top-level (required) — which engine renders the workspace. | Last writer wins; `role`/`user` origins can never write it (hardcoded deny). |
| `default-screen` | Top-level — screen id the workspace lands on when no URL hash is present. | Last writer wins. |
| `frame` | Persistent furniture wired into the workspace: branding, notice hosts, persistent widgets (toolbar / sidebar-footer / status-bar). Distinct from `styles.chrome`, which paints it. | Deep-merge per-field. `frame.widgets.<slot>` arrays merge by `id`. |
| `theme-support` | READ-ONLY synthetic block stamped during resolution — active-theme metadata (`block-theme`, `theme-supports`) used to prune the Appearance menu group. Never authored. | Stamped post-cascade; author values are ignored. |
| `settings` | Reusable definition registries referenced from elsewhere by id. Contains `dataViews` (3-axis `@wordpress/dataviews` configuration keyed by `kind → name → variant`) and `dataFields` (named field collections). Mirrors the theme.json `settings` pattern. | Deep-merge per-registry, per-entry. |
| `screens` | The map of every screen the workspace exposes. Each entry defines what a screen IS (label, icon, apps[], path, slot, mode, permissions, `dataViewRef`/`dataView`, preload). Says nothing about where the screen appears in any menu — that's the `menu` block's job. | Deep-merge per-screen, per-field. `screens[id].apps[]` merges by `id`. `hidden: true` at any origin removes the screen. |
| `menu` | Engine-agnostic IA — a tree of nested items. Each item is keyed by id. Items with sub-items become containers (no separate "groups" block); item keys that match a screen id implicitly bind to that screen. | Deep-merge per-item, nested. Array-merge-by-id applies through every depth. |
| `commands` | First-class palette entries + keyboard shortcuts. Each command has an explicit `id` field. | Merge by `id`. |
| `styles` | Tokens, slot overrides, chrome — the theme-developer surface (see [§9 of the design spec](../wp-admin-workspaces-design-spec.md#9-tokens-and-styling)). | Deep-merge per-field. |
| `preload` | Workspace-boot REST preloads. Additional per-screen preloads live in `screens[id].preload`. | Additive concatenation; dedupe by `path+method`. |
| `regions` | **Escape hatch** — direct region tree for engines that need it (windowed, MDI, multi-pane). | Deep-merge. Optional in v3; `screens` block synthesizes regions for the common case. |
| `routes` | **Escape hatch** — direct URL→app mapping for non-screen compositions. | Deep-merge by route key. Optional in v3. |

For the full design rationale around each block, see [`docs/schema-sketch.md`](../schema-sketch.md). This reference covers per-field shape.

## version

Schema version this document targets. Must be `3`. The runtime accepts higher versions with a warning and best-effort load; there is no automatic normalization from other shapes.

| Property | Description                                              | Type    | Default |
|----------|----------------------------------------------------------|---------|---------|
| version  | Schema version. Must be `3` for v3 workspaces.               | integer | —       |

## $wpds

Pinned WPDS slot-matrix version, expressed as a WordPress release version (`6.9`, `7.0`, `7.1.2`). The resolver loads `wpds-defaults-{$wpds}.json` as the implicit `core` baseline so missing author values cannot break the runtime, and validates the `styles` tree against the WPDS slot list at this version. Bumping `$wpds` adopts new slots that may have appeared in later WordPress releases.

This field is required because the WPDS surface is the workspace's contract with apps and engines; an unpinned `styles` tree cannot be validated.

| Property | Description                                       | Type   | Default |
|----------|---------------------------------------------------|--------|---------|
| $wpds    | WordPress version string, e.g. `"6.9"`, `"7.0"`.  | string | —       |

## name

Unique kebab-case identifier for this workspace on this install. Used in cascade origin storage, WP-CLI commands (`wp admin-workspace activate <name>`), and the URL when a workspace-switcher exists. Must be unique within the install — registering a second workspace with the same name fails.

Examples: `wp-admin-default`, `single-pane-demo`, `desktop-demo`, `acme-corp`.

| Property | Description                                                | Type   | Default |
|----------|------------------------------------------------------------|--------|---------|
| name     | Kebab-case slug matching `^[a-z][a-z0-9-]*$`.              | string | —       |

## title

Human-readable label for this workspace. Shown in the workspace-switcher UI (when enabled), admin-page metadata, and plugin install screens. Translatable. Falls back to `name` when omitted.

| Property | Description                                       | Type   | Default |
|----------|---------------------------------------------------|--------|---------|
| title    | Display name. Translatable.                       | string | `name`  |

## description

Optional human-readable description of what this workspace is for. Translatable.

| Property    | Description                            | Type   | Default |
|-------------|----------------------------------------|--------|---------|
| description | One-sentence to one-paragraph summary. | string | —       |

## user-switchable

When `true`, individual users may select this workspace as their personal default via the user-prefs UI (overriding the site or role default). When `false`, only site admins and role configuration can select this workspace. Setting this true is forward-compatible — the cascade respects user-origin workspace selection regardless of UI availability.

| Property         | Description                                                | Type    | Default |
|------------------|------------------------------------------------------------|---------|---------|
| user-switchable  | Allow individual users to opt into this workspace.         | boolean | `false` |

## engine / default-screen / frame

Install-level intrinsics. `engine` (top-level, required) and `default-screen` (top-level) name the renderer and landing screen; `frame` holds the persistent furniture that survives screen navigation — branding, notices, and persistent widgets. (`frame` is *what furniture exists*; `styles.chrome` is *how it's painted*.)

```json
{
	"engine": "core:default",
	"default-screen": "dashboard-home",
	"frame": {
		"branding": { "logo": "./assets/acme-logo.svg", "title": "Acme Corp" },
		"notices":  {
			"banner":   { "app": "core:notices-banner" },
			"snackbar": { "app": "core:notices-snackbar" }
		},
		"widgets": {
			"toolbar":        [ { "id": "search",        "app": "core:toolbar-actions" } ],
			"sidebar-footer": [ { "id": "user-menu",     "app": "core:user-menu" } ]
		}
	}
}
```

| Property         | Description                                                                                                                                          | Type    | Default |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| engine           | Top-level, **required**. Identifier of the engine that renders this workspace. Common values: `core:default`, `core:single-pane`, `core:desktop`.     | string  | —       |
| default-screen   | Top-level. Screen id the workspace lands on when no URL hash is present. Optional — falls through to the first permitted screen with a `path` when omitted or denied by capability gating. | string  | —       |
| frame.branding   | `{ logo, title, icon }` — install-level branding shown by `core:site-hub` and similar chrome.                                                         | object  | —       |
| frame.notices    | `{ banner, snackbar }` — apps that render workspace-scope system notices.                                                                            | object  | —       |
| frame.widgets    | Map of `<slot>: [ { id, app, ... } ]` — apps that mount persistently across every screen, into engine-declared workspace slots.                       | object  | —       |

## theme-support

READ-ONLY synthetic block stamped during resolution (`WP_Admin_Workspaces_Appearance_Menu`) — authors never declare it. Carries the active-theme determination used to prune the Appearance menu group: `block-theme` (boolean, from `wp_is_block_theme()`) plus a `theme-supports` map (feature → boolean, from `current_theme_supports()`). It appears in the resolved document agents and tooling read back; writing it in an authored `workspace.json` has no effect.

## settings

Reusable definition registries — `dataViews` (3-axis `@wordpress/dataviews` configuration) and `dataFields` (named field collections). Mirrors the theme.json `settings` pattern: global definitions referenced from elsewhere by id.

See [`docs/dataview-config.md`](../dataview-config.md) for the author-facing reference covering dataView semantics, the cascade override decision matrix, the `(kind, name, variant)` triple, the `extends` chain, filter hooks, REST endpoints, and the `useDataView` React hook.

```json
{
	"settings": {
		"dataViews": {
			"postType": {
				"post": {
					"_default": {
						"fieldsRef": "core/post-fields",
						"defaultView": { "type": "table", "perPage": 20 },
						"actions":     [ { "id": "edit", "label": "Edit" } ]
					},
					"drafts": {
						"extends": "_default",
						"defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "draft" } ] }
					}
				}
			}
		},
		"dataFields": {
			"core/post-fields": {
				"kind":   "postType",
				"name":   null,
				"fields": [
					{ "id": "title",  "type": "text",     "label": "Title", "enableGlobalSearch": true },
					{ "id": "status", "type": "text",     "label": "Status" },
					{ "id": "date",   "type": "datetime", "label": "Date" }
				]
			}
		}
	}
}
```

| Block               | Description                                                                                                                                          |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| settings.dataViews  | 3-axis dataView registry. Keyed `kind → name → variant`. Each leaf is a complete dataView doc (`fields`, `defaultView`, `defaultLayouts`, `actions`, `titleField`, `fieldsRef`). Variants resolve independently unless `extends` is declared. |
| settings.dataFields | Named field collections. Each entry binds an array of field descriptors to `(kind, name)` (or universal when `name === null`). Referenced from dataView docs via `fieldsRef`. |

The 3-axis registry shape is `kind → name → variant`.

## screens

The map of every screen the workspace exposes. Each entry is keyed by a kebab-case screen id, unique within this `workspace.json`. A screen declares what mounts (single-app shorthand `app` + `config`, or multi-app `apps[]`), where it mounts (`path` for URL routing, `slot` for non-`_self` URL slots), how it presents (`mode`), who can see it (`permissions`), and what data it surfaces (`dataViewRef` + optional `dataView` overlay).

```json
{
	"screens": {
		"posts": {
			"label":      "Posts",
			"icon":       "post",
			"path":       "/posts",
			"app":        "core:posts",
			"config":     { "postType": "post" },
			"dataViewRef": "postType/post/_default",
			"permissions": { "capabilities": [ "edit_posts" ] },
			"mode":        "default",
			"preload":     [ "/wp/v2/categories?context=view" ]
		},
		"post-edit": {
			"label":  "Edit Post",
			"path":   "/posts/{id}/edit",
			"app":    "core:editor",
			"config": { "postType": "post", "postId": "{id}" },
			"mode":   "focus"
		},
		"command-palette": {
			"label": "Command Palette",
			"slot":  "palette",
			"mode":  "modal",
			"app":   "core:command-palette"
		}
	}
}
```

### Screen object

| Property        | Description                                                                                                                                                  | Type             | Default |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------|---------|
| label           | Display label. Used by the menu (when bound) and by the screen header.                                                                                       | string           | —       |
| icon            | Icon registry name resolved by the active engine's icon table.                                                                                                | string           | —       |
| description     | Optional tooltip / drilldown subtitle.                                                                                                                       | string           | —       |
| path            | URL pattern routing to this screen (default slot `_self`). Pattern syntax: static segments, `{param}` captures, `/*` wildcard suffix.                         | string           | —       |
| slot            | Workspace-scope URL slot the screen mounts in. Defaults to `_self`; use `palette` for command-palette screens, engine-declared slots like `detail` otherwise. | string           | `_self` |
| app             | Single-app shorthand. Mutually compatible with `apps[]` (the resolver normalizes to long form).                                                              | string           | —       |
| apps            | Multi-app long form. Each entry `{ id (required), app, config, slot, size?, position?, routing? }`. Screen-scope slots are engine- or app-declared.          | array            | —       |
| config          | Configuration object passed to the screen's primary app. `{paramname}` substitutions resolve against URL params.                                              | object           | —       |
| dataViewRef     | Reference to a `settings.dataViews` triple, formatted `kind/name/variant`.                                                                                    | string           | —       |
| dataViewKind / dataViewName / dataViewVariant | Explicit triple (alternative to `dataViewRef`).                                                                                                | string           | —       |
| dataView        | Inline overlay that deep-merges on top of the resolved triple — id-keyed `fields[]` and `actions[]` merge with `null` tombstones.                            | object           | —       |
| mode            | Engine-declared chrome mode. Defaults: `default`, `focus`, `takeover`, `modal`. Plugin-contributed modes accepted.                                            | string           | `default` |
| regions         | Per-screen region overrides (escape hatch, e.g. tweak `hidden`/`compact` flags on individual engine regions).                                                | object           | —       |
| permissions     | Access policy `{ capabilities: [], roles: [] }` with OR semantics. Default when absent: admin-only. See [Permissions](../schema-sketch.md#permissions).    | object           | —       |
| preload         | REST paths to hydrate when this screen activates. Additive with workspace-level `preload[]`.                                                                  | array            | —       |
| hidden          | When `true` at any cascade origin, the screen is suppressed entirely.                                                                                        | boolean          | `false` |
| iconSource      | Arbitrary-icon escape hatch `{ type, value }` for icons the name-based registry can't resolve (data-URI SVG, image URL). Emitted by the classic-menu bridge; preferred over `icon` when both are present. | object           | —       |
| customizable    | Consumer-origin write allowlist for this screen (see [customizable](#customizable)). The hardcoded deny-list still blocks `permissions` and `app` from `role`/`user` writes even if listed. | boolean \| array | `false` |
| legacy_path     | Classic wp-admin script this screen replaces (e.g. `edit.php`). Powers both the JS admin-link interceptor and the server-side classic→workspace redirect (GET-only). | string           | —       |
| legacy_query    | Query-string equalities that must all match for the `legacy_path` mapping to apply (e.g. `{ "post_type": "page" }`).                                          | object           | —       |
| legacy_params   | Maps `{token}` segments in the screen `path` to classic query keys so captured ids round-trip (e.g. `{ "id": "post" }` for `post.php?post=42`).               | object           | —       |

### `apps[]` entry

| Property | Description                                                                                                       | Type   | Default |
|----------|-------------------------------------------------------------------------------------------------------------------|--------|---------|
| id       | Cascade-merge key. Required.                                                                                      | string | —       |
| app      | App id to mount. Required on the originating entry; cascade overrides may omit `app` to deep-merge `config` / `slot` only against an existing id. | string | —       |
| config   | Configuration passed to the app.                                                                                  | object | —       |
| slot     | Screen-scope slot the app mounts in. Engine-declared (`detail`, `inspector`, etc.) or app-declared (`grid`).      | string | `_self` (the screen's primary region) |
| size     | `{ w, h }` size hint when slotted into a grid-style container.                                                    | object | from app manifest `slotHints` |
| position | `"auto"` or `{ row, col }` (1-indexed CSS Grid coordinates).                                                       | string \| object | `"auto"` |
| routing  | Per-app routing override. `routing.mode: "mirror"` makes the slot synthesize value from URL primary path.        | object | —       |

## menu

Engine-agnostic information-architecture tree. Each item is keyed by id, nested via `items`. Item keys matching a screen id implicitly bind to that screen — `label` / `icon` / `permissions` flow through from the screen automatically.

```json
{
	"menu": {
		"content": {
			"label":    "Content",
			"icon":     "post",
			"position": 10,
			"items": {
				"posts": {
					"position": 30,
					"items": {
						"posts-drafts":  { "position": 10 },
						"posts-pending": { "position": 20 },
						"categories":    { "position": 40 }
					}
				},
				"pages":  { "position": 40 },
				"media":  { "position": 50 }
			}
		},
		"appearance": {
			"label":    "Appearance",
			"icon":     "appearance",
			"position": 20,
			"items": {
				"themes":      { "position": 10 },
				"site-editor": { "position": 20 }
			}
		},
		"view-site": {
			"label":    "View Site",
			"icon":     "external",
			"href":     "{site_url}",
			"external": true,
			"position": 99
		}
	}
}
```

### Menu item object

| Property      | Description                                                                                                | Type    | Default |
|---------------|------------------------------------------------------------------------------------------------------------|---------|---------|
| label         | Optional override of the bound screen's label. Required for items not bound to a screen.                   | string  | —       |
| icon          | Optional override of the bound screen's icon. Required for items not bound to a screen.                    | string  | —       |
| description   | Optional tooltip / drilldown subtitle.                                                                     | string  | —       |
| position      | Sort order among siblings at this depth. Lower = earlier.                                                  | integer | registration order |
| items         | Nested child items, keyed by id. Same shape recursively.                                                   | object  | —       |
| href          | External link target. Token interpolation supported (e.g. `{site_url}`).                                   | string  | —       |
| external      | When true with `href`, opens in a new browser tab.                                                          | boolean | `false` |
| separator     | Renders as a visual separator. Other fields ignored.                                                       | boolean | `false` |
| hidden        | Suppresses the item from rendering. Subtree is still in the tree for cascade addressing.                   | boolean | `false` |
| permissions   | Visibility prune for items NOT bound to a screen (manual `href` links — e.g. an "Add Post" item linking classic `post-new.php`). Same OR-semantic shape as screen permissions (`{ "capabilities": [...], "roles": [...] }`); items without it render for everyone. Screen-bound items inherit the screen's permissions instead. Visibility-only — the link target enforces its own capabilities server-side. | object  | —       |

### Menu renderers

The active engine's `menu-renderer` decides how nested items display: `sidebar-drilldown` (`core:default`), `sidebar-tree`, `dock` (`core:desktop`), or `drawer` (`core:single-pane`). Renderers may impose a depth limit (default: 3).

## commands

First-class palette + keyboard-shortcut bindings. Each command has an explicit `id`; the cascade addresses commands by id and tombstones via `null`.

```json
{
	"commands": [
		{ "id": "open-palette",  "shortcut": "Mod+K",       "invoke":   "core:command-palette", "label": "Open Command Palette" },
		{ "id": "new-post",      "shortcut": "Mod+Shift+N", "navigate": "/posts/new",            "label": "New Post" },
		{ "id": "go-to-posts",   "shortcut": "g p",         "navigate": "/posts",                "label": "Go to Posts" }
	]
}
```

### Command object

| Property  | Description                                                                                                                                | Type   | Default |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| id        | Cascade key. Required.                                                                                                                     | string | —       |
| shortcut  | Keystroke spec, e.g. `Mod+K`. Follows `@wordpress/keyboard-shortcuts` syntax. Optional when the command is palette-only.                  | string | —       |
| invoke    | App id to invoke. The app must declare `platform.core:triggerable: true`. Mutually exclusive with `navigate`.                              | string | —       |
| navigate  | URL pattern to navigate to. Pure shortcut — no app mounts directly. Mutually exclusive with `invoke`.                                      | string | —       |
| label     | Display label in the palette UI.                                                                                                            | string | —       |

Each entry carries an explicit `id` — the cascade addresses commands by id and deep-merges per-field.

## styles

WPDS-shaped style tree. Authors override WPDS slot values (typically via DTCG token aliases into a sibling `tokens.json`) and workspace-only chrome slots. Output is `--wpds-*` (full surface), `--wp-admin-workspaces--chrome--*` (chrome extensions), and a fixed compat bridge for legacy WordPress consumers.

Slot values may be DTCG token aliases (`"{color.brand.500}"`), literal CSS values (`"#3858e9"`, `"16px"`), or inline DTCG objects. WPDS slot validation runs against the pinned `$wpds` matrix at the runtime resolver — the schema is intentionally loose here because the slot list grows with WordPress versions.

### styles.theme

Seeds for `@wordpress/theme.ThemeProvider`. Primary customization path: pass seeds; the provider derives the full WPDS token matrix (color ramps, density-tuned dimensions). Allowed alongside `styles.regions[id].theme` and `styles.applications[id].theme` for nested provider overrides on a subtree.

| Property        | Description                                                                                                    | Type   | Default       |
|-----------------|----------------------------------------------------------------------------------------------------------------|--------|---------------|
| color.primary   | Primary/accent seed. Any valid CSS color.                                                                      | string | `#3858e9`     |
| color.bg        | Background seed. ThemeProvider derives neutral surface ramp and toggles light/dark mode based on luminance.    | string | `#f8f8f8`     |
| cursor.control  | Cursor for non-link interactive controls. `default` or `pointer`.                                              | string | `pointer`     |
| density         | Spacing scale. `default`, `compact`, or `comfortable`.                                                         | string | `default`     |

### styles direct-slot overrides

Escape hatch for slot values that seeds can't express. Layered over ThemeProvider's seed-derived defaults via inner-scope CSS specificity.

| Property    | Description                                                                                                                                   | Type   | Default |
|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| color       | Direct `--wpds-color-*` slot overrides.                                                                                                       | object | —       |
| dimension   | Direct dimension token overrides.                                                                                                             | object | —       |
| border      | Direct border token overrides.                                                                                                                | object | —       |
| elevation   | Direct elevation / shadow token overrides.                                                                                                    | object | —       |
| font        | Direct font / typography token overrides.                                                                                                     | object | —       |

### styles.chrome

Workspace-only chrome extension slots — surfaces WPDS does not yet describe. Sub-namespaces include `sidebar`, `toolbar`, `siteHub`, `content`, `canvas`. Authors may add custom slugs; engines that read custom slugs declare them in their manifest so the runtime validates at activation time.

| Property         | Description                                                                                              | Type   | Default |
|------------------|----------------------------------------------------------------------------------------------------------|--------|---------|
| chrome.sidebar   | Sidebar surface palette (background, foreground, border, etc.).                                          | object | —       |
| chrome.toolbar   | Toolbar surface palette.                                                                                 | object | —       |
| chrome.siteHub   | Site-hub surface palette.                                                                                | object | —       |
| chrome.content   | Content surface palette.                                                                                 | object | —       |
| chrome.canvas    | Workspace-wide background / foreground.                                                                       | object | —       |

### styles.regions

Per-region style overrides, keyed by region id. Same shape as the top-level `styles` tree. Overrides scope to `[data-region-id="..."]` selectors and win for that region's container and descendants.

### styles.applications

Per-app style overrides, keyed by app id. Same shape as the top-level `styles` tree. Overrides scope to `[data-app-id="..."]` selectors.

## preload

REST paths to preload server-side and inject as `wp.apiFetch.createPreloadingMiddleware` cache before the workspace bundle runs. Each entry is either a string path (defaults to `GET`) or a `[ path, method ]` tuple. Methods are restricted to `GET` and `OPTIONS`.

Across origins the resolved value is the concatenation of every origin's `preload[]` — there are no override semantics, only additive union. Duplicates by exact `path + method` are deduped before serialization. Conditional preloads belong in a `wp_admin_workspaces_data_{origin}` filter callback. Per-screen preloads live in `screens[id].preload`.

```json
{
	"preload": [
		"/wp/v2/users/me",
		"/wp/v2/types?context=view",
		[ "/wp/v2/posts", "OPTIONS" ]
	]
}
```

### Preload entry

| Form         | Description                                                                                          |
|--------------|------------------------------------------------------------------------------------------------------|
| string       | Shorthand for `[ path, "GET" ]`. Leading slash required.                                              |
| tuple        | `[ path, method ]` where method is `"GET"` or `"OPTIONS"`. Query string is part of the path string.   |

## `regions` / `routes` (escape hatches)

The kernel synthesizes the runtime regions map + routes table from `screens[]` + the active engine's `defaultRegions` (`src/runtime/compile/`). Authors who need a region or route the `screens` shape can't express write top-level `regions` / `routes` blocks — workspace.json's escape-hatch declarations win on per-region-id / per-pattern collision against the synthesis.

See [§5 of the design spec](../wp-admin-workspaces-design-spec.md#5-region-vocabulary) for region declarations and [§6.2](../wp-admin-workspaces-design-spec.md#62-routes-block) for route patterns. Avoid these blocks when the `screens` surface can express the same thing.

## customizable

`customizable` is a per-entry write allowlist: it declares what the consumer cascade origins (`role`, `user`) may write to that entry and its descendants. Trust-tier origins (`core`, `engine`, `plugin`, `site`) author the declaration and are exempt from it — the field is *their* statement about what downstream consumers may touch. Enforcement runs server-side in `WP_Admin_Workspaces_Customizable` before the merge, so blocked fields never enter the resolved tree.

Three accepted shapes:

| Value                  | Meaning                                                                                                          |
|------------------------|------------------------------------------------------------------------------------------------------------------|
| `true`                 | Every field on this entry (and its descendants) is writable by consumer origins.                                 |
| `[ "dotted.path", … ]` | Only the listed dotted paths — relative to the declaring entry — are writable; everything else is locked.        |
| `false` / absent       | Locked. No fields writable downstream (default-deny — same posture as block supports).                           |

The array form requires unique, non-empty strings; the closest `customizable` declaration to a leaf wins as the cascade walks ancestors.

Entry types that honor `customizable`: `frame`, each `screens[id]`, each `menu` item (and its nested `items`), each `commands` entry, each `frame.widgets.<slot>[]` entry, `styles`, each `regions[id]` (and nested child regions), and each `routes` entry.

Two limits always apply regardless of the declaration:

- **Consumer origins are shrink-only.** `role` / `user` can REMOVE entries (e.g. drop a capability from `screens[].permissions`) but never grow an OR-set or add new structure beyond what an allowlist permits.
- **A hardcoded deny-list blocks security-sensitive paths even when listed.** `screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, and `engine` are rejected for consumer origins even with a matching `customizable` allowlist entry.

```json
{
	"engine": "core:default",
	"default-screen": "dashboard-home",
	"frame": {
		"customizable": [ "branding.title" ]
	}
}
```

See [§4.4.2 of the design sketch](../schema-sketch.md) for the full trust-tier rationale and `#/$defs/customizable` in [`docs/schemas/workspace.json`](../schemas/workspace.json) for the schema definition.
