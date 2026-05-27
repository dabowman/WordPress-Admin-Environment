# Core Endpoints Reference

Complete field-level reference for all WordPress REST API endpoints (WordPress 6.5+).

## Table of Contents

1. [Posts](#posts)
2. [Pages](#pages)
3. [Media](#media)
4. [Comments](#comments)
5. [Users](#users)
6. [Categories and Tags](#categories-and-tags)
7. [Custom Post Types and Taxonomies](#custom-post-types-and-taxonomies)
8. [Meta Fields](#meta-fields)
9. [Search](#search)
10. [Settings](#settings)
11. [Plugins](#plugins)
12. [Themes](#themes)
13. [Navigation and Menus](#navigation-and-menus)
14. [Widgets and Sidebars](#widgets-and-sidebars)
15. [Templates and Template Parts](#templates-and-template-parts)
16. [Global Styles](#global-styles)
17. [Block Ecosystem](#block-ecosystem)
18. [Font Library](#font-library)
19. [Site Health](#site-health)
20. [Application Passwords](#application-passwords)
21. [Batch Operations](#batch-operations)

---

## Posts

**Route:** `/wp/v2/posts`

### Operations

| Method | Route | Capability |
|---|---|---|
| GET | `/wp/v2/posts` | Public (published); `edit_posts` for drafts/private |
| POST | `/wp/v2/posts` | `edit_posts`; `publish_posts` for publish status |
| GET | `/wp/v2/posts/<id>` | Public (published) |
| PUT/PATCH | `/wp/v2/posts/<id>` | `edit_post` on that post |
| DELETE | `/wp/v2/posts/<id>` | `delete_post`; without `force=true` → trash |

### Schema Fields

| Field | Type | Context | Notes |
|---|---|---|---|
| `id` | integer | view, edit, embed | Read-only |
| `date` | string (ISO 8601) | view, edit, embed | Local timezone. Future date + publish → `future` status |
| `date_gmt` | string | view, edit | UTC |
| `guid` | object `{raw, rendered}` | view, edit | Read-only. `raw` only in `edit` context |
| `link` | string (URI) | view, edit, embed | Read-only permalink |
| `modified` / `modified_gmt` | string | view, edit | Read-only |
| `slug` | string | view, edit, embed | URL slug |
| `status` | string | view, edit | `publish`, `future`, `draft`, `pending`, `private` |
| `type` | string | view, edit, embed | Read-only. Always `post` for this endpoint |
| `password` | string | edit | Post password (empty = not protected) |
| `permalink_template` | string | edit | Read-only template |
| `generated_slug` | string | edit | Read-only auto-generated slug |
| `title` | object | view, edit, embed | `{raw, rendered}`. `raw` only in `edit` context |
| `content` | object | view, edit | `{raw, rendered, protected, block_version}` |
| `author` | integer | view, edit, embed | User ID |
| `excerpt` | object | view, edit, embed | `{raw, rendered, protected}` |
| `featured_media` | integer | view, edit, embed | Media attachment ID (0 = none) |
| `comment_status` | string | view, edit | `open` or `closed` |
| `ping_status` | string | view, edit | `open` or `closed` |
| `format` | string | view, edit | `standard`, `aside`, `chat`, `gallery`, `link`, `image`, `quote`, `status`, `video`, `audio` |
| `meta` | object | view, edit | Registered meta fields |
| `sticky` | boolean | view, edit | Sticky post flag |
| `template` | string | view, edit | Theme template file |
| `categories` | array of int | view, edit | Category term IDs |
| `tags` | array of int | view, edit | Tag term IDs |
| `class_list` | array of string | view, edit | CSS class names for post container (WP 6.6+). Read-only |

### Collection Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `after` | ISO 8601 | Posts published after this date |
| `before` | ISO 8601 | Posts published before this date |
| `modified_after` | ISO 8601 | Posts modified after (WP 5.7+) |
| `modified_before` | ISO 8601 | Posts modified before (WP 5.7+) |
| `author` | int/array | Filter by author ID(s) |
| `author_exclude` | int/array | Exclude author ID(s) |
| `status` | string | Default `publish`. Use `any` for all statuses (requires auth) |
| `categories` | int/array | Filter by category IDs |
| `categories_exclude` | int/array | Exclude category IDs |
| `tags` | int/array | Filter by tag IDs |
| `tags_exclude` | int/array | Exclude tag IDs |
| `tax_relation` | string | `AND` or `OR` for multiple taxonomy filters |
| `sticky` | boolean | Filter sticky posts |
| `ignore_sticky` | boolean | Whether to ignore sticky posts ordering (default `true`) |
| `search_columns` | array | Columns to search: `post_title`, `post_content`, `post_excerpt` |
| `search_semantics` | string | How to interpret search input. Enum: `exact` |
| `format` | array | Filter by post format(s) (when theme supports post-formats) |

### Revisions

| Method | Route | Notes |
|---|---|---|
| GET | `/wp/v2/posts/<id>/revisions` | List revisions. Requires `edit_post` |
| GET | `/wp/v2/posts/<id>/revisions/<rev_id>` | Single revision |
| DELETE | `/wp/v2/posts/<id>/revisions/<rev_id>?force=true` | `force=true` required (no trashing) |

### Autosaves

| Method | Route | Notes |
|---|---|---|
| GET | `/wp/v2/posts/<id>/autosaves` | List autosaves |
| POST | `/wp/v2/posts/<id>/autosaves` | Create autosave. One per author per post |
| GET | `/wp/v2/posts/<id>/autosaves/<id>` | Single autosave. Includes `preview_link` |

---

## Pages

**Route:** `/wp/v2/pages`

Same CRUD operations as posts. Key differences:

| Field | Type | Notes |
|---|---|---|
| `parent` | integer | Parent page ID. `0` = top-level. Query with `?parent=0` for root pages |
| `menu_order` | integer | Sort order. Use `?orderby=menu_order&order=asc` |
| `template` | string | Page template (theme-dependent) |

**Not available on pages:** `format`, `sticky`, `categories`, `tags`.

Additional query params: `parent`, `parent_exclude`, `menu_order`.

---

## Media

**Route:** `/wp/v2/media`

### Upload Methods

**Method 1 — Raw binary:**
```bash
curl -X POST https://example.com/wp-json/wp/v2/media \
  -H "Authorization: Basic BASE64" \
  -H "Content-Disposition: attachment; filename=\"photo.jpg\"" \
  -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg
```

**Method 2 — Multipart form (includes metadata):**
```bash
curl -X POST https://example.com/wp-json/wp/v2/media \
  -H "Authorization: Basic BASE64" \
  -F "file=@photo.jpg" \
  -F "title=My Photo" \
  -F "alt_text=A mountain view" \
  -F "caption=Shot from the summit"
```

### Schema Fields

| Field | Type | Notes |
|---|---|---|
| `alt_text` | string | Image alt text |
| `caption` | object | `{raw, rendered}` |
| `description` | object | `{raw, rendered}` |
| `media_type` | string | `image` or `file` (audio/video are classified as `file`) |
| `mime_type` | string | e.g., `image/jpeg`, `application/pdf` |
| `media_details` | object | `width`, `height`, `file`, `filesize`, `sizes`, `image_meta` (EXIF/IPTC) |
| `post` | integer | Parent post ID |
| `source_url` | string | Full URL to original file |
| `missing_image_sizes` | array | Sizes not yet generated |
| `filename` | string | Original file name (WP 7.0+). Read-only |
| `filesize` | integer | File size in bytes (WP 7.0+). Read-only |

### Image Sizes in `media_details.sizes`

Standard sizes: `thumbnail` (150×150 cropped), `medium` (300px max), `medium_large` (768px width), `large` (1024px max), `1536x1536`, `2048x2048`, `full`. Plus any custom registered sizes. Sizes larger than the original are omitted.

### Image Editing (WP 5.5+)

**Modern API (WP 6.9+) — `modifiers` array:**
```
POST /wp/v2/media/{id}/edit
Body: {
  "modifiers": [
    { "type": "crop", "args": { "left": 10, "top": 10, "width": 80, "height": 80 } },
    { "type": "rotation", "args": { "angle": 90 } },
    { "type": "flip", "args": { "direction": "horizontal" } }
  ]
}
```

**Legacy API (deprecated since WP 6.9):**
```
POST /wp/v2/media/{id}/edit
Body: { "x": 10, "y": 10, "width": 80, "height": 80, "rotation": 90 }
```

Values are percentages. Creates a **new attachment** — does not modify the original. Requires `upload_files`.

### Delete

`DELETE /wp/v2/media/<id>?force=true` — `force=true` is **required** (media has no trash). Requires `delete_post`.

---

## Comments

**Route:** `/wp/v2/comments`

### Operations

Full CRUD. Moderation via `status` field: `approved`, `hold` (pending), `spam`, `trash`. Setting status requires `moderate_comments`.

### Key Fields

| Field | Type | Notes |
|---|---|---|
| `post` | integer | Associated post ID |
| `parent` | integer | Parent comment for threading (0 = top-level) |
| `author` | integer | User ID (0 for guest) |
| `author_name` | string | Guest commenter name |
| `author_email` | string | `edit` context only |
| `author_ip` | string | `edit` context only |
| `author_user_agent` | string | `edit` context only |
| `content` | object | `{raw, rendered}` |
| `status` | string | `approved`, `hold`, `spam`, `trash` |

### Query Parameters

`post`, `parent`, `parent_exclude`, `author`, `author_email`, `author_exclude`, `status` (default `approve`; `hold`, `spam`, `trash` require auth), `type`, `password` (for password-protected posts), `after`, `before` (ISO 8601 date filters), `order` (`asc`/`desc`), `orderby` (`date`, `date_gmt`, `id`, `include`, `post`, `parent`, `type`).

---

## Users

**Route:** `/wp/v2/users`

### Operations

| Method | Route | Capability |
|---|---|---|
| GET | `/wp/v2/users` | `list_users` for full list; limited public list available |
| POST | `/wp/v2/users` | `create_users` |
| GET | `/wp/v2/users/<id>` | Public for published authors; `edit_users` for full data |
| GET | `/wp/v2/users/me` | Current authenticated user |
| PUT/PATCH | `/wp/v2/users/<id>` | `edit_users` |
| DELETE | `/wp/v2/users/<id>` | `delete_users`. **Both** `force=true` **and** `reassign=<user_id>` required |

### Key Fields

| Field | Type | Context | Notes |
|---|---|---|---|
| `username` | string | edit | Required for creation. Immutable. |
| `name` | string | view, edit, embed | Display name |
| `first_name` | string | edit | First name |
| `last_name` | string | edit | Last name |
| `email` | string | edit | Required for creation |
| `url` | string (URI) | view, edit, embed | User website URL |
| `description` | string | view, edit, embed | Biographical info |
| `link` | string (URI) | view, edit, embed | Read-only. Author archive URL |
| `locale` | string | edit | User locale (e.g., `en_US`, empty = site default) |
| `nickname` | string | edit | Nickname |
| `slug` | string | view, edit, embed | URL slug for author archive |
| `roles` | array | edit | e.g., `["editor"]`. Requires `promote_users` to change |
| `password` | string | (write-only) | Required for creation |
| `capabilities` | object | edit | Read-only expanded capabilities |
| `extra_capabilities` | object | edit | Read-only. Additional capabilities beyond role |
| `registered_date` | string | edit | Read-only |
| `avatar_urls` | object | view, edit, embed | Gravatar URLs at multiple sizes |
| `meta` | object | view, edit | Registered user meta |

### Query Parameters

`roles`, `capabilities`, `who=authors` (only users with posts), `has_published_posts`, `slug`, `search_columns` (WP 6.8+: `email`, `name`, `id`, `username`, `slug`).

Additional standard collection params: `exclude`, `include`, `offset`, `order` (`asc`/`desc`), `orderby` (`id`, `include`, `name`, `registered_date`, `slug`, `include_slugs`, `email`, `url`).

---

## Categories and Tags

### Categories (`/wp/v2/categories`)

Hierarchical taxonomy. Full CRUD requires `manage_categories`. Delete requires `force=true`.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Required for creation |
| `slug` | string | URL slug |
| `parent` | integer | Parent category ID (hierarchy) |
| `description` | string | Category description |
| `count` | integer | Read-only post count |
| `meta` | object | Registered term meta |

Query params: `hide_empty`, `parent`, `post`, `slug`.

### Tags (`/wp/v2/tags`)

Flat taxonomy. Same as categories without `parent` field.

---

## Post Types (Introspection)

**Route:** `/wp/v2/types` — GET only (WP 4.7+)

Lists all registered post types with `show_in_rest`. Public read for `view` context; `edit` context requires `edit_posts`.

| Method | Route | Notes |
|---|---|---|
| GET | `/wp/v2/types` | List all types |
| GET | `/wp/v2/types/<type>` | Single type by slug |

Key fields: `name`, `slug`, `description`, `hierarchical`, `has_archive`, `rest_base`, `rest_namespace`, `supports`, `taxonomies`, `labels`, `icon`, `template`, `template_lock`, `viewable`, `visibility`, `capabilities`.

---

## Post Statuses (Introspection)

**Route:** `/wp/v2/statuses` — GET only (WP 4.7+)

Lists all non-internal post statuses plus `trash`. Public for `view` context; `edit` context requires `edit_posts`.

| Method | Route | Notes |
|---|---|---|
| GET | `/wp/v2/statuses` | List all statuses |
| GET | `/wp/v2/statuses/<status>` | Single status by slug |

Key fields: `name`, `slug`, `public`, `private`, `protected`, `queryable`, `show_in_list`, `date_floating`.

---

## Taxonomies (Introspection)

**Route:** `/wp/v2/taxonomies` — GET only (WP 4.7+)

Lists all taxonomies with `show_in_rest`. Public for `view` context; `edit` context requires `manage_categories` (or equivalent for the taxonomy).

| Method | Route | Notes |
|---|---|---|
| GET | `/wp/v2/taxonomies` | List all. Filter with `?type=<post_type>` |
| GET | `/wp/v2/taxonomies/<taxonomy>` | Single taxonomy by slug |

Key fields: `name`, `slug`, `description`, `hierarchical`, `rest_base`, `rest_namespace`, `types` (associated post types), `labels`, `show_cloud`, `visibility`, `capabilities`.

---

## Custom Post Types and Taxonomies

Register with `show_in_rest => true` to auto-generate endpoints:

```php
register_post_type('book', [
    'public'          => true,
    'show_in_rest'    => true,
    'rest_base'       => 'books',       // → /wp/v2/books
    'rest_namespace'  => 'wp/v2',       // Default
    'rest_controller_class' => 'WP_REST_Posts_Controller', // Default
    'supports'        => ['title', 'editor', 'custom-fields'], // custom-fields needed for meta
]);

register_taxonomy('genre', 'book', [
    'show_in_rest' => true,
    'rest_base'    => 'genres',         // → /wp/v2/genres
]);
```

Add REST support to existing third-party types via filters:

```php
add_filter('register_post_type_args', function($args, $post_type) {
    if ($post_type === 'existing_cpt') {
        $args['show_in_rest'] = true;
        $args['rest_base'] = 'existing-items';
    }
    return $args;
}, 10, 2);
```

---

## Meta Fields

Meta fields appear in the `meta` object of their parent endpoint. Register with `register_post_meta()` or `register_meta()`:

```php
register_post_meta('post', 'price', [
    'type'         => 'number',
    'single'       => true,
    'show_in_rest' => true,
    'default'      => 0,
]);
```

### Complex/Object Types (WP 5.3+)

```php
register_post_meta('post', 'dimensions', [
    'single'       => true,
    'type'         => 'object',
    'show_in_rest' => [
        'schema' => [
            'type'       => 'object',
            'properties' => [
                'width'  => ['type' => 'number'],
                'height' => ['type' => 'number'],
                'unit'   => ['type' => 'string', 'enum' => ['px', 'em', 'rem']],
            ],
        ],
    ],
]);
```

### Rules

- Meta keys prefixed with `_` are **protected** — need explicit `auth_callback` to expose
- CPTs must declare `custom-fields` in their `supports` array
- `single => true` returns a value; `single => false` returns an array
- Available for posts, users, comments, and terms via their respective `register_*_meta()` functions

---

## Search

**Route:** `/wp/v2/search` (GET only)

Cross-content-type search returning simplified results:

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Resource ID |
| `title` | string | Resource title |
| `url` | string | Resource URL |
| `type` | string | `post`, `term`, `post-format` |
| `subtype` | string | Specific type (e.g., `post`, `page`, `category`) |

Parameters: `search`, `type`, `subtype`, `per_page`, `page`. Results ordered by relevance. Extensible via `WP_REST_Search_Handler` and the `wp_rest_search_handlers` filter.

---

## Settings

**Route:** `/wp/v2/settings` (singular resource, not a collection)

All operations require `manage_options`. GET returns current values, PUT updates them.

### Available Settings

| Setting | Type | Equivalent Admin Screen |
|---|---|---|
| `title` | string | General → Site Title |
| `description` | string | General → Tagline |
| `url` | string | General → WordPress Address |
| `email` | string | General → Admin Email |
| `timezone` | string | General → Timezone |
| `date_format` | string | General → Date Format |
| `time_format` | string | General → Time Format |
| `start_of_week` | integer | General → Week Starts On |
| `language` | string | General → Site Language |
| `use_smilies` | boolean | Writing → Emoticons |
| `default_category` | integer | Writing → Default Category |
| `default_post_format` | string | Writing → Default Post Format |
| `posts_per_page` | integer | Reading → Posts per page |
| `show_on_front` | string | Reading → Homepage: `posts` or `page` |
| `page_on_front` | integer | Reading → Homepage page ID |
| `page_for_posts` | integer | Reading → Posts page ID |
| `default_ping_status` | string | Discussion |
| `default_comment_status` | string | Discussion |
| `site_logo` | integer | Media ID for site logo |
| `site_icon` | integer | Media ID for site icon |
| `wp_collaboration_enabled` | boolean | Enable Real-Time Collaboration (WP 6.9+) |

Expose custom options via `register_setting()` with `show_in_rest => true`. Must hook into both `admin_init` and `rest_api_init`.

---

## Plugins

**Route:** `/wp/v2/plugins` (WP 5.5+)

Plugin identifier format: `folder/file` (without `.php`) URL-encoded (e.g., `akismet%2Fakismet`).

| Operation | Method | Body/Params | Capability |
|---|---|---|---|
| List | GET | `?status=active\|inactive`, `?search=term` | `activate_plugins` |
| Install | POST | `{ "slug": "akismet", "status": "active" }` | `install_plugins` |
| Activate | PUT | `{ "status": "active" }` | `activate_plugins` |
| Deactivate | PUT | `{ "status": "inactive" }` | `activate_plugins` |
| Delete | DELETE | Plugin must be inactive first | `delete_plugins` + `activate_plugins` |

---

## Themes

**Route:** `/wp/v2/themes` (WP 5.0+)

| Operation | Method | Capability |
|---|---|---|
| List | GET | `switch_themes` for inactive; active theme is public |
| Activate | PUT `/<stylesheet>` with `{ "status": "active" }` | `switch_themes` |

Key schema fields: `stylesheet`, `template`, `name`, `status`, `is_block_theme`, `theme_supports`, `requires_php`, `requires_wp`.

---

## Navigation and Menus

### Block-based Navigation (`/wp/v2/navigation`) — WP 5.9+

`wp_navigation` post type. Full CRUD. Content is block markup (usually `wp:navigation-link` and `wp:navigation-submenu` blocks).

### Classic Menus (`/wp/v2/menus`) — WP 5.9+

`nav_menu` taxonomy. CRUD. Fields: `name`, `slug`, `description`, `locations` (assigned theme locations), `auto_add` (auto-add new top-level pages).

### Menu Items (`/wp/v2/menu-items`) — WP 5.9+

`nav_menu_item` post type. CRUD. Fields: `title`, `url`, `type` (`taxonomy`/`post_type`/`post_type_archive`/`custom`), `type_label`, `object` (e.g., `page`), `object_id`, `parent`, `menu_order`, `target`, `classes`, `menus` (menu ID).

### Menu Locations (`/wp/v2/menu-locations`)

GET only. Lists theme-registered locations with assigned menu ID.

### Public Menu Access (WP 6.8+)

Menus are **private by default** — all CRUD requires authentication. For headless access:

```php
add_filter('rest_menu_read_access', '__return_true');
```

This makes GET requests on menus, menu-items, and menu-locations publicly accessible.

---

## Widgets and Sidebars

### Widget Types (`/wp/v2/widget-types`) — GET only

Lists registered widget types with their schema.

### Widgets (`/wp/v2/widgets`) — CRUD

Individual widget instances. Fields: `id`, `id_base`, `sidebar`, `rendered` (HTML output), `instance` (serialized settings).

### Sidebars (`/wp/v2/sidebars`) — GET/PUT

Widget areas registered by the theme. Fields: `id`, `name`, `description`, `status` (`active`/`inactive`), `widgets` (array of widget IDs).

---

## Templates and Template Parts

### Templates (`/wp/v2/templates`) — WP 5.9+

Block templates. Full CRUD. Template IDs use `theme-slug//template-name` format.

| Field | Type | Notes |
|---|---|---|
| `slug` | string | Template identifier |
| `theme` | string | Theme stylesheet |
| `type` | string | `wp_template` |
| `source` | string | `theme`, `custom`, or `plugin` |
| `has_theme_file` | boolean | Whether a file exists in theme |
| `content` | object | `{raw, rendered, block_version}` — block markup |
| `title` | object | `{raw, rendered}` |
| `author` | integer | User ID |

### Template Parts (`/wp/v2/template-parts`) — WP 5.9+

Same as templates with additional `area` field: `header`, `footer`, `sidebar`, or custom areas.

Both support revisions via `/wp/v2/templates/<id>/revisions` (WP 6.4+) and autosaves via `/wp/v2/templates/<id>/autosaves` (WP 6.4+).

---

## Global Styles

**Route:** `/wp/v2/global-styles/<id>` — WP 5.9+

GET/PUT for theme.json style overrides. Stored as `wp_global_styles` post type (one per theme).

Key fields: `settings` (theme.json settings object), `styles` (theme.json styles object), `title`. Requires `edit_theme_options`.

Related endpoints:
- `GET /wp/v2/global-styles/themes/<stylesheet>` — read the theme's base theme.json
- `GET /wp/v2/global-styles/<id>/revisions` — revision history (WP 6.3+)

---

## Block Ecosystem

### Block Types (`/wp/v2/block-types`) — GET only (WP 5.5+)

Lists all registered block types. Schema includes `name`, `title`, `description`, `category`, `attributes`, `supports`, `styles`, `variations`, `example`, `editor_script`, `editor_style`, `script`, `style`.

### Reusable Blocks / Synced Patterns (`/wp/v2/blocks`)

`wp_block` post type. Full CRUD. Used for synced patterns in the block editor. Content is block markup.

### Block Patterns (`/wp/v2/block-patterns/patterns`) — GET only (WP 5.9+)

Registered block patterns with `name`, `title`, `content` (block markup), `categories`, `blockTypes`.

### Block Pattern Categories (`/wp/v2/block-patterns/categories`) — GET only

Pattern category names and labels.

### Block Directory (`/wp/v2/block-directory/search`) — GET only (WP 5.5+)

Search the WordPress.org block directory. Param: `term`. Returns installable blocks with `name`, `title`, `description`, `rating`, `active_installs`.

### Block Renderer (`/wp/v2/block-renderer/<namespace>/<name>`) — GET/POST (WP 5.0+)

Server-side render a dynamic block. Pass `attributes` and `post_id` in request body. Returns `rendered` HTML.

---

## Font Library

### Font Families (`/wp/v2/font-families`) — WP 6.5+

`wp_font_family` post type. CRUD. Font settings sent as JSON-encoded string: `name`, `fontFamily`, `slug`. Requires `edit_theme_options`.

### Font Faces (`/wp/v2/font-families/<id>/font-faces`) — WP 6.5+

Child endpoint. GET/POST/DELETE. Upload font files as multipart form data. Fields include `fontWeight`, `fontStyle`, `src`.

### Font Collections (`/wp/v2/font-collections`) — GET only

Browsable font collections (e.g., Google Fonts). Used by the Font Library UI to discover and install fonts.

---

## Site Health

**Route:** `/wp-site-health/v1/tests/*` — WP 5.6+

GET endpoints for async health tests. Requires `view_site_health_checks`.

Available tests: `background-updates`, `loopback-requests`, `https-status`, `dotorg-communication`, `authorization-header`, `page-cache` (WP 6.1+).

---

## Application Passwords

**Route:** `/wp/v2/users/{id}/application-passwords` — WP 5.6+

| Method | Route | Purpose |
|---|---|---|
| GET | `/wp/v2/users/{id}/application-passwords` | List all app passwords |
| POST | `/wp/v2/users/{id}/application-passwords` | Create new (`{ "name": "My App" }`) |
| DELETE | `/wp/v2/users/{id}/application-passwords/<uuid>` | Revoke specific |
| DELETE | `/wp/v2/users/{id}/application-passwords` | Revoke all |

Each entry includes: `uuid`, `name`, `created`, `last_used`, `last_ip`. The password itself is only returned in the POST response (not retrievable later).

---

## Batch Operations

**Route:** `/batch/v1` — WP 5.6+

Send up to **25** write operations in one HTTP request. **GET is not supported.** Routes must opt-in with `allow_batch => ['v1' => true]` (core routes support this since WP 5.9).

```json
POST /wp-json/batch/v1
{
  "validation": "normal",
  "requests": [
    { "method": "POST", "path": "/wp/v2/posts", "body": { "title": "New", "status": "draft" } },
    { "method": "PATCH", "path": "/wp/v2/posts/42", "body": { "title": "Updated" } },
    { "method": "DELETE", "path": "/wp/v2/posts/99?force=true" }
  ]
}
```

Returns **207 Multi-Status** with ordered `responses` array. Each response: `{ body, status, headers }`.

**Validation modes:**
- `"normal"` (default): Each request processed independently. Some may fail, others succeed.
- `"require-all-validate"`: All requests validated first. If any fail validation, entire batch rejected. Note: only validates parameters — does not guarantee callback success.

Max batch size configurable via `rest_get_max_batch_size` filter.
