import './user-menu/index.css';
import { DropdownMenu } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { moreVertical } from '@wordpress/icons';

/**
 * core:user-menu — current-user affordance (avatar + dropdown).
 *
 * Reads `window.wpAdminShell.user` for displayName / avatarUrl /
 * profileUrl / logoutUrl. Renders an avatar trigger that opens a
 * dropdown with Profile + Log out + (when more than one shell is
 * available + the active shell is `user-switchable`) a Switch shell
 * submenu.
 *
 * Engines mount this in the toolbar end-region (or wherever the shell
 * authors place it). Spec §15 names it as a v1 built-in.
 */
export default function UserMenuApp() {
	const user = window.wpAdminShell?.user || {};
	const displayName = user.displayName || __( 'User', 'wp-admin-shell' );
	const avatarUrl = user.avatarUrl || '';
	const profileUrl = user.profileUrl || '#/profile';
	const logoutUrl = user.logoutUrl || '';

	const shells = window.wpAdminShell?.shells || [];
	const switchableShells = shells.filter( ( s ) => s.userSwitchable );
	const showShellSwitcher = switchableShells.length > 1;

	const controls = useMemo( () => {
		const out = [
			{
				title: __( 'Profile', 'wp-admin-shell' ),
				onClick: () => {
					if ( typeof window !== 'undefined' ) {
						window.location.hash = profileUrl.replace( /^#/, '' )
							? profileUrl
							: '#/profile';
					}
				},
			},
		];

		if ( showShellSwitcher && typeof window?.wpAdminShell?.switchShell === 'function' ) {
			for ( const s of switchableShells ) {
				out.push( {
					title: `${ __( 'Switch to', 'wp-admin-shell' ) } ${ s.title }`,
					onClick: () => window.wpAdminShell.switchShell( s.slug ),
				} );
			}
		}

		if ( logoutUrl ) {
			out.push( {
				title: __( 'Log out', 'wp-admin-shell' ),
				onClick: () => {
					window.location.href = logoutUrl;
				},
			} );
		}

		return out;
	}, [ profileUrl, logoutUrl, showShellSwitcher, switchableShells ] );

	const trigger = avatarUrl ? (
		<img
			className="wp-admin-shell-user-menu__avatar"
			src={ avatarUrl }
			alt=""
			width={ 24 }
			height={ 24 }
		/>
	) : null;

	return (
		<div className="wp-admin-shell-user-menu">
			<DropdownMenu
				icon={ trigger || moreVertical }
				label={ displayName }
				toggleProps={ {
					className: 'wp-admin-shell-user-menu__toggle',
					'aria-label': displayName,
				} }
				controls={ controls }
			/>
		</div>
	);
}
