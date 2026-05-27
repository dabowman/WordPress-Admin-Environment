# Headless WordPress Patterns

Architecture patterns, integration strategies, and practical recipes for decoupled WordPress frontends.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Next.js Integration](#nextjs-integration)
3. [Data Fetching Patterns](#data-fetching-patterns)
4. [Draft Preview](#draft-preview)
5. [ISR and Cache Invalidation](#isr-and-cache-invalidation)
6. [Menus and Navigation](#menus-and-navigation)
7. [SEO Data](#seo-data)
8. [Dynamic Routing](#dynamic-routing)
9. [Authentication in Frontend Apps](#authentication-in-frontend-apps)
10. [WPGraphQL Comparison](#wpgraphql-comparison)
11. [Performance Patterns](#performance-patterns)

---

## Architecture Overview

```
┌─────────────────┐     JSON      ┌─────────────────────┐
│   WordPress     │◄────────────► │   Frontend App      │
│   (wp-admin +   │   REST API    │   (Next.js / Nuxt / │
│    REST API)    │               │    React / Vue)      │
└─────────────────┘               └─────────────────────┘
        │                                   │
   Content DB                         CDN / Edge
   Media files                        Static assets
   Plugins                            SSR / SSG pages
```

**WordPress responsibilities:** Content management, media storage, user auth, plugin ecosystem.
**Frontend responsibilities:** Rendering, routing, caching, SEO output, client-side interactivity.

### Key Decisions

| Decision | Recommendation |
|---|---|
| Auth for public reads | None needed — published content is public |
| Auth for previews | Application Passwords or JWT |
| Menu access | Enable `rest_menu_read_access` filter (WP 6.8+) |
| Image optimization | Use WordPress-generated sizes or next/image with source_url |
| SEO | Yoast REST fields or custom meta endpoint |

---

## Next.js Integration

### WordPress client library

```typescript
// lib/wordpress.ts
const WP_URL = process.env.WORDPRESS_URL; // https://cms.example.com
const WP_AUTH = process.env.WP_APP_PASSWORD
    ? 'Basic ' + Buffer.from(process.env.WP_APP_PASSWORD).toString('base64')
    : undefined;

interface FetchOptions {
    auth?: boolean;
    revalidate?: number;
    tags?: string[];
}

export async function wpFetch<T>(
    path: string,
    { auth = false, revalidate = 300, tags = [] }: FetchOptions = {}
): Promise<T> {
    const headers: Record<string, string> = {};
    if (auth && WP_AUTH) {
        headers['Authorization'] = WP_AUTH;
    }

    const res = await fetch(`${WP_URL}/wp-json${path}`, {
        headers,
        next: { revalidate, tags },
    });

    if (!res.ok) {
        throw new Error(`WP API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

// Typed helpers
export async function getPosts(params: Record<string, string> = {}) {
    const query = new URLSearchParams({
        per_page: '10',
        _embed: 'author,wp:term,wp:featuredmedia',
        _fields: 'id,slug,title,excerpt,date,_links,_embedded',
        ...params,
    });
    return wpFetch<WPPost[]>(`/wp/v2/posts?${query}`, { tags: ['posts'] });
}

export async function getPostBySlug(slug: string) {
    const posts = await wpFetch<WPPost[]>(
        `/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed`,
        { tags: ['posts'] }
    );
    return posts[0] ?? null;
}

export async function getPages() {
    return wpFetch<WPPage[]>(
        '/wp/v2/pages?per_page=100&_fields=id,slug,title,parent,menu_order',
        { tags: ['pages'] }
    );
}

export async function getSettings() {
    return wpFetch<WPSettings>('/wp/v2/settings', { auth: true, tags: ['settings'] });
}
```

### Dynamic routes

```typescript
// app/[slug]/page.tsx
import { getPostBySlug, getPosts } from '@/lib/wordpress';
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
    const posts = await getPosts({ per_page: '100', _fields: 'slug' });
    return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage({ params }: { params: { slug: string } }) {
    const post = await getPostBySlug(params.slug);
    if (!post) notFound();

    return (
        <article>
            <h1 dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
            <div dangerouslySetInnerHTML={{ __html: post.content.rendered }} />
        </article>
    );
}
```

---

## Data Fetching Patterns

### Fetch all items with automatic pagination

```typescript
async function fetchAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
    let all: T[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        const query = new URLSearchParams({ ...params, per_page: '100', page: String(page) });
        const res = await fetch(`${WP_URL}/wp-json${path}?${query}`);

        totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
        const data: T[] = await res.json();
        all = all.concat(data);
        page++;
    }

    return all;
}

// Usage
const allPosts = await fetchAll<WPPost>('/wp/v2/posts', { _fields: 'id,slug,title,date' });
const allCategories = await fetchAll<WPCategory>('/wp/v2/categories');
```

### Parallel fetching for page data

```typescript
// Fetch everything a page needs in parallel
async function getPageData(slug: string) {
    const [post, menus, settings] = await Promise.all([
        getPostBySlug(slug),
        wpFetch<WPMenu[]>('/wp/v2/menus'),
        wpFetch<WPSettings>('/wp/v2/settings', { auth: true }),
    ]);
    return { post, menus, settings };
}
```

### Embedded data extraction

```typescript
// Extract embedded author from _embedded response
function getAuthor(post: WPPost): WPUser | null {
    return post._embedded?.author?.[0] ?? null;
}

// Extract featured image
function getFeaturedImage(post: WPPost) {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    if (!media) return null;
    return {
        src: media.source_url,
        alt: media.alt_text,
        width: media.media_details?.width,
        height: media.media_details?.height,
        sizes: media.media_details?.sizes,
    };
}

// Extract terms (categories, tags)
function getTerms(post: WPPost, taxonomy: string = 'category') {
    const termSets = post._embedded?.['wp:term'] ?? [];
    return termSets.flat().filter((t: any) => t.taxonomy === taxonomy);
}
```

---

## Draft Preview

Enable content editors to preview unpublished content on the frontend.

### WordPress side

```php
// Redirect preview clicks to the Next.js app
add_filter('preview_post_link', function($link, $post) {
    $frontend_url = 'https://app.example.com';
    $secret = defined('PREVIEW_SECRET') ? PREVIEW_SECRET : '';
    return add_query_arg([
        'secret'  => $secret,
        'slug'    => $post->post_name,
        'post_id' => $post->ID,
    ], $frontend_url . '/api/preview');
}, 10, 2);
```

### Next.js API route

```typescript
// app/api/preview/route.ts
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const slug = searchParams.get('slug');
    const postId = searchParams.get('post_id');

    // Validate the secret
    if (secret !== process.env.PREVIEW_SECRET) {
        return new Response('Invalid token', { status: 401 });
    }

    // Verify the post exists (authenticated request)
    const res = await fetch(
        `${process.env.WORDPRESS_URL}/wp-json/wp/v2/posts/${postId}?_fields=slug`,
        { headers: { Authorization: `Basic ${Buffer.from(process.env.WP_APP_PASSWORD!).toString('base64')}` } }
    );

    if (!res.ok) {
        return new Response('Post not found', { status: 404 });
    }

    // Enable draft mode and redirect
    (await draftMode()).enable();
    redirect(`/${slug}`);
}
```

### Fetch draft content in page component

```typescript
export default async function PostPage({ params }: { params: { slug: string } }) {
    const { isEnabled } = await draftMode();

    let post;
    if (isEnabled) {
        // Fetch draft/revision with auth
        const posts = await wpFetch<WPPost[]>(
            `/wp/v2/posts?slug=${params.slug}&status=draft,publish,pending,future&_embed`,
            { auth: true, revalidate: 0 }
        );
        post = posts[0];
    } else {
        post = await getPostBySlug(params.slug);
    }

    if (!post) notFound();
    // ... render
}
```

---

## ISR and Cache Invalidation

### Time-based revalidation (baseline)

```typescript
// In fetch calls
{ next: { revalidate: 300, tags: ['posts'] } }
```

### On-demand revalidation via webhook

**WordPress side — fire webhook on post status change:**

```php
add_action('transition_post_status', function($new, $old, $post) {
    if ($post->post_type !== 'post') return;
    if (!in_array($new, ['publish', 'trash']) && $old !== 'publish') return;

    $frontend_url = 'https://app.example.com';
    $secret = defined('REVALIDATION_SECRET') ? REVALIDATION_SECRET : '';

    wp_remote_post($frontend_url . '/api/revalidate', [
        'body'    => wp_json_encode([
            'secret' => $secret,
            'tag'    => 'posts',
            'paths'  => ['/', '/' . $post->post_name],
        ]),
        'headers' => ['Content-Type' => 'application/json'],
        'timeout' => 5,
    ]);
}, 10, 3);
```

**Next.js API route:**

```typescript
// app/api/revalidate/route.ts
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(request: Request) {
    const body = await request.json();

    if (body.secret !== process.env.REVALIDATION_SECRET) {
        return new Response('Invalid token', { status: 401 });
    }

    if (body.tag) revalidateTag(body.tag);
    if (body.paths) body.paths.forEach((p: string) => revalidatePath(p));

    return Response.json({ revalidated: true });
}
```

---

## Menus and Navigation

Menus require authentication by default. For headless apps, enable public access (WP 6.8+):

```php
add_filter('rest_menu_read_access', '__return_true');
```

### Fetching menu data

```typescript
// Get primary menu
async function getPrimaryMenu() {
    // Get menu locations to find which menu is assigned
    const locations = await wpFetch<WPMenuLocation[]>('/wp/v2/menu-locations');
    const primaryLocation = locations.find(l => l.name === 'primary');
    if (!primaryLocation?.menu) return [];

    // Get menu items for that menu
    const items = await wpFetch<WPMenuItem[]>(
        `/wp/v2/menu-items?menus=${primaryLocation.menu}&per_page=100&_fields=id,title,url,parent,menu_order`
    );

    return buildMenuTree(items);
}

// Build nested tree from flat menu items
function buildMenuTree(items: WPMenuItem[]): MenuNode[] {
    const map = new Map<number, MenuNode>();
    const roots: MenuNode[] = [];

    // Sort by menu_order
    items.sort((a, b) => a.menu_order - b.menu_order);

    for (const item of items) {
        const node: MenuNode = { ...item, children: [] };
        map.set(item.id, node);

        if (item.parent === 0) {
            roots.push(node);
        } else {
            map.get(item.parent)?.children.push(node);
        }
    }

    return roots;
}
```

### Pre-6.8 workaround (custom endpoint)

```php
add_action('rest_api_init', function() {
    register_rest_route('mytheme/v1', '/menu/(?P<location>[a-z_-]+)', [
        'methods'             => 'GET',
        'callback'            => function($request) {
            $locations = get_nav_menu_locations();
            $location = $request['location'];
            if (!isset($locations[$location])) {
                return new WP_Error('not_found', 'Menu location not found', ['status' => 404]);
            }
            $items = wp_get_nav_menu_items($locations[$location]);
            return rest_ensure_response($items);
        },
        'permission_callback' => '__return_true',
    ]);
});
```

---

## SEO Data

### Yoast SEO REST API fields

When Yoast SEO is active, it automatically adds `yoast_head_json` to post/page responses:

```json
{
  "yoast_head_json": {
    "title": "My Post — Site Name",
    "description": "Meta description text",
    "robots": { "index": "index", "follow": "follow" },
    "og_title": "My Post",
    "og_description": "...",
    "og_image": [{ "url": "...", "width": 1200, "height": 630 }],
    "og_type": "article",
    "article_published_time": "2024-01-15T10:00:00+00:00",
    "schema": { "@context": "https://schema.org", ... }
  }
}
```

### Dedicated Yoast endpoint

```
GET /wp-json/yoast/v1/get_head?url=https://example.com/my-post/
```

### Using in Next.js metadata

```typescript
export async function generateMetadata({ params }: { params: { slug: string } }) {
    const post = await getPostBySlug(params.slug);
    if (!post) return {};

    const seo = post.yoast_head_json;
    return {
        title: seo?.title,
        description: seo?.description,
        openGraph: {
            title: seo?.og_title,
            description: seo?.og_description,
            images: seo?.og_image?.map((img: any) => ({
                url: img.url, width: img.width, height: img.height,
            })),
        },
    };
}
```

### URL rewriting for headless

Yoast generates URLs pointing to WordPress. Rewrite for your frontend domain:

```php
// WordPress side
add_filter('wpseo_canonical', function($canonical) {
    return str_replace('https://cms.example.com', 'https://app.example.com', $canonical);
});
add_filter('wpseo_opengraph_url', function($url) {
    return str_replace('https://cms.example.com', 'https://app.example.com', $url);
});
```

---

## Dynamic Routing

### Build routes from WordPress slugs

```typescript
// Fetch all slugs for static generation
export async function generateStaticParams() {
    const [posts, pages] = await Promise.all([
        fetchAll<WPPost>('/wp/v2/posts', { _fields: 'slug' }),
        fetchAll<WPPage>('/wp/v2/pages', { _fields: 'slug' }),
    ]);

    return [
        ...posts.map(p => ({ slug: [p.slug] })),
        ...pages.map(p => ({ slug: [p.slug] })),
    ];
}
```

### Catch-all route with content type detection

```typescript
// app/[...slug]/page.tsx
export default async function CatchAllPage({ params }: { params: { slug: string[] } }) {
    const slugPath = params.slug.join('/');

    // Try post first, then page
    let post = await wpFetch<WPPost[]>(`/wp/v2/posts?slug=${slugPath}&_embed`).then(p => p[0]);
    if (!post) {
        post = await wpFetch<WPPage[]>(`/wp/v2/pages?slug=${slugPath}&_embed`).then(p => p[0]);
    }
    if (!post) notFound();

    return <ArticleLayout post={post} />;
}
```

---

## Authentication in Frontend Apps

### Token-based flow for user-facing features (comments, profiles)

```typescript
// Login: exchange credentials for JWT
async function login(username: string, password: string) {
    const res = await fetch(`${WP_URL}/wp-json/jwt-auth/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    // Store data.token securely (httpOnly cookie preferred)
    return data;
}

// Authenticated request
async function postComment(token: string, postId: number, content: string) {
    return fetch(`${WP_URL}/wp-json/wp/v2/comments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ post: postId, content }),
    });
}
```

---

## WPGraphQL Comparison

| Aspect | REST API | WPGraphQL |
|---|---|---|
| Setup | Built into core | Plugin required |
| Field selection | `_fields` param (flat) | Native nested selection |
| Related data | `_embed` or multiple requests | Single nested query |
| Custom types | `show_in_rest => true` | `show_in_graphql => true` |
| Caching | Standard HTTP (ETag, Cache-Control) | Requires Smart Cache plugin |
| Batching | `/batch/v1` endpoint | Query batching |
| Ecosystem | Universal plugin support | Growing (ACF, Yoast addons) |
| Learning curve | REST conventions | GraphQL spec |

**Use REST API when:** simpler content models, zero plugin dependencies, WooCommerce, or team unfamiliar with GraphQL.
**Use WPGraphQL when:** complex nested relationships, precise field selection across types, or GraphQL-experienced team.

---

## Performance Patterns

### Always use `_fields`

Restricts which fields are computed and returned. Since WP 6.1, excluding `_links` from `_fields` skips `prepare_links()` entirely.

```
# Bad: fetches and computes everything
/wp/v2/posts

# Good: only what you need
/wp/v2/posts?_fields=id,slug,title,excerpt,date,featured_media
```

### Selective `_embed`

```
# Bad: embeds everything
/wp/v2/posts?_embed

# Good: only author and terms
/wp/v2/posts?_embed=author,wp:term
```

### Parallel requests over sequential

```typescript
// Bad: sequential
const posts = await getPosts();
const menus = await getMenus();
const settings = await getSettings();

// Good: parallel
const [posts, menus, settings] = await Promise.all([
    getPosts(), getMenus(), getSettings()
]);
```

### WordPress-side preloading

For admin/editor JS, use `rest_preload_api_request()` to avoid HTTP overhead:

```php
// Preload data as inline script
$preload_paths = ['/wp/v2/posts?per_page=10', '/wp/v2/users/me'];
$preloaded = array_reduce($preload_paths, 'rest_preload_api_request', []);

wp_add_inline_script(
    'my-admin-script',
    'wp.apiFetch.use(wp.apiFetch.createPreloadingMiddleware(' . wp_json_encode($preloaded) . '));',
    'after'
);
```
