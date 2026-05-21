import { mergeFields } from './mergeFields.mjs';
import { shouldWarnDeprecation } from './deprecation.mjs';

/**
 * One-shot guards for deprecation-shim warnings — fire at most once per
 * module load. Removed in v3.1.0 alongside the shims themselves.
 */
let warnedHydrateScreen = false;

/**
 * Max `extends` chain depth — mirrors PHP `WP_Admin_Shell_Data_View_Config`.
 * Triples that exceed this short-circuit to the base entry.
 */
const MAX_EXTENDS_DEPTH = 10;

/**
 * Read the resolved per-screen DataView doc from a pre-serialized inline
 * snapshot (typically `window.wpAdminShell.config`). Returns `null` when
 * the snapshot has no entry for the screen — callers fall through to
 * `/wp-admin-shell/v1/data-view?screen=<id>` for late-registered screens.
 *
 * The PHP resolver pre-computes each screen's resolved doc (the resolved
 * (kind, name, variant) triple + the screen's inline `dataView` overlay)
 * and stamps the result into `config.screens[<id>].dataView._resolved`.
 * The hot path reads that stamp.
 *
 * When the stamp is absent (tests, incremental rollout, late-registered
 * screens), the helper does a client-side merge against
 * `settings.dataViews` + `settings.dataFields` + app manifest baselines.
 *
 * @param {Object|null|undefined} inline   Serialized config snapshot.
 *                                         Typically `window.wpAdminShell.config`.
 * @param {string}                screenId Screen id.
 * @returns {Object|null}
 */
export function hydrateInlineScreenDataView( inline, screenId ) {
	if ( ! inline || ! inline.screens || typeof screenId !== 'string' || screenId === '' ) {
		return null;
	}
	const screen = inline.screens[ screenId ];
	if ( ! screen || typeof screen !== 'object' ) {
		return null;
	}

	// Fast path: server pre-stamped the resolved doc.
	if (
		screen.dataView &&
		typeof screen.dataView === 'object' &&
		screen.dataView._resolved &&
		typeof screen.dataView._resolved === 'object'
	) {
		return screen.dataView._resolved;
	}

	// Client-side merge fallback. Resolve the (kind, name, variant) triple
	// the screen consumes — explicit `dataViewRef` wins, then explicit
	// `dataViewKind`/`dataViewName`/`dataViewVariant`, then manifest +
	// config inference (with `screen.config.variant` honored for v2
	// back-compat).
	const { kind, name, variant } = inferTriple( inline, screen );

	let base = {};
	if ( kind && name ) {
		base = hydrateInlineDataViewTriple( inline, kind, name, variant );
	}

	const overlay =
		screen.dataView && typeof screen.dataView === 'object' && ! screen.dataView._resolved
			? screen.dataView
			: null;

	if ( ! overlay ) {
		return base && Object.keys( base ).length > 0 ? base : null;
	}

	// Strip `extends` from screen overlay — only registry entries inherit.
	const cleanOverlay = { ...overlay };
	delete cleanOverlay.extends;

	const merged = deepMergeView( base, cleanOverlay );

	if ( typeof cleanOverlay.fieldsRef === 'string' && cleanOverlay.fieldsRef !== '' ) {
		return applyFieldsRef( merged, inline );
	}
	return merged;
}

/**
 * Resolve a registry triple `(kind, name, variant)` directly from the
 * inline snapshot. Mirrors PHP `resolve_data_view_triple` minus filter
 * dispatch (filters fire server-side; the JS hot path consumes the
 * post-filter result stamped into the snapshot at the `core` origin via
 * `inject_app_baselines`).
 *
 * Resolves the `extends` chain (max depth 10, cycle-safe) and the
 * `fieldsRef` against `settings.dataFields`.
 *
 * @param {Object} inline  Serialized config snapshot.
 * @param {string} kind    Entity kind.
 * @param {string} name    Entity name.
 * @param {string} variant Variant id; `_default` for the unqualified base.
 * @returns {Object} Resolved DataView doc. Empty object when nothing matched.
 */
export function hydrateInlineDataViewTriple( inline, kind, name, variant ) {
	if ( ! inline || typeof kind !== 'string' || typeof name !== 'string' ) {
		return {};
	}
	const useVariant =
		typeof variant === 'string' && variant !== '' ? variant : '_default';

	const doc = resolveExtendsChain( inline, kind, name, useVariant, [] );
	return applyFieldsRef( doc, inline );
}

/**
 * Recursive `extends` chain resolver. Cycle-safe + depth-capped. Mirror
 * of PHP `WP_Admin_Shell_Data_View_Config::resolve_extends_chain`.
 *
 * @param {Object}   inline
 * @param {string}   kind
 * @param {string}   name
 * @param {string}   variant
 * @param {string[]} stack
 * @returns {Object}
 */
function resolveExtendsChain( inline, kind, name, variant, stack ) {
	const entry = inline.settings?.dataViews?.[ kind ]?.[ name ]?.[ variant ];
	if ( ! entry || typeof entry !== 'object' ) {
		return {};
	}

	// `_default` is the implicit base — silently ignore any `extends` on it.
	if ( variant === '_default' && entry.extends ) {
		// eslint-disable-next-line no-unused-vars
		const { extends: _ignored, ...rest } = entry;
		return rest;
	}

	if ( ! entry.extends ) {
		// eslint-disable-next-line no-unused-vars
		const { extends: _ignored, ...rest } = entry;
		return rest;
	}

	if ( stack.length >= MAX_EXTENDS_DEPTH ) {
		// Depth cap — short-circuit silently in production.
		// eslint-disable-next-line no-unused-vars
		const { extends: _ignored, ...rest } = entry;
		return rest;
	}

	const parentVariant = entry.extends;
	if (
		typeof parentVariant !== 'string' ||
		parentVariant === '' ||
		parentVariant === variant ||
		stack.includes( parentVariant )
	) {
		// Cycle or self-reference — short-circuit.
		// eslint-disable-next-line no-unused-vars
		const { extends: _ignored, ...rest } = entry;
		return rest;
	}

	const parent = resolveExtendsChain(
		inline,
		kind,
		name,
		parentVariant,
		[ ...stack, variant ]
	);

	// eslint-disable-next-line no-unused-vars
	const { extends: _ignored, ...child } = entry;
	return deepMergeView( parent, child );
}

/**
 * Resolve a doc's `fieldsRef` against `inline.settings.dataFields`.
 *
 * @param {Object} doc
 * @param {Object} inline
 * @returns {Object}
 */
function applyFieldsRef( doc, inline ) {
	if ( ! doc || typeof doc.fieldsRef !== 'string' || doc.fieldsRef === '' ) {
		return doc;
	}
	const collection = inline.settings?.dataFields?.[ doc.fieldsRef ];
	if ( ! collection || ! Array.isArray( collection.fields ) ) {
		return doc;
	}
	return {
		...doc,
		fields: mergeFields(
			collection.fields,
			Array.isArray( doc.fields ) ? doc.fields : []
		),
		_resolvedFieldsRef: doc.fieldsRef,
	};
}

/**
 * Per-key deep merge with three special-cases: `fields[]` + `actions[]`
 * merge by `id`, and a `null` value tombstones the key. Mirrors PHP
 * `WP_Admin_Shell_Data_View_Config::deep_merge_view`.
 *
 * @param {Object} base
 * @param {Object} overlay
 * @returns {Object}
 */
function deepMergeView( base, overlay ) {
	if ( ! overlay || typeof overlay !== 'object' ) {
		return base;
	}
	if ( ! base || typeof base !== 'object' ) {
		return overlay;
	}
	const out = { ...base };
	for ( const key of Object.keys( overlay ) ) {
		const value = overlay[ key ];
		if ( value === null ) {
			delete out[ key ];
			continue;
		}
		if ( ( key === 'fields' || key === 'actions' ) && Array.isArray( value ) ) {
			const baseList = Array.isArray( out[ key ] ) ? out[ key ] : [];
			out[ key ] = mergeIdKeyed( baseList, value );
			continue;
		}
		if (
			value &&
			typeof value === 'object' &&
			! Array.isArray( value ) &&
			out[ key ] &&
			typeof out[ key ] === 'object' &&
			! Array.isArray( out[ key ] )
		) {
			out[ key ] = deepMergeView( out[ key ], value );
			continue;
		}
		out[ key ] = value;
	}
	return out;
}

/**
 * Id-keyed merge for `fields[]` / `actions[]`. Overlay entries with a
 * matching `id` shallow-override base; new ids append; `__tombstone: true`
 * removes the matching base entry. Mirror of PHP `merge_id_keyed`.
 *
 * @param {Array} base
 * @param {Array} overlay
 * @returns {Array}
 */
function mergeIdKeyed( base, overlay ) {
	const overlayById = new Map();
	const overlayOrder = [];
	const tombstones = new Set();
	for ( const entry of overlay ) {
		if ( ! entry || typeof entry !== 'object' || ! ( 'id' in entry ) ) {
			continue;
		}
		overlayById.set( entry.id, entry );
		overlayOrder.push( entry.id );
		if ( entry.__tombstone ) {
			tombstones.add( entry.id );
		}
	}
	const out = [];
	const seen = new Set();
	for ( const entry of base ) {
		if ( ! entry || typeof entry !== 'object' || ! ( 'id' in entry ) ) {
			continue;
		}
		if ( tombstones.has( entry.id ) ) {
			seen.add( entry.id );
			continue;
		}
		if ( overlayById.has( entry.id ) ) {
			// eslint-disable-next-line no-unused-vars
			const { __tombstone, ...override } = overlayById.get( entry.id );
			out.push( { ...entry, ...override } );
		} else {
			out.push( entry );
		}
		seen.add( entry.id );
	}
	for ( const id of overlayOrder ) {
		if ( seen.has( id ) || tombstones.has( id ) ) {
			continue;
		}
		// eslint-disable-next-line no-unused-vars
		const { __tombstone, ...entry } = overlayById.get( id );
		out.push( entry );
	}
	return out;
}

/**
 * Infer the `(kind, name, variant)` triple a screen consumes. Same
 * precedence as PHP `WP_Admin_Shell_Data_View_Config::infer_kind_name_variant`.
 *
 * @param {Object} inline Serialized config snapshot.
 * @param {Object} screen Screen entry.
 * @returns {{ kind: string, name: string, variant: string }}
 */
function inferTriple( inline, screen ) {
	// 1. dataViewRef — "kind/name/variant".
	if ( typeof screen.dataViewRef === 'string' && screen.dataViewRef !== '' ) {
		const parts = screen.dataViewRef.split( '/' );
		if ( parts.length === 3 ) {
			const [ kind, name, variant ] = parts;
			if ( kind && name && variant ) {
				return { kind, name, variant };
			}
		}
	}

	// 2. Explicit fields.
	if (
		typeof screen.dataViewKind === 'string' &&
		typeof screen.dataViewName === 'string'
	) {
		return {
			kind: screen.dataViewKind,
			name: screen.dataViewName,
			variant:
				typeof screen.dataViewVariant === 'string' &&
				screen.dataViewVariant !== ''
					? screen.dataViewVariant
					: '_default',
		};
	}

	// 3. Manifest inference.
	let appId = null;
	if ( typeof screen.app === 'string' ) {
		appId = screen.app;
	} else if ( Array.isArray( screen.apps ) ) {
		for ( const entry of screen.apps ) {
			if ( entry && typeof entry === 'object' && typeof entry.app === 'string' ) {
				appId = entry.app;
				break;
			}
		}
	}
	if ( ! appId ) {
		return { kind: '', name: '', variant: '_default' };
	}
	const manifest = inline.manifests?.apps?.[ appId ];
	if ( ! manifest || ! manifest.dataView ) {
		return { kind: '', name: '', variant: '_default' };
	}
	let kind = typeof manifest.dataView.kind === 'string' ? manifest.dataView.kind : '';
	let name = typeof manifest.dataView.name === 'string' ? manifest.dataView.name : '';
	const cfg = screen.config && typeof screen.config === 'object' ? screen.config : {};
	if ( kind === 'postType' && typeof cfg.postType === 'string' && cfg.postType !== '' ) {
		name = cfg.postType;
	} else if ( kind === 'taxonomy' && typeof cfg.taxonomy === 'string' && cfg.taxonomy !== '' ) {
		name = cfg.taxonomy;
	}
	// v2 back-compat — `route.config.variant` flows into screen synthesis.
	const variant =
		typeof cfg.variant === 'string' && cfg.variant !== ''
			? cfg.variant
			: '_default';
	return { kind, name, variant };
}


/**
 * Deprecation shim — v2 hydrate-helper name. Removed in v3.1.0.
 * Forwards to {@link hydrateInlineScreenDataView} with a one-shot
 * `console.warn`. Warn gate: `NODE_ENV !== 'production'` OR
 * `window.wpAdminShell.debug === true` (site admins with `WP_DEBUG` on
 * get JS warnings even in prod builds).
 *
 * @deprecated Use `hydrateInlineScreenDataView` instead. Removed in v3.1.
 * @param {Object|null|undefined} inline
 * @param {string}                screenId
 * @returns {Object|null}
 */
export function hydrateInlineScreenView( inline, screenId ) {
	if ( shouldWarnDeprecation() ) {
		if ( ! warnedHydrateScreen && typeof console !== 'undefined' ) {
			warnedHydrateScreen = true;
			// eslint-disable-next-line no-console
			console.warn(
				'hydrateInlineScreenView is deprecated and will be removed in v3.1. Use hydrateInlineScreenDataView from @wp-admin-shell/runtime/dataView/hydrateInline instead.'
			);
		}
	}
	return hydrateInlineScreenDataView( inline, screenId );
}

/**
 * Test helper — reset the one-shot warn guard (3d.5 Item 2 coverage).
 *
 * @returns {void}
 */
export function _resetHydrateDeprecationWarnGuard() {
	warnedHydrateScreen = false;
}
