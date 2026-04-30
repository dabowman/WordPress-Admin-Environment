#!/usr/bin/env node
/**
 * Snapshot the WPDS design-tokens.css ships in `@wordpress/theme` into a
 * JSON file the runtime can load as the implicit `core` baseline.
 *
 * Run from project root:
 *   node scripts/snapshot-wpds.mjs
 *
 * Inputs:  node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css
 * Output:  src/runtime/styles/wpds-defaults/6.9.json
 *
 * The output is a flat map of `--wpds-*` variable name → value, plus a
 * `meta` block with the @wordpress/theme version and a slot count for
 * the parity test (M3.8) to verify against.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..' );

const CSS_PATH = resolve( projectRoot, 'node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css' );
const PKG_PATH = resolve( projectRoot, 'node_modules/@wordpress/theme/package.json' );
const OUT_PATH = resolve( projectRoot, 'src/runtime/styles/wpds-defaults/6.9.json' );

if ( ! existsSync( CSS_PATH ) ) {
	console.error( `WPDS source not found: ${ CSS_PATH }` );
	process.exit( 1 );
}

const css = readFileSync( CSS_PATH, 'utf8' );
const pkg = JSON.parse( readFileSync( PKG_PATH, 'utf8' ) );

const declarationRe = /(--wpds-[a-z0-9-]+)\s*:\s*([^;]+?)\s*;/gi;
const slots = {};
let match;
while ( ( match = declarationRe.exec( css ) ) !== null ) {
	const [ , name, value ] = match;
	slots[ name ] = value.trim();
}

const out = {
	meta: {
		generator:        'scripts/snapshot-wpds.mjs',
		source:           '@wordpress/theme/src/prebuilt/css/design-tokens.css',
		packageVersion:   pkg.version,
		wpdsVersion:      '6.9',
		slotCount:        Object.keys( slots ).length,
		generatedAt:      new Date().toISOString().slice( 0, 10 ),
	},
	slots,
};

writeFileSync( OUT_PATH, JSON.stringify( out, null, '\t' ) + '\n', 'utf8' );
console.log( `Wrote ${ Object.keys( slots ).length } slots → ${ OUT_PATH }` );
