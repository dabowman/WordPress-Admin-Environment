# Security

Core principle: **sanitize on input, escape on output, always check capability AND nonce before state changes.** Skipping any one of these is a vulnerability.

## Validation vs sanitization vs escaping

Three distinct, non-interchangeable concepts:

- **Validation** — reject data that doesn't match an expected format (preferred when the format is strict: integers, enum values, UUIDs).
- **Sanitization** — clean untrusted input to be safe for storage.
- **Escaping** — make data safe for a specific output context (late — at the point of output).

## Nonces (CSRF protection only — not authentication)

Nonces prove the request came from an intentional user action, not a forged cross-site request. They do not prove the user has the right to do the thing.

```php
// Generate
$nonce = wp_create_nonce( 'save-settings_' . $post->ID );
wp_nonce_field( 'save-settings_' . $post->ID, '_wpnonce' );
$url = wp_nonce_url( $bare_url, 'trash-post_' . $id );

// Verify
wp_verify_nonce( $_POST['_wpnonce'], 'save-settings_' . $post->ID ); // 1, 2, or false
check_admin_referer( 'save-settings_' . $post->ID );                  // dies on fail
check_ajax_referer( 'my-ajax-action', '_wpnonce' );                   // dies on fail
```

Lifetime: 12–24 hours (two ticks). Filter `nonce_life` to change.

**Always pair with `current_user_can()`** — nonces prove intent, capabilities prove authorization.

**Guest nonces gotcha:** logged-out users all share `user_id=0`, so their nonces are identical to each other. Hook `nonce_user_logged_out` to inject a session id for true CSRF protection of anonymous actions.

## Sanitization functions

| Function | Use for |
|----------|---------|
| `sanitize_text_field` | single-line text |
| `sanitize_textarea_field` | multi-line text (preserves newlines) |
| `sanitize_email` | email addresses |
| `sanitize_key` | lowercase alphanumeric + dashes/underscores |
| `sanitize_title` | URL slugs |
| `sanitize_file_name` | filenames |
| `sanitize_hex_color` | `#RGB` / `#RRGGBB` |
| `sanitize_html_class` | CSS class |
| `esc_url_raw` / `sanitize_url` | URL for DB (not output!) |
| `absint` / `(int)` | non-negative / signed integer |
| `wp_kses( $str, $allowed )` | allow specific HTML |
| `wp_kses_post` | allow standard post HTML |

**Always `wp_unslash()` superglobals before sanitizing** — WP applies magic-quote-style slashes to `$_POST`/`$_GET`/`$_REQUEST`/`$_COOKIE`:

```php
$title = sanitize_text_field( wp_unslash( $_POST['title'] ?? '' ) );
```

## Escaping functions (late escape — at the point of output)

| Context | Function |
|---------|----------|
| HTML body | `esc_html` |
| HTML attribute (generic) | `esc_attr` |
| `href` / `src` | `esc_url` |
| Inline JS literal | `esc_js` (or `wp_json_encode`) |
| Textarea | `esc_textarea` |
| XML | `esc_xml` |
| Mixed HTML | `wp_kses` / `wp_kses_post` |
| Translate + escape | `esc_html__`, `esc_attr_e`, `esc_html_x`, etc. |

**`__()` does NOT escape.** Use `esc_html__()` / `esc_attr__()` when interpolating translations into HTML.

**`esc_url_raw` is a sanitizer for DB storage; use `esc_url` for output.**

**`esc_attr()` on `href`/`src` is wrong** — it doesn't block the `javascript:` pseudo-protocol. Use `esc_url()`.

## Capability checks

```php
if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden' ); }
current_user_can( 'edit_post', $post_id );     // object-aware meta-cap
```

**Common capabilities:** `manage_options`, `manage_network_options`, `edit_posts`, `edit_others_posts`, `publish_posts`, `delete_posts`, `upload_files`, `install_plugins`, `activate_plugins`, `edit_users`, `list_users`, `manage_categories`, `unfiltered_html`, `export_others_personal_data`, `erase_others_personal_data`, `manage_privacy_options`, `manage_sites`.

**Anti-pattern:** `if ( is_admin() )` as an authorization check. `is_admin()` only tests whether the request is in `/wp-admin/`, not whether the user has admin rights. Any logged-in subscriber can hit admin-ajax.

## SQL injection prevention — `$wpdb->prepare()`

Placeholders: `%s` (string, auto-quoted), `%d` (int), `%f` (float), `%i` (identifier, WP 6.2+), `%%` (literal `%`).

```php
$wpdb->prepare(
    "SELECT * FROM %i WHERE %i = %s AND %i = %d",
    $wpdb->prefix . 'events', 'status', 'active', 'user_id', 42
);
```

`LIKE` needs explicit wildcards escaped:

```php
$like = '%' . $wpdb->esc_like( $term ) . '%';
$wpdb->prepare( "... LIKE %s", $like );
```

`IN()` clauses need a dynamically built placeholder list:

```php
$placeholders = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
$wpdb->prepare( "... WHERE id IN ($placeholders)", ...$ids );
```

**Never string-interpolate user data into SQL**, even when combined with `prepare()`. Use `%i` or validate against an allowlist for table/column names.

## File uploads & SSRF

- Use `wp_handle_upload()` — never move `$_FILES` manually. Validate MIME via an allowlist passed as `$overrides['mimes']`.
- Use `wp_safe_remote_get()` / `wp_safe_remote_post()` for user-supplied URLs (blocks private IPs via `http_request_host_is_external`).
- Redirects: `wp_safe_redirect()` restricts to allowed hosts; `wp_redirect()` doesn't. For user-supplied redirect targets, use `wp_safe_redirect()`.
- **Never** `'sslverify' => false`. Never `eval`, `extract($_GET)`, or `unserialize` on untrusted data.

## Complete secure handler pattern

Every state-changing handler should look approximately like this:

```php
function acme_handle_save() {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( esc_html__( 'Forbidden', 'acme' ) );
    }
    check_admin_referer( 'acme_save', '_acme_nonce' );

    $title = sanitize_text_field( wp_unslash( $_POST['title'] ?? '' ) );
    $url   = esc_url_raw(        wp_unslash( $_POST['url']   ?? '' ) );
    $bio   = wp_kses_post(       wp_unslash( $_POST['bio']   ?? '' ) );

    update_option( 'acme_settings', compact( 'title', 'url', 'bio' ), false );
}
```

The order matters: cap check first (cheapest way to reject unauthorized users), then nonce (proves intent), then unslash+sanitize each field individually, then persist.
