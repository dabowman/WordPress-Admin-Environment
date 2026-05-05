#!/usr/bin/env node
/**
 * Schema validation harness — Ajv 2020-12.
 *
 * Validates against:
 *   - docs/schemas/admin-v1.json   (legacy beta-shipped schema; $id /admin/v0.json
 *                                   to free /admin/v1.json for the new manifest model)
 *   - docs/schemas/admin-v2.json   (canonical v1 of the new admin.json manifest)
 *   - docs/schemas/admin-app-v2.json
 *   - docs/schemas/admin-engine-v2.json
 *
 * For each schema, runs:
 *   - Bundled-shell sweep (admin only — engines/apps don't have bundled equivalents)
 *   - Positive fixtures (must validate clean)
 *   - Negative fixtures (must fail validation)
 *   - Inline negative cases (compact one-liners)
 *
 * Run: `node tests/schema/validate-shells.test.mjs` (also `npm run test:schema`).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname    = dirname( fileURLToPath( import.meta.url ) );
const projectRoot  = resolve( __dirname, '..', '..' );
const SCHEMAS_DIR  = resolve( projectRoot, 'docs/schemas' );
const SHELLS_DIR   = resolve( projectRoot, 'shells' );
const FIXTURES_DIR = resolve( __dirname, 'fixtures' );
const APP_MANIFEST_DIRS = [
	resolve( projectRoot, 'src/apps' ),
	resolve( projectRoot, 'src/runtime/apps' ),
];
const ENGINE_MANIFEST_DIRS = [
	resolve( projectRoot, 'src/runtime/engines' ),
];

function listManifests( bases, filename ) {
	const out = [];
	for ( const base of bases ) {
		if ( ! existsSync( base ) ) {
			continue;
		}
		for ( const entry of readdirSync( base, { withFileTypes: true } ) ) {
			if ( ! entry.isDirectory() ) {
				continue;
			}
			const candidate = join( base, entry.name, filename );
			if ( existsSync( candidate ) ) {
				out.push( candidate );
			}
		}
	}
	return out.sort();
}

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		if ( detail ) {
			console.log( `      ${ detail }` );
		}
	}
}

function compileSchema( name ) {
	const schema = JSON.parse(
		readFileSync( resolve( SCHEMAS_DIR, name ), 'utf8' )
	);
	const ajv = new Ajv( { allErrors: true, strict: false } );
	addFormats( ajv );
	return ajv.compile( schema );
}

function readJson( path ) {
	return JSON.parse( readFileSync( path, 'utf8' ) );
}

function listJson( dir ) {
	if ( ! existsSync( dir ) ) {
		return [];
	}
	return readdirSync( dir )
		.filter( ( f ) => f.endsWith( '.json' ) )
		.sort();
}

function formatErrors( errors ) {
	return ( errors || [] )
		.slice( 0, 5 )
		.map( ( e ) => `  ${ e.instancePath || '/' } ${ e.message } ${ JSON.stringify( e.params ) }` )
		.join( '\n      ' );
}

function isV1ShellShape( doc ) {
	return Boolean( doc?.settings?.shell?.layoutEngine );
}

function isV2ShellShape( doc ) {
	// v2 puts engine + regions at root with no `settings` partition.
	return typeof doc?.engine === 'string' && ! doc?.settings;
}

// ── Schema 1: legacy admin-v1.json ─────────────────────────────────

console.log( '\n— admin-v1.json (legacy beta) —' );
{
	const validate = compileSchema( 'admin-v1.json' );

	console.log( '\n  Bundled shells:' );
	for ( const file of listJson( SHELLS_DIR ) ) {
		const path  = join( SHELLS_DIR, file );
		const doc   = readJson( path );
		if ( isV2ShellShape( doc ) ) {
			console.log( `SKIP  shells/${ file } (v2 shape; validated under admin-v2.json)` );
			continue;
		}
		if ( ! isV1ShellShape( doc ) ) {
			console.log( `SKIP  shells/${ file } (v0 flat shape; PHP normalizer transforms at load)` );
			continue;
		}
		const valid = validate( doc );
		ok( `shells/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
	}

	console.log( '\n  v1 fixtures (top-level fixtures dir):' );
	for ( const file of listJson( FIXTURES_DIR ) ) {
		const path  = join( FIXTURES_DIR, file );
		const doc   = readJson( path );
		const valid = validate( doc );
		ok( `fixtures/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
	}

	console.log( '\n  v1 inline negative cases:' );
	const negatives = [
		{
			label: 'rejects missing version',
			doc: { name: 'broken' },
		},
		{
			label: 'rejects bad userCustomizable type (number)',
			doc: { version: 1, styles: { userCustomizable: 42 } },
		},
		{
			label: 'rejects bad shell.layoutEngine type (number)',
			doc: { version: 1, settings: { shell: { layoutEngine: 99 } } },
		},
		{
			label: 'rejects bad density value',
			doc: { version: 1, styles: { density: 'huge' } },
		},
		{
			label: 'rejects region with no source',
			doc: {
				version: 1,
				settings: {
					shell: { layoutEngine: 'core:site-editor-layout' },
					regions: { sidebar: { kind: 'persistent' } },
				},
			},
		},
	];
	for ( const { label, doc } of negatives ) {
		const valid = validate( doc );
		ok( label, ! valid, valid ? 'expected validation failure but doc accepted' : '' );
	}
}

// ── Schemas 2-4: v2 manifest schemas ───────────────────────────────

const v2Schemas = [
	{ key: 'admin',  schemaFile: 'admin-v2.json',        fixtureKey: 'admin'  },
	{ key: 'app',    schemaFile: 'admin-app-v2.json',    fixtureKey: 'app'    },
	{ key: 'engine', schemaFile: 'admin-engine-v2.json', fixtureKey: 'engine' },
];

for ( const { key, schemaFile, fixtureKey } of v2Schemas ) {
	console.log( `\n— ${ schemaFile } —` );
	const validate = compileSchema( schemaFile );

	if ( key === 'admin' ) {
		console.log( '\n  Bundled shells (v2 shape):' );
		for ( const file of listJson( SHELLS_DIR ) ) {
			const doc = readJson( join( SHELLS_DIR, file ) );
			if ( ! isV2ShellShape( doc ) ) {
				continue;
			}
			const valid = validate( doc );
			ok( `shells/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
		}
	}

	if ( key === 'app' ) {
		console.log( '\n  Bundled app manifests:' );
		for ( const path of listManifests( APP_MANIFEST_DIRS, 'app.json' ) ) {
			const doc   = readJson( path );
			const valid = validate( doc );
			const rel   = path.slice( projectRoot.length + 1 );
			ok( rel, valid, valid ? '' : formatErrors( validate.errors ) );
		}
	}

	if ( key === 'engine' ) {
		console.log( '\n  Bundled engine manifests:' );
		for ( const path of listManifests( ENGINE_MANIFEST_DIRS, 'engine.json' ) ) {
			const doc   = readJson( path );
			const valid = validate( doc );
			const rel   = path.slice( projectRoot.length + 1 );
			ok( rel, valid, valid ? '' : formatErrors( validate.errors ) );
		}
	}

	const positiveDir = resolve( FIXTURES_DIR, 'v2', fixtureKey, 'positive' );
	const negativeDir = resolve( FIXTURES_DIR, 'v2', fixtureKey, 'negative' );

	console.log( `\n  Positive (must validate):` );
	for ( const file of listJson( positiveDir ) ) {
		const doc   = readJson( join( positiveDir, file ) );
		const valid = validate( doc );
		ok( `v2/${ key }/positive/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
	}

	console.log( `\n  Negative (must fail):` );
	for ( const file of listJson( negativeDir ) ) {
		const doc   = readJson( join( negativeDir, file ) );
		const valid = validate( doc );
		ok(
			`v2/${ key }/negative/${ file }`,
			! valid,
			valid ? 'expected validation failure but doc accepted' : ''
		);
	}
}

// ── Summary ────────────────────────────────────────────────────────

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
