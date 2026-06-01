/**
 * core:dashboard-widget-classic — captured-HTML tile for a bridged classic
 * dashboard widget (#134).
 *
 * The render half of the classic dashboard-widget bridge. The PHP harvest
 * (`WP_Admin_Shell_Dashboard_Bridge`) folds un-ported plugin dashboard widgets
 * into the dashboard-host grid as tiles, each mounting THIS app with per-tile
 * `config.widgetId` + `config.title`. The app lazily fetches the widget's
 * rendered HTML from `GET /wp-admin-shell/v1/dashboard-widget/{id}` and renders
 * it at admin trust.
 *
 * **Lazy.** The fetch runs per-tile (on mount), so a slow plugin widget
 * (remote feed, heavy query) doesn't block the grid — the tile paints a
 * Spinner and fills in when its own request resolves.
 *
 * **Trust.** The captured HTML is admin-context — identical to what classic
 * wp-admin echoes for the same widget — and rendered via
 * `dangerouslySetInnerHTML`. Same author-trust boundary as the #128 notices
 * buffer / `TrustedNodeTitle`. The endpoint only ever returns HTML for a
 * widget the dashboard registered for this request (the bridge skip-list +
 * existence check gate it), and the shell only renders it inside the
 * already-admin-gated workspace.
 *
 * **JS-loss limitation + iframe fallback.** Classic widgets frequently rely on
 * enqueued JS / AJAX / inline `<script>` that won't execute when their HTML is
 * injected into the SPA via `dangerouslySetInnerHTML` (React doesn't run
 * injected scripts; the widget's enqueued handles aren't loaded on the shell
 * page). Such widgets degrade to static HTML. The tile offers a per-tile
 * **iframe fallback** — a "Open classic view" toggle that swaps the captured
 * HTML for an iframe of classic `index.php` (the full dashboard, chrome
 * hidden), where the widget's own JS runs natively. This is the same
 * escape-hatch tier as the #128 notices iframe fidelity fallback.
 *
 * This is app-space rendering — the kernel never learns about the bridge.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Stack, Text, Button } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import './index.css';

/**
 * Render the captured HTML at admin trust. Memoized on the html string so
 * React doesn't re-parse on unrelated re-renders.
 *
 * @param {Object} root0
 * @param {string} root0.html Admin-context captured widget HTML.
 * @return {JSX.Element} The injected-HTML container.
 */
function CapturedHtml( { html } ) {
	return (
		<div
			className="wp-admin-shell-classic-widget__html"
			// Admin-context HTML — same trust as classic wp-admin. See the
			// module docblock + the #128 notices-banner precedent.
			// eslint-disable-next-line react/no-danger
			dangerouslySetInnerHTML={ { __html: html } }
		/>
	);
}

/**
 * @param {Object} root0
 * @param {Object} [root0.config] Per-mount config — the bridge injects
 *                                `widgetId` (classic meta-box id) + `title`.
 * @return {JSX.Element} The classic-widget tile.
 */
export default function DashboardWidgetClassicApp( { config = {} } = {} ) {
	const widgetId =
		typeof config?.widgetId === 'string' ? config.widgetId : '';
	const title = typeof config?.title === 'string' ? config.title : '';

	const [ html, setHtml ] = useState( null );
	const [ status, setStatus ] = useState( 'loading' ); // loading | ready | error
	const [ useIframe, setUseIframe ] = useState( false );
	const isMounted = useRef( true );

	useEffect( () => {
		isMounted.current = true;
		return () => {
			isMounted.current = false;
		};
	}, [] );

	useEffect( () => {
		if ( ! widgetId ) {
			setStatus( 'error' );
			return;
		}
		let active = true;
		setStatus( 'loading' );
		apiFetch( {
			path: `/wp-admin-shell/v1/dashboard-widget/${ encodeURIComponent(
				widgetId
			) }`,
		} )
			.then( ( res ) => {
				if ( ! active || ! isMounted.current ) {
					return;
				}
				setHtml( typeof res?.html === 'string' ? res.html : '' );
				setStatus( 'ready' );
			} )
			.catch( () => {
				if ( ! active || ! isMounted.current ) {
					return;
				}
				setStatus( 'error' );
			} );
		return () => {
			active = false;
		};
	}, [ widgetId ] );

	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	// Classic dashboard, chromeless. The bridge widget's own enqueued JS runs
	// natively inside the iframe — the fidelity fallback for JS-driven widgets.
	const iframeSrc = `${ adminUrl }index.php?wp_admin_shell_chromeless=1`;

	const toggleLabel = useIframe
		? __( 'Show captured view', 'wp-admin-shell' )
		: __( 'Open classic view', 'wp-admin-shell' );

	return (
		<div className="wp-admin-shell-classic-widget">
			<div className="wp-admin-shell-classic-widget__toolbar">
				<Button
					variant="minimal"
					size="small"
					onClick={ () => setUseIframe( ( v ) => ! v ) }
				>
					{ toggleLabel }
				</Button>
			</div>

			{ useIframe ? (
				<iframe
					className="wp-admin-shell-classic-widget__iframe"
					src={ iframeSrc }
					title={
						title || __( 'Classic dashboard', 'wp-admin-shell' )
					}
				/>
			) : (
				<div className="wp-admin-shell-classic-widget__body">
					{ status === 'loading' && (
						<div className="wp-admin-shell-classic-widget__center">
							<Spinner />
						</div>
					) }
					{ status === 'error' && (
						<Stack
							direction="column"
							gap="xs"
							className="wp-admin-shell-classic-widget__center"
						>
							<Text variant="body-sm">
								{ __(
									'This widget could not be loaded.',
									'wp-admin-shell'
								) }
							</Text>
							<Text variant="body-sm">
								{ __(
									'Try the classic view above.',
									'wp-admin-shell'
								) }
							</Text>
						</Stack>
					) }
					{ status === 'ready' &&
						( html ? (
							<CapturedHtml html={ html } />
						) : (
							<div className="wp-admin-shell-classic-widget__center">
								<Text variant="body-sm">
									{ __(
										'This widget rendered nothing.',
										'wp-admin-shell'
									) }
								</Text>
							</div>
						) ) }
				</div>
			) }
		</div>
	);
}
