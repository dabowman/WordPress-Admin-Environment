# Upgrading from v2 to v3

Practical guide for shipping a v2-shape shell, plugin, or app into a v3
admin shell installation. Pairs with [`docs/v3/roadmap.md`](v3/roadmap.md)
(progress), [`docs/v3/schema-sketch.md`](v3/schema-sketch.md) (final
shape), and [`docs/plans/2026-05-20-dataview-registry-restoration.md`](plans/2026-05-20-dataview-registry-restoration.md)
(why the dataView registry exists in the v3 form it does).

This document is the authoritative timeline for the v3.0 → v3.1
deprecation cycle. If you ship a public plugin or maintain a custom
shell, read all sections.

## 1. Overview

v3 is a structural refactor of admin.json, not a rewrite. The runtime
kernel is largely unchanged — the same DS-neutral region rendering,
4-layer capability gating, cascade resolver, and engine pluggability
carry forward. What moved is the admin.json *shape* (workspace/screens/
menu instead of routes/regions), the dataView primitive (3-axis CIAB
registry restored), and a handful of plugin extension hooks that
shifted names along with the schema rename.

Headline changes:

- **`workspace` / `screens` / `menu`** replace the v2 `routes` + `regions`
  blocks. Workspaces declare named layouts with slots; screens fill the
  slots; menus describe navigation hierarchy.
- **`dataView` primitive** — 3-axis registry `(kind, name, variant)` for
  `@wordpress/dataviews` configuration. Restores the CIAB-compatible
  v2 surface PR #50 had compressed during the v3 reshape; renamed from
  `viewConfig` to `dataView` to clarify the DS scoping.
- **Classic wp-admin menu bridge** ingests every third-party plugin's
  menu items automatically. CIAB-style declarative menu items work
  unchanged; native wp-admin plugins (Yoast, ACF, WooCommerce, etc.)
  show up automatically as iframed routes.
- **Multi-app screens** — one screen can host several apps in slots
  declared by the engine, with one routing-mirror app picking up the
  URL slot and the rest static.
- **Filter renames** — `wp_admin_shell_view_config_*` →
  `wp_admin_shell_data_view_config_*` (3-axis preserved with optional
  `_{variant}` suffix). v2 names keep working through v3.0 with
  `_deprecated_hook` notices, then break at v3.1.

## 2. For shell authors (admin.json migration)

The v2 → v3 mechanical transformation is a 1:1 mapping for most blocks.
A `wp admin-shell migrate-shell <slug>` CLI (Phase 3d.2) handles the
shape change automatically. Below is the hand-migration reference for
the same transformation.

### Shape map

| v2 path                                 | v3 path                                                  |
|-----------------------------------------|----------------------------------------------------------|
| `routes[]`                              | `screens[id]` (screen synthesis; see "Routes → Screens") |
| `regions[]`                             | `workspace.widgets[]` (engine-region binding)            |
| `regions[].config.items[]` (nav)        | `menu.<container>.items[]` (nested menu tree)            |
| `viewConfigs[kind][name][variant]`      | `settings.dataViews[kind][name][variant]`                |
| `fieldCollections[id]`                  | `settings.dataFields[id]`                                |
| `bindings[]`                            | `commands[]` (id-keyed; shortcuts attached)              |
| `branding.{logoUrl,…}`                  | `workspace.branding.{logoUrl,…}`                         |
| `styles.*`                              | `workspace.styles.*` OR `screens[id].styles.*`           |
| `engine` (string)                       | `workspace.engine` (string)                              |
| `preload[]`                             | unchanged (top-level)                                    |
| `customizable` (filter block)           | unchanged (top-level)                                    |

### Routes → Screens

A v2 `route` resolves a URL pattern to an app. A v3 `screen` is a named
route-addressable workspace surface. Each screen carries:

- `path` — URL pattern (same syntax as v2 `route.path`).
- `app` — primary app id (same as v2 `route.config.app`).
- `apps[]` — optional secondary apps for multi-app layouts (new in v3,
  see §8).
- `dataViewRef` (or `dataViewKind` / `dataViewName` / `dataViewVariant`)
  — explicit binding to a registry triple (see §3).
- `dataView` — optional inline overlay that deep-merges on top of the
  resolved triple.
- `config` — same shape as v2 `route.config`. `postType`, `taxonomy`,
  `variant` flow through.
- `mode` — declarative mode key from the engine's modes catalog (new).

The v3 PHP compiler back-compats v2 shells by synthesizing screens from
the routes block automatically. v2 shells in plugin directories keep
working without conversion through v3.0. The migration CLI converts
them into v3 shape so they survive past v3.1.

### viewConfigs → settings.dataViews

The v2 top-level `viewConfigs` block becomes dead data under v3. The v3
resolver reads `settings.dataViews` (same 3-axis shape, new location)
plus the per-app manifest `dataView` baseline. **If your shell still
ships a `viewConfigs` block in v3.0, the resolver fires
`_doing_it_wrong` once per request alerting site admins to migrate.**
The block is silently dropped at v3.1.

```jsonc
// v2 admin.json (DEAD in v3)
{
  "viewConfigs": {
    "postType": {
      "post": {
        "_default": { "defaultView": { "perPage": 25 } },
        "drafts":   { "defaultView": { "filters": [ {"field":"status","operator":"is","value":"draft"} ] } }
      }
    }
  }
}

// v3 admin.json (active)
{
  "settings": {
    "dataViews": {
      "postType": {
        "post": {
          "_default": { "defaultView": { "perPage": 25 } },
          "drafts":   { "extends": "_default", "defaultView": { "filters": [ {"field":"status","operator":"is","value":"draft"} ] } }
        }
      }
    }
  }
}
```

Note the optional `"extends": "_default"` declaration on the variant —
v3 variants resolve independently by default (CIAB convention); add an
explicit `extends` to opt into the v2 implicit-merge behavior.

### fieldCollections → settings.dataFields

```jsonc
// v2
{ "fieldCollections": { "core/post-fields": { "kind": "postType", "name": "post", "fields": [...] } } }

// v3
{ "settings": { "dataFields": { "core/post-fields": { "kind": "postType", "name": "post", "fields": [...] } } } }
```

Per-field descriptor `field` keyword (the array elements' `{id, type, label}`)
is unchanged — `@wordpress/dataviews` itself uses `field`, and the rename
stops at the registry level.

### Regions → workspace.widgets

v2's flat `regions[]` block becomes `workspace.widgets[]`, with each
widget binding an app to an engine-declared region template.

```jsonc
// v2
{ "regions": [
  { "id": "sidebar", "template": "core:sidebar", "config": { "app": "core:navigation" } }
] }

// v3
{ "workspace": {
  "engine": "core:default",
  "widgets": [
    { "region": "core:sidebar", "app": "core:navigation" }
  ]
} }
```

### Branding + styles

`branding` and `styles` move under `workspace`. Per-screen style overrides
live under each `screens[id].styles`. The block contents and slot vocabulary
are unchanged — the cascade resolver and engine `compileStyles` hook both
read from the new path automatically.

## 3. For plugin authors (filter renames)

The dataview-registry restoration renamed every public filter from
`wp_admin_shell_view_config_*` to `wp_admin_shell_data_view_config_*`.
The v2 names keep working through v3.0 via deprecation shims;
plugin authors should migrate before v3.1.

### Filter ordering — important

The v2 filter `wp_admin_shell_view_config_{kind}_{name}` fires **after**
the new-name filter `wp_admin_shell_data_view_config_{kind}_{name}`,
not before. This means:

```php
// v3 plugin author hooks the new name at default priority.
add_filter( 'wp_admin_shell_data_view_config_postType_post', function ( $doc, $kind, $name, $variant ) {
    $doc['defaultView']['perPage'] = 50;
    return $doc;
}, 10, 4 );

// Legacy v2 plugin still hooks the old name.
add_filter( 'wp_admin_shell_view_config_postType_post', function ( $doc, $kind, $name, $variant ) {
    // $doc HERE already carries perPage=50 from the v3 plugin above —
    // the legacy filter is DOWNSTREAM of the new name.
    return $doc;
}, 10, 4 );
```

If your plugin assumed the v2 filter ran *first* (e.g. you expected to
set a baseline that other plugins could override), the order is
reversed under v3.0. **Migrate to the new filter name** to land at the
position you expect; remove the v2 hook before v3.1 ships.

### Mechanical migration

```bash
# Run inside your plugin tree.
find . -name '*.php' -exec sed -i '' 's/wp_admin_shell_view_config_/wp_admin_shell_data_view_config_/g' {} +
```

Then verify your hook priorities are still right. The variant-suffixed
hooks (`wp_admin_shell_data_view_config_{kind}_{name}_{variant}`) fire
after the base filter when `variant !== '_default'`, matching v2 semantics.

### Other filter renames

Most filter names are unchanged in v3. The shell-wide `wp_admin_shell_data`,
per-origin `wp_admin_shell_data_{core,plugin,site,role,user}`, the menu/
admin-route shims, the `wp_admin_shell_cache_signals` filter, and the new
`wp_admin_shell_classic_menu_core_slugs` filter all keep their names.

## 4. Deprecation timetable

| Surface                                                  | v3.0                                            | v3.1                |
|----------------------------------------------------------|-------------------------------------------------|---------------------|
| Filter `wp_admin_shell_view_config_*`                    | Fires after the new name + `_deprecated_hook`   | Removed             |
| PHP fn `wp_admin_shell_register_field_collection()`      | Wrapper + `_doing_it_wrong` (`WP_DEBUG` only)   | Removed             |
| JS hook `useScreenView`                                  | Re-export + one-shot `console.warn`             | Removed             |
| JS hook `useViewConfig`                                  | Re-export + one-shot `console.warn`             | Removed             |
| JS fn `hydrateInlineScreenView`                          | Re-export + one-shot `console.warn`             | Removed             |
| REST `GET /wp-admin-shell/v1/screen-view`                | Alias to `/data-view` + `X-WP-Deprecated`       | Removed             |
| admin.json top-level `viewConfigs`                       | Dead data + `_doing_it_wrong` warning           | Silently dropped    |
| admin.json top-level `fieldCollections`                  | Dead data + `_doing_it_wrong` (planned 3d.5+)   | Silently dropped    |
| Shell flag camelCase `userSwitchable`                    | Read-fallback after kebab `user-switchable`     | Removed             |

**v3.0 cutoff:** all shims live alongside the v3 surface. Any v2-name
caller works but emits a notice on first invocation per request.

**v3.1 cutoff:** shims removed. v2-name callers break.

The shims live for one release cycle (v3.0.x). Plan to migrate ahead of
v3.1.

## 5. Field collections

```php
// v2 (deprecation wrapper survives v3.0)
wp_admin_shell_register_field_collection( 'core/post-fields', 'postType', 'post', [
    [ 'id' => 'title', 'type' => 'text', 'label' => 'Title' ],
] );

// v3 (canonical)
wp_admin_shell_register_data_field_collection( 'core/post-fields', 'postType', 'post', [
    [ 'id' => 'title', 'type' => 'text', 'label' => 'Title' ],
] );
```

The wrapper logs `_doing_it_wrong` once per request when `WP_DEBUG` is on
and forwards. Both functions return the registered id (or `WP_Error`
for collisions / invalid input). Renamed in v3.1.

The cascade contribution surface is identical — both paths flow through
the `plugin` origin's `settings.dataFields` block, which admin.json /
site / role / user can override per-id.

## 6. JS API

### `useDataView` replaces `useScreenView` + `useViewConfig`

```jsx
// v2 — screen-keyed (lookups by screen id)
const { config, isLoading } = useScreenView( 'posts-drafts' );

// v2 — registry-direct (lookup by triple)
const { config, isLoading } = useViewConfig( 'postType', 'post', 'drafts' );

// v3 — both folded into useDataView (overloaded)
const { config, isLoading } = useDataView( 'posts-drafts' );
const { config, isLoading } = useDataView( { kind: 'postType', name: 'post', variant: 'drafts' } );
```

`useDataView` accepts either a string (screen id) or an object with
`{ kind, name, variant? }`. Variant defaults to `_default` when omitted.

The deprecation shims keep working in v3.0. Each shim emits a one-shot
`console.warn` per session in dev builds, or in production builds when
`window.wpAdminShell.debug === true` (set automatically when PHP
`WP_DEBUG` is on — see 3d.5 Item 2). Production builds with `WP_DEBUG`
off are silent.

### `hydrateInlineScreenDataView` replaces `hydrateInlineScreenView`

```js
// v2
import { hydrateInlineScreenView } from '@wp-admin-shell/runtime/dataView/hydrateInline';

// v3
import { hydrateInlineScreenDataView } from '@wp-admin-shell/runtime/dataView/hydrateInline';
```

Both helpers read the same `window.wpAdminShell.config` snapshot.

## 7. REST

### `/wp-admin-shell/v1/data-view` replaces `/screen-view`

```bash
# v2
GET /wp-admin-shell/v1/screen-view?screen=posts-drafts

# v3 — screen lookup
GET /wp-admin-shell/v1/data-view?screen=posts-drafts

# v3 — registry-direct triple lookup (new)
GET /wp-admin-shell/v1/data-view?kind=postType&name=post&variant=drafts

# v3 — variant discovery (new)
GET /wp-admin-shell/v1/data-view/variants?kind=postType&name=post
```

The `/screen-view` alias keeps working through v3.0. Responses carry
an `X-WP-Deprecated: GET /wp-admin-shell/v1/screen-view is deprecated;
use GET /wp-admin-shell/v1/data-view?screen=<id>. Removed in v3.1.`
header.

Response shape is unchanged on `/screen-view`. The `/data-view` endpoint
returns the same `{ screen, kind, name, variant, view }` envelope.

## 8. Multi-app screens (new in v3)

A v3 screen can host multiple apps inside engine-declared slots. One
app receives the URL slot via `routing.mode: "mirror"`; the rest are
static layout decorations. See [Phase 3c.4 in the v3 roadmap](v3/roadmap.md#3c4---multi-app-screens-end-to-end-2d3d).

```jsonc
{
  "screens": {
    "posts": {
      "path": "/posts",
      "app": "core:posts",
      "apps": [
        { "app": "core:editor", "slot": "preview-pane", "routing": { "mode": "mirror" } },
        { "app": "core:posts-sidebar", "slot": "secondary" }
      ]
    }
  }
}
```

Apps reference engine slots by id. Slots declared by the engine's
workspace template advertise the available regions. Authoring a slot
the engine doesn't expose silently drops the app at compile time.

## 9. Classic wp-admin menu bridge (new in v3)

v3 ingests every third-party plugin's wp-admin menu entries
automatically. Native wp-admin plugins (Yoast SEO, Advanced Custom
Fields, WooCommerce extensions, etc.) appear in the shell's menu
without writing a single `wp_admin_shell_register_menu_item()` call.
The bridge walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` at the
`wp_admin_shell_data_plugin` filter and synthesizes `screens[]` +
`menu.ingested.items[]` entries.

Core wp-admin slugs (`index.php`, `edit.php`, `themes.php`, etc.) are
skipped because the shell ships native equivalents. If your plugin
overlaps a core slug intentionally, add it to the skip-list:

```php
add_filter( 'wp_admin_shell_classic_menu_core_slugs', function ( $slugs ) {
    $slugs[] = 'my-custom-page';
    return $slugs;
} );
```

Each ingested entry is realized as a `core:iframe-fallback` app
pointing at the wp-admin URL the plugin would have rendered. Cap gating
flows through the same 4-layer model as native apps.

## 10. Engine + theming

The engine + ThemeProvider seam in `src/runtime/styles/ThemeProviderHost.js`
is unchanged from v2.0.0-beta.2. Engines export an optional
`ThemeProvider` field on their `EngineSource`; the host wraps the inner
provider in a render-error boundary. Engines also export an optional
`compileStyles(styles, tokens)` hook that the host calls per region.

The `default-styles` block on engine manifests (Phase C of the
DS-decoupling refactor) survives unchanged. Site admins still customize
chrome by hooking into the engine's declared slots
(`chrome.{canvas,sidebar,toolbar,site-hub,content}.*`) and tokens
(`styles.theme.{color,cursor,density}`) via admin.json.

## 11. Testing

For each migration item, run:

```bash
npm run test:schema   # v3 schema sweeps incl. settings.dataViews + dataFields fixtures
npm run test:runtime  # data-view-merge-fields + data-view-hydrate-inline + deprecation-shims
npm run lint:js
npm run build

npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-tests.php
```

Per-app smoke testing is the same as v2 — each bundled app's `app.md`
covers known limitations + the `docs/screens/*.md` parity gap.

## 12. Reference

- [v3 roadmap](v3/roadmap.md) — phase status, locked decisions.
- [v3 schema sketch](v3/schema-sketch.md) — final shape.
- [dataview registry restoration plan](plans/2026-05-20-dataview-registry-restoration.md)
  — design rationale for the 3-axis registry's v3 form.
- [dataview-config docs](dataview-config.md) — DataView resolver + cascade
  semantics.
- [v3 default workspace fixture](v3/wp-admin-default.v3.json) — canonical
  example.
- [core-default engine docs](v3/core-default-engine.v3.md) — engine
  contract.

For questions on any specific deprecation surface or a port that doesn't
fit one of the headings above, open an issue against the repo or post in
the project's tracking P2.
