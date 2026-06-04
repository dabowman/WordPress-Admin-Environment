/**
 * compileStyles tests (P2.T5).
 *
 * Verify the desktop engine's style compiler emits chrome slot
 * overrides as kebab-cased CSS variables in the kernel's
 * EngineStyleCompiler shape, applies the `theme.color.bg` ergonomic
 * seed to the canvas slot, and routes per-region / per-app overrides
 * into the `subtrees` bucket so the host's `scopedSelector` can target
 * them.
 *
 * Run:
 *   node --experimental-strip-types tests/engines/core-desktop/compile-styles.test.ts
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..', '..' );

const mod = ( await import(
	resolve( projectRoot, 'src/runtime/engines/core-desktop/compileStyles.mjs' )
) ) as {
	compileStyles: ( styles: unknown ) => {
		top: Record< string, string >;
		scoped: unknown[];
		subtrees: Record< string, Record< string, string > >;
	};
};

const { compileStyles } = mod;

let pass = 0;
let fail = 0;

function ok( label: string, condition: boolean ): void {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
	}
}

console.log( '— compileStyles: empty styles —\n' );

{
	const out = compileStyles( {} );
	ok( 'empty styles → empty top', Object.keys( out.top ).length === 0 );
	ok(
		'empty styles → empty subtrees',
		Object.keys( out.subtrees ).length === 0
	);
	ok( 'scoped bucket always an array', Array.isArray( out.scoped ) );
}
{
	const out = compileStyles( null );
	ok( 'null styles → empty top', Object.keys( out.top ).length === 0 );
}

console.log( '\n— compileStyles: chrome surfaces —\n' );

{
	const out = compileStyles( {
		chrome: {
			dock: {
				background: 'rgba(10, 10, 20, 0.7)',
				foreground: '#fff',
				radius: '20px',
			},
			'window-frame': {
				background: '#222',
				'body-background': '#111',
			},
		},
	} );
	ok(
		'dock.background → kebab var',
		out.top[ '--wp-admin-workspaces--chrome--dock--background' ] ===
			'rgba(10, 10, 20, 0.7)'
	);
	ok(
		'dock.foreground → kebab var',
		out.top[ '--wp-admin-workspaces--chrome--dock--foreground' ] === '#fff'
	);
	ok(
		'window-frame.background → kebab var',
		out.top[ '--wp-admin-workspaces--chrome--window-frame--background' ] ===
			'#222'
	);
	ok(
		'window-frame.body-background preserved kebab',
		out.top[
			'--wp-admin-workspaces--chrome--window-frame--body-background'
		] === '#111'
	);
}

console.log( '\n— compileStyles: theme.color.bg seed —\n' );

{
	const out = compileStyles( {
		theme: { color: { bg: '#0d0d1a' } },
	} );
	ok(
		'theme.color.bg → canvas background',
		out.top[ '--wp-admin-workspaces--chrome--canvas--background' ] ===
			'#0d0d1a'
	);
}
{
	const out = compileStyles( {
		theme: { color: { bg: '#aaa' } },
		chrome: { canvas: { background: '#111' } },
	} );
	ok(
		'explicit chrome.canvas wins over seed',
		out.top[ '--wp-admin-workspaces--chrome--canvas--background' ] ===
			'#111'
	);
}

console.log( '\n— compileStyles: per-region overrides —\n' );

{
	const out = compileStyles( {
		regions: {
			workspace: {
				chrome: { 'window-frame': { background: '#abc' } },
			},
		},
	} );
	ok( 'region key present', !! out.subtrees[ 'region:workspace' ] );
	ok(
		'region overrides emit window-frame slot',
		out.subtrees[ 'region:workspace' ][
			'--wp-admin-workspaces--chrome--window-frame--background'
		] === '#abc'
	);
}

console.log( '\n— compileStyles: per-app overrides —\n' );

{
	const out = compileStyles( {
		applications: {
			'core:posts': {
				chrome: { dock: { background: '#321' } },
			},
		},
	} );
	ok( 'app key present', !! out.subtrees[ 'app:core:posts' ] );
	ok(
		'app overrides emit dock slot',
		out.subtrees[ 'app:core:posts' ][
			'--wp-admin-workspaces--chrome--dock--background'
		] === '#321'
	);
}

console.log(
	`\n${ pass } passed, ${ fail } failed (${ pass + fail } total)\n`
);

if ( fail > 0 ) {
	process.exit( 1 );
}
