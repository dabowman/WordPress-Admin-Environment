import { useEffect, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	Badge,
	Button,
	Card,
	Collapsible,
	Icon,
	Stack,
	Tabs,
	Text,
} from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { __, sprintf } from '@wordpress/i18n';
import { update, chevronDown } from '@wordpress/icons';
import { Page } from '../_shared/Page';

// Fallback async-test list. The app prefers the dynamic registry returned by
// `/wp-admin-workspaces/v1/site-health/tests` (which honors the
// `site_status_tests` filter, so plugin-contributed tests flow through); this
// static list is only used if that endpoint is unreachable.
const FALLBACK_ASYNC_TESTS = [
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

function TestCard( { label, status, description, isLoading } ) {
	return (
		<Card.Root>
			<Card.Header>
				<Stack direction="row" justify="space-between" align="center">
					<Text variant="body-md">
						<strong>{ label }</strong>
					</Text>
					{ isLoading ? (
						<Spinner />
					) : (
						<StatusPill status={ status } />
					) }
				</Stack>
			</Card.Header>
			{ description && (
				<Card.Content>
					<div
						// site-health returns trusted HTML authored by WordPress
						// core or the plugin that registered the test (direct
						// tests run after the `site_status_tests` filter). Same
						// trust model as classic wp-admin, which also renders
						// these descriptions as raw HTML.
						// eslint-disable-next-line react/no-danger
						dangerouslySetInnerHTML={ {
							__html: description,
						} }
					/>
				</Card.Content>
			) }
		</Card.Root>
	);
}

/**
 * The Status tab: direct (synchronous, server-run) tests + async tests run
 * against core's per-id REST routes.
 *
 * @param {Object} root0          Props.
 * @param {*}      root0.runToken Increments to force a re-run.
 */
function StatusTab( { runToken } ) {
	const [ asyncTests, setAsyncTests ] = useState( FALLBACK_ASYNC_TESTS );
	const [ directResults, setDirectResults ] = useState( null );
	const [ results, setResults ] = useState( {} );
	const [ isRunning, setIsRunning ] = useState( false );
	const [ error, setError ] = useState( null );

	const runTests = useCallback( async () => {
		setIsRunning( true );
		setError( null );
		setResults( {} );
		setDirectResults( null );

		// 1. Pull the direct-test results + async registry from the workspace
		//    endpoint. The async registry de-hardcodes the test list.
		let tests = FALLBACK_ASYNC_TESTS;
		try {
			const payload = await apiFetch( {
				path: '/wp-admin-workspaces/v1/site-health/tests',
			} );
			setDirectResults(
				Array.isArray( payload?.direct ) ? payload.direct : []
			);
			if ( Array.isArray( payload?.async ) && payload.async.length ) {
				// Only async tests that have a REST route can be run client-side
				// against `/wp-site-health/v1/tests/{id}`.
				tests = payload.async
					.filter( ( t ) => t.has_rest !== false )
					.map( ( t ) => ( { id: t.id, label: t.label } ) );
				setAsyncTests( tests );
			}
		} catch {
			// Endpoint unavailable (e.g. older build) — fall back to the
			// static list and skip the direct section. Reset `asyncTests`
			// too: a prior successful run may have populated it with a
			// dynamic registry (incl. plugin tests not in the fallback), and
			// `tests` below only runs the fallback set — leaving stale cards
			// with no matching result (perpetual spinner) without this reset.
			setDirectResults( [] );
			setAsyncTests( FALLBACK_ASYNC_TESTS );
		}

		// 2. Run the async tests in parallel against core's REST routes.
		try {
			await Promise.all(
				tests.map( async ( t ) => {
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
	}, [ runTests, runToken ] );

	// Counts span both the direct results and the streamed async results.
	const counts = [
		...( directResults || [] ),
		...Object.values( results ),
	].reduce(
		( acc, r ) => {
			if ( r?.status && acc[ r.status ] !== undefined ) {
				acc[ r.status ] += 1;
			}
			return acc;
		},
		{ good: 0, recommended: 0, critical: 0 }
	);

	return (
		<Stack direction="column" gap="lg">
			<Text variant="body-md">
				{ counts.good } { __( 'good', 'wp-admin-workspaces' ) } ·{ ' ' }
				{ counts.recommended }{ ' ' }
				{ __( 'recommended', 'wp-admin-workspaces' ) } ·{ ' ' }
				{ counts.critical } { __( 'critical', 'wp-admin-workspaces' ) }
				{ isRunning && (
					<>
						{ ' ' }
						<Spinner />
					</>
				) }
			</Text>

			{ error && <Text>{ error }</Text> }

			{ /* Direct (synchronous) tests, run server-side. */ }
			{ directResults && directResults.length > 0 && (
				<Stack direction="column" gap="sm">
					<Text variant="heading-sm" render={ <h2 /> }>
						{ __( 'Direct tests', 'wp-admin-workspaces' ) }
					</Text>
					<Stack direction="column" gap="md">
						{ directResults.map( ( r ) => (
							<TestCard
								key={ r.id }
								label={ r.label || r.id }
								status={ r.status }
								description={ r.description }
							/>
						) ) }
					</Stack>
				</Stack>
			) }

			{ /* Async tests, run against core's per-id REST routes. */ }
			<Stack direction="column" gap="sm">
				<Text variant="heading-sm" render={ <h2 /> }>
					{ __( 'Async tests', 'wp-admin-workspaces' ) }
				</Text>
				<Stack direction="column" gap="md">
					{ asyncTests.map( ( t ) => {
						const res = results[ t.id ];
						return (
							<TestCard
								key={ t.id }
								label={ res?.label || t.label }
								status={ res?.status }
								description={ res?.description }
								isLoading={ ! res }
							/>
						);
					} ) }
				</Stack>
			</Stack>
		</Stack>
	);
}

/**
 * Merge core's async `/wp-site-health/v1/directory-sizes` results into the
 * `wp-paths-sizes` section's fields.
 *
 * `WP_Debug_Data::debug_data()` seeds the directory/database-size rows
 * (`uploads_size` / `themes_size` / `plugins_size` / `wordpress_size` /
 * `database_size` / `total_size`) with a literal "Loading…" placeholder and
 * defers the (slow) disk walk to the separate `directory-sizes` endpoint —
 * exactly as classic `site-health.js` does. Without this merge those rows show
 * "Loading…" forever. The endpoint returns a map keyed by field id, each
 * `{ size, debug, raw }`; we replace the placeholder `value`/`debug` in place.
 *
 * Pure (no I/O) so the merge logic is unit-testable; returns a new sections
 * array, leaving the input untouched.
 *
 * @param {Array}  sections Normalized debug-data sections.
 * @param {Object} sizes    `directory-sizes` response (field-id keyed map).
 * @return {Array} Sections with the size rows filled in.
 */
function mergeDirectorySizes( sections, sizes ) {
	if ( ! sizes || typeof sizes !== 'object' ) {
		return sections;
	}
	return sections.map( ( section ) => {
		if ( section.id !== 'wp-paths-sizes' ) {
			return section;
		}
		return {
			...section,
			fields: section.fields.map( ( field ) => {
				const incoming = sizes[ field.id ];
				if ( ! incoming || typeof incoming !== 'object' ) {
					return field;
				}
				return {
					...field,
					// Core sends `size` (formatted) for display + `debug` for
					// the copy payload. Fall back to whatever's present.
					value:
						incoming.size !== undefined
							? incoming.size
							: field.value,
					debug:
						incoming.debug !== undefined
							? incoming.debug
							: field.debug,
				};
			} ),
		};
	} );
}

/**
 * Build the plain-text clipboard payload from the debug-data sections,
 * OMITTING any field flagged `private` (mirrors core's clipboard format,
 * which excludes private values).
 *
 * @param {Array} sections Normalized debug-data sections.
 * @return {string} Plain-text report.
 */
function formatInfoForClipboard( sections ) {
	const lines = [];
	sections.forEach( ( section ) => {
		lines.push( `### ${ section.label } ###`, '' );
		section.fields.forEach( ( field ) => {
			if ( field.private ) {
				return;
			}
			const value =
				field.debug !== null && field.debug !== undefined
					? field.debug
					: field.value;
			const printable =
				typeof value === 'object'
					? JSON.stringify( value )
					: String( value );
			lines.push( `${ field.label }: ${ printable }` );
		} );
		lines.push( '' );
	} );
	return lines.join( '\n' );
}

function InfoSection( { section } ) {
	return (
		<Collapsible.Root>
			<Card.Root>
				<Collapsible.Trigger
					render={
						<Button
							tone="neutral"
							variant="minimal"
							size="default"
						/>
					}
				>
					<Stack
						direction="row"
						justify="space-between"
						align="center"
						style={ { width: '100%' } }
					>
						<Text variant="body-md">
							<strong>{ section.label }</strong>
						</Text>
						<Icon icon={ chevronDown } size={ 20 } />
					</Stack>
				</Collapsible.Trigger>
				<Collapsible.Panel>
					<Card.Content>
						{ section.description && (
							<Text variant="body-sm">
								{ section.description }
							</Text>
						) }
						<Stack direction="column" gap="xs">
							{ section.fields.map( ( field ) => (
								<Stack
									key={ field.id }
									direction="row"
									gap="sm"
									justify="space-between"
								>
									<Text variant="body-sm">
										<strong>{ field.label }</strong>
									</Text>
									<Text variant="body-sm">
										{ field.private && (
											<Badge intent="neutral">
												{ __(
													'Private',
													'wp-admin-workspaces'
												) }
											</Badge>
										) }{ ' ' }
										{ typeof field.value === 'object'
											? JSON.stringify( field.value )
											: String( field.value ) }
									</Text>
								</Stack>
							) ) }
						</Stack>
					</Card.Content>
				</Collapsible.Panel>
			</Card.Root>
		</Collapsible.Root>
	);
}

/**
 * The Info tab: an accordion over `WP_Debug_Data::debug_data()` sections, with
 * a copy button that omits private fields.
 *
 * @param {Object} root0          Props.
 * @param {*}      root0.runToken Increments to force a re-fetch.
 */
function InfoTab( { runToken } ) {
	const [ sections, setSections ] = useState( null );
	const [ error, setError ] = useState( null );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	useEffect( () => {
		let cancelled = false;
		setSections( null );
		setError( null );
		apiFetch( { path: '/wp-admin-workspaces/v1/site-health/info' } )
			.then( async ( payload ) => {
				if ( cancelled ) {
					return;
				}
				const baseSections = Array.isArray( payload?.sections )
					? payload.sections
					: [];

				// The `wp-paths-sizes` directory/database-size rows ship as a
				// "Loading…" placeholder from `debug_data()`; core fills them
				// from a SEPARATE async endpoint (the disk walk is too slow to
				// run inline). Fetch + merge it so those rows aren't stuck on
				// "Loading…". Resilient: if the endpoint errors or is missing,
				// fall through with the placeholder rows intact.
				let merged = baseSections;
				try {
					const sizes = await apiFetch( {
						path: '/wp-site-health/v1/directory-sizes',
					} );
					if ( cancelled ) {
						return;
					}
					merged = mergeDirectorySizes( baseSections, sizes );
				} catch {
					// Leave the placeholder rows; not fatal to the Info tab.
				}

				if ( ! cancelled ) {
					setSections( merged );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setError(
						err?.message ||
							__(
								'Failed to load site information.',
								'wp-admin-workspaces'
							)
					);
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ runToken ] );

	const onCopy = useCallback( async () => {
		const text = formatInfoForClipboard( sections || [] );
		try {
			// No-clipboard fallback mirrors MediaDetails: navigator.clipboard
			// can be absent (insecure context) or rejected.
			if ( ! navigator.clipboard?.writeText ) {
				throw new Error(
					__(
						'Clipboard is unavailable in this context.',
						'wp-admin-workspaces'
					)
				);
			}
			await navigator.clipboard.writeText( text );
			createSuccessNotice(
				__(
					'Site info copied to clipboard (private fields omitted).',
					'wp-admin-workspaces'
				),
				{ type: 'snackbar' }
			);
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to copy site info.', 'wp-admin-workspaces' ),
				{ type: 'snackbar' }
			);
		}
	}, [ sections, createSuccessNotice, createErrorNotice ] );

	if ( error ) {
		return <Text>{ error }</Text>;
	}

	if ( ! sections ) {
		return (
			<Stack direction="row" justify="center">
				<Spinner />
			</Stack>
		);
	}

	return (
		<Stack direction="column" gap="md">
			<Stack direction="row" justify="flex-end">
				<Button
					tone="neutral"
					variant="solid"
					size="compact"
					onClick={ onCopy }
				>
					{ __( 'Copy site info', 'wp-admin-workspaces' ) }
				</Button>
			</Stack>
			<Stack direction="column" gap="sm">
				{ sections.map( ( section ) => (
					<InfoSection key={ section.id } section={ section } />
				) ) }
			</Stack>
		</Stack>
	);
}

export default function SiteHealthApp() {
	// `runToken` bumps to force the active tab to re-run/re-fetch.
	const [ runToken, setRunToken ] = useState( 0 );
	const [ tab, setTab ] = useState( 'status' );

	return (
		<Page
			title={ __( 'Site Health', 'wp-admin-workspaces' ) }
			actions={
				<Button
					tone="neutral"
					variant="solid"
					onClick={ () => setRunToken( ( n ) => n + 1 ) }
					size="compact"
				>
					<Icon icon={ update } size={ 16 } />
					{ tab === 'status'
						? __( 'Re-run tests', 'wp-admin-workspaces' )
						: __( 'Refresh', 'wp-admin-workspaces' ) }
				</Button>
			}
			hasPadding
		>
			<Tabs.Root value={ tab } onValueChange={ setTab }>
				<Tabs.List>
					<Tabs.Tab value="status">
						{ __( 'Status', 'wp-admin-workspaces' ) }
					</Tabs.Tab>
					<Tabs.Tab value="info">
						{ __( 'Info', 'wp-admin-workspaces' ) }
					</Tabs.Tab>
				</Tabs.List>
				<Tabs.Panel value="status">
					<StatusTab runToken={ runToken } />
				</Tabs.Panel>
				<Tabs.Panel value="info">
					<InfoTab runToken={ runToken } />
				</Tabs.Panel>
			</Tabs.Root>
		</Page>
	);
}
