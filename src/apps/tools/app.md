# core:tools

Prose accompanying `app.json#documentation` for the tools landing.

## Overview

ToolsApp is a card grid of links. Five tools today: Site Health (native v2 app), Import, Export, Export Personal Data, Erase Personal Data (four classic wp-admin screens). Each card has a title, a sentence-long description, and an Open button that navigates — in-shell, via the router — to the tool's screen. Site Health is a native sibling app; the four classic tools are wrapped as `iframe:` screens in the default shell, so they open inside the workspace chrome rather than reloading out to raw wp-admin.

This is the simplest fully-static app in the shell — no data fetching, no state machine, no async. It exists to give the Tools navigation entry a landing screen instead of a 404.

## Architecture

The `TOOLS` array is module-scope. Each entry has `{ id, title, description, path }`, where `path` is the destination screen's admin.json `path` (e.g. `/tools/import`). The card click handler is uniform: `navigate(tool.path)`. Navigation is always in-shell — the kernel resolves the path to the matching route (a native app or an `iframe:` screen), so no card ever leaves the workspace via `window.location`. `path` must match the resolved route exactly: it is the screen `path`, not the bare screen id, because `navigate()` operates on URL paths.

## Rebuild guide

Trivial port. Card + grid + button primitives are universal. Keep every Open action on the host's in-app navigation primitive (React Router `Link`, Next `Link`, or a `navigate()` equivalent) — there are no cross-shell links here, so plain `window.location.href` is never appropriate.

## Known limitations

- **Plugins can't inject tools.** WordPress core has hooks like `update_management_pages` for plugins to add tool entries; the shell doesn't honor any.
- **Tool paths are coupled to the default shell.** Each card's `path` assumes the default shell's `/tools/*` screen layout. A shell that remounts `core:tools` without those screens would navigate to dead routes (falling back to the default route).
- **No description-action distinction.** Cards have title + description + Open button; no row-action menu or secondary action.
- **Hard-coded tool list.** Adding a new tool requires editing this file. A `wp_admin_workspaces_register_tool` filter would be the natural extension.
