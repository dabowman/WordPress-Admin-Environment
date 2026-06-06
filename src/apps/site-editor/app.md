# core:site-editor

Prose accompanying `app.json#documentation` for the Site Editor adapter.

## Overview

SiteEditorApp is a one-line delegation to `IframeApp` pointing at `site-editor.php` — but it ships under its own namespaced id because the **id is the contract**. Workspaces write `core:site-editor` in workspace.json today; when the native `@wordpress/edit-site` mount lands in a v2.x release, the implementation changes behind the same id and no workspace.json migrates.

The native mount is blocked on five known issues (top-of-file comment in `SiteEditorApp.js`). Two of them — preferences-store collision with `core:appearance-preferences` and command-palette double-registration — are workspace-architecture concerns. Two — full-screen CSS and hash-router collision — are edit-site internals fighting the workspace's chrome and routing. One — `@wordpress/edit-site` not being in the dep-extraction `BUNDLED_PACKAGES` list — is a webpack config concern. All five must be resolved before the native mount can land safely.

Until then, the iframe is the path. Users get the WordPress Site Editor with the **wp-admin shell** (admin menu, admin bar, footer) stripped via injected CSS; the experience is "site editor inside a different workspace" rather than "site editor inside wp-admin." The site editor's **own** chrome — hub, navigation sidebar, header — stays intact, so its native browse→edit flow and the user's persisted `core/preferences` view (inspector open, list view open, …) survive. Preview / embed surfaces that want the canvas as a chrome-less decoration opt in with `config.hideEditorChrome: true`, which is the only path that strips the editor's own chrome (see #253).

## Rebuild guide

If you're rebuilding this for a different framework: don't. The Site Editor is a substantial Gutenberg surface area; reimplementing it from scratch would be a project of its own, not a port of this 35-line file. The right move is one of:

- Iframe the legacy `site-editor.php` (this app's pattern).
- Embed `@wordpress/edit-site` directly once the five blockers are resolved.
- Use a separate template/style editor that your design system natively supports (Tailwind config UI, Material theme builder, etc.).

The stable-id pattern is worth preserving: ship the id, defer the implementation. Authors don't have to migrate when you ship the native mount later.

## Known limitations

All limitations are IframeApp's, plus:

- **No Site Editor settings round-trip.** Templates, template parts, global styles changes happen entirely inside the iframe; the workspace can't observe them.
- **Save state is invisible.** The workspace shows no "unsaved changes" indicator; that lives inside the iframed UI.
- **Permalinks may navigate the iframe out from under us.** Site editor has its own routing; clicking a link inside the iframe doesn't update the workspace URL.
