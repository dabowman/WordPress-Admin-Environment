# `admin.json` — Schema Design
## Declarative configuration for WordPress admin environments

---

## Design principles

Before getting into the schema, a few principles informed the design decisions:

**1. Follow theme.json's conventions.** WordPress developers already understand `theme.json`. `admin.json` should feel like a sibling — similar structure, similar naming patterns, similar mental model. If you can read `theme.json`, you should be able to read `admin.json`.

**2. Declare structure, not implementation.** `admin.json` describes *what* the admin looks like and *what's available* — not *how* to render it. The shell runtime interprets the declaration. This is the lesson from KDE's Global Themes: separate the "what" from the "how."

**3. Everything optional, sensible defaults.** An empty `admin.json` (or one with just a name) should produce a reasonable default shell. Every property should have a default that matches current wp-admin behavior. You only declare what you want to change. This is Fish shell's philosophy: great defaults, progressive customization.

**4. Applications are first-class.** The schema treats admin screens as "applications" — self-contained units with a name, route, icon, and component. This is the KDE Plasmoid / VS Code View Container model. The shell doesn't know or care what an application does internally; it knows how to navigate to it and where to mount it.

**5. POC scope.** This schema is designed for the proof-of-concept, not the final system. It intentionally omits things like extension contribution points, permission mappings, conditional logic, and theming tokens. Those can be added in later iterations without breaking the base schema.

---

## Schema

```jsonc
{
  // ==========================================================================
  // METADATA
  // ==========================================================================

  // Required. Machine-readable identifier for this shell configuration.
  // Convention: kebab-case, prefixed with author/org name.
  "name": "developer-shell",

  // Required. Human-readable name displayed in the shell switcher.
  "title": "Developer Admin",

  // Optional. Short description of the shell's purpose.
  "description": "Full-featured admin shell for developers and site administrators.",

  // Optional. Schema version for forward compatibility.
  // The shell runtime uses this to know which features are available.
  "version": 1,

  // ==========================================================================
  // BRANDING
  // ==========================================================================

  // Optional. Branding overrides for the shell chrome.
  // Omit entirely to use WordPress defaults.
  "branding": {

    // Optional. URL or path to a logo image displayed in the navigation header.
    // Relative paths resolve from the plugin/theme directory.
    // If omitted, displays the WordPress logo.
    "logo": "./assets/logo.svg",

    // Optional. Text displayed next to or below the logo.
    // If omitted, displays the site name from WordPress settings.
    "title": "Acme Corp",

    // Optional. Accent color used for active states, focus rings, selections.
    // Accepts any CSS color value. Applied as a CSS custom property.
    "accentColor": "#3858e9"
  },

  // ==========================================================================
  // LAYOUT
  // ==========================================================================

  // Optional. Controls the structural layout of the shell.
  "layout": {

    // Optional. Where the primary navigation renders.
    // "left" (default) — vertical sidebar on the left (wp-admin style)
    // "top" — horizontal navigation bar at the top
    // "hidden" — no persistent navigation (command-palette-only mode)
    "navigation": "left",

    // Optional. Whether the navigation starts collapsed to icon-only mode.
    // Users can toggle this at runtime; this sets the default.
    "navigationCollapsed": false,

    // Optional. Whether to show the top toolbar.
    // The toolbar contains the command palette trigger, user menu,
    // and any toolbar actions defined below.
    "toolbar": true,

    // Optional. Default width of the navigation sidebar in pixels.
    // Only applies when layout.navigation is "left".
    "navigationWidth": 280
  },

  // ==========================================================================
  // APPLICATIONS
  // ==========================================================================

  // Required (at least one). The set of available "applications" — screens
  // that can be mounted in the shell's content region. Each application
  // is a self-contained UI that the shell can navigate to.
  //
  // Applications are referenced by their "id" throughout the rest of the
  // config (in navigation items, toolbar actions, default route, etc.).
  //
  // The "source" field tells the shell how to mount the application:
  //   - "core:posts"         — built-in DataViews post list
  //   - "core:editor"        — built-in block editor
  //   - "core:media"         — built-in media library
  //   - "core:site-editor"   — built-in site editor
  //   - "core:settings"      — built-in settings screen
  //   - "core:profile"       — built-in user profile
  //   - "plugin:{slug}"      — a plugin-registered application
  //   - "iframe:{url}"       — an existing wp-admin page in an iframe
  //                            (escape hatch for legacy screens)
  //
  // For the POC, we implement the "core:*" sources and "iframe:*".
  // The "plugin:*" source is the extension point for later.
  "applications": [
    {
      "id": "posts",
      "source": "core:posts",
      "title": "Posts",
      "icon": "post",

      // Optional. Configuration passed to the application component.
      // Shape depends on the source type.
      "config": {
        "postType": "post"
      }
    },
    {
      "id": "pages",
      "source": "core:posts",
      "title": "Pages",
      "icon": "page",
      "config": {
        "postType": "page"
      }
    },
    {
      "id": "editor",
      "source": "core:editor",
      "title": "Editor",
      "icon": "edit",

      // Optional. If true, this application doesn't appear in navigation
      // but can be navigated to programmatically (e.g., clicking "Edit"
      // on a post in the post list opens the editor with that post).
      "hidden": true
    },
    {
      "id": "media",
      "source": "core:media",
      "title": "Media",
      "icon": "media"
    },
    {
      "id": "site-editor",
      "source": "core:site-editor",
      "title": "Design",
      "icon": "layout"
    },
    {
      "id": "settings",
      "source": "core:settings",
      "title": "Settings",
      "icon": "settings"
    },
    {
      "id": "profile",
      "source": "core:profile",
      "title": "Profile",
      "icon": "user",
      "hidden": true
    },
    {
      // Escape hatch: wrap a legacy wp-admin page in an iframe.
      // This lets shell configs include existing plugin pages
      // without those plugins needing to be shell-aware.
      "id": "plugins",
      "source": "iframe:plugins.php",
      "title": "Plugins",
      "icon": "plugins"
    }
  ],

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  // Optional. Defines the navigation structure. If omitted, the shell
  // generates navigation automatically from the applications list
  // (excluding hidden applications), in the order they're defined.
  //
  // When specified, this gives you full control over ordering, grouping,
  // separators, and nested sections.
  "navigation": [

    // A navigation item referencing an application by id.
    // This is the most common form.
    { "app": "posts" },
    { "app": "pages" },
    { "app": "media" },

    // A separator / visual divider.
    { "separator": true },

    { "app": "site-editor" },

    { "separator": true },

    // A navigation group — renders as a collapsible section.
    {
      "group": "System",
      "items": [
        { "app": "plugins" },
        { "app": "settings" }
      ]
    },

    // An external link — opens in a new tab.
    {
      "label": "View Site",
      "icon": "external",
      "href": "/",
      "external": true
    }
  ],

  // ==========================================================================
  // TOOLBAR
  // ==========================================================================

  // Optional. Actions displayed in the top toolbar. Each action is a button
  // that either navigates to an application or dispatches a command.
  "toolbar": {

    // Optional. Actions on the left side of the toolbar.
    "left": [
      // The command palette trigger is always present and doesn't
      // need to be declared. These are additional actions.
    ],

    // Optional. Actions on the right side of the toolbar.
    "right": [
      {
        // Navigate to an application.
        "app": "profile",
        "icon": "user",
        "label": "Profile"
      },
      {
        // Dispatch a command by name.
        "command": "core/new-post",
        "icon": "plus",
        "label": "New Post"
      },
      {
        // External link.
        "href": "/",
        "icon": "external",
        "label": "View Site",
        "external": true
      }
    ]
  },

  // ==========================================================================
  // DEFAULT ROUTE
  // ==========================================================================

  // Optional. The application id to show when the shell first loads.
  // Defaults to the first non-hidden application in the applications list.
  "defaultApp": "posts"
}
```

---

## Example configurations

### Content Author

A minimal shell for writers. No settings, no plugins, no design tools. Just write.

```json
{
  "name": "content-author",
  "title": "Writer",
  "description": "A focused writing environment.",
  "version": 1,
  "layout": {
    "navigation": "left",
    "navigationCollapsed": true
  },
  "applications": [
    {
      "id": "posts",
      "source": "core:posts",
      "title": "Posts",
      "icon": "post",
      "config": { "postType": "post" }
    },
    {
      "id": "pages",
      "source": "core:posts",
      "title": "Pages",
      "icon": "page",
      "config": { "postType": "page" }
    },
    {
      "id": "editor",
      "source": "core:editor",
      "title": "Editor",
      "icon": "edit",
      "hidden": true
    },
    {
      "id": "media",
      "source": "core:media",
      "title": "Media",
      "icon": "media"
    }
  ],
  "toolbar": {
    "right": [
      {
        "command": "core/new-post",
        "icon": "plus",
        "label": "New Post"
      }
    ]
  },
  "defaultApp": "posts"
}
```

### Client Portal

A branded shell for an agency's client. Company branding, only the screens they need, and a "View Site" button front and center.

```json
{
  "name": "acme-client-portal",
  "title": "Acme Corp Portal",
  "description": "Client portal for Acme Corp website management.",
  "version": 1,
  "branding": {
    "logo": "./assets/acme-logo.svg",
    "title": "Acme Corp",
    "accentColor": "#e63946"
  },
  "layout": {
    "navigation": "left",
    "navigationCollapsed": false,
    "navigationWidth": 240
  },
  "applications": [
    {
      "id": "pages",
      "source": "core:posts",
      "title": "Pages",
      "icon": "page",
      "config": { "postType": "page" }
    },
    {
      "id": "posts",
      "source": "core:posts",
      "title": "Blog",
      "icon": "post",
      "config": { "postType": "post" }
    },
    {
      "id": "editor",
      "source": "core:editor",
      "title": "Editor",
      "icon": "edit",
      "hidden": true
    },
    {
      "id": "media",
      "source": "core:media",
      "title": "Images & Files",
      "icon": "media"
    },
    {
      "id": "profile",
      "source": "core:profile",
      "title": "My Account",
      "icon": "user"
    }
  ],
  "navigation": [
    { "app": "pages" },
    { "app": "posts" },
    { "app": "media" },
    { "separator": true },
    { "app": "profile" },
    {
      "label": "View My Site",
      "icon": "external",
      "href": "/",
      "external": true
    }
  ],
  "toolbar": {
    "right": [
      {
        "href": "/",
        "icon": "external",
        "label": "View Site",
        "external": true
      }
    ]
  },
  "defaultApp": "pages"
}
```

### Developer / Full Admin

Everything exposed, mirroring full wp-admin capabilities. Uses iframe escape hatches for legacy screens that don't have native shell applications yet.

```json
{
  "name": "developer-admin",
  "title": "Developer Admin",
  "description": "Full admin shell with access to all WordPress features.",
  "version": 1,
  "layout": {
    "navigation": "left",
    "navigationCollapsed": false
  },
  "applications": [
    {
      "id": "posts",
      "source": "core:posts",
      "title": "Posts",
      "icon": "post",
      "config": { "postType": "post" }
    },
    {
      "id": "pages",
      "source": "core:posts",
      "title": "Pages",
      "icon": "page",
      "config": { "postType": "page" }
    },
    {
      "id": "editor",
      "source": "core:editor",
      "title": "Editor",
      "icon": "edit",
      "hidden": true
    },
    {
      "id": "media",
      "source": "core:media",
      "title": "Media",
      "icon": "media"
    },
    {
      "id": "site-editor",
      "source": "core:site-editor",
      "title": "Design",
      "icon": "layout"
    },
    {
      "id": "plugins",
      "source": "iframe:plugins.php",
      "title": "Plugins",
      "icon": "plugins"
    },
    {
      "id": "users",
      "source": "iframe:users.php",
      "title": "Users",
      "icon": "people"
    },
    {
      "id": "tools",
      "source": "iframe:tools.php",
      "title": "Tools",
      "icon": "wrench"
    },
    {
      "id": "settings",
      "source": "core:settings",
      "title": "Settings",
      "icon": "settings"
    },
    {
      "id": "profile",
      "source": "core:profile",
      "title": "Profile",
      "icon": "user",
      "hidden": true
    }
  ],
  "navigation": [
    { "app": "posts" },
    { "app": "pages" },
    { "app": "media" },
    { "separator": true },
    { "app": "site-editor" },
    { "separator": true },
    {
      "group": "System",
      "items": [
        { "app": "plugins" },
        { "app": "users" },
        { "app": "tools" },
        { "app": "settings" }
      ]
    },
    { "separator": true },
    {
      "label": "View Site",
      "icon": "external",
      "href": "/",
      "external": true
    }
  ],
  "toolbar": {
    "right": [
      {
        "command": "core/new-post",
        "icon": "plus",
        "label": "New"
      },
      {
        "app": "profile",
        "icon": "user",
        "label": "Profile"
      },
      {
        "href": "/",
        "icon": "external",
        "label": "View Site",
        "external": true
      }
    ]
  },
  "defaultApp": "posts"
}
```

---

## Design notes

### Why "applications" are separate from "navigation"

This is the KDE insight. An application is a capability — "the system can show you a post list." Navigation is a presentation decision — "the post list appears third in the sidebar, inside a group called Content." Separating them means you can have applications that exist but aren't in the navigation (like the editor, which you reach by clicking "Edit" on a post, not from the sidebar). It also means multiple shell configurations can expose different subsets of the same application set.

### Why the icon values are strings, not components

In the POC runtime, these strings would resolve against `@wordpress/icons` — WordPress's existing icon library. The string `"post"` becomes the `post` icon from that package. This keeps `admin.json` pure data (no code), which means it can be generated by AI, stored in a database, shipped as a JSON file in a plugin, or composed dynamically by a PHP function.

### Why iframe as an escape hatch

The iframe source type (`"iframe:plugins.php"`) is critical for the POC because it means every existing wp-admin page is immediately available inside the shell without any modification. You don't need to rewrite the plugins page or the users page as React applications. You just wrap them. This makes the POC practical — you can demo a full admin shell on day one, with native React applications for the screens you've built and iframed legacy pages for everything else. Over time, more screens move from iframe to native, but the shell works regardless.

### What's intentionally deferred

These are things the full system would need but the POC doesn't:

- **Permissions/capabilities mapping.** A production shell would filter navigation and applications based on the current user's WordPress capabilities. The POC shows everything to everyone.
- **Conditional logic.** "Show this nav item only if WooCommerce is active." The POC doesn't evaluate conditions.
- **Plugin contribution declarations.** In the full system, plugins would declare their own applications in their own `admin.json` fragments (like VS Code extensions declaring contributions in `package.json`). The POC only reads a single `admin.json`.
- **Theme tokens.** A full admin theming system with color palettes, typography scales, and density settings. The POC uses `branding.accentColor` as a minimal proof of the concept.
- **Layout variants.** Multiple layout configurations (e.g., a two-panel layout for DataViews + detail view). The POC uses a single sidebar + content layout.
- **Notification/notices region.** The POC would use WordPress's existing snackbar notices. A full system would declare a notices region in the layout.
