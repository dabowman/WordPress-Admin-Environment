import { mergeFields } from './mergeFields.mjs';

/**
 * Read the resolved per-screen view doc from a pre-serialized inline
 * snapshot (typically `window.wpAdminShell.config`). Returns `null` when
 * the snapshot has no entry for the screen — callers fall through to
 * `/wp-admin-shell/v1/screen-view` for late-registered screens.
 *
 * The PHP resolver pre-computes each screen's resolved view doc (global
 * + inline screen overlay) and writes it back into the boot snapshot at
 * `config.screens[<id>].view._resolved`. The hot-path here just reads
 * that stamp. When the stamp is absent (e.g. server-side skipped the
 * pre-compute), the helper falls back to merging client-side against
 * `settings.views` + `settings.fields` from the same snapshot — useful
 * for tests and incremental rollout.
 *
 * @param {Object|null|undefined} inline   Serialized config snapshot.
 *                                         Typically `window.wpAdminShell.config`.
 * @param {string}                screenId Screen id.
 * @returns {Object|null}
 */
export function hydrateInlineScreenView( inline, screenId ) {
	if ( ! inline || ! inline.screens || typeof screenId !== 'string' || screenId === '' ) {
		return null;
	}
	const screen = inline.screens[ screenId ];
	if ( ! screen || typeof screen !== 'object' ) {
		return null;
	}

	// Fast path: server pre-computed the resolved doc.
	if (
		screen.view &&
		typeof screen.view === 'object' &&
		screen.view._resolved &&
		typeof screen.view._resolved === 'object'
	) {
		return screen.view._resolved;
	}

	// Client-side fallback merge — useful for tests + incremental rollout
	// where the server hasn't yet stamped pre-resolved view docs into the
	// snapshot. Determine `(kind, name)` from explicit screen fields or
	// from the screen's primary `config.{postType,taxonomy}` slot when an
	// app-manifest baseline lives at `settings.views[kind][name]`.
	const { kind, name } = inferKindName( inline, screen );
	let global = {};
	if ( kind && name ) {
		global = inline.settings?.views?.[ kind ]?.[ name ] || {};
		global = applyFieldsRef( global, inline );
	}

	const overlay =
		screen.view && typeof screen.view === 'object' && ! screen.view._resolved
			? screen.view
			: null;

	if ( ! overlay ) {
		return global && Object.keys( global ).length > 0 ? global : null;
	}

	const merged = deepMergeView( global, overlay );

	if ( typeof overlay.fieldsRef === 'string' && overlay.fieldsRef !== '' ) {
		return applyFieldsRef( merged, inline );
	}
	return merged;
}

/**
 * Resolve a doc's `fieldsRef` against `inline.settings.fields`.
 *
 * @param {Object} doc
 * @param {Object} inline
 * @returns {Object}
 */
function applyFieldsRef( doc, inline ) {
	if ( ! doc || typeof doc.fieldsRef !== 'string' || doc.fieldsRef === '' ) {
		return doc;
	}
	const collection = inline.settings?.fields?.[ doc.fieldsRef ];
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
 * merge by `id`, and a `null` value tombstones the key. Mirrors the
 * PHP `WP_Admin_Shell_View_Config::deep_merge_view`.
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
 * Infer `(kind, name)` from a screen — same precedence as PHP
 * `WP_Admin_Shell_View_Config::infer_kind_name`. Client side has access
 * to app manifests via `inline.manifests?.apps?.[appId]`.
 *
 * @param {Object} inline
 * @param {Object} screen
 * @returns {{ kind: string, name: string }}
 */
function inferKindName( inline, screen ) {
	if ( typeof screen.viewKind === 'string' && typeof screen.viewName === 'string' ) {
		return { kind: screen.viewKind, name: screen.viewName };
	}
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
		return { kind: '', name: '' };
	}
	const manifest = inline.manifests?.apps?.[ appId ];
	if ( ! manifest || ! manifest.view ) {
		return { kind: '', name: '' };
	}
	let kind = typeof manifest.view.kind === 'string' ? manifest.view.kind : '';
	let name = typeof manifest.view.name === 'string' ? manifest.view.name : '';
	const cfg = screen.config && typeof screen.config === 'object' ? screen.config : {};
	if ( kind === 'postType' && typeof cfg.postType === 'string' && cfg.postType !== '' ) {
		name = cfg.postType;
	} else if ( kind === 'taxonomy' && typeof cfg.taxonomy === 'string' && cfg.taxonomy !== '' ) {
		name = cfg.taxonomy;
	}
	return { kind, name };
}
