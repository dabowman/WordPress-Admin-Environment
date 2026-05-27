---
name: app-json-author
description: Author or edit WP Admin Shell app.json manifests. Use whenever a user wants to create a new admin surface (a React app that mounts inside a WP Admin Shell region), declare its ARIA role and capability floor, write a JSON Schema for its config, register a script handle, ship a baseline dataView family with variants, declare window-mount hints for windowed engines, expose slots for sub-mount points, declare slotHints (grid-cell defaults a host can honor), or write the machine-readable documentation contract a rebuild needs. Triggers on phrases like "ship a new admin app", "build a Stripe customers list inside wp-admin", "register an app called acme/orders", "add a window hint to my app", "expose a grid slot in my dashboard host", "add a dataView variant", "ship a dashboard widget", "app config-schema for postType", "app.json for my plugin", "register_app via wp_admin_shell_register_app". Covers the admin-app.json schema, namespacing (core:* vs plugin:{slug}/{name}), platform service requests, the four-layer capability gating model, and the per-app documentation block + sibling app.md prose contract.
---

# app.json Authoring Skill

`app.json` is the manifest for a WP Admin Shell **app**: an admin surface (a posts list, an editor, a command palette, a settings panel, a dashboard widget) that mounts into a region of a workspace. The manifest ships alongside the app's React code at the convention path `{plugin}/apps/{name}/app.json` (or is registered programmatically via `wp_admin_shell_register_app()`).

Manifests carry **intrinsic, install-independent** declarations: ARIA role, platform services, capability floor, config schema, script handle, optional dataView baseline / window hints / slot exposures / slot hints. Manifests deliberately **do not** declare layout, geometry, keystroke bindings, dashboard-widget identity (`title`, `hidden`), or which install they belong to — those are install decisions and live in `admin.json`.

## Authoritative references

| Doc | When |
|---|---|
| `docs/schemas/admin-app.json` | JSON Schema. Inline `description` fields on every key. |
| `docs/public/app-json-reference.md` | Author-facing reference. Per-field tables. |
| `docs/wp-admin-shell-design-spec.md` | §4.1 (app manifest), §5.3 (platform services), §11 (capabilities + permissions), §13 (extension points). |
| `docs/dataview-config.md` | dataView 3-axis registry, `extends`, variant resolution. |
| `docs/admin-json-api-validation.md` | REST API coverage per app source. |
| `docs/research/app-validation-2026-05-04.md` | WPDS / REST / core-data audit of every bundled `src/apps/*`. |
| `docs/screens/*.md` | 42 tier-2 functional specs for every wp-admin screen — source of truth for any rebuild. |
| `src/apps/posts/app.json` + `app.md` | Reference manifest with complete `dataView` variants family + `documentation` block. |
| `src/apps/dashboard-host/app.json` | App that declares a `slots` block. |
| `src/apps/dashboard-widget-recent-posts/app.json` | Widget app — ships `slotHints` for grid-cell defaults. |

## Top-level shape (cheat sheet)

```json
{
    "$schema": "https://schemas.wp.org/admin-app.json",
    "id":           "plugin:acme/orders",
    "version":      3,
    "title":        "Orders",
    "description":  "...",
    "designSystem": "@wordpress/ui",

    "role":         "main",
    "platform":     { /* core:modal / dismiss-on / autofocus-target / triggerable / persists / dirty-state / block-nav-on-dirty */ },
    "capabilities": [ "edit_shop_orders" ],

    "config-schema":    { /* JSON Schema for the config admin.json passes */ },
    "extension-points": { /* documentation only */ },

    "script":       "acme-orders",
    "style":        "acme-orders-style",

    "window":           { /* defaultSize, minSize, chrome, multiInstance, icon */ },

    "slots":            { /* sub-mount points this app exposes */ },
    "slotHints":        { /* defaultSize, minSize, position — grid-cell defaults for a host */ },

    "dataView":     { /* kind, name, variants: { _default, ... } */ },

    "documentation": { /* purpose, rebuilds, data, url, states, interactions, a11y, constraints, design-system-leakage */ }
}
```

**Required:** `id`, `version`, `title`, `role`, `script`. `additionalProperties: false`. Conditional rule: `platform.core:block-navigation-on-dirty: true` requires `platform.core:dirty-state: true`.

## Block-by-block authoring playbook

### `id`

| Namespace | Pattern | Example |
|---|---|---|
| `core` | `core:[a-z][a-z0-9-]*` | `core:posts` |
| `plugin` | `plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*` | `plugin:acme/orders` |

`core` is reserved for apps shipped with the WP Admin Shell plugin. For plugin apps, the slug before `/` must match the contributing plugin's directory name. Runtime registry rejects duplicate ids — plugins extending a core app use a different id and have admin.json route to their version.

### `version`

Manifest schema version (currently `3`). Bump only on breaking changes to this app's manifest contract. Adding optional fields does NOT require a version bump. Runtime accepts higher versions with a warning and best-effort load.

### `title` / `description`

Both translatable. `title` is short (2-3 words). `description` is one sentence to a short paragraph — used in admin.json authoring tools, plugin install screens, ecosystem directories.

### `designSystem`

Free-form. Convention: `@wordpress/ui` (WPDS), `mui`, `chakra`, `radix`, `custom`. Apps are bound to their DS because they import primitives directly — mounting a `@wordpress/ui` app inside a Material engine produces visually inconsistent results. Kernel emits a dev-mode warning on DS mismatch with the active engine.

Apps that don't declare are DS-unknown and skip the mismatch check.

### `role`

The app's primary ARIA role when mounted. Drives engine specialization — engines that recognize the role apply specialized chrome (e.g. a `navigation` app gets sidebar treatment in `core:default`). Roles outside an engine's `specializes-roles` list fall through to default arrangement.

Common values:

| Role | Typical use |
|---|---|
| `main` | Primary content app — posts list, editor, settings panel. **Most apps.** |
| `navigation` | Sidebar nav, menu app. |
| `dialog` | Modal app — command palette, confirm dialogs. |
| `complementary` | Detail / inspector / preview pane. |
| `banner` | Site-oriented header app. |
| `contentinfo` | Footer / status-bar app. |
| `region` | Generic landmark when nothing else fits. |
| `search` | Search-overlay app. |

Any valid WAI-ARIA 1.2 landmark or `dialog`/`region`. Avoid widget roles (`button`, `checkbox`) — those describe controls, not regions.

### `platform`

Platform service requests. The app declares what it needs; the engine declares what it implements (`engine.json#honored-platform`). Apps requesting an unhonored service still mount — request is a no-op with a dev-mode warning.

| Field | Behavior |
|---|---|
| `core:modal` | Focus trap + ARIA modal + backdrop scrim. Pair with `role: "dialog"`. |
| `core:dismiss-on` | Triggers that unmount the region. Array of `Escape`, `backdrop-click`, `outside-click`, `navigation`. |
| `core:autofocus-target` | CSS selector to receive focus on mount. |
| `core:triggerable` | App accepts being invoked by an `admin.json#commands.invoke` keystroke. |
| `core:persists-across-navigation` | Region survives URL-driven changes to other regions. For sidebars / status bars / persistent panels. |
| `core:dirty-state` | App reports unsaved-changes state via the runtime's dirty-state API. |
| `core:block-navigation-on-dirty` | Engines show a confirm dialog before unmount while dirty. **Requires `core:dirty-state: true`** (schema enforces). |

```json
"platform": {
    "core:modal": true,
    "core:dismiss-on": [ "Escape", "backdrop-click" ],
    "core:autofocus-target": "input[type='search']",
    "core:triggerable": true
}
```

### `capabilities`

WordPress capabilities **required to mount** this app. User must hold all listed caps; missing any one suppresses the app.

**This is the AND-floor for every consumer.** `admin.json` cannot lower it — only add. Validated via `core-data`'s `canUser()` for entity caps and a custom REST endpoint for non-entity caps.

```json
"capabilities": [ "edit_posts" ]
```

Empty array = no capability required (rare — even palette typically needs `read`). Examples: `[ "manage_options", "upload_files" ]` for media settings, `[ "moderate_comments" ]` for a comments app.

### `config-schema`

JSON Schema (draft 2020-12) describing the shape of the `config` object `admin.json` passes at mount time (via region `config` or screen `apps[i].config`). Runtime validates the merged config against this; validation failure prevents mount.

```json
"config-schema": {
    "type": "object",
    "properties": {
        "postType":    { "type": "string", "default": "post" },
        "perPage":     { "type": "integer", "minimum": 5, "maximum": 100, "default": 20 },
        "contentWidth":{ "type": [ "number", "string" ] }
    },
    "required": [ "postType" ],
    "additionalProperties": false
}
```

Use `additionalProperties: false` to catch admin.json typos at mount.

### `extension-points`

Documentary listing of slot/fill points, filter hooks, and other React/PHP extension surfaces this app exposes. **Not load-bearing** — the runtime does not read or enforce this field. Included for IDE tooling, ecosystem documentation, and machine-readable discovery.

Keys are extension-point ids (e.g. `PluginSidebar`, `PluginDocumentSettingPanel`); values are the WordPress package or hook namespace consumers register against.

### `script` / `style`

WordPress asset handles. Both must be registered with `wp_register_script` / `wp_register_style` before the manifest references them. Runtime enqueues them when the app mounts (same pattern as `block.json`'s `editorScript`).

```json
"script": "acme-orders",
"style":  "acme-orders-style"
```

`style` is optional — apps relying entirely on WPDS tokens for theming omit it. Handles match `^[a-z][a-z0-9-]*$`.

### `window`

Optional. Window-mount hints for engines that mount this app inside a window-frame region (windowed / MDI / desktop engines). Default engines (sidebar + topbar + content) ignore the block.

```json
"window": {
    "defaultSize":  { "w": 960, "h": 720 },
    "minSize":      { "w": 480, "h": 360 },
    "multiInstance": true,
    "chrome":        "default",
    "icon":          "post"
}
```

| Field | Purpose |
|---|---|
| `defaultSize` | Preferred initial size in CSS pixels. `{ w, h }` both required when set; integers >= 1. |
| `minSize` | Floor. Compositor enforces when user resizes. |
| `chrome` | Engine-defined chrome style id. Unrecognized values fall back to engine's default. |
| `multiInstance` | When `true`, app may open as multiple simultaneous windows. When `false`, re-opening focuses existing. |
| `icon` | Icon registry name (resolved by active engine's icon table). Used for titlebar, taskbar, dock, overview switcher. |

### `slots`

Optional. Apps that host sub-mount-points (dashboard hosts, layout containers) declare named slots they expose to other apps in the same screen's `apps[]` array.

```json
"slots": {
    "grid": { "label": "Dashboard Grid", "description": "Widget grid tiles.", "accepts": "widget" }
}
```

A screen mounting an app that declares a `grid` slot gains that slot for use by other apps with `apps[i].slot: "grid"`.

| Field | Notes |
|---|---|
| Slot id | kebab-case. |
| `label` | **Required.** Human-readable name (surfaces in tooling). |
| `description` | Optional one-line summary. |
| `accepts` | Optional hint: `app` (default) / `widget` / `any`. Not load-bearing — tooling-only. App-declared slots are always screen-scope; there is no `scope` field. |

### `slotHints`

Optional. Default size + position the app prefers when mounted into a grid-style host slot (a dashboard-host's `grid`, a tiling pane). **Flat block — NOT keyed by slot id.** `{ defaultSize, minSize, position }`. Generic across slot kinds; hosts that don't understand grid sizing ignore it. Cascade-overrideable per-entry from `admin.json` `screens[id].apps[i].size` / `position`.

```json
"slotHints": {
    "defaultSize": { "w": 2, "h": 1 },
    "minSize":     { "w": 1, "h": 1 },
    "position":    "auto"
}
```

| Field | Purpose | Default |
|---|---|---|
| `defaultSize` | Initial `{ w, h }` in grid cells. Integers >= 1. | `{ w: 1, h: 1 }` |
| `minSize` | Floor in grid cells. Host clamps install-layer overrides to this floor. | `{ w: 1, h: 1 }` |
| `position` | `"auto"` (auto-flow) or `{ row, col }` (1-indexed). | `"auto"` |

Widget identity (title, hidden-state, per-install placement) lives on the `screens[id].apps[i]` entry that places the widget; `slotHints` carries only the intrinsic defaults the app ships.

### `dataView`

Optional. The app's baseline `dataView` family — the `(kind, name)` pair it primarily renders, plus a `variants` family that ships the complete variant set (`_default` plus drafts / pending / trash / etc.) in a single block.

```json
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
        },
        "trash": {
            "extends":     "_default",
            "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "trash" } ] },
            "actions":     [
                { "id": "restore", "label": "Restore", "isPrimary": true, "supportsBulk": true },
                { "id": "delete-permanent", "label": "Delete Permanently", "isDestructive": true, "supportsBulk": true }
            ]
        }
    }
}
```

| Field | Notes |
|---|---|
| `kind` | Entity kind matching `@wordpress/core-data` (`postType`, `root`, `taxonomy`). Required. |
| `name` | Entity name (`post`, `page`, `user`). Required. |
| `variants` | Map of variant id → dataView doc. **Must include `_default`** when `variants` is declared. |
| `variants.<id>.extends` | Optional. Inherit from another variant. Cycle-safe, max depth 10. |
| `variants.<id>.fields` | Field descriptors. Each entry: `id`, `type`, `label`. |
| `variants.<id>.fieldsRef` | Reference to a `settings.dataFields` entry id. Resolver merges ref-wins-inline-overrides. |
| `variants.<id>.titleField` | Field id used as the row title. |
| `variants.<id>.defaultView` | Initial DataViews `view` object (`type`, `search`, `filters`, `page`, `perPage`, `sort`, `fields`, `titleField`, `layout`). |
| `variants.<id>.defaultLayouts` | DataViews `defaultLayouts` prop. Layout id → config object. |
| `variants.<id>.actions` | Action descriptors. Each entry: `id`, `label`. |

The PHP resolver injects each declared variant into `settings.dataViews[kind][name][variant]` at the `core` origin. Admin.json cascade origins (site / role / user) override per-triple.

Apps that don't render an entity list (command palette, dashboard host, simple editor, iframe wrappers) omit this block.

### `documentation`

**Not load-bearing.** Machine-readable description of what the app does at runtime — for reviewers, ecosystem tooling, authors rebuilding the app on a different DS or framework. Pairs with a sibling `app.md` prose document.

```json
"documentation": {
    "purpose": "DataViews table over any single post type. Defaults to 20 rows per page sorted by date descending, with title / status / author / date columns.",
    "rebuilds": "posts",
    "data": {
        "reads": [
            {
                "source": "postType/{config.postType}",
                "via": "core-data",
                "context": "edit",
                "purpose": "Rows in the DataViews table.",
                "fields": [ "id", "title.raw", "status", "date" ],
                "query": { "per_page": "view.perPage", "status": "filter.status" }
            }
        ],
        "writes": [
            {
                "source": "postType/{config.postType}",
                "via": "core-data",
                "operation": "trash",
                "purpose": "Move one or more selected posts to trash.",
                "invalidates": [ "postType/{config.postType}" ]
            }
        ]
    },
    "url": {
        "reads-slots":  [ "_self" ],
        "writes-slots": [],
        "navigates":    [ "#/posts/{id}/edit" ]
    },
    "states": [
        { "id": "loading", "when": "isResolving && !records", "renders": "DataViews loading indicator." },
        { "id": "ready",   "when": "records?.length > 0",     "renders": "Rows in the active layout." },
        { "id": "empty",   "when": "records?.length === 0",   "renders": "Empty state for the current filter." }
    ],
    "interactions": [
        { "trigger": "Click row title", "effect": "Navigate to the editor route." },
        { "trigger": "Trash row action", "effect": "Open confirm modal; on confirm `deleteEntityRecord('postType', name, id)` without `force`." }
    ],
    "a11y": {
        "focus-management": "DataViews owns focus inside the grid. Trash modal restores focus to the action trigger on close.",
        "keyboard": [ { "keys": "Cmd+K", "action": "Open command palette" } ]
    },
    "constraints": [
        { "concern": "dataviews-import-path", "note": "Import from `@wordpress/dataviews/wp`, never bare." },
        { "concern": "context-edit",          "note": "Pass `context: 'edit'` so `title.raw` is populated." }
    ],
    "design-system-leakage": [
        { "import": "@wordpress/dataviews/wp", "purpose": "DataViews + DataForm + field descriptors." },
        { "import": "@wordpress/ui#Button",    "purpose": "Modal cancel button." }
    ]
}
```

Update both `app.json#documentation` AND `app.md` whenever touching app behavior. `rebuilds` should match a slug under `docs/screens/*.md` when the app rebuilds an existing wp-admin surface; omit for shell-only apps.

`via:` values:
- `core-data` — `useEntityRecord` / `useEntityRecords` / `useDispatch( coreStore )`
- `api-fetch` — `wp.apiFetch()` (non-entity ops: media upload, auto-draft, etc.)
- `window-global` — reads from `window.wpAdminShell.*` etc.
- `external` — external HTTP API
- `commands` — invoked via the command palette
- `kernel-config` — read via `useKernel()` / kernel context

## Capability gating (four layers)

When the user opens a screen mounting your app, the kernel walks four checks in order:

1. **Region fast-path.** If the region declares `capability: "X"` (admin.json install-level), and the user lacks X, the whole subtree skips before mount.
2. **App gate.** `app.json#capabilities[]` AND-floor. User must hold ALL listed caps.
3. **Source-cap floor.** Built-in apps declare a floor (e.g. `core:users` floors at `list_users`). Workspace can extend it but can't lower it.
4. **REST observation.** The app's actual REST calls return 403/401 if user lacks the cap on the specific entity. Apps handle gracefully (empty state, permission-denied banner).

Your app fits at layer 2. Be conservative — over-declaring `capabilities[]` is safer than under-declaring.

## Common authoring tasks

### Bare minimum app

```json
{
    "$schema": "https://schemas.wp.org/admin-app.json",
    "id":      "plugin:acme/hello",
    "version": 3,
    "title":   "Hello",
    "role":    "main",
    "script":  "acme-hello"
}
```

Drop into `wp-content/plugins/acme/apps/hello/app.json`, register `acme-hello` via `wp_register_script`, ship the React module, reference `plugin:acme/hello` from `admin.json#screens.<id>.app`.

### App that takes config

```json
{
    "id":     "plugin:acme/customers",
    "version":3,
    "title":  "Customers",
    "role":   "main",
    "script": "acme-customers",
    "capabilities": [ "manage_options" ],
    "config-schema": {
        "type": "object",
        "properties": {
            "source": { "type": "string", "enum": [ "stripe", "woo", "manual" ], "default": "stripe" },
            "perPage":{ "type": "integer", "minimum": 5, "maximum": 100, "default": 20 }
        },
        "required": [ "source" ],
        "additionalProperties": false
    }
}
```

`admin.json` references:

```json
"screens": {
    "customers": {
        "app":    "plugin:acme/customers",
        "config": { "source": "stripe", "perPage": 50 }
    }
}
```

### Modal app (command palette pattern)

```json
{
    "id":           "plugin:acme/quick-find",
    "version":      3,
    "title":        "Quick Find",
    "role":         "dialog",
    "script":       "acme-quick-find",
    "capabilities": [ "read" ],
    "platform": {
        "core:modal": true,
        "core:dismiss-on": [ "Escape", "backdrop-click" ],
        "core:autofocus-target": "input[type='search']",
        "core:triggerable": true
    }
}
```

`admin.json`:

```json
"screens": {
    "quick-find": { "slot": "palette", "mode": "modal", "app": "plugin:acme/quick-find" }
},
"commands": [
    { "id": "open-quick-find", "shortcut": "Mod+P", "invoke": "plugin:acme/quick-find" }
]
```

### Persistent sidebar app

```json
{
    "id":     "plugin:acme/nav",
    "version":3,
    "title":  "Acme Nav",
    "role":   "navigation",
    "script": "acme-nav",
    "platform": { "core:persists-across-navigation": true }
}
```

### Editor app with dirty-state guard

```json
{
    "id":     "plugin:acme/editor",
    "version":3,
    "title":  "Acme Editor",
    "role":   "main",
    "script": "acme-editor",
    "capabilities": [ "edit_posts" ],
    "platform": {
        "core:dirty-state": true,
        "core:block-navigation-on-dirty": true
    }
}
```

App calls `useDirtyState(regionId, isDirty, { blocksNavigation: true })` from its React code. `<NavigationGuard>` honors it across `beforeunload`, Navigation API, hashchange-revert.

### Dashboard widget

```json
{
    "id":     "plugin:acme/widget-stats",
    "version":3,
    "title":  "Stats",
    "role":   "region",
    "script": "acme-widget-stats",
    "capabilities": [ "read" ],
    "slotHints": {
        "defaultSize": { "w": 2, "h": 1 },
        "minSize":     { "w": 1, "h": 1 },
        "position":    "auto"
    }
}
```

Mount in admin.json:

```json
"screens": {
    "dashboard-home": {
        "apps": [
            { "id": "host",  "app": "core:dashboard-host" },
            { "id": "stats", "app": "plugin:acme/widget-stats", "slot": "grid" }
        ]
    }
}
```

### App that hosts sub-apps (slot exposure)

```json
{
    "id":     "plugin:acme/tabs",
    "version":3,
    "title":  "Acme Tabs",
    "role":   "main",
    "script": "acme-tabs",
    "slots": {
        "tab-content": { "description": "Active tab's panel." }
    }
}
```

Other apps in the same screen mount with `apps[i].slot: "tab-content"`.

### Entity-CRUD app with dataView family

```json
{
    "id":     "plugin:acme/orders",
    "version":3,
    "title":  "Orders",
    "role":   "main",
    "script": "acme-orders",
    "capabilities": [ "edit_shop_orders" ],
    "dataView": {
        "kind": "postType",
        "name": "shop_order",
        "variants": {
            "_default": {
                "defaultView": {
                    "type": "table", "perPage": 25,
                    "fields": [ "status", "customer", "total", "date" ],
                    "titleField": "order_number",
                    "sort": { "field": "date", "direction": "desc" }
                },
                "fields": [
                    { "id": "order_number", "type": "text",     "label": "Order #" },
                    { "id": "status",       "type": "text",     "label": "Status" },
                    { "id": "customer",     "type": "text",     "label": "Customer" },
                    { "id": "total",        "type": "text",     "label": "Total" },
                    { "id": "date",         "type": "datetime", "label": "Date" }
                ],
                "actions": [
                    { "id": "edit",   "label": "Edit",   "isPrimary": true },
                    { "id": "refund", "label": "Refund", "isDestructive": true }
                ]
            },
            "pending":   { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "pending" } ] } },
            "processing":{ "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "processing" } ] } }
        }
    }
}
```

App's React code reads the resolved triple via `useDataView(screenId)` (per-screen lookup) or `useDataView({ kind: 'postType', name: 'shop_order', variant: 'pending' })` (registry-direct).

## React-side patterns (must enforce in app code)

The manifest is half the story — the app's React module must follow the patterns in CLAUDE.md. Highlights:

1. **Null-guard entity records.** `useEntityRecord('root', 'site')` returns `{ record: null }` while loading. Read `record.foo` only after a guard.
2. **Refresh after mutations.** `deleteEntityRecord` / `saveEntityRecord` outside `useEntityRecord` may not invalidate the `useEntityRecords` cache. Dispatch `invalidateResolution( 'getEntityRecords', ... )` after.
3. **Icons via the registry.** `import { resolveIcon } from '../../runtime/config/iconMap'` — engines populate the registry; don't import `@wordpress/icons` directly from app code.
4. **DataViews path.** `import { DataViews } from '@wordpress/dataviews/wp'` — NOT bare `'@wordpress/dataviews'`.
5. **`context: 'edit'`** for any entity query whose `raw` field will be edited.
6. **`deleteEntityRecord` without `force: true`** trashes; with `force: true` permanently deletes. Pick deliberately.
7. **Don't add a redundant ARIA landmark** — region wrapper already declares the role.
8. **Don't render hardcoded hex colors** in WPDS-flavored apps — use `var(--wpds-*)` so ThemeProvider seeds flow through.

For full patterns see the "Recurring patterns to enforce in review" section in CLAUDE.md.

## Sanity checks before declaring "done"

```bash
# Validate manifest against schema (Ajv sweep)
npm run test:schema

# Manifest registration + cap floor
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-tests.php

# If app declares dataView family
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-tests.php
```

If the app is a dashboard widget (mounted via `screens[id].apps[i].slot: "grid"`), also run `tests/php/run-dashboard-widgets-tests.php`.

## Common pitfalls

- **`platform.core:block-navigation-on-dirty: true`** without `core:dirty-state: true` fails schema validation.
- **`variants` declared without `_default`** fails schema. `_default` is always required when `variants` is present.
- **`id` not matching the namespace pattern** (e.g. `acme/orders` without `plugin:` prefix) fails schema.
- **Empty `capabilities: []`** mounts for everyone with `read`. If you have any privileged work, declare at least one cap.
- **`script` handle not registered with WordPress** = silent mount failure with a console error. Always `wp_register_script` before declaring the handle.
- **`config-schema` without `additionalProperties: false`** lets admin.json typos slip past mount-time validation.
- **dataView `variants[id].extends`** points at a sibling variant id, NOT an absolute triple. Cycle-safe but limited to one `(kind, name)`.
- **Don't write region declarations in app.json** — that's an admin.json or engine.json concern. App manifests don't describe layout or geometry.
- **Don't write keystroke bindings in app.json** — `platform.core:triggerable` declares the app accepts being invoked; the actual binding lives in `admin.json#commands`.
- **`documentation.rebuilds`** must match a slug under `docs/screens/*.md` when the app rebuilds an existing wp-admin surface — reviewers cross-check parity gaps against that spec. Omit for shell-only apps (palette, dashboard host, notices, etc.).
- **`window`** is ignored by default engines. Don't author it for an app that never windows. Authoring it costs nothing but doesn't unlock anything until the workspace runs on a windowed engine.

## When you need more

| Question | Where to look |
|---|---|
| How does `core:posts` ship its dataView variants? | `src/apps/posts/app.json` (`dataView.variants`). |
| What does `useDataView` return? | `src/runtime/dataView/useDataView.js`. |
| How do I dispatch a write via `core-data`? | `dvdbwmn-wordpress:wordpress-core-data` skill. |
| Which fields work in a dataView config? | `docs/dataview-config.md`. |
| How does the capability fast-path work? | `docs/wp-admin-shell-design-spec.md` §11. |
| What WPDS components are available? | `dvdbwmn-wordpress:wordpress-design-system` skill + CLAUDE.md "Component-mapping cheat sheet". |
| Per-screen spec for what my app rebuilds? | `docs/screens/<slug>.md`. |
| Existing app's documentation block? | `src/apps/<id>/app.json` (`documentation`) + `src/apps/<id>/app.md`. |
