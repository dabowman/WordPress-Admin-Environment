import { IconButton, Stack } from '@wordpress/ui';

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
 *
 * Each rendered control is an icon-only `IconButton` (WPDS) — its `label` prop
 * doubles as the assistive-tech label and the auto-generated tooltip text, so
 * the MVP `icon`+`label`+`size="compact"` pattern carries straight over.
 */
export default function ToolbarActionsApp( { config = {} } ) {
	const left = Array.isArray( config.left ) ? config.left : [];
	const right = Array.isArray( config.right ) ? config.right : [];

	if ( ! left.length && ! right.length ) {
		return null;
	}

	return (
		<Stack
			direction="row"
			gap="md"
			align="center"
			style={ { flex: 1 } }
		>
			<Stack direction="row" gap="xs">
				{ left.map( ( action, i ) => renderAction( action, `left-${ i }` ) ) }
			</Stack>

			<div style={ { flex: 1 } } />

			<Stack direction="row" gap="xs">
				{ right.map( ( action, i ) => renderAction( action, `right-${ i }` ) ) }
			</Stack>
		</Stack>
	);
}

function renderAction( action, key ) {
	if ( action.external && action.href ) {
		return (
			<IconButton
				key={ key }
				tone="neutral"
				variant="minimal"
				size="compact"
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				href={ action.href }
				target="_blank"
				rel="noopener noreferrer"
			/>
		);
	}

	if ( action.app ) {
		return (
			<IconButton
				key={ key }
				tone="neutral"
				variant="minimal"
				size="compact"
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				onClick={ () => navigate( action.app ) }
			/>
		);
	}

	if ( action.command ) {
		return (
			<IconButton
				key={ key }
				tone="neutral"
				variant="minimal"
				size="compact"
				icon={ resolveIcon( action.icon ) }
				label={ action.label }
				onClick={ () => runBuiltinCommand( action.command ) }
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
