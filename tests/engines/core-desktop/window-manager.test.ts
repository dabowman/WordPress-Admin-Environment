/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * WindowManager MVP-slice tests (P2.T2).
 *
 * Pure state machine — no DOM. Covers open / close / focus / minimize /
 * restore / maximize / subscribe + monotonic zIndex + cascade ordering.
 *
 * Run:
 *   node --experimental-strip-types tests/engines/core-desktop/window-manager.test.ts
 *
 * Node 22.6+ strips TS syntax natively; no compile step needed.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..', '..' );

const wmModule = ( await import(
	resolve(
		projectRoot,
		'src/runtime/engines/core-desktop/windowing/WindowManager.ts'
	)
) ) as typeof import('../../../src/runtime/engines/core-desktop/windowing/WindowManager');
const { WindowManager } = wmModule;
type WindowEntry =
	import('../../../src/runtime/engines/core-desktop/windowing/WindowManager').WindowEntry;

let pass = 0;
let fail = 0;

function ok( label: string, condition: boolean, detail = '' ): void {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

console.log( '— WindowManager: empty —\n' );

{
	const wm = new WindowManager();
	ok( 'empty stack starts empty', wm.getStack().length === 0 );
	wm.closeWindow( 'win-x' );
	ok( 'closing unknown id is a no-op', wm.getStack().length === 0 );
}

console.log( '\n— WindowManager: open / close —\n' );

{
	const wm = new WindowManager();
	const id1 = wm.openWindow( { app: 'core:posts', title: 'Posts' } );
	const id2 = wm.openWindow( { app: 'core:media' } );
	ok( 'opens return monotonic ids', id1 === 'win-1' && id2 === 'win-2' );
	ok( 'stack length matches', wm.getStack().length === 2 );
	ok( 'titles default to app id', wm.getStack()[ 1 ].title === 'core:media' );
	ok(
		'second window has higher z than first',
		wm.getStack()[ 1 ].zIndex > wm.getStack()[ 0 ].zIndex
	);
	ok(
		'rects cascade — second offset from first',
		wm.getStack()[ 1 ].rect.x > wm.getStack()[ 0 ].rect.x &&
			wm.getStack()[ 1 ].rect.y > wm.getStack()[ 0 ].rect.y
	);
	wm.closeWindow( id1 );
	ok( 'close removes the window', wm.getStack().length === 1 );
	ok( 'survivor is the right one', wm.getStack()[ 0 ].id === id2 );
}

console.log( '\n— WindowManager: focus + zIndex —\n' );

{
	const wm = new WindowManager();
	const a = wm.openWindow( { app: 'core:posts' } );
	const b = wm.openWindow( { app: 'core:media' } );
	const c = wm.openWindow( { app: 'core:users' } );
	const topBefore = wm.getStack()[ 2 ].zIndex;
	wm.focusWindow( a );
	const aAfter = wm.getStack().find( ( w: WindowEntry ) => w.id === a );
	ok(
		'focused window gains highest z',
		!! aAfter && aAfter.zIndex > topBefore
	);
	// Idempotency
	const aZ = aAfter!.zIndex;
	wm.focusWindow( a );
	ok(
		'refocusing topmost normal window is a no-op',
		wm.getStack().find( ( w: WindowEntry ) => w.id === a )!.zIndex === aZ
	);
	wm.focusWindow( 'win-missing' );
	ok( 'focusing unknown id is a no-op', wm.getStack().length === 3 );
}

console.log( '\n— WindowManager: minimize / restore / maximize —\n' );

{
	const wm = new WindowManager();
	const a = wm.openWindow( { app: 'core:posts' } );
	wm.minimizeWindow( a );
	ok( 'minimize marks state', wm.getStack()[ 0 ].state === 'minimized' );
	wm.minimizeWindow( a );
	ok(
		'second minimize is a no-op',
		wm.getStack()[ 0 ].state === 'minimized'
	);
	wm.focusWindow( a );
	ok(
		'focusing a minimized window restores it',
		wm.getStack()[ 0 ].state === 'normal'
	);
	wm.maximizeWindow( a );
	ok(
		'maximize flips to maximized',
		wm.getStack()[ 0 ].state === 'maximized'
	);
	wm.maximizeWindow( a );
	ok(
		'second maximize restores to normal',
		wm.getStack()[ 0 ].state === 'normal'
	);
}

console.log( '\n— WindowManager: setRect —\n' );

{
	const wm = new WindowManager();
	const id = wm.openWindow( { app: 'core:posts' } );
	const before = wm.getStack()[ 0 ].rect;
	wm.setRect( id, { x: 200, y: 150 } );
	const after = wm.getStack()[ 0 ].rect;
	ok( 'setRect updates x/y', after.x === 200 && after.y === 150 );
	ok(
		'setRect preserves untouched w/h',
		after.w === before.w && after.h === before.h
	);

	let calls = 0;
	const unsub = wm.subscribe( () => {
		calls++;
	} );
	wm.setRect( id, { x: 200, y: 150 } );
	ok( 'setRect with same values is a no-op', calls === 0 );
	wm.setRect( 'win-missing', { x: 9999 } );
	ok( 'setRect on unknown id is a no-op', calls === 0 );
	wm.setRect( id, { w: 800, h: 600 } );
	ok( 'setRect can change size only', calls === 1 );
	ok(
		'size mutation applied',
		wm.getStack()[ 0 ].rect.w === 800 && wm.getStack()[ 0 ].rect.h === 600
	);
	unsub();
}

console.log( '\n— WindowManager: subscribe —\n' );

{
	const wm = new WindowManager();
	let calls = 0;
	const unsub = wm.subscribe( () => {
		calls++;
	} );
	wm.openWindow( { app: 'core:posts' } );
	wm.openWindow( { app: 'core:media' } );
	ok( 'listener invoked once per mutation', calls === 2 );
	unsub();
	wm.openWindow( { app: 'core:users' } );
	ok( 'unsubscribed listener stops firing', calls === 2 );
}

console.log(
	`\n${ pass } passed, ${ fail } failed (${ pass + fail } total)\n`
);

if ( fail > 0 ) {
	process.exit( 1 );
}
