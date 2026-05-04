# Screen Spec: Dashboard Home

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/index.php` (boots `wp-admin/_index.php`) + `wp-admin/includes/dashboard.php`
**Current shell coverage:** None — `core:dashboard` is not yet registered as an application source. The MVP shell currently lands users on the first nav item (typically Posts) instead of a dashboard.

This spec describes the **semantic surface** of the WordPress Dashboard "Home" screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `dashboard-home` |
| Display name | "Dashboard" / "Home" |
| Original URL | `/wp-admin/index.php` (alias `/wp-admin/`) |
| Menu location | First top-level menu item ("Dashboard" with sub-items "Home" and "Updates") |
| Submenu items | Home (this screen), Updates (`update-core.php`), My Sites (multisite only) |
| Parent app | None — top-level landing screen |
| Sub-screens | None — widgets render inline; configure-state for individual widgets is local |

The Dashboard Home is the default landing screen after login. Network admin and User admin contexts render different widget sets (`wp_network_dashboard_setup` / `wp_user_dashboard_setup` actions); the spec below covers the per-site Blog Admin Dashboard.

---

## 2. Purpose

Provide an at-a-glance overview of the site and a launch pad for the most common authoring tasks. Read-mostly screen with a few opportunistic write paths (Quick Draft, comment moderation row actions).

Jobs to be done:
- **See what changed since I was last here** — recent comments, recently published posts, scheduled posts.
- **Spot problems** — Site Health critical issues, browser-out-of-date nag, PHP-out-of-date nag.
- **Draft a quick post** — capture a thought without entering the full editor.
- **Review key counts** — number of posts, pages, comments awaiting moderation.
- **Catch up on WordPress** — events and news from `planet.wordpress.org`.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `read` (every authenticated user) | `menu.php` |
| See "Welcome" panel | `edit_theme_options` | `wp_dashboard_setup` |
| See "Site Health Status" widget | `view_site_health_checks` | `wp_dashboard_setup` |
| See "At a Glance" widget | `edit_posts` | `wp_dashboard_setup` |
| See "Activity" widget (any) | `read` (always shown on blog admin) | `wp_dashboard_setup` |
| See "Quick Draft" widget | `get_post_type_object('post')->cap->create_posts` (= `edit_posts` + …) | `wp_dashboard_setup` |
| See "WordPress Events and News" widget | `read` | `wp_dashboard_setup` |
| See "PHP Update" nag | `update_php` | `wp_dashboard_setup` |
| Approve / unapprove / spam / trash a recent comment row | `edit_comment` (per-comment) | `_wp_dashboard_recent_comments_row` |
| Customize widget visibility (Screen Options) | `read` | `WP_Screen` |
| Configure third-party widgets | `edit_dashboard` | `wp_add_dashboard_widget` |

**Permission-denied state:** the screen itself is reachable by every logged-in user. Widget visibility cascades from caps; an editor without `edit_theme_options` simply does not see the Welcome panel. There is no all-or-nothing 403.

**Multisite:** Network Admin renders a different widget set ("Right Now" with site/user counts and search forms) and is **out of scope** for v1 — covered by a separate `network-dashboard` spec when needed.

---

## 4. Data model

The dashboard does not have a single REST endpoint. Each widget reads from a different data source. The shell rebuild composes them.

### Widgets and their data

| Widget | REST source | Fallback |
|---|---|---|
| Welcome panel | `GET /wp/v2/users/me?context=edit` (for "show_welcome_panel" user meta) | User-meta endpoint |
| Site Health Status | `GET /wp-site-health/v1/tests/{name}` per-test (background-updates, loopback, https, dotorg-communication, authorization-header, page-cache); status score computed client-side | See `site-health.md` |
| At a Glance — post counts | `GET /wp/v2/{rest_base}?per_page=1` per post type, read `X-WP-Total` header (no `wp_count_posts` REST) | Per-status workaround as in `posts.md` |
| At a Glance — comment counts | `GET /wp/v2/comments?status=approve&per_page=1` + `?status=hold&per_page=1`, read `X-WP-Total` | |
| At a Glance — theme + version | `GET /wp/v2/themes?status=active`; `GET /` for `version` from index | |
| At a Glance — search-engine-discouraged | `GET /wp/v2/settings` → `blog_public` | Requires `manage_options` |
| Activity — Publishing Soon | `GET /wp/v2/posts?status=future&per_page=5&order=asc&orderby=date` | |
| Activity — Recently Published | `GET /wp/v2/posts?status=publish&per_page=5&order=desc&orderby=date` | |
| Activity — Recent Comments | `GET /wp/v2/comments?per_page=5&orderby=date&order=desc&status=approve,hold` | |
| Quick Draft — drafts list | `GET /wp/v2/posts?status=draft&author={me.id}&per_page=4&orderby=modified` | |
| Quick Draft — submit | `POST /wp/v2/posts` with `{title, content, status: 'draft'}` | |
| WordPress Events and News | `GET https://api.wordpress.org/events/1.0/?location={...}` (external) | Falls back to RSS from `planet.wordpress.org` |
| Browser/PHP nag | `GET /wp/v2/users/me` for current-user context only; checks happen via `wp_check_browser_version` + `wp_check_php_version` (client-side or server-emitted) | No first-class REST |

### Aggregate / non-REST data (gaps)

- **`wp_count_posts()`** (used by At a Glance) has no REST equivalent. Current best practice: read `X-WP-Total` from per-status `?per_page=1` requests.
- **`wp_count_comments()`** has no REST equivalent. Same pattern: per-status requests reading total header.
- **`wp_check_browser_version()` / `wp_check_php_version()`** are PHP-only; results are not exposed via REST. The shell either reimplements browser detection client-side or surfaces a custom REST endpoint.
- **Community Events** API is `api.wordpress.org` direct; not WordPress core REST. Geo IP is server-resolved.
- **`dashboard_glance_items` filter** lets plugins inject extra `<li>` rows into At a Glance. Shell ignores in v1.

### Per-user state

| Stored in | Key | Purpose |
|---|---|---|
| `usermeta` | `show_welcome_panel` | 0 = hidden, 1 = shown, 2 = multisite-site-owner-only |
| `usermeta` | `metaboxhidden_dashboard` | array of widget IDs hidden via Screen Options |
| `usermeta` | `closedpostboxes_dashboard` | array of widget IDs collapsed |
| `usermeta` | `meta-box-order_dashboard` | per-column ordering (drag-reorder result) |
| `usermeta` | `screen_layout_dashboard` | column count |
| `usermeta` | `community-events-location` | last resolved geo for Events widget |

All of the above are accessible via `/wp/v2/users/me?context=edit` (`meta` field) when registered with `register_meta()`. Core only registers `community-events-location`; the others are read/written through admin-ajax (`POST admin-ajax.php?action=meta-box-order` etc.). REST coverage is a gap — see Section 15.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Dashboard")                                      │
│  └─ Screen Options menu (widget toggles + column count)      │
├─────────────────────────────────────────────────────────────┤
│ WELCOME PANEL (dismissible, full width)                      │
│  ├─ Heading + intro                                          │
│  ├─ Three task columns: Get Started / Next Steps / More      │
│  └─ Dismiss button                                           │
├─────────────────────────────────────────────────────────────┤
│ NAG BANNERS (high-priority widgets, full width)              │
│  ├─ Browser-out-of-date                                      │
│  └─ PHP-out-of-date                                          │
├─────────────────────────────────────────────────────────────┤
│ WIDGET GRID (1–4 columns, user-selectable)                   │
│  ┌─────────────────┐  ┌─────────────────┐                    │
│  │ Site Health     │  │ Quick Draft     │                    │
│  │ Status          │  ├─────────────────┤                    │
│  ├─────────────────┤  │ WP Events &     │                    │
│  │ At a Glance     │  │ News            │                    │
│  ├─────────────────┤  │                 │                    │
│  │ Activity        │  │                 │                    │
│  │  - Publishing   │  │                 │                    │
│  │  - Recent       │  │                 │                    │
│  │  - Comments     │  │                 │                    │
│  └─────────────────┘  └─────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

Widget contexts (PHP): `normal` (left/main), `side` (right), `column3`, `column4`. `dashboard_quick_press` and `dashboard_primary` are forced to `side`. `dashboard_browser_nag` and `dashboard_php_nag` are forced to `priority: high` (top of their column).

User can collapse individual widgets, hide them via Screen Options, drag-reorder within and across columns, and choose 1–4 columns.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading (initial) | First mount | Per-widget skeleton; layout reserved to avoid jump |
| Loading (per-widget) | Widget refetch | Inline spinner inside widget |
| Empty — Activity | No future, no recent, no comments | "No activity yet!" inside Activity widget |
| Empty — Recent Drafts | No drafts authored by current user | Hide "Your Recent Drafts" subsection |
| Empty — Quick Draft after save | Post created | Form clears; new draft appears in Recent Drafts list |
| Site Health — all clear | All tests pass | "Great job! Everything is running smoothly" |
| Site Health — issues | ≥1 critical or recommended | Counts and accordion entries |
| Browser nag | `wp_check_browser_version` returns `upgrade: true` | Persistent banner, dismissible by user meta |
| PHP nag | `wp_check_php_version` returns `is_acceptable: false` and user has `update_php` | Persistent banner |
| Welcome panel hidden | User meta `show_welcome_panel = 0` | Panel does not render |
| Error — widget fetch | Network/REST failure | Widget shows inline error + retry; rest of dashboard unaffected |
| Permission-trimmed | User missing widget cap | Widget simply absent (no error) |

---

## 7. Actions

### Header actions
- **Open Screen Options** — toggle widget visibility checkboxes + column count radio.
- **Open Help tab** — contextual help (omit in v1; deprecated UX).

### Welcome panel actions
- **Dismiss** — sets `show_welcome_panel = 0` user meta. Original sends `?welcome=0` GET; REST equivalent is `PUT /wp/v2/users/me { meta: { show_welcome_panel: 0 } }` if meta is registered.
- Each link inside (Customize, Add Widgets, Manage Menus, Edit Front Page, Edit Posts) — navigates to the corresponding app or screen.

### At a Glance actions
- **Click count** — navigates to filtered list (e.g. "98 Published posts" → posts list filtered to `status=publish`). Cap-gated: links are plain `<span>` for users without `cap.edit_posts`.
- **Click "Search engines discouraged"** — navigates to Reading settings.

### Activity actions (per recent comment row)

Standard comment row actions, identical surface to the Comments app:

| Action | Cap | Endpoint |
|---|---|---|
| Approve | `edit_comment` | `PUT /wp/v2/comments/{id} { status: 'approve' }` |
| Unapprove | `edit_comment` | `PUT /wp/v2/comments/{id} { status: 'hold' }` |
| Reply | `edit_comment` | Inline reply form → `POST /wp/v2/comments` with `parent` |
| Edit | `edit_comment` | Navigate to Comments app, edit |
| Spam | `edit_comment` | `PUT /wp/v2/comments/{id} { status: 'spam' }` |
| Trash | `edit_comment` | `DELETE /wp/v2/comments/{id}` (force=false → trash) |
| Delete Permanently | `edit_comment` (when `EMPTY_TRASH_DAYS` is 0) | `DELETE /wp/v2/comments/{id}?force=true` |
| View | `read_post` | Open public comment URL in new tab |

### Quick Draft actions
- **Save Draft** — `POST /wp/v2/posts { title, content, status: 'draft' }` with current-user as author. Server creates the draft; new draft appears in "Your Recent Drafts" list below.
- (Original UX uses an existing auto-draft `post_ID` cached in `dashboard_quick_press_last_post_id` user option — saves overwrite. A clean rebuild can drop this and always create new drafts; verified safe because auto-drafts older than the threshold are GC'd.)

### Per-widget actions
- **Collapse** — toggles inline; persists in `closedpostboxes_dashboard` user meta.
- **Configure** (only when widget registers a control callback, e.g. WP Events location) — opens inline form, posts back via `POST admin-ajax.php?action=dashboard-widgets`. No first-class REST.
- **Drag to reorder** — persists in `meta-box-order_dashboard` user meta via admin-ajax.

---

## 8. Filters, sort, search, pagination

N/A — Dashboard is a fixed dashboard surface with no filter/sort/search bar. Each widget has hard-coded queries (e.g. Activity → 5 most recent; Recent Drafts → 4 most recent).

The only "navigation" within the screen is the Screen Options menu (widget toggles) and the per-widget collapse. Pagination is not present on any widget; "view all" links exit to the relevant list app.

---

## 9. Forms & inputs

### Quick Draft form

| Field | Type | Required | Notes |
|---|---|---|---|
| Title | text | yes | Single-line input |
| Content | textarea | no | Plain text; **does not** mount block editor |

Submit button label: "Save Draft". On success, form clears and "Your Recent Drafts" refreshes.

### Recent Comments — Reply form (inline, per row)

Activates when "Reply" is clicked on a recent comment.

| Field | Type | Required | Notes |
|---|---|---|---|
| Reply text | textarea | yes | Plain text |
| Submit | button | — | Posts as comment with `parent: {comment.id}` and `post: {comment.post}` |
| Cancel | button | — | Closes inline form |

### Welcome panel

No inputs — purely informational with link clicks.

### WordPress Events and News widget

When user has not set a city, an inline location input appears:

| Field | Type | Required | Notes |
|---|---|---|---|
| City | text | yes | Submitted to `api.wordpress.org` for geo lookup; result cached in `community-events-location` user meta |

Validation: server-side authoritative. Client-side: required-field guard for Quick Draft title; reply textarea requires non-empty.

---

## 10. Routing & URL state

Original wp-admin URLs:
- `/wp-admin/` (alias)
- `/wp-admin/index.php`
- `?welcome=0` — sets dismiss flag and reloads
- `?admin_email_remind_later=1` — admin-email verification reminder postpone

The dashboard has **no internal routing** — there are no tabs, no pagination, no filter state to encode. Refresh always lands on the same view.

Recommended shell URL: `#/dashboard-home` (or whatever the registered app id is). No query params.

Inbound deep links from notifications (e.g. "your post was published" snackbar with "View dashboard" link) are common; they don't carry state.

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)

| Trigger | Destination | Carry |
|---|---|---|
| At a Glance "Published posts" count | Posts app | `status=publish&post_type=post` |
| At a Glance "Pages" count | Posts app | `post_type=page` |
| At a Glance "Comments" count | Comments app | (default view) |
| At a Glance "Comments in moderation" | Comments app | `status=hold` |
| At a Glance "Search engines discouraged" | Settings → Reading | (anchor to `blog_public`) |
| Activity comment "Edit" row action | Comments app | `comment={id}` |
| Activity comment "Reply" row action | Inline (no nav) | — |
| Activity post titles ("Publishing Soon", "Recently Published") | Editor app | `post={id}` |
| Quick Draft "View all drafts" | Posts app | `status=draft` |
| Quick Draft after save → click new draft | Editor app | `post={id}` |
| Welcome panel links | Various | Customize, Menus, Pages list, Posts list, Reading settings |
| Site Health "View Site Health" | Site Health app | (`status` tab default) |
| WP Events "Add your event" | External URL | new tab |
| Browser/PHP nag "Update" links | External URL | new tab |

### Inbound (other apps → this screen)

- After login → default landing.
- Toolbar "Site name" → home / dashboard.
- Command palette "Go to Dashboard".
- After site setup wizard.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Quick Draft saved | Inline success message in widget; new entry appears in Recent Drafts list |
| Quick Draft save failed | Inline error message above form; preserves field values |
| Comment row action (approve / spam / trash) | Inline row update + snackbar with Undo (5s) |
| Welcome dismiss | Panel slides out; no toast |
| Widget config save | Form replaced with success state; widget content refetches |
| Widget fetch failure | Per-widget inline error + retry button; dashboard unaffected |
| `?https_updated=1` query (after HTTPS migration from Site Health) | Dismissible success notice at top |

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `Tab` | Move through widget headings → controls → next widget |
| `Enter` / `Space` on widget heading | Toggle collapse |
| `Esc` in inline reply form | Close form, return focus to "Reply" button |
| `Cmd/Ctrl+Enter` in Quick Draft | Submit |

No drag-keyboard for reorder in core (mouse only) — flag for accessible reorder UI in shell rebuild (e.g. up/down menu options on each widget).

### ARIA & focus

- Widget container: `role="region"` with `aria-labelledby` pointing at the widget heading.
- Collapse toggle: `aria-expanded` reflects state.
- Widget heading buttons (collapse + configure): both `<button>` elements in the heading bar.
- Site Health accordion: `aria-expanded` per panel; one panel open at a time is fine.
- Site Health progress ring: `aria-hidden="true"` (decorative); status announced via live region "Critical issues: 2".
- Welcome panel "Dismiss" returns focus to next focusable element after the panel.
- Comment reply textarea: `aria-label` describes target comment.
- After Quick Draft save: focus moves to title input, screen-reader announces "Draft saved".

### Screen reader

- Each widget heading is an `<h2>` (or `<h3>` if nested under a section).
- "At a Glance" uses an unordered list; counts read as "98 Published posts".
- Recent comment row: hidden visually-rendered status text "[Pending]" present in DOM for screen readers.
- Live region announces fetch errors.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_dashboard_setup` | Register/unregister widgets | **Replace** with shell-level `dashboardWidgets` extensibility API on `core:dashboard` config |
| `wp_add_dashboard_widget` (function) | Direct widget registration | Replaced by shell registry |
| `dashboard_glance_items` | Add `<li>` items to At a Glance | Replace with structured `glanceItems` field config |
| `welcome_panel` (action) | Render welcome panel content | Replace with shell `welcomePanel` slot |
| `dashboard_recent_drafts_query_args` | Filter recent drafts query | Replace with config |
| `dashboard_recent_posts_query_args` | Filter recent posts query | Replace with config |
| `comment_row_actions` | Per-comment row actions | Reuse `core:comments.row-actions` slot from comments spec |
| `rightnow_end` / `activity_box_end` | Append HTML to widgets | Drop — too HTML-coupled |
| `dashboard_browser_nag_class` / `dashboard_php_nag_class` | Filter nag widget CSS classes | Drop — internal styling |

Plugin compatibility note: the dashboard ecosystem is large (Yoast SEO, Jetpack, WooCommerce, Akismet all add widgets). The shell's v1 implementation should support the most-common case via a `dashboardWidgets[]` array with `id`, `title`, `render` (component or `iframe:` fallback), `cap`, `defaultColumn`, `defaultPriority`. Plugins can register through the slot API.

---

## 15. Mapping & implementation status

### Current shell coverage

- **Source:** none. `core:dashboard` is not yet registered.
- **What works:** N/A — users land on the first nav item (typically Posts).
- **MVP behavior:** the shell skips a dashboard entirely; bundled `developer-admin` shell uses `iframe:index.php` only when explicitly added.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:dashboard` AppSource | High | Top-level prerequisite; no dashboard exists today |
| At a Glance widget | High | Aggregate counts; needs HEAD-request fanout (see also `posts.md` gap) |
| Activity widget (recent posts + comments) | High | Composes existing `useEntityRecords` queries |
| Quick Draft widget | High | Trivial REST `POST /wp/v2/posts`; reuse SimpleEditorApp form helpers |
| Site Health Status widget | High | Composes Site Health REST; cross-link `site-health.md` |
| WP Events and News widget | Medium | External `api.wordpress.org/events/1.0`; CORS allows direct browser fetch |
| Welcome panel | Medium | Static content; one user-meta toggle |
| Browser/PHP nags | Low | Detection logic needs reimplementation; PHP nag also requires server-side version reporting |
| Screen Options surface (widget toggles) | Medium | Per-user preferences; align with `core:appearance` user-prefs pattern |
| Drag-reorder widgets | Low | Defer until widget API stabilizes |
| Column count selector | Low | Layout responds at fixed breakpoints in v1 |
| Plugin widget extensibility | Medium | Slot API: `core:dashboard.widget` |
| Per-widget configure form | Low | Most plugins don't use; defer |
| `wp_count_posts` aggregate REST endpoint | High (cross-cutting) | Shared with `posts.md` and others; one new endpoint helps several screens |

### Acceptable interim

For shells that need a dashboard before native support lands, `iframe:index.php` works with chrome hidden (per `IframeApp` pattern). Mark such configs `dashboardImpl: 'iframe-fallback'` so they're tracked for replacement.

---

## 16. Out of scope

- **Network Admin Dashboard** ("Right Now" with site/user counts and search forms) — separate `network-dashboard` spec when shell adds multisite support.
- **User Admin Dashboard** (`/wp-admin/user/`) — niche; out of scope until needed.
- **Press This bookmarklet** — deprecated, removed from core.
- **Browser/PHP nag dismissal persistence per-user** — minor behavior; v1 always re-shows.
- **Community Events location override** — geo lookup defers to `api.wordpress.org`; user-overridable city is a follow-up.
- **`dashboard_glance_items` filter compat** — covered by extension points; no shim.
- **Drag-and-drop widget reorder** — keyboard-only reorder lands first; mouse drag is a follow-up.

---

## 17. Reference

- Original PHP: `wp-admin/index.php` (delegates to `wp-admin/_index.php`)
- Widget API: `wp-admin/includes/dashboard.php`
- Site Health REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-site-health-controller.php` (namespace `wp-site-health/v1`)
- Posts/Comments controllers: `wp-includes/rest-api/endpoints/class-wp-rest-{posts,comments}-controller.php`
- Settings controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- Browser check: `wp_check_browser_version()` in `wp-admin/includes/dashboard.php`
- PHP check: `wp_check_php_version()` in `wp-admin/includes/misc.php`
- Community Events: `wp_get_community_events()` in `wp-admin/includes/class-wp-community-events.php`
- Help docs: `https://wordpress.org/documentation/article/dashboard-screen/`
- Cross-link: `site-health.md` for the Site Health Status widget
- Cross-link: `posts.md` for At a Glance count workaround pattern
