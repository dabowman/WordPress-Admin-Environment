# core:tools

Prose accompanying `app.json#documentation` for the tools landing.

## Overview

ToolsApp is a card grid of links. Five tools today: Site Health (native v2 app), Import, Export, Export Personal Data, Erase Personal Data (four classic wp-admin screens). Each card has a title, a sentence-long description, and an Open button that navigates — in-workspace, via the router — to the tool's screen. Site Health is a native sibling app; the four classic tools are wrapped as `iframe:` screens in the default workspace, so they open inside the workspace chrome rather than reloading out to raw wp-admin.

This is the simplest fully-static app in the workspace — no data fetching, no state machine, no async. It exists to give the Tools navigation entry a landing screen instead of a 404.

## Architecture

The `TOOLS` array is module-scope. Each entry has `{ id, title, description, path }`, where `path` is the destination screen's workspace.json `path` (e.g. `/tools/import`). The card click handler is uniform: `navigate(tool.path)`. Navigation is always in-workspace — the kernel resolves the path to the matching route (a native app or an `iframe:` screen), so no card ever leaves the workspace via `window.location`. `path` must match the resolved route exactly: it is the screen `path`, not the bare screen id, because `navigate()` operates on URL paths.

### Capability filtering

The Tools landing screen is loosely gated (`edit_posts` in the default workspace), but each tool it links to is individually cap-gated — Import needs `import`, Export needs `export`, the privacy tools need `export_others_personal_data` / `erase_others_personal_data`, Site Health needs `view_site_health_checks`. So a user can reach the landing without being able to reach every tool.

The server already prunes screens a user can't reach out of `config.screens` before serializing the client config (`wp_admin_workspaces_prune_config_for_user`), which means a card's target route resolving is exactly equivalent to its screen still being present. Before rendering, `filterReachableTools(TOOLS, window.wpAdminWorkspaces.config.screens)` (pure helper in `filterReachableTools.mjs`) drops any card whose `path` no longer matches a present screen. This hides cards that would otherwise click through to a pruned screen and fall through to the default route — a silent dead route (issue #207). It mirrors how the left-nav is capability-pruned, and stays authoritative for caps **and** roles **and** theme-support gating without re-deriving any of them client-side. When the screens map is absent the helper returns the full list (optimistic render; REST stays the authority). When no tool is reachable the app renders a short "no permission" message instead of the grid.

## Rebuild guide

Trivial port. Card + grid + button primitives are universal. Keep every Open action on the host's in-app navigation primitive (React Router `Link`, Next `Link`, or a `navigate()` equivalent) — there are no cross-workspace links here, so plain `window.location.href` is never appropriate.

## Known limitations

- **Plugins can't inject tools.** WordPress core has hooks like `update_management_pages` for plugins to add tool entries; the workspace doesn't honor any.
- **Tool paths are coupled to the default workspace.** Each card's `path` assumes the default workspace's `/tools/*` screen layout. A workspace that remounts `core:tools` without those screens would navigate to dead routes (falling back to the default route).
- **No description-action distinction.** Cards have title + description + Open button; no row-action menu or secondary action.
- **Hard-coded tool list.** Adding a new tool requires editing this file. A `wp_admin_workspaces_register_tool` filter would be the natural extension.
