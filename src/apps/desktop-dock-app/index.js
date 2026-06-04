/**
 * core:desktop-dock-app — dock host (P2.T3).
 *
 * Thin shell around the dock-rail registry — looks up the active
 * renderer by name (defaults to `'default'`) and renders it with the
 * shared prop bundle. The bundled `default` renderer paints two
 * groups: launcher tiles + live-window tiles.
 *
 * Plugin authors register alternate renderers via
 * `registerDockRailRenderer( name, Component )` and point a shell's
 * `regions.dock.config.renderer` at the registered name. The renderer
 * owns the visual treatment entirely — the host just hands it
 * `{ items, stack, routes, manager }`.
 */

import { Icon } from '@wordpress/icons';

import { useKernel } from '../../runtime/kernel-context';
import {
	useWindowManager,
	useWindowStack,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';
import { getAppWindowBlock } from '../../runtime/engines/core-desktop/windowing/appWindowBlock';
import {
	getDockRailRenderer,
	registerDockRailRenderer,
} from '../../runtime/engines/core-desktop/windowing/dockRailRegistry';
import { resolveIcon } from '../../runtime/config/iconMap';

function resolveDockItem( item, routes ) {
	if ( item && typeof item.app === 'string' && item.app ) {
		return {
			app: item.app,
			config: item.config || {},
			title: item.label || item.app,
		};
	}
	if ( item && typeof item.href === 'string' && routes ) {
		const path = item.href.startsWith( '#' )
			? item.href.slice( 1 )
			: item.href;
		const route = routes[ path ];
		if ( route && typeof route.app === 'string' ) {
			return {
				app: route.app,
				config: route.config || {},
				title: item.label || route.app,
			};
		}
	}
	return null;
}

function appIconName( appId, items, routes ) {
	for ( const item of items ) {
		const resolved = resolveDockItem( item, routes );
		if ( resolved && resolved.app === appId && item.icon ) {
			return item.icon;
		}
	}
	const block = getAppWindowBlock( appId );
	return block.icon || null;
}

/**
 * Bundled `'default'` renderer — launcher tiles + live-window tiles.
 *
 * @param {Object} root0
 * @param {*}      root0.items   Launcher items from the region config.
 * @param {*}      root0.stack   Live window stack.
 * @param {*}      root0.routes  Resolved routes map.
 * @param {*}      root0.manager WindowManager dispatcher.
 */
function DefaultDockRailRenderer( { items, stack, routes, manager } ) {
	const topZ = stack.reduce( ( m, w ) => Math.max( m, w.zIndex ), 0 );

	return (
		<div
			className="wp-admin-workspaces-desktop-dock"
			aria-label="Application dock"
		>
			{ items.length > 0 && (
				<ul
					className="wp-admin-workspaces-desktop-dock__group wp-admin-workspaces-desktop-dock__group--launchers"
					aria-label="Launchers"
				>
					{ items.map( ( item, idx ) => {
						const resolved = resolveDockItem( item, routes );
						const label =
							item.label || resolved?.app || `Item ${ idx }`;
						const iconData = item.icon
							? resolveIcon( item.icon )
							: null;
						const onClick = () => {
							if ( ! resolved ) {
								return;
							}
							const block = getAppWindowBlock( resolved.app );
							if ( ! block.multiInstance ) {
								const existing = stack.find(
									( w ) => w.app === resolved.app
								);
								if ( existing ) {
									manager.focusWindow( existing.id );
									return;
								}
							}
							manager.openWindow( {
								app: resolved.app,
								config: resolved.config,
								title: resolved.title,
								size: block.defaultSize,
							} );
						};
						return (
							<li
								key={ idx }
								className="wp-admin-workspaces-desktop-dock__item"
							>
								<button
									type="button"
									className="wp-admin-workspaces-desktop-dock__tile"
									onClick={ onClick }
									disabled={ ! resolved }
									aria-label={ label }
									title={ label }
								>
									{ iconData && (
										<span
											aria-hidden="true"
											className="wp-admin-workspaces-desktop-dock__icon"
										>
											<Icon
												icon={ iconData }
												size={ 24 }
											/>
										</span>
									) }
									<span className="wp-admin-workspaces-desktop-dock__label">
										{ label }
									</span>
								</button>
							</li>
						);
					} ) }
				</ul>
			) }

			{ stack.length > 0 && (
				<>
					{ items.length > 0 && (
						<div
							className="wp-admin-workspaces-desktop-dock__separator"
							aria-hidden="true"
						/>
					) }
					<ul
						className="wp-admin-workspaces-desktop-dock__group wp-admin-workspaces-desktop-dock__group--windows"
						aria-label="Open windows"
					>
						{ stack.map( ( win ) => {
							const iconName = appIconName(
								win.app,
								items,
								routes
							);
							const iconData = iconName
								? resolveIcon( iconName )
								: null;
							const onClick = () => manager.focusWindow( win.id );
							const isActive =
								win.state !== 'minimized' &&
								win.zIndex === topZ;
							const stateLabel =
								win.state === 'minimized'
									? `${ win.title } (minimized)`
									: win.title;
							return (
								<li
									key={ win.id }
									className="wp-admin-workspaces-desktop-dock__item"
								>
									<button
										type="button"
										className="wp-admin-workspaces-desktop-dock__tile wp-admin-workspaces-desktop-dock__tile--window"
										data-state={ win.state }
										data-active={ isActive }
										onClick={ onClick }
										aria-label={ stateLabel }
										aria-pressed={ isActive }
										title={ stateLabel }
									>
										{ iconData && (
											<span
												aria-hidden="true"
												className="wp-admin-workspaces-desktop-dock__icon"
											>
												<Icon
													icon={ iconData }
													size={ 24 }
												/>
											</span>
										) }
										<span className="wp-admin-workspaces-desktop-dock__label">
											{ win.title }
										</span>
										<span
											aria-hidden="true"
											className="wp-admin-workspaces-desktop-dock__indicator"
										/>
									</button>
								</li>
							);
						} ) }
					</ul>
				</>
			) }
		</div>
	);
}

// Register the bundled default at module-load so a shell using
// `regions.dock.config.renderer = 'default'` (or omitting the field)
// resolves the right component.
registerDockRailRenderer( 'default', DefaultDockRailRenderer );

/**
 * @param {Object} root0
 * @param {*}      root0.config
 */
export default function DesktopDockApp( { config } ) {
	const manager = useWindowManager();
	const stack = useWindowStack();
	const kernel = useKernel();
	const items = Array.isArray( config?.items ) ? config.items : [];
	const routes = kernel?.config?.routes || null;
	const rendererName =
		typeof config?.renderer === 'string' && config.renderer
			? config.renderer
			: 'default';
	const Renderer = getDockRailRenderer( rendererName );

	if ( ! Renderer ) {
		// Shouldn't happen — the engine registers `'default'` at
		// module-load above. Defensive empty render keeps the engine
		// painting if the registry is somehow empty.
		return (
			<div
				className="wp-admin-workspaces-desktop-dock"
				aria-label="Application dock"
			/>
		);
	}

	return (
		<Renderer
			items={ items }
			stack={ stack }
			routes={ routes }
			manager={ manager }
		/>
	);
}
