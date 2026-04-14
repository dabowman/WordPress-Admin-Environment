import { Button, Icon, __experimentalVStack as VStack } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { resolveIcon } from '../config/iconMap';
import { navigate, useRoute } from '../routing/router';

/**
 * Renders the sidebar navigation from the config's navigation array.
 */
export function ShellNavigation( { config } ) {
	const { path } = useRoute();
	const currentAppId = path[ 0 ] || config.defaultApp;
	const isCollapsed = config.layout.navigationCollapsed;

	return (
		<nav
			className={ `wp-admin-shell-nav${
				isCollapsed ? ' is-collapsed' : ''
			}` }
			style={ {
				'--wp-admin-shell-nav-width':
					config.layout.navigationWidth + 'px',
			} }
		>
			<div className="wp-admin-shell-nav__header">
				{ config.branding.logo && (
					<img
						src={
							config.branding.logo.startsWith( 'http' )
								? config.branding.logo
								: window.wpAdminShell.pluginUrl +
								  config.branding.logo.replace( /^\.\//, '' )
						}
						alt=""
						className="wp-admin-shell-nav__logo"
					/>
				) }
				{ ! isCollapsed && (
					<span className="wp-admin-shell-nav__title">
						{ config.branding.title ||
							window.wpAdminShell.siteName }
					</span>
				) }
			</div>

			<VStack spacing={ 1 } className="wp-admin-shell-nav__items">
				{ config.navigation.map( ( item, index ) =>
					renderNavItem( item, index, config, currentAppId, isCollapsed )
				) }
			</VStack>
		</nav>
	);
}

function renderNavItem( item, index, config, currentAppId, isCollapsed ) {
	if ( item.separator ) {
		return (
			<hr key={ `sep-${ index }` } className="wp-admin-shell-nav__separator" />
		);
	}

	if ( item.group ) {
		return (
			<div key={ `group-${ index }` } className="wp-admin-shell-nav__group">
				{ ! isCollapsed && (
					<span className="wp-admin-shell-nav__group-label">
						{ item.group }
					</span>
				) }
				<VStack spacing={ 1 }>
					{ ( item.items || [] ).map( ( child, childIndex ) =>
						renderNavItem(
							child,
							`${ index }-${ childIndex }`,
							config,
							currentAppId,
							isCollapsed
						)
					) }
				</VStack>
			</div>
		);
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
				{ ! isCollapsed && <span>{ item.label }</span> }
			</a>
		);
	}

	if ( item.app ) {
		const app = config.applications.find( ( a ) => a.id === item.app );
		if ( ! app ) {
			return null;
		}

		const isActive = currentAppId === app.id;

		return (
			<Button
				key={ app.id }
				className={ `wp-admin-shell-nav__item${
					isActive ? ' is-active' : ''
				}` }
				icon={ resolveIcon( app.icon ) }
				onClick={ () => navigate( app.id ) }
				label={ app.title }
				showTooltip={ isCollapsed }
			>
				{ ! isCollapsed && app.title }
			</Button>
		);
	}

	return null;
}
