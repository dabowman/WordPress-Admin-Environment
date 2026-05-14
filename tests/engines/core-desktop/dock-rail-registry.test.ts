/**
 * dockRailRegistry tests (P2.T3).
 *
 * Pure registry — register / look up / list / overwrite. Renderers
 * are React components; we don't render here, just verify the
 * identity flows through. Each scenario builds an isolated registry
 * via `createDockRailRegistry()` so module-level singletons in the
 * production export are never touched.
 *
 * Run:
 *   node --experimental-strip-types tests/engines/core-desktop/dock-rail-registry.test.ts
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..', '..' );

const mod = ( await import(
	resolve(
		projectRoot,
		'src/runtime/engines/core-desktop/windowing/dockRailRegistry.ts'
	)
) ) as typeof import('../../../src/runtime/engines/core-desktop/windowing/dockRailRegistry');

const { createDockRailRegistry } = mod;

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

function threw( fn: () => void ): boolean {
	try {
		fn();
		return false;
	} catch ( _err ) {
		return true;
	}
}

type RegisterFn = ReturnType<
	typeof createDockRailRegistry
>[ 'registerDockRailRenderer' ];
type RendererArg = Parameters< RegisterFn >[ 1 ];

const Stub = function StubRenderer() {
	return null;
} as unknown as RendererArg;

const Stub2 = function StubRenderer2() {
	return null;
} as unknown as RendererArg;

console.log( '— dockRailRegistry —\n' );

{
	const {
		registerDockRailRenderer,
		getDockRailRenderer,
		listDockRailRenderers,
	} = createDockRailRegistry();
	registerDockRailRenderer( 'test:basic', Stub );
	ok(
		'register stores the renderer',
		getDockRailRenderer( 'test:basic' ) === Stub
	);
	ok(
		'list includes the registered name',
		listDockRailRenderers().indexOf( 'test:basic' ) >= 0
	);

	registerDockRailRenderer( 'test:basic', Stub2 );
	ok(
		'register overwrites on duplicate name',
		getDockRailRenderer( 'test:basic' ) === Stub2
	);
}

{
	const { registerDockRailRenderer, getDockRailRenderer } =
		createDockRailRegistry();
	registerDockRailRenderer( 'default', Stub );
	ok(
		'getDockRailRenderer falls back when name is unknown + default registered',
		getDockRailRenderer( 'no-such-renderer' ) === Stub
	);
	ok(
		'getDockRailRenderer falls back when name is empty',
		getDockRailRenderer( '' ) === Stub
	);
}

{
	const { registerDockRailRenderer } = createDockRailRegistry();
	ok(
		'register rejects empty name',
		threw( () => registerDockRailRenderer( '', Stub ) )
	);
	ok(
		'register rejects non-function component',
		threw( () =>
			registerDockRailRenderer(
				'test:bad',
				'not a function' as unknown as RendererArg
			)
		)
	);
}

console.log(
	`\n${ pass } passed, ${ fail } failed (${ pass + fail } total)\n`
);

if ( fail > 0 ) {
	process.exit( 1 );
}
