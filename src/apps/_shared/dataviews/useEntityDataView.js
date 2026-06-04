import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

import {
	applySavedView,
	buildSavePatch,
	pickDurableView,
	readSavedView,
} from './dataViewPrefs.mjs';

/** User-prefs REST endpoint (read full blob / partial-merge write). */
const PREFS_PATH = '/wp-admin-workspaces/v1/user-prefs';

/** Debounce window before a view change is persisted (ms). */
const PERSIST_DEBOUNCE_MS = 600;

/**
 * Shared DataViews `view` + `selection` state for the entity-CRUD apps.
 *
 * Owns the pieces every list app repeated verbatim:
 *
 * 1. **Seed** — `view` state initialized from `viewDefaults` spread under the
 *    resolved `dataViewConfig.defaultView`, so iterating `view.filters` /
 *    `view.fields` is safe when workspace.json omits empty-list keys.
 * 2. **Resync** — re-seed when the screen flips on the same hook instance
 *    (e.g. /posts → /posts/drafts both mount PostsApp). The `useState`
 *    initializer runs once, so without this a sibling screen inherits the
 *    prior screen's perPage / sort / filters. Keyed on `screenId` plus any
 *    `resyncKeys` (postType, taxonomy) — NOT `dataViewConfig` — to avoid
 *    clobbering in-session view edits whenever the cascade re-resolves.
 * 3. **Title-dedup** — DataViews renders the title cell from `view.titleField`;
 *    leaving that id in `view.fields` would render a second column for the
 *    same field. The returned `view` has the title id stripped from `fields`;
 *    `setView` / the raw state keep it so resync stays lossless.
 * 4. **Selection reset** — the same screen/triple flip that re-seeds the view
 *    also clears `selection`: the prior screen's selected row ids don't exist
 *    in the new dataset, so a carried-over selection would point a subsequent
 *    bulk action at stale/absent ids.
 * 5. **Prefs persistence (Screen-Options parity)** — the durable view axes
 *    (fields / sort / perPage / layout / type — see `DURABLE_AXES`) are saved
 *    per `screenId` to `wp_admin_workspaces_user_prefs` via the `/user-prefs` REST
 *    surface (debounced), and rehydrated on mount + on every screen flip.
 *    Saved durable axes WIN over the resolved `defaultView` for the SAME
 *    screen; transient axes (search / filters / page) always come from the
 *    fresh seed so deep-linked filters/search aren't clobbered. Prefs load is
 *    async + non-blocking: the synchronous seed renders first (no flash), then
 *    the saved view overlays once it arrives. See `dataViewPrefs.mjs`.
 *
 * @param {Object}      options
 * @param {string|null} options.screenId       Active screen id (resync + prefs key).
 * @param {Object}      options.dataViewConfig Resolved doc from `useDataView`.
 * @param {Object}      options.viewDefaults   Per-app `VIEW_DEFAULTS`.
 * @param {Array}       [options.resyncKeys]   Extra resync deps (e.g. [ postType ]).
 * @return {{ view: Object, setView: Function, selection: Array, setSelection: Function }} DataViews `view` (title-deduped) + `setView`, plus `selection` + `setSelection`.
 */
export function useEntityDataView( {
	screenId,
	dataViewConfig,
	viewDefaults,
	resyncKeys = [],
} ) {
	const seed = () => ( {
		...viewDefaults,
		...( dataViewConfig.defaultView || {} ),
	} );

	const [ rawView, setRawView ] = useState( seed );
	const [ selection, setSelection ] = useState( [] );

	// Full user-prefs blob (null until the first GET resolves). Held in a ref
	// — reading it must not re-run the resync effect, and there's no render
	// that depends on the blob directly (the resolved `rawView` does).
	const prefsRef = useRef( null );

	const persistTimer = useRef( null );
	const lastPersisted = useRef( null );

	// Load the saved prefs once, then overlay the saved durable view for the
	// CURRENT screen over the synchronous seed. Runs on mount only; the
	// resync effect handles subsequent screen flips (it reads prefsRef). A
	// failed load leaves prefsRef null → falls back to seed everywhere.
	useEffect( () => {
		let cancelled = false;
		apiFetch( { path: PREFS_PATH } )
			.then( ( result ) => {
				if ( cancelled ) {
					return;
				}
				prefsRef.current =
					result && typeof result === 'object' ? result : {};
				const saved = readSavedView( prefsRef.current, screenId );
				if ( saved ) {
					// Sync the persist baseline to the value we're applying so
					// the resulting state change isn't written straight back.
					lastPersisted.current = JSON.stringify(
						pickDurableView( applySavedView( seed(), saved ) )
					);
					setRawView( ( current ) =>
						applySavedView( current, saved )
					);
				}
			} )
			.catch( () => {
				if ( ! cancelled ) {
					prefsRef.current = {};
				}
			} );
		return () => {
			cancelled = true;
		};
		// Mount-only: the resync effect covers screen changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Resync on screen / triple change. Re-seed from defaults + defaultView,
	// then overlay any saved durable view for the NEW screen (saved wins over
	// defaultView for the same screen, matching the mount-load behavior). When
	// prefs haven't loaded yet, prefsRef is null and the bare seed is used —
	// the mount-load effect will overlay once it resolves. Selection clears.
	// Also resets the persist baseline so the new screen's first view value
	// (its seed/saved overlay) isn't mistaken for an edit and written back.
	// Declared BEFORE the persist effect so its baseline reset wins the same
	// commit's effect ordering.
	useEffect( () => {
		const next = seed();
		const saved = readSavedView( prefsRef.current, screenId );
		setRawView( saved ? applySavedView( next, saved ) : next );
		setSelection( [] );
		lastPersisted.current = null;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ screenId, ...resyncKeys ] );

	// Persist durable view axes (debounced) whenever the view changes. Skips
	// the initial render and any change that doesn't alter the durable axes
	// (e.g. typing in search / paging) so we don't write on every keystroke.
	useEffect( () => {
		if ( ! screenId ) {
			return undefined;
		}
		const durable = pickDurableView( rawView );
		const serialized = JSON.stringify( durable );
		// A view that exactly matches the screen's freshly-reconstructed
		// state (seed + the currently-saved durable view for THIS screen) is
		// not a user edit — it's the result of seeding, rehydrating saved
		// prefs, or flipping to this screen. Skip writing it (keeping the
		// baseline synced) so navigation between two screens served by the
		// SAME app instance — Posts↔Pages / Categories↔Tags / Profile↔user-
		// edit all reuse one MountedApp with only `screenId` flipping — can't
		// write the destination screen's own view straight back to itself.
		// The stale-render window during a screen flip (new screenId, old
		// rawView) is still caught by the null-baseline guard below; this
		// guard catches the follow-up commit (new rawView) where the baseline
		// would otherwise hold the previous screen's durable. Only a genuine
		// divergence from the saved/seeded state schedules a write.
		const saved = readSavedView( prefsRef.current, screenId );
		const clean = JSON.stringify(
			pickDurableView( applySavedView( seed(), saved ) )
		);
		if ( serialized === clean ) {
			lastPersisted.current = serialized;
			return undefined;
		}
		// First run for this screen establishes the baseline (the seed/saved
		// value just applied) without writing it back.
		if ( lastPersisted.current === null ) {
			lastPersisted.current = serialized;
			return undefined;
		}
		if ( serialized === lastPersisted.current ) {
			return undefined;
		}
		lastPersisted.current = serialized;
		if ( persistTimer.current ) {
			clearTimeout( persistTimer.current );
		}
		persistTimer.current = setTimeout( () => {
			const patch = buildSavePatch( screenId, durable );
			if ( ! patch ) {
				return;
			}
			apiFetch( { path: PREFS_PATH, method: 'POST', data: patch } )
				.then( ( result ) => {
					if ( result && typeof result === 'object' ) {
						prefsRef.current = result;
					}
				} )
				// Persistence is best-effort: a failed write must not break
				// the list. The in-memory view is unaffected; the user simply
				// loses this particular save.
				.catch( () => {} );
		}, PERSIST_DEBOUNCE_MS );
		// No per-run cleanup: an unrelated transient re-render (search / page)
		// must NOT cancel an already-scheduled durable write. The debounce is
		// enforced by the clearTimeout above (a fresh durable change replaces a
		// pending one); unmount cleanup lives in its own effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ rawView, screenId ] );

	// Cancel any pending write on unmount so a debounced timer doesn't fire
	// after the component is gone.
	useEffect(
		() => () => {
			if ( persistTimer.current ) {
				clearTimeout( persistTimer.current );
			}
		},
		[]
	);

	const view = useMemo( () => {
		const titleField =
			rawView.titleField || dataViewConfig.defaultView?.titleField;
		if ( ! titleField || ! Array.isArray( rawView.fields ) ) {
			return rawView;
		}
		const fields = rawView.fields.filter( ( id ) => id !== titleField );
		if ( fields.length === rawView.fields.length ) {
			return rawView;
		}
		return { ...rawView, fields };
	}, [ rawView, dataViewConfig ] );

	return { view, setView: setRawView, selection, setSelection };
}
