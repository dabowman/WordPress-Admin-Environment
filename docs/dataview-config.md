# DataView configuration

The `dataView` block configures how an entity list renders — fields, layouts, default sort, filters, actions. It is the WordPress Admin Shell's bridge to [`@wordpress/dataviews`](https://www.npmjs.com/package/@wordpress/dataviews), and it cascades through the same admin.json origins (core → engine → plugin → site → role → user) every other admin.json block uses. This document is the consumer-facing reference for plugin authors, designers, and site admins who want to override DataViews behavior without forking React.

## What `dataView` is

A `dataView` value is a JSON document whose shape mirrors the props `@wordpress/dataviews` consumes: `fields`, `defaultView`, `defaultLayouts`, `actions`, `titleField`, and the optional `fieldsRef` pointer into a reusable field collection. One `dataView` document describes one DataViews surface — the columns it shows by default, how it sorts, which filters it ships with, what row + bulk actions it offers.

Apps that don't render an entity list omit `dataView` entirely. The command palette, dashboard host, simple editor, and iframe wrappers all skip it. The schema marks `dataView` optional and validators don't complain.

Honest DS-scope note: `dataView` configures `@wordpress/dataviews` when the active engine and apps consume it. Plugin engines that ship a non-WPDS grid (Material data grid, AG-Grid, a custom canvas implementation) MAY ignore the block or interpret its fields per their own conventions. The schema documents the contract; the engine decides whether to honor it.

## Three places you'll see it

A `dataView` document can come from three layers. They cascade in this order — later layers win per-field over earlier layers.

| Layer | Authored at | Scope | Wins over |
|---|---|---|---|
| App manifest baseline | `app.json#dataView` | Ships with the app code; declares the `(kind, name)` it primarily renders and a `variants` family. | — |
| Registry (admin.json) | `settings.dataViews.<kind>.<name>.<variant>` | One triple at a time; cascades through every admin.json origin. | App manifest |
| Screen overlay | `screens[id].dataView` | One screen at a time. Deep-merges on top of whatever the registry resolved. | Registry |

**App manifest baseline.** The app's `app.json` ships a complete `dataView` block — `_default` plus every variant the app supports out of the box. The PHP resolver injects each variant into `settings.dataViews[kind][name][variant]` at the `core` origin, so admin.json cascade origins (site, role, user) can override per-triple. This is authoritative for the app's default behavior across every shell that mounts it.

**Registry (admin.json).** `settings.dataViews.<kind>.<name>.<variant>` is the shared, cascade-overrideable layer. Adding a `seo-score` column to the Posts `_default` variant at the site origin makes that column appear in every Posts list across every shell that mounts a screen pointing at `postType/post/_default`. The registry is shared by every screen that references it via `dataViewRef`.

**Screen overlay.** `screens[id].dataView` is a per-screen delta — last layer, narrowest scope. It deep-merges over the registry-resolved doc for whichever triple the screen points at. Use this when one specific screen needs a tweak that doesn't belong in the shared registry entry.

## Decision matrix — where should I put my override?

**Q: I want to add a column to every Posts list everywhere.**
A: `settings.dataViews.postType.post._default.fields[].push({...})` at the site, role, or user origin. Every screen consuming `postType/post/_default` picks it up.

**Q: I want to add a column only to the Drafts screen.**
A: `settings.dataViews.postType.post.drafts.fields[].push({...})`. The `drafts` variant is shared across any shell that mounts a drafts screen, so this is still the registry layer — not the screen overlay.

**Q: I want to add a column only to one specific custom drafts-compact screen, not the regular drafts.**
A: `screens.posts-drafts-compact.dataView.fields[].push({...})`. Screen overlay — narrowest scope.

**Q: I'm a plugin author. I want my CPT to ship a complete DataViews experience.**
A: `app.json#dataView` with `_default` and any variants you support. Cascade-overrideable per-triple from admin.json.

**Q: I want to hide a column.**
A: `null` tombstone at any layer. `settings.dataViews.postType.post._default.fields.author: null` removes the author column globally. Same syntax works inside `screens[id].dataView`.

**Q: I want to extend the drafts view from `_default` instead of duplicating its config.**
A: `settings.dataViews.postType.post.drafts: { "extends": "_default", "defaultView": { "filters": [...] } }`. Variants are independent by default (CIAB convention) — opt into inheritance with `extends`.

**Q: I want a screen to use the drafts variant instead of `_default`.**
A: `screens.my-drafts.dataViewRef: "postType/post/drafts"`. The screen names the registry triple it consumes.

## The `(kind, name, variant)` triple

Every `dataView` registry entry is addressed by a three-part triple.

- **`kind`** matches `@wordpress/core-data` entity kinds: `postType`, `taxonomy`, `root`.
- **`name`** is the specific entity within the kind: `post`, `page`, `category`, `post_tag`, `user`, `comment`, `plugin`, `theme`.
- **`variant`** is the optional third axis: `_default`, `drafts`, `pending`, `trash`, `active`, `inactive`, `administrators`. Variants are first-class registry entries — independently filterable, overrideable, and discoverable via REST.

`_default` is the implicit fallback when no variant is specified. A triple like `postType/post/_default` is the canonical "all Posts" view; `postType/post/drafts` is the variant scoped to draft status.

Variant inheritance is opt-in via `extends: "<variant>"`. There is no implicit merge from `_default` — a `drafts` variant that declares no `extends` resolves entirely from its own declared fields. This matches CIAB's independent-resolution rule. Authors who want the v2-style implicit merge write `"extends": "_default"` explicitly.

The resolver caps `extends` chains at depth 10 and detects cycles. `drafts extends compact extends _default` is legal; a cycle silently returns the leaf doc with a dev-mode warning.

## Filter hooks

Two filters fire on every resolved `dataView` doc. Both run after the cascade merge and `extends` resolution, before `fieldsRef` expansion is finalized.

1. **`wp_admin_workspaces_data_view_config_{kind}_{name}`** — always fires, on every variant lookup. Use for changes that should apply across every variant of an entity.
2. **`wp_admin_workspaces_data_view_config_{kind}_{name}_{variant}`** — fires when `variant !== '_default'`. Use for variant-targeted changes.

Example PHP adding an SEO-score column to every Posts variant:

```php
add_filter(
    'wp_admin_workspaces_data_view_config_postType_post',
    function ( $doc, $kind, $name, $variant ) {
        $doc['fields'][] = [
            'id'    => 'seo-score',
            'type'  => 'integer',
            'label' => __( 'SEO Score', 'my-plugin' ),
        ];
        return $doc;
    },
    10,
    4
);
```

Migrating from CIAB: `s/next_admin_entity_view_config_/wp_admin_workspaces_data_view_config_/g`. The mechanical rename ports both the base filter and the per-variant filter — CIAB's 3-axis hook naming maps directly.

## REST endpoints

Three endpoints expose the resolved registry to JS clients.

| Endpoint | Purpose |
|---|---|
| `GET /wp-admin-workspaces/v1/data-view?screen=<id>` | Resolved per-screen doc — the registry triple plus any inline `screens[id].dataView` overlay. What `useDataView(screenId)` calls for late-registered screens. |
| `GET /wp-admin-workspaces/v1/data-view?kind=X&name=Y[&variant=Z]` | Direct registry lookup. `variant` defaults to `_default`. |
| `GET /wp-admin-workspaces/v1/data-view/variants?kind=X&name=Y` | Variant discovery. Returns `{ variants: [ "_default", "drafts", ... ] }`. |

Permission floor is `is_user_logged_in()`. `dataView` blocks are structural metadata, not entity data — column shapes don't require entity capability checks. To gate further, add an `is_user_allowed` check inside the filter callback.

## Field collections (`dataFields`)

Reusable field bundles live in their own registry. `settings.dataFields.<id>` registers a named bundle:

```jsonc
{
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
        }
    }
}
```

A view references the bundle via `fieldsRef: "<id>"`. Resolution merges ref-wins-inline: the collection provides the base fields, an inline `fields` array shallow-merges per-id (matching ids replace; new ids append). `name: null` marks the collection as universal across every entity in that kind.

The per-descriptor word stays `field` — that matches `@wordpress/dataviews` upstream. Only the top-level registry key was renamed `dataFields` to align with `dataViews`.

## React hook

`useDataView` accepts either a screen id or a triple object. Both paths cache independently.

```js
import { useDataView } from '../../runtime/dataView/useDataView';

// Screen-keyed (most common — apps use this).
const { config, isLoading } = useDataView( screenId );

// Triple-keyed (manual lookup).
const { config, isLoading } = useDataView( { kind: 'postType', name: 'post', variant: 'drafts' } );
```

String argument routes through `/data-view?screen=<id>`; object argument routes through `/data-view?kind=X&name=Y&variant=Z`. Both paths consult the inline `window.wpAdminWorkspaces.config` snapshot first and only fall through to REST when the snapshot doesn't carry the requested entry. The hook source lives at `src/runtime/dataView/useDataView.js`.

## See also

- `docs/wp-admin-workspaces-design-spec.md` §13 #7–#8 — spec-level normative description.
- `docs/schema-sketch.md` — design rationale + cascade examples.
- [`@wordpress/dataviews`](https://www.npmjs.com/package/@wordpress/dataviews) — upstream component reference.
