# Screen Spec: Static Marketing Pages (About / Credits / Freedoms / Get Involved)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/about.php` + `wp-admin/credits.php` + `wp-admin/freedoms.php` + `wp-admin/contribute.php`
**Current workspace coverage:** None. Reachable only via `iframe:about.php` etc. if explicitly wired.

This spec covers the four sibling marketing/about screens that share a common header and tab navigation:

1. **About** (`about.php`) — "What's New" — release-feature highlights for the current major version.
2. **Credits** (`credits.php`) — Project Leaders + Core Contributors + Translators + External Libraries.
3. **Freedoms** (`freedoms.php`) — The Four Freedoms (GPL exposition).
4. **Get Involved** (`contribute.php`) — Make WordPress contributor pathways.

The Privacy tab also appears in the same nav strip (linking to `privacy.php`), but Privacy is a separate dynamic screen and is **out of scope here**.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `static-pages` (composite); sub-slugs `about`, `credits`, `freedoms`, `contribute` |
| Display name | "About WordPress" / "Credits" / "Freedoms" / "Get Involved" |
| Original URLs | `/wp-admin/about.php`, `/wp-admin/credits.php`, `/wp-admin/freedoms.php`, `/wp-admin/contribute.php` |
| Menu location | None — reached from admin footer "Thank you for creating with WordPress" link, the "WordPress {version}" admin-bar link, or after-update redirect |
| Parent app | None |
| Sub-screens | The four tabs are siblings; no further drill-down |

These screens are intentionally low-traffic. After-update flow lands users on `about.php?updated`; otherwise users typically never see them unless they explicitly click the version footer.

---

## 2. Purpose

Four jobs:

| Screen | Job |
|---|---|
| About | "What's new in this WordPress release" — feature highlights with screenshots |
| Credits | Acknowledge contributors of the current release |
| Freedoms | Educate users about WordPress's GPL freedoms and trademark policy |
| Get Involved | Direct users to Make WordPress contributor pathways |

Secondary jobs:
- After-update success affirmation ("Hey, the site is up and on the new version").
- Version-number reference for support / debugging context.
- Release-notes / field-guide jump-off links.

---

## 3. Capabilities & access

| Action | Capability |
|---|---|
| View any of the four | `read` (any authenticated user, including subscribers) |

These screens have no edit affordances and do not gate by role. They are the most permissive admin screens in core.

**Permission-denied state:** N/A — `read` is granted to every logged-in user. Anonymous users redirected to login per standard wp-admin behavior.

---

## 4. Data model

**No REST endpoints.** All four screens are fully **server-rendered static HTML** with translatable strings and inline asset references.

### Data sources by screen

#### About (`about.php`)
- WP version: `wp_get_wp_version()` → `$display_version` (full SemVer, e.g. `6.9.0`)
- Major version: hardcoded constant in PHP (`$display_major_version = '6.9';`) — set per release
- Release notes URL: `https://wordpress.org/documentation/wordpress-version/version-{major}/`
- Field guide URL: `https://make.wordpress.org/core/wordpress-{major}-field-guide/`
- Release page URL: `https://wordpress.org/download/releases/{major}/`
- Feature blocks: hardcoded copy + image references to `https://s.w.org/images/core/{major}/{feature}.webp`

#### Credits (`credits.php`)
- Server fetches from `https://api.wordpress.org/core/credits/{version}/` via `wp_credits()`
- Returns array of `groups` → core-developers, contributing-developers, props, validators, translators, libraries
- Each entry has name, gravatar hash, optional title (e.g. "Release Lead"), profile URL
- Cached in transient (24h) per `wp_credits()`

#### Freedoms (`freedoms.php`)
- Static four-freedoms strings + SVG images at `wp-admin/images/freedom-{1..4}.svg`
- Plugins URL: `admin_url('plugins.php')` if `activate_plugins`, else `https://wordpress.org/plugins/`
- Themes URL: `admin_url('themes.php')` if `switch_themes`, else `https://wordpress.org/themes/`
- License URL: `https://wordpress.org/about/license/`

#### Contribute (`contribute.php`)
- Fully static — copy + four illustrations:
  - `images/contribute-main.svg`
  - `images/contribute-no-code.svg`
  - `images/contribute-code.svg`
- Outbound link: `https://make.wordpress.org/contribute/`

### Cross-cutting
- The **shared header** displays a hero illustration `wp-admin/images/about-release-logo.svg?ver={version}` on Credits / Freedoms / Contribute (not About).
- The **tab strip** renders an `<a>` for each of the four (plus Privacy) — server-side rendered as `<nav class="about__header-navigation">`.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (about__header)                                       │
│  ├─ [Credits/Freedoms/Contribute] hero image                │
│  ├─ H1 (per-page title)                                      │
│  └─ Subtitle text                                            │
├─────────────────────────────────────────────────────────────┤
│ TAB NAVIGATION (about__header-navigation)                    │
│  [What's New] [Credits] [Freedoms] [Privacy] [Get Involved] │
│  Active tab has aria-current="page"                          │
├─────────────────────────────────────────────────────────────┤
│ BODY (about__section repeating)                              │
│  Per-screen content (sections of has-2-columns,             │
│  has-3-columns, has-1-column variants)                      │
│  Mix of headings, paragraphs, illustrations                 │
├─────────────────────────────────────────────────────────────┤
│ FOOTER ("return-to-dashboard")                               │
│  ├─ "Go to Updates" (when ?updated and update_core cap)     │
│  └─ "Go to Dashboard"                                        │
└─────────────────────────────────────────────────────────────┘
```

The four screens share identical header + tab + footer; only the body differs.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Default | First load | Static rendered content |
| After-update arrival | `?updated` query param + `update_core` cap | "Go to Updates" link visible in footer |
| Credits API failure | `wp_credits()` returns false (network or API outage) | Credits screen renders fallback copy: "Get involved in WordPress." (no contributor list) |
| Anonymous | No login | Redirect to `/wp-login.php` per standard wp-admin |
| Old browser | Pre-modern CSS | Visual fallback — these pages use modern flex/grid; no graceful degradation beyond browser default |

There are no loading / error / empty states beyond what's listed. These screens render fully on the server; there's nothing to fetch client-side.

---

## 7. Actions

### Header tab navigation

| Tab | Click behavior |
|---|---|
| What's New | Navigates to `about.php` |
| Credits | `credits.php` |
| Freedoms | `freedoms.php` |
| Privacy | `privacy.php` (separate screen — out of scope here) |
| Get Involved | `contribute.php` |

### About body buttons

| Button | Behavior |
|---|---|
| "See everything new" | External link to `https://wordpress.org/download/releases/{major}/` |
| "WordPress {version} Release Notes" link | External — `https://wordpress.org/documentation/wordpress-version/version-{major}/` |
| "WordPress {version} Field Guide" link | External — `https://make.wordpress.org/core/wordpress-{major}-field-guide/` |
| "Learn WordPress" link | External — `https://learn.wordpress.org/` |
| "Online Workshops" link | External — `https://learn.wordpress.org/online-workshops/` |

### Credits body
- Each contributor is a link to their `profiles.wordpress.org/{username}` profile.
- Each library entry links to its homepage (e.g. jQuery, lodash, react) — sourced from API response.
- "Get involved in WordPress" link → `https://make.wordpress.org/contribute/`.

### Freedoms body
- "WordPress license" / "GPL" links → `https://wordpress.org/about/license/`.
- Plugins link → `admin_url('plugins.php')` (internal) or `https://wordpress.org/plugins/` (external) depending on cap.
- Themes link → similar pattern.
- Trademark policy link → `https://wordpressfoundation.org/trademark-policy/`.

### Contribute body
- "Find your team" link → `https://make.wordpress.org/contribute/`.

### Footer
- "Go to Dashboard" → `/wp-admin/index.php`.
- "Go to Updates" → `/wp-admin/update-core.php` (only when `?updated` and `update_core` cap).

---

## 8. Filters, sort, search, pagination

N/A — fully static content. The Credits screen lists contributors in groups but does not paginate or sort interactively.

---

## 9. Forms & inputs

N/A — read-only screens with no inputs.

---

## 10. Routing & URL state

### Original wp-admin URL params
- `about.php?updated` — flag set by core after self-update; reveals "Go to Updates" footer link
- `freedoms.php?privacy-notice` — legacy redirect to `privacy.php` (301; lines 13–16 of freedoms.php)

No other URL params honored.

### Recommended workspace URL state
```
#/about
#/about/credits
#/about/freedoms
#/about/contribute
```

Or as separate top-level routes:
```
#/credits
#/freedoms
#/contribute
```

The hash should reflect the active tab so deep-linking works.

---

## 11. Inter-app navigation

| Trigger | Destination |
|---|---|
| Tab click | Other tabs in this group |
| Privacy tab click | `privacy` screen (separate spec — out of scope) |
| "Go to Dashboard" | Dashboard app |
| "Go to Updates" | Updates app (when present) |
| Plugins link (Freedoms) | Plugins app or external `wordpress.org/plugins` |
| Themes link (Freedoms) | Themes app or external `wordpress.org/themes` |
| Any contributor / library / external link | New tab to external URL |

These screens do not receive inbound nav from other workspace apps in a meaningful way (no command-palette commands, no row actions point here). The only inbound is from the admin footer / version link / after-update redirect.

---

## 12. Notifications & feedback

N/A — these screens display no notifications. They have no actions that produce feedback.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` | Move focus through links / buttons |
| `Enter` (link focused) | Navigate |
| `Space` (button focused) | Click |

No screen-specific keyboard shortcuts.

### ARIA
- Tab nav: `<nav aria-label="Secondary menu">`. Active tab has `aria-current="page"`.
- Hero images: `<img alt="WordPress {version}">`.
- Icon images: `aria-hidden="true" focusable="false"`.
- Each `<svg>` includes `aria-hidden`.

### Focus
- After-update redirect → focus on H1 heading (browser default).
- Tab navigation → focus follows active tab.

### Pain points
- Hero images are large; alt text could be more descriptive.
- The Contribute screen's bullet lists have repeated `<strong>` tags that screen readers may announce verbosely.
- These are minor — these screens are read-once-and-leave; high a11y polish is low value.

---

## 14. Extension points

These screens are intentionally **not extensible by plugins** in core. There are no `do_action` hooks for plugins to inject content, no filters for the contributor list (other than what `wp_credits()` returns from api.wordpress.org), and no slot system.

The single relevant filter:
- `pre_http_request` / `http_response` — generic HTTP filters can intercept the `wp_credits()` API call. Used by enterprise hosts to mock/proxy the API. Not specific to this screen.

For a workspace rebuild, **omitting these screens is a defensible choice**. They're not workflow-critical.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **None.** No `core:about` source. Reachable only via `iframe:about.php` etc. if explicitly wired.

### Gaps (rebuild recommendations)

These screens have very low ROI on full reimplementation. Three recommended approaches, ordered by effort:

| Approach | Effort | Recommendation |
|---|---|---|
| **A. Drop entirely** | 0 | Acceptable for most workspaces. Users hit `wp-admin/about.php` directly only after upgrades — and upgrades are an admin-only flow that may be cordoned off from the workspace anyway. |
| **B. Minimal banner** | Low | Render a small "WordPress {version}" badge in workspace footer or settings panel; link to `wordpress.org` for upgrade context. No tabs, no copy. |
| **C. Iframe fallback** | Low | `iframe:about.php` with chrome-hide CSS already in `IframeApp.js`. Inherits everything, including hero images and after-update banner. |
| **D. Native tabbed screen** | High | Reimplement four tabs as a single workspace app `core:about`. Body content sourced from upstream `wp-admin/{about,credits,freedoms,contribute}.php` parsed for translatable strings. Re-render in workspace with `@wordpress/ui` `Tabs.*` and content blocks. **Significant maintenance burden** — every WP release ships new About copy, screenshots, feature lists; the workspace would need to re-pull or re-render that content per release. |

### Detailed gap list (for approach D — full reimplementation)

| Gap | Priority | Notes |
|---|---|---|
| `core:about` workspace source | Low | Tabbed app with four sub-routes |
| Tab navigation host | Low | `Tabs.Root` + `Tabs.List` + `Tabs.Tab` from `@wordpress/ui` |
| Per-release content management | High effort | Static copy needs updating each WP release. Either: (a) hard-code per-release in workspace PHP, or (b) parse upstream `wp-admin/about.php` at render time, or (c) fetch from `api.wordpress.org` if it ever exposes one |
| `wp_credits()` REST exposure | Medium | Currently PHP-only. Workspace could expose `GET /wp-admin-workspaces/v1/credits` that calls `wp_credits()` server-side and caches |
| Asset hosting (s.w.org images, admin SVGs) | Low | Either proxy through workspace or load directly from `https://s.w.org/...` (these are CDN-served WordPress.org assets) |
| After-update arrival flag | Low | Detect `?updated` and surface "Go to Updates" link |
| Privacy tab integration | Out of scope | Privacy is dynamic; separate spec |
| Translation strings | Medium | All copy is `__()`-wrapped in core; rebuild must preserve i18n |

### Workspace config recommendation

For most workspaces, omit these screens entirely. The bundled demo workspaces (`single-pane-demo`, `desktop-demo`) do not surface these. Only the `wp-admin-default` baseline should consider exposing them — and the iframe fallback (approach C) is the path of least resistance.

If a workspace wants to surface a "WordPress version" affordance, the recommended pattern is:
1. A small "v6.9" badge in the site-hub or footer.
2. Click → opens a popover / modal with version + brief release-link.
3. No native tabs, no contributor list.

---

## 16. Out of scope

- **Privacy tab** (`privacy.php`) — dynamic screen with REST data flow (privacy policy generator, suggested clauses); deserves its own spec. Not handled here despite appearing in the same tab strip.
- **Welcome panel on Dashboard** — separate dashboard widget, not part of these four screens.
- **Block editor's "Welcome guide" modal** — covered in [`editor-block-modes.md`](./editor-block-modes.md).
- **Site Health screen** — diagnostic, not marketing; separate spec.

---

## 17. Reference

- About: `wp-admin/about.php`
- Credits: `wp-admin/credits.php` + `wp-admin/includes/credits.php` (`wp_credits()`)
- Freedoms: `wp-admin/freedoms.php`
- Get Involved: `wp-admin/contribute.php`
- Shared admin header: `wp-admin/admin-header.php`
- Shared CSS: `wp-admin/css/about.css` (about-screen styles)
- Hero/illustration assets: `wp-admin/images/about-release-logo.svg`, `wp-admin/images/freedom-{1..4}.svg`, `wp-admin/images/contribute-{main,code,no-code}.svg`, plus per-release CDN assets at `https://s.w.org/images/core/{major}/`
- Credits API: `https://api.wordpress.org/core/credits/{version}/`
- Translatable strings (release-notes / version-info patterns) at end of `about.php` (lines 286+, kept around for translation pipelines even when not displayed)
