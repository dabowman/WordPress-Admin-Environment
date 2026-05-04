# Screen Spec: Network Updates (Multisite)

**Status:** Tier 2 — full spec.
**Source PHP:**
- `wp-admin/network/update-core.php` (delegates to `wp-admin/update-core.php`)
- `wp-admin/network/upgrade.php` (Upgrade Network — iterates sites, runs `wp_upgrade()` on each)
- `wp-admin/update.php` (action handlers for run-upgrade flows)

**Current shell coverage:** None.

Multisite-only screen — only accessible when `is_multisite()` is true and the user has `update_core` (or one of the granular update caps). The Upgrade Network step requires `upgrade_network`.

This spec describes the **semantic surface** of the network-wide updates dashboard and the post-core-update "Upgrade Network" sweep that runs `wp_upgrade()` on each site.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `network-updates` |
| Display name | "Updates" / "Upgrade Network" |
| Original URLs | `/wp-admin/network/update-core.php`, `/wp-admin/network/upgrade.php` |
| Menu location | `submenu['index.php'][10]` (Updates) and `submenu['index.php'][15]` (Upgrade Network) in `wp-admin/network/menu.php` |
| Submenu items | None below this — these are themselves submenu items under Dashboard |
| Parent app | `network-dashboard` (visually nested) |
| Sub-screens | Updates (default), Upgrade Network (post-core-update sweep) |

The Updates screen is identical in shape to the single-site `wp-admin/update-core.php` (it's literally `require ABSPATH . 'wp-admin/update-core.php'`); the Upgrade Network screen is multisite-unique.

---

## 2. Purpose

**Updates screen:** Show available updates to WordPress core, plugins, themes, and translations across the network, and run them. Network-Active plugins/themes update once and roll out to every site automatically (because each site loads from the same files). The site-wide nature is the differentiator.

**Upgrade Network screen:** After WordPress core updates the database schema (a major-version bump), each site's database also needs `wp_upgrade()` to run. The Upgrade Network tool walks every (non-spam, non-deleted, non-archived) site in chunks of 5 and fires `wp_upgrade()` against each via an HTTP loopback request. This is rare but essential after major core upgrades.

Jobs to be done:
- **See what's pending** — core update available, plugin updates, theme updates, translation updates.
- **Run a core update**.
- **Run plugin updates** (single or bulk; network-active plugins update universally).
- **Run theme updates**.
- **Run translation updates**.
- **Run the Upgrade Network sweep** after a core upgrade so every site's database schema is current.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View Updates submenu | `update_core` OR `update_plugins` OR `update_themes` OR `update_languages` | `wp-admin/network/menu.php` lines 20–28 |
| Run core update | `update_core` | `wp-admin/update-core.php` |
| Run plugin updates | `update_plugins` | same |
| Run theme updates | `update_themes` | same |
| Run translation updates | `update_languages` | same |
| View Upgrade Network | `manage_network` (menu) | `wp-admin/network/menu.php` line 51 |
| Run Upgrade Network | `upgrade_network` | `wp-admin/network/upgrade.php` line 43 |

Note: `manage_network` allows access to the menu link; `upgrade_network` is required to actually start the sweep. The menu cap is `upgrade_network` per `menu.php` line 51, so users without the cap won't see the menu item.

**Permission-denied state:** `wp_die()` 403. Shell renders no-access state.

---

## 4. Data model

### Update sources (Updates screen)

| Source | Storage | Computed by |
|---|---|---|
| Core update | `update_core` site transient | `wp_version_check()` |
| Plugin updates | `update_plugins` site transient | `wp_update_plugins()` |
| Theme updates | `update_themes` site transient | `wp_update_themes()` |
| Translation updates | `_site_transient_update_core` (translation set) + per-package translation entries | `wp_get_translation_updates()` |

Aggregate: `wp_get_update_data()` returns `{counts: {plugins, themes, translations, total}}` — this is what populates the menu count badge.

### Update mutations (action endpoints)

All update mutations route through `wp-admin/update.php`:
- `?action=do-core-upgrade&version={x}&locale={y}` — run core update
- `?action=update-selected&plugins={p,p,p}` — run plugin updates
- `?action=update-selected-themes&themes={t,t,t}` — run theme updates
- `?action=do-translation-upgrade` — run translation updates

These pages stream output (line-by-line "Downloading", "Unpacking", "Installing"). Core wraps them in iframes when called from the bulk actions in the Plugins / Themes screens.

### Upgrade Network sweep

PHP loop in `wp-admin/network/upgrade.php`:
1. Read `?n` offset (default 0).
2. Query 5 sites with `get_sites({spam: 0, deleted: 0, archived: 0, network_id: current, number: 5, offset: $n, orderby: 'id', order: 'DESC'})`.
3. For each site:
   - `switch_to_blog($site_id)`
   - Compute `admin_url('upgrade.php?step=upgrade_db')`
   - `restore_current_blog()`
   - `wp_remote_get($upgrade_url, {timeout: 120, sslverify: false})` — runs upgrade as that site
   - Fire `after_mu_upgrade` and `wpmu_upgrade_site` actions
4. Render the 5 site URLs as a list.
5. Auto-redirect via `<script>setTimeout('nextpage()', 250)</script>` to `?action=upgrade&n={offset+5}` until empty.
6. On empty page: render "All done!".

Side effect on first chunk: `update_site_option('wpmu_upgrade_site', $wp_db_version)` is set when `n < 5`.

### REST equivalents

| Operation | REST | Status |
|---|---|---|
| Core / plugin / theme update transients | None | **GAP** — admin-side only. Workaround: read `update_plugins` / `update_themes` site transients via custom endpoint. |
| Update count summary | None | **GAP** — `wp_get_update_data()` is admin-side. |
| Run core update | None | **GAP** — `wp-admin/update.php` only. |
| Run plugin update | None | **GAP** — `wp-admin/update.php` streaming endpoint. The REST plugins controller can change `status` but cannot run a version upgrade. |
| Run theme update | None | **GAP** — same. |
| Run translation update | None | **GAP**. |
| Upgrade Network sweep | None | **GAP** — loopback HTTP self-requests are admin-side only. |

Update flows are universally non-RESTed. Iframe streaming `wp-admin/update.php` is the realistic v1 path.

---

## 5. Layout regions (semantic)

### Updates screen
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "WordPress Updates"                                  │
│ "Last checked at {time}. Check Again."                       │
├─────────────────────────────────────────────────────────────┤
│ Section 1: WordPress Core                                    │
│   - Current version + status ("up to date" / available)      │
│   - "Update Now" button (if available)                       │
│   - Auto-update enable / disable button                      │
├─────────────────────────────────────────────────────────────┤
│ Section 2: Plugins                                           │
│   - "These plugins have new versions available."             │
│   - Table: [cb] | Plugin | Version | Compatibility           │
│   - "Update Plugins" submit                                  │
├─────────────────────────────────────────────────────────────┤
│ Section 3: Themes                                            │
│   - Same shape as plugins                                    │
│   - "Update Themes" submit                                   │
├─────────────────────────────────────────────────────────────┤
│ Section 4: Translations                                      │
│   - "Some of your translations need updating."               │
│   - "Update Translations" button                             │
└─────────────────────────────────────────────────────────────┘
```

### Upgrade Network screen
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: "Upgrade Network"                                    │
│                                                              │
│ (If db_version stale on network):                            │
│   "Database Update Required"                                 │
│   "WordPress has been updated! Next and final step is to     │
│    individually upgrade the sites in your network."          │
│                                                              │
│ "The database update process may take a little while..."     │
│                                                              │
│ [ Upgrade Network ] (button)                                 │
│                                                              │
│ (After click, action=upgrade):                               │
│   - List of 5 site URLs being upgraded                       │
│   - Auto-redirect to next chunk                              │
│   - "If your browser does not start loading the next page    │
│     automatically, click this link: [Next Sites]"            │
│                                                              │
│ (When site_ids empty):                                       │
│   "All done!"                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First fetch of update transients | Skeleton sections |
| All up to date | No updates pending | Per-section "up to date" banners |
| Core update in progress | Click "Update Now" | Iframe streaming `update-core.php?step=...` |
| Plugin update in progress | Click "Update Plugins" | Iframe streaming `update.php?action=update-selected` |
| Theme update in progress | Click "Update Themes" | Iframe streaming `update.php?action=update-selected-themes` |
| Translation update in progress | Click "Update Translations" | Iframe streaming `update-core.php?action=do-translation-upgrade` |
| Network sweep in progress | `?action=upgrade&n=...` | List of currently-processing site URLs; auto-redirect every 250ms |
| Network sweep complete | `get_sites()` returns empty | "All done!" |
| Network sweep error per-site | `wp_remote_get` returns `WP_Error` | `wp_die()` blocking page with the failed URL |
| No core update applied | `get_site_option('wpmu_upgrade_site') === $wp_db_version` | Upgrade-Network screen still shows the button but no "Database Update Required" warning |
| Sweep skipped certain sites | `spam`, `deleted`, `archived` filtered out | Not surfaced in UI; document as known behavior |

---

## 7. Actions

### Updates screen
| Action | Cap | Behavior |
|---|---|---|
| Check Again | implicit | Re-runs `wp_version_check`, etc. |
| Update Now (core) | `update_core` | Iframe to `update-core.php?action=do-core-upgrade` |
| Auto-update toggle (core) | `update_core` AND `WP_AUTO_UPDATE_CORE` writable | Updates `auto_update_core_dev`, `auto_update_core_minor`, `auto_update_core_major` site options |
| Update Plugins (bulk) | `update_plugins` | Iframe to `update.php?action=update-selected&plugins=...` |
| Update Themes (bulk) | `update_themes` | Iframe to `update.php?action=update-selected-themes&themes=...` |
| Update Translations | `update_languages` | Iframe to `update-core.php?action=do-translation-upgrade` |

### Upgrade Network screen
| Action | Cap | Behavior |
|---|---|---|
| Upgrade Network | `upgrade_network` | Starts sweep at `?action=upgrade&n=0`; auto-paginates |
| Next Sites | `upgrade_network` | Manual fallback if auto-redirect fails |

### Optimistic vs. blocking
- All updates are **blocking with streaming progress** — UI commits when the iframe finishes.
- Network sweep is blocking with auto-pagination; user can leave the page and it continues sweep on next visit (the offset resets, but sites already at current `wp_db_version` are no-ops).

---

## 8. Filters, sort, search, pagination

### Updates screen
- No filter / sort. Plugin and theme tables are simple lists of items with available updates.

### Upgrade Network sweep
- Pagination is implicit: 5 sites per HTTP page, ordered by `id DESC`. The user does not control this.

---

## 9. Forms & inputs

### Updates screen
- Selection checkboxes for plugins / themes (bulk update).
- Hidden nonces:
  - `upgrade-core` for core update
  - `bulk-update-plugins` for bulk plugin update
  - `bulk-update-themes` for bulk theme update

### Upgrade Network screen
- Just the "Upgrade Network" button (no form fields).

---

## 10. Routing & URL state

Original URL params:
- Updates: `/network/update-core.php`
- Plugin update: `/update.php?action=update-selected&plugins={p1,p2}&_wpnonce={n}`
- Theme update: `/update.php?action=update-selected-themes&themes={t1,t2}&_wpnonce={n}`
- Network sweep: `/network/upgrade.php?action=upgrade&n={offset}`

Recommended shell hash:
```
#/network-updates                       (Updates dashboard)
#/network-updates/upgrade               (Upgrade Network start screen)
#/network-updates/upgrade?n=0           (sweep in progress)
```

The actual streaming output is iframed.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination |
|---|---|
| "View details" per plugin | wp.org plugin page (external) |
| "Download nightlies" link | external |
| Per-plugin "Compatibility" link | wp.org plugin compatibility page |

### Inbound
| Origin | Behavior |
|---|---|
| `network-dashboard` Updates submenu | this Updates dashboard |
| `network-dashboard` Upgrade Network submenu | Upgrade Network start screen |
| `network-themes` "Update Network" / `network-plugins` Bulk Update | the same iframe streaming endpoints (different entry points) |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Core update success | "WordPress updated successfully" inside iframe; outer page reloads |
| Core update failure | Error inside iframe; user must read details |
| Plugin update success (per item) | Streaming line "Plugin {name} updated successfully" |
| Plugin update failure (per item) | Streaming line "Plugin {name} update failed" + error |
| Translation update | Streaming list of language pack downloads |
| Sweep, per chunk | Renders the 5 URLs; no per-site error UI unless `wp_remote_get` fails (then full `wp_die()`) |
| Sweep complete | "All done!" |
| Sweep error | Blocking error page with the URL that failed and the error message |

No undo. Updates are forward-only.

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` | Cycle through update sections |
| `Enter` | Trigger active button |

### ARIA
- Each update section: `<section>` + `<h2>` with appropriate aria-labelledby.
- Selection checkboxes (per plugin/theme): `aria-label="Select {plugin/theme name}"`.
- Iframe streaming output: ensure the iframe has `title="Update progress"` and `aria-busy="true"` while running.
- Sweep progress list: `aria-live="polite"` so each new chunk announces.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `after_mu_upgrade` (action) | After each-site upgrade response | Event bus |
| `wpmu_upgrade_site` (action) | After each-site upgrade complete | Event bus |
| `wpmu_upgrade_page` (action) | Append to Upgrade Network start screen | Slot |
| `core_update_pre_packages` (filter) | Modify list of packages | Document |
| `auto_update_core_dev` / `_minor` / `_major` (filters) | Auto-update policy | Document |

---

## 15. Mapping & implementation status

### Current shell coverage
- None.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| `network-updates` source | High | Top-level network app |
| Update transient → readable summary | High | Custom endpoint reads `update_plugins`, `update_themes`, `update_core` site transients |
| Iframe streaming for per-update progress | High | Reuse `wp-admin/update.php` directly |
| Upgrade Network sweep UI | Medium | Iframe `network/upgrade.php?action=upgrade` is acceptable interim |
| Per-site failure surfacing | Low | Core's `wp_die()` is unfriendly; ideally rebuild with structured progress |
| Auto-update policy toggles | Low | Mutates `auto_update_core_*` site options; custom endpoint |
| "Last checked" timestamp | Low | Read `_site_transient_timeout_update_core` |

### Acceptable interim
`iframe:network/update-core.php` and `iframe:network/upgrade.php` for v1.

---

## 16. Out of scope

- **Per-site upgrade UI** — the sweep is intentionally bulk. Single-site upgrades happen automatically on next admin login (`wp_upgrade()` runs in `admin.php` if `db_version` is stale).
- **Resumable / pausable sweeps** — core does not support this; the next visit re-walks from offset 0 but skips sites already on `$wp_db_version`.
- **Background queue / cron-driven sweep** — not in core. A future plugin could schedule chunks via WP-Cron.
- **Per-site upgrade failure recovery** — surface the failed site so the operator can investigate; no automatic retry.

---

## 17. Reference

- Original PHP:
  - `wp-admin/network/update-core.php` (delegates to `wp-admin/update-core.php`)
  - `wp-admin/network/upgrade.php`
  - `wp-admin/update.php` (action handlers for run-upgrade)
  - `wp-admin/update-core.php` (Updates dashboard implementation)
- PHP API: `wp_get_update_data`, `wp_version_check`, `wp_update_plugins`, `wp_update_themes`, `wp_get_translation_updates`, `wp_upgrade`, `get_sites`, `switch_to_blog`
- Site transients: `update_core`, `update_plugins`, `update_themes`
- Site options: `wpmu_upgrade_site`, `auto_update_core_dev`, `auto_update_core_minor`, `auto_update_core_major`, `auto_update_plugins`, `auto_update_themes`
- WP-CLI parity: `wp core update`, `wp plugin update --all --network`, `wp theme update --all --network`, `wp core update-db --network`
