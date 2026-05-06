import IframeApp from './IframeApp';

/**
 * core:site-editor — iframe-backed adapter pointing at `site-editor.php`.
 *
 * Spec §15 names native `@wordpress/edit-site` mount as a v1 deliverable.
 * v2.0.0-beta.1 ships iframe; native mount is deferred to a v2.x cut
 * for these reasons:
 *
 *   1. Preferences-store collision with `core:appearance` — both write
 *      `wp.data.dispatch('core/preferences')` namespaced state and need
 *      a routing rule for which one owns which keys.
 *   2. Command-palette double-registration — `@wordpress/edit-site`
 *      ships its own command set that registers against the
 *      `core/commands` store our `core:command-palette` already
 *      populates. Both sets need to coexist without duplicate ids.
 *   3. Full-screen-mode CSS — edit-site applies `body.is-fullscreen-mode`
 *      styles that fight any embedding container's chrome.
 *   4. Hash-router collision — edit-site's internal hash routing
 *      mutates `window.location.hash`, conflicting with the shell's
 *      v2 router.
 *   5. `@wordpress/edit-site` is not in the dep-extraction
 *      `BUNDLED_PACKAGES` list and isn't a default external; setting
 *      up the global properly + building the editor settings PHP-side
 *      is itself a milestone-sized task.
 *
 * Authors target `core:site-editor` rather than wiring iframe paths
 * directly, so the native-mount path can land in a v2.x release
 * without admin.json changes.
 */
export default function SiteEditorApp( props ) {
	const url = props.config?.url || 'site-editor.php';
	return <IframeApp app={ props.app } config={ { url } } />;
}
