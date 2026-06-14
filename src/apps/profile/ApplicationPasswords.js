/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalDivider has no @wordpress/ui 0.12 port; Modal/Button(isDestructive) have no clean WPDS 0.12 equivalent. */
import { useState, useEffect, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import {
	Button,
	Notice,
	Stack,
	Text,
	InputControl,
	Badge,
} from '@wordpress/ui';
import { eventValue } from '../_shared/forms/eventValue.mjs';
import {
	Spinner,
	Modal,
	Button as ClassicButton,
	__experimentalDivider as Divider,
} from '@wordpress/components';
import { dateI18n } from '@wordpress/date';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Format an application-password timestamp for display, or an em dash when
 * the field is absent. The REST API returns `created` / `last_used` as
 * offset-less GMT strings (e.g. `"2024-01-15T10:30:00"`). Appending `Z`
 * makes the string an unambiguous UTC instant so JavaScript's Date parser
 * treats it correctly; `dateI18n` then renders it in the site's configured
 * timezone + locale with no third argument needed. The deprecated boolean
 * third arg (`timezone=true`) is intentionally avoided — it can emit a
 * `wp.deprecated` console warning and does not reliably signal UTC input.
 *
 * @param {string|null} gmt The `created` / `last_used` GMT datetime, or null/undefined.
 * @return {string} Localized date, or an em dash placeholder.
 */
function formatDate( gmt ) {
	if ( ! gmt ) {
		return '—';
	}
	return dateI18n( 'M j, Y', `${ gmt }Z` );
}

/**
 * Application Passwords management — a self-contained section appended to the
 * profile form (NOT a `DataForm`: it's a list-of-records CRUD with a
 * create-once-reveal flow that needs imperative `api-fetch`, since the create
 * response's plaintext `password` is returned exactly once and never
 * re-fetchable).
 *
 * Mirrors wp-admin's Application Passwords block (`user-edit.php:790-883`):
 * list, add (one-time reveal), revoke one, revoke all. Capability + HTTPS /
 * Basic-Auth availability are enforced server-side by
 * `WP_REST_Application_Passwords_Controller`; an availability failure surfaces
 * here as a graceful "unavailable" notice rather than a crash.
 *
 * @param {Object} root0        Props.
 * @param {number} root0.userId The user whose application passwords are managed
 *                              (the acting user, or `config.userId`).
 */
export default function ApplicationPasswords( { userId } ) {
	const base = `/wp/v2/users/${ userId }/application-passwords`;
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const [ items, setItems ] = useState( null );
	const [ loadError, setLoadError ] = useState( null );
	const [ newName, setNewName ] = useState( '' );
	const [ isCreating, setIsCreating ] = useState( false );
	// The plaintext shown once after a successful create: { name, password }.
	const [ revealed, setRevealed ] = useState( null );
	// uuid of a single-revoke confirmation, or the sentinel '__all__'.
	const [ confirmRevoke, setConfirmRevoke ] = useState( null );
	const [ isRevoking, setIsRevoking ] = useState( false );

	const loadItems = useCallback( async () => {
		try {
			const list = await apiFetch( { path: base } );
			setItems( Array.isArray( list ) ? list : [] );
			setLoadError( null );
		} catch ( err ) {
			// 501 / disabled / no-HTTPS surfaces here — keep the section
			// visible but inert rather than crashing the whole profile form.
			setItems( [] );
			setLoadError(
				err?.message ||
					__(
						'Application passwords are unavailable on this site.',
						'wp-admin-workspaces'
					)
			);
		}
	}, [ base ] );

	useEffect( () => {
		loadItems();
	}, [ loadItems ] );

	const handleCreate = useCallback( async () => {
		const name = newName.trim();
		if ( ! name ) {
			return;
		}
		setIsCreating( true );
		try {
			const created = await apiFetch( {
				path: base,
				method: 'POST',
				data: { name },
			} );
			// The create response carries the plaintext `password` once.
			setRevealed( { name, password: created?.password || '' } );
			setNewName( '' );
			await loadItems();
			createSuccessNotice(
				sprintf(
					// translators: %s: application password name.
					__(
						'Application password "%s" created.',
						'wp-admin-workspaces'
					),
					name
				),
				{ type: 'snackbar' }
			);
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__(
						'Failed to create application password.',
						'wp-admin-workspaces'
					),
				{ isDismissible: true }
			);
		} finally {
			setIsCreating( false );
		}
	}, [ base, newName, loadItems, createSuccessNotice, createErrorNotice ] );

	const handleRevoke = useCallback( async () => {
		const target = confirmRevoke;
		if ( ! target ) {
			return;
		}
		const isAll = target === '__all__';
		setIsRevoking( true );
		try {
			await apiFetch( {
				path: isAll ? base : `${ base }/${ target }`,
				method: 'DELETE',
			} );
			await loadItems();
			createSuccessNotice(
				isAll
					? __(
							'All application passwords revoked.',
							'wp-admin-workspaces'
					  )
					: __(
							'Application password revoked.',
							'wp-admin-workspaces'
					  ),
				{ type: 'snackbar' }
			);
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__(
						'Failed to revoke application password.',
						'wp-admin-workspaces'
					),
				{ isDismissible: true }
			);
		} finally {
			setIsRevoking( false );
			setConfirmRevoke( null );
		}
	}, [
		base,
		confirmRevoke,
		loadItems,
		createSuccessNotice,
		createErrorNotice,
	] );

	return (
		<div className="wp-admin-workspaces-app-profile__app-passwords">
			<Divider />

			<Stack direction="column" gap="md">
				<Text variant="heading-md" render={ <h3 /> }>
					{ __( 'Application Passwords', 'wp-admin-workspaces' ) }
				</Text>
				<Text>
					{ __(
						'Application passwords allow authentication via non-interactive systems, such as XML-RPC or the REST API, without providing your actual password. Application passwords can be easily revoked. They cannot be used for traditional logins to your website.',
						'wp-admin-workspaces'
					) }
				</Text>

				{ loadError && (
					<Notice.Root intent="warning">
						<Notice.Description>{ loadError }</Notice.Description>
					</Notice.Root>
				) }

				{ ! loadError && (
					<form
						className="wp-admin-workspaces-app-profile__app-passwords-create"
						onSubmit={ ( e ) => {
							e.preventDefault();
							handleCreate();
						} }
					>
						<Stack direction="row" gap="sm" align="flex-end">
							<InputControl
								label={ __(
									'New Application Password Name',
									'wp-admin-workspaces'
								) }
								value={ newName }
								onChange={ ( e ) =>
									setNewName( eventValue( e ) )
								}
								disabled={ isCreating }
							/>
							<Button
								type="submit"
								tone="brand"
								variant="solid"
								loading={ isCreating }
								disabled={ isCreating || ! newName.trim() }
							>
								{ __(
									'Add New Application Password',
									'wp-admin-workspaces'
								) }
							</Button>
						</Stack>
					</form>
				) }

				{ revealed && (
					<div
						className="wp-admin-workspaces-app-profile__app-passwords-reveal"
						role="status"
					>
						<Text>
							<strong>
								{ sprintf(
									// translators: %s: application password name.
									__(
										'Your new password for %s is:',
										'wp-admin-workspaces'
									),
									revealed.name
								) }
							</strong>
						</Text>
						<Stack direction="row" gap="sm" align="center">
							<input
								type="text"
								readOnly
								value={ revealed.password }
								onFocus={ ( e ) => e.target.select() }
								className="wp-admin-workspaces-app-profile__app-passwords-reveal-value"
								aria-label={ __(
									'New application password',
									'wp-admin-workspaces'
								) }
							/>
							<Button
								tone="neutral"
								variant="outline"
								onClick={ async () => {
									try {
										await navigator.clipboard.writeText(
											revealed.password
										);
										createSuccessNotice(
											__(
												'Copied to clipboard.',
												'wp-admin-workspaces'
											),
											{ type: 'snackbar' }
										);
									} catch ( err ) {
										createErrorNotice(
											__(
												'Could not copy to clipboard.',
												'wp-admin-workspaces'
											),
											{ isDismissible: true }
										);
									}
								} }
							>
								{ __( 'Copy', 'wp-admin-workspaces' ) }
							</Button>
						</Stack>
						<Text>
							{ __(
								'Be sure to save this in a safe location. You will not be able to retrieve it again.',
								'wp-admin-workspaces'
							) }
						</Text>
						<Stack direction="row" justify="flex-start">
							<Button
								tone="neutral"
								variant="minimal"
								onClick={ () => setRevealed( null ) }
							>
								{ __( 'Dismiss', 'wp-admin-workspaces' ) }
							</Button>
						</Stack>
					</div>
				) }

				{ items === null && ! loadError && (
					<div className="wp-admin-workspaces-app__center">
						<Spinner />
					</div>
				) }

				{ items !== null && items.length > 0 && (
					<table className="wp-admin-workspaces-app-profile__app-passwords-table">
						<thead>
							<tr>
								<th scope="col">
									{ __( 'Name', 'wp-admin-workspaces' ) }
								</th>
								<th scope="col">
									{ __( 'Created', 'wp-admin-workspaces' ) }
								</th>
								<th scope="col">
									{ __( 'Last Used', 'wp-admin-workspaces' ) }
								</th>
								<th scope="col">
									{ __( 'Last IP', 'wp-admin-workspaces' ) }
								</th>
								<th scope="col">
									<span className="screen-reader-text">
										{ __(
											'Actions',
											'wp-admin-workspaces'
										) }
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{ items.map( ( item ) => (
								<tr key={ item.uuid }>
									<td>{ item.name }</td>
									<td>{ formatDate( item.created ) }</td>
									<td>
										{ item.last_used ? (
											formatDate( item.last_used )
										) : (
											<Badge intent="neutral">
												{ __(
													'Never',
													'wp-admin-workspaces'
												) }
											</Badge>
										) }
									</td>
									<td>{ item.last_ip || '—' }</td>
									<td>
										<ClassicButton
											isDestructive
											variant="tertiary"
											onClick={ () =>
												setConfirmRevoke( item.uuid )
											}
										>
											{ __(
												'Revoke',
												'wp-admin-workspaces'
											) }
										</ClassicButton>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				) }

				{ items !== null && items.length > 0 && (
					<Stack direction="row" justify="flex-start">
						<ClassicButton
							isDestructive
							variant="secondary"
							onClick={ () => setConfirmRevoke( '__all__' ) }
						>
							{ __(
								'Revoke all application passwords',
								'wp-admin-workspaces'
							) }
						</ClassicButton>
					</Stack>
				) }

				{ items !== null && items.length === 0 && ! loadError && (
					<Text className="wp-admin-workspaces-app-profile__app-passwords-empty">
						{ __(
							'No application passwords have been created yet.',
							'wp-admin-workspaces'
						) }
					</Text>
				) }
			</Stack>

			{ confirmRevoke && (
				<Modal
					title={
						confirmRevoke === '__all__'
							? __(
									'Revoke all application passwords?',
									'wp-admin-workspaces'
							  )
							: __(
									'Revoke application password?',
									'wp-admin-workspaces'
							  )
					}
					onRequestClose={ () =>
						! isRevoking && setConfirmRevoke( null )
					}
				>
					<Stack direction="column" gap="lg">
						<Text>
							{ confirmRevoke === '__all__'
								? __(
										'Any applications using these passwords will no longer be able to access this site. This cannot be undone.',
										'wp-admin-workspaces'
								  )
								: __(
										'Any application using this password will no longer be able to access this site. This cannot be undone.',
										'wp-admin-workspaces'
								  ) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							<Button
								tone="neutral"
								variant="minimal"
								onClick={ () => setConfirmRevoke( null ) }
								disabled={ isRevoking }
							>
								{ __( 'Cancel', 'wp-admin-workspaces' ) }
							</Button>
							<ClassicButton
								isDestructive
								variant="primary"
								isBusy={ isRevoking }
								disabled={ isRevoking }
								onClick={ handleRevoke }
							>
								{ __( 'Revoke', 'wp-admin-workspaces' ) }
							</ClassicButton>
						</Stack>
					</Stack>
				</Modal>
			) }
		</div>
	);
}
