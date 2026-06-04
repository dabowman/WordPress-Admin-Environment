import { useEffect } from '@wordpress/element';

import { navigate } from '../routing/router';
import { installAdminLinkInterceptor } from './adminLinkInterceptor.mjs';

/**
 * Effect-only component that installs the capture-phase admin-link
 * interceptor for the life of the mount (W4). Clicks on classic
 * `/wp-admin/...` links that map to a workspace route (via the admin-
 * route registry's `legacy_path` / `legacy_query`) hash-navigate inside
 * the workspace instead of doing a full page load. Unmapped same-origin admin
 * links fall through to a normal browser navigation (no in-workspace
 * iframe host is wired for alpha — that's the W6 follow-up).
 *
 * Mirrors the kernel's other side-effect components (NavigationGuard,
 * BindingsConsumer): renders nothing.
 *
 * @return {null} Nothing.
 */
export function AdminLinkInterceptor() {
	useEffect( () => {
		const workspace =
			typeof window !== 'undefined' ? window.wpAdminWorkspaces : null;
		// Always pass an ABSOLUTE admin URL — `classifyAdminLink` does
		// `new URL( adminUrl )` with no base, which throws on a relative
		// string and would silently disable all interception. `admin_url()`
		// is absolute in prod; the fallback must be too.
		const origin =
			typeof window !== 'undefined' && window.location
				? window.location.origin
				: '';
		const adminUrl =
			( workspace && workspace.adminUrl ) || origin + '/wp-admin/';
		const routes = ( workspace && workspace.adminRoutes ) || {};
		return installAdminLinkInterceptor( adminUrl, { routes, navigate } );
	}, [] );

	return null;
}
