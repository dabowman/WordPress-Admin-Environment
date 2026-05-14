# core:toolbar-actions

Prose accompanying `app.json#documentation` for the toolbar action clusters.

## Overview

ToolbarActionsApp is a thin renderer over `config.left[]` + `config.right[]`. Each entry is either a plain link descriptor or a built-in command id translated through a `COMMAND_HREFS` map. The app contributes nothing dynamic — no data fetching, no state — but is bundled separately so shells can mount it once or many times depending on their toolbar layout needs.

The `command` shape exists for back-compat with admin.json v1 — early shells declared `{ command: 'core/new-post' }` and the kernel resolved it. v2 prefers `{ href: '#/posts/new' }` directly; the `command` shape stays as a translation layer.

## Architecture

`renderAction` resolves `href = action.href || COMMAND_HREFS[action.command]`. Missing both → render null (the action silently disappears). External actions add `target="_blank"` + `rel="noopener noreferrer"` to the rendered anchor.

The spacer between left + right is `<div style={{flex: 1}}/>`. Could be a CSS-only solution via `justify-content: space-between` on the outer Stack, but the explicit spacer makes the two-cluster layout intent obvious.

## Rebuild guide

Trivial port. Two arrays of action descriptors, render each as an anchor-styled button. The only subtle bit is the **anchor-render pattern** — buttons that need real anchor semantics (middle-click new-tab) must render as `<a>`, not as `<button>` with an onClick + `window.location.href`. Reuse the host framework's link primitive (React Router `Link`, Next `Link`) when the navigation is internal.

## Known limitations

- **No onClick actions.** Everything resolves to a URL. Apps that need to dispatch commands (open a modal, trigger a save) must do so through `core:command-palette` or their own app.
- **`COMMAND_HREFS` is hard-coded.** Two entries today; adding a new command alias means editing this file.
- **No grouping within a cluster.** The left + right clusters are flat. A future iteration could add `{ group: 'New', items: [...] }` shapes mirroring NavigationApp's pattern.
- **No active state.** Toolbar actions don't get `aria-current` — they're outbound links, not nav items.
