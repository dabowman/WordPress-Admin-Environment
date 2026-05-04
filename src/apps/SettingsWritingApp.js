import { useEffect, useState } from '@wordpress/element';
import { useEntityRecord, useEntityRecords } from '@wordpress/core-data';
import {
	Button,
	Stack,
	Text,
	Notice,
} from '@wordpress/ui';
import {
	SelectControl,
	Spinner,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const POST_FORMAT_OPTIONS = [
	{ value: 'standard', label: __( 'Standard', 'wp-admin-shell' ) },
	{ value: 'aside', label: __( 'Aside', 'wp-admin-shell' ) },
	{ value: 'chat', label: __( 'Chat', 'wp-admin-shell' ) },
	{ value: 'gallery', label: __( 'Gallery', 'wp-admin-shell' ) },
	{ value: 'link', label: __( 'Link', 'wp-admin-shell' ) },
	{ value: 'image', label: __( 'Image', 'wp-admin-shell' ) },
	{ value: 'quote', label: __( 'Quote', 'wp-admin-shell' ) },
	{ value: 'status', label: __( 'Status', 'wp-admin-shell' ) },
	{ value: 'video', label: __( 'Video', 'wp-admin-shell' ) },
	{ value: 'audio', label: __( 'Audio', 'wp-admin-shell' ) },
];

export default function SettingsWritingApp() {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'site' );

	const categories = useEntityRecords( 'taxonomy', 'category', {
		per_page: 100,
		orderby: 'name',
		order: 'asc',
		hide_empty: false,
	} );

	const [ notice, setNotice ] = useState( null );

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app-settings-writing__loading">
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

	const categoryOptions = ( categories.records || [] ).map( ( c ) => ( {
		value: c.id,
		label: c.name,
	} ) );

	return (
		<div className="wp-admin-shell-app-settings-writing">
			<Stack direction="column" gap="xl">
				<Text variant="heading-xl" render={ <h2 /> }>
					{ __( 'Writing', 'wp-admin-shell' ) }
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

				<SelectControl
					label={ __( 'Default Post Category', 'wp-admin-shell' ) }
					value={ String( editedRecord.default_category ?? '' ) }
					options={ categoryOptions.map( ( o ) => ( {
						...o,
						value: String( o.value ),
					} ) ) }
					onChange={ ( val ) =>
						edit( { default_category: parseInt( val, 10 ) } )
					}
					help={ __(
						'New posts get this category if you do not pick one.',
						'wp-admin-shell'
					) }
					__nextHasNoMarginBottom
				/>

				<SelectControl
					label={ __( 'Default Post Format', 'wp-admin-shell' ) }
					value={ editedRecord.default_post_format || 'standard' }
					options={ POST_FORMAT_OPTIONS }
					onChange={ ( val ) =>
						edit( { default_post_format: val } )
					}
					__nextHasNoMarginBottom
				/>

				<Divider />

				<Text variant="body-sm">
					{ __(
						'Post via email and remote-publishing settings are not exposed by the WordPress REST API. Use the legacy Writing Settings screen for those fields.',
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
