/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItem* have no @wordpress/ui 0.12 port. */
import { useState } from '@wordpress/element';
import {
	Icon,
	__experimentalItem as Item,
	__experimentalItemGroup as ItemGroup,
	FlexBlock,
} from '@wordpress/components';
import { Stack } from '@wordpress/ui';
import { chevronUp, chevronDown } from '@wordpress/icons';

import { resolveIcon } from '../../config/iconMap';
import { hashPrimary, subtreeContainsPrimary } from '../../menu/menuTree.mjs';

/**
 * `drawer` menu renderer — the `core:single-pane` engine's strategy.
 *
 * Containers become collapsible accordion sections; leaves render as
 * links. Built for the mobile-first drawer: one tall scroll column where
 * tapping a section header expands its items inline. A section seeds open
 * when its subtree contains the active route so a deep-link lands visible.
 *
 * Engine-owned: this renderer ships with `core:single-pane` and
 * self-registers from the engine module (`registerMenuRenderer('drawer',
 * …)`), so it travels with the engine when it's extracted to its own
 * plugin. It depends only on kernel modules (`iconMap`, `menuTree`) +
 * WPDS — never on the bundled `core:navigation` app's internals.
 *
 * Receives the host-pruned menu tree from `core:navigation`; never
 * re-prunes.
 *
 * @param {Object} root0
 * @param {Array}  root0.items          Pruned + ordered menu siblings.
 * @param {string} root0.currentPrimary Active URL primary path.
 */
export default function DrawerRenderer( { items, currentPrimary } ) {
	if ( ! Array.isArray( items ) || items.length === 0 ) {
		return null;
	}
	// No wrapping <nav> landmark: the single-pane `core:nav-drawer` region
	// already declares `role="navigation"`, so a nested <nav> would double
	// the landmark.
	return (
		<div className="wp-admin-workspaces-drawer-nav">
			{ items.map( ( item, index ) => {
				if ( item.separator ) {
					return (
						<hr
							key={ `sep-${ item.id || index }` }
							className="wp-admin-workspaces-nav__separator"
						/>
					);
				}
				const hasChildren =
					Array.isArray( item.items ) && item.items.length > 0;
				if ( hasChildren ) {
					return (
						<DrawerSection
							key={ `section-${ item.id || index }` }
							item={ item }
							currentPrimary={ currentPrimary }
						/>
					);
				}
				return (
					<DrawerLink
						key={ item.id || `link-${ index }` }
						item={ item }
						currentPrimary={ currentPrimary }
					/>
				);
			} ) }
		</div>
	);
}

function DrawerSection( { item, currentPrimary } ) {
	const containsActive = subtreeContainsPrimary( item, currentPrimary );
	const [ open, setOpen ] = useState( containsActive );

	return (
		<section className="wp-admin-workspaces-drawer-nav__section">
			<Item
				as="button"
				type="button"
				className="wp-admin-workspaces-drawer-nav__section-header"
				aria-expanded={ open }
				onClick={ () => setOpen( ( prev ) => ! prev ) }
			>
				<Stack
					direction="row"
					justify="flex-start"
					align="center"
					gap="sm"
				>
					{ item.icon && (
						<Icon
							style={ { fill: 'currentcolor' } }
							icon={ resolveIcon( item.icon ) }
							size={ 24 }
						/>
					) }
					<FlexBlock>{ item.label || item.id }</FlexBlock>
					<Icon icon={ open ? chevronUp : chevronDown } size={ 24 } />
				</Stack>
			</Item>
			{ open && (
				<ItemGroup
					className="wp-admin-workspaces-drawer-nav__section-items"
					role="list"
				>
					{ item.items.map( ( child, i ) => {
						if ( child.separator ) {
							return (
								<hr
									key={ `sep-${ child.id || i }` }
									className="wp-admin-workspaces-nav__separator"
								/>
							);
						}
						return (
							<DrawerLink
								key={ child.id || `link-${ i }` }
								item={ child }
								currentPrimary={ currentPrimary }
							/>
						);
					} ) }
				</ItemGroup>
			) }
		</section>
	);
}

function DrawerLink( { item, currentPrimary } ) {
	if ( item.external && item.href ) {
		return (
			<a
				className="wp-admin-workspaces-drawer-nav__link"
				href={ item.href }
				target="_blank"
				rel="noopener noreferrer"
			>
				<Stack direction="row" align="center" gap="sm">
					{ item.icon && (
						<Icon
							style={ { fill: 'currentcolor' } }
							icon={ resolveIcon( item.icon ) }
							size={ 24 }
						/>
					) }
					<FlexBlock>{ item.label || item.id }</FlexBlock>
				</Stack>
			</a>
		);
	}
	if ( ! item.href ) {
		return null;
	}
	const target = hashPrimary( item.href );
	const isActive = !! target && currentPrimary === target;
	return (
		<a
			className="wp-admin-workspaces-drawer-nav__link"
			href={ item.href }
			aria-current={ isActive ? 'true' : undefined }
		>
			<Stack direction="row" align="center" gap="sm">
				{ item.icon && (
					<Icon
						style={ { fill: 'currentcolor' } }
						icon={ resolveIcon( item.icon ) }
						size={ 24 }
					/>
				) }
				<FlexBlock>{ item.label || item.id }</FlexBlock>
			</Stack>
		</a>
	);
}
