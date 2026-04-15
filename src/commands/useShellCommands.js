import { useEffect } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';
import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';

/**
 * Registers command palette commands from the shell config.
 * Creates "Go to {App}" commands for each non-hidden application,
 * plus "New Post" / "New Page" commands for core:posts applications.
 */
export function useShellCommands( config ) {
	const { registerCommand, unregisterCommand } = useDispatch( commandsStore );

	useEffect( () => {
		const ids = [];

		// "Go to" commands for each non-hidden application.
		config.applications
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

		// "New Post" / "New Page" commands for core:posts applications.
		config.applications
			.filter( ( app ) => app.source === 'core:posts' )
			.forEach( ( app ) => {
				const postType = app.config?.postType || 'post';
				const label =
					postType === 'page' ? 'New Page' : 'New Post';
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
}
