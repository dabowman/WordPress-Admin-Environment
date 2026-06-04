# Screen Spec: Updates

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/update-core.php` + `wp-admin/includes/update-core.php` + `wp-admin/includes/update.php` + `wp-admin/includes/class-core-upgrader.php`
**Current shell coverage:** None. Bundled `developer-admin.json` exposes the original via `iframe:update-core.php`.

This spec describes the **semantic surface** of the WordPress Updates screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `updates` |
| Display name | "Updates" / "WordPress Updates" |
| Original URL | `/wp-admin/update-core.php` (single-site); `/wp-admin/network/update-core.php` (multisite — auto-redirected to network admin) |
| Menu location | Sub-item of "Dashboard" → "Updates" |
| Parent app | `dashboard` group |
| Sub-screens | None (sections render inline). Long-running update flow takes over the screen with progress output. |

Multisite forces all updates to network admin: `if ( is_multisite() && ! is_network_admin() ) { wp_redirect( network_admin_url( 'update-core.php' ) ); }`. Shell rebuild should mirror — on multisite, only network-admin-equivalent users land here.

---

## 2. Purpose

Surface and apply pending updates to the WordPress core, plugins, themes, and translations from a single screen.

Jobs to be done:
- **See whether anything needs updating** — bullet count of pending updates, summary at top.
- **Update WordPress core** — one-click upgrade to the latest packaged version, or re-install the current version.
- **Update many plugins at once** — multi-select checkbox + "Update Plugins" button.
- **Update many themes at once** — same pattern as plugins.
- **Update translations** — one button updates all translation packs.
- **Toggle auto-updates per plugin / per theme** — opt individual extensions in/out (WP 5.5+).
- **Toggle major core auto-updates** — opt the site into automatic major-version updates (WP 5.6+).
- **Hide a non-English update** — dismiss a localized update notification temporarily.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `update_core` OR `update_themes` OR `update_plugins` OR `update_languages` | `update-core.php` line 22 |
| Update WordPress core | `update_core` | `do-core-upgrade` action |
| Re-install WordPress core | `update_core` | `do-core-reinstall` action |
| Toggle major core auto-update | `update_core` (and `WP_AUTO_UPDATE_CORE` not constraining) | `core-major-auto-updates-settings` action |
| Update plugins (any) | `update_plugins` | `do-plugin-upgrade` action |
| Update themes (any) | `update_themes` | `do-theme-upgrade` action |
| Update translations | `update_languages` | `do-translation-upgrade` action |
| Toggle auto-update per plugin | `update_plugins` (and `wp_is_auto_update_enabled_for_type('plugin')`) | `auto_update_plugins` site option |
| Toggle auto-update per theme | `update_themes` (and `wp_is_auto_update_enabled_for_type('theme')`) | `auto_update_themes` site option |
| Update PHP (informational) | `update_php` | nag widget |
| Dismiss non-English update | `update_core` | `dismiss` form input |

**Disabled overrides:** auto-updates UI is hidden when `WP_AUTO_UPDATE_CORE` constant is set, when `AUTOMATIC_UPDATER_DISABLED` is true, when the `automatic_updater_disabled` filter returns true, when `wp_is_file_mod_allowed( 'automatic_updater' )` is false, or when the install is under VCS (Git/SVN).

**Permission-denied state:** core uses `wp_die( 'Sorry, you are not allowed to update this site.' )`. Shell renders 403 view.

**Multisite:** screen lives in network admin only. `do_core_upgrade` runs across all sites in the network in one pass. Per-site users without network admin redirect or 403.

---

## 4. Data model

### Core update

REST: **none.** Core update info comes from `get_core_updates()` (admin-side) which reads the `update_core` site transient populated by `wp_version_check()`. `update_core` action posts back to `update-core.php?action=do-core-upgrade` with nonce.

Data shape per-update:
| Field | Type | Notes |
|---|---|---|
| `current` | string | Target version (e.g. `6.9.1`) |
| `partial_version` | string | Source version for partial build |
| `locale` | string | e.g. `en_US`, `de_DE` |
| `response` | string | `latest` (already on it) / `upgrade` / `development` |
| `packages` | object | `{ full, no_content, new_bundled, partial }` URL set |
| `php_version` | string | Required PHP |
| `mysql_version` | string | Required MySQL |
| `dismissed` | bool | Whether user has hidden this localized variant |

### Plugin updates

REST: `GET /wp/v2/plugins` (controller: `WP_REST_Plugins_Controller`, namespace `wp/v2`, base `plugins`). Each plugin object includes `version`, `update` link, `requires_wp`, `requires_php`. The controller does **not** expose `auto_update`. Update queue is `get_plugin_updates()` (admin-only PHP, transient `update_plugins`).

To bulk-update plugins, current core posts to `update-core.php?action=do-plugin-upgrade` with `checked[]` array of plugin files. The REST equivalent is **per-plugin** `PUT /wp/v2/plugins/{plugin}` with no body — the controller's update handler runs `Plugin_Upgrader`. Implemented but not in OpenAPI; verified in controller `update_item()`.

### Theme updates

REST: `GET /wp/v2/themes` (controller: `WP_REST_Themes_Controller`). Returns active and inactive themes. Update info per theme arrives in a `theme.update` field when present. Same auto-update gap.

Bulk update endpoint: not exposed. Per-theme `PUT /wp/v2/themes/{stylesheet}` not implemented for upgrade. Current path is `update-core.php?action=do-theme-upgrade` with `checked[]`. **Gap.**

### Translation updates

REST: **none.** Action: `update-core.php?action=do-translation-upgrade` (no per-locale select; updates all). Source: `wp_get_translation_updates()`.

### Auto-update preferences

| Setting | Storage | Setter |
|---|---|---|
| `auto_update_core_dev` | site option, `'enabled'` / `'disabled'` | `update-core.php?action=core-major-auto-updates-settings` |
| `auto_update_core_minor` | site option | (same) |
| `auto_update_core_major` | site option, `'enabled'` / `'unset'` | (same) |
| `auto_update_plugins` | site option, array of plugin files | admin-ajax `toggle-auto-updates` action |
| `auto_update_themes` | site option, array of stylesheets | admin-ajax `toggle-auto-updates` action |

REST gap: none of the auto-update toggles are exposed via REST. Rebuild requires either:
1. Writing to `auto_update_plugins` / `auto_update_themes` via `PUT /wp/v2/settings` (custom registration with `register_setting()`), or
2. Adding a custom REST endpoint for auto-update preferences.

### Non-REST data (gaps summary)

- **`get_core_updates()`** → no REST endpoint
- **Translation updates queue** → no REST
- **Auto-update toggles** (plugin/theme/core) → no REST
- **Bulk update execution** → no REST (per-item upgrade exists but is undocumented)
- **`wp_get_update_data()`** (counts shown in toolbar bubble) → no REST

These are tracked at WP Trac across multiple tickets; until resolved, the shell rebuild calls a custom REST endpoint (`/wp-admin-workspaces/v1/updates/*`) that wraps the PHP functions, or accepts the iframe fallback.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("WordPress Updates")                              │
│  ├─ Current version line ("Last checked on {date}")          │
│  └─ "Check again" button (force re-fetch)                    │
├─────────────────────────────────────────────────────────────┤
│ CORE UPDATE SECTION                                          │
│  ├─ Status heading ("Update available" / "You have the      │
│  │   latest version" / "Development version")                │
│  ├─ Backup-warning notice (when update available)            │
│  ├─ Per-update card (one or more):                           │
│  │   - Version + locale                                      │
│  │   - PHP/MySQL compat note                                 │
│  │   - Primary "Update to {version}" button                  │
│  │   - "Hide this update" toggle (non-English only)          │
│  └─ "Show hidden updates" disclosure                         │
├─────────────────────────────────────────────────────────────┤
│ AUTO-UPDATE PREFERENCES                                      │
│  └─ Toggle: "Enable auto-updates for all new versions"       │
│      (or system-managed message if overridden by constant)   │
├─────────────────────────────────────────────────────────────┤
│ PLUGIN UPDATES SECTION                                       │
│  ├─ "Plugins (N)" heading                                    │
│  ├─ "Update Plugins" button (top + bottom)                   │
│  └─ Table:                                                   │
│      - select-all checkbox column                            │
│      - row: icon + name + version-from → version-to + compat │
│        + auto-update toggle + view-details link              │
├─────────────────────────────────────────────────────────────┤
│ THEME UPDATES SECTION                                        │
│  ├─ "Themes (N)" heading                                     │
│  ├─ Child-theme warning notice                               │
│  ├─ "Update Themes" button                                   │
│  └─ Table: similar to plugins, with screenshot column        │
├─────────────────────────────────────────────────────────────┤
│ TRANSLATION UPDATES SECTION                                  │
│  ├─ "Translations" heading                                   │
│  └─ "Update Translations" button (single action, no list)    │
└─────────────────────────────────────────────────────────────┘
```

When a section has no updates, it is replaced with a one-line "Your X are all up to date." message.

During an update, the screen takes over with a streaming output region (file-system progress, "Updating Plugin: …", "Successfully updated.").

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch / "Check again" | Section-level skeleton; previous data preserved during refetch |
| Up to date — core | `response: 'latest'` | "You have the latest version of WordPress" + re-install button |
| Update available — core | `response: 'upgrade'` | "An updated version of WordPress is available" + primary button |
| Development version | `is_dev_version` matches | "You are using a development version of WordPress" |
| Incompatible — PHP | `php_compat: false` | "Cannot update because WP X requires PHP Y" + Update PHP link, button hidden |
| Incompatible — MySQL | `mysql_compat: false` | similar + button hidden |
| Up to date — plugins | `get_plugin_updates() === []` | "Your plugins are all up to date." |
| Up to date — themes | `get_theme_updates() === []` | "Your themes are all up to date." |
| Up to date — translations | `wp_get_translation_updates() === []` | section omitted entirely |
| In progress | After "Update" submit | Progress region; navigating away kills the upgrade — must complete |
| Update success | Upgrader finishes | Success heading + summary |
| Update failure | Upgrader errors | Inline error per-item; partial success summary |
| Non-English update hidden | `dismissed: true` | Hidden by default; reveal via "Show hidden updates" disclosure |
| Auto-update locked | `WP_AUTO_UPDATE_CORE` constant set or VCS detected | Static informational message instead of toggle |
| FS credentials needed | FTP / SSH host without direct file write | Modal asks for credentials before upgrade runs |

---

## 7. Actions

### Core section actions

| Action | Cap | Endpoint / form |
|---|---|---|
| Update to {version} | `update_core` | `POST update-core.php?action=do-core-upgrade` `{ version, locale }` |
| Re-install version {x} | `update_core` | `POST update-core.php?action=do-core-reinstall` |
| Hide this update (non-en_US only) | `update_core` | form with `dismiss` button |
| Show hidden updates | (none) | client-side disclosure |
| Bring back this update | `update_core` | form with `undismiss` button |
| Check again | `update_core`/`update_plugins`/`update_themes` | client-side: clears transient + reloads |

### Auto-update toggle (core major)

| Action | Cap | Endpoint |
|---|---|---|
| Enable major auto-updates | `update_core` | `GET update-core.php?action=core-major-auto-updates-settings&value=enable&_wpnonce={...}` |
| Disable major auto-updates | `update_core` | `GET …&value=disable` |

(Yes — currently a GET with nonce. A REST PUT is preferable in the rebuild.)

### Per-plugin actions

| Action | Cap | Endpoint |
|---|---|---|
| Select for bulk update | — | client state |
| Update Plugins (bulk) | `update_plugins` | `POST update-core.php?action=do-plugin-upgrade&checked[]={plugin_file}…` |
| View {N} version details | (none) | Opens `plugin-install.php?tab=plugin-information&plugin={slug}&section=changelog` in modal/lightbox |
| Toggle auto-update | `update_plugins` | admin-ajax `toggle-auto-updates&type=plugin&asset={file}&state=enable|disable` |

### Per-theme actions

Same shape as plugins, against `do-theme-upgrade` and `auto_update_themes`.

### Translations

| Action | Cap | Endpoint |
|---|---|---|
| Update Translations | `update_languages` | `POST update-core.php?action=do-translation-upgrade` |

### Optimistic vs. blocking

- **Auto-update toggles** — optimistic. Toggle UI flips immediately; reverts on failure.
- **Update execution** — blocking. UI takes over screen with progress. No optimistic preview.
- **Hide / unhide non-English update** — blocking but fast (single option write).

---

## 8. Filters, sort, search, pagination

N/A — Updates screen is a fixed list of pending items. No filters, no search, no pagination. Plugin and theme tables show all updatable items at once (typical max ~30; not paginated).

The only "filtering" is the hidden-updates disclosure for non-English core updates.

---

## 9. Forms & inputs

### Core update form (per-update)

| Field | Type | Required | Notes |
|---|---|---|---|
| version | hidden | yes | e.g. `6.9.1` |
| locale | hidden | yes | e.g. `en_US` |
| upgrade / dismiss / undismiss | submit button | yes | Mutually exclusive |

### Plugin updates form

| Field | Type | Required | Notes |
|---|---|---|---|
| `checked[]` | checkbox per row | ≥1 | Plugin file path values |
| upgrade | submit button | yes | "Update Plugins" |
| select-all | checkbox | — | Toggles all `checked[]` |

### Theme updates form

Same as plugins, with `stylesheet` values.

### Auto-update toggle (per row)

| Field | Type | Notes |
|---|---|---|
| (none — link-style anchor with action+type+asset+state) | — | admin-ajax driven |

### Translations form

| Field | Type | Notes |
|---|---|---|
| upgrade | submit button | "Update Translations" — no per-locale select |

Validation: nonce-checked server-side. Client-side: at least one row must be selected for bulk plugin/theme updates (PHP doesn't enforce; rebuild should disable button when nothing is checked).

---

## 10. Routing & URL state

Original wp-admin URL params:
- `?action=do-core-upgrade` — POST target
- `?action=do-core-reinstall` — POST target
- `?action=core-major-auto-updates-settings&value={enable|disable}&_wpnonce=…`
- `?action=do-plugin-upgrade` + `checked[]`
- `?action=do-theme-upgrade` + `checked[]`
- `?action=do-translation-upgrade`
- `?action=upload-plugin` / `?action=upload-theme` (manual ZIP upload — separate flow)
- `?core-major-auto-updates-saved={enabled|disabled}` (success indicator after save)
- `?https_updated=1` (cross-screen redirect from Site Health)

Recommended shell URL: `#/updates`. No deep-link state needed within the screen. The mid-update progress screen is transient — shell rebuild should mount it as an inline region rather than a separate route to keep back-button semantics sane.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| "Update PHP" link in compat warning | External URL | new tab |
| "View {plugin} version {x} details" | Plugin install detail (modal/iframe) | `slug={plugin}` |
| Child-theme docs link | External URL | new tab |
| "Documentation on Backups" | External URL | new tab |
| "WordPress {x}" version link | External URL (`wordpress.org/documentation/wordpress-version/version-{x}`) | new tab |
| Successful core update completion | `about.php` (the "What's new" screen) | — |

### Inbound

- Toolbar update bubble ("3 updates pending") → this screen.
- Site Health "Background updates" recommendation → this screen.
- Plugins list "Update available — Update now" link → this screen anchored at plugin section, or per-plugin `update.php?action=upgrade-plugin&plugin={file}`.
- Themes screen update notifications → this screen.
- Dashboard browser/PHP nag widget links → external (not this screen).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Update succeeded (core) | Redirects to `about.php` welcome screen with success message |
| Update succeeded (plugin/theme/translation, all rows) | Inline summary "Successfully updated N items" + back-link |
| Update succeeded (partial) | "Updated X of Y. The following failed: …" |
| Update failed | Inline error per-item with reason (file permissions, network, API error) |
| Auto-update toggle saved | Inline `?core-major-auto-updates-saved=enabled` notice on reload |
| Auto-update toggle (per-plugin/theme) saved | Inline label flips in the row, no toast |
| FS credentials required | Modal: hostname / FTP user / FTP pass / SSH keys |
| Maintenance mode message | "While your site is being updated, it will be in maintenance mode" |

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `Tab` | Move through buttons / checkboxes / toggles |
| `Space` on checkbox | Select for bulk |
| `Cmd/Ctrl+A` | Standard browser select-all (not bulk-select) |
| `Enter` on submit button | Submit form |

No widget-specific shortcuts. Accept browser defaults.

### ARIA & focus

- Each section is a `<section>` with `aria-labelledby` pointing at the heading.
- Bulk-select checkboxes have explicit `<label>` (visually hidden) describing the row.
- Compat warnings have `role="alert"` only when newly rendered.
- During upgrade: progress region uses `aria-live="polite"` to announce per-step updates.
- After success: focus moves to the success heading.
- Modal credentials dialog: focus trap + return on close.

### Screen reader

- Plugin/theme rows announce: "Plugin name. You have version 1.2 installed. Update to 1.3. Compatibility with WordPress 6.9: Yes."
- Auto-update toggle states announce: "Enable auto-updates for {name}" / "Disable auto-updates for {name}".

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `update_footer` | Append to admin footer (version string) | Drop — not surface-level |
| `core_upgrade_preamble` | Replace core-update preamble | Drop — too HTML-coupled |
| `update_core_finish` (function call) | Custom cleanup | Drop |
| `auto_update_{plugin|theme|core|translation}` filters | Override per-type auto-update decisions | **Preserve** at the PHP layer — they apply regardless of UI |
| `allow_minor_auto_core_updates` / `allow_major_auto_core_updates` / `allow_dev_auto_core_updates` | Force on/off | Same — PHP-layer, surfaces in UI as locked toggles |
| `automatic_updater_disabled` | Force disable | Same |
| `after_core_auto_updates_settings` | Render after toggle | Replace with shell slot `core:updates.auto-update-settings.after` |
| `wp_plugin_update_row` / `wp_theme_update_row` | Custom row markup | Drop — replace with row template |

Plugin compatibility note: managed-WordPress hosts (WP Engine, Pantheon, Pressable) often disable updates via `WP_AUTO_UPDATE_CORE: false` and `DISALLOW_FILE_MODS: true`. The shell must detect both and render an appropriate "Updates managed by your host" empty state.

---

## 15. Mapping & implementation status

### Current shell coverage

- **Source:** none. Bundled `developer-admin.json` uses `iframe:update-core.php` as escape hatch.
- **What works:** original PHP screen renders inside iframe with chrome hidden.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:updates` AppSource | High | Top-level prerequisite |
| Native rendering of core-update card | High | Read `get_core_updates()` data via custom REST shim |
| Plugin updates table | High | `GET /wp/v2/plugins` exists; bulk-upgrade endpoint must be added |
| Theme updates table | High | `GET /wp/v2/themes` exists; bulk-upgrade missing |
| Translation updates section | Medium | No REST; needs custom shim or iframe escape |
| Per-plugin auto-update toggle | High | REST gap — needs shell-level endpoint or settings field |
| Per-theme auto-update toggle | High | Same |
| Major core auto-update toggle | Medium | REST gap |
| FS credentials modal | High | Required on most shared hosts; reuse `request-filesystem-credentials-form` semantics |
| Real-time upgrade progress streaming | Medium | Server-sent events or polling `?action=upgrade-status` |
| "Hide this update" non-English handling | Low | Single option write; per-user not site-wide |
| Compat warnings (PHP/MySQL/WP) | High | Pure rendering of REST data; no extra calls |
| Plugin "View details" lightbox | Medium | Reuse plugin-install detail rendering |
| Disabled state when `WP_AUTO_UPDATE_CORE` constant set | High | Surface explanation banner |
| Maintenance-mode active-update warning | Medium | Heuristic: `.maintenance` file presence (no REST) |

### Acceptable interim

`iframe:update-core.php` is the escape hatch. Mark configs `updatesImpl: 'iframe-fallback'` so they're tracked. Most shells should ship without an Updates app; site administrators run updates via WP-CLI in production.

---

## 16. Out of scope

- **Per-locale translation update selection** — original is "all or nothing". v2 enhancement.
- **Plugin/theme ZIP upload** (`?action=upload-plugin`, `?action=upload-theme`) — separate "Add Plugin / Theme" surface, not Updates.
- **Update history / rollback** — not in core; plugin territory.
- **Pre-update site backup** — not in core; nag link only.
- **Background scheduled update notifications** — covered by Site Health.
- **Per-user dismissal of update reminder banners** — covered by general notice infrastructure.

---

## 17. Reference

- Original PHP: `wp-admin/update-core.php`
- Helpers: `wp-admin/includes/update-core.php`, `wp-admin/includes/update.php`
- Core upgrader: `wp-admin/includes/class-core-upgrader.php`, `class-plugin-upgrader.php`, `class-theme-upgrader.php`, `class-language-pack-upgrader.php`
- Auto-update: `wp-admin/includes/class-wp-automatic-updater.php`
- REST controllers: `wp-includes/rest-api/endpoints/class-wp-rest-plugins-controller.php`, `class-wp-rest-themes-controller.php`
- Auto-update site options: `auto_update_core_dev`, `auto_update_core_minor`, `auto_update_core_major`, `auto_update_plugins`, `auto_update_themes`
- Constants: `WP_AUTO_UPDATE_CORE`, `AUTOMATIC_UPDATER_DISABLED`, `DISALLOW_FILE_MODS`
- Filters: `automatic_updater_disabled`, `allow_{minor|major|dev}_auto_core_updates`, `auto_update_{plugin|theme|core|translation}`
- WP-CLI alternative: `wp core update`, `wp plugin update --all`, `wp theme update --all`, `wp language core update`
- Help docs: `https://wordpress.org/documentation/article/dashboard-updates-screen/`
