import { useCallback, useMemo } from '@wordpress/element';
import { useCommandLoader } from '@wordpress/commands';
import { __, sprintf } from '@wordpress/i18n';

import { resolveIcon } from '../../runtime/config/iconMap';
import { useKernel } from '../../runtime/kernel-context';

/**
 * core:command-palette — registers shell-aware commands with
 * `@wordpress/commands` so the package's portal palette (Mod+K) can
 * surface them. The palette UI itself is owned by the commands
 * package; this app contributes the command set + does not render UI.
 *
 * Commands are derived from the routes block (`config.routes`). Each
 * route entry becomes a "Go to <pattern>" command. Authors who want
 * richer labels can attach `title` / `icon` to a route entry — those
 * fields aren't in the schema today, but the runtime reads them if
 * present so a future v2.x schema bump can add them without a
 * separate migration.
 */
export default function CommandPaletteApp() {
	const { config } = useKernel();
	const routes =
		config?.routes && typeof config.routes === 'object'
			? config.routes
			: null;

	const commands = useMemo( () => {
		if ( ! routes ) {
			return [];
		}
		const out = [];
		for ( const [ pattern, entry ] of Object.entries( routes ) ) {
			if ( ! entry || typeof entry.app !== 'string' ) {
				continue;
			}
			// Skip patterns with parameter or wildcard segments —
			// "Go to /posts/{id}" isn't a valid invocation; the user
			// can't pick the captured value from a command list.
			if ( pattern.includes( '{' ) || pattern.endsWith( '/*' ) ) {
				continue;
			}
			const label = entry.title
				? entry.title
				: sprintf(
						/* translators: %s: route pattern (e.g. /posts) */
						__( 'Go to %s', 'wp-admin-shell' ),
						pattern
				  );
			// URL-encode the literal pattern so distinct routes (e.g. `/foo-bar`
			// vs `/foo/bar`) produce distinct command names. A naive
			// alphanumeric-only collapse would map both to `foo-bar` and trip
			// `@wordpress/commands` duplicate-name registration.
			out.push( {
				name: `core/admin-shell/goto-${ encodeURIComponent(
					pattern
				) }`,
				label,
				icon: resolveIcon( entry.icon ),
				callback: ( { close } ) => {
					if ( typeof window !== 'undefined' ) {
						window.location.hash = '#' + pattern;
					}
					close();
				},
			} );
		}
		return out;
	}, [ routes ] );

	const hook = useCallback(
		() => ( { commands, isLoading: false } ),
		[ commands ]
	);

	useCommandLoader( {
		name: 'core/admin-shell/apps',
		hook,
	} );

	return null;
}
