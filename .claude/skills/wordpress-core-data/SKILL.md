---
name: wordpress-core-data
description: WordPress data layer development — `@wordpress/data` stores, `@wordpress/core-data` entities, block bindings, REST integration, undo/redo, and async patterns (WP 6.5+; current stable: 6.9.4, March 11, 2026; 7.0 in RC as of late March 2026). MUST load before making claims about `useSelect`/`useDispatch`/`useEntityRecord`/`useEntityProp`/`useEntityBlockEditor`, custom Redux stores via `createReduxStore`, `register_block_bindings_source` / `registerBlockBindingsSource`, `editEntityRecord` / `saveEditedEntityRecord` / `saveEntityRecord` / `deleteEntityRecord`, `register_post_meta` with `show_in_rest`, `apiFetch` middleware, the `/batch/v1` endpoint, `block_editor_rest_api_preload_paths`, `BlockEditorProvider` `onInput` vs `onChange`, `core-data` undo stack, `canUser`, the four canonical stores (`core` / `core/editor` / `core/block-editor` / `core/preferences`), or migrating from `withSelect`/`withDispatch`/`registerStore`/`source:'meta'` — WordPress ships twice yearly and training data goes stale within months. Use whenever working with state in Gutenberg/the block editor, reading or writing post/page/template/site/taxonomy/user/media/global-styles/navigation entities from JS, wiring custom data sources to blocks via bindings, building sidebar plugins or pre-publish panels, or fixing `useSelect` infinite loops, `null`-forever entity records, mutating-state bugs, save-lock issues, or stale resolvers. Also trigger on mentions of "Redux store" + Gutenberg, "block bindings", "post meta in editor", "core-data", "useEntityRecord", "saveEditedEntityRecord", "registry.batch", "scoped subscribe", "AsyncModeProvider", "Yjs/CRDT/realtime collaboration in Gutenberg", or any `wp.data.*` console call.
---

# WordPress Core Data Layer

State management for Gutenberg and the WordPress block editor (WP 6.5+; current stable: 6.9.4, March 11, 2026; 7.0 in Release Candidate, GA pending). Covers `@wordpress/data` primitives, `@wordpress/core-data` entities, block bindings, REST integration, and the migration trail away from HOCs / generators / `source:'meta'`.

## ⚠ Verify before asserting

WordPress ships twice yearly. Before making a *negative* claim ("X selector doesn't exist", "Y action is unsupported"), check the live source — do not rely on training data:

| Surface | Live source |
|---|---|
| `@wordpress/data` & `core-data` package APIs | `https://github.com/WordPress/gutenberg/tree/trunk/packages` |
| REST API reference | `https://developer.wordpress.org/rest-api/reference/` |
| Block bindings handbook | `https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/` |
| Per-release dev-notes | `https://make.wordpress.org/core/tag/dev-notes/` |
| `block.json` schema | `https://schemas.wp.org/trunk/block.json` |

A positive claim sourced from a reference file in this skill is fine.

## The four canonical stores

| Store | Package | Owns | Common APIs |
|---|---|---|---|
| `core` | `@wordpress/core-data` | REST-backed entities, undo/redo, `canUser` cache | `getEntityRecord`, `saveEditedEntityRecord`, `editEntityRecord`, `undo`, `canUser` |
| `core/editor` | `@wordpress/editor` | Current post session, save lock, autosave (unified post/site editor 6.5+) | `getCurrentPostId`, `isSavingPost`, `lockPostSaving`, `autosave` |
| `core/block-editor` | `@wordpress/block-editor` | Canvas: block tree, selection, insertability, editing modes | `getBlocks`, `canInsertBlockType`, `updateBlockAttributes`, `setBlockEditingMode` |
| `core/preferences` | `@wordpress/preferences` | Persisted user prefs (replaced `core/edit-post`/`core/edit-site` toggles in 6.3) | `get`, `set`, `toggle` |

The two stores most commonly confused — `core` vs `core/editor` — split cleanly: **`core` owns entities and their undo history; `core/editor` owns the current session.**

## Data flow law

User action → React handler → `dispatch` → reducer + (optional thunk) → state updated → `subscribe` fires → `useSelect` mappers re-run → React re-renders. Persistent saves go through `saveEditedEntityRecord`, which hits REST (auto-batched), merges the response into the cache, and invalidates dependent resolvers.

## Quick route — what to load

| Task | Reference |
|---|---|
| Custom Redux store: `createReduxStore`, thunks, resolvers, `useSelect`/`useDispatch`, `createSelector`, batching, scoped `subscribe`, perf, TS types | `references/data-primitives.md` |
| Read/write entities (posts, pages, templates, users, media, site, taxonomies); `useEntityRecord`/`useEntityRecords`/`useEntityProp`/`useEntityBlockEditor`; custom non-CPT entities; `canUser` permissions | `references/core-data-entities.md` |
| Declaring block attributes — `type`, `source` (incl. `rich-text`), `selector`, `query`, `role:"content"`/`"local"`, static `save()` vs dynamic `render.php`, `register_post_meta` for editor binding | `references/block-attributes.md` |
| Block Bindings API — `core/post-meta` / `core/post-data` / `core/term-data` / `core/pattern-overrides`; PHP `register_block_bindings_source`; JS `registerBlockBindingsSource`; `useBlockBindingsUtils`; bindable attribute matrix | `references/block-bindings.md` |
| `apiFetch` + middleware, `register_rest_route`, `register_rest_field`, `/batch/v1`, `block_editor_rest_api_preload_paths`, `_fields`/`_embed`/`context`, error shape | `references/rest-integration.md` |
| `core/block-editor` selectors and actions, `BlockEditorProvider` (`onInput` vs `onChange`), block context (`providesContext`/`usesContext`), template locks + `lock` attribute, editing modes | `references/block-editor-store.md` |
| Undo/redo on `core-data`, transient vs persistent edits (`isCached`/`undoIgnore`), `__unstableCreateUndoLevel`, `registry.batch`, async data patterns (`isResolving`, debounce, Suspense, abort, invalidation), `_fields`/`context`/`_embed` recipes | `references/undo-persistence.md` |
| Real-time collaboration (WP 7.0 experimental): `@wordpress/sync`, Yjs CRDT, `sync.providers` filter, leader-elected REST writes, awareness/presence | `references/collaboration.md` |
| Common pitfalls (15 footguns): `useSelect` loops, mutated state, resolver loops, `null`-forever, save-lock bugs, missing `show_in_rest`, `_fields` without id, `canUser` undefined-vs-false | `references/pitfalls.md` |
| Migration: HOCs → hooks, `select()` in render → `useSelect`, `registerStore` → `createReduxStore`, generators+controls → thunks, `source:'meta'` → bindings, `@wordpress/edit-post`/`edit-site` → `@wordpress/editor`, `core/edit-post` toggles → `core/preferences` | `references/migration.md` |

## Decision tree

1. **Reading or writing post / page / template / site / taxonomy / user / media data?** → entity-store work, load `core-data-entities.md`.
2. **Custom plugin needs its own state shared across components?** → `data-primitives.md` (custom store via `createReduxStore`).
3. **Need a block attribute to display data from outside the block (post meta, taxonomy, custom source)?** → `block-bindings.md` first; declare a normal attribute and bind via `metadata.bindings`. Do NOT use `source:'meta'` (removed in 6.5).
4. **Building a sidebar plugin / pre-publish panel / save-lock?** → `core-data-entities.md` (entities + `useEntityProp`) plus the `editorStore` recipes in `block-editor-store.md`.
5. **Hand-writing `BlockEditorProvider`?** → don't, unless you must. Use `useEntityBlockEditor` (see `core-data-entities.md`) — it routes `onInput`/`onChange` through `editEntityRecord` correctly.
6. **Editor performance problem (typing lag, refetch storms)?** → `data-primitives.md` (`createSelector`, `AsyncModeProvider`, `registry.batch`, scoped `subscribe`) and `pitfalls.md`.
7. **Custom REST endpoint or batch operation?** → `rest-integration.md`. Prefer `register_post_meta` with `show_in_rest` over `register_rest_field` for plain scalar meta.
8. **Migrating an old plugin (uses `withSelect` / `registerStore` / `source:'meta'` / `core/edit-post` toggles)?** → `migration.md`.

## Cross-skill boundaries

| Need | Skill |
|---|---|
| Custom block scaffolding (`block.json`, `edit`/`save`, supports, deprecation) | `wordpress-blocks` |
| Plugin shell (headers, activation, CPT registration, security, wp.org) | `wordpress-plugin-development` |
| Frontend interactivity directives, Interactivity API stores | `wordpress-interactivity` |
| HTTP-only consumption of WordPress (headless, automation) outside the editor | `wordpress-rest-api` |
| theme.json fields, block themes, FSE | `wordpress-block-themes` |
| Authoring serialized block markup (content, not code) | `wordpress-block-markup` |

This skill owns the *editor-side data layer*. CPT/meta *registration* lives in `wordpress-plugin-development`; block attributes *declaration* in `wordpress-blocks`. When a task crosses both, load the relevant pair.

## Highest-leverage rules

1. **Entities over ad-hoc REST.** If WordPress already exposes a collection (any CPT with `show_in_rest:true`, plus the `root/*` entities), use `useEntityRecord`/`useEntityRecords` — never roll your own `apiFetch` cache.
2. **Block bindings over custom meta plumbing.** Bind a normal block attribute to `core/post-meta`; don't push attribute changes into meta yourself.
3. **`useEntityBlockEditor` over hand-rolled `BlockEditorProvider` wiring.** It threads `editEntityRecord` through transient/persistent edits and undo automatically.
4. **Thunks over generators.** Generators with `@wordpress/data-controls` are deprecated; async thunks (`( arg ) => async ({ dispatch, select }) => …`) are the modern path.
5. **`useSelect` for render reads, `select()` only in handlers/effects/thunks.** A bare `select(store).get…()` at the top of a component does not subscribe — it goes stale.
6. **`useMemo` query objects, primitives in `useSelect` mappers.** Inline query literals refetch every render; mapper objects re-render every dispatch.
7. **`canUser`: tri-state.** `undefined` = still resolving, `true` / `false` are real. Compare strictly.
8. **`_fields` MUST include `id`** — the entity key — or core-data's cache cannot index the response.
9. **`registry.batch()`** for any flow that dispatches more than once. Suspends subscribers; one re-render instead of N.
10. **Scoped `subscribe(fn, store)`** is orders of magnitude cheaper than the global `subscribe(fn)` during typing.

## Quick-reference snippets

### Read + edit + save an entity
```js
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';

const [ title, setTitle ] = useEntityProp( 'postType', 'post', 'title', postId );
const { saveEditedEntityRecord } = useDispatch( coreStore );
// later: await saveEditedEntityRecord( 'postType', 'post', postId );
```

### Read a collection with projection
```js
const query = useMemo(
  () => ( { per_page: 20, _fields: 'id,title,meta', context: 'edit' } ),
  []
);
const { records, hasResolved } = useEntityRecords( 'postType', 'book', query );
```

### Bind a heading to post meta
```html
<!-- wp:heading {"metadata":{"bindings":{
  "content":{"source":"core/post-meta","args":{"key":"hero_headline"}}
}}} /-->
```

### Custom store (modern shape)
```js
const store = createReduxStore( 'td/cart', {
  reducer, actions, selectors,
  resolvers: {
    getItem: ( id ) => async ( { dispatch } ) => {
      const data = await apiFetch( { path: `/td/v1/items/${ id }` } );
      dispatch( { type: 'RECEIVE', id, item: data } );
    },
  },
} );
register( store );
```

### Permission probe (tri-state!)
```js
const canEdit = useSelect(
  s => s( coreStore ).canUser( 'update', { kind: 'postType', name: 'post', id } ),
  [ id ]
);
if ( canEdit === undefined ) return <Spinner />;
if ( canEdit === false ) return null;
```

For deeper dives, follow the **Quick route** table above.

## Version notes

- **WP 7.0 (April 2026):** `@wordpress/sync` ships as a stable package (experimental API surface); `canInsertBlockType` relaxes `contentOnly` for `role:"content"` blocks; `core/post-data` / `core/term-data` block-binding sources; `__unstableSaveReusableBlock` deprecated.
- **WP 6.7 (Nov 2024):** `register_block_bindings_source` stable; **`registerBlockBindingsSource` (JS) public**; `useBlockBindingsUtils` public; `canUser` object form canonical; `role` stable.
- **WP 6.6 (Jul 2024):** Block bindings stable; pattern overrides stable; DataViews stable; slotfills unified on `@wordpress/editor`.
- **WP 6.5 (Apr 2024):** Block bindings merged; `source:'meta'` removed; `rich-text` source added; `@wordpress/sync` introduced; post/site editor unified at `@wordpress/editor`; `useSetting` → `useSettings`.
- **WP 6.3:** `core/edit-post` / `core/edit-site` feature toggles → `core/preferences`.
