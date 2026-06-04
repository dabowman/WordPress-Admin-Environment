# core:user-menu

Prose accompanying `app.json#documentation` for the user menu.

## Overview

UserMenuApp is the avatar dropdown that lives in the toolbar or topbar. Three controls: Profile, optional workspace switcher, Log out. All data sourced from `window.wpAdminWorkspaces.user` + `window.wpAdminWorkspaces.workspaces` — both injected PHP-side at page load. No REST round trip; user identity is fixed for the session.

The workspace switcher is conditional: it surfaces only when more than one `user-switchable` workspace is available. Switching workspaces posts the new active workspace to PHP and reloads the page. Full-reload was chosen over SPA-style live switch because the alternative requires unmounting + remounting the entire kernel (preserving in-flight saves, modal state, etc.) and the trade-off didn't pay back.

## Architecture

Trivial — read user, derive `controls` array, hand to `DropdownMenu`. Each control is `{ title, onClick }`. The workspace switcher loops over `user-switchable` workspaces (reads `window.wpAdminWorkspaces.workspaces[i]['user-switchable']`). `controls` is memoized but the dependency list (`profileUrl, logoutUrl, showWorkspaceSwitcher, switchableWorkspaces`) doesn't change often in practice.

`DropdownMenu` is legacy (`@wordpress/components`) — WPDS 0.12 has no direct port. The Tabs + Popover primitives could compose one, but `DropdownMenu` is more semantic.

## Rebuild guide

A non-WPDS rebuild needs a dropdown menu primitive that:

- Trigger renders user-provided content (avatar `<img>` or fallback icon).
- Items support click handlers (no sub-menu navigation needed for this app).
- Focus trap when open; Esc + outside-click dismiss.

Beyond that, the data wiring is plain JS — read from a config global, derive the items array, render.

## Known limitations

- **No notification surface.** WordPress wp-admin's user dropdown is a single "Howdy, Name" link; the workspace version is richer but doesn't carry update-counts or messages.
- **Avatar `<img>` is plain.** No fallback letter on broken URLs, no Gravatar size optimization, no dark-mode-aware default.
- **`profileUrl` default is naive.** Falls back to `#/profile` regardless of whether the workspace actually mounts a profile app at that route.
- **Workspace switch reloads.** No optimistic UI; the user sees the full-page transition.
- **No "Account settings" or "API tokens".** Single Profile entry covers everything user-related — fine for now, may need expanding when more user-scoped surfaces land.
