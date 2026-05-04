import { useEntityRecord } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import {
	Button,
	InputControl,
	Stack,
	Text,
} from '@wordpress/ui';
import {
	RadioControl,
	CheckboxControl,
	Spinner,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Reading Settings — REST-covered fields:
 *   - show_on_front, page_on_front, page_for_posts
 *   - posts_per_page, posts_per_rss, rss_use_excerpt
 *   - default_comment_status, default_ping_status
 *
 * The blog_public toggle (search-engine visibility) is NOT exposed via
 * /wp/v2/settings; surface it via options-reading.php iframe if needed.
 */
export default function SettingsReadingApp() {
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
				{ __( 'Reading Settings', 'wp-admin-shell' ) }
			</Text>

			<RadioControl
				label={ __( 'Front page displays', 'wp-admin-shell' ) }
				selected={ editedRecord.show_on_front ?? 'posts' }
				options={ [
					{ label: __( 'Your latest posts', 'wp-admin-shell' ), value: 'posts' },
					{ label: __( 'A static page', 'wp-admin-shell' ), value: 'page' },
				] }
				onChange={ ( val ) => edit( { show_on_front: val } ) }
			/>

			{ editedRecord.show_on_front === 'page' && (
				<>
					<InputControl
						label={ __( 'Front page (page ID)', 'wp-admin-shell' ) }
						value={ String( editedRecord.page_on_front ?? '' ) }
						onChange={ ( e ) => edit( { page_on_front: parseInt( e.target.value, 10 ) || 0 } ) }
						type="number"
					/>
					<InputControl
						label={ __( 'Posts page (page ID)', 'wp-admin-shell' ) }
						value={ String( editedRecord.page_for_posts ?? '' ) }
						onChange={ ( e ) => edit( { page_for_posts: parseInt( e.target.value, 10 ) || 0 } ) }
						type="number"
					/>
				</>
			) }

			<InputControl
				label={ __( 'Posts per page', 'wp-admin-shell' ) }
				value={ String( editedRecord.posts_per_page ?? 10 ) }
				onChange={ ( e ) => edit( { posts_per_page: parseInt( e.target.value, 10 ) || 10 } ) }
				type="number"
			/>

			<InputControl
				label={ __( 'Posts in feed', 'wp-admin-shell' ) }
				value={ String( editedRecord.posts_per_rss ?? 10 ) }
				onChange={ ( e ) => edit( { posts_per_rss: parseInt( e.target.value, 10 ) || 10 } ) }
				type="number"
			/>

			<CheckboxControl
				label={ __( 'Show summary in feed (instead of full text)', 'wp-admin-shell' ) }
				checked={ !! editedRecord.rss_use_excerpt }
				onChange={ ( val ) => edit( { rss_use_excerpt: val } ) }
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
