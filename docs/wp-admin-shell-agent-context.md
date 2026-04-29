# WP Admin Shell — Agent Build Context

## What this project is

A WordPress plugin that renders a configurable, React-based admin shell. The shell reads its layout, navigation, and application configuration from an `admin.json` file and renders a complete admin UI using `@wordpress/components`, powered by the REST API via `@wordpress/core-data`.

Read `docs/wp-admin-shell-mvp-spec.md` for the validated MVP design spec before writing any code targeting the current shipped surface.

For post-MVP architecture work — regions+apps+layout-engines, 5-origin cascade, DTCG `tokens.json` integration, plugin source registry, drop-in replacement — read `docs/wp-admin-shell-design-spec.md`. That is the canonical doc for new design decisions; the MVP spec is the record of what's been built.

## Critical rules

1. **Use `@wordpress/components` for all UI.** Never build custom buttons, inputs, panels, dropdowns, or modals. Import them from `@wordpress/components`. The shell must look like it belongs in WordPress.

2. **Use `@wordpress/core-data` for all data fetching.** Never use raw `fetch()` or `@wordpress/api-fetch` directly for entity data. Use `useEntityRecords()` for lists and `useEntityRecord()` for single items. The core-data layer handles endpoint construction, caching, pagination, nonces, and field optimization.

3. **Use `@wordpress/api-fetch` only for non-entity operations** (e.g., custom endpoints that aren't part of the entity system).

4. **No external dependencies.** The only dependencies are `@wordpress/*` packages, which are loaded as externals by `@wordpress/scripts`. No React Router, no Tailwind, no UI library, no state management library. Everything comes from WordPress packages.

5. **Follow the build order.** The seven steps in the spec exist so that each step produces something testable. Don't skip ahead. Don't combine steps.

6. **The `iframe:` escape hatch is not a compromise — it's a feature.** It's what makes the shell immediately useful for every wp-admin screen. Implement it properly with chrome hiding.

7. **When in doubt, keep it simple.** The MVP proves a concept. Every decision should optimize for "does this demonstrate that the admin shell is separable, configurable, and swappable?" If a feature doesn't serve that demo, defer it.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php              # Plugin entry — registers page, enqueues assets, loads config
├── shells/                          # Bundled admin.json configurations
│   ├── content-author.json
│   ├── client-portal.json
│   └── developer-admin.json
├── assets/
│   └── acme-logo.svg               # Example branding asset
├── src/                             # JS source — built with @wordpress/scripts
│   ├── index.js                     # Entry — mounts Shell into #wp-admin-shell
│   ├── shell/
│   │   ├── Shell.js                 # Top-level: reads config, sets up providers
│   │   ├── ShellLayout.js           # Layout regions: nav + toolbar + content
│   │   ├── ShellNavigation.js       # Sidebar nav renderer
│   │   ├── ShellToolbar.js          # Top toolbar renderer
│   │   ├── ShellContent.js          # Content region — resolves route to app component
│   │   ├── SiteHub.js               # Sidebar header: site icon, title, command palette
│   │   ├── SiteIcon.js              # Site icon: branding logo or WordPress icon fallback
│   │   ├── SidebarNavigationContext.js  # Direction state for slide animations
│   │   ├── SidebarNavigationScreen.js   # Screen with back button + title + description
│   │   ├── SidebarNavigationItem.js     # Nav item (icon, label, chevron, active state)
│   │   ├── SidebarContent.js            # Animated wrapper for screen transitions
│   │   └── SidebarButton.js             # Compact button for dark sidebar
│   ├── apps/
│   │   ├── PostsApp.js              # DataViews post/page list
│   │   ├── EditorApp.js             # Block editor mount (or iframe fallback)
│   │   ├── SimpleEditorApp.js       # Substack-style native block editor (restricted block set)
│   │   ├── MediaApp.js              # Media library grid
│   │   ├── ProfileApp.js            # User profile form
│   │   └── IframeApp.js             # Legacy wp-admin page in iframe
│   ├── routing/
│   │   ├── router.js                # Hash-based router context + navigate()
│   │   └── useCurrentApp.js         # Hook: route → application from config
│   ├── commands/
│   │   └── useShellCommands.js      # Register command palette commands from config
│   └── config/
│       ├── resolveConfig.js         # Validate admin.json, apply defaults
│       └── sourceRegistry.js        # Map source strings → React components
├── docs/
│   ├── mvp-spec.md                  # Full design specification
│   ├── admin-json-schema.md         # Schema design and example configurations
│   └── api-validation.md            # REST API coverage analysis
└── package.json                     # @wordpress/scripts as only dev dependency
```

## Build tooling

Initialize with:

```bash
npx @wordpress/create-block@latest wp-admin-shell --no-plugin
# Then replace the scaffolded block files with our plugin structure
```

Or manually:

```bash
mkdir wp-admin-shell && cd wp-admin-shell
npm init -y
npm install @wordpress/scripts --save-dev
```

`package.json` scripts:

```json
{
  "scripts": {
    "build": "wp-scripts build",
    "start": "wp-scripts start",
    "lint:js": "wp-scripts lint-js",
    "format": "wp-scripts format"
  }
}
```

`@wordpress/scripts` handles Webpack configuration, Babel transpilation, and externalizing `@wordpress/*` packages automatically. The build output goes to `build/index.js`, `build/index.css`, and `build/index.asset.php`.

## WordPress package API reference

### @wordpress/core-data — Entity records

This is the primary data layer. It wraps the REST API with caching, optimistic updates, and React hooks.

```jsx
import { useEntityRecords, useEntityRecord } from '@wordpress/core-data';

// Fetch a list of posts
const { records, isResolving, hasResolved, totalItems, totalPages } = useEntityRecords(
    'postType',    // kind
    'post',        // name (matches the REST API post type slug)
    {              // query args (passed directly to the REST endpoint)
        per_page: 20,
        status: 'any',
        context: 'edit',
        search: searchTerm,
        page: currentPage,
        _embed: 'author,wp:featuredmedia',
    }
);
// `records` is an array of post objects
// `totalItems` comes from X-WP-Total header
// `totalPages` comes from X-WP-TotalPages header

// Fetch a single post
const { record, isResolving } = useEntityRecord( 'postType', 'post', postId );

// Fetch a single entity and get an edit function
const { record, editedRecord, edits, edit, save, hasEdits } = useEntityRecord(
    'root', 'user', userId
);
// edit({ first_name: 'New Name' }) stages changes locally
// save() persists to API via PATCH

// Fetch media
const { records: mediaItems } = useEntityRecords( 'root', 'media', {
    per_page: 40,
    media_type: 'image',
    context: 'edit',
});

// Fetch the current user
const { record: currentUser } = useEntityRecord( 'root', 'user', userId );
```

Entity kinds and names that map to REST endpoints:

| Kind | Name | REST Endpoint |
|---|---|---|
| `postType` | `post` | `/wp/v2/posts` |
| `postType` | `page` | `/wp/v2/pages` |
| `postType` | `{cpt}` | `/wp/v2/{cpt}` |
| `root` | `media` | `/wp/v2/media` |
| `root` | `user` | `/wp/v2/users` |
| `root` | `site` | `/wp/v2/settings` |
| `root` | `plugin` | `/wp/v2/plugins` |
| `root` | `theme` | `/wp/v2/themes` |
| `postType` | `wp_template` | `/wp/v2/templates` |
| `postType` | `wp_template_part` | `/wp/v2/template-parts` |
| `root` | `navigation` | `/wp/v2/navigation` |
| `taxonomy` | `category` | `/wp/v2/categories` |
| `taxonomy` | `post_tag` | `/wp/v2/tags` |

### @wordpress/data — State management

```jsx
import { useSelect, useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as commandsStore } from '@wordpress/commands';

// Reading state
const posts = useSelect( ( select ) => {
    return select( coreStore ).getEntityRecords( 'postType', 'post', { per_page: 10 } );
}, [] );

// Dispatching actions
const { deleteEntityRecord } = useDispatch( coreStore );
await deleteEntityRecord( 'postType', 'post', postId );
// Without force → trash. For permanent delete, pass the URL param.

// Saving entity changes
const { saveEntityRecord } = useDispatch( coreStore );
await saveEntityRecord( 'postType', 'post', { id: postId, title: 'New Title' } );
```

### @wordpress/api-fetch — Low-level REST calls

Only use this for operations that `@wordpress/core-data` doesn't cover.

```jsx
import apiFetch from '@wordpress/api-fetch';

// Nonce is automatically included (set up by wpApiSettings global)
const result = await apiFetch( { path: '/wp/v2/settings' } );
const updated = await apiFetch( {
    path: '/wp/v2/settings',
    method: 'POST',
    data: { title: 'New Site Title' },
} );

// Upload media
const formData = new FormData();
formData.append( 'file', file );
const media = await apiFetch( {
    path: '/wp/v2/media',
    method: 'POST',
    body: formData,
} );
```

### @wordpress/components — UI components

Key components for the shell:

```jsx
import {
    // Layout
    Panel, PanelBody, PanelRow,
    NavigatorProvider, NavigatorScreen, NavigatorButton, NavigatorBackButton,
    __experimentalVStack as VStack,
    __experimentalHStack as HStack,
    __experimentalSpacer as Spacer,
    __experimentalDivider as Divider,

    // Controls
    Button,
    TextControl,
    TextareaControl,
    SelectControl,
    SearchControl,
    ToggleControl,
    Spinner,

    // Feedback
    Notice,
    SnackbarList,

    // Overlays
    Modal,
    DropdownMenu,
    MenuGroup,
    MenuItem,

    // Data display
    Card, CardBody, CardHeader, CardFooter,
    __experimentalText as Text,
    __experimentalHeading as Heading,
    Tooltip,
    Icon,

    // Slots
    SlotFillProvider,
    createSlotFill,
} from '@wordpress/components';
```

**Button variants:**

```jsx
<Button variant="primary">Save</Button>       // Blue filled
<Button variant="secondary">Cancel</Button>    // Outlined
<Button variant="tertiary">Skip</Button>       // Text only
<Button variant="link">Learn more</Button>     // Styled as link
<Button isDestructive>Delete</Button>           // Red
<Button icon={ plus } label="Add" />           // Icon-only with tooltip
<Button icon={ plus } label="Add new">Add new</Button>  // Icon + text
```

**Important:** Many layout components are `__experimental`. Use them anyway — they're stable in practice and widely used in Gutenberg core. The `__experimental` prefix is a versioning signal, not a quality signal.

### @wordpress/icons — Icon resolution

```jsx
import { post, page, media, edit, settings, user, plugins, layout, external, plus, search } from '@wordpress/icons';
import { Icon } from '@wordpress/components';

// Render an icon
<Icon icon={ post } size={ 24 } />

// In a Button
<Button icon={ plus } label="Add new" />
```

The icon names in `admin.json` need to be resolved to icon components at runtime. Build a lookup map:

```jsx
import * as icons from '@wordpress/icons';

const iconMap = {
    post: icons.post,
    page: icons.page,
    media: icons.media,
    edit: icons.edit,
    settings: icons.settings,
    user: icons.people,        // note: "user" in config → "people" icon
    plugins: icons.plugins,
    layout: icons.layout,
    external: icons.external,
    plus: icons.plus,
    wrench: icons.tool,
    people: icons.people,
    draft: icons.drafts,
};

export function resolveIcon( name ) {
    return iconMap[ name ] || icons.WordPress;
}
```

### @wordpress/commands — Command palette

```jsx
import { useCommand, useCommandLoader } from '@wordpress/commands';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';
import { useEffect } from '@wordpress/element';

// Register a single static command (hook — must follow Rules of Hooks)
useCommand( {
    name: 'shell/go-to-posts',
    label: 'Go to Posts',
    icon: post,
    callback: ( { close } ) => {
        navigate( 'posts' );
        close();
    },
} );

// Register multiple commands dynamically (dispatch — works in loops/effects)
// NOTE: useCommand is a hook and cannot be called in a loop.
// For registering commands from a config array, use the store dispatch:
const { registerCommand, unregisterCommand } = useDispatch( commandsStore );

useEffect( () => {
    const ids = [];
    commands.forEach( ( cmd ) => {
        ids.push( cmd.name );
        registerCommand( cmd );
    } );
    return () => ids.forEach( unregisterCommand );
}, [ commands ] );

// Register dynamic commands (search-dependent)
useCommandLoader( {
    name: 'shell/search-posts',
    hook: usePostSearchLoader,  // a custom hook that returns { commands, isLoading }
} );
```

### @wordpress/i18n — Internationalization

```jsx
import { __ } from '@wordpress/i18n';

<Button>{ __( 'Save Changes', 'wp-admin-shell' ) }</Button>
```

Use the `'wp-admin-shell'` text domain for all translatable strings.

## PHP reference

### Registering the admin page

```php
add_action( 'admin_menu', function () {
    add_menu_page(
        __( 'Shell Admin', 'wp-admin-shell' ),   // Page title
        __( 'Shell Admin', 'wp-admin-shell' ),   // Menu title
        'read',                                    // Capability (all logged-in users)
        'wp-admin-shell',                          // Menu slug
        'wp_admin_shell_render_page',              // Render callback
        'dashicons-layout',                        // Icon
        2                                          // Position (near top)
    );
} );

function wp_admin_shell_render_page() {
    echo '<div id="wp-admin-shell"></div>';
}
```

### Enqueuing assets

```php
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    // Only load on our page
    if ( 'toplevel_page_wp-admin-shell' !== $hook ) {
        return;
    }

    $asset = include plugin_dir_path( __FILE__ ) . 'build/index.asset.php';

    wp_enqueue_script(
        'wp-admin-shell',
        plugins_url( 'build/index.js', __FILE__ ),
        $asset['dependencies'],
        $asset['version'],
        true
    );

    wp_enqueue_style(
        'wp-admin-shell',
        plugins_url( 'build/index.css', __FILE__ ),
        array( 'wp-components' ),
        $asset['version']
    );

    // Use wp_add_inline_script + wp_json_encode instead of wp_localize_script
    // because wp_localize_script coerces all values to strings, breaking
    // booleans, numbers, and nested objects in the config.
    $current_user = wp_get_current_user();

    wp_add_inline_script( 'wp-admin-shell', 'window.wpAdminShell = ' . wp_json_encode( array(
        'config'       => wp_admin_shell_get_active_config(),
        'siteUrl'      => site_url(),
        'homeUrl'      => home_url(),
        'adminUrl'     => admin_url(),
        'dashboardUrl' => admin_url(),
        'pluginUrl'    => plugins_url( '', __FILE__ ),
        'restUrl'      => rest_url(),
        'nonce'        => wp_create_nonce( 'wp_rest' ),
        'userId'       => get_current_user_id(),
        'siteName'     => get_bloginfo( 'name' ),
        'shells'       => wp_admin_shell_get_available_shells(),
        'user'         => array(
            'displayName' => $current_user->display_name,
            'avatarUrl'   => get_avatar_url( $current_user->ID, array( 'size' => 32 ) ),
        ),
    ) ) . ';', 'before' );
} );
```

### Hiding wp-admin chrome

On the shell page only, inject CSS that hides the default admin UI and makes the shell container full-viewport:

```css
#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter { display: none !important; }
#wpcontent { margin-left: 0 !important; }
#wpbody-content { padding-bottom: 0; }
html.wp-toolbar { padding-top: 0 !important; }
#wp-admin-shell {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #fff;
}
```

## REST API patterns for each application

### PostsApp

```
GET /wp/v2/posts?per_page=20&status=any&context=edit&page=1&_fields=id,title,status,date,author,featured_media&_embed=author

Via core-data:
useEntityRecords('postType', config.postType, { per_page: 20, status: 'any', context: 'edit', _embed: 'author' })

Trash:    DELETE /wp/v2/posts/{id}          (no force — sends to trash)
Delete:   DELETE /wp/v2/posts/{id}?force=true
Restore:  PATCH  /wp/v2/posts/{id}  { status: 'draft' }
```

### MediaApp

```
GET /wp/v2/media?per_page=40&context=edit&media_type=image

Upload:  POST /wp/v2/media  (multipart FormData with file field)
Update:  PATCH /wp/v2/media/{id}  { title, alt_text, caption, description }
Delete:  DELETE /wp/v2/media/{id}?force=true  (media has no trash)
```

### ProfileApp

```
GET   /wp/v2/users/me?context=edit
PATCH /wp/v2/users/me  { first_name, last_name, nickname, description, email, url }
```

### IframeApp

No REST API calls. The iframe URL resolves to: `{wpAdminShell.adminUrl}{source.replace('iframe:', '')}`.

## IframeApp chrome hiding

After the iframe loads (same-origin), access its document and inject CSS:

```jsx
const onIframeLoad = ( event ) => {
    try {
        const doc = event.target.contentDocument;
        const style = doc.createElement( 'style' );
        style.textContent = `
            #adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter {
                display: none !important;
            }
            #wpcontent { margin-left: 0 !important; }
            html.wp-toolbar { padding-top: 0 !important; }
        `;
        doc.head.appendChild( style );
    } catch ( e ) {
        // Cross-origin iframe — can't inject styles. This shouldn't happen
        // for same-site wp-admin pages but handle gracefully.
    }
};
```

## Common mistakes to avoid

1. **Don't use `fetch()` directly.** Always use `@wordpress/api-fetch` or `@wordpress/core-data`. They handle nonce auth, base URL resolution, and error parsing.

2. **Don't install React or ReactDOM.** They're provided by WordPress via `@wordpress/element`. The `@wordpress/scripts` build config externalizes them automatically.

3. **Don't create a separate CSS framework.** Use `@wordpress/components` styling. Add only layout CSS for the shell chrome (sidebar width, content region flex, accent color custom properties).

4. **Don't try to mount `@wordpress/edit-site` natively.** It assumes viewport ownership. Use `iframe:` for the site editor in the MVP.

5. **Don't add React Router.** The hash router in the spec is ~30 lines. That's all we need.

6. **Don't over-abstract the source registry.** It's a lookup object that maps strings to components. No dependency injection, no plugin system, no dynamic loading for the MVP.

7. **Don't forget `context: 'edit'` on entity queries.** Without it, you get the public `view` context which omits raw field values (title, content, excerpt return only `rendered`, not `raw`).

8. **Don't forget that `deleteEntityRecord` without additional params sends posts to trash, not permanent delete.** Media and terms have no trash and require `force: true`.

9. **Don't add capability checks in the MVP.** The shell shows everything the config declares. Capability-based filtering is deferred.

10. **Don't build a settings UI from scratch for the shell switcher.** Use WordPress's Settings API (`register_setting`, `add_settings_section`, `add_settings_field`) for the shell picker on the settings page. The settings page itself is a standard wp-admin page, not part of the shell.

11. **Don't `POST /wp/v2/posts` with an empty body.** WP rejects fully-empty posts with `Content, title, and excerpt are empty` (400). When creating drafts programmatically, seed `content` with at least an empty paragraph block (`<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->`) or set a placeholder title. SimpleEditorApp does this; EditorApp has the same latent bug (fix when touched).

12. **Don't forget to enqueue block-editor CSS on the shell page.** The shell page is `toplevel_page_wp-admin-shell`, not a post-edit page, so `wp-block-editor`, `wp-block-library`, `wp-format-library` styles are not auto-loaded. SimpleEditorApp requires them — `wp-admin-shell.php` enqueues them explicitly.

13. **Don't call `registerCoreBlocks()` more than once per page load.** Use a module-level idempotent guard (check `getBlockTypes().length === 0` before registering). Without the guard, switching between shells or remounting the editor double-registers and warns to the console.

14. **Don't rely on stable behavior of `__experimental*` settings.** SimpleEditorApp passes `__experimentalBlockPatterns: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize` — these may rename or move between WordPress versions. Pin to WP 6.7+ verified behavior; verify after each major upgrade.

15. **Don't put title inside the block tree.** SimpleEditorApp uses a native `<input>` outside `BlockEditorProvider`, bound directly to `record.title` via `editEntityRecord`. Treating title as content (a "title block") complicates serialization and conflicts with REST API expectations.

## Testing approach

Manual testing for the MVP. For each step in the build order:

1. Activate the plugin on a WordPress 6.7+ site with some sample content (posts, pages, media).
2. Navigate to "Shell Admin" in the admin menu.
3. Verify the shell renders correctly for each of the three example configurations.
4. Verify data operations (list, search, edit, trash) work against the REST API.
5. Verify the command palette shows shell-scoped commands.
6. Verify switching configurations changes the shell experience.

## Reference skills

Load these skills before starting implementation (symlinked in `.claude/skills/`):

- **`/wordpress-rest-api`** — REST API endpoints, fields, parameters, authentication, `_fields`/`_embed` optimization, entity record patterns
- **`/wordpress-dataviews`** — `@wordpress/dataviews` component API for PostsApp: field definitions, view state, actions, filtering, pagination
- **`/gutenberg-contributor`** — `@wordpress/*` package APIs (`components`, `data`, `core-data`, `commands`, `icons`), package boundaries, build tooling (`@wordpress/scripts`)

## Files to read before starting

1. `docs/wp-admin-shell-mvp-spec.md` — The full design specification. Read all of it.
2. `docs/admin-json-schema.md` — The `admin.json` schema with three example configurations.
3. `docs/admin-json-api-validation.md` — REST API coverage analysis for each application source.
4. `shells/*.json` — The three bundled shell configurations (content-author, client-portal, developer-admin).
