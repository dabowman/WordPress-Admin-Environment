# core:toolbar-actions

Prose accompanying `app.json#documentation` for the toolbar action clusters.

## Overview

ToolbarActionsApp renders three input streams into one toolbar:

1. **Authored actions** — `config.left[]` + `config.right[]`. Each entry is a plain link descriptor (`{ href, icon, label, external? }`), a built-in command id translated through a `COMMAND_HREFS` map (`{ command }`), or carries an `iconSource` arbitrary-icon escape-hatch descriptor.
2. **Dynamic `+New` (#129)** — enumerated at runtime from the registered post types (`getPostTypes({ context: 'edit' })` via core-data), gated per-type on `canUser('create', { kind: 'postType', name })`. Each item's href resolves via `newTargetHref` (`_shared/navigation/editorHref.mjs`): the workspace `/{rest_base}/new` route when the active workspace declares one, the classic `post-new.php?post_type=` URL otherwise — the Tier 1 handoff default (`docs/block-editor-native-port.md`), which also fixes CPTs (previously dead `#/{rest_base}/new` hash links in workspaces with no CPT add-new routes). Mirrors wp-admin's runtime `+New` cluster (the static new-post/new-page map is gone). Rendered as a single `+` dropdown so the toolbar stays compact when many CPTs are creatable. Classic gates each type on `$ptype_obj->show_in_admin_bar`, which isn't exposed in the REST `types` response — so an explicit `NEW_CONTENT_TYPE_DENYLIST` (slug-keyed) excludes the editor-infrastructure types that are creatable-for-admin but absent from classic's +New (`wp_block`, `wp_navigation`, `wp_template`, `wp_template_part`, the Font Library types, `wp_global_styles`, plus `attachment`).
3. **Admin-bar harvest (#128)** — plugin admin-bar nodes harvested server-side and exposed at `window.wpAdminWorkspaces.adminBar`. Each top-level node renders as a leaf anchor or, when it has child nodes, a dropdown. Node titles are arbitrary admin-context HTML rendered through `TrustedNodeTitle` (the engine-side escape hatch), never the kernel's name-based icon registry. Leaf harvested nodes and `iconSource`-carrying authored actions render as a **plain styled anchor** (`.wp-admin-workspaces-toolbar-action`), not `@wordpress/ui` `IconButton` — `IconButton` is icon-prop-based and not a reliable host for arbitrary children, so routing harvested markup through it risks a blank button.

The `command` shape exists for back-compat with workspace.json v1 — early workspaces declared `{ command: 'core/new-post' }` and the kernel resolved it. v2 prefers an explicit `href` directly; the `command` shape stays as a translation layer, now resolving through `newTargetHref` like the dynamic items (workspace route when declared, classic handoff otherwise).

## Architecture

`renderAction` resolves `href = action.href || COMMAND_HREFS[action.command]?.(routes)` (the command table holds per-command resolvers over the runtime routes). Missing both → render null (the action silently disappears). External actions add `target="_blank"` + `rel="noopener noreferrer"` to the rendered anchor. An action carrying `iconSource` renders a plain styled anchor wrapping `<ArbitraryIcon>` (not `IconButton`); a name-icon action renders through `IconButton`'s `icon` prop.

`useNewContentItems()` (the +New source) and `useAdminBarNodes()` (the admin-bar source) are hooks: the former drives off core-data selectors (`getPostTypes` + `canUser`), the latter reads the static server-harvested global. Both degrade to an empty list when their source is absent, so the app still renders nothing when there's no authored config, no creatable types, and no harvested nodes.

The spacer between left + right is `<div style={{flex: 1}}/>`. Could be a CSS-only solution via `justify-content: space-between` on the outer Stack, but the explicit spacer makes the two-cluster layout intent obvious.

### Admin-bar harvest (server side)

`WP_Admin_Workspaces_Chrome_Harvest::harvest_admin_bar()` instantiates a `WP_Admin_Bar`, runs `do_action('admin_bar_menu', $bar)`, and reads `$bar->get_nodes()`. It skip-lists the core nodes the workspace already owns first-class (`site-name` → site-hub, `my-account` → user-menu, `new-content`/`+new` → built natively here, plus the logo / search / context-link clusters) — extensible via the `wp_admin_workspaces_admin_bar_core_node_ids` filter — then folds each surviving plugin node's children into a `children[]` dropdown. Trust: node title HTML is admin-context, the same level at which classic wp-admin renders it; no new exposure inside the already-admin-gated workspace.

## Rebuild guide

Trivial port. Two arrays of action descriptors, render each as an anchor-styled button. The only subtle bit is the **anchor-render pattern** — buttons that need real anchor semantics (middle-click new-tab) must render as `<a>`, not as `<button>` with an onClick + `window.location.href`. Reuse the host framework's link primitive (React Router `Link`, Next `Link`) when the navigation is internal.

## Known limitations

- **No onClick actions.** Authored actions resolve to a URL. Apps that need to dispatch commands (open a modal, trigger a save) must do so through `core:command-palette` or their own app. (Harvested admin-bar leaf nodes likewise only carry hrefs — admin-bar nodes whose original behavior was a JS `onclick` handler surface as a link or a disabled item, since the harvest drops handler strings.)
- **`COMMAND_HREFS` is hard-coded.** Two entries today; adding a new command alias means editing this file.
- **`+New` href ↔ add-new-route coupling.** The dropdown checks the runtime routes for `/{rest_base}/new` before linking in-workspace. A CPT whose workspace add-new route path differs from its `rest_base` won't be detected and hands off to classic `post-new.php` (safe, but bypasses the native screen). Keep `rest_base` and the CPT's add-new-screen `path` in sync (same constraint `core:simple-editor` documents).
- **Admin-bar node titles render plain text in dropdown toggles.** A node *with children* renders the plain-text title in its toggle (WPDS `DropdownMenu` toggles are name-icon based, not arbitrary-HTML). Leaf nodes render the full title HTML via `TrustedNodeTitle`.
- **No active state.** Toolbar actions don't get `aria-current` — they're outbound links, not nav items.
