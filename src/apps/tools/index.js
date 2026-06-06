/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalGrid has no @wordpress/ui 0.12 port. */
import '../_shared/app.css';
import { Button, Card, Stack, Text } from '@wordpress/ui';
import { __experimentalGrid as Grid } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { navigate } from '../../runtime/routing/router';
import { filterReachableTools } from './filterReachableTools.mjs';

// Each card routes to its in-workspace screen via the router (`navigate`),
// keeping the user inside the workspace chrome. `path` is the screen's
// `path` in workspace.json (the route key the kernel synthesizes), NOT a bare
// screen id — `navigate()` operates on URL paths, so it must match the
// resolved route exactly. The default workspace wraps the legacy
// import/export/personal-data tools in `iframe:` screens at these paths;
// Site Health is a native sibling app on the same `/tools/*` prefix.
const TOOLS = [
	{
		id: 'site-health',
		title: __( 'Site Health', 'wp-admin-workspaces' ),
		description: __(
			'Check that your site is running on the latest WordPress and that key services are reachable.',
			'wp-admin-workspaces'
		),
		path: '/tools/site-health',
	},
	{
		id: 'import',
		title: __( 'Import', 'wp-admin-workspaces' ),
		description: __(
			'Pull content into this site from another WordPress install or a third-party platform.',
			'wp-admin-workspaces'
		),
		path: '/tools/import',
	},
	{
		id: 'export',
		title: __( 'Export', 'wp-admin-workspaces' ),
		description: __(
			'Download an XML archive of posts, pages, comments, custom fields, terms, and authors.',
			'wp-admin-workspaces'
		),
		path: '/tools/export',
	},
	{
		id: 'export-personal-data',
		title: __( 'Export personal data', 'wp-admin-workspaces' ),
		description: __(
			'Generate a privacy-compliant export of a user’s personal data on request.',
			'wp-admin-workspaces'
		),
		path: '/tools/export-personal-data',
	},
	{
		id: 'erase-personal-data',
		title: __( 'Erase personal data', 'wp-admin-workspaces' ),
		description: __(
			'Delete a user’s personal data on request.',
			'wp-admin-workspaces'
		),
		path: '/tools/erase-personal-data',
	},
];

export default function ToolsApp() {
	// Only surface a card when its target screen survived the server's
	// per-user prune (`wp_admin_workspaces_prune_config_for_user`) — i.e.
	// when `navigate( tool.path )` will actually resolve. Without this, a
	// user who reaches the (loosely-gated) Tools landing but lacks a tool's
	// capability would click a card that routes to a pruned screen and
	// falls through to the default route — a silent dead route (issue #207).
	const tools = filterReachableTools(
		TOOLS,
		window.wpAdminWorkspaces?.config?.screens
	);

	return (
		<div className="wp-admin-workspaces-app-tools wp-admin-workspaces-app--inset">
			<Stack direction="column" gap="xl">
				<Stack direction="column" gap="xs">
					<Text variant="heading-xl" render={ <h1 /> }>
						{ __( 'Tools', 'wp-admin-workspaces' ) }
					</Text>
					<Text variant="body-md">
						{ __(
							'Routine maintenance tasks. Each opens inside the workspace; some are presented as the classic WordPress screen.',
							'wp-admin-workspaces'
						) }
					</Text>
				</Stack>

				{ tools.length === 0 ? (
					<Text variant="body-md">
						{ __(
							'You don’t have permission to use any of these tools.',
							'wp-admin-workspaces'
						) }
					</Text>
				) : (
					<Grid columns={ 2 } gap={ 4 }>
						{ tools.map( ( tool ) => (
							<Card.Root key={ tool.id }>
								<Card.Header>
									<Card.Title>
										<Text
											variant="heading-md"
											render={ <h2 /> }
										>
											{ tool.title }
										</Text>
									</Card.Title>
								</Card.Header>
								<Card.Content>
									<Stack direction="column" gap="md">
										<Text variant="body-sm">
											{ tool.description }
										</Text>
										<Button
											tone="neutral"
											variant="outline"
											onClick={ () =>
												navigate( tool.path )
											}
										>
											{ __(
												'Open',
												'wp-admin-workspaces'
											) }
										</Button>
									</Stack>
								</Card.Content>
							</Card.Root>
						) ) }
					</Grid>
				) }
			</Stack>
		</div>
	);
}
