/**
 * core:dashboard-host — widget-grid controller (C4).
 *
 * Reads the manifest registry for every app declaring a
 * `dashboardWidget` block, merges admin.json `dashboardWidgets`
 * overrides per-id, and renders each surviving widget as a tile
 * inside a grid container. Each tile mounts the widget app via
 * `<MountedApp>` so the existing 4-layer cap gating + theming +
 * source-cap floor apply uniformly.
 *
 * Why direct render instead of `useDynamicChildren`: the v1 host
 * is config-driven (no drag-to-reorder, no runtime mutation). The
 * `core:dashboard-grid` template still ships with the
 * `core:dynamic-children` platform service for engines that want
 * to drive widget mounts as runtime-mutable child regions; a
 * future engine can replace this host with a compositor that
 * pushes widget regions through the dynamic-children store. The
 * bundled host stays simple.
 *
 * Position handling: explicit `{row, col}` placements set inline
 * `grid-row` / `grid-column` on the tile. `auto` (default) leaves
 * the tile to CSS Grid's auto-flow. Sizes translate to
 * `grid-column: span N` / `grid-row: span N`. Authors who collide
 * positions get last-write-wins via DOM order.
 */

import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { MountedApp } from '../../runtime/regions/mountApp';
import { composeWidgets } from '../../runtime/dashboardGrid/composeWidgets.mjs';
import { useKernel } from '../../runtime/kernel-context';

import './index.css';

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

export default function DashboardHostApp() {
	const { config } = useKernel();

	// `window.wpAdminShell.manifests.apps` is the inline-script snapshot
	// — a single object reference for the page's lifetime. Reading the
	// same reference inside useMemo would still produce a fresh `{}`
	// fallback on every render. Stable-ify both inputs first, then
	// derive the widget list.
	const widgets = useMemo( () => {
		const manifests = window.wpAdminShell?.manifests?.apps || {};
		const overrides = config?.dashboardWidgets || {};
		return composeWidgets( manifests, overrides );
	}, [ config?.dashboardWidgets ] );

	if ( widgets.length === 0 ) {
		return (
			<div className="wp-admin-shell-dashboard-host-empty">
				<p>
					{ __(
						'No dashboard widgets are registered.',
						'wp-admin-shell'
					) }
				</p>
			</div>
		);
	}

	return (
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
							appRef={ widget.id }
							regionId={ `dashboard-widget/${ widget.id }` }
						/>
					</div>
				</div>
			) ) }
		</div>
	);
}
