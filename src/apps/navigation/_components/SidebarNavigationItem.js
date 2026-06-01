/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItem has no @wordpress/ui 0.12 port. */
import { __experimentalItem as Item, FlexBlock } from '@wordpress/components';
import { Icon, Stack } from '@wordpress/ui';
import { isRTL } from '@wordpress/i18n';
import { chevronRightSmall, chevronLeftSmall } from '@wordpress/icons';

import { useSidebarNavigation } from './SidebarNavigationContext';
import ArbitraryIcon from '../../_shared/icons/ArbitraryIcon';

/**
 * A single item in the sidebar navigation — modeled after the site editor's
 * SidebarNavigationItem. Renders as an interactive Item component with optional
 * icon, chevron drilldown indicator, and suffix.
 *
 * `Item` and `FlexBlock` are kept from `@wordpress/components` — neither
 * has a WPDS port in 0.12. Layout is provided by `Stack`/`Icon` from
 * `@wordpress/ui`.
 *
 * Icon rendering: when `iconSource` (the arbitrary-icon escape hatch, #127)
 * is present it wins — a harvested data-URI / image-URL plugin menu icon
 * renders through `ArbitraryIcon` (engine/app-space pass-through). Otherwise
 * the pre-resolved `icon` object renders through `@wordpress/ui` `Icon`.
 *
 * @param {Object} root0
 * @param {*}      root0.className
 * @param {*}      root0.icon
 * @param {*}      root0.iconSource  Escape-hatch descriptor `{ type, value }` (#127).
 * @param {*}      root0.withChevron
 * @param {*}      root0.suffix
 * @param {*}      root0.uid
 * @param {*}      root0.onClick
 * @param {*}      root0.href
 * @param {*}      root0.isActive
 * @param {*}      root0.children
 */
export default function SidebarNavigationItem( {
	className,
	icon,
	iconSource,
	withChevron = false,
	suffix,
	uid,
	onClick,
	href,
	isActive,
	children,
	...props
} ) {
	const navState = useSidebarNavigation();

	function handleClick( e ) {
		if ( onClick ) {
			onClick( e );
			if ( withChevron && navState ) {
				navState.navigate( 'forward', `[id="${ uid }"]` );
			}
		}
	}

	// `@wordpress/components` Item renders as `<button>` whenever its
	// `onClick` prop is defined — `as = onClick !== undefined ? 'button' : 'div'`
	// in build-module/item-group/item/hook.mjs. That ignores href and
	// breaks anchor-style navigation. Force `as="a"` when href is set
	// so the element renders as a real anchor (browser-native click,
	// middle-click new tab, right-click "Copy link"). Pass onClick only
	// when the caller actually supplied one.
	const isLink = !! href;
	const itemProps = isLink
		? { as: 'a', href, onClick: onClick ? handleClick : undefined }
		: { onClick: handleClick };

	return (
		<Item
			className={ `wp-admin-shell-sidebar-navigation-item ${
				! withChevron && suffix ? 'with-suffix' : ''
			} ${ className || '' }`.trim() }
			id={ uid }
			aria-current={ isActive ? 'true' : undefined }
			{ ...itemProps }
			{ ...props }
		>
			<Stack direction="row" justify="flex-start" align="center" gap="sm">
				{ iconSource ? (
					<ArbitraryIcon iconSource={ iconSource } size={ 24 } />
				) : (
					icon && (
						<Icon
							style={ { fill: 'currentcolor' } }
							icon={ icon }
							size={ 24 }
						/>
					)
				) }
				<FlexBlock>{ children }</FlexBlock>
				{ withChevron && (
					<Icon
						icon={ isRTL() ? chevronLeftSmall : chevronRightSmall }
						className="wp-admin-shell-sidebar-navigation-item__drilldown-indicator"
						size={ 24 }
					/>
				) }
				{ ! withChevron && suffix }
			</Stack>
		</Item>
	);
}
