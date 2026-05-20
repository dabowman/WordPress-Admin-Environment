/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItemGroup has no @wordpress/ui 0.12 port. */
import './index.css';
import { IconButton, Stack } from '@wordpress/ui';
import {
	Icon,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntityRecord } from '@wordpress/core-data';
import { decodeEntities } from '@wordpress/html-entities';

import { resolveIcon } from '../../runtime/config/iconMap';
import SidebarNavigationScreen from './_components/SidebarNavigationScreen';
import SidebarNavigationItem from './_components/SidebarNavigationItem';
import SidebarContent from './_components/SidebarContent';
import {
	SidebarNavigationProvider,
	useSidebarNavigation,
} from './_components/SidebarNavigationContext';

import { useKernel } from '../../runtime/kernel-context';
import { useRoute, navigate } from '../../runtime/routing/router';
import { userCan } from '../../runtime/capabilities/userCan';

/**
 * core:navigation — sidebar nav app.
 *
 * v3: reads `config.menu` (nested tree) and `config.screens` (screen
 * registry) from the resolved kernel config. The PHP `bind_screens`
 * resolver pass has already flowed screen `label` / `icon` /
 * `description` / `href` / `permissions` into matching menu items, so
 * each entry is renderable in isolation.
 *
 * The per-region `props.config` block is read for navigation-app
 * options that aren't part of the engine-agnostic menu tree —
 * `collapsed`, `title`, `description`.
 *
 * Drilldown state lives in the URL slot `?screen=<id>` so it deep-links
 * and survives refresh.
 * @param {Object} root0
 * @param {*}      root0.config
 */
export default function NavigationApp( { config: navConfig = {} } ) {
	const collapsed = !! navConfig.collapsed;

	const { config: kernelConfig } = useKernel();
	const route = useRoute();
	const currentPrimary = route.primary || '';

	// v3 — menu tree at root. Each entry already screen-bound by PHP.
	const rawMenu =
		kernelConfig &&
		typeof kernelConfig.menu === 'object' &&
		kernelConfig.menu !== null
			? kernelConfig.menu
			: {};

	// Sort siblings by `position` (lower first), then drop hidden +
	// capability-denied entries recursively.
	const items = pruneMenu( orderTree( rawMenu ) );

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

/**
 * Convert a `{ id => entry }` v3 menu tree into a sorted array of
 * `{ id, ...entry, items: orderTree(entry.items) }`. Sort siblings by
 * `position` ascending (lower first), then registration order for ties.
 *
 * @param {Object} tree v3 menu object keyed by id.
 * @return {Array} Sorted siblings.
 */
function orderTree( tree ) {
	if ( ! tree || typeof tree !== 'object' ) {
		return [];
	}
	const entries = Object.entries( tree );
	const withIndex = entries.map( ( [ id, entry ], i ) => ( {
		id,
		entry,
		i,
	} ) );
	withIndex.sort( ( a, b ) => {
		const pa = Number.isInteger( a.entry?.position )
			? a.entry.position
			: Number.POSITIVE_INFINITY;
		const pb = Number.isInteger( b.entry?.position )
			? b.entry.position
			: Number.POSITIVE_INFINITY;
		if ( pa === pb ) {
			return a.i - b.i;
		}
		return pa < pb ? -1 : 1;
	} );
	return withIndex.map( ( { id, entry } ) => {
		const sub =
			entry && typeof entry === 'object' && entry.items
				? orderTree( entry.items )
				: undefined;
		return sub ? { id, ...entry, items: sub } : { id, ...entry };
	} );
}

/**
 * Recursive prune. Drops items that:
 *   - declare `hidden: true`,
 *   - declare permissions the user fails (any capability NOT held),
 *   - are containers (have `items`) whose pruned children are empty AND
 *     have no own `href` / screen affordance to fall back on,
 * Separators that orphan at the top/bottom of a list are trimmed.
 *
 * @param {Array} items Sorted siblings.
 * @return {Array} Pruned siblings.
 */
function pruneMenu( items ) {
	if ( ! Array.isArray( items ) ) {
		return [];
	}
	const out = [];
	for ( const item of items ) {
		if ( ! item || typeof item !== 'object' ) {
			continue;
		}
		if ( item.hidden === true ) {
			continue;
		}
		if ( item.separator === true ) {
			out.push( item );
			continue;
		}
		if ( ! itemPassesPermissions( item ) ) {
			continue;
		}
		if ( Array.isArray( item.items ) && item.items.length > 0 ) {
			const children = pruneMenu( item.items );
			if ( children.length === 0 && ! item.href ) {
				// Container with no surviving children and no own
				// affordance — drop.
				continue;
			}
			out.push( { ...item, items: children } );
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

/**
 * v3 permissions are OR-semantic: pass if ANY capability holds OR ANY
 * role-membership check holds. For client-side prune the conservative
 * read is "user holds at least one declared cap" — role checks are
 * server-side only (no client-side role map). Server-side cap gating
 * still applies on top.
 *
 * Items without a `permissions` block are visible (admin.json fallback
 * to admin-only is enforced server-side and reflected in the cap map).
 *
 * @param {Object} item Menu item.
 * @return {boolean} Whether the user passes the item's permissions.
 */
function itemPassesPermissions( item ) {
	const perms = item.permissions;
	if ( ! perms || typeof perms !== 'object' ) {
		return true;
	}
	const caps = Array.isArray( perms.capabilities ) ? perms.capabilities : [];
	const roles = Array.isArray( perms.roles ) ? perms.roles : [];
	if ( caps.length === 0 && roles.length === 0 ) {
		return true;
	}
	for ( const cap of caps ) {
		if ( typeof cap === 'string' && userCan( cap ) ) {
			return true;
		}
	}
	// No client-side role check today — server-side cap gating is
	// authoritative. When the only access route is by role, render the
	// item (server will 403 on the route if it shouldn't be reachable).
	if ( roles.length > 0 ) {
		return true;
	}
	return false;
}

/**
 * Extract the primary path from an in-shell hash href (`#/posts/foo` →
 * `/posts/foo`). External / non-hash hrefs return null so they never
 * match the active state.
 *
 * @param {string} href Hash href.
 * @return {string|null} Primary path or null.
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

/**
 * Collapsed nav surfaces leaf items only — drilldown affordances don't
 * fit in the icon rail. Walks the tree and pulls every renderable leaf
 * (has `href`, is not a separator/container) up to a flat list,
 * preserving sort order.
 *
 * @param {Array} items Pruned siblings.
 * @return {Array} Flat list of leaf items.
 */
function flattenLeaves( items ) {
	const out = [];
	for ( const item of items ) {
		if ( item.separator ) {
			continue;
		}
		if ( Array.isArray( item.items ) && item.items.length > 0 ) {
			out.push( ...flattenLeaves( item.items ) );
			continue;
		}
		if ( item.href ) {
			out.push( item );
		}
	}
	return out;
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
		( explicitScreen && explicitScreen !== '__root' ) || inferredScreen;
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

function findScreen( items, screenId ) {
	for ( const item of items ) {
		if ( item.id === screenId && Array.isArray( item.items ) ) {
			return item;
		}
	}
	return null;
}

/**
 * Find the top-level container item whose subtree contains a child
 * whose href maps to the active primary URL path. Used to keep a
 * drilldown open after clicking through to a sub-item (the sub-item's
 * `<a href>` overwrites the hash, so the `?screen=<id>` slot is lost
 * unless we infer it from the path).
 *
 * Top-level containers only — drilldowns don't nest more than one
 * level in the v3 default workspace.
 *
 * @param {Array}  items          Pruned top-level menu siblings.
 * @param {string} currentPrimary Active primary URL path.
 * @return {string|null} Container item id, or null when no match.
 */
function findContainerForPrimary( items, currentPrimary ) {
	if ( ! currentPrimary ) {
		return null;
	}
	for ( const item of items ) {
		if (
			! item ||
			! Array.isArray( item.items ) ||
			item.items.length === 0
		) {
			continue;
		}
		for ( const child of item.items ) {
			if ( ! child || typeof child.href !== 'string' ) {
				continue;
			}
			const target = hashPrimary( child.href );
			if ( target && target === currentPrimary ) {
				return item.id;
			}
		}
	}
	return null;
}
