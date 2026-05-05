import { useState } from '@wordpress/element';
import { IconButton, Stack } from '@wordpress/ui';
import {
	Icon,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntityRecord } from '@wordpress/core-data';
import { decodeEntities } from '@wordpress/html-entities';

import { resolveIcon } from '../config/iconMap';
import SidebarNavigationScreen from './_components/SidebarNavigationScreen';
import SidebarNavigationItem from './_components/SidebarNavigationItem';
import SidebarContent from './_components/SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from './_components/SidebarNavigationContext';

import { useRoute } from '../routing/router';
import { useKernel } from '../kernel-context';
import { getApplications } from '../regions/mountApp';
import { userCan } from '../capabilities/userCan';

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
	const collapsed = !! navConfig.collapsed;

	const apps = getApplications( shellConfig );
	const { appId: routeAppId } = useRoute();
	const currentAppId = routeAppId || resolveDefaultApp( shellConfig, apps );

	// Spec §8 — recursive prune of items the user cannot reach. App items
	// gated out by capability disappear; screens whose entire items[]
	// prune to empty disappear too (recursive).
	const rawItems = Array.isArray( navConfig.items ) ? navConfig.items : [];
	const items = pruneNavItems( rawItems, apps );

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
	// v1 canonical: settings.defaultRoute. v0 mirrors at top-level
	// (defaultApp + defaultRoute). Check all three so both shapes
	// work without the v1 author having to also write the v0 mirrors.
	const route =
		shellConfig.settings?.defaultRoute ||
		shellConfig.defaultRoute ||
		null;
	if ( route ) {
		return String( route ).replace( /^#?\/?/, '' ).split( '/' )[ 0 ];
	}
	if ( shellConfig.defaultApp ) {
		return shellConfig.defaultApp;
	}
	return apps.find( ( a ) => ! a.hidden )?.id || null;
}

function CollapsedNavigation( { items, apps, currentAppId } ) {
	return (
		<Stack direction="column" gap="xs" className="wp-admin-shell-nav__items">
			{ items.map( ( item, idx ) =>
				renderCollapsedItem( item, idx, apps, currentAppId )
			) }
		</Stack>
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
	if ( item.app || item.href ) {
		const resolved = resolveNavTarget( item, apps );
		if ( ! resolved ) {
			return null;
		}
		return (
			<IconButton
				key={ resolved.key }
				tone="neutral"
				variant="minimal"
				className={ `wp-admin-shell-nav__item${
					resolved.isActive( currentAppId ) ? ' is-active' : ''
				}` }
				icon={ resolveIcon( resolved.icon ) }
				render={ <a href={ resolved.href } /> }
				label={ resolved.label }
			/>
		);
	}
	return null;
}

/**
 * Build an in-shell hash link for an app. Used by NavigationApp's
 * `<a href>`-based items (V2.M3 task 6). Apps with an explicit `route`
 * field use it (legacy v1 routing); otherwise fall back to `#/<appId>`
 * which the legacy parseHash treats as the routable app.
 */
function appHref( app ) {
	if ( app.route ) {
		const trimmed = String( app.route ).replace( /^#?\/?/, '' );
		return '#/' + trimmed;
	}
	return '#/' + app.id;
}

/**
 * Resolve a nav item to { key, href, label, icon, isActive(currentAppId) }.
 *
 * v1 shells: nav items carry `app: 'local-id'`; the apps array (from
 * `settings.applications`) provides title/icon/route. We resolve via
 * `apps.find` and use `appHref(app)`.
 *
 * v2 shells: nav items can carry inline `{app: 'core:posts', label,
 * icon, href}`. The apps array is empty (v2 admin.json has no
 * applications partition), so we read label/icon/href off the item.
 * `app` field is optional but lets the renderer compare against
 * currentAppId (URL primary path's first segment) for active-state
 * styling.
 */
function resolveNavTarget( item, apps ) {
	if ( item.app ) {
		const matched = apps.find( ( a ) => a.id === item.app );
		if ( matched ) {
			return {
				key:      matched.id,
				href:     appHref( matched ),
				label:    item.label || matched.title,
				icon:     item.icon || matched.icon,
				isActive: ( current ) => current === matched.id,
			};
		}
		// v2: no entry in apps array. The item must self-describe.
		const href = item.href || '#/' + item.app;
		return {
			key:      String( item.app ),
			href,
			label:    item.label,
			icon:     item.icon,
			isActive: ( current ) => current === hashFirstSegment( href ),
		};
	}
	if ( item.href ) {
		return {
			key:      item.href,
			href:     item.href,
			label:    item.label,
			icon:     item.icon,
			isActive: ( current ) => current === hashFirstSegment( item.href ),
		};
	}
	return null;
}

function hashFirstSegment( href ) {
	if ( typeof href !== 'string' ) {
		return null;
	}
	const trimmed = href.replace( /^#?\/?/, '' );
	const seg = trimmed.split( /[/?]/ )[ 0 ];
	return seg || null;
}

function ExpandedNavigation( { items, apps, currentAppId, navConfig } ) {
	const [ activeScreen, setActiveScreen ] = useState( null );
	const navState = useSidebarNavigation();
	const { record: site } = useEntityRecord( 'root', 'site' );

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
		navConfig.title ||
		decodeEntities( site?.title || '' ) ||
		window.wpAdminShell?.siteName ||
		__( 'Admin', 'wp-admin-shell' );

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
	if ( item.app || item.href ) {
		const resolved = resolveNavTarget( item, apps );
		if ( ! resolved ) {
			return null;
		}
		return (
			<SidebarNavigationItem
				key={ resolved.key }
				uid={ `nav-${ resolved.key }` }
				icon={ resolveIcon( resolved.icon ) }
				isActive={ resolved.isActive( currentAppId ) }
				href={ resolved.href }
			>
				{ resolved.label }
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

/**
 * Recursive navigation prune. An app/screen/group is dropped when:
 *   - the linked app has a capability the user lacks, or
 *   - the source declares a capability floor the user lacks, or
 *   - it's a screen whose pruned children are empty, or
 *   - it's a group whose pruned children are empty.
 * Separators that would orphan at the top/bottom are preserved as-is —
 * the renderer handles them.
 */
function pruneNavItems( items, apps ) {
	if ( ! Array.isArray( items ) ) {
		return [];
	}
	const out = [];
	for ( const item of items ) {
		if ( ! item || typeof item !== 'object' ) {
			continue;
		}
		if ( item.separator ) {
			out.push( item );
			continue;
		}
		if ( item.screen || item.group ) {
			const children = pruneNavItems( item.items, apps );
			if ( children.length === 0 ) {
				continue;
			}
			out.push( { ...item, items: children } );
			continue;
		}
		if ( item.app ) {
			const app = apps.find( ( a ) => a.id === item.app );
			if ( app ) {
				if ( app.capability && ! userCan( app.capability ) ) {
					continue;
				}
				out.push( item );
				continue;
			}
			// v2: no entry in apps array (admin.json has no applications
			// partition in v2). The item self-describes via href/label/icon
			// + an optional `capability`. Cap gate applies if declared.
			if ( item.capability && ! userCan( item.capability ) ) {
				continue;
			}
			out.push( item );
			continue;
		}
		// Plain external link or other — pass through.
		out.push( item );
	}
	// Drop leading/trailing separator runs.
	while ( out.length && out[ 0 ].separator ) {
		out.shift();
	}
	while ( out.length && out[ out.length - 1 ].separator ) {
		out.pop();
	}
	return out;
}
