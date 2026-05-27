# REST API and admin-ajax

The two ways plugins expose server-side handlers to JS. REST is preferred for new work; admin-ajax is still useful for targeted cases.

For deep REST endpoint design (controller patterns, headless WordPress, third-party auth), also load the `wordpress-rest-api` skill — this file covers the plugin-level integration points.

## REST API

Routes are registered on `rest_api_init`:

```php
register_rest_route( 'acme/v1', '/items/(?P<id>[\d]+)', array(
    array(
        'methods'             => WP_REST_Server::READABLE,   // 'GET'
        'callback'            => 'acme_get_item',
        'permission_callback' => fn() => current_user_can( 'read' ),
        'args' => array(
            'id' => array(
                'type'              => 'integer',
                'required'          => true,
                'validate_callback' => 'is_numeric',
                'sanitize_callback' => 'absint',
            ),
        ),
    ),
    array(
        'methods'             => WP_REST_Server::EDITABLE,   // 'POST, PUT, PATCH'
        'callback'            => 'acme_update_item',
        'permission_callback' => fn() => current_user_can( 'edit_others_posts' ),
    ),
    'schema' => 'acme_item_schema',
) );
```

**Method constants:** `READABLE`, `CREATABLE`, `EDITABLE`, `DELETABLE`, `ALLMETHODS`.

### `permission_callback` is MANDATORY

Return `bool` or `WP_Error`. For truly public endpoints use `'permission_callback' => '__return_true'` — **never leave it blank**. Omitting `permission_callback` triggers a `_doing_it_wrong` notice from WordPress core and is flagged by WordPress.org plugin review; make the callback explicit even for public endpoints.

### Callback conventions

Callbacks receive a `WP_REST_Request` object.

```php
function acme_get_item( WP_REST_Request $req ) {
    $id = $req->get_param( 'id' );
    $item = acme_find( $id );
    if ( ! $item ) {
        return new WP_Error( 'not_found', 'Item not found', array( 'status' => 404 ) );
    }
    return rest_ensure_response( $item );
}
```

Use `rest_ensure_response()` to allow setting headers/status; use `WP_Error` with `'status'` in the data arg for non-2xx.

### Extending existing endpoints

`register_rest_field()` adds fields to core endpoints without subclassing controllers:

```php
register_rest_field( 'post', 'reading_time', array(
    'get_callback'    => fn( $p ) => acme_calc_reading_time( $p['id'] ),
    'update_callback' => null,
    'schema'          => array( 'type' => 'integer' ),
) );
```

### `WP_REST_Controller` subclassing

For standard CRUD, extend `WP_REST_Controller`. Methods to implement: `get_items`, `get_item`, `create_item`, `update_item`, `delete_item` + each of their `*_permissions_check` counterparts, plus `get_item_schema` and `get_collection_params`. This gives you parity with core's REST behavior (schema validation, pagination headers, `_embed`, `_fields`).

### Authentication

- **Cookie + `X-WP-Nonce`** with `wp_create_nonce('wp_rest')` — for same-origin browser requests from logged-in users.
- **Application Passwords** (WP 5.6+) — for server-to-server and external tools.
- **Third-party OAuth/JWT plugins** — for public APIs consumed by non-WordPress clients.

Pretty permalinks required for `/wp-json/` URLs — plain permalinks fall back to `?rest_route=` which some clients don't handle.

### When REST wins

Prefer REST over `admin-ajax.php` for new code — discoverable, schema-validated, cacheable, plays nice with modern tooling. REST is also the right choice for anything you'd want to consume from outside the plugin (headless frontends, other plugins, CLI tools).

## admin-ajax.php

```php
add_action( 'wp_ajax_acme_save',        'acme_ajax_save' );
add_action( 'wp_ajax_nopriv_acme_save', 'acme_ajax_save' );

function acme_ajax_save() {
    check_ajax_referer( 'acme_nonce', 'security' );
    if ( ! current_user_can( 'edit_posts' ) ) {
        wp_send_json_error( array( 'message' => 'Forbidden' ), 403 );
    }
    $title = sanitize_text_field( wp_unslash( $_POST['title'] ?? '' ) );
    wp_send_json_success( array( 'id' => 1, 'title' => $title ) );
}
```

### admin-ajax gotchas

- **`ajaxurl` is only defined in admin.** On frontend, pass it via `wp_localize_script` or `wp_add_inline_script`.
- **Always terminate with `wp_send_json_*()` / `wp_die()`** — otherwise a trailing `0` appears in the response (PHP returns 0 from `die()`-less admin-ajax handlers).
- **Register both `wp_ajax_` and `wp_ajax_nopriv_`** when anonymous users should be able to call the endpoint. Missing `nopriv` means logged-out users get a silent `0`.
- Still requires the nonce + capability discipline. No shortcuts.

### When admin-ajax is still OK

- Existing plugin already uses it and you're making a small change.
- Very simple internal-only admin actions.
- Heartbeat-style integration (though the Heartbeat API is cleaner).

Otherwise, new code should go to REST.

## Decision matrix

| Situation | Use |
|-----------|-----|
| New frontend/editor JS calls | REST API |
| External/third-party consumers | REST API (with Application Passwords or OAuth) |
| Headless frontend | REST API (or WPGraphQL if installed) |
| Existing admin-ajax handler, small change | admin-ajax |
| Block editor data fetching | `@wordpress/api-fetch` against REST, usually via `core-data` store |
| High-frequency polling | Heartbeat API |
| Background work (long-running, retries) | Action Scheduler, not an endpoint |
