# admin.json — Schema Design Doc

> Authoritative for the admin.json shape (`workspace` / `settings` / `screens` / `menu` / `commands`) and for cascade semantics, OR-semantic permissions with trust tiers, the engine-declared modes catalog, the 3-tier slot vocabulary, the classic wp-admin menu bridge, and programmatic workspace registration.
>
> **Companion docs.** The runtime architecture this schema sits on top of — region vocabulary, URL-driven routing, cascade resolver internals, capability gating layers, the four-tier theming model, the full extension-point list — lives in [`../wp-admin-shell-design-spec.md`](../wp-admin-shell-design-spec.md). The dataView primitive (3-axis registry: `kind/name/variant`) has a dedicated author-facing guide at [`../dataview-config.md`](../dataview-config.md). The JSON Schemas are at [`../schemas/admin.json`](../schemas/admin.json), [`admin-app.json`](../schemas/admin-app.json), [`admin-engine.json`](../schemas/admin-engine.json).

v3 reshapes admin.json around user-task surfaces instead of runtime-pipeline surfaces.

## Design principles

1. **User intent = top-level shape.** Each top-level block corresponds to a recognizable authoring task ("add a screen", "organize the menu", "brand the admin", "bind a shortcut"). No top-level block exists only to mirror the runtime.

2. **Theme.json pattern: global definition + inline override.** `dataView` declared at the top level (`settings.dataViews.<kind>.<name>.<variant>`) applies globally to its triple. Inline `screens[id].dataView` overlay deep-merges on top of the resolved triple for that screen only. Same pattern as `theme.json#settings.color` (global) vs `theme.json#styles.blocks.core/heading.color` (per-block).

3. **id-keyed everywhere.** Sparse cascade overrides require named keys, not array positions. Power users authoring `screens.posts.menu.position` should not have to know what index Posts sits at in some array.

4. **Deep-merge cascade across every block.** Restrict-only semantics preserved at the resolver level. Cascade origins compose per-field within each entry, not by entry replacement.

5. **Anchor to existing WordPress entities.** The `menu` block ingests classic `add_menu_page()` / `add_submenu_page()` registrations at the `plugin` origin automatically, so a WooCommerce or ACF install picks up working menu entries in WP Admin Shell without authoring admin.json. Site authors override at site origin.

6. **Engine-agnostic IA.** The `menu` block is an information-architecture tree. The active engine renders it into its native arrangement: sidebar drilldown for `core:default`, dock for `core:desktop`, drawer for `core:single-pane`.

7. **No backwards compat with v1.** This hasn't shipped publicly. Breaking changes are fine; getting the shape right is the priority.

## Top-level shape

```json
{
  "$schema": "https://schemas.wp.org/admin/v3.json",
  "version": 3,
  "$wpds": "6.9",
  "name": "wp-admin-default",
  "title": "WordPress",

  "workspace": {
    "engine": "core:default",
    "default-screen": "dashboard-home",
    "branding": { "logo": "...", "title": "WordPress" },
    "notices":  { "banner": { "app": "core:notices-banner" }, "snackbar": { "app": "core:notices-snackbar" } },
    "widgets": {
      "toolbar":        [ { "id": "search",        "app": "core:toolbar-search" } ],
      "sidebar-footer": [ { "id": "help",          "app": "core:help-link" } ]
    }
  },

  "settings": {
    "dataViews": {
      "postType": {
        "post": {
          "_default": { "fieldsRef": "core/post-fields", "defaultView": { ... }, "actions": [ ... ] },
          "drafts":   { "extends": "_default", "defaultView": { "filters": [ ... ] } }
        }
      }
    },
    "dataFields": {
      "core/post-fields": { "kind": "postType", "name": "post", "fields": [ ... ] }
    }
  },

  "screens": {
    "posts": { ... }
  },

  "menu": {
    "content": {
      "label": "Content",
      "position": 10,
      "items": {
        "posts": { "position": 30 }
      }
    }
  },

  "commands": [
    { "id": "open-palette", "shortcut": "Mod+K", "invoke": "core:command-palette" }
  ],

  "styles": { /* theme.json-like */ },

  "preload": [ ... ],

  "regions": { /* escape hatch */ },
  "routes":  { /* escape hatch */ }
}
```

## Block roles

| Block | Role | Cascade behavior |
|-------|------|-----------------|
| `workspace` | Install metadata: engine, default landing screen, branding, notices, persistent widgets (toolbar / sidebar-footer / status-bar). | Deep-merge per-field. `widgets.<slot>` arrays merge by `id`. |
| `settings` | Reusable definition registries referenced from elsewhere by id. Contains `dataViews` (3-axis `@wordpress/dataviews` configuration keyed by `kind → name → variant`) and `dataFields` (named field collections). Mirrors the theme.json `settings` pattern. | Deep-merge per-registry, per-entry. |
| `screens` | The map of every screen the workspace exposes. Each entry defines what a screen IS (label, icon, apps[], path, slot, mode, permissions, `dataViewRef`/`dataView`, preload). Says nothing about where the screen appears in any menu — that's the `menu` block's job. | Deep-merge per-screen, per-field. `screens[id].apps[]` merges by `id`. `hidden: true` at any origin removes the screen. |
| `menu` | Engine-agnostic IA — a tree of nested items. Each item is keyed by id. Items with sub-items become containers (no separate "groups" block); item keys that match a screen id implicitly bind to that screen. | Deep-merge per-item, nested. Array-merge-by-id applies through every depth. |
| `commands` | First-class palette entries + keyboard shortcuts. Each command has an explicit `id` field. | Merge by `id`. |
| `styles` | Tokens, slot overrides, chrome. Unchanged from v2 — theme-developer surface intact. | Deep-merge per-field. |
| `preload` | Workspace-boot REST preloads. Additional per-screen preloads live in `screens[id].preload`. | Additive concatenation; dedup by `path+method`. |
| `regions` | Escape hatch — direct region tree for engines that need it (windowed, MDI, multi-pane). | Deep-merge. Optional in v3; `screens` block synthesizes regions for the common case. |
| `routes` | Escape hatch — direct URL→app mapping for non-screen compositions. | Deep-merge by route key. Optional in v3. |

## Screen shape

A screen has two scopes of placement:

- **`slot`** (workspace-scope) — names the URL slot this screen mounts in across the workspace (`_self` for primary path, `palette` for command palette, etc.).
- **`apps[]`** — an array of apps that mount when the screen activates. Each entry can declare a screen-internal `slot` for special placement (e.g. widgets in a `grid` slot exposed by a dashboard-host app). The single-app common case has a shorthand.

```json
{
  "screens": {
    "posts": {
      "label": "Posts",
      "icon": "post",
      "description": "Write, edit, and organize posts.",
      "path": "/posts",

      "app": "core:posts",
      "config": { "postType": "post" },

      "dataViewRef": "postType/post/_default",
      "dataView": { /* optional inline overlay deep-merged on top of the resolved triple */ },

      "permissions": { "capabilities": [ "edit_posts" ] },
      "mode": "default",
      "preload": [ "/wp/v2/categories?context=view", "/wp/v2/tags?context=view" ],
      "hidden": false
    },

    "post-edit": {
      "label": "Edit Post",
      "path": "/posts/{id}/edit",
      "app": "core:editor",
      "config": { "postType": "post", "postId": "{id}" },
      "permissions": { "capabilities": [ "edit_posts" ] },
      "mode": "focus"
    },

    "posts-drafts": {
      "label": "Drafts",
      "icon": "drafts",
      "path": "/posts/drafts",
      "app": "core:posts",
      "config": { "postType": "post" },
      "dataViewRef": "postType/post/drafts",
      "permissions": { "capabilities": [ "edit_posts" ] }
    },

    "posts-drafts-compact": {
      "label": "Drafts (compact)",
      "path": "/posts/drafts/compact",
      "app": "core:posts",
      "config": { "postType": "post" },
      "dataViewRef": "postType/post/drafts",
      "dataView": {
        "defaultView": { "fields": [ "date" ] }
      },
      "permissions": { "capabilities": [ "edit_posts" ] }
    },

    "dashboard-home": {
      "label": "Home",
      "icon": "home",
      "path": "/dashboard/home",
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
}
```

### Single-app shorthand vs multi-app `apps[]`

```json
// Shorthand — single primary app
"posts": {
  "app": "core:posts",
  "config": { "postType": "post" }
}

// Long form — multiple apps, slots, per-app config
"posts": {
  "apps": [
    { "id": "list",    "app": "core:posts",  "config": { "postType": "post" } },
    { "id": "preview", "app": "core:editor", "slot": "detail", "config": { "postId": "{detail}" } }
  ]
}
```

Resolver normalizes the shorthand to `apps: [ { "id": "main", "app": "...", "config": {...} } ]` internally. Cascade overrides always address the long-form `apps` array by entry `id`.

### Notes

- **`path` populates `_self` URL slot by default.** A screen with `path: "/posts"` mounts when `#/posts` matches. Routable in the workspace's primary region (region with `routing.route-key: "_self"`).
- **`slot` on a screen** is workspace-scope: which URL slot does this screen live in (`_self`, `palette`, `detail`, `inspector`, etc.).
- **`slot` on an `apps[]` entry** is screen-scope: where inside the screen does this app render. The slot vocabulary is the union of kernel-reserved slots, engine-declared slots, and slots exposed by other apps in the screen.
- **Screen→registry pointer via `dataViewRef`.** Names a `kind/name/variant` triple in `settings.dataViews`. Optional inline `dataView` overlay layers on top (deep-merge with tombstones). When `dataViewRef` is absent, the resolver falls back to explicit `dataViewKind`/`dataViewName`/`dataViewVariant` or infers `(kind, name)` from the screen's app manifest with `variant: "_default"`.
- **`mode`** selects an engine-defined chrome mode (see Modes section). Default: `"default"`.
- **`permissions`** declares access (see Permissions section). Default when absent: admin-only.
- **`preload[]`** lists REST paths to hydrate when the screen activates. Additive with workspace-level `preload[]`.
- **`hidden`** at any cascade origin suppresses the screen entirely.
- **`legacy_path` / `legacy_query` / `legacy_params`** map this screen to the classic wp-admin script it replaces (e.g. `edit.php` + `{ "post_type": "page" }`). They drive bidirectional link interception (0.1.0): the JS admin-link interceptor rewrites clicks on the classic URL to this screen's `path`, and the server redirects direct GET navigations to the classic URL into the workspace. Most-specific mapping wins (most satisfied `legacy_query` constraints), so a bare `edit.php` entry can't shadow a constrained sibling. Two WordPress conventions live in the matcher itself: (a) an absent `?post_type=` is compared as `post` (so bare `edit.php` still maps to a `post_type=post`-constrained entry); (b) an entry that doesn't itself constrain `?action=` is skipped when the URL carries one, so a nonce-less state-changing GET isn't redirected with its action dropped. `?_wpnonce` requests are never mapped. Both directions read one source — `WP_Admin_Shell_Admin_Routes::legacy_map()`.
- **Eligibility is implicit.** Any app may be placed in any slot. App authors who want to enforce constraints do so inside their render (no schema-level eligibility enforcement).

### The `wp-content/admin.json` override origin (0.1.0)

The canonical workspace trigger is a `wp-content/admin.json` file loaded into the `plugin` cascade slot as a **partial delta** over the `wp-admin-default` baseline (now the `core` slot) — the theme.json model. Validation is **partial-permissive**: PHP ships no JSON-Schema validator (schema conformance is the JS-side Ajv `test:schema` sweep), so the runtime gate only requires the file to decode to a JSON object; the schema-`required` top-level keys (`version`/`$wpds`/`name`/`workspace`/`screens`) are NOT required of the override — it's a delta. Completeness of the *merged* doc is enforced post-resolution by `run-shape-tests.php`. A malformed file degrades to the bare baseline (with a `WP_DEBUG` notice). See `docs/wp-admin-shell-design-spec.md` §19.

### Multi-pane / split-view

Screens that want to mount multiple apps simultaneously declare them in `apps[]`. The engine's layout algorithm arranges them based on available regions and declared slots. There is no separate `pair` block — multi-app screens are the only mechanism.

```json
"posts-with-preview": {
  "label": "Posts",
  "path": "/posts",
  "apps": [
    { "id": "list",    "app": "core:posts",  "config": { "postType": "post" } },
    { "id": "preview", "app": "core:editor", "slot": "detail", "config": { "postId": "{detail}" } }
  ]
}
```

The `detail` slot is engine-declared (a split-view layout). The editor mounts there. URL parameter `?detail=42` populates `{detail}` in the config.

### Drill-down icon inheritance

Children nested inside a parent menu item do NOT inherit the parent's icon. Each screen renders its own icon; children without an icon render no icon. Authors who want children to look like their parent must declare the icon explicitly.

## Modes

Screens declare which engine-defined chrome mode they want. The engine maps each mode to a set of region states (visible / hidden / minimal). This is how an editor screen hides the sidebar and strips the toolbar without each screen having to know which regions exist.

```json
{
  "screens": {
    "post-edit": {
      "label": "Edit Post",
      "path": "/posts/{id}/edit",
      "app": "core:editor",
      "mode": "focus"
    },
    "customize": {
      "label": "Customize",
      "path": "/customize",
      "app": "iframe:customize.php",
      "mode": "takeover"
    },
    "command-palette": {
      "label": "Command Palette",
      "slot": "palette",
      "app": "core:command-palette",
      "mode": "modal"
    }
  }
}
```

### v1 core modes

Four named modes ship with the runtime. Engines opt into honoring them; engines may add their own.

| Mode        | Intent                                                                  | `core:default` mapping (sidebar / toolbar / site-hub / content) |
|-------------|-------------------------------------------------------------------------|------------------------------------------------------------------|
| `default`   | Full workspace chrome. Default for all screens.                          | visible / visible / visible / visible                            |
| `focus`     | Strip nav + most toolbar. Editor and authoring surfaces.                 | hidden / minimal (back + save indicator only) / visible / full-width |
| `takeover`  | All workspace chrome hidden. Full-viewport screen.                       | hidden / hidden / hidden / full-viewport                         |
| `modal`     | Mount as an overlay on top of the current screen. Chrome state unchanged.| unchanged; modal layer renders above content                     |

Engine declares its mode catalog in `engine.json#modes` (see [`core-default-engine.md`](./core-default-engine.md) for the full shape).

### Mode inheritance via `extends`

Modes can extend an existing mode in the catalog, inheriting its region states and overriding per-field:

```json
{
  "modes": {
    "focus": {
      "regions": { "sidebar": { "hidden": true }, "toolbar": { "compact": true } }
    },
    "focus-tight": {
      "extends": "focus",
      "regions": { "site-hub": { "hidden": true } }
    }
  }
}
```

The extension chain resolves at engine-manifest load time. Inheritance is bounded by a depth limit (10) to catch circular references.

### Plugin-contributed modes

Plugins can extend an existing engine's catalog via filter:

```php
add_filter( 'wp_admin_shell_engine_modes_core:default', function( $modes ) {
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

The filter contributes through the `plugin` cascade origin. Site/role/user origins can still override `screens[id].mode` to pick a different mode.

### Modal stack

When multiple screens with `mode: "modal"` are active simultaneously (e.g. command palette + confirmation dialog), the engine maintains a LIFO stack. The topmost modal owns focus + Escape. Closing it dismisses just the topmost; the next modal becomes active. Engines that don't support modal stacking (e.g. mobile-first single-pane) collapse to "exclusive modal" — opening a second dismisses the first.

### Mode transitions

Transition animations (sidebar slide-out, toolbar fade) are engine-owned. The schema does not declare transition specifics; each engine ships its own animation behavior internally. Authors can rely on transitions being smooth and interruptible but cannot tune timing or easing from the workspace.

### Persistent regions in non-default modes

When `focus` or `takeover` hides a region, the region is hidden via CSS, **not** unmounted. Per-region state (sidebar nav drilldown depth, search input value, scroll position, dirty editor state in a different region) survives the transition. The mount tree is stable across `mode` changes; only viewport visibility flips.

This matches the spec §5.3 `core:persists-across-navigation` semantic: persistent regions stay mounted; mode just decides whether they're painted.

### Per-region override (escape hatch)

For cases the mode doesn't cover, a screen can override individual regions:

```json
{
  "post-edit": {
    "mode": "focus",
    "regions": {
      "preview": { "hidden": false },    // override the mode — keep preview pane visible
      "toolbar": { "compact": true }
    }
  }
}
```

The screen's `regions` block deep-merges with the engine's `mode` definition. Per-region keys (`hidden`, `compact`, `minimal`, etc.) are engine-defined; the engine declares which keys each region accepts. Tombstones via `null` to remove an override at higher cascade origin.

### Cascade

`mode` and `regions` overrides cascade per-field across origins. Common patterns:

- Site admin disables focus mode globally: `screens.post-edit.mode: "default"` at site origin.
- Power user keeps the sidebar in focus mode: `screens.post-edit.regions.sidebar.hidden: false` at user origin.
- Role-origin override: content-author role forces focus mode on all editor screens.

## Menu shape

The menu is a tree of nested items. There is no separate "groups" block — a container is just an item with children. Top-level keys in `menu` are root-level items; each item can declare nested `items` to any depth.

```json
{
  "menu": {
    "content": {
      "label": "Content",
      "icon": "post",
      "position": 10,
      "items": {
        "posts": {
          "position": 30,
          "items": {
            "posts-drafts":  { "position": 10 },
            "posts-pending": { "position": 20 },
            "posts-trash":   { "position": 30 },
            "categories":    { "position": 40 },
            "tags":          { "position": 50 }
          }
        },
        "pages":  { "position": 40 },
        "media":  { "position": 50 },
        "sep-1":  { "separator": true, "position": 60 }
      }
    },

    "appearance": {
      "label": "Appearance",
      "icon": "appearance",
      "position": 20,
      "items": {
        "themes":      { "position": 10 },
        "site-editor": { "position": 20 },
        "plugins":     { "position": 80 }
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
}
```

### Item shape

Every menu item supports the same shape. Optional fields determine its role.

| Field        | Type      | Description                                                                                                |
|--------------|-----------|------------------------------------------------------------------------------------------------------------|
| `label`      | string    | Optional override of the bound screen's label. Required for items not bound to a screen.                   |
| `icon`       | string    | Optional override of the bound screen's icon. Required for items not bound to a screen.                    |
| `description`| string    | Optional tooltip / drilldown subtitle.                                                                     |
| `position`   | integer   | Sort order among siblings at this depth. Lower = earlier. Default = registration order.                    |
| `items`      | object    | Nested child items, keyed by id. Same shape recursively.                                                   |
| `href`       | string    | External link target. Token interpolation supported (e.g. `{site_url}`).                                   |
| `external`   | boolean   | When true with `href`, opens in a new browser tab.                                                          |
| `separator`  | boolean   | Renders as a visual separator. Other fields ignored.                                                       |
| `hidden`     | boolean   | Suppresses the item from rendering. Subtree is still in the tree for cascade addressing.                   |

### Implicit screen binding

If the item's key matches a screen id, the item is **bound** to that screen. The bound screen's `label`, `icon`, `permissions`, and `hidden` flow into the menu entry automatically. The item can override `label` / `icon` per-field without changing the screen itself: `menu.content.items.posts.label: "Articles"` renames Posts in the menu only.

If the item's key does NOT match any screen id, the item is a **standalone artifact** — a group container (declared `label` + `items`), an external link (declared `href`), or a separator. Authors must supply at least the fields the renderer needs.

### Renderer expectations

The engine's `menu-renderer` decides how nested items display:

- **`sidebar-drilldown`** (`core:default`): items with `items` become drilldown nodes; clicking slides into a sub-screen with a back link.
- **`sidebar-tree`**: items with `items` become expandable tree nodes.
- **`dock`** (`core:desktop`): items with `items` become folders.
- **`drawer`** (`core:single-pane`): items with `items` become accordion sections.

Renderers may impose a depth limit (default: 3). Items deeper than the limit are flattened or dropped per renderer policy.

### Cascade

Same array-merge-by-id rule, applied recursively at every depth.

- **Add a new item:** declare it at the right depth in any origin; key is the merge address.
- **Reorder:** `menu.content.items.posts.position: 5` at site origin.
- **Hide:** `menu.content.items.plugins.hidden: true` at role origin.
- **Rename:** `menu.content.items.posts.label: "Articles"` at user origin.
- **Delete:** `menu.content.items.plugins: null` at site origin (tombstone).
- **Plugin contribution:** `menu.content.items.plugin:my/orders: { position: 70 }` at plugin origin — plugin places its screen under "Content."
- **Move between containers:** `menu.appearance.items.plugins: null` + `menu.tools.items.plugins: { position: 10 }` at site origin.

### A screen with no matching menu item doesn't appear in the menu

Useful for palette-only screens, drill-target screens reached only via in-app links, modal-mounted screens. Pure routing without menu presence — just omit the item from the menu tree.

## Settings

The `settings` block holds reusable definition registries that other parts of the workspace reference by id. Mirrors theme.json's `settings` pattern. v3 ships two registries: `dataViews` (the `@wordpress/dataviews` configuration for an entity, keyed by `kind → name → variant`) and `dataFields` (named field collections referenced by views via `fieldsRef`).

Engines that ship alternative grid implementations MAY ignore the `dataView` block or interpret it per their own conventions; apps that don't render an entity list omit `dataView` entirely.

```json
{
  "settings": {
    "dataViews": {
      "postType": {
        "post": {
          "_default": {
            "fieldsRef": "core/post-fields",
            "defaultView": {
              "type": "table",
              "perPage": 20,
              "fields": [ "status", "author", "date" ],
              "titleField": "title",
              "sort": { "field": "date", "direction": "desc" }
            },
            "defaultLayouts": { "table": {}, "grid": {} },
            "actions": [
              { "id": "edit",  "label": "Edit",          "isPrimary": true, "icon": "pencil" },
              { "id": "view",  "label": "View",          "icon": "external", "eligibleWhen": { "status": "publish" } },
              { "id": "trash", "label": "Move to Trash", "isDestructive": true, "supportsBulk": true,
                "eligibleWhen": { "status": [ "publish", "future", "draft", "pending", "private" ] } }
            ]
          },
          "drafts": {
            "extends": "_default",
            "defaultView": {
              "fields": [ "author", "date" ],
              "filters": [ { "field": "status", "operator": "is", "value": "draft" } ]
            }
          }
        }
      }
    },

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
    }
  }
}
```

### DataViews

- **Registry lives at `settings.dataViews.<kind>.<name>.<variant>`.** Three axes; each leaf is a complete `@wordpress/dataviews` configuration (`fieldsRef`, `defaultView`, `defaultLayouts`, `actions`, etc.). The `_default` variant is the unqualified base; other variant ids are author-defined.
- **Variants are first-class registry entries at `settings.dataViews.<kind>.<name>.<variant>`.** Use explicit `extends: '<other-variant>'` for inheritance — no implicit `_default` merge (CIAB independent-resolution rule). Screens reference a variant via `dataViewRef: 'kind/name/variant'` and may layer additional inline overlay via `dataView`.
- **Inline override on screens via `screens[id].dataView`.** Deep-merges on top of the resolved triple. Per-screen tweak pattern that survives alongside `dataViewRef`.
- **Per-base + per-variant filter hooks.** `wp_admin_shell_data_view_config_{kind}_{name}` fires for every triple; `wp_admin_shell_data_view_config_{kind}_{name}_{variant}` fires additionally whenever the variant is non-`_default`.
- **Tombstones via `null`.** A higher origin sets `settings.dataViews.postType.post._default.fields.author: null` to remove the author column from the base globally. Or `screens.posts.dataView.fields.author: null` to remove it only on the Posts screen.

### DataFields

- **Named field collections.** Plugins / apps ship reusable field bundles registered through `settings.dataFields[id]`. Views reference a collection via `fieldsRef` and the resolver merges ref-wins-inline-overrides — collection provides the base, inline `fields` shallow-merges per-id, inline-only ids append after the base.
- **Same shape as v2 `fieldCollections`.** Moved under `settings.dataFields` for the registries grouping; the registry name changed, the per-entry shape did not.
- **Per-descriptor field word stays `field`** — matches `@wordpress/dataviews` upstream convention (`{ id, type, label, elements, enableSorting, ... }`).
- **Cascade-extensible.** Plugin origin contributes; site/role/user can override or hide fields per collection.

## Commands shape

```json
{
  "commands": [
    { "id": "open-palette",  "shortcut": "Mod+K",       "invoke":   "core:command-palette", "label": "Open Command Palette" },
    { "id": "new-post",      "shortcut": "Mod+Shift+N", "navigate": "/posts/new",            "label": "New Post" },
    { "id": "go-to-posts",   "shortcut": "g p",         "navigate": "/posts",                "label": "Go to Posts" }
  ]
}
```

Notes:

- **`id`** is required. Cascade addresses commands by id. Tombstone via `null` on the id entry removes it.
- **`invoke`** mounts a triggerable app (as in v2 `bindings`).
- **`navigate`** changes the URL — pure shortcut to a screen path. Doesn't require an app to mount.
- **`label`** surfaces the command in the palette UI even when it's keyboard-only.
- **Cascade**: array merge by `id`. Later origin wins per-field.

## Classic wp-admin menu bridge

To honor "anchor to existing WordPress entities" — the bridge ingests classic `add_menu_page()` / `add_submenu_page()` registrations into both the `screens` block AND the `menu` tree at a synthesized cascade origin. Logic:

1. On admin.json resolution, the PHP resolver walks `$GLOBALS['menu']` + `$GLOBALS['submenu']`.
2. For each registered menu, synthesize entries:
   - **A `screens` entry** describing what the surface is:
     - `id`: kebab-case of menu slug (e.g. `woocommerce` → `woocommerce`; `edit.php?post_type=product` → `edit-php-post-type-product`).
     - `label`: from `$menu_title`.
     - `icon`: from `$icon_url` (with fallback when it's an inline SVG or dashicons class).
     - `path`: derived from slug (`admin.php?page=woocommerce` → `/admin/woocommerce`).
     - `app`: native app if the slug maps to a known core surface (`edit.php` → `core:posts` with config `{postType: "post"}`; `upload.php` → `core:media`); otherwise `iframe:{slug}`.
     - `permissions`: built from the registration's capability.
   - **A `menu` tree entry** describing where the surface appears:
     - Placed under the `menu.ingested.items` container (a default top-level item synthesized by the bridge).
     - `position`: from registration `$position`.
     - `add_submenu_page()` registrations nest inside their parent's `items`.
3. The synthesized origin sits BETWEEN `core` and `plugin` in the cascade — admin.json plugin/site/role/user origins still override per-field on either the screen OR its menu item independently.

**Concrete benefit:** drop a plugin that registers menus the classic way (which is every plugin shipping today), and the workspace picks them up. No admin.json edits required. Site authors who want polish can:

- Rename in menu without touching screen: `menu.ingested.items.woocommerce.label: "Shop"`.
- Reparent: `menu.ingested.items.woocommerce: null` + `menu.content.items.woocommerce: { position: 70 }`.
- Hide from menu but keep accessible by URL: `menu.ingested.items.woocommerce.hidden: true`.
- Hide entirely: `screens.woocommerce.hidden: true`.
- Replace app: `screens.woocommerce.app: "plugin:my-replacement/dashboard"`.

**Container placement:** the bridge synthesizes a `menu.ingested` top-level item by default (label "Plugins"). Site authors can reparent ingested screens into other containers as needed. Plugin developers who want to claim a different container declare it via filter (`wp_admin_shell_ingested_menu_container`).

## Cascade semantics

The cascade resolver merges every origin (core / engine / plugin / site / role / user) into one document. The rules are uniform across blocks:

### Merge

- **Objects: deep-merge per-field.** Higher origin's keys overlay lower origin's keys.
- **Arrays: merge by `id`.** Entries with a matching `id` field deep-merge per-field. New ids append. Order is preserved from lower origin; appended entries land at the end unless a `position` field sorts them. Same approach theme.json takes for `settings.color.palette`.
- **Arrays without `id` field**: replaced wholesale (the higher origin's array wins).

Applies to: `screens`, `menu` tree (recursively at every depth), `settings.dataViews.{kind}.{name}.{variant}.fields`, `settings.dataViews.{kind}.{name}.{variant}.actions`, `settings.dataViews.{kind}.{name}.{variant}.defaultView`, `permissions.capabilities`, `permissions.roles`, `commands`, etc.

### Tombstones

Higher origin removes a lower-origin entry or field by setting its value to `null`:

```json
// Plugin origin
{ "screens": { "posts-trash": { "label": "Trash", ... } } }

// Site origin removes the trash screen
{ "screens": { "posts-trash": null } }
```

Tombstones work at every depth. `screens.posts.dataView.fields.author: null` removes the author column from the posts screen; `settings.dataViews.postType.post._default.fields.author: null` removes it from the registry base globally.

### Path collisions

If two screens claim the same `path` after the cascade resolves, the resolver fails with a diagnostic naming both screens. Authors disambiguate by:

- Removing one screen at a higher origin via tombstone.
- Changing the path on one screen via higher-origin override.
- Renaming the screen id.

Higher origins overriding the path of an existing screen by ID continue to work — that's a single `path` field cascade override, not a collision. Collision = two distinct screen IDs claiming the same path.

### Restrict-only enforcement

Existing v2 invariant carries forward: the cascade is restrict-only. Higher origins may TIGHTEN policy but not LOOSEN it. The interpretation depends on the block:

- For AND-semantic fields (e.g. app manifest `capabilities[]`): add allowed, remove rejected.
- For OR-semantic fields (e.g. `permissions.capabilities`): see [Permissions](#permissions) section — direction inverts.

Restrict-only violations are rejected at resolve time and logged for site-admin audit.

## Permissions

Every screen declares its access policy in a `permissions` block. The block has two array fields and OR semantics:

```json
{
  "screens": {
    "settings": {
      "label": "Settings",
      "path": "/settings",
      "app": "core:settings",
      "permissions": {
        "capabilities": [ "manage_options" ],
        "roles": [ "administrator", "super-admin" ]
      }
    }
  }
}
```

### Semantics

- **Within `capabilities`**: OR. User passes if they hold ANY listed capability.
- **Within `roles`**: OR. User passes if they belong to ANY listed role (direct `$user->roles` membership check).
- **Between the two fields**: OR. User passes the screen if they pass EITHER the capabilities check OR the roles check.
- **Magic value**: `"super-admin"` in the `roles` array triggers `is_super_admin($user_id)` — multisite-aware.

The block expresses "permitted access routes" — author lists every way someone may earn access; user passes via any one of them.

### App manifest AND-floor stays

The app's `app.json#capabilities[]` is AND-required and untouchable by any workspace declaration. A workspace cannot loosen the app's floor regardless of what `permissions` declares on a screen mounting it.

**Concrete example.** `core:settings` declares `capabilities: [ "manage_options" ]` in its manifest. A workspace declaring `screens.settings.permissions.roles: [ "subscriber" ]` does NOT grant subscribers access — the app-floor still demands `manage_options`. The OR-set in `permissions` only matters AFTER the app floor is satisfied.

### Default when `permissions` is absent

A screen with no `permissions` block resolves to admin-only:

```json
"permissions": {
  "capabilities": [],
  "roles": [ "administrator", "super-admin" ]
}
```

Secure-by-default. Small sites with only admin users need no permissions configuration. Larger installs explicitly add `permissions` blocks to broaden access. The screen still appears in the menu — it's not invisible, just inaccessible to non-admins (capability gating produces the same fallback UI as any other denied access).

### Trust-tier cascade rule for permissions

Because `permissions` arrays are OR-sets, "tightening" means SHRINKING the set (fewer ways to access) and "loosening" means GROWING the set (more ways to access). The cascade applies different rules to each origin based on trust:

| Origin            | May add (grow set) | May remove (shrink set) | Notes                                                          |
|-------------------|--------------------|-------------------------|----------------------------------------------------------------|
| `core` / `engine` | Yes                | Yes                     | Seeds the initial OR-set.                                       |
| `plugin`          | Yes                | Yes                     | Plugin authors declare access routes for their contributed screens. |
| `site`            | Yes                | Yes                     | Site admin = policy authority over their install.              |
| `role`            | No                 | Yes                     | Role-origin can only narrow access (e.g. hide a screen from a specific role by removing the matching role/cap). |
| `user`            | No                 | Yes                     | User-origin can only narrow personal access (hide screens from oneself). Users cannot grant themselves access. |

Resolver rejects forbidden modifications and logs them to a site-admin-visible audit channel.

### Unknown values

When the resolver encounters a capability or role slug not registered on the install:

- The unknown value is treated as a permanently-unsatisfiable requirement (no user can hold an unregistered cap or unregistered role).
- The screen mounts only for users who pass via OTHER, known requirements in the OR-set.
- In `WP_DEBUG` mode, the resolver logs a warning to `error_log` + a notice in the audit channel.
- A screen whose entire OR-set is unknown reduces to "deny everyone" effectively.

This is fail-closed. Typos can hide a screen but cannot accidentally expose one.

### Schema-level note

The schema declares `permissions.capabilities` and `permissions.roles` as `array of string`. The string `description` calls out that values are well-known WordPress capability slugs (e.g. `read`, `edit_posts`, `manage_options`) or role slugs (e.g. `administrator`, `editor`, `super-admin`). Authoring tools that connect to a live install may pull `wp_roles()->get_capabilities()` to provide auto-completion.

## Slots

A slot names a mount point. Slots exist at three layered tiers:

- **Kernel-reserved** (workspace-scope) — `_self` (primary URL path) and `palette` (modal overlay). Always available.
- **Engine-declared** — engine.json#slots adds engine-specific slots (`detail`, `inspector`, `dashboard-grid`, `toolbar`, `sidebar-footer`, etc.).
- **App-declared** — an app the screen mounts can expose its own slots via app.json#slots. e.g. `core:dashboard-host` exposes a `grid` slot; widgets in `screens[id].apps[]` with `slot: "grid"` mount inside it.

The resolved slot vocabulary for a given screen is the union of all three tiers. A slot reference that doesn't resolve at any tier is rejected at resolve time with a diagnostic.

### Two scopes

The `slot` keyword appears in two places:

- **Workspace-scope** — `screens[id].slot` declares which URL slot mounts the screen (`_self`, `palette`, etc.). Names a kernel-reserved or engine-declared slot.
- **Screen-scope** — `screens[id].apps[i].slot` declares which slot inside the screen mounts the app. Names an engine-declared or app-declared slot exposed by the screen's other apps.

Same keyword, different scope. Engine + kernel slots can be used at either scope; app-declared slots are screen-scope only.

### Core slot vocabulary

| Slot              | Tier                       | Intent                                                                                       |
|-------------------|----------------------------|----------------------------------------------------------------------------------------------|
| `_self`           | Kernel (workspace)         | Primary URL path. Default for screens with a `path` and no explicit `slot`.                  |
| `palette`         | Kernel (workspace)         | Command palette overlay. Conventional pair with `mode: "modal"`.                              |
| `detail`          | Engine (workspace + screen)| Detail / inspector pane in a paired-region layout.                                           |
| `inspector`       | Engine (workspace + screen)| Right-side property inspector (engine-dependent).                                            |
| `banner`          | Engine (workspace)         | Top-of-viewport notice banner. Conventional pair with `workspace.notices.banner`.            |
| `snackbar`        | Engine (workspace)         | Bottom-of-viewport ephemeral notification.                                                   |
| `window`          | Engine (workspace)         | Windowed-engine mount target (e.g. `core:desktop` windows).                                  |
| `toolbar`         | Engine (workspace)         | Persistent toolbar slot. Workspace widgets and chrome controls mount here.                   |
| `sidebar-footer`  | Engine (workspace)         | Bottom of sidebar. Persistent widgets mount here.                                            |
| `status-bar`      | Engine (workspace)         | Bottom-of-viewport status strip (engine-dependent — desktop engine).                          |

### Engine extensions

Engines may extend the vocabulary via `engine.json#slots`:

```json
{
  "slots": {
    "tiling-left":  { "description": "Tiling-engine left pane.",  "scope": "workspace" },
    "tiling-right": { "description": "Tiling-engine right pane.", "scope": "workspace" }
  }
}
```

Each entry declares `scope` (`workspace` / `screen` / `both`) so the resolver knows where the slot is allowed.

### App-declared slots

Apps that render sub-mount-points (dashboard hosts, layout containers) declare their slots in their manifest:

```json
{
  "id": "core:dashboard-host",
  "slots": {
    "grid": { "description": "Widget grid tiles." }
  }
}
```

A screen mounting `core:dashboard-host` gains the `grid` slot for use by other apps in the same screen's `apps[]` array.

### `slot` and `mode` are orthogonal

`slot` answers "where does this screen / app mount?" `mode` answers "how does the screen render shell chrome?" They are independent:

```json
"command-palette": {
  "slot":  "palette",
  "mode":  "modal",
  "app":   "core:command-palette"
}
```

The command palette is `palette`-slotted (a region with `route-key: "palette"` mounts it) AND `modal`-presented (overlay rendering, chrome state of underlying screen unchanged). Both are true; both are declared.

## System chrome

The `workspace` block declares chrome that persists across every screen — notices, persistent widgets (toolbar, sidebar-footer, status-bar entries), branding.

```json
{
  "workspace": {
    "engine": "core:default",
    "default-screen": "dashboard-home",
    "branding": { "logo": "...", "title": "WordPress" },

    "notices": {
      "banner":   { "app": "core:notices-banner" },
      "snackbar": { "app": "core:notices-snackbar" }
    },

    "widgets": {
      "toolbar": [
        { "id": "search",        "app": "core:toolbar-search" },
        { "id": "notifications", "app": "plugin:my/notifications-bell" }
      ],
      "sidebar-footer": [
        { "id": "help", "app": "core:help-link" }
      ]
    }
  }
}
```

### Notices

Notices are workspace-scope system chrome — they have no path, no menu binding, and never navigate. Authors swap implementations by overriding `workspace.notices.banner.app: "plugin:my/sticky-banner"` at any origin.

Engines render notices in their declared notice slots (`banner` and `snackbar` slots from the core vocabulary). Engines that omit notice slots ignore the block.

### Workspace widgets

The `workspace.widgets.<slot>` map declares apps that mount persistently across every screen, slotted into engine-declared workspace slots. Each entry is `{ id, app, ...slot-specific-fields }`.

- **Persistent.** Mount when the workspace boots; survive screen navigation (subject to active screen's `mode` hiding the parent region).
- **Slot vocabulary.** Engines declare which workspace slots they accept widgets in (`toolbar`, `sidebar-footer`, `status-bar`, etc.). Each engine documents its slot list.
- **Cascade-friendly.** Each `widgets.<slot>` array merges by `id`. Plugin authors contribute toolbar widgets by appending to the `toolbar` array at the `plugin` origin; site admins hide via `hidden: true`.
- **Implicit eligibility.** Any app may be slotted; engines / hosts render whatever they get. Apps render their own constraints.
- **Mount hints from app manifest.** Apps that ship `app.json#slotHints` provide defaults (preferred size, position) that the slot host honors when laying widgets out.

## Programmatic workspace registration

Plugins ship workspaces programmatically via:

```php
wp_admin_shell_register_workspace( 'my-shell', array(
    'version'   => 3,
    '$wpds'     => '6.9',
    'name'      => 'my-shell',
    'workspace' => array( ... ),
    'screens'   => array( ... ),
    'menu'      => array( ... ),
) );
```

Behavior:

- Accepts v3-shape arrays only. No v1/v2 normalization. Plugin authors migrating from v2 use a one-time migration helper.
- Returns `true` on success or `WP_Error` on schema validation failure.
- Late-registered workspaces appear in the shell-switcher and slot into the `plugin` cascade origin.
- Plugin-registered workspaces are still subject to site/role/user origin overrides via the cascade.
- Convention-based file discovery at `{plugin}/workspaces/{slug}.json` runs alongside programmatic registration. Programmatic registration wins on slug collision.

## Plugin extension hooks

The plugin-extension surfaces:

### Plugin-contributed modes

```php
add_filter( 'wp_admin_shell_engine_modes_{engineId}', function( $modes ) {
    $modes['kiosk'] = [ ... ];
    return $modes;
} );
```

Filter fires per-engine-id when the engine manifest loads. See [Modes](#modes) section for shape.

### Plugin-contributed menu renderers

Engines accept plugin-namespaced renderer ids in their `menu-renderer` field. Plugins register the renderer at runtime:

```php
wp_admin_shell_register_menu_renderer( 'plugin:my/breadcrumb-nav', $callback );
```

The engine's render path consults the renderer registry. Plugin renderers receive the resolved menu tree + active screen id as arguments and return rendered React or markup.

### Plugin-contributed dataView overrides

Preserved from v2 with the v3 rename: the `wp_admin_shell_data_view_config_{kind}_{name}[_{variant}]` filter runs on the resolved `dataView` doc after cascade resolution. The base filter (`wp_admin_shell_data_view_config_{kind}_{name}`) always fires; the per-variant suffix (`..._{variant}`) fires additionally whenever a screen consumes a non-`_default` variant. CIAB plugins migrate via `s/next_admin_entity_view_config_/wp_admin_shell_data_view_config_/g`.

## Open design questions

Lower-priority items deferred. The items below are the design-level questions:

1. **Per-renderer capability declarations.** Each engine `menu-renderer` should document what it supports (max nesting depth, separator rendering, drilldown vs accordion). Spec needs a contract table.

2. **Cascade audit log surface.** Site-admin-visible UI for cascade rejections (loosening attempts, unknown caps, path collisions). REST endpoint? Settings page? Both?

3. **Variant URL routing — resolved by dataview-registry restoration.** Variants are selected per-screen via `dataViewRef` (path-addressed: each variant is a separate screen) OR via state inside one screen (single screen, runtime `useDataView({kind, name, variant})` driven by tab state). Both shapes are legal; conventions for choosing between them are author-facing and documented in [`../dataview-config.md`](../dataview-config.md).

4. **App-internal slot-fill contributions.** Apps already accept plugin contributions via slot/fill within their own React tree (PluginSidebar pattern). Whether the schema declares these or leaves them as app-internal concerns. Post-v3 concern.

## What this collapses

| Intent | v1/v2 places touched | v3 places touched |
|--------|----------------------|-------------------|
| Add screen for custom post type | `routes` + `regions.sidebar.nav.config.items[]` + `viewConfigs.postType.product` + `fieldCollections` (opt) | `screens.<id>` + entry in `menu` tree + (opt) `settings.dataViews.postType.product._default` |
| Add column to existing screen | `viewConfigs.postType.post.fields[]` (filter or admin.json) | `settings.dataViews.postType.post.<variant>.fields[]` (global per-variant) OR `screens.posts.dataView.fields[]` (per-screen) |
| Reorganize / rename sidebar | nested array surgery in `regions.sidebar.nav.config.items[]` | edit nested `menu` tree by id (cascade-friendly at every depth) |
| Restrict a screen by capability/role | one of four places | `screens.<id>.permissions` (single block, OR-semantic) |
| Replace built-in screen | route override + nav item override | `screens.<id>.app` (single field) — menu item survives, still bound by id |
| Set landing screen | `default-route` | `workspace.default-screen` |
| Rename a screen in the menu without changing identity | edit nested nav array | menu item `label` override at the right depth |
| Hide a screen | tombstone via nav array surgery | `screens.<id>: null` (full removal) OR nested menu-item tombstone (menu-only hide) |
| Add a dashboard widget | `dashboardWidgets[id]` + manifest registration | `screens.dashboard-home.apps[]` entry with `slot: "grid"` |
| Add a toolbar widget | not supported in v1/v2 | `workspace.widgets.toolbar[]` entry |
| Multi-pane composition | regions + routes + per-region styling | `screens[id].apps[]` with `slot` on each entry |
| Hide editor chrome (focus mode) | not first-class — case-by-case CSS / region surgery | `screens.post-edit.mode: "focus"` |
| Per-role workspace | separate admin.json files + role option | unchanged |

The expensive intents (screen, column, menu, restrict, replace, focus, widgets) all collapse to one entry edit. That's the win.
