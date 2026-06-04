import './index.css';
import '../_shared/app.css';
import { useMemo } from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import { DataForm } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntitySave } from '../_shared/forms/useEntitySave';
import { Page } from '../_shared/Page';

const FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [
		'first_name',
		'last_name',
		'nickname',
		'name',
		'email',
		'url',
		'description',
	],
};

/**
 * core:profile — single-user edit form.
 *
 * Edits the user named by `config.userId` (the route `config` interpolates
 * `{id}` from `/users/{id}/edit`), falling back to the acting user
 * (`window.wpAdminWorkspaces.userId`) when the screen supplies no `userId` (e.g. the
 * self-service `/profile` screen). The users-app Edit action + username link
 * route here with `config.userId` set, so editing user #5 mutates user #5 —
 * NOT the acting admin.
 *
 * @param {Object} root0          Mount-supplied props.
 * @param {Object} [root0.config] App config — `config.userId` names the user to edit.
 */
export default function ProfileApp( { config = {} } = {} ) {
	const userId = Number( config?.userId ) || window.wpAdminWorkspaces?.userId;
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'user', userId );

	const handleSave = useEntitySave( save, {
		success: __( 'Profile updated.', 'wp-admin-workspaces' ),
		error: __( 'Failed to save profile.', 'wp-admin-workspaces' ),
	} );

	// Display-name options derive from the live edited values, so they update
	// as the user types first / last name. `editedRecord` is null until the
	// record resolves — guard the dependency reads.
	const fields = useMemo( () => {
		const options = [];
		const addOption = ( val ) => {
			if ( val && ! options.find( ( o ) => o.value === val ) ) {
				options.push( { value: val, label: val } );
			}
		};
		const r = editedRecord || {};
		addOption( r.username );
		addOption( r.first_name );
		addOption( r.last_name );
		if ( r.first_name && r.last_name ) {
			addOption( `${ r.first_name } ${ r.last_name }` );
			addOption( `${ r.last_name } ${ r.first_name }` );
		}
		addOption( r.nickname );
		addOption( r.name );

		return [
			{
				id: 'first_name',
				type: 'text',
				label: __( 'First Name', 'wp-admin-workspaces' ),
			},
			{
				id: 'last_name',
				type: 'text',
				label: __( 'Last Name', 'wp-admin-workspaces' ),
			},
			{
				id: 'nickname',
				type: 'text',
				label: __( 'Nickname', 'wp-admin-workspaces' ),
			},
			{
				id: 'name',
				type: 'text',
				label: __( 'Display Name', 'wp-admin-workspaces' ),
				Edit: 'select',
				elements: options,
			},
			{
				id: 'email',
				type: 'email',
				label: __( 'Email', 'wp-admin-workspaces' ),
			},
			{
				id: 'url',
				type: 'text',
				label: __( 'Website', 'wp-admin-workspaces' ),
			},
			{
				id: 'description',
				type: 'text',
				label: __( 'Biographical Info', 'wp-admin-workspaces' ),
				Edit: { control: 'textarea', rows: 5 },
			},
		];
		// Deliberately keyed on the specific name parts, not the whole
		// `editedRecord` — the display-name options only depend on these, and
		// rebuilding the fields array (with its Edit controls) on every
		// unrelated keystroke would re-render the whole form.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		editedRecord?.username,
		editedRecord?.first_name,
		editedRecord?.last_name,
		editedRecord?.nickname,
		editedRecord?.name,
	] );

	if ( ! userId ) {
		return (
			<div className="wp-admin-workspaces-app-profile__error">
				<Text>
					{ __(
						'Profile unavailable: missing user context.',
						'wp-admin-workspaces'
					) }
				</Text>
			</div>
		);
	}

	if ( ! record ) {
		return (
			<div className="wp-admin-workspaces-app__center">
				<Spinner />
			</div>
		);
	}

	return (
		<Page title={ __( 'Profile', 'wp-admin-workspaces' ) } hasPadding>
			<Stack
				direction="column"
				gap="xl"
				className="wp-admin-workspaces-app-profile"
			>
				<DataForm
					data={ editedRecord }
					fields={ fields }
					form={ FORM }
					onChange={ edit }
				/>

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						disabled={ ! hasEdits || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save Changes', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</Page>
	);
}
