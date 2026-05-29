# WordPress Core Admin Screen Inventory

Complete list of every "app" or screen exposed to an admin user in WordPress core.

Sources (from `wordpress-develop/src/wp-admin/`):
- `menu.php` — single-site / per-site admin menu
- `network/menu.php` — network admin menu (multisite)
- `user/menu.php` — user admin menu (multisite signups)
- Standalone PHP files in `wp-admin/` and its subdirectories

This inventory is the authoritative reference for shell config coverage. When adding new application sources to `admin.json`, check this list first.

---

## Site Admin (single-site / per-site in multisite)

### Dashboard
- **Home** — `index.php`
- **My Sites** (multisite only) — `my-sites.php`
- **Updates** — `update-core.php`

### Posts (and any custom post type)
- **All Posts** — `edit.php`
- **Add New Post** — `post-new.php`
- **Edit Post** (single) — `post.php?action=edit`
- **Categories** — `edit-tags.php?taxonomy=category`
- **Tags** — `edit-tags.php?taxonomy=post_tag`
- **Edit Term** (single) — `term.php`

### Media
- **Library** — `upload.php`
- **Add Media File** — `media-new.php`
- **Edit Media** — `media.php` / `post.php?post={id}&action=edit`
- **Async upload handler** — `async-upload.php`
- **Media uploader iframe** — `media-upload.php`

### Pages
- **All Pages** — `edit.php?post_type=page`
- **Add New Page** — `post-new.php?post_type=page`

### Comments
- **All Comments** — `edit-comments.php`
- **Edit Comment** — `comment.php`
- **Comment moderation** — `moderation.php` (legacy redirect)
- **Comment edit form partial** — `edit-form-comment.php` (rendered inside `comment.php`)

### Links (legacy, only when Link Manager plugin enabled or `pre_option_link_manager_enabled`)
- **All Links** — `link-manager.php`
- **Add Link** — `link-add.php`
- **Edit Link** — `link.php`
- **Link Categories** — `edit-tags.php?taxonomy=link_category`
- **Import OPML** — `link-parse-opml.php`
- **Link form partial** — `edit-link-form.php`

### Appearance
- **Themes** — `themes.php`
- **Editor** (block themes) / **Design** / **Patterns** — `site-editor.php`
- **Customize** (classic themes) — `customize.php`
- **Fonts (Font Library)** — `font-library.php`
- **Menus** — `nav-menus.php`
- **Widgets** — `widgets.php` (`widgets-form.php`, `widgets-form-blocks.php`)
- **Header** — customizer deeplink → `customize.php` (also legacy `custom-header.php`)
- **Background** — customizer deeplink (also legacy `custom-background.php`)
- **Theme File Editor** — `theme-editor.php`
- **Install Themes** — `theme-install.php`

### Plugins
- **Installed Plugins** — `plugins.php`
- **Add Plugin** — `plugin-install.php`
- **Plugin File Editor** — `plugin-editor.php`

### Users
- **All Users** — `users.php`
- **Add User** — `user-new.php`
- **Edit User** — `user-edit.php`
- **Profile** — `profile.php`
- **Authorize Application** — `authorize-application.php`

### Tools
- **Available Tools** — `tools.php`
- **Import** — `import.php`
- **Export** — `export.php`
- **Site Health** — `site-health.php`
- **Site Health Info** — `site-health-info.php`
- **Export Personal Data** — `export-personal-data.php`
- **Erase Personal Data** — `erase-personal-data.php`
- **Delete Site** (multisite subsite) — `ms-delete-site.php`
- **Network Setup** (single → multisite) — `network.php`
- **Theme File Editor** (block themes, moved here) — `theme-editor.php`
- **Plugin File Editor** (block themes, moved here) — `plugin-editor.php`
- **Press This** (legacy bookmarklet) — `press-this.php`

### Settings
- **General** — `options-general.php`
- **Connectors** — `options-connectors.php`
- **Writing** — `options-writing.php`
- **Reading** — `options-reading.php`
- **Discussion** — `options-discussion.php`
- **Media** — `options-media.php`
- **Permalinks** — `options-permalink.php`
- **Privacy** — `options-privacy.php`
- **Privacy Policy Guide** — `privacy-policy-guide.php`
- **Privacy** (legacy redirect) — `privacy.php`
- **Options handler** — `options.php`

### Editor surfaces (not menu-visible, reached from list screens)
- **Block Editor (post)** — `edit-form-blocks.php` (loaded by `post.php` / `post-new.php`)
- **Classic Editor form** — `edit-form-advanced.php`
- **Tag/Term edit form** — `edit-tag-form.php`
- **Site Editor** — `site-editor.php`
- **Revisions** — `revision.php`

### Marketing / static screens
- **About** — `about.php`
- **Credits** — `credits.php`
- **Freedoms** — `freedoms.php`
- **Contribute** — `contribute.php`

### Endpoints / non-screen handlers
- `admin-ajax.php`, `admin-post.php`, `admin.php` (router), `load-scripts.php`, `load-styles.php`, `install.php`, `install-helper.php`, `setup-config.php`, `upgrade.php`, `update.php`

---

## Network Admin (`/wp-admin/network/`)

- **Dashboard / Home** — `index.php`
- **Updates** — `update-core.php`
- **Upgrade Network** — `upgrade.php`
- **Sites** — `sites.php`
- **Add Site** — `site-new.php`
- **Edit Site: Info** — `site-info.php`
- **Edit Site: Users** — `site-users.php`
- **Edit Site: Themes** — `site-themes.php`
- **Edit Site: Settings** — `site-settings.php`
- **Users** — `users.php`
- **Add User** — `user-new.php`
- **Edit User** — `user-edit.php`
- **Themes** — `themes.php`
- **Add Theme** — `theme-install.php`
- **Theme File Editor** — `theme-editor.php`
- **Plugins** — `plugins.php`
- **Add Plugin** — `plugin-install.php`
- **Plugin File Editor** — `plugin-editor.php`
- **Network Settings** — `settings.php`
- **Network Setup** — `setup.php`
- **Profile** — `profile.php`
- **Privacy** — `privacy.php`
- **Edit handler** — `edit.php`
- **About / Credits / Freedoms / Contribute** — `about.php`, `credits.php`, `freedoms.php`, `contribute.php`

---

## User Admin (`/wp-admin/user/`)
Per-user-only context, used during multisite signups.

- **Dashboard** — `index.php`
- **Profile** — `profile.php`
- **Edit User** — `user-edit.php`
- **Privacy** — `privacy.php`
- **About / Credits / Freedoms / Contribute**

---

## Notes for shell mapping

- "Apps" map cleanly to top-level menus: Dashboard, Posts, Media, Pages, Comments, Appearance, Plugins, Users, Tools, Settings (plus any CPTs).
- Site Editor (`site-editor.php`) is its own SPA, separate from the classic post editor.
- Customizer (`customize.php`) is its own SPA, classic-theme only.
- Network admin and user admin are parallel admin contexts, not screens within site admin.
- Many `edit-*.php` files are form partials included by other screens, not standalone screens: `edit-form-blocks.php`, `edit-form-advanced.php`, `edit-form-comment.php`, `edit-tag-form.php`, `edit-link-form.php`.

## Current shell coverage (as of MVP)

The plugin currently exposes these as `core:*` application sources:
- `core:posts` → `edit.php` (any post type)
- `core:editor` → iframe to `post.php?post={id}&action=edit`
- `core:media` → `upload.php`
- `core:profile` → `profile.php`
- `iframe:{url}` → escape hatch for any other screen above
