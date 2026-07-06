---
name: workspace-json-author
description: Author or edit WP Admin Workspaces workspace.json workspace files. Use whenever a user wants to add, rename, hide, reorder, or reconfigure a screen in their WordPress admin; reorganize the menu; brand the admin; change theme colors / density / background; bind a keyboard shortcut; declare a dataView/column/filter; choose which engine renders the workspace; mount widgets (toolbar, sidebar-footer, status-bar); restrict screens by capability or role; preload REST paths; or ship a per-role / per-user workspace. Triggers on phrases like "add a screen", "hide the plugins menu", "rebrand wp-admin", "change the dashboard layout", "make Posts default", "mount a sidebar widget", "use the desktop engine", "add Mod+K", "filter Posts to drafts", "restrict Settings to editors". Covers the canonical workspace.json shape — workspace / settings / screens / menu / commands / styles / preload — plus cascade semantics (deep merge by id, null tombstones, trust-tier rules) and the regions / routes escape hatches.
---

# workspace.json Authoring Skill

`workspace.json` is the **install-decision file** for a WP Admin Workspaces workspace. It picks an engine, declares the workspace's screens and menu, names commands and shortcuts, brands the install, and tunes the theme. Anything intrinsic to a single app or engine belongs in `app.json` / `engine.json` — workspace.json composes them.

Always set `"version": 3`.

## Authoritative references (read these before touching anything non-trivial)

| Doc | When |
|---|---|
| `docs/schemas/workspace.json` | JSON Schema (draft 2020-12). The runtime + tooling validate against it. Read the inline `description` fields. |
| `docs/public/workspace-json-reference.md` | Author-facing reference. Per-field tables, examples for every top-level block. |
| `docs/schema-sketch.md` | Design doc. Cascade semantics, OR-semantic permissions w/ trust tiers, mode catalog, slot vocabulary, classic wp-admin menu bridge, programmatic registration. |
| `docs/dataview-config.md` | dataView 3-axis registry (`kind/name/variant`), `extends`, filter hooks, REST endpoints. |
| `docs/wp-admin-workspaces-design-spec.md` | Master spec — runtime architecture, region vocabulary, URL routing, capability gating, theming model, extension points. Read §5 (regions) and §6 (routing) when using the escape hatches. |
| `workspaces/single-pane-demo.json` | Compact example — start here. |
| `workspaces/wp-admin-default.json` | Largest example — every wp-admin screen, iframe fallbacks, multi-app screens. |

## Top-level shape (cheat sheet)

```json
{
    "$schema": "https://schemas.wp.org/workspace.json",
    "version": 3,
    "$wpds": "6.9",
    "name": "my-workspace",
    "title": "My Workspace",
    "description": "...",
    "user-switchable": true,

    "engine": "core:default",  /* required — which engine renders */
    "default-screen": "...",   /* initial screen id */
    "frame":     { /* branding + notices + persistent widgets */ },
    "settings":  { /* dataViews + dataFields registries */ },
    "screens":   { /* id-keyed map of every screen */ },
    "menu":      { /* nested IA tree */ },
    "commands":  [ /* palette entries + shortcuts */ ],
    "styles":    { /* theme.json-shaped */ },
    "preload":   [ /* REST paths */ ],

    "regions": { /* escape hatch — usually omitted */ },
    "routes":  { /* escape hatch — usually omitted */ }
}
```

**Required fields:** `version`, `$wpds`, `name`, `engine`, `screens`. All others optional. `additionalProperties: false` on every level — unknown keys fail validation.

## Block-by-block authoring playbook

### `engine` / `default-screen` / `frame`

Install-level intrinsics. `engine` (top-level, required) and `default-screen` (top-level) name the renderer and landing screen; `frame` holds the persistent furniture wired into the workspace — branding, notice hosts, persistent widgets. (`frame` is *what furniture exists*; `styles.chrome` is *how it's painted* — see `styles`.)

```json
"engine": "core:default",
"default-screen": "dashboard-home",
"frame": {
    "branding": { "logo": "./assets/acme-logo.svg", "title": "Acme Corp", "icon": "..." },
    "notices": {
        "banner":   { "app": "core:notices-banner" },
        "snackbar": { "app": "core:notices-snackbar" }
    },
    "widgets": {
        "toolbar":        [ { "id": "search", "app": "core:toolbar-actions" } ],
        "sidebar-footer": [ { "id": "user-menu", "app": "core:user-menu" } ]
    }
}
```

- **`engine`** (top-level, required) — `core:default` (sidebar + topbar + content, WPDS) is the safe default. `core:single-pane` is mobile-first; `core:desktop` is windowed. Plugin engines use `plugin:{slug}/{name}`.
- **`default-screen`** (top-level) — screen id, NOT a path. Falls back to "first permitted screen with a path" when omitted or denied by capability gating.
- **`frame.branding.logo`** can be a relative path; emit alongside the workspace.json or under `assets/`.
- **`frame.widgets.<slot>`** arrays merge by `id` across cascade origins — plugin authors append to `toolbar[]` at the `plugin` origin.
- **Engine slots vary.** `core:default` exposes `toolbar` + `sidebar-footer`; `core:desktop` adds `status-bar` + `dock`. Check the engine's `engine.json#slots`.

### `settings`

Reusable definition registries. Two flavors:

- **`settings.dataViews`** — 3-axis registry keyed `kind → name → variant`. Each leaf is a `@wordpress/dataviews` config doc.
- **`settings.dataFields`** — named field collections (referenced from a dataView via `fieldsRef`).

```json
"settings": {
    "dataFields": {
        "core/post-fields": {
            "kind": "postType",
            "name": null,
            "fields": [
                { "id": "title",  "type": "text",     "label": "Title", "enableGlobalSearch": true },
                { "id": "status", "type": "text",     "label": "Status" },
                { "id": "author", "type": "text",     "label": "Author" },
                { "id": "date",   "type": "datetime", "label": "Date" }
            ]
        }
    },
    "dataViews": {
        "postType": {
            "post": {
                "_default": {
                    "fieldsRef": "core/post-fields",
                    "defaultView": {
                        "type": "table", "perPage": 20,
                        "fields": [ "status", "author", "date" ],
                        "titleField": "title",
                        "sort": { "field": "date", "direction": "desc" }
                    },
                    "defaultLayouts": { "table": {}, "grid": {} },
                    "actions": [
                        { "id": "edit",  "label": "Edit",  "isPrimary": true,  "icon": "pencil" },
                        { "id": "trash", "label": "Trash", "isDestructive": true, "supportsBulk": true, "icon": "trash" }
                    ]
                },
                "drafts": {
                    "extends": "_default",
                    "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "draft" } ] }
                }
            }
        }
    }
}
```

- **Variants resolve independently.** Use explicit `"extends": "_default"` to inherit from the base — no implicit merge. Cycle-safe, max depth 10.
- **`fieldsRef`** points at a `dataFields` collection id. Inline `fields[]` shallow-merges per-id over the collection (ref wins on collision); inline-only ids append after.
- **The `dataView` block in an app manifest** ships baseline variants for that `(kind, name)` — the resolver folds them into `settings.dataViews` at the `core` origin. workspace.json wins on collision.
- **Per-screen overlay** — `screens[id].dataView` deep-merges on top of the resolved triple, with `null` tombstones for fields/actions at any depth.

For full dataView semantics — variant chains, filter hooks, the `useDataView` React hook, REST endpoints — see `docs/dataview-config.md`.

### `screens`

The map of every screen the workspace exposes. id → screen object. Each screen declares **what** mounts (`app` or `apps[]`), **where** in the URL (`path`, `slot`), **how** it presents (`mode`), **who** can see it (`permissions`), and **what data** it surfaces (`dataViewRef` + optional inline `dataView` overlay).

```json
"screens": {
    "posts": {
        "label": "Posts",
        "icon":  "post",
        "path":  "/posts",
        "app":   "core:posts",
        "config": { "postType": "post" },
        "dataViewRef": "postType/post/_default",
        "permissions": { "capabilities": [ "edit_posts" ] },
        "mode": "default",
        "preload": [ "/wp/v2/categories?context=view" ]
    },
    "post-edit": {
        "label": "Edit Post",
        "path":  "/posts/{id}/edit",
        "app":   "core:simple-editor",
        "config": { "postType": "post", "id": "{id}" },
        "mode":  "focus"
    },
    "dashboard-home": {
        "label": "Home", "icon": "home",
        "path":  "/dashboard/home",
        "apps": [
            { "id": "host",         "app": "core:dashboard-host" },
            { "id": "recent-posts", "app": "core:dashboard-widget-recent-posts", "slot": "grid" },
            { "id": "quick-draft",  "app": "core:dashboard-widget-quick-draft",  "slot": "grid", "size": { "w": 2, "h": 2 } }
        ]
    },
    "command-palette": {
        "label": "Command Palette",
        "slot":  "palette",
        "mode":  "modal",
        "app":   "core:command-palette"
    }
}
```

#### Single-app vs multi-app

| Use | When |
|---|---|
| `"app": "core:posts"` + `"config": { ... }` | Single primary app. Most screens. |
| `"apps": [ { "id", "app", "config", "slot", "size", "position", "routing" } ]` | Multiple apps in one screen — dashboard tiles, paired list+detail, etc. |

Both shapes coexist. The resolver normalizes shorthand to `apps: [ { "id": "main", "app": "...", "config": {...} } ]` internally. Cascade overrides address the long-form array by entry `id`.

#### Field reference (most useful)

| Field | Purpose | Default |
|---|---|---|
| `label` / `icon` / `description` | Menu + header. `icon` resolves through the active engine's icon registry. | — |
| `path` | URL pattern routing to this screen. Static segments + `{param}` captures. (Schema `path` pattern rejects `*` — for a wildcard suffix use the `routes` escape hatch, whose keys allow `*`.) | — |
| `slot` | Workspace-scope URL slot. `_self` (primary path), `palette` (command palette), engine-declared slots (`detail`, `inspector`, etc.). | `_self` |
| `app` / `config` | Single-app shorthand. `{paramname}` substitutions in `config` resolve against URL params. | — |
| `apps[]` | Multi-app long form. Each entry: `id` (required), `app`, `config`, `slot` (screen-scope), `size: {w,h}`, `position: "auto" | {row,col}`, `routing: {mode}` (e.g. `"mirror"`). | — |
| `mode` | Engine chrome mode. Core catalog: `default`, `focus`, `takeover`, `modal`. Engines may add custom modes via filter. | `"default"` |
| `permissions` | `{ capabilities: [], roles: [] }` — OR semantics. Default when absent: admin-only. See "Permissions" below. | admin-only |
| `dataViewRef` | `kind/name/variant` triple pointer. Or use explicit `dataViewKind` / `dataViewName` / `dataViewVariant`. | — |
| `dataView` | Inline overlay deep-merged on top of the resolved triple. | — |
| `preload` | REST paths to hydrate when the screen activates. Additive with workspace-level `preload[]`. | — |
| `regions` | Per-screen region overrides — escape hatch for tweaking engine region states (`hidden`, `compact`, etc.). | — |
| `hidden` | When `true` at any cascade origin, screen is suppressed entirely. | `false` |
| `styles` | Per-screen style overrides. Same shape as top-level `styles`. | — |

#### Common iframe fallback

```json
"customize": {
    "label": "Customize", "icon": "appearance",
    "path":  "/customize",
    "app":   "iframe:customize.php",
    "mode":  "takeover"
}
```

`iframe:<slug>` is sugar — the compiler translates it to `core:iframe-fallback` + `config.url` at the end of resolution. URLs resolve relative to `adminUrl` (`window.wpAdminWorkspaces.adminUrl`).

### `menu`

Engine-agnostic IA tree. Each item is keyed by id. Items with `items` become containers (no separate "groups" block). **Items whose key matches a screen id implicitly bind to that screen** — its label/icon/permissions flow through automatically.

```json
"menu": {
    "content": {
        "label": "Content",
        "icon":  "post",
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
            "pages": { "position": 40 },
            "media": { "position": 50 },
            "sep-1": { "separator": true, "position": 60 }
        }
    },
    "view-site": {
        "label": "View Site", "icon": "external",
        "href":  "{site_url}",
        "external": true,
        "position": 99
    }
}
```

| Field | Purpose |
|---|---|
| `label` / `icon` | Override bound screen's label/icon, OR required for standalone items (no screen binding). |
| `position` | Sort order among siblings. Lower = earlier. |
| `items` | Nested child items. Recursive — same shape. |
| `href` | External link target. Token interpolation supported (`{site_url}`). |
| `external` | With `href`, opens in new tab. |
| `separator` | Visual separator. Other fields ignored. |
| `hidden` | Suppresses rendering. Subtree stays addressable for cascade. |

**Children do NOT inherit parent's icon.** Each menu item renders its own icon, or no icon. Authors must declare explicitly.

**Drilldown state lives in the URL** (`?screen=<id>`). NavigationApp writes via `navigateScreen(id|null)`; deep-links survive refresh.

**Classic wp-admin menu bridge** auto-ingests every `add_menu_page()` / `add_submenu_page()` registration into `menu.ingested.items[]`. Yoast / ACF / WooCommerce appear in the menu without any workspace.json edit. Authors override:

- Rename in menu only: `menu.ingested.items.woocommerce.label: "Shop"`
- Reparent: `menu.ingested.items.woocommerce: null` + `menu.content.items.woocommerce: { position: 70 }`
- Hide from menu but keep URL-accessible: `menu.ingested.items.woocommerce.hidden: true`
- Hide entirely: `screens.woocommerce.hidden: true`

### `commands`

First-class palette entries + keyboard shortcuts. Array of objects with an explicit `id`.

```json
"commands": [
    { "id": "open-palette", "shortcut": "Mod+K",       "invoke":   "core:command-palette", "label": "Open Command Palette" },
    { "id": "new-post",     "shortcut": "Mod+Shift+N", "navigate": "/posts/new",            "label": "New Post" },
    { "id": "go-to-posts",  "shortcut": "g p",         "navigate": "/posts",                "label": "Go to Posts" }
]
```

- **`shortcut`** uses `@wordpress/keyboard-shortcuts` syntax. `Mod` = `Cmd` on macOS, `Ctrl` elsewhere. Chord keys allowed (`"g p"`).
- **`invoke`** mounts a triggerable app — the app must declare `platform.core:triggerable: true` in its manifest.
- **`navigate`** is a URL shortcut. No app mounts directly.
- **Mutually exclusive** — declare `invoke` XOR `navigate`.
- **Palette-only** entries omit `shortcut`. Palette auto-synthesizes "Go to X" entries from `screens[id]` — only add explicit commands for things palette-go-to doesn't cover.

### `styles`

WPDS-shaped theme tree. Four customization paths in increasing escape-hatch order:

1. **`styles.theme`** — ThemeProvider seeds (`color.primary`, `color.bg`, `cursor.control`, `density`). Primary path.
2. **`styles.regions[id].theme` / `styles.applications[id].theme`** — nested provider overrides on a subtree.
3. **`styles.chrome.<surface>.*` + `styles.color/border/dimension/elevation/font`** — direct slot overrides (escape hatch).
4. **Sibling `tokens.json`** + curly-brace aliases (`"{color.brand.500}"`) — DTCG primitives.

```json
"styles": {
    "theme": {
        "color": { "primary": "#3858e9", "bg": "#fafafa" },
        "density": "default",
        "cursor": { "control": "pointer" }
    },
    "chrome": {
        "sidebar": {
            "background": "{color.gray.900}",
            "foreground": "{color.gray.50}"
        },
        "toolbar": { "background": "#ffffff" }
    },
    "regions": {
        "preview": { "theme": { "color": { "bg": "#1e1e1e" } } }
    }
}
```

**Density** — `default`, `compact`, `comfortable`. ThemeProvider derives the WPDS spacing scale from the seed.

**Chrome slots** — workspace-only surfaces WPDS doesn't cover. Sub-namespaces: `sidebar`, `toolbar`, `siteHub`, `content`, `canvas`. Engines that consume custom chrome slugs declare them in their manifest.

`tokens.json` (DTCG) sits alongside workspace.json. The PHP `WP_Admin_Workspaces_Tokens` resolver deep-merges site → theme → plugin → core token files; aliases resolve curly-brace references.

### `preload`

REST paths to hydrate server-side and inject as `wp.apiFetch.createPreloadingMiddleware` cache before the workspace bundle runs.

```json
"preload": [
    "/wp/v2/users/me",
    "/wp/v2/types?context=view",
    [ "/wp/v2/posts", "OPTIONS" ]
]
```

- String → GET shorthand. `[ path, method ]` for OPTIONS preflight.
- Methods restricted to GET / OPTIONS.
- Across origins: additive concatenation. Dedupe by exact `path+method`.
- Conditional preloads live in a `wp_admin_workspaces_data_{origin}` PHP filter callback, NOT in workspace.json.
- Per-screen `screens[id].preload` is additive with this workspace-level list.

### `regions` / `routes` (escape hatches)

The kernel synthesizes the runtime regions map + routes table from `screens[]` + the active engine's `defaultRegions`. Top-level `regions` / `routes` blocks are escape hatches when the `screens` shape can't express what you need. Avoid unless required.

For region declaration shape, see master spec §5. For route patterns, §6.2. Don't write these blocks until you know what they do — most workspaces never need them.

## Permissions (OR-semantic, trust-tiered)

```json
"permissions": {
    "capabilities": [ "manage_options" ],
    "roles":        [ "administrator", "super-admin" ]
}
```

| Rule | Notes |
|---|---|
| Within `capabilities` | OR — user passes if they hold ANY listed cap. |
| Within `roles` | OR — user passes if they belong to ANY listed role. |
| Between the two | OR — user passes the screen if they pass EITHER. |
| Magic value | `"super-admin"` in `roles` triggers `is_super_admin()` (multisite-aware). |
| Default when absent | Admin-only (`roles: [ "administrator", "super-admin" ]`). Fail-closed. |
| Unknown values | Treated as permanently unsatisfiable. Typos hide, never expose. |

**App-manifest `capabilities[]` is an AND-floor.** Workspace cannot lower the floor. Even if `screens[id].permissions.roles: [ "subscriber" ]`, the app's `capabilities: [ "manage_options" ]` still gates subscribers out.

**Trust-tier cascade.** Higher trust origins may grow or shrink the OR-set; lower trust may only shrink:

| Origin | May add | May remove |
|---|---|---|
| `core` / `engine` / `plugin` / `site` | Yes | Yes |
| `role` | No | Yes |
| `user` | No | Yes |

Resolver rejects forbidden modifications + logs to a site-admin audit channel.

## Cascade semantics (read once, refer back)

Six origins merge in fixed order: **core → engine → plugin → site → role → user**.

- **Objects:** deep-merge per-field. Higher origin's keys overlay lower's.
- **Arrays with `id` field:** merge by `id`, deep-merge per-field on collision, append new ids. `screens[id].apps[]`, `commands[]`, `widgets.<slot>[]`, `dataView.fields[]`, `dataView.actions[]`, `menu` tree at every depth.
- **Arrays without `id`:** wholesale replacement.
- **Tombstones:** `null` at any path removes the lower-origin value. Works at any depth. `"screens.posts.dataView.fields.author": null` drops the author column on Posts only.

**Path collisions** between two distinct screen IDs claiming the same `path` fail the resolver. Override path on an existing screen by id is a normal cascade — not a collision.

**`customizable` allowlist.** Consumer origins (role / user) can only write paths the workspace declares as customizable. The DENY_PATTERNS list (`WP_Admin_Workspaces_Customizable::DENY_PATTERNS`) makes `screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, and `engine` non-customizable even when allowed — these are security gates.

## Engine selection guide

| Engine | Use when | Skip when |
|---|---|---|
| `core:default` | Standard desktop admin. Sidebar + topbar + content. WPDS chrome. **Default for most workspaces.** | Mobile-first UI, windowed UX. |
| `core:single-pane` | Mobile-first / kiosk / minimal. Drawer-based nav. WPDS chrome. | You need multi-pane simultaneously. |
| `core:desktop` | Windowed UX (à la macOS / Windows). Compositor + dock + window frames. Requires dynamic-children + chromeless bridge. | Standard productivity admin (overkill). |
| Custom (`plugin:{slug}/{name}`) | You're shipping a Material / Tailwind / brand-locked design system, or a tiling/MDI arrangement no core engine covers. | You can hit the goal by tweaking core engine `default-styles` from workspace.json. |

Switching engines is one field: `engine`. The rest of the workspace shape is engine-agnostic — the engine renders the same screens / menu / commands its own way.

## Common authoring tasks (with patches)

### Add a screen for a custom post type

```json
"screens": {
    "products": {
        "label": "Products", "icon": "post",
        "path":  "/products",
        "app":   "core:posts",
        "config": { "postType": "product" },
        "permissions": { "capabilities": [ "edit_posts" ] }
    }
},
"menu": {
    "content": {
        "items": { "products": { "position": 25 } }
    }
}
```

### Add a column to the Posts table (workspace-wide)

```json
"settings": {
    "dataViews": {
        "postType": {
            "post": {
                "_default": {
                    "fields": [
                        { "id": "comment_count", "type": "integer", "label": "Comments" }
                    ]
                }
            }
        }
    }
}
```

(Inline `fields[]` merges per-id with the resolved base from the app manifest — only `comment_count` is added.)

### Add the same column on the Posts SCREEN only

```json
"screens": {
    "posts": {
        "dataView": {
            "fields": [ { "id": "comment_count", "type": "integer", "label": "Comments" } ]
        }
    }
}
```

### Rename Posts to "Articles" in the menu (no screen change)

```json
"menu": {
    "content": {
        "items": {
            "posts": { "label": "Articles" }
        }
    }
}
```

### Hide a screen entirely

```json
"screens": { "plugins": null }
```

### Hide from menu but keep URL-accessible

```json
"menu": { "appearance": { "items": { "plugins": { "hidden": true } } } }
```

### Set the landing screen

```json
"default-screen": "dashboard-home"
```

### Restrict Settings to editors + admins

```json
"screens": {
    "settings": {
        "permissions": {
            "capabilities": [ "manage_options" ],
            "roles":        [ "editor", "administrator", "super-admin" ]
        }
    }
}
```

(`manage_options` floor stays — editors only get in if they hold it. Use roles only to widen, not bypass.)

### Mount a sidebar-footer widget

```json
"frame": {
    "widgets": {
        "sidebar-footer": [ { "id": "help", "app": "plugin:acme/help-link" } ]
    }
}
```

### Bind a keyboard shortcut

```json
"commands": [
    { "id": "save-draft", "shortcut": "Mod+S", "invoke": "plugin:acme/quick-save", "label": "Save Draft" }
]
```

### Add a Drafts variant + screen

```json
"settings": {
    "dataViews": {
        "postType": {
            "post": {
                "drafts": {
                    "extends": "_default",
                    "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "draft" } ] }
                }
            }
        }
    }
},
"screens": {
    "posts-drafts": {
        "label": "Drafts",
        "path":  "/posts/drafts",
        "app":   "core:posts",
        "config": { "postType": "post" },
        "dataViewRef": "postType/post/drafts"
    }
}
```

### Brand the admin

```json
"frame": {
    "branding": { "logo": "./assets/acme-logo.svg", "title": "Acme Corp" }
},
"styles": {
    "theme": { "color": { "primary": "#cc0000" } },
    "chrome": { "sidebar": { "background": "#1a1a1a" } }
}
```

### Swap the engine to desktop

```json
"engine": "core:desktop"
```

(No further changes needed — screens / menu / commands stay the same. The engine renders them as windows + dock.)

### Set Posts as the default landing and pre-load categories

```json
"default-screen": "posts",
"preload":   [ "/wp/v2/categories?context=view", "/wp/v2/tags?context=view" ]
```

## Sanity checks before declaring "done"

```bash
# Validate against the schema (runs on every workspace in workspaces/)
npm run test:schema

# Resolver author-shape invariants (screen has primary app, paths unique, default-screen resolves)
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-shape-tests.php

# Cascade semantics (merge / tombstones / trust tier)
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cascade-tests.php

# Capability + permissions gating
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cap-gating-smoke.php
```

For non-trivial changes, also load the workspace in `wp-env` and walk the screens manually. Per-screen specs live in `docs/screens/*.md` (42 files) — they're the source of truth when rebuilding any wp-admin surface.

## Common pitfalls

- **`additionalProperties: false`.** A typo in any key fails Ajv validation. If something silently doesn't render, schema-validate first.
- **`default-screen` is a screen id**, not a path. Resolver falls back gracefully — but only if other screens have paths.
- **`screens[id].mode: "focus"`** hides the sidebar; screens with `mode: "focus"` that the user lands on via URL still mount fine, but the menu drilldown state can look stale. Pair with `core:simple-editor` / `core:editor`.
- **Iframe screens** drop into wp-admin-styled chrome. Use `mode: "takeover"` so the workspace hides everything else.
- **`menu` item keys matching screen ids** bind implicitly. If you don't see a screen in the menu, check the item key spelling matches the screen id exactly.
- **Empty `permissions: {}`** = admin-only (fail-closed). To open a screen to "any logged-in user", declare `permissions: { capabilities: [ "read" ] }`.
- **`role` / `user` origin cannot grant** permissions — only shrink. Use site/plugin origins to widen.
- **`apps[]` slot vocabulary** is the union of kernel-reserved (`_self`, `palette`), engine-declared (`detail`, `inspector`, `dashboard-grid`, `toolbar`, `sidebar-footer`, `status-bar`), and app-declared slots (e.g. `core:dashboard-host` exposes `grid`). Reference to a slot that doesn't resolve is a validation error.
- **For `apps[]` entries**, `id` is the cascade merge key. Make it stable + descriptive (`list`, `preview`, `host`) — NOT the app id.
- **Widgets live on screen `apps[]`** with `slot: "grid"` against a `core:dashboard-host` mount — there is no top-level `dashboardWidgets` block.

## When you need more

| Question | Where to look |
|---|---|
| What slots does engine X expose? | `src/runtime/engines/<engine>/engine.json` → `slots`. Or `docs/engines-and-design-systems.md`. |
| What does app X take as `config`? | `src/apps/<id>/app.json` → `config-schema`. |
| What dataView variants does app X ship? | `src/apps/<id>/app.json` → `dataView.variants`. |
| What's the WPDS slot list at $wpds version Y? | `src/runtime/styles/wpds-defaults/<wpds>.json`. |
| Spec rationale for a block? | `docs/schema-sketch.md`. |
| Runtime architecture (regions, routing, gating)? | `docs/wp-admin-workspaces-design-spec.md`. |
| Per-screen functional specs (wp-admin rebuilds)? | `docs/screens/*.md`. |
