# Migration and deprecations

When modernizing a plugin written against pre-6.5 Gutenberg patterns, walk this checklist. Each section gives the legacy pattern, the modern replacement, and (where relevant) the version that introduced the change.

## HOCs → hooks

```jsx
// Before
compose(
  withSelect( s => ( { title: s( 'core/editor' ).getEditedPostAttribute( 'title' ) } ) ),
  withDispatch( d => ( { setTitle: t => d( 'core/editor' ).editPost( { title: t } ) } ) )
)( Panel );

// After
const { title }     = useSelect( s => ( { title: s( editorStore ).getEditedPostAttribute( 'title' ) } ), [] );
const { editPost }  = useDispatch( editorStore );
```

`withSelect` / `withDispatch` / `compose` are not removed but no new code should use them. Hooks compose better, type better, and avoid re-render storms from object-identity changes.

## `select()` in render → `useSelect`

```jsx
// Before — no subscription, goes stale
function Title() {
  const t = select( editorStore ).getEditedPostAttribute( 'title' );
  return <h1>{ t }</h1>;
}

// After
function Title() {
  const t = useSelect( s => s( editorStore ).getEditedPostAttribute( 'title' ), [] );
  return <h1>{ t }</h1>;
}
```

## `registerStore` → `createReduxStore` + `register`

```js
// Before
import { registerStore } from '@wordpress/data';
registerStore( 'td/demo', { reducer, actions, selectors, resolvers } );

// After
import { createReduxStore, register } from '@wordpress/data';
const store = createReduxStore( 'td/demo', { reducer, actions, selectors, resolvers } );
export { store };
register( store );
```

Exporting the descriptor enables TypeScript inference everywhere — `useSelect( s => s( store ).getX() )`, `useDispatch( store )`. Strings still work, but lose typing.

## Generators + `@wordpress/data-controls` → thunks

```js
// Before — generator + the deprecated controls package
function* fetchAndStore( id ) {
  const raw = yield apiFetch( { path: `/td/v1/items/${ id }` } );
  yield controls.dispatch( 'td/demo', 'receive', id, raw );
}

// After — async thunk
const fetchAndStore = ( id ) => async ( { dispatch } ) => {
  const raw = await apiFetch( { path: `/td/v1/items/${ id }` } );
  dispatch.receive( id, raw );
};
```

The `@wordpress/data-controls` package is deprecated. Async thunks receive `{ select, dispatch, registry, resolveSelect }` and integrate with TS naturally.

## `source: 'meta'` → block bindings (6.5)

The legacy meta attribute source wrote through post meta on every `setAttributes`, bypassing sanitization, conflicting with undo, and racing REST saves.

```json
// Pre-6.5 — REMOVED
{ "attributes": { "author": { "type": "string", "source": "meta", "meta": "book_author" } } }
```

```html
<!-- After 6.5 — declare a normal attribute and bind in markup -->
<!-- wp:td/book-author {"metadata":{"bindings":{
  "author":{"source":"core/post-meta","args":{"key":"book_author"}}
}}} /-->
```

For existing content, supply a `deprecated` array entry mapping the old attribute shape to the new `metadata.bindings` structure.

## `@wordpress/edit-post` / `edit-site` → `@wordpress/editor` (6.5/6.6)

```js
// Before
import { PluginSidebar } from '@wordpress/edit-post';

// After
import {
  PluginSidebar,
  PluginDocumentSettingPanel,
  PluginPrePublishPanel,
  store as editorStore,
} from '@wordpress/editor';
```

The post and site editors unified at `@wordpress/editor`. Slotfills moved with them.

## `core/edit-post` feature toggles → `core/preferences` (6.3)

```js
// Before
wp.data.dispatch( 'core/edit-post' ).toggleFeature( 'fixedToolbar' );

// After
wp.data.dispatch( 'core/preferences' ).toggle( 'core', 'fixedToolbar' );
```

Preferences are namespaced and persisted; feature toggles were ad-hoc per-store flags.

## `core/editor` deprecations (6.0–6.1)

- `refreshPost` → `invalidateResolution`.
- `resetPost` / `updatePost` → removed; use `editEntityRecord` on `core`.
- `createUndoLevel` moved to `core` (`__unstableCreateUndoLevel`).

## `core-data` deprecations

| Old | New |
|---|---|
| `getAuthors` | `getUsers( { who: 'authors' } )` |
| `getEntity` | `getEntityConfig` |
| `getEntitiesByKind` | `getEntitiesConfig( kind )` |
| `receiveThemeSupports` | (on theme entity) |
| `receiveUploadPermissions` | `canUser( 'create', 'media' )` |
| `canUserEditEntityRecord` (6.7) | `canUser( 'update', { kind, name, id } )` |

## Per-release timeline

- **6.5** (Apr 2024): Block bindings experimental; `@wordpress/sync` introduced; `useSetting` → `useSettings`; `meta` attribute source removed; `rich-text` source added; post/site editor unified at `@wordpress/editor`.
- **6.6** (Jul 2024): Block bindings stable; pattern overrides stable; DataViews stable; slotfills unified on `@wordpress/editor`.
- **6.7** (Nov 2024): `register_block_bindings_source` stable; `canUser` object form canonical; `canUserEditEntityRecord` soft-deprecated; zoom-out stable.
- **6.8** (Apr 2025): Template registration via `block.json`; Block Hooks stable; Section Blocks; `isCaretWithinFormattedText` deprecated.
- **7.0** (Apr 2026): Gutenberg 22.x; `__unstableSaveReusableBlock` deprecated; `canInsertBlockType` relaxes `contentOnly` for `role:"content"` blocks; `@wordpress/sync` stabilized as a package (experimental API); real-time collaboration opt-in via `sync.providers` filter.

## A migration checklist

For an old plugin you're modernizing, search for and replace each of these:

1. `withSelect` / `withDispatch` / `compose` → hooks.
2. `select(` at the top of any component body (no `useSelect` wrapper) → `useSelect`.
3. `registerStore` → `createReduxStore` + `register`.
4. Generators returning yielded actions / `@wordpress/data-controls` → async thunks.
5. `"source": "meta"` in any `block.json` → block bindings + `deprecated` migration.
6. `@wordpress/edit-post` / `@wordpress/edit-site` imports → `@wordpress/editor`.
7. `core/edit-post`.toggleFeature → `core/preferences`.toggle.
8. Positional `canUser( action, resource, id )` → `canUser( action, { kind, name, id } )`.
9. `canUserEditEntityRecord` → `canUser( 'update', { kind, name, id } )`.
10. Hand-rolled `BlockEditorProvider` for posts/templates → `useEntityBlockEditor`.
