# Screen Spec: Site Health

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/site-health.php` (Status tab) + `wp-admin/site-health-info.php` (Info tab) + `wp-admin/includes/class-wp-site-health.php` + `wp-admin/includes/class-wp-debug-data.php`
**Current shell coverage:** None. Bundled `developer-admin.json` exposes the original via `iframe:site-health.php`.

This spec describes the **semantic surface** of the WordPress Site Health screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `site-health` |
| Display name | "Site Health" |
| Original URL | `/wp-admin/site-health.php` (Status tab default); `/wp-admin/site-health.php?tab=debug` (Info tab) |
| Menu location | Sub-item of "Tools" menu |
| Parent app | `tools` group |
| Sub-screens | Two tabs: Status (default), Info. Plugins can add additional tabs via `site_health_navigation_tabs` filter; if more than 4 tabs total, the 4th+ become an overflow menu. |

The screen surfaces a health diagnosis that runs both server-side direct checks (synchronous, available immediately) and async REST checks (each test polled separately and rendered into the right severity bucket).

---

## 2. Purpose

Diagnose configuration, performance, security, and connectivity issues; provide a debug data export for support exchanges.

Jobs to be done (Status tab):
- **See critical site issues** — filesystem permissions, outdated PHP, broken cron, etc.
- **Review recommended improvements** — page cache, persistent object cache, HTTPS readiness.
- **Verify "everything is fine"** — encouragement state when no issues.
- **Switch to HTTPS** — one-click migration when supported.
- **Browse passed tests** — disclosure for full audit.

Jobs to be done (Info tab):
- **Copy site debug data to clipboard** — paste into support tickets.
- **Inspect WP / server / DB / theme / plugin configuration** — readonly accordion of every detail.
- **See directory sizes** — uploads, themes, plugins, fonts, WordPress core, database, total.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View Status tab | `view_site_health_checks` | `site-health.php` line 47 |
| View Info tab | `view_site_health_checks` | (same) |
| Update site to HTTPS | `update_https` | `site-health.php` line 61 (action `update_https`) |
| Run async test (each) | `view_site_health_checks` (filter `site_health_test_rest_capability_{test}`) | `WP_REST_Site_Health_Controller::validate_request_permission` |
| See directory sizes | `view_site_health_checks` AND not multisite | `site-health-controller.php` line 156 |

Default cap: granted to administrators (`single`-site) and super-admins (multisite).

**Permission-denied state:** screen uses `wp_die( 'Sorry, you are not allowed to access site health information.', '', 403 )`. Shell renders 403 view.

**Multisite:** directory-sizes endpoint is **disabled on multisite** (network admin should aggregate per-site, not implemented in core). Other tests run identically.

---

## 4. Data model

### Status tab — synchronous tests (run server-side at page render)

`WP_Site_Health::get_tests()` returns a structured set:
```
[
  'direct' => [
    'wordpress_version' => [ 'label' => …, 'test' => callable ],
    'plugin_version'    => …,
    'theme_version'     => …,
    'php_version'       => …,
    'php_extensions'    => …,
    'php_default_timezone' => …,
    'php_sessions'      => …,
    'sql_server'        => …,
    'ssl_support'       => …,
    'scheduled_events'  => …,
    'http_requests'     => …,
    'rest_availability' => …,
    'debug_enabled'     => …,
    'file_uploads'      => …,
    'plugin_theme_auto_updates' => …,
    'available_updates_disk_space' => …,
    'update_temp_backup_writable' => …,
    'persistent_object_cache' => …,
  ],
  'async'  => [
    'background_updates'   => [ 'has_rest' => true, 'test' => 'background-updates' ],
    'loopback_requests'    => …,
    'https_status'         => …,
    'dotorg_communication' => …,
    'authorization_header' => …,
    'page_cache'           => [ 'has_rest' => true, 'test' => 'page-cache', 'async_direct_test' => … ],
  ],
]
```

Direct tests run inline. Async tests are dispatched client-side via REST (one fetch per test). Each test returns:

| Field | Type | Notes |
|---|---|---|
| `label` | string | Human-readable summary |
| `status` | enum | `good`, `recommended`, `critical` |
| `badge` | object | `{ label: string, color: 'green'|'orange'|'red'|'gray'|'blue' }` |
| `description` | HTML | Detailed explanation + remediation links |
| `actions` | HTML | Optional action buttons (e.g. "Update PHP", "Switch to HTTPS") |
| `test` | string | Stable id |

### Status tab — REST endpoints (one per async test)

Namespace: `wp-site-health/v1`. Base: `tests`.

| Test | Endpoint | Cap |
|---|---|---|
| Background updates | `GET /wp-site-health/v1/tests/background-updates` | `view_site_health_checks` (filterable per-test) |
| Loopback requests | `GET /wp-site-health/v1/tests/loopback-requests` | (same) |
| HTTPS status | `GET /wp-site-health/v1/tests/https-status` | |
| Dotorg communication | `GET /wp-site-health/v1/tests/dotorg-communication` | |
| Authorization header | `GET /wp-site-health/v1/tests/authorization-header` | |
| Page cache | `GET /wp-site-health/v1/tests/page-cache` | |
| Directory sizes | `GET /wp-site-health/v1/directory-sizes` | (NB: not under `tests`; single-site only) |

All return JSON shaped as the test result above.

### Info tab — debug data

Source: `WP_Debug_Data::debug_data()` returns sections keyed by id:

| Section id | Label | Notes |
|---|---|---|
| `wp-core` | WordPress | version, language, home/site URL, multisite flag, debug mode |
| `wp-paths-sizes` | Directories and Sizes | uploads, themes, plugins, fonts, wordpress, database, total. Loaded async via `directory-sizes` endpoint. |
| `wp-active-theme` | Active Theme | name, version, author, template, stylesheet, paths |
| `wp-parent-theme` | Parent Theme | when child theme active |
| `wp-themes-inactive` | Inactive Themes | array of name/version per theme |
| `wp-mu-plugins` | Must Use Plugins | array |
| `wp-plugins-active` | Active Plugins | array (name, version, author, auto-update flag) |
| `wp-plugins-inactive` | Inactive Plugins | array |
| `wp-media` | Media Handling | active editor, ImageMagick / GD versions, ghostscript, ffmpeg, file size limits |
| `wp-server` | Server | server architecture, PHP version, PHP SAPI, max execution time, memory limit, max upload size, max post size, modules, is_proxied, htaccess rules |
| `wp-database` | Database | extension, server version, client version, max-connections, host |
| `wp-constants` | WordPress Constants | ABSPATH, WP_HOME, WP_SITEURL, WP_CONTENT_DIR, WP_PLUGIN_DIR, WP_DEBUG, WP_MEMORY_LIMIT, WP_MAX_MEMORY_LIMIT, WP_DEBUG_LOG, WP_DEBUG_DISPLAY, SCRIPT_DEBUG, COMPRESS_SCRIPTS, COMPRESS_CSS, WP_ENVIRONMENT_TYPE |
| `wp-filesystem` | Filesystem Permissions | wordpress, wp-content, uploads, plugins, themes, fonts, mu-plugins each with writable bool |
| (custom) | Plugin/theme-injected sections | via `debug_information` filter |

Each field has `label` and `value` (string or array); a few are special (`uploads_size`, `themes_size`, `plugins_size`, `fonts_size`, `wordpress_size`, `database_size`, `total_size`) and are CSS-classed for special formatting.

### REST gap: bulk debug data

Info tab has **no first-class REST endpoint** for the full debug-data dump. `WP_Debug_Data::debug_data()` is admin-only PHP. Rebuild requires:
1. Adding a custom shell endpoint (`GET /wp-admin-shell/v1/site-health/info`) wrapping `WP_Debug_Data::debug_data()`, or
2. Iframing the existing PHP page.

The directory-sizes part is REST-able. The text-format clipboard export is generated server-side via `WP_Debug_Data::format( $info, 'debug' )` and is currently embedded into the page HTML as a `data-clipboard-text` attribute — pure client-side copy.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Site Health")                                    │
│  ├─ Status score progress ring (Status tab only)             │
│  └─ Tab navigation (Status, Info, [+plugin tabs])            │
├─────────────────────────────────────────────────────────────┤
│ STATUS TAB                                                   │
│  ┌─ All-clear state (when 0 critical, 0 recommended)         │
│  │   ├─ Smiley icon                                          │
│  │   ├─ "Great job!"                                         │
│  │   └─ "Everything is running smoothly here."               │
│  ┌─ Issue state (otherwise)                                  │
│  │   ├─ Heading + summary                                    │
│  │   ├─ Critical issues section (count)                      │
│  │   │   └─ Accordion: one panel per failing critical test    │
│  │   ├─ Recommended improvements section (count)             │
│  │   │   └─ Accordion: one panel per recommended test         │
│  │   └─ "Passed tests" disclosure (collapsed by default)     │
│  │       └─ Accordion: one panel per passing test             │
│  └─ HTTPS-update result toast (when ?https_updated=1)        │
├─────────────────────────────────────────────────────────────┤
│ INFO TAB                                                     │
│  ├─ Intro paragraph                                          │
│  ├─ "Copy site info to clipboard" button                     │
│  └─ Accordion: one panel per debug-data section              │
│      └─ Each panel: <table> of label/value rows              │
└─────────────────────────────────────────────────────────────┘
```

Score ring (Status tab):
- Inputs: total tests, critical count, recommended count.
- Formula: `score = max(0, ((tests - critical*1.5 - recommended*0.5) / tests) * 100)` (approximate; exact in `WP_Site_Health::get_test_score()`).
- Display: SVG circle with percentage; color tinted by score (red < 50, orange 50–80, green 80+).

---

## 6. States

### Status tab states

| State | Trigger | Display |
|---|---|---|
| Loading direct tests | Initial render | Direct tests rendered immediately |
| Loading async tests | Initial render | Score ring animates + "Results are still loading…" indicator |
| All clear | All tests passed (post-async-completion) | Smiley + encouragement card |
| Has issues | ≥1 critical or recommended | Sections with counts and accordions |
| Async test failed (network) | REST 5xx / timeout | Test absent from list (silent fail in core); rebuild should mark test as "could not run" |
| HTTPS update success | `?https_updated=1` after migration | Top dismissible success notice |
| HTTPS update failed | `?https_updated=0` | Top dismissible error notice |
| No-JS state | JS disabled | "The Site Health check requires JavaScript." error notice |

### Info tab states

| State | Trigger | Display |
|---|---|---|
| Loading sizes | First mount | Spinner on `wp-paths-sizes` accordion heading |
| Sizes loaded | `directory-sizes` REST resolves | Spinner replaced with computed sizes |
| Sizes unavailable (multisite) | `is_multisite()` true | `wp-paths-sizes` section omits sizes (other fields render) |
| Copy success | User clicked copy | Inline "Copied!" announcement, fades out |
| No-JS state | JS disabled | "The Site Health check requires JavaScript." notice |

---

## 7. Actions

### Status tab actions

| Action | Cap | Endpoint / form |
|---|---|---|
| Expand / collapse a test panel | (none) | client state |
| Click action button inside test description | varies | varies — typically navigates to a settings page or external docs |
| "Update site to HTTPS" (when test result includes that action) | `update_https` | `GET site-health.php?action=update_https&_wpnonce={…}` (server-side runs `wp_update_urls_to_https()`) |
| Show passed tests | (none) | client disclosure toggle |
| Switch tab | `view_site_health_checks` | `GET site-health.php?tab=debug` |

### Info tab actions

| Action | Cap | Endpoint / form |
|---|---|---|
| Expand / collapse a section | (none) | client state |
| Copy site info to clipboard | (none) | client clipboard write of `data-clipboard-text` |

### Optimistic vs. blocking

- **HTTPS update** — blocking, server-side. Performs DB search-replace of all `http://` URLs; takes a few seconds on small sites, longer on large. Not idempotent if user navigates away mid-action.
- **Test execution** — async fan-out; each test is independent. UI streams results in.
- **Copy debug info** — instantaneous client-side.

---

## 8. Filters, sort, search, pagination

N/A — Site Health is a fixed structure of tests and info panels. No list to filter, no search.

The accordion provides expand/collapse but not search. Plugin tabs (`site_health_navigation_tabs`) effectively add categories.

---

## 9. Forms & inputs

### Status tab
N/A — no user input forms. Test buttons (e.g. "Update site to HTTPS") are link-style action triggers, not forms.

### Info tab
N/A — read-only.

---

## 10. Routing & URL state

Original URL params:
- `?tab=` — empty (default, Status) or `debug` (Info) or any registered plugin tab slug.
- `?action=update_https&_wpnonce={…}` — HTTPS migration trigger.
- `?https_updated=0|1` — post-action result indicator.

Recommended shell URL:
- `#/site-health` — Status tab.
- `#/site-health?tab=debug` — Info tab.
- `#/site-health?tab={plugin-slug}` — plugin-registered tab.

Browser back/forward should restore tab + accordion-expanded state. Refresh should re-run async tests (no cache).

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| Test action: "Update PHP" | external `wordpress.org/documentation` | new tab |
| Test action: "Update WordPress" | Updates app | (none) |
| Test action: "Visit support" | external | new tab |
| Test action: "Switch to HTTPS" | Same screen with `?action=update_https` | result via `?https_updated=…` |
| Test action: "Manage plugins" | Plugins app | (none) |
| Test action: "Manage themes" | Themes app | (none) |
| Test description links (per-test) | varies | varies |
| Tab to "Info" | Info tab | preserve scroll |

### Inbound

- Tools menu → Site Health.
- Dashboard "Site Health Status" widget → this screen (Status tab).
- Plugin nag → may deep-link to specific test (plugins set `?test={id}` and shell expands that accordion).
- Updates screen "Background updates" recommendation → Site Health.
- Cross-link: dashboard widget reads same tests.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| HTTPS update success | Top notice: "Site URLs switched to HTTPS." (dismissible) |
| HTTPS update failure | Top notice: "Site URLs could not be switched to HTTPS." |
| Async test result arrives | Test slides into appropriate section; live region announces "Critical issue found: …" |
| Copy debug info | Inline "Copied!" beside button (announced to SR via live region) |
| Tab switch | No toast; tab and section re-render |
| Loading state | Score ring shows "Results are still loading…" until last async resolves |

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `Tab` | Move through tabs → accordion headings → action buttons |
| `Enter` / `Space` on accordion heading | Toggle expand |
| `Arrow keys` | Standard tab list navigation between tabs |
| `Enter` on copy button | Copy + announce |

### ARIA & focus

- Tabs: `role="tablist"` with each tab as `<a class="health-check-tab">`. The current tab has `aria-selected="true"`. Original uses `<a>` with class-based "active"; rebuild should add proper ARIA.
- Score ring: SVG with `aria-hidden="true"`; status announced via the loading label live region.
- Accordion headings: `<button aria-expanded="…" aria-controls="health-check-accordion-block-{test}">`.
- Accordion panels: `id="health-check-accordion-block-{test}"`, `hidden` attribute toggled.
- Test badges (good/recommended/critical) are presentational `<span class="badge">`; status conveyed via accordion section grouping (`Critical issues` heading) + `aria-live="polite"` on result arrival.
- HTTPS update button: form submit; standard focus.
- Copy button: announces "Copied!" via live region; focus stays on button.

### Screen reader

- Critical issues section announces count in heading.
- Each test heading reads label + badge label (when present).
- Async test arrival is announced when injected into DOM.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `site_status_tests` (filter) | Add direct + async tests | **Replace** with shell registry: `core:site-health.tests` |
| `debug_information` (filter) | Add Info tab sections | **Replace** with shell registry: `core:site-health.info-sections` |
| `site_health_navigation_tabs` (filter) | Add custom tabs | **Replace** with shell slot `core:site-health.tabs` |
| `site_health_tab_content` (action) | Render custom tab content | Replace with slot |
| `site_status_test_result` (filter, per-test) | Modify a test's result | Preserve at PHP layer for legacy tests |
| `site_status_test_php_modules` | Customize required PHP modules list | Preserve at PHP layer |
| `wp_get_default_privacy_policy_content` | Affects related test | Preserve |
| `site_health_test_rest_capability_{test}` | Override per-test REST cap | Preserve at PHP layer |

Plugin compatibility note: many security and performance plugins (e.g. iThemes Security, Yoast SEO Premium, WP Rocket) inject tests via `site_status_tests`. Preserving the PHP filter is essential — the shell rebuild must invoke `WP_Site_Health::get_tests()` server-side to catch them, not reimplement the test catalog client-side.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** none.
- **What works:** `iframe:site-health.php` works in `developer-admin` shell; chrome hidden.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:site-health` AppSource | High | Composes well with REST; high-value for transparency |
| Status tab native rendering | High | Direct + async test fan-out via `wp-site-health/v1/tests/*` |
| Direct-test results endpoint | Medium | No REST endpoint returns the full direct-test set in one call. Either add `GET /wp-admin-shell/v1/site-health/tests` or run them client-side as REST per-test |
| Score calculation client-side | Medium | Pure derivation from test results |
| Score ring SVG | Low | Pure presentation |
| Info tab native rendering | Medium | Needs custom REST `GET /wp-admin-shell/v1/site-health/info` wrapping `WP_Debug_Data::debug_data()` |
| Directory sizes async loading | Medium | Existing endpoint; honor multisite skip |
| Copy-to-clipboard with REST-fetched data | Medium | Format on server; serve via custom endpoint or compose client-side |
| HTTPS update flow | Medium | Custom REST or fall back to existing PHP page |
| Plugin tab support | Medium | Slot API |
| Per-test action buttons | High | Each test result includes HTML actions; render-as-iframe-or-replace decision |
| Async test "could not run" surface | Low | Network-error UX improvement over silent core |
| Live region announcements for arriving tests | Medium | Accessibility win |

### Acceptable interim
`iframe:site-health.php` is the v1 implementation. Site Health is information-dense and rarely visited; iframe is acceptable indefinitely. Native rebuild becomes worthwhile only when the shell adds real-time monitoring (e.g. dashboard widget pulling live test status) — at that point composing the REST tests directly is straightforward.

---

## 16. Out of scope

- **Critical CSS / front-end performance audits** — different domain (Lighthouse, PageSpeed).
- **Security scans** (file integrity, malware) — plugin territory (Wordfence, Sucuri).
- **Uptime monitoring** — not in core.
- **Real-time alerting** — not in core; plugin-driven.
- **Restore-from-backup workflow when filesystem is corrupted** — out of scope.
- **Cron-based scheduled health reports via email** — `wp_site_health_scheduled_check` runs server-side (cron) but does not surface UI.
- **Network-admin aggregated health** (multisite) — not in core; would need separate spec.
- **Per-test trending / history** — not in core; only "now" snapshot.

---

## 17. Reference

- Original PHP: `wp-admin/site-health.php`, `wp-admin/site-health-info.php`
- Test registry: `wp-admin/includes/class-wp-site-health.php` (`get_tests()`, `get_test_*()`)
- Debug data: `wp-admin/includes/class-wp-debug-data.php`
- Auto-update tests: `wp-admin/includes/class-wp-site-health-auto-updates.php`
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-site-health-controller.php` (namespace `wp-site-health/v1`, base `tests`)
- REST routes:
  - `GET /wp-site-health/v1/tests/background-updates`
  - `GET /wp-site-health/v1/tests/loopback-requests`
  - `GET /wp-site-health/v1/tests/https-status`
  - `GET /wp-site-health/v1/tests/dotorg-communication`
  - `GET /wp-site-health/v1/tests/authorization-header`
  - `GET /wp-site-health/v1/tests/page-cache`
  - `GET /wp-site-health/v1/directory-sizes`
- HTTPS migration: `wp_update_urls_to_https()` in `wp-includes/https-migration.php`
- Cron event: `wp_site_health_scheduled_check`
- WP-CLI alternative: `wp doctor check --all`
- Help docs: `https://wordpress.org/documentation/article/site-health-screen/`
- Cross-link: `dashboard-home.md` (Site Health Status widget)
- Cross-link: `updates.md` (Background updates test references)
