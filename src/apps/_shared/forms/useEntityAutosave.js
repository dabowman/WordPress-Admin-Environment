import { useState, useEffect, useCallback, useRef } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { autosaveTarget } from '../../simple-editor/autosave.mjs';

/**
 * Known REST bases for built-in post types. Lets {@link useRestBase} return
 * synchronously on the first render without waiting for the post-type entity to
 * resolve.
 *
 * @type {Record<string, string>}
 */
export const BUILTIN_REST_BASES = { post: 'posts', page: 'pages' };

/**
 * Returns the REST base for a given post type, or `undefined` while the
 * post-type entity is still resolving. Built-in types (`post` → `posts`,
 * `page` → `pages`) resolve synchronously via {@link BUILTIN_REST_BASES} so
 * they never return `undefined`.
 *
 * Derives the base from the post-type entity (`rest_base`) rather than a
 * `posts`/`pages` ternary so custom post types autosave to the correct
 * endpoint (issue #210).
 *
 * @param {string} postType Post type slug.
 * @return {string|undefined} REST base, or `undefined` while resolving.
 */
export function useRestBase( postType ) {
	const entityBase = useSelect(
		( select ) => select( coreStore ).getPostType( postType )?.rest_base,
		[ postType ]
	);
	// Entity base wins when available; fall back to the built-in lookup for the
	// first-render tick before the entity request completes. CPTs that have no
	// entry in BUILTIN_REST_BASES return `undefined` until the entity resolves.
	return entityBase ?? BUILTIN_REST_BASES[ postType ];
}

/**
 * Read the raw string from a REST field that may be a string (inline edit) or
 * an object (`{ raw, rendered }` from REST).
 *
 * @param {string|{raw?: string}} field Entity field value.
 * @return {string} The raw string, or `''`.
 */
function readRaw( field ) {
	return typeof field === 'string' ? field : field?.raw ?? '';
}

/**
 * Shared autosave-on-change hook for `useEntityRecord`-backed post editors.
 *
 * Debounces a save 2 seconds after the last edit while `hasEdits` is true, then
 * routes the write per {@link autosaveTarget}: draft / auto-draft posts flush
 * the buffered edits to the live record via `save()`, while pending / published
 * / private / scheduled posts write a per-user autosave revision through
 * `POST /wp/v2/{restBase}/{postId}/autosaves` and leave the live record
 * untouched (issue #101). The buffered edits stay in `editedRecord`
 * (`hasEdits` remains true) until the author explicitly flushes them live.
 *
 * Extracted from `core:simple-editor` so the document-settings sidebar and any
 * future autosave-inspector host share one commit path (issue #119).
 *
 * @param {Object}   options
 * @param {string}   options.postType     Post type slug (for REST-base derivation).
 * @param {number}   options.postId       Persisted post id.
 * @param {Object}   options.editedRecord The buffered entity record (from `useEntityRecord`).
 * @param {string}   [options.status]     Persisted post status (`record.status`).
 * @param {Function} options.save         The entity record's `save` function.
 * @param {boolean}  options.hasEdits     Whether the buffered record has unsaved edits.
 * @param {number}   [options.delay]      Debounce delay in ms (default 2000).
 * @return {{
 *   saveStatus: 'idle'|'saving'|'saved'|'autosaved'|'error',
 *   saveError: string|null,
 *   isBusy: boolean,
 *   runSave: () => Promise<void>,
 *   flush: () => Promise<void>,
 *   cancelPending: () => void,
 * }} Autosave controls. `runSave` flushes the live record immediately;
 *   `flush` cancels any pending debounce then runs `runSave` (use it before an
 *   explicit Publish/Update); `cancelPending` clears the debounce timer only.
 */
export function useEntityAutosave( {
	postType,
	postId,
	editedRecord,
	status,
	save,
	hasEdits,
	delay = 2000,
} ) {
	const [ saveStatus, setSaveStatus ] = useState( 'idle' );
	const [ saveError, setSaveError ] = useState( null );
	const timerRef = useRef( null );

	// Resolves synchronously for built-in types; waits one tick for CPTs. By the
	// time `hasEdits` is true and the timer fires, the entity has resolved and
	// the correct REST base is in place.
	const restBase = useRestBase( postType ) ?? 'posts';

	const runSave = useCallback( async () => {
		setSaveStatus( 'saving' );
		try {
			await save();
			setSaveStatus( 'saved' );
			setSaveError( null );
		} catch ( err ) {
			setSaveStatus( 'error' );
			setSaveError(
				err?.message || __( 'Save failed.', 'wp-admin-shell' )
			);
		}
	}, [ save ] );

	// Published / private / scheduled posts: route the debounced autosave to the
	// per-user autosaves endpoint instead of PUTting the live record, so an
	// in-progress autosave can never clobber the public post (issue #101).
	const runAutosave = useCallback( async () => {
		setSaveStatus( 'saving' );
		try {
			await apiFetch( {
				path: `/wp/v2/${ restBase }/${ postId }/autosaves`,
				method: 'POST',
				data: {
					title: readRaw( editedRecord?.title ),
					content: readRaw( editedRecord?.content ),
					excerpt: readRaw( editedRecord?.excerpt ),
				},
			} );
			setSaveStatus( 'autosaved' );
			setSaveError( null );
		} catch ( err ) {
			setSaveStatus( 'error' );
			setSaveError(
				err?.message || __( 'Save failed.', 'wp-admin-shell' )
			);
		}
	}, [ editedRecord, postId, restBase ] );

	const cancelPending = useCallback( () => {
		if ( timerRef.current ) {
			clearTimeout( timerRef.current );
			timerRef.current = null;
		}
	}, [] );

	const flush = useCallback( async () => {
		cancelPending();
		await runSave();
	}, [ cancelPending, runSave ] );

	// Debounced autosave tick.
	useEffect( () => {
		if ( ! hasEdits ) {
			return;
		}
		timerRef.current = setTimeout( () => {
			timerRef.current = null;
			if ( autosaveTarget( status ) === 'parent' ) {
				runSave();
			} else {
				runAutosave();
			}
		}, delay );

		return () => {
			if ( timerRef.current ) {
				clearTimeout( timerRef.current );
				timerRef.current = null;
			}
		};
	}, [ hasEdits, editedRecord, status, runSave, runAutosave, delay ] );

	// Fade the terminal save states back to idle.
	useEffect( () => {
		if ( saveStatus !== 'saved' && saveStatus !== 'autosaved' ) {
			return;
		}
		const handle = setTimeout( () => setSaveStatus( 'idle' ), 2000 );
		return () => clearTimeout( handle );
	}, [ saveStatus ] );

	return {
		saveStatus,
		saveError,
		isBusy: saveStatus === 'saving',
		runSave,
		flush,
		cancelPending,
	};
}
