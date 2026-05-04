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

	return (
		<Item
			className={ `wp-admin-shell-sidebar-nav-item ${
				isActive ? 'is-active' : ''
			} ${ ! withChevron && suffix ? 'with-suffix' : '' } ${
				className || ''
			}`.trim() }
			id={ uid }
			onClick={ handleClick }
			href={ href }
			aria-current={ isActive ? 'true' : undefined }
			{ ...props }
		>
			<Stack direction="row" justify="flex-start">
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
