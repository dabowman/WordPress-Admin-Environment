# admin.json Reference

`admin.json` is the install-decision file that describes a single WP Admin Shell shell: which engine renders it, which regions exist on this install, which apps live in those regions, how URLs route, what keystrokes do what, and what the install looks like through token overrides. Anything intrinsic to apps or engines belongs in their respective manifests (`app.json`, `engine.json`) — `admin.json` is the layer that combines them into a shipped admin experience.

Multiple `admin.json` files can coexist on a site (one per shell). The active shell is selected per-site, per-role, or per-user through the cascade.

## In this article

- [JSON Schema](#json-schema)
- [version](#version)
- [$wpds](#wpds)
- [name](#name)
- [title](#title)
- [description](#description)
- [user-switchable](#user-switchable)
- [engine](#engine)
- [regions](#regions)
- [routes](#routes)
- [default-route](#default-route)
- [bindings](#bindings)
- [styles](#styles)
- [viewConfigs](#viewconfigs) (v2 — see `settings.dataViews` in admin-v3)
- [fieldCollections](#fieldcollections) (v2 — see `settings.dataFields` in admin-v3)
- [preload](#preload)
- [dashboardWidgets](#dashboardwidgets)

## JSON Schema

`admin.json` documents validate against a published JSON Schema. Reference it from the top of every file so IDEs can offer completion and inline error reporting:

```json
{
	"$schema": "https://schemas.wp.org/admin/v1.json",
	"version": 1,
	"$wpds": "6.9",
	"name": "my-shell",
	"engine": "core:default",
	"regions": {
		"content": {
			"template": "core:content",
			"routing": { "route-key": "_self" }
		}
	},
	"routes": {
		"/posts": { "app": "core:posts", "config": { "postType": "post" } }
	},
	"default-route": "/posts"
}
```

The schema is also available in-repo at `docs/schemas/admin-v2.json` for offline tooling. Relative `$schema` paths are accepted (mirroring the `block.json` convention).

**Required fields:** `version`, `$wpds`, `name`, `engine`, `regions` (must contain at least one region). All other top-level fields are optional. `additionalProperties` is `false` — unknown top-level fields are a validation error.

**About `routes`:** technically optional, but required in practice for any shell whose regions read apps from the URL via `routing.route-key`. A shell composed entirely of fixed-app regions (every region declares a literal `app` field) can omit `routes` — though this is rare. All seven bundled shells (`wp-admin-default`, `developer-admin`, `content-author`, `client-portal`, `v2-demo`, `single-pane-demo`, `desktop-demo`) declare a `routes` block, because URL-driven mounting is the canonical pattern (spec §6).

## version

`admin.json` schema version this document targets. v1 is the current shape. The runtime accepts higher versions with a warning and best-effort load. Earlier versions (v0 — the MVP flat shape with `branding` / `applications` / `navigation` / `toolbar` at root) are accepted and normalized to v1 internally.

| Property | Description                                              | Type    | Default |
|----------|----------------------------------------------------------|---------|---------|
| version  | Schema version. Must be `1` for the current shape.       | integer | —       |

## $wpds

Pinned WPDS slot-matrix version, expressed as a WordPress release version (`6.9`, `7.0`, `7.1.2`). The resolver loads `wpds-defaults-{$wpds}.json` as the implicit `core` baseline so missing author values cannot break the runtime, and validates the `styles` tree against the WPDS slot list at this version. Bumping `$wpds` adopts new slots that may have appeared in later WordPress releases.

This field is required because the WPDS surface is the shell's contract with apps and engines; an unpinned `styles` tree cannot be validated.

| Property | Description                                       | Type   | Default |
|----------|---------------------------------------------------|--------|---------|
| $wpds    | WordPress version string, e.g. `"6.9"`, `"7.0"`. | string | —       |

## name

Unique kebab-case identifier for this shell on this install. Used in cascade origin storage, WP-CLI commands (`wp admin-shell activate <name>`), and the URL when a shell-switcher exists. Must be unique within the install — registering a second shell with the same name fails.

Examples: `developer-admin`, `content-author`, `client-portal`, `acme-corp`.

| Property | Description                                                | Type   | Default |
|----------|------------------------------------------------------------|--------|---------|
| name     | Kebab-case slug matching `^[a-z][a-z0-9-]*$`.              | string | —       |

## title

Human-readable label for this shell. Shown in the shell-switcher UI (when enabled), admin-page metadata, and plugin install screens. Translatable. Falls back to `name` when omitted.

| Property | Description                                       | Type   | Default |
|----------|---------------------------------------------------|--------|---------|
| title    | Display name. Translatable.                        | string | `name`  |

## description

Optional human-readable description of what this shell is for. Translatable.

| Property    | Description                            | Type   | Default |
|-------------|----------------------------------------|--------|---------|
| description | One-sentence to one-paragraph summary. | string | —       |

## user-switchable

When `true`, individual users may select this shell as their personal default via the user-prefs UI (overriding the site or role default). When `false`, only site admins and role configuration can select this shell. Setting this true is forward-compatible — the cascade respects user-origin shell selection regardless of UI availability.

| Property         | Description                                                | Type    | Default |
|------------------|------------------------------------------------------------|---------|---------|
| user-switchable  | Allow individual users to opt into this shell.             | boolean | `false` |

## engine

Identifier of the engine that renders this shell. References an `id` from a registered engine manifest. The engine determines spatial arrangement, the region-template catalog available, and which platform services are honored. Switching engines requires editing this field (and probably reworking `regions` to use the new engine's templates) — engines are not live-switchable.

Common values: `core:default` (flagship), `core:single-pane` (mobile-first), `core:desktop` (windowed).

| Property | Description                                                  | Type   | Default |
|----------|--------------------------------------------------------------|--------|---------|
| engine   | Namespaced engine id, `core:{name}` or `plugin:{slug}/{name}`. | string | —       |

## regions

The shell's region tree. Each entry is keyed by a kebab-case region id, unique within this `admin.json`. Regions reference engine-shipped templates via `template`, declare from scratch via the full vocabulary (`role` / `layout` / `platform`), or both (template-with-overrides). Each region holds either a fixed app (`app` field) or reads its app from the URL via `routing.route-key`. Regions can declare nested child regions.

```json
{
	"regions": {
		"sidebar": {
			"template": "core:sidebar",
			"app": "core:navigation"
		},
		"content": {
			"template": "core:content",
			"routing": { "route-key": "_self" }
		}
	}
}
```

### Region object

Every region accepts the following fields. The schema enforces two conditional rules:

- A region cannot declare both a fixed `app` and a `routing.route-key` — the two represent incompatible mount modes.
- A region with `config` must also declare `app`. Regions that read their app from the URL receive their config from the matching route entry, not from the region declaration.

| Property        | Description                                                                                                                                                                       | Type    | Default |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| template        | Engine-shipped template id to instantiate. Inherits role, platform, and default-style from the template; locally declared values override.                                        | string  | —       |
| role            | ARIA role. Required when no template is specified.                                                                                                                                | string  | —       |
| layout          | CSS layout properties from the allowed subset (sizing, positioning, flexbox participation). See below.                                                                            | object  | —       |
| platform        | Region-level platform service requests (`core:modal`, `core:dismiss-on`, etc.).                                                                                                  | object  | —       |
| routing         | URL participation. `routing.route-key` names the URL slot whose value resolves to a route; `_self` reads the primary path.                                                       | object  | —       |
| position        | Arrangement hint: `block-start`, `block-end`, `inline-start`, `inline-end`.                                                                                                       | string  | —       |
| style           | Style override for this region. CSS properties + layout vocabulary; accepts literal CSS, token aliases, or inline DTCG objects.                                                  | object  | —       |
| capability      | Install-level capability gate. The entire subtree is skipped pre-mount if the user lacks this cap.                                                                                | string  | —       |
| app             | App id to mount in this region for the life of the shell. Mutually exclusive with `routing.route-key`.                                                                            | string  | —       |
| config          | Configuration object passed to the mounted app at mount time. Validated against the app manifest's `config-schema`. Only meaningful when `app` is set.                            | object  | —       |
| regions         | Nested child regions, addressable as `{parent-id}/{child-id}`. Children merge with template-supplied children when a `template` is in use.                                        | object  | —       |

### Region layout allowlist

Engines own layout context (`display`, grid templates); authors declare only sizing, positioning, and flexbox participation. Logical properties are preferred over physical so layouts work in vertical writing modes.

| Property                                                                                                  | Description                       | Type             | Default |
|-----------------------------------------------------------------------------------------------------------|-----------------------------------|------------------|---------|
| inline-size, block-size                                                                                   | Logical width / height.           | string \| number | —       |
| min-inline-size, min-block-size, max-inline-size, max-block-size                                          | Min / max bounds.                 | string \| number | —       |
| aspect-ratio                                                                                              | CSS `aspect-ratio`.               | string \| number | —       |
| position                                                                                                  | One of `static \| relative \| absolute \| fixed \| sticky`. | string           | —       |
| inset, inset-block-start, inset-block-end, inset-inline-start, inset-inline-end                          | Inset values.                     | string \| number | —       |
| translate                                                                                                 | CSS `translate`.                  | string           | —       |
| flex-basis, flex-grow, flex-shrink                                                                        | Flex item participation.          | number / string  | —       |
| align-self, justify-self                                                                                  | Self alignment.                   | string           | —       |
| order                                                                                                     | Flex / grid `order`.              | integer          | —       |

### Region platform requests

Same vocabulary as the app manifest's `platform`. Region-level requests combine with the mounted app's requests; the strictest combined request wins.

| Property                            | Description                                                                                  | Type    | Default |
|-------------------------------------|----------------------------------------------------------------------------------------------|---------|---------|
| core:modal                          | Focus-trap + ARIA modal + backdrop scrim when supported.                                     | boolean | `false` |
| core:dismiss-on                     | Array of `Escape`, `backdrop-click`, `outside-click`, `navigation`.                          | array   | —       |
| core:autofocus-target               | CSS selector for the element that should receive focus on mount.                             | string  | —       |
| core:triggerable                    | Region may be invoked by an `admin.json#bindings` keystroke.                                | boolean | `false` |
| core:persists-across-navigation     | Region survives URL-driven changes to other regions.                                         | boolean | `false` |
| core:dirty-state                    | Region's app may report unsaved changes.                                                     | boolean | `false` |
| core:block-navigation-on-dirty      | Show a confirm dialog before unmount when dirty. Requires `core:dirty-state`.                | boolean | `false` |
| core:trigger                        | Declarative trigger hint (`{ shortcut: "Mod+K" }`); the actual binding lives in `bindings`. | object  | —       |

## routes

URL pattern → app + config map. Patterns use leading-slash form (`/posts`, `/posts/{id}`, `/media/*`). Parameter segments use `{name}` curly braces and capture into the route's config via interpolation. Wildcard suffixes `/*` capture the remaining path. Pattern resolution is most-specific-wins: `/posts/new` beats `/posts/{id}`.

Routes are pure URL → app mappings. Which region mounts a route is determined by which URL slot the pattern matched against (the primary path, or a named query parameter), via each region's `routing.route-key` declaration. There is no `target` field on routes.

```json
{
	"routes": {
		"/posts": { "app": "core:posts", "config": { "postType": "post" } },
		"/posts/{id}/edit": { "app": "core:editor", "config": { "postId": "{id}" } }
	}
}
```

### Route object

`app` is required.

| Property | Description                                                                                                                                          | Type   | Default |
|----------|------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| app      | App id to mount when this route matches. The user must satisfy the app's `capabilities[]`; otherwise the route renders a 403 view. Required.         | string | —       |
| config   | Configuration passed to the mounted app. Validated against the app's `config-schema`. `{paramname}` substitutions resolve against captured params.   | object | —       |

## default-route

Where the shell lands when no URL hash is present. Should match a pattern in `routes` (the runtime warns if not). On capability denial of the default route, the shell falls through to the first permitted route in `routes`.

Examples: `/posts`, `/dashboard`.

| Property      | Description                                                          | Type   | Default |
|---------------|----------------------------------------------------------------------|--------|---------|
| default-route | URL pattern to load on shell mount, matching `^/[A-Za-z0-9_/{}\-]*$`. | string | —       |

## bindings

Keyboard shortcut → app invocation map. Each entry binds a keystroke to an app id; the app's manifest must declare `platform.core:triggerable: true`. When the shortcut fires, the engine ensures the app's region is mounted (mounting it if ephemeral) and applies the app's platform requests.

Conflict resolution: later entries override earlier ones (cascade-aware: user > role > site > plugin > core). Apps with internal shortcuts matching a binding win when focused; the binding wins otherwise.

```json
{
	"bindings": [
		{ "shortcut": "Mod+K", "invoke": "core:command-palette" }
	]
}
```

### Binding object

Both `shortcut` and `invoke` are required.

| Property | Description                                                                                                                                          | Type   | Default |
|----------|------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| shortcut | Keystroke spec matching `^([A-Za-z]+\+)*[A-Za-z0-9]+$`. Follows `@wordpress/keyboard-shortcuts` syntax. Modifiers: `Mod`, `Shift`, `Alt`, `Ctrl`. `Mod` = Cmd on macOS, Ctrl elsewhere. Required. | string | —       |
| invoke   | App id to invoke. The app must declare `platform.core:triggerable: true` in its manifest. Required.                                                  | string | —       |

## styles

WPDS-shaped style tree. Authors override WPDS slot values (typically via DTCG token aliases into a sibling `tokens.json`) and shell-only chrome slots. Output is `--wpds-*` (full surface), `--wp-admin-shell--chrome--*` (chrome extensions), and a fixed compat bridge for legacy WordPress consumers.

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
| density     | Legacy. Prefer `styles.theme.density`. Read as a fallback.                                                                                    | string | —       |

### styles.chrome

Shell-only chrome extension slots — surfaces WPDS does not yet describe. Sub-namespaces include `sidebar`, `toolbar`, `siteHub`, `content`, `canvas`. Authors may add custom slugs; engines that read custom slugs declare them in their manifest so the runtime validates at activation time.

| Property         | Description                                                                                              | Type   | Default |
|------------------|----------------------------------------------------------------------------------------------------------|--------|---------|
| chrome.sidebar   | Sidebar surface palette (background, foreground, border, etc.).                                          | object | —       |
| chrome.toolbar   | Toolbar surface palette.                                                                                 | object | —       |
| chrome.siteHub   | Site-hub surface palette.                                                                                | object | —       |
| chrome.content   | Content surface palette.                                                                                 | object | —       |
| chrome.canvas    | Shell-wide background / foreground.                                                                       | object | —       |

### styles.regions

Per-region style overrides, keyed by region id. Same shape as the top-level `styles` tree. Overrides scope to `[data-region-id="..."]` selectors and win for that region's container and descendants.

### styles.applications

Per-app style overrides, keyed by app id. Same shape as the top-level `styles` tree. Overrides scope to `[data-app-id="..."]` selectors.

## viewConfigs

> **v3 successor:** `settings.dataViews` in admin-v3. The 3-axis registry shape is preserved (same `kind → name → variant|_default` keying). Filter name renames to `wp_admin_shell_data_view_config_{kind}_{name}[_{variant}]`; per-variant suffix is restored. JS hook is `useDataView(screenId)` (or `useDataView({ kind, name, variant })` for the registry-direct entry point). v2 callers keep working through deprecation shims one release cycle.

Cascade registry of view-configs, keyed by entity kind → entity name → variant or `_default`. Each leaf is a view-config document (fields, default view, default layouts, actions). The shell merges entries across the 6-origin cascade and runs the `wp_admin_shell_view_config_{kind}_{name}[_{variant}]` filter on the resolved triple before serving. Apps consume the result via `useViewConfig(kind, name, variant?)` (deprecated; use `useDataView` going forward).

Variant key `_default` is the unqualified base view-config; any other key represents a named scoped sub-view (slash namespacing is allowed: `woocommerce-bookings/services`).

```json
{
	"viewConfigs": {
		"postType": {
			"post": {
				"_default": {
					"fieldsRef": "core/post-fields",
					"defaultView": { "type": "table", "perPage": 25 }
				}
			}
		}
	}
}
```

### View-config entry

| Property         | Description                                                                                                                                                                  | Type   | Default |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|---------|
| fieldsRef        | Reference to a `fieldCollections` entry id. The referenced collection's `fields` array is the base set; inline `fields` overrides per-field by `id`.                          | string | —       |
| fields           | Field descriptors for DataViews columns. Render callbacks are not declared here — the consuming app provides them keyed by `id`.                                              | array  | —       |
| defaultView      | Initial DataViews `view` object (`type`, `search`, `filters`, `page`, `perPage`, `sort`, `fields`, `titleField`, `layout`).                                                  | object | —       |
| defaultLayouts   | DataViews `defaultLayouts` prop. Keys are layout ids (`table`, `grid`, etc.); values are layout-specific config objects.                                                     | object | —       |
| actions          | Row-level + bulk action descriptors. Each entry declares an `id` (mapped to a callback by the consuming app), `label`, `icon`, primacy / destructiveness flags, bulk support. | array  | —       |

### View-config field

`id`, `type`, and `label` are required.

| Property               | Description                                                                                       | Type    | Default          |
|------------------------|---------------------------------------------------------------------------------------------------|---------|------------------|
| id                     | Field identifier. Matches the entity record key. Required.                                        | string  | —                |
| type                   | One of `text`, `datetime`, `number`, `integer`, `boolean`, `media`, `select`, `url`, `email`. Required. | string  | —                |
| label                  | Human-readable column header. Translatable. Required.                                             | string  | —                |
| enableHiding           | When `false`, the column cannot be hidden.                                                        | boolean | `true`           |
| enableGlobalSearch     | When `true`, the column participates in the global search box.                                    | boolean | `false`          |
| enableSorting          | When `false`, the column cannot be sorted.                                                        | boolean | `true` (text/number/datetime) |
| elements               | Enumerated `{ value, label }` pairs for select-type fields.                                       | array   | —                |
| filterBy               | Filter configuration `{ operators: [...] }`. Omit to disable filtering. Operators include `is`, `isAny`, `isNot`, `isNotAll`. | object  | —                |

### View-config action

`id` and `label` are required.

| Property        | Description                                                                                                          | Type    | Default |
|-----------------|----------------------------------------------------------------------------------------------------------------------|---------|---------|
| id              | Action identifier. Consuming apps key their callback map off this value. Required.                                    | string  | —       |
| label           | Human-readable label. Translatable. Required.                                                                        | string  | —       |
| icon            | Icon name resolved via the kernel icon registry.                                                                     | string  | —       |
| isPrimary       | Surface as a top-level affordance instead of inside an overflow menu.                                                | boolean | `false` |
| isDestructive   | Trigger destructive UI affordances (red button, confirmation modal).                                                  | boolean | `false` |
| supportsBulk    | Operate on multiple selected rows.                                                                                   | boolean | `false` |
| eligibleWhen    | Declarative eligibility predicate. v1 declares one field: `status` (single value or array of valid status strings). The consuming app compiles to an `isEligible(item)` callback. | object  | —       |

#### Action `eligibleWhen`

| Property | Description                                                                                          | Type             | Default |
|----------|------------------------------------------------------------------------------------------------------|------------------|---------|
| status   | Item status(es) that make the action eligible. Example: `"publish"` or `[ "publish", "future" ]`.   | string \| array  | —       |

## fieldCollections

> **v3 successor:** `settings.dataFields` in admin-v3. Same per-entry shape, moved under `settings` alongside `settings.dataViews` for registry symmetry. PHP registration function renames to `wp_admin_shell_register_data_field_collection()`; the legacy `wp_admin_shell_register_field_collection()` survives as a deprecation wrapper for one release cycle.

Cascade registry of field collections, keyed by collection id (slash namespacing allowed, e.g. `core/post-fields`, `woocommerce/product-fields`). Each entry binds a set of field descriptors to an entity `(kind, name)` pair, or to all names of the kind when `name` is `null`. View-configs reference a collection via `fieldsRef` and the runtime merges ref-wins with inline `fields` per-field override.

### Field collection entry

`kind` and `fields` are required.

| Property      | Description                                                                                                                           | Type    | Default |
|---------------|---------------------------------------------------------------------------------------------------------------------------------------|---------|---------|
| kind          | Entity kind, matching `@wordpress/core-data` entity kinds (`postType`, `root`, `taxonomy`, etc.). Required.                            | string  | —       |
| name          | Entity name (`post`, `page`, `user`, `comment`). `null` = universal across all names of the kind.                                     | string \| null | — |
| fields        | Field descriptors that view-configs may reference. Same shape as `viewConfigs[*][*][*].fields`. Required.                              | array   | —       |
| fieldsModule  | Reserved for forward compatibility. Native ESM script-module handle. Currently inert; logs a one-time dev warning when declared.       | string  | —       |

## preload

REST paths to preload server-side and inject as `wp.apiFetch.createPreloadingMiddleware` cache before the shell bundle runs. Each entry is either a string path (defaults to `GET`) or a `[ path, method ]` tuple. Methods are restricted to `GET` and `OPTIONS`.

Across origins the resolved value is the concatenation of every origin's `preload[]` — there are no override semantics, only additive union. Duplicates by exact `path + method` are deduped before serialization. Conditional preloads belong in a `wp_admin_shell_data_{origin}` filter callback.

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

## dashboardWidgets

Per-widget overrides keyed by app id. Each entry layers on top of the app manifest's `dashboardWidget` block — `admin.json` wins per-property. Use to hide widgets the shell ships with, to pin a widget to a specific cell, or to grow its size. Programmatic registrations via `wp_admin_shell_register_dashboard_widget()` contribute through the plugin origin and are overrideable here.

Keys must match the namespaced app id pattern `^(core:[a-z][a-z0-9-]*|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*)$`.

### Dashboard widget override

| Property      | Description                                                                                                  | Type             | Default |
|---------------|--------------------------------------------------------------------------------------------------------------|------------------|---------|
| title         | Tile-header title. Translatable.                                                                             | string           | —       |
| defaultSize   | `{ w, h }` in grid cells. Both `w` and `h` are required when set and must be `>= 1`.                          | object           | —       |
| minSize       | `{ w, h }` floor in grid cells. Both `w` and `h` are required when set and must be `>= 1`.                    | object           | —       |
| position      | `"auto"` or `{ row, col }` (1-indexed CSS Grid coordinates). Both `row` and `col` are required when set.     | string \| object | `"auto"` (in `dashboardWidget`) |
| hidden        | When `true`, the host skips this widget. `admin.json`-only — manifests can't hide themselves.               | boolean          | `false` |
