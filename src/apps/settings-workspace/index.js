import '../_shared/app.css';
import './index.css';
import { useState, useCallback } from '@wordpress/element';
import { DataForm } from '@wordpress/dataviews/wp';
import { useEntityRecord } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { Button, Notice, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * "Activate WP Admin Workspace" toggle. Mirrors the other DataForm settings
 * panels (Reading / Writing / Discussion) but adds a contextual reload
 * notice after a save that flipped the value — applying the change
 * requires re-running the workspace-active gate at the next request, so a
 * reload is the natural prompt.
 *
 * Re-enabling from classic happens via the parallel Settings → WP Admin
 * Shell page registered in `wp-admin-shell.php` (same option, same
 * sanitize callback, same settings group).
 */

const FIELDS = [
	{
		id: 'wp_admin_shell_workspace_enabled',
		type: 'boolean',
		label: __( 'Activate WP Admin Workspace', 'wp-admin-shell' ),
		description: __(
			'When enabled, the workspace replaces classic wp-admin at /wp-admin/. Disable to fall back to classic.',
			'wp-admin-shell'
		),
	},
];

const FORM = {
	fields: [ 'wp_admin_shell_workspace_enabled' ],
};

export default function SettingsWorkspaceApp() {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );
	const { createNotice } = useDispatch( noticesStore );
	const [ pendingReload, setPendingReload ] = useState( false );

	const handleSave = useCallback( async () => {
		const before = !! record?.wp_admin_shell_workspace_enabled;
		const after = !! editedRecord?.wp_admin_shell_workspace_enabled;
		try {
			await save();
			if ( before !== after ) {
				setPendingReload( true );
			}
			createNotice(
				'success',
				__( 'Workspace setting saved.', 'wp-admin-shell' ),
				{ type: 'snackbar' }
			);
		} catch ( err ) {
			createNotice(
				'error',
				__( 'Failed to save workspace setting.', 'wp-admin-shell' ),
				{ type: 'snackbar' }
			);
		}
	}, [ record, editedRecord, save, createNotice ] );

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app__center">
				<Spinner />
			</div>
		);
	}

	return (
		<div className="wp-admin-shell-app-settings-workspace wp-admin-shell-app--inset">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'Workspace', 'wp-admin-shell' ) }
				</Text>

				<DataForm
					data={ editedRecord }
					fields={ FIELDS }
					form={ FORM }
					onChange={ edit }
				/>

				<Text variant="body-sm">
					{ __(
						'To re-enable from classic wp-admin, visit Settings → WP Admin Shell.',
						'wp-admin-shell'
					) }
				</Text>

				{ pendingReload && (
					<Notice.Root intent="info">
						<Notice.Description>
							{ __(
								'Reload the page to apply the change.',
								'wp-admin-shell'
							) }
						</Notice.Description>
						<Notice.Actions>
							<Button
								tone="brand"
								variant="solid"
								onClick={ () => window.location.reload() }
							>
								{ __( 'Reload now', 'wp-admin-shell' ) }
							</Button>
						</Notice.Actions>
					</Notice.Root>
				) }

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save Changes', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
