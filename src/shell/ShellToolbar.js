import {
	Button,
	__experimentalHStack as HStack,
	__experimentalSpacer as Spacer,
} from '@wordpress/components';
import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';

/**
 * Renders the top toolbar from the config's toolbar object.
 */
export function ShellToolbar( { config } ) {
	if ( ! config.layout.toolbar ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-toolbar">
			<HStack alignment="center" spacing={ 2 }>
				<HStack spacing={ 1 } expanded={ false }>
					{ config.toolbar.left.map( ( action, i ) =>
						renderToolbarAction( action, `left-${ i }` )
					) }
				</HStack>

				<Spacer />

				<HStack spacing={ 1 } expanded={ false }>
					{ config.toolbar.right.map( ( action, i ) =>
						renderToolbarAction( action, `right-${ i }` )
					) }
				</HStack>
			</HStack>
		</div>
	);
}

function renderToolbarAction( action, key ) {
	if ( action.external && action.href ) {
		return (
			<Button
				key={ key }
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				href={ action.href }
				target="_blank"
				rel="noopener noreferrer"
				size="compact"
			/>
		);
	}

	if ( action.app ) {
		return (
			<Button
				key={ key }
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				onClick={ () => navigate( action.app ) }
				size="compact"
			/>
		);
	}

	if ( action.command ) {
		return (
			<Button
				key={ key }
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				onClick={ () => {
					// Command dispatch will be wired in Step 6.
					// For now, handle the common case directly.
					if ( action.command === 'core/new-post' ) {
						navigate( 'editor', 'post', 'new' );
					}
				} }
				size="compact"
			/>
		);
	}

	return null;
}
