import { useEffect } from '@wordpress/element';

import { navigate } from '../routing/router';
import { installAdminLinkInterceptor } from './adminLinkInterceptor.mjs';

/**
 * Effect-only component that installs the capture-phase admin-link
 * interceptor for the life of the mount (W4). Clicks on classic
 * `/wp-admin/...` links that map to a workspace route (via the admin-
 * route registry's `legacy_path` / `legacy_query`) hash-navigate inside
 * the shell instead of doing a full page load. Unmapped same-origin admin
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
		const shell =
			typeof window !== 'undefined' ? window.wpAdminShell : null;
		const adminUrl = ( shell && shell.adminUrl ) || '/wp-admin/';
		const routes = ( shell && shell.adminRoutes ) || {};
		return installAdminLinkInterceptor( adminUrl, { routes, navigate } );
	}, [] );

	return null;
}
