import { useState, useEffect } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import apiFetch from '@wordpress/api-fetch';
import {
	Button,
	Stack,
	Text,
	InputControl,
} from '@wordpress/ui';
import {
	RadioControl,
	Spinner,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useKernel } from '../../runtime/kernel-context';

/**
 * core:appearance — user-prefs UI.
 *
 * Reads the active shell's `customizable` declarations off the resolved
 * config and renders only the controls that shell allows. MVP control
 * set: density, accent override, default-route override.
 *
 * Saves go through POST /wp-admin-shell/v1/user-prefs (server deep-merges
 * onto the existing prefs object). The resolver re-runs on the next
 * mount; the cache flush hook on `wp_admin_shell_user_prefs` user-meta
 * updates picks up the change automatically.
 *
 * `customizable` enforcement is server-authoritative — controls hidden
 * here is a UX nicety, not a security boundary.
 */

const PREFS_PATH = '/wp-admin-shell/v1/user-prefs';

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const warnedDeclarations = new WeakSet();

function isCustomizable( declaration, path ) {
	if ( declaration === true ) {
		return true;
	}
	if ( declaration === false || declaration === null || declaration === undefined ) {
		return false;
	}
	if ( Array.isArray( declaration ) ) {
		return declaration.includes( path );
	}
	// Anything else (object, number, etc.) is treated as locked to match
	// the server-side default-deny posture. Surface a dev-mode warn so
	// the author sees the typo instead of wondering why their controls
	// don't render. Production silent.
	if ( IS_DEV && typeof declaration === 'object' && ! warnedDeclarations.has( declaration ) ) {
		warnedDeclarations.add( declaration );
		// eslint-disable-next-line no-console
		console.warn(
			'wp-admin-shell AppearanceApp: malformed customizable declaration; expected boolean | string[]. Got:',
			declaration
		);
	}
	return false;
}

export default function AppearanceApp() {
	const { config } = useKernel();
	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

	const [ prefs, setPrefs ] = useState( null );
	const [ isSaving, setSaving ] = useState( false );

	useEffect( () => {
		apiFetch( { path: PREFS_PATH } )
			.then( ( result ) => setPrefs( result || {} ) )
			.catch( () => setPrefs( {} ) );
	}, [] );

	if ( prefs === null ) {
		return (
			<div className="wp-admin-shell-app-appearance__loading">
				<Spinner />
			</div>
		);
	}

	const stylesDecl = config.styles?.customizable;

	const allowDensity     = isCustomizable( stylesDecl, 'density' );
	const allowAccent      = isCustomizable( stylesDecl, 'color.bg.interactive.brand.strong' )
		|| isCustomizable( stylesDecl, 'branding.accentColor' );
	const allowDefaultRoute = isCustomizable( stylesDecl, 'default-route' );

	const density = prefs.styles?.density || config.styles?.density || 'default';
	const accent  = prefs.styles?.color?.bg?.interactive?.brand?.strong
		|| config.styles?.color?.bg?.interactive?.brand?.strong
		|| '#3858e9';
	const defaultRoute = prefs[ 'default-route' ] || config[ 'default-route' ] || '';

	const save = async ( patch ) => {
		setSaving( true );
		try {
			const next = await apiFetch( {
				path: PREFS_PATH,
				method: 'POST',
				data: patch,
			} );
			setPrefs( next );
			createSuccessNotice( __( 'Appearance saved.', 'wp-admin-shell' ), { type: 'snackbar' } );
		} catch ( err ) {
			createErrorNotice(
				err?.message || __( 'Save failed.', 'wp-admin-shell' ),
				{ isDismissible: true }
			);
		}
		setSaving( false );
	};

	const reset = async () => {
		setSaving( true );
		try {
			await apiFetch( { path: PREFS_PATH, method: 'DELETE' } );
			setPrefs( {} );
			createSuccessNotice( __( 'Appearance reset.', 'wp-admin-shell' ), { type: 'snackbar' } );
		} catch ( err ) {
			createErrorNotice(
				err?.message || __( 'Reset failed.', 'wp-admin-shell' ),
				{ isDismissible: true }
			);
		}
		setSaving( false );
	};

	const noControls = ! allowDensity && ! allowAccent && ! allowDefaultRoute;

	return (
		<div className="wp-admin-shell-app-appearance">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'Appearance', 'wp-admin-shell' ) }
				</Text>

				{ noControls && (
					<Text variant="body-md">
						{ __(
							'The active shell does not expose any user-customizable appearance settings.',
							'wp-admin-shell'
						) }
					</Text>
				) }

				{ allowDensity && (
					<RadioControl
						label={ __( 'Density', 'wp-admin-shell' ) }
						selected={ density }
						options={ [
							{ label: __( 'Default', 'wp-admin-shell' ),     value: 'default' },
							{ label: __( 'Compact', 'wp-admin-shell' ),     value: 'compact' },
							{ label: __( 'Comfortable', 'wp-admin-shell' ), value: 'comfortable' },
						] }
						onChange={ ( val ) => save( { styles: { density: val } } ) }
					/>
				) }

				{ allowAccent && (
					<InputControl
						label={ __( 'Accent color (hex)', 'wp-admin-shell' ) }
						description={ __(
							'Used by the brand surface, focus ring, and compat bridge.',
							'wp-admin-shell'
						) }
						value={ accent }
						onChange={ ( e ) => {
							const val = e.target.value;
							if ( /^#[0-9a-fA-F]{6}$/.test( val ) ) {
								save( {
									styles: {
										color: { bg: { interactive: { brand: { strong: val, 'strong-active': val } } } },
									},
								} );
							}
						} }
					/>
				) }

				{ allowDefaultRoute && (
					<InputControl
						label={ __( 'Default route', 'wp-admin-shell' ) }
						description={ __(
							'Where the shell lands when you open it (e.g. /posts, /media).',
							'wp-admin-shell'
						) }
						value={ defaultRoute }
						onChange={ ( e ) => save( { 'default-route': e.target.value } ) }
					/>
				) }

				<Button
					tone="neutral"
					variant="minimal"
					onClick={ reset }
					disabled={ isSaving }
					loading={ isSaving }
				>
					{ __( 'Reset to shell defaults', 'wp-admin-shell' ) }
				</Button>
			</Stack>
		</div>
	);
}
