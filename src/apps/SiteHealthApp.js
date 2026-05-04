import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	Button,
	Card,
	CardBody,
	CardHeader,
	Spinner,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
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
	const colors = {
		good: { bg: '#d1fae5', fg: '#065f46' },
		recommended: { bg: '#fef3c7', fg: '#92400e' },
		critical: { bg: '#fee2e2', fg: '#991b1b' },
	}[ status ] || { bg: '#e5e7eb', fg: '#111827' };
	return (
		<span
			style={ {
				display: 'inline-block',
				background: colors.bg,
				color: colors.fg,
				padding: '2px 8px',
				borderRadius: '4px',
				fontSize: '12px',
				fontWeight: 600,
			} }
		>
			{ label }
		</span>
	);
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
			<HStack
				className="wp-admin-shell-app-site-health__toolbar"
				alignment="center"
			>
				<VStack spacing={ 1 }>
					<Text size={ 20 } weight={ 600 }>
						{ __( 'Site Health', 'wp-admin-shell' ) }
					</Text>
					<Text variant="muted" size={ 12 }>
						{ counts.good }{ ' ' }
						{ __( 'good', 'wp-admin-shell' ) } ·{ ' ' }
						{ counts.recommended }{ ' ' }
						{ __( 'recommended', 'wp-admin-shell' ) } ·{ ' ' }
						{ counts.critical }{ ' ' }
						{ __( 'critical', 'wp-admin-shell' ) }
					</Text>
				</VStack>
				<Button
					variant="secondary"
					icon={ update }
					onClick={ runTests }
					disabled={ isRunning }
					isBusy={ isRunning }
					size="compact"
				>
					{ __( 'Re-run tests', 'wp-admin-shell' ) }
				</Button>
			</HStack>

			{ error && (
				<Text>{ error }</Text>
			) }

			<VStack spacing={ 3 }>
				{ ASYNC_TESTS.map( ( t ) => {
					const res = results[ t.id ];
					return (
						<Card key={ t.id }>
							<CardHeader>
								<HStack
									alignment="left"
									justify="space-between"
								>
									<Text weight={ 600 }>
										{ res?.label || t.label }
									</Text>
									{ res ? (
										<StatusPill status={ res.status } />
									) : (
										<Spinner />
									) }
								</HStack>
							</CardHeader>
							{ res?.description && (
								<CardBody>
									<div
										// site-health returns trusted HTML.
										// eslint-disable-next-line react/no-danger
										dangerouslySetInnerHTML={ {
											__html: res.description,
										} }
									/>
								</CardBody>
							) }
						</Card>
					);
				} ) }
			</VStack>
		</div>
	);
}
