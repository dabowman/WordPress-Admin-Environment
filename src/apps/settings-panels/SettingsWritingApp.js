import { useEntityRecord } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import {
	Button,
	InputControl,
	Stack,
	Text,
} from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Writing Settings — REST-covered fields only:
 *   - default_category   (number; settings.default_category)
 *   - default_post_format (string; settings.default_post_format)
 *
 * Post-via-email + remote-publishing are not REST-exposed; users who
 * need them fall back to options-writing.php through the iframe panel.
 */
export default function SettingsWritingApp() {
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
				{ __( 'Writing Settings', 'wp-admin-shell' ) }
			</Text>

			<InputControl
				label={ __( 'Default post category (ID)', 'wp-admin-shell' ) }
				description={ __(
					'Numeric ID of the category assigned to new posts.',
					'wp-admin-shell'
				) }
				value={ String( editedRecord.default_category ?? '' ) }
				onChange={ ( e ) => edit( { default_category: parseInt( e.target.value, 10 ) || 0 } ) }
				type="number"
			/>

			<InputControl
				label={ __( 'Default post format', 'wp-admin-shell' ) }
				description={ __(
					'Format slug (e.g. standard, aside, gallery, link, image, quote, status, video, audio, chat).',
					'wp-admin-shell'
				) }
				value={ editedRecord.default_post_format ?? '' }
				onChange={ ( e ) => edit( { default_post_format: e.target.value } ) }
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
