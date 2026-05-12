/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalGrid has no @wordpress/ui 0.12 port. */
import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Button, Card, Stack, Text } from '@wordpress/ui';
import {
	__experimentalGrid as Grid,
	CardMedia,
	Spinner,
	Modal,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { check, external } from '@wordpress/icons';

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

export default function ThemesApp() {
	const themesQuery = useMemo(
		() => ( { context: 'edit', status: 'active,inactive' } ),
		[]
	);
	const { records: themes, isResolving } = useEntityRecords(
		'root',
		'theme',
		themesQuery
	);
	const { invalidateResolution } = useDispatch( coreStore );

	const isLoading = isResolving;
	const [ details, setDetails ] = useState( null );

	const activeStylesheet =
		themes?.find( ( t ) => t.status === 'active' )?.stylesheet ||
		window.wpAdminShell?.activeTheme ||
		null;

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
				invalidateResolution( 'getEntityRecords', [
					'root',
					'theme',
					themesQuery,
				] );
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
		[ invalidateResolution, themesQuery ]
	);

	const sorted = useMemo( () => {
		if ( ! themes ) {
			return [];
		}
		return [ ...themes ].sort( ( a, b ) => {
			if ( a.stylesheet === activeStylesheet ) {
				return -1;
			}
			if ( b.stylesheet === activeStylesheet ) {
				return 1;
			}
			return ( a.name?.rendered || '' ).localeCompare(
				b.name?.rendered || ''
			);
		} );
	}, [ themes, activeStylesheet ] );

	if ( isLoading || ! themes ) {
		return (
			<div className="wp-admin-shell-app-themes__loading">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="wp-admin-shell-app-themes">
			<Stack
				direction="row"
				align="center"
				gap="md"
				className="wp-admin-shell-app-themes__header"
			>
				<Text variant="heading-md" render={ <h2 /> }>
					{ __( 'Themes', 'wp-admin-shell' ) }
				</Text>
				<Text variant="body-sm">
					{ themes.length } { __( 'installed', 'wp-admin-shell' ) }
				</Text>
			</Stack>

			<Grid columns={ 3 } gap={ 4 }>
				{ sorted.map( ( theme ) => {
					const isActive = theme.stylesheet === activeStylesheet;
					const screenshot = theme.screenshot || '';
					return (
						<Card.Root key={ theme.stylesheet }>
							{ screenshot && (
								<CardMedia>
									<img
										src={ screenshot }
										alt={ theme.name?.rendered || '' }
									/>
								</CardMedia>
							) }
							<Card.Content>
								<Stack direction="column" gap="sm">
									<Stack
										direction="row"
										align="center"
										justify="space-between"
									>
										<Text variant="body-md">
											<strong>
												{ theme.name?.rendered }
											</strong>
										</Text>
										{ isActive && (
											<Text variant="body-sm">
												{ __(
													'Active',
													'wp-admin-shell'
												) }
											</Text>
										) }
									</Stack>
									<Text variant="body-sm">
										{ stripTags(
											theme.description?.rendered || ''
										).slice( 0, 140 ) }
									</Text>
								</Stack>
							</Card.Content>
							<Card.Content>
								<Stack
									direction="row"
									justify="space-between"
									align="center"
								>
									<Button
										tone="neutral"
										variant="outline"
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
											tone="brand"
											variant="solid"
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
								</Stack>
							</Card.Content>
						</Card.Root>
					);
				} ) }
			</Grid>

			{ details && (
				<Modal
					title={ details.theme.name?.rendered }
					onRequestClose={ () => setDetails( null ) }
					size="medium"
				>
					<Stack direction="column" gap="md">
						{ details.theme.screenshot && (
							<img
								src={ details.theme.screenshot }
								alt=""
								style={ { maxWidth: '100%' } }
							/>
						) }
						<Text variant="body-md">
							{ stripTags(
								details.theme.description?.rendered || ''
							) }
						</Text>
						<Text variant="body-sm">
							{ __( 'Version', 'wp-admin-shell' ) }:{ ' ' }
							{ details.theme.version } ·{ ' ' }
							{ __( 'Author', 'wp-admin-shell' ) }:{ ' ' }
							{ stripTags(
								details.theme.author?.rendered || ''
							) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							{ details.theme.theme_uri && (
								<Button
									tone="neutral"
									variant="outline"
									icon={ external }
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
									tone="brand"
									variant="solid"
									onClick={ () => activate( details.theme ) }
								>
									{ __( 'Activate', 'wp-admin-shell' ) }
								</Button>
							) }
						</Stack>
					</Stack>
				</Modal>
			) }
		</div>
	);
}
