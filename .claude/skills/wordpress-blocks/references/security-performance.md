# Security & Performance Best Practices

**Purpose:** Essential security and performance checklist for WordPress 6.8+ custom blocks.

## Security Checklist

### Input Sanitization & Validation

**Always sanitize user input:**
```php
// In render.php or dynamic block callback
$title = sanitize_text_field( $attributes['title'] );
$url = esc_url( $attributes['url'] );
$html = wp_kses_post( $attributes['content'] );
```

**Common sanitization functions:**
- `sanitize_text_field()` - Text input
- `sanitize_textarea_field()` - Textarea
- `sanitize_email()` - Email addresses
- `esc_url()` - URLs
- `absint()` - Positive integers
- `wp_kses_post()` - HTML with safe tags
- `wp_kses()` - Custom allowed tags

### Output Escaping

**Always escape output:**
```php
// Text
<p><?php echo esc_html( $title ); ?></p>

// Attributes
<div class="<?php echo esc_attr( $className ); ?>">

// URLs
<a href="<?php echo esc_url( $link ); ?>">

// HTML
<div><?php echo wp_kses_post( $content ); ?></div>

// JavaScript
<script>
var data = <?php echo wp_json_encode( $data ); ?>;
</script>
```

### Nonces & AJAX

**Always use nonces for AJAX:**
```php
// Server-side initialization
wp_interactivity_state('namespace/block', [
  'ajaxUrl' => admin_url( 'admin-ajax.php' ),
  'nonce' => wp_create_nonce( 'my_action_nonce' )
]);
```

**AJAX handler:**
```php
function my_ajax_handler() {
  check_ajax_referer( 'my_action_nonce', 'nonce' );
  
  // Verify capabilities
  if ( ! current_user_can( 'edit_posts' ) ) {
    wp_send_json_error( 'Insufficient permissions' );
  }
  
  // Sanitize input
  $post_id = absint( $_POST['post_id'] );
  
  // Process...
  
  wp_send_json_success( $data );
}
add_action( 'wp_ajax_my_action', 'my_ajax_handler' );
add_action( 'wp_ajax_nopriv_my_action', 'my_ajax_handler' ); // If public
```

### Capability Checks

```php
// Check user capabilities
if ( ! current_user_can( 'edit_posts' ) ) {
  return '';
}

// Post-specific checks
if ( ! current_user_can( 'edit_post', $post_id ) ) {
  return '';
}
```

### SQL Queries (if needed)

**Always use $wpdb->prepare():**
```php
global $wpdb;

// BAD - SQL injection vulnerability
$results = $wpdb->get_results( 
  "SELECT * FROM {$wpdb->posts} WHERE post_author = {$author_id}" 
);

// GOOD - Prepared statement
$results = $wpdb->get_results( $wpdb->prepare(
  "SELECT * FROM {$wpdb->posts} WHERE post_author = %d",
  $author_id
) );
```

### File Upload Security

```php
// Validate file type
$allowed_types = ['image/jpeg', 'image/png'];
if ( ! in_array( $file['type'], $allowed_types ) ) {
  return new WP_Error( 'invalid_type', 'Invalid file type' );
}

// Use WordPress functions
$upload = wp_handle_upload( $file, [ 'test_form' => false ] );
```

## Performance Checklist

### Asset Loading

**Only load when needed:**
```php
function enqueue_block_assets() {
  // Only on pages with the block
  if ( ! has_block( 'namespace/block-name' ) ) {
    return;
  }
  
  wp_enqueue_style(
    'namespace-block-style',
    plugin_dir_url( __FILE__ ) . 'build/style.css',
    [],
    filemtime( plugin_dir_path( __FILE__ ) . 'build/style.css' )
  );
}
add_action( 'wp_enqueue_scripts', 'enqueue_block_assets' );
```

### Optimize Images

```php
// Use responsive images
$image_html = wp_get_attachment_image(
  $attachment_id,
  'large',
  false,
  [
    'loading' => 'lazy',
    'decoding' => 'async'
  ]
);
```

### Query Optimization

**Cache expensive queries:**
```php
function get_block_data( $args ) {
  $cache_key = 'block_data_' . md5( serialize( $args ) );
  $data = wp_cache_get( $cache_key );
  
  if ( false === $data ) {
    $query = new WP_Query( $args );
    $data = $query->posts;
    wp_cache_set( $cache_key, $data, '', HOUR_IN_SECONDS );
  }
  
  return $data;
}
```

**Limit query results:**
```php
$query_args = [
  'post_type' => 'post',
  'posts_per_page' => 10, // Don't fetch unlimited
  'no_found_rows' => true, // Skip pagination count if not needed
  'update_post_meta_cache' => false, // Skip meta if not needed
  'update_post_term_cache' => false, // Skip terms if not needed
];
```

### Lazy Loading

**Defer non-critical JavaScript:**
```php
wp_enqueue_script(
  'namespace-block-script',
  plugins_url( 'build/view.js', __FILE__ ),
  [],
  filemtime( plugin_dir_path( __FILE__ ) . 'build/view.js' ),
  [ 'strategy' => 'defer' ] // WordPress 6.3+
);
```

### Database Schema

**Index custom tables:**
```php
global $wpdb;
$table_name = $wpdb->prefix . 'custom_table';

$sql = "CREATE TABLE $table_name (
  id bigint(20) NOT NULL AUTO_INCREMENT,
  user_id bigint(20) NOT NULL,
  data text NOT NULL,
  created datetime NOT NULL,
  PRIMARY KEY  (id),
  KEY user_id (user_id), -- Index for faster queries
  KEY created (created)
);";

require_once ABSPATH . 'wp-admin/includes/upgrade.php';
dbDelta( $sql );
```

### Frontend Performance

**CSS optimization:**
```scss
// Use CSS containment
.wp-block-namespace-custom-block {
  contain: layout style paint;
}

// Minimize specificity
.custom-block {
  // Good
}

.site .content .wp-block-namespace-custom-block {
  // Bad - too specific
}
```

**JavaScript optimization:**
```typescript
// Debounce expensive operations
import { debounce } from '@wordpress/compose';

const debouncedSearch = debounce((query) => {
  // Expensive search operation
}, 300);
```

### Server-Side Rendering

**Cache rendered output:**
```php
function render_block( $attributes ) {
  $cache_key = 'block_render_' . md5( serialize( $attributes ) );
  $output = wp_cache_get( $cache_key );
  
  if ( false === $output ) {
    ob_start();
    // Render block
    $output = ob_get_clean();
    wp_cache_set( $cache_key, $output, '', HOUR_IN_SECONDS );
  }
  
  return $output;
}
```

## Common Vulnerabilities

### ❌ XSS (Cross-Site Scripting)
```php
// BAD
<div><?php echo $user_input; ?></div>

// GOOD
<div><?php echo esc_html( $user_input ); ?></div>
```

### ❌ CSRF (Cross-Site Request Forgery)
```php
// BAD
if ( $_POST['action'] === 'delete' ) {
  wp_delete_post( $_POST['post_id'] );
}

// GOOD
if ( check_ajax_referer( 'delete_post_nonce', 'nonce', false ) ) {
  wp_delete_post( absint( $_POST['post_id'] ) );
}
```

### ❌ SQL Injection
```php
// BAD
$wpdb->query( "DELETE FROM $wpdb->posts WHERE ID = {$_POST['id']}" );

// GOOD
$wpdb->query( $wpdb->prepare( 
  "DELETE FROM $wpdb->posts WHERE ID = %d", 
  absint( $_POST['id'] ) 
) );
```

### ❌ Path Traversal
```php
// BAD
$file = file_get_contents( $_GET['file'] );

// GOOD
$allowed_files = ['file1.txt', 'file2.txt'];
$file_name = sanitize_file_name( $_GET['file'] );
if ( in_array( $file_name, $allowed_files ) ) {
  $file = file_get_contents( $file_name );
}
```

## Testing

### Security Testing
```bash
# WordPress Coding Standards (includes security checks)
composer require --dev wp-coding-standards/wpcs
phpcs --standard=WordPress path/to/block/
```

### Performance Testing
```bash
# Query Monitor plugin - track slow queries and asset loading
wp plugin install query-monitor --activate

# Xdebug profiling
# Enable in php.ini, analyze with tools like KCachegrind
```

## Quick Pre-Release Checklist

- [ ] All user inputs sanitized
- [ ] All outputs escaped
- [ ] Nonces used for AJAX/forms
- [ ] Capability checks in place
- [ ] SQL queries use prepare()
- [ ] Assets only loaded when needed
- [ ] Expensive queries cached
- [ ] Images optimized and lazy loaded
- [ ] JavaScript deferred/async when possible
- [ ] No console.logs in production
- [ ] Testing with Query Monitor
- [ ] PHPCS passes WordPress standards

## Resources

- [WordPress Data Validation](https://developer.wordpress.org/plugins/security/data-validation/)
- [WordPress Security White Paper](https://wordpress.org/about/security/)
- [WordPress Coding Standards](https://developer.wordpress.org/coding-standards/wordpress-coding-standards/)
- [Query Monitor Plugin](https://wordpress.org/plugins/query-monitor/)
