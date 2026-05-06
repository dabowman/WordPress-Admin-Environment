import IframeApp from '../../apps/IframeApp';

/**
 * core:site-editor — v1 ships an iframe-backed adapter pointing at
 * `site-editor.php`. Native mount of `@wordpress/edit-site` is a
 * defined v2 cut per plan §M4 risk mitigation. The four blocking
 * collisions are:
 *
 *   1. Preferences-store namespace conflicts with the shell's prefs UI
 *      (lands as `core:appearance` in M5).
 *   2. Command-palette double-registration — `@wordpress/edit-site`
 *      ships its own command set that re-uses the `core/commands`
 *      store the shell's `core:command-palette` already populates.
 *   3. Full-screen-mode CSS — edit-site applies `body.is-fullscreen-mode`
 *      styles that fight any embedding container.
 *   4. Hash-router conflicts — edit-site's internal hash routing
 *      mutates `window.location.hash`, which collides with the shell's
 *      hash router.
 *
 * Embedding within a region is feasible (Gutenberg's own admin page
 * does it), but resolving the four collisions inflates M4 past the v1
 * timeline. The iframe path keeps every site-editor surface available
 * (templates, parts, navigation, styles) at the cost of a separate
 * document boundary — the same trade-off `core:editor` already makes.
 *
 * Shell authors target `core:site-editor` rather than `iframe:site-editor.php`
 * so v2's native mount lands without touching their admin.json.
 */
export default function SiteEditorApp( props ) {
	const url = props.config?.url || 'site-editor.php';
	return <IframeApp app={ props.app } config={ { url } } />;
}
