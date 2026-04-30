import { useEffect, useMemo } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';

import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';
import { useKernel } from '../kernel-context';
import { toApplicationList } from '../regions/mountApp';

/**
 * core:command-picker — overlay-region content app.
 *
 * Registers `Go to {App}` and `New Post / New Page` commands with
 * `@wordpress/commands` based on the resolved shell config. The actual
 * command palette UI is rendered by Gutenberg's command store; this app
 * is the integration point that publishes shell-aware commands.
 *
 * Renders nothing in the DOM — the palette UI is a portal owned by
 * `@wordpress/commands` itself, opened via `Mod+K` or programmatic dispatch.
 */
export default function CommandPickerApp() {
	const { config } = useKernel();
	const { registerCommand, unregisterCommand } = useDispatch( commandsStore );

	const apps = useMemo(
		() => toApplicationList( config.applications ),
		[ config.applications ]
	);

	// Stable signature over the fields that actually drive command output.
	// Cascade re-resolution often hands back a fresh applications array
	// with byte-identical entries; gating the effect on this signature
	// avoids the unregister-then-re-register thrash on every render.
	const commandsKey = useMemo(
		() =>
			apps
				.map( ( a ) =>
					[
						a.id,
						a.hidden ? '1' : '0',
						a.title || '',
						a.icon || '',
						a.source || '',
						a.config?.postType || '',
					].join( '' )
				)
				.join( '' ),
		[ apps ]
	);

	useEffect( () => {
		const ids = [];

		apps
			.filter( ( app ) => ! app.hidden )
			.forEach( ( app ) => {
				const name = `shell/go-to-${ app.id }`;
				ids.push( name );
				registerCommand( {
					name,
					label: `Go to ${ app.title }`,
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
				const label = postType === 'page' ? 'New Page' : 'New Post';
				const name = `shell/new-${ postType }`;
				ids.push( name );
				registerCommand( {
					name,
					label,
					icon: resolveIcon( 'plus' ),
					callback: ( { close } ) => {
						navigate( 'editor', postType, 'new' );
						close();
					},
				} );
			} );

		return () => ids.forEach( ( id ) => unregisterCommand( id ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- apps is intentionally
		// not a dep; commandsKey captures the relevant identity. Re-registering on
		// every fresh array reference would thrash the commands store.
	}, [ commandsKey, registerCommand, unregisterCommand ] );

	return null;
}
