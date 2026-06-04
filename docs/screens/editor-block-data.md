# Screen Spec: Block Editor — Data Layer (REST, Preload, Autosave, Revisions)

**Status:** Tier 2 — companion to [`editor-block.md`](./editor-block.md). Read that first.
**Source PHP:** `wp-admin/edit-form-blocks.php` (preload paths, lock details, server-registered block bootstrap), `wp-includes/rest-api/endpoints/class-wp-rest-{posts,autosaves,revisions,block-renderer,block-types,block-patterns,blocks,url-details,navigation-fallback}-controller.php`.

This document catalogues the block editor's data-layer surface: every REST endpoint touched, the preload contract, the batch endpoint usage, autosave flow, revisions integration, and `_embed`/`_fields` patterns.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `editor.data` (sub-region of editor screen) |
| Display name | N/A — internal subsystem |
| Original PHP | `edit-form-blocks.php`'s `block_editor_rest_api_preload()` block |

---

## 2. Purpose

Three jobs:

1. **Hydrate the editor at boot** without a fetch waterfall. Without preload, cold-start would issue 15–25 sequential REST requests; with preload, those are inlined as JSON in the page response and consumed by `core-data` synchronously.
2. **Persist edits** via `core/core-data` `saveEntityRecord` to the posts REST controller, with autosave fallback.
3. **Expose related data** (block types, patterns, taxonomies, users, media) so the editor's pickers don't block on individual fetches.

---

## 3. Capabilities & access

Each REST endpoint enforces its own `permission_callback`. The editor's overall access is gated by `edit_post`; sub-resources may be gated further (e.g. `read` for media list, `manage_options` for general settings, `edit_theme_options` for global styles edit context). All writes require a valid nonce header (`X-WP-Nonce`).

---

## 4. Data model — REST endpoints used

### Primary post controller

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/{rest_base}/{id}?context=edit` | Load post for editing |
| `PUT` | `/wp/v2/{rest_base}/{id}` | Save edits |
| `POST` | `/wp/v2/{rest_base}` | Create auto-draft |
| `DELETE` | `/wp/v2/{rest_base}/{id}` | Trash (without `force`) |
| `DELETE` | `/wp/v2/{rest_base}/{id}?force=true` | Permanent delete |
| `OPTIONS` | `/wp/v2/{rest_base}` | Discover schema, capabilities |

`{rest_base}` defaults to the post-type's `rest_base` (e.g. `posts`, `pages`) under namespace `wp/v2` (or post-type's `rest_namespace` if set).

### Autosaves controller

Routes registered by `WP_REST_Autosaves_Controller`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/{parent_base}/{id}/autosaves` | List autosaves for a post |
| `POST` | `/wp/v2/{parent_base}/{id}/autosaves` | Create / update an autosave (one per user per post — overwrites prior autosave) |
| `GET` | `/wp/v2/{parent_base}/{parent}/autosaves/{id}` | Read a specific autosave |

`POST` accepts the same payload shape as the parent post (`title`, `content`, `excerpt`, `status` typically `draft` for autosave purposes). Server returns the resulting autosave record.

### Revisions controller

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/{parent_base}/{id}/revisions?per_page=1` | Cheap "are there revisions?" probe |
| `GET` | `/wp/v2/{parent_base}/{id}/revisions` | List revisions for the panel |
| `GET` | `/wp/v2/{parent_base}/{parent}/revisions/{id}` | Read a specific revision |
| `DELETE` | `/wp/v2/{parent_base}/{parent}/revisions/{id}` | Delete revision (admins only) |

**Restore is NOT a REST operation** — it's a wp-admin POST to `/wp-admin/revision.php?action=restore` with nonce. See [`revisions.md`](./revisions.md).

### Block-related controllers

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/block-types` | List all registered block types (server + client) |
| `GET` | `/wp/v2/block-types/{namespace}` | Block types in a namespace |
| `GET` | `/wp/v2/block-types/{namespace}/{name}` | Single block type metadata |
| `POST` | `/wp/v2/block-renderer/{name}` | Server-render a dynamic block (e.g. `core/latest-posts`) |
| `GET` | `/wp/v2/block-patterns/patterns` | All registered patterns |
| `GET` | `/wp/v2/block-patterns/categories` | Pattern categories |
| `GET/POST/PUT/DELETE` | `/wp/v2/blocks` (and `/blocks/{id}`) | Reusable / synced patterns CRUD (post-type `wp_block`) |

Synced patterns are stored as `wp_block` posts. `register_block_type` handles the rest.

### Templates / global styles / settings (preloaded)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/types?context=view` | Discover post types |
| `GET` | `/wp/v2/types/{type}?context=edit` | Cap flags + supports + template + template_lock for current type |
| `GET` | `/wp/v2/taxonomies?context=view` | Discover taxonomies |
| `GET` | `/wp/v2/users/me` | Current user (caps) |
| `GET` | `/wp/v2/settings` | Site settings (read; gated to admin) |
| `OPTIONS` | `/wp/v2/settings` | Settings schema |
| `GET` | `/wp/v2/global-styles/themes/{theme}?context=view` | Theme global styles |
| `GET` | `/wp/v2/global-styles/themes/{theme}/variations?context=view` | Theme style variations |
| `GET` | `/wp/v2/themes?context=edit&status=active` | Active theme metadata |
| `GET/PUT` | `/wp/v2/global-styles/{user-styles-id}?context=edit\|view` | User global styles overrides |
| `OPTIONS` | `/wp/v2/global-styles/{user-styles-id}` | Global styles schema |
| `GET` | `/wp/v2/templates/lookup?slug={slug}` | Resolve template that renders this post |

### Editor-only namespace

`WP_REST_URL_Details_Controller` (`wp-block-editor/v1` namespace):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp-block-editor/v1/url-details?url={url}` | Server-side URL metadata fetch (used by link picker, embed previews) |

`WP_REST_Navigation_Fallback_Controller`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp-block-editor/v1/navigation-fallback` | Returns the default navigation post id (used when a Navigation block has no `ref`) |

### Taxonomy / users / media (used by inspector)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/wp/v2/categories?per_page=100` | Categories panel |
| `POST` | `/wp/v2/categories` | Create new category inline |
| `GET` | `/wp/v2/tags?search={q}` | Tag autocomplete |
| `POST` | `/wp/v2/tags` | Create new tag |
| `GET` | `/wp/v2/users?who=authors&per_page=100` | Author picker |
| `GET` | `/wp/v2/media` | Featured image picker |
| `POST` | `/wp/v2/media` | Upload featured image |

### Batch endpoint

`POST /batch/v1` — wraps multiple sub-requests, returns array of responses. The block editor uses this for:
- Saving the post + its post-meta + featured image attribution in a single round-trip.
- Bulk-saving when the user edits multiple entities (e.g. site editor saves modified template + template-parts + global styles together).

Contract: max 25 sub-requests per batch (filterable). Sub-requests share authentication context.

---

## 5. Layout regions (semantic)

N/A — internal data subsystem. Visible surfaces are documented in [`editor-block.md`](./editor-block.md), [`editor-block-inspector.md`](./editor-block-inspector.md), and [`editor-block-modes.md`](./editor-block-modes.md).

---

## 6. States

| State | Trigger | Effect |
|---|---|---|
| Cold start with preload | First load of editor URL | All preload paths inlined as JSON; `core-data` resolves selectors synchronously; no fetch waterfall |
| Cold start without preload | Shell-mounted editor that didn't run `block_editor_rest_api_preload()` | Each `useEntityRecord`/`useSelect` triggers a fetch; ~15–25 sequential requests; visible waterfall |
| Save in progress | `editor.savePost()` dispatched | `core-data` `isSavingEntityRecord` returns true; UI displays "Saving…" |
| Save error | REST returned non-2xx | `core-data` `getLastEntitySaveError` populated; UI displays error; entity remains in `edits` state |
| Autosave in progress | `editor.savePost({ isAutosave: true })` | Sub-state — does not block manual save |
| Newer autosave detected | preload returns autosave with newer `modified_gmt` than post | Banner offered (see editor-block.md §6) |
| Heartbeat tick | Every 10s (interval set in edit-form-blocks.php line ~194) | Refreshes post lock; checks for collision; does NOT save |
| Connection lost | Heartbeat fails or fetch fails | Banner; saves disabled; localAutosave activated |

---

## 7. Actions

### Save (manual)

Sequence:
1. Validate client-side (e.g. password required if visibility=password).
2. Optional pre-publish panel.
3. Dispatch `core/editor.savePost()`.
4. `core-data` queues `saveEntityRecord('postType', type, edits)`.
5. Single PUT to `/wp/v2/{rest_base}/{id}` (or batch if other dirty entities).
6. On success: `editor.requestPostUpdateSuccess()` action fires; snackbar created.
7. On error: error stored; banner rendered.

### Save (autosave)

Sequence:
1. Triggered by interval timer (60s default per `AUTOSAVE_INTERVAL` constant) when `isEditedPostDirty()` AND `! isSavingPost()`.
2. Or by heartbeat tick when local edits exceed threshold.
3. For new (unpublished) posts: dispatches `editor.savePost({ isAutosave: true })`. Reduced to PUT against the parent post (auto-draft transition).
4. For published posts: POST to `/wp/v2/{parent_base}/{id}/autosaves` — creates / updates autosave revision without disturbing the public post.
5. Result is **not** consumed into the editor; user keeps editing live state.

### Trash

`DELETE /wp/v2/{rest_base}/{id}` (no `force`). Server moves to `status=trash` and stores previous status in post meta `_wp_trash_meta_status`. Snackbar: "1 post moved to trash" + Undo (Undo dispatches PUT with previous status — but since the meta isn't REST-exposed, "Undo" sends `status: 'draft'` as a best-effort fallback).

### Restore from trash

`PUT /wp/v2/{rest_base}/{id}` with `status: 'draft'`. Or — when REST surfaces it (gap) — `status: '_previous'` to recover meta.

### Permanent delete

`DELETE /wp/v2/{rest_base}/{id}?force=true`. Confirmation modal required; cannot be undone.

### Restore from revision

**Currently NOT REST.** Requires POST to `/wp-admin/revision.php?action=restore&revision={revision_id}` with nonce `restore-post_{revision_id}`. Documented as gap. See [`revisions.md`](./revisions.md).

### Take over post lock

**NOT REST.** POST to `/wp-admin/admin-ajax.php?action=heartbeat` with `data['wp-refresh-post-lock'] = { post_id, lock }` payload, OR direct page reload with `?get-post-lock=1&_wpnonce=…`. Documented as gap.

---

## 8. Filters, sort, search, pagination

N/A — data subsystem.

`_fields` and `_embed` are commonly used to trim payloads:
- `_fields=id,title.raw,content.raw,excerpt.raw,status,date,slug,...` — restrict response to needed fields.
- `_embed=author,wp:featuredmedia,wp:term` — hydrate related entities in one round-trip.

Pagination: `per_page` + `page`; `X-WP-Total` and `X-WP-TotalPages` response headers used to drive pagers.

---

## 9. Forms & inputs

N/A — data subsystem.

---

## 10. Routing & URL state

N/A — data subsystem. The routing of the parent screen drives entity loading via the URL's `id` parameter.

---

## 11. Inter-app navigation

N/A.

---

## 12. Notifications & feedback

REST errors propagate as inline notices (banner region). Common error shapes:
- `403 rest_forbidden` — capability denial; show "You do not have permission to {action} this {post type}".
- `400 rest_invalid_param` — invalid input; show field-level error.
- `409 post-locked` — show lock modal.
- `500 internal_server_error` — show generic "Something went wrong" with retry.

`@wordpress/api-fetch` middleware routes failures through `core/notices` automatically when the editor mounts the standard middleware stack.

---

## 13. Accessibility & keyboard

N/A — data subsystem. UI accessibility documented in companion files.

---

## 14. Extension points

### REST filters
| Filter | Purpose |
|---|---|
| `rest_pre_dispatch` | Short-circuit any REST request |
| `rest_request_after_callbacks` | Modify response after handler |
| `rest_prepare_{post_type}` | Modify post response payload |
| `rest_{post_type}_query` | Modify list-query args |
| `rest_pre_insert_{post_type}` | Modify create/update payload before save |
| `rest_after_insert_{post_type}` | After save side-effects |
| `register_post_meta` `auth_callback` / `show_in_rest` | Per-meta gate and shape |

### Preload extension
| Filter | Purpose |
|---|---|
| `block_editor_rest_api_preload_paths` | Add/remove preload paths for the block editor |
| `block_editor_settings_all` | Modify the settings array passed to the JS editor |

### Batch
- Plugins can route their writes through `/batch/v1` to ride alongside the editor's save.

---

## 15. Mapping & implementation status

### Current shell coverage
- The shell does **not** preload block-editor REST paths. The native `core:simple-editor` doesn't need most of them (no patterns, no global styles, no inserter beyond 9 blocks).
- The iframed `core:editor` inherits core's preload by virtue of loading `wp-admin/post.php`.

### Gaps (rebuild list)

| Gap | Priority | Notes |
|---|---|---|
| Preload all 22+ paths from `edit-form-blocks.php` | High | Without preload, native editor has cold-start fetch waterfall. Implement equivalent server-side preload when shell mounts the native editor app — or accept perf cost |
| Block-editor settings injection | High | Compose `editorSettings` from `get_block_editor_settings()` filter chain |
| Server-registered block schemas bootstrap | High | `wp.blocks.unstable__bootstrapServerSideBlockDefinitions(...)` call |
| Server-registered block bindings sources (6.5+) | Medium | Iterate and call `registerBlockBindingsSource()` |
| Patterns preload (`__experimentalAdditionalBlockPatterns`) | Medium | PHP `WP_Block_Patterns_Registry::get_instance()->get_all_registered( true )` |
| Pattern categories preload | Medium | `WP_Block_Pattern_Categories_Registry::get_instance()->get_all_registered( true )` |
| Available templates preload | Medium | `wp_get_theme()->get_page_templates()` |
| Lock details preload | High | Preserve `wp_check_post_lock` + `wp_set_post_lock` server-side equivalent at editor boot |
| Heartbeat post-lock refresh (every 10s) | High | `wp.heartbeat.interval(10)` + `data['wp-refresh-post-lock']` exchange — no REST equivalent |
| Lock take-over flow | High | Currently `?get-post-lock=1&_wpnonce=…` redirect-based. No REST. Track upstream gap |
| Autosave POST every 60s | High | `/wp/v2/{rest_base}/{id}/autosaves` |
| Autosave-newer banner | High | Compare modified_gmt of current post and latest autosave on load |
| Local-storage autosave (offline backup) | Medium | `editor.localAutosaveSet` / `editor.localAutosaveGet` — sessionStorage |
| Trash via REST DELETE (no force) | Done | `core-data` `deleteEntityRecord` |
| Restore from revision via REST | Gap | Currently admin-post action; implement custom `wp-admin-workspaces/v1/posts/{id}/restore-revision` endpoint |
| URL details endpoint usage (link picker) | Medium | Not strictly needed — fallback fetches from client |
| Navigation fallback endpoint | Low | Only relevant when shell hosts a Navigation block in shell-managed content |
| Batch endpoint for multi-entity saves | Medium | `core-data` does this automatically when multiple dirty entities are saved together; only relevant if shell explicitly bypasses batch |
| Meta-box AJAX iframe loader endpoint preserved | Medium | `wp-admin/post.php?meta-box-loader=true&meta-box-loader-nonce=…` — server-rendered HTML chunk for back-compat meta boxes; non-REST |

### Capacity check
The full preload set adds ~80–250 KB of inlined JSON to the editor page response. This is a one-time cost and a net perf win vs. cold-start fetches — but the shell's existing pages do not currently allocate budget for it. M5's bundle/perf budget needs revisiting if/when the native block editor lands.

---

## 16. Out of scope

- **GraphQL alternative** — WPGraphQL exists but is not used by core editor.
- **Custom REST namespaces for editor data** — none in the v1 scope.
- **Multi-site network REST endpoints** — irrelevant at the post-edit level.

---

## 17. Reference

- Preload paths: `wp-admin/edit-form-blocks.php` lines 60–118
- Server-registered block bootstrap: `wp-admin/edit-form-blocks.php` lines 150–172
- Lock details preload: `wp-admin/edit-form-blocks.php` lines 215–252
- Heartbeat interval: `wp-admin/edit-form-blocks.php` lines 191–198
- Posts controller: `wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php`
- Autosaves controller: `wp-includes/rest-api/endpoints/class-wp-rest-autosaves-controller.php`
- Revisions controller: `wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php`
- Block-renderer controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-renderer-controller.php`
- Block-types controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-types-controller.php`
- Block-patterns controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-patterns-controller.php`
- Block-pattern-categories controller: `wp-includes/rest-api/endpoints/class-wp-rest-block-pattern-categories-controller.php`
- Blocks (synced patterns) controller: `wp-includes/rest-api/endpoints/class-wp-rest-blocks-controller.php`
- URL details controller: `wp-includes/rest-api/endpoints/class-wp-rest-url-details-controller.php`
- Navigation fallback controller: `wp-includes/rest-api/endpoints/class-wp-rest-navigation-fallback-controller.php`
- Batch controller: `wp-includes/rest-api/class-wp-rest-server.php` (see `serve_batch_request_v1`)
- `block_editor_rest_api_preload()`: `wp-includes/block-editor.php`
- `get_block_editor_settings()`: `wp-includes/block-editor.php`

**Companion files:**
- [`editor-block.md`](./editor-block.md)
- [`editor-block-inspector.md`](./editor-block-inspector.md)
- [`editor-block-modes.md`](./editor-block-modes.md)
