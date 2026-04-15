# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

MVP complete (Steps 1–7). All core application sources implemented. Three bundled shell configs working. Ready for testing on WordPress 6.7+.

## Before modifying code

1. Load these skills (symlinked in `.claude/skills/`):
   - `/wordpress-rest-api` — REST API endpoints, authentication, `_fields`/`_embed`, entity records
   - `/wordpress-dataviews` — DataViews component for PostsApp: fields, views, actions, filtering
   - `/gutenberg-contributor` — `@wordpress/*` package APIs, package boundaries, build tooling
2. Read `docs/wp-admin-shell-agent-context.md` — project rules, structure, API reference, common mistakes
3. Read `docs/wp-admin-shell-mvp-spec.md` — full design spec with validated code samples
4. Read `docs/admin-json-schema.md` — schema design and example configurations
5. Read `docs/admin-json-api-validation.md` — REST API coverage analysis per application source

## Key rules

- All UI uses `@wordpress/components`. No custom component libraries.
- All data fetching uses `@wordpress/core-data` (`useEntityRecords`, `useEntityRecord`). No raw `fetch()`.
- Exception: `@wordpress/api-fetch` is used for non-entity operations (media upload, auto-draft creation).
- No external npm dependencies. Only `@wordpress/*` packages (loaded as externals by `@wordpress/scripts`).
- Config is passed to JS via `wp_add_inline_script` + `wp_json_encode` (not `wp_localize_script` — it coerces types).
- The `iframe:` escape hatch is a feature, not a compromise. The EditorApp and site-editor use it for MVP.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
```

## Webpack externals

Custom `webpack.config.js` extends `@wordpress/scripts` default config to externalize `@wordpress/dataviews` (listed in `BUNDLED_PACKAGES` by default but available as `wp-dataviews` in WordPress 6.7+). The dep extraction plugin is replaced with a custom instance that maps `@wordpress/dataviews` → `['wp', 'dataviews']`.

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point (admin page, assets, settings, config loading)
├── webpack.config.js        # Custom webpack config (externalizes @wordpress/dataviews)
├── shells/                  # Bundled admin.json configurations
│   ├── content-author.json  # Minimal writer shell (collapsed nav, posts/pages/media only)
│   ├── client-portal.json   # Branded client shell (acme logo, accent color, scoped nav)
│   └── developer-admin.json # Full admin (all apps, iframe escape hatches for system screens)
├── assets/
│   └── acme-logo.svg        # Example branding asset for client portal demo
├── src/                     # JS source (built with @wordpress/scripts)
│   ├── index.js             # Entry — mounts Shell into #wp-admin-shell
│   ├── index.css            # All custom CSS (layout, nav, apps)
│   ├── shell/
│   │   ├── Shell.js         # Top-level: reads config, sets up router + commands
│   │   ├── ShellLayout.js   # Layout regions: nav + toolbar + content
│   │   ├── ShellNavigation.js # Sidebar nav renderer (items, groups, separators, external links)
│   │   ├── ShellToolbar.js  # Top toolbar + shell switcher dropdown
│   │   └── ShellContent.js  # Content region — resolves route to app component
│   ├── apps/
│   │   ├── PostsApp.js      # DataViews post/page list (server-side fetch, actions)
│   │   ├── EditorApp.js     # Block editor in iframe + auto-draft flow
│   │   ├── MediaApp.js      # Media grid with upload, detail modal, delete
│   │   ├── ProfileApp.js    # User profile form via useEntityRecord
│   │   └── IframeApp.js     # Legacy wp-admin page in iframe with chrome hiding
│   ├── routing/
│   │   ├── router.js        # Hash-based router (context + navigate())
│   │   └── useCurrentApp.js # Hook: route → application from config
│   ├── commands/
│   │   └── useShellCommands.js # Register command palette commands from config
│   └── config/
│       ├── resolveConfig.js # Validate admin.json, apply defaults
│       ├── sourceRegistry.js # Map source strings → React components
│       └── iconMap.js       # Map icon name strings → @wordpress/icons components
├── build/                   # Compiled output (~16KB JS, ~4.5KB CSS)
└── docs/                    # Specs and reference docs
```

## Application sources

| Source | Component | Data layer | Notes |
|--------|-----------|------------|-------|
| `core:posts` | PostsApp | `useEntityRecords('postType', config.postType)` | DataViews table, server-side fetch |
| `core:editor` | EditorApp | `apiFetch` for auto-draft | Iframe to `post.php?post={id}&action=edit` |
| `core:media` | MediaApp | `useEntityRecords('root', 'media')` | Grid, upload, detail modal |
| `core:profile` | ProfileApp | `useEntityRecord('root', 'user', userId)` | Form with optimistic edits |
| `iframe:{url}` | IframeApp | None | URL relative to `adminUrl`, chrome hidden via injected CSS |

## Shell switching

The active shell config is stored in `wp_admin_shell_active_config` option (registered with `show_in_rest`). Switchable via:
- Settings page (`wp-admin/admin.php?page=wp-admin-shell-settings`)
- Toolbar dropdown (saves via `POST /wp/v2/settings`, then reloads)

## Testing

Manual testing on WordPress 6.7+:
1. Activate plugin, navigate to "Shell Admin"
2. Verify navigation renders from active config
3. Test PostsApp: list, search, pagination, edit/trash actions
4. Test EditorApp: edit existing post, create new post (auto-draft)
5. Test MediaApp: grid, upload, detail edit, delete
6. Test ProfileApp: edit fields, save
7. Test IframeApp: plugins.php, users.php render with chrome hidden
8. Test shell switching: dropdown in toolbar, verify config changes
9. Test command palette: Cmd+K shows scoped commands
10. Test all three configs: content-author, client-portal, developer-admin
