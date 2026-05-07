import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	Badge,
	Button,
	Card,
	Stack,
	Text,
} from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { update } from '@wordpress/icons';

const ASYNC_TESTS = [
	{ id: 'dotorg-communication', label: __( 'WordPress.org communication', 'wp-admin-shell' ) },
	{ id: 'background-updates', label: __( 'Background updates', 'wp-admin-shell' ) },
	{ id: 'loopback-requests', label: __( 'Loopback requests', 'wp-admin-shell' ) },
	{ id: 'https-status', label: __( 'HTTPS status', 'wp-admin-shell' ) },
	{ id: 'authorization-header', label: __( 'Authorization header', 'wp-admin-shell' ) },
];

const STATUS_TO_INTENT = {
	good: 'success',
	recommended: 'warning',
	critical: 'error',
};

function StatusPill( { status } ) {
	const label =
		{
			good: __( 'Good', 'wp-admin-shell' ),
			recommended: __( 'Recommended', 'wp-admin-shell' ),
			critical: __( 'Critical', 'wp-admin-shell' ),
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
						} );
						setResults( ( prev ) => ( {
							...prev,
							[ t.id ]: res,
						} ) );
					} catch ( err ) {
						setResults( ( prev ) => ( {
							...prev,
							[ t.id ]: {
								status: 'critical',
								label: t.label,
								description: err.message,
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
		<div className="wp-admin-shell-app-site-health">
			<Stack
				direction="row"
				align="center"
				justify="space-between"
				className="wp-admin-shell-app-site-health__toolbar"
			>
				<Stack direction="column" gap="xs">
					<Text variant="heading-md" render={ <h2 /> }>
						{ __( 'Site Health', 'wp-admin-shell' ) }
					</Text>
					<Text variant="body-sm">
						{ counts.good }{ ' ' }
						{ __( 'good', 'wp-admin-shell' ) } ·{ ' ' }
						{ counts.recommended }{ ' ' }
						{ __( 'recommended', 'wp-admin-shell' ) } ·{ ' ' }
						{ counts.critical }{ ' ' }
						{ __( 'critical', 'wp-admin-shell' ) }
					</Text>
				</Stack>
				<Button
					tone="neutral"
					variant="solid"
					icon={ update }
					onClick={ runTests }
					disabled={ isRunning }
					loading={ isRunning }
					size="compact"
				>
					{ __( 'Re-run tests', 'wp-admin-shell' ) }
				</Button>
			</Stack>

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
		</div>
	);
}
