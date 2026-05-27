# Content APIs

Custom post types, taxonomies, Settings API, admin menus, shortcodes, widgets, cron, i18n, HTTP, filesystem, rewrite, heartbeat, and enqueuing.

## Custom Post Types

Register on `init` (never earlier). **Max 20-char slug**, never prefix with `wp_`.

```php
add_action( 'init', 'acme_register_product_cpt' );
function acme_register_product_cpt() {
    register_post_type( 'acme_product', array(
        'labels'              => array( /* full translated label set */ ),
        'public'              => true,
        'show_in_rest'        => true,              // required for Gutenberg
        'rest_base'           => 'products',
        'rest_controller_class' => 'WP_REST_Posts_Controller',
        'supports'            => array( 'title','editor','thumbnail','excerpt','custom-fields','revisions' ),
        'has_archive'         => true,
        'rewrite'             => array( 'slug' => 'products', 'with_front' => false ),
        'capability_type'     => array( 'product', 'products' ),
        'map_meta_cap'        => true,
        'menu_icon'           => 'dashicons-cart',
        'menu_position'       => 20,
        'template'            => array( array( 'core/heading' ), array( 'core/paragraph' ) ),
        'template_lock'       => false,
    ) );
}
```

`supports => false` removes even the editor, leaving only the submit meta box. For Gutenberg meta boxes, set `'__block_editor_compatible_meta_box' => true`.

**Flush rewrite rules ONLY on activation/deactivation, never on `init`:**

```php
register_activation_hook( __FILE__, function() {
    acme_register_product_cpt();   // must run so rules exist
    flush_rewrite_rules();
});
```

## Taxonomies

```php
register_taxonomy( 'course', array( 'post' ), array(
    'hierarchical'      => true,     // false = tag-like
    'labels'            => $labels,
    'show_ui'           => true,
    'show_admin_column' => true,
    'show_in_rest'      => true,
    'rest_base'         => 'courses',
    'rewrite'           => array( 'slug' => 'course' ),
    'capabilities'      => array(
        'manage_terms' => 'manage_categories',
        'edit_terms'   => 'manage_categories',
        'delete_terms' => 'manage_categories',
        'assign_terms' => 'edit_posts',
    ),
) );
```

Max slug 32 chars. Avoid reserved query vars (`name`, `year`, `author`, `type`, etc.).

Connect later: `register_taxonomy_for_object_type( 'course', 'acme_product' )`. Manipulate terms: `wp_set_object_terms()`, `wp_get_object_terms()`, `wp_remove_object_terms()`. Term meta API parallels post meta.

## Block Bindings (WP 6.5+)

`register_block_bindings_source()` lets a plugin expose data to any core block that supports bindings (paragraph `content`, image `url`/`alt`, button `text`/`url`, post-date `datetime`, etc.) — no custom block required. Register on `init`.

```php
add_action( 'init', function () {
    register_block_bindings_source( 'acme/product-price', array(
        'label'              => __( 'Product Price', 'acme' ),
        'get_value_callback' => function ( array $args, WP_Block $block, string $attr ) {
            $id = $args['product_id'] ?? $block->context['postId'] ?? null;
            return $id ? get_post_meta( $id, '_price', true ) : null;
        },
        'uses_context'       => array( 'postId' ),
    ) );
} );
```

Content authors connect blocks via `metadata.bindings` in serialized markup. Core extends the bindable-attribute list via the `block_bindings_supported_attributes` filter (global) or `block_bindings_supported_attributes_{$block_type}` (per-block).

New in **WP 6.9**: `core/post-data` and `core/term-data` sources provide post/taxonomy fields out of the box — prefer these over rolling your own for standard fields.

For the full binding object schema and the list of bindable attributes per core block, see the `wordpress-blocks` skill's `references/block-json-schema.md` §Block Bindings.

## Block Hooks (WP 6.4+)

Block Hooks auto-insert a block next to an "anchor" block in templates, template parts, patterns, or content. Declared in `block.json`:

```json
{ "blockHooks": { "core/post-content": "after" } }
```

Positions: `before`, `after`, `firstChild`, `lastChild`. PHP filters `hooked_block_types`, `hooked_block`, and `hooked_block_{$type}` (in `wp-includes/blocks.php`) let plugins gate or mutate insertions per context. Users opt out per-instance via `metadata.ignoredHookedBlocks` on the anchor.

See `wordpress-blocks/references/block-json-schema.md` §Block Hooks for full semantics.

## Settings API

Three concepts: **settings** (options), **sections** (groups), **fields** (inputs). Register on `admin_init`.

```php
register_setting( 'acme', 'acme_options', array(
    'type'              => 'array',
    'sanitize_callback' => 'acme_sanitize',
    'default'           => array( 'pill' => 'blue' ),
    'show_in_rest'      => array( 'schema' => array( /* ... */ ) ),
) );
add_settings_section( 'acme_main', __( 'Main', 'acme' ), 'acme_main_cb', 'acme' );
add_settings_field( 'acme_pill', __( 'Pill', 'acme' ), 'acme_pill_cb', 'acme', 'acme_main', array( 'label_for' => 'acme_pill' ) );
```

Render form pointing to `options.php` (core-handled, with nonce + cap + sanitization pipeline):

```php
<form action="options.php" method="post">
    <?php
    settings_fields( 'acme' );       // option_group
    do_settings_sections( 'acme' );  // page slug
    submit_button();
    ?>
</form>
```

**Anti-pattern:** POSTing Settings-API forms to your own page — you lose the nonce/cap/sanitize pipeline that `options.php` provides.

## Admin menus

```php
add_action( 'admin_menu', function() {
    $hook = add_menu_page(
        __( 'Acme', 'acme' ),         // page title
        __( 'Acme', 'acme' ),         // menu label
        'manage_options',             // capability
        'acme',                       // slug
        'acme_render_page',           // callback
        'dashicons-star-filled',      // icon
        80.123                        // non-round float avoids collisions
    );
    add_action( "load-{$hook}", 'acme_page_load' );  // fires before output
});
```

**Helpers:** `add_options_page`, `add_management_page`, `add_theme_page`, `add_users_page`, `add_dashboard_page`, `add_plugins_page`, `add_posts_page`, `add_media_page`, `add_comments_page`, `add_links_page`, `add_pages_page`.

Remove menus on higher priority: `remove_menu_page( 'tools.php' )`. Screen options: `add_screen_option()` + the `set-screen-option` filter. Help tabs: `get_current_screen()->add_help_tab()`.

### Admin notices

Hooks: `admin_notices`, `all_admin_notices`, `network_admin_notices`, `user_admin_notices`. Classes: `notice-success`, `notice-error`, `notice-warning`, `notice-info`; add `is-dismissible`.

**The page callback must recheck `current_user_can()`** — hiding a menu doesn't prevent direct URL access.

## Shortcodes

```php
add_shortcode( 'acme_cta', function( $atts, $content = null, $tag = '' ) {
    $a = shortcode_atts( array( 'title' => 'Default' ), (array) $atts, $tag );
    $out  = '<div class="acme-cta"><h2>' . esc_html( $a['title'] ) . '</h2>';
    if ( ! is_null( $content ) ) {
        $out .= '<div>' . do_shortcode( wp_kses_post( $content ) ) . '</div>';
    }
    return $out . '</div>';
} );
```

- **Always return, never echo** — shortcodes are filters on `the_content`. Echoing breaks ordering.
- Prefix tags.
- For new work prefer blocks. Shortcodes remain useful for RSS/email contexts and backward compatibility.

## Widgets (legacy)

`WP_Widget` subclasses still work but are replaced by blocks (WP 5.8+ block widgets). Required methods: `__construct` (calls `parent::__construct`), `widget($args, $instance)` (frontend render), `form($instance)` (admin form), `update($new, $old)` (sanitize). Register on `widgets_init`: `register_widget( 'My_Widget_Class' )`. Use `$this->get_field_id()` / `$this->get_field_name()` in form fields.

## Cron & scheduled events

```php
register_activation_hook( __FILE__, function() {
    if ( ! wp_next_scheduled( 'acme_cron' ) ) {
        wp_schedule_event( time(), 'hourly', 'acme_cron' );
    }
});
add_action( 'acme_cron', 'acme_do_cron' );
register_deactivation_hook( __FILE__, function() {
    wp_clear_scheduled_hook( 'acme_cron' );
});
```

Default recurrences: `hourly`, `twicedaily`, `daily`, `weekly`. Add custom via `cron_schedules` filter (merge into existing, don't replace).

**WP-Cron is NOT a real cron** — it fires on page loads. Heavy caching or low traffic delays events. Production pattern:

```php
define( 'DISABLE_WP_CRON', true );  // in wp-config.php
// Then: */5 * * * * curl -s https://example.com/wp-cron.php >/dev/null
```

**Always guard with `wp_next_scheduled()`** before `wp_schedule_event()` — otherwise you queue thousands of duplicates.

For high-volume jobs (hundreds+ per day), use **Action Scheduler** (see `architectures.md`).

## Internationalization (i18n)

**Text domain rules:** matches plugin slug, lowercase with hyphens, literal string (no variable). Since WP 4.6, wp.org-hosted plugins get translations auto-loaded — don't call `load_plugin_textdomain()` for those.

**WP 6.7+ just-in-time loading gotcha:** calling translation functions before `after_setup_theme` has fired emits `_doing_it_wrong` (added in 6.7.0) and returns untranslated text. The warning tells developers to move calls to `init` or later. Block `block.json` and plugin headers are still auto-translated.

### Functions

| Function | Purpose |
|----------|---------|
| `__()` | Return translation |
| `_e()` | Echo translation |
| `_x()` / `_ex()` | With disambiguation context |
| `_n()` / `_nx()` | Plural |
| `_n_noop()` | Register plural for later resolution |
| `esc_html__` / `esc_html_e` / `esc_attr__` / `esc_attr_e` | Translate + escape |
| `number_format_i18n`, `date_i18n` | Locale-aware formatting |

Always number placeholders with `%1$s`, `%2$s` so translators can reorder. Translator comment must be on the line immediately before the translation call:

```php
printf(
    /* translators: 1: site name, 2: user name */
    __( 'Welcome to %1$s, %2$s!', 'acme' ),
    $site, $name
);
```

### JS translations

```php
wp_enqueue_script( 'acme-app', $url, array( 'wp-i18n' ), $ver, true );
wp_set_script_translations( 'acme-app', 'acme', plugin_dir_path( __FILE__ ) . 'languages' );
```

```js
import { __, _n, sprintf } from '@wordpress/i18n';
```

WP-CLI: `wp i18n make-pot`, `wp i18n make-json`, `wp i18n make-mo`, `wp i18n make-php` (WP 6.5+ `.l10n.php` is faster than `.mo`).

## HTTP API

```php
$r = wp_safe_remote_get( $url, array(
    'timeout' => 15,
    'headers' => array( 'Authorization' => 'Bearer ' . $token ),
) );
if ( is_wp_error( $r ) ) { /* ... */ }
$code = wp_remote_retrieve_response_code( $r );
$body = wp_remote_retrieve_body( $r );
```

Use `wp_safe_remote_*` variants for user-supplied URLs (SSRF protection). Retrieval helpers: `wp_remote_retrieve_body/response_code/headers/cookies`. Arbitrary methods via `wp_remote_request( $url, array( 'method' => 'DELETE' ) )`. **Never** `'sslverify' => false`.

## Filesystem API

Never use `file_put_contents` on WP-owned directories. Use `WP_Filesystem`:

```php
function acme_write( $path, $contents ) {
    global $wp_filesystem;
    require_once ABSPATH . 'wp-admin/includes/file.php';
    $creds = request_filesystem_credentials( $form_url, '', false, false, null );
    if ( false === $creds ) { return false; }
    if ( ! WP_Filesystem( $creds ) ) { return false; }
    return $wp_filesystem->put_contents( $path, $contents, FS_CHMOD_FILE );
}
```

**Methods:** `put_contents`, `get_contents`, `exists`, `mkdir`, `rmdir`, `delete`, `copy`, `move`, `chmod`.
**Constants:** `FS_CHMOD_FILE` (0644), `FS_CHMOD_DIR` (0755).
**Defines:** `FS_METHOD`, `FTP_HOST`, `FTP_USER`, `FTP_PASS`.

## Rewrite API

```php
add_action( 'init', function() {
    add_rewrite_rule(
        '^reports/([0-9]{4})/([0-9]{2})/?$',
        'index.php?pagename=reports&report_year=$matches[1]&report_month=$matches[2]',
        'top'
    );
});
add_filter( 'query_vars', fn( $v ) => array_merge( $v, array( 'report_year', 'report_month' ) ) );
```

`add_rewrite_tag()`, `add_rewrite_endpoint()` with `$places` bitmask (`EP_PERMALINK | EP_PAGES`), `add_permastruct()`. **Flush only on activation/deactivation.**

## Heartbeat API

Default interval: 60s (configurable 1–3600s via the `heartbeat_settings` filter or `wp.heartbeat.interval()` in JS, which also supports a short-lived `'fast'` 5-second mode). Post-lock refresh ticks at 120s. Autosave in the post editor fires every 15s independently of Heartbeat. Filters: `heartbeat_settings` (interval, allowed locations), `heartbeat_received` (logged in), `heartbeat_nopriv_received` (anonymous). JS events on `document`: `heartbeat-send`, `heartbeat-tick`, `heartbeat-connection-lost`, `heartbeat-connection-restored`.

## JavaScript & CSS enqueuing

```php
wp_enqueue_script( $handle, $src, $deps, $ver, $args );
// $args keys:
//   'in_footer' => bool                        (6.3+)
//   'strategy'  => 'defer' | 'async'           (6.3+)
//   'fetchpriority' => 'high' | 'low' | 'auto' (6.9+)
wp_enqueue_style( $handle, $src, $deps, $ver, $media );
```

**Hook timing:** `wp_enqueue_scripts` (frontend), `admin_enqueue_scripts` (admin, receives `$hook_suffix`), `enqueue_block_editor_assets` (editor only), `enqueue_block_assets` (editor + frontend), `login_enqueue_scripts`.

**Core dependency handles:** `jquery`, `wp-element` (React), `wp-components`, `wp-blocks`, `wp-block-editor`, `wp-editor`, `wp-data`, `wp-api-fetch`, `wp-i18n`, `wp-hooks`, `wp-dom-ready`, `wp-compose`, `wp-plugins`, `wp-edit-post`.

### `.asset.php` pattern (generated by `@wordpress/scripts`)

```php
$asset = include __DIR__ . '/build/index.asset.php';
wp_enqueue_script( 'acme-editor', plugins_url( 'build/index.js', __FILE__ ),
    $asset['dependencies'], $asset['version'], true );
```

### Passing PHP data to JS

Prefer `wp_add_inline_script()` (preserves types) over `wp_localize_script()` (coerces everything to strings):

```php
wp_add_inline_script( 'acme-admin',
    'window.AcmeData = ' . wp_json_encode( array(
        'restUrl' => rest_url( 'acme/v1/' ),
        'nonce'   => wp_create_nonce( 'wp_rest' ),
    ) ) . ';',
    'before'
);
```

**Note:** Script Modules (WP 6.5+) are a separate system from classic scripts. `wp_localize_script` does not apply to them — pass data via `wp_interactivity_state` or inline `<script type="module">`. For block-specific enqueuing and the full Interactivity/Script Modules story, see the `wordpress-blocks` and `wordpress-interactivity` skills.
