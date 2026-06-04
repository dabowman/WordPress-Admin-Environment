import './index.css';
import { DropdownMenu } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { moreVertical } from '@wordpress/icons';

/**
 * core:user-menu — current-user affordance (avatar + dropdown).
 *
 * Reads `window.wpAdminWorkspaces.user` for displayName / avatarUrl /
 * profileUrl / logoutUrl. Renders an avatar trigger that opens a
 * dropdown with Profile + Log out + (when more than one workspace is
 * available + the active workspace is `user-switchable`) a Switch workspace
 * submenu.
 *
 * Engines mount this in the toolbar end-region (or wherever the workspace
 * authors place it). Spec §15 names it as a v1 built-in.
 */
export default function UserMenuApp() {
	const user = window.wpAdminWorkspaces?.user || {};
	const displayName = user.displayName || __( 'User', 'wp-admin-workspaces' );
	const avatarUrl = user.avatarUrl || '';
	const profileUrl = user.profileUrl || '#/profile';
	const logoutUrl = user.logoutUrl || '';

	const workspaces = window.wpAdminWorkspaces?.workspaces || [];
	const switchableWorkspaces = workspaces.filter(
		( s ) => s[ 'user-switchable' ]
	);
	// Hide the switcher when a wp-content/workspace.json override is active — it
	// wins over the active-workspace option, so switching would be a no-op.
	const showWorkspaceSwitcher =
		switchableWorkspaces.length > 1 &&
		! window.wpAdminWorkspaces?.fileActive;

	const controls = useMemo( () => {
		const out = [
			{
				title: __( 'Profile', 'wp-admin-workspaces' ),
				onClick: () => {
					if ( typeof window !== 'undefined' ) {
						window.location.hash = profileUrl.replace( /^#/, '' )
							? profileUrl
							: '#/profile';
					}
				},
			},
		];

		if (
			showWorkspaceSwitcher &&
			typeof window?.wpAdminWorkspaces?.switchWorkspace === 'function'
		) {
			for ( const s of switchableWorkspaces ) {
				out.push( {
					title: `${ __( 'Switch to', 'wp-admin-workspaces' ) } ${
						s.title
					}`,
					onClick: () =>
						window.wpAdminWorkspaces.switchWorkspace( s.slug ),
				} );
			}
		}

		if ( logoutUrl ) {
			out.push( {
				title: __( 'Log out', 'wp-admin-workspaces' ),
				onClick: () => {
					window.location.href = logoutUrl;
				},
			} );
		}

		return out;
	}, [ profileUrl, logoutUrl, showWorkspaceSwitcher, switchableWorkspaces ] );

	const trigger = avatarUrl ? (
		<img
			className="wp-admin-workspaces-user-menu__avatar"
			src={ avatarUrl }
			alt=""
			width={ 24 }
			height={ 24 }
		/>
	) : null;

	return (
		<div className="wp-admin-workspaces-user-menu">
			<DropdownMenu
				icon={ trigger || moreVertical }
				label={ displayName }
				toggleProps={ {
					className: 'wp-admin-workspaces-user-menu__toggle',
					'aria-label': displayName,
				} }
				controls={ controls }
			/>
		</div>
	);
}
