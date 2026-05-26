import { useCallback } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { __ } from '@wordpress/i18n';

/**
 * Shared save handler for `useEntityRecord`-backed forms (profile, settings
 * panels). Wraps the entity's `save()` in the try/catch + success-snackbar /
 * error-notice boilerplate every form repeated verbatim.
 *
 * @param {Function} save               The entity record's `save` function.
 * @param {Object}   [messages]
 * @param {string}   [messages.success] Snackbar copy on success.
 * @param {string}   [messages.error]   Fallback copy on failure (the error's own
 *                                      message wins when present).
 * @return {() => Promise<void>} The save handler.
 */
export function useEntitySave( save, messages = {} ) {
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );
	const successMessage =
		messages.success || __( 'Changes saved.', 'wp-admin-shell' );
	const errorMessage =
		messages.error || __( 'Failed to save changes.', 'wp-admin-shell' );

	return useCallback( async () => {
		try {
			await save();
			createSuccessNotice( successMessage, { type: 'snackbar' } );
		} catch ( err ) {
			createErrorNotice( err.message || errorMessage, {
				isDismissible: true,
			} );
		}
	}, [
		save,
		createSuccessNotice,
		createErrorNotice,
		successMessage,
		errorMessage,
	] );
}
