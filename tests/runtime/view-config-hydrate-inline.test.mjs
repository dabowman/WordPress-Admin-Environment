#!/usr/bin/env node
/**
 * hydrateInlineScreenView — pure inline-snapshot reader.
 *
 * Mirrors the synchronous path inside `useScreenView`: read a resolved
 * per-screen view from a pre-serialized `window.wpAdminShell.config`
 * snapshot. v3 boot stamps the resolved doc into `screens[id].view._resolved`
 * for the fast path; the helper also supports a client-side merge against
 * `settings.views` + `settings.fields` for incremental rollout / tests.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { hydrateInlineScreenView } = await import(
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

// Missing snapshot / missing screens / missing id → null.
eq( 'null inline → null', hydrateInlineScreenView( null, 'posts' ), null );
eq( 'snapshot without screens → null', hydrateInlineScreenView( {}, 'posts' ), null );
eq( 'empty screen id → null', hydrateInlineScreenView( { screens: { posts: {} } }, '' ), null );
eq(
	'unknown screen id → null',
	hydrateInlineScreenView( { screens: { posts: {} } }, 'pages' ),
	null
);

// Fast path: server pre-stamped resolved doc on the screen entry.
const fastPath = {
	screens: {
		posts: {
			view: {
				_resolved: {
					defaultView: { type: 'table', perPage: 25 },
					fields: [ { id: 'title', type: 'text', label: 'Title' } ],
				},
			},
		},
	},
};
const fast = hydrateInlineScreenView( fastPath, 'posts' );
ok( 'pre-stamped fast path returns _resolved doc', fast !== null );
eq( 'fast path defaultView preserved', fast.defaultView, { type: 'table', perPage: 25 } );

// Client-side merge fallback: settings.views + screen overlay.
const slowPath = {
	settings: {
		views: {
			postType: {
				post: {
					fields: [
						{ id: 'title', type: 'text', label: 'Title' },
						{ id: 'status', type: 'select', label: 'Status' },
					],
					defaultView: { type: 'table', perPage: 25 },
				},
			},
		},
	},
	manifests: {
		apps: {
			'core:posts': { view: { kind: 'postType', name: 'post' } },
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
			view: {
				defaultView: { filters: [ { field: 'status', value: 'draft' } ] },
			},
		},
	},
};
const baseScreen = hydrateInlineScreenView( slowPath, 'posts' );
ok( 'screen with no inline view returns global view', baseScreen !== null );
eq(
	'global fields reach the resolved doc',
	baseScreen.fields.length,
	2
);

const draftsScreen = hydrateInlineScreenView( slowPath, 'posts-drafts' );
ok( 'screen with inline view overlay returns merged doc', draftsScreen !== null );
eq(
	'inline view filter overrides global defaultView',
	draftsScreen.defaultView.filters,
	[ { field: 'status', value: 'draft' } ]
);
eq(
	'merged view preserves global perPage when overlay omits it',
	draftsScreen.defaultView.perPage,
	25
);
eq(
	'merged view inherits global fields',
	draftsScreen.fields.length,
	2
);

// Inline actions overlay merges by id with tombstone support.
const actionsOverlay = {
	settings: {
		views: {
			postType: {
				post: {
					actions: [
						{ id: 'edit', label: 'Edit' },
						{ id: 'trash', label: 'Move to Trash' },
						{ id: 'view', label: 'View' },
					],
				},
			},
		},
	},
	manifests: {
		apps: { 'core:posts': { view: { kind: 'postType', name: 'post' } } },
	},
	screens: {
		'posts-trash': {
			app: 'core:posts',
			config: { postType: 'post' },
			view: {
				actions: [
					{ id: 'trash', __tombstone: true },
					{ id: 'restore', label: 'Restore', isPrimary: true },
				],
			},
		},
	},
};
const trashScreen = hydrateInlineScreenView( actionsOverlay, 'posts-trash' );
ok( 'overlay merge yielded a resolved doc', trashScreen !== null );
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

// fieldsRef applied when present on overlay.
const refSnapshot = {
	settings: {
		views: {
			postType: {
				post: {
					fields: [ { id: 'title', type: 'text', label: 'Title' } ],
				},
			},
		},
		fields: {
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
	manifests: { apps: { 'core:posts': { view: { kind: 'postType', name: 'post' } } } },
	screens: {
		'posts-ref': {
			app: 'core:posts',
			config: { postType: 'post' },
			view: {
				fieldsRef: 'core/post-fields',
				fields: [ { id: 'title', label: 'Headline' } ],
			},
		},
	},
};
const refScreen = hydrateInlineScreenView( refSnapshot, 'posts-ref' );
eq( 'fieldsRef collection supplies base fields', refScreen.fields.length, 2 );
eq(
	'inline field overrides collection field',
	refScreen.fields.find( ( f ) => f.id === 'title' ).label,
	'Headline'
);
eq( 'fieldsRef stamps _resolvedFieldsRef', refScreen._resolvedFieldsRef, 'core/post-fields' );

// Null tombstone removes a key.
const tombstoneSnapshot = {
	settings: {
		views: {
			postType: { post: { defaultView: { type: 'table', perPage: 25 } } },
		},
	},
	manifests: { apps: { 'core:posts': { view: { kind: 'postType', name: 'post' } } } },
	screens: {
		'posts-no-default': {
			app: 'core:posts',
			config: { postType: 'post' },
			view: { defaultView: null },
		},
	},
};
const stripped = hydrateInlineScreenView( tombstoneSnapshot, 'posts-no-default' );
ok( 'null tombstone strips global key', stripped.defaultView === undefined );

// viewKind / viewName escape hatch on the screen.
const explicitSnapshot = {
	settings: {
		views: { custom: { thing: { defaultView: { type: 'table' } } } },
	},
	screens: {
		'thing-screen': {
			app: 'plugin:foo/thing',
			viewKind: 'custom',
			viewName: 'thing',
		},
	},
};
const explicit = hydrateInlineScreenView( explicitSnapshot, 'thing-screen' );
ok( 'viewKind/viewName escape hatch resolves', explicit !== null );
eq( 'escape-hatch view doc reaches consumer', explicit.defaultView, { type: 'table' } );

console.log( `\nTOTAL: ${ pass } passed, ${ fail } failed of ${ pass + fail }\n` );
process.exit( fail > 0 ? 1 : 0 );
