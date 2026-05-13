# core:command-palette

Prose accompanying `app.json#documentation` for the command palette contributor.

## Overview

CommandPaletteApp is unusual: it renders no UI. The palette itself lives in `@wordpress/commands` (a Gutenberg package that ships a portal-rendered modal with search-as-you-type). This app's job is to **contribute commands** — register a loader with `@wordpress/commands` that turns the shell's routes block into a list of `Go to <pattern>` entries.

The split keeps responsibilities clean: the palette UI is one thing (and Gutenberg already does it well); the command set is shell-specific (every app, route, action that wants to be commandable). Plugins can register their own commands the same way without touching this app.

The `core:dialog` role + `core:modal` + `core:dismiss-on` platform services are declared **for the conceptual contract**, not because this app renders the modal. The kernel's region wrapper applies the modal treatment when the palette is mounted; the actual dismiss + focus-trap behavior is handled by `@wordpress/commands` internally. The manifest declarations let admin.json authors bind keystrokes to the app (`core:triggerable: true` makes that possible).

## Architecture

`useCommandLoader({ name, hook })` is the contribution API. `hook` returns `{ commands, isLoading }`. The hook is memoized over `routes` so the command set rebuilds only when routes change.

Each route becomes one command:

- Skip if `entry.app` is not a string (the route doesn't point at an app).
- Skip if pattern has `{param}` or ends in `/*` (no usable invocation target).
- Build `name = 'core/admin-shell/goto-' + encodeURIComponent(pattern)` — URL-encoding so `/foo-bar` vs `/foo/bar` don't collide.
- Label: `entry.title` if set, otherwise `Go to {pattern}` (translatable).
- Icon: `resolveIcon(entry.icon)` via the kernel icon registry.
- Callback: `({ close }) => { window.location.hash = '#' + pattern; close(); }`.

## Rebuild guide

For a host that ships its own command palette (cmdk, kbar, ninja-keys):

- Find the palette's contributor API. Most palettes accept a static array or a hook-style loader.
- Iterate routes; produce one entry per non-parameterized pattern.
- URL-encode pattern in the entry id so duplicates can't collide.
- Wire keystroke binding to the palette through your host's keybinding system. The shell ships admin.json's `bindings` block + a kernel-level handler.

A rebuild that wants to ship its own palette UI (rather than borrow from a package) should follow the same contributor split — keep this app's job small + composable so multiple sources (routes, apps, plugins) can all add entries.

## Known limitations

- **Parameterized routes excluded.** No "Edit post 42" entry because the palette can't pick `42`. A separate entity-search command source would solve this.
- **Title + icon overrides aren't schema-validated.** The runtime reads them if present, but they're not declared in `admin-v2.json`'s routes block — authors discover them by reading code. A future v2.x schema bump should add them.
- **Hash navigation only.** Commands hard-set `window.location.hash`. A SPA-router rebuild may want to dispatch through the router instead so the navigation respects route guards.
- **No per-command capability gate.** All routes become commands; users see entries for screens they can't reach. The router catches the navigation attempt + may render an empty state, but the palette entry itself isn't filtered.
- **No "recent" or "frequent" ordering.** Commands surface in route-block order. A frequency / recency model would need separate state.
