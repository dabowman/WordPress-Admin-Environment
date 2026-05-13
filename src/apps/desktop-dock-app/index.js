/**
 * core:desktop-dock-app — MVP nav-derived dock (P2.T2).
 *
 * Two groups rendered side-by-side:
 *
 *   1. Launcher tiles — read from `config.items`. Each item declares
 *      either `{ label, icon?, app, config? }` (opens that app) or
 *      `{ label, icon?, href }` (resolved through admin.json's `routes`
 *      map; `#/foo` looks up the matching route entry).
 *
 *   2. Live-window tiles — one per entry in `useWindowStack()`. Click
 *      calls `focusWindow(id)`, which auto-restores minimized windows
 *      (per `WindowManager.focusWindow`). Without this group, a
 *      minimized window has no UI affordance to come back.
 *
 * P2.T3 will replace this with the ported `dock-rail/*` registry — MVP
 * keeps the two flat groups so the round-trip smoke covers
 * launch + restore.
 */

import { Icon } from '@wordpress/icons';

import { useKernel } from '../../runtime/kernel-context';
import {
	useWindowManager,
	useWindowStack,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';
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
	// Walk launcher items first — if a launcher exists for this app, reuse
	// its icon for the live-window tile so the visual stays consistent.
	for ( const item of items ) {
		const resolved = resolveDockItem( item, routes );
		if ( resolved && resolved.app === appId && item.icon ) {
			return item.icon;
		}
	}
	return null;
}

export default function DesktopDockApp( { config } ) {
	const manager = useWindowManager();
	const stack = useWindowStack();
	const kernel = useKernel();
	const items = Array.isArray( config?.items ) ? config.items : [];
	const routes = kernel?.config?.routes || null;
	const topZ = stack.reduce( ( m, w ) => Math.max( m, w.zIndex ), 0 );

	return (
		<div
			className="wp-admin-shell-desktop-dock"
			aria-label="Application dock"
		>
			{ items.length > 0 && (
				<ul
					className="wp-admin-shell-desktop-dock__group wp-admin-shell-desktop-dock__group--launchers"
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
							manager.openWindow( {
								app: resolved.app,
								config: resolved.config,
								title: resolved.title,
							} );
						};
						return (
							<li
								key={ idx }
								className="wp-admin-shell-desktop-dock__item"
							>
								<button
									type="button"
									className="wp-admin-shell-desktop-dock__tile"
									onClick={ onClick }
									disabled={ ! resolved }
									aria-label={ label }
									title={ label }
								>
									{ iconData && (
										<span
											aria-hidden="true"
											className="wp-admin-shell-desktop-dock__icon"
										>
											<Icon
												icon={ iconData }
												size={ 24 }
											/>
										</span>
									) }
									<span className="wp-admin-shell-desktop-dock__label">
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
							className="wp-admin-shell-desktop-dock__separator"
							aria-hidden="true"
						/>
					) }
					<ul
						className="wp-admin-shell-desktop-dock__group wp-admin-shell-desktop-dock__group--windows"
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
									className="wp-admin-shell-desktop-dock__item"
								>
									<button
										type="button"
										className="wp-admin-shell-desktop-dock__tile wp-admin-shell-desktop-dock__tile--window"
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
												className="wp-admin-shell-desktop-dock__icon"
											>
												<Icon
													icon={ iconData }
													size={ 24 }
												/>
											</span>
										) }
										<span className="wp-admin-shell-desktop-dock__label">
											{ win.title }
										</span>
										<span
											aria-hidden="true"
											className="wp-admin-shell-desktop-dock__indicator"
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
