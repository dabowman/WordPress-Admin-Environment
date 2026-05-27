# `@wordpress/data` primitives

Foundation for everything else. The four canonical stores all use this same machinery; building a custom store uses identical APIs.

## Registering a store

```js
import { createReduxStore, register } from '@wordpress/data';

const DEFAULT_STATE = { items: {}, order: [] };

const store = createReduxStore( 'my-plugin/cart', {
  reducer( state = DEFAULT_STATE, action ) {
    switch ( action.type ) {
      case 'ADD': return {
        ...state,
        items: { ...state.items, [ action.id ]: action.item },
        order: [ ...state.order, action.id ],
      };
      default: return state;
    }
  },
  actions: {
    addItem: ( id, item ) => ( { type: 'ADD', id, item } ),
    // Thunk — preferred over generators
    checkout: () => async ( { select, dispatch } ) => {
      const items = select.getAllItems();
      await apiFetch( { path: '/my/v1/checkout', method: 'POST', data: { items } } );
      dispatch( { type: 'CHECKOUT_DONE' } );
    },
  },
  selectors: {
    getAllItems: ( state ) => state.order.map( id => state.items[ id ] ),
    getItem: ( state, id ) => state.items[ id ],
  },
  resolvers: {
    getItem: ( id ) => async ( { dispatch } ) => {
      const data = await apiFetch( { path: `/my/v1/items/${ id }` } );
      dispatch( { type: 'ADD', id, item: data } );
    },
  },
} );

register( store );
```

**Key facts:**
- Use `createReduxStore` + `register`, not the deprecated `registerStore`.
- Thunks receive `{ select, dispatch, registry, resolveSelect }`. `select` reads current state synchronously; `resolveSelect` returns a Promise that awaits the relevant resolver.
- Resolvers run once per unique selector arg-tuple to populate state from REST/etc; they're invalidated via `invalidateResolution`.

## Reading and dispatching

```js
import { useSelect, useDispatch, select, dispatch, subscribe, createSelector } from '@wordpress/data';

// Hook — subscribes; triggers re-render on relevant state change
const items = useSelect( ( s ) => s( store ).getAllItems(), [] );
const { addItem } = useDispatch( store );

// Imperative — NO subscription. Only in handlers, effects, thunks.
select( store ).getAllItems();
dispatch( store ).addItem( 'x', { name: 'X' } );

// Memoized selector
const getPublished = createSelector(
  ( state ) => state.order.filter( id => state.items[ id ].status === 'publish' ),
  ( state ) => [ state.items, state.order ] // dependency snapshot
);
```

**Rules:**
- Inside `useSelect` mappers return primitives or stable references. Returning a fresh object/array each render causes infinite re-renders.
- `useSelect` dependency array: include every closure-captured value, exclude `select` (stable), `[]` means mapper never changes.

## Resolution state

Every selector with a resolver tracks its own progress:

```js
select( store ).isResolving( 'getItem', [ 42 ] );
select( store ).hasStartedResolution( 'getItem', [ 42 ] );
select( store ).hasFinishedResolution( 'getItem', [ 42 ] );
select( store ).hasResolutionFailed( 'getItem', [ 42 ] );
select( store ).getResolutionError( 'getItem', [ 42 ] );

dispatch( store ).invalidateResolution( 'getItem', [ 42 ] );           // force refetch
dispatch( store ).invalidateResolutionForStoreSelector( 'getItem' );    // all args
dispatch( store ).invalidateResolutionForStore();                       // nuke entire store
```

## Batching and subscription scope

```js
import { useRegistry, subscribe } from '@wordpress/data';

const registry = useRegistry();
registry.batch( () => {
  dispatch( store ).addItem( 'a', { name: 'A' } );
  dispatch( store ).addItem( 'b', { name: 'B' } );
} ); // subscribers fire ONCE

// Scoped subscribe (WP 6.2+) — fires only when the named store changes
const unsubscribe = subscribe( () => { /* ... */ }, 'core/block-editor' );
```

**Why scoped subscribe matters:** during typing, every keystroke dispatches into `core/block-editor`. A global `subscribe(fn)` runs *every time any store anywhere changes*; a scoped one runs only when the named store changes. Orders of magnitude difference.

## Performance patterns

### Memoization

```js
import { createSelector } from '@wordpress/data';

const getVisibleBlocks = createSelector(
  ( state, root ) =>
    state.blocks.order[ root ]?.filter(
      id => ! state.blocks.tree[ id ]?.attributes?.hidden
    ) ?? [],
  ( state, root ) => [ state.blocks.order[ root ], state.blocks.tree ]
);
```

Without the input-selector array, the cache key is "any state change," so the cache invalidates on every dispatch.

### Block tree cost (block-editor store)

| Selector | Cost | Use when |
|---|---|---|
| `getBlockOrder( rootClientId )` | O(children) | Sibling list only |
| `getBlockName( clientId )` | O(1) | Just the type |
| `getBlockAttributes( clientId )` | O(1) | Single block |
| `getBlock( clientId )` | O(subtree) | Block + innerBlocks |
| **`getBlocks()`** | **O(all)** | **Avoid in hot paths** |
| `getClientIdsWithDescendants()` | O(N), cached | Flat id list |

### `useSelect` patterns

```js
// BAD — new object each render → re-renders on every dispatch in any store
const { a, b } = useSelect(
  s => ( { a: s( store ).getA(), b: s( store ).getB() } ),
  []
);

// GOOD — two primitive reads, stable
const a = useSelect( s => s( store ).getA(), [] );
const b = useSelect( s => s( store ).getB(), [] );
```

### `AsyncModeProvider`

```jsx
<AsyncModeProvider value={ true }>
  <ExpensiveList />
</AsyncModeProvider>
```

Descendant `useSelect` updates run via the idle scheduler. `BlockList` uses this internally — it wraps non-selected blocks in async mode while keeping the selected block synchronous. That's how typing stays at 60fps.

### Batching writes + preloading

`registry.batch()` for any multi-dispatch flow. The `block_editor_rest_api_preload_paths` filter for editor-boot hydration (see `rest-integration.md`). Debounce drag/slider/range inputs at 50–150ms before dispatching.

## TypeScript

### Key exports

```ts
import type {
  StoreDescriptor, ReduxStoreConfig, DataRegistry,
  ConfigOf, ActionCreatorsOf, SelectorsOf, CurriedSelectorsOf, AnyConfig,
} from '@wordpress/data';
```

### Typed custom store

```ts
interface State { products: Record<string, Product>; isSaving: boolean; }

const SET_PRICE = 'SET_PRICE' as const;
type Action = { type: typeof SET_PRICE; id: string; price: number };

const actions = {
  setPrice: ( id: string, price: number ): Action => ( { type: SET_PRICE, id, price } ),
  saveAll: () => async ( { dispatch }: { dispatch: any } ) => { /* ... */ },
};
const selectors = {
  getPrice: ( state: State, id: string ): number | undefined => state.products[ id ]?.price,
};

const config = {
  reducer: ( s: State = { products: {}, isSaving: false }, a: Action ): State => s,
  actions, selectors,
} satisfies ReduxStoreConfig<State, typeof actions, typeof selectors>;

export const store: StoreDescriptor<typeof config> = createReduxStore( 'my/prices', config );
register( store );
```

Consuming `useSelect( s => s( store ).getPrice( id ), [ id ] )` then infers `number | undefined`.

### Typing status across packages (WP 7.0)

| Package | Status |
|---|---|
| `@wordpress/data` | Full inference |
| `@wordpress/core-data` | Entities and selectors fully typed |
| `@wordpress/block-editor` | Partial — many selectors `any` |
| `@wordpress/editor` | Partial |
| Private APIs (`lock`/`unlock`) | Typed internally, not exported |

**Idioms:** `as const` on action literals; `satisfies` on store config; export the `StoreDescriptor`, not the string key.

## Side effects and interop

### `subscribe` — global vs scoped

```js
const unsub = subscribe( () => { /* ... */ }, blockEditorStore );
```

Strongly prefer scoped over global.

### Transition detection (used by core for legacy metabox submits)

```js
let wasSaving = false;
subscribe( () => {
  const saving = select( editorStore ).isSavingPost() && ! select( editorStore ).isAutosavingPost();
  if ( wasSaving && ! saving ) { /* save just finished */ }
  wasSaving = saving;
}, editorStore );
```

### Non-React bridges

`@wordpress/data` is UI-agnostic. Vue/Backbone/vanilla DOM all work via `subscribe + select`. Useful for legacy metaboxes — watch `isSavingPost` transitions and submit the hidden form.

### Editor-ready gate

```js
function whenEditorReady() {
  return new Promise( resolve => {
    if ( select( editorStore ).__unstableIsEditorReady() ) return resolve();
    const unsub = subscribe( () => {
      if ( select( editorStore ).__unstableIsEditorReady() ) { unsub(); resolve(); }
    }, editorStore );
  } );
}
```

`__unstableIsEditorReady` remains `__unstable` in 7.0 — gated behind that prefix until a stable equivalent ships.
