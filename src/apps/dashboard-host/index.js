/**
 * core:dashboard-host — widget-grid controller (v3 reshape).
 *
 * Reads the current `screens[screenId].apps[]` array, filters to
 * entries with `slot: "grid"`, and renders each as a tile inside a
 * CSS Grid container. Each tile mounts the widget app via
 * `<MountedApp>` so the existing 4-layer cap gating + theming +
 * source-cap floor apply uniformly.
 *
 * v3 vs v2:
 *   - **v2** read manifest `dashboardWidget` blocks + admin.json
 *     `dashboardWidgets` overrides. Both have been retired — the
 *     placement model is now uniform with the rest of the workspace
 *     (screen-app entries with a `slot` field).
 *   - **v3** reads `config.screens[screenId].apps[]` filtered by
 *     `slot === 'grid'`. Per-entry `size` / `position` override the
 *     manifest's `slotHints` defaults.
 *
 * The v3 compiler injects `config.screenId` into the route config
 * before mount, so the host knows which screen it's hosting. v2
 * shells reach this host through the compiler's
 * `synthesize_v2_screens_from_routes` back-compat path.
 *
 * Why direct render instead of `useDynamicChildren`: the host is
 * config-driven (no drag-to-reorder, no runtime mutation). The
 * `core:dashboard-grid` template still ships with the
 * `core:dynamic-children` platform service for engines that want
 * to drive widget mounts as runtime-mutable child regions; a
 * future engine can replace this host with a compositor that
 * pushes widget regions through the dynamic-children store.
 *
 * Position handling: explicit `{row, col}` placements set inline
 * `grid-row` / `grid-column` on the tile. `auto` (default) leaves
 * the tile to CSS Grid's auto-flow. Sizes translate to
 * `grid-column: span N` / `grid-row: span N`. Authors who collide
 * positions get last-write-wins via DOM order.
 */

import { useMemo } from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import { __, sprintf } from '@wordpress/i18n';

import { MountedApp } from '../../runtime/regions/mountApp';
import { composeScreenWidgets } from './composeScreenWidgets.mjs';
import { useKernel } from '../../runtime/kernel-context';

import '../_shared/app.css';
import './index.css';

/**
 * Time-of-day greeting. Folded up from the retired `core:dashboard`
 * monolith — the greeting is host **chrome** (a header above the grid),
 * not a tile (issue #133 design note).
 *
 * @return {string} Localized greeting.
 */
function greetingForNow() {
	const hour = new Date().getHours();
	if ( hour < 12 ) {
		return __( 'Good morning', 'wp-admin-shell' );
	}
	if ( hour < 18 ) {
		return __( 'Good afternoon', 'wp-admin-shell' );
	}
	return __( 'Good evening', 'wp-admin-shell' );
}

function tileStyle( widget ) {
	const style = {};
	const { defaultSize, position } = widget;
	if ( defaultSize.w > 1 ) {
		style.gridColumn = `span ${ defaultSize.w }`;
	}
	if ( defaultSize.h > 1 ) {
		style.gridRow = `span ${ defaultSize.h }`;
	}
	if ( position && typeof position === 'object' ) {
		style.gridRowStart = position.row;
		style.gridColumnStart = position.col;
		// When pinned, span from the explicit start.
		if ( defaultSize.w > 1 ) {
			style.gridColumn = `${ position.col } / span ${ defaultSize.w }`;
			delete style.gridColumnStart;
		}
		if ( defaultSize.h > 1 ) {
			style.gridRow = `${ position.row } / span ${ defaultSize.h }`;
			delete style.gridRowStart;
		}
	}
	return style;
}

/**
 * @param {Object} root0
 * @param {Object} [root0.config] Per-mount config — the v3 compiler injects `screenId`.
 */
export default function DashboardHostApp( { config = {} } = {} ) {
	const { config: kernelConfig } = useKernel();

	const userId = window.wpAdminShell?.userId;
	// `window.wpAdminShell.userId` is always present in practice. When it's
	// falsy, `enabled: false` skips resolution entirely (the established
	// fail-closed idiom — see dashboard-widget-recent-posts/index.js:29,
	// preview-pane, simple-editor). A bare `undefined` id would NOT skip:
	// the resolver defaults the missing key to '' and the request collapses
	// to the /wp/v2/users collection endpoint.
	const { record: user } = useEntityRecord( 'root', 'user', userId, {
		enabled: !! userId,
	} );
	const greeting = useMemo( greetingForNow, [] );
	const displayName = user?.name || user?.first_name || '';
	const heading = displayName
		? sprintf(
				/* translators: 1: greeting, 2: user display name */
				__( '%1$s, %2$s', 'wp-admin-shell' ),
				greeting,
				displayName
		  )
		: greeting;

	const screenId =
		typeof config?.screenId === 'string' && config.screenId !== ''
			? config.screenId
			: '';

	const widgets = useMemo( () => {
		const manifests = window.wpAdminShell?.manifests?.apps || {};
		const screen =
			screenId &&
			kernelConfig?.screens &&
			typeof kernelConfig.screens === 'object'
				? kernelConfig.screens[ screenId ]
				: null;
		return composeScreenWidgets( { screen, manifests } );
	}, [ screenId, kernelConfig?.screens ] );

	return (
		<div className="wp-admin-shell-dashboard wp-admin-shell-app--inset">
			<header className="wp-admin-shell-dashboard__greeting">
				<h1 className="wp-admin-shell-dashboard__greeting-title">
					{ heading }
				</h1>
				<p className="wp-admin-shell-dashboard__greeting-subtitle">
					{ __(
						'Here is a snapshot of your site.',
						'wp-admin-shell'
					) }
				</p>
			</header>

			{ widgets.length === 0 ? (
				<div className="wp-admin-shell-dashboard-host-empty">
					<p>
						{ __(
							'No dashboard widgets are registered.',
							'wp-admin-shell'
						) }
					</p>
				</div>
			) : (
				<div className="wp-admin-shell-dashboard-host">
					{ widgets.map( ( widget ) => (
						<div
							key={ widget.id }
							className="wp-admin-shell-dashboard-tile"
							data-widget-id={ widget.id }
							style={ tileStyle( widget ) }
						>
							<div className="wp-admin-shell-dashboard-tile__header">
								<span className="wp-admin-shell-dashboard-tile__title">
									{ widget.title }
								</span>
							</div>
							<div className="wp-admin-shell-dashboard-tile__body">
								<MountedApp
									appRef={
										widget.config
											? {
													id: widget.appId,
													source: widget.appId,
													config: widget.config,
											  }
											: widget.appId
									}
									regionId={ `dashboard-widget/${ widget.id }` }
								/>
							</div>
						</div>
					) ) }
				</div>
			) }
		</div>
	);
}
