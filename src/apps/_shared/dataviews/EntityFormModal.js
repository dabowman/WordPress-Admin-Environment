import '../app.css';
import { useState, useCallback } from '@wordpress/element';
import { useEntityRecord, store as coreStore } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';
import { Button, Stack } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useEntitySave } from '../forms/useEntitySave';
import { buildSubmitPayload, firstItem } from './entityFormPayload.mjs';

/**
 * The shared host for **Modal Edit** and **Modal Create** of a single entity
 * (deliverable #1 of the DataViews interaction-pattern library — see
 * `docs/dataviews-interaction-patterns.md`).
 *
 * `createEntityFormModal` returns a DataViews `RenderModal`-compatible
 * component, wired into a list app through the `buildActions` `modals` map:
 *
 * ```js
 * const editModal = createEntityFormModal( { entity, mode: 'edit', fields, form, toData } );
 * const actions = buildActions( specs, { modals: { edit: editModal } } );
 * ```
 *
 * This is the **explicit-save modal host ONLY** (contract #2 in the doc). The
 * autosave sibling — Media metadata, #119's inspector — shares the same field /
 * `form` composition but commits through a future `useEntityAutosave`; do NOT
 * route an autosaving host through this factory. Field-agnostic: it renders
 * whatever `fields` / `form` the caller passes and owns no entity knowledge.
 *
 * EDIT mode buffers through `useEntityRecord`'s `edit()` (`data = editedRecord`,
 * `onChange = edit`) — never a `useState` mirror of server fields — and reuses
 * the shared `useEntitySave` for the success-snackbar / error-notice save. The
 * record-bound body is keyed `key={item.id}` so per-item buffered state resets
 * between openings (the media-modal trap). CREATE mode seeds a local draft from
 * `toData(undefined)` and `POST`s, blocking on the new record so `onSaved` can
 * navigate to its id.
 *
 * @param {Object}          config
 * @param {Array}           config.entity          Entity coords `[ kind, name ]` spread into `useEntityRecord` / `saveEntityRecord` (e.g. `[ 'root', 'comment' ]`).
 * @param {'edit'|'create'} [config.mode]          Commit mode. Defaults to `'edit'`.
 * @param {Array}           config.fields          `DataForm` field definitions.
 * @param {Object}          config.form            `DataForm` layout config (`regular` / `panel` / `sections`).
 * @param {Function}        [config.toData]        `(record|undefined, item?) => DataForm data`. Edit: maps `editedRecord` → form data (keep it near-identity — edit commits the buffered record, not a re-mapped payload). Create: `toData(undefined, item)` seeds the draft, receiving the action's subject row as the second arg (so an inline-creation modal — e.g. comment Reply — can seed `parent`/`post` from the row).
 * @param {Function}        [config.toRecord]      **Create-only.** `(data, item?) => REST payload` for the `POST`. Defaults to identity. Receives the subject row second so the payload can carry row-derived implicit fields (`parent`/`post`). Edit does NOT apply `toRecord` — it commits the buffered `editedRecord` through `useEntityRecord().save()` (matching `EntityDataForm`), so an edit modal can omit it.
 * @param {Function}        [config.renderContext] **Create-only, optional.** `(item) => JSX | null` rendered above the form as read-only context (e.g. the parent comment in a Reply). Returns `null` when there's no subject row.
 * @param {Object}          [config.messages]      `{ saved, error }` copy for the save notices plus `{ saveLabel, createLabel }` button text. The modal *header* is NOT set here — DataViews' internal `ActionModal` already wraps this `RenderModal` in its own `<Modal>` and titles it from the action's `label` / `modalHeader`. Returning our own `<Modal>` (or passing an `editTitle` / `createTitle`) would double the overlay, header, and focus trap, so the consumer sets the action label instead (matching `createBulkConfirmModal`).
 * @param {Function}        [config.onSaved]       `(record) => void` after a successful commit. CREATE receives the freshly-saved record (with its new id). EDIT receives the record refetched after `save()` resolves (the up-to-date server record, not the pre-save buffer).
 * @return {Function} A DataViews `RenderModal` component.
 */
export function createEntityFormModal( {
	entity,
	mode = 'edit',
	fields,
	form,
	toData,
	toRecord,
	renderContext,
	messages = {},
	onSaved,
} ) {
	const [ kind, name ] = entity;
	const mapToData =
		typeof toData === 'function' ? toData : ( record ) => record ?? {};

	const saveLabel = messages.saveLabel || __( 'Save', 'wp-admin-shell' );
	const createLabel =
		messages.createLabel || __( 'Add new', 'wp-admin-shell' );
	const saveMessages = { success: messages.saved, error: messages.error };

	/**
	 * The record-bound edit body. Split out so the parent can mount it with
	 * `key={item.id}` — `useEntityRecord`'s buffer (and the `edit()` edits) then
	 * reset cleanly when the user closes the modal and re-opens it on a
	 * different row.
	 *
	 * @param {Object}   root0
	 * @param {Object}   root0.item              The subject record (`items[0]`).
	 * @param {Function} root0.closeModal        DataViews modal-close callback.
	 * @param {Function} root0.onActionPerformed DataViews post-action callback.
	 * @return {JSX.Element} The keyed edit body.
	 */
	function EditBody( { item, closeModal, onActionPerformed } ) {
		const { record, editedRecord, edit, save, hasEdits, isSaving } =
			useEntityRecord( kind, name, item.id );
		// Thread the entity coords so `useEntitySave` consults
		// `getLastEntitySaveError` after `save()` — `saveEditedEntityRecord`
		// resolves (doesn't throw) on a REST failure, so the boolean is the
		// only reliable success signal. Keep the modal open on a `false`.
		const handleSave = useEntitySave( save, saveMessages, {
			kind,
			name,
			recordId: item.id,
		} );

		// Gate Save on field validity, same as `EntityDataForm`. Must run
		// before the null-guard early return so hook order stays stable.
		const formData = mapToData( editedRecord );
		const { validity, isValid } = useFormValidity( formData, fields, form );

		const onSave = useCallback( async () => {
			// `useEntitySave` shows the success / error notice itself and
			// resolves `true` only when the save committed (server error
			// included, via the threaded coords). Keep the modal open on
			// failure so the user can correct + retry.
			const saved = await handleSave();
			if ( ! saved ) {
				return;
			}
			// `record` here is the post-save server record (core-data refetched
			// once `save()` resolved), not the pre-save buffer.
			onSaved?.( record );
			onActionPerformed?.( [ item ] );
			closeModal();
		}, [ handleSave, record, onActionPerformed, item, closeModal ] );

		if ( ! record ) {
			return (
				<div className="wp-admin-shell-app__center">
					<Spinner />
				</div>
			);
		}

		return (
			<Stack direction="column" gap="md">
				<DataForm
					data={ formData }
					fields={ fields }
					form={ form }
					validity={ validity }
					onChange={ edit }
				/>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ closeModal }
					>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSave }
						loading={ isSaving }
						disabled={ ! hasEdits || ! isValid || isSaving }
					>
						{ saveLabel }
					</Button>
				</Stack>
			</Stack>
		);
	}

	/**
	 * The create body — a local draft (no entity record) seeded from
	 * `toData(undefined)`, committed with a blocking `saveEntityRecord` so the
	 * new record (and its id) is available to `onSaved`.
	 *
	 * @param {Object}   root0
	 * @param {Object}   [root0.item]            The action's subject row (used by
	 *                                           inline-creation modals to seed
	 *                                           row-derived implicit fields).
	 * @param {Function} root0.closeModal        DataViews modal-close callback.
	 * @param {Function} root0.onActionPerformed DataViews post-action callback.
	 * @return {JSX.Element} The create body.
	 */
	function CreateBody( { item, closeModal, onActionPerformed } ) {
		const [ data, setData ] = useState( () =>
			mapToData( undefined, item )
		);
		const [ isSaving, setIsSaving ] = useState( false );
		const { saveEntityRecord } = useDispatch( coreStore );
		const { createSuccessNotice, createErrorNotice } =
			useDispatch( noticesStore );
		const getLastEntitySaveError = useSelect(
			( select ) => select( coreStore ).getLastEntitySaveError,
			[]
		);

		// Gate the submit button on field validity, same as `EntityDataForm`.
		const { validity, isValid } = useFormValidity( data, fields, form );

		const onSubmit = async () => {
			if ( isSaving ) {
				return;
			}
			setIsSaving( true );
			try {
				const payload = buildSubmitPayload( {
					data,
					toRecord,
					item,
				} );
				// Blocking: the new record (with its id) is returned so
				// `onSaved` can navigate to / invalidate the new id.
				const record = await saveEntityRecord( kind, name, payload );
				// `saveEntityRecord` RESOLVES `undefined` on a REST failure
				// (it doesn't throw), so a falsy record means the create
				// failed. Surface the server error and KEEP the modal open
				// rather than show a false success snackbar + close.
				if ( ! record ) {
					const saveError = getLastEntitySaveError( kind, name );
					createErrorNotice(
						saveError?.message ||
							messages.error ||
							__( 'Failed to create.', 'wp-admin-shell' ),
						{ isDismissible: true }
					);
					return;
				}
				createSuccessNotice(
					messages.saved || __( 'Created.', 'wp-admin-shell' ),
					{ type: 'snackbar' }
				);
				onSaved?.( record );
				onActionPerformed?.( [ record ] );
				closeModal();
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						messages.error ||
						__( 'Failed to create.', 'wp-admin-shell' ),
					{ isDismissible: true }
				);
			} finally {
				setIsSaving( false );
			}
		};

		const context =
			item && typeof renderContext === 'function'
				? renderContext( item )
				: null;

		return (
			<Stack direction="column" gap="md">
				{ context }
				<DataForm
					data={ data }
					fields={ fields }
					form={ form }
					validity={ validity }
					onChange={ ( edits ) =>
						setData( ( prev ) => ( { ...prev, ...edits } ) )
					}
				/>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ closeModal }
					>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSubmit }
						loading={ isSaving }
						disabled={ ! isValid || isSaving }
					>
						{ createLabel }
					</Button>
				</Stack>
			</Stack>
		);
	}

	/**
	 * The `RenderModal` DataViews mounts. Returns a BARE body — NO own `<Modal>`.
	 * DataViews' internal `ActionModal` already wraps this in a `<Modal>` (titled
	 * from the action's `label` / `modalHeader`), so wrapping our own would double
	 * the overlay / header / focus trap. Delegates to `EditBody` (keyed per item)
	 * or `CreateBody`; both render their own Save / Cancel footer. Mirrors
	 * `createBulkConfirmModal`.
	 *
	 * @param {Object}   root0
	 * @param {Array}    root0.items             The action's subject rows.
	 * @param {Function} root0.closeModal        DataViews modal-close callback.
	 * @param {Function} root0.onActionPerformed DataViews post-action callback.
	 * @return {JSX.Element} The modal body.
	 */
	return function EntityFormModal( {
		items,
		closeModal,
		onActionPerformed,
	} ) {
		const item = firstItem( items );

		if ( mode === 'create' ) {
			return (
				<CreateBody
					item={ item }
					closeModal={ closeModal }
					onActionPerformed={ onActionPerformed }
				/>
			);
		}
		if ( item ) {
			return (
				<EditBody
					key={ item.id }
					item={ item }
					closeModal={ closeModal }
					onActionPerformed={ onActionPerformed }
				/>
			);
		}
		// Edit with no subject row (shouldn't happen via DataViews) — render a
		// spinner rather than throwing.
		return (
			<div className="wp-admin-shell-app__center">
				<Spinner />
			</div>
		);
	};
}
