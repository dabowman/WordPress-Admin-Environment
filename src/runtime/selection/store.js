import { createReduxStore, register } from '@wordpress/data';

/**
 * `core/admin-shell/selection` — typed event bus for cross-region selection.
 *
 * State shape:
 *   { byScope: { [scopeName]: { value, persist, updatedAt } } }
 *
 * Scopes are namespaced (`content`, `nav.activeItem`, etc.). The bus does
 * not interpret values — apps push whatever they want; subscribers read
 * with `getSelection( scope )`.
 *
 * Persistence is publisher-side: apps call `setSelection( scope, value, true )`
 * to opt into cross-mount memory. The runtime's `persist.js` module bridges
 * the persisted scopes to user meta via the M1 selection REST endpoint.
 */

export const STORE_NAME = 'core/admin-shell/selection';

const SET = 'SET';
const HYDRATE = 'HYDRATE';
const CLEAR = 'CLEAR';

const DEFAULT_STATE = {
	byScope: {},
};

function reducer( state = DEFAULT_STATE, action ) {
	switch ( action.type ) {
		case SET: {
			return {
				...state,
				byScope: {
					...state.byScope,
					[ action.scope ]: {
						value: action.value,
						persist: !! action.persist,
						updatedAt: action.updatedAt,
					},
				},
			};
		}
		case HYDRATE: {
			return {
				...state,
				byScope: {
					...state.byScope,
					...action.byScope,
				},
			};
		}
		case CLEAR: {
			const next = { ...state.byScope };
			delete next[ action.scope ];
			return { ...state, byScope: next };
		}
		default:
			return state;
	}
}

const actions = {
	setSelection( scope, value, persist = false ) {
		return {
			type: SET,
			scope,
			value,
			persist,
			updatedAt: Date.now(),
		};
	},
	clearSelection( scope ) {
		return { type: CLEAR, scope };
	},
	hydrateSelection( byScope ) {
		return { type: HYDRATE, byScope };
	},
};

const selectors = {
	getSelection( state, scope ) {
		return state.byScope[ scope ]?.value;
	},
	getSelectionEntry( state, scope ) {
		return state.byScope[ scope ];
	},
	getAllSelections( state ) {
		return state.byScope;
	},
};

let registered = false;

export function ensureSelectionStore() {
	if ( registered ) {
		return STORE_NAME;
	}
	const store = createReduxStore( STORE_NAME, {
		reducer,
		actions,
		selectors,
	} );
	register( store );
	registered = true;
	return STORE_NAME;
}
