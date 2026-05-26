#!/usr/bin/env node
/**
 * Tests for the shared DataViews harness pure helpers
 * (`src/apps/_shared/dataviews/{compileEligibility,buildFields}.mjs`).
 *
 * These were extracted from six byte-identical (compileEligibility) / near-
 * identical (buildFields) copies across the entity-CRUD apps. The test pins
 * the contract every app now depends on: eligibility equality + membership
 * semantics, and field compilation incl. the `status` element fallback.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { compileEligibility } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/compileEligibility.mjs' )
);
const { buildFields, elementsFromLabels } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/buildFields.mjs' )
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

// --- compileEligibility ---------------------------------------------------
ok(
	'undefined eligibleWhen → no predicate',
	compileEligibility( undefined ) === undefined
);
ok( 'empty map → no predicate', compileEligibility( {} ) === undefined );
ok( 'non-object → no predicate', compileEligibility( 'x' ) === undefined );

const eqPred = compileEligibility( { status: 'active' } );
ok( 'equality match', eqPred( { status: 'active' } ) === true );
ok( 'equality miss', eqPred( { status: 'inactive' } ) === false );

const memberPred = compileEligibility( { status: [ 'active', 'paused' ] } );
ok( 'membership match', memberPred( { status: 'paused' } ) === true );
ok( 'membership miss', memberPred( { status: 'trash' } ) === false );

const multiPred = compileEligibility( { status: 'active', type: 'a' } );
ok(
	'all keys must match (AND)',
	multiPred( { status: 'active', type: 'a' } ) === true &&
		multiPred( { status: 'active', type: 'b' } ) === false
);
ok( 'missing field on item → false', eqPred( {} ) === false );
ok( 'null item → false (no throw)', eqPred( null ) === false );

// --- elementsFromLabels ---------------------------------------------------
const els = elementsFromLabels( { publish: 'Published', draft: 'Draft' } );
ok(
	'elementsFromLabels maps to { value, label }',
	JSON.stringify( els ) ===
		JSON.stringify( [
			{ value: 'publish', label: 'Published' },
			{ value: 'draft', label: 'Draft' },
		] )
);
ok(
	'elementsFromLabels handles nullish',
	Array.isArray( elementsFromLabels( undefined ) ) &&
		elementsFromLabels( undefined ).length === 0
);

// --- buildFields ----------------------------------------------------------
ok(
	'buildFields tolerates undefined specs',
	JSON.stringify( buildFields( undefined ) ) === '[]'
);

ok(
	'buildFields drops malformed specs (no id)',
	buildFields( [ null, {}, { id: 'a', type: 'text' } ] ).length === 1
);

const labelled = buildFields(
	[ { id: 'title', type: 'text' }, { id: 'ext', type: 'text' } ],
	{ labels: { title: 'Translated Title' } }
);
ok(
	'label table wins for known id',
	labelled[ 0 ].label === 'Translated Title'
);
ok(
	'unknown id falls through to spec.label',
	buildFields( [ { id: 'ext', type: 'text', label: 'Author Col' } ], {
		labels: { title: 'X' },
	} )[ 0 ].label === 'Author Col'
);

const flags = buildFields( [
	{
		id: 'title',
		type: 'text',
		enableGlobalSearch: true,
		enableHiding: false,
		enableSorting: 1,
	},
] )[ 0 ];
ok(
	'enable* flags coerced to booleans',
	flags.enableGlobalSearch === true &&
		flags.enableHiding === false &&
		flags.enableSorting === true
);

const explicitEls = buildFields( [
	{ id: 'status', type: 'text', elements: [ { value: 'x', label: 'X' } ] },
] )[ 0 ];
ok(
	'explicit elements preserved over fallback',
	explicitEls.elements.length === 1 && explicitEls.elements[ 0 ].value === 'x'
);

const fallbackEls = buildFields( [ { id: 'status', type: 'text' } ], {
	elementFallbacks: { status: elementsFromLabels( { publish: 'Published' } ) },
} )[ 0 ];
ok(
	'element fallback applied when spec omits elements',
	fallbackEls.elements.length === 1 &&
		fallbackEls.elements[ 0 ].value === 'publish'
);

const noFallback = buildFields( [ { id: 'name', type: 'text' } ], {
	elementFallbacks: { status: [ { value: 'a', label: 'A' } ] },
} )[ 0 ];
ok(
	'fallback only applies to matching id',
	noFallback.elements === undefined
);

const rendered = buildFields( [ { id: 'title', type: 'text' } ], {
	renderers: { title: () => null },
} )[ 0 ];
ok( 'renderer attached as render', typeof rendered.render === 'function' );

ok(
	'filterBy passed through',
	buildFields( [
		{ id: 'status', type: 'text', filterBy: { operators: [ 'isAny' ] } },
	] )[ 0 ].filterBy.operators[ 0 ] === 'isAny'
);

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
