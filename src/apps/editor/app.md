# core:editor

Prose accompanying `app.json#documentation` for the iframe-backed block editor.

## Overview

EditorApp is the v2-beta concession: rather than embed `@wordpress/edit-post` natively (five known blockers — see `SiteEditorApp.js`'s top-of-file comment), the shell wraps wp-admin's `post.php?post={id}&action=edit` in a chrome-stripped iframe. The user-visible result is a full WordPress block editor inside the shell's content region; the implementation cost is one iframe + ~100 lines of CSS injection + an auto-draft creation flow for new posts.

The iframe escape hatch is documented in CLAUDE.md as "a feature, not a compromise" because the alternative — half-implemented native mount with unresolved preferences-store collisions, command double-registration, hash-router conflicts — would be worse for users than a frame.

## Architecture

Two distinct mount paths share most of the code:

- **Edit existing** (e.g. screen `/posts/{id}/edit`) — the route maps the captured id into `config.id` (the screen config must spell the key `id`, e.g. `"config": { "postType": "post", "id": "{id}" }`); the app reads `config.id`, sets `postId`, and renders the iframe. Spelling the config key `postId` is the silent-spinner trap — `config.id` stays `undefined`, `Number(undefined)` is `NaN`, and the loading guard never clears.
- **Add new** (e.g. screen `/posts/new`, whose config carries only `postType`) — `config.id` is absent, which the app treats as the create flow (alongside the explicit `"new"`/`""` sentinels, mirroring `SimpleEditorApp`). It POSTs to `/wp/v2/{postType}s` with a seeded empty paragraph, captures the returned id, then `history.replaceState`s the URL to the canonical edit route `#/{posts|pages}/{id}/edit` (`history.replaceState`, not `navigate()` — using the router would unmount the app mid-flight; the canonical route also means a post-creation refresh lands on a real screen), then renders the iframe.

CSS injection runs on the iframe's `load` event. The selector list is fragile and tied to wp-admin's class names; expect to rev it after WordPress release upgrades. Cross-origin iframes silently skip the injection (we wrap the document access in try/catch).

### Integration seam with the embedded editor

The iframe runs the real WordPress block editor **plus** the chromeless bridge (`includes/engines/core-desktop/chromeless-bridge.php`, injected for any same-origin iframe-dest admin page). EditorApp wires three parent-side seams to that bridge so the iframe reads as a first-class shell view rather than an opaque frame:

- **Dirty-state.** The manifest's `core:dirty-state` + `core:block-navigation-on-dirty` declarations are now honored. Bridge sub-system 15 subscribes to the iframe's `core/editor` store and relays `isEditedPostDirty()` up as `wp-admin-shell-dirty-state`; EditorApp feeds it into `useDirtyState(regionId, isDirty, { blocksNavigation: true })`. A sidebar click while there are unsaved edits now hits NavigationGuard's confirm instead of silently discarding the edit. The relay is a no-op on any non-editor iframe page (the store-existence guard), and dirty resets to clean whenever a fresh load starts (post switch, in-iframe navigation, re-auth reload).
- **In-iframe navigation.** `installIframeBridge` (the shared, origin- + source-pinned listener `iframe-fallback` also uses) routes in-iframe link clicks: a link mapping to a workspace screen hash-navigates the workspace; an unmapped same-origin wp-admin link (notably the post-trash redirect to `edit.php`) navigates the iframe itself; external links open in a new tab. Without it those clicks fired into the void or broke out of the workspace.
- **Session-expiry recovery.** `onIframeLoad` detects the wp-login form (the iframe swaps to it when the session dies), keeps the loading mask up so the stripped login page never shows, and calls `wp.heartbeat.connectNow()` so the shell-level `wp-auth-check` modal pops immediately. A `heartbeat-tick` listener reloads the frame once `wp-auth-check` flips back true.

Dirty-state, link routing, and the network/auth observability sub-systems all ride the bridge — there is no bespoke per-app `message` handler, so the origin/source security pins live in one audited place.

## Rebuild guide

Two questions to answer before rebuilding:

1. **Does the host framework have a native rich-text/block editor?** If yes, use it — iframes are the fall-back, not the goal. The hard cases are pasted-HTML round-trip, link autocomplete that respects the host's URL conventions, image upload integrated with the host's media library, and unsaved-state reporting to whatever NavigationGuard pattern the host uses.
2. **What's the failure mode if the native editor isn't ready?** Match the iframe escape hatch — a clear toolbar, a strip-the-chrome iframe of the legacy editor, and the auto-draft creation flow for new posts. The user gets a working editor today; the native mount lands in a subsequent release.

The auto-draft pattern (POST a draft with seeded empty paragraph, capture id, replace URL) translates directly. The `replaceState` instead of `navigate()` choice matters — using the router would re-evaluate the route and unmount the editor on first render. Any framework's router has the equivalent distinction.

## Known limitations

- **Dirty-state depends on the bridge.** Unsaved-state reporting is honored via the chromeless bridge's `core/editor` relay (see Integration seam above). If a future change stops shipping bridge sub-system 15, the shell-level guard silently degrades to the iframed editor's own `beforeunload` (full-page exits only; a sidebar click would no longer confirm).
- **Chrome-hiding is fragile.** Selector list tied to wp-admin class names. Each WordPress release risks regressing the layout.
- **Same-origin only.** Cross-origin iframes can't have CSS injected; the shell silently degrades to "iframe with full wp-admin chrome visible."
- **No deep-link to a block.** Block-level deep linking requires the native mount.
- **History-replace edge case.** If the user immediately hits Back after creating a new post, browser history shows the `/new` URL — `replaceState` doesn't add a new entry. We accept this for the auto-draft flow because the alternative is double-stacking history entries on every new post.
