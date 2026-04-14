# WordPress Admin Shell — MVP Design Spec

---

## 1. What this is

A WordPress plugin called **WP Admin Shell** that replaces the traditional wp-admin interface with a configurable, React-based admin environment. The shell reads its configuration from an `admin.json` file, renders a custom admin UI using `@wordpress/components`, and communicates with WordPress exclusively through the REST API via `@wordpress/core-data`.

The MVP proves three things:

1. The admin shell is **separable** — it renders independently from wp-admin's PHP templates.
2. The admin shell is **configurable** — changing `admin.json` changes the admin experience without touching code.
3. The admin shell is **swappable** — multiple shell configurations can exist on the same WordPress install, each presenting a different admin experience.

---

## 2. Goals and non-goals

### Goals

- Render a complete admin shell in a full-screen React application at `wp-admin/admin.php?page=wp-admin-shell`.
- Read shell configuration from an `admin.json` file bundled with the plugin.
- Support switching between multiple `admin.json` configurations from a settings screen.
- Implement four native application sources: `core:posts`, `core:editor`, `core:media`, `core:profile`.
- Implement the `iframe:` escape hatch for legacy wp-admin screens.
- Integrate the WordPress command palette, scoped to the active shell configuration.
- Ship three example configurations: Content Author, Client Portal, Developer Admin.

### Non-goals (deferred to later iterations)

- Extension isolation / sandboxing.
- Plugin-contributed application sources (`plugin:{slug}`).
- Admin theming beyond `branding.accentColor`.
- Conditional navigation based on user capabilities.
- SlotFill-based plugin contribution points within the shell.
- Mobile-specific layout adaptations (the shell should be responsive, but mobile optimization is not a focus).
- `core:site-editor` as a native mount (too complex for MVP — use `iframe:` instead).
- `core:settings` as a native application (scope is too broad — use `iframe:` for settings screens).

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    Shell Runtime                        │  │
│  │                                                        │  │
│  │  ┌──────────┐  ┌───────────────┐  ┌────────────────┐  │  │
│  │  │  Config   │  │   Router /    │  │   Command      │  │  │
│  │  │  Loader   │  │   Navigator   │  │   Palette      │  │  │
│  │  └────┬─────┘  └───────┬───────┘  └───────┬────────┘  │  │
│  │       │                │                   │           │  │
│  │       ▼                ▼                   ▼           │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │              Shell Layout                        │   │  │
│  │  │                                                  │   │  │
│  │  │  ┌──────────┐ ┌──────────────────────────────┐  │   │  │
│  │  │  │  Nav     │ │  Content Region              │  │   │  │
│  │  │  │  Sidebar │ │                              │  │   │  │
│  │  │  │          │ │  ┌────────────────────────┐  │  │   │  │
│  │  │  │  Posts   │ │  │  Mounted Application   │  │  │   │  │
│  │  │  │  Pages   │ │  │                        │  │  │   │  │
│  │  │  │  Media   │ │  │  (DataViews, Editor,   │  │  │   │  │
│  │  │  │  ...     │ │  │   Media, Profile,      │  │  │   │  │
│  │  │  │          │ │  │   or iframe)            │  │  │   │  │
│  │  │  │          │ │  │                        │  │  │   │  │
│  │  │  └──────────┘ │  └────────────────────────┘  │  │   │  │
│  │  │               └──────────────────────────────┘  │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│                    @wordpress/api-fetch                       │
│                    @wordpress/core-data                       │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
                    WordPress REST API
                    /wp-json/wp/v2/...
```

### Key architectural decisions

**The shell is a WordPress admin page.** Registered via `add_menu_page()`, served at `admin.php?page=wp-admin-shell`. This means the user is already authenticated (cookie session), the WordPress admin bar and scripts are available, and we get nonce-based REST API auth for free via `wpApiSettings`.

**The shell renders into an empty div.** The PHP side outputs a minimal page: enqueue the shell's JS/CSS bundle, output `<div id="wp-admin-shell"></div>`, and hide the default wp-admin chrome (admin menu, admin bar, footer) via CSS. The React app mounts into this div and takes over the viewport.

**Configuration is loaded at mount time.** The active `admin.json` configuration is passed from PHP to JavaScript via `wp_add_inline_script()` as a JSON object on `window.wpAdminShell.config`. This uses `wp_json_encode()` to preserve type fidelity (booleans, numbers, nested objects). The shell runtime reads this object and builds the UI from it.

**Routing is client-side.** Navigation between applications uses URL hash routing (`#/posts`, `#/editor/post/42`, `#/media`). No full page reloads. The `NavigatorProvider` from `@wordpress/components` handles screen transitions within the shell.

**Each application source is a React component.** The shell maps source strings to components: `"core:posts"` → `<PostsApp />`, `"core:editor"` → `<EditorApp />`, etc. The content region renders whichever component the current route maps to, passing the application's `config` as props.

---

## 4. `admin.json` schema (final for MVP)

```jsonc
{
  "$schema": "https://schemas.wp.org/admin/v1.json",
  "name": "string (required)",          // Machine-readable ID, kebab-case
  "title": "string (required)",         // Human-readable name
  "description": "string",              // What this shell is for
  "version": 1,                         // Schema version

  "branding": {
    "logo": "string",                   // Path to logo image (relative to plugin dir)
    "title": "string",                  // Text next to logo (defaults to site name)
    "accentColor": "string"             // CSS color for active/focus states
  },

  "layout": {
    "navigation": "left | top | hidden",  // Default: "left"
    "navigationCollapsed": "boolean",     // Default: false
    "toolbar": "boolean",                 // Default: true
    "navigationWidth": "number"           // Default: 280 (pixels)
  },

  "applications": [                      // At least one required
    {
      "id": "string (required)",         // Unique ID, referenced in navigation
      "source": "string (required)",     // How to mount: core:*, iframe:*
      "title": "string (required)",      // Display name
      "icon": "string (required)",       // Icon name from @wordpress/icons
      "hidden": "boolean",              // Default: false. If true, not auto-added to nav
      "config": "object"                 // Source-specific configuration
    }
  ],

  "navigation": [                        // Optional. Auto-generated from applications if omitted.
    { "app": "string" }                  // Reference to application ID
    | { "separator": true }              // Visual divider
    | { "group": "string", "items": [] } // Collapsible section
    | { "label": "string", "icon": "string", "href": "string", "external": true }
  ],

  "toolbar": {
    "left": [],                          // Array of toolbar actions
    "right": []                          // Array of toolbar actions
  },
  // Toolbar action shape:
  // { "app": "string", "icon": "string", "label": "string" }        — navigate to app
  // { "command": "string", "icon": "string", "label": "string" }    — dispatch command
  // { "href": "string", "icon": "string", "label": "string", "external": true }

  "defaultApp": "string"                // Application ID to show on load. Default: first non-hidden app
}
```

### Source-specific config shapes

```jsonc
// core:posts
{ "postType": "post", "status": "any", "orderby": "date" }

// core:editor
{ "postTypes": ["post", "page"] }

// core:media — no config needed

// core:profile — no config needed

// iframe:{url} — no config needed (URL is in the source string)
```

---

## 5. Plugin structure

```
wp-admin-shell/
├── wp-admin-shell.php              # Plugin entry point
├── admin.json                       # Default shell configuration (developer admin)
├── shells/                          # Bundled example configurations
│   ├── content-author.json
│   ├── client-portal.json
│   └── developer-admin.json
├── assets/
│   └── acme-logo.svg               # Example branding asset for client portal demo
├── src/                             # JavaScript source (built with @wordpress/scripts)
│   ├── index.js                     # Entry point — mounts the shell
│   ├── shell/
│   │   ├── Shell.js                 # Top-level shell component
│   │   ├── ShellLayout.js           # Layout regions (nav, toolbar, content)
│   │   ├── ShellNavigation.js       # Sidebar navigation renderer
│   │   ├── ShellToolbar.js          # Top toolbar renderer
│   │   └── ShellContent.js          # Content region — mounts applications
│   ├── apps/
│   │   ├── PostsApp.js              # DataViews post/page list
│   │   ├── EditorApp.js             # Block editor wrapper
│   │   ├── MediaApp.js              # Media library
│   │   ├── ProfileApp.js            # User profile editor
│   │   └── IframeApp.js             # Legacy wp-admin iframe wrapper
│   ├── routing/
│   │   ├── router.js                # Hash-based router
│   │   └── useCurrentApp.js         # Hook: resolves current route to application
│   ├── commands/
│   │   └── useShellCommands.js      # Registers commands from admin.json
│   └── config/
│       ├── resolveConfig.js         # Validates and applies defaults to admin.json
│       └── sourceRegistry.js        # Maps source strings to React components
├── build/                           # Compiled output (@wordpress/scripts)
└── readme.txt
```

---

## 6. PHP side

### Plugin entry point (`wp-admin-shell.php`)

The PHP side does five things:

1. **Registers the admin page.** `add_menu_page()` creates a top-level menu item that renders an empty container page.

2. **Loads the active configuration.** Reads the active `admin.json` file path from a WordPress option (`wp_admin_shell_active_config`), reads and decodes the JSON, and passes it to JavaScript via `wp_add_inline_script()` with `wp_json_encode()`.

3. **Enqueues the shell bundle.** The compiled JS and CSS from `@wordpress/scripts` build, plus WordPress dependencies (auto-detected from imports by `@wordpress/scripts`: `wp-element`, `wp-components`, `wp-data`, `wp-core-data`, `wp-api-fetch`, `wp-commands`, `wp-icons`).

4. **Hides the default wp-admin chrome.** On the shell page only, outputs CSS to hide `#adminmenuwrap`, `#wpadminbar`, `#wpfooter`, and make `#wpcontent` full-viewport.

5. **Registers a settings page.** A simple options page where the admin can select which `admin.json` configuration is active (dropdown of available JSON files from the `shells/` directory).

```php
<?php
/**
 * Plugin Name: WP Admin Shell
 * Description: A configurable, React-based WordPress admin environment.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Requires at least: 6.7
 */

// Prevent direct access
defined( 'ABSPATH' ) || exit;

define( 'WP_ADMIN_SHELL_PATH', plugin_dir_path( __FILE__ ) );
define( 'WP_ADMIN_SHELL_URL', plugin_dir_url( __FILE__ ) );

/**
 * Register the shell admin page and settings.
 */
add_action( 'admin_menu', function () {
    // Main shell page — renders the React app
    add_menu_page(
        __( 'Shell Admin', 'wp-admin-shell' ),
        __( 'Shell Admin', 'wp-admin-shell' ),
        'read',
        'wp-admin-shell',
        'wp_admin_shell_render_page',
        'dashicons-layout',
        2
    );

    // Settings page — select active configuration
    add_submenu_page(
        'wp-admin-shell',
        __( 'Shell Settings', 'wp-admin-shell' ),
        __( 'Settings', 'wp-admin-shell' ),
        'manage_options',
        'wp-admin-shell-settings',
        'wp_admin_shell_render_settings'
    );
});

/**
 * Render the shell page (empty container + enqueued scripts).
 */
function wp_admin_shell_render_page() {
    echo '<div id="wp-admin-shell"></div>';
}

/**
 * Enqueue shell assets only on the shell page.
 */
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'toplevel_page_wp-admin-shell' !== $hook ) {
        return;
    }

    $asset = include WP_ADMIN_SHELL_PATH . 'build/index.asset.php';

    wp_enqueue_script(
        'wp-admin-shell',
        WP_ADMIN_SHELL_URL . 'build/index.js',
        $asset['dependencies'],
        $asset['version'],
        true
    );

    wp_enqueue_style(
        'wp-admin-shell',
        WP_ADMIN_SHELL_URL . 'build/index.css',
        array( 'wp-components' ),
        $asset['version']
    );

    // Load the active admin.json configuration.
    // Uses wp_add_inline_script + wp_json_encode instead of wp_localize_script
    // because wp_localize_script coerces all values to strings, breaking
    // booleans, numbers, and nested objects in the config.
    $config = wp_admin_shell_get_active_config();

    wp_add_inline_script( 'wp-admin-shell', 'window.wpAdminShell = ' . wp_json_encode( array(
        'config'   => $config,
        'siteUrl'  => get_site_url(),
        'adminUrl' => admin_url(),
        'restUrl'  => get_rest_url(),
        'nonce'    => wp_create_nonce( 'wp_rest' ),
        'userId'   => get_current_user_id(),
        'siteName' => get_bloginfo( 'name' ),
        'shells'   => wp_admin_shell_get_available_shells(),
    ) ) . ';', 'before' );

    // Hide default wp-admin chrome on the shell page
    wp_add_inline_style( 'wp-admin-shell', '
        #adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter { display: none !important; }
        #wpcontent { margin-left: 0 !important; }
        #wpbody-content { padding-bottom: 0; }
        html.wp-toolbar { padding-top: 0 !important; }
        #wp-admin-shell { position: fixed; inset: 0; z-index: 99999; }
    ');
});

/**
 * Read the active admin.json configuration.
 */
function wp_admin_shell_get_active_config() {
    $active = sanitize_file_name( get_option( 'wp_admin_shell_active_config', 'developer-admin' ) );
    $path   = WP_ADMIN_SHELL_PATH . 'shells/' . $active . '.json';

    if ( ! file_exists( $path ) ) {
        $path = WP_ADMIN_SHELL_PATH . 'shells/developer-admin.json';
    }

    $json = file_get_contents( $path );
    return json_decode( $json, true );
}

/**
 * Register the shell settings.
 */
add_action( 'admin_init', function () {
    register_setting( 'wp_admin_shell_settings', 'wp_admin_shell_active_config', array(
        'type'              => 'string',
        'default'           => 'developer-admin',
        'sanitize_callback' => 'sanitize_file_name',
    ) );
} );

/**
 * Render the settings page.
 */
function wp_admin_shell_render_settings() {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    $active = get_option( 'wp_admin_shell_active_config', 'developer-admin' );
    $shells = wp_admin_shell_get_available_shells();
    ?>
    <div class="wrap">
        <h1><?php esc_html_e( 'Shell Settings', 'wp-admin-shell' ); ?></h1>
        <form method="post" action="options.php">
            <?php settings_fields( 'wp_admin_shell_settings' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row"><?php esc_html_e( 'Active Configuration', 'wp-admin-shell' ); ?></th>
                    <td>
                        <select name="wp_admin_shell_active_config">
                            <?php foreach ( $shells as $shell ) : ?>
                                <option value="<?php echo esc_attr( $shell['slug'] ); ?>"
                                    <?php selected( $active, $shell['slug'] ); ?>>
                                    <?php echo esc_html( $shell['title'] ); ?>
                                    — <?php echo esc_html( $shell['description'] ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

/**
 * List available shell configurations.
 */
function wp_admin_shell_get_available_shells() {
    $shells = array();
    $dir    = WP_ADMIN_SHELL_PATH . 'shells/';

    foreach ( glob( $dir . '*.json' ) as $file ) {
        $data = json_decode( file_get_contents( $file ), true );
        $shells[] = array(
            'slug'        => basename( $file, '.json' ),
            'title'       => $data['title'] ?? basename( $file, '.json' ),
            'description' => $data['description'] ?? '',
        );
    }

    return $shells;
}
```

---

## 7. Shell runtime (JavaScript)

### Entry point (`src/index.js`)

```jsx
import { createRoot } from '@wordpress/element';
import Shell from './shell/Shell';

const container = document.getElementById( 'wp-admin-shell' );
if ( container ) {
    const root = createRoot( container );
    root.render( <Shell /> );
}
```

### Shell component (`src/shell/Shell.js`)

The top-level component that reads the config, sets up providers, and renders the layout.

```jsx
import { resolveConfig } from '../config/resolveConfig';
import { ShellLayout } from './ShellLayout';
import { ShellCommandsProvider } from '../commands/useShellCommands';

export default function Shell() {
    const config = resolveConfig( window.wpAdminShell.config );

    return (
        <ShellCommandsProvider config={ config }>
            <ShellLayout config={ config } />
        </ShellCommandsProvider>
    );
}
```

### Layout component (`src/shell/ShellLayout.js`)

Renders the three layout regions: navigation, toolbar, and content.

The layout uses CSS custom properties for the accent color (from `branding.accentColor`) and navigation width (from `layout.navigationWidth`). The CSS is flexbox-based for the MVP, matching InterfaceSkeleton's approach.

```
┌─────────────────────────────────────────────┐
│  Toolbar (optional)                   [+][👤]│
├──────────┬──────────────────────────────────┤
│          │                                  │
│   Nav    │       Content Region             │
│  Sidebar │                                  │
│          │       (mounted application)      │
│  Posts   │                                  │
│  Pages   │                                  │
│  Media   │                                  │
│  ──────  │                                  │
│  Design  │                                  │
│          │                                  │
└──────────┴──────────────────────────────────┘
```

### Navigation component (`src/shell/ShellNavigation.js`)

Reads the `navigation` array from the config. For each item:

- `{ "app": "posts" }` → renders a nav button with the application's icon and title. Clicking navigates to `#/posts`.
- `{ "separator": true }` → renders a horizontal rule.
- `{ "group": "System", "items": [...] }` → renders a collapsible section with a label and nested items.
- `{ "label": ..., "href": ..., "external": true }` → renders an external link that opens in a new tab.

The active navigation item is highlighted based on the current route.

If `navigation` is omitted from the config, the component auto-generates it from the `applications` array (excluding hidden applications), in order.

Uses `@wordpress/components`: `Button`, `__experimentalVStack as VStack` for vertical layout, `Icon` for icons. (VStack is stable in practice but still exported with the `__experimental` prefix.)

### Content region (`src/shell/ShellContent.js`)

Resolves the current route to an application, looks up the application's source in the source registry, and renders the corresponding component.

```jsx
import { resolveSource } from '../config/sourceRegistry';
import { useCurrentApp } from '../routing/useCurrentApp';

export function ShellContent({ config }) {
    const { app, params } = useCurrentApp( config );

    if ( ! app ) {
        return <div>Not found</div>;
    }

    const AppComponent = resolveSource( app.source );

    if ( ! AppComponent ) {
        return <div>Unknown source: { app.source }</div>;
    }

    return <AppComponent config={ app.config } params={ params } />;
}
```

### Source registry (`src/config/sourceRegistry.js`)

Maps source type strings to React components.

```jsx
import PostsApp from '../apps/PostsApp';
import EditorApp from '../apps/EditorApp';
import MediaApp from '../apps/MediaApp';
import ProfileApp from '../apps/ProfileApp';
import IframeApp from '../apps/IframeApp';

export const sourceRegistry = {};

// Register core sources
register( 'core:posts', PostsApp );
register( 'core:editor', EditorApp );
register( 'core:media', MediaApp );
register( 'core:profile', ProfileApp );

// iframe: sources are handled dynamically — any source string starting
// with "iframe:" routes to IframeApp with the URL as a prop.

function register( source, component ) {
    sourceRegistry[ source ] = component;
}

export function resolveSource( source ) {
    if ( source.startsWith( 'iframe:' ) ) {
        return IframeApp;
    }
    return sourceRegistry[ source ] || null;
}
```

---

## 8. Application implementations

### PostsApp

A DataViews-powered list of posts (or pages, or any post type) with edit/trash/view actions.

**Data source:** `@wordpress/core-data` entity records.

```
useEntityRecords( 'postType', config.postType, {
    per_page: 20,
    status: config.status || 'any',
    orderby: config.orderby || 'date',
    context: 'edit',
    _embed: 'author,wp:featuredmedia',
} );
```

**Fields displayed:** Title (linked), Status (badge), Author, Date.

**Actions:**
- **Edit** — navigates to `#/editor/{postType}/{postId}`
- **View** — opens the post permalink in a new tab
- **Trash** — `DELETE /wp/v2/{postType}/{id}` (no force — sends to trash)

**Toolbar:** "Add New" button dispatches `core/new-post` or navigates to `#/editor/{postType}/new`.

**Search:** Uses the `search` parameter on the entity query.

**Pagination:** Reads `X-WP-Total` and `X-WP-TotalPages` from the entity records metadata.

This component uses the `DataViews` component from `@wordpress/dataviews`, which ships stable in WordPress 6.7+.

### EditorApp

Renders the block editor for a given post inside an iframe.

**Mounting:** The block editor route params provide post type and ID: `#/editor/post/42` → `postType: "post", postId: 42`. For new posts: `#/editor/post/new` → create a new auto-draft via `POST /wp/v2/{postType}` with `status: "auto-draft"`, then load the editor with the new post's ID.

**Implementation:** The MVP uses the IframeApp approach — `iframe:post.php?post={id}&action=edit` with wp-admin chrome hidden via injected CSS. This is the plan, not a fallback. Mounting `@wordpress/editor` natively is deferred to a future iteration because:
1. `@wordpress/edit-post` is being phased out in favor of `@wordpress/editor`'s unified `Editor` component — the API surface is still shifting.
2. The block editor assumes full viewport control, making constrained mounting complex.
3. The iframe approach is functionally identical from the user's perspective.

**Navigation:** The shell intercepts the editor's "back" navigation. A "Back to list" button in the shell toolbar navigates to the originating post list route (e.g., `#/posts`).

**New post flow:**
1. User clicks "Add New" in PostsApp.
2. Shell creates auto-draft via REST API: `POST /wp/v2/posts` with `{ status: "auto-draft", title: "" }`.
3. On success, navigate to `#/editor/post/{newId}`.
4. EditorApp renders `iframe:post.php?post={newId}&action=edit`.

### MediaApp

A grid/list view of the media library.

**Data source:**
```
useEntityRecords( 'root', 'media', {
    per_page: 40,
    context: 'edit',
    media_type: filter,
} );
```

**Display:** Grid of thumbnails (for images) or file icons (for documents/audio/video). Clicking an item opens a detail panel showing title, alt text, caption, file URL, and dimensions.

**Actions:**
- **Upload** — opens a file picker, uploads via `POST /wp/v2/media` (multipart form data).
- **Edit details** — inline editing of title, alt text, caption, description. Saves via `PATCH /wp/v2/media/{id}`.
- **Delete** — `DELETE /wp/v2/media/{id}?force=true` (media has no trash).
- **Copy URL** — copies the source URL to clipboard.

**Filters:** Dropdown for media type (All, Images, Video, Audio, Documents).

### ProfileApp

A form for editing the current user's profile.

**Data source:**
```
useEntityRecord( 'root', 'user', window.wpAdminShell.userId );
// or: fetch /wp/v2/users/me?context=edit
```

**Fields:** First name, Last name, Nickname, Display name (select from available options), Email, Website, Bio (textarea).

**Save:** `PATCH /wp/v2/users/me` with changed fields.

Uses `@wordpress/components`: `TextControl`, `TextareaControl`, `SelectControl`, `Button`.

### IframeApp

The escape hatch. Renders a legacy wp-admin page inside an iframe.

**URL resolution:** The source string `"iframe:plugins.php"` resolves to `{adminUrl}plugins.php`. The `adminUrl` comes from `wpAdminShell.adminUrl` (which is `admin_url()` — handles non-standard wp-admin paths).

**Chrome hiding:** After the iframe loads (same-origin, so we have access to its DOM), inject a `<style>` element that hides `#adminmenuwrap`, `#adminmenuback`, `#wpadminbar`, `#wpfooter` and adjusts `#wpcontent { margin-left: 0 }`.

**Height:** The iframe should fill the content region. Use `height: 100%` on the iframe element.

**Link handling (MVP):** Let the iframe handle its own internal navigation. Links within the iframe stay in the iframe. This means navigating from `plugins.php` to `plugin-install.php` happens inside the iframe, not in the shell's routing. This is acceptable for MVP.

---

## 9. Routing

### URL scheme

```
#/                          → defaultApp
#/{appId}                   → application by ID
#/{appId}/{param1}/{param2} → application with parameters
```

Examples:
```
#/posts                     → PostsApp with config.postType from admin.json
#/editor/post/42            → EditorApp with postType="post", postId=42
#/editor/post/new           → EditorApp creating new post
#/media                     → MediaApp
#/profile                   → ProfileApp
#/plugins                   → IframeApp with url="plugins.php"
```

### Router implementation (`src/routing/router.js`)

A minimal hash router. Listens to `hashchange` events, parses the hash into segments, and provides the current route via React context.

```jsx
const RouteContext = createContext({ path: [], hash: '' });

export function RouterProvider({ children }) {
    const [hash, setHash] = useState(window.location.hash);

    useEffect(() => {
        const handler = () => setHash(window.location.hash);
        window.addEventListener('hashchange', handler);
        return () => window.removeEventListener('hashchange', handler);
    }, []);

    const path = hash.replace('#/', '').split('/').filter(Boolean);

    return (
        <RouteContext.Provider value={{ path, hash }}>
            {children}
        </RouteContext.Provider>
    );
}

export function navigate(appId, ...params) {
    window.location.hash = '#/' + [appId, ...params].join('/');
}
```

### `useCurrentApp` hook (`src/routing/useCurrentApp.js`)

Resolves the current route to an application definition from the config.

```jsx
export function useCurrentApp(config) {
    const { path } = useContext(RouteContext);
    const appId = path[0] || config.defaultApp;
    const app = config.applications.find(a => a.id === appId);
    const params = path.slice(1);
    return { app, params };
}
```

---

## 10. Command palette integration

### Shell-scoped commands (`src/commands/useShellCommands.js`)

When the shell mounts, register commands for each non-hidden application in the config. Commands are registered via the `commands` store dispatch (not the `useCommand` hook, which can't be called in a loop due to React hooks rules):

```jsx
import { useEffect } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';

export function useShellCommands( config ) {
    const { registerCommand, unregisterCommand } = useDispatch( commandsStore );

    useEffect( () => {
        const ids = [];

        config.applications
            .filter( app => ! app.hidden )
            .forEach( app => {
                const name = `shell/go-to-${ app.id }`;
                ids.push( name );
                registerCommand( {
                    name,
                    label: `Go to ${ app.title }`,
                    icon: resolveIcon( app.icon ),
                    callback: ( { close } ) => {
                        navigate( app.id );
                        close();
                    },
                } );
            } );

        return () => ids.forEach( unregisterCommand );
    }, [ config.applications ] );
}
```

Also register a "New Post" command if any `core:posts` application exists with `postType: "post"`, and a "New Page" command for `postType: "page"`.

The command palette UI (`Cmd+K` / `Ctrl+K`) works automatically since `@wordpress/commands` is loaded as a dependency.

---

## 11. Config resolver (`src/config/resolveConfig.js`)

Validates the `admin.json` object and applies defaults for any omitted properties.

```javascript
export function resolveConfig(raw) {
    const config = { ...raw };

    // Defaults
    config.branding = {
        logo: null,
        title: null,  // null means "use wpAdminShell.siteName at render time"
        accentColor: '#3858e9',
        ...config.branding,
    };

    config.layout = {
        navigation: 'left',
        navigationCollapsed: false,
        toolbar: true,
        navigationWidth: 280,
        ...config.layout,
    };

    // Ensure all applications have defaults
    config.applications = (config.applications || []).map(app => ({
        hidden: false,
        config: {},
        ...app,
    }));

    // Auto-generate navigation if not specified
    if (!config.navigation) {
        config.navigation = config.applications
            .filter(app => !app.hidden)
            .map(app => ({ app: app.id }));
    }

    // Default toolbar
    config.toolbar = config.toolbar || { left: [], right: [] };

    // Default app
    config.defaultApp = config.defaultApp ||
        config.applications.find(a => !a.hidden)?.id;

    return config;
}
```

---

## 12. Styling approach

The shell uses `@wordpress/components` for all UI elements, which means it inherits WordPress's design tokens and component styles.

Custom CSS is minimal and scoped to shell layout concerns:

- **Shell layout** — flexbox container with sidebar + content regions.
- **Accent color** — applied via `--wp-admin-shell-accent` CSS custom property, set from `branding.accentColor`. Used for active nav items, focus rings, and selected states.
- **Navigation width** — set via `--wp-admin-shell-nav-width` CSS custom property.
- **Navigation collapsed state** — sidebar width shrinks to icon-only width (~60px).

No custom design system. No custom component library. Everything is `@wordpress/components`. The shell should look like it belongs in WordPress.

---

## 13. Build order

The implementation is sequenced so that each step produces a testable, demonstrable increment.

### Step 1: Empty shell with navigation

Build the plugin PHP, the shell layout (sidebar + toolbar + empty content area), and the navigation renderer. Load `admin.json`, render the nav items. Clicking a nav item updates the hash route and highlights the active item. No applications yet — just the shell chrome.

**Testable result:** You can install the plugin, click "Shell Admin" in wp-admin, and see a custom admin shell with a sidebar showing navigation items from the JSON config. Switching between the three example configs (via a simple dropdown or by changing the option manually) changes the navigation.

### Step 2: PostsApp (DataViews)

Implement the `core:posts` source. Fetch posts via `useEntityRecords`, render a table with title/status/author/date columns. Add "Edit" action (navigates to `#/editor/post/{id}` — which will show "Unknown source" until step 3). Add "Trash" action.

**Testable result:** Click "Posts" in the shell nav, see a list of posts pulled from the REST API. Click "Pages" (if configured), see pages. Working search and pagination.

### Step 3: IframeApp (escape hatch)

Implement the `iframe:` source. Resolve URLs, render iframe, inject CSS to hide wp-admin chrome.

**Testable result:** Click "Plugins" in the developer admin shell, see the plugins page rendered inside the shell without wp-admin's own sidebar and admin bar. The shell's navigation stays visible.

### Step 4: EditorApp

Implement the EditorApp using the iframe approach: `iframe:post.php?post={id}&action=edit` with wp-admin chrome hidden via injected CSS. This reuses IframeApp from Step 3. The "Add New" flow creates an auto-draft via REST API before loading the editor iframe.

**Testable result:** Click "Edit" on a post in the PostsApp list, get the block editor for that post inside the shell. Click "Add New" to create a fresh post. Save works. Back button returns to the post list.

### Step 5: MediaApp and ProfileApp

Implement the remaining two native applications. Media is a grid of thumbnails with upload. Profile is a form with save.

**Testable result:** Media library and profile editing work inside the shell.

### Step 6: Command palette + shell switching

Register shell-scoped commands. Implement the settings page for switching active configurations. Add a shell switcher UI (dropdown in the toolbar or settings screen).

**Testable result:** `Cmd+K` opens the command palette with commands scoped to the current shell config. Switching from "Content Author" to "Developer Admin" changes the entire admin experience.

### Step 7: Polish and demo prep

Finalize the three example configurations. Test the "switch shells" flow. Fix edge cases. Record a demo or write a walkthrough.

**Testable result:** A plugin you can install on any WordPress 6.7+ site, activate, and immediately experience three different admin shells — Content Author, Client Portal, Developer Admin — all running on the same WordPress install, all powered by the same `admin.json` configuration format.

---

## 14. Dependencies

### WordPress packages (loaded as externals via wp-scripts)

| Package | Purpose |
|---|---|
| `@wordpress/element` | React wrapper (createRoot, useState, etc.) |
| `@wordpress/components` | All UI components (Button, TextControl, etc.) |
| `@wordpress/data` | State management (useSelect, useDispatch) |
| `@wordpress/core-data` | Entity records, REST API integration |
| `@wordpress/api-fetch` | Authenticated REST API calls |
| `@wordpress/icons` | Icon library |
| `@wordpress/commands` | Command palette integration |
| `@wordpress/dataviews` | DataViews component for PostsApp list |
| `@wordpress/i18n` | Internationalization |
| `@wordpress/url` | URL utilities |

### Build tooling

| Tool | Purpose |
|---|---|
| `@wordpress/scripts` | Build, lint, format, test. Handles Webpack config, Babel, externals |

No additional npm dependencies for the MVP. Everything comes from WordPress packages.

### WordPress version requirement

**WordPress 6.7+** (for stable `@wordpress/commands` admin-wide, `@wordpress/dataviews` availability, and current `@wordpress/components` APIs).

---

## 15. What success looks like

You install the plugin on a stock WordPress site. You click "Shell Admin" in the menu. You see a clean, modern admin shell with a sidebar, toolbar, and content area. You browse posts, open the editor, manage media, edit your profile — all without leaving the shell. You open `Cmd+K` and navigate via the command palette.

Then you go to the shell settings, switch from "Developer Admin" to "Content Author." The entire admin simplifies — just Posts, Pages, Media, and a "New Post" button. Switch to "Client Portal" and it's branded with a custom logo and accent color, showing only the screens a client needs.

Same WordPress. Same data. Same plugins. Three different admin experiences, driven by three JSON files.

That's the demo.
