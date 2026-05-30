# Screen Spec: Settings — Reading

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-reading.php`, `wp-admin/options.php` (legacy save handler)
**Current shell coverage:** `core:settings-reading` → `src/apps/settings-reading/index.js` (M4 — REST-native, partial)

This spec describes the **semantic surface** of the Reading Settings screen so an agent can rebuild it in any UI library or framework.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-reading` |
| Display name | "Reading" / "Reading Settings" |
| Original URL | `/wp-admin/options-reading.php` |
| Menu location | Settings → Reading |
| Submenu items | N/A |
| Parent app | `core:settings` |
| Sub-screens | None |

---

## 2. Purpose

Choose what visitors see at the front page, control feed (RSS) output, and toggle search engine indexing.

Jobs to be done:
- **Pick a homepage** — latest posts (classic blog) vs. a static page.
- **Designate a posts page** — when running a static-front site, pick which page lists posts.
- **Throttle pagination** — how many posts per page in the blog index.
- **Configure feeds** — number of items, full text vs. excerpt.
- **Hide from search engines** — coming-soon / staging mode (best-effort robots directive).

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_options` | `options-reading.php` line 12 |
| Save settings | `manage_options` | REST controller |

**Permission-denied state:** `wp_die()`.

**Multisite:** No special handling.

---

## 4. Data model

### Primary entity
- REST endpoint: `GET/POST /wp/v2/settings`

### REST-exposed fields

Verified against `register_initial_settings()` in `wp-includes/option.php` (lines 2900–2942).

| Form field | Option name | REST key | Type | Default | Notes |
|---|---|---|---|---|---|
| Your homepage displays | `show_on_front` | `show_on_front` | string | `posts` | enum `posts` / `page` |
| Homepage | `page_on_front` | `page_on_front` | integer | 0 | page ID; only meaningful when `show_on_front === 'page'` |
| Posts page | `page_for_posts` | `page_for_posts` | integer | 0 | page ID |
| Blog pages show at most | `posts_per_page` | `posts_per_page` | integer | 10 | min 1 |

### Non-REST options (legacy form save only — gaps)

| Option | Form field | Type | Notes |
|---|---|---|---|
| `posts_per_rss` | Syndication feeds show the most recent | int | Default 10 |
| `rss_use_excerpt` | For each post in a feed include | enum 0/1 | 0 = Full text, 1 = Excerpt |
| `blog_public` | Search engine visibility | string `0`/`1` | 1 = allow, 0 = discourage |
| `blog_charset` | Encoding for pages and feeds | string | Only registered when `! is_utf8_charset()` (rare) |

### Aggregate data
- Pages: `GET /wp/v2/pages?per_page=100&context=edit&status=publish` — populates Homepage and Posts Page dropdowns. Hierarchical pages should preserve hierarchy in display.
- Privacy Policy page ID: `wp_page_for_privacy_policy` option — used to warn if user picks the same page for homepage/posts page.

### Validation rules (PHP-side)
- If `show_on_front === 'page'` and (`page_on_front === 0` AND `page_for_posts === 0`), core silently reverts `show_on_front` to `posts`.
- If `page_for_posts === page_on_front` and both non-zero, **warning** banner: "these pages should not be the same!"
- If either `page_for_posts` or `page_on_front` equals `wp_page_for_privacy_policy`, **warning** banner: "these pages should not be the same as your Privacy Policy page!"
- If no pages exist, `show_on_front` is forced to `posts` and the radio is hidden.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Reading")                                        │
├─────────────────────────────────────────────────────────────┤
│ FORM                                                         │
│  ├─ Your homepage displays                                   │
│  │    ◯ Your latest posts                                    │
│  │    ◯ A static page (select below)                         │
│  │       ├─ Homepage:  [page select]                         │
│  │       └─ Posts page: [page select]                        │
│  │       └─ inline warnings (same page, == privacy page)     │
│  ├─ Blog pages show at most       [number, default 10]       │
│  ├─ Syndication feeds show at most [number, default 10]      │
│  ├─ For each post in a feed include                          │
│  │    ◯ Full text                                            │
│  │    ◯ Excerpt                                              │
│  ├─ Encoding for pages and feeds [text — conditional, rare]  │
│  └─ Search engine visibility                                 │
│       ☐ Discourage search engines from indexing this site    │
│       (or radio set if `blog_privacy_selector` action used)  │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Save Changes button                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton form |
| Idle | Loaded, no edits | Save disabled |
| Editing | Field changed | Save enabled |
| Saving | Save in flight | Save busy |
| Saved | Save success | Snackbar |
| Error | REST 4xx/5xx | Inline notice |
| No pages exist | `wp_count_posts('page')` zero | Static-page radio hidden; force `show_on_front=posts` |
| Same-page warning | `page_for_posts === page_on_front` | Inline warning notice in front-page section |
| Privacy-page collision warning | Either page === `wp_page_for_privacy_policy` | Inline warning notice |
| `blog_public === '0'` | Indexing discouraged | Persistent admin-bar / dashboard banner across the rest of admin (handled outside this panel, but originating here) |

---

## 7. Actions

### Primary action
- **Save Changes** — `POST /wp/v2/settings` for REST keys; AJAX/PHP fallback for `posts_per_rss`, `rss_use_excerpt`, `blog_public`.

### Secondary actions
- None at this panel level. Page picker is a basic select; no inline page creation.

### Optimistic vs. blocking
- **Save Changes** — blocking.

---

## 8. Filters, sort, search, pagination

N/A — settings panel.

---

## 9. Forms & inputs

### Your homepage displays
- Type: radio group
- REST: `show_on_front` (writable, enum `posts`/`page`)
- Required: yes
- Default: `posts`

#### Homepage (sub-input)
- Type: select
- REST: `page_on_front` (writable, integer)
- Default: 0 (— Select —)
- Validation: must be a published page ID; not equal to Posts Page; not equal to Privacy Policy page (warnings only).

#### Posts page (sub-input)
- Type: select
- REST: `page_for_posts` (writable, integer)
- Default: 0
- Validation: same rules as Homepage; both fields validate jointly.

### Blog pages show at most
- Type: number with unit suffix "posts"
- REST: `posts_per_page` (writable, integer)
- Default: 10
- Min: 1; Step: 1
- Validation: positive integer.

### Syndication feeds show the most recent
- Type: number with unit suffix "items"
- Option: `posts_per_rss`
- REST: **not exposed** — gap
- Default: 10
- Min: 1; Step: 1

### For each post in a feed include
- Type: radio (Full text / Excerpt)
- Option: `rss_use_excerpt`
- REST: **not exposed** — gap
- Values: 0 = Full text, 1 = Excerpt
- Default: 0

### Encoding for pages and feeds (conditional)
- Type: text
- Option: `blog_charset`
- REST: **not exposed**
- Visibility: only when `! is_utf8_charset()` — effectively dead on modern installs.

### Search engine visibility
- Type: checkbox (default) OR radio group (when `blog_privacy_selector` action hooked)
- Option: `blog_public`
- REST: **not exposed** — gap
- Values: `1` (allow), `0` (discourage)
- Default: `1`
- Helper: "It is up to search engines to honor this request."
- Side effect: when `0`, the rest of admin shows a "Search engines discouraged" reminder.

### Save semantics
- Single Save button.
- Mixed REST + non-REST save.
- Validation: server authoritative; client may show same-page warnings before save.

---

## 10. Routing & URL state

Original wp-admin URL: `/wp-admin/options-reading.php`. `?settings-updated=true` for legacy redirect.

Shell hash route: `#/settings/reading`.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click "Pages" link in homepage helper | `pages` app | optional `?action=new` |
| Click "static page" link in help | `pages` app | none |
| Click feeds documentation link | external | URL |

### Inbound
- From `core:settings` host.
- From Customizer (legacy) "Homepage Settings" panel — when Customizer is retired in shells.
- From Site Editor "Front page" affordance.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Save success | Snackbar: "Settings saved." |
| Same-page warning | Inline warning notice; non-blocking |
| Privacy page collision | Inline warning notice |
| `blog_public === '0'` saved | Snackbar + persistent reminder banner site-wide |
| Save error | Inline banner |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between fields |
| `↑` / `↓` in radio groups | Move selection |
| `Cmd/Ctrl+S` | Save |

### ARIA & focus
- Front-page radio group: `<fieldset><legend>Your homepage displays</legend>`.
- Feed-include radio group: same pattern.
- Page-select dropdowns: `aria-describedby` to inline warning when one applies.
- "Discourage search engines" checkbox uses `aria-describedby` for helper text.
- Same-page warning: `role="alert"` so it announces immediately.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `blog_privacy_selector` | Convert single checkbox to radio group; allow plugins to add visibility options | Honor — switch UI mode when action hooked |
| `do_settings_fields( 'reading', 'default' )` | Plugin-added fields | `core:settings.panels` sub-slot |
| `pre_option_show_on_front` etc. | Hijack option reads | Drop — REST handles |

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** `core:settings-reading` → `src/apps/settings-reading/index.js`
- **What works:** `show_on_front`, `page_on_front`, `page_for_posts`, `posts_per_page` via REST. Inline warnings for same-page collisions. Saves via `core/notices`.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `posts_per_rss` | Medium | Non-REST. Custom endpoint or AJAX fallback. |
| `rss_use_excerpt` | Medium | Non-REST. |
| `blog_public` (Search engine visibility) | High | Non-REST. The most-touched legacy option, side-effects across admin. |
| Privacy-page collision warning | Low | Validate against `wp_page_for_privacy_policy`. |
| `blog_charset` | Skip | Effectively dead on UTF-8 sites. |
| Plugin-added fields via `add_settings_field('reading',…)` | Low | `core:settings.panels` slot. |
| `blog_privacy_selector` UI mode | Low | Plugins rarely use this anymore. |

### Acceptable interim
`iframe:options-reading.php` for full parity.

---

## 16. Out of scope

- **`blog_charset`** — UTF-8 default; only registered on sub-UTF-8 installs.
- **Customizer Homepage Settings panel** — superseded by this REST panel and the Site Editor.
- **Per-post-type front page support** — only `page` types are valid for `page_on_front`/`page_for_posts`.

---

## 17. Reference

- Original PHP form: `wp-admin/options-reading.php`
- Save handler: `wp-admin/options.php` lines 142–150 for `allowed_options['reading']`
- Settings registration: `wp-includes/option.php` lines 2900–2942
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`
- REST API reference: `https://developer.wordpress.org/rest-api/reference/settings/`
- Current shell impl: `src/apps/settings-reading/index.js`
