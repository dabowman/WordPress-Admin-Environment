import { useCallback, useMemo } from '@wordpress/element';
import { useCommandLoader } from '@wordpress/commands';
import { __, sprintf } from '@wordpress/i18n';
import { plus } from '@wordpress/icons';

import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';
import { useKernel } from '../kernel-context';
import { getApplications } from '../regions/mountApp';

/**
 * core:command-picker — overlay-region content app.
 *
 * Publishes shell-aware commands to `@wordpress/commands` via the public
 * `useCommandLoader` hook. The actual command palette UI is a portal owned
 * by the commands package; this app is the integration point that feeds it.
 *
 * Migrated 2026-05 from the manual `registerCommand` / `unregisterCommand`
 * dispatch pattern (which thrashed the store on every cascade re-resolve)
 * to the supported hooks. The loader's `commands` array is memoized over
 * the resolved app list, so unchanged cascades produce a referentially
 * stable command set.
 *
 * Renders nothing — the palette UI is mounted by the commands package.
 */
export default function CommandPickerApp() {
	const { config } = useKernel();
	const apps = useMemo( () => getApplications( config ), [ config ] );

	const commands = useMemo( () => {
		const out = [];

		apps
			.filter( ( app ) => ! app.hidden )
			.forEach( ( app ) => {
				out.push( {
					name: `core/admin-shell/goto-${ app.id }`,
					/* translators: %s: application title */
					label: sprintf( __( 'Go to %s', 'wp-admin-shell' ), app.title ),
					icon: resolveIcon( app.icon ),
					callback: ( { close } ) => {
						navigate( app.id );
						close();
					},
				} );
			} );

		apps
			.filter( ( app ) => app.source === 'core:posts' )
			.forEach( ( app ) => {
				const postType = app.config?.postType || 'post';
				const label =
					postType === 'page'
						? __( 'New Page', 'wp-admin-shell' )
						: __( 'New Post', 'wp-admin-shell' );
				out.push( {
					name: `core/admin-shell/new-${ postType }`,
					label,
					icon: resolveIcon( 'plus' ) || plus,
					callback: ( { close } ) => {
						navigate( 'editor', postType, 'new' );
						close();
					},
				} );
			} );

		return out;
	}, [ apps ] );

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
