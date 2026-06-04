import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Badge, Button, Card, Icon, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { update } from '@wordpress/icons';
import { Page } from '../_shared/Page';

const ASYNC_TESTS = [
	{
		id: 'dotorg-communication',
		label: __( 'WordPress.org communication', 'wp-admin-workspaces' ),
	},
	{
		id: 'background-updates',
		label: __( 'Background updates', 'wp-admin-workspaces' ),
	},
	{
		id: 'loopback-requests',
		label: __( 'Loopback requests', 'wp-admin-workspaces' ),
	},
	{ id: 'https-status', label: __( 'HTTPS status', 'wp-admin-workspaces' ) },
	{
		id: 'authorization-header',
		label: __( 'Authorization header', 'wp-admin-workspaces' ),
	},
];

const STATUS_TO_INTENT = {
	good: 'success',
	recommended: 'warning',
	critical: 'error',
};

function StatusPill( { status } ) {
	const label =
		{
			good: __( 'Good', 'wp-admin-workspaces' ),
			recommended: __( 'Recommended', 'wp-admin-workspaces' ),
			critical: __( 'Critical', 'wp-admin-workspaces' ),
		}[ status ] || status;
	const intent = STATUS_TO_INTENT[ status ] || 'neutral';
	return <Badge intent={ intent }>{ label }</Badge>;
}

export default function SiteHealthApp() {
	const [ results, setResults ] = useState( {} );
	const [ isRunning, setIsRunning ] = useState( false );
	const [ error, setError ] = useState( null );

	const runTests = useCallback( async () => {
		setIsRunning( true );
		setError( null );
		setResults( {} );
		try {
			await Promise.all(
				ASYNC_TESTS.map( async ( t ) => {
					try {
						const res = await apiFetch( {
							path: `/wp-site-health/v1/tests/${ t.id }`,
							// The authorization-header test probes whether the
							// server strips the Authorization header; classic
							// sends this Basic header so the endpoint can observe
							// it (class-wp-site-health.php:2975). Without it the
							// result is meaningless.
							...( t.id === 'authorization-header' && {
								headers: {
									Authorization: 'Basic dXNlcjpwd2Q=',
								},
							} ),
						} );
						setResults( ( prev ) => ( {
							...prev,
							[ t.id ]: res,
						} ) );
					} catch {
						// Match classic: an unreachable test is a soft
						// "recommended" notice, not a critical failure that
						// tanks the score (site-health.js:333-349).
						setResults( ( prev ) => ( {
							...prev,
							[ t.id ]: {
								status: 'recommended',
								label: __(
									'A test is unavailable',
									'wp-admin-workspaces'
								),
								description: `<p>${ sprintf(
									// translators: %s: the name of the Site Health test.
									__(
										'The “%s” test could not be run.',
										'wp-admin-workspaces'
									),
									t.label
								) }</p>`,
							},
						} ) );
					}
				} )
			);
		} catch ( err ) {
			setError( err.message );
		} finally {
			setIsRunning( false );
		}
	}, [] );

	useEffect( () => {
		runTests();
	}, [ runTests ] );

	const counts = Object.values( results ).reduce(
		( acc, r ) => {
			if ( r?.status && acc[ r.status ] !== undefined ) {
				acc[ r.status ] += 1;
			}
			return acc;
		},
		{ good: 0, recommended: 0, critical: 0 }
	);

	return (
		<Page
			title={ __( 'Site Health', 'wp-admin-workspaces' ) }
			subTitle={
				<>
					{ counts.good } { __( 'good', 'wp-admin-workspaces' ) } ·{ ' ' }
					{ counts.recommended }{ ' ' }
					{ __( 'recommended', 'wp-admin-workspaces' ) } ·{ ' ' }
					{ counts.critical }{ ' ' }
					{ __( 'critical', 'wp-admin-workspaces' ) }
				</>
			}
			actions={
				<Button
					tone="neutral"
					variant="solid"
					onClick={ runTests }
					disabled={ isRunning }
					loading={ isRunning }
					size="compact"
				>
					<Icon icon={ update } size={ 16 } />
					{ __( 'Re-run tests', 'wp-admin-workspaces' ) }
				</Button>
			}
			hasPadding
		>
			{ error && <Text>{ error }</Text> }

			<Stack direction="column" gap="md">
				{ ASYNC_TESTS.map( ( t ) => {
					const res = results[ t.id ];
					return (
						<Card.Root key={ t.id }>
							<Card.Header>
								<Stack
									direction="row"
									justify="space-between"
									align="center"
								>
									<Text variant="body-md">
										<strong>
											{ res?.label || t.label }
										</strong>
									</Text>
									{ res ? (
										<StatusPill status={ res.status } />
									) : (
										<Spinner />
									) }
								</Stack>
							</Card.Header>
							{ res?.description && (
								<Card.Content>
									<div
										// site-health returns trusted HTML.
										// eslint-disable-next-line react/no-danger
										dangerouslySetInnerHTML={ {
											__html: res.description,
										} }
									/>
								</Card.Content>
							) }
						</Card.Root>
					);
				} ) }
			</Stack>
		</Page>
	);
}
