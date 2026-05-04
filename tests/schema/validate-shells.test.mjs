#!/usr/bin/env node
/**
 * Schema validation: every bundled shell + every fixture in
 * tests/schema/fixtures/ validates against docs/schemas/admin-v1.json.
 *
 * Run: `node tests/schema/validate-shells.test.mjs` (also `npm run test:schema`).
 *
 * Catches: shell-author errors going forward — typos in field names,
 * wrong types, missing required fields. Bundled shells are checked
 * after-normalize too (the v0 → v1 normalizer runs in PHP, so v0 shells
 * fail validation directly; the harness skips them with a note).
 *
 * Does NOT catch: runtime-reader bugs where the schema is correct but
 * the kernel reads from the wrong path. Those need run-shape-tests.php
 * (PHP integration) + the runtime smoke harness (open issue).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname    = dirname( fileURLToPath( import.meta.url ) );
const projectRoot  = resolve( __dirname, '..', '..' );
const SCHEMA_PATH  = resolve( projectRoot, 'docs/schemas/admin-v1.json' );
const SHELLS_DIR   = resolve( projectRoot, 'shells' );
const FIXTURES_DIR = resolve( __dirname, 'fixtures' );

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

function isV1Shape( doc ) {
	return Boolean( doc?.settings?.shell?.layoutEngine );
}

const schema = JSON.parse( readFileSync( SCHEMA_PATH, 'utf8' ) );
const ajv    = new Ajv( {
	allErrors: true,
	strict: false,
	// $schema in our docs uses a relative URL (e.g. "../docs/schemas/admin-v1.json")
	// — Ajv's strict $schema check trips on that. Relax.
} );
addFormats( ajv );
const validate = ajv.compile( schema );

function validateDoc( label, doc, { skipIfV0 = false } = {} ) {
	if ( skipIfV0 && ! isV1Shape( doc ) ) {
		console.log( `SKIP  ${ label } (v0 flat shape; PHP normalizer transforms at load)` );
		return;
	}
	const valid = validate( doc );
	const detail = valid
		? ''
		: ( validate.errors || [] )
			.slice( 0, 5 )
			.map( ( e ) => `  ${ e.instancePath || '/' } ${ e.message } ${ JSON.stringify( e.params ) }` )
			.join( '\n      ' );
	ok( label, valid, detail );
}

// ── Bundled shells ─────────────────────────────────────────────────

console.log( '\n— Bundled shells —' );
const shellFiles = readdirSync( SHELLS_DIR ).filter( ( f ) => f.endsWith( '.json' ) );
for ( const file of shellFiles ) {
	const path = join( SHELLS_DIR, file );
	const doc  = JSON.parse( readFileSync( path, 'utf8' ) );
	validateDoc( `shells/${ file }`, doc, { skipIfV0: true } );
}

// ── Fixtures ───────────────────────────────────────────────────────

console.log( '\n— Fixtures (tests/schema/fixtures/) —' );
if ( existsSync( FIXTURES_DIR ) ) {
	const fixtureFiles = readdirSync( FIXTURES_DIR ).filter( ( f ) => f.endsWith( '.json' ) );
	for ( const file of fixtureFiles ) {
		const path = join( FIXTURES_DIR, file );
		const doc  = JSON.parse( readFileSync( path, 'utf8' ) );
		validateDoc( `fixtures/${ file }`, doc );
	}
} else {
	console.log( '  (no fixtures directory)' );
}

// ── Negative fixtures ──────────────────────────────────────────────

console.log( '\n— Negative fixtures (must fail) —' );

const negatives = [
	{
		label: 'rejects missing version',
		doc: { name: 'broken' },
	},
	{
		label: 'rejects bad userCustomizable type (number)',
		doc: {
			version: 1,
			styles: { userCustomizable: 42 },
		},
	},
	{
		label: 'rejects bad shell.layoutEngine type (number)',
		doc: {
			version: 1,
			settings: { shell: { layoutEngine: 99 } },
		},
	},
	{
		label: 'rejects bad density value',
		doc: {
			version: 1,
			styles: { density: 'huge' },
		},
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

// ── Summary ────────────────────────────────────────────────────────

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
