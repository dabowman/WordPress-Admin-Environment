import { ShellNavigation } from './ShellNavigation';
import { ShellToolbar } from './ShellToolbar';
import { ShellContent } from './ShellContent';

/**
 * Main layout — renders nav, toolbar, and content regions.
 */
export function ShellLayout( { config } ) {
	const showNav = config.layout.navigation !== 'hidden';

	return (
		<div
			className="wp-admin-shell-layout"
			style={ {
				'--wp-admin-shell-accent':
					config.branding.accentColor || '#3858e9',
			} }
		>
			{ config.layout.toolbar && <ShellToolbar config={ config } /> }

			<div className="wp-admin-shell-layout__body">
				{ showNav && <ShellNavigation config={ config } /> }

				<main className="wp-admin-shell-content">
					<ShellContent config={ config } />
				</main>
			</div>
		</div>
	);
}
