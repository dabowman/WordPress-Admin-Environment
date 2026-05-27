# Authentication Reference

Complete guide to authenticating against the WordPress REST API.

## Table of Contents

1. [Application Passwords (Recommended)](#application-passwords)
2. [Cookie and Nonce Authentication](#cookie-and-nonce-authentication)
3. [JWT Authentication](#jwt-authentication)
4. [OAuth](#oauth)
5. [Permission Checks and Capabilities](#permission-checks-and-capabilities)
6. [CORS Configuration](#cors-configuration)

---

## Application Passwords

**Recommended for all external/remote API access.** Built into WordPress since 5.6. No plugins required.

### How They Work

24-character alphanumeric passwords (~142 bits entropy), stored as salted hashes in user meta. Each password is scoped to a user and has its own name, UUID, last-used date, and last-IP tracking.

### Creating Application Passwords

**Method 1 — wp-admin UI:**
Users → Profile → Application Passwords section. Enter a name, click "Add New Application Password". The password is displayed once — it cannot be retrieved later.

**Method 2 — Authorization flow redirect:**
Redirect the user to `https://example.com/wp-admin/authorize-application.php` with query params:
- `app_name` (required): Name shown to user
- `success_url`: Redirect URL on approval (receives `user_login` and `password` params)
- `reject_url`: Redirect URL on denial
- `app_id` (UUID): For identifying the application

**Method 3 — REST API:**
```bash
POST /wp/v2/users/me/application-passwords
{ "name": "My Script" }
# Returns the password in the response body (only time it's visible)
```

### Usage

Standard HTTP Basic Auth. Send `Authorization: Basic base64(username:app_password)` with every request:

```bash
# Spaces in the password are stripped automatically
curl --user "admin:xxxx xxxx xxxx xxxx xxxx xxxx" \
  https://example.com/wp-json/wp/v2/posts?context=edit
```

```javascript
const auth = 'Basic ' + btoa('admin:xxxx xxxx xxxx xxxx xxxx xxxx');
const res = await fetch('https://example.com/wp-json/wp/v2/posts', {
    headers: { 'Authorization': auth }
});
```

```php
$response = wp_remote_get('https://example.com/wp-json/wp/v2/posts', [
    'headers' => [
        'Authorization' => 'Basic ' . base64_encode('admin:xxxx xxxx xxxx xxxx xxxx xxxx'),
    ],
]);
```

### Requirements and Caveats

- **HTTPS required by default.** Controllable via `wp_is_application_passwords_available` filter. Can also use `wp_is_application_passwords_available_for_user` to restrict per-user.
- **Cookie conflict:** If WordPress session cookies are present alongside Basic Auth headers, cookie auth takes priority. Without a valid nonce, the request is then treated as unauthenticated. Ensure cookies are not sent from external clients.
- **One user, many passwords:** A user can have multiple application passwords, each for a different app. Revoke individually via UUID.

### Managing Application Passwords via API

```bash
# List all
GET /wp/v2/users/me/application-passwords

# Create
POST /wp/v2/users/me/application-passwords
{ "name": "CLI Script" }

# Revoke specific
DELETE /wp/v2/users/me/application-passwords/<uuid>

# Revoke all
DELETE /wp/v2/users/me/application-passwords
```

---

## Cookie and Nonce Authentication

**For same-origin JavaScript** running in wp-admin, the block editor, or theme frontend scripts where the user is logged in.

### How It Works

The user's WordPress login cookies authenticate the session. But the REST API requires an additional **nonce** (action: `wp_rest`) to confirm the request is intentional. Without the nonce, the request is treated as unauthenticated — even with valid cookies.

### Server-Side Setup

```php
// In your plugin or theme — enqueue script with nonce
add_action('wp_enqueue_scripts', function() {
    wp_enqueue_script('my-app', plugin_dir_url(__FILE__) . 'app.js', [], '1.0', true);
    wp_localize_script('my-app', 'wpApiSettings', [
        'root'  => esc_url_raw(rest_url()),
        'nonce' => wp_create_nonce('wp_rest'),
    ]);
});
```

### Client-Side Usage

**Preferred — X-WP-Nonce header:**
```javascript
fetch(wpApiSettings.root + 'wp/v2/posts/42', {
    method: 'PUT',
    credentials: 'include', // Send cookies
    headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': wpApiSettings.nonce,
    },
    body: JSON.stringify({ title: 'Updated Title' }),
});
```

**Alternative — `_wpnonce` query parameter:**
```javascript
fetch(wpApiSettings.root + 'wp/v2/posts/42?_wpnonce=' + wpApiSettings.nonce, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Updated Title' }),
});
```

### wp.apiFetch (built-in)

WordPress ships `wp-api-fetch` which automatically handles nonce injection and refreshing:

```javascript
import apiFetch from '@wordpress/api-fetch';

// Nonce is auto-configured in wp-admin context
const post = await apiFetch({ path: '/wp/v2/posts/42' });

// Mutations work the same way
await apiFetch({
    path: '/wp/v2/posts',
    method: 'POST',
    data: { title: 'New Post', status: 'draft' },
});
```

### Nonce Lifecycle

- Valid for **24 hours** (two 12-hour ticks)
- User-specific — cannot be shared between users
- Nonce verification is automatic in the REST API — never call `wp_verify_nonce()` manually in your endpoints
- If a nonce expires mid-session, `wp.apiFetch` automatically attempts to refresh it

---

## JWT Authentication

**Plugin required.** Useful for client-side SPAs, mobile apps, or any scenario where you need stateless token-based auth.

### Common Plugin: JWT Authentication for WP REST API

1. Install and activate the plugin
2. Add JWT secret to `wp-config.php`:
   ```php
   define('JWT_AUTH_SECRET_KEY', 'your-random-secret-key');
   define('JWT_AUTH_CORS_ENABLE', true); // Optional: enable CORS
   ```
3. Authenticate:
   ```bash
   POST /wp-json/jwt-auth/v1/token
   { "username": "admin", "password": "password" }
   # Returns: { "token": "eyJ...", "user_email": "...", ... }
   ```
4. Use the token:
   ```bash
   curl -H "Authorization: Bearer eyJ..." \
     https://example.com/wp-json/wp/v2/posts?context=edit
   ```

### Token Validation

```bash
POST /wp-json/jwt-auth/v1/token/validate
Authorization: Bearer eyJ...
# Returns: { "code": "jwt_auth_valid_token", "data": { "status": 200 } }
```

### When to Use JWT vs Application Passwords

| Scenario | Best Choice |
|---|---|
| Server-to-server, CLI scripts | Application Passwords |
| Client-side SPA, mobile app | JWT |
| Same-origin frontend JS | Cookie + Nonce |
| Third-party delegated access | OAuth |

---

## OAuth

**Plugin required.** For delegated authorization where users grant access to third-party apps without sharing credentials.

### OAuth 1.0a

- WordPress OAuth 1.0a Server plugin
- Three-legged flow: request token → user authorization → access token
- Most mature option but complex implementation

### OAuth 2.0

- WordPress OAuth Server or similar plugins
- Standard OAuth 2.0 flows (authorization code, client credentials)
- Better for modern applications

---

## Permission Checks and Capabilities

Every REST API route requires a `permission_callback` (mandatory since WP 5.5). Return `true`, `false`, or `WP_Error`.

### Common Capability Requirements

| Operation | Capability |
|---|---|
| Read published posts | None (public) |
| Read private/draft posts | `read_private_posts` / `edit_posts` |
| Create posts | `edit_posts` |
| Publish posts | `publish_posts` |
| Edit own posts | `edit_posts` |
| Edit others' posts | `edit_others_posts` |
| Delete posts | `delete_posts` |
| Upload files | `upload_files` |
| Manage categories/tags | `manage_categories` |
| Moderate comments | `moderate_comments` |
| Manage options/settings | `manage_options` |
| Create users | `create_users` |
| Edit users | `edit_users` |
| Delete users | `delete_users` |
| Promote users (change roles) | `promote_users` |
| List users | `list_users` |
| Install plugins | `install_plugins` |
| Activate plugins | `activate_plugins` |
| Delete plugins | `delete_plugins` |
| Switch themes | `switch_themes` |
| Edit theme options | `edit_theme_options` |
| View site health | `view_site_health_checks` |

### Permission Callback Patterns

```php
// Public endpoint
'permission_callback' => '__return_true'

// Logged-in users only
'permission_callback' => 'is_user_logged_in'

// Specific capability
'permission_callback' => function() {
    return current_user_can('edit_posts');
}

// Capability on specific post (from route param)
'permission_callback' => function($request) {
    $post = get_post($request['id']);
    if (!$post) return new WP_Error('not_found', 'Post not found', ['status' => 404]);
    return current_user_can('edit_post', $post->ID);
}

// Multiple capabilities
'permission_callback' => function() {
    return current_user_can('edit_posts') && current_user_can('upload_files');
}
```

---

## CORS Configuration

WordPress sends CORS headers via `rest_send_cors_headers()` and `serve_request()`:
- `Access-Control-Allow-Origin: <requesting origin>` (echoes back the `Origin` header — NOT `*`, which would be invalid with credentials)
- `Access-Control-Allow-Methods: OPTIONS, GET, POST, PUT, PATCH, DELETE`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Expose-Headers: X-WP-Total, X-WP-TotalPages, Link` (set by `serve_request()`, not `rest_send_cors_headers()`)

### Restrict to Specific Origins (Production)

```php
remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');

add_filter('rest_pre_serve_request', function($value) {
    $origin = get_http_origin();
    $allowed_origins = [
        'https://app.example.com',
        'https://staging.example.com',
    ];

    if ($origin && in_array($origin, $allowed_origins, true)) {
        header('Access-Control-Allow-Origin: ' . esc_url_raw($origin));
        header('Access-Control-Allow-Methods: OPTIONS, GET, POST, PUT, PATCH, DELETE');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Authorization, X-WP-Nonce, Content-Type');
        header('Access-Control-Expose-Headers: X-WP-Total, X-WP-TotalPages, Link');
        header('Vary: Origin');
    }
    return $value;
});
```

### Preflight Requests

The REST API handles OPTIONS preflight requests automatically. Custom CORS headers must be set before the response is served — use the `rest_pre_serve_request` filter.
