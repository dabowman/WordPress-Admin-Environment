# Block Bindings API (WP 6.5+ through 7.0)

Bindings decouple a block's *visible value* from its *stored attribute*: at render time a registered source returns the value that overrides the bound attribute. The stored attribute remains as a fallback so markup degrades gracefully if the source is unregistered.

## Stability timeline

| WP | Milestone |
|---|---|
| 6.5 | Bindings merged. PHP `register_block_bindings_source()` public. Built-ins `core/post-meta`, `core/pattern-overrides` (experimental). Replaces `source:'meta'`. |
| 6.6 | `core/pattern-overrides` stable. Synced-pattern overrides ship. |
| 6.7 | **JS `registerBlockBindingsSource()` public.** `useBlockBindingsUtils`, `getBlockBindingsSource(s)` public. `block_bindings_source_value` filter. `role` stabilized. |
| 6.8 | Bindings UI polished; wider core-block attribute coverage. |
| 6.9/7.0 | `core/post-data`, `core/term-data` built-in sources. `getFieldsList` in `registerBlockBindingsSource`. `block_bindings_supported_attributes` filters. Image `caption` bindable. |

## Markup shape

```html
<!-- wp:paragraph {"metadata":{"name":"hero-body","bindings":{
  "content":{"source":"core/post-meta","args":{"key":"subtitle"}}
}}} -->
<p>Fallback content.</p>
<!-- /wp:paragraph -->
```

The fallback paragraph text remains in `post_content` — so if the bound source goes away, the markup still renders something sane.

## Built-in sources

| Source | `args` | Context required |
|---|---|---|
| `core/post-meta` | `{ key }` | `postId`, `postType` |
| `core/pattern-overrides` | *(none — keyed by `metadata.name`)* | `pattern/overrides` (implicit) |
| `core/post-data` (6.9+) | `{ field: 'date'\|'modified'\|'link' }` | `postId`, `postType` |
| `core/term-data` (6.9+) | `{ field: 'id'\|'name'\|'link'\|'slug'\|... }` | `termId`, `taxonomy` |

## PHP registration

```php
register_block_bindings_source( 'acme/weather', array(
  'label'              => __( 'Weather', 'acme' ),
  'uses_context'       => array( 'postId' ),
  'get_value_callback' => function ( $args, $block, $attribute_name ) {
    $city = $args['city'] ?? 'Reykjavik';
    return get_transient( "weather_$city" ) ?: '—';
  },
) );
```

PHP-only sources are sufficient when the binding is read-only. For editor write-back, register a JS source as well (next section).

## JS registration

```js
import { registerBlockBindingsSource } from '@wordpress/blocks';
import { store as coreDataStore } from '@wordpress/core-data';

registerBlockBindingsSource( {
  name:        'acme/subtitle',
  label:       'Post Subtitle',
  usesContext: [ 'postId', 'postType' ],
  getValues( { bindings, context, select } ) {
    const rec = context?.postId
      ? select( coreDataStore ).getEditedEntityRecord(
          'postType', context.postType, context.postId
        )
      : null;
    const value = rec?.meta?.subtitle ?? '';
    return Object.fromEntries(
      Object.keys( bindings ).map( a => [ a, value ] )
    );
  },
  setValues( { bindings, context, dispatch } ) {
    const attr = Object.keys( bindings )[ 0 ];
    dispatch( coreDataStore ).editEntityRecord(
      'postType', context.postType, context.postId,
      { meta: { subtitle: bindings[ attr ].newValue } }
    );
  },
  canUserEditValue: ( { select, context } ) =>
    !! select( coreDataStore ).canUser( 'update', {
      kind: 'postType', name: context.postType, id: context.postId
    } ),
} );
```

**Resolution rules:**
- `getValues` runs synchronously on render.
- `setValues` runs only when `canUserEditValue` returns truthy.
- Stored attribute is preserved as fallback; never gets overwritten by the binding flow.
- If a source is unregistered at render time, markup falls back to the stored attribute.

## `useBlockBindingsUtils`

```js
const { updateBlockBindings, removeAllBlockBindings } = useBlockBindingsUtils( clientId );

updateBlockBindings( { url: { source: 'acme/random', args: { tag: 'hero' } } } );
updateBlockBindings( { url: undefined } );   // remove only the `url` binding
removeAllBlockBindings();
```

## Bindable attributes (default core set)

| Block | Attributes |
|---|---|
| `core/paragraph` | `content` |
| `core/heading` | `content` |
| `core/image` | `id`, `url`, `title`, `alt`, `caption` (caption added 7.0) |
| `core/button` | `url`, `text`, `linkTarget`, `rel` |
| `core/cover` | `url`, `id`, `alt` |
| `core/post-*` | (read-only default bindings per block) |

To extend the bindable set for a block, use the `block_bindings_supported_attributes_{block_type}` filter (added 6.9/7.0). When making a *negative* claim that a particular attribute isn't bindable, verify against the live block-editor handbook — this list expands every release.

## Synced patterns + overrides

Synced patterns are the `wp_block` CPT, referenced via `<!-- wp:block {"ref":123} /-->`. Pattern overrides let specific attributes vary per instance:

```html
<!-- In the pattern (wp_block post) -->
<!-- wp:heading {"metadata":{"name":"title","bindings":{
  "content":{"source":"core/pattern-overrides"}
}}} -->
<h2>Default</h2>
<!-- /wp:heading -->

<!-- In an instance -->
<!-- wp:block {"ref":123,"content":{"title":{"content":"This instance's headline"}}} /-->
```

The `core/block` wrapper applies `templateLock: 'contentOnly'` internally; inner blocks with override bindings remain editable, others lock to the template.

## Quick recipes

### Bind a heading to post meta

```html
<!-- wp:heading {"metadata":{"bindings":{
  "content":{"source":"core/post-meta","args":{"key":"hero_headline"}}
}}} /-->
```

### Custom source reading from a custom store

```js
registerBlockBindingsSource( {
  name: 'td/inventory-count',
  usesContext: [ 'postId' ],
  getValues( { bindings, context, select } ) {
    const count = select( 'td/inventory' ).getCountForProduct( context.postId );
    return Object.fromEntries(
      Object.keys( bindings ).map( a => [ a, String( count ?? '—' ) ] )
    );
  },
} );
```

The custom store must register the same data on the server side too (or render dynamically) — bindings must resolve in PHP for the block's frontend output.
