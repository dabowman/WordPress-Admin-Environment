# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Before writing any code

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
- No external npm dependencies. Only `@wordpress/*` packages (loaded as externals by `@wordpress/scripts`).
- Config is passed to JS via `wp_add_inline_script` + `wp_json_encode` (not `wp_localize_script` — it coerces types).
- Follow the 7-step build order in the spec. Each step must be testable before moving to the next.
- The `iframe:` escape hatch is a feature, not a compromise. The EditorApp uses it for MVP.

## Build

```bash
npm install
npm run build    # production build
npm run start    # dev build with watch
```

## Project structure

```
wp-admin-shell/
├── wp-admin-shell.php       # Plugin entry point
├── shells/                   # Bundled admin.json configurations
├── src/                      # JS source (built with @wordpress/scripts)
│   ├── index.js
│   ├── shell/                # Shell chrome (layout, nav, toolbar, content)
│   ├── apps/                 # Application components (Posts, Editor, Media, Profile, Iframe)
│   ├── routing/              # Hash router
│   ├── commands/             # Command palette integration
│   └── config/               # Config resolver + source registry
├── build/                    # Compiled output
└── docs/                     # Specs and reference docs
```
