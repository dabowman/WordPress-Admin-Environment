# `@wordpress/core-data` entities

The REST-backed entity store. Every `(kind, name)` pair is a federated cache for one REST collection.

## Built-in entities

Core ships these out of the box:

- `root/site` — site settings (title, description, registered options with `show_in_rest`)
- `root/user` — current/other users
- `root/comment`
- `root/media`
- `root/taxonomy` — taxonomy registrations
- `root/menu`, `root/menuItem`
- `root/globalStyles` — site-wide global styles
- `root/theme` — installed themes
- Every CPT registered with `show_in_rest:true` is auto-exposed under `postType/<slug>`
- Every taxonomy registered with `show_in_rest:true` is auto-exposed under `taxonomy/<slug>`

For CPTs there is **no JS registration step** — core-data discovers them via `/wp/v2/types?context=edit`.

## Core hooks

```js
import {
  useEntityRecord, useEntityRecords, useEntityProp, useEntityBlockEditor,
} from '@wordpress/core-data';

// Single record
//   returns { record, editedRecord, edits, hasEdits, edit, save,
//             isResolving, hasResolved, status }
const { record, edit, save } = useEntityRecord( 'postType', 'post', 42 );

// Collection
//   returns { records, totalItems, totalPages, isResolving, hasResolved, status }
const { records } = useEntityRecords( 'postType', 'post',
  useMemo( () => ( { per_page: 10, _fields: 'id,title,slug' } ), [] )
);

// Single property with getter/setter
const [ title, setTitle ] = useEntityProp( 'postType', 'post', 'title' );

// Block-editor-ready tuple for ANY content-bearing entity
const [ blocks, onInput, onChange ] = useEntityBlockEditor(
  'postType', 'wp_template_part', { id }
);
```

**Always `useMemo` the query object** for `useEntityRecords` — inline literals refetch every render.

## Key actions on `core`

```js
import { store as coreStore } from '@wordpress/core-data';
import { dispatch } from '@wordpress/data';

const { editEntityRecord, saveEditedEntityRecord, saveEntityRecord, deleteEntityRecord }
  = dispatch( coreStore );

// Stage edits in cache (no REST yet); supports options.undoIgnore, options.isCached
editEntityRecord( 'postType', 'post', 42, { title: 'New' } );

// Flush all edits via REST (auto-batched in a microtask)
await saveEditedEntityRecord( 'postType', 'post', 42 );

// Create or replace in one shot
await saveEntityRecord( 'postType', 'post', { title: 'Hello' } );

// Delete
await deleteEntityRecord( 'postType', 'post', 42, { force: true } );

// Undo/redo are entity-level, owned by core (not core/block-editor)
dispatch( coreStore ).undo();
dispatch( coreStore ).redo();
```

`editEntityRecord` options:
- `{ undoIgnore: true }` — skip the undo stack (use for hydration, migrations, programmatic UI fixes).
- `{ isCached: true }` — transient/cached edit; doesn't flip the dirty flag or split undo levels (used for `onInput` keystrokes).

## Adding a custom entity

Two paths:

### Path A: Custom Post Type — auto-discovered

```php
register_post_type( 'acme_book', array(
  'public'         => true,
  'show_in_rest'   => true,
  'rest_base'      => 'books',
  'supports'       => array( 'title', 'editor', 'custom-fields', 'revisions', 'author', 'thumbnail' ),
  'capability_type'=> array( 'acme_book', 'acme_books' ),
  'map_meta_cap'   => true,
) );
```

```js
// JS — just use the hooks
const { records } = useEntityRecords( 'postType', 'acme_book',
  useMemo( () => ( { per_page: 20, _fields: 'id,title,meta' } ), [] )
);
```

### Path B: Non-CPT REST resource

```js
dispatch( 'core' ).addEntities( [ {
  kind: 'my-plugin', name: 'invoice',
  baseURL: '/my-plugin/v1/invoices',
  baseURLParams: { context: 'edit' },
  key: 'id',
  plural: 'invoices',
  label: 'Invoice',
  mergedEdits: { meta: true },          // deep-merge `meta` on edit
  supports:    { autosave: false },
  transientEdits: { selection: true },  // optional — fields not split into undo levels
} ] );

const { records } = useEntityRecords( 'my-plugin', 'invoice', { context: 'edit' } );
```

## End-to-end: CPT + meta + sidebar

```php
add_action( 'init', function () {
  register_post_type( 'acme_book', array(
    'public'         => true, 'show_in_rest' => true,
    'rest_base'      => 'books',
    'supports'       => array( 'title', 'editor', 'custom-fields', 'revisions', 'author', 'thumbnail' ),
    'capability_type'=> array( 'acme_book', 'acme_books' ),
    'map_meta_cap'   => true,
  ) );
  register_post_meta( 'acme_book', 'isbn', array(
    'type'              => 'string', 'single' => true, 'show_in_rest' => true,
    'auth_callback'     => fn() => current_user_can( 'edit_posts' ),
  ) );
} );
```

```js
const { record, edit, save } = useEntityRecord( 'postType', 'acme_book', id );
edit( { meta: { ...record.meta, isbn: '978…' } } );
await save();
```

## `canUser` permissions — TRI-STATE

```js
const canEdit = useSelect( s =>
  s( 'core' ).canUser( 'update', { kind: 'postType', name: 'acme_book', id } ),
  [ id ]
);
if ( canEdit === undefined ) return <Spinner />;   // still resolving
if ( canEdit === false )     return null;
```

- The **object form** (`{ kind, name, id }`) is canonical since 6.7. The legacy `(action, resource, id)` positional form is soft-deprecated.
- The resolver probes OPTIONS and caches per-resource.
- **Always compare strictly with `=== true`/`=== false`** — `undefined` means "still resolving," and a truthy/falsy check conflates it with "denied."

## Common selectors

| Selector | Returns |
|---|---|
| `getEntityRecord( kind, name, id, query? )` | Plain server record (or `null` unresolved / `undefined` 404) |
| `getEditedEntityRecord( kind, name, id )` | Server record + staged edits merged |
| `getEntityRecordEdits( kind, name, id )` | Just the edits object |
| `hasEditsForEntityRecord( kind, name, id )` | Boolean dirty flag |
| `getEntityRecords( kind, name, query? )` | Array (or `null` unresolved) |
| `getCurrentUser()` | Logged-in user |
| `canUser( action, resource )` | Tri-state (above) |
| `getAutosave( type, id, userId )` | Latest autosave |

## 404 / unresolved semantics

For all entity selectors:

- `record === null` → unresolved (resolver still pending)
- `record === undefined` → resolved, missing (404 / deleted / 403 coerced)
- `record` object → loaded

Use `hasResolved` + `status === 'ERROR'` from `useEntityRecord(s)` for the loading/error/loaded triad explicitly.

## Site options (`root/site`)

```jsx
const [ title, setTitle ] = useEntityProp( 'root', 'site', 'title' );
const save = () => dispatch( 'core' ).saveEditedEntityRecord( 'root', 'site' );
```

To expose a custom option:

```php
register_setting( 'general', 'td_api_key', array(
  'show_in_rest' => true,
  'type'         => 'string',
) );
```

Then `useEntityProp( 'root', 'site', 'td_api_key' )`.

## Template entities

`wp_template` and `wp_template_part` are REST-exposed CPTs. Record shape:
`{ id: "theme//slug", slug, theme, type, source: 'theme'|'custom'|'plugin', content: { raw, block_version }, area? }`.

```js
const { records } = useEntityRecords( 'postType', 'wp_template', { per_page: -1 } );
const [ blocks, onInput, onChange ] = useEntityBlockEditor( 'postType', 'wp_template', { id } );
await dispatch( 'core' ).saveEditedEntityRecord( 'postType', 'wp_template', id );

// Revert (deletes the user-modified copy so the theme file re-serves)
await dispatch( editSiteStore ).revertTemplate( template, { allowUndo: true } );
```

`wp_navigation` is the same idea — the `core/navigation` block stores a `ref` pointing at a `wp_navigation` post whose `content.raw` is block markup.

## Patterns and template-related

```js
const { records: patterns } = useEntityRecords( 'postType', 'wp_block', {} ); // synced patterns
```

REST-exposed pattern endpoints:
- `GET /wp/v2/block-patterns/patterns`
- `GET /wp/v2/block-patterns/categories`
- `/wp/v2/blocks` — `wp_block` CPT (synced/unsynced patterns)
- `wp_pattern_category` taxonomy
