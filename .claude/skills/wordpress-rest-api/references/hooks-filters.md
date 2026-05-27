# Hooks and Filters Reference

Complete reference for WordPress REST API actions and filters, organized by lifecycle phase.

## Table of Contents

1. [Request Lifecycle](#request-lifecycle)
2. [Initialization](#initialization)
3. [Authentication](#authentication)
4. [Pre-Dispatch](#pre-dispatch)
5. [Query Modification](#query-modification)
6. [Data Modification (Before Save)](#data-modification-before-save)
7. [Post-Save Actions](#post-save-actions)
8. [Response Modification](#response-modification)
9. [Post-Dispatch](#post-dispatch)
10. [Endpoint and Route Modification](#endpoint-and-route-modification)
11. [CORS and Serving](#cors-and-serving)
12. [Extending Queries](#extending-queries)

---

## Request Lifecycle

```
 1. rest_api_init                        ← Register routes, fields, meta
 2. rest_authentication_errors           ← Validate/reject authentication
 3. rest_pre_dispatch                    ← Short-circuit entire request
 4. Parameter validation & sanitization  ← Automatic from arg definitions
 5. rest_request_before_callbacks        ← Middleware (before permission check)
 6. Permission callback                  ← Route's permission_callback
 6b. rest_dispatch_request               ← Override dispatch result (since 4.4)
 7. Main callback execution
    ├── rest_pre_insert_{$post_type}     ← Validate/modify before DB insert
    ├── rest_insert_{$post_type}         ← After insert, before meta/terms
    ├── rest_after_insert_{$post_type}   ← After all data fully saved
    └── rest_prepare_{$post_type}        ← Shape the response object
 8. rest_request_after_callbacks         ← Middleware (after main callback)
 9. rest_post_dispatch                   ← Final response modification
10. rest_pre_serve_request               ← CORS headers, before wire
11. rest_pre_echo_response               ← After embedding, before echo (since 4.8.1)
```

---

## Initialization

### `rest_api_init` (action)

Fires when the REST API is initialized. The primary hook for registering routes, fields, and meta.

```php
add_action('rest_api_init', function($wp_rest_server) {
    // Register routes
    register_rest_route('myplugin/v1', '/items', [...]);

    // Register fields on existing endpoints
    register_rest_field('post', 'my_field', [...]);

    // Register meta for REST exposure
    register_post_meta('post', 'my_meta', ['show_in_rest' => true, ...]);
});
```

**Parameter:** `$wp_rest_server` (WP_REST_Server instance)

---

## Authentication

### `rest_authentication_errors` (filter)

Controls authentication for the entire REST API. Fires before any route processing.

```php
// Require authentication for all requests
add_filter('rest_authentication_errors', function($result) {
    // Already authenticated or errored
    if (true === $result || is_wp_error($result)) {
        return $result;
    }
    // Not logged in
    if (!is_user_logged_in()) {
        return new WP_Error(
            'rest_not_logged_in',
            'Authentication required.',
            ['status' => 401]
        );
    }
    return $result;
});
```

**Parameters:** `$result` (WP_Error|null|true)
**Return:** `true` (authenticated), `WP_Error` (reject), `null` (no opinion — continue)

**Warning:** Blocking all unauthenticated access breaks Contact Form 7, WooCommerce webhooks, Jetpack sync, and Gutenberg for logged-out users.

### `rest_cookie_check_errors` (filter)

Fires during cookie-based authentication. Used to customize nonce error handling.

### `application_password_did_authenticate` (action)

Fires after successful Application Password authentication. Receives the user object and the app password record.

---

## Pre-Dispatch

### `rest_pre_dispatch` (filter)

Short-circuit the entire request before any callback fires. Return non-null to skip processing.

```php
// Maintenance mode
add_filter('rest_pre_dispatch', function($result, $server, $request) {
    if (get_option('maintenance_mode') && !current_user_can('manage_options')) {
        return new WP_Error(
            'maintenance',
            'API temporarily unavailable.',
            ['status' => 503]
        );
    }
    return $result;
}, 10, 3);

// Rate limiting
add_filter('rest_pre_dispatch', function($result, $server, $request) {
    $ip = $_SERVER['REMOTE_ADDR'];
    $key = 'rest_rate_' . md5($ip);
    $count = get_transient($key) ?: 0;

    if ($count > 100) {
        return new WP_Error('rate_limited', 'Too many requests.', ['status' => 429]);
    }
    set_transient($key, $count + 1, MINUTE_IN_SECONDS);
    return $result;
}, 10, 3);

// Response caching
add_filter('rest_pre_dispatch', function($result, $server, $request) {
    if ($request->get_method() !== 'GET') return $result;

    $cache_key = 'rest_cache_' . md5($request->get_route() . serialize($request->get_query_params()));
    $cached = get_transient($cache_key);
    if ($cached !== false) {
        return $cached;
    }
    return $result;
}, 10, 3);
```

**Parameters:** `$result` (null), `$server` (WP_REST_Server), `$request` (WP_REST_Request)

### `rest_request_before_callbacks` (filter)

Fires after parameter validation but before the permission callback. Acts as middleware.

```php
add_filter('rest_request_before_callbacks', function($response, $handler, $request) {
    // Log all write requests
    if (!in_array($request->get_method(), ['GET', 'HEAD', 'OPTIONS'])) {
        error_log(sprintf(
            'REST API write: %s %s by user %d',
            $request->get_method(),
            $request->get_route(),
            get_current_user_id()
        ));
    }
    return $response;
}, 10, 3);
```

**Parameters:** `$response` (WP_REST_Response|WP_Error|null), `$handler` (array), `$request` (WP_REST_Request)

---

## Query Modification

### `rest_{$post_type}_query` (filter)

Modify WP_Query arguments for post type collection endpoints. Called for every GET request on `/wp/v2/posts`, `/wp/v2/pages`, etc.

```php
// Add meta query support to posts endpoint
add_filter('rest_post_query', function($args, $request) {
    // Custom price filter
    if (isset($request['price_min'])) {
        $args['meta_query'][] = [
            'key'     => 'price',
            'value'   => floatval($request['price_min']),
            'compare' => '>=',
            'type'    => 'NUMERIC',
        ];
    }

    // Custom date range
    if (isset($request['event_after'])) {
        $args['meta_query'][] = [
            'key'     => 'event_date',
            'value'   => sanitize_text_field($request['event_after']),
            'compare' => '>=',
            'type'    => 'DATE',
        ];
    }

    return $args;
}, 10, 2);
```

**Parameters:** `$args` (array — WP_Query arguments), `$request` (WP_REST_Request)

**Important:** You must also register the custom query params via `rest_{$post_type}_collection_params` — see below.

### `rest_{$post_type}_collection_params` (filter)

Add custom parameters to collection endpoint definitions. Required for custom query params to be accepted (unregistered params are silently stripped).

```php
add_filter('rest_post_collection_params', function($params) {
    $params['price_min'] = [
        'description' => 'Minimum price filter.',
        'type'        => 'number',
        'minimum'     => 0,
    ];
    $params['event_after'] = [
        'description' => 'Events after this date.',
        'type'        => 'string',
        'format'      => 'date-time',
    ];
    return $params;
});
```

### `rest_{$taxonomy}_query` (filter)

Modify taxonomy query arguments (categories, tags, custom taxonomies).

```php
add_filter('rest_category_query', function($args, $request) {
    // Only return categories with posts
    $args['hide_empty'] = true;
    return $args;
}, 10, 2);
```

---

## Data Modification (Before Save)

### `rest_pre_insert_{$post_type}` (filter)

Modify or validate the prepared post object before it's inserted into the database. Return `WP_Error` to abort.

```php
add_filter('rest_pre_insert_post', function($prepared_post, $request) {
    // Enforce maximum title length
    if (isset($prepared_post->post_title) && strlen($prepared_post->post_title) > 100) {
        return new WP_Error(
            'title_too_long',
            'Post title must be 100 characters or fewer.',
            ['status' => 400]
        );
    }

    // Auto-set category based on content
    if (isset($prepared_post->post_content) && str_contains($prepared_post->post_content, '[product]')) {
        $prepared_post->post_category = [get_cat_ID('Products')];
    }

    return $prepared_post;
}, 10, 2);
```

**Parameters:** `$prepared_post` (stdClass), `$request` (WP_REST_Request)

---

## Post-Save Actions

### `rest_insert_{$post_type}` (action)

Fires after the post is inserted/updated but **before** meta and terms are saved. Use for operations that depend on the post existing but don't need meta.

```php
add_action('rest_insert_post', function($post, $request, $creating) {
    if ($creating) {
        // New post created
        do_action('my_post_created', $post->ID);
    }
}, 10, 3);
```

**Parameters:** `$post` (WP_Post), `$request` (WP_REST_Request), `$creating` (bool)

### `rest_after_insert_{$post_type}` (action)

Fires after all data (post, meta, terms, featured image) is fully saved. The safest hook for side effects.

```php
add_action('rest_after_insert_post', function($post, $request, $creating) {
    // Send notification
    if ($creating && $post->post_status === 'publish') {
        wp_mail('editor@example.com', 'New post published', $post->post_title);
    }

    // Clear caches
    wp_cache_delete('front_page_posts', 'my_cache_group');

    // Trigger webhook
    wp_remote_post('https://hooks.example.com/new-post', [
        'body' => wp_json_encode(['id' => $post->ID, 'title' => $post->post_title]),
        'headers' => ['Content-Type' => 'application/json'],
    ]);
}, 10, 3);
```

### `rest_delete_{$post_type}` (action)

Fires after a post is deleted or trashed via the API.

```php
add_action('rest_delete_post', function($post, $response, $request) {
    // Clean up related data
    delete_post_meta($post->ID, '_related_data');
}, 10, 3);
```

**Parameters:** `$post` (WP_Post), `$response` (WP_REST_Response), `$request` (WP_REST_Request)

---

## Response Modification

### `rest_prepare_{$post_type}` (filter)

Shape the response object for any post type endpoint. Fires for every item in a collection and for single-item requests.

```php
// Add computed fields to post response
add_filter('rest_prepare_post', function($response, $post, $request) {
    // Add reading time
    $content = $post->post_content;
    $words = str_word_count(strip_tags($content));
    $response->data['reading_time'] = max(1, ceil($words / 200));

    // Add related posts
    if ($request->get_param('context') === 'view') {
        $tags = wp_get_post_tags($post->ID, ['fields' => 'ids']);
        if ($tags) {
            $related = get_posts([
                'tag__in'        => $tags,
                'post__not_in'   => [$post->ID],
                'posts_per_page' => 3,
                'fields'         => 'ids',
            ]);
            $response->data['related_posts'] = $related;
        }
    }

    // Remove fields from public context
    if ($request->get_param('context') !== 'edit') {
        unset($response->data['internal_notes']);
    }

    return $response;
}, 10, 3);
```

**Parameters:** `$response` (WP_REST_Response), `$post` (WP_Post), `$request` (WP_REST_Request)

**Also available for:** `rest_prepare_comment`, `rest_prepare_user`, `rest_prepare_category`, `rest_prepare_tag`, `rest_prepare_{$taxonomy}`, `rest_prepare_attachment`

---

## Post-Dispatch

### `rest_post_dispatch` (filter)

Final modification of any REST API response, regardless of route. Fires after the main callback completes.

```php
// Add custom headers to all responses
add_filter('rest_post_dispatch', function($response, $server, $request) {
    // API version header
    $response->header('X-API-Version', '2.0');

    // Cache control for GET requests
    if ($request->get_method() === 'GET' && !is_user_logged_in()) {
        $response->header('Cache-Control', 'public, max-age=300');
    }

    // Store cached response
    if ($request->get_method() === 'GET') {
        $cache_key = 'rest_cache_' . md5($request->get_route() . serialize($request->get_query_params()));
        set_transient($cache_key, $response, 5 * MINUTE_IN_SECONDS);
    }

    return $response;
}, 10, 3);
```

**Parameters:** `$response` (WP_REST_Response), `$server` (WP_REST_Server), `$request` (WP_REST_Request)

### `rest_request_after_callbacks` (filter)

Fires after the main callback but before `rest_post_dispatch`. Receives the handler array.

---

## Endpoint and Route Modification

### `rest_endpoints` (filter)

Modify or remove registered endpoints. Fires after all routes are registered.

```php
// Remove the users endpoint entirely
add_filter('rest_endpoints', function($endpoints) {
    unset($endpoints['/wp/v2/users']);
    unset($endpoints['/wp/v2/users/(?P<id>[\d]+)']);
    return $endpoints;
});

// Remove specific methods from an endpoint
add_filter('rest_endpoints', function($endpoints) {
    $route = '/wp/v2/posts';
    if (isset($endpoints[$route])) {
        // Remove DELETE method
        foreach ($endpoints[$route] as $key => $endpoint) {
            if (isset($endpoint['methods']['DELETE'])) {
                unset($endpoints[$route][$key]);
            }
        }
    }
    return $endpoints;
});
```

### `rest_api_init` vs `rest_endpoints`

- Use `rest_api_init` to **add** routes
- Use `rest_endpoints` to **remove or modify** existing routes

---

## CORS and Serving

### `rest_pre_serve_request` (filter)

Fires just before the response is sent to the client. Primary use: CORS headers.

```php
add_filter('rest_pre_serve_request', function($served, $result, $request, $server) {
    // Custom CORS headers (see authentication.md for full example)
    header('Access-Control-Allow-Origin: https://app.example.com');
    return $served;
}, 10, 4);
```

### `rest_allowed_cors_headers` (filter)

Add custom headers to the CORS `Access-Control-Allow-Headers` list.

```php
add_filter('rest_allowed_cors_headers', function($headers) {
    $headers[] = 'X-Custom-Auth';
    $headers[] = 'X-Request-Id';
    return $headers;
});
```

---

## Extending Queries

### Pattern: Add Custom Filterable Params

To add a custom query parameter to a core endpoint, you need **both**:

1. Register the parameter (so it's not stripped):
```php
add_filter('rest_post_collection_params', function($params) {
    $params['featured'] = [
        'description' => 'Limit to featured posts.',
        'type'        => 'boolean',
    ];
    return $params;
});
```

2. Use it in the query:
```php
add_filter('rest_post_query', function($args, $request) {
    if ($request->get_param('featured')) {
        $args['meta_query'][] = [
            'key'   => '_featured',
            'value' => '1',
        ];
    }
    return $args;
}, 10, 2);
```

### Pattern: Custom Orderby

```php
// Register the orderby option
add_filter('rest_post_collection_params', function($params) {
    $params['orderby']['enum'][] = 'popularity';
    return $params;
});

// Translate to WP_Query args
add_filter('rest_post_query', function($args, $request) {
    if ($request->get_param('orderby') === 'popularity') {
        $args['meta_key'] = 'view_count';
        $args['orderby'] = 'meta_value_num';
    }
    return $args;
}, 10, 2);
```
