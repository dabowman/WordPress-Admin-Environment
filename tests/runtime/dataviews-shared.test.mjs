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
const { buildFields, elementsFromLabels, withElementCounts } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/buildFields.mjs' )
);
const {
	PREFS_KEY,
	DURABLE_AXES,
	pickDurableView,
	readSavedView,
	buildSavePatch,
	applySavedView,
} = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/dataViewPrefs.mjs' )
);
const { buildSubmitPayload, firstItem } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/entityFormPayload.mjs' )
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
	[
		{ id: 'title', type: 'text' },
		{ id: 'ext', type: 'text' },
	],
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
	elementFallbacks: {
		status: elementsFromLabels( { publish: 'Published' } ),
	},
} )[ 0 ];
ok(
	'element fallback applied when spec omits elements',
	fallbackEls.elements.length === 1 &&
		fallbackEls.elements[ 0 ].value === 'publish'
);

const noFallback = buildFields( [ { id: 'name', type: 'text' } ], {
	elementFallbacks: { status: [ { value: 'a', label: 'A' } ] },
} )[ 0 ];
ok( 'fallback only applies to matching id', noFallback.elements === undefined );

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

// --- withElementCounts ----------------------------------------------------
ok(
	'withElementCounts returns input untouched when counts missing',
	withElementCounts( [ { value: 'a', label: 'A' } ], undefined )[ 0 ]
		.label === 'A'
);

const counted = withElementCounts(
	[
		{ value: 'publish', label: 'Published' },
		{ value: 'draft', label: 'Draft' },
	],
	{ publish: 12 }
);
ok(
	'withElementCounts appends count to matched value',
	counted[ 0 ].label === 'Published (12)'
);
ok(
	'withElementCounts leaves unmatched value plain',
	counted[ 1 ].label === 'Draft'
);
ok(
	'withElementCounts treats zero as a real count',
	withElementCounts( [ { value: 'spam', label: 'Spam' } ], { spam: 0 } )[ 0 ]
		.label === 'Spam (0)'
);
ok(
	'withElementCounts skips null/undefined counts',
	withElementCounts( [ { value: 'x', label: 'X' } ], { x: null } )[ 0 ]
		.label === 'X'
);
ok(
	'withElementCounts preserves the matched value',
	counted[ 0 ].value === 'publish'
);

// --- buildFields elementCounts option ------------------------------------
const fallbackCounted = buildFields( [ { id: 'status', type: 'text' } ], {
	elementFallbacks: {
		status: elementsFromLabels( { publish: 'Published' } ),
	},
	elementCounts: { status: { publish: 7 } },
} )[ 0 ];
ok(
	'elementCounts merge into fallback elements',
	fallbackCounted.elements[ 0 ].label === 'Published (7)'
);

const specCounted = buildFields(
	[
		{
			id: 'roles',
			type: 'text',
			elements: [ { value: 'editor', label: 'Editor' } ],
		},
	],
	{ elementCounts: { roles: { editor: 3 } } }
)[ 0 ];
ok(
	'elementCounts merge into spec-declared elements',
	specCounted.elements[ 0 ].label === 'Editor (3)'
);

// --- dataViewPrefs (view persistence / Screen-Options parity) ------------
const fullView = {
	type: 'table',
	search: 'hello',
	filters: [ { field: 'status', value: 'draft' } ],
	page: 3,
	perPage: 50,
	sort: { field: 'title', direction: 'asc' },
	fields: [ 'title', 'author' ],
	layout: { density: 'compact' },
};

const durable = pickDurableView( fullView );
ok(
	'pickDurableView keeps durable axes',
	durable.type === 'table' &&
		durable.perPage === 50 &&
		durable.sort.field === 'title' &&
		JSON.stringify( durable.fields ) === '["title","author"]' &&
		durable.layout.density === 'compact'
);
ok(
	'pickDurableView drops transient axes (search/filters/page)',
	durable.search === undefined &&
		durable.filters === undefined &&
		durable.page === undefined
);
ok(
	'pickDurableView only forwards axes from DURABLE_AXES',
	Object.keys( durable ).every( ( k ) => DURABLE_AXES.includes( k ) )
);
ok(
	'pickDurableView omits absent axes',
	! ( 'titleField' in pickDurableView( { type: 'table' } ) )
);
ok(
	'pickDurableView tolerates non-object',
	JSON.stringify( pickDurableView( null ) ) === '{}' &&
		JSON.stringify( pickDurableView( undefined ) ) === '{}'
);

// readSavedView
const prefsBlob = {
	[ PREFS_KEY ]: {
		posts: { perPage: 25, fields: [ 'title' ] },
	},
	'default-route': '/posts',
};
ok(
	'readSavedView returns the per-screen bucket',
	readSavedView( prefsBlob, 'posts' ).perPage === 25
);
ok(
	'readSavedView returns null for an unsaved screen',
	readSavedView( prefsBlob, 'pages' ) === null
);
ok(
	'readSavedView returns null when no dataViews bucket',
	readSavedView( { 'default-route': '/x' }, 'posts' ) === null
);
ok(
	'readSavedView null-safe on empty/absent inputs',
	readSavedView( null, 'posts' ) === null &&
		readSavedView( {}, '' ) === null &&
		readSavedView( undefined, undefined ) === null
);

// buildSavePatch
const patch = buildSavePatch( 'posts', fullView );
ok(
	'buildSavePatch nests under PREFS_KEY → screenId',
	patch[ PREFS_KEY ].posts.perPage === 50
);
ok(
	'buildSavePatch persists only durable axes',
	patch[ PREFS_KEY ].posts.search === undefined &&
		patch[ PREFS_KEY ].posts.page === undefined
);
ok(
	'buildSavePatch returns null without a screenId',
	buildSavePatch( '', fullView ) === null &&
		buildSavePatch( null, fullView ) === null
);

// applySavedView — saved durable axes win, transient seed survives
const seed = {
	type: 'table',
	search: 'seed-search',
	filters: [ 'seed-filter' ],
	page: 1,
	perPage: 20,
	sort: { field: 'date', direction: 'desc' },
	fields: [ 'title', 'date', 'author' ],
};
const reconciled = applySavedView( seed, {
	perPage: 100,
	fields: [ 'title' ],
	sort: { field: 'title', direction: 'asc' },
} );
ok(
	'applySavedView: saved durable axes override the seed',
	reconciled.perPage === 100 &&
		JSON.stringify( reconciled.fields ) === '["title"]' &&
		reconciled.sort.field === 'title'
);
ok(
	'applySavedView: transient seed axes survive (search/filters/page)',
	reconciled.search === 'seed-search' &&
		reconciled.page === 1 &&
		JSON.stringify( reconciled.filters ) === '["seed-filter"]'
);
ok(
	'applySavedView: a transient key in the saved blob is ignored',
	applySavedView( seed, { search: 'evil', perPage: 30 } ).search ===
		'seed-search'
);
ok(
	'applySavedView returns the seed untouched when saved is null',
	applySavedView( seed, null ) === seed &&
		applySavedView( seed, undefined ) === seed
);

// round-trip: buildSavePatch → readSavedView → applySavedView
const rt = readSavedView(
	{ [ PREFS_KEY ]: buildSavePatch( 'posts', fullView )[ PREFS_KEY ] },
	'posts'
);
ok(
	'round-trip: saved view rehydrates the durable axes',
	applySavedView( seed, rt ).perPage === 50 &&
		applySavedView( seed, rt ).search === 'seed-search'
);

// Clean-reconstruction idempotence — the invariant the persist effect's
// "don't write a view that matches the freshly-reconstructed clean state"
// guard relies on: re-projecting an already-reconciled view through the same
// seed+saved reconstruction yields a byte-identical durable projection, so a
// freshly-seeded / rehydrated / screen-flipped view never looks like an edit.
const cleanSaved = { perPage: 25, fields: [ 'title' ], type: 'table' };
const reconstructedOnce = pickDurableView( applySavedView( seed, cleanSaved ) );
const reconstructedTwice = pickDurableView(
	applySavedView( applySavedView( seed, cleanSaved ), cleanSaved )
);
ok(
	'clean reconstruction is idempotent (no spurious-write on re-seed)',
	JSON.stringify( reconstructedOnce ) === JSON.stringify( reconstructedTwice )
);
ok(
	'a genuine edit diverges from the clean reconstruction',
	JSON.stringify( pickDurableView( { ...seed, perPage: 999 } ) ) !==
		JSON.stringify( reconstructedOnce )
);

// --- entityFormPayload (EntityFormModal commit helpers) ------------------
ok(
	'buildSubmitPayload runs data through toRecord',
	buildSubmitPayload( {
		mode: 'create',
		data: { name: 'x' },
		toRecord: ( d ) => ( { title: d.name } ),
	} ).title === 'x'
);
ok(
	'buildSubmitPayload defaults toRecord to identity',
	buildSubmitPayload( { mode: 'create', data: { a: 1 } } ).a === 1
);
ok(
	'buildSubmitPayload stamps id on edit',
	buildSubmitPayload( { mode: 'edit', data: { name: 'x' }, id: 42 } ).id ===
		42
);
ok(
	'buildSubmitPayload omits id on create',
	buildSubmitPayload( { mode: 'create', data: { name: 'x' }, id: 42 } ).id ===
		undefined
);
ok(
	'buildSubmitPayload never clobbers an explicit id from toRecord',
	buildSubmitPayload( {
		mode: 'edit',
		data: {},
		toRecord: () => ( { id: 7 } ),
		id: 42,
	} ).id === 7
);
ok(
	'buildSubmitPayload tolerates null data',
	JSON.stringify( buildSubmitPayload( { mode: 'create', data: null } ) ) ===
		'{}'
);
ok(
	'buildSubmitPayload does not stamp a null id on edit',
	buildSubmitPayload( { mode: 'edit', data: { a: 1 }, id: null } ).id ===
		undefined
);

ok(
	'firstItem returns items[0]',
	firstItem( [ { id: 1 }, { id: 2 } ] ).id === 1
);
ok( 'firstItem null on empty array', firstItem( [] ) === null );
ok( 'firstItem null on non-array', firstItem( undefined ) === null );

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
