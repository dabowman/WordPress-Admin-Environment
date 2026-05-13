# core:preview-pane

Prose accompanying `app.json#documentation` for the route-following preview pane.

## Overview

PreviewPaneApp is the reference consumer of the **URL-as-coordination** pattern (spec §6.4 / V2.M4). Earlier v1 designs had a shell-level "selection bus" with explicit dispatch + subscribe channels — apps would `selectionBus.set('content', { type: 'post', id: 42 })` and other apps would subscribe. v2 removed it. Region-to-region coordination happens through URL state instead: the editor region writes `/posts/42/edit`; the preview region reads `_self` (or a named slot) and matches it against the routes block.

The result is simpler and survives cross-cutting refresh / deep-link / browser-back semantics for free. The cost is "preview" use-cases need a route pattern that uniquely identifies the previewed entity. For the bundled shells, `post-type` + `post-id` route configs cover it.

## Architecture

`useRoute()` returns `{ primary, params }`. `useKernel()` exposes the routes block (passed via `<KernelProvider>`).

Slot resolution:

- `follow === '_self'` → read `route.primary`.
- Otherwise → read `route.params[follow]`.

`matchRoute(routesBlock, slotValue)` returns the matched route entry + extracted params. If the matched route's `config` has `post-type` + numeric `post-id`, fetch the entity via `useEntityRecord('postType', name, id)`.

Render branches:

- No match → "Select an item to preview." placeholder.
- Match but non-post-shaped → JSON-of-config (debug fallback).
- Post-shaped + resolving → Spinner.
- Post-shaped + resolved + no record → "Item not found."
- Post-shaped + resolved + record → JSON-of-record.

The JSON-of-record render is intentionally crude: this app is a reference implementation. A real preview surface (block rendering, frontend iframe, prose-style metadata) is application-specific and belongs in a custom app.

## Rebuild guide

The pattern is the interesting bit, not the implementation:

1. **Read the URL slot you're following.** `_self` for primary path; named slot for a sibling region's param.
2. **Match the slot value against the route map.** Reuse the kernel's matchRoute or your host's router.
3. **Map matched config to your data layer.** Post-shape today; extend to your entity types as needed.
4. **Render a stable shape across loading / not-found / ready.** Avoid layout jumps as the route resolves.

For a non-`core-data` rebuild, the data adapter changes; everything else stays.

## Known limitations

- **Post-shape only.** Other entities (taxonomy terms, users, comments) fall through to the debug-fallback render.
- **Crude render.** JSON.stringify; not visually useful for end-users. Replace with whatever preview surface is appropriate per app — block render via `@wordpress/block-editor`, iframe preview of the frontend, etc.
- **No edit-to-preview live sync.** When the editor saves, the entity refetches; while editing locally, the preview still shows the last-saved state (because it reads through core-data's record, not the editor's local edits).
- **No multi-route preview composition.** Following a single slot only — can't show two simultaneous previews from different slots in one app.
