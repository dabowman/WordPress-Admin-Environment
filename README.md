# WP Admin Shell

A WordPress plugin that replaces `wp-admin` with a configurable, React-based admin environment. The shell reads its layout, navigation, and application configuration from an `admin.json` file and renders a complete admin UI using `@wordpress/components`, powered by the REST API via `@wordpress/core-data`.

## The idea

WordPress has one admin interface. Every user — writer, developer, client, site manager — sees the same dashboard, the same menus, the same screens. Plugins add more menus. Themes don't touch the admin. Everyone gets everything.

WP Admin Shell makes the admin **configurable**. A JSON file declares which applications are available, how navigation is structured, what branding to show, and which toolbar actions to surface. Swap the JSON file, swap the admin experience.

Same WordPress. Same data. Same plugins. Different admin for different people.

## What it proves

1. **Separable** — the admin shell renders independently from wp-admin's PHP templates
2. **Configurable** — changing `admin.json` changes the entire admin experience without touching code
3. **Swappable** — multiple shell configurations coexist on the same install, switchable at runtime

## Screenshots

### Developer Admin
Full-featured shell with access to all WordPress screens. System screens (Plugins, Users, Tools, Settings) use the iframe escape hatch.

### Content Author
Minimal writing environment with collapsed navigation. Just Posts, Pages, Media, and a "New Post" button.

### Client Portal
Branded with a custom logo and accent color. Scoped to only the screens a client needs.

## Requirements

- WordPress 6.7+
- PHP 7.4+
- Node.js 20+ (for building from source)

## Installation

### From source

```bash
git clone https://github.com/your-org/wp-admin-shell.git
cd wp-admin-shell
npm install
npm run build
```

Copy the entire directory into `wp-content/plugins/`, then activate **WP Admin Shell** from the Plugins screen.

### With wp-env (for development)

```bash
git clone https://github.com/your-org/wp-admin-shell.git
cd wp-admin-shell
npm install
npm run build
npx wp-env start
```

Open `http://localhost:8888/wp-admin/admin.php?page=wp-admin-shell` (login: `admin` / `password`).

## Usage

1. Activate the plugin
2. Click **Shell Admin** in the wp-admin sidebar (it's near the top)
3. The shell takes over the viewport with its own navigation, toolbar, and content area
4. Use the gear dropdown in the toolbar to switch between shell configurations
5. Or go to **Shell Admin → Settings** to choose the active configuration

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open command palette |

The command palette shows navigation commands scoped to the active shell — "Go to Posts", "Go to Media", "New Post", "New Page", etc.

## Bundled configurations

### Writer (`content-author.json`)
A focused writing environment. Collapsed sidebar with just Posts, Pages, and Media. A "New Post" button in the toolbar. Nothing else.

### Acme Corp Portal (`client-portal.json`)
A branded client portal. Custom logo, red accent color, scoped navigation. Pages listed before Posts (it's a page-centric site). "View Site" link prominent in toolbar and nav. Profile accessible but not Settings or Plugins.

### Developer Admin (`developer-admin.json`)
Full access to everything. Native apps for Posts, Pages, Media. Iframe escape hatches for Plugins, Users, Tools, Settings, and the Site Editor. Navigation grouped into content and system sections.

## `admin.json` schema

A shell configuration is a JSON file with these sections:

```jsonc
{
  // Identity
  "name": "my-shell",            // Machine-readable ID (required)
  "title": "My Shell",           // Human-readable name (required)
  "description": "...",          // What this shell is for
  "version": 1,                  // Schema version

  // Branding
  "branding": {
    "logo": "./assets/logo.svg", // Path relative to plugin directory
    "title": "Acme Corp",        // Text in nav header (default: site name)
    "accentColor": "#3858e9"     // CSS color for active states
  },

  // Layout
  "layout": {
    "navigation": "left",        // "left" | "top" | "hidden"
    "navigationCollapsed": false, // Start collapsed (icon-only)
    "toolbar": true,             // Show top toolbar
    "navigationWidth": 280       // Sidebar width in pixels
  },

  // Applications — the screens available in this shell
  "applications": [
    {
      "id": "posts",                    // Unique ID
      "source": "core:posts",           // How to render it
      "title": "Posts",                  // Display name
      "icon": "post",                   // Icon from @wordpress/icons
      "hidden": false,                  // If true, reachable but not in nav
      "config": { "postType": "post" }  // Source-specific options
    }
  ],

  // Navigation — ordering, grouping, separators, external links
  "navigation": [
    { "app": "posts" },                 // Reference to an application
    { "separator": true },              // Visual divider
    { "group": "System", "items": [...] }, // Collapsible section
    { "label": "View Site", "icon": "external", "href": "/", "external": true }
  ],

  // Toolbar — actions in the top bar
  "toolbar": {
    "left": [],
    "right": [
      { "app": "profile", "icon": "user", "label": "Profile" },
      { "command": "core/new-post", "icon": "plus", "label": "New" },
      { "href": "/", "icon": "external", "label": "View Site", "external": true }
    ]
  },

  // Default route
  "defaultApp": "posts"          // Which app loads first
}
```

If `navigation` is omitted, it's auto-generated from the applications list (excluding hidden apps), in order.

### Application sources

| Source | Description | Config options |
|--------|-------------|----------------|
| `core:posts` | DataViews post/page list with search, filters, pagination | `postType`, `status`, `orderby` |
| `core:editor` | Block editor (loads in iframe) | — |
| `core:media` | Media library grid with upload and detail editing | — |
| `core:profile` | User profile form | — |
| `iframe:{url}` | Any wp-admin page in an iframe with chrome hidden | URL relative to `wp-admin/` |

The `iframe:` source is the escape hatch. It wraps any existing wp-admin page inside the shell — `iframe:plugins.php`, `iframe:users.php`, `iframe:options-general.php`, etc. The shell injects CSS into the iframe to hide wp-admin's own sidebar and admin bar, so only the content area shows.

### Icon names

Icons are resolved from `@wordpress/icons`. Available names: `post`, `page`, `media`, `edit`, `settings`, `user`, `people`, `plugins`, `layout`, `external`, `plus`, `wrench`, `tool`, `draft`, `search`.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php          # Plugin entry point
├── webpack.config.js           # Build config (copies DataViews CSS)
├── shells/                     # Bundled admin.json configurations
│   ├── content-author.json
│   ├── client-portal.json
│   └── developer-admin.json
├── assets/
│   └── acme-logo.svg           # Example branding asset
├── src/
│   ├── index.js                # Entry — mounts Shell into #wp-admin-shell
│   ├── index.css               # Layout and app styling
│   ├── shell/
│   │   ├── Shell.js            # Top-level: config + router + commands
│   │   ├── ShellLayout.js      # Nav + toolbar + content regions
│   │   ├── ShellNavigation.js  # Sidebar navigation renderer
│   │   ├── ShellToolbar.js     # Top toolbar + shell switcher
│   │   └── ShellContent.js     # Route → application resolver
│   ├── apps/
│   │   ├── PostsApp.js         # DataViews post/page list
│   │   ├── EditorApp.js        # Block editor (iframe + draft creation)
│   │   ├── MediaApp.js         # Media library grid
│   │   ├── ProfileApp.js       # User profile form
│   │   └── IframeApp.js        # Legacy wp-admin iframe wrapper
│   ├── routing/
│   │   ├── router.js           # Hash-based router
│   │   └── useCurrentApp.js    # Route → application resolver hook
│   ├── commands/
│   │   └── useShellCommands.js # Command palette registration
│   └── config/
│       ├── resolveConfig.js    # Config validation + defaults
│       ├── sourceRegistry.js   # Source string → component mapping
│       └── iconMap.js          # Icon name → component mapping
├── build/                      # Compiled output
└── docs/                       # Design specs and references
```

## How it works

### PHP side

The plugin registers an admin page at `admin.php?page=wp-admin-shell`. On that page, it:

1. Outputs `<div id="wp-admin-shell"></div>`
2. Enqueues the compiled JS/CSS bundle with WordPress package dependencies
3. Passes the active `admin.json` config to JavaScript via `wp_add_inline_script` + `wp_json_encode`
4. Hides wp-admin's default chrome (sidebar, admin bar, footer) via CSS

### JavaScript side

The React app mounts into the container div and:

1. Reads the config from `window.wpAdminShell.config`
2. Applies defaults via `resolveConfig()`
3. Sets up a hash router (`#/posts`, `#/editor/post/42`, `#/media`)
4. Registers command palette commands from the config
5. Renders the shell layout with navigation, toolbar, and content regions
6. Resolves the current route to an application component via `sourceRegistry`

### Data layer

- **Entity data** (posts, pages, media, users) flows through `@wordpress/core-data` hooks — `useEntityRecords` for lists, `useEntityRecord` for single items with edit/save
- **Non-entity operations** (media upload, draft creation) use `@wordpress/api-fetch`
- **No raw `fetch()` calls** — everything goes through WordPress's authenticated API layer
- **No external dependencies** — only `@wordpress/*` packages

## Development

```bash
npm run start    # Dev build with watch
npm run build    # Production build
npm run lint:js  # ESLint
npm run format   # Prettier
```

### Adding a new shell configuration

1. Create a JSON file in `shells/` following the schema above
2. Rebuild (`npm run build`) — not strictly necessary, but good practice
3. The new config appears in the shell switcher dropdown automatically

### Adding a new application source

1. Create a component in `src/apps/`
2. Register it in `src/config/sourceRegistry.js`
3. Use it in any `admin.json` via its source string

## Architecture decisions

**Why hash routing?** The shell is a single WordPress admin page. Client-side hash routing (`#/posts`, `#/media`) avoids full page reloads and doesn't interfere with WordPress's server-side routing. The router is ~30 lines.

**Why iframe for the editor?** The block editor (`@wordpress/edit-post`) assumes full viewport ownership and is being refactored toward `@wordpress/editor`'s unified API. Mounting it in a constrained container is complex and fragile. The iframe approach is functionally identical from the user's perspective and works today.

**Why `wp_add_inline_script` instead of `wp_localize_script`?** `wp_localize_script` coerces all values to strings, breaking booleans, numbers, and nested objects in the config. `wp_add_inline_script` + `wp_json_encode` preserves type fidelity.

**Why bundle DataViews?** `@wordpress/dataviews` is listed in `BUNDLED_PACKAGES` by the dependency extraction plugin and may not be registered as a script handle in all WordPress versions without the Gutenberg plugin. Bundling it (~249KB total JS) ensures compatibility across WordPress 6.7+.

## What's deferred

These are intentionally out of scope for the MVP:

- **Plugin-contributed applications** (`plugin:{slug}` source type)
- **Capability-based filtering** (hiding nav items based on user role)
- **Conditional navigation** ("show this only if WooCommerce is active")
- **Admin theming** beyond `branding.accentColor`
- **Native site editor mount** (uses iframe for now)
- **Native settings screen** (uses iframe for now)
- **Mobile-specific layout** (responsive but not mobile-optimized)
- **Extension isolation / sandboxing**
- **SlotFill contribution points** within the shell

## License

GPL-2.0-or-later
