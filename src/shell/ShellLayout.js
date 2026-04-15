import { ShellNavigation } from './ShellNavigation';
import { ShellToolbar } from './ShellToolbar';
import { ShellContent } from './ShellContent';

/**
 * Main layout — renders nav, toolbar, and content regions.
 *
 * The content region supports a multi-area model inspired by the site editor:
 * - A primary content card (always visible)
 * - An optional preview card (shown when the active app provides one)
 *
 * Both content and preview float as elevated cards on the dark chrome background.
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

				<ShellContent config={ config } />
			</div>
		</div>
	);
}
