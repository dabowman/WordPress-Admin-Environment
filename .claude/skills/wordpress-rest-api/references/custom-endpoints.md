# Custom Endpoint Development Reference

Building custom REST API endpoints, extending existing endpoints, and working with the WP_REST_Controller class.

## Table of Contents

1. [register_rest_route()](#register_rest_route)
2. [Argument Validation and Sanitization](#argument-validation-and-sanitization)
3. [WP_REST_Controller Class](#wp_rest_controller-class)
4. [register_rest_field()](#register_rest_field)
5. [register_meta() and show_in_rest](#register_meta)
6. [Response Objects](#response-objects)
7. [Schema Definition](#schema-definition)

---

## register_rest_route()

Register custom routes within a `rest_api_init` callback. Must be called every request — not on activation hooks.

```php
add_action('rest_api_init', function() {
    register_rest_route(
        string $namespace,    // 'myplugin/v1' — vendor/version format
        string $route,        // '/items/(?P<id>[\d]+)' — regex capture groups
        array  $args,         // Endpoint definition(s)
        bool   $override      // false = merge (default), true = replace
    );
});
```

### HTTP Method Constants

| Constant | Value |
|---|---|
| `WP_REST_Server::READABLE` | `'GET'` |
| `WP_REST_Server::CREATABLE` | `'POST'` |
| `WP_REST_Server::EDITABLE` | `'POST, PUT, PATCH'` |
| `WP_REST_Server::DELETABLE` | `'DELETE'` |
| `WP_REST_Server::ALLMETHODS` | `'GET, POST, PUT, PATCH, DELETE'` |

### Multiple Methods Per Route

```php
register_rest_route('myplugin/v1', '/items/(?P<id>[\d]+)', [
    // Array of endpoint definitions
    [
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'myplugin_get_item',
        'permission_callback' => '__return_true',
        'args'                => [
            'id' => [
                'type'              => 'integer',
                'required'          => true,
                'sanitize_callback' => 'absint',
            ],
        ],
    ],
    [
        'methods'             => WP_REST_Server::EDITABLE,
        'callback'            => 'myplugin_update_item',
        'permission_callback' => function($request) {
            return current_user_can('edit_posts');
        },
        'args'                => [
            'title' => [
                'type'              => 'string',
                'required'          => true,
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => function($value) {
                    return strlen($value) <= 200;
                },
            ],
        ],
    ],
    [
        'methods'             => WP_REST_Server::DELETABLE,
        'callback'            => 'myplugin_delete_item',
        'permission_callback' => function() {
            return current_user_can('delete_posts');
        },
    ],
    // Shared options (apply to all methods)
    'schema'      => 'myplugin_get_item_schema',    // Schema callback
    'allow_batch' => ['v1' => true],                  // Enable batch API support
]);
```

### Callback Function

Receives `WP_REST_Request` as only parameter. Must return `WP_REST_Response`, `WP_Error`, or data that can be JSON-encoded.

```php
function myplugin_get_item($request) {
    $id = $request['id'];               // Route param
    $fields = $request['_fields'];       // Query param
    $body = $request->get_json_params(); // JSON body
    $files = $request->get_file_params();// Uploaded files

    $item = get_my_item($id);
    if (!$item) {
        return new WP_Error(
            'myplugin_not_found',
            'Item not found.',
            ['status' => 404]
        );
    }

    return rest_ensure_response($item);
    // Or explicitly:
    // return new WP_REST_Response($item, 200);
}
```

### Permission Callback

**Mandatory since WP 5.5.** Receives the full `WP_REST_Request`. Return `true`, `false`, or `WP_Error`.

```php
// Return WP_Error for descriptive error messages
'permission_callback' => function($request) {
    if (!current_user_can('manage_options')) {
        return new WP_Error(
            'myplugin_forbidden',
            'You need administrator privileges.',
            ['status' => 403]
        );
    }
    return true;
}
```

Never perform side effects in the permission callback — it's only for authorization checks.

---

## Argument Validation and Sanitization

### Per-Argument Options

| Option | Type | Description |
|---|---|---|
| `type` | string | `string`, `integer`, `number`, `boolean`, `array`, `object`, `null` |
| `description` | string | Human-readable description (shown in OPTIONS) |
| `required` | boolean | Whether the argument is required |
| `default` | mixed | Default value if not provided |
| `validate_callback` | callable | Returns `true` or `WP_Error`. Runs **before** sanitization |
| `sanitize_callback` | callable | Cleans/transforms the value. Runs **after** validation |
| `enum` | array | Restrict to specific values |
| `format` | string | `email`, `uri`, `ip`, `date-time`, `hex-color`, `uuid` |
| `minimum` / `maximum` | number | Range limits for numbers |
| `pattern` | string | Regex pattern for strings |
| `minLength` / `maxLength` | integer | String length limits |
| `items` | array | Schema for array items |
| `properties` | array | Schema for object properties |
| `minItems` / `maxItems` | integer | Array length limits |

### Callback Signatures

```php
// validate_callback receives: $value, $request, $key
'validate_callback' => function($value, $request, $key) {
    if (strlen($value) > 200) {
        return new WP_Error(
            'invalid_param',
            sprintf('%s must be 200 characters or fewer.', $key)
        );
    }
    return true; // Pass validation
}

// sanitize_callback receives: $value, $request, $key
'sanitize_callback' => function($value, $request, $key) {
    return sanitize_text_field($value);
}
```

**Warning:** Never pass PHP type-checking functions (like `is_numeric`) directly as callbacks. They have different signatures and will produce unexpected behavior. Always wrap in a closure.

### Common Sanitizers

| Function | Use For |
|---|---|
| `sanitize_text_field()` | Plain text (strips tags, normalizes whitespace) |
| `wp_kses_post()` | HTML content (allows safe tags) |
| `absint()` | Positive integers |
| `sanitize_email()` | Email addresses |
| `esc_url_raw()` | URLs (for database storage) |
| `sanitize_file_name()` | Filenames |
| `sanitize_key()` | Lowercase alphanumeric with dashes/underscores |
| `rest_sanitize_boolean()` | Boolean values from various formats |

### Complex Argument Example

```php
'args' => [
    'filters' => [
        'type'       => 'object',
        'required'   => false,
        'properties' => [
            'status' => [
                'type'    => 'string',
                'enum'    => ['active', 'inactive', 'archived'],
                'default' => 'active',
            ],
            'tags' => [
                'type'     => 'array',
                'items'    => ['type' => 'integer'],
                'maxItems' => 10,
                'default'  => [],
            ],
            'date_range' => [
                'type'       => 'object',
                'properties' => [
                    'after'  => ['type' => 'string', 'format' => 'date-time'],
                    'before' => ['type' => 'string', 'format' => 'date-time'],
                ],
            ],
        ],
    ],
],
```

---

## WP_REST_Controller Class

The abstract base class for REST controllers. Core endpoints all extend this. Use it for complex, resource-oriented endpoints.

### Method Overview

```php
class My_Items_Controller extends WP_REST_Controller {
    public function __construct() {
        $this->namespace = 'myplugin/v1';
        $this->rest_base = 'items';
    }

    // Route registration
    public function register_routes() {
        register_rest_route($this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_items'],
                'permission_callback' => [$this, 'get_items_permissions_check'],
                'args'                => $this->get_collection_params(),
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [$this, 'create_item'],
                'permission_callback' => [$this, 'create_item_permissions_check'],
                'args'                => $this->get_endpoint_args_for_item_schema(WP_REST_Server::CREATABLE),
            ],
            'schema'      => [$this, 'get_public_item_schema'],
            'allow_batch' => ['v1' => true],
        ]);

        register_rest_route($this->namespace, '/' . $this->rest_base . '/(?P<id>[\d]+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [$this, 'get_item'],
                'permission_callback' => [$this, 'get_item_permissions_check'],
                'args'                => ['context' => $this->get_context_param(['default' => 'view'])],
            ],
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'callback'            => [$this, 'update_item'],
                'permission_callback' => [$this, 'update_item_permissions_check'],
                'args'                => $this->get_endpoint_args_for_item_schema(WP_REST_Server::EDITABLE),
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'callback'            => [$this, 'delete_item'],
                'permission_callback' => [$this, 'delete_item_permissions_check'],
            ],
            'schema' => [$this, 'get_public_item_schema'],
        ]);
    }

    // Schema definition — cache in $this->schema for performance
    public function get_item_schema() {
        if ($this->schema) {
            return $this->add_additional_fields_schema($this->schema);
        }

        $this->schema = [
            '$schema'    => 'http://json-schema.org/draft-04/schema#',
            'title'      => 'item',
            'type'       => 'object',
            'properties' => [
                'id'    => [
                    'description' => 'Unique identifier.',
                    'type'        => 'integer',
                    'context'     => ['view', 'edit', 'embed'],
                    'readonly'    => true,
                ],
                'title' => [
                    'description' => 'Item title.',
                    'type'        => 'string',
                    'context'     => ['view', 'edit'],
                    'required'    => true,
                ],
                'status' => [
                    'description' => 'Item status.',
                    'type'        => 'string',
                    'enum'        => ['active', 'archived'],
                    'context'     => ['view', 'edit'],
                    'default'     => 'active',
                ],
            ],
        ];

        return $this->add_additional_fields_schema($this->schema);
    }

    // Format item for response — respect context
    public function prepare_item_for_response($item, $request) {
        $fields = $this->get_fields_for_response($request);
        $data   = [];

        if (rest_is_field_included('id', $fields)) {
            $data['id'] = $item->id;
        }
        if (rest_is_field_included('title', $fields)) {
            $data['title'] = $item->title;
        }
        if (rest_is_field_included('status', $fields)) {
            $data['status'] = $item->status;
        }

        $response = rest_ensure_response($data);
        $response->add_links($this->prepare_links($item));

        return $response;
    }

    // Collection query params
    public function get_collection_params() {
        $params = parent::get_collection_params(); // Adds page, per_page, search
        $params['status'] = [
            'default'     => 'active',
            'type'        => 'string',
            'enum'        => ['active', 'archived', 'any'],
            'description' => 'Filter by status.',
        ];
        return $params;
    }
}

// Register the controller
add_action('rest_api_init', function() {
    $controller = new My_Items_Controller();
    $controller->register_routes();
});
```

### Schema Caching Performance

Caching schema in `$this->schema` yields ~40% performance improvement for collection responses. Always check for cached schema first. Use `get_endpoint_args_for_item_schema($method)` to auto-generate endpoint arguments from your schema.

---

## register_rest_field()

Add custom fields to existing core endpoints without modifying them.

```php
add_action('rest_api_init', function() {
    register_rest_field('post', 'reading_time', [
        'get_callback'    => function($post_arr, $field_name, $request) {
            $content = get_post_field('post_content', $post_arr['id']);
            $words = str_word_count(strip_tags($content));
            return max(1, ceil($words / 200));
        },
        'update_callback' => function($value, $post, $field_name) {
            update_post_meta($post->ID, '_reading_time_override', absint($value));
        },
        'schema' => [
            'type'        => 'integer',
            'description' => 'Estimated reading time in minutes.',
            'context'     => ['view', 'edit'],
        ],
    ]);
});
```

### Supported Object Types

The first parameter (`$object_type`) accepts:
- Post type slugs: `'post'`, `'page'`, `'my_cpt'`
- `'comment'`
- `'user'`
- `'term'`

### Read-Only and Write-Only Fields

```php
// Read-only: set update_callback to null
register_rest_field('post', 'word_count', [
    'get_callback'    => function($post_arr) { /* ... */ },
    'update_callback' => null,
    'schema'          => ['type' => 'integer', 'readonly' => true],
]);

// Write-only: set get_callback to null
register_rest_field('post', 'notify_subscribers', [
    'get_callback'    => null,
    'update_callback' => function($value, $post) { /* send notifications */ },
    'schema'          => ['type' => 'boolean'],
]);
```

---

## register_meta()

Expose meta fields in the REST API via `show_in_rest`.

### Post Meta

```php
register_post_meta('post', 'price', [
    'type'              => 'number',
    'single'            => true,
    'show_in_rest'      => true,
    'default'           => 0,
    'sanitize_callback' => 'floatval',
    'auth_callback'     => function() { return current_user_can('edit_posts'); },
]);
```

### User Meta

```php
register_meta('user', 'preferred_language', [
    'type'         => 'string',
    'single'       => true,
    'show_in_rest' => true,
]);
```

### Term Meta

```php
register_term_meta('category', 'icon', [
    'type'         => 'string',
    'single'       => true,
    'show_in_rest' => true,
]);
```

### Complex Meta with Schema (WP 5.3+)

```php
register_post_meta('product', 'pricing', [
    'single'       => true,
    'type'         => 'object',
    'show_in_rest' => [
        'schema' => [
            'type'       => 'object',
            'properties' => [
                'regular'   => ['type' => 'number'],
                'sale'      => ['type' => 'number'],
                'currency'  => ['type' => 'string', 'enum' => ['USD', 'EUR', 'GBP']],
                'on_sale'   => ['type' => 'boolean'],
            ],
        ],
    ],
]);

// Array of objects
register_post_meta('event', 'speakers', [
    'single'       => false, // Returns array
    'type'         => 'object',
    'show_in_rest' => [
        'schema' => [
            'type'       => 'object',
            'properties' => [
                'name'  => ['type' => 'string'],
                'bio'   => ['type' => 'string'],
                'photo' => ['type' => 'integer'], // Media ID
            ],
        ],
    ],
]);
```

### Protected Meta Keys

Meta keys starting with `_` (underscore) are protected. They require an explicit `auth_callback` to be readable/writable:

```php
register_post_meta('post', '_internal_score', [
    'type'          => 'integer',
    'single'        => true,
    'show_in_rest'  => true,
    'auth_callback' => function() {
        return current_user_can('edit_posts');
    },
]);
```

### CPT Requirement

Custom post types must declare `custom-fields` in their `supports` array for meta to appear:

```php
register_post_type('book', [
    'supports'     => ['title', 'editor', 'custom-fields'],
    'show_in_rest' => true,
]);
```

---

## Response Objects

### WP_REST_Response

```php
$response = new WP_REST_Response($data, 200);

// Set headers
$response->header('X-Custom-Header', 'value');
$response->header('Cache-Control', 'max-age=300');

// Add links (HAL-style)
$response->add_links([
    'self'       => ['href' => rest_url('myplugin/v1/items/' . $item->id)],
    'collection' => ['href' => rest_url('myplugin/v1/items')],
    'author'     => [
        'href'       => rest_url('wp/v2/users/' . $item->author),
        'embeddable' => true, // Can be inlined with _embed
    ],
]);
```

### Pagination in Collection Responses

```php
public function get_items($request) {
    $per_page = $request['per_page'];
    $page     = $request['page'];

    $items = $this->query_items($request);
    $total = $this->count_items($request);

    $response = rest_ensure_response(
        array_map([$this, 'prepare_item_for_response'], $items, array_fill(0, count($items), $request))
    );

    $response->header('X-WP-Total', $total);
    $response->header('X-WP-TotalPages', ceil($total / $per_page));

    // Add pagination links
    $base = add_query_arg(urlencode_deep($request->get_query_params()), rest_url($this->namespace . '/' . $this->rest_base));
    if ($page > 1) {
        $response->link_header('prev', add_query_arg('page', $page - 1, $base));
    }
    if ($page < ceil($total / $per_page)) {
        $response->link_header('next', add_query_arg('page', $page + 1, $base));
    }

    return $response;
}
```

---

## Schema Definition

JSON Schema (draft-04) defines the shape of your endpoint's data. Used for:
- Self-documentation (OPTIONS responses)
- Auto-generating endpoint arguments via `get_endpoint_args_for_item_schema()`
- Field filtering via `_fields` parameter
- Context-based field visibility

### Full Schema Example

```php
public function get_item_schema() {
    return [
        '$schema'    => 'http://json-schema.org/draft-04/schema#',
        'title'      => 'my-item',
        'type'       => 'object',
        'properties' => [
            'id' => [
                'description' => 'Unique identifier.',
                'type'        => 'integer',
                'context'     => ['view', 'edit', 'embed'],
                'readonly'    => true,
            ],
            'title' => [
                'description' => 'The item title.',
                'type'        => 'string',
                'context'     => ['view', 'edit'],
                'required'    => true,
                'minLength'   => 1,
                'maxLength'   => 200,
            ],
            'content' => [
                'description' => 'The item content.',
                'type'        => 'object',
                'context'     => ['view', 'edit'],
                'properties'  => [
                    'raw' => [
                        'type'    => 'string',
                        'context' => ['edit'], // Only in edit context
                    ],
                    'rendered' => [
                        'type'     => 'string',
                        'context'  => ['view', 'edit'],
                        'readonly' => true,
                    ],
                ],
            ],
            'status' => [
                'description' => 'Publication status.',
                'type'        => 'string',
                'enum'        => ['active', 'draft', 'archived'],
                'default'     => 'draft',
                'context'     => ['view', 'edit'],
            ],
            'metadata' => [
                'description' => 'Additional metadata.',
                'type'        => 'object',
                'context'     => ['edit'],
                'properties'  => [
                    'source' => ['type' => 'string'],
                    'tags'   => [
                        'type'  => 'array',
                        'items' => ['type' => 'string'],
                    ],
                ],
            ],
        ],
    ];
}
```

### Context Values

- `view` — Default public context. Safe for unauthenticated responses.
- `edit` — Full data. Requires authentication. Includes raw content, protected fields.
- `embed` — Minimal representation for `_embed` responses. Only essential fields.
