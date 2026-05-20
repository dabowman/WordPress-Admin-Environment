#!/usr/bin/env node
/**
 * hydrate-inline — pure inline-snapshot reader for v3 DataView shape.
 *
 * Mirrors the synchronous path inside `useDataView`. Exercises both
 * exported helpers:
 *   - `hydrateInlineScreenDataView( inline, screenId )` — screen-keyed
 *     lookup that walks `dataViewRef` / explicit fields / manifest
 *     inference, resolves the triple, layers the screen overlay.
 *   - `hydrateInlineDataViewTriple( inline, kind, name, variant )` —
 *     direct registry-triple lookup with client-side `extends` chain
 *     + cycle detection + `fieldsRef` resolution.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { hydrateInlineScreenDataView, hydrateInlineDataViewTriple } = await import(
	resolve( projectRoot, 'src/runtime/dataView/hydrateInline.mjs' )
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

// ── hydrateInlineScreenDataView — basic guards ──────────────────────

eq( 'null inline → null', hydrateInlineScreenDataView( null, 'posts' ), null );
eq( 'snapshot without screens → null', hydrateInlineScreenDataView( {}, 'posts' ), null );
eq( 'empty screen id → null', hydrateInlineScreenDataView( { screens: { posts: {} } }, '' ), null );
eq(
	'unknown screen id → null',
	hydrateInlineScreenDataView( { screens: { posts: {} } }, 'pages' ),
	null
);

// ── Fast path: server pre-stamped resolved doc on the screen entry ──

const fastPath = {
	screens: {
		posts: {
			dataView: {
				_resolved: {
					defaultView: { type: 'table', perPage: 25 },
					fields: [ { id: 'title', type: 'text', label: 'Title' } ],
				},
			},
		},
	},
};
const fast = hydrateInlineScreenDataView( fastPath, 'posts' );
ok( 'pre-stamped fast path returns _resolved doc', fast !== null );
eq( 'fast path defaultView preserved', fast.defaultView, { type: 'table', perPage: 25 } );

// ── Client-side merge fallback: settings.dataViews + screen overlay ─

const slowPath = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: {
						fields: [
							{ id: 'title', type: 'text', label: 'Title' },
							{ id: 'status', type: 'select', label: 'Status' },
						],
						defaultView: { type: 'table', perPage: 25 },
					},
				},
			},
		},
	},
	manifests: {
		apps: {
			'core:posts': { dataView: { kind: 'postType', name: 'post' } },
		},
	},
	screens: {
		posts: {
			app: 'core:posts',
			config: { postType: 'post' },
		},
		'posts-drafts': {
			app: 'core:posts',
			config: { postType: 'post' },
			dataView: {
				defaultView: { filters: [ { field: 'status', value: 'draft' } ] },
			},
		},
	},
};
const baseScreen = hydrateInlineScreenDataView( slowPath, 'posts' );
ok( 'screen with no inline dataView returns global doc', baseScreen !== null );
eq( 'global fields reach resolved doc', baseScreen.fields.length, 2 );

const draftsScreen = hydrateInlineScreenDataView( slowPath, 'posts-drafts' );
ok( 'screen with inline overlay returns merged doc', draftsScreen !== null );
eq(
	'inline dataView filter overrides global defaultView',
	draftsScreen.defaultView.filters,
	[ { field: 'status', value: 'draft' } ]
);
eq(
	'merged dataView preserves global perPage when overlay omits it',
	draftsScreen.defaultView.perPage,
	25
);
eq(
	'merged dataView inherits global fields',
	draftsScreen.fields.length,
	2
);

// ── Inline actions overlay — id-keyed merge + tombstones ────────────

const actionsOverlay = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: {
						actions: [
							{ id: 'edit', label: 'Edit' },
							{ id: 'trash', label: 'Move to Trash' },
							{ id: 'view', label: 'View' },
						],
					},
				},
			},
		},
	},
	manifests: {
		apps: { 'core:posts': { dataView: { kind: 'postType', name: 'post' } } },
	},
	screens: {
		'posts-trash': {
			app: 'core:posts',
			config: { postType: 'post' },
			dataView: {
				actions: [
					{ id: 'trash', __tombstone: true },
					{ id: 'restore', label: 'Restore', isPrimary: true },
				],
			},
		},
	},
};
const trashScreen = hydrateInlineScreenDataView( actionsOverlay, 'posts-trash' );
ok( 'overlay merge yielded resolved doc', trashScreen !== null );
const trashActions = trashScreen.actions;
eq( 'tombstone removed base action; new appended', trashActions.length, 3 );
ok(
	'tombstone removed `trash` action',
	! trashActions.some( ( a ) => a.id === 'trash' )
);
ok(
	'new action appended after surviving base actions',
	trashActions[ trashActions.length - 1 ].id === 'restore'
);

// ── fieldsRef applied when present on overlay ───────────────────────

const refSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: {
						fields: [ { id: 'title', type: 'text', label: 'Title' } ],
					},
				},
			},
		},
		dataFields: {
			'core/post-fields': {
				kind: 'postType',
				name: 'post',
				fields: [
					{ id: 'title', type: 'text', label: 'Title' },
					{ id: 'author', type: 'text', label: 'Author' },
				],
			},
		},
	},
	manifests: { apps: { 'core:posts': { dataView: { kind: 'postType', name: 'post' } } } },
	screens: {
		'posts-ref': {
			app: 'core:posts',
			config: { postType: 'post' },
			dataView: {
				fieldsRef: 'core/post-fields',
				fields: [ { id: 'title', label: 'Headline' } ],
			},
		},
	},
};
const refScreen = hydrateInlineScreenDataView( refSnapshot, 'posts-ref' );
eq( 'fieldsRef collection supplies base fields', refScreen.fields.length, 2 );
eq(
	'inline field overrides collection field',
	refScreen.fields.find( ( f ) => f.id === 'title' ).label,
	'Headline'
);
eq( 'fieldsRef stamps _resolvedFieldsRef', refScreen._resolvedFieldsRef, 'core/post-fields' );

// ── Null tombstone removes a key ────────────────────────────────────

const tombstoneSnapshot = {
	settings: {
		dataViews: {
			postType: { post: { _default: { defaultView: { type: 'table', perPage: 25 } } } },
		},
	},
	manifests: { apps: { 'core:posts': { dataView: { kind: 'postType', name: 'post' } } } },
	screens: {
		'posts-no-default': {
			app: 'core:posts',
			config: { postType: 'post' },
			dataView: { defaultView: null },
		},
	},
};
const stripped = hydrateInlineScreenDataView( tombstoneSnapshot, 'posts-no-default' );
ok( 'null tombstone strips global key', stripped.defaultView === undefined );

// ── dataViewKind / dataViewName escape hatch on the screen ──────────

const explicitSnapshot = {
	settings: {
		dataViews: { custom: { thing: { _default: { defaultView: { type: 'table' } } } } },
	},
	screens: {
		'thing-screen': {
			app: 'plugin:foo/thing',
			dataViewKind: 'custom',
			dataViewName: 'thing',
		},
	},
};
const explicit = hydrateInlineScreenDataView( explicitSnapshot, 'thing-screen' );
ok( 'dataViewKind/dataViewName escape hatch resolves', explicit !== null );
eq( 'escape-hatch doc reaches consumer', explicit.defaultView, { type: 'table' } );

// ── dataViewRef pointer on screen ───────────────────────────────────

const refPointerSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: { defaultView: { type: 'table', perPage: 25 } },
					drafts: {
						extends: '_default',
						defaultView: {
							filters: [ { field: 'status', value: 'draft' } ],
						},
					},
				},
			},
		},
	},
	screens: {
		'posts-drafts': {
			app: 'core:posts',
			dataViewRef: 'postType/post/drafts',
		},
	},
};
const draftsViaRef = hydrateInlineScreenDataView( refPointerSnapshot, 'posts-drafts' );
ok( 'dataViewRef pointer resolves screen → triple', draftsViaRef !== null );
eq(
	'dataViewRef pulls variant filters through `extends`',
	draftsViaRef.defaultView.filters,
	[ { field: 'status', value: 'draft' } ]
);
eq(
	'dataViewRef inherits _default perPage',
	draftsViaRef.defaultView.perPage,
	25
);

// Malformed dataViewRef falls through to manifest inference (no kind/name
// from manifest in this snapshot → empty resolution + no overlay → null).
const malformedRef = hydrateInlineScreenDataView(
	{
		settings: { dataViews: {} },
		screens: { x: { app: 'plugin:foo/thing', dataViewRef: 'nope' } },
	},
	'x'
);
ok( 'malformed dataViewRef returns null when no fallback resolves', malformedRef === null );

// ── hydrateInlineDataViewTriple — direct lookups ────────────────────

const tripleSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: {
						fields: [ { id: 'title', type: 'text', label: 'Title' } ],
						defaultView: { type: 'table', perPage: 25 },
						actions: [ { id: 'edit', label: 'Edit' } ],
					},
					drafts: {
						extends: '_default',
						defaultView: {
							filters: [ { field: 'status', value: 'draft' } ],
						},
					},
				},
			},
		},
	},
};

const defaultTriple = hydrateInlineDataViewTriple( tripleSnapshot, 'postType', 'post', '_default' );
eq(
	'triple lookup returns _default fields',
	defaultTriple.fields,
	[ { id: 'title', type: 'text', label: 'Title' } ]
);

const draftsTriple = hydrateInlineDataViewTriple( tripleSnapshot, 'postType', 'post', 'drafts' );
ok( 'triple lookup resolves variant', draftsTriple !== null );
eq(
	'triple `extends` brings parent fields through',
	draftsTriple.fields,
	[ { id: 'title', type: 'text', label: 'Title' } ]
);
eq(
	'triple `extends` merges variant filters over parent defaultView',
	draftsTriple.defaultView,
	{
		type: 'table',
		perPage: 25,
		filters: [ { field: 'status', value: 'draft' } ],
	}
);
ok(
	'triple lookup strips `extends` directive from output',
	! ( 'extends' in draftsTriple )
);

const missingTriple = hydrateInlineDataViewTriple( tripleSnapshot, 'postType', 'post', 'nope' );
eq( 'missing variant → empty object', missingTriple, {} );

// ── extends chain — multi-level + cycle detection ───────────────────

const chainSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: { defaultView: { type: 'table', perPage: 25 } },
					compact: {
						extends: '_default',
						defaultView: { perPage: 10 },
					},
					'drafts-compact': {
						extends: 'compact',
						defaultView: {
							filters: [ { field: 'status', value: 'draft' } ],
						},
					},
				},
			},
		},
	},
};
const multiHop = hydrateInlineDataViewTriple(
	chainSnapshot,
	'postType',
	'post',
	'drafts-compact'
);
eq(
	'multi-level extends merges all ancestors',
	multiHop.defaultView,
	{
		type: 'table',
		perPage: 10,
		filters: [ { field: 'status', value: 'draft' } ],
	}
);

// Cycle: a → b → a → … — short-circuit silently, return child body
// (without `extends`). Parent contribution is NOT applied because the
// cycle is detected on the second visit and that recursion returns
// without merging.
const cycleSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					a: { extends: 'b', defaultView: { perPage: 1 } },
					b: { extends: 'a', defaultView: { perPage: 2 } },
				},
			},
		},
	},
};
const cycled = hydrateInlineDataViewTriple( cycleSnapshot, 'postType', 'post', 'a' );
ok( 'cycle detection returns an object (not null)', cycled !== null && typeof cycled === 'object' );
ok( 'cycle output strips `extends` directive', ! ( 'extends' in cycled ) );

// Self-reference: variant extends itself → short-circuit, return body.
const selfRefSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: { self: { extends: 'self', defaultView: { perPage: 3 } } },
			},
		},
	},
};
const selfRef = hydrateInlineDataViewTriple( selfRefSnapshot, 'postType', 'post', 'self' );
eq(
	'self-reference short-circuits, returns child body',
	selfRef.defaultView,
	{ perPage: 3 }
);

// _default ignores its own `extends` directive.
const defaultExtendsSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: { extends: 'other', defaultView: { perPage: 5 } },
					other:    { defaultView: { perPage: 99 } },
				},
			},
		},
	},
};
const defaultsOnly = hydrateInlineDataViewTriple(
	defaultExtendsSnapshot,
	'postType',
	'post',
	'_default'
);
eq(
	'_default ignores its own `extends` directive',
	defaultsOnly.defaultView,
	{ perPage: 5 }
);

// Triple-level fieldsRef expansion against settings.dataFields.
const tripleRefSnapshot = {
	settings: {
		dataViews: {
			postType: {
				post: {
					_default: {
						fieldsRef: 'core/post-fields',
						fields: [ { id: 'title', label: 'Headline' } ],
					},
				},
			},
		},
		dataFields: {
			'core/post-fields': {
				fields: [
					{ id: 'title', type: 'text', label: 'Title' },
					{ id: 'author', type: 'text', label: 'Author' },
				],
			},
		},
	},
};
const tripleRef = hydrateInlineDataViewTriple(
	tripleRefSnapshot,
	'postType',
	'post',
	'_default'
);
eq( 'triple fieldsRef brings collection fields', tripleRef.fields.length, 2 );
eq(
	'triple fieldsRef inline field overrides collection',
	tripleRef.fields.find( ( f ) => f.id === 'title' ).label,
	'Headline'
);
eq( 'triple stamps _resolvedFieldsRef', tripleRef._resolvedFieldsRef, 'core/post-fields' );

// Bad inputs to triple lookup.
eq( 'null inline → empty object', hydrateInlineDataViewTriple( null, 'x', 'y', 'z' ), {} );
eq(
	'non-string kind → empty object',
	hydrateInlineDataViewTriple( tripleSnapshot, 42, 'post', '_default' ),
	{}
);
eq(
	'unknown kind → empty object',
	hydrateInlineDataViewTriple( tripleSnapshot, 'taxonomy', 'category', '_default' ),
	{}
);

// Empty variant string defaults to `_default`.
const tripleAutoDefault = hydrateInlineDataViewTriple(
	tripleSnapshot,
	'postType',
	'post',
	''
);
eq(
	'empty variant defaults to _default',
	tripleAutoDefault.fields,
	[ { id: 'title', type: 'text', label: 'Title' } ]
);

console.log( `\nTOTAL: ${ pass } passed, ${ fail } failed of ${ pass + fail }\n` );
process.exit( fail > 0 ? 1 : 0 );
