/**
 * Rewrite an `iframe:<slug>` app reference to `core:iframe-fallback` plus a
 * `config.url` carrying the slug.
 *
 * The JS runtime's app resolver only knows `core:*` / `plugin:*` ids;
 * `iframe:<slug>` shorthand (authored in shells, manifests, the classic
 * wp-admin menu bridge) is unified onto the single `core:iframe-fallback`
 * mount path here. Author-supplied `config.url` wins — the rewrite only
 * fills the slot when empty. Idempotent: an already-rewritten entry has no
 * `iframe:` ref left, so a second pass is a no-op.
 *
 * @param {Object} entry A `{ app, config? }` route/app entry.
 * @return {Object} The entry, rewritten when it carried an `iframe:` ref.
 */
export function translateIframeRef( entry ) {
	if ( ! entry || typeof entry !== 'object' ) {
		return entry;
	}
	const app = typeof entry.app === 'string' ? entry.app : '';
	if ( app === '' || ! app.startsWith( 'iframe:' ) ) {
		return entry;
	}
	const slug = app.slice( 'iframe:'.length );
	const config =
		entry.config && typeof entry.config === 'object'
			? { ...entry.config }
			: {};
	if ( config.url === undefined || config.url === '' ) {
		config.url = slug;
	}
	return { ...entry, app: 'core:iframe-fallback', config };
}
