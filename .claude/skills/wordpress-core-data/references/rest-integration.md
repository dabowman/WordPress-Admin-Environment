# REST API integration

How `core-data`, `apiFetch`, and the editor talk to `/wp-json/`. For HTTP-only consumption *outside* the editor (headless, automation), the `wordpress-rest-api` skill is the primary owner — this file covers the editor-side surface.

## Entity ↔ REST mapping

`baseURL` for an entity = REST path (without `/wp-json`). For CPTs it's `/{rest_namespace}/{rest_base}`, defaulting to `/wp/v2/{slug}`. Configure per CPT:

```php
register_post_type( 'acme_book', array(
  'show_in_rest'          => true,
  'rest_base'             => 'books',
  'rest_namespace'        => 'wp/v2',
  'rest_controller_class' => 'WP_REST_Posts_Controller',
  'supports'              => array( 'title', 'editor', 'excerpt', 'author', 'thumbnail', 'custom-fields', 'revisions' ),
  'capability_type'       => array( 'acme_book', 'acme_books' ),
  'map_meta_cap'          => true,
) );
```

## `apiFetch`

```js
import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';

await apiFetch( { path: '/wp/v2/posts/42', method: 'PUT', data: { title: 'X' } } );

// Raw Response — read pagination headers
const res = await apiFetch( {
  path: addQueryArgs( '/wp/v2/posts', { per_page: 10 } ),
  parse: false,
} );
const total = parseInt( res.headers.get( 'X-WP-Total' ), 10 );

// AbortSignal
const ctrl = new AbortController();
apiFetch( { path: '/wp/v2/posts', signal: ctrl.signal } );
setTimeout( () => ctrl.abort(), 5000 );
```

Options: `path`, `url`, `method`, `data` (JSON body), `body` (FormData / raw), `headers`, `parse`, `signal`.

## Middleware stack

Built-ins (registered LIFO via `apiFetch.use`):

- `createNonceMiddleware( nonce )` — adds `X-WP-Nonce`; mutable via heartbeat to keep the nonce fresh.
- `createRootURLMiddleware( url )` — resolves `path` to absolute.
- `createPreloadingMiddleware( preloaded )` — serves from preload cache (see below).
- `createUserLocaleMiddleware()` — appends `?_locale=user`.
- `fetchAllMiddleware` — auto-paginates on `per_page: -1`.
- `mediaUploadMiddleware` — large uploads / HEIC retries.
- `createThemePreviewMiddleware( slug )` — site-editor preview token.

Custom middleware:

```js
apiFetch.use( async ( options, next ) => {
  const start = performance.now();
  const r = await next( options );
  console.log( options.path, performance.now() - start );
  return r;
} );
```

## Custom REST routes

```php
add_action( 'rest_api_init', function () {
  register_rest_route( 'acme/v1', '/reports/(?P<year>\d{4})', array(
    array(
      'methods'             => WP_REST_Server::READABLE,
      'callback'            => 'acme_get_report',
      'permission_callback' => fn() => current_user_can( 'read' ),
      'args' => array(
        'year' => array( 'type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint' ),
      ),
    ),
    'allow_batch' => array( 'v1' => true ), // opt into /batch/v1
  ) );
} );
```

For complex resources subclass `WP_REST_Controller` and implement `register_routes`, `get_items`, `get_item`, `create_item`, `update_item`, `delete_item`, `get_item_schema`, `get_collection_params`, `prepare_item_for_response`. (See `wordpress-rest-api` for the full controller pattern.)

## `register_rest_field` and meta

```php
register_rest_field( 'post', 'reading_time', array(
  'get_callback'    => fn( $obj ) => (int) get_post_meta( $obj['id'], '_reading_time', true ),
  'update_callback' => fn( $val, $obj ) => update_post_meta( $obj->ID, '_reading_time', (int) $val ),
  'schema'          => array( 'type' => 'integer', 'context' => array( 'view', 'edit' ) ),
) );
```

**Prefer `register_post_meta` with `show_in_rest`** for plain scalar meta — it lands under `meta` in the response, participates in `_fields` natively, and is the only path block bindings can write through. Reach for `register_rest_field` when you need a computed/derived field that isn't backed by a single meta key.

## Batch endpoint

```js
await apiFetch( { path: '/batch/v1', method: 'POST', data: {
  validation: 'require-all-validate',
  requests: [
    { method: 'POST', path: '/wp/v2/posts', body: { title: 'A' } },
    { method: 'POST', path: '/wp/v2/posts', body: { title: 'B' } },
  ],
} } );
```

Returns **207 Multi-Status**; default max 25 items (filter via `rest_get_max_batch_size`). **`core-data` auto-batches `saveEditedEntityRecord` calls within a microtask** — multiple saves dispatched in the same tick collapse into one `/batch/v1` request.

## Preload paths

```php
add_filter( 'block_editor_rest_api_preload_paths', function ( $paths, $ctx ) {
  $paths[] = '/wp/v2/acme-books?per_page=20&_fields=id,title,meta&context=edit';
  $paths[] = array( '/wp/v2/blocks', 'OPTIONS' );
  return $paths;
}, 10, 2 );
```

WordPress serializes each response and injects it via `createPreloadingMiddleware`. **Paths must match exactly** — query-arg order, `context`, everything — or the cache misses on first read.

## Embeds, fields, and errors

- `?_embed=author,wp:featuredmedia` inlines embeddable links under `_embedded`.
- `?_fields=id,title,link` projects server-side. **MUST include the entity key (`id`)** — core-data can't index the cache without it.
- Error shape: `{ code, message, data: { status, params, details } }`. `apiFetch` throws this object — catch and inspect `err.data?.status`.

## `context` (view / edit / embed)

- `view` (default) — public. Computed/rendered fields included; no `content.raw`.
- `edit` — authenticated. Includes `content.raw`, raw meta values, sensitive attributes. Required for the editor.
- `embed` — minimal projection used inside `_embedded`.

Pass via `useEntityRecords( ..., useMemo( () => ( { context: 'edit' } ), [] ) )` or as a query arg in `apiFetch`.
