import { useEntityRecord } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import {
	Button,
	Stack,
	Text,
} from '@wordpress/ui';
import {
	RadioControl,
	Spinner,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Discussion Settings — REST-covered fields only:
 *   - default_comment_status (open | closed)
 *   - default_ping_status    (open | closed)
 *
 * Most fine-grained discussion settings (avatar, comment moderation,
 * blacklists, comment depth) are NOT REST-exposed; users who need them
 * fall back to options-discussion.php through the iframe panel.
 */
export default function SettingsDiscussionApp() {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );
	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

	if ( ! record ) {
		return <div className="wp-admin-shell-app-settings__loading"><Spinner /></div>;
	}

	const handleSave = async () => {
		try {
			await save();
			createSuccessNotice( __( 'Settings saved.', 'wp-admin-shell' ), { type: 'snackbar' } );
		} catch ( err ) {
			createErrorNotice( err.message || __( 'Save failed.', 'wp-admin-shell' ), { isDismissible: true } );
		}
	};

	return (
		<Stack direction="column" gap="xl">
			<Text variant="heading-xl" render={ <h2 /> }>
				{ __( 'Discussion Settings', 'wp-admin-shell' ) }
			</Text>

			<Text variant="body-md">
				{ __(
					'Only the comment + ping defaults are REST-exposed. Use the iframe panel below for the full Discussion screen.',
					'wp-admin-shell'
				) }
			</Text>

			<RadioControl
				label={ __( 'Default comment status on new posts', 'wp-admin-shell' ) }
				selected={ editedRecord.default_comment_status ?? 'open' }
				options={ [
					{ label: __( 'Allow comments', 'wp-admin-shell' ), value: 'open' },
					{ label: __( 'Disable comments', 'wp-admin-shell' ), value: 'closed' },
				] }
				onChange={ ( val ) => edit( { default_comment_status: val } ) }
			/>

			<RadioControl
				label={ __( 'Default trackback / pingback status on new posts', 'wp-admin-shell' ) }
				selected={ editedRecord.default_ping_status ?? 'open' }
				options={ [
					{ label: __( 'Allow', 'wp-admin-shell' ), value: 'open' },
					{ label: __( 'Disable', 'wp-admin-shell' ), value: 'closed' },
				] }
				onChange={ ( val ) => edit( { default_ping_status: val } ) }
			/>

			<Button
				tone="brand"
				variant="solid"
				onClick={ handleSave }
				disabled={ ! hasEdits || isSaving }
				loading={ isSaving }
			>
				{ __( 'Save changes', 'wp-admin-shell' ) }
			</Button>
		</Stack>
	);
}
