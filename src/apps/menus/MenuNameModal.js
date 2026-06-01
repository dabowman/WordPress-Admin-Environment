import { useState } from '@wordpress/element';
import { Button, InputControl, Stack } from '@wordpress/ui';
import { Modal } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';

/**
 * Create or rename a menu container (`root/menu`).
 *
 * Hand-rolled (single text field) rather than `createEntityFormModal` because
 * it isn't mounted through a DataViews action — the Menus editor toggles it
 * from its own toolbar buttons. Mirrors the taxonomy `TermEditModal` pattern:
 * one local `data` state, decode-on-seed to avoid double-encoding.
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
					__( 'The menu could not be saved.', 'wp-admin-shell' )
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
					? __( 'Create menu', 'wp-admin-shell' )
					: __( 'Rename menu', 'wp-admin-shell' )
			}
			onRequestClose={ onClose }
		>
			<Stack direction="column" gap="md">
				<InputControl
					label={ __( 'Menu name', 'wp-admin-shell' ) }
					value={ name }
					onChange={ ( e ) =>
						setName(
							typeof e === 'string' ? e : e?.target?.value || ''
						)
					}
				/>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button variant="minimal" onClick={ onClose }>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						loading={ isSaving }
						disabled={ ! name.trim() || isSaving }
					>
						{ isNew
							? __( 'Create', 'wp-admin-shell' )
							: __( 'Save', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</Modal>
	);
}
