# `admin.json` Schema — REST API Validation
## What the API actually supports for each application source

---

## Summary

The REST API covers more of wp-admin than most people realize — posts, pages, media, comments, users, settings, plugins, themes, templates, global styles, menus, widgets, and even font management all have REST endpoints. But coverage is uneven. Content management (posts, pages, media) is excellent. System administration (updates, import/export, cron, multisite) has significant gaps. The schema holds up well, but a few application source types need adjustment.

---

## Application source validation

### `core:posts` — Post/Page list (DataViews)

**REST API coverage: Excellent**

The `/wp/v2/posts` and `/wp/v2/pages` endpoints provide everything a DataViews-powered list needs. Full CRUD, filtering by status/category/author/date, search, pagination via `X-WP-Total`/`X-WP-TotalPages` headers, bulk operations via the batch endpoint, and all the metadata fields (title, status, author, date, featured image, categories, tags).

The `config.postType` property in the schema maps cleanly — you just change the endpoint: `/wp/v2/posts`, `/wp/v2/pages`, or `/wp/v2/{custom-post-type}` (any post type registered with `show_in_rest => true`).

Key API features that DataViews would use:
- `_fields=id,title,status,date,author,featured_media` to minimize payload
- `_embed=author,wp:featuredmedia,wp:term` to inline author/image/taxonomy data
- `?status=any&context=edit` for the admin list view
- Batch endpoint for bulk status changes, trash, delete

**Schema adjustment needed: None.** The `config.postType` field is the right abstraction. One consideration: the schema should probably also support `config.status` (default filter) and `config.orderby` (default sort) for cases where a shell config wants to show "Draft Posts" as a distinct nav item.

**Suggested config extension:**
```jsonc
{
  "id": "drafts",
  "source": "core:posts",
  "title": "Drafts",
  "icon": "draft",
  "config": {
    "postType": "post",
    "status": "draft",
    "orderby": "modified"
  }
}
```

### `core:editor` — Block editor

**REST API coverage: Excellent (via @wordpress/edit-post internals)**

The block editor already communicates exclusively through the REST API via `@wordpress/data` stores. `core/editor` uses `/wp/v2/posts/<id>?context=edit` for loading, `PUT /wp/v2/posts/<id>` for saving, `/wp/v2/posts/<id>/autosaves` for autosaving, and `/wp/v2/posts/<id>/revisions` for revision history. Media uploads go through `/wp/v2/media`. The editor's entity resolution system (`core/core-data`) handles all of this transparently.

The shell doesn't need to implement any REST API calls for the editor — it just mounts the `@wordpress/edit-post` React application and passes it a post ID. The editor handles its own data layer.

**Schema adjustment needed: Minor.** The editor application needs to receive a post ID from the shell's routing system. When a user clicks "Edit" on a post in the DataViews list, the shell navigates to `editor` with a route parameter like `/editor/post/42`. The `config` for the editor application should probably declare which post types it handles:

```jsonc
{
  "id": "editor",
  "source": "core:editor",
  "title": "Editor",
  "icon": "edit",
  "hidden": true,
  "config": {
    "postTypes": ["post", "page"]
  }
}
```

### `core:media` — Media library

**REST API coverage: Good**

`/wp/v2/media` supports listing with filtering by `media_type` (image/video/audio/application) and `mime_type`, search, upload (multipart form data or raw binary with `Content-Disposition`), editing metadata (title, alt text, caption, description), image editing (`POST /wp/v2/media/<id>/edit` with crop/rotate parameters), and deletion (`force=true` required since media has no trash).

**Gaps:**
- No REST endpoint for **regenerating thumbnails** after changing image sizes in settings. Would need a custom endpoint or WP-CLI.
- No REST endpoint for **bulk upload progress**. The API handles individual uploads; multi-file upload with progress tracking would be client-side logic.
- Media **folder organization** doesn't exist in core (the media library is flat). Plugins that add folders would need their own endpoints.

**Schema adjustment needed: None.** The `core:media` source type works as-is. The POC media library application would use DataViews with the media endpoint, adding upload handling on top.

### `core:site-editor` — Site editor

**REST API coverage: Excellent**

The site editor is already a fully decoupled React application that talks to WordPress through:
- `/wp/v2/templates` — block templates
- `/wp/v2/template-parts` — header/footer/sidebar parts
- `/wp/v2/global-styles/<id>` — theme.json style overrides
- `/wp/v2/navigation` — block-based navigation menus
- `/wp/v2/font-families` and `/wp/v2/font-faces` — Font Library (WP 6.5+)
- `/wp/v2/block-patterns/patterns` and `/wp/v2/block-patterns/categories`

Like the block editor, the site editor manages its own data layer. The shell just mounts it.

**Schema adjustment needed: None for the POC.** However, embedding the full site editor inside a shell is the most complex mounting challenge because `@wordpress/edit-site` currently assumes it owns the entire viewport and manages its own navigation (the sidebar browser, template list, etc.). The POC might need to mount it in a near-full-screen mode within the shell's content region, or it might need a wrapper that constrains it. This is an implementation challenge, not a schema issue.

### `core:settings` — Settings screen

**REST API coverage: Partial**

`GET/PUT /wp/v2/settings` covers the main WordPress settings: site title, tagline, URL, admin email, timezone, date/time formats, language, posts per page, front page configuration, default comment/ping status, and default post category/format.

**Gaps:**
- **Permalink structure** — not in the settings endpoint. Needs a custom endpoint (example provided in the wp-admin-mapping reference using `$wp_rewrite->set_permalink_structure()`).
- **Reading settings** (search engine visibility / `blog_public`) — not exposed via REST.
- **Privacy page** — not exposed via REST.
- **Media upload settings** (file organization by year/month, image sizes) — not exposed via REST.
- **Multisite settings** — not exposed via REST.

**Schema adjustment needed: Consider splitting.** Rather than a single `core:settings` application trying to replicate the entire wp-admin Settings section, the POC should scope it to what the REST API actually covers. For the POC, a simple settings screen showing General Settings (site title, tagline, timezone, date format) would be sufficient to demonstrate the pattern. Legacy settings screens that the REST API doesn't cover would use the `iframe:` escape hatch.

```jsonc
// POC approach: native settings for what the API covers
{
  "id": "settings-general",
  "source": "core:settings",
  "title": "General",
  "icon": "settings",
  "config": {
    "section": "general"
  }
},
// Escape hatch for everything else
{
  "id": "settings-advanced",
  "source": "iframe:options-general.php",
  "title": "Advanced Settings",
  "icon": "settings"
}
```

### `core:profile` — User profile

**REST API coverage: Good**

`GET/PATCH /wp/v2/users/me` covers all profile fields: first name, last name, email, URL, description/bio, nickname, and display name preference. Application password management is at `/wp/v2/users/me/application-passwords`.

**Gaps:**
- **Password change** — the REST API does support setting a new password via `PATCH /wp/v2/users/me` with a `password` field, but there's no "confirm current password" validation in the API. The current password check would need to be client-side or via a custom endpoint.
- **Color scheme** — WordPress's admin color scheme preference isn't exposed via REST.
- **Avatar/Gravatar** — not manageable via REST (it's a Gravatar service integration).

**Schema adjustment needed: None.** The `core:profile` source works for a POC. The profile screen would show editable fields from `/wp/v2/users/me?context=edit` and save via PATCH.

### `iframe:{url}` — Legacy screen wrapper

**REST API coverage: N/A (it's an escape hatch)**

This doesn't use the REST API at all — it renders an existing wp-admin page inside an iframe in the shell's content region. The iframe source URL resolves relative to `wp-admin/`.

**Considerations:**
- **Authentication** — since the shell page is served from the same WordPress install, the user's cookie auth carries into the iframe. No additional auth needed.
- **Navigation conflicts** — the iframed wp-admin page has its own admin menu and admin bar. The shell should inject CSS into the iframe to hide `#adminmenuwrap`, `#wpadminbar`, and `#wpfooter`, leaving just the content area. This is a common pattern used by plugins that embed wp-admin pages.
- **Link interception** — clicks on links inside the iframe that navigate to other wp-admin pages should ideally be intercepted and handled by the shell's routing, not by the iframe navigating internally. For the POC, letting the iframe handle its own navigation is acceptable; link interception is a refinement.
- **Height management** — the iframe needs to resize to its content. This can be done with a `ResizeObserver` on the iframe's content document (same-origin, so accessible).

**Schema adjustment needed: None.** The `iframe:{url}` pattern is correct as designed. It's the bridge that makes the POC immediately useful for screens that don't have native shell applications yet.

---

## Screens with no REST API coverage

These wp-admin screens have **no built-in REST API equivalent** and would require `iframe:` in the POC:

| Screen | Why no API | POC approach |
|---|---|---|
| **Updates** (update-core.php) | Core/plugin/theme updates not exposed via REST | `iframe:update-core.php` |
| **Import/Export** (import.php, export.php) | Content import/export not via REST | `iframe:import.php` |
| **Permalink Settings** (options-permalink.php) | Permalink structure not in settings endpoint | `iframe:options-permalink.php` |
| **Privacy** (privacy.php, erase-personal-data.php) | Data erasure/export not via REST | `iframe:privacy.php` |
| **Cron/Scheduled Events** | No REST endpoint | Plugin-specific or iframe |
| **Network Admin** (multisite) | No REST endpoints for multisite management | `iframe:network/` |

These are all good candidates for `iframe:` in the POC and for native `core:` or `plugin:` applications in later iterations.

---

## Authentication in the shell context

The shell renders as a WordPress admin page (registered via `add_menu_page` or similar, served at `wp-admin/admin.php?page=shell`). This means:

- The user is already authenticated with a WordPress cookie session.
- The nonce for REST API calls is available via `wp_create_nonce('wp_rest')`, passed to the shell's JavaScript via `wp_localize_script` or the `wpApiSettings` global.
- All REST API calls from the shell use **Cookie + Nonce authentication** — the standard pattern for same-origin admin JavaScript.
- No Application Passwords or JWT needed.

This is the simplest auth model and already well-established in how the block editor authenticates.

The shell should use `@wordpress/api-fetch` (the WordPress fetch wrapper that automatically handles nonce inclusion, path resolution, and middleware). This is what the block editor uses and it handles all the auth plumbing.

---

## Data fetching strategy

The shell runtime should use `@wordpress/data` with the `core` store (`@wordpress/core-data`) rather than raw `fetch` calls. This gives us:

- **Entity resolution** — `getEntityRecords('postType', 'post', { per_page: 20 })` handles endpoint construction, caching, and pagination transparently.
- **Optimistic updates** — editing a post title updates the UI immediately, then syncs to the API.
- **Invalidation** — saving a post invalidates the relevant entity records so lists refresh.
- **Batching** — `@wordpress/core-data` can batch write operations automatically.
- **`_fields` optimization** — the store supports field selection natively.

For the `core:posts` DataViews application, the data flow would be:

```
admin.json config           →  Shell reads postType from config
  ↓
Shell passes postType       →  DataViews component
  ↓
DataViews uses              →  useEntityRecords('postType', config.postType, queryParams)
  ↓
@wordpress/core-data        →  GET /wp/v2/{postType}?_fields=...&_embed=...&status=any
  ↓
REST API                    →  WordPress database
```

No custom API calls needed. The existing data layer handles everything.

---

## Command palette scoping

The schema doesn't currently declare command palette configuration, but it should interact with commands implicitly. When the shell loads an `admin.json` that only exposes Posts, Pages, and Media, the command palette should:

- Show commands for creating new posts and pages (`core/new-post`, `core/new-page`)
- Show dynamic search commands that search posts and pages
- **Not** show commands for templates, navigation, plugins, or other screens not in the current shell's application set
- Still show navigation commands for all registered applications ("Go to Posts", "Go to Media")

Implementation approach: the shell runtime registers commands for each application in the `admin.json`. Applications that aren't registered don't get commands. This uses the existing `@wordpress/commands` API — the shell just controls which commands are registered based on the config.

---

## Revised schema confidence

After validation against the REST API:

| Application source | API readiness | POC feasibility | Notes |
|---|---|---|---|
| `core:posts` | Ready | High | Full CRUD, filtering, batch. Consider adding `config.status` and `config.orderby` |
| `core:editor` | Ready | High | Self-contained, manages own data layer. Routing parameter needed for post ID |
| `core:media` | Ready | High | Good coverage. No thumbnail regeneration, but not needed for POC |
| `core:site-editor` | Ready | Medium | API is there, but mounting challenge — it assumes viewport ownership |
| `core:settings` | Partial | Medium | Only General settings via API. Split or scope down for POC |
| `core:profile` | Ready | High | `/users/me` covers profile editing well |
| `iframe:{url}` | N/A | High | Same-origin cookies carry auth. Need to hide wp-admin chrome via CSS |

**Overall assessment:** The schema design is sound. The `core:posts`, `core:editor`, `core:media`, and `core:profile` sources can be built as native React applications powered entirely by the REST API via `@wordpress/core-data`. The `core:site-editor` is architecturally ready but has a mounting complexity. The `core:settings` source should be scoped to what the API actually covers. Everything else uses `iframe:` as the bridge. No fundamental schema changes needed — just the minor `config` extensions noted above.
