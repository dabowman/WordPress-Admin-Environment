# Undo/redo and async data patterns

## Modern undo lives in `core-data`

Modern undo is owned by **`core-data`**, not `core/block-editor`. Every post/template edit flows through `editEntityRecord`, and the undo stack is **global across entities**: editing a post title then a template-part's blocks, Ctrl+Z reverts the template-part first.

```js
import { store as coreStore } from '@wordpress/core-data';

dispatch( coreStore ).undo();
dispatch( coreStore ).redo();
select(   coreStore ).hasUndo();
select(   coreStore ).hasRedo();
dispatch( coreStore ).__unstableCreateUndoLevel( 'postType', 'post', postId ); // __unstable
```

## Transient vs persistent edits

Entity config declares `transientEdits` (e.g. `{ blocks: true, selection: true }` for posts). Transient edits don't split the undo stack or flip the dirty flag; persistent ones do.

```js
// Persistent (default) — splits undo, flips dirty
editEntityRecord( 'postType', 'post', id, { title: 'New' } );

// Transient — no undo split, no dirty flag (use for keystrokes routed through onInput)
editEntityRecord( 'postType', 'post', id, { blocks: next }, { isCached: true } );

// Skipped from undo entirely — for hydration, migrations, programmatic UI fixes
editEntityRecord( 'postType', 'post', id, { meta: hydrated }, { undoIgnore: true } );
```

## `onInput` vs `onChange`

This is the canonical pairing — keystrokes vs semantic boundaries:

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

`useEntityBlockEditor` wires this automatically — prefer it.

## Legacy block-editor markers

`__unstableMarkNextChangeAsNotPersistent`, `__unstableMarkLastChangeAsPersistent`, `__unstableMarkAutomaticChange` operate on the older `core/block-editor` history. Only needed in the widgets screen, isolated editors, or when avoiding block-editor-local undo pollution.

## `registry.batch()`

Suspends subscribers for the callback; they fire once after. Critical for perf and for atomic undo levels across multiple dispatches.

```js
registry.batch( () => {
  editEntityRecord( kind, name, id, { title: t } );
  editEntityRecord( kind, name, id, { excerpt: e } );
  __unstableCreateUndoLevel( kind, name, id );
} );
```

## Async data-fetching patterns

### Loading states

```js
const { records, isResolving, hasResolved, status } =
  useEntityRecords( 'postType', 'post', query, { enabled: !! postTypeReady } );

if ( status === 'ERROR' )  return <Error />;
if ( ! hasResolved )       return <Spinner />;
```

`options.enabled: false` skips resolution entirely — useful when a dependent value isn't ready.

### Debouncing and pagination

```js
import { useDebounce } from '@wordpress/compose';

const search = useDebounce( rawSearch, 300 );
const query = useMemo(
  () => ( { per_page: 10, search, page, _fields: 'id,title' } ),
  [ search, page ]
);
const { records, totalPages, totalItems } = useEntityRecords( 'postType', 'post', query );
```

**Always `useMemo` the query object** — inline literals refetch every render.

### `_fields`, `context`, `_embed`

- `_fields` — projection. **MUST include `id`** (the entity key) or caching breaks.
- `context=view` (default, public) vs `context=edit` (authenticated; includes `content.raw`).
- `_embed=author,wp:featuredmedia` — inlines related resources under `_embedded` in one round trip; include `_links,_embedded` in `_fields` to preserve.

### 404 / unresolved semantics

- `record === null` → unresolved.
- `record === undefined` → resolved, missing (404 / deleted / 403 coerced).
- `record` object → loaded.

### Suspense

```jsx
import { useSuspenseSelect } from '@wordpress/data';

function Title( { id } ) {
  const rec = useSuspenseSelect(
    s => s( coreStore ).getEntityRecord( 'postType', 'post', id ),
    [ id ]
  );
  return <h1>{ rec.title.rendered }</h1>;
}

<ErrorBoundary fallback={ <Err /> }>
  <Suspense fallback={ <Spinner /> }>
    <Title id={ 42 } />
  </Suspense>
</ErrorBoundary>
```

### Aborting and invalidation

```js
const ctrl = new AbortController();
apiFetch( { path: '/...', signal: ctrl.signal } );
ctrl.abort();

dispatch( 'core' ).invalidateResolution( 'getEntityRecord', [ 'postType', 'post', 42 ] );
dispatch( 'core' ).invalidateResolutionForStoreSelector( 'getEntityRecords' );
```

## Recipes

### Save post meta from a sidebar

```jsx
import { registerPlugin } from '@wordpress/plugins';
import { PluginSidebar, PluginSidebarMoreMenuItem, store as editorStore } from '@wordpress/editor';
import { useEntityProp, store as coreStore } from '@wordpress/core-data';
import { useSelect, useDispatch } from '@wordpress/data';
import { PanelBody, TextControl, Button } from '@wordpress/components';
import { starFilled } from '@wordpress/icons';

function Sidebar() {
  const { postId, postType } = useSelect( s => ( {
    postId:   s( editorStore ).getCurrentPostId(),
    postType: s( editorStore ).getCurrentPostType(),
  } ), [] );
  const [ meta = {}, setMeta ] = useEntityProp( 'postType', postType, 'meta', postId );
  const { saveEditedEntityRecord } = useDispatch( coreStore );
  return (
    <>
      <PluginSidebarMoreMenuItem target="td-seo" icon={ starFilled }>SEO</PluginSidebarMoreMenuItem>
      <PluginSidebar name="td-seo" title="SEO" icon={ starFilled }>
        <PanelBody title="Search appearance">
          <TextControl
            label="SEO title"
            value={ meta._td_seo_title ?? '' }
            onChange={ v => setMeta( { ...meta, _td_seo_title: v } ) }
          />
          <Button
            variant="primary"
            onClick={ () => saveEditedEntityRecord( 'postType', postType, postId ) }
          >
            Save
          </Button>
        </PanelBody>
      </PluginSidebar>
    </>
  );
}
registerPlugin( 'td-seo', { render: Sidebar, icon: starFilled } );
```

### Pre-publish validation with save-lock

```jsx
import { PluginPrePublishPanel } from '@wordpress/editor';
import { Notice } from '@wordpress/components';

function Checks() {
  const { title, featured } = useSelect( s => ( {
    title:    s( editorStore ).getEditedPostAttribute( 'title' ),
    featured: s( editorStore ).getEditedPostAttribute( 'featured_media' ),
  } ), [] );
  const { lockPostSaving, unlockPostSaving } = useDispatch( editorStore );
  const problems = [];
  if ( ! title?.trim() ) problems.push( 'Title required.' );
  if ( ! featured )      problems.push( 'Featured image missing.' );
  useEffect( () => {
    if ( problems.length ) lockPostSaving( 'td-pre-publish' );
    else                   unlockPostSaving( 'td-pre-publish' );
  }, [ problems.length ] );
  return (
    <PluginPrePublishPanel title="Checks">
      { problems.map( p => <Notice key={ p } status="warning" isDismissible={ false }>{ p }</Notice> ) }
    </PluginPrePublishPanel>
  );
}
registerPlugin( 'td-pre-publish', { render: Checks } );
```

### Subscribe to save completion

```js
let wasSaving = false;
subscribe( () => {
  const s = select( editorStore );
  const saving = s.isSavingPost() && ! s.isAutosavingPost();
  if ( wasSaving && ! saving ) {
    const failed = s.didPostSaveRequestFail();
    console.log( failed ? 'save failed' : 'saved' );
  }
  wasSaving = saving;
}, editorStore );
```

### Observe block selection

```js
let prev = null;
subscribe( () => {
  const id = select( 'core/block-editor' ).getSelectedBlockClientId();
  if ( id !== prev ) { onSelectionChanged( id ); prev = id; }
}, 'core/block-editor' );
```

### Invalidate after external mutation

```js
dispatch( 'core' ).invalidateResolution( 'getEntityRecord', [ 'postType', 'book', 123 ] );
dispatch( 'core' ).invalidateResolutionForStoreSelector( 'getEntityRecords' );
```

### Programmatic save lock

```jsx
useEffect( () => {
  const key = 'td/requires-category';
  if ( hasCategory ) unlockPostSaving( key );
  else               lockPostSaving( key );
  return () => unlockPostSaving( key );
}, [ hasCategory ] );
```
