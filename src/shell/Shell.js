import { resolveConfig } from '../config/resolveConfig';
import { RouterProvider } from '../routing/router';
import { ShellLayout } from './ShellLayout';

export default function Shell() {
	if ( ! window.wpAdminShell?.config ) {
		return <div>Shell configuration not found.</div>;
	}

	const config = resolveConfig( window.wpAdminShell.config );

	return (
		<RouterProvider>
			<ShellLayout config={ config } />
		</RouterProvider>
	);
}
