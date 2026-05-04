import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	Button,
	InputControl,
	Stack,
	Text,
	Notice,
} from '@wordpress/ui';
import {
	RadioControl,
	SelectControl,
	Spinner,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const DENSITY_OPTIONS = [
	{ value: 'default', label: __( 'Comfortable', 'wp-admin-shell' ) },
	{ value: 'compact', label: __( 'Compact', 'wp-admin-shell' ) },
	{ value: 'spacious', label: __( 'Spacious', 'wp-admin-shell' ) },
];

const ENDPOINT = '/wp-admin-shell/v1/user-prefs';

export default function AppearanceApp( { config = {} } ) {
	const customizable = config.userCustomizable ?? true;
	const allowedFields = Array.isArray( customizable )
		? customizable
		: customizable === true
		? [ 'density', 'accent', 'defaultRoute' ]
		: [];

	const [ prefs, setPrefs ] = useState( null );
	const [ initial, setInitial ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ notice, setNotice ] = useState( null );

	useEffect( () => {
		let cancelled = false;
		apiFetch( { path: ENDPOINT } )
			.then( ( res ) => {
				if ( cancelled ) {
					return;
				}
				const seed = res || {};
				setPrefs( seed );
				setInitial( seed );
			} )
			.catch( () => {
				if ( ! cancelled ) {
					// Endpoint not available yet (lands in M5). Use a local
					// fallback so the UI renders against window state.
					const seed = window.wpAdminShell?.userPrefs || {};
					setPrefs( seed );
					setInitial( seed );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setIsLoading( false );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [] );

	const set = useCallback( ( patch ) => {
		setPrefs( ( p ) => ( { ...( p || {} ), ...patch } ) );
	}, [] );

	const hasEdits = prefs && initial && JSON.stringify( prefs ) !== JSON.stringify( initial );

	const save = async () => {
		setIsSaving( true );
		try {
			await apiFetch( {
				path: ENDPOINT,
				method: 'POST',
				data: prefs,
			} );
			setInitial( prefs );
			setNotice( {
				intent: 'success',
				message: __( 'Preferences saved.', 'wp-admin-shell' ),
			} );
		} catch ( err ) {
			setNotice( {
				intent: 'error',
				message:
					err.message ||
					__( 'Could not save preferences.', 'wp-admin-shell' ),
			} );
		} finally {
			setIsSaving( false );
		}
	};

	if ( isLoading || ! prefs ) {
		return (
			<div className="wp-admin-shell-app-appearance__loading">
				<Spinner />
			</div>
		);
	}

	const allows = ( field ) => allowedFields.includes( field );

	return (
		<div className="wp-admin-shell-app-appearance">
			<Stack direction="column" gap="xl">
				<Stack direction="column" gap="xs">
					<Text variant="heading-xl" render={ <h2 /> }>
						{ __( 'Appearance', 'wp-admin-shell' ) }
					</Text>
					<Text variant="body-md">
						{ __(
							'Personal preferences for this admin shell. Only the options the active shell allows are shown here.',
							'wp-admin-shell'
						) }
					</Text>
				</Stack>

				{ notice && (
					<Notice.Root intent={ notice.intent }>
						<Notice.Description>
							{ notice.message }
						</Notice.Description>
						<Notice.Actions>
							<Notice.CloseIcon
								onClick={ () => setNotice( null ) }
							/>
						</Notice.Actions>
					</Notice.Root>
				) }

				{ allows( 'density' ) && (
					<RadioControl
						label={ __( 'Density', 'wp-admin-shell' ) }
						selected={ prefs.density || 'default' }
						options={ DENSITY_OPTIONS }
						onChange={ ( v ) => set( { density: v } ) }
					/>
				) }

				{ allows( 'accent' ) && (
					<Stack direction="column" gap="xs">
						<InputControl
							label={ __( 'Accent color', 'wp-admin-shell' ) }
							type="color"
							value={ prefs.accent || '#1d4ed8' }
							onChange={ ( e ) =>
								set( { accent: e.target.value } )
							}
						/>
						<Text variant="body-sm">
							{ __(
								'Overrides the shell-defined accent on links and buttons.',
								'wp-admin-shell'
							) }
						</Text>
					</Stack>
				) }

				{ allows( 'defaultRoute' ) && (
					<SelectControl
						label={ __( 'Open on sign-in', 'wp-admin-shell' ) }
						value={ prefs.defaultRoute || '' }
						options={ [
							{
								value: '',
								label: __(
									'Shell default',
									'wp-admin-shell'
								),
							},
							{
								value: 'dashboard',
								label: __( 'Dashboard', 'wp-admin-shell' ),
							},
							{
								value: 'posts',
								label: __( 'Posts', 'wp-admin-shell' ),
							},
							{
								value: 'media',
								label: __( 'Media', 'wp-admin-shell' ),
							},
							{
								value: 'comments',
								label: __( 'Comments', 'wp-admin-shell' ),
							},
						] }
						onChange={ ( v ) => set( { defaultRoute: v } ) }
						__nextHasNoMarginBottom
					/>
				) }

				{ allowedFields.length === 0 && (
					<Text variant="body-md">
						{ __(
							'The active shell does not expose any user-customizable preferences.',
							'wp-admin-shell'
						) }
					</Text>
				) }

				<Divider />

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ save }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save preferences', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
