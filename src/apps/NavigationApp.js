import './navigation/index.css';
import { useState } from '@wordpress/element';
import { IconButton, Stack } from '@wordpress/ui';
import {
	Icon,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntityRecord } from '@wordpress/core-data';
import { decodeEntities } from '@wordpress/html-entities';

import { resolveIcon } from '../runtime/config/iconMap';
import SidebarNavigationScreen from './_components/SidebarNavigationScreen';
import SidebarNavigationItem from './_components/SidebarNavigationItem';
import SidebarContent from './_components/SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from './_components/SidebarNavigationContext';

import { useRoute } from '../runtime/routing/router';
import { userCan } from '../runtime/capabilities/userCan';

/**
 * core:navigation — sidebar nav app.
 *
 * Reads its tree from `props.config.items` (the navigation array). Each
 * item self-describes inline via `{ label, icon, href, capability }`
 * for app links, `{ separator: true }` for dividers,
 * `{ group, items }` for inline grouping, and `{ screen, items }` for
 * drill-down sub-screens. External links carry `external: true`. The
 * v2 admin.json has no applications array, so nav items can't reuse a
 * shared app catalog — each item carries its own metadata.
 */
export default function NavigationApp( { config: navConfig = {} } ) {
	const collapsed = !! navConfig.collapsed;

	const route = useRoute();
	const currentPrimary = route.primary || '';

	// Spec §8 — recursive prune of items the user cannot reach.
	const rawItems = Array.isArray( navConfig.items ) ? navConfig.items : [];
	const items = pruneNavItems( rawItems );

	const ariaLabel = navConfig[ 'aria-label' ] || __( 'Main', 'wp-admin-shell' );

	const inner = collapsed ? (
		<CollapsedNavigation items={ items } currentPrimary={ currentPrimary } />
	) : (
		<SidebarNavigationProvider>
			<ExpandedNavigation
				items={ items }
				currentPrimary={ currentPrimary }
				navConfig={ navConfig }
			/>
		</SidebarNavigationProvider>
	);

	return (
		<nav aria-label={ ariaLabel } className="wp-admin-shell-nav__landmark">
			{ inner }
		</nav>
	);
}

/**
 * Resolve a nav item to { key, href, label, icon, isActive(currentPrimary) }.
 * v2 inline-only — items self-describe.
 */
function resolveNavTarget( item ) {
	if ( ! item.href ) {
		return null;
	}
	const href = item.href;
	const target = hashPrimary( href );
	return {
		key:      href,
		href,
		label:    item.label,
		icon:     item.icon,
		isActive: ( currentPrimary ) =>
			!! target && currentPrimary === target,
	};
}

/**
 * Extract the primary path from an in-shell hash href (`#/posts/foo` →
 * `/posts/foo`). External / non-hash hrefs return null so they never
 * match the active state.
 */
function hashPrimary( href ) {
	if ( typeof href !== 'string' || ! href.startsWith( '#' ) ) {
		return null;
	}
	const stripped = href.slice( 1 );
	const queryIdx = stripped.indexOf( '?' );
	const path = queryIdx === -1 ? stripped : stripped.slice( 0, queryIdx );
	return path.startsWith( '/' ) ? path : '/' + path;
}

function CollapsedNavigation( { items, currentPrimary } ) {
	return (
		<Stack direction="column" gap="xs" className="wp-admin-shell-nav__items">
			{ items.map( ( item, idx ) =>
				renderCollapsedItem( item, idx, currentPrimary )
			) }
		</Stack>
	);
}

function renderCollapsedItem( item, index, currentPrimary ) {
	if ( item.screen ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, currentPrimary )
		);
	}
	if ( item.group ) {
		return ( item.items || [] ).map( ( child, ci ) =>
			renderCollapsedItem( child, `${ index }-${ ci }`, currentPrimary )
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
	const resolved = resolveNavTarget( item );
	if ( ! resolved ) {
		return null;
	}
	return (
		<IconButton
			key={ resolved.key }
			tone="neutral"
			variant="minimal"
			className={ `wp-admin-shell-nav__item${
				resolved.isActive( currentPrimary ) ? ' is-active' : ''
			}` }
			icon={ resolveIcon( resolved.icon ) }
			render={ <a href={ resolved.href } /> }
			label={ resolved.label }
		/>
	);
}

function ExpandedNavigation( { items, currentPrimary, navConfig } ) {
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
								renderScreenItem( child, i, currentPrimary )
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
							renderRootItem( item, idx, currentPrimary, setActiveScreen, navState )
						) }
					</ItemGroup>
				}
			/>
		</SidebarContent>
	);
}

function renderRootItem( item, index, currentPrimary, setActiveScreen, navState ) {
	if ( item.separator ) {
		return <hr key={ `sep-${ index }` } className="wp-admin-shell-nav__separator" />;
	}

	if ( item.screen ) {
		const hasActiveChild = ( item.items || [] ).some( ( child ) => {
			const resolved = resolveNavTarget( child );
			return resolved ? resolved.isActive( currentPrimary ) : false;
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
					renderScreenItem( child, `${ index }-${ ci }`, currentPrimary )
				) }
			</div>
		);
	}

	return renderScreenItem( item, index, currentPrimary );
}

function renderScreenItem( item, index, currentPrimary ) {
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
	const resolved = resolveNavTarget( item );
	if ( ! resolved ) {
		return null;
	}
	return (
		<SidebarNavigationItem
			key={ resolved.key }
			uid={ `nav-${ resolved.key }` }
			icon={ resolveIcon( resolved.icon ) }
			isActive={ resolved.isActive( currentPrimary ) }
			href={ resolved.href }
		>
			{ resolved.label }
		</SidebarNavigationItem>
	);
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
 * Recursive navigation prune. An item is dropped when:
 *   - it declares a `capability` the user lacks,
 *   - it's a screen/group whose pruned children are empty.
 * Separators that orphan at the top/bottom are stripped.
 */
function pruneNavItems( items ) {
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
			const children = pruneNavItems( item.items );
			if ( children.length === 0 ) {
				continue;
			}
			out.push( { ...item, items: children } );
			continue;
		}
		if ( item.capability && ! userCan( item.capability ) ) {
			continue;
		}
		out.push( item );
	}
	while ( out.length && out[ 0 ].separator ) {
		out.shift();
	}
	while ( out.length && out[ out.length - 1 ].separator ) {
		out.pop();
	}
	return out;
}
