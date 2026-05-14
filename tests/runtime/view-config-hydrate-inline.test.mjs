#!/usr/bin/env node
/**
 * hydrateInlineViewConfig — pure inline-snapshot reader.
 *
 * Mirrors the synchronous path inside `useViewConfig`: read a triple
 * from a pre-serialized `window.wpAdminShell.config` snapshot, apply
 * the ref-wins-inline `fieldsRef` merge when present, stamp
 * `_resolvedFieldsRef` on the output.
 *
 * Extracting the helper to its own module made the hook's first-paint
 * path testable without React + DOM, and addresses a code-review gap:
 * before the extraction, mergeFields was the only piece of the JS
 * client under test.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { hydrateInlineViewConfig } = await import(
	resolve( projectRoot, 'src/runtime/viewConfig/hydrateInline.mjs' )
);

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

// Missing snapshot / missing viewConfigs / missing bucket → null.
eq( 'null inline → null', hydrateInlineViewConfig( null, 'postType', 'post', null ), null );
eq(
	'snapshot without viewConfigs → null',
	hydrateInlineViewConfig( {}, 'postType', 'post', null ),
	null
);
eq(
	'kind absent → null',
	hydrateInlineViewConfig(
		{ viewConfigs: { root: { site: { _default: {} } } } },
		'postType',
		'post',
		null
	),
	null
);
eq(
	'variant absent in bucket → null',
	hydrateInlineViewConfig(
		{ viewConfigs: { postType: { post: { _default: { x: 1 } } } } },
		'postType',
		'post',
		'services'
	),
	null
);

// Plain triple read — no fieldsRef.
const plainSnapshot = {
	viewConfigs: {
		postType: {
			post: {
				_default: {
					defaultView: { type: 'table' },
					fields: [ { id: 'title', type: 'text', label: 'Title' } ],
				},
			},
		},
	},
};
const plain = hydrateInlineViewConfig( plainSnapshot, 'postType', 'post', null );
ok( 'plain triple returns doc', plain !== null );
eq(
	'plain triple defaultView preserved',
	plain.defaultView,
	{ type: 'table' }
);
ok( 'plain triple has no _resolvedFieldsRef stamp', plain._resolvedFieldsRef === undefined );

// fieldsRef path — collection present, merge happens.
const withRef = {
	fieldCollections: {
		'core/post-fields': {
			kind: 'postType',
			name: 'post',
			fields: [
				{ id: 'title', type: 'text', label: 'Title' },
				{ id: 'status', type: 'text', label: 'Status' },
			],
		},
	},
	viewConfigs: {
		postType: {
			post: {
				_default: {
					fieldsRef: 'core/post-fields',
					fields: [ { id: 'status', label: 'Post Status' } ],
					defaultView: { type: 'table' },
				},
			},
		},
	},
};
const merged = hydrateInlineViewConfig( withRef, 'postType', 'post', null );
ok( 'fieldsRef merge runs when collection present', merged.fields.length === 2 );
eq(
	'fieldsRef merge applies inline label override',
	merged.fields[ 1 ],
	{ id: 'status', type: 'text', label: 'Post Status' }
);
eq( 'fieldsRef merge stamps _resolvedFieldsRef', merged._resolvedFieldsRef, 'core/post-fields' );

// fieldsRef path — collection missing from snapshot. Should return the
// doc as-is (no merge, no stamp). The REST fallback fetches the merged
// doc; the inline hot-path only does what it can synchronously.
const missingCollection = {
	viewConfigs: {
		postType: {
			post: {
				_default: {
					fieldsRef: 'core/missing',
					fields: [ { id: 'title', type: 'text', label: 'Title' } ],
				},
			},
		},
	},
};
const unmerged = hydrateInlineViewConfig( missingCollection, 'postType', 'post', null );
ok( 'missing collection returns doc unmerged', unmerged._resolvedFieldsRef === undefined );
eq( 'missing collection preserves inline fields', unmerged.fields.length, 1 );

// Variant lookup.
const withVariant = {
	viewConfigs: {
		postType: {
			product: {
				_default: { defaultView: { type: 'table' } },
				services: { defaultView: { type: 'grid' } },
			},
		},
	},
};
eq(
	'variant lookup picks the named bucket',
	hydrateInlineViewConfig( withVariant, 'postType', 'product', 'services' ).defaultView,
	{ type: 'grid' }
);
eq(
	'null variant picks _default',
	hydrateInlineViewConfig( withVariant, 'postType', 'product', null ).defaultView,
	{ type: 'table' }
);

console.log( `\nTOTAL: ${ pass } passed, ${ fail } failed of ${ pass + fail }\n` );
process.exit( fail > 0 ? 1 : 0 );
