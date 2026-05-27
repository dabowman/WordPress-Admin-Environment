# `core/block-editor` store, block context, locking

The block-editor store owns the canvas: block tree, selection, insertion rules, editing modes. **It does not own undo** — that's `core` since 6.5+.

## Key selectors

| Selector | Purpose |
|---|---|
| `getBlocks( rootClientId? )` | Full subtree — O(all). Avoid in hot paths. |
| `getBlockOrder( rootClientId )` | Ordered child client IDs — O(children) |
| `getBlockName( clientId )` | Block type name — O(1) |
| `getBlockAttributes( clientId )` | Attributes — O(1) |
| `getBlock( clientId )` | Block + inner blocks — O(subtree) |
| `getClientIdsWithDescendants()` | Flat list, cached |
| `getSelectedBlockClientId()` / `getSelectionStart/End()` | Selection state |
| `canInsertBlockType( name, rootClientId )` | Honors parent / ancestor / `allowedBlocks` / `templateLock` |
| `canMoveBlock( clientId )` / `canRemoveBlock` / `canEditBlock` | Honors per-instance `lock` attribute |
| `getBlockEditingMode( clientId )` | `'default'` / `'contentOnly'` / `'disabled'` |

## Key actions

`insertBlocks`, `insertBlock`, `removeBlock(s)`, `moveBlocksDown` / `Up`, `updateBlockAttributes`, `replaceBlock(s)`, `selectBlock`, `resetBlocks`, `setBlockEditingMode` / `unsetBlockEditingMode`.

The `__unstable` persistence markers — `__unstableMarkNextChangeAsNotPersistent`, `__unstableMarkLastChangeAsPersistent`, `__unstableMarkAutomaticChange` — operate on the older `core/block-editor` history. Only needed in the widgets screen, isolated editors, or when you need to avoid block-editor-local undo pollution. **For post-editor work, prefer `editEntityRecord` options (`isCached`, `undoIgnore`)** instead.

## `BlockEditorProvider`: `onInput` vs `onChange`

```jsx
<BlockEditorProvider
  value={ blocks }
  onInput={ next => editEntityRecord( kind, name, id, { blocks: next }, { isCached: true } ) }
  onChange={ next => {
    registry.batch( () => {
      editEntityRecord( kind, name, id, { blocks: next } );
      __unstableCreateUndoLevel( kind, name, id );
    } );
  } }
/>
```

- `onInput` — transient changes (keystrokes inside RichText). Don't flip the dirty flag, don't split undo levels. Mark as `isCached`.
- `onChange` — persistent changes (blur, attribute toggle, block insertion/removal). Flip dirty, push an undo level.

In the post editor, `useEntityBlockEditor` wraps this wiring and routes both callbacks through `editEntityRecord` for you. Use it instead of hand-rolling `BlockEditorProvider`:

```js
const [ blocks, onInput, onChange ] = useEntityBlockEditor(
  'postType', 'wp_template_part', { id }
);
```

## Block Context API

Context is a declarative inheritance channel: ancestors *provide* values from their attributes; descendants *consume* by name. Declared in `block.json`:

```json
// Provider
{
  "attributes": { "recordId": { "type": "number" } },
  "providesContext": { "my-plugin/recordId": "recordId" }
}

// Consumer
{ "usesContext": [ "my-plugin/recordId", "postId", "postType" ] }
```

Access:

| Place | Available? | How |
|---|---|---|
| `Edit` component | Yes | `props.context['my-plugin/recordId']` |
| Static `save()` | **No** — runs at serialization with `(attributes, innerBlocks)` only. If rendering depends on context, make the block dynamic. |
| `render.php` | Yes | `$block->context['postId']` |

**Differences from React Context:**
- Declarative (static `block.json`).
- Scoped to block tree, not React tree.
- Sourced from block attributes.
- Works server-side.
- Namespaced by convention (`ns/name`).
- Flows through `InnerBlocks` and `useInnerBlocksProps` automatically.

**Common core contexts:** `postId`, `postType`, `queryId`, `query`, `queryContext`, `termId`, `taxonomy`, `pattern/overrides`, `commentId`.

Override at an editor boundary:

```jsx
<BlockContextProvider value={ { postId: 42 } }>
  <Children />
</BlockContextProvider>
```

## Block locking and editing modes

Two layers, frequently confused:

- **Editing mode** — per-client-ID UI state (`default` / `contentOnly` / `disabled`). Not persisted.
- **Template lock + per-instance `lock` attribute** — declarative, persisted, constrains insert/move/remove/edit.

### Editing mode API

```js
import { useBlockEditingMode } from '@wordpress/block-editor';

// Declarative — set for component lifetime, unsets on unmount
useBlockEditingMode( 'disabled' );

// Read current effective mode
const mode = useBlockEditingMode();

// Imperative
dispatch( blockEditorStore ).setBlockEditingMode( clientId, 'contentOnly' );
dispatch( blockEditorStore ).unsetBlockEditingMode( clientId );
```

### `templateLock` values

| Value | Insert | Remove | Move | Edit |
|---|---|---|---|---|
| `'all'` | ✗ | ✗ | ✗ | ✓ |
| `'insert'` | ✗ | ✗ | ✓ | ✓ |
| `'contentOnly'` | ✗* | ✗ | ✗ | Only `role:"content"` attrs |
| `'noContent'` | ✗ | ✗ | ✗ | ✗ |
| `false` | ✓ | ✓ | ✓ | ✓ (explicit unlock) |
| `undefined` | inherit | inherit | inherit | inherit |

*WP 7.0 relaxation: under `contentOnly`, `canInsertBlockType` now allows inserting blocks that have at least one `role:"content"` attribute.

`contentOnly` is **not overridable** by descendants. It derives `disabled` for blocks without content attributes.

### Per-instance `lock` attribute

```html
<!-- wp:column { "lock": { "move": true, "remove": true, "edit": false } } -->
```

Shape: `{ move?: boolean; remove?: boolean; edit?: boolean }`. Honored by `canMoveBlock`, `canRemoveBlock`, `canEditBlock`.

### Pattern overrides + contentOnly

Synced-pattern wrappers apply `contentOnly` internally. Inner blocks with `core/pattern-overrides` bindings stay editable (the binding's `canUserEditValue` returns true); other inner blocks lock to the template. See `block-bindings.md` for the binding side.

## Editor session APIs (`core/editor`)

Companion store for the post session:

```js
import { store as editorStore } from '@wordpress/editor';

// Reads
const id    = useSelect( s => s( editorStore ).getCurrentPostId(),   [] );
const type  = useSelect( s => s( editorStore ).getCurrentPostType(), [] );
const dirty = useSelect( s => s( editorStore ).isEditedPostDirty(),  [] );

// Save lock — gate publish on validation
const { lockPostSaving, unlockPostSaving } = useDispatch( editorStore );
lockPostSaving( 'td/requires-category' );
unlockPostSaving( 'td/requires-category' );

// Autosave
await dispatch( editorStore ).autosave();
const latest = select( coreStore ).getAutosave( 'post', postId, userId );

// Pause autosaves during modal edits
lockPostAutosaving( 'td/modal' );
unlockPostAutosaving( 'td/modal' );
```

## Inserter restrictions

```php
add_filter( 'allowed_block_types_all', function ( $allowed, $ctx ) {
  if ( 'portfolio' === $ctx->post?->post_type ) {
    return array( 'core/heading', 'core/image', 'td/portfolio-grid' );
  }
  return $allowed;
}, 10, 2 );
```
