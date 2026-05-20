# core:command-palette

Prose accompanying `app.json#documentation` for the command palette contributor.

## Overview

CommandPaletteApp is unusual: it renders no UI. The palette itself lives in `@wordpress/commands` (a Gutenberg package that ships a portal-rendered modal with search-as-you-type). This app's job is to **contribute commands** — register a loader with `@wordpress/commands` that turns the shell's `commands[]` + `screens[]` blocks into a flat list of palette entries.

The split keeps responsibilities clean: the palette UI is one thing (and Gutenberg already does it well); the command set is shell-specific (every app, route, action that wants to be commandable). Plugins can register their own commands the same way without touching this app.

The `core:dialog` role + `core:modal` + `core:dismiss-on` platform services are declared **for the conceptual contract**, not because this app renders the modal. The kernel's region wrapper applies the modal treatment when the palette is mounted; the actual dismiss + focus-trap behavior is handled by `@wordpress/commands` internally.

`core:triggerable: true` is a declaration of *eligibility*, not a binding. The actual `Mod+K` flow lives entirely inside `@wordpress/commands` — the package ships its own global keystroke listener via `@wordpress/keyboard-shortcuts` and dispatches `core/commands#open()` directly. The kernel's `triggerStore` is not in the loop. The manifest declaration exists so a host that doesn't use `@wordpress/commands` (a hypothetical alternate-palette engine, or a plugin author wiring a non-Mod+K binding) could route a kernel binding to this app via admin.json's `commands[]` block. Today, on the bundled engines, that path is unused.

## Architecture

`useCommandLoader({ name, hook })` is the contribution API. `hook` returns `{ commands, isLoading }`. The hook is memoized over `commandsBlock` + `screensBlock` so the command set rebuilds only when those references change.

The branching logic lives in `compileCommands.mjs` — a pure-ESM module that turns `(commandsBlock, screensBlock)` into a list of descriptors. `index.js` is the thin React wiring layer that wraps each descriptor's `action` into a `callback({ close })` and hands the result to `useCommandLoader`.

Two sources, processed in order:

1. **`config.commands[]` — labelled first-class entries.** v3 replacement for v2's `bindings` array. Each entry:
   - Must have a `string` `id` (non-empty), a `string` `label` (non-empty), and at least one of `invoke` / `navigate`. Skipped otherwise.
   - Emits a descriptor with `name = 'core/admin-shell/palette-' + encodeURIComponent(id)`.
   - `action` shape: `{ kind: 'invoke', appId }` | `{ kind: 'navigate', path }` | `{ kind: 'compound', invoke, navigate }`. Compound = both fire; invoke runs first; navigate fires only when invoke didn't claim the trigger.
   - Records the entry's `navigate` (if any) in the path-dedup set so a downstream screen entry doesn't double up.

2. **`config.screens[]` — synthesized "Go to X" entries.** Each entry:
   - Must have a `string` `path` (non-empty). Skipped otherwise.
   - `hidden: true` → skipped.
   - Parameterized (`{param}`) or wildcard (`/*`) path → skipped.
   - Path already in dedup set (covered by a `commands[]` entry) → skipped.
   - Emits a descriptor with `name = 'core/admin-shell/palette-' + encodeURIComponent(screenId)` and `action = { kind: 'navigate', path }`.
   - Label: `Go to <screen.label>` (translatable wrapper) or `Go to <path>` when label is missing.

Two dedup layers stack:

- **By path.** A command's `navigate` suppresses a screen sharing that path. Canonical identity is the URL.
- **By emitted name.** The unified `core/admin-shell/palette-<id>` prefix means screen ids and command ids share the namespace. First-write wins on collision — the command from `commands[]` is emitted first, so the screen entry of the same id is suppressed. The check is a real safety net (commands and screens are unrelated authoring surfaces; an id collision is plausible).

React wiring (`index.js`):

- For each descriptor, build a `callback({ close })` that walks the action shape: `invoke` / `compound` → call `trigger(appId)`; if not handled and the action has a `path`, call `navigate(path)`. Both entry points come from the runtime so the palette behaves identically to a keystroke handled by `BindingsConsumer`.
- Per-entry icons resolved through `resolveIcon` (kernel icon registry).

## Rebuild guide

For a host that ships its own command palette (cmdk, kbar, ninja-keys):

- Find the palette's contributor API. Most palettes accept a static array or a hook-style loader.
- Reuse `compileCommands.mjs` directly — it's a pure function with a translator-formatter injection point. Pass your locale-aware formatter and you get back an array of descriptors with a stable `action` discriminated union.
- Map each descriptor's `action` to your host's event model. `invoke` → app trigger; `navigate` → router push.
- Wire keystroke binding to the palette through your host's keybinding system. The shell ships admin.json's `commands[]` block + a kernel-level handler (`BindingsConsumer`); descriptors map 1:1 to keystroke entries.

A rebuild that wants to ship its own palette UI (rather than borrow from a package) should follow the same contributor split — keep this app's job small + composable so multiple sources (commands, screens, plugins) can all add entries.

## Known limitations

- **Parameterized paths excluded.** No "Edit post 42" entry because the palette can't pick `42`. A separate entity-search command source would solve this.
- **i18n leakage.** `commands[].label` + `screens[].label` arrive as raw English strings (locale-agnostic JSON primitive convention). Only the wrapper template `Go to %s` is translated via `__()` at compile time; the substituted label stays in whatever locale the JSON was authored in. Same gap documented for entity-CRUD apps' LABELS tables.
- **No per-command capability gate.** All non-hidden screens become commands; users see entries for screens they can't reach via capability. The router catches the navigation attempt + may render an empty state, but the palette entry itself isn't filtered. `hidden: true` screens DO drop here (a v3 addition).
- **No "recent" or "frequent" ordering.** Commands surface in source-block order (commands first, then screens). A frequency / recency model would need separate state.
- **No iframe-command harvest.** Per the desktop-engine chromeless bridge (`includes/engines/core-desktop/chromeless-bridge.php` sub-system 11), iframed wp-admin screens can postMessage a list of in-page commands up to the parent. This app does NOT yet consume those messages — the bridge sub-system 11 is a stub on the iframe side. A future iteration wires a parent-side listener that converts incoming command lists into additional `useCommandLoader` entries scoped to the active iframe window.
