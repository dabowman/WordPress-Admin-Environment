---
name: engine-json-author
description: Author or edit WP Admin Workspaces engine.json manifests. Use whenever a user wants to build a new rendering engine (sidebar/toolbar/content; mobile drawer; windowed/MDI; tiling; Material Design; brand-locked), declare region templates, ship a chrome mode catalog (default/focus/takeover/modal/custom), expose engine-declared slots (detail/inspector/dashboard-grid/toolbar/sidebar-footer/status-bar), pick a menu renderer (sidebar-drilldown/sidebar-tree/dock/drawer/none/plugin), declare an engine-shipped default region tree, set engine-shipped default-styles (theme seeds + chrome palette), or wire an engine to a non-WPDS design system. Triggers on phrases like "ship a custom engine", "build a tiling engine", "add a focus-tight mode", "expose a new slot", "use a dock menu", "engine for Material Design", "register an engine via wp_admin_workspaces_register_engine", "engine manifest", "engine default-styles". Covers admin-engine.json schema, the three bundled engines (core:default, core:single-pane, core:desktop), the kernel/engine DS boundary, and the pluggable ThemeProvider seam.
---

# engine.json Authoring Skill

`engine.json` is the manifest for a WP Admin Workspaces **engine**: the spatial + chrome layer that reads a region tree and renders it to DOM. Engines pick a design system, ship region templates, declare chrome modes, expose slot vocabulary, decide how the workspace menu renders, and optionally ship the kernel's `ThemeProvider`.

Three engines ship with the plugin: **`core:default`** (sidebar + topbar + content, WPDS), **`core:single-pane`** (mobile-first drawer, WPDS), **`core:desktop`** (windowed compositor + dock, WPDS). Plugins ship more via `wp_admin_workspaces_register_engine()` or the convention path `{plugin}/engines/{name}/engine.json`.

## Authoritative references

| Doc | When |
|---|---|
| `docs/schemas/workspace-engine.json` | JSON Schema. Inline `description` fields document every key. |
| `docs/public/engine-json-reference.md` | Author-facing reference. Per-field tables. |
| `docs/core-default-engine.md` | Worked example: modes catalog, slots, region templates, default-styles for `core:default`. |
| `docs/engines-and-design-systems.md` | Authoritative for the kernel/engine/app DS boundary and the three engine contracts (reuse-WPDS, token-bridge, engine-native apps). |
| `docs/wp-admin-workspaces-design-spec.md` | §4.2 (engine manifest), §5 (region vocabulary), §9 (tokens + styling), §13.1 (Material Design worked example). |
| `docs/desktop-engine-readiness.md` | Manual smoke + automated test gates for desktop-flavored engines. |
| `src/runtime/engines/core-default/engine.json` | Reference manifest. Read first. |
| `src/runtime/engines/core-single-pane/engine.json` | Drawer-flavored engine. |
| `src/runtime/engines/core-desktop/engine.json` | Windowed engine — uses `core:dynamic-children` + custom templates. |

## Top-level shape (cheat sheet)

```json
{
    "$schema": "https://schemas.wp.org/workspace-engine.json",
    "id": "plugin:acme/desktop",
    "version": 3,
    "title": "Acme Desktop",
    "description": "...",
    "designSystem": "@wordpress/ui",

    "specializes-roles":  [ "main", "navigation", "complementary" ],
    "honored-platform":   [ "core:modal", "core:dismiss-on", "core:dynamic-children" ],

    "templates":          { /* region-template catalog (>=1 required) */ },
    "modes":              { /* chrome modes catalog — must contain "default" */ },
    "slots":              { /* engine-declared slot vocabulary */ },

    "menu-renderer":      "sidebar-drilldown",
    "default-arrangement":"wp-chrome",

    "defaultRegions":     { /* engine-shipped baseline region tree */ },
    "default-styles":     { /* engine-shipped theme + chrome seeds */ },

    "script":             "acme-desktop-engine",
    "style":              "acme-desktop-engine-style",
    "styles":             [ { "handle": "...", "src": "..." } ]
}
```

**Required:** `id`, `version`, `title`, `specializes-roles`, `honored-platform`, `templates` (>=1 entry), `default-arrangement`, `script`, `modes`. `additionalProperties: false` everywhere.

## Block-by-block authoring playbook

### `id`

`core:{name}` reserved for plugin-shipped engines. Plugin engines: `plugin:{slug}/{name}` where `slug` matches the contributing plugin's directory.

Examples: `core:default`, `core:single-pane`, `core:desktop`, `plugin:tiling-pro/dwindle`, `plugin:acme/material`. Runtime registry rejects duplicates.

### `designSystem`

Free-form string. Convention: `@wordpress/ui` (WPDS — what `core:default` and `core:single-pane` declare), `mui`, `chakra`, `radix`, `custom`. Kernel emits a dev-mode warning when a mounted app's `designSystem` differs from the active engine's — visual-mismatch signal, not a hard error.

Engines that don't declare a DS skip the check. Declare what you actually use.

### `specializes-roles`

ARIA roles this engine has specialized chrome for. A region whose `role` is in this list gets engine-shipped styling + platform behaviors + arrangement position. Roles outside the list still mount but fall through to the default arrangement.

```json
"specializes-roles": [ "navigation", "banner", "main", "complementary", "dialog", "contentinfo" ]
```

Empty list is valid (an engine that treats every region the same). Roles authors choose for regions in `workspace.json` MUST be valid WAI-ARIA 1.2 roles. Avoid widget roles (`button`, `checkbox`).

### `honored-platform`

Platform service requests the engine implements. An app declaring `platform.X: true` gets the service only if the active engine lists `X` here. Unhonored requests are no-ops with a dev-mode warning.

Core platform service vocabulary:

| Service | Engine honors by... |
|---|---|
| `core:modal` | Focus trap + ARIA modal + backdrop scrim. |
| `core:dismiss-on` | Wiring Escape / outside-click / navigation triggers. |
| `core:autofocus-target` | Moving focus to the named selector on mount. |
| `core:triggerable` | Allowing `workspace.json#commands.invoke` to mount the region. |
| `core:persists-across-navigation` | Keeping the region mounted across URL changes. |
| `core:dirty-state` | Querying the mounted app for unsaved changes. |
| `core:block-navigation-on-dirty` | Showing a confirm dialog before unmount when dirty. Requires `core:dirty-state`. |
| `core:trigger` | Honoring declarative trigger hints on regions / templates. |
| `core:dynamic-children` | Allowing apps to add/remove child regions at runtime. **Required for windowed / MDI / desktop engines.** |

Plugin-contributed services use `plugin:{slug}/{name}`. The list grows additively across minor spec versions — engines ship updates as they implement new services.

### `templates`

Region-template catalog. Authors instantiate a template from `workspace.json` by referencing the template id in `region.template`. Each template has `role` (required), optional `platform`, `default-style`, nested `regions`.

```json
"templates": {
    "core:sidebar": {
        "role": "navigation",
        "platform": { "core:persists-across-navigation": true },
        "default-style": {
            "display": "flex", "flex-direction": "column",
            "inline-size": "var(--wp-admin-workspaces--chrome--sidebar--width, 280px)",
            "block-size": "100%",
            "background": "var(--wp-admin-workspaces--chrome--sidebar--background, var(--wpds-color-bg-surface-neutral))",
            "color":      "var(--wp-admin-workspaces--chrome--sidebar--foreground, var(--wpds-color-fg-content-neutral))"
        }
    },
    "core:topbar": {
        "role": "banner",
        "platform": { "core:persists-across-navigation": true },
        "default-style": { /* ... */ },
        "regions": {
            "start":  { "role": "region", "default-style": { "display": "flex" } },
            "center": { "role": "region", "default-style": { "display": "flex" } },
            "end":    { "role": "region", "default-style": { "display": "flex", "margin-inline-start": "auto" } }
        }
    },
    "core:main":      { "role": "main",          "default-style": { /* ... */ } },
    "core:detail":    { "role": "complementary", "platform": { "core:dismiss-on": [ "Escape" ] }, "default-style": { /* ... */ } },
    "core:overlay":   { "role": "dialog",        "platform": { "core:modal": true, "core:dismiss-on": [ "Escape", "backdrop-click" ] }, "default-style": { /* ... */ } }
}
```

| Field | Purpose |
|---|---|
| `role` | ARIA role the instantiated region carries. Required. Drives engine specialization. |
| `platform` | Default service requests for regions instantiated from this template. Authors can override per-instance. |
| `default-style` | CSS applied to the region's container element. Values may be literal CSS or `{styles.chrome.sidebar.background}` token aliases. |
| `regions` | Nested child regions, addressable as `{parent}/{child}` in workspace.json. Each child has the full template contract recursively. |

**Two-arg `var()` chain.** Convention: `var(--wp-admin-workspaces--chrome--<surface>--<slot>, var(--wpds-<wpds-slot>))`. Chrome var wins when the author declares it; falls through to WPDS slot when chrome layer is empty. Lets authors override without touching DS-internal vars.

**Template ids match `^(core:[a-z][a-z0-9-]*|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*)$`** — same namespace pattern as apps/engines.

**`minProperties: 1`** — engines with no templates are unusable.

**Combined platform requests.** When a region instance and its mounted app both declare the same platform service, the engine honors the strictest (region declaration is the floor).

### `modes`

The chrome modes catalog. Each mode declares per-region states (`hidden`, `compact`, `minimal`, `fullWidth`, etc.). Authors point a screen at a mode via `screens[id].mode`.

```json
"modes": {
    "default": {
        "label":       "Default",
        "description": "Full workspace chrome.",
        "regions": {
            "sidebar":  { "hidden": false, "compact": false },
            "toolbar":  { "hidden": false, "compact": false },
            "site-hub": { "hidden": false },
            "content":  { "hidden": false, "fullWidth": false },
            "preview":  { "hidden": false }
        }
    },
    "focus": {
        "label":       "Focus",
        "description": "Strip the sidebar; compress the toolbar.",
        "regions": {
            "sidebar":  { "hidden": true },
            "toolbar":  { "compact": true },
            "content":  { "fullWidth": true },
            "preview":  { "hidden": true }
        }
    },
    "takeover": {
        "label":       "Takeover",
        "description": "All workspace chrome hidden.",
        "regions": {
            "sidebar":  { "hidden": true },
            "toolbar":  { "hidden": true },
            "site-hub": { "hidden": true },
            "content":  { "fullWidth": true }
        }
    },
    "modal":       { "label": "Modal Overlay", "modal": true },
    "focus-tight": {
        "label":   "Focus (tight)",
        "extends": "focus",
        "regions": { "site-hub": { "hidden": true } }
    }
}
```

| Rule | Notes |
|---|---|
| `modes.default` | **Required by the schema.** Every engine has a default. |
| `modes.<name>.label` | **Required.** Human-readable label for tooling + cascade-audit reports. Translatable. |
| `modes.<name>.description` | Optional one-line summary. Translatable. |
| `modes.<name>.regions` | Map of region id → state object. Region-id pattern matches `template-id` or nested `parent/child`. State keys are engine-defined. |
| `modes.<name>.chrome` | Optional engine-level chrome flags not tied to a specific region (density swap, global background, header visibility). Ignored when `modal: true`. |
| `modes.<name>.modal` | When true, mode renders as overlay. Underlying screen stays mounted with chrome unchanged. Engine ignores `regions` + `chrome` on this mode. |
| `modes.<name>.extends` | Optional. Inherits from another mode. Recursive, cycle-safe, depth 10. Circular reference → screen falls back to `default`. |
| Persistent regions | Hidden via CSS, NOT unmounted. State (scroll position, drilldown depth) survives transitions. |
| Modal stack | Multiple modal screens stack LIFO; topmost owns focus + Escape. Engines that don't stack collapse to "exclusive modal". |

**Conventions:** `default`, `focus`, `takeover`, `modal` are the four core mode names. Engines may add more (`kiosk`, `focus-tight`, `presentation`). Plugins extend a specific engine's catalog via the `wp_admin_workspaces_engine_modes_{engineId}` PHP filter.

**Per-region override from workspace.json.** A screen with `regions.sidebar.hidden: false` overrides whatever the mode declared for that region. Engine merges screen overrides on top of mode region states.

### `slots`

Engine-declared mount points beyond the kernel-reserved `_self` and `palette`. Each slot has a `scope` controlling where it's allowed.

```json
"slots": {
    "detail":         { "description": "Detail / inspector pane.",           "scope": "both" },
    "inspector":      { "description": "Right-side property inspector.",     "scope": "both" },
    "dashboard-grid": { "description": "Tile grid for dashboard widgets.",   "scope": "screen" },
    "toolbar":        { "description": "Persistent toolbar slot.",           "scope": "workspace" },
    "sidebar-footer": { "description": "Bottom of sidebar.",                 "scope": "workspace" },
    "status-bar":     { "description": "Bottom-of-viewport status strip.",   "scope": "workspace" }
}
```

| `scope` | Where slot is usable |
|---|---|
| `workspace` | `frame.widgets.<slot>[]` and `screens[id].slot` (workspace-scope URL slot). |
| `screen` | `screens[id].apps[i].slot` only (screen-internal). |
| `both` | Either of the above. |

Resolver rejects references to slots that don't resolve at any tier (kernel + engine + app-declared).

### `menu-renderer`

How the engine renders the workspace `menu` tree. Schema enum:

| Value | Behavior |
|---|---|
| `sidebar-drilldown` | `core:default`. Items with sub-items slide into a sub-screen with a back link. |
| `sidebar-tree` | Items with sub-items expand as tree nodes. |
| `dock` | `core:desktop`. Items with sub-items become folders. |
| `drawer` | `core:single-pane`. Items with sub-items become accordion sections. |
| `none` | Engine ignores `menu`. Authors drive nav through `regions` / `routes`. |
| `plugin:{slug}/{name}` | Plugin-namespaced runtime renderer. Schema accepts the id; the engine's render path consults the runtime renderer registry. Plugin renderers that fail resolution at activation fall back to `none` with a dev-mode warning. |

Omitting the field = `"none"`. Plugin renderers that fail resolution fall back to `none` with a dev warning. Renderers typically impose a depth limit (default 3) — items deeper get flattened or dropped per renderer policy.

### `default-arrangement`

Identifier for the spatial arrangement algorithm — documentation marker, not config the runtime reads. The actual algorithm is in the engine's script. Authors and tooling reference this name.

Conventional values: `wp-chrome` (sidebar + topbar + content), `tiling-dwindle` (Hyprland-style), `floating-windows`, `single-pane`. New names accumulate; schema doesn't enumerate.

### `defaultRegions`

Engine-shipped baseline region tree. The compiler merges this with `frame.widgets[]` + per-screen overrides to produce the runtime regions map.

```json
"defaultRegions": {
    "sidebar": {
        "template": "core:sidebar",
        "regions": {
            "hub": { "role": "region", "app": "core:site-hub" },
            "nav": { "role": "navigation", "app": "core:navigation" }
        }
    },
    "content": {
        "template": "core:main",
        "routing":  { "route-key": "_self" }
    },
    "detail": {
        "template": "core:detail",
        "routing":  { "route-key": "detail", "mode": "mirror" }
    },
    "command-palette": {
        "template": "core:overlay",
        "routing":  { "route-key": "palette" },
        "platform": { "core:triggerable": true, "core:trigger": { "shortcut": "Mod+K" } }
    },
    "notices-banner":   { "role": "region", "app": "core:notices-banner" },
    "notices-snackbar": { "role": "region", "app": "core:notices-snackbar" }
}
```

Region declaration shape (per master spec §5):

| Field | Purpose |
|---|---|
| `template` | Engine template id. Inherits role / platform / default-style / nested regions. |
| `role` | ARIA role. Required when `template` is absent. |
| `platform` | Service requests. Region declaration is the floor when merged with app's request. |
| `routing` | URL participation. `{ route-key: "_self" | "<name>", mode?: "mirror" }`. |
| `app` / `config` | Mount an app. Mutually exclusive with `routing.route-key`. |
| `regions` | Nested children. Addressable as `{parent}/{child}`. |
| `style` | Overrides for template's `default-style`. |
| `position` | Arrangement hint: `block-start`, `block-end`, `inline-start`, `inline-end`. |
| `capability` | Install-level cap gate. Subtree skipped if user lacks. |

**Routing `mirror` mode.** When a region declares `routing: { route-key: "detail", mode: "mirror" }`, the slot synthesizes value from the URL primary path. `screens[id].apps[i]` with `routing.mode: "mirror"` populates the detail slot. Used by paired-region layouts.

**Validation rule:** a region must declare EITHER `app` OR `routing.route-key`, never both. Kernel logs + drops `app` when both are present.

### `default-styles`

Engine-supplied seed defaults for the workspace's `styles` tree. The PHP resolver deep-merges this UNDER `workspace.json#styles` (workspace.json wins on every overlapping key). Lets the engine ship its characteristic visual identity without making every workspace repeat the rules.

Limited to **theme + chrome + direct slot overrides**. Per-region (`regions`) and per-app (`applications`) are workspace.json-only — engines don't supply install-decision metadata. `branding` is also workspace.json-only.

```json
"default-styles": {
    "theme": {
        "color": { "primary": "#3858e9", "bg": "#ffffff" },
        "density": "default"
    },
    "chrome": {
        "sidebar": { "background": "{color.gray.900}", "foreground": "{color.gray.50}" },
        "toolbar": { "background": "#ffffff" }
    }
}
```

| Field | Purpose |
|---|---|
| `theme` | ThemeProvider seeds. `color.primary`, `color.bg`, `cursor.control`, `density`. |
| `chrome` | Chrome surface palette. The chrome → WPDS bridge picks these up as `--wpds-*` overrides scoped to each surface. |
| `color` / `border` / `dimension` / `elevation` / `font` | Direct WPDS slot overrides. |

The resolver synthesizes an `engine` cascade origin between `core` and `plugin` carrying these defaults.

### `script` / `style` / `styles[]`

Standard WordPress asset handles. Must be registered with WordPress (via `wp_register_script` / `wp_register_style`) before the manifest references them.

```json
"script": "wp-admin-workspaces",
"style":  "wp-admin-workspaces",
"styles": [
    { "handle": "wp-admin-workspaces-wpds-tokens", "src": "build/wpds-tokens.css" },
    { "handle": "wp-admin-workspaces-dataviews", "src": "build/dataviews.css", "deps": [ "wp-components" ] }
]
```

`styles[]` covers extra bundles the engine wants enqueued when active — DS token files, component library CSS. Loaded only when this engine matches `workspace.json#engine`. Each entry: `handle` (unique kebab-case) + `src` (URL or plugin-relative path) + optional `deps[]`.

## Engine + design system contracts

The kernel is **DS-neutral** — no `--wpds-*`, no `@wordpress/components`, no `@wordpress/ui`, no `@wordpress/icons`, no `@wordpress/dataviews` import appears in kernel code (`src/runtime/*` outside `src/runtime/engines/`). Anything DS-specific lives inside an engine.

Three contracts when shipping a non-WPDS engine — pick one (see `docs/engines-and-design-systems.md`):

| Contract | What |
|---|---|
| **reuse-WPDS** | Engine ships with `designSystem: "@wordpress/ui"` and a WPDS-native ThemeProvider. Apps in the workspace continue to render WPDS components. **Easiest path** — leverage `@wordpress/ui` + the existing app set. |
| **token-bridge** | Engine ships a non-WPDS ThemeProvider (e.g. Material) but maps WPDS slot names → DS-native tokens. Apps still render WPDS components; visuals shift via the bridge. Useful for brand-locked installs. |
| **engine-native apps** | Engine + apps both target the alternative DS. Bundled apps (which are WPDS-married) don't apply — author or curate a separate app set. Highest effort, complete control. |

### Pluggable ThemeProvider seam

Engine modules MAY export an optional `ThemeProvider` field on their `EngineSource` (the JS-side registration, `src/runtime/registry/source-types.js`). When present, `ThemeProviderHost` mounts it instead of the neutral fallback.

```js
// engine's index.js
import ThemeProvider from './MyThemeProvider';
export const engine = {
    id: 'plugin:acme/material',
    Layout,
    ThemeProvider,            // mounted by ThemeProviderHost
    compileStyles,            // optional — see below
};
```

Render-time errors trip the host's error boundary; host swaps to a neutral pass-through wrapper and logs a console error. Workspace still paints. Theming won't apply until the provider is fixed.

### Engine-pluggable style compiler

Engine source MAY ship a `compileStyles(styles, tokens) → { top, scoped, subtrees }` hook. Host calls it and emits scoped `<style>` blocks. Engines that omit the hook get zero scoped overrides — the provider owns all token plumbing directly. WPDS-flavored implementation reference: `src/runtime/engines/core-default/compileStyles.mjs`.

### Chrome → WPDS bridge

Each chrome surface (sidebar / toolbar / site-hub) maps `chrome.<surface>.<slot>` → a `--wpds-*` interactive token, scoped under the surface's container class. `@wordpress/ui` Buttons / IconButtons / Stacks inside the scope inherit the chrome palette automatically. Reference: `CHROME_WPDS_BINDINGS` in `src/runtime/engines/core-default/compileStyles.mjs`.

For a non-WPDS engine, write your own bindings table that maps chrome slots → DS tokens.

### Slot/Fill substrate

`<SlotFillProvider>` (from `@wordpress/components`) lives in **each engine's `Layout.js`**, NOT in the kernel. Bundled engines wrap to support `@wordpress/components` Slot/Fill consumers (notices snackbar, modals, sidebar plugins). A non-WPDS engine that doesn't use `@wordpress/components` Slot/Fill omits the wrap.

### `windowing/` subdir

Required for windowed engines. `core:desktop` ships a `WindowManager` TS class + `WindowManagerContext` + hooks. Reads the kernel's `core:dynamic-children` service to mount per-window child regions. Needs `core:dynamic-children` in `honored-platform`.

## Common authoring tasks

### Tweak a bundled engine's default-styles via workspace.json

Most "the sidebar should be lighter" or "the brand color is blue" requests don't need a new engine — set `styles.theme.color.primary` and `styles.chrome.sidebar.*` in workspace.json and you're done. Reach for engine.json only when the **layout** changes or you're shipping a different DS.

### Add a new mode

```json
"modes": {
    "kiosk": {
        "label":       "Kiosk",
        "description": "Full-viewport: no chrome, no nav.",
        "regions": {
            "sidebar":  { "hidden": true },
            "toolbar":  { "hidden": true },
            "site-hub": { "hidden": true }
        }
    }
}
```

Authors set `screens[id].mode: "kiosk"` in workspace.json.

### Add a new slot

```json
"slots": {
    "inspector-right": { "description": "Right-side inspector panel.", "scope": "both" }
}
```

Then declare a region using the slot in `defaultRegions`:

```json
"defaultRegions": {
    "inspector": {
        "role": "complementary",
        "routing": { "route-key": "inspector", "mode": "mirror" }
    }
}
```

Authors mount apps via `screens[id].apps[i].slot: "inspector-right"`.

### Build a tiling engine

```json
{
    "id": "plugin:tiling-pro/dwindle",
    "version": 3,
    "title": "Dwindle Tiling",
    "designSystem": "@wordpress/ui",
    "specializes-roles": [ "main", "navigation" ],
    "honored-platform": [ "core:modal", "core:dismiss-on", "core:dynamic-children" ],
    "templates": {
        "plugin:tiling-pro/tile": {
            "role": "region",
            "default-style": { "display": "flex" },
            "platform": { "core:dynamic-children": true }
        }
    },
    "modes": { "default": { "label": "Default", "regions": {} } },
    "menu-renderer": "none",
    "default-arrangement": "tiling-dwindle",
    "defaultRegions": {
        "root": { "template": "plugin:tiling-pro/tile" }
    },
    "script": "tiling-pro-engine"
}
```

The arrangement logic lives in the engine's JS module (`tiling-pro-engine`). Tile creation/destruction goes through `useDynamicChildren(parentRegionId)`.

### Ship a Material Design engine (token-bridge contract)

See spec §13.1 for the worked example. Highlights:

- `designSystem: "mui"`
- ThemeProvider wraps `@mui/material/styles.ThemeProvider` and remaps WPDS tokens to MUI tokens via a bridge.
- `compileStyles` emits scoped MUI palette CSS — `--mui-palette-primary-main` driven by `styles.theme.color.primary` etc.
- Keep `honored-platform` aligned with what your `Layout.js` actually implements. Don't claim `core:modal` unless you trap focus + emit ARIA modal.

### Plugin-contributed modes

PHP filter on a specific engine's catalog:

```php
add_filter( 'wp_admin_workspaces_engine_modes_core:default', function( $modes ) {
    $modes['kiosk'] = [
        'label'   => 'Kiosk',
        'regions' => [
            'sidebar'  => [ 'hidden' => true ],
            'toolbar'  => [ 'hidden' => true ],
            'site-hub' => [ 'hidden' => true ],
        ],
    ];
    return $modes;
} );
```

Filter contributes through the `plugin` cascade origin; site / role / user can still override `screens[id].mode`.

## Sanity checks before declaring "done"

```bash
# Validate manifest against schema (Ajv sweep)
npm run test:schema

# Engine resolution: modes, templates, default-styles
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-mode-resolution-tests.php
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-engine-defaults-tests.php

# Kernel DS-neutrality (engine code in engines/, NOT kernel)
node --test tests/runtime/kernel-no-ds-import.test.mjs

# If shipping core:desktop-style: dynamic-children + windowing
npm run test:engines      # core:desktop TS suite
```

For new engines, walk the manual smoke checklist in `docs/desktop-engine-readiness.md` (windowed) and load the engine against each bundled workspace in `wp-env`.

## Common pitfalls

- **No `default` mode** = schema validation fails. Every engine has a default mode.
- **`mode.label`** is required by the schema on EVERY mode entry. Missing labels fail Ajv validation.
- **Region `app` + `routing.route-key` together** = kernel logs + drops `app`. URL routing wins. Pick one.
- **`role` required when no `template`.** Either inherit role from a template or declare it explicitly.
- **`uniqueItems: true`** on `specializes-roles` and `honored-platform`. Don't duplicate.
- **`platform.core:block-navigation-on-dirty: true`** requires `platform.core:dirty-state: true`. Schema enforces.
- **Windowed engines** must list `core:dynamic-children` in `honored-platform` AND ship a template declaring `platform: { "core:dynamic-children": true }`.
- **Don't add `--wpds-*` to kernel code.** If the change needs WPDS values, it goes in the engine module under `src/runtime/engines/<engine>/`.
- **Don't claim a platform service you don't implement.** Apps will mount expecting the service and silently break.
- **Templates `role: "main"` plus `platform.core:persists-across-navigation: true`** is usually wrong. The main content region rotates per route; only sidebars / topbars / status bars persist.
- **`default-styles.regions` and `.applications`** are workspace.json-only. Schema rejects them in engine `default-styles`. Engines ship visual identity, not install metadata.

## When you need more

| Question | Where to look |
|---|---|
| What does `core:default` ship for template X? | `src/runtime/engines/core-default/engine.json` |
| How does single-pane handle modes? | `src/runtime/engines/core-single-pane/engine.json` + `index.css` |
| How does desktop handle dynamic children? | `src/runtime/engines/core-desktop/windowing/*.ts` + `engine.json` |
| Region vocabulary contract? | `docs/wp-admin-workspaces-design-spec.md` §5 |
| URL routing + route-key semantics? | `docs/wp-admin-workspaces-design-spec.md` §6 |
| Theming model (4 tiers + chrome bridge)? | Project CLAUDE.md "Theming model" section + `docs/engines-and-design-systems.md` |
| Material Design worked example? | `docs/wp-admin-workspaces-design-spec.md` §13.1 |
