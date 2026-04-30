import { useState } from '@wordpress/element';
import {
	Button,
	Icon,
	__experimentalVStack as VStack,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { resolveIcon } from '../config/iconMap';
import SidebarNavigationScreen from './_components/SidebarNavigationScreen';
import SidebarNavigationItem from './_components/SidebarNavigationItem';
import SidebarContent from './_components/SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from './_components/SidebarNavigationContext';

import { navigate, useRoute } from '../routing/router';
import { useKernel } from '../kernel-context';
import { toApplicationList } from '../regions/mountApp';

/**
 * core:navigation — sidebar nav app.
 *
 * Reads its tree from `props.config.items` (the navigation array).
 * Resolves application targets through the kernel config so labels and
 * icons live with the application definition, not duplicated in the nav.
 *
 * Drill-down screens, separators, groups, and external links from the
 * MVP nav format are all preserved (the v0 normalizer keeps the nav
 * structure intact and just lifts it into the `core:navigation` config).
 */
export default function NavigationApp( { config: navConfig = {} } ) {
	const { config: shellConfig } = useKernel();
	const items = Array.isArray( navConfig.items ) ? navConfig.items : [];
	const collapsed = !! navConfig.collapsed;

	const apps = toApplicationList( shellConfig.applications );
	const { appId: routeAppId } = useRoute();
	const currentAppId = routeAppId || resolveDefaultApp( shellConfig, apps );

	if ( collapsed ) {
		return <CollapsedNavigation items={ items } apps={ apps } currentAppId={ currentAppId } />;
	}

	return (
		<SidebarNavigationProvider>
			<ExpandedNavigation
				items={ items }
				apps={ apps }
				currentAppId={ currentAppId }
				navConfig={ navConfig }
			/>
		</SidebarNavigationProvider>
	);
}

function resolveDefaultApp( shellConfig, apps ) {
	if ( shellConfig.defaultApp ) {
		return shellConfig.defaultApp;
	}
	if ( shellConfig.defaultRoute ) {
		return String( shellConfig.defaultRoute ).replace( /^#?\/?/, '' ).split( '/' )[ 0 ];
	}
	return apps.find( ( a ) => ! a.hidden )?.id || null;
}

function CollapsedNavigation( { items, apps, currentAppId } ) {
	return (
		<VStack spacing={ 1 } className="wp-admin-shell-nav__items">
			{ items.map( ( item, idx ) =>
				renderCollapsedItem( item, idx, apps, currentAppId )
			) }
		</VStack>
	);
}

function renderCollapsedItem( item, index, apps, currentAppId ) {
	if ( item.screen ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, apps, currentAppId )
		);
	}
	if ( item.group ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, apps, currentAppId )
		);
	}
	if ( item.separator ) {
		return <hr key={ `sep-${ index }` } className="wp-admin-shell-nav__separator" />;
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
		const app = apps.find( ( a ) => a.id === item.app );
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

function ExpandedNavigation( { items, apps, currentAppId, navConfig } ) {
	const [ activeScreen, setActiveScreen ] = useState( null );
	const navState = useSidebarNavigation();

	const screenDef = activeScreen ? findScreen( items, activeScreen ) : null;

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
								renderScreenItem( child, i, apps, currentAppId )
							) }
						</ItemGroup>
					}
				/>
			</SidebarContent>
		);
	}

	const rootTitle =
		navConfig.title || window.wpAdminShell?.siteName || __( 'Admin', 'wp-admin-shell' );

	return (
		<SidebarContent screenKey="root">
			<SidebarNavigationScreen
				isRoot
				title={ rootTitle }
				description={ navConfig.description }
				content={
					<ItemGroup className="wp-admin-shell-sidebar-screen__items">
						{ items.map( ( item, idx ) =>
							renderRootItem( item, idx, apps, currentAppId, setActiveScreen, navState )
						) }
					</ItemGroup>
				}
			/>
		</SidebarContent>
	);
}

function renderRootItem( item, index, apps, currentAppId, setActiveScreen, navState ) {
	if ( item.separator ) {
		return <hr key={ `sep-${ index }` } className="wp-admin-shell-nav__separator" />;
	}

	if ( item.screen ) {
		const hasActiveChild = ( item.items || [] ).some( ( child ) =>
			child.app ? child.app === currentAppId : false
		);

		return (
			<SidebarNavigationItem
				key={ `screen-${ item.screen }` }
				uid={ `screen-${ item.screen }` }
				icon={ resolveIcon( item.icon ) }
				withChevron
				isActive={ hasActiveChild }
				onClick={ () => {
					if ( navState ) {
						navState.navigate( 'forward', `[id="screen-${ item.screen }"]` );
					}
					setActiveScreen( item.screen );
				} }
			>
				{ item.label }
			</SidebarNavigationItem>
		);
	}

	if ( item.group ) {
		return (
			<div key={ `group-${ index }` } className="wp-admin-shell-nav__group">
				<span className="wp-admin-shell-nav__group-label">{ item.group }</span>
				{ ( item.items || [] ).map( ( child, ci ) =>
					renderScreenItem( child, `${ index }-${ ci }`, apps, currentAppId )
				) }
			</div>
		);
	}

	return renderScreenItem( item, index, apps, currentAppId );
}

function renderScreenItem( item, index, apps, currentAppId ) {
	if ( item.separator ) {
		return <hr key={ `sep-${ index }` } className="wp-admin-shell-nav__separator" />;
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
		const app = apps.find( ( a ) => a.id === item.app );
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

function findScreen( items, screenId ) {
	for ( const item of items ) {
		if ( item.screen === screenId ) {
			return item;
		}
	}
	return null;
}
