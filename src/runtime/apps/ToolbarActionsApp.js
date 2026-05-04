import {
	Button,
	__experimentalHStack as HStack,
	__experimentalSpacer as Spacer,
} from '@wordpress/components';

import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';

/**
 * core:toolbar-actions — renders the toolbar's left and right action clusters.
 *
 * Config shape mirrors the v0 toolbar object (left[], right[]). Each action is
 * one of:
 *   - { app, icon, label }                  — internal nav
 *   - { command, icon, label }              — built-in command (new-post / new-page in v1)
 *   - { href, external, icon, label }       — external link
 */
export default function ToolbarActionsApp( { config = {} } ) {
	const left = Array.isArray( config.left ) ? config.left : [];
	const right = Array.isArray( config.right ) ? config.right : [];

	if ( ! left.length && ! right.length ) {
		return null;
	}

	return (
		<HStack alignment="center" spacing={ 2 } style={ { flex: 1 } }>
			<HStack spacing={ 1 } expanded={ false }>
				{ left.map( ( action, i ) => renderAction( action, `left-${ i }` ) ) }
			</HStack>

			<Spacer />

			<HStack spacing={ 1 } expanded={ false }>
				{ right.map( ( action, i ) => renderAction( action, `right-${ i }` ) ) }
			</HStack>
		</HStack>
	);
}

function renderAction( action, key ) {
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
				onClick={ () => runBuiltinCommand( action.command ) }
				size="compact"
			/>
		);
	}

	return null;
}

function runBuiltinCommand( command ) {
	if ( command === 'core/new-post' ) {
		navigate( 'editor', 'post', 'new' );
	} else if ( command === 'core/new-page' ) {
		navigate( 'editor', 'page', 'new' );
	}
}
