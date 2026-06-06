import IframeApp from '../iframe-fallback';

/**
 * core:site-editor — iframe-backed adapter pointing at `site-editor.php`.
 *
 * Spec §15 names native `@wordpress/edit-site` mount as a v1 deliverable.
 * v2.0.0-beta.1 ships iframe; native mount is deferred to a v2.x cut.
 *
 * Re-validated 2026-06-04 (issue #79) against the current iframe-fallback
 * + chromeless-bridge architecture. **The chromeless bridge mitigates none
 * of these.** The bridge is an iframe↔parent `postMessage` mechanism
 * (`includes/engines/core-desktop/chromeless-bridge.php` + `iframeBridge.mjs`);
 * a native mount removes the iframe entirely, so every blocker below — each
 * about `@wordpress/edit-site` running in the SAME document as the kernel —
 * stays live. The blockers, with re-validated status:
 *
 *   1. Preferences-store collision with `core:appearance-preferences` — both
 *      surface appearance/personalization UI. `@wordpress/edit-site` writes
 *      `wp.data.dispatch('core/preferences')` namespaced state; the workspace
 *      panel persists to its own `/wp-admin-workspaces/v1/user-prefs` store, so
 *      a native mount needs a rule for which surface owns which appearance keys.
 *      (Re-validated; `core:appearance-preferences` uses the custom user-prefs
 *      endpoint, NOT `core/preferences` — the prior "both write core/preferences"
 *      framing was inaccurate.)
 *   2. Command-palette double-registration — `@wordpress/edit-site`
 *      ships its own command set that registers against the
 *      `core/commands` store our `core:command-palette` already
 *      populates. Both sets need to coexist without duplicate ids.
 *      (Still valid.)
 *   3. Full-screen-mode CSS — edit-site applies `body.is-fullscreen-mode`
 *      styles that fight any embedding container's chrome. The iframe
 *      isolates this today; a native mount applies them to the whole
 *      workspace document. (Still valid.)
 *   4. Hash-router collision — edit-site's internal hash routing mutates
 *      `window.location.hash`, conflicting with the workspace's v2 router,
 *      which reads/writes the same slot via `hashchange`
 *      (`src/runtime/routing/router.js`). (Still valid; confirmed in code.)
 *   5. Editor-settings bootstrap. `@wordpress/edit-site` IS a default
 *      external (`wp.editSite`) — it's not in the dep-extraction
 *      `BUNDLED_PACKAGES`, so it externalizes like every other `@wordpress/*`
 *      package. The real gap is the absent script-handle enqueue on
 *      workspace pages + the PHP editor-settings bootstrap
 *      (`get_block_editor_settings` / `block_editor_settings_all`), itself a
 *      milestone-sized task. (Still valid; the "isn't a default external"
 *      framing was the only inaccuracy — corrected here.)
 *
 * Authors target `core:site-editor` rather than wiring iframe paths
 * directly, so the native-mount path can land in a v2.x release
 * without workspace.json changes.
 * @param {*} props
 */
export default function SiteEditorApp( props ) {
	const url = props.config?.url || 'site-editor.php';
	return <IframeApp app={ props.app } config={ { url } } />;
}
