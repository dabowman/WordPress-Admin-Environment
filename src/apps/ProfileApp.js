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
	TextareaControl,
	SelectControl,
	Spinner,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function ProfileApp() {
	const userId = window.wpAdminShell?.userId;
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'user', userId );

	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

	if ( ! userId ) {
		return (
			<div className="wp-admin-shell-app-profile__error">
				<Text>
					{ __(
						'Profile unavailable: missing user context.',
						'wp-admin-shell'
					) }
				</Text>
			</div>
		);
	}

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app-profile__loading">
				<Spinner />
			</div>
		);
	}

	const eventValue = ( e ) => e.target.value;

	const handleSave = async () => {
		try {
			await save();
			createSuccessNotice( __( 'Profile updated.', 'wp-admin-shell' ), {
				type: 'snackbar',
			} );
		} catch ( err ) {
			createErrorNotice(
				err.message || __( 'Failed to save profile.', 'wp-admin-shell' ),
				{ isDismissible: true }
			);
		}
	};

	// Display name options from available fields.
	const displayNameOptions = [];
	const addOption = ( val ) => {
		if ( val && ! displayNameOptions.find( ( o ) => o.value === val ) ) {
			displayNameOptions.push( { value: val, label: val } );
		}
	};
	addOption( record.username );
	addOption( record.first_name );
	addOption( record.last_name );
	if ( record.first_name && record.last_name ) {
		addOption( `${ record.first_name } ${ record.last_name }` );
		addOption( `${ record.last_name } ${ record.first_name }` );
	}
	addOption( record.nickname );
	addOption( record.name );

	return (
		<div className="wp-admin-shell-app-profile">
			<Stack direction="column" gap="xl">
				<Text variant="heading-lg" render={ <h2 /> }>
					{ __( 'Profile', 'wp-admin-shell' ) }
				</Text>

				<InputControl
					label={ __( 'First Name', 'wp-admin-shell' ) }
					value={ editedRecord.first_name || '' }
					onChange={ ( e ) =>
						edit( { first_name: eventValue( e ) } )
					}
				/>
				<InputControl
					label={ __( 'Last Name', 'wp-admin-shell' ) }
					value={ editedRecord.last_name || '' }
					onChange={ ( e ) =>
						edit( { last_name: eventValue( e ) } )
					}
				/>
				<InputControl
					label={ __( 'Nickname', 'wp-admin-shell' ) }
					value={ editedRecord.nickname || '' }
					onChange={ ( e ) =>
						edit( { nickname: eventValue( e ) } )
					}
				/>
				<SelectControl
					label={ __( 'Display Name', 'wp-admin-shell' ) }
					value={ editedRecord.name || '' }
					options={ displayNameOptions }
					onChange={ ( val ) => edit( { name: val } ) }
					__nextHasNoMarginBottom
				/>
				<InputControl
					label={ __( 'Email', 'wp-admin-shell' ) }
					type="email"
					value={ editedRecord.email || '' }
					onChange={ ( e ) => edit( { email: eventValue( e ) } ) }
				/>
				<InputControl
					label={ __( 'Website', 'wp-admin-shell' ) }
					type="url"
					value={ editedRecord.url || '' }
					onChange={ ( e ) => edit( { url: eventValue( e ) } ) }
				/>
				<TextareaControl
					label={ __( 'Biographical Info', 'wp-admin-shell' ) }
					value={ editedRecord.description || '' }
					onChange={ ( val ) => edit( { description: val } ) }
					rows={ 5 }
					__nextHasNoMarginBottom
				/>

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
