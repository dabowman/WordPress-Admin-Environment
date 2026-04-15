import { useState } from '@wordpress/element';
import {
	Button,
	Icon,
	__experimentalVStack as VStack,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { resolveIcon } from '../config/iconMap';
import { navigate, useRoute } from '../routing/router';
import SiteHub from './SiteHub';
import SidebarNavigationScreen from './SidebarNavigationScreen';
import SidebarNavigationItem from './SidebarNavigationItem';
import SidebarContent from './SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from './SidebarNavigationContext';

/**
 * Renders the sidebar navigation from the config's navigation array.
 * Supports flat items, groups, separators, external links, and
 * drill-down screens (screen items with sub-navigation).
 */
export function ShellNavigation( { config } ) {
	const isCollapsed = config.layout.navigationCollapsed;

	return (
		<nav
			className={ `wp-admin-shell-nav${
				isCollapsed ? ' is-collapsed' : ''
			}` }
			style={ {
				'--wp-admin-shell-nav-width':
					config.layout.navigationWidth + 'px',
			} }
		>
			{ ! isCollapsed && <SiteHub config={ config } /> }

			{ isCollapsed ? (
				<CollapsedNavigation config={ config } />
			) : (
				<SidebarNavigationProvider>
					<ExpandedNavigation config={ config } />
				</SidebarNavigationProvider>
			) }
		</nav>
	);
}

/**
 * Collapsed mode — icon-only buttons, no drill-down.
 */
function CollapsedNavigation( { config } ) {
	const { path } = useRoute();
	const currentAppId = path[ 0 ] || config.defaultApp;

	return (
		<VStack spacing={ 1 } className="wp-admin-shell-nav__items">
			{ config.navigation.map( ( item, index ) =>
				renderCollapsedItem( item, index, config, currentAppId )
			) }
		</VStack>
	);
}

function renderCollapsedItem( item, index, config, currentAppId ) {
	// Screens flatten to their child items in collapsed mode.
	if ( item.screen ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, config, currentAppId )
		);
	}

	if ( item.group ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, config, currentAppId )
		);
	}

	if ( item.separator ) {
		return (
			<hr
				key={ `sep-${ index }` }
				className="wp-admin-shell-nav__separator"
			/>
		);
	}

	if ( item.external && item.href ) {
		return (
			<a
				key={ `ext-${ index }` }
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
				className="wp-admin-shell-nav__link"
			>
				<Icon icon={ resolveIcon( item.icon ) } size={ 24 } />
			</a>
		);
	}

	if ( item.app ) {
		const app = config.applications.find( ( a ) => a.id === item.app );
		if ( ! app ) {
			return null;
		}
		return (
			<Button
				key={ app.id }
				className={ `wp-admin-shell-nav__item${
					currentAppId === app.id ? ' is-active' : ''
				}` }
				icon={ resolveIcon( app.icon ) }
				onClick={ () => navigate( app.id ) }
				label={ app.title }
				showTooltip
			/>
		);
	}

	return null;
}

/**
 * Expanded mode — full screen-based navigation with drill-down.
 */
function ExpandedNavigation( { config } ) {
	const [ activeScreen, setActiveScreen ] = useState( null );
	const { path } = useRoute();
	const currentAppId = path[ 0 ] || config.defaultApp;
	const navState = useSidebarNavigation();

	// Find the active screen definition if one is selected.
	const screenDef = activeScreen
		? findScreen( config.navigation, activeScreen )
		: null;

	if ( screenDef ) {
		return (
			<SidebarContent screenKey={ activeScreen }>
				<SidebarNavigationScreen
					title={ screenDef.label }
					description={ screenDef.description }
					onBack={ () => setActiveScreen( null ) }
					content={
						<ItemGroup className="wp-admin-shell-sidebar-screen__items">
							{ ( screenDef.items || [] ).map( ( child, i ) =>
								renderScreenItem(
									child,
									i,
									config,
									currentAppId
								)
							) }
						</ItemGroup>
					}
				/>
			</SidebarContent>
		);
	}

	// Root screen.
	return (
		<SidebarContent screenKey="root">
			<SidebarNavigationScreen
				isRoot
				title={ config.branding.title || window.wpAdminShell?.siteName || __( 'Admin', 'wp-admin-shell' ) }
				description={ config.description }
				content={
					<ItemGroup className="wp-admin-shell-sidebar-screen__items">
						{ config.navigation.map( ( item, index ) =>
							renderRootItem(
								item,
								index,
								config,
								currentAppId,
								setActiveScreen,
								navState
							)
						) }
					</ItemGroup>
				}
			/>
		</SidebarContent>
	);
}

function renderRootItem(
	item,
	index,
	config,
	currentAppId,
	setActiveScreen,
	navState
) {
	if ( item.separator ) {
		return (
			<hr
				key={ `sep-${ index }` }
				className="wp-admin-shell-nav__separator"
			/>
		);
	}

	// Drill-down screen — renders as a nav item with chevron.
	if ( item.screen ) {
		const hasActiveChild = ( item.items || [] ).some( ( child ) => {
			if ( child.app ) {
				return child.app === currentAppId;
			}
			return false;
		} );

		return (
			<SidebarNavigationItem
				key={ `screen-${ item.screen }` }
				uid={ `screen-${ item.screen }` }
				icon={ resolveIcon( item.icon ) }
				withChevron
				isActive={ hasActiveChild }
				onClick={ () => {
					if ( navState ) {
						navState.navigate(
							'forward',
							`[id="screen-${ item.screen }"]`
						);
					}
					setActiveScreen( item.screen );
				} }
			>
				{ item.label }
			</SidebarNavigationItem>
		);
	}

	// Legacy group — render items inline with a label.
	if ( item.group ) {
		return (
			<div key={ `group-${ index }` } className="wp-admin-shell-nav__group">
				<span className="wp-admin-shell-nav__group-label">
					{ item.group }
				</span>
				{ ( item.items || [] ).map( ( child, ci ) =>
					renderScreenItem(
						child,
						`${ index }-${ ci }`,
						config,
						currentAppId
					)
				) }
			</div>
		);
	}

	return renderScreenItem( item, index, config, currentAppId );
}

/**
 * Render a single nav item inside a screen or at the root level.
 */
function renderScreenItem( item, index, config, currentAppId ) {
	if ( item.separator ) {
		return (
			<hr
				key={ `sep-${ index }` }
				className="wp-admin-shell-nav__separator"
			/>
		);
	}

	if ( item.external && item.href ) {
		return (
			<SidebarNavigationItem
				key={ `ext-${ index }` }
				uid={ `ext-${ index }` }
				icon={ resolveIcon( item.icon ) }
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
			>
				{ item.label }
			</SidebarNavigationItem>
		);
	}

	if ( item.app ) {
		const app = config.applications.find( ( a ) => a.id === item.app );
		if ( ! app ) {
			return null;
		}
		return (
			<SidebarNavigationItem
				key={ app.id }
				uid={ `nav-${ app.id }` }
				icon={ resolveIcon( app.icon ) }
				isActive={ currentAppId === app.id }
				onClick={ () => navigate( app.id ) }
			>
				{ app.title }
			</SidebarNavigationItem>
		);
	}

	return null;
}

/**
 * Find a screen definition by ID, searching recursively.
 */
function findScreen( navigation, screenId ) {
	for ( const item of navigation ) {
		if ( item.screen === screenId ) {
			return item;
		}
	}
	return null;
}
