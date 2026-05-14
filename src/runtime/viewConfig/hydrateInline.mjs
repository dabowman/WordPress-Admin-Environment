import { mergeFields } from './mergeFields.mjs';

/**
 * Read a view-config triple from a pre-serialized inline snapshot
 * (typically `window.wpAdminShell.config`). Returns `null` when the
 * snapshot has no entry for the triple — callers fall through to REST.
 *
 * Pure helper extracted from `useViewConfig` so the hydration path is
 * testable without React or the DOM. Mirror of the PHP resolver's
 * lookup + `fieldsRef` merge — when the inline doc declares a
 * `fieldsRef` against a `fieldCollections` entry that also lives in
 * the snapshot, the helper applies the same ref-wins-inline-overrides
 * field merge and stamps `_resolvedFieldsRef` on the output (matches
 * the PHP resolver's debug stamp).
 *
 * @param {Object|null|undefined} inline  Serialized config snapshot.
 *                                        Typically `window.wpAdminShell.config`.
 * @param {string}                kind    Entity kind.
 * @param {string}                name    Entity name.
 * @param {string|null}           variant Variant id, or null for base.
 * @returns {Object|null}
 */
export function hydrateInlineViewConfig( inline, kind, name, variant ) {
	if ( ! inline || ! inline.viewConfigs ) {
		return null;
	}
	const bucket = inline.viewConfigs[ kind ]?.[ name ];
	if ( ! bucket ) {
		return null;
	}
	const doc = bucket[ variant ?? '_default' ];
	if ( ! doc ) {
		return null;
	}
	if ( typeof doc.fieldsRef === 'string' && doc.fieldsRef !== '' ) {
		const collection = inline.fieldCollections?.[ doc.fieldsRef ];
		if ( collection && Array.isArray( collection.fields ) ) {
			return {
				...doc,
				fields: mergeFields(
					collection.fields,
					Array.isArray( doc.fields ) ? doc.fields : []
				),
				_resolvedFieldsRef: doc.fieldsRef,
			};
		}
	}
	return doc;
}
