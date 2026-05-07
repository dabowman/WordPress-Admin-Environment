import {
	Button,
	Card,
	Stack,
	Text,
} from '@wordpress/ui';
import {
	__experimentalGrid as Grid,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { navigate } from '../../runtime/routing/router';

const TOOLS = [
	{
		id: 'site-health',
		title: __( 'Site Health', 'wp-admin-shell' ),
		description: __(
			'Check that your site is running on the latest WordPress and that key services are reachable.',
			'wp-admin-shell'
		),
		appId: 'site-health',
	},
	{
		id: 'import',
		title: __( 'Import', 'wp-admin-shell' ),
		description: __(
			'Pull content into this site from another WordPress install or a third-party platform.',
			'wp-admin-shell'
		),
		legacy: 'import.php',
	},
	{
		id: 'export',
		title: __( 'Export', 'wp-admin-shell' ),
		description: __(
			'Download an XML archive of posts, pages, comments, custom fields, terms, and authors.',
			'wp-admin-shell'
		),
		legacy: 'export.php',
	},
	{
		id: 'export-personal-data',
		title: __( 'Export personal data', 'wp-admin-shell' ),
		description: __(
			'Generate a privacy-compliant export of a user’s personal data on request.',
			'wp-admin-shell'
		),
		legacy: 'export-personal-data.php',
	},
	{
		id: 'erase-personal-data',
		title: __( 'Erase personal data', 'wp-admin-shell' ),
		description: __(
			'Delete a user’s personal data on request.',
			'wp-admin-shell'
		),
		legacy: 'erase-personal-data.php',
	},
];

function adminUrl( legacy ) {
	const base = window.wpAdminShell?.adminUrl || '/wp-admin/';
	return base + legacy;
}

export default function ToolsApp() {
	return (
		<div className="wp-admin-shell-app-tools">
			<Stack direction="column" gap="xl">
				<Stack direction="column" gap="xs">
					<Text variant="heading-xl" render={ <h1 /> }>
						{ __( 'Tools', 'wp-admin-shell' ) }
					</Text>
					<Text variant="body-md">
						{ __(
							'Routine maintenance tasks. Some still link out to the legacy WordPress screens.',
							'wp-admin-shell'
						) }
					</Text>
				</Stack>

				<Grid columns={ 2 } gap={ 4 }>
					{ TOOLS.map( ( tool ) => (
						<Card.Root key={ tool.id }>
							<Card.Header>
								<Card.Title>
									<Text variant="heading-md" render={ <h2 /> }>
										{ tool.title }
									</Text>
								</Card.Title>
							</Card.Header>
							<Card.Content>
								<Stack direction="column" gap="md">
									<Text variant="body-sm">
										{ tool.description }
									</Text>
									{ tool.appId ? (
										<Button
											tone="neutral"
											variant="outline"
											onClick={ () =>
												navigate( tool.appId )
											}
										>
											{ __(
												'Open',
												'wp-admin-shell'
											) }
										</Button>
									) : (
										<Button
											tone="neutral"
											variant="outline"
											onClick={ () =>
												( window.location.href =
													adminUrl( tool.legacy ) )
											}
										>
											{ __(
												'Open',
												'wp-admin-shell'
											) }
										</Button>
									) }
								</Stack>
							</Card.Content>
						</Card.Root>
					) ) }
				</Grid>
			</Stack>
		</div>
	);
}
