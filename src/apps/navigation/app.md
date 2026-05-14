# core:navigation

Prose accompanying `app.json#documentation` for the sidebar nav app.

## Overview

NavigationApp is the most visually-substantial piece of shell chrome. It reads its tree from `config.items[]` (a v2 admin.json field — there's no shared application catalog anymore; each item self-describes inline) and renders one of two layouts based on `config.collapsed`:

- **Expanded** — a drill-down `SidebarContent` mirroring `@wordpress/edit-site/src/components/sidebar*` structure. Root list renders at first paint; clicking a screen item slides the panel to that sub-screen via CSS keyframes.
- **Collapsed** — a vertical rail of `IconButton`s. Separators render as `<hr>`; group + screen items are flattened (children render inline, no drill-down).

The active item derives from the URL primary path (the `aria-current="true"` attribute is the sole authority — no `.is-active` className) and is recomputed on every route change.

## Architecture

**URL-as-state.** Sub-screen state is `?screen=<id>` in the URL, not `useState`. This is the corollary of the spec §6 / §18 URL-as-state principle: deep-links work, refreshes survive, browser back works. The `navigateScreen(id|null)` helper writes the slot on top of the current primary path, preserving any other params. Multiple sidebars in one shell would collide; namespace later (`?nav-{regionId}-screen=…`) if that lands.

**Capability prune.** `pruneNavItems` walks the tree recursively. An item with a `capability` field that fails `userCan()` is dropped. A screen or group whose pruned children are empty is itself dropped. Orphan separators at the top/bottom of the result are stripped (mid-list separators stay; they may be intentional).

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

- **No multi-sidebar URL slot.** `?screen=` collides if a shell mounts two NavigationApp instances. Namespace later.
- **No nested drill-down.** Drill-down screens cannot themselves contain screen items. A screen's children are flat (with optional groups + separators + external links).
- **No persistent expanded-group state.** Groups (label + children) always render expanded. There's no collapse toggle.
- **Active state is exact-match only.** No prefix-matching for sub-routes (`/posts/123/edit` does not highlight the `/posts` nav item). A future iteration could add `activeWhen: '/posts*'` or similar.
- **No tooltip on collapsed rail.** IconButton accepts `tooltip` but the rail items only set `aria-label`; the visual hint relies on the icon being recognizable.
