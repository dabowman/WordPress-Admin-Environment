# Customizing the `core:default` Workspace

A practical, end-to-end guide to customizing the flagship WP Admin Workspaces workspace. It covers every primitive the design ships, what each one is for, and **when** and **how** to reach for it.

`core:default` is the engine you get unless you ask for something else: a **sidebar + topbar + content** layout with an optional **detail** pane and a **command palette**, painted in `@wordpress/ui` (WPDS) chrome. You customize it by authoring a single file — `workspace.json` — that picks this engine and declares your screens, menu, commands, branding, theme, and data views. You never edit engine code to customize a workspace.

> **Scope.** This guide is `core:default`-specific: it names the engine's actual modes, region-state flags, slots, region tree, and chrome variables (sourced from `src/runtime/engines/core-default/engine.json`). For the engine-agnostic schema field tables, see [`workspace-json-reference.md`](./workspace-json-reference.md). For the design rationale, see [`../schema-sketch.md`](../schema-sketch.md) and [`../core-default-engine.md`](../core-default-engine.md).

---

## Contents

- [The mental model](#the-mental-model)
- [Quick start](#quick-start)
- [What `core:default` gives you out of the box](#what-coredefault-gives-you-out-of-the-box)
- [The primitives, block by block](#the-primitives-block-by-block)
  - [`engine` / `default-screen` / `frame` — engine, landing, branding, notices, widgets](#engine--default-screen--frame--engine-landing-branding-notices-widgets)
  - [`screens` — what mounts and where](#screens--what-mounts-and-where)
  - [`menu` — the navigation tree](#menu--the-navigation-tree)
  - [`commands` — palette entries + shortcuts](#commands--palette-entries--shortcuts)
  - [`settings` — dataViews + dataFields registries](#settings--dataviews--datafields-registries)
  - [`styles` — theme, chrome, tokens](#styles--theme-chrome-tokens)
  - [`preload` — warm the REST cache](#preload--warm-the-rest-cache)
  - [`regions` / `routes` — escape hatches](#regions--routes--escape-hatches)
- [`core:default` reference](#coredefault-reference)
  - [Modes and region-state vocabulary](#modes-and-region-state-vocabulary)
  - [Slots](#slots)
  - [The default region tree](#the-default-region-tree)
  - [Chrome CSS variables](#chrome-css-variables)
- [Permissions and the cascade](#permissions-and-the-cascade)
- [Recipes](#recipes)
- [Validate before you ship](#validate-before-you-ship)
- [Common pitfalls](#common-pitfalls)

---

## The mental model

Three artifacts drive the workspace. Know which one owns what, and customization gets simple:

| Artifact | Owns | You touch it to… |
|---|---|---|
| `app.json` | What a single app **is** — its React component, ARIA role, capability floor, config schema, baseline dataView. | Ship a brand-new admin surface. |
| `engine.json` | How a workspace is **painted** — region layout, chrome modes, slots, menu-renderer, default theme. | Build a new rendering engine (rare). |
| **`workspace.json`** | **Install decisions** — which engine, which screens, the menu, commands, branding, theme overrides. | **Customize a workspace. This is your file.** |

Customizing `core:default` is almost entirely an `workspace.json` exercise. The engine is already written; you compose the screens and apps it renders and tune its theme.

**Where the file lives.** Drop a valid `workspace.json` at `wp-content/workspace.json`. It loads as a **partial override** on top of the `wp-admin-default` baseline (theme.json model: you declare deltas, the baseline supplies the rest). Bundled starter templates live in `workspaces/` — copy one as a starting point (`workspaces/single-pane-demo.json` and `workspaces/desktop-demo.json` are focused engine demos, `workspaces/wp-admin-default.json` is the exhaustive baseline).

Always set `"version": 3` and `"$wpds": "6.9"`. Every level is `additionalProperties: false` — a typo'd key is a validation error, not a silent no-op.

---

## Quick start

The smallest file that customizes the workspace — pins the engine, sets a landing screen, declares two screens and a two-item menu:

```json
{
    "$schema": "https://schemas.wp.org/workspace.json",
    "version": 3,
    "$wpds": "6.9",
    "name": "my-workspace",
    "title": "My Workspace",
    "engine": "core:default",
    "default-screen": "dashboard-home",
    "screens": {
        "dashboard-home": {
            "label": "Home",
            "icon": "home",
            "path": "/dashboard/home",
            "app": "core:dashboard-host"
        },
        "posts": {
            "label": "Posts",
            "icon": "post",
            "path": "/posts",
            "app": "core:posts",
            "config": { "postType": "post" },
            "permissions": { "capabilities": [ "edit_posts" ] }
        }
    },
    "menu": {
        "dashboard-home": { "position": 10 },
        "posts": { "position": 20 }
    }
}
```

**Required fields:** `version`, `$wpds`, `name`, `engine`, `screens`. Everything else is optional and inherited from the baseline when omitted.

---

## What `core:default` gives you out of the box

Before customizing, know what the engine already ships — most of it you simply *use*, you don't *declare*:

- **A region tree** — a persistent `sidebar` (site-hub + navigation), a routable `content` region, a `detail` side-pane that mirrors a sub-route, a modal `command-palette` (bound to `Mod+K`), and banner/snackbar notice mounts. You don't write these; the engine synthesizes them from your `screens`.
- **Four chrome modes** — `default`, `focus`, `takeover`, `modal`. A screen picks one with `"mode": "..."`.
- **A menu renderer** — `sidebar-tree`: nested menu items render as an expandable in-place tree, auto-expanding the branch that contains the active route. (The engine also bundles `sidebar-drilldown` as an alternative — slide-in sub-screens with a back link.)
- **Slots** — places your apps/widgets can mount: `detail` (side-pane), `grid` (dashboard tiles, via `core:dashboard-host`), `palette` (command palette), plus the persistent widget slots `toolbar` and `sidebar-footer`.
- **WPDS chrome + a default theme** — `#3858E9` primary, white background, `default` density, dark elevated-card idiom. Override any of it from `styles`.

---

## The primitives, block by block

### `engine` / `default-screen` / `frame` — engine, landing, branding, notices, widgets

Install-level intrinsics: the engine that renders everything (top-level, required), where the workspace lands (top-level), and the `frame` — how it's branded plus the persistent apps that survive navigation.

```json
"engine": "core:default",
"default-screen": "dashboard-home",
"frame": {
    "branding": {
        "logo": "./assets/acme-logo.svg",
        "title": "Acme Corp",
        "icon": "./assets/acme-mark.svg"
    },
    "notices": {
        "banner":   { "app": "core:notices-banner" },
        "snackbar": { "app": "core:notices-snackbar" }
    },
    "widgets": {
        "toolbar":        [ { "id": "search",    "app": "core:toolbar-actions" } ],
        "sidebar-footer": [ { "id": "user-menu", "app": "core:user-menu" } ]
    }
}
```

| Field | When / how to use |
|---|---|
| `engine` | Keep `core:default` for a standard desktop admin. Swapping to `core:single-pane` (mobile/kiosk drawer) or `core:desktop` (windowed) is a **one-field change** — your screens/menu/commands are engine-agnostic and re-render unchanged. |
| `default-screen` | A screen **id** (not a path). The landing screen when no URL hash is present. Falls back to the first permitted screen with a `path` if omitted or capability-denied. |
| `branding` | `logo` / `icon` accept relative paths (ship them under `assets/`); `core:site-hub` and similar chrome render them. |
| `notices` | The banner/snackbar mount points. Use the bundled apps unless you ship your own notice surface. |
| `widgets.<slot>` | Persistent apps mounted into engine slots. **`core:default` exposes `toolbar` and `sidebar-footer`.** Arrays merge by `id` across cascade origins — a plugin can append to `toolbar[]` without clobbering yours. |

> **Slot availability is per-engine.** `core:desktop` adds `status-bar` and `dock` widget slots; `core:single-pane` differs again. Check the target engine's `engine.json` before mounting a widget into a slot.

---

### `screens` — what mounts and where

The id-keyed map of every screen. Each screen says **what** mounts (`app` or `apps[]`), **where** in the URL (`path`, `slot`), **how** it presents (`mode`), **who** sees it (`permissions`), and **what data** it surfaces (`dataViewRef` + inline `dataView`).

#### Single-app (the common case)

```json
"posts": {
    "label": "Posts",
    "icon": "post",
    "path": "/posts",
    "app": "core:posts",
    "config": { "postType": "post" },
    "dataViewRef": "postType/post/_default",
    "permissions": { "capabilities": [ "edit_posts" ] },
    "mode": "default",
    "preload": [ "/wp/v2/categories?context=view" ]
}
```

`{param}` captures in `path` substitute into `config` — an edit screen at `/posts/{id}/edit` with `"config": { "id": "{id}" }` passes the captured id straight to the app.

#### Multi-app (paired list + detail, dashboard grids)

```json
"posts": {
    "path": "/posts",
    "app": "core:posts",
    "apps": [
        { "id": "list",    "app": "core:posts" },
        { "id": "preview", "app": "core:editor", "slot": "detail", "routing": { "mode": "mirror" } }
    ]
}
```

One app reads the URL via `routing.mode: "mirror"` (the `detail` region synthesizes its value from the primary path); the rest are static decorations. Dashboard tiles are the same shape against a `core:dashboard-host` mount:

```json
"dashboard-home": {
    "path": "/dashboard/home",
    "apps": [
        { "id": "host",         "app": "core:dashboard-host" },
        { "id": "recent-posts", "app": "core:dashboard-widget-recent-posts", "slot": "grid" },
        { "id": "quick-draft",  "app": "core:dashboard-widget-quick-draft",  "slot": "grid", "size": { "w": 2, "h": 2 } }
    ]
}
```

There is **no top-level `dashboardWidgets` block** — widgets are `apps[]` entries with `slot: "grid"`. The `apps[]` entry `id` is the cascade merge key; make it stable and descriptive (`list`, `preview`, `host`), not the app id.

#### Key screen fields

| Field | When / how |
|---|---|
| `path` | URL pattern. Static segments + `{param}` captures. The schema's `path` rejects `*` — for a wildcard suffix use the `routes` escape hatch. |
| `slot` | Workspace URL slot. `_self` (default, the primary path), `palette` (command palette), or an engine slot like `detail`. |
| `app` / `config` | Single-app shorthand. The resolver normalizes to the `apps[]` long form internally. |
| `mode` | Engine chrome mode — see [Modes](#modes-and-region-state-vocabulary). `default` for list screens, `focus` for editors, `takeover` for full-viewport (Customizer), `modal` for overlays. |
| `permissions` | OR-semantic `{ capabilities, roles }`. **Absent = admin-only (fail-closed).** Use `capabilities: [ "read" ]` to open to any logged-in user. |
| `dataViewRef` | Pointer into `settings.dataViews`, formatted `kind/name/variant`. |
| `dataView` | Inline overlay deep-merged on top of the referenced triple — add/remove columns on *this screen only*. |
| `preload` | REST paths hydrated when the screen activates. Additive with workspace-level `preload`. |
| `regions` | Per-screen override of engine region states (`hidden`/`compact`/…) — fine-grained escape hatch on top of `mode`. |
| `hidden` | `true` at any origin suppresses the screen entirely. |
| `styles` | Per-screen style overrides, same shape as top-level `styles`. |

#### The `iframe:` escape hatch

```json
"customize": {
    "label": "Customize",
    "icon": "appearance",
    "path": "/customize",
    "app": "iframe:customize.php",
    "mode": "takeover"
}
```

`iframe:<slug>` is sugar — the compiler expands it to `core:iframe-fallback` + `config.url`, resolved relative to `window.wpAdminWorkspaces.adminUrl`. Pair it with `mode: "takeover"` so the workspace hides its own chrome and the iframed page owns the viewport. This is a first-class feature, not a compromise — the block editor and Site Editor use it.

---

### `menu` — the navigation tree

Engine-agnostic information architecture. A nested tree of id-keyed items; items with `items` become containers. **An item key that matches a screen id binds to that screen** — the screen's `label` / `icon` / `permissions` flow through automatically, so a bound item can be as terse as `"posts": { "position": 20 }`.

```json
"menu": {
    "content": {
        "label": "Content",
        "icon": "post",
        "position": 10,
        "items": {
            "posts": {
                "position": 30,
                "items": {
                    "posts-drafts": { "position": 10 },
                    "categories":   { "position": 20 }
                }
            },
            "media": { "position": 50 },
            "sep-1": { "separator": true, "position": 60 }
        }
    },
    "view-site": {
        "label": "View Site",
        "icon": "external",
        "href": "{site_url}",
        "external": true,
        "position": 99
    }
}
```

| Field | When / how |
|---|---|
| `label` / `icon` | **Override** a bound screen's, or **required** for a standalone (non-screen) item. Children do **not** inherit a parent's icon — declare each explicitly. |
| `position` | Sort order among siblings. Lower = earlier. |
| `items` | Nested children, same shape recursively. `sidebar-tree` renders them as an expandable tree. |
| `href` + `external` | External link, optional new tab. Token interpolation (`{site_url}`). |
| `separator` | Visual divider; other fields ignored. |
| `hidden` | Hide from the menu while keeping the subtree addressable for cascade. |

**Menu rendering on `core:default`.** The engine names `sidebar-tree`: nested items expand in place, and the branch containing the active route auto-expands. Drill-down/expansion ancestry derives from the URL, so deep-links and refresh land correctly. (The engine also bundles `sidebar-drilldown` — slide-in sub-screens with a back link, honoring `config.collapsed` for an icon rail — if you fork the engine to name it.) Renderers cap nesting depth (default 3).

**The classic wp-admin menu bridge.** Every third-party `add_menu_page()` / `add_submenu_page()` registration (Yoast, ACF, WooCommerce, …) is auto-ingested under `menu.ingested.items[]` — no workspace.json edit needed for them to appear. To curate:

```json
"menu": { "ingested": { "items": {
    "woocommerce": { "label": "Shop" }            // rename in the menu
} } }
```

```json
"menu": { "ingested": { "items": { "woocommerce": { "hidden": true } } } }   // hide from menu, keep URL
```

```json
"screens": { "ingested-woocommerce": null }       // remove entirely (tombstone)
```

---

### `commands` — palette entries + shortcuts

First-class keyboard shortcuts and command-palette entries. An array of objects, each with an explicit `id`.

```json
"commands": [
    { "id": "open-palette", "shortcut": "Mod+K",       "invoke":   "core:command-palette", "label": "Open Command Palette" },
    { "id": "new-post",     "shortcut": "Mod+Shift+N", "navigate": "/posts/new",            "label": "New Post" },
    { "id": "go-to-posts",  "shortcut": "g p",         "navigate": "/posts",                "label": "Go to Posts" }
]
```

- `shortcut` uses `@wordpress/keyboard-shortcuts` syntax — `Mod` = ⌘ on macOS / Ctrl elsewhere; chords like `"g p"` are allowed. Omit it for palette-only entries.
- `invoke` mounts a triggerable app (the app must declare `platform.core:triggerable: true`); `navigate` is a pure URL jump. **Exactly one of the two** per command.
- The palette auto-synthesizes "Go to X" entries from your `screens` — only add explicit `navigate` commands for destinations the auto-list doesn't cover, or to attach a shortcut.

On `core:default`, `Mod+K` is already wired to the command palette via the engine's `command-palette` region trigger, so you typically only need the `open-palette` command if you want it listed in the palette itself.

---

### `settings` — dataViews + dataFields registries

Reusable definition registries, theme.json-style. Two flavors:

- **`settings.dataViews`** — a 3-axis registry keyed `kind → name → variant`; each leaf is a `@wordpress/dataviews` config.
- **`settings.dataFields`** — named field collections, referenced from a dataView via `fieldsRef`.

```json
"settings": {
    "dataFields": {
        "core/post-fields": {
            "kind": "postType",
            "name": null,
            "fields": [
                { "id": "title",  "type": "text",     "label": "Title", "enableGlobalSearch": true },
                { "id": "status", "type": "text",     "label": "Status" },
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
                        "fields": [ "status", "date" ],
                        "titleField": "title",
                        "sort": { "field": "date", "direction": "desc" }
                    },
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

**When to use which override surface:**

- **Workspace-wide column/action change** → edit the variant under `settings.dataViews`. Inline `fields[]` shallow-merges per-`id` onto the app's baseline (ref wins on collision); inline-only ids append.
- **This-screen-only change** → put a `dataView` overlay on the screen (`screens.posts.dataView.fields[]`). Use a `null` tombstone to drop a baseline column: `"screens.posts.dataView.fields.author": null`.
- **A new filtered view** → add a `variant` with `"extends": "_default"` (explicit — there's no implicit merge between variants; cycle-safe, max depth 10) and point a screen at it via `dataViewRef`.

For the full dataView semantics — variant chains, filter hooks, REST endpoints, the `useDataView` hook — see [`../dataview-config.md`](../dataview-config.md).

---

### `styles` — theme, chrome, tokens

WPDS-shaped theme tree. Four customization paths, in increasing escape-hatch order — **reach for the lowest-numbered one that does the job:**

```json
"styles": {
    "theme": {
        "color":   { "primary": "#cc0000", "bg": "#fafafa" },
        "density": "comfortable",
        "cursor":  { "control": "pointer" }
    },
    "chrome": {
        "sidebar": { "background": "{color.gray.900}", "foreground": "{color.gray.50}" },
        "toolbar": { "background": "#ffffff" }
    },
    "regions": {
        "detail": { "theme": { "color": { "bg": "#1e1e1e" } } }
    }
}
```

1. **`styles.theme`** — ThemeProvider seeds. The primary path: set `color.primary`, `color.bg`, `density` (`default` / `compact` / `comfortable`), `cursor.control`, and the provider derives the entire WPDS token matrix (color ramps, density-tuned spacing, light/dark by background luminance). `core:default` seeds `primary: #3858E9`, `bg: #ffffff`, `density: default` — override only what you want changed.
2. **`styles.regions[id].theme` / `styles.applications[id].theme`** — nested provider overrides scoped to one region/app subtree (e.g. a dark `detail` pane over a light workspace).
3. **`styles.chrome.<surface>` + direct slot overrides** (`styles.color` / `border` / `dimension` / `elevation` / `font`) — escape hatch for slot values seeds can't express. **`core:default` chrome surfaces:** `sidebar`, `toolbar`, `siteHub`, `content`, `canvas`.
4. **DTCG `tokens.json` aliases** — a sibling `tokens.json` of design primitives, referenced with curly-brace aliases (`"{color.brand.500}"`). The PHP resolver deep-merges site → theme → plugin → core token files and resolves the aliases.

**Inside WPDS engine/app code, never hardcode hex — use `var(--wpds-*)`.** From `workspace.json` you express intent through these four surfaces and the runtime emits the CSS variables for you.

---

### `preload` — warm the REST cache

REST paths hydrated server-side and injected into the `apiFetch` preloading cache before the workspace bundle runs — eliminates a first-paint request waterfall.

```json
"preload": [
    "/wp/v2/users/me",
    "/wp/v2/types?context=view",
    [ "/wp/v2/posts", "OPTIONS" ]
]
```

- String → `GET` shorthand; `[ path, method ]` for `OPTIONS` preflight. Methods restricted to `GET` / `OPTIONS`.
- Additive across origins (union, deduped by exact `path+method`) — no override semantics.
- Per-screen `screens[id].preload` is additive with this list — prefer it for paths only one screen needs.
- **Conditional** preloads (depend on the request/user) belong in a `wp_admin_workspaces_data_{origin}` PHP filter, not here.

---

### `regions` / `routes` — escape hatches

The kernel synthesizes the runtime region map and route table from your `screens` + the engine's `defaultRegions`. The top-level `regions` / `routes` blocks are **escape hatches** for the rare case the `screens` shape can't express what you need (a wildcard route, a non-screen region composition). workspace.json declarations win on per-region-id / per-pattern collision against the synthesis.

**Avoid these unless you've confirmed `screens` can't do it** — most workspaces never write them. See design spec §5 (regions) and §6.2 (routes) before you do.

---

## `core:default` reference

The engine-specific facts you need when customizing — sourced from the engine manifest.

### Modes and region-state vocabulary

Set per screen via `"mode": "..."`. The engine maps each mode to per-region states:

| Mode | What it does | Use for |
|---|---|---|
| `default` | Full chrome — sidebar, toolbar, site-hub, content, detail all visible. | List screens, dashboards — most screens. |
| `focus` | Hides the sidebar, compacts the toolbar to back-link + save indicator, content goes full-width, detail hidden. | Editors and authoring surfaces (`core:simple-editor`, `core:editor`). |
| `takeover` | Hides **all** workspace chrome — full viewport. | Customizer, full-screen iframe apps. Pair with `iframe:`. |
| `modal` | Overlay on top of the current screen; the underlying chrome state is unchanged. | Command palette, dialogs. |

For finer control, a screen's `regions` override deep-merges **on top of** the resolved mode (screen wins per field). `core:default`'s region-state flags:

| Flag | Type | Applies to | Meaning |
|---|---|---|---|
| `hidden` | boolean | every region | Hide via CSS; the app stays mounted (visibility is paint-only). |
| `compact` | boolean | toolbar, sidebar | Reduced chrome — sidebar collapses to an icon rail; toolbar shrinks to back + save. |
| `minimal` | boolean | toolbar | Stricter than `compact` — only essential affordances. |
| `fullWidth` | boolean | content | Expand content into space freed by hidden regions. |

Example — a focus screen that *also* keeps the toolbar minimal rather than merely compact:

```json
"post-edit": {
    "path": "/posts/{id}/edit",
    "app": "core:simple-editor",
    "config": { "postType": "post", "id": "{id}" },
    "mode": "focus",
    "regions": { "toolbar": { "minimal": true } }
}
```

> Plugins can extend the catalog via the `wp_admin_workspaces_engine_modes_core:default` filter (e.g. a `kiosk` mode that `extends` `takeover`). Modes support `extends` inheritance, depth-limited to 10.

### Slots

Mount targets the engine exposes. Reference a slot that doesn't resolve and validation fails.

| Slot | Kind | Where it appears |
|---|---|---|
| `_self` | URL slot | The primary content region (default for any screen). |
| `detail` | URL slot / `apps[]` slot | The complementary side-pane; `routing.mode: "mirror"` feeds it from the primary path. Dismisses on `Escape`. |
| `palette` | URL slot | The modal command palette overlay. |
| `grid` | `apps[]` slot | Dashboard tiles, via a `core:dashboard-host` mount. Honors `size: { w, h }` and `position`. |
| `toolbar` | `widgets` slot | Persistent topbar widgets. The topbar has `start` / `center` / `end` child regions. |
| `sidebar-footer` | `widgets` slot | Persistent bottom-of-sidebar widgets (e.g. `core:user-menu`). |

### The default region tree

What the engine renders without any `regions` block from you (this is why you rarely write one):

- **`sidebar`** (persistent `navigation`) → child `hub` mounts `core:site-hub`, child `nav` mounts `core:navigation`.
- **`content`** (`main`) → reads URL route-key `_self`; floats as an elevated white card.
- **`detail`** (`complementary`) → reads route-key `detail` in `mirror` mode; dismiss-on-`Escape`.
- **`command-palette`** (`dialog`) → reads route-key `palette`; triggerable, bound to `Mod+K`.
- **`notices-banner`** / **`notices-snackbar`** → the two notice mounts.

### Chrome CSS variables

`styles.chrome.<surface>` values flow into these custom properties (each falls back to a WPDS token). Useful when debugging or writing companion CSS:

| `styles.chrome` path | CSS variable |
|---|---|
| `sidebar.background` / `.foreground` | `--wp-admin-workspaces--chrome--sidebar--{background,foreground}` |
| `sidebar.width` / padding | `--wp-admin-workspaces--chrome--sidebar--{width,padding-block,padding-inline}` |
| `toolbar.background` / `.foreground` / `.border` | `--wp-admin-workspaces--chrome--toolbar--{background,foreground,border}` |
| `content` card | `--wp-admin-workspaces--chrome--content--card-background` |

---

## Permissions and the cascade

### Permissions are OR-semantic and fail-closed

```json
"permissions": {
    "capabilities": [ "manage_options" ],
    "roles":        [ "editor", "administrator", "super-admin" ]
}
```

- **Within** `capabilities` → OR (holds any listed cap). **Within** `roles` → OR. **Between** the two → OR (passes either).
- `"super-admin"` triggers `is_super_admin()` (multisite-aware).
- **Absent `permissions` = admin-only.** Open a screen to any logged-in user with `capabilities: [ "read" ]`.
- Unknown caps/roles are permanently unsatisfiable — typos *hide*, never expose.
- **The app's `capabilities[]` is an AND-floor you can't lower.** If `core:posts` requires `edit_posts`, no `permissions` widening lets a subscriber in.

### Six origins, fixed order, trust-tiered

`core → engine → plugin → site → role → user`.

- **Objects** deep-merge per field; **arrays with `id`** (`screens[].apps[]`, `commands[]`, `widgets.<slot>[]`, `dataView.fields[]`/`actions[]`, the `menu` tree at every depth) merge by `id`; **arrays without `id`** replace wholesale.
- **`null` is a tombstone at any depth** — `"screens.plugins": null` removes the Plugins screen; `"screens.posts.dataView.fields.author": null` drops just that column on Posts.
- **Trust tiers:** `core`/`engine`/`plugin`/`site` may grow or shrink the OR-set and declare any shape; `role`/`user` are **shrink-only** consumers — they can remove a capability but never add one or grow structure.

### `customizable` — what consumers may write

To let `role`/`user` origins edit specific paths, declare a `customizable` allowlist on the entry:

```json
"engine": "core:default",
"default-screen": "dashboard-home",
"frame": {
    "customizable": [ "branding.title" ]
}
```

`true` = everything writable; `[ "path", … ]` = only those dotted paths; `false`/absent = locked (default-deny). **A hardcoded deny-list always wins** — `screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, and `engine` can never be written by consumer origins, even if listed. These are the security gates.

---

## Recipes

**Add a custom post type screen + menu entry**
```json
"screens": {
    "products": {
        "label": "Products", "icon": "post", "path": "/products",
        "app": "core:posts", "config": { "postType": "product" },
        "permissions": { "capabilities": [ "edit_posts" ] }
    }
},
"menu": { "content": { "items": { "products": { "position": 25 } } } }
```

**Rename "Posts" → "Articles" in the menu only**
```json
"menu": { "content": { "items": { "posts": { "label": "Articles" } } } }
```

**Hide a screen entirely** — `"screens": { "plugins": null }`

**Hide from the menu but keep it URL-reachable** — `"menu": { "appearance": { "items": { "plugins": { "hidden": true } } } }`

**Add a column to Posts everywhere**
```json
"settings": { "dataViews": { "postType": { "post": { "_default": {
    "fields": [ { "id": "comment_count", "type": "integer", "label": "Comments" } ]
} } } } }
```

**…or on the Posts screen only**
```json
"screens": { "posts": { "dataView": {
    "fields": [ { "id": "comment_count", "type": "integer", "label": "Comments" } ]
} } }
```

**Brand the admin**
```json
"frame": { "branding": { "logo": "./assets/acme-logo.svg", "title": "Acme Corp" } },
"styles": {
    "theme":  { "color": { "primary": "#cc0000" } },
    "chrome": { "sidebar": { "background": "#1a1a1a", "foreground": "#fafafa" } }
}
```

**A focused writing workspace** — land on Posts, editors in `focus` mode, comfortable density. The bundled `workspaces/single-pane-demo.json` lands on Posts as a starting point you can build from.

**Restrict Settings to editors + admins** (floor still applies)
```json
"screens": { "settings": { "permissions": {
    "capabilities": [ "manage_options" ],
    "roles": [ "editor", "administrator", "super-admin" ]
} } }
```

**Mount a sidebar-footer widget** — `"frame": { "widgets": { "sidebar-footer": [ { "id": "help", "app": "plugin:acme/help-link" } ] } }`

**Swap to the windowed desktop engine** — `"engine": "core:desktop"` (no other change; screens re-render as windows + dock).

---

## Validate before you ship

```bash
# 1. Schema validation (Ajv) — catches typos, the #1 cause of "nothing renders"
npm run test:schema

# 2. Author-shape invariants — each screen has a primary app, paths unique, default-screen resolves
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php

# 3. Cascade semantics — merge / tombstones / trust tier
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php

# 4. Capability + permissions gating
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php
```

For non-trivial changes, load the workspace in `wp-env` and walk the screens manually. Per-screen functional specs live in `docs/screens/*.md` (the source of truth when rebuilding any wp-admin surface).

---

## Common pitfalls

- **`additionalProperties: false` everywhere.** A typo'd key fails validation. If something silently doesn't render, schema-validate first.
- **`default-screen` is a screen id, not a path.** And it only works if some screen has a `path` for the fallback.
- **Menu item keys must match screen ids exactly** to bind. A screen missing from the menu is usually a key-spelling mismatch.
- **Empty `permissions: {}` = admin-only.** To open to any logged-in user, use `capabilities: [ "read" ]`.
- **`role` / `user` origins can only shrink** the permission OR-set — widen from `site`/`plugin`/`core`.
- **`apps[]` `id` is the merge key**, not the app id — keep it stable and descriptive.
- **Region apps stay mounted under `hidden`/`compact`** — visibility is paint-only, so don't rely on a mode to *unmount* an app.
- **Iframe screens want `mode: "takeover"`** so they own the viewport instead of dropping into half-workspace chrome.
- **Reference a non-existent slot and validation fails** — the slot vocabulary is the union of kernel-reserved (`_self`, `palette`), engine-declared (`detail`, `grid`, `toolbar`, `sidebar-footer`), and app-declared slots.

---

## Where to look next

| Need | Doc |
|---|---|
| Per-field schema tables (engine-agnostic) | [`workspace-json-reference.md`](./workspace-json-reference.md) |
| The `core:default` engine contract worked example | [`../core-default-engine.md`](../core-default-engine.md) |
| dataView semantics, variants, filter hooks, `useDataView` | [`../dataview-config.md`](../dataview-config.md) |
| Theming mechanics, token→DOM paths, WPDS CSS gotchas | [`../engines-and-design-systems.md`](../engines-and-design-systems.md) |
| Design rationale, cascade trust tiers, mode catalog | [`../schema-sketch.md`](../schema-sketch.md) |
| Runtime architecture — regions, routing, gating | [`../wp-admin-workspaces-design-spec.md`](../wp-admin-workspaces-design-spec.md) |
| Starter files to copy | `workspaces/single-pane-demo.json`, `workspaces/desktop-demo.json`, `workspaces/wp-admin-default.json` |
</content>
</invoke>
