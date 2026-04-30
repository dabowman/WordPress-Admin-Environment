import { useEntityRecord } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import {
	Button,
	TextControl,
	TextareaControl,
	SelectControl,
	Spinner,
	__experimentalVStack as VStack,
	__experimentalHeading as Heading,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function ProfileApp() {
	const userId = window.wpAdminShell.userId;
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'user', userId );

	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

	if ( ! record ) {
		return (
			<div className="wp-admin-shell-app-profile__loading">
				<Spinner />
			</div>
		);
	}

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
			<VStack spacing={ 5 }>
				<Heading level={ 2 }>
					{ __( 'Profile', 'wp-admin-shell' ) }
				</Heading>

				<TextControl
					label={ __( 'First Name', 'wp-admin-shell' ) }
					value={ editedRecord.first_name || '' }
					onChange={ ( val ) => edit( { first_name: val } ) }
					__nextHasNoMarginBottom
				/>
				<TextControl
					label={ __( 'Last Name', 'wp-admin-shell' ) }
					value={ editedRecord.last_name || '' }
					onChange={ ( val ) => edit( { last_name: val } ) }
					__nextHasNoMarginBottom
				/>
				<TextControl
					label={ __( 'Nickname', 'wp-admin-shell' ) }
					value={ editedRecord.nickname || '' }
					onChange={ ( val ) => edit( { nickname: val } ) }
					__nextHasNoMarginBottom
				/>
				<SelectControl
					label={ __( 'Display Name', 'wp-admin-shell' ) }
					value={ editedRecord.name || '' }
					options={ displayNameOptions }
					onChange={ ( val ) => edit( { name: val } ) }
					__nextHasNoMarginBottom
				/>
				<TextControl
					label={ __( 'Email', 'wp-admin-shell' ) }
					type="email"
					value={ editedRecord.email || '' }
					onChange={ ( val ) => edit( { email: val } ) }
					__nextHasNoMarginBottom
				/>
				<TextControl
					label={ __( 'Website', 'wp-admin-shell' ) }
					type="url"
					value={ editedRecord.url || '' }
					onChange={ ( val ) => edit( { url: val } ) }
					__nextHasNoMarginBottom
				/>
				<TextareaControl
					label={ __( 'Biographical Info', 'wp-admin-shell' ) }
					value={ editedRecord.description || '' }
					onChange={ ( val ) => edit( { description: val } ) }
					rows={ 5 }
					__nextHasNoMarginBottom
				/>

				<Button
					variant="primary"
					onClick={ handleSave }
					disabled={ ! hasEdits || isSaving }
					isBusy={ isSaving }
				>
					{ __( 'Save Changes', 'wp-admin-shell' ) }
				</Button>
			</VStack>
		</div>
	);
}
