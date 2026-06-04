# Screen Spec: Comments

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/edit-comments.php` (list) + `wp-admin/comment.php` (single edit/moderate confirm) + `wp-admin/edit-form-comment.php` (form partial) + `WP_Comments_List_Table` (`wp-admin/includes/class-wp-comments-list-table.php`)
**Current workspace coverage:** `core:comments` → `src/apps/comments/index.js` (M4) — DataViews list + approve/unapprove/spam/trash actions; full edit and inline reply not yet implemented

This spec describes the **semantic surface** of the Comments management screen — list, moderate, edit single, and reply — so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `comments` |
| Display name | "Comments" |
| Original URLs | `/wp-admin/edit-comments.php` (list), `/wp-admin/comment.php?action=editcomment&c={id}` (edit), `/wp-admin/comment.php?action={approve\|trash\|spam\|delete}&c={id}` (confirm-and-act) |
| Menu location | Top-level "Comments" |
| Submenu items | None — single management screen |
| Parent app | None |
| Sub-screens | Edit Comment (single), inline reply form (overlay on list row), Quick Edit (inline on list row) |

The Comments screen is one app with multiple modes: list (default), inline reply, inline quick-edit, and a single-comment edit screen reached via the row's Edit action. The legacy `comment.php` confirm flow (approve/trash/spam/delete with a confirmation page) is replaced by a **modal confirmation** in the workspace — the URLs `comment.php?action=trash&c={id}` etc. are not separate screens in v1, just dispatch endpoints.

`wp-admin/moderation.php` is a back-compat redirect to `edit-comments.php?comment_status=moderated` and is not a separate surface.

---

## 2. Purpose

Browse, search, moderate, and respond to comments. Primary entry point for moderators triaging the queue; secondary use for editors replying to discussion on their own posts.

Jobs to be done:
- **Triage the moderation queue** — find pending comments, approve or reject in bulk.
- **Reply to a comment** — inline, without leaving the list.
- **Mark spam** — quickly remove obvious spam from the queue.
- **Edit a comment** — fix typos, anonymize, change status or date.
- **Filter by post** — see comments on a specific post (deep-link from post-edit screens).
- **Empty Spam / Empty Trash** — periodic cleanup.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `edit_posts` | `edit-comments.php` line 11 |
| List comments via REST | `edit_posts` for default; `moderate_comments` for non-approved statuses | `WP_REST_Comments_Controller::get_items_permissions_check` |
| Edit comment | `edit_comment` (per comment; resolves to `edit_post` on parent post) | `comment.php` line 84 |
| Approve / unapprove | `edit_comment` + `moderate_comments` (REST also requires `moderate_comments` to set status) | `WP_REST_Comments_Controller::update_item_permissions_check` |
| Mark spam / unspam | `edit_comment` + `moderate_comments` | same |
| Trash / Restore | `edit_comment` | same |
| Delete Permanently | `edit_comment` | same |
| Reply | `edit_post` (on parent post; replying creates a new comment authored by the moderator) | core handles via `wp-admin/admin-ajax.php?action=replyto-comment` |
| Empty Spam / Trash | `moderate_comments` | bulk dispatch |
| View private/pending in list | `moderate_comments` | REST status filter requires it |

**Permission-denied state:** if user lacks `edit_posts`, the menu entry is hidden; URL access shows "Sorry, you are not allowed to edit comments." For an editor with `edit_posts` but not `moderate_comments`, the list shows only comments on **their own posts** with reduced action set (no spam, no status filter beyond approved/their-own).

**`comment_moderation` and `comment_previously_approved` options:** Discussion settings that drive whether new comments hit the moderation queue. Surfaced at site-settings, not on this screen.

**Comment blocklist** (`disallowed_keys` option): comments matching keys are auto-trashed by core; this screen displays them in Trash.

**Comments on private posts:** moderators with `read_private_posts` see those; otherwise excluded.

---

## 4. Data model

### Primary entity
- **Type:** `comment`
- **REST endpoint:** `GET /wp/v2/comments`
- **Single-record endpoint:** `GET /wp/v2/comments/{id}`
- **Controller:** `WP_REST_Comments_Controller`

### Fields used by the list

| Field | REST path | Type | Notes |
|---|---|---|---|
| `id` | `id` | int | row key |
| `author_name` | `author_name` | string | display name (logged-in or guest) |
| `author_email` | `author_email` | string | requires `moderate_comments` to read |
| `author_url` | `author_url` | URL | guest commenter site |
| `author` (user id) | `author` | int | 0 if guest |
| `author_avatar_urls` | `author_avatar_urls{24,48,96}` | object | gravatar URLs |
| `author_ip` | `author_ip` | string | requires `moderate_comments` |
| `author_user_agent` | `author_user_agent` | string | edit context only |
| `content` | `content.rendered` (raw via `?context=edit`) | string | HTML; the only editable body field |
| `status` | `status` | enum | `approved`, `hold` (pending), `spam`, `trash`, `unapproved` (alias of hold) |
| `date` / `date_gmt` | `date` / `date_gmt` | ISO 8601 | submission time; sortable |
| `post` | `post` | int | parent post id |
| `parent` | `parent` | int | parent comment id (0 = top-level); thread depth |
| `link` | `link` | URL | frontend permalink |
| `type` | `type` | enum | `comment`, `pingback`, `trackback`, optionally plugin-defined |
| `meta` | `meta` | object | registered comment meta fields |

### Embedded data (use `_embed`)

- `_embedded.author` — full user object when logged-in commenter
- `_embedded.up[0]` — parent post

The list uses `_embed=author,up` to avoid N+1 fetches.

### Query parameters
- `per_page` — 1–100; core default 20
- `page` — pagination
- `search` — full-text on author / content / email
- `status` — `approve` (default), `hold`, `spam`, `trash`. **Single value only** in REST; the "All" tab needs separate handling (see Aggregate data below)
- `type` — `comment` (default), `pings` (covers pingback+trackback), or full type
- `post` — int[] filter by parent post
- `parent` — int[] filter to replies of specific parents
- `author` — int[] filter to commenter user ids; requires authorization
- `author_email` — string; requires authorization
- `after` / `before` — ISO 8601 date range
- `orderby` — `date` (default `date_gmt`), `date_gmt`, `id`, `include`, `post`, `parent`, `type`
- `order` — `asc` / `desc` (default `desc`)
- `context=edit` — required for raw content, full author fields, status filter beyond approve

### Status enum (REST) ↔ list-table tab mapping

| List tab | REST `status` value | Notes |
|---|---|---|
| All | `status: 'any'` | The Comments REST `status` param has no `enum` — it sanitizes via `sanitize_key` and passes straight through to `WP_Comment_Query`. There, `'any'` (like `'all'`/empty) resolves the status clause to `comment_approved IN ('0','1')` — i.e. **approved + pending only**; `spam` and `trash` are *excluded* (they have their own tabs two rows down). That matches classic wp-admin's All view, which also hides spam/trash. A single `context=edit` request returns those statuses (the pending/`hold` set requires `moderate_comments`). Works on the documented WP 6.9 baseline — `src/apps/comments/index.js` already sends `{ context: 'edit', status: 'any' }` unconditionally. *(The original spec's claim that REST **rejects** `status: 'any'` was the factual error being corrected here.)* |
| Mine | `author={me}` (any status) | per-author filter |
| Pending | `hold` | the moderation queue |
| Approved | `approve` | |
| Spam | `spam` | requires `moderate_comments` |
| Trash | `trash` | requires `moderate_comments` |

### Type filter mapping

Core's "Comments / Pings" dropdown maps `pings` → `pingback` + `trackback`. REST accepts a single string for `type`; for `pings` either query both types in parallel or filter client-side.

### Aggregate data (status counts)

The list-table shows counts per tab: `All (123) | Mine (4) | Pending (3) | Approved (98) | Spam (12) | Trash (7)`.

Source: `wp_count_comments($post_id)` (PHP). REST has no first-class aggregate.

REST workaround: parallel `HEAD /wp/v2/comments?status={s}&per_page=1` per status, read `X-WP-Total`. Five requests (six counting Mine). Acceptable; flagged as gap.

For `Mine`: `GET /wp/v2/comments?author={current_user}&per_page=1` (any status) — pseudo-count via `X-WP-Total`.

### Non-REST data (gaps)

- **Reply** — core uses `admin-ajax.php?action=replyto-comment`. REST equivalent: `POST /wp/v2/comments` with `parent: {comment_id}`, `post: {post_id}`, `content`, `author_*` (omitted = current user). Use REST.
- **Quick Edit save** — admin-ajax `edit-comment` action. REST equivalent: `PUT /wp/v2/comments/{id}`.
- **Empty Spam / Empty Trash** — admin-ajax `delete_all` (PHP-only `$wpdb` query). REST equivalent: list with status filter, then parallel `DELETE /wp/v2/comments/{id}?force=true`. For very large sets, this is slow; consider custom endpoint or accept the perf cost (rare action).
- **Moderation keys / blocklist** (`disallowed_keys`, `moderation_keys` options) — exposed as part of `/wp/v2/settings`.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Comments" or "Comments on {post}")               │
│  └─ Subtitle: "Search results for: {query}" when applicable  │
├─────────────────────────────────────────────────────────────┤
│ STATUS TAB BAR                                               │
│  All ({n}) | Mine ({n}) | Pending ({n}) | Approved ({n})    │
│  | Spam ({n}) | Trash ({n})                                  │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                   │
│  ├─ Type dropdown (All comment types / Comments / Pings)     │
│  ├─ "Empty Spam" / "Empty Trash" (status-conditional)        │
│  └─ Search input                                             │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW (≥1 selected)                                │
│  └─ Bulk action select (status-conditional) + apply          │
├─────────────────────────────────────────────────────────────┤
│ DATA REGION                                                  │
│  Table — Author | Comment | In response to | Submitted on    │
│  Per-row actions: Approve/Unapprove, Reply, Quick Edit,      │
│   Edit, Mark as Spam, Trash (or Restore + Delete in trash)   │
│  Inline-expand: Reply form / Quick Edit form                 │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination + total count                                 │
└─────────────────────────────────────────────────────────────┘
```

### Edit Comment screen (single)

Reached via row Edit action or `?action=editcomment&c={id}`. Two-column layout matching post editor:

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Edit Comment")                                   │
├──────────────────────────────────────┬──────────────────────┤
│ MAIN                                  │ SIDEBAR              │
│  ├─ Permalink (when approved)         │ Status              │
│  ├─ Author block:                     │  ( ) Approved       │
│  │   - Name                           │  ( ) Pending        │
│  │   - Email                          │  ( ) Spam           │
│  │   - URL                            │ Submitted on:       │
│  ├─ Comment content (rich text)       │  {date} [Edit]      │
│  └─ Comment metadata (read-only):     │ In response to:     │
│      - In response to {post link}     │  {post}             │
│      - In reply to (parent comment)   │ In reply to:        │
│      - Author IP, user agent          │  {comment} (link)   │
│                                       │ Delete Permanently  │
│                                       │ Update              │
└──────────────────────────────────────┴──────────────────────┘
```

The workspace's content card hosts the form; the right column is a sticky panel.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (initial) | First fetch | Skeleton rows |
| Loading (page change) | Pagination/filter | Stale-while-revalidate |
| Empty (no comments) | total === 0, no filters | Onboarding empty state: icon + "No comments yet" |
| Empty (filtered) | total === 0 with filters | "No comments match" + Clear filters |
| Pending tab empty | `status=hold` and 0 results | "No comments awaiting moderation" |
| Spam empty | `status=spam`, 0 | "No spam" |
| Trash empty | `status=trash`, 0 | "Trash is empty" |
| Reply form active | User clicked Reply | Row expands, content textarea + Submit Reply / Cancel |
| Quick Edit active | User clicked Quick Edit | Row expands with editable name/email/url/content |
| Confirming destructive | Bulk delete / spam | Modal with "{N} comments will be permanently deleted" |
| Network error | 5xx / fetch fail | Banner; preserve filters and inline-form state |
| Permission error mid-action | per-row 403 | Inline error on row + snackbar |
| Conflict (already moderated) | Server says comment already in target state | Snackbar: "This comment is already approved." with Edit link |

---

## 7. Actions

### Per-row actions

| Action | Status-conditional | Cap | Type | Notes |
|---|---|---|---|---|
| Approve | hold, spam, trash | `edit_comment` | Mutation | `PUT` `status: 'approve'` |
| Unapprove | approved | `edit_comment` | Mutation | `PUT` `status: 'hold'` |
| Reply | not in trash/spam | `edit_post` (parent) | Inline form | `POST /wp/v2/comments` with `parent`, `post`, `content` |
| Quick Edit | any except trash | `edit_comment` | Inline form | `PUT` subset of fields |
| Edit | any except trash | `edit_comment` | Navigation | Opens edit screen |
| Mark as Spam | not spam | `edit_comment` + `moderate_comments` | Mutation | `PUT` `status: 'spam'` |
| Not Spam | spam | `edit_comment` + `moderate_comments` | Mutation | `PUT` `status: 'approve'` (or previous) |
| Trash | not trash | `edit_comment` | Mutation | `PUT` `status: 'trash'` |
| Restore | trash | `edit_comment` | Mutation | `PUT` `status: 'approve'` (or previous) |
| Delete Permanently | trash, spam (or always if `EMPTY_TRASH_DAYS = 0`) | `edit_comment` | Mutation | `DELETE /wp/v2/comments/{id}?force=true` |

Quick Edit is the same form as the inline reply but for the existing comment: name, email, URL, content. Unlike post Quick Edit, it does **not** include status (use the per-row status actions).

### Header actions

| Action | Visible when | Cap | Behavior |
|---|---|---|---|
| Empty Spam | Spam tab, has items | `moderate_comments` | Bulk DELETE all current spam; one confirmation |
| Empty Trash | Trash tab, has items | `moderate_comments` | Bulk DELETE all current trash; one confirmation |

### Bulk actions

Selection model: checkbox per row + select-all-on-page.

| Status filter | Available bulk actions |
|---|---|
| All / Approved | Unapprove, Mark as Spam, Move to Trash |
| Pending | Approve, Mark as Spam, Move to Trash |
| Spam | Not Spam, Delete Permanently |
| Trash | Restore, Mark as Spam, Delete Permanently |

Each bulk action: parallel REST writes, continue-on-error, report failure count.

### Optimistic vs. blocking
- **Approve / unapprove / status changes** — optimistic; row updates immediately, rolls back on error
- **Trash / spam** — optimistic with snackbar Undo (5s)
- **Delete Permanently** — blocking; modal confirm, wait for server
- **Reply** — blocking on submit (need new comment id back)
- **Quick Edit** — optimistic; row flashes "Saved"

---

## 8. Filters, sort, search, pagination

### Filters

| Filter | Field | Operators | Source of options |
|---|---|---|---|
| Status (tabs) | `status` | `is` | hard-coded (`approve`, `hold`, `spam`, `trash`); All needs union |
| Mine | `author={me}` | `is` | derived |
| Type | `type` | `is`, `isAny` | hard-coded (`comment`, `pings` → `pingback`+`trackback`); plugins via `admin_comment_types_dropdown` filter equivalent |
| Post | `post` | `is`, `isAny` | post picker (rare; from deep-link) |
| Author | `author` | `is` | user picker (mod-only); requires auth |
| Date | `after` + `before` | range | rare in core comments UI; could add for v1 |
| Search | `search` | match | full-text |

### Sort
Default: `date_gmt desc`. Sortable by core list table: `comment_author`, `comment_post_ID`, `comment_date`. REST sortable: `date`, `date_gmt`, `id`, `post`, `parent`, `type`.

### Search
Single full-text input. Maps to `?search=`. Debounced 300ms. Resets to page 1.

### Pagination
- Default page size: 20
- Page X of Y, total count, prev/next, jump-to-page
- URL state: `?page=2`

---

## 9. Forms & inputs

### Quick Edit (inline)

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text | yes for guest | `author_name` |
| Email | email | yes for guest | `author_email`; mod-only |
| URL | url | no | `author_url` |
| Content | textarea / minimal rich text | yes | `content` |

### Reply (inline)

| Field | Type | Required | Notes |
|---|---|---|---|
| Content | textarea / minimal rich text | yes | `content`; the new comment's body |

The reply uses the moderator's user as the author (no name/email needed when logged in). On submit: `POST /wp/v2/comments` with `parent={replied_to}`, `post={post_id}`, `content`, `status: 'approve'` (moderator replies are auto-approved).

### Edit Comment (full screen)

| Field | Type | Required | Notes |
|---|---|---|---|
| Author Name | text | yes | `author_name` |
| Author Email | email | yes | `author_email` |
| Author URL | url | no | `author_url` |
| Comment Content | rich text editor (TinyMCE or block editor in core 6.5+) | yes | `content` |
| Status | radio (Approved / Pending / Spam) | yes | `status` |
| Date | datetime | yes | `date`/`date_gmt`; "Edit" toggle reveals datepicker |
| Sidebar metadata | (read-only) | n/a | parent post + parent comment + IP + UA |

### Validation
- Email — RFC format; server validates with `is_email()`.
- Content — non-empty after stripping whitespace; server enforces `disallowed_keys` (option) — content matching is auto-marked spam/trash even on save.
- Status transitions — server-side `comment_moderation` and capability checks; client should not block local optimistic updates on these.

### Save semantics
- Quick Edit: `PUT /wp/v2/comments/{id}` with subset → optimistic
- Reply: `POST /wp/v2/comments` blocking → on success append row to thread context
- Edit screen: `PUT /wp/v2/comments/{id}` blocking with full payload
- No autosave (status changes are explicit)

---

## 10. Routing & URL state

### Original wp-admin URLs
- `edit-comments.php?comment_status={status}` — status tab
- `edit-comments.php?comment_type={type}` — type filter
- `edit-comments.php?p={post_id}` — filter by post (legacy `p` param)
- `edit-comments.php?user_id={id}` — Mine
- `edit-comments.php?s={query}` — search
- `edit-comments.php?paged={n}` — pagination
- `edit-comments.php?orderby={col}&order={asc|desc}` — sort
- `comment.php?action=editcomment&c={id}` — edit single
- `comment.php?action={approve|trash|spam|delete}&c={id}` — confirm + act (legacy)

### Recommended workspace URL state

```
#/comments                                          — All
#/comments?status=hold                              — Pending
#/comments?status=spam                              — Spam
#/comments?type=pings&search=ftp&page=2             — combined
#/comments/{id}                                     — edit screen
#/comments?post={id}                                — comments on post
```

Browser back/forward must restore tab + filters + page + open inline form (last one optional). Refresh restores filters; inline form state may reset.

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)

| Trigger | Destination | Carry |
|---|---|---|
| Click row content | this screen, `/{id}` edit | comment id |
| Click "In response to" post | `posts` / `editor` app | post id |
| Click author user link | `users` app, single user | user id |
| Click author IP | this screen, filtered | `?author_ip={ip}` (if exposed; not in core REST list params; gap) |
| "View on site" link | external URL | new tab |
| Comments-on-post deep link from post-edit | this screen | `?post={id}` |

### Inbound

- From `posts` app: per-row "Comments" indicator (badge with pending count) → `/comments?post={id}`
- From a notifications app (not in v1): "X commented on your post" → `/comments/{id}` edit
- From command palette: quick navigation, optionally with status filter

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Approve (single) | Snackbar: "Approved" with Undo (5s) |
| Bulk approve | Snackbar: "{N} approved" |
| Trash (single) | Snackbar: "Moved to trash" + Undo |
| Bulk trash | Snackbar: "{N} moved to trash" + Undo |
| Spam (single) | Snackbar: "Marked as spam" + Undo |
| Bulk spam | Snackbar: "{N} marked as spam" + Undo |
| Reply submitted | Snackbar: "Reply posted" with link to thread |
| Reply failed | Inline banner in reply form; preserve content |
| Quick Edit saved | Inline row flash "Saved" |
| Edit-screen saved | Snackbar: "Comment updated" |
| Delete Permanently | Modal confirm → snackbar "Deleted permanently" — no undo |
| Empty Spam / Trash | Modal confirm → snackbar "{N} permanently deleted" |
| Network error | Banner with retry; preserve filter + inline-form state |
| Already-moderated conflict | Snackbar: "This comment is already approved. [Edit]" |

Undo for trash/spam: keep last operation in memory 5s; Undo reissues `PUT` to previous status.

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `/` | Focus search |
| `↑↓` | Move row focus |
| `Space` | Toggle selection |
| `Enter` | Open focused row's edit screen |
| `Esc` | Close inline reply / quick-edit |
| `a` | Approve focused row (when hold) |
| `u` | Unapprove (when approved) |
| `r` | Reply |
| `q` | Quick Edit |
| `e` | Edit |
| `s` | Mark as Spam |
| `d` | Move to Trash |
| `Cmd/Ctrl+A` | Select all on page |
| `Shift+Click` | Range select |

These shortcuts mirror core's `enqueue_comment_hotkeys_js()` (`j`/`k` for next/prev, `a/u/r/q/e/s/d`). Loading the keyboard-shortcut layer is opt-in (a user setting in core); v1 workspace ships them on by default.

### ARIA & focus

- Status tabs: `role="tablist"` with counts in accessible name (`<span class="count">(3)</span>` should be inside the visually-hidden text)
- Bulk action bar: announced via live region when ≥1 selected
- Inline reply / quick-edit: focus moves into the form on open; on submit/cancel returns to the row
- After approve/trash: focus moves to the next row (or prev if last)
- Modal confirmations: focus trap + return on close
- Loading state: `aria-busy="true"` on data region
- Comment content rendered as `<blockquote>` or similar, **never with `dangerouslySetInnerHTML` of unescaped raw** — REST returns sanitized `content.rendered`

### Screen reader

- "Sorted by date, descending" on column sort change
- "{N} comments selected" via live region
- "{N} comments on this page" announced when filters apply
- New row announcement after reply: "Your reply was posted"

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `manage_edit-comments_columns` | Add list columns | Replace with workspace `fields` extensibility |
| `manage_comments_custom_column` | Render custom column | Replace with field-render registry |
| `comment_row_actions` | Per-row actions | Replace with workspace `actions` registry (`core:comments.row-actions` slot) |
| `bulk_actions-edit-comments` | Bulk actions | Replace with workspace bulk-action API |
| `comment_status_links` | Status filter tabs | Replace with workspace-level filter-tab API |
| `restrict_manage_comments` | Filter dropdowns | Replace with workspace-level filter API |
| `admin_comment_types_dropdown` | Type filter options | Replace with workspace type registration |
| `edit_comment_misc_actions` | Sidebar mod actions on edit screen | Replace with `core:comments.edit-sidebar` slot |
| `add_meta_boxes_comment` | Edit-screen sidebar meta-boxes | Replace with workspace slot fills |
| `comment_moderation_recipients` | Mod email recipients | Server-side only |
| `pre_comment_approved` | Auto-moderation logic | Server-side; settings page surfaces options |

Plugin compatibility note: third-party plugins relying on these hooks won't work in the workspace. Plugins that add content to the comment edit screen via meta boxes (e.g. Akismet's spam analysis panel) need migration to a `core:comments.edit-sidebar` slot.

---

## 15. Mapping & implementation status

### Current workspace coverage

- **Source:** `core:comments` → `src/apps/comments/index.js`
- **What works (M4):** DataViews list, single status filter, approve/unapprove/spam/trash/restore actions via partial `saveEntityRecord`, basic search, pagination
- **What does not yet:** All-status union (only one status at a time), counts in tab labels, Mine tab, Type filter, inline Reply, Quick Edit, full Edit screen, Empty Spam / Empty Trash, undo snackbar, bulk actions

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Status counts in tabs | High | 6 parallel HEAD requests (or document custom endpoint plan) |
| All-status union | High | Pseudo-status: query both `approve` and `hold` and merge client-side; or omit "All" and default to "Pending + Approved" |
| Mine tab | High | `?author={me}` toggle |
| Type filter (Comments / Pings) | High | hard-coded select; for `pings` query both pingback and trackback |
| Inline Reply form | High | Content textarea per-row expand; `POST /wp/v2/comments` with `parent`, `post`, `content` |
| Quick Edit | High | Inline form: name, email, url, content |
| Full Edit Comment screen | High | Two-column form with rich-text content + status radio + date editor |
| Bulk actions | High | Approve / Unapprove / Spam / Trash / Restore / Delete / Not Spam — status-conditional set |
| Empty Spam / Empty Trash | Medium | List-and-delete-all (slow for large sets; document) |
| Undo snackbar (trash/spam) | High | 5s window; reissue PUT |
| Author info display: avatar + email + URL | Medium | `author_avatar_urls`, `author_email`, `author_url`; mod-only |
| Author IP display | Medium | Edit context; mod-only |
| In-response-to column with post link | Medium | Use `_embed=up` |
| Per-post comments view | Medium | `?post={id}` filter |
| Date filter (range) | Low | not in core; nice-to-have |
| Keyboard shortcuts (`a/u/r/q/e/s/d/j/k`) | Medium | Mirror core `enqueue_comment_hotkeys_js` |
| ARIA polish | High | Tab counts, live region, focus restoration after action |
| Block editor for comment content | Low | Core 6.5+ uses TinyMCE; the workspace can ship a simple content area |
| Notes (private comments on posts) | Out of scope | New 6.9 feature; v2 |

### Acceptable interim

For v1 of any new workspace config, `iframe:edit-comments.php` is acceptable as escape hatch. The current `core:comments` is partial but functional — most authors only need to approve/spam/trash. Inline Reply and Quick Edit are the highest-impact remaining gaps.

---

## 16. Out of scope

- **Comment notes** (post-attached private notes) — new 6.9 feature; tracked separately, lands in v2
- **Avatar customization** — Discussion settings, not this screen
- **Comment-form blocks** (frontend) — block-editor concern
- **Discussion settings** (`options-discussion.php` — moderation rules, blocklist, avatar) — separate `core:settings-discussion` panel
- **Akismet UI** — plugin extension point via slot
- **Per-comment IP geolocation, fraud scoring** — plugin extensions; the screen exposes raw IP and lets plugins fill detail panels

---

## 17. Reference

- Original PHP: `wp-admin/edit-comments.php` (list), `wp-admin/comment.php` (single edit + confirm-and-act)
- **Form partial:** `wp-admin/edit-form-comment.php` is the form rendered inside `wp-admin/comment.php` when `action=editcomment`, **not standalone** — it requires `$comment` and is included via `require ABSPATH . 'wp-admin/edit-form-comment.php'`. The workspace's Edit Comment screen replaces both files in one component.
- Legacy redirect: `wp-admin/moderation.php` 301s to `edit-comments.php?comment_status=moderated`; not a separate surface
- List table: `wp-admin/includes/class-wp-comments-list-table.php`
- Reply handler (admin-ajax): `wp-admin/includes/ajax-actions.php::wp_ajax_replyto_comment()` — REST replacement: `POST /wp/v2/comments`
- Quick Edit handler (admin-ajax): `wp-admin/includes/ajax-actions.php::wp_ajax_edit_comment()` — REST replacement: `PUT /wp/v2/comments/{id}`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-comments-controller.php`
- REST schema: `https://developer.wordpress.org/rest-api/reference/comments/`
- Current workspace impl: `src/apps/comments/index.js`
- Workspace config example: `workspaces/developer-workspace.json`
