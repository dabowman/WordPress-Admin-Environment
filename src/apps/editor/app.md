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

The platform manifest declares `core:dirty-state` + `core:block-navigation-on-dirty`, but the iframe-backed implementation has no read path into the embedded editor's unsaved-state. These declarations are forward-looking — they describe the contract the native mount will honor, not what the iframe does today.

## Rebuild guide

Two questions to answer before rebuilding:

1. **Does the host framework have a native rich-text/block editor?** If yes, use it — iframes are the fall-back, not the goal. The hard cases are pasted-HTML round-trip, link autocomplete that respects the host's URL conventions, image upload integrated with the host's media library, and unsaved-state reporting to whatever NavigationGuard pattern the host uses.
2. **What's the failure mode if the native editor isn't ready?** Match the iframe escape hatch — a clear toolbar, a strip-the-chrome iframe of the legacy editor, and the auto-draft creation flow for new posts. The user gets a working editor today; the native mount lands in a subsequent release.

The auto-draft pattern (POST a draft with seeded empty paragraph, capture id, replace URL) translates directly. The `replaceState` instead of `navigate()` choice matters — using the router would re-evaluate the route and unmount the editor on first render. Any framework's router has the equivalent distinction.

## Known limitations

- **No native dirty-state read.** Iframe can't talk back to the shell. Browser close warnings still fire because the iframed editor itself listens for `beforeunload`.
- **Chrome-hiding is fragile.** Selector list tied to wp-admin class names. Each WordPress release risks regressing the layout.
- **Same-origin only.** Cross-origin iframes can't have CSS injected; the shell silently degrades to "iframe with full wp-admin chrome visible."
- **No deep-link to a block.** Block-level deep linking requires the native mount.
- **History-replace edge case.** If the user immediately hits Back after creating a new post, browser history shows the `/new` URL — `replaceState` doesn't add a new entry. We accept this for the auto-draft flow because the alternative is double-stacking history entries on every new post.
