import { useState } from '@wordpress/element';
import { Button, InputControl, Stack } from '@wordpress/ui';
import { Modal } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { PortalThemeScope } from '../../runtime/styles/ThemeProviderHost';

/**
 * Create or rename a menu container (`root/menu`).
 *
 * Hand-rolled `@wordpress/ui` controls rather than `@wordpress/dataviews`
 * `DataForm` — an INTENTIONAL deviation from CLAUDE.md's "single-record edit
 * forms use `DataForm`" convention. `DataForm`/`EntityDataForm` is
 * `useEntityRecord`-shaped (it edits one resolved record in place), but this
 * modal drives a `saveEntityRecord`-based CREATE-or-rename flow that has no
 * pre-existing record to edit in create mode. For a single text field the
 * hand-rolled control is simpler than bending `DataForm` to a create flow.
 * The taxonomy term modal (a `DataForm` consumer per the conventions) is the
 * reference for the OUTER shape only — modal chrome, decode-on-seed, one local
 * state value — NOT the form mechanism; this create-or-rename flow deliberately
 * hand-rolls the single text field instead of using `DataForm`.
 *
 * @param {Object}      root0
 * @param {Object|null} root0.menu    Menu record to rename, or null to create.
 * @param {Function}    root0.onClose Dismiss the modal.
 * @param {Function}    root0.onSave  `saveEntityRecord` from core-data.
 * @param {Function}    root0.onSaved `(record) => void` after a commit.
 * @param {Function}    root0.onError `(err) => void` on failure.
 * @return {JSX.Element} The modal.
 */
export function MenuNameModal( { menu, onClose, onSave, onSaved, onError } ) {
	const isNew = ! menu;
	const [ name, setName ] = useState( decodeEntities( menu?.name || '' ) );
	const [ isSaving, setIsSaving ] = useState( false );

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const payload = { name };
			if ( ! isNew ) {
				payload.id = menu.id;
			}
			const record = await onSave( 'root', 'menu', payload );
			if ( ! record ) {
				throw new Error(
					__( 'The menu could not be saved.', 'wp-admin-workspaces' )
				);
			}
			onSaved?.( record );
			onClose();
		} catch ( err ) {
			onError?.( err );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<Modal
			title={
				isNew
					? __( 'Create menu', 'wp-admin-workspaces' )
					: __( 'Rename menu', 'wp-admin-workspaces' )
			}
			onRequestClose={ onClose }
		>
			<PortalThemeScope>
				<Stack direction="column" gap="md">
					<InputControl
						label={ __( 'Menu name', 'wp-admin-workspaces' ) }
						value={ name }
						onChange={ ( e ) =>
							setName(
								typeof e === 'string'
									? e
									: e?.target?.value || ''
							)
						}
					/>
					<Stack direction="row" justify="flex-end" gap="sm">
						<Button variant="minimal" onClick={ onClose }>
							{ __( 'Cancel', 'wp-admin-workspaces' ) }
						</Button>
						<Button
							tone="brand"
							variant="solid"
							onClick={ handleSave }
							loading={ isSaving }
							disabled={ ! name.trim() || isSaving }
						>
							{ isNew
								? __( 'Create', 'wp-admin-workspaces' )
								: __( 'Save', 'wp-admin-workspaces' ) }
						</Button>
					</Stack>
				</Stack>
			</PortalThemeScope>
		</Modal>
	);
}
