# core:toolbar-actions

Prose accompanying `app.json#documentation` for the toolbar action clusters.

## Overview

ToolbarActionsApp renders three input streams into one toolbar:

1. **Authored actions** — `config.left[]` + `config.right[]`. Each entry is a plain link descriptor (`{ href, icon, label, external? }`), a built-in command id translated through a `COMMAND_HREFS` map (`{ command }`), or carries an `iconSource` arbitrary-icon escape-hatch descriptor.
2. **Dynamic `+New` (#129)** — enumerated at runtime from the registered post types (`getPostTypes({ context: 'edit' })` via core-data), gated per-type on `canUser('create', { kind: 'postType', name })`, building `#/{rest_base}/new` hrefs. Mirrors wp-admin's runtime `+New` cluster (the static new-post/new-page map is gone). Rendered as a single `+` dropdown so the toolbar stays compact when many CPTs are creatable.
3. **Admin-bar harvest (#128)** — plugin admin-bar nodes harvested server-side and exposed at `window.wpAdminShell.adminBar`. Each top-level node renders as a leaf anchor button or, when it has child nodes, a dropdown. Node titles are arbitrary admin-context HTML rendered through `TrustedNodeTitle` (the engine-side escape hatch), never the kernel's name-based icon registry.

The `command` shape exists for back-compat with admin.json v1 — early shells declared `{ command: 'core/new-post' }` and the kernel resolved it. v2 prefers `{ href: '#/posts/new' }` directly; the `command` shape stays as a translation layer.

## Architecture

`renderAction` resolves `href = action.href || COMMAND_HREFS[action.command]`. Missing both → render null (the action silently disappears). External actions add `target="_blank"` + `rel="noopener noreferrer"` to the rendered anchor. When an action carries `iconSource`, the button renders `<ArbitraryIcon>` as a child instead of the name-based `icon` prop.

`useNewContentItems()` (the +New source) and `useAdminBarNodes()` (the admin-bar source) are hooks: the former drives off core-data selectors (`getPostTypes` + `canUser`), the latter reads the static server-harvested global. Both degrade to an empty list when their source is absent, so the app still renders nothing when there's no authored config, no creatable types, and no harvested nodes.

The spacer between left + right is `<div style={{flex: 1}}/>`. Could be a CSS-only solution via `justify-content: space-between` on the outer Stack, but the explicit spacer makes the two-cluster layout intent obvious.

### Admin-bar harvest (server side)

`WP_Admin_Shell_Chrome_Harvest::harvest_admin_bar()` instantiates a `WP_Admin_Bar`, runs `do_action('admin_bar_menu', $bar)`, and reads `$bar->get_nodes()`. It skip-lists the core nodes the shell already owns first-class (`site-name` → site-hub, `my-account` → user-menu, `new-content`/`+new` → built natively here, plus the logo / search / context-link clusters) — extensible via the `wp_admin_shell_admin_bar_core_node_ids` filter — then folds each surviving plugin node's children into a `children[]` dropdown. Trust: node title HTML is admin-context, the same level at which classic wp-admin renders it; no new exposure inside the already-admin-gated workspace.

## Rebuild guide

Trivial port. Two arrays of action descriptors, render each as an anchor-styled button. The only subtle bit is the **anchor-render pattern** — buttons that need real anchor semantics (middle-click new-tab) must render as `<a>`, not as `<button>` with an onClick + `window.location.href`. Reuse the host framework's link primitive (React Router `Link`, Next `Link`) when the navigation is internal.

## Known limitations

- **No onClick actions.** Authored actions resolve to a URL. Apps that need to dispatch commands (open a modal, trigger a save) must do so through `core:command-palette` or their own app. (Harvested admin-bar leaf nodes likewise only carry hrefs — admin-bar nodes whose original behavior was a JS `onclick` handler surface as a link or a disabled item, since the harvest drops handler strings.)
- **`COMMAND_HREFS` is hard-coded.** Two entries today; adding a new command alias means editing this file.
- **`+New` href ↔ list-route coupling.** The dropdown builds `#/{rest_base}/new`. A CPT whose shell list-screen path differs from its `rest_base` will produce a `+New` link that doesn't match its list screen. Keep `rest_base` and the CPT's list-screen `path` in sync (same constraint `core:simple-editor` documents).
- **Admin-bar node titles render plain text in dropdown toggles.** A node *with children* renders the plain-text title in its toggle (WPDS `DropdownMenu` toggles are name-icon based, not arbitrary-HTML). Leaf nodes render the full title HTML via `TrustedNodeTitle`.
- **No active state.** Toolbar actions don't get `aria-current` — they're outbound links, not nav items.
