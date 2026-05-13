# core:iframe-fallback

Prose accompanying `app.json#documentation` for the generic iframe wrapper.

## Overview

IframeApp is the escape hatch. Any wp-admin URL — `options-permalink.php`, `import.php`, classic post.php editor, etc. — can be mounted in the shell by passing `config.url` to this app. The wp-admin chrome (admin menu, admin bar, footer, content margins) is hidden by CSS injected into the iframe's document on the `load` event. Cross-origin iframes silently skip the injection; same-origin (the common case for wp-admin pages on the same site) render as if the embedded screen were a native shell view.

This pattern is documented in CLAUDE.md as "a feature, not a compromise." The alternative — reimplementing every wp-admin screen in React + REST — would be a multi-year project. The iframe gives users the right outcome today; native ports land app-by-app as REST coverage expands.

## Architecture

`src` resolution: if `rawUrl` matches `https?://`, pass through; otherwise prepend `adminUrl` (from `window.wpAdminShell.adminUrl`, default `/wp-admin/`).

`onIframeLoad` is the chrome-hide hook. It runs on every iframe load (including in-iframe navigation, which is the case when the user clicks a link inside the embedded screen). Wraps document access in try/catch — cross-origin iframes throw on `contentDocument` access. Style injection appends a `<style>` to the iframe's `<head>`; idempotent in practice because each load creates a fresh document.

`isLoading` is a `useState` flag flipped to `false` on first `load`. The spinner overlays the iframe rather than replacing it — once the iframe has rendered once, subsequent loads (in-iframe navigation) don't flash the spinner.

## Rebuild guide

The pattern translates directly to any host framework that supports iframes (basically all of them). Two implementation choices to make:

- **Chrome injection.** Same-origin iframes can be styled by appending a `<style>` to their head. Selectors must match the embedded page's class names — fragile but worth doing.
- **`src` resolution.** Relative URLs should resolve to whatever your host's admin / dashboard URL is. Externalize the base via a config global so the iframe works in different deployment contexts.

A non-WPDS rebuild needs only a Spinner equivalent — everything else is plain HTML.

## Known limitations

- **CSS selectors are fragile.** Tied to wp-admin's class names; revs with each WordPress release.
- **Cross-origin silent degradation.** Embedded URLs on a different origin can't have chrome hidden. Acceptable for most uses (wp-admin is same-origin) but a third-party-embed use case would break visually.
- **Sandbox attributes not configured.** The iframe has no `sandbox` attribute, so it has full same-origin access. Restricting via sandbox would also break the chrome-injection path; not worth it for the wp-admin use case.
- **No iframe-level dirty-state propagation.** The embedded screen may have unsaved-state semantics (e.g. `options-permalink.php` writing rewrite rules); the shell can't observe them. The iframed screen's own `beforeunload` still fires on browser navigation, just not on intra-shell navigation.
- **Title attribute is set to `app.title`** for screen-reader discoverability, but it's static — embedded page titles don't propagate up.
