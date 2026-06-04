import '../_shared/app.css';
import {
	useMemo,
	useState,
	useCallback,
	useEffect,
	useRef,
} from '@wordpress/element';
import { store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { navigate } from '../../runtime/routing/router';
import { useDataView } from '../../runtime/dataView/useDataView';
import { STANDARD_ROLE_LABELS, DEFAULT_ROLES } from '../_shared/roles';

/**
 * Generate the "Generate password" default using a CSPRNG. The REST create path
 * sends no welcome / set-password email (`send_user_notification` is stripped —
 * see `onSubmit` + app.md), so whenever the admin leaves this field at its
 * default the generated value becomes the account's only stored credential. That
 * makes a non-predictable source mandatory — `window.crypto.getRandomValues`,
 * available in every browser the workspace targets, replaces `Math.random()` (not a
 * CSPRNG). The admin can still override the value before submitting.
 *
 * @return {string} A 16-char password.
 */
function generatePassword() {
	const chars =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
	const bytes = window.crypto.getRandomValues( new Uint32Array( 16 ) );
	let out = '';
	for ( let i = 0; i < bytes.length; i++ ) {
		out += chars.charAt( bytes[ i ] % chars.length );
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
 * elements when available (so workspace.json controls the surfaced set + translated
 * labels), falling back to the standard WordPress roles.
 *
 * Known gap: the welcome-email toggle (`send_user_notification`) is NOT in the
 * REST create schema, so the "Send the new user an email" checkbox is rendered
 * read-only + off (with helper text) and stripped from the payload — see
 * `app.md`. Because no welcome email is sent, the generated password default is
 * the user's only credential, so it uses a CSPRNG (`generatePassword`).
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
		// Otherwise prefer the lowest-privilege standard role the set carries —
		// never default to the LAST element (administrator in the standard set),
		// which would seed an unexpectedly privileged role.
		const lowest = DEFAULT_ROLES.find( ( value ) => has( value ) );
		return lowest || roleElements[ 0 ]?.value || 'subscriber';
	}, [ roleElements ] );

	const [ data, setData ] = useState( () => ( {
		username: '',
		email: '',
		first_name: '',
		last_name: '',
		url: '',
		password: generatePassword(),
		roles: defaultRole,
		// Off + disabled: no welcome email is sent on the REST create path (see
		// the field def + `onSubmit`).
		send_user_notification: false,
	} ) );
	const [ isSaving, setIsSaving ] = useState( false );

	// `useState`'s lazy initializer froze `data.roles` from the first-paint
	// `defaultRole`. When `useDataView` resolves AFTER first paint (a `root/user`
	// triple registered post-load → REST fallback), `roleElements` updates but
	// the seeded `roles` does not — leaving a value that may not be among the
	// select's options. Re-seed when `defaultRole` changes, but only while the
	// admin hasn't picked a role themselves (so an explicit choice is preserved).
	const roleDirtied = useRef( false );
	useEffect( () => {
		if ( roleDirtied.current ) {
			return;
		}
		setData( ( prev ) =>
			prev.roles === defaultRole ? prev : { ...prev, roles: defaultRole }
		);
	}, [ defaultRole ] );

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
				label: __( 'Username', 'wp-admin-workspaces' ),
				isValid: { required: true },
			},
			{
				id: 'email',
				type: 'email',
				label: __( 'Email', 'wp-admin-workspaces' ),
				isValid: { required: true },
			},
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
				id: 'url',
				type: 'text',
				label: __( 'Website', 'wp-admin-workspaces' ),
			},
			{
				id: 'password',
				type: 'text',
				label: __( 'Password', 'wp-admin-workspaces' ),
				isValid: { required: true },
			},
			{
				id: 'roles',
				label: __( 'Role', 'wp-admin-workspaces' ),
				Edit: 'select',
				elements: roleElements,
			},
			{
				id: 'send_user_notification',
				type: 'boolean',
				label: __(
					'Send the new user an email about their account.',
					'wp-admin-workspaces'
				),
				// Disabled, off by default: the REST create path sends no welcome
				// email (the field is stripped before POST — see `onSubmit` +
				// app.md). Rendered read-only with helper text rather than as an
				// interactive default-on control that does nothing.
				readOnly: true,
				description: __(
					'The welcome email is not sent when creating a user from the workspace yet.',
					'wp-admin-workspaces'
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
						__( 'Failed to create user.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
				return;
			}
			createSuccessNotice( __( 'User created.', 'wp-admin-workspaces' ), {
				type: 'snackbar',
			} );
			navigate( `#/users/${ record.id }/edit` );
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to create user.', 'wp-admin-workspaces' ),
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
		<div className="wp-admin-workspaces-app-user-new wp-admin-workspaces-app--inset">
			<Stack direction="column" gap="xl">
				<Text variant="heading-lg" render={ <h2 /> }>
					{ __( 'Add New User', 'wp-admin-workspaces' ) }
				</Text>
				<Text className="wp-admin-workspaces-app__muted">
					{ __(
						'Create a brand new user and add them to this site.',
						'wp-admin-workspaces'
					) }
				</Text>

				<DataForm
					data={ data }
					fields={ fields }
					form={ form }
					validity={ validity }
					onChange={ ( edits ) => {
						// Once the admin picks a role, stop the resolve-time
						// re-seed from overriding their choice.
						if (
							Object.prototype.hasOwnProperty.call(
								edits,
								'roles'
							)
						) {
							roleDirtied.current = true;
						}
						setData( ( prev ) => ( { ...prev, ...edits } ) );
					} }
				/>

				<Stack direction="row" justify="flex-start" gap="sm">
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSubmit }
						disabled={ ! isValid || isSaving }
						loading={ isSaving }
					>
						{ __( 'Add New User', 'wp-admin-workspaces' ) }
					</Button>
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ () => navigate( '#/users' ) }
						disabled={ isSaving }
					>
						{ __( 'Cancel', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</div>
	);
}
