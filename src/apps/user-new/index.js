import '../_shared/app.css';
import { useMemo, useState, useCallback } from '@wordpress/element';
import { store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { navigate } from '../../runtime/routing/router';
import { useDataView } from '../../runtime/dataView/useDataView';

const STANDARD_ROLE_LABELS = {
	administrator: __( 'Administrator', 'wp-admin-shell' ),
	editor: __( 'Editor', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
	contributor: __( 'Contributor', 'wp-admin-shell' ),
	subscriber: __( 'Subscriber', 'wp-admin-shell' ),
};

const DEFAULT_ROLES = [
	'subscriber',
	'contributor',
	'author',
	'editor',
	'administrator',
];

/**
 * Cheap random password generator for the "Generate password" default. Not
 * cryptographically strong — WordPress emails the new user a set-password link
 * anyway and the admin can override the value before submitting. Used only so
 * the create succeeds when the admin leaves the field at its generated default.
 *
 * @return {string} A 16-char password.
 */
function generatePassword() {
	const chars =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
	let out = '';
	for ( let i = 0; i < 16; i++ ) {
		out += chars.charAt( Math.floor( Math.random() * chars.length ) );
	}
	return out;
}

/**
 * core:user-new — native single-site "Add New User" screen.
 *
 * Replaces the legacy `iframe:user-new.php` mount. Renders a `DataForm` create
 * flow and `POST`s to `/wp/v2/users` (`saveEntityRecord( 'root', 'user', … )`).
 * On success it navigates to the new user's edit screen.
 *
 * Role options come from the resolved `root/user` dataView spec `roles`
 * elements when available (so admin.json controls the surfaced set + translated
 * labels), falling back to the standard WordPress roles.
 *
 * Known gap: the welcome-email toggle (`send_user_notification`) is NOT in the
 * REST create schema, so the "Send the new user an email" checkbox is offered
 * but ignored server-side — see `app.md`.
 */
export default function UserNewApp() {
	const { config: userDataView } = useDataView( {
		kind: 'root',
		name: 'user',
	} );

	const roleElements = useMemo( () => {
		const roleField = ( userDataView?.fields ?? [] ).find(
			( field ) => field.id === 'roles'
		);
		const elements = roleField?.elements;
		if ( Array.isArray( elements ) && elements.length ) {
			return elements;
		}
		return DEFAULT_ROLES.map( ( value ) => ( {
			value,
			label: STANDARD_ROLE_LABELS[ value ] ?? value,
		} ) );
	}, [ userDataView ] );

	const defaultRole = useMemo( () => {
		// Prefer subscriber (WordPress' default new-user role) when present.
		const has = ( value ) =>
			roleElements.some( ( el ) => el.value === value );
		if ( has( 'subscriber' ) ) {
			return 'subscriber';
		}
		return roleElements[ roleElements.length - 1 ]?.value || 'subscriber';
	}, [ roleElements ] );

	const [ data, setData ] = useState( () => ( {
		username: '',
		email: '',
		first_name: '',
		last_name: '',
		url: '',
		password: generatePassword(),
		roles: defaultRole,
		send_user_notification: true,
	} ) );
	const [ isSaving, setIsSaving ] = useState( false );

	const { saveEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );
	const getLastEntitySaveError = useSelect(
		( select ) => select( coreStore ).getLastEntitySaveError,
		[]
	);

	const fields = useMemo(
		() => [
			{
				id: 'username',
				type: 'text',
				label: __( 'Username', 'wp-admin-shell' ),
				isValid: { required: true },
			},
			{
				id: 'email',
				type: 'email',
				label: __( 'Email', 'wp-admin-shell' ),
				isValid: { required: true },
			},
			{
				id: 'first_name',
				type: 'text',
				label: __( 'First Name', 'wp-admin-shell' ),
			},
			{
				id: 'last_name',
				type: 'text',
				label: __( 'Last Name', 'wp-admin-shell' ),
			},
			{
				id: 'url',
				type: 'text',
				label: __( 'Website', 'wp-admin-shell' ),
			},
			{
				id: 'password',
				type: 'text',
				label: __( 'Password', 'wp-admin-shell' ),
				isValid: { required: true },
			},
			{
				id: 'roles',
				label: __( 'Role', 'wp-admin-shell' ),
				Edit: 'select',
				elements: roleElements,
			},
			{
				id: 'send_user_notification',
				type: 'boolean',
				label: __(
					'Send the new user an email about their account.',
					'wp-admin-shell'
				),
			},
		],
		[ roleElements ]
	);

	const form = useMemo(
		() => ( {
			layout: { type: 'regular', labelPosition: 'top' },
			fields: [
				'username',
				'email',
				'first_name',
				'last_name',
				'url',
				'password',
				'roles',
				'send_user_notification',
			],
		} ),
		[]
	);

	const { validity, isValid } = useFormValidity( data, fields, form );

	const onSubmit = useCallback( async () => {
		if ( isSaving ) {
			return;
		}
		setIsSaving( true );
		try {
			// `send_user_notification` is NOT in the REST create schema — strip
			// it from the payload (the toggle is informational only; see app.md).
			const { send_user_notification: _ignored, roles, ...rest } = data;
			const payload = {
				...rest,
				roles: roles ? [ roles ] : [],
			};
			const record = await saveEntityRecord( 'root', 'user', payload );
			// `saveEntityRecord` RESOLVES `undefined` on a REST failure (it does
			// not throw) — a falsy record means the create failed.
			if ( ! record ) {
				const saveError = getLastEntitySaveError( 'root', 'user' );
				createErrorNotice(
					saveError?.message ||
						__( 'Failed to create user.', 'wp-admin-shell' ),
					{ isDismissible: true }
				);
				return;
			}
			createSuccessNotice( __( 'User created.', 'wp-admin-shell' ), {
				type: 'snackbar',
			} );
			navigate( `#/users/${ record.id }/edit` );
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to create user.', 'wp-admin-shell' ),
				{ isDismissible: true }
			);
		} finally {
			setIsSaving( false );
		}
	}, [
		data,
		isSaving,
		saveEntityRecord,
		getLastEntitySaveError,
		createSuccessNotice,
		createErrorNotice,
	] );

	return (
		<div className="wp-admin-shell-app-user-new wp-admin-shell-app--inset">
			<Stack direction="column" gap="xl">
				<Text variant="heading-lg" render={ <h2 /> }>
					{ __( 'Add New User', 'wp-admin-shell' ) }
				</Text>
				<Text className="wp-admin-shell-app__muted">
					{ __(
						'Create a brand new user and add them to this site.',
						'wp-admin-shell'
					) }
				</Text>

				<DataForm
					data={ data }
					fields={ fields }
					form={ form }
					validity={ validity }
					onChange={ ( edits ) =>
						setData( ( prev ) => ( { ...prev, ...edits } ) )
					}
				/>

				<Stack direction="row" justify="flex-start" gap="sm">
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSubmit }
						disabled={ ! isValid || isSaving }
						loading={ isSaving }
					>
						{ __( 'Add New User', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ () => navigate( '#/users' ) }
						disabled={ isSaving }
					>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
