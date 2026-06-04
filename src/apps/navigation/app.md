# core:navigation

Prose accompanying `app.json#documentation` for the sidebar nav app.

## Overview

NavigationApp is the most visually-substantial piece of workspace chrome, and — as of the `menu-renderer` work — a thin **dispatcher**. It reads the resolved `menu` tree from the kernel config (nested entries, screen-bound by the PHP `bind_screens` pass), orders + prunes it once, then hands the shaped tree to whichever renderer the active engine named via its `engine.json` `menu-renderer` field. The field is threaded onto the runtime config by `buildRuntimeConfig`; dispatch resolves the renderer through the kernel menu-renderer registry (`src/runtime/config/menuRendererRegistry.js`).

The active item derives from the URL primary path (the `aria-current="true"` attribute is the sole authority — no `.is-active` className) and is recomputed on every route change, regardless of renderer.

## Renderers

| `menu-renderer` | Renderer | Where it lives |
|-----------------|----------|----------------|
| `sidebar-drilldown` (default) | `_renderers/SidebarDrilldownRenderer.js` — slide-in sub-screens mirroring `@wordpress/edit-site/src/components/sidebar*`; honors `config.collapsed` (icon rail). | bundled with `core:navigation` |
| `sidebar-tree` | `_renderers/SidebarTreeRenderer.js` — expandable in-place tree; branches seed open when their subtree holds the active route. | bundled with `core:navigation` |
| `drawer` | `engines/core-single-pane/DrawerRenderer.js` — collapsible accordion. | the `core:single-pane` **engine** module (self-registers) |
| `none` | renders nothing | — |
| `plugin:{slug}/{name}` | whatever a plugin registers | a third-party plugin |

Built-in + engine-owned renderers register via a direct ESM import (`registerMenuRenderer(id, Component)`) at module load — race-free against the kernel's synchronous mount. A loose plugin renderer registers through `window.wpAdminWorkspaces.registerMenuRenderer` from a script the PHP `wp_admin_workspaces_register_menu_renderer()` entry point enqueues; that path can race the first paint until the kernel ships a published import surface (see `docs/feedback.md`). Every renderer receives `{ items, currentPrimary, navConfig }` and never re-prunes — the host did that once.

The split keeps each engine's renderer *with the engine*: when `core:single-pane` / `core:desktop` are extracted to standalone plugins, their renderers move with them and the bundled dispatcher is untouched. `core:desktop`'s `dock` is the exception — it's rendered by the separate `core:desktop-dock-app`, not via `core:navigation`, so the `menu-renderer: "dock"` declaration is intent-only.

## Architecture

**URL-as-state.** Sub-screen state is `?screen=<id>` in the URL, not `useState`. This is the corollary of the spec §6 / §18 URL-as-state principle: deep-links work, refreshes survive, browser back works. The `navigateScreen(id|null)` helper writes the slot on top of the current primary path, preserving any other params. Multiple sidebars in one workspace would collide; namespace later (`?nav-{regionId}-screen=…`) if that lands.

**Shared pure tree helpers.** Ordering + pruning + the walk helpers live in `src/runtime/menu/menuTree.mjs` — a DS-neutral, `window`-free, node-importable module so every renderer (bundled, engine-owned, plugin) shares one implementation. `pruneMenu( orderTree( rawMenu ), passes )` walks the tree recursively: an item failing the injected `passes` predicate is dropped; a container whose pruned children are empty and that has no own `href` is dropped; orphan separators at the top/bottom are stripped (mid-list separators stay). The host injects `itemPassesPermissions` (which reads `userCan()`); the predicate stays in the app — not the shared module — so the helpers don't pull in `window`.

**Anchor rendering.** Nav items render as `<a>` via the `render` prop on IconButton — Base UI's Button drops `href` silently otherwise. Middle-click new-tab, right-click copy-link, and Cmd-click all work natively. The `target` prop keeps native HTML meaning.

**Active-state contract.** `aria-current="true"` on the matching item. CSS uses `[aria-current="true"]` as the only authority. SidebarNavigationItem does NOT also emit a `.is-active` className — the redundant class would drift when the two get out of sync.

**Edit-site mirroring.** Sidebar internals (BEM class names, drilldown indicator, focus restoration) mirror `@wordpress/edit-site` one-for-one — the package is the structural reference. When porting more pieces, keep the names matching.

## Rebuild guide

A non-WPDS rebuild needs to preserve four invariants:

1. **URL-as-state for drill-down.** Use a query param (`?screen=`, `?subnav=`, etc.) not a useState. Deep-links matter.
2. **Capability prune recursively.** Drop unreachable items + empty containers. Don't render disabled-but-visible items — they confuse the user about what's available.
3. **Render items as `<a>` when href is set.** Native anchor behavior (middle-click, copy-link) is non-negotiable.
4. **Single source for active state.** Pick `aria-current` OR a className — not both.

Beyond those, the design surface is straightforward: a column list with optional drill-down. Tailwind + React Router + a recursive renderer would do the job in ~150 lines.

## Known limitations

- **No multi-sidebar URL slot.** `?screen=` collides if a workspace mounts two NavigationApp instances. Namespace later.
- **No nested drill-down.** Drill-down screens cannot themselves contain screen items. A screen's children are flat (with optional groups + separators + external links).
- **Tree expansion isn't URL state.** `sidebar-tree` / `drawer` expand-state is local `useState` (multiple branches open at once is the tree idiom), seeded from the active route on mount. Unlike drilldown's `?screen=` slot, a route change after mount won't auto-expand a newly-active branch. Acceptable for the multi-open model; revisit if deep-link-after-navigation expansion is needed.
- **No persistent expanded-group state.** Groups (label + children) always render expanded. There's no collapse toggle.
- **Active state is exact-match only.** No prefix-matching for sub-routes (`/posts/123/edit` does not highlight the `/posts` nav item). A future iteration could add `activeWhen: '/posts*'` or similar.
- **No tooltip on collapsed rail.** IconButton accepts `tooltip` but the rail items only set `aria-label`; the visual hint relies on the icon being recognizable.
