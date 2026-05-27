# wp-admin to REST API Mapping

Complete mapping of WordPress admin screens to their REST API equivalents. Use this to replicate any wp-admin functionality programmatically.

## Table of Contents

1. [Dashboard](#dashboard)
2. [Posts](#posts)
3. [Media](#media)
4. [Pages](#pages)
5. [Comments](#comments)
6. [Appearance](#appearance)
7. [Plugins](#plugins)
8. [Users](#users)
9. [Settings](#settings)
10. [Tools](#tools)
11. [Not Available via REST API](#not-available-via-rest-api)

---

## Dashboard

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| At a Glance — post count | `GET /wp/v2/posts?per_page=1` → read `X-WP-Total` header | Repeat for pages, comments |
| At a Glance — comment count | `GET /wp/v2/comments?per_page=1&status=all` → `X-WP-Total` | |
| Site Health Status | `GET /wp-site-health/v1/tests/background-updates` | Plus: `loopback-requests`, `https-status`, `dotorg-communication`, `page-cache` |
| Site Identity (logo, icon) | `GET /wp/v2/settings` → `site_logo`, `site_icon` | |

---

## Posts

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **All Posts** | `GET /wp/v2/posts?status=any&per_page=20&context=edit` | Requires `edit_posts`. Returns all statuses |
| Filter by status | `?status=publish`, `?status=draft`, `?status=pending`, `?status=trash` | |
| Filter by category | `?categories=5` | Category term ID |
| Filter by author | `?author=3` | User ID |
| Filter by date | `?after=2024-01-01T00:00:00&before=2024-12-31T23:59:59` | ISO 8601 |
| Search | `?search=keyword` | |
| **Add New** | `POST /wp/v2/posts` | `{ title, content, status, categories, tags, featured_media, meta }` |
| **Edit Post** | `PUT /wp/v2/posts/<id>` | Same fields as create |
| **Quick Edit** | `PATCH /wp/v2/posts/<id>` | `{ title, slug, date, status, categories, tags, sticky, password, comment_status, ping_status }` |
| **Bulk Edit** | `POST /batch/v1` | Array of PATCH requests. Max 25 per batch |
| **Move to Trash** | `DELETE /wp/v2/posts/<id>` | Without `force=true` → trash |
| **Restore from Trash** | `PATCH /wp/v2/posts/<id>` | `{ "status": "draft" }` |
| **Delete Permanently** | `DELETE /wp/v2/posts/<id>?force=true` | |
| **View Revisions** | `GET /wp/v2/posts/<id>/revisions` | |
| **Restore Revision** | Content from revision → `PUT /wp/v2/posts/<id>` | No direct restore endpoint; copy content from revision |
| **Delete Revision** | `DELETE /wp/v2/posts/<id>/revisions/<rev_id>?force=true` | |
| **Set Featured Image** | `PATCH /wp/v2/posts/<id>` | `{ "featured_media": <media_id> }` |
| **Remove Featured Image** | `PATCH /wp/v2/posts/<id>` | `{ "featured_media": 0 }` |
| **Set Post Format** | `PATCH /wp/v2/posts/<id>` | `{ "format": "gallery" }` |
| **Schedule Post** | `POST /wp/v2/posts` | `{ "status": "publish", "date": "2025-06-01T10:00:00" }` → auto-sets `future` status |

### Publish Status Workflow

```
Draft → Pending Review → Publish
  ↕         ↕              ↕
Trash ← ← ← ← ← ← ← ← ←

PATCH { "status": "draft" }    → Save as draft
PATCH { "status": "pending" }  → Submit for review
PATCH { "status": "publish" }  → Publish (requires publish_posts)
PATCH { "status": "private" }  → Private (requires publish_posts)
DELETE (no force)              → Trash
DELETE ?force=true             → Permanent delete
```

---

## Media

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **Media Library (list)** | `GET /wp/v2/media?per_page=40` | |
| Filter by type | `?media_type=image`, `?media_type=video`, `?media_type=audio`, `?media_type=application` | |
| Filter by MIME | `?mime_type=image/jpeg` | |
| Search | `?search=filename` | |
| Unattached media | `?parent=0` | Media not attached to any post |
| **Upload New** | `POST /wp/v2/media` | Multipart form or raw binary with `Content-Disposition` header |
| **Edit Media** | `PATCH /wp/v2/media/<id>` | `{ title, alt_text, caption, description }` |
| **Edit Image** | `POST /wp/v2/media/<id>/edit` | `{ x, y, width, height, rotate }` — creates new attachment |
| **Delete** | `DELETE /wp/v2/media/<id>?force=true` | `force=true` required (no trash for media) |
| **Attach to Post** | `PATCH /wp/v2/media/<id>` | `{ "post": <post_id> }` |
| **Detach from Post** | `PATCH /wp/v2/media/<id>` | `{ "post": 0 }` |

### Upload with metadata

```bash
curl -X POST https://example.com/wp-json/wp/v2/media \
  -H "Authorization: Basic BASE64" \
  -F "file=@photo.jpg" \
  -F "title=Mountain View" \
  -F "alt_text=A panoramic mountain landscape" \
  -F "caption=Taken from the summit trail" \
  -F "description=Shot during the July 2024 hike"
```

---

## Pages

Same as Posts except:

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **All Pages** | `GET /wp/v2/pages?status=any&per_page=20&context=edit` | |
| **Page hierarchy** | `?parent=0` for top-level; `?parent=<id>` for children | |
| **Set Parent** | `PATCH /wp/v2/pages/<id>` | `{ "parent": <page_id> }` |
| **Set Page Order** | `PATCH /wp/v2/pages/<id>` | `{ "menu_order": 5 }` |
| **Set Page Template** | `PATCH /wp/v2/pages/<id>` | `{ "template": "templates/full-width.html" }` |
| **Sort by Order** | `?orderby=menu_order&order=asc` | |

---

## Comments

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **All Comments** | `GET /wp/v2/comments?per_page=20&context=edit` | |
| Filter by status | `?status=approve`, `?status=hold`, `?status=spam`, `?status=trash` | |
| Filter by post | `?post=<post_id>` | |
| **Approve** | `PATCH /wp/v2/comments/<id>` | `{ "status": "approved" }` |
| **Unapprove** | `PATCH /wp/v2/comments/<id>` | `{ "status": "hold" }` |
| **Mark as Spam** | `PATCH /wp/v2/comments/<id>` | `{ "status": "spam" }` |
| **Trash** | `PATCH /wp/v2/comments/<id>` | `{ "status": "trash" }` |
| **Delete Permanently** | `DELETE /wp/v2/comments/<id>?force=true` | |
| **Reply** | `POST /wp/v2/comments` | `{ post, content, parent: <comment_id> }` |
| **Edit** | `PATCH /wp/v2/comments/<id>` | `{ content, author_name, author_email }` |
| **Bulk Moderate** | `POST /batch/v1` | Array of PATCH requests with status changes |

---

## Appearance

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **Themes → List** | `GET /wp/v2/themes` | Requires `switch_themes` for inactive themes |
| **Themes → Activate** | `PUT /wp/v2/themes/<stylesheet>` | `{ "status": "active" }` |
| **Menus → List** | `GET /wp/v2/menus` | Auth required unless `rest_menu_read_access` enabled |
| **Menus → Create** | `POST /wp/v2/menus` | `{ name, slug, description }` |
| **Menus → Add Item** | `POST /wp/v2/menu-items` | `{ title, url, type, object, object_id, menus, parent, menu_order }` |
| **Menus → Reorder** | `POST /batch/v1` | PATCH each item's `menu_order` |
| **Menus → Assign Location** | `POST /wp/v2/menus/<id>` | `{ "locations": ["primary"] }` |
| **Menus → Delete** | `DELETE /wp/v2/menus/<id>?force=true` | |
| **Widgets → List Areas** | `GET /wp/v2/sidebars` | |
| **Widgets → Add** | `POST /wp/v2/widgets` | `{ id_base, sidebar, instance }` |
| **Widgets → Update** | `PUT /wp/v2/widgets/<id>` | |
| **Widgets → Remove** | `DELETE /wp/v2/widgets/<id>?force=true` | |
| **Editor → Templates** | `GET /wp/v2/templates` | Block templates |
| **Editor → Template Parts** | `GET /wp/v2/template-parts` | Headers, footers, sidebars |
| **Editor → Edit Template** | `PUT /wp/v2/templates/<id>` | `{ content }` (block markup) |
| **Editor → Global Styles** | `GET/PUT /wp/v2/global-styles/<id>` | theme.json overrides |

---

## Plugins

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **Installed Plugins** | `GET /wp/v2/plugins` | |
| Filter active | `?status=active` | |
| Filter inactive | `?status=inactive` | |
| Search | `?search=seo` | |
| **Install from WP.org** | `POST /wp/v2/plugins` | `{ "slug": "akismet" }` |
| **Install and Activate** | `POST /wp/v2/plugins` | `{ "slug": "akismet", "status": "active" }` |
| **Activate** | `PUT /wp/v2/plugins/<plugin>` | `{ "status": "active" }`. Plugin ID: `folder%2Ffile` (no `.php`) |
| **Deactivate** | `PUT /wp/v2/plugins/<plugin>` | `{ "status": "inactive" }` |
| **Delete** | `DELETE /wp/v2/plugins/<plugin>` | Must be inactive first |
| **Bulk Activate** | `POST /batch/v1` | Array of PUT requests |
| **Bulk Deactivate** | `POST /batch/v1` | Array of PUT requests |
| **Search WP.org** | Not available via REST | Use WordPress.org plugin API directly |

---

## Users

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **All Users** | `GET /wp/v2/users?context=edit` | Requires `list_users` |
| Filter by role | `?roles=editor` | |
| Search | `?search=john` | |
| **Add New** | `POST /wp/v2/users` | `{ username, email, password, roles, first_name, last_name }`. Requires `create_users` |
| **Edit Profile** | `PATCH /wp/v2/users/<id>` | `{ first_name, last_name, email, description, roles, password }` |
| **Edit Own Profile** | `PATCH /wp/v2/users/me` | |
| **Change Role** | `PATCH /wp/v2/users/<id>` | `{ "roles": ["editor"] }`. Requires `promote_users` |
| **Delete User** | `DELETE /wp/v2/users/<id>?force=true&reassign=1` | Both `force` and `reassign` are **mandatory** |
| **Manage App Passwords** | `GET/POST/DELETE /wp/v2/users/<id>/application-passwords` | |

---

## Settings

All settings operations: `GET/PUT /wp/v2/settings`. Requires `manage_options`.

| Admin Screen | Settings Fields |
|---|---|
| **General** | `title`, `description`, `url`, `email`, `timezone`, `date_format`, `time_format`, `start_of_week`, `language` |
| **Writing** | `use_smilies`, `default_category`, `default_post_format` |
| **Reading** | `posts_per_page`, `show_on_front`, `page_on_front`, `page_for_posts` |
| **Discussion** | `default_comment_status`, `default_ping_status` |
| **Site Identity** | `site_logo`, `site_icon` |

### Example: Configure site for static front page

```json
PUT /wp/v2/settings
{
    "show_on_front": "page",
    "page_on_front": 42,
    "page_for_posts": 55,
    "posts_per_page": 12
}
```

---

## Tools

| Admin Action | REST API Equivalent | Notes |
|---|---|---|
| **Site Health** | `GET /wp-site-health/v1/tests/*` | Individual async tests |
| **Export Content** | Not available | Use WP-CLI `wp export` |
| **Import Content** | Not available | Use WP-CLI `wp import` |
| **Erase Personal Data** | Not available | Manual or WP-CLI |
| **Export Personal Data** | Not available | Manual or WP-CLI |

---

## Not Available via REST API

These wp-admin functions have **no built-in REST API equivalent** and require WP-CLI, custom endpoints, or direct WordPress function calls:

| Feature | Alternative |
|---|---|
| WordPress core updates | WP-CLI `wp core update` |
| Plugin/theme updates | WP-CLI `wp plugin update`, `wp theme update` |
| Content import/export (WXR) | WP-CLI `wp export` / `wp import` |
| Permalink structure | Custom endpoint using `update_option()` |
| Privacy tools (data export/erasure) | WP-CLI or custom endpoint |
| Multisite network admin | Custom endpoints with `switch_to_blog()` |
| Plugin/theme file editor | Custom endpoint (security risk — avoid) |
| Database optimization | WP-CLI `wp db optimize` |
| Cron management | WP-CLI `wp cron` or custom endpoint |

### Custom Endpoint Example: Permalink Structure

```php
register_rest_route('mysite/v1', '/permalink-structure', [
    'methods'             => 'PUT',
    'callback'            => function($request) {
        global $wp_rewrite;
        $structure = sanitize_text_field($request['structure']);
        $wp_rewrite->set_permalink_structure($structure);
        flush_rewrite_rules();
        return rest_ensure_response(['structure' => get_option('permalink_structure')]);
    },
    'permission_callback' => function() { return current_user_can('manage_options'); },
    'args'                => [
        'structure' => ['type' => 'string', 'required' => true],
    ],
]);
```
