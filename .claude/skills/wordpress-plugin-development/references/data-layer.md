# Data Layer

`$wpdb`, custom tables, options, transients, metadata, privacy, multisite.

## `$wpdb` overview

**Tables:** `$wpdb->posts`, `postmeta`, `comments`, `commentmeta`, `options`, `users`, `usermeta`, `terms`, `termmeta`, `term_taxonomy`, `term_relationships`.

**Multisite globals:** `blogs`, `blogmeta`, `site`, `sitemeta`, `signups`.

Use `$wpdb->prefix` (per-site) and `$wpdb->base_prefix` (network).

**Read helpers:** `get_var`, `get_row`, `get_col`, `get_results` (output types: `OBJECT`, `OBJECT_K`, `ARRAY_A`, `ARRAY_N`).

### CRUD helpers (auto-escape, no prepare needed)

```php
$wpdb->insert( $table, $data, $format );
$wpdb->update( $table, $data, $where, $data_format, $where_format );
$wpdb->delete( $table, $where, $where_format );
$wpdb->replace( $table, $data, $format );
// $wpdb->last_error, $wpdb->insert_id, $wpdb->rows_affected
```

Transactions: raw queries (`START TRANSACTION` / `COMMIT` / `ROLLBACK`). InnoDB required.

## Custom tables with `dbDelta()`

```php
function acme_create_table() {
    global $wpdb;
    $table   = $wpdb->prefix . 'acme_events';
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE $table (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NOT NULL,
        event varchar(100) NOT NULL,
        created datetime NOT NULL,
        PRIMARY KEY  (id),
        KEY user_id (user_id)
    ) $charset;";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql );
    add_option( 'acme_db_version', '1.0.0' );
}
```

### `dbDelta()` strict formatting rules — violating any silently fails

- Each column on its own line.
- **Two spaces** after `PRIMARY KEY` before `(`.
- Use `KEY` (not `INDEX`).
- Indexes must be named: `KEY status (status)`, not `KEY (status)`.
- No backticks on field names.
- For utf8mb4 with a unique varchar key, length ≤ 191.

`dbDelta()` can add missing columns/indexes but cannot reliably drop columns or change types — use explicit `ALTER TABLE` in upgrade routines for those.

## Storage decision matrix

| Use case | Storage |
|----------|---------|
| Small settings | Options (autoload) |
| Large site-wide config | Options (autoload=no) |
| Editorial content with title, taxonomy | CPT + post meta |
| Per-object ad-hoc fields | Meta |
| High-volume relational data requiring indexed queries | Custom table |
| Expensive computations with TTL | Transients |

## Options API

```php
get_option( $name, $default );
add_option( $name, $value, '', $autoload );       // idempotent
update_option( $name, $value, $autoload );
delete_option( $name );
```

**Autoload (WP 6.6+):** `'on'`, `'off'`, `'auto'`, `'auto-on'`, `'auto-off'`. Older values (`'yes'`/`'no'`) map to `'on'`/`'off'`. Default `null` → WP decides based on size heuristics (options >150KB not autoloaded by default).

**WP 6.4+ APIs:** `wp_prime_option_caches( $names )` (single-query bulk fetch), `wp_set_option_autoload()`, `wp_set_options_autoload()`.

**Anti-pattern:** autoloading large options cripples every page load. Stick to small, request-critical data in autoload.

## Transients

```php
set_transient( $key, $value, 6 * HOUR_IN_SECONDS );
$data = get_transient( $key );
if ( false === $data ) { /* recompute */ }
delete_transient( $key );
```

With a persistent object cache (Redis, Memcached), transients live in the cache. Without one, they're stored as paired `_transient_{name}` + `_transient_timeout_{name}` options.

Transients may expire before nominal expiration (eviction, cleanups); always handle the miss case.

**Never store literal `true`/`false`** — `false` is indistinguishable from a miss.

## Metadata API

```php
add_post_meta( $id, $key, $value, $unique = false );
get_post_meta( $id, $key = '', $single = false );
update_post_meta( $id, $key, $value, $prev_value = '' );
delete_post_meta( $id, $key, $value = '' );
// Analogous: *_user_meta, *_term_meta, *_comment_meta
```

Keys starting with `_` are hidden from the Custom Fields UI (convention for internal meta).

### `register_meta()` / `register_post_meta()` / `register_term_meta()`

Required to expose meta in the REST API, schema validation, and Block Bindings:

```php
register_post_meta( 'product', 'release', array(
    'type'         => 'object',
    'single'       => true,
    'show_in_rest' => array(
        'schema' => array(
            'type'       => 'object',
            'properties' => array(
                'version' => array( 'type' => 'string' ),
                'date'    => array( 'type' => 'string', 'format' => 'date' ),
            ),
        ),
    ),
    // auth_callback signature: ( $allowed, $meta_key, $object_id, $user_id, $cap, $caps ).
    'auth_callback' => fn( $allowed, $meta_key, $object_id ) => current_user_can( 'edit_post', $object_id ),
) );
```

For CPTs with REST meta: `'supports' => array( ..., 'custom-fields' )`.

**Meta queries are expensive** because `meta_value` is TEXT and unindexed. For large datasets, use taxonomies, statuses, or custom tables.

## Privacy & GDPR

- Register exporters: `wp_privacy_personal_data_exporters` filter. Callback signature `(string $email, int $page)` returns `array( 'data' => [...], 'done' => bool )`.
- Register erasers: `wp_privacy_personal_data_erasers` filter. Callback returns `array( 'items_removed', 'items_retained', 'messages', 'done' )`.
- Suggest privacy policy content: `wp_add_privacy_policy_content( $plugin_name, $content );` on `admin_init`.
- Anonymization: `wp_privacy_anonymize_data( 'email'|'ip'|'date'|'text'|'url', $value )`.

## Multisite

```php
is_multisite();
is_network_admin();
is_main_site();
switch_to_blog( $id ); /* do work */ restore_current_blog();

// Network-wide options
get_site_option( $name );
update_site_option( $name, $value );

// Per-site options from outside that site
get_blog_option( $id, $name );
update_blog_option( $id, $name, $value );
```

`switch_to_blog()` switches only DB context, not loaded plugins. Always pair with `restore_current_blog()`. User roles are per-site in `wp_usermeta` (`wp_{blog_id}_capabilities`).

### Network-activation iteration

```php
register_activation_hook( __FILE__, 'acme_activate' );
function acme_activate( $network_wide ) {
    if ( is_multisite() && $network_wide ) {
        foreach ( get_sites( array( 'number' => 0 ) ) as $site ) {
            switch_to_blog( $site->blog_id );
            acme_single_activate();
            restore_current_blog();
        }
    } else {
        acme_single_activate();
    }
}
add_action( 'wp_initialize_site', 'acme_on_new_site', 10, 1 );
```

Network menus use the `network_admin_menu` hook with the `manage_network_options` capability. URL helpers: `network_admin_url()`, `admin_url()`, `self_admin_url()`.

**Common mistake:** using `update_option` for network-wide data on multisite saves per-site. Use `update_site_option()`.
