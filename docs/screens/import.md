# Screen Spec: Import

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/import.php` + `wp-admin/includes/import.php` + `wp-admin/includes/class-wp-importer.php`
**Current workspace coverage:** None. Bundled `developer-workspace.json` exposes the original via `iframe:import.php`.

This spec describes the **semantic surface** of the WordPress Import screen so an agent can rebuild it in any UI library or framework. It does not prescribe component names, CSS, or specific React APIs.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `import` |
| Display name | "Import" |
| Original URL | `/wp-admin/import.php` |
| Menu location | Sub-item of "Tools" menu |
| Parent app | `tools` group |
| Sub-screens | Per-importer "Run" pages, mounted as `admin.php?import={importer_id}` (e.g. `admin.php?import=wordpress`) — each importer plugin owns its own multi-step flow |

The screen itself is a directory of importers. Each row is either an installed importer (link runs it) or an "available" importer that the user can install on demand (link installs the plugin from `wordpress.org/plugins`).

The actual import workflow lives inside each importer plugin's own UI. Most installed importers (e.g. WordPress Importer) are non-block, non-React, and wp-admin-styled. The workspace's relationship to importer plugin UIs is: "iframe with chrome hidden" indefinitely.

---

## 2. Purpose

Catalog importers, install one if needed, and launch its dedicated import flow. Pure directory + plugin-installer-trigger.

Jobs to be done:
- **See what import sources are supported** — Blogger, LiveJournal, Movable Type & TypePad, RSS, Tumblr, WordPress, Categories/Tags Converter.
- **Install an importer plugin** — single-click install from WordPress.org without leaving the screen.
- **Activate an installed importer** — single-click activation.
- **Launch the importer flow** — clicks "Run Importer" → goes to `admin.php?import={id}` where the importer takes over.
- **Search for more importers** — link out to plugin directory filtered to importer tag.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `import` | `import.php` line 14 |
| See "available but not installed" importer rows | `install_plugins` | `import.php` line 36 |
| Install importer plugin | `install_plugins` (+ filesystem write access) | `update.php?action=install-plugin` |
| Activate importer plugin | `activate_plugins` | `plugins.php?action=activate` |
| Run importer | `import` (importer plugin may add its own caps) | `admin.php?import={id}` |

**Permission-denied state:** core uses `wp_die( 'Sorry, you are not allowed to import content into this site.' )` for the screen itself. Per-importer, the plugin handles its own gates.

**Multisite:** `is_main_site()` check — installation of importer plugins is restricted to the network's main site. Sub-sites see "This importer is not installed. Please install importers from the main site." Workspace rebuild must surface the same constraint.

---

## 4. Data model

### Primary data: importer registry

Two sources merged client-side:

1. **Installed importers** — `get_importers()` returns an array of registered importers indexed by `importer_id`:
   ```
   [
     'wordpress' => [
       'WordPress',                       // [0] display name
       'Import posts, pages, comments…',  // [1] description
       'callback_function_name',          // [2] callback (server-side only)
     ],
     ...
   ]
   ```
2. **Popular importers (from API)** — `wp_get_popular_importers()` calls `https://api.wordpress.org/core/importers/1.1/` (cached for 7 days). Returns:
   ```
   [
     'blogger' => [
       'name'        => 'Blogger',
       'description' => 'Import posts, comments, and users from a Blogger blog.',
       'plugin-slug' => 'blogger-importer',
       'importer-id' => 'blogger',
     ],
     ...
   ]
   ```

`import.php` merges both: any popular importer not already installed gets added with an `install` key. Workspace rebuilds replicate this merge.

### Built-in importers

Always-registered (not plugins):
- **Categories and Tags Converter** (`wp-cat2tag`)

Bundled-by-recommendation (popular importers, all are plugins):
- Blogger (`blogger-importer`)
- LiveJournal (`livejournal-importer`)
- Movable Type and TypePad (`movabletype-importer`)
- RSS (`rss-importer`)
- Tumblr (`tumblr-importer`)
- WordPress (`wordpress-importer`)

### REST coverage

**None for the importer registry itself.**
- `wp_get_popular_importers()` is admin-side PHP only.
- `get_importers()` is admin-side PHP only.
- Plugin install/activate flow uses `update.php` and `plugins.php` form posts, with admin-ajax for status polling (`update-plugin`, `install-plugin`).
- Each importer's own UI uses admin-ajax (`upload`, `import`) — none of it is REST.

**Plugin install via REST:** `POST /wp/v2/plugins` with `slug` parameter would technically install a plugin (see `WP_REST_Plugins_Controller::create_item`). This works for importer plugins. **Activation** also possible via `PUT /wp/v2/plugins/{plugin}` with `status: 'active'`. Both require `install_plugins` and `activate_plugins` caps respectively.

### Per-importer flow data (out of scope)

Each importer plugin defines its own data:
- WordPress Importer: WXR file upload, author mapping, attachment download toggle.
- Blogger Importer: OAuth flow with Google.
- RSS Importer: RSS feed URL or file upload.

These run in their own pages at `admin.php?import={id}`. Workspace embeds via iframe with chrome hidden.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Import")                                         │
├─────────────────────────────────────────────────────────────┤
│ INTRO PARAGRAPH                                              │
│  └─ "If you have posts or comments in another system…"       │
├─────────────────────────────────────────────────────────────┤
│ INVALID-IMPORTER ERROR (when ?invalid={id} is set)           │
│  └─ "The {id} importer is invalid or is not installed"       │
├─────────────────────────────────────────────────────────────┤
│ IMPORTER TABLE                                               │
│  └─ Rows: name + action + description                        │
│      ├─ Action = "Install Now" (not installed)               │
│      ├─ Action = "Run Importer" (active)                     │
│      ├─ Action = activate link (installed but inactive)      │
│      └─ "Details" link opens plugin info modal               │
├─────────────────────────────────────────────────────────────┤
│ FOOTER LINK                                                  │
│  └─ "If the importer you need is not listed, search the      │
│      plugin directory…"                                      │
└─────────────────────────────────────────────────────────────┘
```

The table has **no** column headers visually, but semantically:
- Column 1: importer title + action link.
- Column 2: description.

Plugin install actions surface a thickbox modal during installation with progress streaming. Workspace rebuild can replace the modal with a side drawer or inline status row.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | First mount | Skeleton rows |
| Default | Loaded | Importer table |
| Empty | No importers (rare — only if API + filesystem both fail) | "No importers are available." |
| Invalid importer query | `?invalid={id}` matches a popular slug → redirect to canonical id | Error notice + table |
| API error | `api.wordpress.org` unreachable | Falls back to installed importers only; workspace shows muted notice |
| Installing plugin | User clicked "Install Now" | Inline status: "Installing…" → "Activating…" → "Run Importer" link |
| Activate failed | Plugin install ok but activation failed | Error message in row + "Try again" |
| FS credentials needed | Filesystem unwritable | Modal asks for FTP credentials before install |
| Sub-site (multisite) | Not on main site, importer not installed | Row shows "Install from main site" message instead of action |
| Permission denied | User lacks `import` | 403 view |

---

## 7. Actions

### Per-row actions

| State | Action label | Cap | Effect |
|---|---|---|---|
| Not installed | "Install Now" | `install_plugins` | Triggers plugin install via `update.php?action=install-plugin&plugin={slug}&_wpnonce={…}`. Successful → row updates to "Activate" or "Run Importer". |
| Not installed | "Details" | `install_plugins` | Opens plugin info modal with description, screenshots, changelog. |
| Installed but inactive | "Run Importer" (rendered as link to activate-and-run) | `activate_plugins` | Activates plugin then runs importer via `plugins.php?action=activate&plugin={file}&from=import`. |
| Active | "Run Importer" | `import` | Navigates to `admin.php?import={id}`. |

### Footer action

- "Search the plugin directory" → external link to `network/plugin-install.php?tab=search&type=tag&s=importer`.

### Optimistic vs. blocking

- **Plugin install** — blocking (server writes files, runs `Plugin_Upgrader`). Progress shown in modal. Cannot navigate away mid-install without orphaning files.
- **Activate** — fast, but blocking on a single page POST.
- **Run Importer** — pure navigation; no mutation here.

---

## 8. Filters, sort, search, pagination

N/A — fixed list of ~7 popular importers + any plugin-registered ones. Sort order: alphabetical by name (`uasort` by first array member).

No client-side search; the footer link redirects to the plugin directory's full search.

---

## 9. Forms & inputs

The Import screen itself has **no forms**. All actions are link clicks that navigate or trigger admin-ajax. Per-importer forms (file upload, URL input) live inside each importer's own UI and are out of scope.

Validation: importers handle their own.

---

## 10. Routing & URL state

Original URL params:
- `?invalid={importer_id}` — set after a failed `admin.php?import={id}` redirect; renders error notice.
- (No filter / sort / search params — list is small and fixed.)

Per-importer URL: `admin.php?import={importer_id}`. The handler dispatch is:
```
do_action( 'admin_action_' . $action );
```
where `$action = 'import_{importer_id}'` (importer plugins hook here).

Recommended workspace URLs:
- `#/import` — directory.
- `#/import/{importer_id}` — runs importer (proxies to `admin.php?import={id}` via iframe in v1).

URL state is simple. No deep-link params for filters.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| "Install Now" link | `update.php?action=install-plugin` (modal flow) | `slug={plugin_slug}` |
| "Details" link | Plugin install detail (modal/iframe) | `slug={plugin_slug}` |
| "Run Importer" (active) | Per-importer page (iframe) | `import={importer_id}` |
| "Activate Plugin & Run Importer" (installed inactive) | `plugins.php?action=activate` | `plugin={file}&from=import` |
| Footer "search the plugin directory" | external | new tab or modal |

After importer completes, importer plugins typically redirect to `edit.php` (posts list) so the user can verify imported content.

### Inbound

- Tools menu → Import.
- Tools landing page → "Categories and Tags Converter" link (`tools.md` cross-references).
- Plugin update screen → Importer plugin entries also link to `admin.php?import=…` once activated (less common).
- Cross-link from `tools.md` (Available Tools card).

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Plugin install in progress | Modal/inline status: "Installing…" with progress |
| Plugin install success | Row replaces "Install Now" with "Activate Plugin & Run Importer" |
| Plugin install failure | Inline error with reason (filesystem, network, package validation) |
| FS credentials prompt | Modal dialog (legacy `request-filesystem-credentials-form`) |
| Importer launches | Full-page navigation to importer UI |
| `?invalid={id}` redirect | Error banner above table |

The screen itself does not surface success of the import — that's the importer plugin's responsibility.

---

## 13. Accessibility & keyboard

### Keyboard
- `Tab` moves between row action links.
- `Enter` activates a link.
- `Esc` closes detail modal.
- No screen-specific shortcuts.

### ARIA & focus
- Importer table is `<table class="widefat importers striped">` — semantic table.
- Each row has `class="importer-item"` with title + action + description as inline cells.
- Action links use `aria-label` like "Run WordPress Importer" or "Install WordPress Importer now" so the link target is unambiguous.
- "Details" link has `aria-label="More information about WordPress Importer"`.
- Plugin install thickbox modal: focus trap + Esc-to-close. Rebuild should use modern dialog with `role="dialog"` and `aria-modal="true"`.
- Live region announces install progress: "Installing WordPress Importer", "Installation complete".

### Screen reader
- Description column is read after action label.
- Progress states announced via `aria-live="polite"`.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `register_importer( $id, $name, $description, $callback )` | Add an importer (plugin API) | **Preserve** — this is how every importer plugin works. Workspace registry should consult `get_importers()` at boot. |
| `import_filters` (action, fires at end of `import.php`) | Add custom UI panels | Replace with workspace slot `core:import.footer` |
| `wp_get_popular_importers` (function, no filter) | API-driven importer list | Replace with workspace-level config option to override the upstream API URL or supplement the list |
| Per-importer plugins use their own actions/filters | — | Out of scope for workspace |

Plugin compatibility note: most importer plugins are old (WordPress Importer is the canonical one and is maintained by core). They emit raw HTML and use jQuery. The workspace rebuild's iframe approach preserves them with zero compat work.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **Source:** none.
- **What works:** `iframe:import.php` works in `developer-admin` workspace.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:import` AppSource | Low | The directory is simple to render natively, but importer flows themselves stay iframed |
| Native rendering of importer table | Medium | Pure read; no REST yet — needs workspace shim or new endpoint |
| Plugin install flow (modern dialog instead of thickbox) | Medium | Reuse with Updates screen |
| Importer flow embedding | Low | Iframe acceptable indefinitely; importer plugins rarely change |
| `?invalid={id}` redirect handling | Low | Cosmetic |
| Multisite "main-site only" message | Medium | Surface clearly, link to main site |
| FS credentials modal | High (cross-cutting with Updates) | Shared component |
| Real-time install progress streaming | Medium | Polling vs. SSE; shared with Updates |

### Acceptable interim
`iframe:import.php` is the v1 implementation. Importer-internal flows (`admin.php?import={id}`) iframed permanently — these are too varied and too low-traffic to rebuild natively.

---

## 16. Out of scope

- **Per-importer UIs** (WordPress Importer, Blogger Importer, etc.) — owned by their respective plugins.
- **Author mapping** during WXR import — covered by WordPress Importer plugin.
- **OAuth flows** for Blogger / Tumblr — owned by their respective importers.
- **WXR generation** — covered by `export.md`.
- **Categories ↔ Tags Converter UI** — owned by the converter plugin (popular-importer-installable).
- **Custom importers from non-WordPress.org sources** — possible via `register_importer()`, but discovery is out of scope.

---

## 17. Reference

- Original PHP: `wp-admin/import.php`
- Helpers: `wp-admin/includes/import.php` (defines `get_importers()`)
- Importer base class: `wp-admin/includes/class-wp-importer.php`
- Popular-importers API: `https://api.wordpress.org/core/importers/1.1/`
- Plugin install REST: `wp-includes/rest-api/endpoints/class-wp-rest-plugins-controller.php` (`POST /wp/v2/plugins`)
- Bundled WordPress Importer plugin: `https://wordpress.org/plugins/wordpress-importer/`
- WP-CLI alternative: `wp import {file}.xml --authors=create`
- Help docs: `https://wordpress.org/documentation/article/tools-import-screen/`
- Cross-link: `tools.md` (Categories/Tags Converter card points here)
- Cross-link: `export.md` (the inverse operation)
