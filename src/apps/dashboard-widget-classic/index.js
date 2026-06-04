/**
 * core:dashboard-widget-classic — captured-HTML tile for a bridged classic
 * dashboard widget (#134).
 *
 * The render half of the classic dashboard-widget bridge. The PHP harvest
 * (`WP_Admin_Workspaces_Dashboard_Bridge`) folds un-ported plugin dashboard widgets
 * into the dashboard-host grid as tiles, each mounting THIS app with per-tile
 * `config.widgetId` + `config.title`. The app lazily fetches the widget's
 * rendered HTML from `GET /wp-admin-workspaces/v1/dashboard-widget/{id}` and renders
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
 * existence check gate it), and the workspace only renders it inside the
 * already-admin-gated workspace.
 *
 * **JS-loss limitation + iframe fallback.** Classic widgets frequently rely on
 * enqueued JS / AJAX / inline `<script>` that won't execute when their HTML is
 * injected into the SPA via `dangerouslySetInnerHTML` (React doesn't run
 * injected scripts; the widget's enqueued handles aren't loaded on the workspace
 * page). Such widgets degrade to static HTML. The tile offers a per-tile
 * **iframe fallback** — an "Open classic dashboard" toggle that swaps the
 * captured HTML for an iframe of classic `index.php`. NOTE: classic wp-admin
 * has no single-widget URL, so the iframe loads the **entire** classic
 * dashboard (every widget), not just this tile's widget — but the widget's own
 * enqueued JS runs natively there, so it's the fidelity escape hatch for
 * JS-driven widgets. Same escape-hatch tier as the #128 notices iframe
 * fidelity fallback.
 *
 * This is app-space rendering — the kernel never learns about the bridge.
 */

import { useEffect, useState } from '@wordpress/element';
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
			className="wp-admin-workspaces-classic-widget__html"
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

	useEffect( () => {
		if ( ! widgetId ) {
			setStatus( 'error' );
			return;
		}
		// Per-run flag: the cleanup flips it to false before any stale-response
		// setState can fire, so post-unmount updates are guarded here without a
		// separate mounted ref.
		let active = true;
		setStatus( 'loading' );
		apiFetch( {
			path: `/wp-admin-workspaces/v1/dashboard-widget/${ encodeURIComponent(
				widgetId
			) }`,
		} )
			.then( ( res ) => {
				if ( ! active ) {
					return;
				}
				setHtml( typeof res?.html === 'string' ? res.html : '' );
				setStatus( 'ready' );
			} )
			.catch( () => {
				if ( ! active ) {
					return;
				}
				setStatus( 'error' );
			} );
		return () => {
			active = false;
		};
	}, [ widgetId ] );

	const adminUrl = window.wpAdminWorkspaces?.adminUrl || '/wp-admin/';
	// The ENTIRE classic dashboard, chromeless — wp-admin has no single-widget
	// URL, so this is the whole dashboard, not just this tile's widget. The
	// widget's own enqueued JS runs natively inside the iframe, so it's the
	// fidelity fallback for JS-driven widgets.
	const iframeSrc = `${ adminUrl }index.php?wp_admin_workspaces_chromeless=1`;

	const toggleLabel = useIframe
		? __( 'Show captured view', 'wp-admin-workspaces' )
		: __( 'Open classic dashboard', 'wp-admin-workspaces' );

	return (
		<div className="wp-admin-workspaces-classic-widget">
			<div className="wp-admin-workspaces-classic-widget__toolbar">
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
					className="wp-admin-workspaces-classic-widget__iframe"
					src={ iframeSrc }
					title={
						title ||
						__( 'Classic dashboard', 'wp-admin-workspaces' )
					}
				/>
			) : (
				<div className="wp-admin-workspaces-classic-widget__body">
					{ status === 'loading' && (
						<div className="wp-admin-workspaces-classic-widget__center">
							<Spinner />
						</div>
					) }
					{ status === 'error' && (
						<Stack
							direction="column"
							gap="xs"
							className="wp-admin-workspaces-classic-widget__center"
						>
							<Text variant="body-sm">
								{ __(
									'This widget could not be loaded.',
									'wp-admin-workspaces'
								) }
							</Text>
							<Text variant="body-sm">
								{ __(
									'Try the classic dashboard above.',
									'wp-admin-workspaces'
								) }
							</Text>
						</Stack>
					) }
					{ status === 'ready' &&
						( html ? (
							<CapturedHtml html={ html } />
						) : (
							<div className="wp-admin-workspaces-classic-widget__center">
								<Text variant="body-sm">
									{ __(
										'This widget rendered nothing.',
										'wp-admin-workspaces'
									) }
								</Text>
							</div>
						) ) }
				</div>
			) }
		</div>
	);
}
