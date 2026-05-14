/**
 * Merge inline fields over a collection's base fields. Both arrays are
 * lists of field descriptors keyed by `id`. Inline overrides win
 * per-field (shallow merge); collection fields not redeclared carry
 * through. Inline-only ids append after the base list to preserve the
 * collection's field order.
 *
 * Mirror of the PHP `WP_Admin_Shell_View_Config::merge_fields`. Lives
 * in `.mjs` so the inline-config hydration path inside the React hook
 * shares the same logic without going through the bundler twice.
 *
 * @param {Array} base   Collection fields.
 * @param {Array} inline Inline-declared fields.
 * @returns {Array}
 */
export function mergeFields( base, inline ) {
	const inlineById = new Map();
	for ( const field of inline ) {
		if ( field && typeof field === 'object' && 'id' in field ) {
			inlineById.set( field.id, field );
		}
	}

	const out = [];
	const seen = new Set();

	for ( const field of base ) {
		if ( ! field || typeof field !== 'object' || ! ( 'id' in field ) ) {
			continue;
		}
		seen.add( field.id );
		if ( inlineById.has( field.id ) ) {
			out.push( { ...field, ...inlineById.get( field.id ) } );
		} else {
			out.push( field );
		}
	}

	for ( const field of inline ) {
		if ( ! field || typeof field !== 'object' || ! ( 'id' in field ) ) {
			continue;
		}
		if ( ! seen.has( field.id ) ) {
			out.push( field );
		}
	}

	return out;
}
