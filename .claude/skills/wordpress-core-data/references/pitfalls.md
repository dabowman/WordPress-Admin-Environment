# Common pitfalls

The 15 footguns that account for most data-layer bugs in Gutenberg plugins.

## 1. `useSelect` infinite loops

**Symptom:** warning *"`useSelect` returns different values with same state"*.
**Cause:** mapper returns a new object/array identity each render.
**Fix:** return primitives, or memoize the derivation with `useMemo`, or move the derivation server-side via `createSelector` on the store.

```js
// BAD
const { a, b } = useSelect( s => ( { a: s( store ).getA(), b: s( store ).getB() } ), [] );

// GOOD
const a = useSelect( s => s( store ).getA(), [] );
const b = useSelect( s => s( store ).getB(), [] );
```

## 2. Mutating state

**Cause:** `state.items.push(…)` in a reducer — Redux sees the same reference and skips subscribers.
**Fix:** return a new object/array via spread.

## 3. Resolver loops

**Cause:** a resolver calls a selector that triggers the same resolver, often via `resolveSelect`.
**Fix:** inside resolvers use `select` (not `resolveSelect`) and dispatch concrete `receive*` actions.

## 4. Stale selectors

**Cause:** `select( store ).getX()` at the top of a component render — no subscription.
**Fix:** `useSelect` for render reads; reserve `select()` for handlers, effects, thunks.

## 5. Forgetting `show_in_rest` for CPT

**Symptom:** `useEntityRecords( 'postType', 'mycpt', … )` returns `null` forever.
**Fix:** `'show_in_rest' => true` in `register_post_type`. Optionally `rest_base`.

## 6. Meta not editable

**Causes:**
- Missing `show_in_rest`.
- Missing `auth_callback` on a protected (`_`-prefixed) key.
- Schema missing for object/array meta.

**Fix:** register properly:
```php
register_post_meta( 'post', '_x', array(
  'type' => 'string', 'single' => true, 'show_in_rest' => true,
  'auth_callback' => fn() => current_user_can( 'edit_posts' ),
) );
```

## 7. Over-dispatching

**Symptom:** typing freezes the editor.
**Fix:**
- `useDebounce` slider/range/search inputs at 50–150ms.
- `registry.batch()` for multi-dispatch flows.
- Mark non-dirty-flipping updates with `editEntityRecord(..., { isCached: true })`.

## 8. Wrong store namespace

| Store | Contains | Key APIs |
|---|---|---|
| `core` | Entities, users, settings, caps | `getEntityRecord`, `saveEditedEntityRecord`, `canUser`, `undo` |
| `core/editor` | Current post, save lock, autosave | `getCurrentPostId`, `isSavingPost`, `lockPostSaving`, `autosave` |
| `core/block-editor` | Canvas, blocks, selection | `getBlocks`, `canInsertBlockType`, `updateBlockAttributes` |
| `core/edit-post` | Post-editor UI chrome (legacy) | mostly deprecated → `core/preferences` |
| `core/edit-site` | Site-editor UI (legacy) | mostly unified into `core/editor` 6.5+ |
| `core/preferences` | Persisted prefs (6.3+) | `get`, `set`, `toggle` |
| `core/interface` | Complementary areas | `enableComplementaryArea` |
| `core/notices` | Snack/regular notices | `createNotice` |

`isSavingPost` is **`core/editor`**, not `core`. `getEntityRecord` is **`core`**, not `core/editor`. Mixing them up is the most common store-namespace bug.

## 9. `_fields` without id

**Cause:** `_fields: 'title'` — core-data can't index without the entity key.
**Fix:** always include `id`: `_fields: 'id,title'`.

## 10. New query object each render

**Symptom:** records refetch on every render; flicker.
**Fix:** `useMemo` the query:
```js
const query = useMemo( () => ( { per_page: 10, author } ), [ author ] );
```

## 11. Transient vs persistent edits — wrong choice

**Cause:** programmatic UI-only changes flip the dirty flag; user-initiated content gets `undoIgnore`.
**Fix:**
- Programmatic / hydration → `editEntityRecord(..., { undoIgnore: true })`.
- User-initiated content → default `editEntityRecord` (persistent).
- Keystrokes routed through `onInput` → `{ isCached: true }`.

## 12. Selector returns `null` forever despite a 200

**Causes:**
- `_fields` missing the entity key.
- `context: 'edit'` needed but not requested (private fields hidden in `view`).
- 403 coerced to "missing."

**Fix:** verify fields, set `context: 'edit'`, `invalidateResolution` to refetch.

## 13. `useSelect` mapper returns a function

**Cause:** `useSelect( s => s( store ).getX )` — forgot to invoke.
**Fix:** `useSelect( s => s( store ).getX(), [] )`.

## 14. `select()` in render outside `useSelect`

**Cause:** helpers calling `select()` imperatively during render.
**Fix:** route all render-time reads through `useSelect`. The helpers themselves should accept the values as arguments.

## 15. `canUser` undefined treated as false

**Symptom:** UI flashes "denied" before the permission resolves, then suddenly enables.
**Fix:** compare strictly:
```js
if ( canEdit === undefined ) return <Spinner />;
if ( canEdit === false )     return null;
// canEdit === true
```

## Resolver introspection — debugging the above

```js
wp.data.select( 'core' ).getCachedResolvers();
wp.data.select( 'core' ).hasResolutionFailed( 'getEntityRecord', [ 'postType', 'post', 42 ] );
wp.data.select( 'core' ).getResolutionError(  'getEntityRecord', [ 'postType', 'post', 42 ] );
```

Common resolution failures:
- Missing `show_in_rest: true`.
- Stale nonce (`rest_cookie_invalid_nonce` — inspect `window.wpApiSettings.nonce`).
- `context=edit` needed but not requested.
- `rest_post_invalid_id`.
