# WP Admin Shell

A WordPress plugin that replaces wp-admin with a configurable, React-based admin environment driven by `admin.json` configuration files.

## Status

MVP complete (Steps 1–7). All core application sources implemented. Three bundled shell configs working. Ready for testing on WordPress 6.7+.

Master design work for the post-MVP system lives in `docs/wp-admin-shell-design-spec.md`. The MVP spec remains as the record of what the proof-of-concept validated.

## Before modifying code

1. Load these skills (symlinked in `.claude/skills/`):
   - `/wordpress-rest-api` — REST API endpoints, authentication, `_fields`/`_embed`, entity records
   - `/wordpress-dataviews` — DataViews component for PostsApp: fields, views, actions, filtering
   - `/gutenberg-contributor` — `@wordpress/*` package APIs, package boundaries, build tooling
2. Read `docs/wp-admin-shell-agent-context.md` — project rules, structure, API reference, common mistakes
3. Read `docs/wp-admin-shell-design-spec.md` — **master design spec** (post-MVP architecture, regions+apps+layout-engines, 5-origin cascade w/ restrict-only overrides, three-tier design system w/ proposed `tokens.json` primitives layer aliased into both admin.json and theme.json, extension model)
4. Read `docs/wp-admin-shell-mvp-spec.md` — MVP design spec (validated implementation, working code samples)
5. Read `docs/admin-json-schema.md` — original v0/flat schema reference (preserved for cascade resolver)
6. Read `docs/admin-json-api-validation.md` — REST API coverage analysis per application source
7. Skim `docs/feedback.md` — running triage log (Inbox / Triaged / In progress / Done). Drop new bugs, feature requests, and to-dos into Inbox as they come up; promote items here before treating them as work.

## Key rules

- **WPDS components: prefer `@wordpress/ui` (next-gen WPDS) over `@wordpress/components` whenever an equivalent exists AND the import path stays inside `@wordpress/ui`.** Both are part of WPDS — `@wordpress/ui` is built on Base UI + the WPDS token system (`--wpds-*` CSS variables) and is already in `@wordpress/dependency-extraction-webpack-plugin`'s `BUNDLED_PACKAGES`, so it bundles into the build with no extra config. Fall back to `@wordpress/components` for: (a) primitives `@wordpress/ui` doesn't ship yet (`RadioControl`, `CheckboxControl`, `SelectControl`, `Spinner`, `Divider` as of `0.12.0`); (b) anything that pulls in `@wordpress/theme` — those throw on WP 6.9 because the runtime `wp.privateApis` allowlist excludes `@wordpress/theme`/`@wordpress/ui`. See "Webpack externals" below for the full picture. Concretely: do NOT use `@wordpress/ui`'s `Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, or the form `Select`/`Autocomplete` primitives until WP core allowlists `@wordpress/theme`. No custom component libraries.
- Component-mapping cheat sheet (use the `@wordpress/ui` left side when available AND safe):
  - `Button` (props: `tone`, `variant`, `size`, `loading`) replaces `@wordpress/components` `Button` (`variant="primary"` → `tone="brand" variant="solid"`; `isBusy` → `loading`).
  - `InputControl` (`label`, `description`, `value`, `onChange(e)`) replaces `TextControl` — note onChange takes a DOM event, not the raw value.
  - `Stack` (`direction`, `gap="xs|sm|md|lg|xl|2xl|3xl"`, `align`, `justify`) replaces `__experimentalVStack` / `__experimentalHStack`.
  - `Text` (`variant="heading-xl|lg|md|sm|body-xl|lg|md|sm"`, `render={ <h2/> }` to set the tag) replaces `__experimentalHeading` and `__experimentalText`.
  - **Stay on `@wordpress/components` for now:** `Notice`, `Tooltip`, `Popover`, `Modal`/`Dialog`, `Drawer`, `IconButton`, `SelectControl` (also needed for native `<optgroup>` support).
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

`webpack.config.js` extends the default `@wordpress/scripts` config with a `copy-webpack-plugin` step that copies `node_modules/@wordpress/dataviews/build-style/style.css` to `build/dataviews.css`. The dep-extraction plugin's defaults handle the rest — `@wordpress/dataviews` and `@wordpress/ui` are both in the upstream `BUNDLED_PACKAGES` list and bundle themselves; everything else externalizes to `wp.*`.

### `@wordpress/ui` cannot pull in `@wordpress/theme`

WP 6.9's runtime `wp.privateApis` allowlist (`CORE_MODULES_USING_PRIVATE_APIS`) is the 16-package set core ships with — it does **not** include `@wordpress/ui`, `@wordpress/theme`, or `@wordpress/dataviews`. The list and the `allowCoreModule` helper are not exported on the `wp.privateApis` namespace, so we cannot extend the allowlist from outside.

Implication: any `@wordpress/ui` import path that transitively pulls in `@wordpress/theme` will throw `"Cannot unlock an object that was not locked before"` (or fail the consent check) at module-load time, taking down the whole React tree. Concretely, `Notice.CloseIcon → IconButton → Tooltip → themePrivateApis` is the chain that breaks.

**Rule of thumb:** stick to the `@wordpress/ui` primitives whose import graphs stay inside `@wordpress/ui` itself — `Button`, `Stack`, `Text`, `InputControl`, `Field.*`, `Input`, `Textarea`, `Fieldset.*`, `Badge`, `Link`, `VisuallyHidden`. Avoid anything that needs an overlay (`Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `Notice` (because of CloseIcon), the form `Select`/`Autocomplete` primitives, `IconButton`) until WP core allowlists `@wordpress/theme`. For those, fall back to `@wordpress/components`.

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
│   │   ├── ShellContent.js  # Content region — resolves route to app component
│   │   ├── SiteHub.js       # Sidebar header: site icon, title, ⌘K command palette
│   │   ├── SiteIcon.js      # Site icon: branding logo or WordPress icon fallback
│   │   ├── SidebarNavigationContext.js  # Navigation direction state for slide animations
│   │   ├── SidebarNavigationScreen.js   # Screen with back button, title, description
│   │   ├── SidebarNavigationItem.js     # Nav item with icon, chevron, active state
│   │   ├── SidebarContent.js            # Animated wrapper for screen transitions
│   │   └── SidebarButton.js             # Compact button styled for dark sidebar
│   ├── apps/
│   │   ├── PostsApp.js      # DataViews post/page list (server-side fetch, actions)
│   │   ├── EditorApp.js     # Block editor in iframe + auto-draft flow (legacy escape hatch)
│   │   ├── SimpleEditorApp.js # Substack-style native block editor (title + restricted blocks + auto-save)
│   │   ├── MediaApp.js      # Media grid with upload, detail modal, delete
│   │   ├── ProfileApp.js    # User profile form via useEntityRecord
│   │   ├── SettingsGeneralApp.js # WPDS rebuild of options-general.php (site, membership, locale, dates)
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
| `core:editor` | EditorApp | `apiFetch` for auto-draft | Iframe to `post.php?post={id}&action=edit` (escape hatch / full editor) |
| `core:simple-editor` | SimpleEditorApp | `useEntityRecord('postType', 'post', id)` + `apiFetch` for new draft | Native block editor, title + 9 allowed blocks, debounced auto-save, Publish/Update |
| `core:media` | MediaApp | `useEntityRecords('root', 'media')` | Grid, upload, detail modal |
| `core:profile` | ProfileApp | `useEntityRecord('root', 'user', userId)` | Form with optimistic edits |
| `core:settings-general` | SettingsGeneralApp | `useEntityRecord('root', 'site')` | Recreates `wp-admin/options-general.php` with WPDS components |
| `iframe:{url}` | IframeApp | None | URL relative to `adminUrl`, chrome hidden via injected CSS |

### `core:simple-editor` notes

- Substack-style minimal editor — title + content only. Featured image, taxonomy, excerpt, scheduling, etc. are deferred to a future post settings panel.
- Allowed blocks (9): `core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`.
- Composes `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList` (inline, not iframed — keeps editor styles in the shell DOM).
- Block registration via `registerCoreBlocks()` is gated by a module-level idempotent guard (`getBlockTypes().length === 0`).
- Settings: `allowedBlockTypes`, `bodyPlaceholder`, `__experimentalBlockPatterns: []`, `__experimentalBlockPatternCategories: []`, `__experimentalReusableBlocks: []`, `__experimentalFeatures.layout.contentSize: '680px'`.
- Auto-save: 2s debounce on `hasEdits`; cancellable timer ref so Publish flushes immediately. Status indicator: `Unsaved changes` / `Saving…` / `Saved` (auto-fades) / `Save failed`.
- Publish button label flips between `Publish` and `Update` based on `record.status`.
- New-post flow seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->` into `content` because WP rejects fully-empty posts (`Content, title, and excerpt are empty`). EditorApp has the same latent bug — fix when touched.
- PHP enqueues `wp-block-editor`, `wp-block-library`, `wp-format-library` styles on the shell page so block chrome and default block styles render.
- Title is a native `<input>` outside the block tree (not a "title block"); Tab/Enter from the title focuses the first contenteditable in the body.

## Navigation

The sidebar supports two navigation modes:

- **Flat items**: `{ "app": "posts" }`, `{ "separator": true }`, `{ "group": "Label", "items": [...] }`, `{ "label": "...", "href": "...", "external": true }`
- **Drill-down screens**: `{ "screen": "id", "label": "...", "icon": "...", "description": "...", "items": [...] }` — renders as a nav item with chevron that slides to a sub-screen with back button

Screens support slide animations (0.14s CSS keyframes) and focus restoration after back navigation.

## Multi-area layout

The content region supports a split layout with primary content + preview cards:

- Set `contentWidth` on an app config to constrain the primary card width
- Set `preview` on an app config to the ID of another app to render in a secondary preview card
- Both panels float as elevated white cards on the dark chrome background

Example: `{ "id": "pages", "source": "core:posts", "config": { "postType": "page", "contentWidth": 480, "preview": "editor" } }`

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
