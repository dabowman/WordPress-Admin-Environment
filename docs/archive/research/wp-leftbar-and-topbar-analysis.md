# wp-leftbar & wp-topbar Plugin Analysis

Analysis of two companion plugins by Joen Asmussen that rethink the WordPress admin chrome — the left sidebar navigation and the top admin bar. Evaluated for patterns and ideas applicable to WP Admin Shell.

## Plugin overview

### wp-leftbar (WordPress Navigation)

**Repo:** `/Users/davidbowman/Github/wp-leftbar`
**Scope:** Replaces the left sidebar navigation with a React-based UI driven by a declarative `nav-config.json`.

Architecture:
- PHP class (`WP_Navigation`) collects WordPress's native `$menu` and `$submenu` globals, sanitizes labels, resolves URLs, and outputs the structured data as `window.wnNavData`.
- React app mounts into `#adminmenuwrap` alongside the native `#adminmenu` (preserved in DOM for plugin compatibility).
- `nav-config.json` reorganizes menu items into folders, drilldown panels, and top-level pinned items.
- REST API (`wn/v1/`) manages per-user favorites stored in user meta.
- CSS custom properties injected from `$_wp_admin_css_colors` for color scheme awareness.

Key files:
- `wordpress-navigation.php` — Plugin entry, menu collection, REST API, color scheme injection
- `nav-config.json` — Declarative folder/menu structure
- `src/components/NavShell.jsx` — Main container, nav tree builder
- `src/components/NavFolder.jsx` — Accordion folders with localStorage persistence
- `src/components/NavItem.jsx` — Menu items with icon fallback chain (curated icon map -> dashicons -> data URI -> inline SVG)
- `src/components/NavDrilldown.jsx` — Slide-in sub-panel
- `src/components/StarButton.jsx` — Favorite toggle injected into page headings
- `src/components/BottomBar.jsx` — Mobile navigation rendered via React portal

### wp-topbar (WordPress Omnibar)

**Repo:** `/Users/davidbowman/Github/wp-topbar`
**Scope:** Replaces the WordPress admin bar (`#wpadminbar`) with a minimal React-based toolbar.

Architecture:
- PHP class (`WP_Omnibar`) collects site metadata, user info, update/comment counts, and contextual edit links from `$wp_admin_bar`.
- React app takes over `#wpadminbar` by clearing innerHTML and mounting into the same DOM element — inherits all existing CSS positioning for free.
- Stateless — no REST API, no user preferences, pure render.
- Works on both admin pages and the frontend.

Key files:
- `wordpress-omnibar.php` — Plugin entry, data collection, enqueuing
- `src/components/Omnibar.js` — Toolbar layout (WP logo, site title, "New", search/command palette trigger, updates, comments, user avatar)
- `src/components/WpLogo.js` — Custom SVG WordPress logo
- `src/style.css` — Flexbox layout, absolutely centered search button, mobile responsive

## Notable patterns

### Color scheme inheritance (wp-leftbar)

Reads the current user's admin color scheme from `$_wp_admin_css_colors` and injects values as CSS custom properties:

```php
$slug   = get_user_option( 'admin_color' ) ?: 'fresh';
$scheme = $_wp_admin_css_colors[ $slug ];

// Injected as CSS vars:
// --wn-scheme-bg:      colors[0]  (sidebar background)
// --wn-scheme-accent:  colors[2]  (active item highlight)
// --wn-scheme-icon:    icon_colors.base
// --wn-scheme-current: icon_colors.current
```

The navigation automatically adapts to Fresh, Light, Blue, Coffee, or any custom scheme without configuration. Values are sanitized with a regex check before output.

### Menu data collection from globals (wp-leftbar)

Walks WordPress's `$menu` and `$submenu` arrays to build a structured item tree. Key behaviors:

- Strips HTML notification badges from labels (e.g., `Comments <span>5</span>` -> `Comments`) using iterative regex to handle nested spans.
- First submenu item's URL becomes parent URL (matches native WP where top-level links resolve to first child — e.g., WooCommerce's slug is `woocommerce` but links to `wc-admin`).
- URL resolution handles three cases: absolute URLs, `.php` files (`admin_url()`), and plugin page slugs (`admin.php?page=`).
- Skips separators by checking for `wp-menu-separator` in the CSS class.

### nav-config.json folder types (wp-leftbar)

Three organizational types for menu items:

| Type | Behavior |
|------|----------|
| `top-level` | Single pinned item (Dashboard) |
| `folder` | Accordion-collapsible group with slug list |
| `drilldown` | Slides in a sub-panel; can be placed in footer |

Two special properties on folders:
- `includeCPTs: true` — Auto-discovers registered custom post types not assigned to any other folder and adds them.
- `catchRemaining: true` — Captures all menu items not explicitly assigned anywhere. Safety net for third-party plugins.

### Child cleanup pipeline (wp-leftbar)

Four-stage processing for submenu items:

1. **stripAll** — Wipe all children (Dashboard removes Updates).
2. **Add New promotion** — Detect `post-new.php`, `media-new.php`, `plugin-install.php` and promote to an `addNewUrl` button on the parent instead of listing as a child.
3. **Self-reference removal** — Drop children where `child.slug === parent.slug` (e.g., "All Posts" under Posts).
4. **Exclude list** — Additional slugs to remove, specified per-item in config's `childFilters`.

### Favorites system (wp-leftbar)

Per-user favorites stored in `wp_usermeta` as JSON:

- REST endpoints: `GET/POST /wn/v1/favorites`, `DELETE /wn/v1/favorites/{slug}`
- POST is idempotent — adding an existing favorite returns it without duplicating.
- Star toggle button injected into `.wp-heading-inline` on each admin page.
- Cross-component communication via `CustomEvent('wn:favorite-toggled')` — StarButton dispatches, NavShell listens and updates local state.
- Favorites rendered as a pinned section at the top of the nav.

### Contextual link harvesting (wp-topbar)

Instead of reimplementing "should this page show an Edit button?", hooks into `wp_before_admin_bar_render` at `PHP_INT_MAX` (after WordPress finishes building the admin bar) and reads computed nodes:

```php
$contextual_ids = [ 'edit', 'site-editor' ];
foreach ( $contextual_ids as $id ) {
    $node = $wp_admin_bar->get_node( $id );
    if ( $node && ! empty( $node->href ) ) {
        $this->contextual_links[] = [
            'id'    => $id,
            'title' => wp_strip_all_tags( $node->title ),
            'href'  => $node->href,
        ];
    }
}
```

Gets all capability and context checks for free without reimplementing them.

### CORE_NODES exclusion list (wp-topbar)

Defines which admin bar node IDs are handled by the plugin vs which are third-party additions:

```php
private const CORE_NODES = [
    'wp-logo', 'about', 'site-name', 'view-site', 'edit-site',
    'dashboard', 'updates', 'comments', 'new-content',
    'top-secondary', 'search', 'my-account', 'user-actions', ...
];
```

Non-core top-level nodes are collected as `plugin_nodes` — prepared for a future "plugin slot" in the bar. Currently disabled while the UX is being decided.

### Command palette integration (wp-topbar)

One-line trigger for WordPress's built-in command palette:

```javascript
window.wp?.data?.dispatch( 'core/commands' )?.open();
```

Rendered as a centered search button with OS-appropriate shortcut hint (`displayShortcut.primary('k')` from `@wordpress/keycodes`).

### DOM takeover strategy (wp-topbar)

Mounts React into the existing `#wpadminbar` element rather than creating a new one:

```javascript
const bar = document.getElementById( 'wpadminbar' );
bar.innerHTML = '';
createRoot( bar ).render( <Omnibar data={ window.wpOmnibarData } /> );
```

Inherits all existing CSS positioning (fixed, z-index, body padding offset) without reimplementing it.

### Webpack icon bundling (wp-leftbar)

Custom webpack config that bundles `@wordpress/icons` and `@wordpress/primitives` inline instead of treating them as externals:

```javascript
const BUNDLE_INLINE = new Set( [ '@wordpress/icons', '@wordpress/primitives' ] );
// Filters DependencyExtractionWebpackPlugin to return false for these packages
```

Necessary because these packages aren't available as `wp.*` globals on general admin pages — only inside Gutenberg contexts.

## Comparison with WP Admin Shell

### Fundamental architectural differences

| | wp-leftbar + wp-topbar | WP Admin Shell |
|---|---|---|
| Approach | Enhance existing wp-admin | Replace wp-admin entirely |
| Page model | Standard WP page loads | SPA with hash router |
| Menu source | WordPress `$menu`/`$submenu` globals | Declarative `admin.json` |
| Content area | Untouched — native wp-admin pages | React app components |
| Compatibility | High — works within existing DOM | Lower — must reimplement or iframe |

### Features present in the companion plugins but absent from our shell

| Feature | Source plugin | Difficulty | Value |
|---------|-------------|------------|-------|
| Color scheme CSS vars | wp-leftbar | Low | High — instant polish for all shells |
| Notification badges (updates, comments) | wp-topbar | Low | Medium — useful status indicators |
| User avatar in toolbar | wp-topbar | Low | Medium — user presence indicator |
| Command palette visual trigger | wp-topbar | Low | Medium — centered search button with shortcut hint |
| Favorites / pinned items | wp-leftbar | Medium | High — personalization via REST + user meta |
| CPT auto-discovery | wp-leftbar | Medium | Medium — safety net for plugin-registered post types |
| catchRemaining safety net | wp-leftbar | Medium | Medium — prevents menu items from disappearing |
| "Add New" promotion to button | wp-leftbar | Low | Low — UX refinement for nav items |
| Theme config override | wp-leftbar | Low | Low — allows themes to ship custom configs |
| Mobile bottom bar | wp-leftbar | Medium | Low — wp-admin is desktop-oriented |
| Frontend toolbar | wp-topbar | Medium | Low — not in scope for admin replacement |

### Things our shell does that these plugins don't

- Full SPA experience with no page reloads between apps
- DataViews integration for posts/pages/media listing
- Core-data entity management (useEntityRecords, useEntityRecord)
- Multiple switchable shell configurations at runtime
- Command palette command registration from config
- Block editor embedding via iframe
- Config-driven application sources (core:posts, core:media, core:editor, core:profile, iframe:*)

## Recommendations

### High value, low effort
1. **Color scheme CSS vars** — Read `$_wp_admin_css_colors` in PHP, inject as CSS custom properties, use as defaults when shell config doesn't specify branding. ~30 lines PHP.
2. **User avatar in toolbar** — Add Gravatar URL to `wpAdminShell` data, render in `ShellToolbar`. ~10 lines PHP + JSX.
3. **Notification badges** — Surface `wp_get_update_data()` and `wp_count_comments()` counts in toolbar. ~15 lines PHP + JSX.
4. **Command palette trigger button** — Add centered search/command button to `ShellToolbar` with `displayShortcut.primary('k')`. ~20 lines JSX + CSS.

### Medium value, medium effort
5. **Favorites system** — REST endpoint for per-user favorites in user meta, star toggle in app headers, pinned section in nav. ~150 lines PHP + JSX.
6. **CPT auto-discovery** — PHP-side config enrichment that discovers `get_post_types()` and injects them into the active shell config before passing to JS. ~40 lines PHP.

### Worth considering later
7. **catchRemaining** pattern for nav items from plugins that register admin menus.
8. **Theme-level config override** path (check theme directory before plugin defaults).
