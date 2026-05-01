import { useState } from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import {
	Button,
	Stack,
	Text,
	Notice,
} from '@wordpress/ui';
import {
	CheckboxControl,
	Spinner,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function SettingsDiscussionApp() {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );

	const [ notice, setNotice ] = useState( null );

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app-settings-discussion__loading">
				<Spinner />
			</div>
		);
	}

	const handleSave = async () => {
		try {
			await save();
			setNotice( {
				intent: 'success',
				message: __( 'Settings saved.', 'wp-admin-shell' ),
			} );
		} catch ( err ) {
			setNotice( {
				intent: 'error',
				message:
					err.message ||
					__( 'Failed to save settings.', 'wp-admin-shell' ),
			} );
		}
	};

	return (
		<div className="wp-admin-shell-app-settings-discussion">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'Discussion', 'wp-admin-shell' ) }
				</Text>

				{ notice && (
					<Notice.Root intent={ notice.intent }>
						<Notice.Description>
							{ notice.message }
						</Notice.Description>
						<Notice.Actions>
							<Notice.CloseIcon
								onClick={ () => setNotice( null ) }
							/>
						</Notice.Actions>
					</Notice.Root>
				) }

				<Stack direction="column" gap="md">
					<Text variant="heading-md" render={ <h3 /> }>
						{ __( 'Default post settings', 'wp-admin-shell' ) }
					</Text>
					<CheckboxControl
						label={ __(
							'Allow people to submit comments on new posts',
							'wp-admin-shell'
						) }
						checked={
							editedRecord.default_comment_status === 'open'
						}
						onChange={ ( v ) =>
							edit( {
								default_comment_status: v ? 'open' : 'closed',
							} )
						}
						__nextHasNoMarginBottom
					/>
					<CheckboxControl
						label={ __(
							'Allow link notifications from other blogs (pingbacks and trackbacks)',
							'wp-admin-shell'
						) }
						checked={ editedRecord.default_ping_status === 'open' }
						onChange={ ( v ) =>
							edit( {
								default_ping_status: v ? 'open' : 'closed',
							} )
						}
						__nextHasNoMarginBottom
					/>
				</Stack>

				<Divider />

				<Text variant="body-sm">
					{ __(
						'The fine-grained discussion settings (comment moderation rules, blocklists, avatars) are not exposed by the WordPress REST API. Use the legacy Discussion Settings screen for those fields.',
						'wp-admin-shell'
					) }
				</Text>

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
