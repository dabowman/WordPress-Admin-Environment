#!/usr/bin/env node
/**
 * Schema validation harness — Ajv 2020-12.
 *
 * Validates against the single schema generation:
 *   - docs/schemas/workspace.json         (workspace.json workspace)
 *   - docs/schemas/workspace-app.json     (app manifest)
 *   - docs/schemas/workspace-engine.json  (engine manifest)
 *   - docs/schemas/tokens.json        (DTCG primitives)
 *
 * For each manifest schema, runs:
 *   - Bundled-artifact sweep (workspaces / app manifests / engine manifests)
 *   - Positive fixtures (must validate clean)
 *   - Negative fixtures (must fail validation)
 *
 * Run: `node tests/schema/validate-workspaces.test.mjs` (also `npm run test:schema`).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname    = dirname( fileURLToPath( import.meta.url ) );
const projectRoot  = resolve( __dirname, '..', '..' );
const SCHEMAS_DIR  = resolve( projectRoot, 'docs/schemas' );
const SHELLS_DIR   = resolve( projectRoot, 'workspaces' );
const FIXTURES_DIR = resolve( __dirname, 'fixtures' );
const APP_MANIFEST_DIRS = [
	resolve( projectRoot, 'src/apps' ),
];
const ENGINE_MANIFEST_DIRS = [
	resolve( projectRoot, 'src/runtime/engines' ),
];
const CORE_TOKENS_PATH = resolve( projectRoot, 'core.tokens.json' );

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

function isV3ShellShape( doc ) {
	return doc?.version === 3 || Boolean( doc?.workspace );
}

// ── workspace.json / admin-app.json / admin-engine.json ─────────────────
//
// One generation. Every bundled workspace validates under workspace.json; every
// app/engine manifest under its manifest schema; fixtures under
// `fixtures/<key>/{positive,negative}` exercise edge cases.

const manifestSchemas = [
	{ key: 'admin',  schemaFile: 'workspace.json' },
	{ key: 'app',    schemaFile: 'workspace-app.json' },
	{ key: 'engine', schemaFile: 'workspace-engine.json' },
];

for ( const { key, schemaFile } of manifestSchemas ) {
	console.log( `\n— ${ schemaFile } —` );
	const validate = compileSchema( schemaFile );

	if ( key === 'admin' ) {
		console.log( '\n  Bundled workspaces:' );
		for ( const file of listJson( SHELLS_DIR ) ) {
			const doc   = readJson( join( SHELLS_DIR, file ) );
			const valid = validate( doc );
			ok( `workspaces/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
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

	const positiveDir = resolve( FIXTURES_DIR, key, 'positive' );
	const negativeDir = resolve( FIXTURES_DIR, key, 'negative' );

	if ( existsSync( positiveDir ) ) {
		console.log( `\n  Positive (must validate):` );
		for ( const file of listJson( positiveDir ) ) {
			const doc   = readJson( join( positiveDir, file ) );
			const valid = validate( doc );
			ok( `${ key }/positive/${ file }`, valid, valid ? '' : formatErrors( validate.errors ) );
		}
	}

	if ( existsSync( negativeDir ) ) {
		console.log( `\n  Negative (must fail):` );
		for ( const file of listJson( negativeDir ) ) {
			const doc   = readJson( join( negativeDir, file ) );
			const valid = validate( doc );
			ok(
				`${ key }/negative/${ file }`,
				! valid,
				valid ? 'expected validation failure but doc accepted' : ''
			);
		}
	}
}

// ── tokens.json ────────────────────────────────────────────────────

console.log( '\n— tokens.json —' );
{
	const validate = compileSchema( 'tokens.json' );

	console.log( '\n  Bundled core.tokens.json:' );
	if ( existsSync( CORE_TOKENS_PATH ) ) {
		const doc   = readJson( CORE_TOKENS_PATH );
		const valid = validate( doc );
		ok(
			'core.tokens.json',
			valid,
			valid ? '' : formatErrors( validate.errors )
		);
	}
}

// ── Summary ────────────────────────────────────────────────────────

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
