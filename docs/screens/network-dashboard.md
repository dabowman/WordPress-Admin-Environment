# Screen Spec: Network Dashboard (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/network/index.php` + `wp_network_dashboard_right_now()` in `wp-admin/includes/dashboard.php`
**Current workspace coverage:** None — Network Admin is not yet exposed by the workspace.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `manage_network`.

This spec describes the **semantic surface** of the Network Dashboard so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-dashboard` |
| Display name | "Dashboard" (network context) |
| Original URL | `/wp-admin/network/index.php` |
| Menu location | Top of network admin menu (`menu[2]` in `wp-admin/network/menu.php`) |
| Submenu items | Home (this screen), Updates → `network-updates`, Upgrade Network → `network-updates` (upgrade tool) |
| Parent app | None — top-level network app |
| Sub-screens | None |

The screen is the network admin landing page. It is conceptually parallel to the single-site dashboard (`dashboard-home`) but its widgets are network-scoped and the action surface centers on creating sites and users.

---

## 2. Purpose

Give a network administrator a single landing surface that surfaces network-wide health, primary creation tasks (new site, new user), and quick search across both populations. Secondary use: orient on the network's update state via the deep-linked Updates submenu.

Jobs to be done:
- **See network scale at a glance** — total sites, total users.
- **Find a site or user quickly** — two search inputs route to the respective list screens.
- **Create a site / create a user** — one click into either creation flow.
- **Stay informed about WordPress** — read the news/events feed, same as single-site.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_network` | `wp-admin/network/index.php` line 16 |
| See "Create a New Site" link | `create_sites` | `wp_network_dashboard_right_now()` |
| See "Create a New User" link | `create_users` | `wp_network_dashboard_right_now()` |
| Use search-sites form | `manage_sites` (target screen cap) | redirects to `network/sites.php` |
| Use search-users form | `manage_network_users` (target screen cap) | redirects to `network/users.php` |
| See Updates submenu | `update_core` OR `update_plugins` OR `update_themes` OR `update_languages` | `wp-admin/network/menu.php` lines 20–28 |
| See Upgrade Network submenu | `upgrade_network` | `wp-admin/network/menu.php` line 51 |

**Permission-denied state:** core does `wp_die(__('Sorry, you are not allowed to access this page.'), 403)` if `manage_network` is missing. Workspace should render a "no access" empty state and not blank.

**Multisite gating:** the entire network admin namespace requires `is_multisite()`. The workspace should not register network-admin sources unless multisite is detected at config-load time.

---

## 4. Data model

The Network Dashboard is composed of independent dashboard widgets registered through `wp_dashboard_setup()` in network context.

### Widgets registered by core (network context)

| Widget ID | Title | Source |
|---|---|---|
| `network_dashboard_right_now` | "Right Now" | `wp_network_dashboard_right_now()` |
| `dashboard_primary` | "WordPress Events and News" | `wp_dashboard_primary()` (same as single-site) |
| `dashboard_browser_nag` (conditional) | "You are using an insecure browser!" / "Your browser is out of date!" | `wp_check_browser_version()` |
| `dashboard_php_nag` (conditional) | "PHP Update Required" / "PHP Update Recommended" | `wp_check_php_version()` |

Note: `dashboard_right_now` (single-site "At a Glance"), `dashboard_activity`, `dashboard_quick_press`, `dashboard_site_health` are **not** registered in network context — they are gated to single-site dashboard.

### "Right Now" widget data

| Field | Source | Type |
|---|---|---|
| Total sites count | `get_blog_count()` (read from `wp_sitemeta` cache) | int |
| Total users count | `get_user_count()` (read from `wp_sitemeta` cache) | int |
| "Create a New Site" link | `network_admin_url('site-new.php')` (gated by `create_sites`) | URL |
| "Create a New User" link | `network_admin_url('user-new.php')` (gated by `create_users`) | URL |
| Search-sites form action | `network_admin_url('sites.php')` | URL |
| Search-users form action | `network_admin_url('users.php')` | URL |

### "WordPress Events and News" widget data

Pulls and caches RSS feeds for the upcoming events feed and the WordPress.org news feed. Identical to the single-site implementation — see `dashboard-home.md` § 4.

### REST equivalents

| Widget data | REST | Status |
|---|---|---|
| Site count (`get_blog_count`) | None | **GAP** — not exposed via REST. Workaround: `WP_Site_Query` is internal; no `/wp/v2/sites`. The dashboard reads `wp_sitemeta.user_count` / `blog_count` directly. |
| User count (`get_user_count`) | None | **GAP** — same. `_get_user_count()` writes `wp_sitemeta.user_count` on user create/delete; no REST surface. Approximation: `GET /wp/v2/users?context=edit&per_page=1` and read `X-WP-Total` (only counts users discoverable to the current request — the network admin reads via `WP_User_Query` with `blog_id=0` to pierce per-site filtering). |
| Browser nag | `GET /wp-json/wp/v2/?_fields=...` won't return it; `wp_check_browser_version()` is admin-only | GAP |
| PHP nag | `wp_check_php_version()` is admin-only | GAP |
| News feed | Direct fetch of feed XML (no REST proxy) | N/A — fetched client-side or proxied |

The workspace needs a network-scoped data endpoint or a privileged option-read fallback to render the "Right Now" widget faithfully. Document as a known gap.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Dashboard")                                      │
│  └─ Welcome message (static, network-aware)                  │
├─────────────────────────────────────────────────────────────┤
│ WIDGET GRID (multi-column, drag-reorderable in core)         │
│                                                              │
│  ┌────────────────────────┐  ┌────────────────────────┐      │
│  │ Right Now              │  │ WordPress Events &     │      │
│  │ - Action links         │  │ News                   │      │
│  │   • Create New Site    │  │ - Upcoming events      │      │
│  │   • Create New User    │  │ - Latest blog posts    │      │
│  │ - "You have N sites    │  └────────────────────────┘      │
│  │    and M users."       │                                  │
│  │ - Search Users form    │  ┌────────────────────────┐      │
│  │ - Search Sites form    │  │ (Conditional nags:     │      │
│  └────────────────────────┘  │  Browser / PHP)        │      │
│                              └────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

Drag-to-reorder column layout is a single-site dashboard feature (`postboxes.js`). Re-implementation in the workspace is optional; v1 may render a fixed two-column responsive layout.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch of widget data | Skeleton per widget; preserve grid shape |
| Stale counts | Cached counts read from `wp_sitemeta` may lag actual create/delete | Show counts as-is; core doesn't surface staleness |
| News feed unavailable | Feed fetch fails / times out | Inline "Could not load news" inside that widget only |
| Permission denied | User lacks `manage_network` | "You don't have permission" + back link |
| No multisite | Reached on a single-site install | Should not be reachable; if it is, redirect to `dashboard-home` |
| Pending email-change banner | `new_admin_email` site option is set (from `network-settings.md`) | Inline banner above widget grid (core renders it on `network/settings.php`, not dashboard — out of scope) |

---

## 7. Actions

### Header / page-level
- None. The dashboard is widget-based.

### "Right Now" widget actions
| Action | Cap | Type | Destination |
|---|---|---|---|
| "Create a New Site" | `create_sites` | Navigation | `network-sites` (Add Site sub-screen) |
| "Create a New User" | `create_users` | Navigation | `network-users` (Add User sub-screen) |
| Submit "Search Users" | `manage_network_users` (target) | Navigation | `network-users?s={query}` |
| Submit "Search Sites" | `manage_sites` (target) | Navigation | `network-sites?s={query}` |

The two search forms are GET forms posting to the respective list screens — no AJAX, no inline results. Wildcard `*` allowed (e.g. `user*`); core's note: "Use a wildcard to search for a partial username, such as user*."

### Conditional nag actions
- "Update PHP" link in PHP nag (external doc URL).
- "Update browser" link in browser nag (external doc URL).

No optimistic mutations on this screen — it is read + redirect-to-search.

---

## 8. Filters, sort, search, pagination

N/A — dashboard widgets are not paginated, filtered, or sorted. The two search forms route off-screen.

---

## 9. Forms & inputs

### Search Users (inline form on widget)
| Field | Type | Required |
|---|---|---|
| `s` | search input | no — empty submit lands on full users list |

### Search Sites (inline form on widget)
| Field | Type | Required |
|---|---|---|
| `s` | search input | no — empty submit lands on full sites list |

Both forms submit via GET to their target list screens. Wildcard prefix/suffix matching is handled server-side by `WP_MS_Sites_List_Table::prepare_items()` and `WP_MS_Users_List_Table::prepare_items()`.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/network/index.php` — no query params on the dashboard itself. The widget action links carry users away to:
- `/wp-admin/network/site-new.php`
- `/wp-admin/network/user-new.php`
- `/wp-admin/network/sites.php?s={query}`
- `/wp-admin/network/users.php?s={query}`

Recommended workspace hash: `#/network-dashboard` (no query state on the dashboard itself).

---

## 11. Inter-app navigation

### Outbound (this screen → other apps)
| Trigger | Destination | Carry |
|---|---|---|
| "Create a New Site" | `network-sites` | sub-route `add` |
| "Create a New User" | `network-users` | sub-route `add` |
| Search Sites submit | `network-sites` | `?s={query}` |
| Search Users submit | `network-users` | `?s={query}` |
| Updates submenu | `network-updates` | none |
| Upgrade Network submenu | `network-updates` | sub-route `upgrade` |
| News feed item click | external URL | new tab |

### Inbound (other apps → this screen)
- From any network admin app's "Home" / breadcrumb-root link.
- After completing the network installer (`network-settings` setup tab), users are redirected here.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Counts cache refresh | None — counts read live from `sitemeta` cache, no UI feedback |
| News feed timeout | Inline "Could not load" inside the widget |
| Pending network admin email change | Banner on the Network Settings screen, not on this dashboard |

The dashboard has no destructive actions, so no snackbar/undo patterns.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` | Move focus across widget actions and search inputs |
| `/` | Focus a quick-find search if the workspace wraps the page (workspace-level; core doesn't bind this on network dashboard) |
| `Enter` (in search input) | Submit the form |

### ARIA & focus
- Each widget should be a `<section>` with `aria-labelledby` referencing its `<h2>` title.
- The "Right Now" widget's two search forms each need a labelled search input (core uses `screen-reader-text` labels — preserve).
- The action-link list (`<ul class="subsubsub">`) is a flat list of links; mark up as a list, not a navigation landmark.
- News feed: each item is a heading + summary; ensure the link is the heading.
- Live regions: not needed on this screen — no async-mutating UI.

### Screen reader
- Widget titles announced as section headings.
- Counts: "You have N sites and M users." is a plain paragraph; ensure number formatting respects locale (`number_format_i18n`).

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_network_dashboard_setup` (action) | Add/remove network dashboard widgets | Replace with workspace-level `network-dashboard.widgets` slot |
| `wpmuadminresult` (action, inside Right Now) | Inject content above the search forms | Drop — no clean workspace equivalent; rare |
| `mu_rightnow_end` (action) | Append to Right Now widget | Replace with `network-dashboard.right-now.after` slot |
| `mu_activity_box_end` (action) | Same position as above (legacy alias) | Drop — duplicate of `mu_rightnow_end` |
| `dashboard_primary_link` / `dashboard_primary_feed` / `dashboard_primary_title` (filters) | Override the news feed source | Replace with workspace-level news widget config |

Plugin compatibility: third-party network dashboard widgets registered via `wp_add_dashboard_widget()` inside the `wp_network_dashboard_setup` action will not render in the workspace unless the workspace explicitly bridges to that hook. Document.

---

## 15. Mapping & implementation status

### Current workspace coverage
- None. Network admin is not yet exposed.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Multisite detection at config load | High | Workspace must skip `network-*` source registration when `is_multisite()` is false |
| `network-dashboard` source | High | Top-level app for network admin landing |
| Site count / user count data | High | No REST endpoint; need workspace-side option-read endpoint or `_get_blog_count` / `_get_user_count` proxy |
| News feed widget | Medium | Reuses single-site `dashboard-home` widget — share implementation |
| Browser/PHP nag widgets | Low | Optional — can be deferred |
| Two-column responsive grid | Medium | Workspace can render simpler layout; drag-reorder out of scope for v1 |

### Acceptable interim
`iframe:network/index.php` with chrome hidden is acceptable as a v1 escape hatch.

---

## 16. Out of scope

- **Drag-to-reorder widgets** — relies on `postboxes.js` and per-user meta; defer.
- **Show/hide widgets via screen options** — same.
- **`wpmuadminresult` action injection** — rarely used.
- **Profile / Privacy submenus** — `wp-admin/network/profile.php` and `network/privacy.php` are thin redirects to `user-edit.php?user_id=current` and the privacy policy guide respectively. Not separate screens; mention only here.

---

## 17. Reference

- Original PHP: `wp-admin/network/index.php`
- Right-Now widget: `wp-admin/includes/dashboard.php::wp_network_dashboard_right_now()` (line 454)
- Widget registration: `wp-admin/includes/dashboard.php::wp_dashboard_setup()` (line 20, network branch at line 77)
- Network menu: `wp-admin/network/menu.php`
- Profile redirect: `wp-admin/network/profile.php`
- Privacy redirect: `wp-admin/network/privacy.php`
- Single-site dashboard spec (related): `docs/screens/dashboard-home.md`
