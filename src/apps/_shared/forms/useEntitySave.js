import { useCallback } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { __ } from '@wordpress/i18n';

/**
 * Shared save handler for `useEntityRecord`-backed forms (profile, settings
 * panels). Wraps the entity's `save()` in the try/catch + success-snackbar /
 * error-notice boilerplate every form repeated verbatim.
 *
 * **Why the optional entity coords matter.** `useEntityRecord().save()` (which
 * proxies `saveEditedEntityRecord`) does NOT reject on a REST failure — it
 * resolves and records the error in core-data's `getLastEntitySaveError(kind,
 * name, recordId)` selector. So the `try/catch` below only catches client-side
 * throws; a server 4xx/5xx slips through and would otherwise show a false
 * "Changes saved." When the caller passes `entity` coords, this handler also
 * consults `getLastEntitySaveError` after `save()` and returns `false` (showing
 * the error notice) on a server-reported failure. Callers without coords keep
 * the legacy try/catch-only behavior (backward compatible — profile / settings
 * panels pass no coords and are unaffected).
 *
 * @param {Function}      save               The entity record's `save` function.
 * @param {Object}        [messages]
 * @param {string}        [messages.success] Snackbar copy on success.
 * @param {string}        [messages.error]   Fallback copy on failure (the error's own
 *                                           message wins when present).
 * @param {Object}        [entity]           Optional entity coords for server-error detection.
 * @param {string}        [entity.kind]      Entity kind (e.g. `'root'`).
 * @param {string}        [entity.name]      Entity name (e.g. `'comment'`).
 * @param {number|string} [entity.recordId]  The record id being saved.
 * @return {() => Promise<boolean>} The save handler. Resolves `true` on success,
 *                                  `false` when the save threw OR (when `entity`
 *                                  coords are supplied) the server reported an
 *                                  error. The error notice is shown either way.
 *                                  Callers that need to branch on the outcome —
 *                                  e.g. a modal host that should stay open on
 *                                  failure — can await the boolean; existing
 *                                  callers ignore it.
 */
export function useEntitySave( save, messages = {}, entity = {} ) {
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );
	const { kind, name, recordId } = entity;
	const getLastEntitySaveError = useSelect(
		( select ) => select( coreStore ).getLastEntitySaveError,
		[]
	);
	const successMessage =
		messages.success || __( 'Changes saved.', 'wp-admin-shell' );
	const errorMessage =
		messages.error || __( 'Failed to save changes.', 'wp-admin-shell' );

	return useCallback( async () => {
		try {
			await save();
			// `saveEditedEntityRecord` resolves even on a REST failure; the
			// error lives in `getLastEntitySaveError`. Only check it when the
			// caller supplied entity coords (legacy callers stay try/catch-only).
			if ( kind && name ) {
				const saveError = getLastEntitySaveError(
					kind,
					name,
					recordId
				);
				if ( saveError ) {
					createErrorNotice( saveError.message || errorMessage, {
						isDismissible: true,
					} );
					return false;
				}
			}
			createSuccessNotice( successMessage, { type: 'snackbar' } );
			return true;
		} catch ( err ) {
			createErrorNotice( err.message || errorMessage, {
				isDismissible: true,
			} );
			return false;
		}
	}, [
		save,
		kind,
		name,
		recordId,
		getLastEntitySaveError,
		createSuccessNotice,
		createErrorNotice,
		successMessage,
		errorMessage,
	] );
}
