# DataView Registry Restoration — v3 reshape correction

**Status:** ready for implementation
**Date:** 2026-05-20
**Branch base:** `feat/wp-admin-shell-v3` (current branch)
**Implementation branch:** cut `feat/v3-dataview-registry` off `feat/wp-admin-shell-v3`; merge back as one PR.
**Estimate:** ~4 days serial; 3c.x roadmap phases (dashboard-host, palette, menu bridge, multi-app layout) can run in parallel after Stage 5.
**Owner:** TBA (single agent end-to-end recommended for shape coherence)
**Sequencing:** docs-first, schema-gated. See [Stage plan](#stage-plan) for the canonical order.

## Why this exists

Phase 3b of the v3 reshape (commit `12ce8dd`) collapsed the C2 view-config primitive from a 3-axis registry `(kind, name, variant|_default)` into a 2-axis registry `(kind, name)` plus per-screen inline `view` overlay. The reshape introduced real wins — screen-centric overlays, deep-merge with tombstones, single REST endpoint — but lost ground we earned during the CIAB primitives integration sweep (PRs #38–#48):

1. **Variants demoted from registry to inline screen deltas.** v2 had first-class `viewConfigs.postType.post.{_default,drafts,pending,trash}` + `viewConfigs.comment.{_default,pending,spam,trash}` + `viewConfigs.plugin.{_default,active,inactive}` + `viewConfigs.user.{_default,administrators}`. v3 has only the `_default` equivalent in `settings.views`; variants now live as inline `screens[id].view` deltas. Each shell that mounts a drafts screen reauthors the drafts filter inline. Two shells = two copies.
2. **Per-variant filter hook lost.** v2 fired `wp_admin_shell_view_config_{kind}_{name}_{variant}`. v3 fires only `wp_admin_shell_view_config_{kind}_{name}`. Plugin authors lost variant-targeted extension.
3. **REST `/variants` discovery gone.** Command palettes, plugin authoring tools, sidebar generators that wanted to enumerate `(kind, name)`'s known variants have no API. Only `/screen-view?screen=<id>` remains.
4. **CIAB mechanical migration broken.** The C2 design called out `s/next_admin_entity_view_config_/wp_admin_shell_view_config_/g` as the migration recipe. CIAB plugins use the 3-axis filter (e.g. `next_admin_entity_view_config_post_drafts`); there is no v3 target.
5. **App manifest variants stripped.** `inject_app_baselines()` in `class-wp-admin-shell-view-config.php:403` literally calls `unset( $entry['kind'], $entry['name'], $entry['variant'] )` and writes only the base entry. Apps shipping a complete variant family in `app.json#view` lose the variants at boot.
6. **`screenId` became load-bearing.** PostsApp + the five F-track apps now require `config.screenId` to be present (compiler-injected from `screens` block). v2 shells that bypass the v3 compiler render DataViews empty silently. Commit `c945b15` acknowledges this regression.
7. **Per-screen `_resolved` stamp does cascade work redundantly.** v3 compiler walks every screen and calls `resolve_screen_view()` to stamp `screens[id].view._resolved`. v2's per-triple cascade resolution was free — every override hit only the triple the override authored, not every screen consuming the triple.

## What this plan does

Restore the 3-axis registry. Keep everything good from the v3 reshape — screen overlays, deep-merge, tombstones, the `_resolved` stamp, the single inline-snapshot fast path. Add back what was lost.

Concretely:

- **3-axis registry** at `settings.dataViews.<kind>.<name>.<variant|_default>` — same shape as CIAB and v2 C2.
- **Rename `view` → `dataView`** everywhere. Acknowledges the block is `@wordpress/dataviews` configuration. Draws a clean distinction between *screen* (route-addressable workspace surface) and *DataView* (the DataViews component config that screen's app consumes).
- **Rename `fields` → `dataFields`** at the registry level only (`settings.dataFields`). Per-descriptor word `field` unchanged — `@wordpress/dataviews` itself uses `field` so don't churn that.
- **Honest DS scoping.** Schema documents that `dataView` configures `@wordpress/dataviews` when the active engine + apps consume it. Plugin engines shipping non-WPDS grids MAY ignore or interpret per their own conventions. Resolves the kernel-DS-neutrality tension by being explicit about what's package-bound (option (a) from the review).
- **`dataViewRef` pointer on screens.** Replaces silent inference. Screen names the registry triple it consumes; optional inline `dataView` overlay layers on top (current v3 deep-merge semantics).
- **Explicit `extends` for variant inheritance.** No implicit `_default` merge — variants resolve independently per CIAB spec. Authors who want the v2 _default-merge convention write `"extends": "_default"`.
- **Per-variant filter hook restored.** `wp_admin_shell_data_view_config_{kind}_{name}_{variant}` fires after the base filter.
- **`/variants` discovery REST restored.** Plus `/data-view` for the (kind, name, variant) lookup.
- **App manifests can ship variant families.** `inject_app_baselines()` preserves variants instead of stripping them.
- **v2 shells migrate by silent route→screen synthesis with auto `dataViewRef`.** v3 compiler synthesizes `dataViewRef` from `route.config.variant` when present. v2 shells render under v3-built apps.

## Naming reference

Mechanical rename table — exhaustive. Apply across PHP, JS, schemas, tests, docs.

| Old                                          | New                                                  |
|----------------------------------------------|------------------------------------------------------|
| `settings.views`                             | `settings.dataViews`                                 |
| `settings.fields`                            | `settings.dataFields`                                |
| `screens[id].view`                           | `screens[id].dataView`                               |
| `screens[id].view._resolved`                 | `screens[id].dataView._resolved`                     |
| `screens[id].viewKind`                       | `screens[id].dataViewKind`                           |
| `screens[id].viewName`                       | `screens[id].dataViewName`                           |
| (new) — screen → registry pointer            | `screens[id].dataViewRef: "kind/name/variant"`       |
| `app.json#view`                              | `app.json#dataView`                                  |
| `app.json#viewConfig` (legacy v2)            | `app.json#dataView`                                  |
| `app.json#viewConfigFallback`                | `app.json#dataViewFallback`                          |
| `fieldCollections` (v2 top-level)            | `settings.dataFields` (v3 registry)                  |
| `fieldsRef`                                  | `fieldsRef` (unchanged — DataViews term)             |
| `_resolvedFieldsRef`                         | `_resolvedFieldsRef` (unchanged)                     |
| `_default` (variant key)                     | `_default` (unchanged — CIAB convention)             |
| filter `wp_admin_shell_view_config_*`        | filter `wp_admin_shell_data_view_config_*`           |
| filter `_{kind}_{name}_{variant}` (re-added) | `wp_admin_shell_data_view_config_{kind}_{name}_{variant}` |
| REST `/screen-view?screen=<id>`              | REST `/data-view?screen=<id>` (kept; screen lookup)  |
| (new) — registry lookup                      | REST `/data-view?kind=X&name=Y[&variant=Z]`          |
| (new) — variants discovery                   | REST `/data-view/variants?kind=X&name=Y`             |
| JS hook `useScreenView(screenId)`            | JS hook `useDataView(screenId)` OR `useDataView({kind,name,variant})` |
| PHP class `WP_Admin_Shell_View_Config`       | `WP_Admin_Shell_Data_View_Config`                    |
| PHP class `WP_Admin_Shell_Field_Collections` | `WP_Admin_Shell_Data_Field_Collections`              |
| PHP function `wp_admin_shell_register_field_collection()` | `wp_admin_shell_register_data_field_collection()` |
| File `src/runtime/viewConfig/useScreenView.js` | `src/runtime/dataView/useDataView.js`              |
| File `src/runtime/viewConfig/hydrateInline.mjs` | `src/runtime/dataView/hydrateInline.mjs`           |
| File `src/runtime/viewConfig/mergeFields.mjs` | `src/runtime/dataView/mergeFields.mjs`              |
| Dir `src/runtime/viewConfig/`                | `src/runtime/dataView/`                              |
| File `includes/cascade/class-wp-admin-shell-view-config.php` | `includes/cascade/class-wp-admin-shell-data-view-config.php` |
| File `includes/cascade/class-wp-admin-shell-field-collections.php` | `includes/cascade/class-wp-admin-shell-data-field-collections.php` |
| File `includes/class-wp-admin-shell-view-config-rest.php` | `includes/class-wp-admin-shell-data-view-rest.php` |
| File `tests/php/run-view-config-tests.php`   | `tests/php/run-data-view-tests.php`                  |
| File `tests/runtime/view-config-*.test.mjs`  | `tests/runtime/data-view-*.test.mjs`                 |

`fieldsRef`, the `field` descriptor word (id/type/label/elements/enableSorting/etc.), and `_default` are left alone — they match `@wordpress/dataviews` upstream and CIAB conventions, so churning them costs reader-familiarity without buying clarity.

## Target schema shape

### `admin-v3.json` (workspace)

```jsonc
{
  "$schema": "https://schemas.wp.org/admin/v3.json",
  "version": 3,
  "engine": "core:default",

  "workspace": { "default-screen": "dashboard-home" },

  "settings": {
    // 3-axis registry — kind → name → (variant|_default) → DataView config doc.
    // Each leaf is a complete `@wordpress/dataviews` configuration; no nesting
    // beyond the three axes. Variants resolve independently of each other unless
    // they declare `"extends": "<other-variant>"`.
    "dataViews": {
      "postType": {
        "post": {
          "_default": {
            "fieldsRef": "core/post-fields",
            "defaultView": {
              "type": "table",
              "fields": [ "status", "author", "date" ],
              "titleField": "title",
              "sort": { "field": "date", "direction": "desc" },
              "perPage": 20
            },
            "defaultLayouts": { "table": {}, "grid": {} },
            "actions": [
              { "id": "edit",  "label": "Edit",  "isPrimary": true, "icon": "pencil" },
              { "id": "view",  "label": "View",  "icon": "external", "eligibleWhen": { "status": "publish" } },
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
          },
          "pending": {
            "extends": "_default",
            "defaultView": {
              "filters": [ { "field": "status", "operator": "is", "value": "pending" } ]
            }
          },
          "trash": {
            "extends": "_default",
            "defaultView": {
              "filters": [ { "field": "status", "operator": "is", "value": "trash" } ]
            },
            "actions": [
              { "id": "restore",          "label": "Restore",            "supportsBulk": true, "eligibleWhen": { "status": "trash" } },
              { "id": "delete-permanent", "label": "Delete Permanently", "isDestructive": true, "supportsBulk": true }
            ]
          }
        }
      },
      "root": {
        "user": {
          "_default":       { "fieldsRef": "core/user-fields", "defaultView": { "fields": [ "username", "email", "roles", "registered_date" ], "titleField": "name" }, "defaultLayouts": { "table": {} } },
          "administrators": { "extends": "_default", "defaultView": { "filters": [ { "field": "roles", "operator": "isAny", "value": [ "administrator" ] } ] } }
        },
        "comment": {
          "_default": { "fieldsRef": "core/comment-fields", "defaultView": { "fields": [ "author", "content", "status", "date" ] }, "defaultLayouts": { "table": {} } },
          "pending":  { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "hold" } ] } },
          "spam":     { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "spam" } ] } },
          "trash":    { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "trash" } ] } }
        },
        "plugin": {
          "_default": { "defaultView": { "fields": [ "name", "status", "version" ], "titleField": "name" }, "defaultLayouts": { "table": {} } },
          "active":   { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "active" } ] } },
          "inactive": { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "inactive" } ] } }
        }
      }
    },

    "dataFields": {
      "core/post-fields": {
        "kind": "postType",
        "name": null,
        "fields": [
          { "id": "title",  "type": "text",     "label": "Title",  "enableGlobalSearch": true },
          { "id": "status", "type": "text",     "label": "Status" },
          { "id": "author", "type": "text",     "label": "Author" },
          { "id": "date",   "type": "datetime", "label": "Date" }
        ]
      }
    }
  },

  "screens": {
    "posts":         { "label": "Posts",          "icon": "post",   "path": "/posts",          "app": "core:posts", "config": { "postType": "post" }, "dataViewRef": "postType/post/_default" },
    "posts-drafts":  { "label": "Drafts",         "icon": "drafts", "path": "/posts/drafts",   "app": "core:posts", "config": { "postType": "post" }, "dataViewRef": "postType/post/drafts" },
    "posts-pending": { "label": "Pending Review",                   "path": "/posts/pending",  "app": "core:posts", "config": { "postType": "post" }, "dataViewRef": "postType/post/pending" },
    "posts-trash":   { "label": "Trash",                            "path": "/posts/trash",    "app": "core:posts", "config": { "postType": "post" }, "dataViewRef": "postType/post/trash" },

    // Power-user case: screen points at registry variant + layers extra delta on top.
    "posts-drafts-compact": {
      "label": "Drafts (compact)", "path": "/posts/drafts/compact",
      "app": "core:posts", "config": { "postType": "post" },
      "dataViewRef": "postType/post/drafts",
      "dataView": {
        "defaultView": { "fields": [ "date" ] }
      }
    },

    // Escape hatch: no dataViewRef, full inline dataView. Same as today's v3 shape.
    // Useful for one-off screens that don't have a reusable registry entry.
    "posts-ad-hoc": {
      "label": "Ad-hoc", "path": "/posts/adhoc",
      "app": "core:posts", "config": { "postType": "post" },
      "dataView": {
        "fieldsRef": "core/post-fields",
        "defaultView": { "fields": [ "title", "date" ] },
        "defaultLayouts": { "table": {} }
      }
    }
  }
}
```

### `admin-app-v3.json` (per-app manifest)

```jsonc
{
  "id": "core:posts",
  "type": "app",
  "role": "main",

  // App ships its complete DataView family — _default + variants — under the
  // `(kind, name)` it primarily renders. The resolver injects these as baselines
  // into `settings.dataViews[kind][name]` at the `core` origin so admin.json /
  // site / role / user can override per-triple.
  "dataView": {
    "kind": "postType",
    "name": "post",
    "variants": {
      "_default": { "fieldsRef": "core/post-fields", "defaultView": { ... }, "defaultLayouts": { "table": {} }, "actions": [ ... ] },
      "drafts":   { "extends": "_default", "defaultView": { "filters": [ ... ] } },
      "pending":  { "extends": "_default", "defaultView": { "filters": [ ... ] } },
      "trash":    { "extends": "_default", "defaultView": { "filters": [ ... ] }, "actions": [ ... ] }
    }
  },

  "documentation": {
    "design-system-leakage": [
      "@wordpress/dataviews (DataViews + DataForm components, field descriptor shape)"
    ]
  }
}
```

The manifest baseline ships `_default` + variants together. Apps that don't use DataViews (`core:simple-editor`, `core:command-palette`, `core:dashboard-host`, `core:editor` iframe wrapper, etc.) omit `dataView` entirely — schema marks it optional.

## Resolution algorithm

PHP-side, in `WP_Admin_Shell_Data_View_Config`:

```text
resolve_screen_data_view($screenId, $config):
  screen = $config['screens'][$screenId]

  # 1. Resolve base (priority: dataViewRef > dataViewKind/Name > app manifest > none)
  if screen.dataViewRef:
    [kind, name, variant] = parse_ref(screen.dataViewRef)
  elif screen.dataViewKind && screen.dataViewName:
    kind    = screen.dataViewKind
    name    = screen.dataViewName
    variant = screen.dataViewVariant ?? '_default'
  else:
    [kind, name] = infer_from_manifest(screen.app, screen.config)
    variant = screen.config.variant ?? '_default'   # v2 back-compat

  base = resolve_data_view_triple(kind, name, variant, $config)

  # 2. Layer inline screen.dataView delta on top (existing v3 deep-merge logic).
  return deep_merge_data_view(base, screen.dataView ?? {})


resolve_data_view_triple(kind, name, variant, $config):
  reg = $config['settings']['dataViews'][kind][name]
  doc = reg[variant] ?? {}

  # 3. Variant inheritance — explicit `extends` only. Matches CIAB independent-resolution rule.
  #    Detect circular references; max depth 10 (matches modes resolver).
  if doc.extends:
    parent = resolve_data_view_triple(kind, name, doc.extends, $config)
    doc    = deep_merge_data_view(parent, omit_key(doc, 'extends'))

  # 4. fieldsRef expansion against settings.dataFields (same as today).
  doc = apply_fields_ref(doc, $config)

  # 5. Per-triple filter — CIAB-compatible name. Base filter always fires.
  doc = apply_filters("wp_admin_shell_data_view_config_{$kind}_{$name}", doc, kind, name, variant)
  if variant !== '_default':
    doc = apply_filters("wp_admin_shell_data_view_config_{$kind}_{$name}_{$variant}", doc, kind, name, variant)

  return doc
```

Notes:

- `extends` resolution is recursive — `drafts extends compact extends _default` legal. Cycle detection mandatory. Max depth 10 matches `WP_Admin_Shell_Modes::resolve_engine_modes()`.
- Step 2's deep-merge already handles `fields[]` / `actions[]` id-keyed merge + `null` tombstones — keep as-is.
- Step 4 honors `fieldsRef` overrides written into the inline screen overlay, same as today's resolver does.
- `screens[id].dataView._resolved` stamp continues to be written by the v3 compiler so the JS hot path stays synchronous.
- `screens[id].dataViewRef._kind`, `._name`, `._variant` MAY be stamped alongside `_resolved` so client-side code knows what triple resolved without re-parsing.

## Stage plan

Eight stages, docs-first + schema-gated. Each stage has a validation gate; **do not advance until that gate is green**.

Rationale: this is a course correction, not greenfield. The project's existing workflow (`CLAUDE.md` "Before modifying code") puts spec/schema reads ahead of code. Inverting that — code-first — leaves `docs/v3/*` lying during implementation and the schema sweep validating against a stale contract. Each gate below catches drift the next stage would otherwise inherit.

```
Stage 0: branch off v3                                          (0d)
Stage 1: design artifacts (spec + roadmap + sketch + author guide) (½d) — prose only
Stage 2: JSON Schemas                                           (½d) — schema sweep
Stage 3: fixture + shell reshape                                (½d) — schema sweep
Stage 4: PHP resolver + REST                                    (1d)  — PHP suite + browser smoke
Stage 5: JS runtime + app manifests                             (1d)  — Node suite + browser smoke (v2 back-compat)
Stage 6: CLAUDE.md + spec sweep + deprecation shims             (½d)  — lint + build clean
Stage 7: merge restoration PR into feat/wp-admin-shell-v3
```

After Stage 7, the v3 roadmap resumes from Phase 3c with the restoration as the new baseline.

### Stage 0 — branch

Cut `feat/v3-dataview-registry` off `feat/wp-admin-shell-v3` HEAD. Restoration ships as one discrete PR back into the v3 branch — reviewable as "design pivot + code that follows it." Do NOT rebase away `8b0948c` / `c945b15` — those commits contain real DataViews defaults (defaultLayouts, fields, titleField, defaultView.fields) that the fixture reshape relocates, not deletes.

### Stage 1 — Design artifacts (prose only)

The truth-of-record for v3 lives in `docs/v3/`. Update it before any schema or code change so the implementing surface is consistent throughout the rest of the work.

**Files:**

- `docs/wp-admin-shell-design-spec.md` §13 #7 — master spec entry. Rewrite the view-config primitive description as `dataView`: 3-axis registry, screen overlay layered on top, explicit `extends` for variant inheritance, per-variant filter hook restored. Cross-reference the new `docs/dataview-config.md` author guide.
- `docs/v3/schema-sketch.md` — concentrated rewrite of the Settings section (lines ~437–489 in current state). Rename `view`→`dataView` + `fields`→`dataFields` at every reference (~12 spots). Replace the "Variants are separate screens, not nested registry entries" bullet with the 3-axis-plus-screen-overlay model. Update the JSON example, the cascade scope line (~549), the tombstone example (~563), the screens shape example (~113, 117, 136), the plugin-extension-hooks section (~832–834 — restore variant suffix in filter name), Open question §844 ("Variant URL routing" — closes; path-or-state both legal now), FAQ table (~853 — `viewConfigs.postType.product` → `settings.dataViews.postType.product._default`). Add a paragraph documenting the honest DS-scope of the `dataView` block (configures `@wordpress/dataviews` when the active engine + apps consume it; plugin engines MAY interpret per their own conventions).
- `docs/v3/roadmap.md` — Locked-decisions table updates (see [v3 doc impact](#v3-doc-impact-summary) below). Status snapshot row for Phase 3b annotated as "view-config resolver was lossy; restored as data-view-config by `docs/plans/2026-05-20-dataview-registry-restoration.md`." Conceptual renames lines update: `viewConfig`/`view`→`dataView`, `viewConfigs`/`settings.views`→`settings.dataViews`, `fieldCollections`/`settings.fields`→`settings.dataFields`. Open decision #1 lean flips C1→C2 (back-compat via screen synthesis from `route.config.variant`; C1 stays the endpoint for 3d.1). Open decision #5 closes (variant URL routing — path-or-state both legal).
- `docs/dataview-config.md` (new, author-facing) — three sections: (1) what `dataView` configures (`@wordpress/dataviews` props), (2) registry vs. screen overlay decision rule, (3) `dataViewRef` vs. inline `dataView` vs. manifest baseline decision matrix.

**Validation gate:** prose review only — confirm internal consistency across the four files. No code changes. No schema changes.

### Stage 2 — JSON Schemas

**Files:**
- `docs/schemas/admin-v3.json`
- `docs/schemas/admin-app-v3.json`
- `docs/schemas/admin-engine-v3.json` (no schema changes likely; verify)

**Changes:**
- Add `settings.dataViews` 3-axis registry definition. Replace `settings.views`. Variant key pattern `^[A-Za-z0-9][A-Za-z0-9_/-]*$|^_default$`.
- Add `settings.dataFields`. Replace `settings.fields`. Same shape (rename only).
- Add `extends: string` to the variant entry $def. Optional, references sibling variant id under same `(kind, name)`.
- Add `screens[id].dataViewRef: string` (pattern `^[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z0-9_][A-Za-z0-9_-]*$`). Optional.
- Rename `screens[id].view` → `screens[id].dataView`, `screens[id].viewKind/viewName` → `screens[id].dataViewKind/dataViewName`. Add `screens[id].dataViewVariant`.
- In `admin-app-v3.json`, replace `view` with `dataView`. Add `variants: { <id>: <viewDoc> }` inside. The top-level `dataView` is the `_default`; variants nest under `variants` — same shape as a leaf in `settings.dataViews[kind][name]` minus `kind`/`name`.
- Schema descriptions: explicitly state `dataView` blocks configure `@wordpress/dataviews`. Engines that ship alternative grid implementations MAY ignore or interpret per their own conventions. Plugin apps that do not use DataViews omit `dataView` entirely.

**Validation gate — schema sweep:**
- Update `tests/schema/validate-shells.test.mjs` fixtures. Positive: v3 default workspace + a fixture exercising every shape (`dataViewRef`, `extends`, manifest `variants`). Negative: variant id `_default` cannot declare `extends`; circular `extends` rejected at schema level (impossible at JSON Schema; defer to runtime).
- `npm run test:schema` count grows from 91 to ~95.

### Stage 3 — Fixture + shell reshape

Apply the new schema to the canonical fixtures so the schema sweep validates them in their new shape. Resolver is still old at this stage — `wp admin-shell config` will return mis-resolved snapshots; that is expected and confirms code is the next gate.

**Files:**
- `docs/v3/wp-admin-default.v3.json` — the canonical v3 default workspace fixture. Promote inline variant deltas (e.g. `screens.posts-drafts.view.defaultView.filters`) into `settings.dataViews.<kind>.<name>.<variant>` entries with `extends: "_default"`. Rename top-level `settings.views` → `settings.dataViews`, `settings.fields` → `settings.dataFields`. Screens lose their inline `view.defaultView.filters` and gain `"dataViewRef": "kind/name/variant"`. Promote trash-screen restore + delete-permanent actions (currently authored inline per screen) to the `trash` variant entry.
- `shells/wp-admin-default-v3.json` — same reshape; it's a copy of the docs fixture.

**Validation gate — schema sweep:** `npm run test:schema` green. Activating via `wp option update wp_admin_shell_active_shell wp-admin-default-v3` will still render with the legacy resolver shape mis-applied — that's the signal Stage 4 is the next step. Schema sweep alone is the gate here.

### Stage 4 — PHP resolver + REST

**Files:**
- `includes/cascade/class-wp-admin-shell-view-config.php` → rename file to `class-wp-admin-shell-data-view-config.php` + class to `WP_Admin_Shell_Data_View_Config`.
- `includes/cascade/class-wp-admin-shell-field-collections.php` → rename file to `class-wp-admin-shell-data-field-collections.php` + class to `WP_Admin_Shell_Data_Field_Collections`. Public function `wp_admin_shell_register_field_collection()` → `wp_admin_shell_register_data_field_collection()`. Keep legacy function name as a thin wrapper that calls the new one + emits a one-time `_doing_it_wrong` notice in `WP_DEBUG`.
- `includes/cascade/class-wp-admin-shell-v3-compiler.php` — update call site to `WP_Admin_Shell_Data_View_Config::resolve_screen_data_view()`. Stamp `screens[id].dataView._resolved` (was `screens[id].view._resolved`). Inject `screenId` into route config (unchanged).
- `wp-admin-shell.php` — update class autoload table.

**Resolver changes:**
- `resolve_global(kind, name)` → `resolve_data_view_triple(kind, name, variant, $config = null)`. Signature gains `variant`.
- `resolve_screen_view($screen_id, $config)` → `resolve_screen_data_view($screen_id, $config)`. Walks `dataViewRef` → `dataViewKind`/`Name`/`Variant` → manifest inference (with `screen.config.variant` honored for v2 back-compat).
- New private method `resolve_extends_chain(kind, name, variant, $config, $stack = [])`. Detects cycles (`in_array($variant, $stack)` → return base doc + dev-warn), enforces max depth 10.
- Filter dispatch — both `wp_admin_shell_data_view_config_{kind}_{name}` and `wp_admin_shell_data_view_config_{kind}_{name}_{variant}` (latter only when `variant !== '_default'`).
- `inject_app_baselines()` — read manifest `dataView` block. Inject `dataView` (top-level) as `_default` variant into `settings.dataViews[kind][name][_default]`. Iterate `dataView.variants` and inject each as `settings.dataViews[kind][name][variant_id]`. Do NOT strip the variant key (current bug). Authoritative — admin.json wins per-triple, no deep-merge of registry entries (preserves declared-pair-wins-outright semantics).

**REST endpoints (folded into the same stage — single rename surface):**

`includes/class-wp-admin-shell-view-config-rest.php` → rename to `class-wp-admin-shell-data-view-rest.php`. Class `WP_Admin_Shell_Data_View_REST`.

- `GET /wp-admin-shell/v1/data-view?screen=<id>` — keep current `/screen-view` semantics, rename route. Returns `{ view: <resolved doc>, kind, name, variant }` (kind/name/variant added for client convenience).
- `GET /wp-admin-shell/v1/data-view?kind=X&name=Y[&variant=Z]` — direct registry lookup. Returns `{ view, kind, name, variant }`. Variant defaults to `_default`.
- `GET /wp-admin-shell/v1/data-view/variants?kind=X&name=Y` — variant discovery. Returns `{ variants: [ ids ] }`. Reads `settings.dataViews[kind][name]` keys after baselines injected.
- Old `/screen-view` route kept as deprecation alias for one release cycle — emits an `X-WP-Deprecated` header + maps to the new handler.

**Validation gate — PHP suite + browser smoke:**
- Rename `tests/php/run-view-config-tests.php` → `tests/php/run-data-view-tests.php`. Add assertions for:
  - 3-axis lookup hit + miss (`(postType, post, drafts)` resolves; `(postType, post, nonexistent)` returns empty).
  - `extends` chain — single level + multi-level + cycle detection + depth-cap.
  - Per-variant filter fires + per-base filter fires (count both).
  - `inject_app_baselines()` writes `_default` + each variant from manifest.
  - `dataViewRef` parse + invalid-ref handling (segments don't match patterns → no resolution).
  - v2 back-compat: `route.config.variant` flows into screen synthesis with auto `dataViewVariant`.
  - Inline `screens[id].dataView` overlay still deep-merges + tombstones still work.
  - REST: each endpoint above + deprecation-alias header presence on `/screen-view`.
- Existing 54 assertions grow to ~75.
- Browser smoke: activate `wp-admin-default-v3`; every variant screen (`/posts/drafts`, `/posts/pending`, `/posts/trash`, `/comments/{pending,spam,trash}`, `/plugins/{active,inactive}`, `/users/administrators`) renders DataViews with its variant filters applied + variant-specific actions.

### Stage 5 — JS runtime + app manifests + shells

**Files:**
- Dir rename `src/runtime/viewConfig/` → `src/runtime/dataView/`.
- `useScreenView.js` → `useDataView.js`.
- `hydrateInline.mjs` — rename `hydrateInlineScreenView` → `hydrateInlineScreenDataView`. Add a second exported helper `hydrateInlineDataViewTriple(inline, kind, name, variant)` for the registry-direct fast path.
- `mergeFields.mjs` — unchanged (still `mergeFields`).

**Hook API — overloaded:**

```js
// Screen-keyed lookup (current default).
const { config, isLoading } = useDataView( screenId );

// Triple-keyed lookup (entity-centric — restores v2 `useViewConfig` semantics).
const { config, isLoading } = useDataView( { kind: 'postType', name: 'post', variant: 'drafts' } );
```

The hook detects the call shape: string arg → screen path; object arg → triple path. Inline-snapshot fast path for both. REST fallback uses `/data-view?screen=<id>` or `/data-view?kind=X&name=Y&variant=Z` accordingly. Caches keyed by `screen:<id>` or `triple:<kind>/<name>/<variant>` so the two paths don't collide.

**App rewrites (entity-CRUD apps):**

Each of the six entity-CRUD apps (`core:posts`, `core:users`, `core:comments`, `core:plugins`, `core:taxonomy`, `core:themes`) updates:

- Replace `import { useScreenView } from '../../runtime/viewConfig/useScreenView'` → `import { useDataView } from '../../runtime/dataView/useDataView'`.
- Replace `const { config: viewConfig } = useScreenView( screenId )` → `const { config: dataViewConfig } = useDataView( screenId )`. (Local variable name `dataViewConfig` is clearer than `viewConfig`.)
- The view-resync `useEffect` already keys on `[screenId, postType]` (or equivalent) — keep as is.

**App manifests (`src/apps/<id>/app.json`)** — folded into same stage; the rename is the same surface as the JS imports.

The six entity-CRUD apps update their top-level binding.

```jsonc
// before (v3 + reshape, lossy):
{ "view": { "kind": "postType", "name": "post" } }

// after:
{
  "dataView": {
    "kind": "postType",
    "name": "post",
    "variants": {
      "_default": { "fieldsRef": "core/post-fields", "defaultView": { ... }, "defaultLayouts": { "table": {} }, "actions": [ ... ] },
      "drafts":   { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "draft" } ] } },
      "pending":  { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "pending" } ] } },
      "trash":    { "extends": "_default", "defaultView": { "filters": [ { "field": "status", "operator": "is", "value": "trash" } ] }, "actions": [ ... ] }
    }
  }
}
```

Each app ships its complete variant family — `_default` plus the variants the v2 default workspace had. Reference: `shells/wp-admin-default.json` `viewConfigs` block (lines 234–540 or so). Mechanical transcription of v2 entries into the new manifest shape.

Apps that don't ship variants (e.g. `core:themes` had only `_default` in v2) keep just `variants._default`.

`app.json#documentation.design-system-leakage` adds the line `@wordpress/dataviews (DataViews + DataForm components, field descriptor shape)` if not already present.

**Shells:**
- `shells/wp-admin-default-v3.json` — rewrite `settings.views` block as `settings.dataViews` 3-axis. Drop inline `view` deltas on variant screens (e.g. `posts-drafts`, `posts-pending`, `posts-trash`, `comments-pending`, `comments-spam`, `comments-trash`, `plugins-active`, `plugins-inactive`, `users-administrators`) — replace with `"dataViewRef": "kind/name/variant"`. Rename `settings.fields` → `settings.dataFields`.
- `shells/wp-admin-default.json` (v2) — untouched. v2 shells stay v2; v3 compiler synthesizes screens + `dataViewRef` from `route.config.variant` for v2-compat rendering under v3-built apps.
- Other v2 shells (`developer-admin.json`, `content-author.json`, `client-portal.json`, `v2-demo.json`) — untouched.

**Validation gate — Node suite + browser smoke (v2 back-compat):**
- Rename test files `tests/runtime/view-config-*.test.mjs` → `tests/runtime/data-view-*.test.mjs`.
- Add a triple-path test for `useDataView({kind, name, variant})` covering inline-snapshot, REST-fallback, cache reuse, error fallback.
- Existing 30 runtime assertions grow to ~40.
- Shell smoke (`tests/php/run-shape-tests.php`) — extend known-engines + v3-shape detection if needed. Counts may grow by a handful.
- Schema sweep validates the new shell shape.
- Build clean (`npm run build`). Lint clean (`npm run lint:js && npm run lint:ts`).
- Browser smoke #1: `wp-admin-default-v3` (v3 shape) renders every variant route correctly — same scope as Stage 4's smoke but now driven by the JS hook.
- **Browser smoke #2 — v2 back-compat:** activate `wp-admin-default` (the v2 shape). v3 compiler synthesizes screens with `dataViewVariant` from `route.config.variant`. `/posts/drafts`, `/posts/pending`, `/posts/trash` (etc.) render DataViews with correct variant filters under the v3-built apps. This is the proof Stage 4's synthesis path works end-to-end.

### Stage 6 — Sweep + deprecation shims

Stage 1 already rewrote the v3 design docs (spec, roadmap, schema-sketch, author guide). Stage 6 is the cleanup pass — codebase-wide rename audit + deprecation shims that keep v2 callers working for one release cycle.

**Sweep:**
- Grep the codebase for any straggling `view-config` / `viewConfig` / `useScreenView` / `useViewConfig` references not already touched in Stages 1–5. Likely surfaces: code comments, docstrings, test fixtures, `docs/research/ciab-primitives-cascade-integration.md`, archived design specs.
- Update `CLAUDE.md` — "Application sources" table notes that mention `useViewConfig` / `useScreenView`; Recurring-patterns section's entity-CRUD pattern paragraph; Test surface section's PHP + Node counts; the test-totals comment block.
- Confirm Stage 1's `docs/v3/schema-sketch.md` + `docs/v3/roadmap.md` + `docs/wp-admin-shell-design-spec.md` §13 #7 + `docs/dataview-config.md` rewrites are still consistent with what landed in Stages 2–5; reconcile any drift.

**Deprecation shims (one release cycle, removed in v3.1):**
- PHP function `wp_admin_shell_register_field_collection()` — thin wrapper calling `wp_admin_shell_register_data_field_collection()` + one-shot `_doing_it_wrong` notice in `WP_DEBUG`.
- PHP filter `wp_admin_shell_view_config_{kind}_{name}` — fired alongside `wp_admin_shell_data_view_config_{kind}_{name}` whenever the latter fires, with a `_deprecated_hook` notice on first invocation per request.
- REST `/wp-admin-shell/v1/screen-view` — aliased to `/data-view` with `X-WP-Deprecated` header.
- JS `useScreenView` — re-exported from `useDataView` with a one-shot `console.warn` in non-production builds.

**Validation gate — full suite + lint + build:**
- Full PHP suite green (~616 assertions).
- Full Node suite green (~520 assertions).
- `npm run lint:js && npm run lint:ts && npm run build` clean.
- A grep audit for `viewConfig|view-config|useScreenView|useViewConfig|screen-view|fieldCollections|settings\.fields|settings\.views` returns only intentional deprecation-shim sites + archive directory.

### Stage 7 — Merge restoration PR

Open PR from `feat/v3-dataview-registry` → `feat/wp-admin-shell-v3`. Reviewable as a single design-pivot-plus-code unit. After merge, the v3 roadmap continues on the parent branch from Phase 3c.

## After restoration — v3 roadmap continues

Restoration leaves the v3 roadmap intact. Resume from where Phase 3c was paused:

- **3c.1 dashboard-host rewrite** — unblocked. Independent of `dataView`; dashboard widgets don't consume the registry. Can have started parallel to Stage 5 if a second agent is available.
- **3c.2 command palette rewrite** — unblocked. Independent.
- **3c.3 classic wp-admin menu bridge** — unblocked. Independent.
- **3c.4 multi-app layout algorithm** — unblocked. Independent.
- **3d.1 migrate 5 remaining bundled shells** — *easier post-restoration*. Migration recipe stable (variants → registry triples). v2 → v3 mechanical. C2-from-Open-Decision-#1 (back-compat synthesis) becomes the bridge; C1 (drop v2 shells) becomes the deliberate endpoint after this phase.
- **3d.2 v2→v3 migration helper** — *easier post-restoration*. Helper writes registry entries instead of inline screen deltas + handles `route.config.variant` → `dataViewRef` synthesis.
- **3d.3 test surface rewrites** — proceeds atop restoration's test surface as the new baseline.
- **3d.4 documentation sweep** — restoration handled most of this; sweep covers anything missed.

## v3 doc impact summary

This plan changes content in three of the four `docs/v3/` artifacts. Stage 1 handles the prose rewrites; Stage 3 handles the fixture reshape; Stage 6 reconciles any drift.

### `docs/v3/roadmap.md` — locked-decision overrides

| Locked decision (current)                                                              | After plan                                                                                          |
|----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Conceptual rename: v2 `viewConfig` field on app manifests → **`view`**.                | → **`dataView`**, with nested `variants: { <id>: ... }` carrying the variant family.                 |
| Conceptual rename: v2 `viewConfigs` admin.json block → **`settings.views`**.           | → **`settings.dataViews`**, 3-axis `(kind → name → variant)`. v2 shape restored, not flattened.      |
| Conceptual rename: v2 `fieldCollections` → **`settings.fields`**.                      | → **`settings.dataFields`** at top level. Per-descriptor word `field` unchanged.                     |
| Top-level shape line "settings — registries — views, fields"                           | "settings — registries — dataViews, dataFields"                                                      |
| Status snapshot row "3b — resolvers (view-config / menu / permissions / modes)"        | Annotate as lossy w/ pointer to this plan as the restoration.                                        |
| Screens locked: "Inline `view` overlay deep-merges with `settings.views.<kind>.<name>` global." | Inline `dataView` overlay deep-merges with the resolved `(kind, name, variant)` triple. Triple resolved via `dataViewRef`, explicit `dataViewVariant`, or screen-app inference. |
| Plugin extension hooks: "Existing v2 hooks survive (`wp_admin_shell_view_config_{kind}_{name}`)." | Renamed to `wp_admin_shell_data_view_config_{kind}_{name}[_{variant}]`. v2 name fires alongside with `_deprecated_hook` notice for one release cycle. |
| Open decision #1 "v2 shells decision" — leaning **C1 (drop v2 shells)**.               | Leaning flips to **C2 (back-compat layer)**. C1 stays the endpoint for 3d.1; C2 is the bridge.       |
| Open decision #5 "Variant URL routing — query-driven variants deferred."               | **Closes.** Path-driven (separate screen per variant via `dataViewRef`) AND state-driven (single screen, `useDataView({kind,name,variant})` driven by tab state) both legal. Conventions TBD. |
| Phase 3d.2 v2→v3 migration helper bullets                                              | "viewConfigs → settings.dataViews (3-axis preserved); fieldCollections → settings.dataFields; routes' `config.variant` → screen synthesis with `dataViewVariant`." |

### `docs/v3/schema-sketch.md` — Settings section rewrite

Concentrated rewrite (lines ~437–489 in current state). Specifics:

- Top-of-section paragraph (~line 439): "v3 ships two registries: `dataViews` (the `@wordpress/dataviews` configuration for an entity, keyed by `kind → name → variant`) and `dataFields` (named field collections referenced by views via `fieldsRef`)." Add the DS-scope honesty paragraph.
- JSON example (~lines 444–477): 3-axis with `_default` + variants; rename top-level keys.
- Views subsection (~lines 479–482): replace "Variants are separate screens, not nested registry entries" with the 3-axis-plus-overlay model.
- Fields subsection (~lines 486–488): top-level key references rename. Add bullet about `field` descriptor word staying.
- Cascade scope (~line 549): add `<variant>` segment to the example paths.
- Tombstone example (~line 563): `screens.posts.view.fields.author: null` → `screens.posts.dataView.fields.author: null`.
- Screens shape examples (~lines 113, 117, 136): `view` → `dataView`; add `dataViewRef` to an example.
- Plugin-contributed view-config overrides (~lines 832–834): rename filter, restore variant suffix.
- Open question §844 ("Variant URL routing"): close + document both shapes legal.
- FAQ table (~line 853): rename + add 3-axis paths.

### `docs/v3/wp-admin-default.v3.json` — fixture reshape

Canonical v3 default workspace fixture. Reshape per Stage 3 — promote inline variant deltas into 3-axis registry entries, rename top-level keys, screens point via `dataViewRef`. After reshape this fixture is ~30–50% smaller because drafts/pending/trash filter duplication collapses into single registry entries.

### `docs/v3/core-default-engine.v3.md` — no changes

Engine doc references region names + modes, not view-config. Untouched.

## What the v3 final state looks like after restoration

The "what we're working towards" in the roadmap mostly survives intact. The plan changes one specific primitive — the view-config block — and threads a name change through. Unchanged:

- Workspace / screens / menu / commands / styles / preload / regions / routes top-level layout.
- Modes catalog + per-screen mode + region-state overlays.
- Permissions OR-semantic + trust-tier model.
- Cascade deep-merge + tombstones + restrict-only.
- Menu nested tree + engine-pluggable renderer.
- Workspace widgets + slot model.
- `wp_admin_shell_register_workspace()` programmatic API.
- Conceptual rename of "shell" → "workspace".
- Phase 3c.1 dashboard-host slot-driven rewrite.
- Phase 3c.2 command palette rewrite.
- Phase 3c.3 classic wp-admin menu bridge.

Different in the final state:

- **3-axis registry** for entity-shape definitions, not 2-axis + scattered inline overlays.
- `dataView` reads as **"DataViews component config"** at every call site, not generic "view." Clean distinction between *screen* (route-addressable workspace surface) and *DataView* (the `@wordpress/dataviews` configuration that screen's app consumes).
- CIAB plugins port mechanically via `s/next_admin_entity_view_config_/wp_admin_shell_data_view_config_/g`.
- v2 shells survive under v3 (back-compat synthesis); 3d.1 (drop v2 shells) becomes a deliberate cleanup, not a forced break.
- Open question #5 closes (variant URL routing — both shapes legal).
- Open question #1 lean flips C1→C2 for the transition; C1 still the endpoint.

## Pitfalls to avoid

1. **Don't skip Stage 1.** Doing schemas + code first means `docs/v3/*` lies during implementation. Schema sweep is the only thing that catches subtle shape drift; without an updated contract every file becomes a hand-audit.
2. **Don't rebase 8b0948c / c945b15 away.** Those commits added real DataViews data (defaultLayouts, fields, titleField, defaultView.fields). Stage 3 *relocates* that data to registry path — does not delete it.
3. **Don't ship as separate "rename" + "registry" PRs.** Names + shape are entangled — half-renamed code is harder to review than the full pivot. One PR back into the v3 branch.
4. **Don't kill v2 back-compat too early.** Stage 4's `route.config.variant` synthesis keeps v2 shells working under v3-built apps. 3d.1 (drop v2 shells) is the deliberate endpoint, not a side effect of restoration.
5. **Don't conflate restoration with `core:entity-list` consolidation.** The C2.5 deferred refactor (collapse six entity-CRUD apps into one renderer) stays deferred. Restoration is the registry shape; consolidation is downstream.
6. **Don't advance past a validation gate before it's green.** Each stage's gate exists because the next stage assumes its invariant. Stage 4 expects the schemas + fixtures to validate; Stage 5 expects the PHP suite to confirm resolver shape; Stage 6 expects the full suite to confirm runtime shape.

## Out of scope

- Migrating CIAB plugins. Out — separate effort. This plan restores the migration *path*; actually moving plugin code is downstream.
- Consolidating the six entity-CRUD apps into a shared `core:entity-list` renderer. Still deferred (was deferred from C2). Re-evaluate after this plan lands.
- Adding new variant primitives like "presets" or "user-saved views". Out — current goal is restoring lost ground, not adding new ground.
- Splitting the `dataView` block into per-component blocks (`dataView.list`, `dataView.form`, `dataView.cards`). Out — `@wordpress/dataviews` doesn't split them upstream.

## Test totals (after plan completes)

PHP:
- cascade 39 (unchanged)
- manifest 67 (unchanged; manifest schema changes covered by schema sweep)
- shape ~128 (small additions for new screen fields)
- data-view ~75 (was view-config 54)
- menu 81 (unchanged)
- cap 54 (unchanged)
- mode 20 (unchanged)
- v3-compiler ~52 (small additions for variant-from-route synthesis)
- tokens 13 (unchanged)
- engine-defaults 22 (unchanged)
- cap-gating-smoke 5 (unchanged)
- chromeless 13 (unchanged)
- preload 22 (unchanged)
- dashboard-widgets 25 (unchanged)

**Total PHP: ~616** (up from current ~590).

Node:
- schema ~95 (was 91)
- runtime ~40 data-view (was 30 view-config) + 270 unchanged = ~310
- parity 4 (unchanged)
- engines 77 (unchanged)
- mode 27 (unchanged)

**Total Node: ~520** (up from current ~420).

Numbers are estimates; track actual deltas during implementation.

## Acceptance criteria

1. `npm run lint:js && npm run lint:ts && npm run build` clean.
2. Every test suite listed above runs green.
3. `shells/wp-admin-default-v3.json` activated via `wp option update wp_admin_shell_active_shell wp-admin-default-v3` renders DataViews on `/posts`, `/posts/drafts`, `/posts/pending`, `/posts/trash`, `/users`, `/users/administrators`, `/comments`, `/comments/pending`, `/comments/spam`, `/comments/trash`, `/plugins`, `/plugins/active`, `/plugins/inactive`, `/appearance/themes` — all with their respective variant filters applied, columns + actions configured.
4. Activating the v2 default shell (`wp-admin-default`) under the new code still renders DataViews on variant routes — v3 compiler synthesizes screens with `dataViewVariant` from `route.config.variant`.
5. `wp_admin_shell_data_view_config_postType_post_drafts` filter fires exactly once when `/posts/drafts` mounts.
6. `GET /wp-admin-shell/v1/data-view/variants?kind=postType&name=post` returns `{ variants: [ "_default", "drafts", "pending", "trash" ] }`.
7. CIAB filter migration recipe — `s/next_admin_entity_view_config_/wp_admin_shell_data_view_config_/g` — produces a working filter for both base and variant axes.

## Files touched (estimate)

- ~6 PHP files renamed + edited (resolver, field-collections, REST, v3-compiler, plugin bootstrap, autoload).
- ~3 JS files renamed + edited (`useDataView.js`, `hydrateInline.mjs`, `mergeFields.mjs`) + 6 app `index.js` imports.
- 3 schemas (`admin-v3.json`, `admin-app-v3.json`, `admin-engine-v3.json`).
- 6 app manifests (`src/apps/<id>/app.json`).
- 1 shell (`shells/wp-admin-default-v3.json`).
- ~6 test files renamed + extended.
- ~3 doc files updated + 1 new (`docs/dataview-config.md`).

Roughly 30 files total. No new dependencies. No DOM-level changes.

## References

- `docs/research/ciab-primitives-cascade-integration.md` — original C2 design.
- `docs/plans/track-f-entity-crud-migrations.md` — F-track sweep that adopted C2.
- `docs/v3/schema-sketch.md` — v3 reshape that introduced the regression.
- `docs/wp-admin-shell-design-spec.md` §13 #7 — spec entry for view-config / dataView.
- `shells/wp-admin-default.json` lines 234–540 — v2 `viewConfigs` block to port forward.
- `shells/wp-admin-default-v3.json` — current v3 default to rewrite.
- Commits on this branch: `586ade2`, `12ce8dd`, `9be3aa3`, `7980ca7`, `9e6b73a`, `6389449`, `14ed501`, `c945b15`, `8b0948c` — the v3 reshape that this plan partially reverses.
