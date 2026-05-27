/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItemGroup has no @wordpress/ui 0.12 port. */
import { IconButton, Stack } from '@wordpress/ui';
import {
	Icon,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntityRecord } from '@wordpress/core-data';
import { decodeEntities } from '@wordpress/html-entities';

import { resolveIcon } from '../../../runtime/config/iconMap';
import SidebarNavigationScreen from '../_components/SidebarNavigationScreen';
import SidebarNavigationItem from '../_components/SidebarNavigationItem';
import SidebarContent from '../_components/SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from '../_components/SidebarNavigationContext';

import { useRoute, navigate } from '../../../runtime/routing/router';
import {
	hashPrimary,
	flattenLeaves,
	findScreen,
	findContainerForPrimary,
} from '../../../runtime/menu/menuTree.mjs';

/**
 * `sidebar-drilldown` menu renderer (the `core:default` strategy).
 *
 * Items with nested `items` become slide-in sub-screens with a back link;
 * leaves are plain links. Drilldown state lives in the URL slot
 * `?screen=<id>` so it deep-links and survives refresh. When the per-region
 * `navConfig.collapsed` flag is set, the renderer surfaces a leaf-only icon
 * rail instead (drilldown affordances don't fit a narrow rail).
 *
 * Registered under id `sidebar-drilldown` from the `core:navigation`
 * module. Receives the host-pruned menu tree; never re-prunes.
 *
 * @param {Object} root0
 * @param {Array}  root0.items          Pruned + ordered menu siblings.
 * @param {string} root0.currentPrimary Active URL primary path.
 * @param {Object} root0.navConfig      Per-region nav config block.
 */
export default function SidebarDrilldownRenderer( {
	items,
	currentPrimary,
	navConfig = {},
} ) {
	const collapsed = !! navConfig.collapsed;
	return (
		<SidebarNavigationProvider>
			{ collapsed ? (
				<CollapsedNavigation
					items={ items }
					currentPrimary={ currentPrimary }
				/>
			) : (
				<ExpandedNavigation
					items={ items }
					currentPrimary={ currentPrimary }
					navConfig={ navConfig }
				/>
			) }
		</SidebarNavigationProvider>
	);
}

function CollapsedNavigation( { items, currentPrimary } ) {
	return (
		<Stack
			direction="column"
			gap="xs"
			className="wp-admin-shell-nav__items"
		>
			{ flattenLeaves( items ).map( ( item, idx ) =>
				renderCollapsedItem( item, idx, currentPrimary )
			) }
		</Stack>
	);
}

function renderCollapsedItem( item, index, currentPrimary ) {
	if ( item.external && item.href ) {
		return (
			<a
				key={ `ext-${ item.id || index }` }
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
				className="wp-admin-shell-nav__link"
				aria-label={ item.label }
			>
				<Icon icon={ resolveIcon( item.icon ) } size={ 24 } />
			</a>
		);
	}
	if ( ! item.href ) {
		return null;
	}
	const target = hashPrimary( item.href );
	const isActive = !! target && currentPrimary === target;
	return (
		<IconButton
			key={ item.id || `nav-${ index }` }
			tone="neutral"
			variant="minimal"
			className="wp-admin-shell-nav__item"
			icon={ resolveIcon( item.icon ) }
			render={
				<a
					href={ item.href }
					aria-current={ isActive ? 'true' : undefined }
				/>
			}
			label={ item.label || item.id }
		/>
	);
}

function ExpandedNavigation( { items, currentPrimary, navConfig } ) {
	const route = useRoute();
	const navState = useSidebarNavigation();
	const { record: site } = useEntityRecord( 'root', 'site' );

	// Sub-screen state in `?screen=<id>` URL slot:
	//   - Explicit screen id ("posts") → that drilldown.
	//   - `__root` sentinel → user explicitly closed the drilldown via
	//     back; suppress inference even if the URL primary path matches
	//     a child item. The sentinel clears on the next leaf-click
	//     because plain <a href="#/..."> overwrites the entire hash.
	//   - Absent → infer from primary path. If the URL matches a child
	//     whose parent container has children, keep that container open
	//     so clicking a leaf doesn't snap the nav back to root.
	const explicitScreen = route.params?.screen || null;
	const userClosedDrilldown = explicitScreen === '__root';
	const inferredScreen =
		! explicitScreen && ! userClosedDrilldown
			? findContainerForPrimary( items, currentPrimary )
			: null;
	const activeScreen =
		explicitScreen && explicitScreen !== '__root'
			? explicitScreen
			: inferredScreen;
	const screenDef = activeScreen ? findScreen( items, activeScreen ) : null;

	if ( screenDef ) {
		const children = Array.isArray( screenDef.items )
			? screenDef.items
			: [];
		return (
			<SidebarContent screenKey={ activeScreen }>
				<SidebarNavigationScreen
					title={ screenDef.label || screenDef.id }
					description={ screenDef.description }
					onBack={ () => navigateScreen( '__root' ) }
					content={
						<ItemGroup className="wp-admin-shell-sidebar-navigation-screen__items">
							{ children.map( ( child, i ) =>
								renderLeafItem( child, i, currentPrimary )
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
					<ItemGroup className="wp-admin-shell-sidebar-navigation-screen__items">
						{ items.map( ( item, idx ) =>
							renderRootItem(
								item,
								idx,
								currentPrimary,
								navState
							)
						) }
					</ItemGroup>
				}
			/>
		</SidebarContent>
	);
}

/**
 * Write `?screen=<id>` (or clear when null) on top of the current
 * primary path. Preserves any other URL params.
 *
 * @param {string|null} screenId Sub-screen id or null to clear.
 */
function navigateScreen( screenId ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	const hash = window.location.hash || '';
	const queryIdx = hash.indexOf( '?' );
	const primary = queryIdx === -1 ? hash : hash.slice( 0, queryIdx );
	const search = queryIdx === -1 ? '' : hash.slice( queryIdx + 1 );
	const params = new URLSearchParams( search );
	if ( screenId ) {
		params.set( 'screen', screenId );
	} else {
		params.delete( 'screen' );
	}
	const next = params.toString();
	const target = next ? `${ primary || '#' }?${ next }` : primary || '#';
	navigate( target );
}

/**
 * Combined navigation: write a new primary path + `?screen=<id>`
 * drilldown slot in a single URL update so the second write doesn't
 * wipe the first's query params.
 *
 * @param {string|null} screenId
 * @param {string|null} ownPath  Container item's own href (e.g. `#/posts`).
 */
function navigateContainer( screenId, ownPath ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	// Determine the new primary path. If the container has no path
	// of its own, keep the current primary.
	const currentHash = window.location.hash || '';
	const currentQueryIdx = currentHash.indexOf( '?' );
	const currentPrimary =
		currentQueryIdx === -1
			? currentHash
			: currentHash.slice( 0, currentQueryIdx );
	const nextPrimary = ownPath || currentPrimary || '#';

	// Build the query slots, preserving anything except the screen
	// slot (which we set explicitly below).
	const currentSearch =
		currentQueryIdx === -1 ? '' : currentHash.slice( currentQueryIdx + 1 );
	const params = new URLSearchParams( currentSearch );
	if ( screenId ) {
		params.set( 'screen', screenId );
	} else {
		params.delete( 'screen' );
	}
	const next = params.toString();
	const target = next ? `${ nextPrimary }?${ next }` : nextPrimary;
	navigate( target );
}

/**
 * Root-level item renderer. Items with nested `items` become drilldown
 * affordances (chevron + click pushes `?screen=<id>` and slides in the
 * sub-screen). Everything else renders as a leaf.
 *
 * @param {Object}      item           Menu item.
 * @param {number}      index          Sibling index.
 * @param {string}      currentPrimary Active URL primary path.
 * @param {Object|null} navState       Sidebar nav state context.
 * @return {*} React element.
 */
function renderRootItem( item, index, currentPrimary, navState ) {
	if ( item.separator ) {
		return (
			<hr
				key={ `sep-${ item.id || index }` }
				className="wp-admin-shell-nav__separator"
			/>
		);
	}

	const hasChildren = Array.isArray( item.items ) && item.items.length > 0;
	if ( hasChildren ) {
		// Match wp-admin: clicking a container item with a screen
		// binding navigates to that screen AND opens the drilldown.
		// Container items WITHOUT a route binding (pure groups) only
		// drill down.
		const ownTarget = item.href ? hashPrimary( item.href ) : null;
		const ownPath = item.href || null;
		const hasActiveChild = item.items.some( ( child ) => {
			const target = child.href ? hashPrimary( child.href ) : null;
			return !! target && currentPrimary === target;
		} );
		const isActive =
			( !! ownTarget && currentPrimary === ownTarget ) || hasActiveChild;

		return (
			<SidebarNavigationItem
				key={ `screen-${ item.id }` }
				uid={ `screen-${ item.id }` }
				icon={ resolveIcon( item.icon ) }
				withChevron
				isActive={ isActive }
				onClick={ () => {
					if ( navState ) {
						navState.navigate(
							'forward',
							`[id="screen-${ item.id }"]`
						);
					}
					// Single URL write combining the container's own
					// route (if any) with `?screen=<id>` drilldown slot.
					// Sequential writes wipe each other — `navigate()`
					// clears any prior query slots.
					navigateContainer( item.id, ownPath );
				} }
			>
				{ item.label || item.id }
			</SidebarNavigationItem>
		);
	}

	return renderLeafItem( item, index, currentPrimary );
}

/**
 * Leaf item renderer — separator, external link, or in-shell link.
 *
 * @param {Object} item           Menu item.
 * @param {number} index          Sibling index.
 * @param {string} currentPrimary Active URL primary path.
 * @return {*} React element.
 */
function renderLeafItem( item, index, currentPrimary ) {
	if ( item.separator ) {
		return (
			<hr
				key={ `sep-${ item.id || index }` }
				className="wp-admin-shell-nav__separator"
			/>
		);
	}
	if ( item.external && item.href ) {
		return (
			<SidebarNavigationItem
				key={ `ext-${ item.id || index }` }
				uid={ `ext-${ item.id || index }` }
				icon={ resolveIcon( item.icon ) }
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
			>
				{ item.label || item.id }
			</SidebarNavigationItem>
		);
	}
	if ( ! item.href ) {
		return null;
	}
	const target = hashPrimary( item.href );
	const isActive = !! target && currentPrimary === target;
	return (
		<SidebarNavigationItem
			key={ item.id || `nav-${ index }` }
			uid={ `nav-${ item.id || index }` }
			icon={ resolveIcon( item.icon ) }
			isActive={ isActive }
			href={ item.href }
		>
			{ item.label || item.id }
		</SidebarNavigationItem>
	);
}
