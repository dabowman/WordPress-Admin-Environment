/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItem* have no @wordpress/ui 0.12 port. */
import { useState } from '@wordpress/element';
import {
	Icon,
	__experimentalItem as Item,
	__experimentalItemGroup as ItemGroup,
	FlexBlock,
} from '@wordpress/components';
import { Stack } from '@wordpress/ui';
import { chevronDown, chevronRight } from '@wordpress/icons';

import { resolveIcon } from '../../../runtime/config/iconMap';
import SidebarNavigationItem from '../_components/SidebarNavigationItem';
import {
	hashPrimary,
	subtreeContainsPrimary,
} from '../../../runtime/menu/menuTree.mjs';

/**
 * `sidebar-tree` menu renderer.
 *
 * Items with nested `items` become expandable tree nodes that toggle
 * open/closed *in place* — no slide-in sub-screen, no `?screen=` URL slot.
 * Multiple branches can be open at once (the tree idiom), so expansion is
 * local UI state rather than URL state: each branch seeds open when its
 * subtree contains the active route, so deep-links and refresh land with
 * the active item visible. Leaves render as plain links.
 *
 * Registered under id `sidebar-tree` from the `core:navigation` module.
 * Receives the host-pruned menu tree; never re-prunes.
 *
 * @param {Object} root0
 * @param {Array}  root0.items          Pruned + ordered menu siblings.
 * @param {string} root0.currentPrimary Active URL primary path.
 */
export default function SidebarTreeRenderer( { items, currentPrimary } ) {
	// No wrapping <nav> landmark: the region this mounts in already
	// declares `role="navigation"` (engine.json), so a nested <nav> would
	// double the landmark. Same rule the drilldown renderer follows.
	return (
		<div className="wp-admin-shell-sidebar-navigation-tree">
			<TreeList
				items={ items }
				currentPrimary={ currentPrimary }
				depth={ 0 }
			/>
		</div>
	);
}

function TreeList( { items, currentPrimary, depth } ) {
	if ( ! Array.isArray( items ) || items.length === 0 ) {
		return null;
	}
	return (
		<ItemGroup
			className="wp-admin-shell-sidebar-navigation-tree__list"
			role="list"
		>
			{ items.map( ( item, index ) => {
				if ( item.separator ) {
					return (
						<hr
							key={ `sep-${ item.id || index }` }
							className="wp-admin-shell-nav__separator"
						/>
					);
				}
				const hasChildren =
					Array.isArray( item.items ) && item.items.length > 0;
				if ( hasChildren ) {
					return (
						<TreeBranch
							key={ `branch-${ item.id || index }` }
							item={ item }
							currentPrimary={ currentPrimary }
							depth={ depth }
						/>
					);
				}
				return (
					<TreeLeaf
						key={ item.id || `leaf-${ index }` }
						item={ item }
						index={ index }
						currentPrimary={ currentPrimary }
						depth={ depth }
					/>
				);
			} ) }
		</ItemGroup>
	);
}

function TreeBranch( { item, currentPrimary, depth } ) {
	const containsActive = subtreeContainsPrimary( item, currentPrimary );
	const [ expanded, setExpanded ] = useState( containsActive );

	return (
		<>
			<Item
				as="button"
				type="button"
				className="wp-admin-shell-sidebar-navigation-item wp-admin-shell-sidebar-navigation-tree__branch"
				aria-expanded={ expanded }
				style={ depthStyle( depth ) }
				onClick={ () => setExpanded( ( prev ) => ! prev ) }
			>
				<Stack
					direction="row"
					justify="flex-start"
					align="center"
					gap="sm"
				>
					{ depth === 0 && item.icon && (
						<Icon
							style={ { fill: 'currentcolor' } }
							icon={ resolveIcon( item.icon ) }
							size={ 24 }
						/>
					) }
					<FlexBlock>{ item.label || item.id }</FlexBlock>
					<Icon
						className="wp-admin-shell-sidebar-navigation-tree__toggle-indicator"
						icon={ expanded ? chevronDown : chevronRight }
						size={ 24 }
					/>
				</Stack>
			</Item>
			{ expanded && (
				<TreeList
					items={ item.items }
					currentPrimary={ currentPrimary }
					depth={ depth + 1 }
				/>
			) }
		</>
	);
}

function TreeLeaf( { item, index, currentPrimary, depth } ) {
	if ( item.external && item.href ) {
		return (
			<SidebarNavigationItem
				uid={ `ext-${ item.id || index }` }
				icon={ depth === 0 ? resolveIcon( item.icon ) : undefined }
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
				suffix={
					<Icon
						className="wp-admin-shell-sidebar-navigation-item__external-indicator"
						icon={ resolveIcon( 'external' ) }
						size={ 20 }
					/>
				}
				style={ depthStyle( depth ) }
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
			uid={ `nav-${ item.id || index }` }
			icon={ depth === 0 ? resolveIcon( item.icon ) : undefined }
			isActive={ isActive }
			href={ item.href }
			style={ depthStyle( depth ) }
		>
			{ item.label || item.id }
		</SidebarNavigationItem>
	);
}

/**
 * Per-depth left indent. Depth 0 stays flush; each level adds a step so
 * nesting reads visually. Expressed against the WPDS spacing scale via
 * the chrome layer's text-indent custom property fallback.
 *
 * @param {number} depth Nesting depth (0 = top level).
 * @return {Object|undefined} Inline style, or undefined at depth 0.
 */
function depthStyle( depth ) {
	if ( ! depth ) {
		return undefined;
	}
	return {
		paddingInlineStart: `calc(${ depth } * var(--wpds-space-16, 16px))`,
	};
}
