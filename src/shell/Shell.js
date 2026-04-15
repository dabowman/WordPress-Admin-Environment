import { resolveConfig } from '../config/resolveConfig';
import { RouterProvider } from '../routing/router';
import { ShellLayout } from './ShellLayout';
import { useShellCommands } from '../commands/useShellCommands';

function ShellInner( { config } ) {
	useShellCommands( config );
	return <ShellLayout config={ config } />;
}

export default function Shell() {
	if ( ! window.wpAdminShell?.config ) {
		return <div>Shell configuration not found.</div>;
	}

	const config = resolveConfig( window.wpAdminShell.config );

	return (
		<RouterProvider>
			<ShellInner config={ config } />
		</RouterProvider>
	);
}
