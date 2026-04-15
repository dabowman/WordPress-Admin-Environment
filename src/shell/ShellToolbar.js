import { useState, useCallback } from '@wordpress/element';
import {
	Button,
	DropdownMenu,
	MenuGroup,
	MenuItem,
	__experimentalHStack as HStack,
	__experimentalSpacer as Spacer,
	__experimentalText as Text,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { check, settings } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';
import { resolveIcon } from '../config/iconMap';
import { navigate } from '../routing/router';

/**
 * Renders the top toolbar from the config's toolbar object.
 */
export function ShellToolbar( { config } ) {
	if ( ! config.layout.toolbar ) {
		return null;
	}

	const shells = window.wpAdminShell.shells || [];
	const currentShell = config.name;

	return (
		<div className="wp-admin-shell-toolbar">
			<HStack alignment="center" spacing={ 2 }>
				<HStack spacing={ 1 } expanded={ false }>
					{ shells.length > 1 && (
						<ShellSwitcher
							shells={ shells }
							currentShell={ currentShell }
						/>
					) }
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

function ShellSwitcher( { shells, currentShell } ) {
	const [ isSwitching, setIsSwitching ] = useState( false );

	const switchShell = useCallback( async ( slug ) => {
		if ( slug === currentShell ) {
			return;
		}
		setIsSwitching( true );
		try {
			await apiFetch( {
				path: '/wp/v2/settings',
				method: 'POST',
				data: { wp_admin_shell_active_config: slug },
			} );
			window.location.reload();
		} catch {
			setIsSwitching( false );
		}
	}, [ currentShell ] );

	const current = shells.find( ( s ) => s.slug === currentShell );

	return (
		<DropdownMenu
			icon={ settings }
			label={ __( 'Switch Shell', 'wp-admin-shell' ) }
			toggleProps={ {
				size: 'compact',
				children: (
					<Text size={ 12 } style={ { marginLeft: 4 } }>
						{ current?.title || currentShell }
					</Text>
				),
				disabled: isSwitching,
			} }
		>
			{ ( { onClose } ) => (
				<MenuGroup label={ __( 'Shell Configuration', 'wp-admin-shell' ) }>
					{ shells.map( ( shell ) => (
						<MenuItem
							key={ shell.slug }
							onClick={ () => {
								switchShell( shell.slug );
							} }
							suffix={
								shell.slug === currentShell ? (
									<span>&#10003;</span>
								) : null
							}
						>
							{ shell.title }
						</MenuItem>
					) ) }
				</MenuGroup>
			) }
		</DropdownMenu>
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
					if ( action.command === 'core/new-post' ) {
						navigate( 'editor', 'post', 'new' );
					} else if ( action.command === 'core/new-page' ) {
						navigate( 'editor', 'page', 'new' );
					}
				} }
				size="compact"
			/>
		);
	}

	return null;
}
