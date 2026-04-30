import { useEffect } from '@wordpress/element';
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

	useEffect( () => {
		const apps = toApplicationList( config.applications );
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
	}, [ config.applications, registerCommand, unregisterCommand ] );

	return null;
}
