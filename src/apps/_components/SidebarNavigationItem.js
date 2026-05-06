import {
	__experimentalItem as Item,
	FlexBlock,
} from '@wordpress/components';
import { Icon, Stack } from '@wordpress/ui';
import { isRTL } from '@wordpress/i18n';
import { chevronRightSmall, chevronLeftSmall } from '@wordpress/icons';

import { useSidebarNavigation } from './SidebarNavigationContext';

/**
 * A single item in the sidebar navigation — modeled after the site editor's
 * SidebarNavigationItem. Renders as an interactive Item component with optional
 * icon, chevron drilldown indicator, and suffix.
 *
 * `Item` and `FlexBlock` are kept from `@wordpress/components` — neither
 * has a WPDS port in 0.12. Layout is provided by `Stack`/`Icon` from
 * `@wordpress/ui`.
 */
export default function SidebarNavigationItem( {
	className,
	icon,
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
			className={ `wp-admin-shell-sidebar-nav-item ${
				isActive ? 'is-active' : ''
			} ${ ! withChevron && suffix ? 'with-suffix' : '' } ${
				className || ''
			}`.trim() }
			id={ uid }
			aria-current={ isActive ? 'true' : undefined }
			{ ...itemProps }
			{ ...props }
		>
			<Stack direction="row" justify="flex-start" align="center" gap="sm">
				{ icon && (
					<Icon
						style={ { fill: 'currentcolor' } }
						icon={ icon }
						size={ 24 }
					/>
				) }
				<FlexBlock>{ children }</FlexBlock>
				{ withChevron && (
					<Icon
						icon={
							isRTL() ? chevronLeftSmall : chevronRightSmall
						}
						className="wp-admin-shell-sidebar-nav-item__chevron"
						size={ 24 }
					/>
				) }
				{ ! withChevron && suffix }
			</Stack>
		</Item>
	);
}
