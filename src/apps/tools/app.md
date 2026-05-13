# core:tools

Prose accompanying `app.json#documentation` for the tools landing.

## Overview

ToolsApp is a card grid of links. Five tools today: Site Health (native v2 app), Import, Export, Export Personal Data, Erase Personal Data (four legacy wp-admin links). Each card has a title, a sentence-long description, and an Open button that either navigates to a sibling shell app or hard-navigates to wp-admin's classic page.

This is the simplest fully-static app in the shell — no data fetching, no state machine, no async. It exists to give the Tools navigation entry a landing screen instead of a 404.

## Architecture

The `TOOLS` array is module-scope. Each entry has `{ id, title, description, appId | legacy }`. The card click handler branches: `appId` → `navigate(tool.appId)`, `legacy` → `window.location.href = adminUrl(tool.legacy)`.

## Rebuild guide

Trivial port. Card + grid + button primitives are universal; the only project-specific bit is the URL resolution helper for legacy links. Reuse your host's link primitive (React Router `Link`, Next `Link`) instead of `window.location.href` where the navigation is internal — `legacy` links cross out of the shell so plain `<a>` or `window.location.href` is correct.

## Known limitations

- **Plugins can't inject tools.** WordPress core has hooks like `update_management_pages` for plugins to add tool entries; the shell doesn't honor any.
- **Legacy links lose place.** Clicking Import / Export navigates fully out of the shell. The user has to find their way back via browser back or the toolbar.
- **No description-action distinction.** Cards have title + description + Open button; no row-action menu or secondary action.
- **Hard-coded tool list.** Adding a new tool requires editing this file. A `wp_admin_shell_register_tool` filter would be the natural extension.
