import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	Button,
	__experimentalGrid as Grid,
	Card,
	CardBody,
	CardFooter,
	CardMedia,
	Spinner,
	Modal,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { check, external } from '@wordpress/icons';

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

export default function ThemesApp() {
	const [ themes, setThemes ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ activeStylesheet, setActiveStylesheet ] = useState( null );
	const [ details, setDetails ] = useState( null );
	const [ refreshKey, setRefreshKey ] = useState( 0 );

	useEffect( () => {
		let cancelled = false;
		setIsLoading( true );
		Promise.all( [
			apiFetch( { path: '/wp/v2/themes?context=edit&status=active,inactive' } ),
			// stylesheet of the currently active theme; pulled from the
			// shell's bootstrap data with a fallback fetch when missing.
			Promise.resolve( window.wpAdminShell?.activeTheme ).then(
				( v ) =>
					v ??
					apiFetch( { path: '/wp/v2/themes?status=active' } ).then(
						( res ) => res?.[ 0 ]?.stylesheet
					)
			),
		] )
			.then( ( [ list, active ] ) => {
				if ( cancelled ) {
					return;
				}
				setThemes( list );
				setActiveStylesheet( active );
				setError( null );
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setError( err.message || __( 'Failed to load themes.', 'wp-admin-shell' ) );
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
	}, [ refreshKey ] );

	const activate = useCallback(
		async ( theme ) => {
			// REST does not expose theme switching directly. Fall back to a
			// custom endpoint when available, otherwise navigate to wp-admin.
			try {
				await apiFetch( {
					path: '/wp-admin-shell/v1/activate-theme',
					method: 'POST',
					data: { stylesheet: theme.stylesheet },
				} );
				setRefreshKey( ( k ) => k + 1 );
				setDetails( null );
			} catch ( err ) {
				const target =
					( window.wpAdminShell?.adminUrl || '/wp-admin/' ) +
					`themes.php?action=activate&stylesheet=${ encodeURIComponent(
						theme.stylesheet
					) }`;
				window.location.href = target;
			}
		},
		[]
	);

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-themes__error">
				<Text>{ error }</Text>
			</div>
		);
	}

	if ( isLoading || ! themes ) {
		return (
			<div className="wp-admin-shell-app-themes__loading">
				<Spinner />
			</div>
		);
	}

	const sorted = [ ...themes ].sort( ( a, b ) => {
		if ( a.stylesheet === activeStylesheet ) return -1;
		if ( b.stylesheet === activeStylesheet ) return 1;
		return ( a.name?.rendered || '' ).localeCompare( b.name?.rendered || '' );
	} );

	return (
		<div className="wp-admin-shell-app-themes">
			<HStack alignment="left" className="wp-admin-shell-app-themes__header">
				<Text size={ 20 } weight={ 600 }>
					{ __( 'Themes', 'wp-admin-shell' ) }
				</Text>
				<Text variant="muted">
					{ themes.length }{ ' ' }
					{ __( 'installed', 'wp-admin-shell' ) }
				</Text>
			</HStack>

			<Grid columns={ 3 } gap={ 4 }>
				{ sorted.map( ( theme ) => {
					const isActive = theme.stylesheet === activeStylesheet;
					const screenshot = theme.screenshot || '';
					return (
						<Card key={ theme.stylesheet }>
							{ screenshot && (
								<CardMedia>
									<img
										src={ screenshot }
										alt={ theme.name?.rendered || '' }
									/>
								</CardMedia>
							) }
							<CardBody>
								<VStack spacing={ 2 }>
									<HStack
										alignment="left"
										justify="space-between"
									>
										<Text weight={ 600 }>
											{ theme.name?.rendered }
										</Text>
										{ isActive && (
											<Text variant="muted" size={ 12 }>
												{ __(
													'Active',
													'wp-admin-shell'
												) }
											</Text>
										) }
									</HStack>
									<Text variant="muted" size={ 12 }>
										{ stripTags(
											theme.description?.rendered || ''
										).slice( 0, 140 ) }
									</Text>
								</VStack>
							</CardBody>
							<CardFooter>
								<HStack justify="space-between">
									<Button
										variant="tertiary"
										size="compact"
										onClick={ () =>
											setDetails( {
												theme,
												isActive,
											} )
										}
									>
										{ __( 'Details', 'wp-admin-shell' ) }
									</Button>
									{ ! isActive && (
										<Button
											variant="primary"
											size="compact"
											icon={ check }
											onClick={ () => activate( theme ) }
										>
											{ __(
												'Activate',
												'wp-admin-shell'
											) }
										</Button>
									) }
								</HStack>
							</CardFooter>
						</Card>
					);
				} ) }
			</Grid>

			{ details && (
				<Modal
					title={ details.theme.name?.rendered }
					onRequestClose={ () => setDetails( null ) }
					size="medium"
				>
					<VStack spacing={ 3 }>
						{ details.theme.screenshot && (
							<img
								src={ details.theme.screenshot }
								alt=""
								style={ { maxWidth: '100%' } }
							/>
						) }
						<Text>
							{ stripTags(
								details.theme.description?.rendered || ''
							) }
						</Text>
						<Text variant="muted" size={ 12 }>
							{ __( 'Version', 'wp-admin-shell' ) }:{ ' ' }
							{ details.theme.version } ·{ ' ' }
							{ __( 'Author', 'wp-admin-shell' ) }:{ ' ' }
							{ stripTags( details.theme.author?.rendered || '' ) }
						</Text>
						<HStack justify="right">
							{ details.theme.theme_uri && (
								<Button
									icon={ external }
									variant="tertiary"
									onClick={ () =>
										window.open(
											details.theme.theme_uri,
											'_blank'
										)
									}
								>
									{ __( 'Theme site', 'wp-admin-shell' ) }
								</Button>
							) }
							{ ! details.isActive && (
								<Button
									variant="primary"
									onClick={ () => activate( details.theme ) }
								>
									{ __( 'Activate', 'wp-admin-shell' ) }
								</Button>
							) }
						</HStack>
					</VStack>
				</Modal>
			) }
		</div>
	);
}
