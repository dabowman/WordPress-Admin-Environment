import { useEffect, useMemo, useState } from '@wordpress/element';

/**
 * Shared DataViews `view` + `selection` state for the entity-CRUD apps.
 *
 * Owns the three pieces every list app repeated verbatim:
 *
 * 1. **Seed** — `view` state initialized from `viewDefaults` spread under the
 *    resolved `dataViewConfig.defaultView`, so iterating `view.filters` /
 *    `view.fields` is safe when admin.json omits empty-list keys.
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
 *
 * @param {Object}      options
 * @param {string|null} options.screenId       Active screen id (resync key).
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
	const [ rawView, setRawView ] = useState( () => ( {
		...viewDefaults,
		...( dataViewConfig.defaultView || {} ),
	} ) );

	useEffect( () => {
		setRawView( {
			...viewDefaults,
			...( dataViewConfig.defaultView || {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ screenId, ...resyncKeys ] );

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

	const [ selection, setSelection ] = useState( [] );

	return { view, setView: setRawView, selection, setSelection };
}
