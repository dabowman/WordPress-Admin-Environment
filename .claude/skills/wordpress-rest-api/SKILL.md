---
name: wordpress-rest-api
description: WordPress REST API development for building headless frontends, managing WordPress sites programmatically, and replicating wp-admin functionality via API. Use when working with WordPress REST API endpoints, fetching or mutating WordPress content via HTTP, authenticating against the REST API, creating custom REST endpoints, building headless/decoupled WordPress applications, performing bulk operations via API, managing plugins/themes/users/settings/menus/templates via API, or any task involving /wp-json/ or wp/v2 endpoints. Also trigger when the user mentions REST API authentication (Application Passwords, nonce, JWT), WP_REST_Controller, register_rest_route, register_rest_field, batch operations, or headless WordPress patterns with Next.js/Nuxt/React. If the user wants to do anything with WordPress data from outside wp-admin — reading, writing, or managing — use this skill.
---

# WordPress REST API

Complete reference for the WordPress REST API (WordPress 6.5+; current: 6.9, released December 2, 2025). Covers all core endpoints, authentication, custom endpoint development, batch operations, headless architecture patterns, and full wp-admin automation via API.

## ⚠ Verify before asserting

WordPress ships twice yearly. Before claiming a route doesn't exist, an arg is unsupported, or a response field is missing, check the live source — don't rely on training data:

| Surface | Live source |
|---|---|
| REST API reference | `https://developer.wordpress.org/rest-api/reference/` |
| REST API handbook | `https://developer.wordpress.org/rest-api/` |
| Per-release dev-notes | `https://make.wordpress.org/core/tag/dev-notes/` |
| Live `/wp-json/` index of a target site | `GET <site>/wp-json/` |
| Application Passwords | `https://developer.wordpress.org/rest-api/reference/application-passwords/` |

A positive claim from this skill's references is fine; negative claims need a live check.

## When to Use This Skill

```
Does your task involve any of these?

  ├─ Fetching WordPress content for a frontend app → YES
  ├─ Creating/updating/deleting posts, pages, media, users → YES
  ├─ Authenticating against the WordPress REST API → YES
  ├─ Building custom REST API endpoints → YES
  ├─ Managing plugins, themes, menus, widgets, settings via API → YES
  ├─ Batch/bulk operations against WordPress → YES
  ├─ Building a headless WordPress frontend (Next.js, Nuxt, etc.) → YES
  ├─ Replicating wp-admin functionality programmatically → YES
  └─ None of the above → This skill probably isn't needed
```

## Quick Reference — Where to Look

| Question | Reference |
|---|---|
| What endpoints exist? What fields/params do they accept? | `references/core-endpoints.md` |
| How do I authenticate? Application Passwords? Nonces? | `references/authentication.md` |
| How do I build custom endpoints or extend existing ones? | `references/custom-endpoints.md` |
| What hooks/filters modify REST API behavior? | `references/hooks-filters.md` |
| How do I build a headless frontend with WordPress? | `references/headless-patterns.md` |
| What's the REST API equivalent of a wp-admin screen? | `references/wp-admin-mapping.md` |

---

## Core Architecture (Essential Context)

### Root Endpoint and Discovery

The API root at `/wp-json/` returns the full index: site info, namespaces, routes, and authentication methods. Use `/?rest_route=/` if pretty permalinks are disabled.

**Discovery methods** (find the API root from any WordPress page):
- HTTP `Link` header: `Link: <https://example.com/wp-json/>; rel="https://api.w.org/"`
- HTML `<link>` element: `<link rel='https://api.w.org/' href='...' />`
- OPTIONS request on any endpoint returns self-documentation

### Namespaces

| Namespace | Purpose | Since |
|---|---|---|
| `wp/v2` | All core content and management endpoints | 4.7 |
| `oembed/1.0` | oEmbed provider | 4.4 |
| `wp-site-health/v1` | Site Health async tests | 5.6 |
| `batch/v1` | Batch processing framework | 5.6 |
| `wp-block-editor/v1` | Site export, URL details, navigation fallback | 5.9 |
| `wp-abilities/v1` | Abilities API — discover & execute abilities | 6.9 |

Custom endpoints must use their own namespace (`myplugin/v1`). Never add routes to `wp/v2`.

### Global Parameters

These work on every endpoint:

| Parameter | Purpose |
|---|---|
| `_fields` | Return only specified fields. **Single biggest performance optimization.** Supports nested: `_fields=meta.key` |
| `_embed` | Embed linked resources inline. Selective since WP 5.4: `_embed=author,wp:term` |
| `context` | Field visibility: `view` (default/public), `edit` (all fields, requires auth), `embed` (minimal). For unfiltered HTML (e.g. ToC plugins, raw post content), pair `?context=edit` with `_fields=content.raw` to keep responses small while still bypassing default rendering filters. |
| `page` / `per_page` | Pagination. 1-indexed. Max `per_page` is **100** |
| `offset` | Skip N items (alternative to `page`) |
| `order` / `orderby` | Sort direction (`asc`/`desc`) and field (`date`, `id`, `title`, `slug`, `modified`, `relevance`) |
| `search` | Full-text search |
| `exclude` / `include` | Filter by IDs |
| `slug` | Filter by slug(s) |
| `_envelope` | Wrap response in `{ status, headers, body }` — always returns HTTP 200 |
| `_method` | HTTP method override (POST only) |

### Pagination

All collection endpoints return:
- `X-WP-Total` header — total records
- `X-WP-TotalPages` header — total pages
- `Link` header with `rel="next"` and `rel="prev"` URIs

Requesting beyond the last page returns **400**. Follow `Link` header URIs rather than constructing pagination manually.

### Response Format

Responses include HAL-style `_links` with relation types (`self`, `collection`, `author`, `replies`, `wp:featuredmedia`, `wp:term`). Links marked `embeddable: true` are inlined when `_embed` is used.

### Error Format

```json
{
  "code": "rest_forbidden",
  "message": "Sorry, you are not allowed to do that.",
  "data": { "status": 403 }
}
```

Common codes: `rest_forbidden` (403), `rest_no_route` (404), `rest_invalid_param` (400), `rest_not_logged_in` (401), `rest_post_invalid_id` (404), `rest_cookie_invalid_nonce` (403).

---

## Authentication — Key Concepts

Full details in `references/authentication.md`.

**Decision tree:**

```
Where is the client running?

  ├─ External app / CLI / server-to-server
  │  └─ Use Application Passwords (Basic Auth with app password)
  │     Requires HTTPS. Built into WP 5.6+. No plugins needed.
  │
  ├─ Same-origin JavaScript (wp-admin, block editor, frontend with cookies)
  │  └─ Use Cookie + Nonce authentication
  │     wp_create_nonce('wp_rest') → X-WP-Nonce header
  │
  ├─ Client-side app (SPA, mobile) needing delegated auth
  │  └─ Use JWT (plugin required) or OAuth
  │
  └─ Development/testing only
     └─ Basic Auth plugin (never in production)
```

**Quick Application Password example:**
```bash
curl --user "admin:xxxx xxxx xxxx xxxx xxxx xxxx" \
  https://example.com/wp-json/wp/v2/posts?context=edit
```

**Quick Nonce example:**
```javascript
fetch(wpApiSettings.root + 'wp/v2/posts', {
    credentials: 'include',
    headers: { 'X-WP-Nonce': wpApiSettings.nonce }
});
```

---

## Core Endpoints — Overview

Full field-level details, parameters, and capabilities in `references/core-endpoints.md`.

### Content endpoints (public read, auth for write)

| Endpoint | Route | Key Operations |
|---|---|---|
| Posts | `/wp/v2/posts` | Full CRUD, revisions, autosaves, meta, status transitions |
| Pages | `/wp/v2/pages` | Full CRUD, hierarchy via `parent`, `menu_order` |
| Media | `/wp/v2/media` | Upload (multipart/binary), edit images, manage sizes |
| Comments | `/wp/v2/comments` | CRUD, moderation (approve/hold/spam/trash), threading |
| Categories | `/wp/v2/categories` | Hierarchical taxonomy CRUD |
| Tags | `/wp/v2/tags` | Flat taxonomy CRUD |
| Search | `/wp/v2/search` | Cross-content-type search |
| Post Types | `/wp/v2/types` | Introspect registered post types |
| Post Statuses | `/wp/v2/statuses` | Introspect post statuses |
| Taxonomies | `/wp/v2/taxonomies` | Introspect registered taxonomies |

### Management endpoints (auth required)

| Endpoint | Route | Key Operations |
|---|---|---|
| Users | `/wp/v2/users` | CRUD, roles, `/users/me`, app passwords |
| Settings | `/wp/v2/settings` | Site title, timezone, reading settings, etc. |
| Plugins | `/wp/v2/plugins` | List, install, activate, deactivate, delete |
| Themes | `/wp/v2/themes` | List, activate |

### Full Site Editing endpoints

| Endpoint | Route | Key Operations |
|---|---|---|
| Templates | `/wp/v2/templates` | Block template CRUD |
| Template Parts | `/wp/v2/template-parts` | Header/footer/sidebar parts |
| Global Styles | `/wp/v2/global-styles/<id>` | theme.json style overrides |
| Navigation | `/wp/v2/navigation` | Block-based nav menus |
| Menus | `/wp/v2/menus` | Classic nav menus |
| Menu Items | `/wp/v2/menu-items` | Individual menu entries |
| Font Families | `/wp/v2/font-families` | Font Library (WP 6.5+) |
| Widgets | `/wp/v2/widgets` | Widget CRUD |
| Sidebars | `/wp/v2/sidebars` | Widget area management |

### Block ecosystem endpoints

| Endpoint | Route | Purpose |
|---|---|---|
| Block Types | `/wp/v2/block-types` | List registered block types |
| Reusable Blocks | `/wp/v2/blocks` | Synced Patterns (`wp_block` CPT) |
| Block Patterns | `/wp/v2/block-patterns/patterns` | Registered patterns |
| Pattern Categories | `/wp/v2/block-patterns/categories` | Pattern categories |
| Block Directory | `/wp/v2/block-directory/search` | Search WordPress.org blocks |

### Infrastructure endpoints

| Endpoint | Route | Purpose |
|---|---|---|
| Batch | `/batch/v1` | Multi-request in one call (WP 5.6+) |
| Site Health | `/wp-site-health/v1/tests/*` | Async health checks |
| App Passwords | `/wp/v2/users/{id}/application-passwords` | Manage app passwords |

---

## Common Patterns

### Fetch all posts with pagination

```javascript
async function fetchAllPosts(wpUrl) {
    let all = [], page = 1, totalPages = 1;
    while (page <= totalPages) {
        const res = await fetch(
            `${wpUrl}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,slug,date`
        );
        totalPages = parseInt(res.headers.get('X-WP-TotalPages'), 10);
        all = all.concat(await res.json());
        page++;
    }
    return all;
}
```

### Create post with featured image

```javascript
// Step 1: Upload image
const form = new FormData();
form.append('file', imageFile);
const media = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
    method: 'POST', headers: { Authorization: auth }, body: form
}).then(r => r.json());

// Step 2: Create post with featured_media
const post = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
        title: 'My Post', content: '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->',
        status: 'publish', featured_media: media.id
    })
}).then(r => r.json());
```

### Batch operations (up to 25 requests per call)

```javascript
const res = await fetch(`${wpUrl}/wp-json/batch/v1`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
        validation: 'normal', // or 'require-all-validate'
        requests: [
            { method: 'POST', path: '/wp/v2/posts', body: { title: 'Post 1', status: 'draft' } },
            { method: 'PATCH', path: '/wp/v2/posts/42', body: { title: 'Updated' } },
            { method: 'DELETE', path: '/wp/v2/posts/99?force=true' }
        ]
    })
});
// Returns 207 Multi-Status with ordered responses array
```

### Optimize requests

1. **Always use `_fields`** — skip unneeded fields and their database queries
2. **Use selective `_embed`** — `_embed=author,wp:term` instead of bare `_embed`
3. **Use batch endpoint** — combine writes into single HTTP calls
4. **Follow `Link` headers** — don't compute pagination URLs manually

---

## Custom Endpoint Development — Key Concepts

Full details in `references/custom-endpoints.md`.

```php
add_action('rest_api_init', function() {
    register_rest_route('myplugin/v1', '/items/(?P<id>[\d]+)', [
        [
            'methods'             => 'GET',
            'callback'            => 'get_item_callback',
            'permission_callback' => '__return_true',
            'args' => [
                'id' => ['type' => 'integer', 'required' => true, 'sanitize_callback' => 'absint'],
            ],
        ],
        [
            'methods'             => 'POST, PUT, PATCH',
            'callback'            => 'update_item_callback',
            'permission_callback' => function() { return current_user_can('edit_posts'); },
        ],
    ]);
});
```

Key rules:
- Always provide `permission_callback` (mandatory since WP 5.5)
- Use `validate_callback` and `sanitize_callback` on all arguments
- Extend `WP_REST_Controller` for complex endpoints
- Use `register_rest_field()` to add fields to existing endpoints
- Use `register_post_meta()` with `show_in_rest => true` for meta fields

---

## Key Reminders

1. **`_fields` is your best friend** — always use it to reduce payload and skip expensive computation
2. **Application Passwords for external clients** — built-in, no plugins, requires HTTPS
3. **Cookie+nonce for same-origin JS** — nonce is mandatory, without it requests are treated as unauthenticated
4. **`per_page` max is 100** — paginate for larger datasets
5. **DELETE usually needs `force=true`** — without it, posts go to trash; media/terms have no trash
6. **User deletion requires `reassign`** — both `force=true` and `reassign=<user_id>` are mandatory
7. **Menus are private by default** — use `rest_menu_read_access` filter (WP 6.8+) for headless access
8. **Meta keys starting with `_` are protected** — need explicit `auth_callback` to expose
9. **Batch endpoint: 25 max, no GET** — only POST/PUT/PATCH/DELETE, routes must opt-in

## When Stuck

1. **What endpoints exist and what do they accept?** → `references/core-endpoints.md`
2. **How do I authenticate?** → `references/authentication.md`
3. **How do I build custom endpoints?** → `references/custom-endpoints.md`
4. **How do I modify API responses?** → `references/hooks-filters.md`
5. **How do I build a headless frontend?** → `references/headless-patterns.md`
6. **What's the API equivalent of this admin screen?** → `references/wp-admin-mapping.md`
