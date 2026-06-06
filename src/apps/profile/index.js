import './index.css';
import '../_shared/app.css';
import { useMemo, useState, useCallback } from '@wordpress/element';
import { useEntityRecord, store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm } from '@wordpress/dataviews/wp';
import { Button, InputControl, Notice, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { eventValue } from '../_shared/forms/eventValue.mjs';
import { useEntitySave } from '../_shared/forms/useEntitySave';
import { Page } from '../_shared/Page';
import ApplicationPasswords from './ApplicationPasswords';

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
		'locale',
	],
};

// Fallback interface-language options when PHP supplied none (e.g. the inline
// `profileLanguages` payload is absent in a stripped-down test mount). PHP
// (`wp_admin_workspaces_get_profile_languages`) supplies the real list — Site
// Default + English + installed locales, the exact set REST `locale` accepts.
const LANGUAGE_FALLBACK = [
	{ value: '', label: __( 'Site Default', 'wp-admin-workspaces' ) },
	{ value: 'en_US', label: 'English (United States)' },
];

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

	const { saveEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );
	// `saveEntityRecord` resolves `undefined` on a REST failure (it does NOT
	// throw). `getLastEntitySaveError` is how we detect server-side rejection
	// (e.g. a password containing a backslash that `check_user_password` rejects).
	// Pattern matches user-new/index.js and useEntitySave.js.
	const getLastEntitySaveError = useSelect(
		( select ) => select( coreStore ).getLastEntitySaveError,
		[]
	);

	const handleSave = useEntitySave(
		save,
		{
			success: __( 'Profile updated.', 'wp-admin-workspaces' ),
			error: __( 'Failed to save profile.', 'wp-admin-workspaces' ),
		},
		{ kind: 'root', name: 'user', recordId: userId }
	);

	// Interface-language options come from PHP (installed locales + native
	// names); static for the page lifetime, so read once.
	const languageOptions = useMemo(
		() =>
			window.wpAdminWorkspaces?.profileLanguages?.length
				? window.wpAdminWorkspaces.profileLanguages
				: LANGUAGE_FALLBACK,
		[]
	);

	// New-password change is a separate, write-only field: `password` is never
	// returned by REST so it cannot live in the entity record's edits —
	// a failed save would leave it lingering and it could be silently committed
	// on a later, unrelated click of Save Changes. It stays in local state and
	// is saved via a direct one-shot `saveEntityRecord` call that bypasses
	// `edit()` entirely (see `onSave`). `pwError` surfaces the client-side
	// confirm mismatch — REST itself has no confirm / strength gate.
	const [ newPassword, setNewPassword ] = useState( '' );
	const [ confirmPassword, setConfirmPassword ] = useState( '' );
	const [ pwError, setPwError ] = useState( '' );

	const onSave = useCallback( async () => {
		// Validate confirm match before touching the network.
		if ( newPassword && newPassword !== confirmPassword ) {
			setPwError(
				__( 'Passwords do not match.', 'wp-admin-workspaces' )
			);
			return;
		}
		setPwError( '' );

		// Step 1 — save profile field edits via the entity's normal save()
		// path. Password is deliberately NOT folded in here: it goes through a
		// separate one-shot saveEntityRecord call below so it never enters the
		// shared entity edits (where a failed save would leave it lingering for
		// a later, unrelated commit).
		let profileOk = true;
		if ( hasEdits ) {
			profileOk = await handleSave();
		}
		if ( ! profileOk ) {
			// Error notice already surfaced by handleSave; abort.
			return;
		}

		// Step 2 — password-only save: a direct one-shot `saveEntityRecord` call
		// that never touches the shared edits. The record object MUST carry `id`
		// so core-data issues a PATCH /wp/v2/users/{id} update (not a POST
		// create). `saveEntityRecord` RESOLVES `undefined` on a REST failure (it
		// does NOT throw) — check the return value AND `getLastEntitySaveError`
		// to detect server-side rejection (e.g. a backslash in the password
		// that `check_user_password` rejects). On failure: show the error notice
		// and leave the password fields filled so the user can retry.
		if ( newPassword ) {
			const saved = await saveEntityRecord( 'root', 'user', {
				id: userId,
				password: newPassword,
			} );
			if ( ! saved ) {
				const saveError = getLastEntitySaveError(
					'root',
					'user',
					userId
				);
				createErrorNotice(
					saveError?.message ||
						__( 'Failed to save password.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
				// Leave password fields filled so the user can correct and retry.
				return;
			}
		}

		// Show the single success snackbar. handleSave already shows "Profile
		// updated." when profile edits were present; when only the password
		// changed, show "Password updated." instead.
		if ( ! hasEdits ) {
			createSuccessNotice(
				__( 'Password updated.', 'wp-admin-workspaces' ),
				{ type: 'snackbar' }
			);
		}

		setNewPassword( '' );
		setConfirmPassword( '' );
	}, [
		newPassword,
		confirmPassword,
		hasEdits,
		handleSave,
		saveEntityRecord,
		getLastEntitySaveError,
		userId,
		createSuccessNotice,
		createErrorNotice,
	] );

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
			{
				id: 'locale',
				type: 'text',
				label: __( 'Interface Language', 'wp-admin-workspaces' ),
				Edit: 'select',
				elements: languageOptions,
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
		languageOptions,
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
			<Stack direction="column" gap="2xl">
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

				{ /* Account management — new password. Write-only (`password`
				   is never returned by REST), so it sits outside the DataForm
				   in local state and is saved via a direct one-shot
				   saveEntityRecord call in `onSave` — never via edit(). */ }
				<Stack
					direction="column"
					gap="sm"
					className="wp-admin-workspaces-app-profile__password"
				>
					<Text variant="heading-md" render={ <h3 /> }>
						{ __( 'Account Management', 'wp-admin-workspaces' ) }
					</Text>
					<InputControl
						type="password"
						label={ __( 'New Password', 'wp-admin-workspaces' ) }
						value={ newPassword }
						onChange={ ( e ) => {
							setNewPassword( eventValue( e ) );
							if ( pwError ) {
								setPwError( '' );
							}
						} }
						autoComplete="new-password"
					/>
					<InputControl
						type="password"
						label={ __(
							'Confirm New Password',
							'wp-admin-workspaces'
						) }
						value={ confirmPassword }
						onChange={ ( e ) => {
							setConfirmPassword( eventValue( e ) );
							if ( pwError ) {
								setPwError( '' );
							}
						} }
						autoComplete="new-password"
					/>
					{ pwError && (
						<Notice.Root intent="error">
							<Notice.Description>{ pwError }</Notice.Description>
						</Notice.Root>
					) }
				</Stack>

				<Stack direction="row" justify="flex-start">
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSave }
						disabled={ ( ! hasEdits && ! newPassword ) || isSaving }
						loading={ isSaving }
					>
						{ __( 'Save Changes', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>

				<ApplicationPasswords key={ userId } userId={ userId } />
			</Stack>
		</Page>
	);
}
